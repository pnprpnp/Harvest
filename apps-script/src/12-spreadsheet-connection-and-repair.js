function getMonitorSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(MONITOR_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(MONITOR_SHEET_NAME);
  }

  return sheet;
}

function getMonitorHistorySheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(MONITOR_HISTORY_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(MONITOR_HISTORY_SHEET_NAME);
  }

  return sheet;
}

function getUniqueSheetName(spreadsheet, preferredName) {
  let name = String(preferredName || "バックアップ").slice(0, 100);
  let suffix = 2;
  while (spreadsheet.getSheetByName(name)) {
    const suffixText = "_" + suffix++;
    name = String(preferredName || "バックアップ")
      .slice(0, Math.max(1, 100 - suffixText.length)) + suffixText;
  }
  return name;
}

function ensureHarvestRecordSyncMetadataBackup(spreadsheet, sourceSheet) {
  const properties = PropertiesService.getScriptProperties();
  const pendingName = String(
    properties.getProperty(HARVEST_RECORD_REPAIR_BACKUP_PROPERTY) || ""
  ).trim();
  if (pendingName && spreadsheet.getSheetByName(pendingName)) return pendingName;

  const timestamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyyMMdd_HHmmss"
  );
  const backupName = getUniqueSheetName(
    spreadsheet,
    "同期情報補完前_" + timestamp + "_" + SHEET_NAME
  );
  sourceSheet.copyTo(spreadsheet).setName(backupName).hideSheet();
  properties.setProperty(HARVEST_RECORD_REPAIR_BACKUP_PROPERTY, backupName);
  return backupName;
}

function repairHarvestRecordSyncMetadataUnlocked() {
  const spreadsheet = getSpreadsheet();
  const sheet = getRecordSheet();
  let backupSheet = "";
  let headers;
  let schemaColumnsAdded = 0;

  if (sheet.getLastRow() === 0) {
    headers = ensureHeaders(sheet);
  } else {
    const currentHeaders = getHeaderValues(sheet);
    validateRecordHeaders(currentHeaders);
    const existingKeys = new Set(currentHeaders.map(getHeaderKey).filter(Boolean));
    const missingKeys = FIELD_KEYS.filter(key => !existingKeys.has(key));
    if (missingKeys.length) {
      backupSheet = ensureHarvestRecordSyncMetadataBackup(spreadsheet, sheet);
      schemaColumnsAdded = missingKeys.length;
      headers = ensureHeaders(sheet);
    } else {
      headers = currentHeaders;
    }
  }

  const deletedRecordState = prepareDeletedHarvestRecordState(getRecordTrashSheet());
  const rows = readHarvestRecordRows(sheet, headers);
  const repairedValues = repairHarvestRecordSyncMetadataRows(sheet, headers, {
    rows,
    deletedRecordIdentities: deletedRecordState.identities,
    includeRecognizableUncommittedRows: true,
    writeChanges: false
  });
  if (repairedValues > 0) {
    if (!backupSheet) {
      backupSheet = ensureHarvestRecordSyncMetadataBackup(spreadsheet, sheet);
    }
    writeHarvestRecordSyncMetadataRows(sheet, headers, rows);
  }

  const result = {
    completedAt: new Date().toISOString(),
    scannedRows: rows.length,
    repairedValues,
    schemaColumnsAdded,
    backupSheet
  };
  return result;
}

function repairHarvestRecordSyncMetadata() {
  const properties = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error("別の保存処理が実行中です。少し待ってから再実行してください");
  }
  try {
    const result = repairHarvestRecordSyncMetadataUnlocked();
    SpreadsheetApp.flush();
    properties.deleteProperty(HARVEST_RECORD_REPAIR_BACKUP_PROPERTY);
    return result;
  } finally {
    lock.releaseLock();
  }
}

function getPlantingCountMigrationRawObject(value, label) {
  try {
    return parseStoredJsonObject(value, label);
  } catch (err) {
    throw new Error(label + ": " + String(err && err.message || err));
  }
}

function plantingCountMigrationMapMatches(actual, expected) {
  const actualKeys = Object.keys(actual || {}).sort();
  const expectedKeys = Object.keys(expected || {}).sort();
  return actualKeys.length === expectedKeys.length && expectedKeys.every((key, index) => (
    actualKeys[index] === key && Number(actual[key]) === Number(expected[key])
  ));
}

