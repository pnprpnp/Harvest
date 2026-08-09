// スタンドアロンのApps Scriptでは、接続先IDをスクリプト プロパティへ保存します。
// スプレッドシートに紐づいたApps Scriptは、未設定でも紐づけ先を使用できます。
const SPREADSHEET_ID_PROPERTY_NAME = "HARVEST_SPREADSHEET_ID";
const SHEET_NAME = "記録";
const RECORD_TRASH_SHEET_NAME = "削除済み記録";
const RECORD_TOMBSTONE_SHEET_NAME = "記録削除ID";
const RECORD_TRASH_RETENTION_DAYS = 30;
const PLANTING_EVENT_SHEET_NAME = "苗植えイベント";
const PLANTING_EVENT_TRASH_SHEET_NAME = "削除済み苗植えイベント";
const PLANTING_EVENT_TOMBSTONE_SHEET_NAME = "苗植えイベント削除ID";
const MONITOR_SHEET_NAME = "モニター設定";
const MONITOR_HISTORY_SHEET_NAME = "モニター編集履歴";
const MONITOR_HISTORY_LIMIT = 1000;
const API_TOKEN_PROPERTY_NAME = "HARVEST_API_TOKEN";
const HARVEST_RECORD_REPAIR_BACKUP_PROPERTY =
  "HARVEST_RECORD_REPAIR_BACKUP_V1_20260809";
const SYNC_REVISION_PROPERTY_NAME = "HARVEST_SYNC_REVISION_V1";
const SYNC_REVISION_FLOOR_PROPERTY_NAME = "HARVEST_SYNC_REVISION_FLOOR_V1";
const SYNC_CHANGE_LOG_SHEET_NAME = "同期変更履歴";
const SYNC_CHANGE_LOG_HEADERS = [
  "同期番号",
  "対象",
  "記録UUID",
  "対象ID",
  "操作",
  "更新日時"
];
const SYNC_CHANGE_LOG_PAGE_LIMIT = 100;
const SYNC_CHANGE_LOG_RESPONSE_CHAR_LIMIT = 800000;
const SYNC_CHANGE_LOG_MAX_ROWS = 20000;
const SYNC_CHANGE_LOG_RETAINED_ROWS = 10000;
const API_BUILD_VERSION = "2026-08-09-current-schema-only-1";
const API_TOKEN_MIN_LENGTH = 32;
const API_TOKEN_MAX_LENGTH = 512;
const API_MAX_BODY_CHARACTERS = 500000;
const API_MAX_BODY_BYTES = 1000000;
const API_BATCH_RECORD_LIMIT = 100;
const RECORD_CASES_LIMIT = 999999;
const RECORD_SEEDLING_TRAY_LIMIT = 999999;
const RECORD_PALLET_KEY_LIMIT = 3744;
const RECORD_TARGET_LIMIT = 48;
const RECORD_MEMO_LENGTH_LIMIT = 10000;
const RECORD_SUMMARY_LENGTH_LIMIT = 20000;
const RECORD_QUALITY_LENGTH_LIMIT = 2000;
const RECORD_DUPLICATE_KEY_LENGTH_LIMIT = 128;
const RECORD_UUID_LENGTH_LIMIT = 64;
const PLANTING_AGE_SUMMARY_LENGTH_LIMIT = 2000;
const PLANTING_AGE_DETAIL_LENGTH_LIMIT = 20000;
const MONITOR_INSTRUCTION_LENGTH_LIMIT = 20000;
const MONITOR_MEMO_LENGTH_LIMIT = 50000;
const MONITOR_MEMO_ITEM_LIMIT = 100;
const MONITOR_MEMO_ITEM_LENGTH_LIMIT = 5000;
const RECORD_LIST_LIMIT = 1000;
const RECORD_LIST_RECENT_DAYS_LIMIT = 3650;
const RECORD_TOMBSTONE_LIST_LIMIT = 10000;
const HARVEST_RECORD_API_RESPONSE_CHAR_LIMIT = 600000;
const COMBINED_SYNC_API_RESPONSE_CHAR_LIMIT = 900000;
const PLANTING_EVENT_ALLOCATION_LIMIT = 1000;
const PLANTING_EVENT_LIST_LIMIT = 1000;
const PLANTING_EVENT_TOMBSTONE_LIST_LIMIT = 10000;
const PLANTING_EVENT_API_EVENT_RESPONSE_CHAR_LIMIT = 800000;
const PLANTING_EVENT_SEEDLING_COUNT_LIMIT = 999999999;
const RECORD_SYNC_SCHEMA_VERSION = 4;
const RECORD_SYNC_PROVIDED_FIELDS_MIN_VERSION = 2;
const HARVEST_BUILDINGS = [2, 3, 4, 5, 6, 7, 8, 9];
const HARVEST_BEDS = ["A", "B", "C", "D", "E", "F"];
const PALLETS_PER_BED = 78;
const CURRENT_PALLET_NUMBERING_VERSION = 2;
const RECORD_TYPES = ["fullHarvest", "partialHarvest"];
const QUALITY_TAGS = ["large", "small", "elongated", "chip"];
const RECORD_FORMULA_SAFE_TEXT_KEYS = new Set([
  "palletSummary",
  "plantingCaseInstruction",
  "plantingSummary",
  "qualityText",
  "plantingAge",
  "memo"
]);
const HARVEST_WRITE_MARKER_PREFIX = "__HARVEST_WRITING_V1__";
const PLANTING_WRITE_MARKER_PREFIX = "__PLANTING_WRITING_V1__";

const MONITOR_SETTING_KEYS = [
  "enabled",
  "version",
  "instructionText",
  "memoText",
  "harvestFillKeys",
  "updatedAt"
];

const MONITOR_SETTING_LABELS = {
  enabled: "遠隔表示を使う",
  version: "更新番号",
  instructionText: "指示内容",
  memoText: "メモ欄",
  harvestFillKeys: "収穫場所キーJSON",
  updatedAt: "更新日時"
};

const MONITOR_HISTORY_KEYS = [
  "savedAt",
  "version",
  "enabled",
  "instructionText",
  "memoText",
  "harvestFillKeys"
];

const MONITOR_HISTORY_HEADERS = [
  "保存日時",
  "更新番号",
  "遠隔表示",
  "指示内容",
  "メモ欄",
  "収穫場所キーJSON"
];

const FIELD_KEYS = [
  "duplicateKey",
  "id",
  "recordUuid",
  "type",
  "date",
  "cases",
  "palletSummary",
  "plannedSeedlingTrayCount",
  "plantingCaseInstruction",
  "plantingSummary",
  "plantingDate",
  "actualSeedlingTrayCount",
  "actualSeedlingCarryoverMode",
  "actualSeedlingLossRate",
  "actualLoss",
  "qualityText",
  "sizeRating",
  "plantingAge",
  "memo",
  "palletKeys",
  "plantingPalletKeys",
  "targets",
  "createdAt",
  "updatedAt",
  "receivedAt",
  "palletNumberingVersion"
];

const HEADER_LABELS = {
  duplicateKey: "重複判定キー",
  id: "記録ID",
  recordUuid: "記録UUID",
  type: "記録種別",
  date: "収穫日",
  cases: "ケース数",
  palletSummary: "収穫場所",
  plannedSeedlingTrayCount: "予定苗枚数",
  plantingCaseInstruction: "ケース指示",
  plantingSummary: "苗植え場所",
  plantingDate: "苗植え日",
  actualSeedlingTrayCount: "実苗枚数",
  actualSeedlingCarryoverMode: "余り苗区分",
  actualSeedlingLossRate: "実苗ロス率",
  actualLoss: "実ロス率",
  qualityText: "品質メモ",
  sizeRating: "大きさ",
  plantingAge: "定植日数",
  memo: "メモ",
  palletKeys: "パレット詳細",
  plantingPalletKeys: "苗植え詳細",
  targets: "先取り詳細",
  createdAt: "作成日時",
  updatedAt: "更新日時",
  receivedAt: "受信日時",
  palletNumberingVersion: "パレット番号方式"
};

const HEADERS = FIELD_KEYS.map(key => HEADER_LABELS[key]);
const RECORD_TRASH_HEADERS = HEADERS.concat(["削除日時", "復元期限"]);
const RECORD_TOMBSTONE_HEADERS = ["記録UUID", "記録ID", "削除日時"];
const RECORD_SYNC_PRESERVED_FIELD_KEYS = [
  "plantingCaseInstruction",
  "actualSeedlingCarryoverMode"
];

const PLANTING_EVENT_FIELD_KEYS = [
  "eventId",
  "plantingDate",
  "sourceAllocations",
  "plantingPalletKeys",
  "actualSeedlingTrayCount",
  "actualTakenSeedlingCount",
  "actualPlantedSeedlingCount",
  "actualSeedlingCarryoverMode",
  "actualSeedlingLossRate",
  "qualityMemo",
  "createdAt",
  "updatedAt",
  "detailsUnknown",
  "palletNumberingVersion"
];

const PLANTING_EVENT_HEADER_LABELS = {
  eventId: "苗植えイベントID",
  plantingDate: "苗植え日",
  sourceAllocations: "収穫元割当JSON",
  plantingPalletKeys: "苗植え詳細JSON",
  actualSeedlingTrayCount: "実苗枚数",
  actualTakenSeedlingCount: "実取得苗株数",
  actualPlantedSeedlingCount: "実苗植え株数",
  actualSeedlingCarryoverMode: "余り苗区分",
  actualSeedlingLossRate: "実苗ロス率",
  qualityMemo: "苗の品質メモ",
  detailsUnknown: "苗数量情報",
  createdAt: "作成日時",
  updatedAt: "更新日時",
  palletNumberingVersion: "パレット番号方式"
};

const PLANTING_EVENT_HEADERS = PLANTING_EVENT_FIELD_KEYS.map(
  key => PLANTING_EVENT_HEADER_LABELS[key]
);
const PLANTING_EVENT_TRASH_HEADERS = PLANTING_EVENT_HEADERS.concat(["削除日時", "復元期限"]);
const PLANTING_EVENT_TOMBSTONE_HEADERS = ["苗植えイベントID", "削除日時"];
const PLANTING_EVENT_FORMULA_SAFE_KEYS = new Set([
  "sourceAllocations",
  "plantingPalletKeys",
  "qualityMemo"
]);

let requestScopedSpreadsheet = null;
let requestScopedChangedHarvestRecordIds = new Set();

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

function doPost(e) {
  requestScopedSpreadsheet = null;
  requestScopedChangedHarvestRecordIds = new Set();
  let apiStage = "リクエスト本文の確認中";
  try {
    const body = parseApiRequestBody(e);
    apiStage = "連携トークンの確認中";
    const fastCheckPropertyValues = isHarvestRevisionFastCheckCandidate(body)
      ? PropertiesService.getScriptProperties().getProperties()
      : null;
    assertApiAuthenticated(body.token, fastCheckPropertyValues);
    apiStage = "操作の種類の確認中";
    const operation = resolveApiOperation(body);

    if (operation === "checkUpdates") {
      apiStage = "同期番号の高速確認中";
      const revisionCheck = getRevisionUpdateCheckResponse(body, fastCheckPropertyValues);
      if (revisionCheck) {
        return jsonResponse({ ok: true, ...revisionCheck });
      }
    }

    if (operation === "checkUpdates") {
      apiStage = "更新情報の確認中";
      const includePlanting = body.includePlanting !== false;
      const syncResult = listHarvestRecordsForSync(normalizeRecordListOptions({
        limit: body.limit,
        syncMode: true,
        cursor: body.cursor
      }));
      const deletedRecords = syncResult.deletedRecords || [];
      const plantingSyncResult = includePlanting
        ? listPlantingEventsForSync(normalizePlantingEventListOptions({
            limit: PLANTING_EVENT_LIST_LIMIT,
            syncMode: true,
            cursor: body.plantingCursor,
            fallbackSeedlingLossRate: body.fallbackSeedlingLossRate,
            fallbackSeedlingPattern: body.fallbackSeedlingPattern,
            fallbackPlantingCountsByBed: body.fallbackPlantingCountsByBed
          }))
        : null;
      return jsonResponse({
        ok: true,
        recordVersions: (syncResult.records || []).map(record => ({
          recordUuid: record.recordUuid || "",
          id: record.id,
          updatedAt: record.updatedAt || ""
        })),
        deletedRecordUuids: deletedRecords.map(item => item.recordUuid).filter(Boolean),
        deletedRecordIds: deletedRecords
          .filter(item => !item.recordUuid)
          .map(item => item.id)
          .filter(id => id !== null),
        hasMore: syncResult.hasMore === true,
        nextCursor: syncResult.nextCursor || null,
        plantingVersions: plantingSyncResult
          ? plantingSyncResult.events.map(event => ({
              eventId: event.eventId,
              updatedAt: getEffectivePlantingEventUpdatedAt(event)
            }))
          : [],
        deletedEventIds: includePlanting ? listDeletedPlantingEventIds() : [],
        plantingHasMore: plantingSyncResult ? plantingSyncResult.hasMore : false,
        plantingNextCursor: plantingSyncResult ? plantingSyncResult.nextCursor : null
      });
    }

    if (operation === "syncAll") {
      apiStage = "収穫・苗植え記録の一括読み込み中";
      const revisionSync = getRevisionSyncResponse(body);
      if (revisionSync && !revisionSync.resetRequired) {
        return jsonResponse({ ok: true, ...revisionSync });
      }
      const syncRevisionSnapshot = getHarvestSyncRevisionState().revision;
      const restartRevisionSync = !!revisionSync
        && revisionSync.resetRequired
        && body.revisionReset !== true;
      const recordOptions = normalizeRecordListOptions({
        limit: body.limit,
        syncMode: true,
        cursor: restartRevisionSync ? null : body.cursor
      });
      const plantingOptions = normalizePlantingEventListOptions({
        limit: body.plantingLimit,
        syncMode: true,
        cursor: restartRevisionSync ? null : body.plantingCursor,
        fallbackSeedlingLossRate: body.fallbackSeedlingLossRate,
        fallbackSeedlingPattern: body.fallbackSeedlingPattern,
        fallbackPlantingCountsByBed: body.fallbackPlantingCountsByBed
      });
      const syncResult = listHarvestRecordsForSync(recordOptions);
      const plantingSyncResult = listPlantingEventsForSync(plantingOptions);
      return jsonResponse({
        ok: true,
        ...buildCombinedRecordSyncApiResult(syncResult, plantingSyncResult, {
          recordCursor: recordOptions.cursor,
          plantingCursor: plantingOptions.cursor
        }),
        revisionSync: hasHarvestSyncRevisionRequest(body),
        revisionReset: hasHarvestSyncRevisionRequest(body),
        syncRevision: syncRevisionSnapshot,
        currentSyncRevision: syncRevisionSnapshot,
        nextSyncRevision: syncRevisionSnapshot
      });
    }

    if (operation === "listRecords") {
      apiStage = "収穫記録の読み込み中";
      const syncResult = listHarvestRecordsForSync(normalizeRecordListOptions({
        recentDays: body.recentDays,
        limit: body.limit,
        syncMode: body.syncMode,
        cursor: body.cursor
      }));
      const apiResult = buildHarvestRecordListApiResult(syncResult);
      return jsonResponse({
        ok: true,
        ...apiResult
      });
    }

    if (operation === "deleteRecord") {
      apiStage = "収穫記録の削除中";
      const result = deleteHarvestRecord(body.record);
      recordHarvestRecordSyncResult(
        { ...result, record: result.record || body.record },
        "delete"
      );
      return jsonResponse({
        ok: true,
        ...result,
        record: result.record ? compactHarvestRecordForApi(result.record) : null
      });
    }

    if (operation === "restoreRecord") {
      apiStage = "収穫記録の復元中";
      const result = restoreHarvestRecord(body.record);
      recordHarvestRecordSyncResult(result, "upsert");
      return jsonResponse({
        ok: true,
        ...result,
        record: result.record ? compactHarvestRecordForApi(result.record) : null
      });
    }

    if (operation === "listPlantingEvents") {
      apiStage = "苗植えイベントの読み込み中";
      const listOptions = normalizePlantingEventListOptions({
        recentDays: body.recentDays,
        limit: body.limit,
        syncMode: body.syncMode,
        cursor: body.cursor,
        fallbackSeedlingLossRate: body.fallbackSeedlingLossRate,
        fallbackSeedlingPattern: body.fallbackSeedlingPattern,
        fallbackPlantingCountsByBed: body.fallbackPlantingCountsByBed
      });
      const syncResult = listOptions.syncMode ? listPlantingEventsForSync(listOptions) : null;
      return jsonResponse({
        ok: true,
        events: syncResult ? syncResult.events : listPlantingEventsForApi(listOptions),
        deletedEventIds: listDeletedPlantingEventIds(),
        hasMore: syncResult ? syncResult.hasMore : false,
        nextCursor: syncResult ? syncResult.nextCursor : null
      });
    }

    if (operation === "savePlantingEvent") {
      apiStage = "苗植えイベントの保存中";
      const result = savePlantingEvent(body.event);
      const syncRevision = recordPlantingEventSyncResult(result, body.event, "upsert");
      apiStage = "苗植えイベントの応答作成中";
      return jsonResponse({
        ok: true,
        ...result,
        syncRevision,
        message: result.updated ? "苗植えイベントを更新しました" : "苗植えイベントを保存しました"
      });
    }

    if (operation === "deletePlantingEvent") {
      apiStage = "苗植えイベントの削除中";
      const result = deletePlantingEvent(body.event);
      const syncRevision = recordPlantingEventSyncResult(result, body.event, "delete");
      return jsonResponse({
        ok: true,
        ...result,
        syncRevision
      });
    }

    if (operation === "restorePlantingEvent") {
      apiStage = "苗植えイベントの復元中";
      const result = restorePlantingEvent(body.event);
      const syncRevision = recordPlantingEventSyncResult(result, body.event, "upsert");
      return jsonResponse({
        ok: true,
        ...result,
        syncRevision
      });
    }

    if (operation === "getMonitorContent") {
      apiStage = "モニター内容の読み込み中";
      return jsonResponse({
        ok: true,
        content: getMonitorContent()
      });
    }

    if (operation === "saveMonitorContent") {
      apiStage = "モニター内容の保存中";
      return jsonResponse({
        ok: true,
        ...saveMonitorContent(normalizeMonitorContentInput(body.content))
      });
    }

    if (operation === "listMonitorHistory") {
      apiStage = "モニター履歴の読み込み中";
      return jsonResponse({
        ok: true,
        history: listMonitorHistory(normalizeMonitorHistoryOptions({
          limit: body.limit
        }))
      });
    }

    if (operation === "saveRecordBatch") {
      apiStage = "収穫記録の一括保存中";
      const result = saveHarvestRecordsBatch(body.records);
      recordHarvestSyncChangesSafely(result.results
        .filter(item => item && item.ok === true && item.record && !item.duplicate)
        .map(item => ({
          entityType: "record",
          recordUuid: item.record.recordUuid,
          entityId: item.record.id,
          action: "upsert"
        })));
      apiStage = "収穫記録の一括応答作成中";
      return jsonResponse({
        ok: true,
        ...result,
        results: result.results.map(item => ({
          ...item,
          record: item.record ? compactHarvestRecordForApi(item.record) : item.record
        }))
      });
    }

    if (operation !== "saveRecord") throw new Error("許可されていない操作です");
    apiStage = "収穫記録の保存中";
    const result = saveHarvestRecord(body.record, body.duplicateKey);
    recordHarvestRecordSyncResult(result, "upsert");

    apiStage = "収穫記録の応答作成中";
    return jsonResponse({
      ok: true,
      duplicate: result.duplicate,
      updated: result.updated,
      record: result.record ? compactHarvestRecordForApi(result.record) : null,
      message: result.updated ? "記録を更新しました" : (result.duplicate ? "保存済みの記録です" : "保存しました")
    });
  } catch (err) {
    return jsonResponse({
      ok: false,
      message: "[" + API_BUILD_VERSION + "] " + apiStage + ": " +
        String(err && err.message ? err.message : err)
    });
  }
}

/**
 * Apps Script のエディタから一度だけ手動実行してください。
 * 返された値（実行ログにも出ます）をアプリの Google 連携トークンに設定します。
 * 交換する場合は regenerateHarvestApiToken() を手動実行します。
 */
function setupHarvestApiToken(forceRegenerate) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const properties = PropertiesService.getScriptProperties();
    const current = String(properties.getProperty(API_TOKEN_PROPERTY_NAME) || "").trim();
    if (!forceRegenerate && current.length >= API_TOKEN_MIN_LENGTH && current.length <= API_TOKEN_MAX_LENGTH) {
      console.log(API_TOKEN_PROPERTY_NAME + ": " + current);
      return current;
    }

    const entropy = [
      Utilities.getUuid(),
      Utilities.getUuid(),
      Utilities.getUuid(),
      Utilities.getUuid(),
      String(Date.now()),
      String(Math.random())
    ].join("|");
    const bytes = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      entropy,
      Utilities.Charset.UTF_8
    );
    const token = Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, "");
    properties.setProperty(API_TOKEN_PROPERTY_NAME, token);
    console.log(API_TOKEN_PROPERTY_NAME + ": " + token);
    return token;
  } finally {
    lock.releaseLock();
  }
}

// トークンを交換する時だけ手動実行してください。交換後は全端末の設定更新が必要です。
function regenerateHarvestApiToken() {
  return setupHarvestApiToken(true);
}

function parseApiRequestBody(e) {
  const postData = e && e.postData;
  const raw = postData && typeof postData.contents === "string" ? postData.contents : "";
  if (!raw) throw new Error("リクエスト本文がありません");
  if (raw.length > API_MAX_BODY_CHARACTERS) throw new Error("リクエスト本文が大きすぎます");

  const declaredLength = Number(postData && postData.length);
  if (Number.isFinite(declaredLength) && declaredLength > API_MAX_BODY_BYTES) {
    throw new Error("リクエスト本文が大きすぎます");
  }
  const actualLength = Utilities.newBlob(raw).getBytes().length;
  if (actualLength > API_MAX_BODY_BYTES) throw new Error("リクエスト本文が大きすぎます");

  let body;
  try {
    body = JSON.parse(raw);
  } catch (err) {
    throw new Error("JSON形式のリクエストではありません");
  }
  if (!isPlainObject(body)) throw new Error("リクエスト本文はオブジェクトで指定してください");
  if (typeof body.app !== "undefined" && body.app !== "Harvestnavi") {
    throw new Error("対象アプリが違います");
  }
  if (typeof body.version !== "undefined" && body.version !== 1) {
    throw new Error("対応していないリクエスト形式です");
  }
  return body;
}

function resolveApiOperation(body) {
  const operationByAction = {
    checkUpdates: "checkUpdates",
    syncAll: "syncAll",
    listRecords: "listRecords",
    deleteRecord: "deleteRecord",
    restoreRecord: "restoreRecord",
    listPlantingEvents: "listPlantingEvents",
    savePlantingEvent: "savePlantingEvent",
    deletePlantingEvent: "deletePlantingEvent",
    restorePlantingEvent: "restorePlantingEvent",
    getMonitorContent: "getMonitorContent",
    saveMonitorContent: "saveMonitorContent",
    listMonitorHistory: "listMonitorHistory"
  };
  const operationByType = {
    "harvest-update-check": "checkUpdates",
    "harvest-sync-all": "syncAll",
    "harvest-record": "saveRecord",
    "harvest-record-batch": "saveRecordBatch",
    "harvest-record-list": "listRecords",
    "harvest-record-delete": "deleteRecord",
    "harvest-record-restore": "restoreRecord",
    "planting-event": "savePlantingEvent",
    "planting-event-list": "listPlantingEvents",
    "planting-event-delete": "deletePlantingEvent",
    "planting-event-restore": "restorePlantingEvent",
    "harvest-monitor-content": "getMonitorContent",
    "harvest-monitor-save": "saveMonitorContent",
    "harvest-monitor-history": "listMonitorHistory"
  };
  const action = normalizeOptionalRequestSelector(body.action, "action");
  const type = normalizeOptionalRequestSelector(body.type, "type");
  const actionOperation = action && Object.prototype.hasOwnProperty.call(operationByAction, action)
    ? operationByAction[action]
    : "";
  const typeOperation = type && Object.prototype.hasOwnProperty.call(operationByType, type)
    ? operationByType[type]
    : "";

  if ((action && !actionOperation) || (type && !typeOperation)) {
    throw new Error("許可されていない操作です");
  }
  if (actionOperation && typeOperation && actionOperation !== typeOperation) {
    throw new Error("actionとtypeの組み合わせが一致しません");
  }
  const operation = actionOperation || typeOperation;
  if (!operation) throw new Error("操作の種類がありません");

  if (["saveRecord", "deleteRecord", "restoreRecord"].includes(operation) && !isPlainObject(body.record)) {
    throw new Error("記録データがありません");
  }
  if (["savePlantingEvent", "deletePlantingEvent", "restorePlantingEvent"].includes(operation) &&
    !isPlainObject(body.event)) {
    throw new Error("苗植えイベントがありません");
  }
  if (operation === "saveRecordBatch") {
    if (!Array.isArray(body.records)) throw new Error("recordsが配列ではありません");
    if (body.records.length > API_BATCH_RECORD_LIMIT) {
      throw new Error("一度に送信できる記録は" + API_BATCH_RECORD_LIMIT + "件までです");
    }
  }
  if (operation === "saveMonitorContent" && !isPlainObject(body.content)) {
    throw new Error("モニター内容がありません");
  }
  return operation;
}

function normalizeOptionalRequestSelector(value, label) {
  if (value === null || typeof value === "undefined" || value === "") return "";
  if (typeof value !== "string" || value.length > 64) {
    throw new Error(label + "の形式が正しくありません");
  }
  return value;
}

function assertApiAuthenticated(providedToken, propertyValues) {
  const expectedToken = getConfiguredApiToken(propertyValues);
  const hasValidFormat = typeof providedToken === "string" && providedToken.length <= API_TOKEN_MAX_LENGTH;
  const candidate = typeof providedToken === "string"
    ? providedToken.slice(0, API_TOKEN_MAX_LENGTH)
    : "";
  const matches = constantTimeTokenEquals(candidate, expectedToken);
  if (!hasValidFormat || !matches) {
    throw new Error("認証できませんでした");
  }
}

function getConfiguredApiToken(propertyValues) {
  const tokenValue = isPlainObject(propertyValues)
    ? propertyValues[API_TOKEN_PROPERTY_NAME]
    : PropertiesService.getScriptProperties().getProperty(API_TOKEN_PROPERTY_NAME);
  const token = String(tokenValue || "").trim();
  if (token.length < API_TOKEN_MIN_LENGTH || token.length > API_TOKEN_MAX_LENGTH) {
    throw new Error("サーバー認証が未設定です。setupHarvestApiTokenを手動実行してください");
  }
  return token;
}

function constantTimeTokenEquals(left, right) {
  const leftHash = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(left),
    Utilities.Charset.UTF_8
  );
  const rightHash = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(right),
    Utilities.Charset.UTF_8
  );
  let difference = 0;
  for (let index = 0; index < rightHash.length; index++) {
    difference |= leftHash[index] ^ rightHash[index];
  }
  return difference === 0;
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function normalizePalletNumberingVersion(value) {
  return normalizeRequiredInteger(
    value,
    "パレット番号方式",
    CURRENT_PALLET_NUMBERING_VERSION,
    CURRENT_PALLET_NUMBERING_VERSION
  );
}

function comparePalletKeys(left, right) {
  const leftParts = String(left || "").split("-");
  const rightParts = String(right || "").split("-");
  return Number(leftParts[0]) - Number(rightParts[0])
    || String(leftParts[1] || "").localeCompare(String(rightParts[1] || ""))
    || Number(leftParts[2]) - Number(rightParts[2]);
}


function normalizeHarvestRecord(record) {
  if (!isPlainObject(record)) throw new Error("記録データはオブジェクトで指定してください");

  const type = normalizeRequiredEnum(record.type, "記録種別", RECORD_TYPES);
  const id = normalizeRequiredInteger(record.id, "記録ID", 1, Number.MAX_SAFE_INTEGER);
  normalizePalletNumberingVersion(record.palletNumberingVersion);
  const recordUuid = normalizeRequiredRecordUuid(record.recordUuid);
  const createdAt = normalizeOptionalTimestamp(record.createdAt, "作成日時");
  const updatedAt = normalizeOptionalTimestamp(record.updatedAt, "更新日時");
  const date = normalizeRequiredDate(record.date, "収穫日");
  const cases = normalizeRequiredInteger(record.cases, "ケース数", 1, RECORD_CASES_LIMIT);
  const suppliedDuplicateKey = normalizeOptionalText(
    record.duplicateKey,
    "重複判定キー",
    RECORD_DUPLICATE_KEY_LENGTH_LIMIT,
    true
  );
  if (suppliedDuplicateKey && suppliedDuplicateKey !== date + "__" + cases) {
    throw new Error("重複判定キーが記録内容と一致しません");
  }

  const memo = normalizeOptionalText(record.memo, "メモ", RECORD_MEMO_LENGTH_LIMIT, false);
  const rawTargets = normalizeRecordTargets(record.targets);
  const rawPalletKeys = normalizeDirectPalletKeys(record.palletKeys, "収穫パレット");
  const rawPlantingPalletKeys = normalizeDirectPalletKeys(
    record.plantingPalletKeys,
    "苗植えパレット"
  );
  const targets = rawTargets;
  const palletKeys = rawPalletKeys;
  const plantingPalletKeys = rawPlantingPalletKeys;

  if (type === "partialHarvest") {
    if (!targets.length) throw new Error("先取り収穫の対象がありません");
    if (palletKeys.length || plantingPalletKeys.length) {
      throw new Error("先取り収穫にはパレット一覧を指定できません");
    }
    return {
      id,
      recordUuid,
      palletNumberingVersion: CURRENT_PALLET_NUMBERING_VERSION,
      duplicateKey: date + "__" + cases,
      type,
      date,
      cases,
      palletSummary: formatValidatedPartialHarvestSummary(targets),
      plannedSeedlingTrayCount: 0,
      plantingCaseInstruction: "",
      plantingSummary: "",
      plantingDate: "",
      actualSeedlingTrayCount: 0,
      actualSeedlingCarryoverMode: "loss",
      actualSeedlingLossRate: "",
      actualLoss: "",
      qualityMemo: null,
      qualityText: "",
      sizeRating: "unknown",
      plantingAge: null,
      memo,
      palletKeys: [],
      plantingPalletKeys: [],
      targets,
      createdAt,
      updatedAt
    };
  }

  if (!palletKeys.length) throw new Error("収穫パレットがありません");
  if (targets.length) throw new Error("通常収穫には先取り対象を指定できません");

  normalizeRequiredText(
    record.palletSummary,
    "収穫場所",
    RECORD_SUMMARY_LENGTH_LIMIT,
    true
  );
  const palletSummary = formatRecordedPalletSummary(palletKeys);
  const plannedSeedlingTrayCount = normalizeOptionalInteger(
    record.plannedSeedlingTrayCount,
    "予定苗枚数",
    0,
    RECORD_SEEDLING_TRAY_LIMIT,
    0
  );
  const suppliedPlantingSummary = normalizeOptionalText(
    record.plantingSummary,
    "苗植え場所",
    RECORD_SUMMARY_LENGTH_LIMIT,
    false
  );
  const plantingSummary = suppliedPlantingSummary;
  const plantingDate = normalizeOptionalDate(record.plantingDate, "苗植え日");
  const actualSeedlingTrayCount = normalizeOptionalInteger(
    record.actualSeedlingTrayCount,
    "実苗枚数",
    0,
    RECORD_SEEDLING_TRAY_LIMIT,
    0
  );
  const actualSeedlingLossRate = normalizeOptionalFiniteNumber(
    record.actualSeedlingLossRate,
    "実苗ロス率",
    0,
    100,
    ""
  );
  const actualLoss = normalizeRequiredFiniteNumber(record.actualLoss, "実ロス率", -999999, 100);
  const qualityMemo = normalizeQualityMemoInput(record.qualityMemo);
  const qualityText = normalizeOptionalText(
    record.qualityText,
    "品質メモ",
    RECORD_QUALITY_LENGTH_LIMIT,
    false
  );
  const sizeRating = normalizeOptionalSizeRating(record.sizeRating);
  const plantingAge = normalizePlantingAgeInput(record.plantingAge);
  const plantingCaseInstruction = normalizeOptionalText(
    record.plantingCaseInstruction,
    "ケース配置指示",
    RECORD_SUMMARY_LENGTH_LIMIT,
    false
  );
  const actualSeedlingCarryoverMode = normalizeOptionalCarryoverMode(record.actualSeedlingCarryoverMode);

  return {
    id,
    recordUuid,
    palletNumberingVersion: CURRENT_PALLET_NUMBERING_VERSION,
    duplicateKey: date + "__" + cases,
    type,
    date,
    cases,
    palletSummary,
    plannedSeedlingTrayCount,
    plantingCaseInstruction,
    plantingSummary,
    plantingDate,
    actualSeedlingTrayCount,
    actualSeedlingCarryoverMode,
    actualSeedlingLossRate,
    actualLoss,
    qualityMemo,
    qualityText,
    sizeRating,
    plantingAge,
    memo,
    palletKeys,
    plantingPalletKeys,
    targets: [],
    createdAt,
    updatedAt
  };
}

function normalizeOptionalRecordUuid(value) {
  if (value === null || typeof value === "undefined" || value === "") return "";
  if (typeof value !== "string" || value.length > RECORD_UUID_LENGTH_LIMIT) {
    throw new Error("記録UUIDの形式が正しくありません");
  }
  const text = value.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(text)) {
    throw new Error("記録UUIDの形式が正しくありません");
  }
  return text;
}

function normalizeRequiredRecordUuid(value) {
  const recordUuid = normalizeOptionalRecordUuid(value);
  if (!recordUuid) throw new Error("記録UUIDがありません");
  return recordUuid;
}

