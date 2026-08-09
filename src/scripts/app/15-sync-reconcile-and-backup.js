function mergeGoogleSheetRecordSyncFields(existingRecord, incomingRecord){
  if(!existingRecord || !incomingRecord
    || existingRecord.type !== "fullHarvest" || incomingRecord.type !== "fullHarvest"){
    return false;
  }

  const incomingFields = normalizeRecordSyncProvidedFields(incomingRecord);
  if(!incomingFields.length) return false;

  let changed = false;
  incomingFields.forEach(key => {
    const nextValue = key === "actualSeedlingCarryoverMode"
      ? normalizeSeedlingCarryoverMode(incomingRecord[key])
      : String(incomingRecord[key] || "").trim();
    if(existingRecord[key] === nextValue) return;
    existingRecord[key] = nextValue;
    changed = true;
  });

  const knownFields = new Set([
    ...normalizeRecordSyncProvidedFields(existingRecord),
    ...incomingFields
  ]);
  const nextKnownFields = RECORD_SYNC_FIELD_KEYS.filter(key => knownFields.has(key));
  const currentKnownFields = normalizeRecordSyncProvidedFields(existingRecord);
  if(existingRecord.syncSchemaVersion !== RECORD_SYNC_SCHEMA_VERSION
    || currentKnownFields.join("|") !== nextKnownFields.join("|")){
    existingRecord.syncSchemaVersion = RECORD_SYNC_SCHEMA_VERSION;
    existingRecord.syncProvidedFields = nextKnownFields;
    changed = true;
  }

  return changed;
}

function getHarvestRecordSyncContent(record){
  if(record?.type === "partialHarvest"){
    return {
      type: "partialHarvest",
      date: String(record.date || ""),
      cases: clampNumber(record.cases, 0, RECORD_MAX_CASES, 0),
      memo: String(record.memo || "").trim(),
      targets: normalizePartialHarvestTargets(record.targets)
    };
  }
  return {
    type: "fullHarvest",
    date: String(record?.date || ""),
    cases: clampNumber(record?.cases, 0, RECORD_MAX_CASES, 0),
    palletSummary: String(record?.palletSummary || "").trim(),
    plannedSeedlingTrayCount: clampNumber(record?.plannedSeedlingTrayCount, 0, RECORD_MAX_SEEDLING_TRAYS, 0),
    plantingCaseInstruction: String(record?.plantingCaseInstruction || "").trim(),
    plantingSummary: String(record?.plantingSummary || "").trim(),
    plantingDate: String(record?.plantingDate || "").trim(),
    actualSeedlingTrayCount: clampNumber(record?.actualSeedlingTrayCount, 0, RECORD_MAX_SEEDLING_TRAYS, 0),
    actualSeedlingCarryoverMode: normalizeSeedlingCarryoverMode(record?.actualSeedlingCarryoverMode),
    actualSeedlingLossRate: normalizeHarvestRecordSyncDecimal(record?.actualSeedlingLossRate),
    actualLoss: normalizeHarvestRecordSyncDecimal(record?.actualLoss),
    qualityMemo: normalizeQualityMemo(record?.qualityMemo),
    // Apps Scriptでは定植日数を表示用文字列で保存するため、
    // アプリ内の構造化データも同じ文字列にして送信結果を照合する。
    plantingAge: formatPlantingAgeForRecord(record),
    memo: String(record?.memo || "").trim(),
    palletKeys: getPalletKeysFromRecord(record),
    plantingPalletKeys: getPlantingPalletKeysFromRecord(record, getPalletKeysFromRecord(record))
  };
}

function normalizeHarvestRecordSyncDecimal(value){
  const text = String(value ?? "").trim();
  if(!text) return "";
  const number = Number(text);
  return Number.isFinite(number) ? String(number) : text;
}

function getHarvestRecordSyncContentSignature(record){
  return JSON.stringify(getHarvestRecordSyncContent(record));
}

function normalizeRemoteHarvestTombstones(result){
  const tombstones = [];
  const seen = new Set();
  const add = value => {
    const recordUuid = normalizeRecordUuid(value?.recordUuid ?? (typeof value === "string" ? value : ""));
    const id = getSafePositiveRecordId(value?.id ?? (typeof value === "number" ? value : null));
    if(!recordUuid && id === null) return;
    const key = getHarvestRecordIdentityKey({ recordUuid, id });
    if(seen.has(key)) return;
    seen.add(key);
    tombstones.push({
      recordUuid,
      id,
      deletedAt: normalizeRecordSyncTimestamp(value?.deletedAt)
    });
  };
  (Array.isArray(result?.deletedRecords) ? result.deletedRecords : []).forEach(add);
  (Array.isArray(result?.deletedRecordUuids) ? result.deletedRecordUuids : []).forEach(value => add({ recordUuid: value }));
  (Array.isArray(result?.deletedRecordIds) ? result.deletedRecordIds : []).forEach(value => add({ id: value }));
  if(tombstones.length > GOOGLE_SHEET_MAX_LIST_RECORD_TOMBSTONES){
    throw new Error("削除済み収穫記録の件数が上限を超えています");
  }
  return tombstones;
}

