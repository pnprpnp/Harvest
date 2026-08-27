function parseMaybeJson(value, fallback){
  if(typeof value !== "string") return value ?? fallback;
  const trimmed = value.trim();
  if(!trimmed) return fallback;
  try{
    return JSON.parse(trimmed);
  }catch(e){
    return value;
  }
}

function parseMaybeJsonList(value){
  const parsed = parseMaybeJson(value, []);
  if(Array.isArray(parsed)) return parsed;
  if(typeof parsed === "string"){
    return parsed
      .split(/[\n,|]+/)
      .map(item => item.trim())
      .filter(Boolean);
  }
  return [];
}

function isBoundedRecordArrayField(value, maxItems){
  if(value === undefined || value === null || value === "") return true;
  if(Array.isArray(value)){
    return value.length <= maxItems && hasBoundedJsonLength(value, GOOGLE_SHEET_MAX_REQUEST_CHARS);
  }
  return typeof value === "string" && value.length <= GOOGLE_SHEET_MAX_REQUEST_CHARS;
}

function isValidTransferPalletItem(item, allowRange = true){
  if(typeof item === "string"){
    const text = item.trim();
    const match = text.match(/^([2-9])-([A-F])-(\d+)(?:-(\d+))?$/);
    if(!match) return false;
    if(!allowRange && match[4] !== undefined) return false;
    const start = getStrictIntegerInRange(match[3], 1, PALLETS_PER_BED);
    const end = match[4] === undefined ? start : getStrictIntegerInRange(match[4], 1, PALLETS_PER_BED);
    return start !== null && end !== null && start <= end;
  }
  if(!allowRange || !item || typeof item !== "object" || Array.isArray(item) || !hasBoundedJsonLength(item, 256)) return false;
  const building = getStrictIntegerInRange(item.building, MIN_BUILDING, MAX_BUILDING);
  const bed = typeof item.bed === "string" ? item.bed : "";
  if(building === null || !bedOrder.includes(bed)) return false;
  if(item.number !== undefined){
    return getStrictIntegerInRange(item.number, 1, PALLETS_PER_BED) !== null;
  }
  const start = getStrictIntegerInRange(item.start, 1, PALLETS_PER_BED);
  const end = getStrictIntegerInRange(item.end, 1, PALLETS_PER_BED);
  return start !== null && end !== null && start <= end;
}

function isOptionalBoundedRecordString(record, field, maxLength){
  return record[field] === undefined || record[field] === null
    || (typeof record[field] === "string" && record[field].length <= maxLength && !record[field].includes("\u0000"));
}

function isValidTransferQualityMemo(value){
  if(value === undefined || value === null || value === "") return true;
  if(typeof value === "string") return value.length <= RECORD_MAX_QUALITY_LENGTH && !value.includes("\u0000");
  if(typeof value !== "object" || Array.isArray(value)) return false;
  const tags = value.tags === undefined ? [] : value.tags;
  const rawOther = value.other;
  const other = rawOther === undefined || rawOther === null ? "" : rawOther;
  return Array.isArray(tags)
    && tags.length <= 5
    && tags.every(tag => typeof tag === "string" && ["large", "medium", "small", "elongated", "chip"].includes(normalizeQualityTag(tag)))
    && typeof other === "string"
    && other.length <= RECORD_MAX_QUALITY_LENGTH
    && !other.includes("\u0000");
}

function isValidTransferPlantingAge(value){
  if(value === undefined || value === null || value === "") return true;
  if(typeof value === "string") return value.length <= RECORD_MAX_PLANTING_AGE_DETAIL_LENGTH && !value.includes("\u0000");
  if(typeof value !== "object" || Array.isArray(value)) return false;
  const summary = value.summary === undefined || value.summary === null ? "" : value.summary;
  const detail = value.detail === undefined || value.detail === null ? "" : value.detail;
  if(typeof summary !== "string" || summary.length > RECORD_MAX_PLANTING_AGE_SUMMARY_LENGTH || summary.includes("\u0000")) return false;
  if(typeof detail !== "string" || detail.length > RECORD_MAX_PLANTING_AGE_DETAIL_LENGTH || detail.includes("\u0000")) return false;
  if(value.building === undefined || value.building === "") return true;
  return getStrictIntegerInRange(value.building, MIN_BUILDING, MAX_BUILDING) !== null;
}

function validateRecordForGoogleTransfer(record, options = {}){
  const invalid = message => ({ ok: false, message });
  if(!record || typeof record !== "object" || Array.isArray(record)) return invalid("記録の形式が正しくありません");
  if(Number(record.palletNumberingVersion) !== CURRENT_PALLET_NUMBERING_VERSION){
    return invalid("パレット番号方式が現在の形式ではありません");
  }
  if(getSafePositiveRecordId(record.id) === null) return invalid("記録IDが正しくありません");
  if(!normalizeRecordUuid(record.recordUuid)) return invalid("記録UUIDが正しくありません");
  for(const key of ["createdAt", "updatedAt"]){
    if(record[key] !== undefined && record[key] !== null && record[key] !== ""
      && !normalizeRecordSyncTimestamp(record[key])) return invalid("記録の更新日時が正しくありません");
  }
  if(record.type !== "fullHarvest" && record.type !== "partialHarvest") return invalid("記録種別が正しくありません");
  if(typeof record.date !== "string" || !isStrictDateOnlyString(record.date)) return invalid("記録日が実在する日付ではありません");
  if(getStrictIntegerInRange(record.cases, 1, RECORD_MAX_CASES) === null) return invalid("収穫ケース数が正しくありません");
  if(!isOptionalBoundedRecordString(record, "duplicateKey", RECORD_MAX_DUPLICATE_KEY_LENGTH)) return invalid("重複確認キーの形式が正しくありません");
  const suppliedDuplicateKey = typeof record.duplicateKey === "string" ? record.duplicateKey.trim() : "";
  if(options.enforceDuplicateKey !== false && suppliedDuplicateKey
    && suppliedDuplicateKey !== record.date.trim() + "__" + getStrictIntegerInRange(record.cases, 1, RECORD_MAX_CASES)){
    return invalid("重複確認キーが記録内容と一致しません");
  }
  if(!isOptionalBoundedRecordString(record, "memo", RECORD_MAX_MEMO_LENGTH)) return invalid("メモの形式が正しくありません");

  if(record.type === "partialHarvest"){
    if(!Array.isArray(record.targets) || !record.targets.length || record.targets.length > RECORD_MAX_TARGETS){
      return invalid("各パレット部分収穫場所の件数が正しくありません");
    }
    const targetsAreValid = record.targets.every(target => {
      if(!target || typeof target !== "object" || Array.isArray(target)) return false;
      const building = getStrictIntegerInRange(target.building, MIN_BUILDING, MAX_BUILDING);
      const start = getStrictIntegerInRange(target.start, 1, PALLETS_PER_BED);
      const end = getStrictIntegerInRange(target.end, 1, PALLETS_PER_BED);
      const plantsPerPallet = getStrictDecimalInRange(target.plantsPerPallet, 0.000001, 999);
      return building !== null && typeof target.bed === "string" && bedOrder.includes(target.bed)
        && start !== null && end !== null && start <= end && plantsPerPallet !== null;
    });
    if(!targetsAreValid) return invalid("各パレット部分収穫場所に不正な値があります");
    return { ok: true, message: "" };
  }

  if(typeof record.palletSummary !== "string" || record.palletSummary.length > RECORD_MAX_SUMMARY_LENGTH
    || record.palletSummary.includes("\u0000") || !record.palletSummary.trim()){
    return invalid("収穫場所が未設定、または長すぎます");
  }
  if(!isOptionalBoundedRecordString(record, "plantingSummary", RECORD_MAX_SUMMARY_LENGTH)) return invalid("苗植え場所の形式が正しくありません");
  if(!isOptionalBoundedRecordString(record, "plantingCaseInstruction", RECORD_MAX_SUMMARY_LENGTH)) return invalid("ケース指示の形式が正しくありません");
  if(record.plantingDate !== undefined && record.plantingDate !== null
    && (typeof record.plantingDate !== "string" || (record.plantingDate && !isStrictDateOnlyString(record.plantingDate)))){
    return invalid("苗植え日が実在する日付ではありません");
  }

  const actualLoss = getStrictDecimalInRange(record.actualLoss, -999999, 100);
  if(actualLoss === null) return invalid("実際のロス率が正しくありません");
  if(record.actualSeedlingLossRate !== undefined && record.actualSeedlingLossRate !== null && record.actualSeedlingLossRate !== ""
    && getStrictDecimalInRange(record.actualSeedlingLossRate, 0, 100) === null){
    return invalid("実際の苗ロス率が0〜100の範囲ではありません");
  }

  const seedlingTrayFields = {
    plannedSeedlingTrayCount: "予定苗枚数",
    actualSeedlingTrayCount: "実苗枚数"
  };
  for(const field of Object.keys(seedlingTrayFields)){
    if(record[field] !== undefined && record[field] !== null && record[field] !== ""
      && getStrictIntegerInRange(record[field], 0, RECORD_MAX_SEEDLING_TRAYS) === null){
      return invalid(
        seedlingTrayFields[field] + "が0以上の整数ではありません（現在値: " + String(record[field]) + "）"
      );
    }
  }
  if(record.actualSeedlingCarryoverMode !== undefined && record.actualSeedlingCarryoverMode !== null && record.actualSeedlingCarryoverMode !== ""
    && (typeof record.actualSeedlingCarryoverMode !== "string" || !["loss", "carryover"].includes(record.actualSeedlingCarryoverMode))){
    return invalid("余った苗の設定が正しくありません");
  }

  for(const field of ["palletKeys", "palletRanges", "plantingPalletKeys", "plantingRanges"]){
    const value = record[field];
    if(value !== undefined && !Array.isArray(value)) return invalid("パレット情報の形式が正しくありません");
    const allowRange = field === "palletRanges" || field === "plantingRanges";
    if(Array.isArray(value) && (value.length > RECORD_MAX_PALLET_KEYS || value.some(item => !isValidTransferPalletItem(item, allowRange)))){
      return invalid("パレット情報に不正な値があります");
    }
  }
  const palletKeys = getPalletKeysFromRecord(record);
  const plantingPalletKeys = getPlantingPalletKeysFromRecord(record, palletKeys);
  if(!palletKeys.length || palletKeys.length > RECORD_MAX_PALLET_KEYS || plantingPalletKeys.length > RECORD_MAX_PALLET_KEYS){
    return invalid("パレット情報の件数が正しくありません");
  }

  if(!isValidTransferQualityMemo(record.qualityMemo)) return invalid("品質メモの形式が正しくありません");
  if(!isOptionalBoundedRecordString(record, "qualityText", RECORD_MAX_QUALITY_LENGTH)){
    return invalid("品質メモの形式が正しくありません");
  }

  if(!isValidTransferPlantingAge(record.plantingAge)) return invalid("定植日数の詳細が正しくありません");

  return { ok: true, message: "" };
}

