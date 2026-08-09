function normalizeHarvestSyncRevision(value) {
  if (value === null || typeof value === "undefined" || value === "") return null;
  const text = typeof value === "number" ? String(value) : String(value).trim();
  if (!/^\d+$/.test(text)) return null;
  const revision = Number(text);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
}

function hasHarvestSyncRevisionRequest(body) {
  return !!body && Object.prototype.hasOwnProperty.call(body, "syncRevision");
}

function isHarvestRevisionFastCheckCandidate(body) {
  return hasHarvestSyncRevisionRequest(body) && (
    body.action === "checkUpdates" || body.type === "harvest-update-check"
  );
}

function getHarvestSyncRevisionState(propertyValues) {
  const values = isPlainObject(propertyValues)
    ? propertyValues
    : PropertiesService.getScriptProperties().getProperties();
  return {
    revision: normalizeHarvestSyncRevision(
      values[SYNC_REVISION_PROPERTY_NAME]
    ) || 0,
    floorRevision: normalizeHarvestSyncRevision(
      values[SYNC_REVISION_FLOOR_PROPERTY_NAME]
    ) || 0
  };
}

function setHarvestSyncRevisionState(revision, floorRevision) {
  const normalizedRevision = normalizeHarvestSyncRevision(revision);
  const normalizedFloor = normalizeHarvestSyncRevision(floorRevision);
  if (normalizedRevision === null || normalizedFloor === null || normalizedFloor > normalizedRevision) {
    throw new Error("同期番号の保存値が正しくありません");
  }
  PropertiesService.getScriptProperties().setProperties({
    [SYNC_REVISION_PROPERTY_NAME]: String(normalizedRevision),
    [SYNC_REVISION_FLOOR_PROPERTY_NAME]: String(normalizedFloor)
  });
}

function getExistingSyncChangeLogSheet() {
  return getSpreadsheet().getSheetByName(SYNC_CHANGE_LOG_SHEET_NAME);
}

function ensureSyncChangeLogSheet() {
  const spreadsheet = getSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SYNC_CHANGE_LOG_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SYNC_CHANGE_LOG_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, SYNC_CHANGE_LOG_HEADERS.length).setValues([SYNC_CHANGE_LOG_HEADERS]);
    sheet.setFrozenRows(1);
  } else {
    const headers = sheet.getRange(1, 1, 1, SYNC_CHANGE_LOG_HEADERS.length).getValues()[0]
      .map(value => String(value || "").trim());
    if (headers.join("\u0000") !== SYNC_CHANGE_LOG_HEADERS.join("\u0000")) {
      throw new Error("同期変更履歴シートの見出しが正しくありません");
    }
  }
  try {
    if (!sheet.isSheetHidden()) sheet.hideSheet();
  } catch (err) {
    console.warn("同期変更履歴シートを非表示にできませんでした: " + String(err && err.message || err));
  }
  return sheet;
}

function normalizeSyncChangeEntry(value) {
  if (!value || typeof value !== "object") return null;
  const entityType = value.entityType === "record"
    ? "record"
    : (value.entityType === "planting" ? "planting" : "");
  if (!entityType) return null;
  const recordUuid = String(value.recordUuid || "").trim().toLowerCase();
  const entityId = Number(value.entityId);
  const hasEntityId = Number.isSafeInteger(entityId) && entityId > 0;
  if (entityType === "record" && !recordUuid && !hasEntityId) return null;
  if (entityType === "planting" && !hasEntityId) return null;
  return {
    entityType,
    recordUuid: entityType === "record" ? recordUuid : "",
    entityId: hasEntityId ? entityId : "",
    action: value.action === "delete" ? "delete" : "upsert",
    changedAt: new Date().toISOString()
  };
}