function harvestRecordMatchesIdentity(record, identity){
  const recordIdentity = getHarvestRecordIdentity(record);
  const expectedIdentity = getHarvestRecordIdentity(identity);
  if(recordIdentity.recordUuid && expectedIdentity.recordUuid){
    return recordIdentity.recordUuid === expectedIdentity.recordUuid;
  }
  return recordIdentity.id !== null
    && expectedIdentity.id !== null
    && recordIdentity.id === expectedIdentity.id;
}

function isHarvestRecordHiddenByAppOnlyDelete(record){
  return deletedRecords.some(entry => !entry.sheetDeleted && !entry.syncConflict
    && harvestRecordMatchesIdentity(entry.record, record));
}

function setGoogleSheetSyncStatusInObject(status, record, state){
  const updatedAt = new Date().toISOString();
  getGoogleSheetRecordSyncKeys(record).forEach(key => {
    status[key] = { state, updatedAt };
  });
  const legacyId = String(record?.id || "").trim();
  if(legacyId) delete status[legacyId];
}

function remapHarvestRecordIdReferences(oldId, newId, status){
  const safeOldId = getSafePositiveRecordId(oldId);
  const safeNewId = getSafePositiveRecordId(newId);
  if(safeOldId === null || safeNewId === null || safeOldId === safeNewId) return false;
  const sourceRecord = records.find(record => Number(record.id) === safeOldId) || null;
  const sourceUuid = normalizeRecordUuid(sourceRecord?.recordUuid);
  const occupied = records.find(record => Number(record.id) === safeNewId && record !== sourceRecord);
  if(occupied) throw new Error("同期する収穫記録IDが別の記録と競合しています");

  const remapAllocations = event => {
    let changed = false;
    event.sourceAllocations.forEach(allocation => {
      if(Number(allocation.harvestRecordId) !== safeOldId) return;
      allocation.harvestRecordId = safeNewId;
      changed = true;
    });
    return changed;
  };
  let eventChanged = false;
  plantingEvents.forEach(event => { eventChanged = remapAllocations(event) || eventChanged; });
  deletedPlantingEvents.forEach(entry => {
    eventChanged = remapAllocations(entry.event) || eventChanged;
  });
  deletedRecords.forEach(entry => {
    if(Number(entry.record?.id) !== safeOldId) return;
    const entryUuid = normalizeRecordUuid(entry.record?.recordUuid);
    const isSameIdentity = sourceUuid ? entryUuid === sourceUuid : !entryUuid;
    if(isSameIdentity) entry.record.id = safeNewId;
  });
  if(Number(activePlantingRecordId) === safeOldId) activePlantingRecordId = safeNewId;
  if(Number(editingHarvestRecordId) === safeOldId) editingHarvestRecordId = safeNewId;
  if(Number(editingPartialHarvestRecordId) === safeOldId) editingPartialHarvestRecordId = safeNewId;
  if(Number(plantingRecordDraft?.recordId) === safeOldId) plantingRecordDraft.recordId = safeNewId;

  const migratedIds = loadMigratedPlantingRecordIds();
  if(migratedIds.delete(safeOldId)){
    migratedIds.add(safeNewId);
    localStorage.setItem(
      PLANTING_EVENTS_MIGRATION_KEY,
      JSON.stringify([...migratedIds].sort((a, b) => a - b))
    );
  }
  if(status?.["id:" + safeOldId] && !status["id:" + safeNewId]){
    status["id:" + safeNewId] = status["id:" + safeOldId];
  }
  if(status) delete status["id:" + safeOldId];
  if(eventChanged) invalidatePlantingEventStateCache();
  return eventChanged;
}

function getNextAvailableLocalHarvestRecordId(reservedIds = null){
  const reserved = reservedIds instanceof Set ? reservedIds : new Set();
  const trashIds = new Set(deletedRecords
    .map(entry => getSafePositiveRecordId(entry.record?.id))
    .filter(value => value !== null));
  let candidate = Math.max(1, Date.now());
  while(candidate <= RECORD_MAX_ID
    && (records.some(record => Number(record.id) === candidate)
      || trashIds.has(candidate)
      || reserved.has(candidate))){
    candidate++;
  }
  if(getSafePositiveRecordId(candidate) === null){
    throw new Error("ローカル収穫記録へ新しいIDを割り当てられません");
  }
  return candidate;
}

function reassignLocalHarvestRecordId(record, newId, status){
  const oldId = getSafePositiveRecordId(record?.id);
  const safeNewId = getSafePositiveRecordId(newId);
  if(!record || oldId === null || safeNewId === null || oldId === safeNewId) return false;
  const eventChanged = remapHarvestRecordIdReferences(oldId, safeNewId, status);
  record.id = safeNewId;
  return eventChanged;
}

