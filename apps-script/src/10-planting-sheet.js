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
    seedlingHousePrimaryPlantingDate: "yyyy-mm-dd",
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
    "plantingCountsByPallet",
    "seedlingHousePalletKeys",
    "seedlingHouseNextStartKey",
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
    seedlingHousePrimaryPlantingDate: "yyyy-mm-dd",
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
  ["eventId", "sourceAllocations", "plantingPalletKeys", "plantingCountsByPallet", "seedlingHousePalletKeys", "seedlingHouseNextStartKey", "palletNumberingVersion"].forEach(key => {
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
    plantingCountsByPallet: escapeSpreadsheetFormulaText(
      JSON.stringify(event.plantingCountsByPallet || {})
    ),
    actualSeedlingTrayCount: detailsUnknown ? "" : event.actualSeedlingTrayCount ?? "",
    seedlingHousePalletKeys: escapeSpreadsheetFormulaText(
      JSON.stringify(event.seedlingHousePalletKeys || [])
    ),
    seedlingHousePrimaryPlantingDate: event.seedlingHousePrimaryPlantingDate || "",
    seedlingHouseNextStartKey: event.seedlingHouseNextStartKey || "",
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
    plantingCountsByPallet: parseStoredJsonObject(
      item.plantingCountsByPallet,
      "パレット別植え付け株数"
    ),
    actualSeedlingTrayCount: item.actualSeedlingTrayCount,
    seedlingHousePalletKeys: parseStoredJsonArray(item.seedlingHousePalletKeys, "1号棟苗取り場所"),
    seedlingHousePrimaryPlantingDate: formatDateValue(item.seedlingHousePrimaryPlantingDate),
    seedlingHouseNextStartKey: item.seedlingHouseNextStartKey,
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

function migratePlantingEventTrashSheetPlantingCountsColumn(sheet) {
  if (!sheet || sheet.getLastRow() === 0) return false;
  const legacyHeaders = PLANTING_EVENT_FIELD_KEYS
    .filter(key => key !== "plantingCountsByPallet")
    .map(key => PLANTING_EVENT_HEADER_LABELS[key])
    .concat(["削除日時", "復元期限"]);
  if (sheet.getLastColumn() < legacyHeaders.length) return false;
  const currentHeaders = sheet
    .getRange(1, 1, 1, legacyHeaders.length)
    .getValues()[0]
    .map(value => String(value || "").trim());
  if (!legacyHeaders.every((header, index) => currentHeaders[index] === header)) return false;

  const insertColumn = PLANTING_EVENT_FIELD_KEYS.indexOf("plantingCountsByPallet") + 1;
  sheet.insertColumnBefore(insertColumn);
  sheet
    .getRange(1, insertColumn)
    .setValue(PLANTING_EVENT_HEADER_LABELS.plantingCountsByPallet);
  return true;
}

function ensurePlantingEventTrashSheet(sheet) {
  migratePlantingEventTrashSheetPlantingCountsColumn(sheet);
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
  ["eventId", "sourceAllocations", "plantingPalletKeys", "plantingCountsByPallet", "palletNumberingVersion"].forEach(key => {
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
  ensurePlantingEventTrashSheet(sheet);
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
    ensurePlantingEventTrashSheet(sheet);
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