function unwrapImportedRecord(record){
  if(typeof record === "string" && record.length > GOOGLE_SHEET_MAX_REQUEST_CHARS) return null;
  record = parseMaybeJson(record, record);
  if(!record || typeof record !== "object") return record;

  if(record.type === "harvest-record" && record.record && typeof record.record === "object"){
    return record.record;
  }

  if(record.record && typeof record.record === "object" && (record.record.date || record.record.targets || record.record.palletKeys)){
    return record.record;
  }

  return record;
}

function normalizeGoogleSheetRowRecord(row){
  const record = unwrapImportedRecord(row);
  if(!record || typeof record !== "object") return record;

  if(!isBoundedRecordArrayField(record.palletKeys, RECORD_MAX_PALLET_KEYS)
    || !isBoundedRecordArrayField(record.palletRanges, RECORD_MAX_PALLET_KEYS)
    || !isBoundedRecordArrayField(record.plantingPalletKeys, RECORD_MAX_PALLET_KEYS)
    || !isBoundedRecordArrayField(record.plantingRanges, RECORD_MAX_PALLET_KEYS)
    || !isBoundedRecordArrayField(record.targets, RECORD_MAX_TARGETS)){
    return null;
  }
  if(record.syncSchemaVersion !== undefined && (!Number.isSafeInteger(record.syncSchemaVersion)
    || record.syncSchemaVersion < 1 || record.syncSchemaVersion > 1000)){
    return null;
  }
  if(record.syncProvidedFields !== undefined && (!Array.isArray(record.syncProvidedFields)
    || record.syncProvidedFields.length > RECORD_SYNC_FIELD_KEYS.length
    || record.syncProvidedFields.some(key => !RECORD_SYNC_FIELD_KEYS.includes(key)))){
    return null;
  }

  const actualSeedlingTrayCount = record.actualSeedlingTrayCount === ""
    || record.actualSeedlingTrayCount === undefined
    ? 0
    : record.actualSeedlingTrayCount;

  return {
    ...record,
    palletKeys: parseMaybeJsonList(record.palletKeys),
    palletRanges: parseMaybeJsonList(record.palletRanges),
    plantingPalletKeys: parseMaybeJsonList(record.plantingPalletKeys),
    plantingRanges: parseMaybeJsonList(record.plantingRanges),
    plannedSeedlingTrayCount: record.plannedSeedlingTrayCount === "" || record.plannedSeedlingTrayCount === undefined ? 0 : record.plannedSeedlingTrayCount,
    plantingDate: String(record.plantingDate || "").trim(),
    actualSeedlingTrayCount,
    actualSeedlingCarryoverMode: record.actualSeedlingCarryoverMode === "" || record.actualSeedlingCarryoverMode === undefined
      ? "loss"
      : record.actualSeedlingCarryoverMode,
    actualSeedlingLossRate: String(record.actualSeedlingLossRate ?? "").trim(),
    qualityMemo: parseMaybeJson(record.qualityMemo || record.qualityText || "", null),
    plantingAge: parseMaybeJson(record.plantingAge, record.plantingAge),
    targets: parseMaybeJson(record.targets, record.targets)
  };
}

function formatGoogleSheetSendRecordLine(record, index){
  const date = record?.date || "日付なし";
  const cases = clampNumber(record?.cases, 0, 999999, 0);

  if(record?.type === "partialHarvest"){
    const targetText = String(formatPartialHarvestSummary(record.targets) || "")
      .split("\n")[0] || "場所未設定";
    return (index + 1) + ". " + date + " 各パレット部分収穫 " + cases + "ケース / " + targetText;
  }

  const locationText = String(record?.palletSummary || "")
    .split("\n")[0] || "場所未設定";
  const plantingText = String(record?.plantingSummary || "")
    .split("\n")[0];
  const lossText = record?.actualLoss ? " / ロス率" + record.actualLoss + "%" : "";
  return (index + 1) + ". " + date + " 通常収穫 " + cases + "ケース" + lossText + " / " + locationText + (plantingText ? " / 苗植え:" + plantingText : "");
}

function formatGoogleSheetSendRecordList(recordsToSend){
  const list = Array.isArray(recordsToSend) ? recordsToSend : [];
  const displayLimit = 20;
  const lines = list.slice(0, displayLimit).map(formatGoogleSheetSendRecordLine);

  if(list.length > displayLimit){
    lines.push("ほか " + (list.length - displayLimit) + "件");
  }

  return lines.join("\n");
}

function cloneGoogleSheetRecordForSend(record){
  return JSON.parse(JSON.stringify(record || {}));
}

function getGoogleSheetRecordSendSignature(record, config){
  return JSON.stringify(buildGoogleSheetRecordPayload(record, config).record);
}

function setGoogleSheetSyncStatusAfterSend(recordSnapshot, sentSignature, config, state, serverRecord = null){
  const snapshotUuid = normalizeRecordUuid(recordSnapshot?.recordUuid);
  const currentRecord = (snapshotUuid ? getRecordByUuid(snapshotUuid) : null)
    || getRecordById(recordSnapshot?.id);
  if(!currentRecord) return false;

  if(getGoogleSheetRecordSendSignature(currentRecord, config) !== sentSignature){
    setGoogleSheetSyncStatus(currentRecord, "edited");
    return false;
  }

  let recordForStatus = currentRecord;
  if(state === "confirmed" && serverRecord){
    const normalizedServerRecord = normalizeImportedRecord(
      normalizeGoogleSheetRowRecord(serverRecord),
      0
    );
    if(!normalizedServerRecord) return false;
    // plantingPendingはアプリ内だけの状態で、Apps Scriptの応答には含まれない。
    // 苗植え完了後の収穫記録を同じ状態に揃えてから内容を照合する。
    normalizedServerRecord.plantingPending = !!currentRecord.plantingPending;
    const serverUuid = normalizeRecordUuid(normalizedServerRecord.recordUuid);
    if(snapshotUuid && serverUuid && snapshotUuid !== serverUuid) return false;
    const hasMatchingStableUuid = !!snapshotUuid && snapshotUuid === serverUuid;
    const contentMatches = getHarvestRecordSyncContentSignature(currentRecord)
      === getHarvestRecordSyncContentSignature(normalizedServerRecord);
    // UUIDが一致し、かつ送信中にローカル記録が変わっていなければ、Apps Scriptが
    // その記録を保存したことは確定している。小数末尾の0や品質メモなど、シートを
    // 往復したときの表示表現だけを理由に未送信へ戻さない。
    if(!contentMatches && !hasMatchingStableUuid) return false;
    if(hasMatchingStableUuid){
      if(currentRecord.type !== normalizedServerRecord.type
        || String(currentRecord.date || "") !== String(normalizedServerRecord.date || "")
        || Number(currentRecord.cases) !== Number(normalizedServerRecord.cases)){
        return false;
      }
    }
    const confirmedRecord = hasMatchingStableUuid
      ? {
          ...currentRecord,
          id: normalizedServerRecord.id,
          duplicateKey: normalizedServerRecord.duplicateKey || currentRecord.duplicateKey,
          recordUuid: serverUuid,
          createdAt: normalizedServerRecord.createdAt || currentRecord.createdAt,
          updatedAt: normalizedServerRecord.updatedAt || currentRecord.updatedAt
        }
      : normalizedServerRecord;
    if(hasMatchingStableUuid){
      // 古い記録でサーバーだけが保持していた同期対象項目は取り込みつつ、
      // 現在のアプリが送った内容とローカル専用状態はそのまま維持する。
      const locallyProvidedFields = new Set(normalizeRecordSyncProvidedFields(currentRecord));
      RECORD_SYNC_FIELD_KEYS.forEach(key => {
        if(!locallyProvidedFields.has(key)) confirmedRecord[key] = normalizedServerRecord[key];
      });
      mergeGoogleSheetRecordSyncFields(confirmedRecord, normalizedServerRecord);
      if(confirmedRecord.type === "fullHarvest"){
        confirmedRecord.syncSchemaVersion = RECORD_SYNC_SCHEMA_VERSION;
        confirmedRecord.syncProvidedFields = [...RECORD_SYNC_FIELD_KEYS];
      }
    }
    const status = loadGoogleSheetSyncStatus();
    let eventChanged = false;
    let recordIdChanged = false;
    if(Number(currentRecord.id) !== Number(confirmedRecord.id)){
      const canonicalId = Number(confirmedRecord.id);
      const canonicalIdOccupant = getRecordById(canonicalId);
      if(canonicalIdOccupant && canonicalIdOccupant !== currentRecord){
        if(!hasPendingGoogleSheetRecordChange(canonicalIdOccupant, status)) return false;
        const reassignedId = getNextAvailableLocalHarvestRecordId(new Set([canonicalId]));
        eventChanged = reassignLocalHarvestRecordId(
          canonicalIdOccupant,
          reassignedId,
          status
        ) || eventChanged;
        recordIdChanged = true;
      }
      eventChanged = remapHarvestRecordIdReferences(
        currentRecord.id,
        canonicalId,
        status
      ) || eventChanged;
      recordIdChanged = true;
    }
    if(eventChanged){
      savePlantingEventsToStorage();
      saveDeletedPlantingEventsToStorage();
    }
    if(recordIdChanged){
      saveDeletedRecordsToStorage();
      saveHarvestStateToStorage();
    }
    const index = records.indexOf(currentRecord);
    if(index < 0) return false;
    clearGoogleSheetRecordSyncStatus(status, currentRecord);
    records[index] = confirmedRecord;
    records.sort(compareRecordsByDateDesc);
    saveRecordsToStorage();
    saveGoogleSheetSyncStatus(status);
    recordForStatus = confirmedRecord;
  }
  setGoogleSheetSyncStatus(recordForStatus, state);
  return true;
}