function reconcileGoogleSheetRecords(sourceRecords, tombstones, options = {}){
  if(!Array.isArray(sourceRecords)) throw new Error("同期する収穫記録の形式が正しくありません");
  const normalizedIncomingRaw = sourceRecords.map((source, index) => {
    const row = normalizeGoogleSheetRowRecord(source);
    const record = normalizeImportedRecord(row, index);
    if(!record){
      const validation = row && typeof row === "object"
        ? validateRecordForGoogleTransfer(row)
        : { ok: false, message: "記録の形式または同期情報が正しくありません" };
      const detail = validation.ok
        ? "同期に必要な日付・ケース数・収穫場所・ロス率・パレット情報のいずれかがありません"
        : validation.message;
      const identity = row && typeof row === "object"
        ? "（記録ID: " + String(row.id ?? "なし") + "、日付: " + String(row.date || "なし") + "）"
        : "";
      throw new Error(
        "同期する収穫記録" + (index + 1) + "件目" + identity + "に不正な値があります: " + detail
      );
    }
    return record;
  });
  const incomingByIdentity = new Map();
  normalizedIncomingRaw.forEach(record => {
    const key = getHarvestRecordIdentityKey(record);
    // ページ取得中に同じ記録が再更新された場合は、後から取得した最新版を採用する。
    incomingByIdentity.set(key, record);
  });
  const tombstoneUuids = new Set((Array.isArray(tombstones) ? tombstones : [])
    .map(item => normalizeRecordUuid(item.recordUuid)).filter(Boolean));
  const tombstoneIds = new Set((Array.isArray(tombstones) ? tombstones : [])
    .map(item => getSafePositiveRecordId(item.id)).filter(value => value !== null));
  const normalizedIncoming = [...incomingByIdentity.values()].filter(record => {
    const uuid = normalizeRecordUuid(record.recordUuid);
    return uuid ? !tombstoneUuids.has(uuid) : !tombstoneIds.has(Number(record.id));
  });
  const remoteCanonicalIds = new Set(normalizedIncoming
    .map(record => getSafePositiveRecordId(record.id))
    .filter(value => value !== null));

  const status = loadGoogleSheetSyncStatus();
  let addedCount = 0;
  let updatedCount = 0;
  let deletedCount = 0;
  let conflictCount = 0;
  let plantingReferenceChanged = false;
  let recordIdChanged = false;
  const recordsByUuid = new Map();
  const recordsById = new Map();
  records.forEach(record => {
    const uuid = normalizeRecordUuid(record.recordUuid);
    if(uuid && recordsByUuid.has(uuid)){
      throw new Error("アプリ内に同じ収穫記録UUIDが重複しています。データ保護のため同期を中止しました");
    }
    if(recordsById.has(Number(record.id))){
      throw new Error("アプリ内に同じ収穫記録IDが重複しています。苗植え参照を保護するため同期を中止しました");
    }
    if(uuid) recordsByUuid.set(uuid, record);
    recordsById.set(Number(record.id), record);
  });
  const trashByUuid = new Map();
  const trashById = new Map();
  deletedRecords.forEach(entry => {
    const uuid = normalizeRecordUuid(entry.record?.recordUuid);
    if(uuid){
      if(!trashByUuid.has(uuid)) trashByUuid.set(uuid, []);
      trashByUuid.get(uuid).push(entry);
    }
    const id = getSafePositiveRecordId(entry.record?.id);
    if(id !== null){
      if(!trashById.has(id)) trashById.set(id, []);
      trashById.get(id).push(entry);
    }
  });
  const recordsToDelete = new Set();

  (Array.isArray(tombstones) ? tombstones : []).forEach(tombstone => {
    const matchingTrash = tombstone.recordUuid
      ? (trashByUuid.get(tombstone.recordUuid) || [])
      : (trashById.get(Number(tombstone.id)) || []);
    matchingTrash.forEach(entry => {
      if(!tombstone.recordUuid && normalizeRecordUuid(entry.record?.recordUuid)) return;
      entry.sheetDeleted = true;
      entry.remoteDeleted = true;
    });
    const local = tombstone.recordUuid
      ? recordsByUuid.get(tombstone.recordUuid)
      : recordsById.get(Number(tombstone.id));
    if(!local || (!tombstone.recordUuid && normalizeRecordUuid(local.recordUuid))) return;
    const isBeingEdited = Number(editingHarvestRecordId) === Number(local.id)
      || Number(editingPartialHarvestRecordId) === Number(local.id)
      || Number(activePlantingRecordId) === Number(local.id);
    const dependencies = local.type === "fullHarvest" ? getPlantingEventsForHarvest(local.id) : [];
    const hasLocalChange = hasPendingGoogleSheetRecordChange(local, status);
    if(isBeingEdited || dependencies.length || hasLocalChange){
      upsertSyncConflict({
        entityType: "record",
        reason: dependencies.length
          ? "remote_deleted_dependency"
          : (isBeingEdited ? "editing" : "remote_deleted"),
        localVersion: local,
        remoteVersion: null
      });
      setGoogleSheetSyncStatusInObject(status, local, "conflict");
      conflictCount++;
      return;
    }
    addRecordToTrash(local, {
      sheetDeleted: true,
      syncConflict: false,
      remoteDeleted: true,
      deferSave: true
    });
    recordsToDelete.add(local);
    const localUuid = normalizeRecordUuid(local.recordUuid);
    if(localUuid) recordsByUuid.delete(localUuid);
    recordsById.delete(Number(local.id));
    clearGoogleSheetRecordSyncStatus(status, local);
    deletedCount++;
  });
  if(recordsToDelete.size){
    records = records.filter(record => !recordsToDelete.has(record));
  }
  const recordIndexByObject = new Map(records.map((record, index) => [record, index]));

  const hiddenAppOnlyUuids = new Set();
  const hiddenAppOnlyIds = new Set();
  deletedRecords.forEach(entry => {
    if(entry.sheetDeleted || entry.syncConflict) return;
    const uuid = normalizeRecordUuid(entry.record?.recordUuid);
    if(uuid) hiddenAppOnlyUuids.add(uuid);
    const id = getSafePositiveRecordId(entry.record?.id);
    if(!uuid && id !== null) hiddenAppOnlyIds.add(id);
  });
  const trashEntriesToRemove = new Set();

  normalizedIncoming.forEach(incoming => {
    const incomingUuid = normalizeRecordUuid(incoming.recordUuid);
    if((incomingUuid && hiddenAppOnlyUuids.has(incomingUuid))
      || hiddenAppOnlyIds.has(Number(incoming.id))) return;
    let local = incomingUuid
      ? recordsByUuid.get(incomingUuid)
      : null;
    if(!local){
      let idMatch = recordsById.get(Number(incoming.id));
      if(idMatch){
        const localUuid = normalizeRecordUuid(idMatch.recordUuid);
        if(localUuid && incomingUuid && localUuid !== incomingUuid){
          if(!hasPendingGoogleSheetRecordChange(idMatch, status)){
            throw new Error("同じ数値IDに異なる送信済み収穫記録があります");
          }
          const idMatchOldId = Number(idMatch.id);
          const reassignedId = getNextAvailableLocalHarvestRecordId(remoteCanonicalIds);
          plantingReferenceChanged = reassignLocalHarvestRecordId(
            idMatch,
            reassignedId,
            status
          ) || plantingReferenceChanged;
          recordsById.delete(idMatchOldId);
          recordsById.set(reassignedId, idMatch);
          recordIdChanged = true;
          idMatch = null;
        }
        if(idMatch) local = idMatch;
      }
    }

    const restorableTrash = incomingUuid
      ? (trashByUuid.get(incomingUuid) || [])
      : (trashById.get(Number(incoming.id)) || []);
    restorableTrash.forEach(entry => {
      if(entry.sheetDeleted && !entry.syncConflict) trashEntriesToRemove.add(entry);
    });

    if(!local){
      if(recordsById.has(Number(incoming.id))){
        throw new Error("同期する収穫記録IDが既存記録と競合しています");
      }
      records.push(incoming);
      recordIndexByObject.set(incoming, records.length - 1);
      if(incomingUuid) recordsByUuid.set(incomingUuid, incoming);
      recordsById.set(Number(incoming.id), incoming);
      setGoogleSheetSyncStatusInObject(status, incoming, "confirmed");
      addedCount++;
      return;
    }

    const oldId = Number(local.id);
    const newId = Number(incoming.id);
    const canonicalIncoming = {
      ...incoming,
      recordUuid: incomingUuid || normalizeRecordUuid(local.recordUuid),
      createdAt: incoming.createdAt || local.createdAt || ""
    };
    const incomingHarvestKeys = canonicalIncoming.type === "fullHarvest"
      ? new Set(getPalletKeysFromRecord(canonicalIncoming))
      : new Set();
    const hasIncompatiblePlantingDependency = getPlantingEventsForHarvest(oldId)
      .some(event => event.sourceAllocations.some(allocation => (
        Number(allocation.harvestRecordId) === oldId
        && allocation.palletKeys.some(key => !incomingHarvestKeys.has(key))
      )));
    if(hasIncompatiblePlantingDependency){
      local.recordUuid = canonicalIncoming.recordUuid || local.recordUuid || "";
      local.createdAt = canonicalIncoming.createdAt || local.createdAt || "";
      if(canonicalIncoming.recordUuid) recordsByUuid.set(canonicalIncoming.recordUuid, local);
      recordsById.set(oldId, local);
      upsertSyncConflict({
        entityType: "record",
        reason: "planting_dependency",
        localVersion: local,
        remoteVersion: canonicalIncoming
      });
      setGoogleSheetSyncStatusInObject(status, local, "dependencyConflict");
      conflictCount++;
      return;
    }
    if(oldId !== newId){
      const canonicalIdOccupant = recordsById.get(newId);
      if(canonicalIdOccupant && canonicalIdOccupant !== local){
        if(!hasPendingGoogleSheetRecordChange(canonicalIdOccupant, status)){
          throw new Error("同期する収穫記録IDが別の送信済み記録と競合しています");
        }
        const occupantOldId = Number(canonicalIdOccupant.id);
        const reassignedId = getNextAvailableLocalHarvestRecordId(remoteCanonicalIds);
        plantingReferenceChanged = reassignLocalHarvestRecordId(
          canonicalIdOccupant,
          reassignedId,
          status
        ) || plantingReferenceChanged;
        recordsById.delete(occupantOldId);
        recordsById.set(reassignedId, canonicalIdOccupant);
        recordIdChanged = true;
      }
      plantingReferenceChanged = remapHarvestRecordIdReferences(oldId, newId, status)
        || plantingReferenceChanged;
      recordIdChanged = true;
      recordsById.delete(oldId);
    }
    const sameContent = getHarvestRecordSyncContentSignature(local)
      === getHarvestRecordSyncContentSignature(canonicalIncoming);
    const hasLocalChange = hasPendingGoogleSheetRecordChange(local, status);
    const sameServerVersion = !!local.updatedAt && !!canonicalIncoming.updatedAt
      && local.updatedAt === canonicalIncoming.updatedAt;
    const isBeingEdited = Number(editingHarvestRecordId) === oldId
      || Number(editingPartialHarvestRecordId) === oldId
      || Number(activePlantingRecordId) === oldId;

    if(!sameContent && isBeingEdited){
      local.recordUuid = canonicalIncoming.recordUuid || local.recordUuid || "";
      local.createdAt = canonicalIncoming.createdAt || local.createdAt || "";
      if(oldId !== newId) local.id = newId;
      if(canonicalIncoming.recordUuid) recordsByUuid.set(canonicalIncoming.recordUuid, local);
      recordsById.set(newId, local);
      upsertSyncConflict({
        entityType: "record",
        reason: "editing",
        localVersion: local,
        remoteVersion: canonicalIncoming
      });
      setGoogleSheetSyncStatusInObject(status, local, "conflict");
      conflictCount++;
      return;
    }

    if(hasLocalChange && !sameContent && sameServerVersion){
      local.recordUuid = canonicalIncoming.recordUuid || local.recordUuid || "";
      local.createdAt = canonicalIncoming.createdAt || local.createdAt || "";
      if(oldId !== newId) local.id = newId;
      if(canonicalIncoming.recordUuid) recordsByUuid.set(canonicalIncoming.recordUuid, local);
      recordsById.set(newId, local);
      setGoogleSheetSyncStatusInObject(status, local, "edited");
      return;
    }

    if(hasLocalChange && !sameContent){
      if(oldId !== newId) local.id = newId;
      local.recordUuid = canonicalIncoming.recordUuid || local.recordUuid || "";
      local.createdAt = canonicalIncoming.createdAt || local.createdAt || "";
      if(canonicalIncoming.recordUuid) recordsByUuid.set(canonicalIncoming.recordUuid, local);
      recordsById.set(newId, local);
      upsertSyncConflict({
        entityType: "record",
        reason: "both_updated",
        localVersion: local,
        remoteVersion: canonicalIncoming
      });
      setGoogleSheetSyncStatusInObject(status, local, "conflict");
      conflictCount++;
      return;
    }
    if(sameContent) removeSyncConflictForEntity("record", local);
    const index = recordIndexByObject.get(local);
    if(index >= 0) records[index] = canonicalIncoming;
    recordIndexByObject.delete(local);
    if(index >= 0) recordIndexByObject.set(canonicalIncoming, index);
    const localUuid = normalizeRecordUuid(local.recordUuid);
    if(localUuid && localUuid !== canonicalIncoming.recordUuid) recordsByUuid.delete(localUuid);
    if(canonicalIncoming.recordUuid) recordsByUuid.set(canonicalIncoming.recordUuid, canonicalIncoming);
    recordsById.set(newId, canonicalIncoming);
    setGoogleSheetSyncStatusInObject(status, canonicalIncoming, "confirmed");
    if(!sameContent || local.recordUuid !== canonicalIncoming.recordUuid
      || local.updatedAt !== canonicalIncoming.updatedAt || oldId !== newId){
      updatedCount++;
    }
  });

  if(trashEntriesToRemove.size){
    deletedRecords = deletedRecords.filter(entry => !trashEntriesToRemove.has(entry));
  }
  records.sort(compareRecordsByDateDesc);
  saveRecordsToStorage();
  saveDeletedRecordsToStorage();
  saveGoogleSheetSyncStatus(status);
  if(plantingReferenceChanged){
    savePlantingEventsToStorage();
    saveDeletedPlantingEventsToStorage();
  }
  if(recordIdChanged) saveHarvestStateToStorage();
  return {
    addedCount,
    updatedCount,
    deletedCount,
    conflictCount,
    changedCount: addedCount + updatedCount + deletedCount
  };
}

