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

function parseStoredJsonObject(value, label) {
  if (isPlainObject(value)) return value;
  const text = String(value == null ? "" : value).trim().replace(/^'(?=[\[{])/, "");
  if (!text) return {};
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(label + "の保存形式が正しくありません");
  }
  if (!isPlainObject(parsed)) throw new Error(label + "の保存形式が正しくありません");
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
