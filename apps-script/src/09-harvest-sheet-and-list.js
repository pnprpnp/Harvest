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

function backfillHarvestRecordSyncMetadata(sheet, headers, options) {
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
          "行目を旧記録として判別できません。記録種別・収穫日・ケース数を確認してください"
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
    makeAnyDuplicateKey(record),
    makeLegacyDuplicateKey(record)
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