function importRecordsFromSource(sourceRecords, successMessage, emptyMessage, options = {}){
  if(!Array.isArray(sourceRecords)){
    showRecordImportError("読み込める記録が見つかりませんでした。");
    return false;
  }
  const maxSourceRecords = options.fromBackup ? RECORD_BACKUP_MAX_ITEMS : GOOGLE_SHEET_MAX_LIST_RECORDS;
  if(sourceRecords.length > maxSourceRecords){
    showRecordImportError("一度に読み込める記録は" + maxSourceRecords + "件までです。");
    return false;
  }

  const existingBySignature = new Map();
  records.forEach(record => {
    const signature = makeRecordSignature(record);
    if(!existingBySignature.has(signature)) existingBySignature.set(signature, record);
  });
  const syncStatus = options.markGoogleSheetSynced ? loadGoogleSheetSyncStatus() : null;
  const imported = [];
  const supplemented = [];
  const reservedRecordIds = new Set(records.map(record => Number(record.id)).filter(Number.isFinite));
  sourceRecords.forEach((record, index) => {
    const sourceId = getSafePositiveRecordId(record?.id);
    const normalized = normalizeImportedRecord(record, index);
    if(!normalized){
      if(options.fromBackup){
        throw new Error("バックアップ内の収穫記録" + (index + 1) + "件目に不正な値があります");
      }
      return;
    }
    if(isRecordTemporarilyDeleted(normalized)) return;
    const signature = makeRecordSignature(normalized);
    const existingRecord = existingBySignature.get(signature);
    if(existingRecord){
      if(options.recordIdMap instanceof Map && sourceId !== null){
        options.recordIdMap.set(sourceId, Number(existingRecord.id));
      }
      const existingId = getSafePositiveRecordId(existingRecord.id);
      const canSupplement = options.markGoogleSheetSynced && sourceId !== null && sourceId === existingId
        && !isGoogleSheetRecordUnsent(existingRecord, syncStatus);
      if(canSupplement && mergeGoogleSheetRecordSyncFields(existingRecord, normalized)){
        supplemented.push(existingRecord);
      }
      return;
    }
    let assignedId = sourceId;
    if(assignedId === null || reservedRecordIds.has(assignedId)){
      assignedId = Math.max(1, Date.now() + index);
      while(reservedRecordIds.has(assignedId) && assignedId < Number.MAX_SAFE_INTEGER) assignedId++;
    }
    normalized.id = assignedId;
    reservedRecordIds.add(assignedId);
    if(options.recordIdMap instanceof Map && sourceId !== null){
      options.recordIdMap.set(sourceId, assignedId);
    }
    existingBySignature.set(signature, normalized);
    imported.push(normalized);
  });

  const changedCount = imported.length + supplemented.length;
  if(!changedCount){
    if(!options.silentNoChange){
      showToast(emptyMessage || "追加できる新しい記録はありませんでした");
    }
    return false;
  }

  records = [...imported, ...records].sort(compareRecordsByDateDesc);
  if(!options.deferPlantingMigration) repairLegacyPendingPlantingRecords();
  saveRecordsToStorage();
  if(options.markGoogleSheetSynced){
    markGoogleSheetRecordsSynced(imported, "confirmed");
  }
  if(!options.skipExportPrompt) maybePromptRecordExport();
  refreshRecordDataUi();
  if(!options.silentSuccess){
    showToast((successMessage || "{count}件の記録を読み込みました").replace("{count}", changedCount));
  }
  return changedCount;
}