function buildJuly2026PlantingCountMigrationPlan(headers, rows) {
  const headerList = Array.isArray(headers) ? headers : [];
  const sourceRows = Array.isArray(rows) ? rows : [];
  const plan = {
    scannedRows: sourceRows.length,
    julyRows: 0,
    julyPallets: 0,
    earlierRows: 0,
    julyRowsNeedingUpdate: 0,
    earlierRowsNeedingClear: 0,
    updates: [],
    issues: []
  };
  if (!sourceRows.length) return plan;
  const columnIndex = key => getPlantingEventHeaderColumn(headerList, key) - 1;
  const eventIdIndex = columnIndex("eventId");
  const dateIndex = columnIndex("plantingDate");
  const palletKeysIndex = columnIndex("plantingPalletKeys");
  const countsIndex = columnIndex("plantingCountsByPallet");
  const plantedTotalIndex = columnIndex("actualPlantedSeedlingCount");
  const detailsUnknownIndex = columnIndex("detailsUnknown");
  if (eventIdIndex < 0 || dateIndex < 0 || palletKeysIndex < 0) {
    throw new Error("苗植えイベントシートの必須列がありません");
  }

  sourceRows.forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 2;
    const plantingDate = formatDateValue(row[dateIndex]);
    if (!plantingDate || plantingDate > PLANTING_COUNT_BACKFILL_END_DATE) return;
    const isJuly = plantingDate >= PLANTING_COUNT_BACKFILL_START_DATE;
    if (isJuly) plan.julyRows += 1;
    else plan.earlierRows += 1;

    let eventId;
    let plantingPalletKeys;
    let currentCounts;
    try {
      eventId = normalizeRequiredInteger(
        row[eventIdIndex],
        "苗植えイベントID",
        1,
        Number.MAX_SAFE_INTEGER
      );
      plantingPalletKeys = normalizeDirectPalletKeys(
        parseStoredJsonArray(row[palletKeysIndex], "苗植えパレット"),
        "苗植えパレット"
      );
      currentCounts = countsIndex >= 0
        ? getPlantingCountMigrationRawObject(
            row[countsIndex],
            "パレット別植え付け株数"
          )
        : {};
    } catch (err) {
      plan.issues.push({
        rowNumber,
        message: String(err && err.message || err)
      });
      return;
    }

    if (isJuly) plan.julyPallets += plantingPalletKeys.length;
    const nextCounts = isJuly
      ? Object.fromEntries(plantingPalletKeys.map(key => [key, PLANTING_COUNT_BACKFILL_VALUE]))
      : {};
    const detailsUnknown = detailsUnknownIndex >= 0
      ? normalizePlantingEventDetailsUnknown(row[detailsUnknownIndex])
      : false;
    const expectedPlantedTotal = plantingPalletKeys.length * PLANTING_COUNT_BACKFILL_VALUE;
    const currentPlantedTotal = plantedTotalIndex >= 0
      ? Number(row[plantedTotalIndex])
      : NaN;
    const countsNeedUpdate = !plantingCountMigrationMapMatches(currentCounts, nextCounts);
    const plantedTotalNeedsUpdate = isJuly
      && !detailsUnknown
      && (!Number.isFinite(currentPlantedTotal) || currentPlantedTotal !== expectedPlantedTotal);
    if (!countsNeedUpdate && !plantedTotalNeedsUpdate) return;

    if (isJuly) plan.julyRowsNeedingUpdate += 1;
    else plan.earlierRowsNeedingClear += 1;
    plan.updates.push({
      rowNumber,
      eventId,
      plantingDate,
      plantingPalletKeys,
      nextCounts,
      updatePlantedTotal: plantedTotalNeedsUpdate,
      expectedPlantedTotal
    });
  });

  return plan;
}

function getJuly2026PlantingCountMigrationPlan() {
  const sheet = getExistingPlantingEventSheet();
  if (!sheet || sheet.getLastRow() < 2) {
    return buildJuly2026PlantingCountMigrationPlan([], []);
  }
  const headers = getPlantingEventHeadersForRead(sheet);
  const rows = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, headers.length)
    .getValues();
  return buildJuly2026PlantingCountMigrationPlan(headers, rows);
}

