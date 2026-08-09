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
  const requestId = String(!record || record.id == null ? "" : record.id).trim();
  const matches = [];
  rows.forEach((row, index) => {
    const marker = getHarvestWriteMarker(headers, row);
    if (!marker) return;
    const markerRequestUuid = String(marker.requestUuid || "").trim().toLowerCase();
    const sameIdentity = requestUuid
      ? markerRequestUuid === requestUuid
      : (!markerRequestUuid && String(marker.requestId || "").trim() === requestId);
    if (sameIdentity) matches.push({ row, marker, rowNumber: index + 2 });
  });
  if (!matches.length) {
    const receivedAtColumn = getHeaderColumn(headers, "receivedAt");
    const uuidColumn = getHeaderColumn(headers, "recordUuid");
    const idColumn = getHeaderColumn(headers, "id");
    const dateColumn = getHeaderColumn(headers, "date");
    const casesColumn = getHeaderColumn(headers, "cases");
    const updatedAtColumn = getHeaderColumn(headers, "updatedAt");
    const legacyMatches = [];
    rows.forEach((row, index) => {
      if (receivedAtColumn > 0 && String(row[receivedAtColumn - 1] || "").trim()) return;
      const rowUuid = uuidColumn > 0
        ? String(row[uuidColumn - 1] || "").trim().toLowerCase()
        : "";
      const rowId = idColumn > 0
        ? String(row[idColumn - 1] == null ? "" : row[idColumn - 1]).trim()
        : "";
      const identityMatches = requestUuid
        ? (rowUuid === requestUuid || (!rowUuid && !!requestId && rowId === requestId))
        : (!!requestId && rowId === requestId);
      if (!identityMatches) return;
      const rowDate = dateColumn > 0 ? formatDateValue(row[dateColumn - 1]) : "";
      const rowCases = casesColumn > 0
        ? String(row[casesColumn - 1] == null ? "" : row[casesColumn - 1]).trim()
        : "";
      if ((rowDate && rowDate !== record.date) ||
        (rowCases && Number(rowCases) !== Number(record.cases))) return;
      const storedUpdatedAt = updatedAtColumn > 0
        ? normalizeWriteTimestampToken(row[updatedAtColumn - 1])
        : "";
      const baseUpdatedAt = normalizeWriteTimestampToken(record.updatedAt);
      let storedRecordIsComplete = false;
      try {
        const storedRecord = normalizeHarvestRecord(rowToRecord(headers, row));
        const expectedRecord = mergeOmittedSyncFieldsFromExistingRow(
          sheet,
          index + 2,
          headers,
          record,
          suppliedSyncFields,
          row
        );
        storedRecordIsComplete = true;
        if (getHarvestRecordContentSignature(storedRecord) !==
          getHarvestRecordContentSignature(expectedRecord)) return;
      } catch (err) {
        storedRecordIsComplete = false;
      }
      if (!storedRecordIsComplete && storedUpdatedAt && storedUpdatedAt !== baseUpdatedAt) return;
      const canonicalRecord = {
        ...record,
        id: rowId || record.id,
        recordUuid: rowUuid || record.recordUuid || Utilities.getUuid().toLowerCase()
      };
      const marker = parseWriteMarker(
        buildHarvestWriteMarker(
          record,
          canonicalRecord,
          suppliedSyncFields,
          operation === "any" ? "save" : operation
        ),
        HARVEST_WRITE_MARKER_PREFIX
      );
      legacyMatches.push({ row, marker, rowNumber: index + 2, legacy: true });
    });
    if (legacyMatches.length > 1) {
      throw new Error("同じ収穫記録の旧未完了行が複数あります。データ保護のため再送を中止しました");
    }
    if (legacyMatches.length) matches.push(legacyMatches[0]);
  }
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