function prepareBackupPlantingEvents(sourceEvents, recordIdMap){
  if(!Array.isArray(sourceEvents)) return [];
  if(sourceEvents.length > RECORD_BACKUP_MAX_ITEMS){
    throw new Error("苗植え記録が" + RECORD_BACKUP_MAX_ITEMS + "件を超えています");
  }
  const existingByEventId = new Map(plantingEvents.map(event => [Number(event.eventId), event]));
  const occupiedLots = new Map();
  plantingEvents.forEach(event => event.sourceAllocations.forEach(allocation => {
    allocation.palletKeys.forEach(key => occupiedLots.set(
      getPlantingLotKey(allocation.harvestRecordId, key),
      Number(event.eventId)
    ));
  }));
  const prepared = [];
  const incomingIds = new Set();

  sourceEvents.forEach(value => {
    if(!value || typeof value !== "object" || Array.isArray(value)){
      throw new Error("苗植え記録の形式が正しくありません");
    }
    const remappedAllocations = Array.isArray(value.sourceAllocations)
      ? value.sourceAllocations.map(allocation => {
          const sourceId = getSafePositiveRecordId(allocation?.harvestRecordId);
          const mappedId = sourceId === null ? null : recordIdMap.get(sourceId);
          if(mappedId === undefined) throw new Error("苗植え記録の収穫元IDを対応付けできません: " + String(sourceId || "-"));
          return { ...allocation, harvestRecordId: mappedId };
        })
      : value.sourceAllocations;
    const event = normalizePlantingEvent({ ...value, sourceAllocations: remappedAllocations });
    if(!event) throw new Error("苗植え記録に不正な値があります");
    if(incomingIds.has(Number(event.eventId))) throw new Error("バックアップ内で苗植えイベントIDが重複しています");
    incomingIds.add(Number(event.eventId));

    const existing = existingByEventId.get(Number(event.eventId));
    if(existing){
      if(getPlantingEventSendSignature(existing) === getPlantingEventSendSignature(event)) return;
      throw new Error("同じ苗植えイベントIDの別内容が既にあります: " + event.eventId);
    }
    event.sourceAllocations.forEach(allocation => {
      const sourceRecord = getRecordById(allocation.harvestRecordId);
      const sourceKeys = new Set(getPalletKeysFromRecord(sourceRecord));
      if(!sourceRecord || sourceRecord.type !== "fullHarvest"){
        throw new Error("苗植え記録の収穫元が見つかりません: " + allocation.harvestRecordId);
      }
      allocation.palletKeys.forEach(key => {
        if(!sourceKeys.has(key)) throw new Error("苗植え場所が収穫元に含まれていません: " + key);
        const lotKey = getPlantingLotKey(allocation.harvestRecordId, key);
        if(occupiedLots.has(lotKey)) throw new Error("同じ収穫パレットが複数の苗植え記録に含まれています: " + key);
        occupiedLots.set(lotKey, Number(event.eventId));
      });
    });
    prepared.push(event);
  });
  return prepared;
}