function normalizePlantingEvent(event) {
  if (!isPlainObject(event)) throw new Error("苗植えイベントはオブジェクトで指定してください");

  const eventId = normalizeRequiredInteger(
    event.eventId,
    "苗植えイベントID",
    1,
    Number.MAX_SAFE_INTEGER
  );
  normalizePalletNumberingVersion(event.palletNumberingVersion);
  const plantingDate = normalizeRequiredDate(event.plantingDate, "苗植え日");
  const rawSourceAllocations = normalizePlantingSourceAllocations(event.sourceAllocations);
  const rawPlantingPalletKeys = normalizeDirectPalletKeys(
    event.plantingPalletKeys,
    "苗植えイベントのパレット"
  );
  const sourceAllocations = rawSourceAllocations;
  const plantingPalletKeys = rawPlantingPalletKeys;
  if (!plantingPalletKeys.length) throw new Error("苗植えイベントのパレットがありません");

  const allocatedKeys = [];
  sourceAllocations.forEach(allocation => {
    allocation.palletKeys.forEach(key => allocatedKeys.push(key));
  });
  const uniqueAllocatedKeys = new Set(allocatedKeys);
  if (uniqueAllocatedKeys.size !== allocatedKeys.length) {
    throw new Error("収穫元割当に同じパレットが重複しています");
  }
  const plantingKeySet = new Set(plantingPalletKeys);
  if (plantingKeySet.size !== uniqueAllocatedKeys.size ||
    plantingPalletKeys.some(key => !uniqueAllocatedKeys.has(key))) {
    throw new Error("収穫元割当と苗植えパレットが一致しません");
  }

  return {
    palletNumberingVersion: CURRENT_PALLET_NUMBERING_VERSION,
    eventId,
    plantingDate,
    sourceAllocations,
    plantingPalletKeys,
    actualSeedlingTrayCount: normalizeOptionalInteger(
      event.actualSeedlingTrayCount,
      "実苗枚数",
      0,
      RECORD_SEEDLING_TRAY_LIMIT,
      0
    ),
    actualTakenSeedlingCount: normalizeOptionalInteger(
      event.actualTakenSeedlingCount,
      "実際に取った苗株数",
      0,
      PLANTING_EVENT_SEEDLING_COUNT_LIMIT,
      ""
    ),
    actualPlantedSeedlingCount: normalizeOptionalInteger(
      event.actualPlantedSeedlingCount,
      "実際に苗植えした株数",
      0,
      PLANTING_EVENT_SEEDLING_COUNT_LIMIT,
      ""
    ),
    actualSeedlingCarryoverMode: normalizeOptionalCarryoverMode(event.actualSeedlingCarryoverMode),
    actualSeedlingLossRate: normalizeOptionalFiniteNumber(
      event.actualSeedlingLossRate,
      "実苗ロス率",
      0,
      100,
      ""
    ),
    qualityMemo: normalizePlantingQualityMemoInput(event.qualityMemo),
    detailsUnknown: normalizePlantingEventDetailsUnknown(event.detailsUnknown),
    createdAt: normalizeOptionalTimestamp(event.createdAt, "作成日時"),
    updatedAt: normalizeOptionalTimestamp(event.updatedAt, "更新日時")
  };
}

function normalizePlantingSourceAllocations(value) {
  if (!Array.isArray(value)) throw new Error("収穫元割当は配列で指定してください");
  if (!value.length) throw new Error("収穫元割当がありません");
  if (value.length > PLANTING_EVENT_ALLOCATION_LIMIT) {
    throw new Error("収穫元割当は" + PLANTING_EVENT_ALLOCATION_LIMIT + "件までです");
  }

  const seenHarvestRecordIds = new Set();
  return value.map((allocation, index) => {
    if (!isPlainObject(allocation)) {
      throw new Error("収穫元割当" + (index + 1) + "の形式が正しくありません");
    }
    const harvestRecordId = normalizeRequiredInteger(
      allocation.harvestRecordId,
      "収穫元割当" + (index + 1) + "の収穫記録ID",
      1,
      Number.MAX_SAFE_INTEGER
    );
    if (seenHarvestRecordIds.has(harvestRecordId)) {
      throw new Error("同じ収穫記録IDの割当が重複しています");
    }
    seenHarvestRecordIds.add(harvestRecordId);

    const palletKeys = normalizeDirectPalletKeys(
      allocation.palletKeys,
      "収穫元割当" + (index + 1) + "のパレット"
    );
    if (!palletKeys.length) {
      throw new Error("収穫元割当" + (index + 1) + "のパレットがありません");
    }
    return { harvestRecordId, palletKeys };
  });
}

function normalizeOptionalTimestamp(value, label) {
  if (value === null || typeof value === "undefined" || value === "") return "";
  if (Object.prototype.toString.call(value) === "[object Date]") {
    if (!Number.isFinite(value.getTime())) throw new Error(label + "の形式が正しくありません");
    return value.toISOString();
  }
  if (typeof value !== "string" || value.length > 64) {
    throw new Error(label + "の形式が正しくありません");
  }
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+\-]\d{2}:\d{2})$/.test(text)) {
    throw new Error(label + "はISO 8601形式で指定してください");
  }
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) throw new Error(label + "の形式が正しくありません");
  return date.toISOString();
}

function normalizeRecordTargets(value) {
  if (value === null || typeof value === "undefined") return [];
  if (!Array.isArray(value)) throw new Error("先取り対象は配列で指定してください");
  if (value.length > RECORD_TARGET_LIMIT) {
    throw new Error("先取り対象は" + RECORD_TARGET_LIMIT + "件までです");
  }

  return value.map((target, index) => {
    if (!isPlainObject(target)) throw new Error("先取り対象" + (index + 1) + "の形式が正しくありません");
    const building = normalizeRequiredInteger(target.building, "先取り対象の号棟", 2, 9);
    if (!HARVEST_BUILDINGS.includes(building)) throw new Error("先取り対象の号棟が範囲外です");
    const bed = normalizeRequiredEnum(target.bed, "先取り対象のベッド", HARVEST_BEDS);
    const start = normalizeRequiredInteger(target.start, "先取り対象の開始番号", 1, PALLETS_PER_BED);
    const end = normalizeRequiredInteger(target.end, "先取り対象の終了番号", 1, PALLETS_PER_BED);
    if (start > end) throw new Error("先取り対象の開始番号と終了番号が逆です");
    const plantsPerPallet = normalizeRequiredFiniteNumber(
      target.plantsPerPallet,
      "パレット当たりの株数",
      0.000001,
      999
    );
    return { building, bed, start, end, plantsPerPallet };
  });
}

function normalizeDirectPalletKeys(value, label) {
  if (value === null || typeof value === "undefined") return [];
  if (!Array.isArray(value)) throw new Error(label + "は配列で指定してください");
  if (value.length > RECORD_PALLET_KEY_LIMIT) {
    throw new Error(label + "は" + RECORD_PALLET_KEY_LIMIT + "件までです");
  }

  const keys = value.map((item, index) => {
    if (typeof item !== "string" || item.length > 16) {
      throw new Error(label + (index + 1) + "の形式が正しくありません");
    }
    const match = item.trim().match(/^(\d+)-([A-F])-(\d+)$/);
    if (!match) throw new Error(label + (index + 1) + "の形式が正しくありません");
    const building = Number(match[1]);
    const bed = match[2];
    const number = Number(match[3]);
    if (!HARVEST_BUILDINGS.includes(building) || !HARVEST_BEDS.includes(bed) ||
      !Number.isInteger(number) || number < 1 || number > PALLETS_PER_BED) {
      throw new Error(label + (index + 1) + "が範囲外です");
    }
    return building + "-" + bed + "-" + number;
  });
  return Array.from(new Set(keys));
}

function normalizeMonitorPalletKeys(value, label) {
  if (value === null || typeof value === "undefined") return [];
  if (!Array.isArray(value)) throw new Error(label + "は配列で指定してください");
  if (value.length > RECORD_PALLET_KEY_LIMIT) {
    throw new Error(label + "は" + RECORD_PALLET_KEY_LIMIT + "件までです");
  }

  const keys = value.map((item, index) => {
    if (typeof item !== "string" || item.length > 24) {
      throw new Error(label + (index + 1) + "の形式が正しくありません");
    }
    const match = item.trim().match(/^(\d+)-([A-F])-(\d+)(?:-(\d+))?$/);
    if (!match) throw new Error(label + (index + 1) + "の形式が正しくありません");
    const building = Number(match[1]);
    const bed = match[2];
    const start = Number(match[3]);
    const end = typeof match[4] === "undefined" ? start : Number(match[4]);
    if (!HARVEST_BUILDINGS.includes(building) || !HARVEST_BEDS.includes(bed) ||
      !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > PALLETS_PER_BED || start > end) {
      throw new Error(label + (index + 1) + "が範囲外です");
    }
    return building + "-" + bed + "-" + start + (end === start ? "" : "-" + end);
  });
  return Array.from(new Set(keys));
}

function normalizeQualityMemoInput(value) {
  if (value === null || typeof value === "undefined" || value === "") return null;
  if (typeof value === "string") {
    return { tags: [], other: normalizeOptionalText(value, "品質メモ", RECORD_QUALITY_LENGTH_LIMIT, false) };
  }
  if (!isPlainObject(value)) throw new Error("品質メモの形式が正しくありません");

  const rawTags = typeof value.tags === "undefined" ? [] : value.tags;
  if (!Array.isArray(rawTags) || rawTags.length > QUALITY_TAGS.length) {
    throw new Error("品質タグの形式が正しくありません");
  }
  const tags = rawTags.map(tag => normalizeQualityTagInput(tag));
  const other = normalizeOptionalText(
    value.other,
    "品質メモ",
    RECORD_QUALITY_LENGTH_LIMIT,
    false
  );
  return { tags: Array.from(new Set(tags)), other };
}

function normalizePlantingQualityMemoInput(value) {
  if (value === null || typeof value === "undefined" || String(value).trim() === "") return null;
  if (typeof value === "string") {
    const aliases = { "大きい": "large", "小さい": "small", "徒長": "elongated", "チップ": "chip" };
    const tags = [];
    const otherParts = [];
    value.split(/[,、|\n]+/).map(item => item.trim()).filter(Boolean).forEach(item => {
      const tag = aliases[item] || (QUALITY_TAGS.includes(item) ? item : "");
      if (tag) tags.push(tag);
      else if (item !== "-" && item !== "不明") otherParts.push(item);
    });
    if (!tags.length && !otherParts.length) return null;
    return normalizeQualityMemoInput({ tags, other: otherParts.join("、") });
  }
  const qualityMemo = normalizeQualityMemoInput(value);
  return qualityMemo && (qualityMemo.tags.length || qualityMemo.other) ? qualityMemo : null;
}

function normalizeQualityTagInput(value) {
  if (typeof value !== "string") throw new Error("品質タグの形式が正しくありません");
  const aliases = { "大きい": "large", "小さい": "small", "徒長": "elongated", "チップ": "chip" };
  const tag = aliases[value.trim()] || value.trim();
  if (!QUALITY_TAGS.includes(tag)) throw new Error("許可されていない品質タグです");
  return tag;
}

function normalizePlantingAgeInput(value) {
  if (value === null || typeof value === "undefined" || value === "") return null;
  if (typeof value === "string") {
    return normalizeRequiredText(value, "定植日数", PLANTING_AGE_DETAIL_LENGTH_LIMIT, false);
  }
  if (!isPlainObject(value)) throw new Error("定植日数の形式が正しくありません");

  let building = "";
  if (value.building !== null && typeof value.building !== "undefined" && String(value.building).trim() !== "") {
    building = normalizeRequiredInteger(value.building, "定植日数の号棟", 2, 9);
    if (!HARVEST_BUILDINGS.includes(building)) throw new Error("定植日数の号棟が範囲外です");
  }
  const summary = normalizeOptionalText(
    value.summary,
    "定植日数の概要",
    PLANTING_AGE_SUMMARY_LENGTH_LIMIT,
    false
  );
  const detail = normalizeOptionalText(
    value.detail,
    "定植日数の詳細",
    PLANTING_AGE_DETAIL_LENGTH_LIMIT,
    false
  );
  if (!summary.trim() && !detail.trim()) return null;
  return { building, summary, detail };
}

function normalizeOptionalSizeRating(value) {
  if (value === null || typeof value === "undefined" || value === "") return "unknown";
  return normalizeRequiredEnum(
    value,
    "大きさ",
    ["unknown", "normal", "large", "small", "不明", "並", "大きい", "小さい"]
  );
}

function normalizeOptionalCarryoverMode(value) {
  if (value === null || typeof value === "undefined" || value === "") return "loss";
  return normalizeRequiredEnum(value, "苗の繰越状態", ["loss", "carryover"]);
}

function normalizePlantingEventDetailsUnknown(value) {
  if (value === null || typeof value === "undefined" || value === "") return false;
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const text = String(value).trim().toLowerCase();
  if (["true", "1", "不明"].includes(text)) return true;
  if (["false", "0", "既知"].includes(text)) return false;
  throw new Error("苗数量情報の形式が正しくありません");
}

function formatValidatedPartialHarvestSummary(targets) {
  return targets.map(target => (
    target.building + "号棟 " + target.bed + "ベッド " + target.start + "〜" + target.end +
    ": 各" + target.plantsPerPallet + "株"
  )).join("\n");
}

function normalizeRequiredEnum(value, label, allowedValues) {
  if (typeof value !== "string") throw new Error(label + "の形式が正しくありません");
  const normalized = value.trim();
  if (!allowedValues.includes(normalized)) throw new Error(label + "が許可された値ではありません");
  return normalized;
}

function normalizeRequiredInteger(value, label, min, max) {
  const number = parseStrictNumber(value, label, true);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new Error(label + "が範囲外です");
  }
  return number;
}

function normalizeOptionalInteger(value, label, min, max, fallback) {
  if (value === null || typeof value === "undefined" || value === "") return fallback;
  return normalizeRequiredInteger(value, label, min, max);
}

function normalizeRequiredFiniteNumber(value, label, min, max) {
  const number = parseStrictNumber(value, label, false);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(label + "が範囲外です");
  }
  return number;
}

function normalizeOptionalFiniteNumber(value, label, min, max, fallback) {
  if (value === null || typeof value === "undefined" || value === "") return fallback;
  return normalizeRequiredFiniteNumber(value, label, min, max);
}

function parseStrictNumber(value, label, integerOnly) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(label + "の形式が正しくありません");
    return value;
  }
  if (typeof value !== "string") throw new Error(label + "の形式が正しくありません");
  const text = value.trim();
  const pattern = integerOnly ? /^\d+$/ : /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;
  if (!pattern.test(text)) throw new Error(label + "の形式が正しくありません");
  const number = Number(text);
  if (!Number.isFinite(number)) throw new Error(label + "の形式が正しくありません");
  return number;
}

function normalizeRequiredDate(value, label) {
  if (typeof value !== "string") throw new Error(label + "の形式が正しくありません");
  const text = value.trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(label + "はYYYY-MM-DD形式で指定してください");

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(label + "に実在しない日付が指定されています");
  }
  return text;
}

function normalizeOptionalDate(value, label) {
  if (value === null || typeof value === "undefined" || value === "") return "";
  return normalizeRequiredDate(value, label);
}

function normalizeRequiredText(value, label, maxLength, trim) {
  const text = normalizeOptionalText(value, label, maxLength, trim);
  if (!text) throw new Error(label + "がありません");
  return text;
}

function normalizeOptionalText(value, label, maxLength, trim) {
  if (value === null || typeof value === "undefined") return "";
  if (typeof value !== "string") throw new Error(label + "の形式が正しくありません");
  const text = trim ? value.trim() : value;
  if (text.length > maxLength) throw new Error(label + "が長すぎます");
  if (text.includes("\u0000")) throw new Error(label + "に使用できない文字が含まれています");
  return text;
}

function normalizeRecordListOptions(options) {
  if (!isPlainObject(options)) throw new Error("記録一覧の条件が正しくありません");
  if (typeof options.syncMode !== "undefined" && typeof options.syncMode !== "boolean") {
    throw new Error("同期モードの形式が正しくありません");
  }
  const cursor = normalizeHarvestRecordSyncCursor(options.cursor);
  return {
    recentDays: normalizeOptionalInteger(
      options.recentDays,
      "参照日数",
      0,
      RECORD_LIST_RECENT_DAYS_LIMIT,
      0
    ),
    limit: normalizeOptionalInteger(options.limit, "取得件数", 1, RECORD_LIST_LIMIT, 0),
    syncMode: options.syncMode === true || cursor !== null,
    cursor
  };
}

function normalizeHarvestRecordSyncCursor(value) {
  if (value === null || typeof value === "undefined" || value === "") return null;
  if (!isPlainObject(value)) throw new Error("同期カーソルの形式が正しくありません");
  const updatedAt = normalizeOptionalTimestamp(value.updatedAt, "同期カーソルの更新日時");
  const recordUuid = normalizeOptionalRecordUuid(value.recordUuid);
  if (!updatedAt || !recordUuid) throw new Error("同期カーソルの識別情報がありません");
  return { updatedAt, recordUuid };
}

function normalizePlantingEventListOptions(options) {
  if (!isPlainObject(options)) throw new Error("苗植えイベント一覧の条件が正しくありません");
  if (typeof options.syncMode !== "undefined" && typeof options.syncMode !== "boolean") {
    throw new Error("苗植えイベント同期モードの形式が正しくありません");
  }
  const cursor = normalizePlantingEventSyncCursor(options.cursor);
  return {
    recentDays: normalizeOptionalInteger(
      options.recentDays,
      "苗植えイベントの参照日数",
      0,
      RECORD_LIST_RECENT_DAYS_LIMIT,
      0
    ),
    limit: normalizeOptionalInteger(
      options.limit,
      "苗植えイベントの取得件数",
      1,
      PLANTING_EVENT_LIST_LIMIT,
      0
    ),
    fallbackSeedlingLossRate: normalizeOptionalFiniteNumber(
      options.fallbackSeedlingLossRate,
      "苗ロス率の補完値",
      0,
      100,
      0
    ),
    fallbackSeedlingPattern: normalizePlantingEventFallbackSeedlingPattern(
      options.fallbackSeedlingPattern
    ),
    fallbackPlantingCountsByBed: normalizePlantingEventFallbackCountsByBed(
      options.fallbackPlantingCountsByBed
    ),
    syncMode: options.syncMode === true || cursor !== null,
    cursor
  };
}

function normalizePlantingEventSyncCursor(value) {
  if (value === null || typeof value === "undefined" || value === "") return null;
  if (!isPlainObject(value)) throw new Error("苗植えイベント同期カーソルの形式が正しくありません");
  const updatedAt = normalizeOptionalTimestamp(value.updatedAt, "苗植えイベント同期カーソルの更新日時");
  const eventId = normalizeOptionalInteger(
    value.eventId,
    "苗植えイベント同期カーソルのイベントID",
    1,
    Number.MAX_SAFE_INTEGER,
    null
  );
  if (!updatedAt || eventId === null) throw new Error("苗植えイベント同期カーソルの識別情報がありません");
  return { updatedAt, eventId };
}

function normalizePlantingEventFallbackSeedlingPattern(value) {
  if (value === null || typeof value === "undefined") return [120, 120, 120];
  if (!Array.isArray(value) || !value.length || value.length > 10) {
    throw new Error("苗枚数換算パターンが正しくありません");
  }
  return value.map((item, index) => normalizeRequiredInteger(
    item,
    "苗枚数換算パターン" + (index + 1),
    0,
    PLANTING_EVENT_SEEDLING_COUNT_LIMIT
  ));
}

function normalizePlantingEventFallbackCountsByBed(value) {
  const defaults = {};
  HARVEST_BEDS.forEach(bed => {
    defaults[bed] = Array(PALLETS_PER_BED).fill(20);
  });
  if (value === null || typeof value === "undefined") return defaults;
  if (!isPlainObject(value)) throw new Error("苗植え株数の補完設定が正しくありません");
  const normalized = {};
  HARVEST_BEDS.forEach(bed => {
    const counts = value[bed];
    if (!Array.isArray(counts) || counts.length !== PALLETS_PER_BED) {
      throw new Error(bed + "ベッドの苗植え株数の補完設定が正しくありません");
    }
    normalized[bed] = counts.map((item, index) => normalizeRequiredInteger(
      item,
      bed + "ベッド" + (index + 1) + "番の苗植え株数",
      0,
      PLANTING_EVENT_SEEDLING_COUNT_LIMIT
    ));
  });
  return normalized;
}

function normalizeMonitorHistoryOptions(options) {
  if (!isPlainObject(options)) throw new Error("履歴の条件が正しくありません");
  return {
    limit: normalizeOptionalInteger(options.limit, "履歴の取得件数", 1, MONITOR_HISTORY_LIMIT, 50)
  };
}

function normalizeMonitorContentInput(content) {
  if (!isPlainObject(content)) throw new Error("モニター内容の形式が正しくありません");
  if (Object.prototype.hasOwnProperty.call(content, "palletRanges")) {
    throw new Error("モニターの収穫場所はharvestFillKeysで指定してください");
  }
  const normalized = {};

  const hasVersion = content.version !== null && typeof content.version !== "undefined" && !(
    typeof content.version === "string" && content.version.trim() === ""
  );
  if (hasVersion) {
    normalizeRequiredInteger(content.version, "モニターの更新番号", 0, Number.MAX_SAFE_INTEGER);
  }
  if (typeof content.updatedAt !== "undefined" && content.updatedAt !== null) {
    normalizeOptionalText(content.updatedAt, "モニターの更新日時", 64, true);
  }

  if (Object.prototype.hasOwnProperty.call(content, "enabled")) {
    normalized.enabled = normalizeMonitorEnabledInput(content.enabled);
  }
  if (Object.prototype.hasOwnProperty.call(content, "instructionText")) {
    normalized.instructionText = normalizeOptionalText(
      content.instructionText,
      "モニターの指示内容",
      MONITOR_INSTRUCTION_LENGTH_LIMIT,
      false
    );
  }

  const hasMemoItems = Object.prototype.hasOwnProperty.call(content, "memoItems");
  const hasMemoText = Object.prototype.hasOwnProperty.call(content, "memoText");
  if (hasMemoItems || hasMemoText) {
    const memoItems = normalizeMonitorMemoItemsInput(content.memoItems);
    if (memoItems.join("\n\n").length > MONITOR_MEMO_LENGTH_LIMIT) {
      throw new Error("モニターのメモ項目全体が長すぎます");
    }
    normalized.memoText = normalizeOptionalText(
      !hasMemoText && memoItems.length ? memoItems.join("\n\n") : content.memoText,
      "モニターのメモ",
      MONITOR_MEMO_LENGTH_LIMIT,
      false
    );
    if (hasMemoItems) normalized.memoItems = memoItems;
  }

  if (Object.prototype.hasOwnProperty.call(content, "harvestFillKeys")) {
    normalized.harvestFillKeys = normalizeMonitorPalletKeys(
      content.harvestFillKeys,
      "モニターの収穫場所"
    );
    if (normalized.harvestFillKeys.length > RECORD_PALLET_KEY_LIMIT) {
      throw new Error("モニターの収穫場所は" + RECORD_PALLET_KEY_LIMIT + "件までです");
    }
  }
  return normalized;
}

function normalizeMonitorMemoItemsInput(value) {
  if (value === null || typeof value === "undefined") return [];
  if (!Array.isArray(value)) throw new Error("モニターのメモ項目は配列で指定してください");
  if (value.length > MONITOR_MEMO_ITEM_LIMIT) {
    throw new Error("モニターのメモ項目は" + MONITOR_MEMO_ITEM_LIMIT + "件までです");
  }
  return value.map((item, index) => {
    if (typeof item !== "string") {
      throw new Error("モニターのメモ項目" + (index + 1) + "の形式が正しくありません");
    }
    return normalizeOptionalText(
      item,
      "モニターのメモ項目" + (index + 1),
      MONITOR_MEMO_ITEM_LENGTH_LIMIT,
      false
    );
  });
}

function normalizeMonitorEnabledInput(value) {
  if (typeof value === "undefined" || value === null || value === "") return false;
  if (value === true || value === false) return value;
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error("モニターの有効状態が正しくありません");
  }
  const text = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on", "有効", "使う"].includes(text)) return true;
  if (["false", "0", "no", "off", "無効", "使わない"].includes(text)) return false;
  throw new Error("モニターの有効状態が正しくありません");
}

function escapeSpreadsheetFormulaText(value) {
  const text = String(value == null ? "" : value);
  return /^[\s\uFEFF]*[=+\-@]/.test(text) ? "'" + text : text;
}

function normalizeWriteTimestampToken(value) {
  if (value === null || typeof value === "undefined" || value === "") return "";
  const time = Object.prototype.toString.call(value) === "[object Date]"
    ? value.getTime()
    : new Date(String(value).trim()).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
}

function isCommittedWriteTimestamp(value) {
  return !!normalizeWriteTimestampToken(value);
}

function makeWriteContentHash(signature) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(signature || ""),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, "");
}

function parseWriteMarker(value, prefix) {
  const text = String(value == null ? "" : value).trim();
  if (!text.startsWith(prefix)) return null;
  try {
    const marker = JSON.parse(text.slice(prefix.length));
    return isPlainObject(marker) && Number(marker.v) === 1 ? marker : null;
  } catch (err) {
    return null;
  }
}

function getHarvestWriteProvidedFieldMask(suppliedSyncFields) {
  const supplied = suppliedSyncFields || {};
  return RECORD_SYNC_PRESERVED_FIELD_KEYS.filter(key => !!supplied[key]);
}

function buildHarvestWriteMarker(
  requestRecord,
  canonicalRecord,
  suppliedSyncFields,
  operation
) {
  const request = requestRecord || canonicalRecord || {};
  const canonical = canonicalRecord || request;
  return HARVEST_WRITE_MARKER_PREFIX + JSON.stringify({
    v: 1,
    operation: String(operation || "save"),
    requestUuid: String(request.recordUuid || "").trim().toLowerCase(),
    requestId: String(request.id == null ? "" : request.id).trim(),
    canonicalUuid: String(canonical.recordUuid || "").trim().toLowerCase(),
    canonicalId: String(canonical.id == null ? "" : canonical.id).trim(),
    baseUpdatedAt: normalizeWriteTimestampToken(request.updatedAt),
    contentHash: makeWriteContentHash(getHarvestRecordContentSignature(request)),
    providedFields: getHarvestWriteProvidedFieldMask(suppliedSyncFields)
  });
}

function buildPlantingWriteMarker(requestEvent, operation) {
  const request = requestEvent || {};
  return PLANTING_WRITE_MARKER_PREFIX + JSON.stringify({
    v: 1,
    operation: String(operation || "save"),
    eventId: String(request.eventId == null ? "" : request.eventId).trim(),
    baseUpdatedAt: normalizeWriteTimestampToken(request.updatedAt),
    contentHash: makeWriteContentHash(getPlantingEventContentSignature(request))
  });
}

function getHarvestWriteMarker(headers, row) {
  const column = getHeaderColumn(headers, "receivedAt");
  if (column <= 0 || !Array.isArray(row)) return null;
  return parseWriteMarker(row[column - 1], HARVEST_WRITE_MARKER_PREFIX);
}

function getPlantingWriteMarker(headers, row) {
  const column = getPlantingEventHeaderColumn(headers, "updatedAt");
  if (column <= 0 || !Array.isArray(row)) return null;
  return parseWriteMarker(row[column - 1], PLANTING_WRITE_MARKER_PREFIX);
}

function isCommittedHarvestRecordRow(headers, row) {
  const column = getHeaderColumn(headers, "receivedAt");
  return column <= 0 || (Array.isArray(row) && isCommittedWriteTimestamp(row[column - 1]));
}

function isCommittedPlantingEventRow(headers, row) {
  const column = getPlantingEventHeaderColumn(headers, "updatedAt");
  return column <= 0 || (Array.isArray(row) && isCommittedWriteTimestamp(row[column - 1]));
}

function harvestWriteMarkerMatchesRequest(marker, record, suppliedSyncFields, operation) {
  if (!marker || !record) return false;
  const requestUuid = String(record.recordUuid || "").trim().toLowerCase();
  const requestId = String(record.id == null ? "" : record.id).trim();
  const markerUuid = String(marker.requestUuid || "").trim().toLowerCase();
  const requestedOperation = String(operation || "save");
  const identityMatches = requestUuid
    ? markerUuid === requestUuid
    : (!markerUuid && String(marker.requestId || "").trim() === requestId);
  return identityMatches &&
    (requestedOperation === "any" ||
      String(marker.operation || "save") === requestedOperation) &&
    String(marker.baseUpdatedAt || "") === normalizeWriteTimestampToken(record.updatedAt) &&
    String(marker.contentHash || "") ===
      makeWriteContentHash(getHarvestRecordContentSignature(record)) &&
    JSON.stringify(Array.isArray(marker.providedFields) ? marker.providedFields : []) ===
      JSON.stringify(getHarvestWriteProvidedFieldMask(suppliedSyncFields));
}

function plantingWriteMarkerMatchesRequest(marker, event, operation) {
  const requestedOperation = String(operation || "save");
  if (!marker || !event) return false;
  return String(marker.eventId || "").trim() ===
      String(event.eventId == null ? "" : event.eventId).trim() &&
    (requestedOperation === "any" ||
      String(marker.operation || "save") === requestedOperation) &&
    String(marker.baseUpdatedAt || "") === normalizeWriteTimestampToken(event.updatedAt) &&
    String(marker.contentHash || "") ===
      makeWriteContentHash(getPlantingEventContentSignature(event));
}

function findHarvestIncompleteWriteForRequest(
  sheet,
  headers,
  record,
  suppliedSyncFields,
  operation,
  sourceRows
) {
  if (!sheet) return null;
  const rows = Array.isArray(sourceRows)
    ? sourceRows
    : readHarvestRecordRows(sheet, headers);
  if (!rows.length) return null;
  const requestUuid = String(record && record.recordUuid || "").trim().toLowerCase();
  const matches = [];
  rows.forEach((row, index) => {
    const marker = getHarvestWriteMarker(headers, row);
    if (!marker) return;
    const markerRequestUuid = String(marker.requestUuid || "").trim().toLowerCase();
    const sameIdentity = markerRequestUuid === requestUuid;
    if (sameIdentity) matches.push({ row, marker, rowNumber: index + 2 });
  });
  if (!matches.length) return null;
  if (matches.length > 1) {
    throw new Error("同じ収穫記録の未完了行が複数あります。データ保護のため再送を中止しました");
  }
  const match = matches[0];
  if (!harvestWriteMarkerMatchesRequest(
    match.marker,
    record,
    suppliedSyncFields,
    operation
  )) {
    throw new Error("同じ収穫記録で別内容の未完了送信があります。記録を同期してから再送してください");
  }

  const uuidColumn = getHeaderColumn(headers, "recordUuid");
  const idColumn = getHeaderColumn(headers, "id");
  const rowUuid = uuidColumn > 0
    ? String(match.row[uuidColumn - 1] || "").trim().toLowerCase()
    : "";
  const rowId = idColumn > 0
    ? String(match.row[idColumn - 1] == null ? "" : match.row[idColumn - 1]).trim()
    : "";
  const canonicalUuid = String(match.marker.canonicalUuid || "").trim().toLowerCase();
  const canonicalId = String(match.marker.canonicalId || "").trim();
  if ((rowUuid && rowUuid !== canonicalUuid) || (rowId && rowId !== canonicalId)) {
    throw new Error("収穫記録の未完了行でIDまたはUUIDが競合しています");
  }

  rows.forEach((row, index) => {
    if (index + 2 === match.rowNumber) return;
    const otherMarker = getHarvestWriteMarker(headers, row);
    const otherUuid = uuidColumn > 0
      ? String(row[uuidColumn - 1] || "").trim().toLowerCase()
      : "";
    const otherId = idColumn > 0
      ? String(row[idColumn - 1] == null ? "" : row[idColumn - 1]).trim()
      : "";
    const otherMarkerId = otherMarker
      ? String(otherMarker.canonicalId == null ? "" : otherMarker.canonicalId).trim()
      : "";
    const markerUuids = otherMarker
      ? [otherMarker.requestUuid, otherMarker.canonicalUuid]
        .map(value => String(value || "").trim().toLowerCase())
        .filter(Boolean)
      : [];
    if (canonicalUuid && (otherUuid === canonicalUuid || markerUuids.includes(canonicalUuid))) {
      throw new Error("記録シートに同じ記録UUIDが重複しています");
    }
    if (canonicalId && (otherId === canonicalId || otherMarkerId === canonicalId)) {
      throw new Error("記録シートに同じ記録IDが重複しています: " + canonicalId);
    }
  });
  return match;
}

function assertNoUnclaimedHarvestIdentityConflict(sheet, headers, record, sourceRows) {
  if (!sheet) return;
  const requestUuid = String(record && record.recordUuid || "").trim().toLowerCase();
  const requestId = String(!record || record.id == null ? "" : record.id).trim();
  const uuidColumn = getHeaderColumn(headers, "recordUuid");
  const idColumn = getHeaderColumn(headers, "id");
  const rows = Array.isArray(sourceRows)
    ? sourceRows
    : readHarvestRecordRows(sheet, headers);
  if (!rows.length) return;
  const conflicts = rows.filter(row => {
    if (isCommittedHarvestRecordRow(headers, row)) return false;
    const marker = getHarvestWriteMarker(headers, row);
    const rowUuid = uuidColumn > 0
      ? String(row[uuidColumn - 1] || "").trim().toLowerCase()
      : "";
    const rowId = idColumn > 0
      ? String(row[idColumn - 1] == null ? "" : row[idColumn - 1]).trim()
      : "";
    const markerUuids = marker
      ? [marker.requestUuid, marker.canonicalUuid]
        .map(value => String(value || "").trim().toLowerCase())
        .filter(Boolean)
      : [];
    const markerIds = marker
      ? [marker.requestId, marker.canonicalId]
        .map(value => String(value == null ? "" : value).trim())
        .filter(Boolean)
      : [];
    return requestUuid
      ? rowUuid === requestUuid || markerUuids.includes(requestUuid)
      : (!!requestId && (rowId === requestId || markerIds.includes(requestId)));
  });
  if (conflicts.length) {
    throw new Error(
      "同じIDまたはUUIDの未完了収穫記録があります。別内容での上書きを防ぐため再送を中止しました"
    );
  }
}