async function sendRecordToGoogleSheet(record, options = {}){
  const showNotice = !!options.showNotice;
  const config = getValidatedGoogleSheetConfig({ silent: !showNotice });

  if(!config) return false;
  const operationOwner = beginGoogleSheetOperation("sending");
  if(!operationOwner){
    if(showNotice) showToast(getGoogleSheetOperationBusyMessage("送信"));
    return false;
  }
  let recordSnapshot = null;
  let sentSignature = "";
  let timer = null;

  try{
    recordSnapshot = cloneGoogleSheetRecordForSend(record);
    const validation = validateRecordForGoogleTransfer(recordSnapshot, { enforceDuplicateKey: false });
    if(!validation.ok) throw new Error(validation.message);
    const payloadObject = buildGoogleSheetRecordPayload(recordSnapshot, config);
    sentSignature = JSON.stringify(payloadObject.record);
    setGoogleSheetSyncStatus(recordSnapshot, "pending");
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), GOOGLE_SHEET_BATCH_TIMEOUT_MS);
    const payload = buildValidatedGoogleSheetRequestBody(payloadObject);

    const response = await fetch(config.url, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: payload,
      signal: controller.signal
    });

    const text = await response.text();
    if(!isWithinGoogleSheetResponseLimits(text)){
      throw new Error("スプレッドシートの応答が大きすぎます");
    }
    let result = {};
    try{
      result = text ? JSON.parse(text) : {};
    }catch(e){
      throw new Error("スプレッドシートの応答を読み込めません");
    }
    if(result.ok !== true){
      throw new Error(result.message || "スプレッドシートへの送信に失敗しました");
    }
    acknowledgeGoogleSheetMutationRevision(config, payloadObject.syncRevision, result);

    if(!setGoogleSheetSyncStatusAfterSend(recordSnapshot, sentSignature, config, "confirmed", result.record)){
      if(showNotice) showToast("送信中に記録が変更されたため、最新版を再送してください");
      return false;
    }
    if(showNotice) showToast("スプレッドシートへ送信しました");
    return true;
  }catch(e){
    if(recordSnapshot && sentSignature){
      try{
        setGoogleSheetSyncStatusAfterSend(recordSnapshot, sentSignature, config, "failed");
      }catch(statusError){
        console.error("Google Sheet sync status update failed", statusError);
      }
    }
    if(showNotice){
      const message = e?.name === "AbortError"
        ? "スプレッドシート送信がタイムアウトしました"
        : String(e?.message || "スプレッドシート送信に失敗しました");
      showToast(message);
    }
    return false;
  }finally{
    if(timer !== null) clearTimeout(timer);
    endGoogleSheetOperation(operationOwner);
  }
}

async function sendGoogleSheetBatchChunk(recordSnapshots, config){
  const sentSignatures = recordSnapshots.map(record => getGoogleSheetRecordSendSignature(record, config));
  recordSnapshots.forEach(record => setGoogleSheetSyncStatus(record, "pending"));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOOGLE_SHEET_BATCH_TIMEOUT_MS);

  try{
    const payloadObject = buildGoogleSheetBatchPayload(recordSnapshots, config);
    const payload = buildValidatedGoogleSheetRequestBody(payloadObject);
    const response = await fetch(config.url, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: payload,
      signal: controller.signal
    });
    const text = await response.text();
    if(!isWithinGoogleSheetResponseLimits(text)) throw new Error("スプレッドシートの応答が大きすぎます");

    let result = {};
    try{
      result = text ? JSON.parse(text) : {};
    }catch(e){
      throw new Error("スプレッドシートの応答を読み込めません");
    }
    if(result.ok !== true) throw new Error(result.message || "スプレッドシートへの送信に失敗しました");
    if(!Array.isArray(result.results) || result.results.length > recordSnapshots.length){
      throw new Error("スプレッドシートの応答件数が正しくありません");
    }
    acknowledgeGoogleSheetMutationRevision(config, payloadObject.syncRevision, result);

    const totals = { successCount: 0, updatedCount: 0, duplicateCount: 0, failCount: 0 };
    let firstError = "";
    const handledIndexes = new Set();
    result.results.forEach(item => {
      const index = Number(item?.index);
      if(!Number.isSafeInteger(index) || index < 0 || index >= recordSnapshots.length || handledIndexes.has(index)) return;
      handledIndexes.add(index);
      if(item?.ok === true){
        if(setGoogleSheetSyncStatusAfterSend(recordSnapshots[index], sentSignatures[index], config, "confirmed", item.record)){
          if(item.duplicate === true){
            totals.duplicateCount++;
          }else{
            totals.successCount++;
            if(item.updated === true) totals.updatedCount++;
          }
        }else{
          totals.failCount++;
          const failedRecord = recordSnapshots[index];
          firstError ||= "送信先には保存されましたが、アプリ内の収穫記録との照合に失敗しました" +
            `（${String(failedRecord?.date || "日付不明")} / ID:${String(failedRecord?.id || "不明")}）`;
        }
      }else{
        totals.failCount++;
        firstError ||= String(item?.message || "").trim();
        setGoogleSheetSyncStatusAfterSend(recordSnapshots[index], sentSignatures[index], config, "failed");
      }
    });
    recordSnapshots.forEach((record, index) => {
      if(handledIndexes.has(index)) return;
      totals.failCount++;
      firstError ||= "スプレッドシートの応答に収穫記録の結果がありません";
      setGoogleSheetSyncStatusAfterSend(record, sentSignatures[index], config, "failed");
    });
    return { ...totals, errorMessage: firstError };
  }catch(e){
    recordSnapshots.forEach((record, index) => {
      setGoogleSheetSyncStatusAfterSend(record, sentSignatures[index], config, "failed");
    });
    throw e;
  }finally{
    clearTimeout(timer);
  }
}

async function sendRecordsBatchToGoogleSheet(recordsToSend, options = {}){
  const list = Array.isArray(recordsToSend) ? recordsToSend : [];
  const showFailureDialog = options.showFailureDialog !== false;
  const showConfigNotice = options.showConfigNotice !== false;
  const configValidation = validateGoogleSheetConfig(loadGoogleSheetConfig());
  const emptyTotals = { successCount: 0, updatedCount: 0, duplicateCount: 0, failCount: list.length };

  if(!configValidation.ok){
    if(showConfigNotice) showToast(configValidation.message);
    return { ...emptyTotals, errorMessage: configValidation.message };
  }
  if(!list.length) return { ...emptyTotals, failCount: 0, errorMessage: "" };
  const config = configValidation.config;
  const validSnapshots = [];
  let firstError = "";
  let invalidCount = 0;

  list.forEach(record => {
    const snapshot = cloneGoogleSheetRecordForSend(record);
    const validation = validateRecordForGoogleTransfer(snapshot, { enforceDuplicateKey: false });
    if(validation.ok){
      validSnapshots.push(snapshot);
    }else{
      invalidCount++;
      firstError ||= validation.message;
      setGoogleSheetSyncStatus(record, "failed");
    }
  });

  const totals = { successCount: 0, updatedCount: 0, duplicateCount: 0, failCount: invalidCount };
  for(let start = 0; start < validSnapshots.length; start += GOOGLE_SHEET_MAX_BATCH_RECORDS){
    const chunk = validSnapshots.slice(start, start + GOOGLE_SHEET_MAX_BATCH_RECORDS);
    try{
      const chunkTotals = await sendGoogleSheetBatchChunk(chunk, config);
      Object.keys(totals).forEach(key => { totals[key] += chunkTotals[key] || 0; });
      firstError ||= String(chunkTotals.errorMessage || "").trim();
    }catch(e){
      firstError ||= String(e?.name === "AbortError" ? "スプレッドシートとの通信がタイムアウトしました" : (e?.message || e));
      totals.failCount += chunk.length;
      const remaining = validSnapshots.slice(start + chunk.length);
      remaining.forEach(record => setGoogleSheetSyncStatus(record, "failed"));
      totals.failCount += remaining.length;
      break;
    }
  }

  if(firstError && showFailureDialog){
    showRecordImportError("スプレッドシートへの一括送信に失敗しました。\n\n詳細: " + firstError, "送信失敗");
  }
  return { ...totals, errorMessage: firstError };
}