function summarizeJuly2026PlantingCountMigrationPlan(plan) {
  return {
    targetPeriod: "2026-07-01〜2026-07-31",
    julyValue: PLANTING_COUNT_BACKFILL_VALUE,
    scannedRows: plan.scannedRows,
    julyRows: plan.julyRows,
    julyPallets: plan.julyPallets,
    julyRowsNeedingUpdate: plan.julyRowsNeedingUpdate,
    earlierRows: plan.earlierRows,
    earlierRowsNeedingClear: plan.earlierRowsNeedingClear,
    updateCount: plan.updates.length,
    issues: plan.issues.slice(0, 20),
    sampleUpdates: plan.updates.slice(0, 20).map(update => ({
      rowNumber: update.rowNumber,
      eventId: update.eventId,
      plantingDate: update.plantingDate,
      palletCount: update.plantingPalletKeys.length,
      action: update.plantingDate >= PLANTING_COUNT_BACKFILL_START_DATE
        ? "12植えとして保存"
        : "株数未記録に変更"
    }))
  };
}

function previewJuly2026PlantingCountMigration() {
  const result = summarizeJuly2026PlantingCountMigrationPlan(
    getJuly2026PlantingCountMigrationPlan()
  );
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function ensureJuly2026PlantingCountMigrationBackup(spreadsheet, sourceSheet) {
  const properties = PropertiesService.getScriptProperties();
  const existingName = String(
    properties.getProperty(PLANTING_COUNT_MIGRATION_BACKUP_PROPERTY) || ""
  ).trim();
  if (existingName && spreadsheet.getSheetByName(existingName)) return existingName;

  const timestamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyyMMdd_HHmmss"
  );
  const backupName = getUniqueSheetName(
    spreadsheet,
    "7月植え付け数移行前_" + timestamp
  );
  sourceSheet.copyTo(spreadsheet).setName(backupName).hideSheet();
  properties.setProperty(PLANTING_COUNT_MIGRATION_BACKUP_PROPERTY, backupName);
  return backupName;
}

