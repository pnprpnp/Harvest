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

function createPalletNumberingMigrationBackupSheets(spreadsheet) {
  const timestamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyyMMdd_HHmmss"
  );
  const backupNames = [];
  [
    SHEET_NAME,
    RECORD_TRASH_SHEET_NAME,
    PLANTING_EVENT_SHEET_NAME,
    PLANTING_EVENT_TRASH_SHEET_NAME
  ].forEach(sourceName => {
    const sourceSheet = spreadsheet.getSheetByName(sourceName);
    if (!sourceSheet) return;
    const backupName = getUniqueSheetName(
      spreadsheet,
      "番号移行前_" + timestamp + "_" + sourceName
    );
    const backupSheet = sourceSheet.copyTo(spreadsheet).setName(backupName);
    backupSheet.hideSheet();
    backupNames.push(backupName);
  });
  return backupNames;
}

function replaceKnownRecordCells(headers, sourceRow, replacementRow) {
  return headers.map((header, index) => (
    getHeaderKey(header) ? replacementRow[index] : sourceRow[index]
  ));
}

function migrateHarvestRecordSheetRowsToLeftOrigin(sheet, headers) {
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const rowCount = sheet.getLastRow() - 1;
  const rows = sheet.getRange(2, 1, rowCount, headers.length).getValues();
  const receivedAtColumn = getHeaderColumn(headers, "receivedAt");
  let changed = 0;
  const normalizedByIndex = new Array(rows.length).fill(null);
  const outputRows = rows.map((row, index) => {
    if (!row.some(value => String(value == null ? "" : value).trim() !== "")) {
      return row;
    }
    const rawRecord = rowToRecord(headers, row);
    const alreadyCurrent = Number(rawRecord.palletNumberingVersion) ===
      CURRENT_PALLET_NUMBERING_VERSION;
    const normalized = normalizeHarvestRecord(rawRecord);
    if (!alreadyCurrent) changed++;
    normalizedByIndex[index] = normalized;
    if (alreadyCurrent) return row;
    const receivedAt = receivedAtColumn > 0 ? row[receivedAtColumn - 1] : "";
    const replacement = buildRecordRow(
      headers,
      normalized,
      normalized.duplicateKey,
      receivedAt
    );
    return replaceKnownRecordCells(headers, row, replacement);
  });
  if (!changed) return 0;

  const writeMarkers = normalizedByIndex.map(record => (
    record
      ? buildHarvestWriteMarker(
          record,
          record,
          getSuppliedRecordSyncFields(record),
          "pallet-numbering-migration"
        )
      : ""
  ));
  writeKnownRecordRows(sheet, 2, headers, outputRows, writeMarkers);
  return changed;
}

function replaceKnownPlantingEventCells(headers, sourceRow, replacementRow) {
  return headers.map((header, index) => (
    getPlantingEventHeaderKey(header) ? replacementRow[index] : sourceRow[index]
  ));
}

function migratePlantingEventSheetRowsToLeftOrigin(sheet, headers) {
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const rowCount = sheet.getLastRow() - 1;
  const rows = sheet.getRange(2, 1, rowCount, headers.length).getValues();
  const versionColumn = getPlantingEventHeaderColumn(headers, "palletNumberingVersion");
  let changed = 0;
  const normalizedByIndex = new Array(rows.length).fill(null);
  const outputRows = rows.map((row, index) => {
    if (!row.some(value => String(value == null ? "" : value).trim() !== "")) {
      return row;
    }
    const alreadyCurrent = versionColumn > 0
      && Number(row[versionColumn - 1]) === CURRENT_PALLET_NUMBERING_VERSION;
    const normalized = rowToPlantingEvent(headers, row);
    if (!alreadyCurrent) changed++;
    normalizedByIndex[index] = normalized;
    if (alreadyCurrent) return row;
    const replacement = buildPlantingEventRow(headers, normalized);
    return replaceKnownPlantingEventCells(headers, row, replacement);
  });
  if (!changed) return 0;

  const writeMarkers = normalizedByIndex.map(event => (
    event ? buildPlantingWriteMarker(event, "pallet-numbering-migration") : ""
  ));
  writeKnownPlantingEventRows(sheet, 2, headers, outputRows, writeMarkers);
  return changed;
}

function previewPalletNumberingMigrationV2() {
  const spreadsheet = getSpreadsheet();
  const countHarvestRows = sheet => {
    if (!sheet || sheet.getLastRow() < 2) return 0;
    const headers = getHeaderValues(sheet);
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
    return rows.reduce((count, row) => {
      if (!row.some(value => String(value == null ? "" : value).trim() !== "")) return count;
      normalizeHarvestRecord(rowToRecord(headers, row));
      return count + 1;
    }, 0);
  };
  const countPlantingRows = sheet => {
    if (!sheet || sheet.getLastRow() < 2) return 0;
    const headers = getPlantingEventHeaderValues(sheet);
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
    return rows.reduce((count, row) => {
      if (!row.some(value => String(value == null ? "" : value).trim() !== "")) return count;
      rowToPlantingEvent(headers, row);
      return count + 1;
    }, 0);
  };
  return {
    records: countHarvestRows(spreadsheet.getSheetByName(SHEET_NAME)),
    deletedRecords: countHarvestRows(spreadsheet.getSheetByName(RECORD_TRASH_SHEET_NAME)),
    plantingEvents: countPlantingRows(spreadsheet.getSheetByName(PLANTING_EVENT_SHEET_NAME)),
    deletedPlantingEvents: countPlantingRows(
      spreadsheet.getSheetByName(PLANTING_EVENT_TRASH_SHEET_NAME)
    )
  };
}