function buildCanonicalHarvestRecordFromIncompleteWrite(
  sheet,
  headers,
  recovery,
  record,
  suppliedSyncFields,
  plantingAllocatedKeysByHarvest,
  sourceRow
) {
  const recordToWrite = mergeOmittedSyncFieldsFromExistingRow(
    sheet,
    recovery.rowNumber,
    headers,
    record,
    suppliedSyncFields,
    sourceRow
  );
  const storedRecord = rowToRecord(headers, recovery.row);
  const canonicalId = normalizeRequiredInteger(
    recovery.marker.canonicalId,
    "記録ID",
    1,
    Number.MAX_SAFE_INTEGER
  );
  const canonicalUuid = normalizeOptionalRecordUuid(recovery.marker.canonicalUuid);
  if (!canonicalUuid) throw new Error("収穫記録の未完了行に記録UUIDがありません");
  const previousCandidates = [
    normalizeWriteTimestampToken(storedRecord.updatedAt),
    normalizeWriteTimestampToken(recovery.marker.baseUpdatedAt)
  ].filter(Boolean).sort();
  const previousUpdatedAt = previousCandidates[previousCandidates.length - 1] || "";
  const updatedAt = getNextHarvestRecordUpdatedAt(previousUpdatedAt);
  const canonicalRecord = applyPlantingLocationSummaryToHarvestRecord({
    ...recordToWrite,
    id: canonicalId,
    recordUuid: canonicalUuid,
    createdAt: storedRecord.createdAt || record.createdAt || new Date().toISOString(),
    updatedAt
  }, plantingAllocatedKeysByHarvest);
  assertHarvestRecordSupportsPlantingEvents(
    canonicalRecord,
    plantingAllocatedKeysByHarvest
  );
  return canonicalRecord;
}

function recoverIncompleteHarvestRecordWrite(
  sheet,
  headers,
  recovery,
  record,
  suppliedSyncFields,
  duplicateKey,
  plantingAllocatedKeysByHarvest,
  sourceRow
) {
  const canonicalRecord = buildCanonicalHarvestRecordFromIncompleteWrite(
    sheet,
    headers,
    recovery,
    record,
    suppliedSyncFields,
    plantingAllocatedKeysByHarvest,
    sourceRow
  );
  writeRecordRow(
    sheet,
    recovery.rowNumber,
    headers,
    canonicalRecord,
    duplicateKey,
    new Date(canonicalRecord.updatedAt),
    record,
    suppliedSyncFields,
    String(recovery.marker.operation || "save")
  );
  if (Array.isArray(sourceRow)) return canonicalRecord;
  return getHarvestRecordAtRow(sheet, recovery.rowNumber, headers);
}

function withRecordLock(operation, flushBeforeRelease) {
  let lock;
  try {
    lock = LockService.getScriptLock();
    lock.waitLock(10000);
  } catch (err) {
    throw new Error("同期処理のロック取得に失敗しました: " + String(err && err.message || err));
  }

  try {
    const result = operation();
    if (flushBeforeRelease) {
      try {
        SpreadsheetApp.flush();
      } catch (err) {
        throw new Error("スプレッドシートへの反映に失敗しました: " + String(err && err.message || err));
      }
    }
    return result;
  } finally {
    try {
      if (lock) lock.releaseLock();
    } catch (err) {
      // 保存完了後のロック解放だけが失敗しても、保存自体を失敗扱いにしない。
      console.warn("同期ロックの解放に失敗しました: " + String(err && err.message || err));
    }
  }
}

function withRecordWriteLock(operation) {
  return withRecordLock(operation, true);
}

function withRecordReadLock(operation) {
  return withRecordLock(operation, false);
}

function saveHarvestRecord(record, outerDuplicateKey) {
  const suppliedSyncFields = getSuppliedRecordSyncFields(record);
  const normalizedRecord = normalizeHarvestRecord(record);
  const normalizedOuterKey = normalizeOptionalText(
    outerDuplicateKey,
    "重複判定キー",
    RECORD_DUPLICATE_KEY_LENGTH_LIMIT,
    true
  );
  if (normalizedOuterKey && normalizedOuterKey !== normalizedRecord.duplicateKey) {
    throw new Error("重複判定キーが記録内容と一致しません");
  }
  return withRecordWriteLock(() => (
    saveHarvestRecordUnlocked(normalizedRecord, normalizedOuterKey, suppliedSyncFields)
  ));
}

function saveHarvestRecordUnlocked(record, outerDuplicateKey, suppliedSyncFields) {
  const sheet = getRecordSheet();
  const headers = ensureHeaders(sheet);
  assertNoUnrepairedDirectHarvestRows(headers, readHarvestRecordRows(sheet, headers));
  const trashSheet = getRecordTrashSheet();
  const deletedRecordState = prepareDeletedHarvestRecordState(trashSheet);
  const deletedRecordIdentities = deletedRecordState.identities;
  const plantingAllocatedKeysByHarvest = record.type === "fullHarvest"
    ? buildPlantingEventAllocatedKeysByHarvestRecord()
    : new Map();
  assertRecordIsNotDeleted(record, deletedRecordIdentities);
  const duplicateKey = String(makeDuplicateKey(record) || record.duplicateKey || outerDuplicateKey || "").trim();

  if (!duplicateKey) {
    throw new Error("duplicateKeyがありません。アプリ側を最新版にしてください。");
  }

  const incompleteWrite = findHarvestIncompleteWriteForRequest(
    sheet,
    headers,
    record,
    suppliedSyncFields
  );
  if (incompleteWrite) {
    const recoveredRecord = recoverIncompleteHarvestRecordWrite(
      sheet,
      headers,
      incompleteWrite,
      record,
      suppliedSyncFields,
      duplicateKey,
      plantingAllocatedKeysByHarvest
    );
    return {
      duplicate: false,
      updated: !!record.updatedAt,
      recovered: true,
      record: recoveredRecord
    };
  }

  const existingRowNumber = findHarvestRecordRowForMutation(sheet, headers, record);
  if (existingRowNumber > 0) {
    const existingRecord = getHarvestRecordAtRow(sheet, existingRowNumber, headers);
    const recordToWrite = mergeOmittedSyncFieldsFromExistingRow(
      sheet,
      existingRowNumber,
      headers,
      record,
      suppliedSyncFields
    );
    const recordWithIdentity = applyPlantingLocationSummaryToHarvestRecord({
      ...recordToWrite,
      id: existingRecord.id,
      recordUuid: existingRecord.recordUuid || record.recordUuid || Utilities.getUuid().toLowerCase(),
      createdAt: existingRecord.createdAt || record.createdAt || new Date().toISOString()
    }, plantingAllocatedKeysByHarvest);
    assertHarvestRecordSupportsPlantingEvents(recordWithIdentity, plantingAllocatedKeysByHarvest);
    const sameContent = getHarvestRecordContentSignature(recordWithIdentity) ===
      getHarvestRecordContentSignature(existingRecord);
    if (sameContent) {
      return { duplicate: true, updated: true, unchanged: true, record: existingRecord };
    }
    if (!record.updatedAt || !existingRecord.updatedAt || record.updatedAt !== existingRecord.updatedAt) {
      throw new Error("この収穫記録は別の端末で更新されています。最新記録を読み込んでから編集してください");
    }
    const updatedAt = getNextHarvestRecordUpdatedAt(existingRecord.updatedAt);
    const canonicalRecord = {
      ...recordWithIdentity,
      updatedAt
    };
    writeRecordRow(
      sheet,
      existingRowNumber,
      headers,
      canonicalRecord,
      duplicateKey,
      new Date(updatedAt),
      record,
      suppliedSyncFields
    );
    return {
      duplicate: false,
      updated: true,
      record: getHarvestRecordAtRow(sheet, existingRowNumber, headers)
    };
  }

  assertNoUnclaimedHarvestIdentityConflict(sheet, headers, record);

  const duplicateRowNumber = record.recordUuid
    ? 0
    : findDuplicateRecordRow(sheet, headers, duplicateKey, record);
  if (duplicateRowNumber > 0) {
    return {
      duplicate: true,
      updated: false,
      record: getHarvestRecordAtRow(sheet, duplicateRowNumber, headers)
    };
  }

  const now = new Date().toISOString();
  const canonicalId = record.recordUuid
    ? allocateHarvestRecordId(
        record.id,
        getUnavailableHarvestRecordIdSet(sheet, headers, deletedRecordIdentities)
      )
    : record.id;
  const canonicalRecord = applyPlantingLocationSummaryToHarvestRecord({
    ...record,
    id: canonicalId,
    recordUuid: record.recordUuid || Utilities.getUuid().toLowerCase(),
    createdAt: record.createdAt || now,
    updatedAt: now
  }, plantingAllocatedKeysByHarvest);
  assertHarvestRecordSupportsPlantingEvents(canonicalRecord, plantingAllocatedKeysByHarvest);
  appendRecordRow(
    sheet,
    headers,
    canonicalRecord,
    duplicateKey,
    new Date(now),
    record,
    suppliedSyncFields
  );
  const appendedRowNumber = findRecordRowByUuid(sheet, headers, canonicalRecord.recordUuid);
  return {
    duplicate: false,
    updated: false,
    record: appendedRowNumber > 0
      ? getHarvestRecordAtRow(sheet, appendedRowNumber, headers)
      : canonicalRecord
  };
}

function getHarvestRecordContentSignature(record) {
  const parseKeys = (value, label) => {
    if (Array.isArray(value)) return value;
    return parseStoredJsonArray(value, label);
  };
  return JSON.stringify({
    type: String(record && record.type || ""),
    date: formatDateValue(record && record.date),
    cases: Number(record && record.cases || 0),
    palletSummary: String(record && record.palletSummary || ""),
    plannedSeedlingTrayCount: Number(record && record.plannedSeedlingTrayCount || 0),
    plantingCaseInstruction: String(record && record.plantingCaseInstruction || ""),
    plantingSummary: String(record && record.plantingSummary || ""),
    plantingDate: formatDateValue(record && record.plantingDate),
    actualSeedlingTrayCount: Number(record && record.actualSeedlingTrayCount || 0),
    actualSeedlingCarryoverMode: String(record && record.actualSeedlingCarryoverMode || "loss"),
    actualSeedlingLossRate: String(record && record.actualSeedlingLossRate == null ? "" : record.actualSeedlingLossRate),
    actualLoss: String(record && record.actualLoss == null ? "" : record.actualLoss),
    qualityText: String(formatQualityTextValue(record || {})),
    sizeRating: String(formatSizeRatingValue(record && record.sizeRating)),
    plantingAge: String(formatPlantingAgeValue(record && record.plantingAge)),
    memo: String(record && record.memo || ""),
    palletKeys: parseKeys(record && record.palletKeys, "収穫パレット"),
    plantingPalletKeys: parseKeys(record && record.plantingPalletKeys, "苗植えパレット"),
    targets: parseKeys(record && record.targets, "先取り対象")
  });
}

function getNextHarvestRecordUpdatedAt(previousValue) {
  const previousTime = new Date(String(previousValue || "")).getTime();
  const now = Date.now();
  const nextTime = Number.isFinite(previousTime) ? Math.max(now, previousTime + 1) : now;
  return new Date(nextTime).toISOString();
}

function getSuppliedRecordSyncFields(record) {
  const source = isPlainObject(record) ? record : {};
  const supportsCurrentSchema = Number.isSafeInteger(source.syncSchemaVersion) &&
    source.syncSchemaVersion >= RECORD_SYNC_PROVIDED_FIELDS_MIN_VERSION;
  const providedFields = supportsCurrentSchema && Array.isArray(source.syncProvidedFields) &&
    source.syncProvidedFields.length <= RECORD_SYNC_PRESERVED_FIELD_KEYS.length
    ? new Set(source.syncProvidedFields.filter(key => RECORD_SYNC_PRESERVED_FIELD_KEYS.includes(key)))
    : new Set();
  const supplied = {};
  RECORD_SYNC_PRESERVED_FIELD_KEYS.forEach(key => {
    supplied[key] = providedFields.has(key) && Object.prototype.hasOwnProperty.call(source, key);
  });
  return supplied;
}

function mergeOmittedSyncFieldsFromExistingRecord(record, suppliedSyncFields, existingRecord) {
  if (!record || record.type !== "fullHarvest") return record;

  const supplied = suppliedSyncFields || {};
  const omittedKeys = RECORD_SYNC_PRESERVED_FIELD_KEYS.filter(key => !supplied[key]);
  if (!omittedKeys.length) return record;

  const mergedRecord = { ...record };

  omittedKeys.forEach(key => {
    if (key === "actualSeedlingCarryoverMode") {
      mergedRecord[key] = existingRecord[key] === "carryover"
        ? "carryover"
        : (record[key] === "carryover" ? "carryover" : "loss");
      return;
    }
    const existingText = String(existingRecord[key] == null ? "" : existingRecord[key]);
    mergedRecord[key] = existingText || String(record[key] == null ? "" : record[key]);
  });

  return mergedRecord;
}

function mergeOmittedSyncFieldsFromExistingRow(
  sheet,
  rowNumber,
  headers,
  record,
  suppliedSyncFields,
  sourceRow
) {
  if (!record || record.type !== "fullHarvest") return record;
  const existingRow = Array.isArray(sourceRow)
    ? sourceRow
    : sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  return mergeOmittedSyncFieldsFromExistingRecord(
    record,
    suppliedSyncFields,
    rowToRecord(headers, existingRow)
  );
}

function deleteHarvestRecord(record) {
  const suppliedSyncFields = getSuppliedRecordSyncFields(record);
  const normalizedRecord = normalizeHarvestRecord(record);
  return withRecordWriteLock(() => {
    const sheet = getRecordSheet();
    const headers = ensureHeaders(sheet);
    assertNoUnrepairedDirectHarvestRows(headers, readHarvestRecordRows(sheet, headers));
    const trashSheet = getRecordTrashSheet();
    prepareDeletedHarvestRecordState(trashSheet);

    const existingTrashRow = findTrashRecordRowForMutation(trashSheet, normalizedRecord);
    const incompleteWrite = findHarvestIncompleteWriteForRequest(
      sheet,
      headers,
      normalizedRecord,
      suppliedSyncFields,
      "any"
    );
    if (incompleteWrite) {
      const canonicalRecord = buildCanonicalHarvestRecordFromIncompleteWrite(
        sheet,
        headers,
        incompleteWrite,
        normalizedRecord,
        suppliedSyncFields
      );
      assertHarvestRecordHasNoPlantingEvents(canonicalRecord.id);
      const canonicalTrashRow = findTrashRecordRowForMutation(trashSheet, canonicalRecord);
      const savedTrashRow = existingTrashRow || canonicalTrashRow;
      let deletedAt;
      let expiresAt;
      if (savedTrashRow > 0) {
        const savedTrashValues = trashSheet
          .getRange(savedTrashRow, 1, 1, RECORD_TRASH_HEADERS.length)
          .getValues()[0];
        const savedDeletedAt = formatHarvestRecordTimestamp(savedTrashValues[HEADERS.length]);
        const savedExpiresAt = formatHarvestRecordTimestamp(savedTrashValues[HEADERS.length + 1]);
        deletedAt = new Date(savedDeletedAt || getNextHarvestRecordUpdatedAt(canonicalRecord.updatedAt));
        expiresAt = new Date(
          savedExpiresAt ||
          (deletedAt.getTime() + RECORD_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000)
        );
      } else {
        deletedAt = new Date(getNextHarvestRecordUpdatedAt(canonicalRecord.updatedAt));
        expiresAt = new Date(
          deletedAt.getTime() + RECORD_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000
        );
        const backupRow = buildRecordRow(
          HEADERS,
          canonicalRecord,
          canonicalRecord.duplicateKey || makeDuplicateKey(canonicalRecord),
          new Date(canonicalRecord.updatedAt)
        );
        trashSheet.appendRow(backupRow.concat([deletedAt, expiresAt]));
      }
      rememberDeletedHarvestRecord(canonicalRecord, deletedAt);
      SpreadsheetApp.flush();
      sheet.deleteRow(incompleteWrite.rowNumber);
      return {
        deleted: true,
        alreadyDeleted: savedTrashRow > 0,
        notFound: false,
        recoveredIncompleteWrite: true,
        record: canonicalRecord,
        deletedAt: deletedAt.toISOString(),
        expiresAt: expiresAt.toISOString()
      };
    }
    const rowNumber = findHarvestRecordRowForMutation(sheet, headers, normalizedRecord);
    if (existingTrashRow > 0 && rowNumber <= 0) {
      const deletedRow = trashSheet
        .getRange(existingTrashRow, 1, 1, RECORD_TRASH_HEADERS.length)
        .getValues()[0];
      const deletedRecord = rowToRecord(HEADERS, deletedRow.slice(0, HEADERS.length));
      const deletedAt = formatHarvestRecordTimestamp(deletedRow[HEADERS.length]);
      rememberDeletedHarvestRecord(deletedRecord, deletedAt);
      return {
        deleted: true,
        alreadyDeleted: true,
        notFound: false,
        record: deletedRecord,
        deletedAt
      };
    }

    if (rowNumber <= 0) {
      assertNoUnclaimedHarvestIdentityConflict(sheet, headers, normalizedRecord);
      const deletedAt = new Date().toISOString();
      rememberDeletedHarvestRecord(
        normalizedRecord.recordUuid
          ? { recordUuid: normalizedRecord.recordUuid, id: null }
          : normalizedRecord,
        deletedAt
      );
      return {
        deleted: true,
        alreadyDeleted: true,
        notFound: true,
        record: null,
        deletedAt
      };
    }
    const existingRecord = getHarvestRecordAtRow(sheet, rowNumber, headers);
    if (!normalizedRecord.updatedAt || !existingRecord.updatedAt ||
      normalizedRecord.updatedAt !== existingRecord.updatedAt) {
      throw new Error("この収穫記録は別の端末で更新されています。最新記録を読み込んでから削除してください");
    }
    assertHarvestRecordHasNoPlantingEvents(existingRecord.id);

    const sourceRow = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
    const row = remapRecordRow(headers, sourceRow, HEADERS);
    const safeRow = row.map((value, index) => (
      RECORD_FORMULA_SAFE_TEXT_KEYS.has(getHeaderKey(HEADERS[index]))
        ? escapeSpreadsheetFormulaText(value)
        : value
    ));
    const deletedAt = new Date(getNextHarvestRecordUpdatedAt(existingRecord.updatedAt));
    const expiresAt = new Date(deletedAt.getTime() + RECORD_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    deleteHarvestRecordTrashRows(trashSheet, existingRecord);
    trashSheet.appendRow(safeRow.concat([deletedAt, expiresAt]));
    rememberDeletedHarvestRecord(existingRecord, deletedAt);
    SpreadsheetApp.flush();
    sheet.deleteRow(rowNumber);
    return {
      deleted: true,
      alreadyDeleted: false,
      notFound: false,
      record: existingRecord,
      deletedAt: deletedAt.toISOString(),
      expiresAt: expiresAt.toISOString()
    };
  });
}

function completeIncompleteHarvestRestore(
  sheet,
  headers,
  trashSheet,
  recovery,
  normalizedRecord,
  suppliedSyncFields
) {
  const trashRow = findTrashRecordRowForMutation(trashSheet, normalizedRecord);
  let sourceRecord = normalizedRecord;
  let deletedAt = "";
  if (trashRow > 0) {
    const trashValues = trashSheet
      .getRange(trashRow, 1, 1, RECORD_TRASH_HEADERS.length)
      .getValues()[0];
    sourceRecord = rowToRecord(HEADERS, trashValues.slice(0, HEADERS.length));
    deletedAt = formatHarvestRecordTimestamp(trashValues[HEADERS.length]);
  }
  const partialRecord = rowToRecord(headers, recovery.row);
  const canonicalId = normalizeRequiredInteger(
    recovery.marker.canonicalId,
    "記録ID",
    1,
    Number.MAX_SAFE_INTEGER
  );
  const canonicalUuid = normalizeOptionalRecordUuid(recovery.marker.canonicalUuid);
  if (!canonicalUuid) throw new Error("復元途中の収穫記録に記録UUIDがありません");
  const previousUpdatedAt = [
    partialRecord.updatedAt,
    sourceRecord.updatedAt,
    normalizedRecord.updatedAt,
    deletedAt
  ]
    .map(normalizeWriteTimestampToken)
    .filter(Boolean)
    .sort()
    .pop() || "";
  const restoredRecord = {
    ...sourceRecord,
    id: canonicalId,
    recordUuid: canonicalUuid,
    createdAt: sourceRecord.createdAt || partialRecord.createdAt ||
      normalizedRecord.createdAt || new Date().toISOString(),
    updatedAt: getNextHarvestRecordUpdatedAt(previousUpdatedAt)
  };
  assertHarvestRecordSupportsPlantingEvents(restoredRecord);
  writeRecordRow(
    sheet,
    recovery.rowNumber,
    headers,
    restoredRecord,
    restoredRecord.duplicateKey || makeDuplicateKey(restoredRecord),
    new Date(restoredRecord.updatedAt),
    normalizedRecord,
    suppliedSyncFields,
    "restore"
  );
  SpreadsheetApp.flush();
  if (trashRow > 0) deleteHarvestRecordTrashRows(trashSheet, sourceRecord);
  forgetDeletedHarvestRecord(sourceRecord);
  forgetDeletedHarvestRecord(normalizedRecord);
  return {
    restored: true,
    alreadyRestored: false,
    recovered: true,
    restoredFromAppBackup: trashRow <= 0,
    record: getHarvestRecordAtRow(sheet, recovery.rowNumber, headers)
  };
}

function restoreHarvestRecord(record) {
  const suppliedSyncFields = getSuppliedRecordSyncFields(record);
  const normalizedRecord = normalizeHarvestRecord(record);
  return withRecordWriteLock(() => {
    const sheet = getRecordSheet();
    const headers = ensureHeaders(sheet);
    assertNoUnrepairedDirectHarvestRows(headers, readHarvestRecordRows(sheet, headers));
    const trashSheet = getRecordTrashSheet();
    prepareDeletedHarvestRecordState(trashSheet);

    const incompleteRestore = findHarvestIncompleteWriteForRequest(
      sheet,
      headers,
      normalizedRecord,
      suppliedSyncFields,
      "restore"
    );
    if (incompleteRestore) {
      return completeIncompleteHarvestRestore(
        sheet,
        headers,
        trashSheet,
        incompleteRestore,
        normalizedRecord,
        suppliedSyncFields
      );
    }

    const existingRow = findHarvestRecordRowForMutation(sheet, headers, normalizedRecord);

    if (existingRow > 0) {
      const existingRecord = getHarvestRecordAtRow(sheet, existingRow, headers);
      const deletionIdentity = {
        recordUuid: existingRecord.recordUuid,
        id: normalizedRecord.id
      };
      const latestDeletionAt = getLatestHarvestRecordDeletionAt(trashSheet, deletionIdentity);
      if (latestDeletionAt) {
        const latestDeletionTime = new Date(latestDeletionAt || 0).getTime();
        const existingUpdatedTime = new Date(existingRecord.updatedAt || 0).getTime();
        if (Number.isFinite(existingUpdatedTime) && Number.isFinite(latestDeletionTime) &&
          existingUpdatedTime > latestDeletionTime) {
          deleteHarvestRecordTrashRows(trashSheet, existingRecord);
          forgetDeletedHarvestRecord(deletionIdentity);
          return {
            restored: true,
            alreadyRestored: false,
            recoveredCleanup: true,
            record: existingRecord
          };
        }
        const previousToken = latestDeletionTime > existingUpdatedTime
          ? latestDeletionAt
          : existingRecord.updatedAt;
        const restoredRecord = {
          ...existingRecord,
          updatedAt: getNextHarvestRecordUpdatedAt(previousToken)
        };
        writeRecordRow(
          sheet,
          existingRow,
          headers,
          restoredRecord,
          restoredRecord.duplicateKey || makeDuplicateKey(restoredRecord),
          new Date(restoredRecord.updatedAt),
          normalizedRecord,
          suppliedSyncFields,
          "restore"
        );
        SpreadsheetApp.flush();
        deleteHarvestRecordTrashRows(trashSheet, existingRecord);
        forgetDeletedHarvestRecord(deletionIdentity);
        return { restored: true, alreadyRestored: false, record: restoredRecord };
      }
      return { restored: true, alreadyRestored: true, record: existingRecord };
    }

    assertNoUnclaimedHarvestIdentityConflict(sheet, headers, normalizedRecord);

    const trashRow = findTrashRecordRowForMutation(trashSheet, normalizedRecord);
    if (trashRow > 0) {
      const row = trashSheet
        .getRange(trashRow, 1, 1, RECORD_TRASH_HEADERS.length)
        .getValues()[0];
      const storedRecord = rowToRecord(HEADERS, row.slice(0, HEADERS.length));
      const deletedAt = formatHarvestRecordTimestamp(row[HEADERS.length]);
      const restoredRecord = {
        ...storedRecord,
        id: allocateHarvestRecordId(
          storedRecord.id,
          getActiveHarvestRecordIdSet(sheet, headers)
        ),
        recordUuid: storedRecord.recordUuid || normalizedRecord.recordUuid || Utilities.getUuid().toLowerCase(),
        createdAt: storedRecord.createdAt || normalizedRecord.createdAt || new Date().toISOString(),
        updatedAt: getNextHarvestRecordUpdatedAt(
          new Date(storedRecord.updatedAt || 0).getTime() > new Date(deletedAt || 0).getTime()
            ? storedRecord.updatedAt
            : deletedAt
        )
      };
      assertHarvestRecordSupportsPlantingEvents(restoredRecord);
      appendRecordRow(
        sheet,
        headers,
        restoredRecord,
        restoredRecord.duplicateKey || makeDuplicateKey(restoredRecord),
        new Date(restoredRecord.updatedAt),
        normalizedRecord,
        suppliedSyncFields,
        "restore"
      );
      SpreadsheetApp.flush();
      deleteHarvestRecordTrashRows(trashSheet, restoredRecord);
      forgetDeletedHarvestRecord(storedRecord);
      const restoredRow = findRecordRowByUuid(sheet, headers, restoredRecord.recordUuid);
      return {
        restored: true,
        alreadyRestored: false,
        record: restoredRow > 0 ? getHarvestRecordAtRow(sheet, restoredRow, headers) : restoredRecord
      };
    }

    const duplicateKey = String(makeDuplicateKey(normalizedRecord) || normalizedRecord.duplicateKey || "").trim();
    if (!duplicateKey) throw new Error("復元する記録の識別情報がありません");
    const latestDeletionAt = getLatestHarvestRecordDeletionAt(trashSheet, normalizedRecord);
    const now = latestDeletionAt
      ? getNextHarvestRecordUpdatedAt(latestDeletionAt)
      : new Date().toISOString();
    const restoredRecord = {
      ...normalizedRecord,
      id: normalizedRecord.recordUuid
        ? allocateHarvestRecordId(
            normalizedRecord.id,
            getActiveHarvestRecordIdSet(sheet, headers)
          )
        : normalizedRecord.id,
      recordUuid: normalizedRecord.recordUuid || Utilities.getUuid().toLowerCase(),
      createdAt: normalizedRecord.createdAt || now,
      updatedAt: now
    };
    assertHarvestRecordSupportsPlantingEvents(restoredRecord);
    appendRecordRow(
      sheet,
      headers,
      restoredRecord,
      duplicateKey,
      new Date(now),
      normalizedRecord,
      suppliedSyncFields,
      "restore"
    );
    forgetDeletedHarvestRecord(normalizedRecord);
    return {
      restored: true,
      alreadyRestored: false,
      restoredFromAppBackup: true,
      record: restoredRecord
    };
  });
}

function findTrashRecordRowForMutation(sheet, record) {
  const recordUuid = String(record && record.recordUuid || "").trim().toLowerCase();
  if (recordUuid) {
    const uuidColumn = HEADERS.indexOf(HEADER_LABELS.recordUuid) + 1;
    if (uuidColumn > 0 && sheet.getLastRow() >= 2) {
      const values = sheet.getRange(2, uuidColumn, sheet.getLastRow() - 1, 1).getValues();
      const index = values.findIndex(
        row => String(row[0] || "").trim().toLowerCase() === recordUuid
      );
      if (index >= 0) return index + 2;
      return 0;
    }
  }
  const idRow = findTrashRecordRowById(sheet, record && record.id);
  return idRow > 0 ? idRow : 0;
}

function deleteHarvestRecordTrashRows(sheet, record) {
  const recordUuid = String(record && record.recordUuid || "").trim().toLowerCase();
  const id = String(record && record.id != null ? record.id : "").trim();
  if (!recordUuid && !id) return 0;
  const rows = sheet.getLastRow() >= 2
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, RECORD_TRASH_HEADERS.length).getValues()
    : [];
  const uuidIndex = HEADERS.indexOf(HEADER_LABELS.recordUuid);
  const idIndex = HEADERS.indexOf(HEADER_LABELS.id);
  const rowNumbers = [];
  rows.forEach((row, index) => {
    const rowUuid = String(row[uuidIndex] || "").trim().toLowerCase();
    const rowId = String(row[idIndex] == null ? "" : row[idIndex]).trim();
    if (recordUuid ? rowUuid === recordUuid : (id && rowId === id)) {
      rowNumbers.push(index + 2);
    }
  });
  rowNumbers.reverse().forEach(rowNumber => sheet.deleteRow(rowNumber));
  return rowNumbers.length;
}

function getLatestHarvestRecordDeletionAt(trashSheet, record) {
  const recordUuid = String(record && record.recordUuid || "").trim().toLowerCase();
  const id = String(record && record.id != null ? record.id : "").trim();
  let latestTime = 0;
  getHarvestRecordTombstoneItems().forEach(item => {
    const matches = recordUuid
      ? (item.recordUuid === recordUuid ||
        (id && !item.recordUuid && item.id !== null && String(item.id) === id))
      : (id && !item.recordUuid && item.id !== null && String(item.id) === id);
    if (matches && item.deletedTime > latestTime) latestTime = item.deletedTime;
  });
  if (trashSheet && trashSheet.getLastRow() >= 2) {
    const rows = trashSheet
      .getRange(2, 1, trashSheet.getLastRow() - 1, RECORD_TRASH_HEADERS.length)
      .getValues();
    const uuidIndex = HEADERS.indexOf(HEADER_LABELS.recordUuid);
    const idIndex = HEADERS.indexOf(HEADER_LABELS.id);
    const deletedAtIndex = HEADERS.length;
    rows.forEach(row => {
      const rowUuid = String(row[uuidIndex] || "").trim().toLowerCase();
      const rowId = String(row[idIndex] == null ? "" : row[idIndex]).trim();
      const matches = recordUuid ? rowUuid === recordUuid : (id && rowId === id);
      if (!matches) return;
      const deletedTime = new Date(row[deletedAtIndex] || "").getTime();
      if (Number.isFinite(deletedTime) && deletedTime > latestTime) latestTime = deletedTime;
    });
  }
  return latestTime > 0 ? new Date(latestTime).toISOString() : "";
}

function findTrashRecordRowById(sheet, id) {
  const targetId = String(id == null ? "" : id).trim();
  const idColumn = HEADERS.findIndex(header => header === HEADER_LABELS.id) + 1;
  const lastRow = sheet.getLastRow();
  if (!targetId || idColumn <= 0 || lastRow < 2) return 0;

  const values = sheet.getRange(2, idColumn, lastRow - 1, 1).getValues();
  const rowIndex = values.findIndex(row => String(row[0] == null ? "" : row[0]).trim() === targetId);
  return rowIndex >= 0 ? rowIndex + 2 : 0;
}

function prepareDeletedHarvestRecordState(sheet) {
  const trashSheet = sheet || getRecordTrashSheet();
  const tombstoneState = rememberHarvestRecordTombstonesFromTrash(trashSheet);
  const expiresColumn = RECORD_TRASH_HEADERS.length;
  const now = Date.now();
  const expiredRows = [];
  tombstoneState.rows.forEach((row, index) => {
    const value = row[expiresColumn - 1];
    const expiresTime = Object.prototype.toString.call(value) === "[object Date]"
      ? value.getTime()
      : new Date(String(value || "")).getTime();
    if (Number.isFinite(expiresTime) && expiresTime <= now) expiredRows.push(index + 2);
  });
  expiredRows.reverse().forEach(rowNumber => trashSheet.deleteRow(rowNumber));
  return {
    identities: tombstoneState.identities,
    purged: expiredRows.length
  };
}

function purgeExpiredTrashRecords(sheet) {
  return prepareDeletedHarvestRecordState(sheet).purged;
}

function savePlantingEvent(event) {
  let normalizedEvent;
  try {
    normalizedEvent = normalizePlantingEvent(event);
  } catch (err) {
    throw new Error("苗植えイベントの受信値確認中に失敗しました: " + String(err && err.message || err));
  }
  return withRecordWriteLock(() => savePlantingEventUnlocked(normalizedEvent));
}

