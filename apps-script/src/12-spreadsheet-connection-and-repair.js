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