async function sendPendingRecordsToGoogleSheet(){
  if(!ensureProtectedOperationAccess("スプレッドシートへの送信")) return;
  if(editingHarvestRecordId || editingPartialHarvestRecordId || splittingHarvestRecordId || editingPlantingEventId || activePlantingRecordId){
    showToast("編集中の記録を保存またはクリアしてから送信してください");
    return;
  }
  const operationOwner = beginGoogleSheetOperation("confirming");
  if(!operationOwner){
    showToast(getGoogleSheetOperationBusyMessage("送信"));
    return;
  }

  try{
    if(!records.length && !plantingEvents.length){
      showToast("送信する記録がありません");
      return;
    }

    const config = getValidatedGoogleSheetConfig();
    if(!config) return;

    const unsentRecords = getGoogleSheetUnsentRecords();
    const unsentPlantingEvents = getGoogleSheetUnsentPlantingEvents().sort(comparePlantingEventsAsc);

    if(!unsentRecords.length && !unsentPlantingEvents.length){
      showToast("未送信の記録はありません");
      return;
    }

    const recordsToSend = [...unsentRecords].reverse();
    const plantingLines = unsentPlantingEvents.slice(0, 20).map((event, index) => (
      `${index + 1}. ${event.plantingDate} 苗植え ${event.plantingPalletKeys.length}パレット`
    ));
    if(unsentPlantingEvents.length > 20) plantingLines.push(`ほか ${unsentPlantingEvents.length - 20}件`);
    const sendSummary = [
      recordsToSend.length ? `収穫記録 ${recordsToSend.length}件\n${formatGoogleSheetSendRecordList(recordsToSend)}` : "",
      unsentPlantingEvents.length ? `苗植え記録 ${unsentPlantingEvents.length}件\n${plantingLines.join("\n")}` : ""
    ].filter(Boolean).join("\n\n");
    const shouldSend = await askGoogleSheetSendConfirm(
      "以下の未送信記録（" + (recordsToSend.length + unsentPlantingEvents.length) + "件）をスプレッドシートへ送信しますか？\n\n" + sendSummary
    );
    if(!shouldSend) return;

    changeGoogleSheetOperationState(operationOwner, "sending");

    const { successCount, updatedCount, duplicateCount, failCount } = await sendRecordsBatchToGoogleSheet(recordsToSend);
    const addedCount = Math.max(0, successCount - updatedCount);
    let plantingSuccessCount = 0;
    let plantingFailCount = 0;
    const plantingFailureDetails = [];
    for(const event of unsentPlantingEvents){
      const result = await syncPlantingEventWithSources(event, { manageSendState: false });
      if(result.ok) plantingSuccessCount++;
      else{
        plantingFailCount++;
        plantingFailureDetails.push(
          String(event.plantingDate || "日付なし") + "（ID: " + String(event.eventId) + "）: " +
          String(result.message || "更新できませんでした")
        );
      }
    }

    if(failCount > 0 || plantingFailCount > 0){
      showToast("送信完了: 収穫 追加" + addedCount + "・更新" + updatedCount + "・重複" + duplicateCount + "・失敗" + failCount + " / 苗植え 成功" + plantingSuccessCount + "・失敗" + plantingFailCount);
      if(plantingFailureDetails.length){
        showRecordImportError(
          "苗植え記録を更新できませんでした。\n\n" + plantingFailureDetails.slice(0, 10).join("\n"),
          "苗植え記録の送信失敗"
        );
      }
    }else{
      showToast("送信完了: 収穫" + (successCount + duplicateCount) + "件 / 苗植え" + plantingSuccessCount + "件");
    }
  }finally{
    endGoogleSheetOperation(operationOwner);
  }
}

function sendLatestRecordToGoogleSheet(){
  sendPendingRecordsToGoogleSheet();
}

function extractRecordsFromGoogleSheetResponse(result){
  if(Array.isArray(result)) return result;
  if(!result || typeof result !== "object") return null;
  if(Array.isArray(result.records)) return result.records;
  if(Array.isArray(result.data)) return result.data;
  if(Array.isArray(result.rows)) return result.rows;
  if(result.record && typeof result.record === "object") return [result.record];
  return null;
}

function importPlantingEventsFromSource(sourceEvents, options = {}){
  const maxEvents = options.fromBackup || options.fromGoogleSheetPaged
    ? RECORD_BACKUP_MAX_ITEMS
    : GOOGLE_SHEET_MAX_LIST_PLANTING_EVENTS;
  if(!Array.isArray(sourceEvents) || sourceEvents.length > maxEvents) return 0;
  const status = loadPlantingEventSyncStatus();
  saveDeletedPlantingEventsToStorage();
  const deletedEventIds = new Set(deletedPlantingEvents.map(entry => Number(entry.event?.eventId)));
  const normalizedIncomingEvents = sourceEvents.map(normalizePlantingEvent).filter(Boolean);
  const byId = new Map(plantingEvents.map(event => [Number(event.eventId), event]));
  let changedCount = 0;

  normalizedIncomingEvents.forEach(incoming => {
    if(deletedEventIds.has(Number(incoming.eventId))) return;
    const eventId = Number(incoming.eventId);
    const existing = byId.get(eventId);
    let localChanged = false;
    if(existing){
      const sameContent = getPlantingEventSendSignature(existing) === getPlantingEventSendSignature(incoming);
      if(!sameContent && isPlantingEventUnsent(existing, status)){
        upsertSyncConflict({
          entityType: "planting",
          reason: "both_updated",
          localVersion: existing,
          remoteVersion: incoming
        });
        status[String(eventId)] = { state: "conflict", updatedAt: new Date().toISOString() };
        if(options.resultTracker){
          options.resultTracker.conflictCount = Number(options.resultTracker.conflictCount || 0) + 1;
        }
        return;
      }
      if(sameContent) removeSyncConflictForEntity("planting", existing);
      const nextEvent = {
        ...incoming,
        openingCarryoverBefore: incoming.openingCarryoverBefore
          ?? (options.openingCarryoverAuthoritative ? null : existing.openingCarryoverBefore ?? null)
      };
      if(JSON.stringify(serializePlantingEventForStorage(existing)) !== JSON.stringify(serializePlantingEventForStorage(nextEvent))){
        const index = plantingEvents.findIndex(event => Number(event.eventId) === eventId);
        if(index >= 0) plantingEvents[index] = nextEvent;
        changedCount++;
        localChanged = true;
      }
    }else{
      plantingEvents.push(incoming);
      byId.set(eventId, incoming);
      changedCount++;
      localChanged = true;
    }
    if(options.markGoogleSheetSynced === false){
      if(localChanged) status[String(eventId)] = { state: "edited", updatedAt: new Date().toISOString() };
    }else{
      status[String(eventId)] = { state: "confirmed", updatedAt: new Date().toISOString() };
    }
  });

  savePlantingEventSyncStatus(status);
  if(changedCount){
    savePlantingEventsToStorage();
    syncHarvestPlantingPendingFlags();
    if(!options.deferUiRefresh){
      refreshRecordHistoryViews();
      refreshHarvestMapViews();
    }
  }
  if(!options.deferUiRefresh) updateGoogleSheetResendButtonState();
  return changedCount;
}

function applyRemoteDeletedPlantingEventIds(values, options = {}){
  if(!Array.isArray(values) || values.length > GOOGLE_SHEET_MAX_LIST_PLANTING_EVENT_TOMBSTONES) return 0;
  const deletedIds = new Set(values
    .map(getSafePositiveRecordId)
    .filter(value => value !== null)
    .map(Number));
  if(!deletedIds.size) return 0;

  saveDeletedPlantingEventsToStorage();
  const trashById = new Map(deletedPlantingEvents.map(entry => [Number(entry.event?.eventId), entry]));
  const status = loadPlantingEventSyncStatus();
  const now = new Date();
  const protectedIds = new Set();
  let changedCount = 0;

  plantingEvents.forEach(event => {
    const eventId = Number(event.eventId);
    if(!deletedIds.has(eventId)) return;
    if(isPlantingEventUnsent(event, status)){
      upsertSyncConflict({
        entityType: "planting",
        reason: "remote_deleted",
        localVersion: event,
        remoteVersion: null
      });
      protectedIds.add(eventId);
      status[String(eventId)] = { state: "conflict", updatedAt: now.toISOString() };
      if(options.resultTracker){
        options.resultTracker.conflictCount = Number(options.resultTracker.conflictCount || 0) + 1;
      }
      return;
    }
    const existingTrash = trashById.get(eventId);
    if(existingTrash){
      existingTrash.event = event;
      existingTrash.sheetDeleted = true;
      existingTrash.wasSynced = true;
    }else{
      const entry = {
        event,
        deletedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + RECORD_TRASH_RETENTION_MS).toISOString(),
        sheetDeleted: true,
        wasSynced: true
      };
      deletedPlantingEvents.unshift(entry);
      trashById.set(eventId, entry);
    }
    delete status[String(eventId)];
    changedCount++;
  });
  deletedPlantingEvents.forEach(entry => {
    if(deletedIds.has(Number(entry.event?.eventId))
      && !protectedIds.has(Number(entry.event?.eventId))){
      entry.sheetDeleted = true;
      entry.wasSynced = true;
    }
  });
  if(changedCount){
    plantingEvents = plantingEvents.filter(event => (
      !deletedIds.has(Number(event.eventId)) || protectedIds.has(Number(event.eventId))
    ));
    savePlantingEventsToStorage();
    syncHarvestPlantingPendingFlags();
  }
  saveDeletedPlantingEventsToStorage();
  savePlantingEventSyncStatus(status);
  return changedCount;
}