function migrateJuly2026PlantingCounts() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error("別の保存処理が実行中です。少し待ってから再実行してください");
  }

  let result;
  let changedEventIds = [];
  try {
    const spreadsheet = getSpreadsheet();
    const sheet = getExistingPlantingEventSheet();
    if (!sheet || sheet.getLastRow() < 2) {
      result = {
        completedAt: new Date().toISOString(),
        backupSheet: "",
        updatedRows: 0,
        alreadyComplete: true,
        preview: summarizeJuly2026PlantingCountMigrationPlan(
          buildJuly2026PlantingCountMigrationPlan([], [])
        )
      };
    } else {
      const currentHeaders = getPlantingEventHeadersForRead(sheet);
      const currentRows = sheet
        .getRange(2, 1, sheet.getLastRow() - 1, currentHeaders.length)
        .getValues();
      const initialPlan = buildJuly2026PlantingCountMigrationPlan(currentHeaders, currentRows);
      if (initialPlan.issues.length) {
        throw new Error(
          "確認が必要な行があるため移行を中止しました: " +
          initialPlan.issues.map(issue => issue.rowNumber + "行目 " + issue.message).join(" / ")
        );
      }
      if (!initialPlan.updates.length) {
        result = {
          completedAt: new Date().toISOString(),
          backupSheet: String(
            PropertiesService.getScriptProperties()
              .getProperty(PLANTING_COUNT_MIGRATION_BACKUP_PROPERTY) || ""
          ),
          updatedRows: 0,
          alreadyComplete: true,
          preview: summarizeJuly2026PlantingCountMigrationPlan(initialPlan)
        };
      } else {
        const backupSheet = ensureJuly2026PlantingCountMigrationBackup(spreadsheet, sheet);
        const headers = ensurePlantingEventHeaders(sheet);
        const rows = sheet
          .getRange(2, 1, sheet.getLastRow() - 1, headers.length)
          .getValues();
        const plan = buildJuly2026PlantingCountMigrationPlan(headers, rows);
        if (plan.issues.length) {
          throw new Error("列追加後の確認で問題が見つかったため移行を中止しました");
        }

        plan.updates.forEach(update => {
          const row = rows[update.rowNumber - 2];
          const event = rowToPlantingEvent(headers, row);
          event.plantingCountsByPallet = update.nextCounts;
          if (update.updatePlantedTotal) {
            event.actualPlantedSeedlingCount = update.expectedPlantedTotal;
          }
          event.updatedAt = getNextPlantingEventUpdatedAt(event.updatedAt);
          writePlantingEventRow(sheet, update.rowNumber, headers, event, event, "migration");
        });
        SpreadsheetApp.flush();
        changedEventIds = plan.updates.map(update => update.eventId);
        result = {
          completedAt: new Date().toISOString(),
          backupSheet,
          updatedRows: plan.updates.length,
          updatedEventIds: changedEventIds,
          preview: summarizeJuly2026PlantingCountMigrationPlan(initialPlan)
        };
      }
    }
  } finally {
    lock.releaseLock();
  }

  if (changedEventIds.length) {
    result.syncRevision = recordHarvestSyncChangesSafely(
      changedEventIds.map(eventId => ({
        entityType: "planting",
        entityId: eventId,
        action: "upsert"
      }))
    );
  }
  result.verification = verifyJuly2026PlantingCountMigration();
  PropertiesService.getScriptProperties().setProperty(
    PLANTING_COUNT_MIGRATION_RESULT_PROPERTY,
    JSON.stringify(result)
  );
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function verifyJuly2026PlantingCountMigration() {
  const plan = getJuly2026PlantingCountMigrationPlan();
  const result = {
    valid: plan.issues.length === 0 && plan.updates.length === 0,
    checkedAt: new Date().toISOString(),
    ...summarizeJuly2026PlantingCountMigrationPlan(plan)
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function getSpreadsheet() {
  if (requestScopedSpreadsheet) return requestScopedSpreadsheet;

  const configuredValue = PropertiesService.getScriptProperties()
    .getProperty(SPREADSHEET_ID_PROPERTY_NAME);
  const spreadsheetId = extractSpreadsheetId(configuredValue);
  let ss;

  try {
    ss = spreadsheetId
      ? SpreadsheetApp.openById(spreadsheetId)
      : SpreadsheetApp.getActiveSpreadsheet();
  } catch (err) {
    throw new Error(
      "スプレッドシートを開けません。スクリプト プロパティ「" +
      SPREADSHEET_ID_PROPERTY_NAME +
      "」の値と、Webアプリの実行ユーザーの閲覧・編集権限を確認してください。詳細: " +
      String(err && err.message ? err.message : err)
    );
  }

  if (!ss) {
    throw new Error(
      "スプレッドシートを取得できません。スクリプト プロパティ「" +
      SPREADSHEET_ID_PROPERTY_NAME +
      "」にスプレッドシートIDを設定してください。"
    );
  }

  requestScopedSpreadsheet = ss;
  return requestScopedSpreadsheet;
}

function extractSpreadsheetId(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const match = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : text;
}

/**
 * Apps Scriptエディタまたはclasp runから、接続先をスクリプト プロパティへ保存します。
 * スプレッドシートに紐づいたスクリプトでは、引数を省略できます。
 */
function setupHarvestSpreadsheetId(spreadsheetUrlOrId) {
  const requestedId = extractSpreadsheetId(spreadsheetUrlOrId);
  let spreadsheet;
  try {
    spreadsheet = requestedId
      ? SpreadsheetApp.openById(requestedId)
      : SpreadsheetApp.getActiveSpreadsheet();
  } catch (err) {
    throw new Error(
      "設定するスプレッドシートを開けません。IDと実行ユーザーの権限を確認してください。詳細: " +
      String(err && err.message ? err.message : err)
    );
  }
  if (!spreadsheet) {
    throw new Error(
      "接続先を特定できません。スタンドアロンのApps Scriptでは、" +
      "スプレッドシートのURLまたはIDを引数に指定してください。"
    );
  }

  PropertiesService.getScriptProperties().setProperty(
    SPREADSHEET_ID_PROPERTY_NAME,
    spreadsheet.getId()
  );
  requestScopedSpreadsheet = spreadsheet;
  return {
    configured: true,
    propertyName: SPREADSHEET_ID_PROPERTY_NAME,
    spreadsheetName: spreadsheet.getName()
  };
}