function savePlantingEventUnlocked(event) {
  let sheet;
  let headers;
  try {
    sheet = getPlantingEventSheet();
    headers = ensurePlantingEventHeaders(sheet);
  } catch (err) {
    throw new Error("苗植えイベントシートの準備中に失敗しました: " + String(err && err.message || err));
  }
  let existingTrashSheet;
  try {
    existingTrashSheet = getExistingPlantingEventTrashSheet();
  } catch (err) {
    throw new Error("削除済み苗植えイベントシートの確認中に失敗しました: " +
      String(err && err.message || err));
  }
  if (existingTrashSheet) {
    try {
      ensurePlantingEventTrashSheet(existingTrashSheet);
      purgeExpiredPlantingEventTrash(existingTrashSheet);
    } catch (err) {
      throw new Error("削除済み苗植えイベントの整理中に失敗しました: " + String(err && err.message || err));
    }
  }
  try {
    assertPlantingEventIsNotDeleted(event, getDeletedPlantingEventIdSet());
  } catch (err) {
    throw new Error("苗植えイベントの削除状態確認中に失敗しました: " + String(err && err.message || err));
  }
  try {
    assertPlantingEventSourcesExist(event);
  } catch (err) {
    throw new Error("苗植え元の収穫記録の確認中に失敗しました: " + String(err && err.message || err));
  }
  try {
    assertPlantingEventAllocationsAvailable(event, sheet, headers);
  } catch (err) {
    throw new Error("苗植え済みパレットの確認中に失敗しました: " + String(err && err.message || err));
  }
  const affectedHarvestRecordIds = getHarvestRecordIdsFromPlantingEvent(event);

  const now = new Date().toISOString();
  let existingRowNumber;
  try {
    existingRowNumber = findPlantingEventRowById(sheet, headers, event.eventId, true);
  } catch (err) {
    throw new Error("苗植えイベントIDの検索中に失敗しました: " + String(err && err.message || err));
  }
  let createdAt = event.createdAt || now;
  let previousUpdatedAt = "";
  if (existingRowNumber > 0) {
    let existingEvent;
    let existingRow;
    try {
      existingRow = readPlantingEventRowValues(sheet, existingRowNumber, headers);
    } catch (err) {
      throw new Error("既存の苗植えイベント行の読み取り中に失敗しました: " + String(err && err.message || err));
    }
    const writeMarker = getPlantingWriteMarker(headers, existingRow);
    if (writeMarker) {
      if (!plantingWriteMarkerMatchesRequest(writeMarker, event)) {
        throw new Error(
          "同じ苗植えイベントIDで別内容の未完了送信があります。記録を同期してから再送してください"
        );
      }
      const rowEventIdColumn = getPlantingEventHeaderColumn(headers, "eventId");
      const rowEventId = rowEventIdColumn > 0
        ? String(existingRow[rowEventIdColumn - 1] == null ? "" : existingRow[rowEventIdColumn - 1]).trim()
        : "";
      if (rowEventId && rowEventId !== String(event.eventId)) {
        throw new Error("苗植えイベントの未完了行でIDが競合しています");
      }
      const createdAtColumn = getPlantingEventHeaderColumn(headers, "createdAt");
      const storedCreatedAt = createdAtColumn > 0
        ? formatPlantingEventTimestamp(existingRow[createdAtColumn - 1])
        : "";
      createdAt = storedCreatedAt || createdAt;
      previousUpdatedAt = String(writeMarker.baseUpdatedAt || "");
      existingEvent = null;
    } else if (!isCommittedPlantingEventRow(headers, existingRow)) {
      throw new Error("苗植えイベント行の未完了マーカーがありません");
    } else {
      try {
        existingEvent = rowToPlantingEvent(headers, existingRow);
        getHarvestRecordIdsFromPlantingEvent(existingEvent)
          .forEach(id => affectedHarvestRecordIds.add(id));
      } catch (err) {
        if (!isRecoverableIncompletePlantingEventRow(headers, existingRow, event.eventId)) {
          throw new Error("既存の苗植えイベント行の読み取り中に失敗しました: " + String(err && err.message || err));
        }
        existingEvent = null;
        previousUpdatedAt = event.updatedAt || "";
      }
    }
    if (existingEvent &&
      getPlantingEventContentSignature(event) === getPlantingEventContentSignature(existingEvent)) {
      syncRecordSheetPlantingLocationSummaries(affectedHarvestRecordIds);
      return { updated: true, unchanged: true, event: existingEvent };
    }
    if (existingEvent && event.updatedAt && existingEvent.updatedAt && event.updatedAt !== existingEvent.updatedAt) {
      throw new Error("この苗植えイベントは別の端末で更新されています。最新履歴を読み込んでから編集してください");
    }
    if (existingEvent && !event.updatedAt) {
      throw new Error("同じ苗植えイベントIDの別内容が保存済みです。最新履歴を読み込んでください");
    }
    if (existingEvent) {
      createdAt = existingEvent.createdAt || createdAt;
      previousUpdatedAt = existingEvent.updatedAt || "";
    }
  }

  const eventToWrite = {
    ...event,
    createdAt,
    updatedAt: getNextPlantingEventUpdatedAt(previousUpdatedAt)
  };
  try {
    if (existingRowNumber > 0) {
      writePlantingEventRow(sheet, existingRowNumber, headers, eventToWrite, event);
    } else {
      appendPlantingEventRow(sheet, headers, eventToWrite, event);
    }
  } catch (err) {
    throw new Error("苗植えイベント行の更新中に失敗しました: " + String(err && err.message || err));
  }
  try {
    syncRecordSheetPlantingLocationSummaries(affectedHarvestRecordIds);
  } catch (err) {
    throw new Error("記録シートの苗植え場所への反映中に失敗しました: " + String(err && err.message || err));
  }
  return {
    updated: existingRowNumber > 0,
    event: eventToWrite
  };
}

function getPlantingEventContentSignature(event) {
  return JSON.stringify({
    eventId: event.eventId,
    plantingDate: event.plantingDate,
    sourceAllocations: event.sourceAllocations,
    plantingPalletKeys: event.plantingPalletKeys,
    actualSeedlingTrayCount: event.actualSeedlingTrayCount,
    actualTakenSeedlingCount: event.actualTakenSeedlingCount,
    actualPlantedSeedlingCount: event.actualPlantedSeedlingCount,
    actualSeedlingCarryoverMode: event.actualSeedlingCarryoverMode,
    actualSeedlingLossRate: event.actualSeedlingLossRate,
    qualityMemo: event.qualityMemo,
    detailsUnknown: event.detailsUnknown
  });
}

function assertPlantingEventDeleteIsCurrent(requestedEvent, existingEvent) {
  if (requestedEvent.updatedAt && existingEvent.updatedAt &&
    requestedEvent.updatedAt !== existingEvent.updatedAt) {
    throw new Error(
      "この苗植えイベントは別の端末で更新されています。最新履歴を読み込んでから削除してください"
    );
  }
  if (!requestedEvent.updatedAt &&
    getPlantingEventContentSignature(requestedEvent) !== getPlantingEventContentSignature(existingEvent)) {
    throw new Error(
      "同じ苗植えイベントIDの別内容が保存済みです。最新履歴を読み込んでから削除してください"
    );
  }
}

function listPlantingEvents(options) {
  const normalizedOptions = normalizePlantingEventListOptions(
    typeof options === "undefined" ? {} : options
  );
  return withRecordReadLock(() => {
    const sheet = getExistingPlantingEventSheet();
    if (!sheet) return [];

    const headers = getPlantingEventHeadersForRead(sheet);
    if (!headers.length || sheet.getLastRow() < 2) return [];

    return getPlantingEventRowsForList(sheet, headers, normalizedOptions)
      .map(row => rowToPlantingEvent(headers, row));
  });
}

function listPlantingEventsForApi(options) {
  const normalizedOptions = normalizePlantingEventListOptions(
    typeof options === "undefined" ? {} : options
  );
  return withRecordReadLock(() => {
    const sheet = getExistingPlantingEventSheet();
    if (!sheet) return [];

    const headers = getPlantingEventHeadersForRead(sheet);
    if (!headers.length || sheet.getLastRow() < 2) return [];

    const events = getPlantingEventRowsForList(sheet, headers, normalizedOptions)
      .map(row => rowToPlantingEvent(headers, row));
    if (!events.length) return [];

    let compactEvents = events.map(compactPlantingEventForApi);
    let compactCharacterCount = compactEvents.reduce(
      (total, event) => total + JSON.stringify(event).length + 1,
      2
    );
    while (events.length > 1 && compactCharacterCount > PLANTING_EVENT_API_EVENT_RESPONSE_CHAR_LIMIT) {
      const removedCompactEvent = compactEvents.pop();
      events.pop();
      compactCharacterCount -= JSON.stringify(removedCompactEvent).length + 1;
    }

    if (sheet.getLastRow() - 1 > events.length) {
      const oldestEvent = events.reduce((oldest, event) => (
        comparePlantingEventOrderAscending(event, oldest) < 0 ? event : oldest
      ));
      const opening = calculatePlantingEventOpeningCarryover(
        sheet,
        headers,
        oldestEvent,
        normalizedOptions.fallbackSeedlingLossRate,
        normalizedOptions.fallbackSeedlingPattern,
        normalizedOptions.fallbackPlantingCountsByBed
      );
      if (opening.hasEarlierEvents) {
        oldestEvent.openingCarryoverBefore = opening.carryover;
      }
    }
    compactEvents = events.map(compactPlantingEventForApi);
    return compactEvents;
  });
}

function getEffectivePlantingEventUpdatedAt(event) {
  const candidates = [event && event.updatedAt, event && event.createdAt];
  for (let index = 0; index < candidates.length; index++) {
    const time = new Date(String(candidates[index] || "")).getTime();
    if (Number.isFinite(time)) return new Date(time).toISOString();
  }
  const plantingDate = parseRecordDateValue(event && event.plantingDate);
  if (plantingDate) return new Date(startOfScriptDay(plantingDate).getTime()).toISOString();
  return new Date(0).toISOString();
}

function listPlantingEventsForSync(options) {
  const normalizedOptions = normalizePlantingEventListOptions(
    typeof options === "undefined" ? {} : options
  );
  return withRecordReadLock(() => {
    const sheet = getExistingPlantingEventSheet();
    if (!sheet) {
      return { events: [], hasMore: false, nextCursor: normalizedOptions.cursor || null };
    }

    const headers = getPlantingEventHeadersForRead(sheet);
    const rowCount = sheet.getLastRow() - 1;
    if (!headers.length || rowCount <= 0) {
      return { events: [], hasMore: false, nextCursor: normalizedOptions.cursor || null };
    }

    const cursorTime = normalizedOptions.cursor
      ? new Date(normalizedOptions.cursor.updatedAt).getTime()
      : -Infinity;
    const cursorEventId = normalizedOptions.cursor ? normalizedOptions.cursor.eventId : 0;
    const rows = sheet.getRange(2, 1, rowCount, headers.length).getValues();
    const items = rows
      .map((row, index) => ({ row, rowNumber: index + 2 }))
      .filter(item => isCommittedPlantingEventRow(headers, item.row))
      .map(item => {
        const row = item.row;
        const event = rowToPlantingEvent(headers, row);
        const eventId = Number(event && event.eventId || 0);
        const updatedAt = getEffectivePlantingEventUpdatedAt(event);
        const updatedTime = new Date(updatedAt).getTime();
        if (!Number.isSafeInteger(eventId) || eventId <= 0 || !Number.isFinite(updatedTime)) {
          throw new Error("苗植えイベントの同期情報が正しくありません: 行" + item.rowNumber);
        }
        return { event, eventId, updatedAt, updatedTime, rowNumber: item.rowNumber };
      })
      .filter(item => (
        item.updatedTime > cursorTime ||
        (item.updatedTime === cursorTime && item.eventId > cursorEventId)
      ))
      .sort((left, right) => (
        left.updatedTime - right.updatedTime ||
        left.eventId - right.eventId ||
        left.rowNumber - right.rowNumber
      ));

    const limit = normalizedOptions.limit || PLANTING_EVENT_LIST_LIMIT;
    const selected = items.slice(0, limit);
    let compactEvents = selected.map(item => compactPlantingEventForApi(item.event));
    let compactCharacterCount = compactEvents.reduce(
      (total, event) => total + JSON.stringify(event).length + 1,
      2
    );
    while (selected.length > 1 && compactCharacterCount > PLANTING_EVENT_API_EVENT_RESPONSE_CHAR_LIMIT) {
      const removedCompactEvent = compactEvents.pop();
      selected.pop();
      compactCharacterCount -= JSON.stringify(removedCompactEvent).length + 1;
    }

    const last = selected[selected.length - 1];
    return {
      events: compactEvents,
      hasMore: items.length > selected.length,
      nextCursor: last
        ? { updatedAt: last.updatedAt, eventId: last.eventId }
        : (normalizedOptions.cursor || null)
    };
  });
}

function comparePlantingEventOrderAscending(left, right) {
  const leftDate = parseRecordDateValue(left && left.plantingDate);
  const rightDate = parseRecordDateValue(right && right.plantingDate);
  const leftTime = leftDate ? startOfScriptDay(leftDate).getTime() : Number.MAX_SAFE_INTEGER;
  const rightTime = rightDate ? startOfScriptDay(rightDate).getTime() : Number.MAX_SAFE_INTEGER;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return Number(left && left.eventId || 0) - Number(right && right.eventId || 0);
}

function readPlantingEventColumnValues(sheet, headers, key, rowCount) {
  const column = getPlantingEventHeaderColumn(headers, key);
  if (column <= 0) return Array(rowCount).fill("");
  return sheet.getRange(2, column, rowCount, 1).getValues().map(row => row[0]);
}

function normalizePlantingCarryoverCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(PLANTING_EVENT_SEEDLING_COUNT_LIMIT, Math.floor(number));
}

function calculatePlantingFallbackTakenCount(trayCountValue, pattern) {
  const trayCount = normalizePlantingCarryoverCount(trayCountValue);
  const safePattern = Array.isArray(pattern) && pattern.length ? pattern : [120, 120, 120];
  if (!trayCount || !safePattern.length) return 0;
  const cycleTotal = safePattern.reduce(
    (total, value) => total + normalizePlantingCarryoverCount(value),
    0
  );
  const fullCycles = Math.floor(trayCount / safePattern.length);
  const remainder = trayCount % safePattern.length;
  let total = Math.min(
    PLANTING_EVENT_SEEDLING_COUNT_LIMIT,
    fullCycles * cycleTotal
  );
  for (let index = 0; index < remainder && total < PLANTING_EVENT_SEEDLING_COUNT_LIMIT; index++) {
    total += normalizePlantingCarryoverCount(safePattern[index]);
  }
  return Math.min(PLANTING_EVENT_SEEDLING_COUNT_LIMIT, total);
}

function calculatePlantingFallbackPlantedCount(value, countsByBed) {
  let keys;
  try {
    keys = normalizeDirectPalletKeys(
      parseStoredJsonArray(value, "苗植えパレット"),
      "苗植えパレット"
    );
  } catch (error) {
    return 0;
  }
  let total = 0;
  keys.forEach(key => {
    const match = String(key || "").match(/^\d+-([A-F])-(\d+)$/);
    if (!match) return;
    const bed = match[1];
    const number = Number(match[2]);
    const count = countsByBed && Array.isArray(countsByBed[bed])
      ? countsByBed[bed][number - 1]
      : 20;
    total = Math.min(
      PLANTING_EVENT_SEEDLING_COUNT_LIMIT,
      total + normalizePlantingCarryoverCount(count)
    );
  });
  return total;
}

function calculatePlantingEventOpeningCarryover(
  sheet,
  headers,
  oldestEvent,
  fallbackSeedlingLossRate,
  fallbackSeedlingPattern,
  fallbackPlantingCountsByBed
) {
  const rowCount = Math.max(0, sheet.getLastRow() - 1);
  if (!rowCount || !oldestEvent) return { hasEarlierEvents: false, carryover: 0 };

  const valuesByKey = {};
  [
    "eventId",
    "plantingDate",
    "actualSeedlingTrayCount",
    "actualTakenSeedlingCount",
    "actualPlantedSeedlingCount",
    "actualSeedlingCarryoverMode",
    "actualSeedlingLossRate",
    "detailsUnknown",
    "updatedAt"
  ].forEach(key => {
    valuesByKey[key] = readPlantingEventColumnValues(sheet, headers, key, rowCount);
  });
  const hasUpdatedAtColumn = getPlantingEventHeaderColumn(headers, "updatedAt") > 0;

  const oldestDate = parseRecordDateValue(oldestEvent.plantingDate);
  const oldestTime = oldestDate ? startOfScriptDay(oldestDate).getTime() : Number.MAX_SAFE_INTEGER;
  const oldestEventId = Number(oldestEvent.eventId);
  const safeFallbackLossRate = Number.isFinite(Number(fallbackSeedlingLossRate))
    ? Math.max(0, Math.min(100, Number(fallbackSeedlingLossRate)))
    : 0;
  const earlierEvents = [];
  for (let index = 0; index < rowCount; index++) {
    if (hasUpdatedAtColumn && !isCommittedWriteTimestamp(valuesByKey.updatedAt[index])) continue;
    const eventDate = parseRecordDateValue(valuesByKey.plantingDate[index]);
    const eventId = Number(valuesByKey.eventId[index]);
    if (!eventDate || !Number.isSafeInteger(eventId) || eventId <= 0) continue;
    const eventTime = startOfScriptDay(eventDate).getTime();
    if (eventTime > oldestTime || (eventTime === oldestTime && eventId >= oldestEventId)) continue;
    const rawLossRate = String(valuesByKey.actualSeedlingLossRate[index] ?? "").trim();
    const parsedLossRate = Number(rawLossRate);
    const rawTakenTotal = String(valuesByKey.actualTakenSeedlingCount[index] ?? "").trim();
    const rawPlantedTotal = String(valuesByKey.actualPlantedSeedlingCount[index] ?? "").trim();
    const detailsUnknown = normalizePlantingEventDetailsUnknown(valuesByKey.detailsUnknown[index]);
    earlierEvents.push({
      eventId,
      time: eventTime,
      rowOrder: index,
      sourceRowIndex: index,
      detailsUnknown,
      takenTotal: rawTakenTotal === ""
        ? calculatePlantingFallbackTakenCount(
            valuesByKey.actualSeedlingTrayCount[index],
            fallbackSeedlingPattern
          )
        : normalizePlantingCarryoverCount(valuesByKey.actualTakenSeedlingCount[index]),
      plantedTotal: rawPlantedTotal === ""
        ? null
        : normalizePlantingCarryoverCount(valuesByKey.actualPlantedSeedlingCount[index]),
      mode: String(valuesByKey.actualSeedlingCarryoverMode[index] || "").trim() === "carryover"
        ? "carryover"
        : "loss",
      lossRate: rawLossRate === ""
        ? safeFallbackLossRate
        : Number.isFinite(parsedLossRate)
        ? Math.max(0, Math.min(100, parsedLossRate))
        : 0
    });
  }

  if (earlierEvents.some(event => event.plantedTotal === null)) {
    const plantingKeyValues = readPlantingEventColumnValues(
      sheet,
      headers,
      "plantingPalletKeys",
      rowCount
    );
    earlierEvents.forEach(event => {
      if (event.detailsUnknown) return;
      if (event.plantedTotal !== null) return;
      event.plantedTotal = calculatePlantingFallbackPlantedCount(
        plantingKeyValues[event.sourceRowIndex],
        fallbackPlantingCountsByBed
      );
    });
  }

  earlierEvents.sort((left, right) => (
    left.time - right.time || left.eventId - right.eventId || left.rowOrder - right.rowOrder
  ));
  let carryover = 0;
  earlierEvents.forEach(event => {
    if (event.detailsUnknown) return;
    const usedFromCarryover = Math.min(carryover, event.plantedTotal);
    const remainingCarryover = Math.max(0, carryover - usedFromCarryover);
    const remainingNeed = Math.max(0, event.plantedTotal - usedFromCarryover);
    const usedFromCurrent = Math.min(event.takenTotal, remainingNeed);
    if (event.mode !== "carryover") {
      carryover = 0;
      return;
    }
    const lossCount = Math.round(event.takenTotal * event.lossRate / 100);
    const currentCarryover = Math.max(0, event.takenTotal - usedFromCurrent - lossCount);
    carryover = Math.min(
      PLANTING_EVENT_SEEDLING_COUNT_LIMIT,
      Math.max(0, remainingCarryover + currentCarryover)
    );
  });
  return {
    hasEarlierEvents: earlierEvents.length > 0,
    carryover: normalizePlantingCarryoverCount(carryover)
  };
}

function compressPlantingPalletKeysToRanges(keys) {
  const numbersByGroup = new Map();
  (Array.isArray(keys) ? keys : []).forEach(key => {
    const match = String(key || "").trim().match(/^(\d+)-([A-F])-(\d+)$/);
    if (!match) return;
    const building = Number(match[1]);
    const bed = match[2];
    const number = Number(match[3]);
    if (!HARVEST_BUILDINGS.includes(building) || !HARVEST_BEDS.includes(bed) ||
      !Number.isInteger(number) || number < 1 || number > PALLETS_PER_BED) return;
    const groupKey = building + "-" + bed;
    if (!numbersByGroup.has(groupKey)) numbersByGroup.set(groupKey, new Set());
    numbersByGroup.get(groupKey).add(number);
  });

  const ranges = [];
  HARVEST_BUILDINGS.forEach(building => {
    HARVEST_BEDS.forEach(bed => {
      const numbers = Array.from(numbersByGroup.get(building + "-" + bed) || [])
        .sort((left, right) => left - right);
      if (!numbers.length) return;
      let start = numbers[0];
      let previous = numbers[0];
      for (let index = 1; index <= numbers.length; index++) {
        const current = numbers[index];
        if (current === previous + 1) {
          previous = current;
          continue;
        }
        ranges.push(building + "-" + bed + "-" + start + "-" + previous);
        start = current;
        previous = current;
      }
    });
  });
  return ranges;
}

function formatRecordedPalletSummary(keys) {
  const numbersByGroup = new Map();
  (Array.isArray(keys) ? keys : []).forEach(key => {
    const match = String(key || "").trim().match(/^(\d+)-([A-F])-(\d+)$/);
    if (!match) return;
    const building = Number(match[1]);
    const bed = match[2];
    const number = Number(match[3]);
    if (!HARVEST_BUILDINGS.includes(building) || !HARVEST_BEDS.includes(bed) ||
      !Number.isInteger(number) || number < 1 || number > PALLETS_PER_BED) return;
    const groupKey = building + "-" + bed;
    if (!numbersByGroup.has(groupKey)) numbersByGroup.set(groupKey, []);
    numbersByGroup.get(groupKey).push(number);
  });

  const parts = [];
  HARVEST_BUILDINGS.forEach(building => {
    HARVEST_BEDS.forEach(bed => {
      const numbers = numbersByGroup.get(building + "-" + bed);
      if (numbers && numbers.length) {
        parts.push(building + "号棟" + bed + ":" + formatRecordedPalletNumberRanges(numbers));
      }
    });
  });
  return parts.join("\n");
}

function formatRecordedPalletNumberRanges(numbers) {
  const normalizedNumbers = Array.from(new Set(Array.isArray(numbers) ? numbers : []))
    .map(Number)
    .filter(number => Number.isInteger(number) && number >= 1 && number <= PALLETS_PER_BED)
    .sort((left, right) => left - right);
  const parts = [];
  const numbersInRegularRanges = new Set();

  // 1ずつ続く通常の範囲を優先し、従来どおり「開始-終了」で表示する。
  let regularStartIndex = 0;
  for (let index = 1; index <= normalizedNumbers.length; index++) {
    if (index < normalizedNumbers.length &&
      normalizedNumbers[index] === normalizedNumbers[index - 1] + 1) {
      continue;
    }
    if (index - regularStartIndex >= 2) {
      const start = normalizedNumbers[regularStartIndex];
      const end = normalizedNumbers[index - 1];
      parts.push({ start, text: start + "-" + end });
      for (let itemIndex = regularStartIndex; itemIndex < index; itemIndex++) {
        numbersInRegularRanges.add(normalizedNumbers[itemIndex]);
      }
    }
    regularStartIndex = index;
  }

  [
    { label: "左", parity: 1 },
    { label: "右", parity: 0 }
  ].forEach(side => {
    const sideNumbers = normalizedNumbers.filter(number => (
      !numbersInRegularRanges.has(number) && number % 2 === side.parity
    ));
    if (!sideNumbers.length) return;
    let start = sideNumbers[0];
    let previous = sideNumbers[0];

    for (let index = 1; index <= sideNumbers.length; index++) {
      const current = sideNumbers[index];
      if (current === previous + 2) {
        previous = current;
        continue;
      }
      parts.push({
        start,
        text: start === previous ? String(start) : side.label + "(" + start + "-" + previous + ")"
      });
      start = current;
      previous = current;
    }
  });

  return parts
    .sort((left, right) => left.start - right.start)
    .map(part => part.text)
    .join(",");
}

function getHarvestRecordPalletKeysForPlantingSource(record) {
  return normalizeDirectPalletKeys(
    parseStoredJsonArray(record && record.palletKeys, "収穫記録のパレット"),
    "収穫記録のパレット"
  );
}

function compactPlantingEventForApi(event) {
  const compactEvent = {
    ...event,
    sourceAllocations: event.sourceAllocations.map(allocation => ({
      harvestRecordId: allocation.harvestRecordId,
      palletRanges: compressPlantingPalletKeysToRanges(allocation.palletKeys)
    }))
  };
  delete compactEvent.plantingPalletKeys;
  return compactEvent;
}

function deletePlantingEvent(event) {
  const normalizedEvent = normalizePlantingEvent(event);
  return withRecordWriteLock(() => {
    const sheet = getPlantingEventSheet();
    const headers = ensurePlantingEventHeaders(sheet);
    const trashSheet = getPlantingEventTrashSheet();
    ensurePlantingEventTrashSheet(trashSheet);
    purgeExpiredPlantingEventTrash(trashSheet);
    const affectedHarvestRecordIds = getHarvestRecordIdsFromPlantingEvent(normalizedEvent);

    const existingTrashRow = findPlantingEventTrashRowById(trashSheet, normalizedEvent.eventId);
    const rowNumber = findPlantingEventRowById(
      sheet,
      headers,
      normalizedEvent.eventId,
      true
    );
    let sourceRow = null;
    if (rowNumber > 0) {
      sourceRow = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
      const writeMarker = getPlantingWriteMarker(headers, sourceRow);
      if (writeMarker) {
        if (!plantingWriteMarkerMatchesRequest(writeMarker, normalizedEvent, "any")) {
          throw new Error(
            "同じ苗植えイベントIDで別内容の未完了送信があります。データ保護のため削除しません"
          );
        }
        const createdAtColumn = getPlantingEventHeaderColumn(headers, "createdAt");
        const storedCreatedAt = createdAtColumn > 0
          ? formatPlantingEventTimestamp(sourceRow[createdAtColumn - 1])
          : "";
        const eventToBackup = {
          ...normalizedEvent,
          createdAt: storedCreatedAt || normalizedEvent.createdAt || new Date().toISOString(),
          updatedAt: getNextPlantingEventUpdatedAt(
            writeMarker.baseUpdatedAt || normalizedEvent.updatedAt
          )
        };
        let deletedAt;
        let expiresAt;
        if (existingTrashRow > 0) {
          const savedTrashValues = trashSheet
            .getRange(existingTrashRow, 1, 1, PLANTING_EVENT_TRASH_HEADERS.length)
            .getValues()[0];
          deletedAt = new Date(savedTrashValues[PLANTING_EVENT_HEADERS.length] || new Date());
          expiresAt = new Date(
            savedTrashValues[PLANTING_EVENT_HEADERS.length + 1] ||
            (deletedAt.getTime() + RECORD_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000)
          );
        } else {
          deletedAt = new Date();
          expiresAt = new Date(
            deletedAt.getTime() + RECORD_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000
          );
          trashSheet.appendRow(
            buildPlantingEventRow(PLANTING_EVENT_HEADERS, eventToBackup)
              .concat([deletedAt, expiresAt])
          );
        }
        rememberDeletedPlantingEventId(normalizedEvent.eventId, deletedAt);
        SpreadsheetApp.flush();
        sheet.deleteRow(rowNumber);
        syncRecordSheetPlantingLocationSummaries(affectedHarvestRecordIds);
        return {
          deleted: true,
          alreadyDeleted: existingTrashRow > 0,
          notFound: false,
          recoveredIncompleteWrite: true,
          deletedAt: deletedAt.toISOString(),
          expiresAt: expiresAt.toISOString()
        };
      }
      if (!isCommittedPlantingEventRow(headers, sourceRow)) {
        throw new Error(
          "同じ苗植えイベントIDの署名がない未完了行があります。データ保護のため削除しません"
        );
      }
      const existingEvent = rowToPlantingEvent(headers, sourceRow);
      assertPlantingEventDeleteIsCurrent(normalizedEvent, existingEvent);
    }
    if (existingTrashRow > 0) {
      rememberDeletedPlantingEventId(normalizedEvent.eventId);
      if (rowNumber > 0) sheet.deleteRow(rowNumber);
      syncRecordSheetPlantingLocationSummaries(affectedHarvestRecordIds);
      return { deleted: true, alreadyDeleted: true, notFound: false };
    }
    if (rowNumber <= 0) {
      rememberDeletedPlantingEventId(normalizedEvent.eventId);
      syncRecordSheetPlantingLocationSummaries(affectedHarvestRecordIds);
      return { deleted: false, alreadyDeleted: false, notFound: true };
    }

    const row = remapPlantingEventRow(headers, sourceRow, PLANTING_EVENT_HEADERS);
    const safeRow = row.map((value, index) => (
      PLANTING_EVENT_FORMULA_SAFE_KEYS.has(getPlantingEventHeaderKey(PLANTING_EVENT_HEADERS[index]))
        ? escapeSpreadsheetFormulaText(value)
        : value
    ));
    const deletedAt = new Date();
    const expiresAt = new Date(
      deletedAt.getTime() + RECORD_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000
    );
    trashSheet.appendRow(safeRow.concat([deletedAt, expiresAt]));
    rememberDeletedPlantingEventId(normalizedEvent.eventId, deletedAt);
    SpreadsheetApp.flush();
    sheet.deleteRow(rowNumber);
    syncRecordSheetPlantingLocationSummaries(affectedHarvestRecordIds);
    return {
      deleted: true,
      alreadyDeleted: false,
      notFound: false,
      deletedAt: deletedAt.toISOString(),
      expiresAt: expiresAt.toISOString()
    };
  });
}

function restorePlantingEvent(event) {
  const normalizedEvent = normalizePlantingEvent(event);
  return withRecordWriteLock(() => {
    const sheet = getPlantingEventSheet();
    const headers = ensurePlantingEventHeaders(sheet);
    const trashSheet = getPlantingEventTrashSheet();
    ensurePlantingEventTrashSheet(trashSheet);
    purgeExpiredPlantingEventTrash(trashSheet);

    const existingRow = findPlantingEventRowById(
      sheet,
      headers,
      normalizedEvent.eventId,
      true
    );
    const trashRow = findPlantingEventTrashRowById(trashSheet, normalizedEvent.eventId);
    const existingSourceRow = existingRow > 0
      ? sheet.getRange(existingRow, 1, 1, headers.length).getValues()[0]
      : null;
    const incompleteMarker = existingSourceRow
      ? getPlantingWriteMarker(headers, existingSourceRow)
      : null;
    if (incompleteMarker &&
      !plantingWriteMarkerMatchesRequest(incompleteMarker, normalizedEvent, "restore")) {
      throw new Error(
        "同じ苗植えイベントIDで復元とは異なる未完了送信があります。データ保護のため上書きしません"
      );
    }
    let eventToRestore = normalizedEvent;
    if (trashRow > 0) {
      const row = trashSheet
        .getRange(trashRow, 1, 1, PLANTING_EVENT_HEADERS.length)
        .getValues()[0];
      eventToRestore = rowToPlantingEvent(PLANTING_EVENT_HEADERS, row);
      eventToRestore = {
        ...eventToRestore,
        updatedAt: getNextPlantingEventUpdatedAt(eventToRestore.updatedAt)
      };
    } else if (existingRow > 0) {
      if (incompleteMarker) {
        eventToRestore = {
          ...normalizedEvent,
          createdAt: normalizedEvent.createdAt || new Date().toISOString(),
          updatedAt: getNextPlantingEventUpdatedAt(
            incompleteMarker.baseUpdatedAt || normalizedEvent.updatedAt
          )
        };
      } else if (!isCommittedPlantingEventRow(headers, existingSourceRow)) {
        throw new Error("同じ苗植えイベントIDの未完了行があるため復元できません。先に記録を再送してください");
      } else {
        eventToRestore = rowToPlantingEvent(headers, existingSourceRow);
      }
    }

    assertPlantingEventSourcesExist(eventToRestore);
    assertPlantingEventAllocationsAvailable(eventToRestore, sheet, headers);
    const affectedHarvestRecordIds = getHarvestRecordIdsFromPlantingEvent(eventToRestore);

    if (existingRow > 0) {
      if (trashRow > 0) {
        writePlantingEventRow(
          sheet,
          existingRow,
          headers,
          eventToRestore,
          normalizedEvent,
          "restore"
        );
        SpreadsheetApp.flush();
        trashSheet.deleteRow(trashRow);
      } else if (incompleteMarker) {
        writePlantingEventRow(
          sheet,
          existingRow,
          headers,
          eventToRestore,
          normalizedEvent,
          "restore"
        );
        SpreadsheetApp.flush();
      }
      forgetDeletedPlantingEventId(normalizedEvent.eventId);
      syncRecordSheetPlantingLocationSummaries(affectedHarvestRecordIds);
      return {
        restored: true,
        alreadyRestored: !incompleteMarker && trashRow <= 0,
        recovered: !!incompleteMarker,
        event: eventToRestore
      };
    }

    if (trashRow > 0) {
      appendPlantingEventRow(
        sheet,
        headers,
        eventToRestore,
        normalizedEvent,
        "restore"
      );
      SpreadsheetApp.flush();
      trashSheet.deleteRow(trashRow);
      forgetDeletedPlantingEventId(normalizedEvent.eventId);
      syncRecordSheetPlantingLocationSummaries(affectedHarvestRecordIds);
      return {
        restored: true,
        alreadyRestored: false,
        event: eventToRestore
      };
    }

    const now = new Date().toISOString();
    eventToRestore = {
      ...eventToRestore,
      createdAt: eventToRestore.createdAt || now,
      updatedAt: now
    };
    appendPlantingEventRow(
      sheet,
      headers,
      eventToRestore,
      normalizedEvent,
      "restore"
    );
    forgetDeletedPlantingEventId(normalizedEvent.eventId);
    syncRecordSheetPlantingLocationSummaries(affectedHarvestRecordIds);
    return {
      restored: true,
      alreadyRestored: false,
      restoredFromAppBackup: true,
      event: eventToRestore
    };
  });
}