async function fetchGoogleSheetPlantingEventSyncPages(config, options, signal){
  let cursor = null;
  const events = [];
  let deletedEventIds = [];
  const seenCursors = new Set();

  for(let page = 0; page < GOOGLE_SHEET_MAX_RECORD_SYNC_PAGES; page++){
    const response = await fetchGoogleSheetReadRequest(config.url, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: buildValidatedGoogleSheetRequestBody(buildGoogleSheetPlantingEventListPayload(config, {
        ...options,
        cursor,
        syncMode: true,
        limit: GOOGLE_SHEET_MAX_LIST_PLANTING_EVENTS
      })),
      signal
    });
    const text = await response.text();
    if(!isWithinGoogleSheetResponseLimits(text)) throw new Error("スプレッドシートの応答が大きすぎます");
    let result = {};
    try{
      result = text ? JSON.parse(text) : {};
    }catch(e){
      throw new Error("スプレッドシートの応答を読み込めません");
    }
    if(result.ok !== true) throw new Error(result.message || "苗植え履歴を読み込めませんでした");
    if(!Array.isArray(result.events) || result.events.length > GOOGLE_SHEET_MAX_LIST_PLANTING_EVENTS){
      throw new Error("苗植え履歴の件数が正しくありません");
    }
    if(result.deletedEventIds !== undefined
      && (!Array.isArray(result.deletedEventIds)
        || result.deletedEventIds.length > GOOGLE_SHEET_MAX_LIST_PLANTING_EVENT_TOMBSTONES)){
      throw new Error("削除済み苗植え履歴の件数が正しくありません");
    }

    events.push(...result.events);
    if(events.length > RECORD_BACKUP_MAX_ITEMS){
      throw new Error("同期する苗植え履歴が" + RECORD_BACKUP_MAX_ITEMS + "件を超えています");
    }
    deletedEventIds = result.deletedEventIds || [];

    const nextCursor = normalizeGoogleSheetPlantingSyncCursor(result.nextCursor ?? result.cursor);
    if(result.hasMore !== true){
      return { events, deletedEventIds };
    }
    if(!nextCursor) throw new Error("苗植え履歴の同期位置を確認できません");
    const cursorKey = JSON.stringify(nextCursor);
    if(seenCursors.has(cursorKey)) throw new Error("苗植え履歴の同期位置が繰り返されています");
    seenCursors.add(cursorKey);
    cursor = nextCursor;
  }
  throw new Error("苗植え履歴の同期ページ数が上限を超えています");
}

async function importPlantingEventsFromGoogleSheet(options = {}){
  const config = options.config || getValidatedGoogleSheetConfig({ silent: !!options.silentErrors });
  if(!config) return 0;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOOGLE_SHEET_IMPORT_TIMEOUT_MS);
  const resultTracker = options.resultTracker || {};
  try{
    const syncResult = await fetchGoogleSheetPlantingEventSyncPages(config, options, controller.signal);
    const deletedCount = applyRemoteDeletedPlantingEventIds(syncResult.deletedEventIds, {
      resultTracker
    });
    const importedCount = importPlantingEventsFromSource(syncResult.events, {
      ...options,
      fromGoogleSheetPaged: true,
      openingCarryoverAuthoritative: false,
      resultTracker
    });
    return deletedCount + importedCount;
  }catch(e){
    if(options.throwOnError) throw e;
    if(!options.silentErrors){
      showRecordImportError("苗植え履歴を読み込めませんでした。\n\n詳細: " + String(e?.message || e));
    }
    return 0;
  }finally{
    clearTimeout(timer);
  }
}

function filterGoogleSheetRecordsByRecentDays(sourceRecords, recentDays){
  const days = clampNumber(recentDays, 1, 3650, 0);
  if(!days || !Array.isArray(sourceRecords)) return sourceRecords;

  const today = startOfLocalDay(new Date());
  const start = addDays(today, -(days - 1));
  const endExclusive = addDays(today, 1);

  return sourceRecords.filter(record => {
    const normalized = normalizeGoogleSheetRowRecord(record);
    const date = parseDateOnlyString(String(normalized?.date || ""));
    if(!date) return false;
    const day = startOfLocalDay(date);
    return day.getTime() >= start.getTime() && day.getTime() < endExclusive.getTime();
  });
}

function filterGoogleSheetRecordsByRecentCount(sourceRecords, limit){
  const safeLimit = clampNumber(limit, 1, 1000, 0);
  if(!safeLimit || !Array.isArray(sourceRecords)) return sourceRecords;

  return sourceRecords
    .map((record, index) => {
      const normalized = normalizeGoogleSheetRowRecord(record);
      const date = parseDateOnlyString(String(normalized?.date || ""));
      const id = Number(normalized?.id);
      return {
        record,
        index,
        time: date ? date.getTime() : -Infinity,
        id: Number.isFinite(id) ? id : 0
      };
    })
    .filter(item => item.time !== -Infinity)
    .sort((a, b) => {
      if(a.time !== b.time) return b.time - a.time;
      if(a.id !== b.id) return b.id - a.id;
      return a.index - b.index;
    })
    .slice(0, safeLimit)
    .map(item => item.record);
}

function getLatestRecordDate(){
  const latestRecord = [...records]
    .sort(compareRecordsByDateDesc)
    .find(record => parseDateOnlyString(String(record?.date || "")));
  return latestRecord ? parseDateOnlyString(String(latestRecord.date || "")) : null;
}

function formatLatestRecordDateForHeader(date){
  if(!date) return "記録なし";
  const diff = getLocalDayDiff(date, new Date());
  if(diff === 0) return "今日";
  if(diff === 1) return "昨日";
  const weekday = ["日","月","火","水","木","金","土"][date.getDay()];
  return `${date.getMonth() + 1}/${date.getDate()} (${weekday})`;
}

function updateHeaderLatestRecordDate(){
  const label = document.getElementById("headerLatestRecordDate");
  if(!label) return;
  label.textContent = formatLatestRecordDateForHeader(getLatestRecordDate());
}

function updateTodayHarvestRecordedStatus(referenceDate = new Date()){
  const status = document.getElementById("recordTodayRecordedStatus");
  if(!status) return;
  const today = formatDateOnlyString(referenceDate);
  status.hidden = !records.some(record => (
    record?.type === "fullHarvest" && String(record.date || "") === today
  ));
}

function setRecordSyncAvailabilityNotice(available){
  const button = document.getElementById("headerRecordSyncBtn");
  if(!button) return;
  button.classList.toggle("hasAvailabilityNotice", !!available);
  if(!button.disabled){
    button.setAttribute("aria-label", available
      ? "未受信の記録があります。スプレッドシートから最新の記録を読み込む"
      : "スプレッドシートから最新の記録を読み込む");
  }
}

function setAppUpdateAvailabilityNotice(available){
  const button = document.getElementById("appUpdateCheckBtn");
  const menuButton = document.getElementById("headerMenuBtn");
  if(button){
    button.classList.toggle("hasAvailabilityNotice", !!available);
    if(!button.disabled){
      button.setAttribute("aria-label", available
        ? "アプリの最新バージョンがあります"
        : "アプリの最新バージョンを確認する");
    }
  }
  if(menuButton){
    menuButton.classList.toggle("hasAvailabilityNotice", !!available);
    menuButton.setAttribute("aria-label", available
      ? "アプリの更新があります。メニューを開く"
      : "メニューを開く");
  }
}

async function checkGoogleSheetUpdateAvailabilitySilently(){
  if(isWorkerMode()) return;
  if(googleSheetSendState !== "idle" || googleSheetOperationOwner) return;
  const operationSequenceAtStart = googleSheetOperationSequence;
  const config = getValidatedGoogleSheetConfig({ silent: true });
  if(!config) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOOGLE_SHEET_TIMEOUT_MS);
  const initialSyncRevision = loadGoogleSheetSyncRevision(config);

  try{
    const response = await fetchGoogleSheetReadRequest(config.url, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: buildValidatedGoogleSheetRequestBody(buildGoogleSheetUpdateCheckPayload(config, {
        syncRevision: initialSyncRevision
      })),
      signal: controller.signal
    });
    const text = await response.text();
    if(!isWithinGoogleSheetResponseLimits(text)) throw new Error("更新確認の応答が大きすぎます");
    const result = text ? JSON.parse(text) : {};
    if(result.ok !== true) throw new Error(result.message || "更新情報を確認できませんでした");
    if(result.revisionSync !== true){
      throw new Error("Apps Scriptが同期番号の高速確認に対応していません");
    }
    const remoteSyncRevision = normalizeGoogleSheetSyncRevision(
      result.currentSyncRevision ?? result.syncRevision
    );
    if(remoteSyncRevision === null){
      throw new Error("更新確認の同期番号を読み込めません");
    }

    // 確認中に送信・同期が始まった場合、古い応答で通知ドットを更新しない。
    if(googleSheetSendState !== "idle"
      || googleSheetOperationOwner
      || googleSheetOperationSequence !== operationSequenceAtStart) return;
    setRecordSyncAvailabilityNotice(
      result.updateAvailable === true
        || initialSyncRevision === null
        || remoteSyncRevision !== initialSyncRevision
    );
  }catch(e){
    console.warn("Background record update check failed", e);
  }finally{
    clearTimeout(timer);
  }
}