function invalidateHarvestSyncRevision(reason) {
  return withRecordWriteLock(() => {
    const state = getHarvestSyncRevisionState();
    const nextRevision = state.revision + 1;
    if (!Number.isSafeInteger(nextRevision)) throw new Error("同期番号が上限に達しました");
    setHarvestSyncRevisionState(nextRevision, nextRevision);
    try {
      const sheet = getExistingSyncChangeLogSheet();
      if (sheet && sheet.getLastRow() > 1) {
        sheet.getRange(
          2,
          1,
          sheet.getLastRow() - 1,
          SYNC_CHANGE_LOG_HEADERS.length
        ).clearContent();
      }
    } catch (err) {
      // floorRevisionは先に進めているため、クライアントは安全に全件同期へ切り替わる。
      console.warn("古い同期変更履歴を消去できませんでした: " + String(err && err.message || err));
    }
    if (reason) console.warn("次回同期を全件確認へ切り替えました: " + String(reason));
    return nextRevision;
  });
}

function recordHarvestSyncChangesSafely(values) {
  const entries = (Array.isArray(values) ? values : [values])
    .map(normalizeSyncChangeEntry)
    .filter(Boolean);
  if (!entries.length) return getHarvestSyncRevisionState().revision;
  try {
    return withRecordWriteLock(() => {
      const state = getHarvestSyncRevisionState();
      const sheet = ensureSyncChangeLogSheet();
      const lastChangeRow = sheet.getLastRow();
      if (lastChangeRow > 1) {
        const lastLoggedRevision = normalizeHarvestSyncRevision(
          sheet.getRange(lastChangeRow, 1).getValue()
        );
        if (lastLoggedRevision === null || lastLoggedRevision !== state.revision) {
          sheet.getRange(
            2,
            1,
            lastChangeRow - 1,
            SYNC_CHANGE_LOG_HEADERS.length
          ).clearContent();
        }
      }
      const rows = entries.map((entry, index) => {
        const revision = state.revision + index + 1;
        if (!Number.isSafeInteger(revision)) throw new Error("同期番号が上限に達しました");
        return [
          revision,
          entry.entityType,
          entry.recordUuid,
          entry.entityId,
          entry.action,
          entry.changedAt
        ];
      });
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, SYNC_CHANGE_LOG_HEADERS.length)
        .setValues(rows);
      const nextRevision = rows[rows.length - 1][0];
      let nextFloorRevision = state.floorRevision;
      const changeRowCount = sheet.getLastRow() - 1;
      if (changeRowCount > SYNC_CHANGE_LOG_MAX_ROWS) {
        const rowsToDelete = changeRowCount - SYNC_CHANGE_LOG_RETAINED_ROWS;
        const firstRetainedRevision = normalizeHarvestSyncRevision(
          sheet.getRange(rowsToDelete + 2, 1).getValue()
        );
        if (firstRetainedRevision === null) {
          throw new Error("同期変更履歴の保持位置が正しくありません");
        }
        sheet.deleteRows(2, rowsToDelete);
        nextFloorRevision = Math.max(nextFloorRevision, firstRetainedRevision - 1);
      }
      setHarvestSyncRevisionState(nextRevision, nextFloorRevision);
      return nextRevision;
    });
  } catch (err) {
    console.error("同期変更履歴を保存できませんでした", err);
    try {
      return invalidateHarvestSyncRevision(err && err.message || err);
    } catch (invalidateError) {
      console.error("同期番号の全件確認切り替えにも失敗しました", invalidateError);
      return null;
    }
  }
}

function recordHarvestRecordSyncResult(result, action) {
  if (!result || !result.record) return null;
  if (action !== "delete" && (result.unchanged || result.duplicate)) return null;
  return recordHarvestSyncChangesSafely({
    entityType: "record",
    recordUuid: result.record.recordUuid,
    entityId: result.record.id,
    action
  });
}