function getNextPlantingEventUpdatedAt(previousValue) {
  const previousTime = new Date(String(previousValue || "")).getTime();
  const now = Date.now();
  const nextTime = Number.isFinite(previousTime) && previousTime >= now
    ? previousTime + 1
    : now;
  return new Date(nextTime).toISOString();
}

function assertPlantingEventSourcesExist(event) {
  const recordSheet = getExistingRecordSheet();
  if (!recordSheet) throw new Error("収穫記録シートがないため苗植えイベントを保存できません");
  const recordHeaders = getRecordHeadersForRead(recordSheet);
  if (!recordHeaders.length || recordSheet.getLastRow() < 2) {
    throw new Error("苗植えイベントに対応する収穫記録がありません");
  }

  const recordRows = buildHarvestRecordRowLookup(recordSheet, recordHeaders);
  const recordsById = new Map();
  event.sourceAllocations.forEach(allocation => {
    const id = String(allocation.harvestRecordId);
    const rowNumber = recordRows.byId.get(id);
    if (!rowNumber) {
      throw new Error("収穫記録ID " + allocation.harvestRecordId + " が見つかりません");
    }
    recordsById.set(id, getHarvestRecordAtRow(recordSheet, rowNumber, recordHeaders));
  });

  event.sourceAllocations.forEach(allocation => {
    const record = recordsById.get(String(allocation.harvestRecordId));
    if (!record) {
      throw new Error("収穫記録ID " + allocation.harvestRecordId + " が見つかりません");
    }
    if (String(record.type || "").trim() !== "fullHarvest") {
      throw new Error("先取り収穫には苗植えイベントを割り当てられません");
    }
    const harvestKeys = getHarvestRecordPalletKeysForPlantingSource(record);
    const harvestKeySet = new Set(harvestKeys);
    const invalidKey = allocation.palletKeys.find(key => !harvestKeySet.has(key));
    if (invalidKey) {
      throw new Error(
        "収穫記録ID " + allocation.harvestRecordId + " に含まれないパレットが割り当てられています: " + invalidKey
      );
    }
  });
}

function getPlantingEventAllocatedKeysForHarvestRecord(harvestRecordId) {
  return buildPlantingEventAllocatedKeysByHarvestRecord().get(Number(harvestRecordId)) || new Set();
}

function buildPlantingEventAllocatedKeysByHarvestRecord(options) {
  const normalizedOptions = options && typeof options === "object" ? options : {};
  const targetIds = normalizedOptions.targetHarvestRecordIds
    ? new Set(
        Array.from(normalizedOptions.targetHarvestRecordIds)
          .map(Number)
          .filter(id => Number.isSafeInteger(id) && id > 0)
      )
    : null;
  const excludeEventId = Number(normalizedOptions.excludeEventId);
  const sheet = getExistingPlantingEventSheet();
  const allocatedByHarvestRecord = new Map();
  if (!sheet || sheet.getLastRow() < 2) return allocatedByHarvestRecord;
  const headers = getPlantingEventHeadersForRead(sheet);
  if (!headers.length) return allocatedByHarvestRecord;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  rows.forEach(row => {
    if (!isCommittedPlantingEventRow(headers, row)) return;
    const event = rowToPlantingEvent(headers, row);
    if (Number.isSafeInteger(excludeEventId) && Number(event.eventId) === excludeEventId) return;
    event.sourceAllocations.forEach(allocation => {
      const harvestRecordId = Number(allocation.harvestRecordId);
      if (targetIds && !targetIds.has(harvestRecordId)) return;
      if (!allocatedByHarvestRecord.has(harvestRecordId)) {
        allocatedByHarvestRecord.set(harvestRecordId, new Set());
      }
      allocation.palletKeys.forEach(key => allocatedByHarvestRecord.get(harvestRecordId).add(key));
    });
  });
  return allocatedByHarvestRecord;
}

function getHarvestRecordIdsFromPlantingEvent(event) {
  const ids = new Set();
  (event && Array.isArray(event.sourceAllocations) ? event.sourceAllocations : [])
    .forEach(allocation => {
      const id = Number(allocation && allocation.harvestRecordId);
      if (Number.isSafeInteger(id) && id > 0) ids.add(id);
    });
  return ids;
}

function applyPlantingLocationSummaryToHarvestRecord(record, allocatedKeysByHarvestRecord) {
  if (!record || record.type !== "fullHarvest" || !allocatedKeysByHarvestRecord) return record;
  const allocatedKeys = allocatedKeysByHarvestRecord.get(Number(record.id));
  if (!allocatedKeys) return record;
  return {
    ...record,
    plantingSummary: formatRecordedPalletSummary(Array.from(allocatedKeys))
  };
}

function syncRecordSheetPlantingLocationSummaries(harvestRecordIds) {
  const targetIds = new Set(
    Array.from(harvestRecordIds || [])
      .map(Number)
      .filter(id => Number.isSafeInteger(id) && id > 0)
  );

  if (!targetIds.size) return 0;
  // 直前の苗植えイベント追加・削除を確定させてから正本を再集計する。
  SpreadsheetApp.flush();
  const allocatedKeysByHarvestRecord = buildPlantingEventAllocatedKeysByHarvestRecord({
    targetHarvestRecordIds: targetIds
  });
  const recordSheet = getExistingRecordSheet();
  if (!recordSheet) throw new Error("苗植え場所を反映する記録シートがありません");
  const recordHeaders = getRecordHeadersForRead(recordSheet);
  const summaryColumn = getHeaderColumn(recordHeaders, "plantingSummary");
  if (summaryColumn <= 0) throw new Error("記録シートに苗植え場所列がありません");
  const recordRows = buildHarvestRecordRowLookup(recordSheet, recordHeaders);
  let changed = 0;

  targetIds.forEach(id => {
    const rowNumber = recordRows.byId.get(String(id));
    if (!rowNumber) {
      throw new Error("苗植え場所を反映する収穫記録ID " + id + " が見つかりません");
    }
    const keys = Array.from(allocatedKeysByHarvestRecord.get(id) || []);
    const nextSummary = formatRecordedPalletSummary(keys);
    const currentSummary = String(recordSheet.getRange(rowNumber, summaryColumn).getValue() || "")
      .replace(/^'(?=[=+\-@])/, "");
    if (currentSummary === nextSummary) return;
    setHarvestRecordColumnValuesWithValidationRecovery(
      recordSheet,
      rowNumber,
      summaryColumn,
      [[escapeSpreadsheetFormulaText(nextSummary)]],
      HEADER_LABELS.plantingSummary,
      "苗植え場所の反映"
    );
    requestScopedChangedHarvestRecordIds.add(id);
    changed++;
  });
  return changed;
}

function assertHarvestRecordSupportsPlantingEvents(record, allocatedKeysByHarvestRecord) {
  const allocatedKeys = allocatedKeysByHarvestRecord
    ? (allocatedKeysByHarvestRecord.get(Number(record.id)) || new Set())
    : getPlantingEventAllocatedKeysForHarvestRecord(record.id);
  if (!allocatedKeys.size) return;
  if (record.type !== "fullHarvest") {
    throw new Error("苗植えイベントで使用中の収穫記録は先取り収穫へ変更できません");
  }
  const harvestKeys = new Set(getHarvestRecordPalletKeysForPlantingSource(record));
  const missingKey = Array.from(allocatedKeys).find(key => !harvestKeys.has(key));
  if (missingKey) {
    throw new Error("苗植えイベントで使用中のパレットは収穫記録から削除できません: " + missingKey);
  }
}

function assertHarvestRecordHasNoPlantingEvents(harvestRecordId) {
  if (getPlantingEventAllocatedKeysForHarvestRecord(harvestRecordId).size) {
    throw new Error("この収穫記録を使った苗植えイベントがあります。先に苗植えイベントを削除してください");
  }
}

function assertPlantingEventAllocationsAvailable(event, sheet, headers) {
  if (!sheet || sheet.getLastRow() < 2) return;
  const occupied = new Set();
  const eventIdIndex = headers.findIndex(
    header => getPlantingEventHeaderKey(header) === "eventId"
  );
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  rows.forEach(row => {
    if (!isCommittedPlantingEventRow(headers, row)) return;
    // 過去の送信失敗でIDだけ書かれた自分の部分行があっても、
    // JSONの読み取りより先に除外し、後段で完全な行に上書きできるようにする。
    if (eventIdIndex >= 0 && Number(row[eventIdIndex]) === Number(event.eventId)) return;
    const existingEvent = rowToPlantingEvent(headers, row);
    existingEvent.sourceAllocations.forEach(allocation => {
      allocation.palletKeys.forEach(key => {
        occupied.add(String(allocation.harvestRecordId) + "|" + key);
      });
    });
  });

  event.sourceAllocations.forEach(allocation => {
    const duplicateKey = allocation.palletKeys.find(key => (
      occupied.has(String(allocation.harvestRecordId) + "|" + key)
    ));
    if (duplicateKey) {
      throw new Error(
        "収穫記録ID " + allocation.harvestRecordId + " のパレット " + duplicateKey + " は別の苗植えイベントで記録済みです"
      );
    }
  });
}

function parseStoredJsonArray(value, label) {
  if (Array.isArray(value)) return value;
  const text = String(value == null ? "" : value).trim().replace(/^'(?=[\[{])/, "");
  if (!text) return [];
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(label + "の保存形式が正しくありません");
  }
  if (!Array.isArray(parsed)) throw new Error(label + "の保存形式が正しくありません");
  return parsed;
}

function readMonitorSettingsTable(sheet, rowCount) {
  const safeRowCount = Math.max(Number(rowCount) || 0, MONITOR_SETTING_KEYS.length);
  const values = sheet.getRange(1, 1, safeRowCount + 1, 2).getValues();
  const firstHeader = String(values[0] && values[0][0] || "").trim();
  const secondHeader = String(values[0] && values[0][1] || "").trim();
  if (firstHeader !== "key" || secondHeader !== "value") return null;

  const settings = {};
  values.slice(1).forEach(row => {
    const key = String(row[0] || "").trim();
    if (!MONITOR_SETTING_KEYS.includes(key) || Object.prototype.hasOwnProperty.call(settings, key)) return;
    settings[key] = row[1];
  });

  return MONITOR_SETTING_KEYS.every(key => Object.prototype.hasOwnProperty.call(settings, key))
    ? settings
    : null;
}

function getMonitorContentFromSheet(sheet) {
  let settings = readMonitorSettingsTable(sheet, MONITOR_SETTING_KEYS.length);
  if (!settings) {
    ensureMonitorSettings(sheet);
    const rowCount = Math.max(sheet.getLastRow() - 1, MONITOR_SETTING_KEYS.length);
    settings = readMonitorSettingsTable(sheet, rowCount);
  }
  if (!settings) {
    throw new Error("モニター設定シートの構成を修復できませんでした");
  }

  return normalizeMonitorContent(settings);
}

function getMonitorContent() {
  return getMonitorContentFromSheet(getMonitorSheet());
}

function saveMonitorContent(content) {
  const validatedContent = normalizeMonitorContentInput(content);
  const sheet = getMonitorSheet();
  const current = getMonitorContentFromSheet(sheet);
  const nextDraft = normalizeMonitorContent({
    ...current,
    ...validatedContent,
    enabled: typeof validatedContent.enabled === "undefined" ? current.enabled : validatedContent.enabled,
    version: current.version,
    updatedAt: current.updatedAt
  });

  if (getMonitorContentSignature(current) === getMonitorContentSignature(nextDraft)) {
    return {
      content: current,
      historyAdded: false,
      unchanged: true
    };
  }

  const now = new Date();
  const next = normalizeMonitorContent({
    ...nextDraft,
    version: Number(current.version || 0) + 1,
    updatedAt: now
  });

  const rows = MONITOR_SETTING_KEYS.map(key => [
    key,
    serializeMonitorSettingValue(key, next[key])
  ]);
  sheet.getRange(2, 1, rows.length, 2).setValues(rows);
  appendMonitorHistory(next, now);
  return {
    content: next,
    historyAdded: true,
    unchanged: false
  };
}

function getMonitorContentSignature(content) {
  const normalized = normalizeMonitorContent(content || {});
  return JSON.stringify({
    enabled: normalized.enabled,
    instructionText: normalized.instructionText,
    memoText: normalized.memoText,
    harvestFillKeys: normalized.harvestFillKeys
  });
}

function appendMonitorHistory(content, savedAt) {
  const sheet = getMonitorHistorySheet();
  ensureMonitorHistorySheet(sheet);
  const rowObject = {
    savedAt: savedAt || new Date(),
    version: content.version,
    enabled: content.enabled,
    instructionText: escapeSpreadsheetFormulaText(content.instructionText),
    memoText: escapeSpreadsheetFormulaText(content.memoText),
    harvestFillKeys: JSON.stringify(normalizeMonitorHarvestFillKeys(content.harvestFillKeys))
  };

  sheet.appendRow(MONITOR_HISTORY_KEYS.map(key => rowObject[key] ?? ""));
  pruneMonitorHistory(sheet);
}

function pruneMonitorHistory(sheet) {
  const lastRow = sheet.getLastRow();
  const maxRowsWithHeader = MONITOR_HISTORY_LIMIT + 1;
  if (lastRow <= maxRowsWithHeader) return;

  const deleteCount = lastRow - maxRowsWithHeader;
  sheet.deleteRows(2, deleteCount);
}

function listMonitorHistory(options) {
  const normalizedOptions = normalizeMonitorHistoryOptions(
    typeof options === "undefined" ? {} : options
  );
  const sheet = getMonitorHistorySheet();
  ensureMonitorHistorySheet(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const limit = normalizedOptions.limit;
  const rowCount = Math.min(limit, lastRow - 1);
  const startRow = lastRow - rowCount + 1;
  const rows = sheet.getRange(startRow, 1, rowCount, MONITOR_HISTORY_KEYS.length).getValues();

  return rows.reverse().map(row => {
    const item = {};
    MONITOR_HISTORY_KEYS.forEach((key, index) => {
      item[key] = row[index];
    });
    return normalizeMonitorHistoryItem(item);
  });
}

function saveHarvestRecordsBatch(records) {
  if (!Array.isArray(records)) {
    throw new Error("recordsが配列ではありません。");
  }
  if (records.length > API_BATCH_RECORD_LIMIT) {
    throw new Error("一度に送信できる記録は" + API_BATCH_RECORD_LIMIT + "件までです");
  }

  return withRecordWriteLock(() => saveHarvestRecordsBatchUnlocked(records));
}

function saveHarvestRecordsBatchUnlocked(records) {
  let sheet;
  let headers;
  let deletedRecordIdentities;
  let existingKeys;
  let plantingAllocatedKeysByHarvest;
  let recordRowLookup;
  let recordSnapshot;
  try {
    sheet = getRecordSheet();
    headers = ensureHeaders(sheet);
    const trashSheet = getRecordTrashSheet();
    const deletedRecordState = prepareDeletedHarvestRecordState(trashSheet);
    deletedRecordIdentities = deletedRecordState.identities;
    const recordRows = readHarvestRecordRows(sheet, headers);
    recordSnapshot = buildHarvestRecordBatchSnapshot(headers, recordRows);
    existingKeys = recordSnapshot.existingKeys;
    const needsPlantingAllocationCheck = records.some(record => (
      record && String(record.type || "").trim() === "fullHarvest"
    ));
    plantingAllocatedKeysByHarvest = needsPlantingAllocationCheck
      ? buildPlantingEventAllocatedKeysByHarvestRecord()
      : new Map();
    recordRowLookup = recordSnapshot.recordRowLookup;
  } catch (err) {
    throw new Error("収穫記録の一括保存の準備中に失敗しました: " +
      String(err && err.message || err));
  }
  const rowsToAppend = [];
  const writeMarkersToAppend = [];
  const results = [];
  const queuedUuids = new Set();
  const queuedIds = new Set();
  const unavailableRecordIds = recordSnapshot.unavailableRecordIds;
  deletedRecordIdentities.forEach(identity => {
    if (String(identity).startsWith("i:")) {
      unavailableRecordIds.add(String(identity).slice(2));
    }
  });

  records.forEach((record, index) => {
    try {
      const suppliedSyncFields = getSuppliedRecordSyncFields(record);
      const normalizedRecord = normalizeHarvestRecord(record);
      assertRecordIsNotDeleted(normalizedRecord, deletedRecordIdentities);
      const duplicateKey = String(
        makeDuplicateKey(normalizedRecord) || normalizedRecord.duplicateKey || ""
      ).trim();
      if (!duplicateKey) {
        results.push({
          index,
          id: normalizedRecord.id,
          ok: false,
          duplicate: false,
          message: "duplicateKeyがありません"
        });
        return;
      }

      const candidateKeys = getRecordDuplicateKeysForCheck(normalizedRecord, duplicateKey);
      const incompleteWrite = findHarvestIncompleteWriteForRequest(
        sheet,
        headers,
        normalizedRecord,
        suppliedSyncFields,
        undefined,
        recordSnapshot.rows
      );
      if (incompleteWrite) {
        const recoveredRecord = recoverIncompleteHarvestRecordWrite(
          sheet,
          headers,
          incompleteWrite,
          normalizedRecord,
          suppliedSyncFields,
          duplicateKey,
          plantingAllocatedKeysByHarvest,
          incompleteWrite.row
        );
        recordSnapshot.rows[incompleteWrite.rowNumber - 2] = buildRecordRow(
          headers,
          recoveredRecord,
          duplicateKey,
          new Date(recoveredRecord.updatedAt)
        );
        recordSnapshot.recordsByRowNumber.set(incompleteWrite.rowNumber, recoveredRecord);
        recordRowLookup.byUuid.set(recoveredRecord.recordUuid, incompleteWrite.rowNumber);
        recordRowLookup.byId.set(String(recoveredRecord.id), incompleteWrite.rowNumber);
        candidateKeys.forEach(key => existingKeys.add(key));
        results.push({
          index,
          id: recoveredRecord.id,
          recordUuid: recoveredRecord.recordUuid,
          duplicateKey,
          ok: true,
          duplicate: false,
          updated: !!normalizedRecord.updatedAt,
          recovered: true,
          record: recoveredRecord,
          message: "未完了だった記録を保存しました"
        });
        return;
      }
      const existingRowNumber = normalizedRecord.recordUuid
        ? (recordRowLookup.byUuid.get(normalizedRecord.recordUuid) || 0)
        : (recordRowLookup.byId.get(String(normalizedRecord.id)) || 0);
      if (existingRowNumber > 0) {
        const existingRecord = recordSnapshot.recordsByRowNumber.get(existingRowNumber);
        if (!existingRecord) {
          throw new Error("保存済みの収穫記録を読み込み結果から確認できません");
        }
        const recordToWrite = mergeOmittedSyncFieldsFromExistingRecord(
          normalizedRecord,
          suppliedSyncFields,
          existingRecord
        );
        const recordWithIdentity = applyPlantingLocationSummaryToHarvestRecord({
          ...recordToWrite,
          id: existingRecord.id,
          recordUuid: existingRecord.recordUuid || normalizedRecord.recordUuid || Utilities.getUuid().toLowerCase(),
          createdAt: existingRecord.createdAt || normalizedRecord.createdAt || new Date().toISOString()
        }, plantingAllocatedKeysByHarvest);
        assertHarvestRecordSupportsPlantingEvents(recordWithIdentity, plantingAllocatedKeysByHarvest);
        const sameContent = getHarvestRecordContentSignature(recordWithIdentity) ===
          getHarvestRecordContentSignature(existingRecord);
        if (sameContent) {
          results.push({
            index,
            id: existingRecord.id,
            recordUuid: existingRecord.recordUuid,
            duplicateKey,
            ok: true,
            duplicate: true,
            updated: true,
            unchanged: true,
            record: existingRecord,
            message: "保存済みの記録です"
          });
          return;
        }
        if (!normalizedRecord.updatedAt || !existingRecord.updatedAt ||
          normalizedRecord.updatedAt !== existingRecord.updatedAt) {
          throw new Error("この収穫記録は別の端末で更新されています。最新記録を読み込んでから編集してください");
        }
        const updatedAt = getNextHarvestRecordUpdatedAt(existingRecord.updatedAt);
        const canonicalRecord = { ...recordWithIdentity, updatedAt };
        writeRecordRow(
          sheet,
          existingRowNumber,
          headers,
          canonicalRecord,
          duplicateKey,
          new Date(updatedAt),
          normalizedRecord,
          suppliedSyncFields
        );
        recordSnapshot.recordsByRowNumber.set(existingRowNumber, canonicalRecord);
        results.push({
          index,
          id: canonicalRecord.id,
          recordUuid: canonicalRecord.recordUuid,
          duplicateKey,
          ok: true,
          duplicate: false,
          updated: true,
          record: canonicalRecord,
          message: "記録を更新しました"
        });
        return;
      }
      assertNoUnclaimedHarvestIdentityConflict(
        sheet,
        headers,
        normalizedRecord,
        recordSnapshot.rows
      );
      if (normalizedRecord.recordUuid && queuedUuids.has(normalizedRecord.recordUuid)) {
        throw new Error("同じ記録UUIDが一括送信内で重複しています");
      }
      if (!normalizedRecord.recordUuid && queuedIds.has(String(normalizedRecord.id))) {
        throw new Error("同じ記録IDが一括送信内で重複しています");
      }
      const duplicateRowNumber = normalizedRecord.recordUuid
        ? 0
        : findDuplicateRecordRow(
            sheet,
            headers,
            duplicateKey,
            normalizedRecord,
            recordSnapshot.rows
          );
      const isDuplicate = duplicateRowNumber > 0 ||
        (!normalizedRecord.recordUuid && candidateKeys.some(key => existingKeys.has(key)));

      if (isDuplicate) {
        const duplicateRecord = duplicateRowNumber > 0
          ? recordSnapshot.recordsByRowNumber.get(duplicateRowNumber) || null
          : null;
        results.push({
          index,
          id: duplicateRecord ? duplicateRecord.id : normalizedRecord.id,
          recordUuid: duplicateRecord && duplicateRecord.recordUuid || "",
          duplicateKey,
          ok: true,
          duplicate: true,
          updated: false,
          record: duplicateRecord,
          message: "保存済みの記録です"
        });
        return;
      }

      const now = new Date().toISOString();
      const canonicalId = normalizedRecord.recordUuid
        ? allocateHarvestRecordId(normalizedRecord.id, unavailableRecordIds)
        : normalizedRecord.id;
      const canonicalRecord = applyPlantingLocationSummaryToHarvestRecord({
        ...normalizedRecord,
        id: canonicalId,
        recordUuid: normalizedRecord.recordUuid || Utilities.getUuid().toLowerCase(),
        createdAt: normalizedRecord.createdAt || now,
        updatedAt: now
      }, plantingAllocatedKeysByHarvest);
      assertHarvestRecordSupportsPlantingEvents(canonicalRecord, plantingAllocatedKeysByHarvest);
      rowsToAppend.push(buildRecordRow(headers, canonicalRecord, duplicateKey, new Date(now)));
      writeMarkersToAppend.push(
        buildHarvestWriteMarker(normalizedRecord, canonicalRecord, suppliedSyncFields)
      );
      queuedUuids.add(canonicalRecord.recordUuid);
      queuedIds.add(String(canonicalRecord.id));
      unavailableRecordIds.add(String(canonicalRecord.id));
      candidateKeys.forEach(key => existingKeys.add(key));
      results.push({
        index,
        id: canonicalRecord.id,
        recordUuid: canonicalRecord.recordUuid,
        duplicateKey,
        ok: true,
        duplicate: false,
        updated: false,
        record: canonicalRecord,
        message: "保存しました"
      });
    } catch (err) {
      results.push({
        index,
        id: record && record.id,
        ok: false,
        duplicate: false,
        message: String(err && err.message ? err.message : err)
      });
    }
  });

  if (rowsToAppend.length) {
    try {
      appendKnownRecordRows(sheet, headers, rowsToAppend, writeMarkersToAppend);
    } catch (err) {
      throw new Error("収穫記録の新規行の書き込み中に失敗しました: " +
        String(err && err.message || err));
    }
  }

  return {
    total: records.length,
    saved: results.filter(result => result.ok && !result.duplicate).length,
    updated: results.filter(result => result.ok && result.updated).length,
    duplicate: results.filter(result => result.ok && result.duplicate).length,
    failed: results.filter(result => !result.ok).length,
    results
  };
}

function buildRecordRow(headers, record, duplicateKey, receivedAt) {
  const rowObject = {
    duplicateKey,
    id: record.id ?? "",
    recordUuid: record.recordUuid || "",
    type: record.type || "",
    date: record.date || "",
    cases: record.cases ?? "",
    palletSummary: escapeSpreadsheetFormulaText(record.palletSummary || ""),
    plannedSeedlingTrayCount: record.plannedSeedlingTrayCount ?? "",
    plantingCaseInstruction: escapeSpreadsheetFormulaText(record.plantingCaseInstruction || ""),
    plantingSummary: escapeSpreadsheetFormulaText(record.plantingSummary || ""),
    plantingDate: record.plantingDate || "",
    actualSeedlingTrayCount: record.actualSeedlingTrayCount ?? "",
    actualSeedlingCarryoverMode: record.actualSeedlingCarryoverMode || "loss",
    actualSeedlingLossRate: record.actualSeedlingLossRate ?? "",
    actualLoss: record.actualLoss ?? "",
    qualityText: escapeSpreadsheetFormulaText(formatQualityTextValue(record)),
    sizeRating: formatSizeRatingValue(record.sizeRating),
    plantingAge: escapeSpreadsheetFormulaText(formatPlantingAgeValue(record.plantingAge)),
    memo: escapeSpreadsheetFormulaText(record.memo || ""),
    palletKeys: JSON.stringify(record.palletKeys || []),
    plantingPalletKeys: JSON.stringify(record.plantingPalletKeys || []),
    targets: JSON.stringify(record.targets || []),
    createdAt: toHarvestRecordSheetTimestamp(record.createdAt),
    updatedAt: toHarvestRecordSheetTimestamp(record.updatedAt),
    receivedAt,
    palletNumberingVersion: CURRENT_PALLET_NUMBERING_VERSION
  };

  return headers.map(header => rowObject[getHeaderKey(header)] ?? "");
}

function toHarvestRecordSheetTimestamp(value) {
  if (!value) return "";
  if (Object.prototype.toString.call(value) === "[object Date]") return value;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date : "";
}

function writeRecordRow(
  sheet,
  rowNumber,
  headers,
  record,
  duplicateKey,
  receivedAt,
  requestRecord,
  suppliedSyncFields,
  writeOperation
) {
  const row = buildRecordRow(headers, record, duplicateKey, receivedAt);
  writeKnownRecordRows(
    sheet,
    rowNumber,
    headers,
    [row],
    [buildHarvestWriteMarker(
      requestRecord || record,
      record,
      suppliedSyncFields,
      writeOperation
    )]
  );
  if (!hasCompletedRecordWrite(sheet, rowNumber, headers)) {
    throw new Error("収穫記録行が完了状態になっていません");
  }
}

function hasCompletedRecordWrite(sheet, rowNumber, headers) {
  const receivedAtColumn = getHeaderColumn(headers, "receivedAt");
  if (receivedAtColumn <= 0) return false;
  const value = sheet.getRange(rowNumber, receivedAtColumn).getValue();
  return isCommittedWriteTimestamp(value);
}

function appendRecordRow(
  sheet,
  headers,
  record,
  duplicateKey,
  receivedAt,
  requestRecord,
  suppliedSyncFields,
  writeOperation
) {
  const row = buildRecordRow(headers, record, duplicateKey, receivedAt);
  appendKnownRecordRows(
    sheet,
    headers,
    [row],
    [buildHarvestWriteMarker(
      requestRecord || record,
      record,
      suppliedSyncFields,
      writeOperation
    )]
  );
}

function appendKnownRecordRows(sheet, headers, rows, writeMarkers) {
  if (!rows.length) return;
  let startRow;
  try {
    startRow = getLastRecordRow(sheet, headers) + 1;
  } catch (err) {
    throw new Error("収穫記録の追加位置の確認中に失敗しました: " +
      String(err && err.message || err));
  }
  writeKnownRecordRows(sheet, startRow, headers, rows, writeMarkers);
  for (let index = 0; index < rows.length; index++) {
    if (!hasCompletedRecordWrite(sheet, startRow + index, headers)) {
      throw new Error("収穫記録行が完了状態になっていません: 行" + (startRow + index));
    }
  }
}

function getLastRecordRow(sheet, headers) {
  if (!sheet) throw new Error("記録シートがありません");
  // getNextDataCell(Direction.UP) は、結合セルや古いフィルターが
  // 残るシートで「引数が無効です」になることがあるため使わない。
  // 手動列にデータがある場合も、その下に追加する方が既存値を安全に保護できる。
  return Math.max(1, sheet.getLastRow());
}

function writeKnownRecordRows(sheet, startRow, headers, rows, writeMarkers) {
  if (!rows.length) return;
  if (!Number.isSafeInteger(startRow) || startRow < 2 || !headers.length) {
    throw new Error("収穫記録の書き込み位置が正しくありません");
  }

  const safeRows = rows.map(row => headers.map((header, index) => {
    const key = getHeaderKey(header);
    return RECORD_FORMULA_SAFE_TEXT_KEYS.has(key)
      ? escapeSpreadsheetFormulaText(row[index])
      : row[index];
  }));

  const requiredLastRow = startRow + safeRows.length - 1;
  try {
    const maxColumns = sheet.getMaxColumns();
    if (headers.length > maxColumns) {
      sheet.insertColumnsAfter(maxColumns, headers.length - maxColumns);
    }
    const maxRows = sheet.getMaxRows();
    if (requiredLastRow > maxRows) {
      sheet.insertRowsAfter(maxRows, requiredLastRow - maxRows);
    }
    const finalMaxColumns = sheet.getMaxColumns();
    const finalMaxRows = sheet.getMaxRows();
    if (finalMaxColumns < headers.length || finalMaxRows < requiredLastRow) {
      throw new Error(
        "シートの拡張後サイズが不足しています" +
        "（必要: " + requiredLastRow + "行×" + headers.length + "列、" +
        "実際: " + finalMaxRows + "行×" + finalMaxColumns + "列）"
      );
    }
  } catch (err) {
    throw new Error(
      "収穫記録の書き込み行の確保中に失敗しました" +
      "（開始行: " + startRow + "、件数: " + safeRows.length + "、列数: " + headers.length + "）: " +
      String(err && err.message || err)
    );
  }

  const knownColumns = headers
    .map((header, index) => ({ index, key: getHeaderKey(header) }))
    .filter(item => !!item.key);
  if (!knownColumns.length) {
    throw new Error("記録シートに書き込み可能な既知列がありません");
  }

  const writeColumn = (item, values, actionLabel) => {
    setHarvestRecordColumnValuesWithValidationRecovery(
      sheet,
      startRow,
      item.index + 1,
      values,
      HEADER_LABELS[item.key] || item.key,
      actionLabel
    );
  };

  const receivedAtColumn = knownColumns.find(item => item.key === "receivedAt");
  if (receivedAtColumn) {
    if (!Array.isArray(writeMarkers) || writeMarkers.length !== safeRows.length) {
      throw new Error("収穫記録の未完了マーカーが正しくありません");
    }
    writeColumn(
      receivedAtColumn,
      writeMarkers.map(marker => [String(marker || "")]),
      "未完了状態への更新"
    );
    try {
      SpreadsheetApp.flush();
    } catch (err) {
      throw new Error("受信日時列を未完了状態にした後の反映に失敗しました: " +
        String(err && err.message || err));
    }
  }

  knownColumns
    .filter(item => item.key !== "receivedAt")
    .forEach(item => {
      writeColumn(
        item,
        safeRows.map(row => [row[item.index]]),
        "更新"
      );
    });

  if (receivedAtColumn) {
    writeColumn(
      receivedAtColumn,
      safeRows.map(row => [row[receivedAtColumn.index]]),
      "完了状態への更新"
    );
  }
}

function normalizeHarvestRecordCellValue(value) {
  if (value === null || typeof value === "undefined") return "";
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Number.isFinite(value.getTime()) ? value : "";
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : "";
  if (typeof value === "string" || typeof value === "boolean") return value;
  return String(value);
}

function setHarvestRecordColumnValuesWithValidationRecovery(
  sheet,
  startRow,
  column,
  values,
  columnLabel,
  actionLabel
) {
  const normalizedValues = values.map(row => [normalizeHarvestRecordCellValue(row[0])]);
  let targetRange;
  try {
    targetRange = sheet.getRange(startRow, column, normalizedValues.length, 1);
  } catch (err) {
    throw new Error(
      "列「" + columnLabel + "」の書き込み範囲の作成に失敗しました" +
      "（開始行: " + startRow + "、件数: " + normalizedValues.length + "、列: " + column + "）: " +
      String(err && err.message || err)
    );
  }
  try {
    targetRange.setValues(normalizedValues);
  } catch (err) {
    // 過去の入力規則が残っていると、有効な記録でも
    // Apps Scriptが「引数が無効です」だけを返す場合がある。
    // アプリが管理する列に限り入力規則を解除して再試行する。
    try {
      targetRange.clearDataValidations();
      if (normalizedValues.length === 1) targetRange.setValue(normalizedValues[0][0]);
      else targetRange.setValues(normalizedValues);
    } catch (retryErr) {
      throw new Error(
        "列「" + columnLabel + "」の" + actionLabel + "に失敗しました: " +
        String(retryErr && retryErr.message || retryErr) +
        "（初回: " + String(err && err.message || err) + "）"
      );
    }
  }
}

function getKnownRecordColumnSegments(headers) {
  const segments = [];
  let startIndex = -1;

  for (let index = 0; index <= headers.length; index++) {
    const key = index < headers.length ? getHeaderKey(headers[index]) : "";
    const isKnown = !!key && key !== "receivedAt";
    if (isKnown && startIndex < 0) {
      startIndex = index;
      continue;
    }
    if (!isKnown && startIndex >= 0) {
      segments.push({
        startIndex,
        length: index - startIndex
      });
      startIndex = -1;
    }
  }

  if (!segments.length) {
    throw new Error("記録シートに書き込み可能な既知列がありません。");
  }

  const idIndex = headers.findIndex(header => getHeaderKey(header) === "id");
  const idSegment = segments.find(segment => (
    idIndex >= segment.startIndex && idIndex < segment.startIndex + segment.length
  ));
  const orderedSegments = [];

  if (idSegment) orderedSegments.push(idSegment);
  segments.forEach(segment => {
    if (segment === idSegment) return;
    orderedSegments.push(segment);
  });
  return orderedSegments;
}

function remapRecordRow(sourceHeaders, sourceRow, targetHeaders) {
  const valuesByKey = {};
  sourceHeaders.forEach((header, index) => {
    const key = getHeaderKey(header);
    if (!key) return;
    valuesByKey[key] = sourceRow[index];
  });

  return targetHeaders.map(header => {
    const key = getHeaderKey(header);
    return key ? (valuesByKey[key] ?? "") : "";
  });
}

function readHarvestRecordRows(sheet, headers) {
  const rowCount = sheet ? Math.max(sheet.getLastRow() - 1, 0) : 0;
  return rowCount
    ? sheet.getRange(2, 1, rowCount, headers.length).getValues()
    : [];
}

function assertNoUnrepairedDirectHarvestRows(headers, rows) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const significantKeys = ["id", "recordUuid", "type", "date", "cases"];
  const significantColumns = significantKeys
    .map(key => getHeaderColumn(headers, key))
    .filter(column => column > 0);
  const rowNumbers = [];

  sourceRows.forEach((row, index) => {
    if (isCommittedHarvestRecordRow(headers, row)) return;
    if (getHarvestWriteMarker(headers, row)) return;
    const hasDirectInput = significantColumns.some(column => (
      String(row[column - 1] == null ? "" : row[column - 1]).trim() !== ""
    ));
    if (hasDirectInput) rowNumbers.push(index + 2);
  });
  if (!rowNumbers.length) return;

  const shownRows = rowNumbers.slice(0, 3).join("、");
  const remaining = rowNumbers.length > 3
    ? "（ほか" + (rowNumbers.length - 3) + "行）"
    : "";
  throw new Error(
    "記録シートの" + shownRows + "行目" + remaining +
    "に、直接入力された未同期の行があります。" +
    "Apps Scriptで repairHarvestRecordSyncMetadata を実行してください"
  );
}

function buildHarvestRecordBatchSnapshot(headers, rows) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  assertNoUnrepairedDirectHarvestRows(headers, sourceRows);
  const byUuid = new Map();
  const byId = new Map();
  const recordsByRowNumber = new Map();
  const existingKeys = new Set();
  const unavailableRecordIds = new Set();
  const uuidColumn = getHeaderColumn(headers, "recordUuid");
  const idColumn = getHeaderColumn(headers, "id");

  if (uuidColumn <= 0 || idColumn <= 0) {
    throw new Error("記録シートに同期識別子の列がありません");
  }

  sourceRows.forEach((row, index) => {
    const rowNumber = index + 2;
    const rowId = String(row[idColumn - 1] == null ? "" : row[idColumn - 1]).trim();
    if (rowId) unavailableRecordIds.add(rowId);

    const marker = getHarvestWriteMarker(headers, row);
    const markerId = marker
      ? String(marker.canonicalId == null ? "" : marker.canonicalId).trim()
      : "";
    if (markerId) unavailableRecordIds.add(markerId);
    if (!isCommittedHarvestRecordRow(headers, row)) return;

    const record = rowToRecord(headers, row);
    const recordUuid = String(record.recordUuid || "").trim().toLowerCase();
    const recordId = String(record.id == null ? "" : record.id).trim();
    if (recordUuid) {
      if (byUuid.has(recordUuid)) {
        throw new Error("記録シートに同じ記録UUIDが重複しています");
      }
      byUuid.set(recordUuid, rowNumber);
    }
    if (recordId) {
      if (byId.has(recordId)) {
        throw new Error("記録シートに同じ記録IDが重複しています: " + recordId);
      }
      byId.set(recordId, rowNumber);
    }
    recordsByRowNumber.set(rowNumber, record);
    getRecordDuplicateKeysForCheck(record, record.duplicateKey)
      .forEach(key => existingKeys.add(key));
  });

  return {
    rows: sourceRows,
    recordRowLookup: { byUuid, byId },
    recordsByRowNumber,
    existingKeys,
    unavailableRecordIds
  };
}

