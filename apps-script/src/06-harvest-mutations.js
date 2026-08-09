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