async function checkAppUpdateAvailabilitySilently(){
  try{
    if(typeof window.checkHarvestnaviAppUpdate !== "function") return;
    const result = await window.checkHarvestnaviAppUpdate();
    setAppUpdateAvailabilityNotice(!!result?.updateAvailable);
  }catch(e){
    console.warn("Background app update check failed", e);
  }
}

function getLastAutomaticAppUpdateCheckAt(){
  try{
    const value = Number(harvestnaviLocalStorage.getItem(APP_UPDATE_AUTO_CHECK_AT_KEY));
    return Number.isFinite(value) && value > 0 ? value : 0;
  }catch(e){
    return 0;
  }
}

function markAppUpdateCheckStarted(at = Date.now()){
  try{
    harvestnaviLocalStorage.setItem(APP_UPDATE_AUTO_CHECK_AT_KEY, String(at));
  }catch(e){}
}

function runAvailabilityChecksIfDue(){
  if(document.visibilityState === "hidden") return Promise.resolve();
  if(typeof navigator !== "undefined" && navigator.onLine === false) return Promise.resolve();
  const now = Date.now();
  if(availabilityCheckPromise) return availabilityCheckPromise;

  const checks = [];
  if(now - recordAvailabilityCheckLastStartedAt >= RECORD_AVAILABILITY_CHECK_INTERVAL_MS){
    recordAvailabilityCheckLastStartedAt = now;
    checks.push(checkGoogleSheetUpdateAvailabilitySilently());
  }
  if(now - getLastAutomaticAppUpdateCheckAt() >= APP_UPDATE_AUTO_CHECK_INTERVAL_MS){
    markAppUpdateCheckStarted(now);
    checks.push(checkAppUpdateAvailabilitySilently());
  }
  if(!checks.length) return Promise.resolve();

  availabilityCheckPromise = Promise.allSettled(checks).finally(() => {
    availabilityCheckPromise = null;
  });
  return availabilityCheckPromise;
}

function installAvailabilityChecks(){
  setTimeout(() => runAvailabilityChecksIfDue(), 0);
  document.addEventListener("visibilitychange", () => {
    if(document.visibilityState === "visible"){
      updateTodayHarvestRecordedStatus();
      runAvailabilityChecksIfDue();
    }
  });
  window.addEventListener("pageshow", () => {
    updateTodayHarvestRecordedStatus();
    runAvailabilityChecksIfDue();
  });
}

function setHeaderRecordSyncLoading(isLoading){
  const button = document.getElementById("headerRecordSyncBtn");
  if(!button) return;
  button.disabled = !!isLoading || googleSheetSendState !== "idle";
  button.classList.toggle("is-loading", !!isLoading);
  button.setAttribute("aria-busy", isLoading ? "true" : "false");
  button.setAttribute("aria-label", isLoading
    ? "スプレッドシートから最新の記録を読み込み中"
    : (button.classList.contains("hasAvailabilityNotice")
      ? "未受信の記録があります。スプレッドシートから最新の記録を読み込む"
      : "スプレッドシートから最新の記録を読み込む"));
}

async function syncRecordsFromHeader(){
  const button = document.getElementById("headerRecordSyncBtn");
  if(button?.disabled){
    if(googleSheetSendState !== "idle") showToast(getGoogleSheetOperationBusyMessage("同期"));
    return;
  }

  setHeaderRecordSyncLoading(true);
  try{
    await importRecordsFromGoogleSheet({
      successMessage: "スプレッドシートと記録を同期しました",
      emptyMessage: "スプレッドシートと同期済みです"
    });
  }finally{
    updateHeaderLatestRecordDate();
    setHeaderRecordSyncLoading(false);
  }
}

function setAppUpdateCheckLoading(isLoading, statusText = ""){
  const button = document.getElementById("appUpdateCheckBtn");
  const status = document.getElementById("appUpdateCheckStatus");
  if(button){
    button.disabled = !!isLoading;
    button.classList.toggle("is-loading", !!isLoading);
    button.setAttribute("aria-busy", isLoading ? "true" : "false");
    button.setAttribute("aria-label", isLoading
      ? "アプリの最新バージョンを確認中"
      : (button.classList.contains("hasAvailabilityNotice")
        ? "アプリの最新バージョンがあります"
        : "アプリの最新バージョンを確認する"));
  }
  if(statusText && status) status.textContent = statusText;
}

function askAppUpdateConfirm(){
  const panel = document.getElementById("appUpdateConfirmPanel");
  const yesButton = document.getElementById("appUpdateConfirmYes");
  const noButton = document.getElementById("appUpdateConfirmNo");

  if(!panel){
    return Promise.resolve(window.confirm("最新バージョンが見つかりました。更新しますか？"));
  }
  if(appUpdateConfirmResolver){
    resolveAppUpdateConfirm(false);
  }

  if(yesButton) yesButton.disabled = false;
  if(noButton) noButton.disabled = false;
  panel.classList.add("show");
  requestAnimationFrame(() => yesButton?.focus());

  return new Promise(resolve => {
    appUpdateConfirmResolver = resolve;
  });
}

function resolveAppUpdateConfirm(shouldUpdate){
  const panel = document.getElementById("appUpdateConfirmPanel");
  const yesButton = document.getElementById("appUpdateConfirmYes");
  const noButton = document.getElementById("appUpdateConfirmNo");
  if(panel) panel.classList.remove("show");
  if(yesButton) yesButton.disabled = true;
  if(noButton) noButton.disabled = true;

  if(appUpdateConfirmResolver){
    appUpdateConfirmResolver(!!shouldUpdate);
    appUpdateConfirmResolver = null;
  }
}

function askPlantingUnselectedWarningConfirm(unselectedLots = []){
  const panel = document.getElementById("plantingUnselectedWarningPanel");
  const message = document.getElementById("plantingUnselectedWarningMessage");
  const yesButton = document.getElementById("plantingUnselectedConfirmYes");
  const noButton = document.getElementById("plantingUnselectedConfirmNo");

  const detail = formatUnselectedPreviousUnplantedPalletLots(unselectedLots);
  const noticeText = [
    "以前の未定植の場所が選択されていません。",
    detail ? `\n未選択のパレット:\n${detail}` : ""
  ].join("");

  if(!panel){
    return Promise.resolve(window.confirm(`${noticeText}\n\nこのまま保存しますか？`));
  }
  if(plantingUnselectedWarningResolver){
    resolvePlantingUnselectedWarning(false);
  }

  if(message) message.textContent = noticeText;
  if(yesButton) yesButton.disabled = false;
  if(noButton) noButton.disabled = false;
  panel.classList.add("show");
  requestAnimationFrame(() => noButton?.focus());

  return new Promise(resolve => {
    plantingUnselectedWarningResolver = resolve;
  });
}

function resolvePlantingUnselectedWarning(shouldSave){
  const panel = document.getElementById("plantingUnselectedWarningPanel");
  const message = document.getElementById("plantingUnselectedWarningMessage");
  const yesButton = document.getElementById("plantingUnselectedConfirmYes");
  const noButton = document.getElementById("plantingUnselectedConfirmNo");
  if(panel) panel.classList.remove("show");
  if(yesButton) yesButton.disabled = true;
  if(noButton) noButton.disabled = true;
  if(message) message.textContent = "以前の未定植の場所が選択されていません。";

  if(plantingUnselectedWarningResolver){
    plantingUnselectedWarningResolver(!!shouldSave);
    plantingUnselectedWarningResolver = null;
  }
}

async function checkLatestAppFromMenu(){
  const button = document.getElementById("appUpdateCheckBtn");
  if(button?.disabled) return;

  markAppUpdateCheckStarted();
  setAppUpdateCheckLoading(true, "最新バージョンを確認中です...");
  try{
    if(typeof window.checkHarvestnaviAppUpdate !== "function"){
      throw new Error("更新確認機能を読み込めませんでした");
    }
    const updateResult = await window.checkHarvestnaviAppUpdate();
    if(!updateResult?.updateAvailable){
      setAppUpdateAvailabilityNotice(false);
      const currentVersion = String(
        updateResult?.currentVersion || updateResult?.latestVersion || ""
      ).trim();
      setAppUpdateCheckLoading(false, currentVersion
        ? `現在のバージョンは${currentVersion}です`
        : "現在のバージョンを確認できませんでした");
      return;
    }

    setAppUpdateAvailabilityNotice(true);
    setAppUpdateCheckLoading(true, "最新版が見つかりました");
    const shouldUpdate = await askAppUpdateConfirm();
    if(!shouldUpdate){
      setAppUpdateCheckLoading(false, "更新をキャンセルしました");
      return;
    }

    if(settingsDirty && !saveSettings()){
      setAppUpdateCheckLoading(false, "設定を保存してから、もう一度確認してください");
      return;
    }
    saveHarvestStateToStorage();
    if(typeof window.applyHarvestnaviAppUpdate !== "function"){
      throw new Error("更新機能を読み込めませんでした");
    }
    setAppUpdateCheckLoading(true, "最新版を開いています...");
    await window.applyHarvestnaviAppUpdate(updateResult.latestVersion);
  }catch(e){
    console.warn("最新版の確認に失敗しました", e);
    const message = String(e?.message || e || "");
    setAppUpdateCheckLoading(false, message
      ? "更新できませんでした: " + message
      : "最新バージョンを確認できませんでした。通信状態を確認してください");
  }
}

function showRecordImportError(message, title = "読み込み失敗"){
  const panel = document.getElementById("recordImportErrorPanel");
  const titleBox = document.getElementById("recordImportErrorTitle");
  const messageBox = document.getElementById("recordImportErrorMessage");

  if(!panel || !messageBox){
    showToast(message);
    return;
  }

  hideRecordImportMenu();
  hideGoogleSheetResendHelp();
  if(titleBox) titleBox.textContent = title;
  messageBox.textContent = String(message || "原因不明");
  panel.classList.add("show");
}