function recordPlantingEventSyncResult(result, sourceEvent, action) {
  const event = result && result.event || sourceEvent;
  const changes = [];
  const eventUnchanged = action !== "delete" && result && (
    (result.unchanged && !result.recovered)
    || (result.alreadyRestored && !result.recovered)
  );
  if (event && !eventUnchanged) {
    changes.push({
      entityType: "planting",
      entityId: event.eventId,
      action
    });
  }
  requestScopedChangedHarvestRecordIds.forEach(entityId => {
    changes.push({ entityType: "record", entityId, action: "upsert" });
  });
  return changes.length ? recordHarvestSyncChangesSafely(changes) : null;
}

function findFirstSyncChangeRowAfter(sheet, revision) {
  let low = 2;
  let high = sheet.getLastRow() + 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const middleRevision = normalizeHarvestSyncRevision(sheet.getRange(middle, 1).getValue());
    if (middleRevision === null) throw new Error("同期変更履歴の同期番号が正しくありません");
    if (middleRevision <= revision) low = middle + 1;
    else high = middle;
  }
  return low;
}

function readSyncChangeLogPage(afterRevision, currentRevision) {
  const sheet = getExistingSyncChangeLogSheet();
  if (!sheet || sheet.getLastRow() < 2) return null;
  const startRow = findFirstSyncChangeRowAfter(sheet, afterRevision);
  if (startRow > sheet.getLastRow()) return null;
  const rowCount = Math.min(SYNC_CHANGE_LOG_PAGE_LIMIT, sheet.getLastRow() - startRow + 1);
  const rows = sheet.getRange(startRow, 1, rowCount, SYNC_CHANGE_LOG_HEADERS.length).getValues();
  let previousRevision = afterRevision;
  const changes = rows.map(row => {
    const revision = normalizeHarvestSyncRevision(row[0]);
    const entry = normalizeSyncChangeEntry({
      entityType: String(row[1] || "").trim(),
      recordUuid: String(row[2] || "").trim(),
      entityId: row[3],
      action: String(row[4] || "").trim()
    });
    if (revision === null || !entry || revision !== previousRevision + 1 || revision > currentRevision) {
      throw new Error("同期変更履歴の内容が正しくありません");
    }
    previousRevision = revision;
    entry.revision = revision;
    entry.changedAt = formatHarvestRecordTimestamp(row[5]) || new Date(0).toISOString();
    return entry;
  });
  return changes.length ? changes : null;
}

function findExactValueRow(sheet, column, value, label) {
  const target = String(value == null ? "" : value).trim();
  const rowCount = sheet ? sheet.getLastRow() - 1 : 0;
  if (!target || column <= 0 || rowCount <= 0) return 0;
  const matches = sheet.getRange(2, column, rowCount, 1)
    .createTextFinder(target)
    .matchEntireCell(true)
    .matchCase(false)
    .useRegularExpression(false)
    .findAll();
  if (matches.length > 1) throw new Error(label + "が重複しています");
  return matches.length ? matches[0].getRow() : 0;
}

function createRevisionSyncResolutionContext() {
  const recordSheet = getExistingRecordSheet();
  const recordHeaders = recordSheet ? getRecordHeadersForRead(recordSheet) : [];
  const plantingSheet = getExistingPlantingEventSheet();
  const plantingHeaders = plantingSheet ? getPlantingEventHeadersForRead(plantingSheet) : [];
  return { recordSheet, recordHeaders, plantingSheet, plantingHeaders };
}