function getExistingDuplicateKeySet(sheet, headers) {
  const set = new Set();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return set;

  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  values.forEach(row => {
    if (!isCommittedHarvestRecordRow(headers, row)) return;
    const record = rowToRecord(headers, row);
    getRecordDuplicateKeysForCheck(record, record.duplicateKey).forEach(key => set.add(key));
  });

  return set;
}

function findRecordRowById(sheet, headers, id) {
  const targetId = String(id ?? "").trim();
  const idColumn = getHeaderColumn(headers, "id");
  const lastRow = sheet.getLastRow();
  if (!targetId || idColumn <= 0 || lastRow < 2) return 0;

  const rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  const matches = [];
  rows.forEach((row, index) => {
    if (!isCommittedHarvestRecordRow(headers, row)) return;
    if (String(row[idColumn - 1] ?? "").trim() === targetId) matches.push(index + 2);
  });
  if (matches.length > 1) throw new Error("記録シートに同じ記録IDが重複しています: " + targetId);
  return matches[0] || 0;
}

function findRecordRowByUuid(sheet, headers, recordUuid) {
  const targetUuid = String(recordUuid == null ? "" : recordUuid).trim().toLowerCase();
  const uuidColumn = getHeaderColumn(headers, "recordUuid");
  const lastRow = sheet.getLastRow();
  if (!targetUuid || uuidColumn <= 0 || lastRow < 2) return 0;
  const rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  const matches = [];
  rows.forEach((row, index) => {
    if (!isCommittedHarvestRecordRow(headers, row)) return;
    if (String(row[uuidColumn - 1] == null ? "" : row[uuidColumn - 1]).trim().toLowerCase() ===
      targetUuid) matches.push(index + 2);
  });
  if (matches.length > 1) throw new Error("記録シートに同じ記録UUIDが重複しています");
  return matches[0] || 0;
}

function getHarvestRecordAtRow(sheet, rowNumber, headers) {
  if (!sheet || rowNumber < 2) throw new Error("収穫記録の行が正しくありません");
  const row = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  if (!isCommittedHarvestRecordRow(headers, row)) {
    throw new Error("収穫記録の書き込みが完了していません");
  }
  return rowToRecord(headers, row);
}

function findHarvestRecordRowForMutation(sheet, headers, record) {
  const recordUuid = String(record && record.recordUuid || "").trim().toLowerCase();
  if (recordUuid) {
    const uuidRow = findRecordRowByUuid(sheet, headers, recordUuid);
    if (uuidRow > 0) return uuidRow;
    return 0;
  }

  const idRow = findRecordRowById(sheet, headers, record && record.id);
  return idRow > 0 ? idRow : 0;
}

function buildHarvestRecordRowLookup(sheet, headers) {
  const byUuid = new Map();
  const byId = new Map();
  if (!sheet || sheet.getLastRow() < 2) return { byUuid, byId };
  const rowCount = sheet.getLastRow() - 1;
  const uuidColumn = getHeaderColumn(headers, "recordUuid");
  const idColumn = getHeaderColumn(headers, "id");
  if (uuidColumn <= 0 || idColumn <= 0) {
    throw new Error("記録シートに同期識別子の列がありません");
  }
  const uuids = sheet.getRange(2, uuidColumn, rowCount, 1).getValues();
  const ids = sheet.getRange(2, idColumn, rowCount, 1).getValues();
  const receivedAtColumn = getHeaderColumn(headers, "receivedAt");
  const receivedValues = receivedAtColumn > 0
    ? sheet.getRange(2, receivedAtColumn, rowCount, 1).getValues()
    : Array(rowCount).fill([new Date(0)]);
  for (let index = 0; index < rowCount; index++) {
    if (receivedAtColumn > 0 &&
      !isCommittedWriteTimestamp(receivedValues[index] && receivedValues[index][0])) continue;
    const rowNumber = index + 2;
    const recordUuid = String(uuids[index][0] || "").trim().toLowerCase();
    const id = String(ids[index][0] == null ? "" : ids[index][0]).trim();
    if (recordUuid) {
      if (byUuid.has(recordUuid)) {
        throw new Error("記録シートに同じ記録UUIDが重複しています");
      }
      byUuid.set(recordUuid, rowNumber);
    }
    if (id) {
      if (byId.has(id)) throw new Error("記録シートに同じ記録IDが重複しています: " + id);
      byId.set(id, rowNumber);
    }
  }
  return { byUuid, byId };
}

function getActiveHarvestRecordIdSet(sheet, headers, sourceRows) {
  const ids = new Set();
  const idColumn = getHeaderColumn(headers, "id");
  if (!sheet || idColumn <= 0) return ids;
  const rows = Array.isArray(sourceRows)
    ? sourceRows
    : readHarvestRecordRows(sheet, headers);
  rows.forEach(row => {
    const id = String(row[idColumn - 1] == null ? "" : row[idColumn - 1]).trim();
    if (id) ids.add(id);
    const marker = getHarvestWriteMarker(headers, row);
    const markerId = marker
      ? String(marker.canonicalId == null ? "" : marker.canonicalId).trim()
      : "";
    if (markerId) ids.add(markerId);
  });
  return ids;
}

function getUnavailableHarvestRecordIdSet(
  sheet,
  headers,
  deletedRecordIdentities,
  sourceRows
) {
  const ids = getActiveHarvestRecordIdSet(sheet, headers, sourceRows);
  (deletedRecordIdentities || new Set()).forEach(identity => {
    if (String(identity).startsWith("i:")) ids.add(String(identity).slice(2));
  });
  return ids;
}

function allocateHarvestRecordId(preferredId, unavailableIds) {
  const preferred = normalizeRequiredInteger(
    preferredId,
    "記録ID",
    1,
    Number.MAX_SAFE_INTEGER
  );
  const occupied = unavailableIds || new Set();
  if (!occupied.has(String(preferred))) return preferred;

  let candidate = Math.max(1, Date.now());
  while (candidate <= Number.MAX_SAFE_INTEGER && occupied.has(String(candidate))) {
    candidate++;
  }
  if (candidate > Number.MAX_SAFE_INTEGER) {
    throw new Error("空いている記録IDを採番できませんでした");
  }
  return candidate;
}

function restoreSeedlingTrayCountFromAccidentalDate(value) {
  if (Object.prototype.toString.call(value) !== "[object Date]" || !Number.isFinite(value.getTime())) {
    return value;
  }
  // 苗枚数列に日付書式が付いた場合、Sheetsは枚数を1899-12-30起点の日付として返す。
  if (value.getFullYear() > 1910) return value;
  const sheetsEpoch = Date.UTC(1899, 11, 30);
  const serial = Math.round((value.getTime() - sheetsEpoch) / (24 * 60 * 60 * 1000));
  return serial >= 0 ? serial : value;
}

function repairHarvestRecordSyncMetadataRows(sheet, headers, options) {
  if (!sheet) return 0;
  const normalizedOptions = options && typeof options === "object" ? options : {};
  const suppliedRows = Array.isArray(normalizedOptions.rows)
    ? normalizedOptions.rows
    : null;
  if (!suppliedRows && sheet.getLastRow() < 2) return 0;
  if (suppliedRows && !suppliedRows.length) return 0;
  const uuidColumn = getHeaderColumn(headers, "recordUuid");
  const idColumn = getHeaderColumn(headers, "id");
  const createdAtColumn = getHeaderColumn(headers, "createdAt");
  const updatedAtColumn = getHeaderColumn(headers, "updatedAt");
  const receivedAtColumn = getHeaderColumn(headers, "receivedAt");
  const typeColumn = getHeaderColumn(headers, "type");
  const dateColumn = getHeaderColumn(headers, "date");
  const casesColumn = getHeaderColumn(headers, "cases");
  const plannedSeedlingTrayColumn = getHeaderColumn(headers, "plannedSeedlingTrayCount");
  const actualSeedlingTrayColumn = getHeaderColumn(headers, "actualSeedlingTrayCount");
  if (uuidColumn <= 0 || idColumn <= 0 || createdAtColumn <= 0 || updatedAtColumn <= 0) {
    throw new Error("記録シートに同期情報の列がありません");
  }

  const rows = suppliedRows || readHarvestRecordRows(sheet, headers);
  const rowCount = rows.length;
  if (!rowCount) return 0;
  const seenUuids = new Set();
  const deletedRecordIdentities = normalizedOptions.deletedRecordIdentities instanceof Set
    ? normalizedOptions.deletedRecordIdentities
    : getDeletedHarvestRecordIdentitySet();
  const unavailableIds = getUnavailableHarvestRecordIdSet(
    sheet,
    headers,
    deletedRecordIdentities,
    rows
  );
  const seenIds = new Set();
  let changed = 0;
  const now = new Date();
  rows.forEach((row, index) => {
    if (!row.some(value => String(value == null ? "" : value).trim() !== "")) return;

    const rawId = String(row[idColumn - 1] == null ? "" : row[idColumn - 1]).trim();
    const hasRecordCore = String(row[dateColumn - 1] == null ? "" : row[dateColumn - 1]).trim() !== "" &&
      String(row[casesColumn - 1] == null ? "" : row[casesColumn - 1]).trim() !== "";
    // メモだけの途中行などは収穫記録として採番・同期しない。
    if (!rawId && !hasRecordCore) return;
    const repairDirectlyAddedRow = !isCommittedHarvestRecordRow(headers, row) &&
      normalizedOptions.includeRecognizableUncommittedRows === true &&
      !getHarvestWriteMarker(headers, row);
    if (!isCommittedHarvestRecordRow(headers, row) && !repairDirectlyAddedRow) return;
    if (repairDirectlyAddedRow) {
      const type = typeColumn > 0
        ? String(row[typeColumn - 1] || "").trim()
        : "";
      if (!hasRecordCore || !RECORD_TYPES.includes(type)) {
        throw new Error(
          "記録シートの" + (index + 2) +
          "行目を収穫記録として補完できません。記録種別・収穫日・ケース数を確認してください"
        );
      }
    }

    [plannedSeedlingTrayColumn, actualSeedlingTrayColumn].forEach(column => {
      if (column <= 0) return;
      const restoredValue = restoreSeedlingTrayCountFromAccidentalDate(row[column - 1]);
      if (restoredValue !== row[column - 1]) {
        row[column - 1] = restoredValue;
        changed++;
      }
    });

    let id = normalizeOptionalInteger(
      row[idColumn - 1],
      "記録ID",
      1,
      Number.MAX_SAFE_INTEGER,
      null
    );
    if (id === null) {
      id = allocateHarvestRecordId(Date.now(), unavailableIds);
      row[idColumn - 1] = id;
      unavailableIds.add(String(id));
      changed++;
    }
    if (seenIds.has(String(id))) {
      throw new Error(
        "記録シートに同じ記録IDが重複しています。苗植え参照を保護するため同期を中止しました: " + id
      );
    }
    seenIds.add(String(id));
    let uuid = String(row[uuidColumn - 1] == null ? "" : row[uuidColumn - 1]).trim().toLowerCase();
    if (uuid) {
      uuid = normalizeOptionalRecordUuid(uuid);
      if (seenUuids.has(uuid)) {
        throw new Error("記録シートに同じ記録UUIDが重複しています。データ保護のため同期を中止しました");
      }
    } else {
      do {
        uuid = Utilities.getUuid().toLowerCase();
      } while (seenUuids.has(uuid));
      row[uuidColumn - 1] = uuid;
      changed++;
    }
    seenUuids.add(uuid);

    const receivedValue = receivedAtColumn > 0 ? row[receivedAtColumn - 1] : "";
    const receivedTime = new Date(receivedValue || "").getTime();
    const fallbackDate = Number.isFinite(receivedTime) ? new Date(receivedTime) : now;
    const createdTime = new Date(row[createdAtColumn - 1] || "").getTime();
    if (!Number.isFinite(createdTime)) {
      row[createdAtColumn - 1] = fallbackDate;
      changed++;
    }
    const updatedTime = new Date(row[updatedAtColumn - 1] || "").getTime();
    if (!Number.isFinite(updatedTime)) {
      row[updatedAtColumn - 1] = fallbackDate;
      changed++;
    }
    if (repairDirectlyAddedRow) {
      try {
        normalizeHarvestRecord(rowToRecord(headers, row));
      } catch (err) {
        throw new Error(
          "記録シートの" + (index + 2) +
          "行目を安全に補完できません: " +
          String(err && err.message ? err.message : err)
        );
      }
      row[receivedAtColumn - 1] = fallbackDate;
      changed++;
    }
  });
  if (!changed) return 0;

  if (normalizedOptions.writeChanges !== false) {
    writeHarvestRecordSyncMetadataRows(sheet, headers, rows);
  }
  return changed;
}

function writeHarvestRecordSyncMetadataRows(sheet, headers, rows) {
  if (!sheet || !Array.isArray(rows) || !rows.length) return 0;
  const idColumn = getHeaderColumn(headers, "id");
  const uuidColumn = getHeaderColumn(headers, "recordUuid");
  const createdAtColumn = getHeaderColumn(headers, "createdAt");
  const updatedAtColumn = getHeaderColumn(headers, "updatedAt");
  const receivedAtColumn = getHeaderColumn(headers, "receivedAt");
  const plannedSeedlingTrayColumn = getHeaderColumn(headers, "plannedSeedlingTrayCount");
  const actualSeedlingTrayColumn = getHeaderColumn(headers, "actualSeedlingTrayCount");

  setHarvestRecordColumnValuesWithValidationRecovery(
    sheet, 2, idColumn, rows.map(row => [row[idColumn - 1]]), HEADER_LABELS.id, "同期情報の補完"
  );
  setHarvestRecordColumnValuesWithValidationRecovery(
    sheet, 2, uuidColumn, rows.map(row => [row[uuidColumn - 1]]), HEADER_LABELS.recordUuid, "同期情報の補完"
  );
  setHarvestRecordColumnValuesWithValidationRecovery(
    sheet, 2, createdAtColumn, rows.map(row => [row[createdAtColumn - 1]]), HEADER_LABELS.createdAt, "同期情報の補完"
  );
  setHarvestRecordColumnValuesWithValidationRecovery(
    sheet, 2, updatedAtColumn, rows.map(row => [row[updatedAtColumn - 1]]), HEADER_LABELS.updatedAt, "同期情報の補完"
  );
  if (receivedAtColumn > 0) {
    setHarvestRecordColumnValuesWithValidationRecovery(
      sheet,
      2,
      receivedAtColumn,
      rows.map(row => [row[receivedAtColumn - 1]]),
      HEADER_LABELS.receivedAt,
      "同期情報の補完"
    );
  }
  if (plannedSeedlingTrayColumn > 0) {
    setHarvestRecordColumnValuesWithValidationRecovery(
      sheet,
      2,
      plannedSeedlingTrayColumn,
      rows.map(row => [row[plannedSeedlingTrayColumn - 1]]),
      HEADER_LABELS.plannedSeedlingTrayCount,
      "同期情報の補完"
    );
  }
  if (actualSeedlingTrayColumn > 0) {
    setHarvestRecordColumnValuesWithValidationRecovery(
      sheet,
      2,
      actualSeedlingTrayColumn,
      rows.map(row => [row[actualSeedlingTrayColumn - 1]]),
      HEADER_LABELS.actualSeedlingTrayCount,
      "同期情報の補完"
    );
  }
  return rows.length;
}

function getRecordDuplicateKeysForCheck(record, duplicateKey) {
  return [
    String(duplicateKey || "").trim(),
    makeDuplicateKey(record)
  ].filter(Boolean);
}

function findDuplicateRecordRow(sheet, headers, duplicateKey, record, sourceRows) {
  const acceptableKeys = new Set(getRecordDuplicateKeysForCheck(record, duplicateKey));
  const rows = Array.isArray(sourceRows)
    ? sourceRows
    : readHarvestRecordRows(sheet, headers);
  if (!rows.length) return 0;
  const index = rows.findIndex(row => {
    if (!isCommittedHarvestRecordRow(headers, row)) return false;
    const existingRecord = rowToRecord(headers, row);
    return getRecordDuplicateKeysForCheck(existingRecord, existingRecord.duplicateKey)
      .some(key => acceptableKeys.has(key));
  });
  return index >= 0 ? index + 2 : 0;
}

function listRecords(options) {
  const normalizedOptions = normalizeRecordListOptions(
    typeof options === "undefined" ? {} : options
  );
  return listHarvestRecordsForSync(normalizedOptions).records;
}

function listHarvestRecordsForSync(normalizedOptions) {
  return withRecordReadLock(() => {
    const sheet = getExistingRecordSheet();
    const headers = getRecordHeadersForRead(sheet);
    let hasMore = false;
    let nextCursor = normalizedOptions.cursor || null;
    let rows = [];
    if (sheet && headers.length && sheet.getLastRow() >= 2) {
      if (normalizedOptions.syncMode) {
        const page = getHarvestRecordRowsForSyncPage(sheet, headers, normalizedOptions);
        rows = page.rows;
        hasMore = page.hasMore;
        nextCursor = page.nextCursor;
      } else {
        rows = getRecordRowsForList(sheet, headers, normalizedOptions);
      }
    }
    const records = rows
      .filter(row => isCommittedHarvestRecordRow(headers, row))
      .map(row => rowToRecord(headers, row))
      .filter(record => {
        const hasId = String(record.id == null ? "" : record.id).trim() !== "";
        const hasDateAndCases = String(record.date || "").trim() !== "" &&
          String(record.cases == null ? "" : record.cases).trim() !== "";
        return hasId || hasDateAndCases;
      });
    return {
      records,
      deletedRecords: listDeletedHarvestRecordTombstonesUnlocked(),
      hasMore,
      nextCursor
    };
  });
}

function getHarvestRecordRowsForSyncPage(sheet, headers, options) {
  const rowCount = sheet.getLastRow() - 1;
  if (rowCount <= 0) {
    return { rows: [], hasMore: false, nextCursor: options.cursor || null };
  }
  const limit = options.limit || RECORD_LIST_LIMIT;
  const updatedAtColumn = getHeaderColumn(headers, "updatedAt");
  const uuidColumn = getHeaderColumn(headers, "recordUuid");
  const dateColumn = getHeaderColumn(headers, "date");
  const casesColumn = getHeaderColumn(headers, "cases");
  if (updatedAtColumn <= 0 || uuidColumn <= 0) {
    throw new Error("記録シートに同期カーソル用の列がありません");
  }
  const allRows = sheet.getRange(2, 1, rowCount, headers.length).getValues();
  assertNoUnrepairedDirectHarvestRows(headers, allRows);
  const cursorTime = options.cursor
    ? new Date(options.cursor.updatedAt).getTime()
    : -Infinity;
  const cursorUuid = options.cursor ? options.cursor.recordUuid : "";
  const items = allRows
    .map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(item => isCommittedHarvestRecordRow(headers, item.row))
    .filter(item => {
      const row = item.row;
      const hasDateAndCases = String(row[dateColumn - 1] == null ? "" : row[dateColumn - 1]).trim() !== "" &&
        String(row[casesColumn - 1] == null ? "" : row[casesColumn - 1]).trim() !== "";
      return hasDateAndCases;
    })
    .map(item => {
      const row = item.row;
      const updatedAt = formatHarvestRecordTimestamp(row[updatedAtColumn - 1]);
      const updatedTime = new Date(updatedAt || "").getTime();
      const recordUuid = String(row[uuidColumn - 1] || "").trim().toLowerCase();
      if (!Number.isFinite(updatedTime) || !recordUuid) {
        throw new Error("記録シートの同期情報が正しくありません");
      }
      return { row, rowNumber: item.rowNumber, updatedAt, updatedTime, recordUuid };
    })
    .filter(item => (
      item.updatedTime > cursorTime ||
      (item.updatedTime === cursorTime && item.recordUuid > cursorUuid)
    ))
    .sort((a, b) => (
      a.updatedTime - b.updatedTime ||
      a.recordUuid.localeCompare(b.recordUuid) ||
      a.rowNumber - b.rowNumber
    ));
  const selected = items.slice(0, limit);
  const last = selected[selected.length - 1];
  return {
    rows: selected.map(item => item.row),
    hasMore: items.length > selected.length,
    nextCursor: last
      ? { updatedAt: last.updatedAt, recordUuid: last.recordUuid }
      : (options.cursor || null)
  };
}

function compactHarvestRecordForApi(record) {
  const palletKeys = normalizeDirectPalletKeys(
    parseStoredJsonArray(record && record.palletKeys, "収穫パレット"),
    "収穫パレット"
  );
  const plantingPalletKeys = normalizeDirectPalletKeys(
    parseStoredJsonArray(record && record.plantingPalletKeys, "苗植えパレット"),
    "苗植えパレット"
  );
  const compact = {
    ...record,
    palletRanges: compressPlantingPalletKeysToRanges(palletKeys),
    plantingRanges: compressPlantingPalletKeysToRanges(plantingPalletKeys)
  };
  delete compact.palletKeys;
  delete compact.plantingPalletKeys;
  return compact;
}

function buildHarvestRecordListApiResult(syncResult) {
  const allRecords = (syncResult.records || []).map(compactHarvestRecordForApi);
  const deletedRecords = syncResult.deletedRecords || [];
  const deletedRecordUuids = deletedRecords.map(item => item.recordUuid).filter(Boolean);
  const deletedRecordIds = deletedRecords
    .filter(item => !item.recordUuid)
    .map(item => item.id)
    .filter(id => id !== null);
  const getResponseLength = recordCount => JSON.stringify({
    records: allRecords.slice(0, recordCount),
    deletedRecordUuids,
    deletedRecordIds
  }).length;
  if (getResponseLength(0) > HARVEST_RECORD_API_RESPONSE_CHAR_LIMIT) {
    throw new Error("削除済み記録IDの応答が大きすぎます");
  }
  let low = 0;
  let high = allRecords.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (getResponseLength(middle) <= HARVEST_RECORD_API_RESPONSE_CHAR_LIMIT) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  if (allRecords.length && low === 0) {
    throw new Error("収穫記録1件の応答が大きすぎます");
  }
  const records = allRecords.slice(0, low);
  const lastRecord = records[records.length - 1];
  const responseTrimmed = records.length < allRecords.length;
  const nextCursor = responseTrimmed && lastRecord
    ? {
        updatedAt: String(lastRecord.updatedAt || ""),
        recordUuid: String(lastRecord.recordUuid || "")
      }
    : (syncResult.nextCursor || null);
  return {
    records,
    deletedRecordUuids,
    deletedRecordIds,
    hasMore: !!syncResult.hasMore || responseTrimmed,
    nextCursor,
    responseTrimmed
  };
}

function buildCombinedRecordSyncApiResult(syncResult, plantingSyncResult, options) {
  const recordResult = buildHarvestRecordListApiResult(syncResult);
  const deletedEventIds = listDeletedPlantingEventIds();
  const records = recordResult.records.slice();
  const events = (plantingSyncResult.events || []).slice();
  const recordCursorBefore = options && options.recordCursor || null;
  const plantingCursorBefore = options && options.plantingCursor || null;
  let recordsTrimmed = false;
  let eventsTrimmed = false;

  const buildResult = () => {
    const lastRecord = records[records.length - 1];
    const lastEvent = events[events.length - 1];
    return {
      records,
      deletedRecordUuids: recordResult.deletedRecordUuids,
      deletedRecordIds: recordResult.deletedRecordIds,
      hasMore: recordResult.hasMore || recordsTrimmed,
      nextCursor: recordsTrimmed
        ? (lastRecord
          ? {
              updatedAt: String(lastRecord.updatedAt || ""),
              recordUuid: String(lastRecord.recordUuid || "")
            }
          : recordCursorBefore)
        : recordResult.nextCursor,
      events,
      deletedEventIds,
      plantingHasMore: !!plantingSyncResult.hasMore || eventsTrimmed,
      plantingNextCursor: eventsTrimmed
        ? (lastEvent
          ? {
              updatedAt: getEffectivePlantingEventUpdatedAt(lastEvent),
              eventId: Number(lastEvent.eventId)
            }
          : plantingCursorBefore)
        : (plantingSyncResult.nextCursor || null)
    };
  };

  let result = buildResult();
  while (JSON.stringify(result).length > COMBINED_SYNC_API_RESPONSE_CHAR_LIMIT
    && records.length + events.length > 1) {
    const lastRecordLength = records.length
      ? JSON.stringify(records[records.length - 1]).length
      : -1;
    const lastEventLength = events.length
      ? JSON.stringify(events[events.length - 1]).length
      : -1;
    if (lastEventLength >= lastRecordLength) {
      events.pop();
      eventsTrimmed = true;
    } else {
      records.pop();
      recordsTrimmed = true;
    }
    result = buildResult();
  }
  if (JSON.stringify(result).length > COMBINED_SYNC_API_RESPONSE_CHAR_LIMIT) {
    throw new Error("収穫・苗植え記録の一括応答が大きすぎます");
  }
  return result;
}

function getRecordRowsForList(sheet, headers, options) {
  const lastRow = sheet.getLastRow();
  const rowCount = lastRow - 1;
  const recentDays = Number(options && options.recentDays || 0);
  const limit = Math.min(1000, Math.max(0, Math.floor(Number(options && options.limit || 0))));
  const hasRecentDays = Number.isFinite(recentDays) && recentDays > 0;
  const hasLimit = Number.isFinite(limit) && limit > 0;

  if (!hasRecentDays && !hasLimit) {
    return sheet.getRange(2, 1, rowCount, headers.length).getValues();
  }

  const dateColumn = getHeaderColumn(headers, "date");
  if (dateColumn <= 0) {
    if (hasLimit) {
      const count = Math.min(limit, rowCount);
      return sheet.getRange(lastRow - count + 1, 1, count, headers.length).getValues().reverse();
    }
    return sheet.getRange(2, 1, rowCount, headers.length).getValues();
  }

  const today = startOfScriptDay(new Date());
  const startDate = addScriptDays(today, -Math.max(0, Math.floor(recentDays) - 1));
  const endDate = addScriptDays(today, 1);
  const dateValues = sheet.getRange(2, dateColumn, rowCount, 1).getValues();
  const rowItems = [];

  dateValues.forEach((row, index) => {
    const date = parseRecordDateValue(row[0]);
    if (!date) return;
    const day = startOfScriptDay(date);
    if (hasRecentDays && (day.getTime() < startDate.getTime() || day.getTime() >= endDate.getTime())) {
      return;
    }
    rowItems.push({
      rowNumber: index + 2,
      time: day.getTime()
    });
  });

  if (hasLimit) {
    const rowNumbers = rowItems
      .sort((a, b) => {
        if (a.time !== b.time) return b.time - a.time;
        return b.rowNumber - a.rowNumber;
      })
      .slice(0, limit)
      .map(item => item.rowNumber);
    return getRowsByRowNumbersPreservingOrder(sheet, rowNumbers, headers.length);
  }

  const rowNumbers = rowItems.map(item => item.rowNumber);
  return getRowsByRowNumbers(sheet, rowNumbers, headers.length);
}

function getRowsByRowNumbersPreservingOrder(sheet, rowNumbers, columnCount) {
  if (!rowNumbers.length) return [];

  const sortedRowNumbers = rowNumbers.slice().sort((a, b) => a - b);
  const sortedRows = getRowsByRowNumbers(sheet, sortedRowNumbers, columnCount);
  const rowsByNumber = {};
  sortedRowNumbers.forEach((rowNumber, index) => {
    rowsByNumber[rowNumber] = sortedRows[index];
  });

  return rowNumbers.map(rowNumber => rowsByNumber[rowNumber]).filter(Boolean);
}

function getRowsByRowNumbers(sheet, rowNumbers, columnCount) {
  if (!rowNumbers.length) return [];

  const rows = [];
  let rangeStart = rowNumbers[0];
  let previous = rowNumbers[0];

  for (let index = 1; index <= rowNumbers.length; index++) {
    const current = rowNumbers[index];
    if (current === previous + 1) {
      previous = current;
      continue;
    }

    const values = sheet.getRange(rangeStart, 1, previous - rangeStart + 1, columnCount).getValues();
    values.forEach(row => rows.push(row));
    rangeStart = current;
    previous = current;
  }

  return rows;
}

function parseRecordDateValue(value) {
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return value;
  }

  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function startOfScriptDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addScriptDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function getPlantingEventSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(PLANTING_EVENT_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(PLANTING_EVENT_SHEET_NAME);
  return sheet;
}

function getExistingPlantingEventSheet() {
  return getSpreadsheet().getSheetByName(PLANTING_EVENT_SHEET_NAME);
}

function getPlantingEventTrashSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(PLANTING_EVENT_TRASH_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(PLANTING_EVENT_TRASH_SHEET_NAME);
  return sheet;
}

function getExistingPlantingEventTrashSheet() {
  return getSpreadsheet().getSheetByName(PLANTING_EVENT_TRASH_SHEET_NAME);
}

function getPlantingEventTombstoneSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(PLANTING_EVENT_TOMBSTONE_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(PLANTING_EVENT_TOMBSTONE_SHEET_NAME);
  ensurePlantingEventTombstoneSheet(sheet);
  return sheet;
}

function getExistingPlantingEventTombstoneSheet() {
  return getSpreadsheet().getSheetByName(PLANTING_EVENT_TOMBSTONE_SHEET_NAME);
}

