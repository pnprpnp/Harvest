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