function resolveRevisionSyncChange(change, context) {
  if (change.entityType === "record") {
    let rowNumber = 0;
    if (context.recordSheet && context.recordHeaders.length) {
      const uuidColumn = getHeaderColumn(context.recordHeaders, "recordUuid");
      const idColumn = getHeaderColumn(context.recordHeaders, "id");
      rowNumber = change.recordUuid
        ? findExactValueRow(
            context.recordSheet,
            uuidColumn,
            change.recordUuid,
            "記録シートの記録UUID"
          )
        : findExactValueRow(
            context.recordSheet,
            idColumn,
            change.entityId,
            "記録シートの記録ID"
          );
    }
    if (rowNumber > 0) {
      return {
        key: "record:" + (change.recordUuid || String(change.entityId)),
        type: "record",
        value: compactHarvestRecordForApi(
          getHarvestRecordAtRow(context.recordSheet, rowNumber, context.recordHeaders)
        )
      };
    }
    return {
      key: "record:" + (change.recordUuid || String(change.entityId)),
      type: "deletedRecord",
      value: {
        recordUuid: change.recordUuid,
        id: change.entityId || null,
        deletedAt: change.changedAt
      }
    };
  }

  let rowNumber = 0;
  if (context.plantingSheet && context.plantingHeaders.length) {
    rowNumber = findExactValueRow(
      context.plantingSheet,
      getPlantingEventHeaderColumn(context.plantingHeaders, "eventId"),
      change.entityId,
      "苗植えイベントシートのイベントID"
    );
  }
  if (rowNumber > 0) {
    const row = readPlantingEventRowValues(
      context.plantingSheet,
      rowNumber,
      context.plantingHeaders
    );
    if (!isCommittedPlantingEventRow(context.plantingHeaders, row)) {
      throw new Error("苗植えイベントの書き込みが完了していません");
    }
    return {
      key: "planting:" + String(change.entityId),
      type: "planting",
      value: compactPlantingEventForApi(rowToPlantingEvent(context.plantingHeaders, row))
    };
  }
  return {
    key: "planting:" + String(change.entityId),
    type: "deletedPlanting",
    value: change.entityId
  };
}

function buildRevisionSyncDeltaResult(afterRevision, currentRevision) {
  const changes = readSyncChangeLogPage(afterRevision, currentRevision);
  if (!changes) return null;
  const context = createRevisionSyncResolutionContext();
  const resolvedByKey = new Map();
  changes.forEach(change => {
    const resolved = resolveRevisionSyncChange(change, context);
    resolvedByKey.set(resolved.key, resolved);
  });

  const buildForCount = count => {
    const includedKeys = new Set();
    for (let index = 0; index < count; index++) {
      const change = changes[index];
      includedKeys.add(change.entityType + ":" + (change.recordUuid || String(change.entityId)));
    }
    const records = [];
    const deletedRecords = [];
    const events = [];
    const deletedEventIds = [];
    includedKeys.forEach(key => {
      const resolved = resolvedByKey.get(key);
      if (!resolved) return;
      if (resolved.type === "record") records.push(resolved.value);
      else if (resolved.type === "deletedRecord") deletedRecords.push(resolved.value);
      else if (resolved.type === "planting") events.push(resolved.value);
      else if (resolved.type === "deletedPlanting") deletedEventIds.push(resolved.value);
    });
    const nextSyncRevision = changes[count - 1].revision;
    return {
      revisionSync: true,
      syncRevision: nextSyncRevision,
      currentSyncRevision: currentRevision,
      records,
      deletedRecords,
      deletedRecordUuids: deletedRecords.map(item => item.recordUuid).filter(Boolean),
      deletedRecordIds: deletedRecords.filter(item => !item.recordUuid).map(item => item.id),
      events,
      deletedEventIds,
      hasMore: nextSyncRevision < currentRevision,
      plantingHasMore: false,
      nextSyncRevision
    };
  };

  let includedCount = changes.length;
  let result = buildForCount(includedCount);
  while (JSON.stringify(result).length > SYNC_CHANGE_LOG_RESPONSE_CHAR_LIMIT && includedCount > 1) {
    includedCount = Math.max(1, Math.floor(includedCount / 2));
    result = buildForCount(includedCount);
  }
  if (JSON.stringify(result).length > SYNC_CHANGE_LOG_RESPONSE_CHAR_LIMIT) {
    throw new Error("差分同期する記録1件の応答が大きすぎます");
  }
  return result;
}