function ensurePlantingEventTombstoneSheet(sheet) {
  if (!sheet) throw new Error("苗植えイベント削除IDシートがありません");
  if (sheet.getMaxColumns() < PLANTING_EVENT_TOMBSTONE_HEADERS.length) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      PLANTING_EVENT_TOMBSTONE_HEADERS.length - sheet.getMaxColumns()
    );
  }
  if (sheet.getLastRow() < 1) {
    sheet.getRange(1, 1, 1, PLANTING_EVENT_TOMBSTONE_HEADERS.length)
      .setValues([PLANTING_EVENT_TOMBSTONE_HEADERS]);
    sheet.setFrozenRows(1);
    return;
  }
  const headers = sheet.getRange(1, 1, 1, PLANTING_EVENT_TOMBSTONE_HEADERS.length).getValues()[0];
  if (!PLANTING_EVENT_TOMBSTONE_HEADERS.every((header, index) => String(headers[index] || "").trim() === header)) {
    throw new Error("苗植えイベント削除IDシートの見出しが正しくありません");
  }
}

function validatePlantingEventTombstoneSheetForRead(sheet) {
  if (!sheet || sheet.getLastRow() < 1) return;
  if (sheet.getLastColumn() < PLANTING_EVENT_TOMBSTONE_HEADERS.length) {
    throw new Error("苗植えイベント削除IDシートの見出しが正しくありません");
  }
  const headers = sheet
    .getRange(1, 1, 1, PLANTING_EVENT_TOMBSTONE_HEADERS.length)
    .getValues()[0];
  if (!PLANTING_EVENT_TOMBSTONE_HEADERS.every(
    (header, index) => String(headers[index] || "").trim() === header
  )) {
    throw new Error("苗植えイベント削除IDシートの見出しが正しくありません");
  }
}

function getPlantingEventTombstoneItems() {
  const sheet = getExistingPlantingEventTombstoneSheet();
  if (!sheet || sheet.getLastRow() < 2) return [];
  validatePlantingEventTombstoneSheetForRead(sheet);
  return sheet
    .getRange(2, 1, sheet.getLastRow() - 1, PLANTING_EVENT_TOMBSTONE_HEADERS.length)
    .getValues()
    .map((row, index) => {
      const eventId = normalizeOptionalInteger(
        row[0],
        "苗植えイベントID",
        1,
        Number.MAX_SAFE_INTEGER,
        null
      );
      const deletedAt = new Date(row[1]).getTime();
      if (eventId === null) return null;
      return {
        eventId,
        deletedAt: Number.isFinite(deletedAt) ? deletedAt : 0,
        rowNumber: index + 2,
        rowOrder: index
      };
    })
    .filter(Boolean);
}

function findPlantingEventTombstoneRow(eventId) {
  const targetId = String(eventId == null ? "" : eventId).trim();
  if (!targetId) return 0;
  const item = getPlantingEventTombstoneItems().find(
    value => String(value.eventId) === targetId
  );
  return item ? item.rowNumber : 0;
}

function rememberDeletedPlantingEventId(eventId, deletedAt) {
  const normalizedId = normalizeOptionalInteger(
    eventId,
    "苗植えイベントID",
    1,
    Number.MAX_SAFE_INTEGER,
    null
  );
  if (normalizedId === null) throw new Error("苗植えイベントIDが正しくありません");
  const sheet = getPlantingEventTombstoneSheet();
  const rowNumber = findPlantingEventTombstoneRow(normalizedId);
  const parsedTime = new Date(deletedAt || "").getTime();
  const deletedDate = Number.isFinite(parsedTime) ? new Date(parsedTime) : new Date();
  if (rowNumber > 0) {
    const existingTime = new Date(sheet.getRange(rowNumber, 2).getValue()).getTime();
    if (!Number.isFinite(existingTime) || deletedDate.getTime() > existingTime) {
      sheet.getRange(rowNumber, 2).setValue(deletedDate);
    }
    return false;
  }
  sheet.appendRow([normalizedId, deletedDate]);
  return true;
}

function forgetDeletedPlantingEventId(eventId) {
  const targetId = String(eventId == null ? "" : eventId).trim();
  const rowNumbers = getPlantingEventTombstoneItems()
    .filter(item => String(item.eventId) === targetId)
    .map(item => item.rowNumber)
    .sort((a, b) => b - a);
  if (!rowNumbers.length) return false;
  const sheet = getPlantingEventTombstoneSheet();
  rowNumbers.forEach(rowNumber => sheet.deleteRow(rowNumber));
  return true;
}

function rememberPlantingEventTombstonesFromTrash(trashSheet) {
  if (!trashSheet || trashSheet.getLastRow() < 2) return 0;
  validatePlantingEventTrashSheetHeaders(trashSheet);
  const existingIds = new Set(
    getPlantingEventTombstoneItems().map(item => String(item.eventId))
  );
  const idColumn = PLANTING_EVENT_HEADERS.indexOf(PLANTING_EVENT_HEADER_LABELS.eventId);
  const deletedAtColumn = PLANTING_EVENT_HEADERS.length;
  const rows = trashSheet
    .getRange(2, 1, trashSheet.getLastRow() - 1, PLANTING_EVENT_TRASH_HEADERS.length)
    .getValues();
  const newRows = [];
  rows.forEach(row => {
    const eventId = normalizeOptionalInteger(
      row[idColumn],
      "苗植えイベントID",
      1,
      Number.MAX_SAFE_INTEGER,
      null
    );
    if (eventId === null || existingIds.has(String(eventId))) return;
    const deletedTime = new Date(row[deletedAtColumn]).getTime();
    newRows.push([eventId, Number.isFinite(deletedTime) ? new Date(deletedTime) : new Date()]);
    existingIds.add(String(eventId));
  });
  if (!newRows.length) return 0;
  const sheet = getPlantingEventTombstoneSheet();
  const requiredLastRow = sheet.getLastRow() + newRows.length;
  if (sheet.getMaxRows() < requiredLastRow) {
    sheet.insertRowsAfter(sheet.getMaxRows(), requiredLastRow - sheet.getMaxRows());
  }
  sheet
    .getRange(sheet.getLastRow() + 1, 1, newRows.length, PLANTING_EVENT_TOMBSTONE_HEADERS.length)
    .setValues(newRows);
  return newRows.length;
}

function getPlantingEventHeaderKey(header) {
  const text = String(header || "").trim();
  if (PLANTING_EVENT_FIELD_KEYS.includes(text)) return text;
  return PLANTING_EVENT_FIELD_KEYS.find(
    key => PLANTING_EVENT_HEADER_LABELS[key] === text
  ) || "";
}

function getPlantingEventHeaderColumn(headers, key) {
  return headers.findIndex(header => getPlantingEventHeaderKey(header) === key) + 1;
}

function getPlantingEventHeaderValues(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  return sheet
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map(value => String(value || "").trim());
}

function validatePlantingEventHeaders(headers) {
  const knownHeaderCount = headers.filter(header => !!getPlantingEventHeaderKey(header)).length;
  if (knownHeaderCount < 2) {
    throw new Error(
      "苗植えイベントシートの見出しを確認できません。データ保護のため自動変換を中止しました。"
    );
  }

  const seenKeys = new Set();
  headers.forEach(header => {
    const key = getPlantingEventHeaderKey(header);
    if (!key) return;
    if (seenKeys.has(key)) {
      throw new Error(
        "苗植えイベントシートに同じ意味の見出しが重複しています: " + String(header || "")
      );
    }
    seenKeys.add(key);
  });

  const missingRequiredKeys = ["eventId", "plantingDate"]
    .filter(key => !seenKeys.has(key));
  if (missingRequiredKeys.length) {
    throw new Error(
      "苗植えイベントシートに必須の見出しがありません: " +
      missingRequiredKeys.map(key => PLANTING_EVENT_HEADER_LABELS[key]).join("、")
    );
  }
}

function ensurePlantingEventHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    if (PLANTING_EVENT_HEADERS.length > sheet.getMaxColumns()) {
      sheet.insertColumnsAfter(
        sheet.getMaxColumns(),
        PLANTING_EVENT_HEADERS.length - sheet.getMaxColumns()
      );
    }
    sheet
      .getRange(1, 1, 1, PLANTING_EVENT_HEADERS.length)
      .setValues([PLANTING_EVENT_HEADERS]);
    applyPlantingEventSheetLayout(sheet, PLANTING_EVENT_HEADERS);
    return PLANTING_EVENT_HEADERS.slice();
  }

  const currentHeaders = getPlantingEventHeaderValues(sheet);
  validatePlantingEventHeaders(currentHeaders);
  const existingKeys = new Set(
    currentHeaders.map(getPlantingEventHeaderKey).filter(Boolean)
  );
  const missingKeys = PLANTING_EVENT_FIELD_KEYS.filter(key => !existingKeys.has(key));
  if (!missingKeys.length) return currentHeaders;

  const requiredLastColumn = currentHeaders.length + missingKeys.length;
  if (requiredLastColumn > sheet.getMaxColumns()) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      requiredLastColumn - sheet.getMaxColumns()
    );
  }
  const addedHeaders = missingKeys.map(key => PLANTING_EVENT_HEADER_LABELS[key]);
  sheet
    .getRange(1, currentHeaders.length + 1, 1, addedHeaders.length)
    .setValues([addedHeaders]);
  applyAddedPlantingEventColumnLayout(sheet, currentHeaders.length + 1, missingKeys);
  return currentHeaders.concat(addedHeaders);
}

function getPlantingEventHeadersForRead(sheet) {
  if (!sheet || sheet.getLastRow() === 0) return [];
  const headers = getPlantingEventHeaderValues(sheet);
  validatePlantingEventHeaders(headers);
  return headers;
}

function applyAddedPlantingEventColumnLayout(sheet, startColumn, keys) {
  const formats = {
    eventId: "0",
    plantingDate: "yyyy-mm-dd",
    actualSeedlingTrayCount: "0",
    actualTakenSeedlingCount: "0",
    actualPlantedSeedlingCount: "0",
    actualSeedlingLossRate: "0.0",
    createdAt: "yyyy-mm-dd hh:mm:ss",
    updatedAt: "yyyy-mm-dd hh:mm:ss"
  };
  const hiddenKeys = new Set([
    "eventId",
    "sourceAllocations",
    "plantingPalletKeys",
    "palletNumberingVersion"
  ]);
  keys.forEach((key, index) => {
    const column = startColumn + index;
    const dataRowCount = Math.max(sheet.getMaxRows() - 1, 0);
    if (formats[key] && dataRowCount > 0) {
      sheet.getRange(2, column, dataRowCount, 1).setNumberFormat(formats[key]);
    }
    if (hiddenKeys.has(key)) sheet.hideColumns(column);
    if (key === "qualityMemo" && sheet.getLastRow() > 1) {
      const headers = getPlantingEventHeaderValues(sheet);
      const eventIdColumn = getPlantingEventHeaderColumn(headers, "eventId");
      const rowCount = sheet.getLastRow() - 1;
      const eventIds = eventIdColumn > 0
        ? sheet.getRange(2, eventIdColumn, rowCount, 1).getValues()
        : [];
      sheet.getRange(2, column, rowCount, 1).setValues(
        eventIds.map(row => [String(row[0] == null ? "" : row[0]).trim() ? "不明" : ""])
      );
    }
  });
}

function applyPlantingEventSheetLayout(sheet, headers) {
  const formats = {
    eventId: "0",
    plantingDate: "yyyy-mm-dd",
    actualSeedlingTrayCount: "0",
    actualTakenSeedlingCount: "0",
    actualPlantedSeedlingCount: "0",
    actualSeedlingLossRate: "0.0",
    createdAt: "yyyy-mm-dd hh:mm:ss",
    updatedAt: "yyyy-mm-dd hh:mm:ss"
  };
  Object.keys(formats).forEach(key => {
    const column = getPlantingEventHeaderColumn(headers, key);
    if (column <= 0) return;
    sheet
      .getRange(2, column, Math.max(sheet.getMaxRows() - 1, 1), 1)
      .setNumberFormat(formats[key]);
  });
  sheet.showColumns(1, Math.max(sheet.getLastColumn(), headers.length));
  ["eventId", "sourceAllocations", "plantingPalletKeys", "palletNumberingVersion"].forEach(key => {
    const column = getPlantingEventHeaderColumn(headers, key);
    if (column > 0) sheet.hideColumns(column);
  });
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
}

function buildPlantingEventRow(headers, event) {
  const detailsUnknown = !!event.detailsUnknown;
  const rowObject = {
    palletNumberingVersion: CURRENT_PALLET_NUMBERING_VERSION,
    eventId: event.eventId,
    plantingDate: event.plantingDate,
    sourceAllocations: escapeSpreadsheetFormulaText(
      JSON.stringify(event.sourceAllocations || [])
    ),
    plantingPalletKeys: escapeSpreadsheetFormulaText(
      JSON.stringify(event.plantingPalletKeys || [])
    ),
    actualSeedlingTrayCount: detailsUnknown ? "" : event.actualSeedlingTrayCount ?? "",
    actualTakenSeedlingCount: detailsUnknown ? "" : event.actualTakenSeedlingCount ?? "",
    actualPlantedSeedlingCount: detailsUnknown ? "" : event.actualPlantedSeedlingCount ?? "",
    actualSeedlingCarryoverMode: detailsUnknown ? "" : event.actualSeedlingCarryoverMode || "loss",
    actualSeedlingLossRate: detailsUnknown ? "" : event.actualSeedlingLossRate ?? "",
    qualityMemo: event.qualityMemo
      ? escapeSpreadsheetFormulaText(formatQualityTextValue({ qualityMemo: event.qualityMemo }))
      : "不明",
    detailsUnknown: detailsUnknown ? "不明" : "",
    createdAt: toPlantingEventSheetTimestamp(event.createdAt),
    updatedAt: toPlantingEventSheetTimestamp(event.updatedAt)
  };
  return headers.map(header => rowObject[getPlantingEventHeaderKey(header)] ?? "");
}

function toPlantingEventSheetTimestamp(value) {
  if (!value) return "";
  if (Object.prototype.toString.call(value) === "[object Date]") return value;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date : "";
}

function writePlantingEventRow(
  sheet,
  rowNumber,
  headers,
  event,
  requestEvent,
  writeOperation
) {
  writeKnownPlantingEventRows(
    sheet,
    rowNumber,
    headers,
    [buildPlantingEventRow(headers, event)],
    [buildPlantingWriteMarker(requestEvent || event, writeOperation)]
  );
  if (!hasCompletedPlantingEventWrite(sheet, rowNumber, headers)) {
    throw new Error("苗植えイベント行が完了状態になっていません");
  }
}

function appendPlantingEventRow(sheet, headers, event, requestEvent, writeOperation) {
  const rowNumber = getLastPlantingEventRow(sheet, headers) + 1;
  writeKnownPlantingEventRows(
    sheet,
    rowNumber,
    headers,
    [buildPlantingEventRow(headers, event)],
    [buildPlantingWriteMarker(requestEvent || event, writeOperation)]
  );
  if (!hasCompletedPlantingEventWrite(sheet, rowNumber, headers)) {
    throw new Error("苗植えイベント行が完了状態になっていません");
  }
}

function hasCompletedPlantingEventWrite(sheet, rowNumber, headers) {
  const updatedAtColumn = getPlantingEventHeaderColumn(headers, "updatedAt");
  if (updatedAtColumn <= 0) return false;
  return isCommittedWriteTimestamp(sheet.getRange(rowNumber, updatedAtColumn).getValue());
}

function getLastPlantingEventRow(sheet, headers) {
  return Math.max(1, sheet.getLastRow());
}

function writeKnownPlantingEventRows(sheet, startRow, headers, rows, writeMarkers) {
  if (!rows.length) return;
  if (!Number.isSafeInteger(startRow) || startRow < 2 || !headers.length) {
    throw new Error("書き込み位置が正しくありません");
  }
  const safeRows = rows.map(row => headers.map((header, index) => {
    const key = getPlantingEventHeaderKey(header);
    return PLANTING_EVENT_FORMULA_SAFE_KEYS.has(key)
      ? escapeSpreadsheetFormulaText(row[index])
      : row[index];
  }));
  const requiredLastRow = startRow + safeRows.length - 1;
  if (headers.length > sheet.getMaxColumns()) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      headers.length - sheet.getMaxColumns()
    );
  }
  if (requiredLastRow > sheet.getMaxRows()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), requiredLastRow - sheet.getMaxRows());
  }

  const knownColumnIndexes = headers
    .map((header, index) => ({ index, key: getPlantingEventHeaderKey(header) }))
    .filter(item => !!item.key)
    .sort((a, b) => {
      if (a.key === "eventId") return -1;
      if (b.key === "eventId") return 1;
      if (a.key === "updatedAt") return 1;
      if (b.key === "updatedAt") return -1;
      return a.index - b.index;
    });
  if (!knownColumnIndexes.length) {
    throw new Error("苗植えイベントシートに書き込み可能な既知列がありません");
  }

  const writeColumn = (item, columnValues) => {
    const targetRange = sheet.getRange(startRow, item.index + 1, safeRows.length, 1);
    try {
      targetRange.setValues(columnValues);
    } catch (err) {
      // 古い入力規則が残っているシートでは、正しい値でも汎用的な
      // 「引数が無効です」になることがある。アプリ管理列だけ解除して再試行する。
      try {
        targetRange.clearDataValidations();
        if (columnValues.length === 1) targetRange.setValue(columnValues[0][0]);
        else targetRange.setValues(columnValues);
      } catch (retryErr) {
        throw new Error(
          "列「" + (PLANTING_EVENT_HEADER_LABELS[item.key] || item.key) + "」の更新に失敗しました: " +
          String(retryErr && retryErr.message || retryErr) +
          "（初回: " + String(err && err.message || err) + "）"
        );
      }
    }
  };

  const updatedAtColumn = knownColumnIndexes.find(item => item.key === "updatedAt");
  if (!updatedAtColumn) {
    throw new Error("苗植えイベントシートに更新日時列がありません");
  }
  if (!Array.isArray(writeMarkers) || writeMarkers.length !== safeRows.length) {
    throw new Error("苗植えイベントの未完了マーカーが正しくありません");
  }
  writeColumn(
    updatedAtColumn,
    writeMarkers.map(marker => [String(marker || "")])
  );
  try {
    SpreadsheetApp.flush();
  } catch (err) {
    throw new Error("苗植えイベントを未完了状態にした後の反映に失敗しました: " +
      String(err && err.message || err));
  }

  knownColumnIndexes
    .filter(item => item.key !== "updatedAt")
    .forEach(item => {
      writeColumn(
        item,
        safeRows.map(row => [normalizePlantingEventCellValue(row[item.index])])
      );
    });
  writeColumn(
    updatedAtColumn,
    safeRows.map(row => [normalizePlantingEventCellValue(row[updatedAtColumn.index])])
  );
}

function normalizePlantingEventCellValue(value) {
  if (value === null || typeof value === "undefined") return "";
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Number.isFinite(value.getTime()) ? value : "";
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : "";
  if (typeof value === "string" || typeof value === "boolean") return value;
  return String(value);
}

function getKnownPlantingEventColumnSegments(headers) {
  const segments = [];
  let startIndex = -1;
  for (let index = 0; index <= headers.length; index++) {
    const key = index < headers.length ? getPlantingEventHeaderKey(headers[index]) : "";
    const isKnown = !!key && key !== "updatedAt";
    if (isKnown && startIndex < 0) {
      startIndex = index;
      continue;
    }
    if (!isKnown && startIndex >= 0) {
      segments.push({ startIndex, length: index - startIndex });
      startIndex = -1;
    }
  }
  if (!segments.length) {
    throw new Error("苗植えイベントシートに書き込み可能な既知列がありません");
  }
  const idIndex = headers.findIndex(
    header => getPlantingEventHeaderKey(header) === "eventId"
  );
  const idSegment = segments.find(segment => (
    idIndex >= segment.startIndex && idIndex < segment.startIndex + segment.length
  ));
  return idSegment
    ? [idSegment].concat(segments.filter(segment => segment !== idSegment))
    : segments;
}

function rowToPlantingEvent(headers, row) {
  const item = {};
  headers.forEach((header, index) => {
    const key = getPlantingEventHeaderKey(header);
    if (key) item[key] = row[index];
  });
  return normalizePlantingEvent({
    palletNumberingVersion: item.palletNumberingVersion,
    eventId: item.eventId,
    plantingDate: formatDateValue(item.plantingDate),
    sourceAllocations: parseStoredJsonArray(item.sourceAllocations, "収穫元割当"),
    plantingPalletKeys: parseStoredJsonArray(item.plantingPalletKeys, "苗植えパレット"),
    actualSeedlingTrayCount: item.actualSeedlingTrayCount,
    actualTakenSeedlingCount: item.actualTakenSeedlingCount,
    actualPlantedSeedlingCount: item.actualPlantedSeedlingCount,
    actualSeedlingCarryoverMode: item.actualSeedlingCarryoverMode,
    actualSeedlingLossRate: item.actualSeedlingLossRate,
    qualityMemo: item.qualityMemo,
    detailsUnknown: item.detailsUnknown,
    createdAt: formatPlantingEventTimestamp(item.createdAt),
    updatedAt: formatPlantingEventTimestamp(item.updatedAt)
  });
}

function formatPlantingEventTimestamp(value) {
  if (value === null || typeof value === "undefined" || value === "") return "";
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Number.isFinite(value.getTime()) ? value.toISOString() : "";
  }
  const text = String(value).trim();
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : text;
}

function findPlantingEventRowById(sheet, headers, eventId, includeIncomplete) {
  const targetId = String(eventId == null ? "" : eventId).trim();
  const idColumn = getPlantingEventHeaderColumn(headers, "eventId");
  const lastRow = sheet.getLastRow();
  if (!targetId || idColumn <= 0 || lastRow < 2) return 0;
  const rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  const matches = [];
  rows.forEach((row, index) => {
    if (!includeIncomplete && !isCommittedPlantingEventRow(headers, row)) return;
    const marker = getPlantingWriteMarker(headers, row);
    const rowId = String(row[idColumn - 1] == null ? "" : row[idColumn - 1]).trim();
    const markerId = marker ? String(marker.eventId || "").trim() : "";
    if (rowId === targetId || markerId === targetId) matches.push(index + 2);
  });
  if (matches.length > 1) {
    throw new Error("苗植えイベントシートに同じ苗植えイベントIDが重複しています: " + targetId);
  }
  return matches[0] || 0;
}

function readPlantingEventRowValues(sheet, rowNumber, headers) {
  if (!Number.isSafeInteger(rowNumber) || rowNumber < 2 || !Array.isArray(headers) || !headers.length) {
    throw new Error("読み取り位置が正しくありません");
  }
  if (headers.length > sheet.getMaxColumns()) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      headers.length - sheet.getMaxColumns()
    );
  }
  try {
    return sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  } catch (bulkError) {
    try {
      return headers.map((header, index) => sheet.getRange(rowNumber, index + 1).getValue());
    } catch (cellError) {
      throw new Error(
        "行" + rowNumber + "を読み取れません: " + String(cellError && cellError.message || cellError) +
        "（一括読取: " + String(bulkError && bulkError.message || bulkError) + "）"
      );
    }
  }
}

function isRecoverableIncompletePlantingEventRow(headers, row, expectedEventId) {
  if (!Array.isArray(headers) || !Array.isArray(row)) return false;
  const idColumn = getPlantingEventHeaderColumn(headers, "eventId");
  const dateColumn = getPlantingEventHeaderColumn(headers, "plantingDate");
  const sourceColumn = getPlantingEventHeaderColumn(headers, "sourceAllocations");
  const palletColumn = getPlantingEventHeaderColumn(headers, "plantingPalletKeys");
  if (idColumn <= 0 || dateColumn <= 0 || sourceColumn <= 0 || palletColumn <= 0) return false;

  const rowEventId = String(row[idColumn - 1] == null ? "" : row[idColumn - 1]).trim();
  if (rowEventId !== String(expectedEventId == null ? "" : expectedEventId).trim()) return false;

  const plantingDate = formatDateValue(row[dateColumn - 1]).trim();
  const sourceText = String(row[sourceColumn - 1] == null ? "" : row[sourceColumn - 1]).trim();
  const palletText = String(row[palletColumn - 1] == null ? "" : row[palletColumn - 1]).trim();
  return !plantingDate || !sourceText || !palletText;
}

function getPlantingEventRowsForList(sheet, headers, options) {
  const lastRow = sheet.getLastRow();
  const rowCount = lastRow - 1;
  const recentDays = Number(options && options.recentDays || 0);
  const requestedLimit = Number(options && options.limit || 0);
  const limit = Math.min(
    PLANTING_EVENT_LIST_LIMIT,
    Math.max(1, Math.floor(requestedLimit || PLANTING_EVENT_LIST_LIMIT))
  );
  const dateColumn = getPlantingEventHeaderColumn(headers, "plantingDate");
  const eventIdColumn = getPlantingEventHeaderColumn(headers, "eventId");
  if (dateColumn <= 0) {
    return sheet
      .getRange(2, 1, rowCount, headers.length)
      .getValues()
      .filter(row => isCommittedPlantingEventRow(headers, row))
      .slice(-limit)
      .reverse();
  }

  const hasRecentDays = Number.isFinite(recentDays) && recentDays > 0;
  const today = startOfScriptDay(new Date());
  const startDate = addScriptDays(today, -Math.max(0, Math.floor(recentDays) - 1));
  const endDate = addScriptDays(today, 1);
  const dateValues = sheet.getRange(2, dateColumn, rowCount, 1).getValues();
  const eventIdValues = eventIdColumn > 0
    ? sheet.getRange(2, eventIdColumn, rowCount, 1).getValues()
    : Array(rowCount).fill([0]);
  const updatedAtColumn = getPlantingEventHeaderColumn(headers, "updatedAt");
  const updatedAtValues = updatedAtColumn > 0
    ? sheet.getRange(2, updatedAtColumn, rowCount, 1).getValues()
    : Array(rowCount).fill([new Date(0)]);
  const rowItems = [];
  dateValues.forEach((row, index) => {
    if (updatedAtColumn > 0 &&
      !isCommittedWriteTimestamp(updatedAtValues[index] && updatedAtValues[index][0])) return;
    const date = parseRecordDateValue(row[0]);
    if (!date) return;
    const day = startOfScriptDay(date);
    if (hasRecentDays && (day.getTime() < startDate.getTime() || day.getTime() >= endDate.getTime())) {
      return;
    }
    const eventId = Number(eventIdValues[index] && eventIdValues[index][0]);
    rowItems.push({
      rowNumber: index + 2,
      time: day.getTime(),
      eventId: Number.isSafeInteger(eventId) && eventId > 0 ? eventId : 0
    });
  });
  const rowNumbers = rowItems
    .sort((a, b) => {
      if (a.time !== b.time) return b.time - a.time;
      if (a.eventId !== b.eventId) return b.eventId - a.eventId;
      return b.rowNumber - a.rowNumber;
    })
    .slice(0, limit)
    .map(item => item.rowNumber);
  return getRowsByRowNumbersPreservingOrder(sheet, rowNumbers, headers.length);
}

function remapPlantingEventRow(sourceHeaders, sourceRow, targetHeaders) {
  const valuesByKey = {};
  sourceHeaders.forEach((header, index) => {
    const key = getPlantingEventHeaderKey(header);
    if (key) valuesByKey[key] = sourceRow[index];
  });
  return targetHeaders.map(header => {
    const key = getPlantingEventHeaderKey(header);
    return key ? (valuesByKey[key] ?? "") : "";
  });
}

function validatePlantingEventTrashSheetHeaders(sheet) {
  if (!sheet || sheet.getLastRow() === 0) return;
  if (sheet.getLastColumn() < PLANTING_EVENT_TRASH_HEADERS.length) {
    throw new Error(
      "削除済み苗植えイベントシートの見出しが現在の形式と異なります。データ保護のため処理を中止しました。"
    );
  }
  const headers = sheet
    .getRange(1, 1, 1, PLANTING_EVENT_TRASH_HEADERS.length)
    .getValues()[0];
  const matches = PLANTING_EVENT_TRASH_HEADERS.every(
    (header, index) => String(headers[index] || "").trim() === header
  );
  if (!matches) {
    throw new Error(
      "削除済み苗植えイベントシートの見出しが現在の形式と異なります。データ保護のため処理を中止しました。"
    );
  }
}

function validatePlantingEventTrashSheetHeadersForRead(sheet) {
  if (!sheet || sheet.getLastRow() === 0) return;
  if (sheet.getLastColumn() < PLANTING_EVENT_TRASH_HEADERS.length) {
    throw new Error(
      "削除済み苗植えイベントシートの見出しが現在の形式と異なります。" +
      "データ保護のため処理を中止しました。"
    );
  }
  const headers = sheet
    .getRange(1, 1, 1, PLANTING_EVENT_TRASH_HEADERS.length)
    .getValues()[0];
  const matches = PLANTING_EVENT_TRASH_HEADERS.every(
    (header, index) => String(headers[index] || "").trim() === header
  );
  if (!matches) {
    throw new Error(
      "削除済み苗植えイベントシートの見出しが現在の形式と異なります。" +
      "データ保護のため処理を中止しました。"
    );
  }
}

function ensurePlantingEventTrashSheet(sheet) {
  if (sheet.getMaxColumns() < PLANTING_EVENT_TRASH_HEADERS.length) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      PLANTING_EVENT_TRASH_HEADERS.length - sheet.getMaxColumns()
    );
  }
  if (sheet.getLastRow() === 0) {
    sheet
      .getRange(1, 1, 1, PLANTING_EVENT_TRASH_HEADERS.length)
      .setValues([PLANTING_EVENT_TRASH_HEADERS]);
    applyPlantingEventTrashSheetLayout(sheet);
    return;
  }
  validatePlantingEventTrashSheetHeaders(sheet);
}

function applyPlantingEventTrashSheetLayout(sheet) {
  sheet.setFrozenRows(1);
  sheet
    .getRange(1, 1, 1, PLANTING_EVENT_TRASH_HEADERS.length)
    .setFontWeight("bold");
  const createdAtColumn = PLANTING_EVENT_HEADERS.indexOf(
    PLANTING_EVENT_HEADER_LABELS.createdAt
  ) + 1;
  const updatedAtColumn = PLANTING_EVENT_HEADERS.indexOf(
    PLANTING_EVENT_HEADER_LABELS.updatedAt
  ) + 1;
  const deletedAtColumn = PLANTING_EVENT_TRASH_HEADERS.length - 1;
  const expiresAtColumn = PLANTING_EVENT_TRASH_HEADERS.length;
  const rowCount = Math.max(sheet.getMaxRows() - 1, 1);
  [createdAtColumn, updatedAtColumn, deletedAtColumn, expiresAtColumn].forEach(column => {
    if (column > 0) {
      sheet.getRange(2, column, rowCount, 1).setNumberFormat("yyyy-mm-dd hh:mm:ss");
    }
  });
  ["eventId", "actualSeedlingTrayCount", "actualTakenSeedlingCount", "actualPlantedSeedlingCount"]
    .forEach(key => {
      const column = PLANTING_EVENT_HEADERS.indexOf(PLANTING_EVENT_HEADER_LABELS[key]) + 1;
      if (column > 0) sheet.getRange(2, column, rowCount, 1).setNumberFormat("0");
    });
  const lossRateColumn = PLANTING_EVENT_HEADERS.indexOf(
    PLANTING_EVENT_HEADER_LABELS.actualSeedlingLossRate
  ) + 1;
  if (lossRateColumn > 0) {
    sheet.getRange(2, lossRateColumn, rowCount, 1).setNumberFormat("0.0");
  }
  ["eventId", "sourceAllocations", "plantingPalletKeys", "palletNumberingVersion"].forEach(key => {
    const column = PLANTING_EVENT_HEADERS.indexOf(PLANTING_EVENT_HEADER_LABELS[key]) + 1;
    if (column > 0) sheet.hideColumns(column);
  });
}

function findPlantingEventTrashRowById(sheet, eventId) {
  const targetId = String(eventId == null ? "" : eventId).trim();
  const idColumn = PLANTING_EVENT_HEADERS.indexOf(
    PLANTING_EVENT_HEADER_LABELS.eventId
  ) + 1;
  const lastRow = sheet.getLastRow();
  if (!targetId || idColumn <= 0 || lastRow < 2) return 0;
  const values = sheet.getRange(2, idColumn, lastRow - 1, 1).getValues();
  const rowIndex = values.findIndex(
    row => String(row[0] == null ? "" : row[0]).trim() === targetId
  );
  return rowIndex >= 0 ? rowIndex + 2 : 0;
}

function purgeExpiredPlantingEventTrash(sheet) {
  const trashSheet = sheet || getPlantingEventTrashSheet();
  ensurePlantingEventTrashSheet(trashSheet);
  const lastRow = trashSheet.getLastRow();
  if (lastRow < 2) return 0;
  rememberPlantingEventTombstonesFromTrash(trashSheet);
  const expiresColumn = PLANTING_EVENT_TRASH_HEADERS.length;
  const values = trashSheet.getRange(2, expiresColumn, lastRow - 1, 1).getValues();
  const now = Date.now();
  const expiredRows = [];
  values.forEach((row, index) => {
    const value = row[0];
    const expiresTime = Object.prototype.toString.call(value) === "[object Date]"
      ? value.getTime()
      : new Date(String(value || "")).getTime();
    if (Number.isFinite(expiresTime) && expiresTime <= now) {
      expiredRows.push(index + 2);
    }
  });
  expiredRows.reverse().forEach(rowNumber => trashSheet.deleteRow(rowNumber));
  return expiredRows.length;
}

function getDeletedPlantingEventIdSet() {
  const deletedIds = new Set(
    getPlantingEventTombstoneItems().map(item => String(item.eventId))
  );
  const sheet = getExistingPlantingEventTrashSheet();
  if (!sheet || sheet.getLastRow() < 2) return deletedIds;
  validatePlantingEventTrashSheetHeaders(sheet);
  const idColumn = PLANTING_EVENT_HEADERS.indexOf(
    PLANTING_EVENT_HEADER_LABELS.eventId
  ) + 1;
  const values = sheet.getRange(2, idColumn, sheet.getLastRow() - 1, 1).getValues();
  values.forEach(row => {
    const eventId = String(row[0] == null ? "" : row[0]).trim();
    if (eventId) deletedIds.add(eventId);
  });
  return deletedIds;
}