function mergeBackupPlantingMetadata(parsed, recordIdMap){
  const migratedIds = loadMigratedPlantingRecordIds();
  const sourceMigratedIds = Array.isArray(parsed?.migratedPlantingRecordIds)
    ? parsed.migratedPlantingRecordIds
    : [];
  sourceMigratedIds.forEach(value => {
    const sourceId = getSafePositiveRecordId(value);
    const mappedId = sourceId === null ? null : recordIdMap.get(sourceId);
    if(mappedId !== undefined && mappedId !== null) migratedIds.add(Number(mappedId));
  });

  const sourceTrash = Array.isArray(parsed?.deletedPlantingEvents) ? parsed.deletedPlantingEvents : [];
  if(sourceTrash.length > RECORD_BACKUP_MAX_ITEMS) throw new Error("削除済み苗植え記録が多すぎます");
  sourceTrash.forEach(entry => {
    if(!entry?.event || getPlantingEventById(entry.event.eventId)) return;
    const remappedAllocations = Array.isArray(entry.event.sourceAllocations)
      ? entry.event.sourceAllocations.map(allocation => {
          const sourceId = getSafePositiveRecordId(allocation?.harvestRecordId);
          const mappedId = sourceId === null ? null : recordIdMap.get(sourceId);
          if(mappedId === undefined) return null;
          return { ...allocation, harvestRecordId: mappedId };
        }).filter(Boolean)
      : [];
    const event = normalizePlantingEvent({ ...entry.event, sourceAllocations: remappedAllocations });
    if(!event || deletedPlantingEvents.some(item => Number(item.event?.eventId) === Number(event.eventId))) return;
    const expiresTime = new Date(entry.expiresAt || "").getTime();
    if(!Number.isFinite(expiresTime) || expiresTime <= Date.now()) return;
    deletedPlantingEvents.push({
      event,
      deletedAt: String(entry.deletedAt || ""),
      expiresAt: new Date(expiresTime).toISOString(),
      sheetDeleted: !!entry.sheetDeleted,
      wasSynced: !!entry.wasSynced
    });
  });
  localStorage.setItem(PLANTING_EVENTS_MIGRATION_KEY, JSON.stringify([...migratedIds].sort((a, b) => a - b)));
  saveDeletedPlantingEventsToStorage();
}