function getRevisionSyncResponse(body) {
  if (!hasHarvestSyncRevisionRequest(body)) return null;
  const requestedRevision = normalizeHarvestSyncRevision(body.syncRevision);
  if (requestedRevision === null) return { resetRequired: true };
  const state = getHarvestSyncRevisionState();
  if (requestedRevision > state.revision || requestedRevision < state.floorRevision) {
    return { resetRequired: true, currentSyncRevision: state.revision };
  }
  if (requestedRevision === state.revision) {
    return {
      revisionSync: true,
      syncRevision: state.revision,
      currentSyncRevision: state.revision,
      records: [],
      deletedRecords: [],
      deletedRecordUuids: [],
      deletedRecordIds: [],
      events: [],
      deletedEventIds: [],
      hasMore: false,
      plantingHasMore: false,
      nextSyncRevision: state.revision
    };
  }
  try {
    return buildRevisionSyncDeltaResult(requestedRevision, state.revision)
      || { resetRequired: true, currentSyncRevision: state.revision };
  } catch (err) {
    console.warn("差分同期履歴を使えないため全件同期へ切り替えます: " +
      String(err && err.message || err));
    return { resetRequired: true, currentSyncRevision: state.revision };
  }
}

function getRevisionUpdateCheckResponse(body, propertyValues) {
  if (!hasHarvestSyncRevisionRequest(body)) return null;
  const requestedRevision = normalizeHarvestSyncRevision(body.syncRevision);
  const state = getHarvestSyncRevisionState(propertyValues);
  return {
    revisionSync: true,
    syncRevision: state.revision,
    currentSyncRevision: state.revision,
    resetRequired: requestedRevision === null
      || requestedRevision > state.revision
      || requestedRevision < state.floorRevision,
    updateAvailable: requestedRevision === null || requestedRevision !== state.revision,
    recordVersions: [],
    plantingVersions: [],
    deletedRecordUuids: [],
    deletedRecordIds: [],
    deletedEventIds: [],
    hasMore: false,
    plantingHasMore: false
  };
}

function isHarvestSyncRevisionWatchedSheetName(sheetName) {
  return new Set([
    SHEET_NAME,
    RECORD_TRASH_SHEET_NAME,
    RECORD_TOMBSTONE_SHEET_NAME,
    PLANTING_EVENT_SHEET_NAME,
    PLANTING_EVENT_TRASH_SHEET_NAME,
    PLANTING_EVENT_TOMBSTONE_SHEET_NAME
  ]).has(String(sheetName || ""));
}

function handleHarvestSyncRevisionSheetEdit(e) {
  const sheetName = String(e && e.range && e.range.getSheet().getName() || "");
  if (!isHarvestSyncRevisionWatchedSheetName(sheetName)) return;
  invalidateHarvestSyncRevision("スプレッドシートが直接編集されました: " + sheetName);
}

function handleHarvestSyncRevisionSheetChange(e) {
  const source = e && e.source;
  const activeSheet = source && source.getActiveSheet ? source.getActiveSheet() : null;
  const sheetName = String(activeSheet && activeSheet.getName() || "");
  if (sheetName && !isHarvestSyncRevisionWatchedSheetName(sheetName)) return;
  const changeType = String(e && e.changeType || "CHANGE");
  invalidateHarvestSyncRevision(
    "スプレッドシートが直接変更されました: " +
    (sheetName || "対象シート") + " / " + changeType
  );
}

function installHarvestSyncRevisionTrigger() {
  const handler = "handleHarvestSyncRevisionSheetChange";
  const obsoleteHandler = "handleHarvestSyncRevisionSheetEdit";
  ScriptApp.getProjectTriggers()
    .filter(trigger => [handler, obsoleteHandler].includes(trigger.getHandlerFunction()))
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger(handler).forSpreadsheet(getSpreadsheet()).onChange().create();
  return {
    installedAt: new Date().toISOString(),
    handler,
    syncRevision: getHarvestSyncRevisionState().revision
  };
}

function installHarvestSyncRevisionEditTrigger() {
  return installHarvestSyncRevisionTrigger();
}