function listDeletedPlantingEventIds() {
  const deletedItemsById = new Map();
  getPlantingEventTombstoneItems().forEach(item => {
    deletedItemsById.set(String(item.eventId), item);
  });
  const sheet = getExistingPlantingEventTrashSheet();
  if (sheet && sheet.getLastRow() >= 2) {
    validatePlantingEventTrashSheetHeadersForRead(sheet);
    const rowCount = sheet.getLastRow() - 1;
    const idColumn = PLANTING_EVENT_HEADERS.indexOf(PLANTING_EVENT_HEADER_LABELS.eventId);
    const deletedAtColumn = PLANTING_EVENT_HEADERS.length;
    const rows = sheet
      .getRange(2, 1, rowCount, PLANTING_EVENT_TRASH_HEADERS.length)
      .getValues();
    rows.forEach((row, index) => {
      const eventId = normalizeOptionalInteger(
        row[idColumn],
        "苗植えイベントID",
        1,
        Number.MAX_SAFE_INTEGER,
        null
      );
      if (eventId === null) return;
      const deletedAt = new Date(row[deletedAtColumn]).getTime();
      const key = String(eventId);
      const existing = deletedItemsById.get(key);
      const item = {
        eventId,
        deletedAt: Number.isFinite(deletedAt) ? deletedAt : 0,
        rowOrder: index
      };
      if (!existing || item.deletedAt > existing.deletedAt) deletedItemsById.set(key, item);
    });
  }
  return [...deletedItemsById.values()]
    .sort((a, b) => b.deletedAt - a.deletedAt || b.rowOrder - a.rowOrder)
    .slice(0, PLANTING_EVENT_TOMBSTONE_LIST_LIMIT)
    .map(item => item.eventId);
}

function assertPlantingEventIsNotDeleted(event, deletedEventIds) {
  const eventId = String(event && event.eventId != null ? event.eventId : "").trim();
  if (eventId && deletedEventIds.has(eventId)) {
    throw new Error("この苗植えイベントは削除済みです。復元してから保存してください。");
  }
}

function getRecordSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  return sheet;
}

function getExistingRecordSheet() {
  return getSpreadsheet().getSheetByName(SHEET_NAME);
}

function getRecordTrashSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(RECORD_TRASH_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(RECORD_TRASH_SHEET_NAME);
  }

  return sheet;
}

function getExistingRecordTrashSheet() {
  return getSpreadsheet().getSheetByName(RECORD_TRASH_SHEET_NAME);
}

function getRecordTombstoneSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(RECORD_TOMBSTONE_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(RECORD_TOMBSTONE_SHEET_NAME);
  ensureRecordTombstoneSheet(sheet);
  return sheet;
}

function getExistingRecordTombstoneSheet() {
  return getSpreadsheet().getSheetByName(RECORD_TOMBSTONE_SHEET_NAME);
}

function ensureRecordTombstoneSheet(sheet) {
  if (!sheet) throw new Error("記録削除IDシートがありません");
  if (sheet.getLastRow() < 1) {
    if (sheet.getMaxColumns() < RECORD_TOMBSTONE_HEADERS.length) {
      sheet.insertColumnsAfter(
        sheet.getMaxColumns(),
        RECORD_TOMBSTONE_HEADERS.length - sheet.getMaxColumns()
      );
    }
    sheet.getRange(1, 1, 1, RECORD_TOMBSTONE_HEADERS.length)
      .setValues([RECORD_TOMBSTONE_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, RECORD_TOMBSTONE_HEADERS.length).setFontWeight("bold");
    sheet.getRange(2, 3, Math.max(sheet.getMaxRows() - 1, 1), 1)
      .setNumberFormat("yyyy-mm-dd hh:mm:ss");
    sheet.hideColumns(1, 2);
    return;
  }
  const headers = sheet.getRange(1, 1, 1, RECORD_TOMBSTONE_HEADERS.length).getValues()[0];
  if (!RECORD_TOMBSTONE_HEADERS.every(
    (header, index) => String(headers[index] || "").trim() === header
  )) {
    throw new Error("記録削除IDシートの見出しが正しくありません");
  }
}

function validateRecordTombstoneSheetForRead(sheet) {
  if (!sheet || sheet.getLastRow() < 1) return;
  if (sheet.getLastColumn() < RECORD_TOMBSTONE_HEADERS.length) {
    throw new Error("記録削除IDシートの見出しが正しくありません");
  }
  const headers = sheet
    .getRange(1, 1, 1, RECORD_TOMBSTONE_HEADERS.length)
    .getValues()[0];
  if (!RECORD_TOMBSTONE_HEADERS.every(
    (header, index) => String(headers[index] || "").trim() === header
  )) {
    throw new Error("記録削除IDシートの見出しが正しくありません");
  }
}

function getHarvestRecordTombstoneItems() {
  const sheet = getExistingRecordTombstoneSheet();
  if (!sheet || sheet.getLastRow() < 2) return [];
  validateRecordTombstoneSheetForRead(sheet);
  return sheet
    .getRange(2, 1, sheet.getLastRow() - 1, RECORD_TOMBSTONE_HEADERS.length)
    .getValues()
    .map((row, index) => {
      let recordUuid = "";
      try {
        recordUuid = normalizeOptionalRecordUuid(row[0]);
      } catch (err) {
        throw new Error("記録削除IDシートに不正な記録UUIDがあります");
      }
      const id = normalizeOptionalInteger(row[1], "削除済み記録ID", 1, Number.MAX_SAFE_INTEGER, null);
      if (!recordUuid && id === null) return null;
      const deletedAt = formatHarvestRecordTimestamp(row[2]);
      return {
        recordUuid,
        id,
        deletedAt,
        deletedTime: new Date(deletedAt || "").getTime() || 0,
        rowNumber: index + 2,
        rowOrder: index
      };
    })
    .filter(Boolean);
}

function rememberDeletedHarvestRecord(record, deletedAt) {
  const recordUuid = normalizeOptionalRecordUuid(record && record.recordUuid);
  const id = normalizeOptionalInteger(
    record && record.id,
    "削除済み記録ID",
    1,
    Number.MAX_SAFE_INTEGER,
    null
  );
  if (!recordUuid && id === null) throw new Error("削除済み記録の識別情報がありません");
  const deletedTime = new Date(deletedAt || "").getTime();
  const deletedDate = Number.isFinite(deletedTime) ? new Date(deletedTime) : new Date();
  const matches = getHarvestRecordTombstoneItems().filter(item => (
    recordUuid
      ? item.recordUuid === recordUuid
      : (id !== null && !item.recordUuid && item.id !== null && String(item.id) === String(id))
  ));
  const sheet = getRecordTombstoneSheet();
  if (matches.length) {
    const keeper = matches[0];
    const existingTime = new Date(sheet.getRange(keeper.rowNumber, 3).getValue()).getTime();
    sheet.getRange(keeper.rowNumber, 1, 1, 3).setValues([[
      recordUuid || keeper.recordUuid,
      id === null ? keeper.id : id,
      !Number.isFinite(existingTime) || deletedDate.getTime() > existingTime
        ? deletedDate
        : new Date(existingTime)
    ]]);
    matches.slice(1).map(item => item.rowNumber).sort((a, b) => b - a)
      .forEach(rowNumber => sheet.deleteRow(rowNumber));
    return false;
  }
  sheet.appendRow([recordUuid, id === null ? "" : id, deletedDate]);
  return true;
}

function forgetDeletedHarvestRecord(record) {
  const recordUuid = String(record && record.recordUuid || "").trim().toLowerCase();
  const id = String(record && record.id == null ? "" : record.id).trim();
  const rowNumbers = getHarvestRecordTombstoneItems()
    .filter(item => (
      recordUuid
        ? (item.recordUuid === recordUuid ||
          (id && !item.recordUuid && item.id !== null && String(item.id) === id))
        : (id && !item.recordUuid && item.id !== null && String(item.id) === id)
    ))
    .map(item => item.rowNumber)
    .sort((a, b) => b - a);
  if (!rowNumbers.length) return false;
  const sheet = getRecordTombstoneSheet();
  rowNumbers.forEach(rowNumber => sheet.deleteRow(rowNumber));
  return true;
}

function rememberHarvestRecordTombstonesFromTrash(trashSheet) {
  if (!trashSheet) {
    return { changed: 0, identities: new Set(), rows: [] };
  }
  ensureRecordTrashSheet(trashSheet);
  const tombstoneItems = getHarvestRecordTombstoneItems();
  const rowCount = Math.max(trashSheet.getLastRow() - 1, 0);
  const rows = rowCount
    ? trashSheet.getRange(2, 1, rowCount, RECORD_TRASH_HEADERS.length).getValues()
    : [];
  const byUuid = new Map();
  const byId = new Map();
  tombstoneItems.forEach(item => {
    if (item.recordUuid) byUuid.set(item.recordUuid, item);
    if (!item.recordUuid && item.id !== null) byId.set(String(item.id), item);
  });
  const newRows = [];
  const updates = new Map();
  rows.forEach(row => {
    const record = rowToRecord(HEADERS, row.slice(0, HEADERS.length));
    const deletedTime = new Date(row[HEADERS.length] || "").getTime();
    const deletedDate = Number.isFinite(deletedTime) ? new Date(deletedTime) : new Date();
    const recordUuid = String(record.recordUuid || "").trim().toLowerCase();
    const id = String(record.id == null ? "" : record.id).trim();
    let item = recordUuid ? byUuid.get(recordUuid) : (id && byId.get(id));
    if (item) {
      if (!Number.isFinite(item.deletedTime) || deletedDate.getTime() > item.deletedTime ||
        (!item.recordUuid && recordUuid) || (item.id === null && id)) {
        const updatedItem = {
          ...item,
          recordUuid: recordUuid || item.recordUuid,
          id: id ? Number(id) : item.id,
          deletedTime: Math.max(item.deletedTime || 0, deletedDate.getTime()),
          deletedAt: new Date(Math.max(item.deletedTime || 0, deletedDate.getTime())).toISOString()
        };
        if (item.rowNumber > 0) {
          updates.set(item.rowNumber, updatedItem);
        } else if (Number.isSafeInteger(item.newRowIndex)) {
          newRows[item.newRowIndex] = [
            updatedItem.recordUuid || "",
            updatedItem.id === null ? "" : updatedItem.id,
            new Date(updatedItem.deletedTime)
          ];
          updatedItem.newRowIndex = item.newRowIndex;
        }
        item = updatedItem;
      }
    } else {
      const newRowIndex = newRows.length;
      item = {
        recordUuid,
        id: id ? Number(id) : null,
        deletedTime: deletedDate.getTime(),
        deletedAt: deletedDate.toISOString(),
        rowNumber: 0,
        newRowIndex
      };
      newRows.push([recordUuid, id ? Number(id) : "", deletedDate]);
    }
    if (recordUuid) byUuid.set(recordUuid, item);
    if (!recordUuid && id) byId.set(id, item);
  });
  if (updates.size || newRows.length) {
    const sheet = getRecordTombstoneSheet();
    updates.forEach((item, rowNumber) => {
      sheet.getRange(rowNumber, 1, 1, 3).setValues([[
        item.recordUuid || "",
        item.id === null ? "" : item.id,
        new Date(item.deletedTime)
      ]]);
    });
    if (newRows.length) {
      const startRow = sheet.getLastRow() + 1;
      const requiredLastRow = startRow + newRows.length - 1;
      if (requiredLastRow > sheet.getMaxRows()) {
        sheet.insertRowsAfter(sheet.getMaxRows(), requiredLastRow - sheet.getMaxRows());
      }
      sheet.getRange(startRow, 1, newRows.length, 3).setValues(newRows);
    }
  }
  const identities = new Set();
  const addIdentity = item => {
    if (!item) return;
    if (item.recordUuid) identities.add("u:" + item.recordUuid);
    if (item.id !== null && typeof item.id !== "undefined" && String(item.id).trim()) {
      identities.add("i:" + String(item.id));
    }
  };
  byUuid.forEach(addIdentity);
  byId.forEach(addIdentity);
  rows.forEach(row => {
    const record = rowToRecord(HEADERS, row.slice(0, HEADERS.length));
    if (record.recordUuid) identities.add("u:" + record.recordUuid);
    if (record.id !== null && String(record.id).trim()) {
      identities.add("i:" + String(record.id));
    }
  });
  return {
    changed: updates.size + newRows.length,
    identities,
    rows
  };
}

function validateRecordTrashSheetHeaders(sheet) {
  if (!sheet || sheet.getLastRow() === 0) return;
  const currentHeaders = sheet
    .getRange(1, 1, 1, Math.max(sheet.getLastColumn(), RECORD_TRASH_HEADERS.length))
    .getValues()[0];
  const headersMatch = RECORD_TRASH_HEADERS.every(
    (header, index) => String(currentHeaders[index] || "").trim() === header
  );
  if (!headersMatch) {
    throw new Error(
      "削除済み記録シートの見出しが現在の形式と異なります。データ保護のため自動変換を中止しました。"
    );
  }
}

function getDeletedHarvestRecordIdentitySet() {
  const identities = new Set();
  getHarvestRecordTombstoneItems().forEach(item => {
    if (item.recordUuid) identities.add("u:" + item.recordUuid);
    if (item.id !== null) identities.add("i:" + String(item.id));
  });
  const sheet = getExistingRecordTrashSheet();
  if (!sheet || sheet.getLastRow() < 2) return identities;
  ensureRecordTrashSheet(sheet);
  const rows = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, RECORD_TRASH_HEADERS.length)
    .getValues();
  rows.forEach(row => {
    const record = rowToRecord(HEADERS, row.slice(0, HEADERS.length));
    if (record.recordUuid) identities.add("u:" + record.recordUuid);
    if (record.id !== null && String(record.id).trim()) identities.add("i:" + String(record.id));
  });
  return identities;
}

function getDeletedRecordIdSet() {
  return getDeletedHarvestRecordIdentitySet();
}

function listDeletedHarvestRecordTombstones() {
  return withRecordReadLock(() => listDeletedHarvestRecordTombstonesUnlocked());
}

function listDeletedHarvestRecordTombstonesUnlocked() {
  const itemsByIdentity = new Map();
  getHarvestRecordTombstoneItems().forEach(item => {
    const key = item.recordUuid ? "u:" + item.recordUuid : "i:" + String(item.id);
    const existing = itemsByIdentity.get(key);
    if (!existing || item.deletedTime > existing.deletedTime) itemsByIdentity.set(key, item);
  });
  return [...itemsByIdentity.values()]
    .sort((a, b) => (
      b.deletedTime - a.deletedTime ||
      String(a.recordUuid || a.id).localeCompare(String(b.recordUuid || b.id))
    ))
    .slice(0, RECORD_TOMBSTONE_LIST_LIMIT)
    .map(item => ({
      recordUuid: item.recordUuid || "",
      id: item.id === null ? null : item.id,
      deletedAt: item.deletedAt || ""
    }));
}

function assertRecordIsNotDeleted(record, deletedRecordIdentities) {
  const recordUuid = String(record && record.recordUuid || "").trim().toLowerCase();
  const id = String(record && record.id != null ? record.id : "").trim();
  const isDeleted = recordUuid
    ? deletedRecordIdentities.has("u:" + recordUuid)
    : (id && deletedRecordIdentities.has("i:" + id));
  if (isDeleted) {
    throw new Error("この記録は削除済みです。復元してから保存してください。");
  }
}

function ensureRecordTrashSheet(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    if (RECORD_TRASH_HEADERS.length > sheet.getMaxColumns()) {
      sheet.insertColumnsAfter(
        sheet.getMaxColumns(),
        RECORD_TRASH_HEADERS.length - sheet.getMaxColumns()
      );
    }
    sheet.getRange(1, 1, 1, RECORD_TRASH_HEADERS.length).setValues([RECORD_TRASH_HEADERS]);
    applyRecordTrashSheetLayout(sheet);
    return;
  }

  const currentHeaders = sheet
    .getRange(1, 1, 1, Math.max(sheet.getLastColumn(), RECORD_TRASH_HEADERS.length))
    .getValues()[0];
  const headersMatch = RECORD_TRASH_HEADERS.every(
    (header, index) => String(currentHeaders[index] || "").trim() === header
  );
  if (headersMatch) return;
  validateRecordTrashSheetHeaders(sheet);
}

function applyRecordTrashSheetLayout(sheet) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, RECORD_TRASH_HEADERS.length).setFontWeight("bold");
  const deletedAtColumn = RECORD_TRASH_HEADERS.length - 1;
  const expiresAtColumn = RECORD_TRASH_HEADERS.length;
  const rowCount = Math.max(sheet.getMaxRows() - 1, 1);
  sheet.getRange(2, deletedAtColumn, rowCount, 2).setNumberFormat("yyyy-mm-dd hh:mm:ss");
  ["作成日時", "更新日時", "受信日時"].forEach(header => {
    const column = RECORD_TRASH_HEADERS.indexOf(header) + 1;
    if (column > 0) sheet.getRange(2, column, rowCount, 1).setNumberFormat("yyyy-mm-dd hh:mm:ss");
  });
  ["重複判定キー", "記録ID", "記録UUID", "大きさ", "パレット詳細", "苗植え詳細", "先取り詳細"].forEach(header => {
    const column = RECORD_TRASH_HEADERS.indexOf(header) + 1;
    if (column > 0) sheet.hideColumns(column);
  });
}

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

function ensureMonitorSettings(sheet) {
  const header = sheet.getRange(1, 1, 1, 2).getValues()[0] || [];
  const firstHeader = String(header[0] || "").trim();
  const secondHeader = String(header[1] || "").trim();

  if (firstHeader !== "key" || secondHeader !== "value") {
    sheet.clearContents();
    const rows = [["key", "value", "説明"]].concat(MONITOR_SETTING_KEYS.map(key => [
      key,
      getDefaultMonitorSettingValue(key),
      MONITOR_SETTING_LABELS[key] || key
    ]));
    sheet.getRange(1, 1, rows.length, 3).setValues(rows);
    applyMonitorSheetLayout(sheet);
    return;
  }

  const rowCount = Math.max(sheet.getLastRow() - 1, 0);
  const existingKeys = rowCount
    ? sheet.getRange(2, 1, rowCount, 1).getValues().map(row => String(row[0] || "").trim())
    : [];

  const missingKeys = MONITOR_SETTING_KEYS.filter(key => !existingKeys.includes(key));
  if (!missingKeys.length) return;

  const startRow = Math.max(sheet.getLastRow() + 1, 2);
  sheet.getRange(startRow, 1, missingKeys.length, 3).setValues(missingKeys.map(key => [
    key,
    getDefaultMonitorSettingValue(key),
    MONITOR_SETTING_LABELS[key] || key
  ]));
  applyMonitorSheetLayout(sheet);
}

function applyMonitorSheetLayout(sheet) {
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, 1, 160);
  sheet.setColumnWidths(2, 1, 420);
  sheet.setColumnWidths(3, 1, 180);
  sheet.getRange(1, 1, 1, 3).setFontWeight("bold");
  sheet.getRange(2, 2, Math.max(sheet.getMaxRows() - 1, 1), 1).setWrap(true);
}

function ensureMonitorHistorySheet(sheet) {
  const currentHeaders = sheet
    .getRange(1, 1, 1, MONITOR_HISTORY_HEADERS.length)
    .getValues()[0];
  const headersMatch = MONITOR_HISTORY_HEADERS.every(
    (header, index) => String(currentHeaders[index] || "").trim() === header
  );
  if (headersMatch) return;

  sheet.clearContents();
  sheet.getRange(1, 1, 1, MONITOR_HISTORY_HEADERS.length).setValues([MONITOR_HISTORY_HEADERS]);
  applyMonitorHistorySheetLayout(sheet);
}

function applyMonitorHistorySheetLayout(sheet) {
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, 1, 150);
  sheet.setColumnWidths(2, 1, 90);
  sheet.setColumnWidths(3, 1, 90);
  sheet.setColumnWidths(4, 1, 360);
  sheet.setColumnWidths(5, 1, 300);
  sheet.setColumnWidths(6, 1, 260);
  sheet.getRange(1, 1, 1, MONITOR_HISTORY_HEADERS.length).setFontWeight("bold");
  sheet.getRange(2, 4, Math.max(sheet.getMaxRows() - 1, 1), 3).setWrap(true);
}

function getDefaultMonitorSettingValue(key) {
  if (key === "enabled") return false;
  if (key === "version") return 1;
  if (key === "harvestFillKeys") return "[]";
  if (key === "updatedAt") return new Date();
  return "";
}

function serializeMonitorSettingValue(key, value) {
  if (key === "harvestFillKeys") {
    return JSON.stringify(normalizeMonitorHarvestFillKeys(value));
  }
  if (key === "enabled") return parseMonitorBoolean(value);
  if (key === "version") return Number(value || 1);
  if (key === "instructionText" || key === "memoText") {
    return escapeSpreadsheetFormulaText(value || "");
  }
  return value || "";
}

function normalizeMonitorContent(settings) {
  const version = Number(settings.version || 1);
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new Error("モニターの更新番号が正しくありません");
  }
  return {
    enabled: parseMonitorBoolean(settings.enabled),
    version,
    instructionText: normalizeStoredMonitorText(
      settings.instructionText,
      "モニターの指示内容",
      MONITOR_INSTRUCTION_LENGTH_LIMIT
    ),
    memoText: normalizeStoredMonitorText(
      settings.memoText,
      "モニターのメモ",
      MONITOR_MEMO_LENGTH_LIMIT
    ),
    harvestFillKeys: normalizeMonitorHarvestFillKeys(settings.harvestFillKeys),
    updatedAt: formatMonitorUpdatedAt(settings.updatedAt)
  };
}

function normalizeMonitorHistoryItem(item) {
  const version = Number(item.version || 0);
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new Error("モニター履歴の更新番号が正しくありません");
  }
  return {
    savedAt: formatMonitorUpdatedAt(item.savedAt),
    version,
    enabled: parseMonitorBoolean(item.enabled),
    instructionText: normalizeStoredMonitorText(
      item.instructionText,
      "モニター履歴の指示内容",
      MONITOR_INSTRUCTION_LENGTH_LIMIT
    ),
    memoText: normalizeStoredMonitorText(
      item.memoText,
      "モニター履歴のメモ",
      MONITOR_MEMO_LENGTH_LIMIT
    ),
    harvestFillKeys: normalizeMonitorHarvestFillKeys(item.harvestFillKeys)
  };
}

function normalizeStoredMonitorText(value, label, maxLength) {
  if (value === null || typeof value === "undefined") return "";
  if (!["string", "number", "boolean"].includes(typeof value)) {
    throw new Error(label + "の保存形式が正しくありません");
  }
  const text = String(value);
  if (text.length > maxLength) throw new Error(label + "が長すぎます");
  if (text.includes("\u0000")) throw new Error(label + "に使用できない文字が含まれています");
  return text;
}

function parseMonitorBoolean(value) {
  if (value === true) return true;
  const text = String(value || "").trim().toLowerCase();
  return ["true", "1", "yes", "on", "有効", "使う"].includes(text);
}

function normalizeMonitorHarvestFillKeys(value) {
  const source = parseMonitorJsonValue(value, []);
  if (!Array.isArray(source)) return [];
  return normalizeMonitorPalletKeys(source, "モニターの収穫場所");
}

function parseMonitorJsonValue(value, fallback) {
  if (Array.isArray(value) || (value && typeof value === "object")) return value;
  const text = String(value || "").trim();
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch (err) {
    return fallback;
  }
}

function formatMonitorUpdatedAt(value) {
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  }
  const text = String(value || "");
  if (text.length > 64) throw new Error("モニターの更新日時が長すぎます");
  return text;
}

function ensureHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    if (HEADERS.length > sheet.getMaxColumns()) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), HEADERS.length - sheet.getMaxColumns());
    }
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    applySheetLayout(sheet, HEADERS);
    return HEADERS.slice();
  }

  const currentHeaders = getHeaderValues(sheet);
  validateRecordHeaders(currentHeaders);

  const existingKeys = new Set(currentHeaders.map(getHeaderKey).filter(Boolean));
  const missingKeys = FIELD_KEYS.filter(key => !existingKeys.has(key));
  if (!missingKeys.length) return currentHeaders;

  const requiredLastColumn = currentHeaders.length + missingKeys.length;
  if (requiredLastColumn > sheet.getMaxColumns()) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), requiredLastColumn - sheet.getMaxColumns());
  }

  const addedHeaders = missingKeys.map(key => HEADER_LABELS[key]);
  sheet
    .getRange(1, currentHeaders.length + 1, 1, addedHeaders.length)
    .setValues([addedHeaders]);
  applyAddedRecordColumnLayout(sheet, currentHeaders.length + 1, missingKeys);
  return currentHeaders.concat(addedHeaders);
}

function getRecordHeadersForRead(sheet) {
  if (!sheet || sheet.getLastRow() === 0) return [];
  const headers = getHeaderValues(sheet);
  validateRecordHeaders(headers);
  return headers;
}

function validateRecordHeaders(headers) {
  if (!looksLikeHeaderRow(headers)) {
    throw new Error(
      "記録シートの見出しを確認できません。データ保護のため自動変換を中止しました。"
    );
  }

  const seenKeys = new Set();
  headers.forEach(header => {
    const key = getHeaderKey(header);
    if (!key) return;
    if (seenKeys.has(key)) {
      throw new Error(
        "記録シートに同じ意味の見出しが重複しています: " + String(header || "")
      );
    }
    seenKeys.add(key);
  });

  const missingRequiredKeys = ["id", "type", "date", "cases"]
    .filter(key => !seenKeys.has(key));
  if (missingRequiredKeys.length) {
    throw new Error(
      "記録シートに必須の見出しがありません: " +
      missingRequiredKeys.map(key => HEADER_LABELS[key]).join("、")
    );
  }
}

function applyAddedRecordColumnLayout(sheet, startColumn, keys) {
  const formats = {
    id: "0",
    date: "yyyy-mm-dd",
    cases: "0",
    plannedSeedlingTrayCount: "0",
    actualSeedlingTrayCount: "0",
    actualSeedlingLossRate: "0.0",
    actualLoss: "0.0",
    createdAt: "yyyy-mm-dd hh:mm:ss",
    updatedAt: "yyyy-mm-dd hh:mm:ss",
    receivedAt: "yyyy-mm-dd hh:mm:ss"
  };
  const hiddenKeys = new Set([
    "duplicateKey",
    "id",
    "recordUuid",
    "sizeRating",
    "palletKeys",
    "plantingPalletKeys",
    "targets",
    "palletNumberingVersion"
  ]);

  keys.forEach((key, index) => {
    const column = startColumn + index;
    const dataRowCount = sheet.getMaxRows() - 1;
    if (formats[key] && dataRowCount > 0) {
      sheet.getRange(2, column, dataRowCount, 1).setNumberFormat(formats[key]);
    }
    if (hiddenKeys.has(key)) sheet.hideColumns(column);
  });
}

function applySheetLayout(sheet, headers) {
  applyColumnFormats(sheet, headers);
  applyColumnVisibility(sheet, headers);
  sheet.setFrozenRows(1);
}

function applyColumnFormats(sheet, headers) {
  const formats = {
    id: "0",
    date: "yyyy-mm-dd",
    cases: "0",
    plannedSeedlingTrayCount: "0",
    actualSeedlingTrayCount: "0",
    actualSeedlingLossRate: "0.0",
    actualLoss: "0.0",
    createdAt: "yyyy-mm-dd hh:mm:ss",
    updatedAt: "yyyy-mm-dd hh:mm:ss",
    receivedAt: "yyyy-mm-dd hh:mm:ss"
  };

  Object.keys(formats).forEach(key => {
    const col = getHeaderColumn(headers, key);
    if (col <= 0) return;
    sheet.getRange(2, col, sheet.getMaxRows() - 1, 1).setNumberFormat(formats[key]);
  });
}

function applyColumnVisibility(sheet, headers) {
  const lastColumn = Math.max(sheet.getLastColumn(), headers.length);
  sheet.showColumns(1, lastColumn);

  [
    "duplicateKey",
    "id",
    "recordUuid",
    "sizeRating",
    "palletKeys",
    "plantingPalletKeys",
    "targets",
    "palletNumberingVersion"
  ].forEach(key => {
    const col = getHeaderColumn(headers, key);
    if (col <= 0) return;
    sheet.hideColumns(col);
  });
}

function looksLikeHeaderRow(headers) {
  const knownHeaderCount = headers.filter(header => {
    return isKnownHeader(header);
  }).length;
  return knownHeaderCount >= 2;
}

function isKnownHeader(header) {
  return !!getHeaderKey(header);
}

function getHeaderKey(header) {
  const text = String(header || "").trim();
  if (FIELD_KEYS.includes(text)) return text;
  const match = FIELD_KEYS.find(key => HEADER_LABELS[key] === text);
  if (match) return match;
  return "";
}

function getHeaderColumn(headers, key) {
  return headers.findIndex(header => getHeaderKey(header) === key) + 1;
}

function getHeaderValues(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  return sheet
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map(value => String(value || "").trim());
}

function hasDuplicateRecord(sheet, headers, duplicateKey, record) {
  const duplicateKeyCol = getHeaderColumn(headers, "duplicateKey");
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  const acceptableKeys = new Set([
    String(duplicateKey || "").trim(),
    makeDuplicateKey(record)
  ].filter(Boolean));

  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

  return values.some(row => {
    if (!isCommittedHarvestRecordRow(headers, row)) return false;
    const existingRecord = rowToRecord(headers, row);
    const existingKey = duplicateKeyCol > 0 ? String(row[duplicateKeyCol - 1] || "").trim() : "";
    return [
      existingKey,
      makeDuplicateKey(existingRecord)
    ].filter(Boolean).some(key => acceptableKeys.has(key));
  });
}

function rowToRecord(headers, row) {
  const item = {};
  headers.forEach((header, index) => {
    const key = getHeaderKey(header);
    if (!key) return;
    item[key] = row[index];
  });

  const syncProvidedFields = [];
  if (String(item.plantingCaseInstruction == null ? "" : item.plantingCaseInstruction).trim()) {
    syncProvidedFields.push("plantingCaseInstruction");
  }
  if (["loss", "carryover"].includes(String(item.actualSeedlingCarryoverMode || "").trim())) {
    syncProvidedFields.push("actualSeedlingCarryoverMode");
  }

  return {
    syncSchemaVersion: RECORD_SYNC_SCHEMA_VERSION,
    syncProvidedFields,
    palletNumberingVersion: item.palletNumberingVersion,
    duplicateKey: item.duplicateKey,
    id: item.id,
    recordUuid: String(item.recordUuid || "").trim().toLowerCase(),
    type: item.type,
    date: formatDateValue(item.date),
    cases: item.cases,
    palletSummary: item.palletSummary,
    plannedSeedlingTrayCount: item.plannedSeedlingTrayCount,
    plantingCaseInstruction: item.plantingCaseInstruction,
    plantingSummary: item.plantingSummary,
    plantingDate: formatDateValue(item.plantingDate),
    actualSeedlingTrayCount: item.actualSeedlingTrayCount,
    actualSeedlingCarryoverMode: item.actualSeedlingCarryoverMode,
    actualSeedlingLossRate: item.actualSeedlingLossRate,
    actualLoss: item.actualLoss,
    qualityText: item.qualityText,
    sizeRating: item.sizeRating,
    plantingAge: item.plantingAge,
    memo: item.memo,
    palletKeys: parseStoredJsonArray(item.palletKeys, "収穫パレット"),
    plantingPalletKeys: parseStoredJsonArray(item.plantingPalletKeys, "苗植えパレット"),
    targets: parseStoredJsonArray(item.targets, "先取り対象"),
    createdAt: formatHarvestRecordTimestamp(item.createdAt),
    updatedAt: formatHarvestRecordTimestamp(item.updatedAt)
  };
}

function formatHarvestRecordTimestamp(value) {
  if (value === null || typeof value === "undefined" || value === "") return "";
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Number.isFinite(value.getTime()) ? value.toISOString() : "";
  }
  const text = String(value).trim();
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function makeDuplicateKey(record) {
  return [
    formatDateValue(record && record.date),
    Number(record && record.cases || 0)
  ].join("__");
}

function formatSizeRatingValue(value) {
  const text = String(value || "").trim();
  if (text === "unknown" || text === "不明") return "不明";
  if (text === "large" || text === "大きい") return "大きい";
  if (text === "small" || text === "小さい") return "小さい";
  if (text === "normal" || text === "並") return "並";
  return "不明";
}

function formatQualityTextValue(record) {
  if (!record || typeof record !== "object") return "";

  const directText = String(record.qualityText || "").trim();
  if (directText) return directText;

  const memo = record.qualityMemo;
  if (typeof memo === "string") return memo.trim();

  if (memo && typeof memo === "object") {
    const tags = Array.isArray(memo.tags) ? memo.tags : [];
    const other = String(memo.other || "").trim();
    return tags
      .map(formatQualityTagLabel)
      .filter(Boolean)
      .concat(other ? [other] : [])
      .join("、");
  }

  return "";
}

function formatQualityTagLabel(value) {
  const text = String(value || "").trim();
  if (text === "large" || text === "大きい") return "大きい";
  if (text === "small" || text === "小さい") return "小さい";
  if (text === "elongated" || text === "徒長") return "徒長";
  if (text === "chip" || text === "チップ") return "チップ";
  return "";
}

function formatPlantingAgeValue(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value !== "object") return "";

  const building = String(value.building || "").trim();
  const summary = String(value.summary || "").trim();
  const detail = String(value.detail || "").trim();
  const prefix = building ? building + "号棟 " : "";

  return [
    summary ? prefix + summary : "",
    detail
  ].filter(Boolean).join("\n");
}

function formatDateValue(value) {
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return String(value || "");
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