function hideRecordImportError(){
  const panel = document.getElementById("recordImportErrorPanel");
  if(panel) panel.classList.remove("show");
}

async function fetchGoogleSheetCombinedSyncPages(config, options, signal){
  let recordCursor = null;
  let plantingCursor = null;
  let syncRevision = options.resetSyncRevision ? null : loadGoogleSheetSyncRevision(config);
  let finalSyncRevision = syncRevision;
  let fullSyncSnapshotRevision = null;
  let revisionResetInProgress = false;
  const recordsToSync = [];
  const eventsToSync = [];
  let tombstones = [];
  let deletedEventIds = [];
  const seenCursorPairs = new Set();
  const seenSyncRevisions = new Set();
  const removeMatchingItems = (items, key, getKey) => {
    if(!key) return;
    for(let index = items.length - 1; index >= 0; index--){
      if(getKey(items[index]) === key) items.splice(index, 1);
    }
  };

  const buildResult = () => {
    const uniqueTombstones = [];
    const seenTombstones = new Set();
    tombstones.forEach(item => {
      const key = getHarvestRecordIdentityKey(item);
      if(seenTombstones.has(key)) return;
      seenTombstones.add(key);
      uniqueTombstones.push(item);
    });
    const uniqueEvents = [];
    const eventIndexById = new Map();
    eventsToSync.forEach(event => {
      const eventId = getSafePositiveRecordId(event?.eventId);
      if(eventId === null) return;
      if(eventIndexById.has(eventId)){
        uniqueEvents[eventIndexById.get(eventId)] = event;
        return;
      }
      eventIndexById.set(eventId, uniqueEvents.length);
      uniqueEvents.push(event);
    });
    return {
      records: recordsToSync,
      tombstones: uniqueTombstones,
      events: uniqueEvents,
      deletedEventIds: [...new Set(deletedEventIds.map(Number).filter(Number.isSafeInteger))],
      finalSyncRevision
    };
  };

  for(let page = 0; page < GOOGLE_SHEET_MAX_RECORD_SYNC_PAGES; page++){
    const payload = buildValidatedGoogleSheetRequestBody(buildGoogleSheetCombinedSyncPayload(config, {
      cursor: recordCursor,
      plantingCursor,
      syncRevision,
      revisionReset: revisionResetInProgress
    }));
    const response = await fetchGoogleSheetReadRequest(config.url, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: payload,
      signal
    });
    const text = await response.text();
    if(!isWithinGoogleSheetResponseLimits(text)){
      throw new Error("スプレッドシートの一括同期応答が大きすぎます");
    }
    let result;
    try{
      result = text ? JSON.parse(text) : {};
    }catch(e){
      throw new Error("スプレッドシートの一括同期応答を読み込めません");
    }
    if(result.ok !== true){
      throw new Error(result.message || "収穫・苗植え記録を同期できませんでした");
    }
    if(result.revisionSync !== true){
      throw new Error("Apps Scriptが同期番号による差分同期に対応していません");
    }

    const pageRecords = extractRecordsFromGoogleSheetResponse(result);
    if(!Array.isArray(pageRecords) || pageRecords.length > GOOGLE_SHEET_MAX_LIST_RECORDS){
      throw new Error("同期する収穫記録の件数が正しくありません");
    }
    const pageEvents = result.events;
    if(!Array.isArray(pageEvents) || pageEvents.length > GOOGLE_SHEET_MAX_LIST_PLANTING_EVENTS){
      throw new Error("同期する苗植え記録の件数が正しくありません");
    }
    if(result.deletedEventIds !== undefined
      && (!Array.isArray(result.deletedEventIds)
        || result.deletedEventIds.length > GOOGLE_SHEET_MAX_LIST_PLANTING_EVENT_TOMBSTONES)){
      throw new Error("削除済み苗植え記録の件数が正しくありません");
    }

    const isRevisionDelta = result.revisionReset !== true;
    const pageTombstones = normalizeRemoteHarvestTombstones(result);
    const pageDeletedEventIds = result.deletedEventIds || [];
    if(isRevisionDelta){
      // 差分取得中に同じ記録が再更新されても、後のページを正とする。
      pageRecords.forEach(record => {
        const key = getHarvestRecordIdentityKey(record);
        if(!key) throw new Error("差分同期の収穫記録に識別情報がありません");
        removeMatchingItems(recordsToSync, key, getHarvestRecordIdentityKey);
        removeMatchingItems(tombstones, key, getHarvestRecordIdentityKey);
        recordsToSync.push(record);
      });
      pageTombstones.forEach(tombstone => {
        const key = getHarvestRecordIdentityKey(tombstone);
        if(!key) throw new Error("差分同期の削除記録に識別情報がありません");
        removeMatchingItems(recordsToSync, key, getHarvestRecordIdentityKey);
        removeMatchingItems(tombstones, key, getHarvestRecordIdentityKey);
        tombstones.push(tombstone);
      });
      pageEvents.forEach(event => {
        const eventId = getSafePositiveRecordId(event?.eventId);
        if(eventId === null) throw new Error("差分同期の苗植え記録IDが正しくありません");
        removeMatchingItems(eventsToSync, eventId, item => getSafePositiveRecordId(item?.eventId));
        deletedEventIds = deletedEventIds.filter(value => getSafePositiveRecordId(value) !== eventId);
        eventsToSync.push(event);
      });
      pageDeletedEventIds.forEach(value => {
        const eventId = getSafePositiveRecordId(value);
        if(eventId === null) throw new Error("差分同期の削除済み苗植え記録IDが正しくありません");
        removeMatchingItems(eventsToSync, eventId, item => getSafePositiveRecordId(item?.eventId));
        deletedEventIds = deletedEventIds.filter(item => getSafePositiveRecordId(item) !== eventId);
        deletedEventIds.push(eventId);
      });
    }else{
      recordsToSync.push(...pageRecords);
      eventsToSync.push(...pageEvents);
      // 全件同期は各ページで現在の永久削除一覧を返すため、最後のページを正とする。
      tombstones = pageTombstones;
      deletedEventIds = pageDeletedEventIds;
    }
    if(recordsToSync.length > RECORD_BACKUP_MAX_ITEMS
      || eventsToSync.length > RECORD_BACKUP_MAX_ITEMS){
      throw new Error("同期する記録が" + RECORD_BACKUP_MAX_ITEMS + "件を超えています");
    }

    const responseRevision = normalizeGoogleSheetSyncRevision(
      result.nextSyncRevision ?? result.syncRevision
    );
    if(responseRevision === null){
      throw new Error("差分同期の同期番号を確認できません");
    }
    // 全件初期化の複数ページ中に更新が入った場合は、
    // 最初の番号を保持し、次回の差分同期で確実に回収する。
    if(result.revisionReset === true){
      if(!revisionResetInProgress){
        recordCursor = null;
        plantingCursor = null;
      }
      revisionResetInProgress = true;
      fullSyncSnapshotRevision = fullSyncSnapshotRevision === null
        ? responseRevision
        : Math.min(fullSyncSnapshotRevision, responseRevision);
      finalSyncRevision = fullSyncSnapshotRevision;
    }else{
      finalSyncRevision = responseRevision;
    }
    if(isRevisionDelta){
      if(result.hasMore !== true) return buildResult();
      if(responseRevision === syncRevision || seenSyncRevisions.has(responseRevision)){
        throw new Error("差分同期の続き位置が繰り返されています");
      }
      seenSyncRevisions.add(responseRevision);
      syncRevision = responseRevision;
      continue;
    }

    const recordHasMore = result.hasMore === true;
    const plantingHasMore = result.plantingHasMore === true;
    const nextRecordCursor = normalizeGoogleSheetSyncCursor(result.nextCursor ?? result.cursor);
    const nextPlantingCursor = normalizeGoogleSheetPlantingSyncCursor(
      result.plantingNextCursor ?? result.plantingCursor
    );
    if(!recordHasMore && !plantingHasMore){
      return buildResult();
    }

    const recordCursorAdvanced = !!nextRecordCursor
      && JSON.stringify(nextRecordCursor) !== JSON.stringify(recordCursor);
    const plantingCursorAdvanced = !!nextPlantingCursor
      && JSON.stringify(nextPlantingCursor) !== JSON.stringify(plantingCursor);
    if(recordCursorAdvanced) recordCursor = nextRecordCursor;
    if(plantingCursorAdvanced) plantingCursor = nextPlantingCursor;
    // 応答サイズ調整で片方が次ページへ回された場合は、もう片方のcursorだけが進む。
    // 2つのcursorがどちらも進まない時だけ、無限ループを防ぐため中断する。
    if(!recordCursorAdvanced && !plantingCursorAdvanced){
      throw new Error("一括同期の続き位置を取得できません");
    }
    const cursorPairKey = JSON.stringify([recordCursor, plantingCursor]);
    if(seenCursorPairs.has(cursorPairKey)){
      throw new Error("一括同期の続き位置が繰り返されています");
    }
    seenCursorPairs.add(cursorPairKey);
  }
  throw new Error("一括同期ページ数が上限を超えています。記録をバックアップして管理者へ連絡してください");
}

