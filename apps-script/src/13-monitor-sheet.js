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