function mergeBackupSyncConflicts(parsed, recordIdMap){
  const sourceConflicts = Array.isArray(parsed?.syncConflicts) ? parsed.syncConflicts : [];
  if(sourceConflicts.length > GOOGLE_SHEET_SYNC_CONFLICT_MAX_ITEMS){
    throw new Error("バックアップの競合件数が上限を超えています");
  }
  const remapVersion = (entityType, value) => {
    if(!value) return null;
    if(entityType === "record"){
      const record = normalizeRecordSnapshot(value);
      if(!record) return null;
      const mappedId = recordIdMap.get(getSafePositiveRecordId(record.id));
      return normalizeRecordSnapshot(record, { id: mappedId ?? record.id });
    }
    const remappedAllocations = Array.isArray(value.sourceAllocations)
      ? value.sourceAllocations.map(allocation => {
          const sourceId = getSafePositiveRecordId(allocation?.harvestRecordId);
          const mappedId = sourceId === null ? null : recordIdMap.get(sourceId);
          if(mappedId === undefined || mappedId === null) return null;
          return { ...allocation, harvestRecordId: mappedId };
        })
      : [];
    if(remappedAllocations.some(allocation => !allocation)) return null;
    return normalizePlantingEvent({ ...value, sourceAllocations: remappedAllocations });
  };
  sourceConflicts.forEach(value => {
    const entityType = value?.entityType === "planting" ? "planting" : "record";
    const localVersion = remapVersion(entityType, value?.localVersion);
    const remoteVersion = remapVersion(entityType, value?.remoteVersion);
    if(!localVersion && !remoteVersion) return;
    upsertSyncConflict({
      ...value,
      entityType,
      localVersion,
      remoteVersion
    });
  });
}

const BACKUP_IMPORT_ROLLBACK_STORAGE_KEYS = [
  RECORDS_KEY,
  PLANTING_EVENTS_KEY,
  PLANTING_EVENT_TRASH_KEY,
  PLANTING_EVENTS_MIGRATION_KEY,
  LEGACY_PLANTING_EVENT_BACKFILL_KEY,
  GOOGLE_SHEET_SYNC_STATUS_KEY,
  GOOGLE_SHEET_SYNC_REVISION_KEY,
  GOOGLE_SHEET_SYNC_CONFLICTS_KEY,
  PLANTING_EVENT_SYNC_STATUS_KEY,
  RECORD_EXPORT_STATUS_KEY,
  RECORD_TRASH_KEY
];

function createBackupImportSnapshot(){
  const storageValues = {};
  BACKUP_IMPORT_ROLLBACK_STORAGE_KEYS.forEach(key => {
    storageValues[key] = localStorage.getItem(key);
  });
  return {
    records: deepClone(records),
    plantingEvents: deepClone(plantingEvents),
    deletedPlantingEvents: deepClone(deletedPlantingEvents),
    deletedRecords: deepClone(deletedRecords),
    syncConflicts: deepClone(syncConflicts),
    storageValues
  };
}

function restoreBackupImportStorageSnapshot(storageValues){
  BACKUP_IMPORT_ROLLBACK_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
  BACKUP_IMPORT_ROLLBACK_STORAGE_KEYS.forEach(key => {
    const value = storageValues?.[key];
    if(value !== null && typeof value !== "undefined") localStorage.setItem(key, value);
  });
}