async function fetchGoogleSheetWorkerCalculationSnapshot(config, signal){
  const response = await fetchGoogleSheetReadRequest(config.url, {
    method: "POST",
    mode: "cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: buildValidatedGoogleSheetRequestBody(buildGoogleSheetWorkerSnapshotPayload(config)),
    signal
  });
  const responseText = await response.text();
  if(!isWithinGoogleSheetResponseLimits(responseText)){
    throw new Error("作業用データの応答が大きすぎます");
  }
  let result;
  try{
    result = responseText ? JSON.parse(responseText) : {};
  }catch(e){
    throw new Error("作業用データの応答を読み込めません");
  }
  if(result.ok !== true){
    throw new Error(result.message || "作業用データを読み込めませんでした");
  }
  if(result.snapshotMode !== "worker" || !Array.isArray(result.records) || !Array.isArray(result.events)){
    throw new Error("Apps Scriptが作業者用データに対応していません");
  }
  if(result.records.length > GOOGLE_SHEET_MAX_LIST_RECORDS
    || result.events.length > GOOGLE_SHEET_MAX_LIST_PLANTING_EVENTS){
    throw new Error("作業用データの件数が上限を超えています");
  }
  return result;
}

async function importWorkerCalculationSnapshotFromGoogleSheet(config, options = {}){
  const silentErrors = !!options.silentErrors;
  const operationOwner = beginGoogleSheetOperation("syncing");
  if(!operationOwner){
    if(!silentErrors) showToast(getGoogleSheetOperationBusyMessage("同期"));
    return false;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOOGLE_SHEET_IMPORT_TIMEOUT_MS);
  let snapshot = null;
  try{
    const result = await fetchGoogleSheetWorkerCalculationSnapshot(config, controller.signal);
    const normalizedRemoteRecords = result.records.map((source, index) => (
      normalizeImportedRecord(normalizeGoogleSheetRowRecord(source), index)
    ));
    if(normalizedRemoteRecords.some(record => !record)){
      throw new Error("作業用の収穫記録に不正な値があります");
    }
    const normalizedRemoteEvents = result.events.map(normalizePlantingEvent);
    if(normalizedRemoteEvents.some(event => !event)){
      throw new Error("作業用の苗植え記録に不正な値があります");
    }

    snapshot = createBackupImportSnapshot();
    const localRecordStatus = loadGoogleSheetSyncStatus();
    const localPlantingStatus = loadPlantingEventSyncStatus();
    const unsentRecordKeys = new Set(records
      .filter(record => isGoogleSheetRecordUnsent(record, localRecordStatus))
      .map(getHarvestRecordIdentityKey)
      .filter(Boolean));
    const unsentPlantingIds = new Set(plantingEvents
      .filter(event => isPlantingEventUnsent(event, localPlantingStatus))
      .map(event => getSafePositiveRecordId(event?.eventId))
      .filter(value => value !== null));

    const recordResult = reconcileGoogleSheetRecords(result.records, [], {
      ...options,
      workerSnapshot: true
    });
    const plantingResult = { conflictCount: 0 };
    const importedEventCount = importPlantingEventsFromSource(result.events, {
      fromGoogleSheetPaged: true,
      openingCarryoverAuthoritative: true,
      deferUiRefresh: true,
      resultTracker: plantingResult
    });

    const remoteRecordKeys = new Set(normalizedRemoteRecords
      .map(getHarvestRecordIdentityKey)
      .filter(Boolean));
    const remotePlantingIds = new Set(normalizedRemoteEvents
      .map(event => getSafePositiveRecordId(event?.eventId))
      .filter(value => value !== null));
    records = records.filter(record => {
      const key = getHarvestRecordIdentityKey(record);
      return remoteRecordKeys.has(key) || unsentRecordKeys.has(key);
    });
    plantingEvents = plantingEvents.filter(event => {
      const eventId = getSafePositiveRecordId(event?.eventId);
      return eventId !== null && (remotePlantingIds.has(eventId) || unsentPlantingIds.has(eventId));
    });
    saveRecordsToStorage();
    savePlantingEventsToStorage();
    syncHarvestPlantingPendingFlags();
    setRecordSyncAvailabilityNotice(false);
    refreshRecordDataUi();

    const changedCount = Number(recordResult.changedCount || 0) + Number(importedEventCount || 0);
    if(!silentErrors && !options.silentNoChange){
      showToast(options.emptyMessage || "作業用データを更新しました");
    }
    return changedCount > 0;
  }catch(e){
    if(snapshot){
      try{
        restoreBackupImportSnapshot(snapshot);
      }catch(restoreError){
        console.error("作業用データ同期失敗後の復元にも失敗しました", restoreError);
      }
    }
    if(silentErrors){
      console.warn("Worker calculation snapshot sync failed:", e);
    }else{
      showRecordImportError(
        "作業用データを読み込めませんでした。記録は同期前の状態へ戻しています。\n\n詳細: "
        + String(e?.message || e)
      );
    }
    return false;
  }finally{
    clearTimeout(timer);
    endGoogleSheetOperation(operationOwner);
  }
}

async function importRecordsFromGoogleSheet(options = {}){
  const silentErrors = !!options.silentErrors;
  if(editingHarvestRecordId || editingPartialHarvestRecordId || splittingHarvestRecordId || editingPlantingEventId || activePlantingRecordId){
    if(!silentErrors) showToast("編集中の記録を保存またはクリアしてから同期してください");
    return false;
  }
  const config = getValidatedGoogleSheetConfig({ silent: silentErrors, showImportError: !silentErrors });
  if(!config) return false;
  if(isWorkerMode()) return importWorkerCalculationSnapshotFromGoogleSheet(config, options);
  const operationOwner = beginGoogleSheetOperation("syncing");
  if(!operationOwner){
    if(!silentErrors) showToast(getGoogleSheetOperationBusyMessage("同期"));
    return false;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOOGLE_SHEET_IMPORT_TIMEOUT_MS);
  let snapshot = null;

  try{
    const combinedSync = await fetchGoogleSheetCombinedSyncPages(config, options, controller.signal);
    const recordSync = {
      records: combinedSync.records,
      tombstones: combinedSync.tombstones
    };
    snapshot = createBackupImportSnapshot();
    // 先に収穫IDの競合を解決し、既存のlocal苗植え参照だけを新IDへ移す。
    // その後remote苗植えイベントを入れることで、server IDの参照を誤って付け替えない。
    const recordResult = reconcileGoogleSheetRecords(recordSync.records, recordSync.tombstones, options);
    const plantingResult = {
      conflictCount: 0
    };
    const deletedEventCount = applyRemoteDeletedPlantingEventIds(combinedSync.deletedEventIds, {
      resultTracker: plantingResult
    });
    const importedEventCount = deletedEventCount + importPlantingEventsFromSource(combinedSync.events, {
      fromGoogleSheetPaged: true,
      openingCarryoverAuthoritative: false,
      deferUiRefresh: true,
      resultTracker: plantingResult
    });
    syncHarvestPlantingPendingFlags();
    // 競合は両方の内容を競合一覧へ退避済みなので、同期位置を進めても失われない。
    const totalConflictCount = Number(recordResult.conflictCount || 0) + Number(plantingResult.conflictCount || 0);
    const finalSyncRevision = normalizeGoogleSheetSyncRevision(combinedSync.finalSyncRevision);
    if(finalSyncRevision !== null){
      saveGoogleSheetSyncRevision(config, finalSyncRevision);
    }
    setRecordSyncAvailabilityNotice(false);

    const totalChanged = Number(recordResult.changedCount || 0)
      + Number(importedEventCount || 0);
    refreshRecordDataUi();
    if(!silentErrors){
      if(totalConflictCount){
        showToast(`同期完了: 追加${recordResult.addedCount}・更新${recordResult.updatedCount}・削除${recordResult.deletedCount}・苗植え${Number(importedEventCount || 0)}（競合${totalConflictCount}件：収穫${Number(recordResult.conflictCount || 0)}・苗植え${Number(plantingResult.conflictCount || 0)}を競合一覧へ保護しました）`);
      }else if(totalChanged){
        showToast(`同期完了: 追加${recordResult.addedCount}・更新${recordResult.updatedCount}・削除${recordResult.deletedCount}・苗植え${Number(importedEventCount || 0)}`);
      }else if(!options.silentNoChange){
        showToast(options.emptyMessage || "スプレッドシートと同期済みです");
      }
    }
    return totalChanged > 0;
  }catch(e){
    if(snapshot){
      try{
        restoreBackupImportSnapshot(snapshot);
      }catch(restoreError){
        console.error("同期失敗後の復元にも失敗しました", restoreError);
      }
    }
    if(e?.name === "AbortError"){
      if(!silentErrors) showRecordImportError(
        "スプレッドシートとの同期が途中で中断されました。記録は同期前の状態へ戻しています。\n\n" +
        "3分以内に応答が返らなかったため、タイムアウトになった可能性があります。\n" +
        "記録件数の多さ、または Apps Script 側の混雑時に起きます。"
      );
      return false;
    }
    if(silentErrors){
      console.warn("Google Sheet sync failed:", e);
    }else{
      showRecordImportError("スプレッドシートと同期できませんでした。記録は同期前の状態へ戻しています。\n\n詳細: " + String(e && e.message ? e.message : e));
    }
    return 0;
  }finally{
    clearTimeout(timer);
    endGoogleSheetOperation(operationOwner);
  }
}

function importRecentRecordsFromGoogleSheetOnStartup(){
  if(googleSheetStartupImportStarted) return;
  const config = getValidatedGoogleSheetConfig({ silent: true });
  if(!config) return;

  googleSheetStartupImportStarted = true;
  importRecordsFromGoogleSheet({
    silentErrors: true,
    silentNoChange: true,
    successMessage: "スプレッドシートと記録を同期しました"
  });
}