function ensureHarvestRecordSyncMetadataBackup(spreadsheet, sourceSheet) {
  const properties = PropertiesService.getScriptProperties();
  const pendingName = String(
    properties.getProperty(HARVEST_RECORD_SYNC_METADATA_BACKUP_PROPERTY) || ""
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
  properties.setProperty(HARVEST_RECORD_SYNC_METADATA_BACKUP_PROPERTY, backupName);
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
  const repairedValues = backfillHarvestRecordSyncMetadata(sheet, headers, {
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

function runHarvestRecordSyncMetadataRepair(force) {
  const properties = PropertiesService.getScriptProperties();
  const completed = properties.getProperty(
    HARVEST_RECORD_SYNC_METADATA_MIGRATION_PROPERTY
  );
  if (!force && completed) return JSON.parse(completed);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error("別の保存処理が実行中です。少し待ってから再実行してください");
  }
  try {
    const completedAfterLock = properties.getProperty(
      HARVEST_RECORD_SYNC_METADATA_MIGRATION_PROPERTY
    );
    if (!force && completedAfterLock) return JSON.parse(completedAfterLock);

    const result = repairHarvestRecordSyncMetadataUnlocked();
    SpreadsheetApp.flush();
    properties.setProperty(
      HARVEST_RECORD_SYNC_METADATA_MIGRATION_PROPERTY,
      JSON.stringify(result)
    );
    properties.deleteProperty(HARVEST_RECORD_SYNC_METADATA_BACKUP_PROPERTY);
    return result;
  } finally {
    lock.releaseLock();
  }
}

function migrateHarvestRecordSyncMetadataV1() {
  return runHarvestRecordSyncMetadataRepair(false);
}

function repairHarvestRecordSyncMetadata() {
  return runHarvestRecordSyncMetadataRepair(true);
}

function migrateAllPalletNumberingToLeftOriginV2() {
  const properties = PropertiesService.getScriptProperties();
  const completed = properties.getProperty(PALLET_NUMBERING_MIGRATION_PROPERTY);
  if (completed) return JSON.parse(completed);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error("別の保存処理が実行中です。少し待ってから再実行してください");
  }
  try {
    const completedAfterLock = properties.getProperty(PALLET_NUMBERING_MIGRATION_PROPERTY);
    if (completedAfterLock) return JSON.parse(completedAfterLock);

    const spreadsheet = getSpreadsheet();
    const backupSheets = createPalletNumberingMigrationBackupSheets(spreadsheet);

    const recordSheet = getRecordSheet();
    const recordHeaders = ensureHeaders(recordSheet);
    backfillHarvestRecordSyncMetadata(recordSheet, recordHeaders);
    const migratedRecords = migrateHarvestRecordSheetRowsToLeftOrigin(
      recordSheet,
      recordHeaders
    );

    const recordTrashSheet = getExistingRecordTrashSheet();
    let migratedDeletedRecords = 0;
    if (recordTrashSheet) {
      ensureRecordTrashSheet(recordTrashSheet);
      backfillHarvestRecordTrashSyncMetadata(recordTrashSheet);
      migratedDeletedRecords = migrateHarvestRecordSheetRowsToLeftOrigin(
        recordTrashSheet,
        RECORD_TRASH_HEADERS
      );
    }

    const plantingSheet = getPlantingEventSheet();
    const plantingHeaders = ensurePlantingEventHeaders(plantingSheet);
    const migratedPlantingEvents = migratePlantingEventSheetRowsToLeftOrigin(
      plantingSheet,
      plantingHeaders
    );

    const plantingTrashSheet = getExistingPlantingEventTrashSheet();
    let migratedDeletedPlantingEvents = 0;
    if (plantingTrashSheet) {
      ensurePlantingEventTrashSheet(plantingTrashSheet);
      migratedDeletedPlantingEvents = migratePlantingEventSheetRowsToLeftOrigin(
        plantingTrashSheet,
        PLANTING_EVENT_TRASH_HEADERS
      );
    }

    const result = {
      completedAt: new Date().toISOString(),
      migratedRecords,
      migratedDeletedRecords,
      migratedPlantingEvents,
      migratedDeletedPlantingEvents,
      backupSheets
    };
    properties.setProperty(
      PALLET_NUMBERING_MIGRATION_PROPERTY,
      JSON.stringify(result)
    );
    return result;
  } finally {
    lock.releaseLock();
  }
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