function restoreBackupImportSnapshot(snapshot){
  if(!snapshot) return;
  records = deepClone(snapshot.records || []);
  plantingEvents = deepClone(snapshot.plantingEvents || []);
  deletedPlantingEvents = deepClone(snapshot.deletedPlantingEvents || []);
  deletedRecords = deepClone(snapshot.deletedRecords || []);
  syncConflicts = deepClone(snapshot.syncConflicts || []);
  restoreBackupImportStorageSnapshot(snapshot.storageValues || {});

  invalidateRecordDerivedCaches({ harvestRecords: true });

  try{
    refreshRecordHistoryViews();
    refreshHarvestMapViews();
    updateBuildingLastHarvestInfo();
    updateHeaderLatestRecordDate();
    updateGoogleSheetResendButtonState();
    scheduleWorkflowGuideUpdate();
  }finally{
    // 再描画処理に保存処理が追加されても、退避時点の値を最後に必ず戻す。
    restoreBackupImportStorageSnapshot(snapshot.storageValues || {});
  }
}

function importRecordsFromFile(file){
  if(!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    if(!ensureGoogleSheetLocalMutationAllowed("記録ファイルを読み込む操作を")) return;
    let snapshot = null;
    try{
      snapshot = createBackupImportSnapshot();
      const parsed = JSON.parse(String(reader.result || ""));
      const rawSourceRecords = Array.isArray(parsed)
        ? parsed
        : (Array.isArray(parsed.records) ? parsed.records : null);
      const sourceRecords = rawSourceRecords
        ? rawSourceRecords.map(migrateStoredHarvestRecordToCurrentNumbering)
        : null;
      const sourcePlantingEvents = !Array.isArray(parsed) && Array.isArray(parsed.plantingEvents)
        ? parsed.plantingEvents.map(migrateStoredPlantingEventToCurrentNumbering)
        : null;
      if(!sourceRecords){
        showRecordImportError("読み込める記録ファイルではありません。");
        return;
      }
      if(sourceRecords.length > RECORD_BACKUP_MAX_ITEMS
        || (sourcePlantingEvents && sourcePlantingEvents.length > RECORD_BACKUP_MAX_ITEMS)){
        throw new Error("バックアップの記録件数が上限を超えています");
      }
      const sourceRecordIds = sourceRecords.map(record => getSafePositiveRecordId(record?.id));
      if(sourceRecordIds.some(id => id === null) || new Set(sourceRecordIds).size !== sourceRecordIds.length){
        throw new Error("バックアップ内の収穫記録IDが不正、または重複しています");
      }
      const recordIdMap = new Map();

      const importedRecordCount = importRecordsFromSource(
        sourceRecords,
        "{count}件の記録を読み込みました",
        "追加できる新しい記録はありませんでした",
        {
          deferPlantingMigration: !!sourcePlantingEvents,
          silentNoChange: !!sourcePlantingEvents,
          silentSuccess: !!sourcePlantingEvents,
          skipExportPrompt: true,
          fromBackup: true,
          recordIdMap
        }
      );
      const preparedPlantingEvents = sourcePlantingEvents
        ? prepareBackupPlantingEvents(sourcePlantingEvents, recordIdMap)
        : null;
      const importedEventCount = preparedPlantingEvents
        ? importPlantingEventsFromSource(preparedPlantingEvents, {
            markGoogleSheetSynced: false,
            fromBackup: true
          })
        : 0;
      if(sourcePlantingEvents){
        const migratedBackup = {
          ...parsed,
          deletedPlantingEvents: Array.isArray(parsed.deletedPlantingEvents)
            ? parsed.deletedPlantingEvents.map(entry => ({
                ...entry,
                event: migrateStoredPlantingEventToCurrentNumbering(entry?.event)
              }))
            : parsed.deletedPlantingEvents
        };
        mergeBackupPlantingMetadata(migratedBackup, recordIdMap);
        mergeBackupSyncConflicts(migratedBackup, recordIdMap);
      }
      migrateLegacyPlantingEvents();
      syncHarvestPlantingPendingFlags();
      if(sourcePlantingEvents){
        const changedCount = Number(importedRecordCount || 0) + Number(importedEventCount || 0);
        showToast(changedCount
          ? `収穫${Number(importedRecordCount || 0)}件・苗植え${Number(importedEventCount || 0)}件を読み込みました`
          : "追加できる新しい記録はありませんでした");
      }
    }catch(e){
      let rollbackError = null;
      if(snapshot){
        try{
          restoreBackupImportSnapshot(snapshot);
        }catch(restoreError){
          rollbackError = restoreError;
        }
      }
      const detail = String(e && e.message ? e.message : e);
      const rollbackDetail = rollbackError
        ? "\n\n復元処理の詳細: " + String(rollbackError?.message || rollbackError)
        : "";
      const rollbackMessage = snapshot
        ? "変更前の状態へ戻しました。"
        : "変更処理は開始していません。";
      showRecordImportError("記録ファイルの読み込みに失敗しました。" + rollbackMessage + "\n\n詳細: " + detail + rollbackDetail);
    }
  };
  reader.onerror = () => {
    showRecordImportError("記録ファイルを読み込めませんでした。");
  };
  reader.readAsText(file, "utf-8");
}
