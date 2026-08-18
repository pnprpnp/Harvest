// ===== 記録：保存後の関連画面更新 =====
function refreshRecordHistoryViews(){
  renderRecordList();
  renderDashboardIfVisible();
}

function refreshRecordDataUi(options = {}){
  refreshRecordHistoryViews();
  updateGoogleSheetResendButtonState();
  if(options.maps !== false) refreshHarvestMapViews();
  if(options.actualLoss === true) updateRecordActualLoss();
  updateBuildingLastHarvestInfo();
  updateHeaderLatestRecordDate();
}

function scheduleRecordDataUiRefresh(){
  runAfterUiSettles(() => {
    try{
      refreshRecordDataUi({ maps: false });
    }catch(e){
      console.error("Failed to refresh record data UI", e);
    }
  });
}

function confirmHarvestRecordWarnings(date, actualLoss, editingRecord = null){
  const warnings = [];
  const editingRecordId = Number(editingRecord?.id);
  const sameDayFullRecordCount = records.filter(record => (
    record?.type === "fullHarvest"
    && String(record.date || "") === String(date || "")
    && (!Number.isFinite(editingRecordId) || Number(record.id) !== editingRecordId)
  )).length;

  if(sameDayFullRecordCount > 0){
    warnings.push(`同じ日付の通常収穫記録がすでに${sameDayFullRecordCount}件あります。`);
  }

  const lossValue = Number(actualLoss);
  if(Number.isFinite(lossValue) && lossValue < 0){
    warnings.push(`実際のロス率が${actualLoss}%です。ケース数または収穫場所が間違っていないか確認してください。`);
  }

  if(!warnings.length) return true;
  return window.confirm([
    "入力内容を確認してください。",
    "",
    ...warnings.map(warning => "・" + warning),
    "",
    "このまま記録しますか？"
  ].join("\n"));
}

function saveRecord(){
  if(!ensureProtectedOperationAccess("記録の保存")) return;
  if(!ensureGoogleSheetLocalMutationAllowed("記録を保存", { allowBackgroundSend: true })) return;
  const editingRecord = editingHarvestRecordId ? getRecordById(editingHarvestRecordId) : null;
  const date = document.getElementById("recordDateInput").value;
  const totalCases = clampNumber(document.getElementById("recordCasesInput").value || 0, 0, 999999, 0);
  const cases = getRegularHarvestCases(totalCases, date);
  const actualLoss = getRecordActualLossValue();
  const actualSeedlingTrayCount = getRecordActualSeedlingTrayCount();
  const actualSeedlingCarryoverMode = getRecordSeedlingCarryoverMode();
  const qualityMemo = getSelectedQualityMemo();
  const plantingAge = getCurrentPlantingAgeSnapshot();
  const palletSummary = document.getElementById("recordPalletSummaryInput").value.trim();
  const memo = document.getElementById("recordMemoInput")?.value.trim() || "";

  if(!date){
    showToast("日付を入力してください");
    return;
  }
  if(totalCases <= 0){
    showToast("収穫ケース数を入力してください");
    return;
  }
  if(cases <= 0){
    showToast("各パレット部分収穫だけで今回の収穫ケース数に達しています");
    return;
  }
  if(palletSummary === ""){
    showToast("収穫したパレット番号を入力してください");
    return;
  }
  if(actualLoss === ""){
    showToast("実際のロス率を計算できません");
    return;
  }
  if(!harvestFillKeys.length){
    showToast("保存する選択結果がありません");
    return;
  }
  if(!confirmHarvestRecordWarnings(date, actualLoss, editingRecord)){
    showToast("収穫記録の保存をキャンセルしました");
    return;
  }

  if(editingRecord && editingRecord.type === "fullHarvest"){
    const allocatedKeys = getRemotePlantingEventDependenciesForHarvest(editingRecord.id)
      .flatMap(event => event.sourceAllocations
        .filter(allocation => Number(allocation.harvestRecordId) === Number(editingRecord.id))
        .flatMap(allocation => allocation.palletKeys));
    const removedAllocatedKeys = [...new Set(allocatedKeys)].filter(key => !harvestFillKeys.includes(key));
    if(removedAllocatedKeys.length){
      showToast("苗植え履歴で使用中のパレットは収穫記録から外せません。先に該当する苗植え履歴を編集してください");
      return;
    }
    editingRecord.date = date;
    editingRecord.cases = cases;
    editingRecord.palletSummary = palletSummary;
    editingRecord.plannedSeedlingTrayCount = getPlannedSeedlingTrayCountForRecord();
    editingRecord.actualSeedlingTrayCount = actualSeedlingTrayCount;
    editingRecord.actualSeedlingCarryoverMode = actualSeedlingCarryoverMode;
    editingRecord.memo = memo;
    editingRecord.actualLoss = actualLoss;
    editingRecord.qualityMemo = qualityMemo;
    editingRecord.plantingAge = plantingAge;
    editingRecord.palletKeys = [...harvestFillKeys];
    editingRecord.plantingCaseInstruction = getRemainingHarvestableCaseInstruction(editingRecord);
    editingRecord.duplicateKey = getRecordDuplicateKey(editingRecord);

    saveRecordsToStorage();
    syncHarvestPlantingPendingFlags();
    const sendQueued = queueGoogleSheetRecordSend(editingRecord, {
      successMessage: "収穫記録を更新して送信しました",
      failureMessage: "収穫記録は更新済みです。スプレッドシートは未送信です"
    });
    harvestProgressState = null;
    harvestSelectionMode = "none";
    harvestProgressAvailable = false;
    if(editingRecord.plantingPending){
      editingHarvestRecordId = null;
      editingHarvestSelectionKeys = null;
      enterPlantingRecordMode(editingRecord);
    }else{
      clearRecordForm();
    }
    saveHarvestStateToStorage();
    scheduleRecordDataUiRefresh();
    showToast(sendQueued
      ? "収穫記録を更新しました。スプレッドシートへ送信中です"
      : "収穫記録を更新しました。スプレッドシートは未送信です");
    return;
  }

  const record = {
    ...getCurrentRecordSyncMetadata(),
    palletNumberingVersion: CURRENT_PALLET_NUMBERING_VERSION,
    id: Date.now(),
    type: "fullHarvest",
    date,
    cases,
    palletSummary,
    plannedSeedlingTrayCount: getPlannedSeedlingTrayCountForRecord(),
    plantingCaseInstruction: "",
    plantingSummary: "",
    plantingPending: true,
    actualSeedlingTrayCount,
    actualSeedlingCarryoverMode,
    actualSeedlingLossRate: "",
    memo,
    actualLoss,
    qualityMemo,
    plantingAge,
    palletKeys: [...harvestFillKeys],
    plantingPalletKeys: []
  };
  records.unshift(record);
  record.plantingCaseInstruction = getRemainingHarvestableCaseInstruction(record);
  record.duplicateKey = getRecordDuplicateKey(record);

  saveRecordsToStorage();
  maybePromptRecordExport();
  queueGoogleSheetRecordSend(record, {
    failureMessage: "収穫記録は保存済みです。スプレッドシートは未送信です"
  });
  harvestProgressState = null;
  harvestSelectionMode = "none";
  harvestProgressAvailable = false;
  enterPlantingRecordMode(record);
  saveHarvestStateToStorage();
  scheduleRecordDataUiRefresh();
  showToast("収穫場所を記録しました。続けて苗植え場所を選択してください");
}

function confirmPlantingRecordBeforeSend(record, selectedKeys, plantingDate, actualSeedlingTrayCount, actualSeedlingLossRate, actualSeedlingCarryoverMode = "loss", actualTakenSeedlingCount = null, actualPlantedSeedlingCount = null, plantingQualityMemo = null){
  const takenSeedlings = Number.isFinite(Number(actualTakenSeedlingCount))
    ? Number(actualTakenSeedlingCount)
    : getSeedlingCountFromTrayCount(actualSeedlingTrayCount);
  const actualTakenText = actualSeedlingTrayCount > 0
    ? `${actualSeedlingTrayCount}枚（換算 ${takenSeedlings}株）`
    : "0枚（換算 0株）";
  const carryoverModeText = normalizeSeedlingCarryoverMode(actualSeedlingCarryoverMode) === "carryover" ? "余った" : "余っていない";
  const plantedTotal = Number.isFinite(Number(actualPlantedSeedlingCount))
    ? Number(actualPlantedSeedlingCount)
    : getActualPlantedSeedlingTotal(selectedKeys);
  const plantingSummary = formatPlantingSummaryForKeys(selectedKeys) || "苗植えなし";
  const qualityText = formatQualityMemo(record.qualityMemo) || "-";
  const memoText = String(record.memo || "").trim() || "-";
  const actualLossText = String(record.actualLoss || "").trim();

  return window.confirm([
    "この内容で苗植え場所を記録して送信しますか？",
    "",
    `日付: ${plantingDate || "-"}`,
    `収穫ケース数: ${getHarvestRecordCaseDisplayText(record)}ケース`,
    `実際のロス率: ${actualLossText ? actualLossText + "%" : "-"}`,
    `品質メモ: ${qualityText}`,
    `メモ: ${memoText}`,
    "",
    "実際の収穫場所:",
    record.palletSummary || "-",
    "",
    `実際に取った苗: ${actualTakenText}`,
    `今回余った苗: ${carryoverModeText}`,
    `実際に苗植えした株数: ${plantedTotal}株`,
    `実際の苗ロス率: ${actualSeedlingLossRate ? actualSeedlingLossRate + "%" : "-"}`,
    `苗の品質メモ: ${formatPlantingQualityMemo(plantingQualityMemo)}`,
    "",
    "実際に苗植えした場所:",
    plantingSummary
  ].join("\n"));
}

function applyPlantingSelectionToRecord(targetRecord, keysToApply, options = {}){
  if(!targetRecord || targetRecord.type !== "fullHarvest" || !Array.isArray(keysToApply) || !keysToApply.length) return false;

  const harvestKeys = Array.isArray(targetRecord.palletKeys) ? targetRecord.palletKeys : getPalletKeysFromRecord(targetRecord);
  const beforePending = !!targetRecord.plantingPending;
  const existingPlantingKeys = getPlantingPalletKeysFromRecord(targetRecord, harvestKeys);
  targetRecord.plantingPalletKeys = [...new Set([...existingPlantingKeys, ...keysToApply])]
    .sort((a, b) => getOrderIndexFromKey(a) - getOrderIndexFromKey(b));
  targetRecord.plantingSummary = formatPlantingSummaryForKeys(targetRecord.plantingPalletKeys);
  targetRecord.plantingDate = options.plantingDate || targetRecord.plantingDate || targetRecord.date || "";

  if(options.isActiveRecord){
    targetRecord.actualSeedlingTrayCount = options.actualSeedlingTrayCount;
    targetRecord.actualSeedlingCarryoverMode = options.actualSeedlingCarryoverMode;
    targetRecord.actualSeedlingLossRate = options.actualSeedlingLossRate;
  }

  targetRecord.plantingPending = false;
  targetRecord.duplicateKey = getRecordDuplicateKey(targetRecord);
  return options.isActiveRecord || beforePending;
}

async function savePlantingRecord(){
  if(!ensureProtectedOperationAccess("苗植え場所の保存")) return;
  if(!ensureGoogleSheetLocalMutationAllowed("苗植え場所を保存", { allowBackgroundSend: true })) return;
  const record = getActivePlantingRecord();
  const plantingDate = document.getElementById("recordDateInput")?.value || record?.date || "";
  if(!record || record.type !== "fullHarvest"){
    showToast("苗植え場所を紐づける収穫記録がありません");
    enterHarvestRecordMode();
    return;
  }
  if(!plantingDate){
    showToast("苗植えした日付を入力してください");
    return;
  }

  const actualSeedlingTrayCount = getRecordActualSeedlingTrayCount();
  const noPlantingEvent = actualSeedlingTrayCount === 0 && harvestFillKeys.length === 0;
  if(!harvestFillKeys.length && !noPlantingEvent){
    showToast("苗植えした場所を選択してください");
    return;
  }

  const allowedSet = getPlantingAllowedPalletSet();
  const invalidKeys = harvestFillKeys.filter(key => !allowedSet.has(key));
  if(invalidKeys.length){
    showToast("苗植えできる場所だけを選択してください");
    return;
  }

  const selectedKeys = [...harvestFillKeys];
  const actualSeedlingCarryoverMode = getRecordSeedlingCarryoverMode();
  const actualSeedlingLossRate = getActualSeedlingLossRateValue();
  const qualityMemo = normalizeOptionalQualityMemo(getSelectedQualityMemo());

  if(!canPlantSeedlingKeysWithinCapacity(selectedKeys, record)){
    const availableTotal = getPlantingAvailableSeedlingTotal(record);
    const plantedTotal = getActualPlantedSeedlingTotal(selectedKeys);
    showToast(`苗数が不足しています（上限 ${availableTotal}株／選択 ${plantedTotal}株）`);
    return;
  }

  const existingEvent = editingPlantingEventId ? getPlantingEventById(editingPlantingEventId) : null;
  if(hasPlantingOpeningCarryover(existingEvent)
    && plantingDate !== existingEvent.plantingDate){
    showToast("1,000件以前の繰越基準を保つため、この古い苗植え記録の日付は変更できません。苗枚数や場所は編集できます");
    return;
  }
  if(existingEvent && wouldCrossPlantingOpeningBoundary(existingEvent, plantingDate)){
    showToast("1,000件以前の繰越基準をまたぐ日付変更はできません。同じ基準範囲内の日付を指定してください");
    return;
  }
  if(!existingEvent && isBeforeLatestPlantingOpeningBoundary(plantingDate)){
    showToast("1,000件以前の繰越基準より前の日付では、新しい苗植え記録を作成できません");
    return;
  }
  const sourceAllocations = noPlantingEvent
    ? [{ harvestRecordId: Number(record.id), palletKeys: [] }]
    : resolvePlantingEventAllocations(selectedKeys, {
        preferredHarvestId: record.id,
        excludeEventId: existingEvent?.eventId,
        existingEvent
      });
  const allocatedKeys = [...new Set(sourceAllocations.flatMap(allocation => allocation.palletKeys))]
    .sort((a, b) => getOrderIndexFromKey(a) - getOrderIndexFromKey(b));
  const normalizedSelectedKeys = [...new Set(selectedKeys)]
    .sort((a, b) => getOrderIndexFromKey(a) - getOrderIndexFromKey(b));
  if(allocatedKeys.length !== normalizedSelectedKeys.length
    || allocatedKeys.some((key, index) => key !== normalizedSelectedKeys[index])){
    showToast("選択した場所の収穫元を確認できません。記録を読み込み直してください");
    return;
  }

  const sameTrayCount = existingEvent
    && Number(existingEvent.actualSeedlingTrayCount) === Number(actualSeedlingTrayCount);
  const samePlantingKeys = existingEvent
    && existingEvent.plantingPalletKeys.length === normalizedSelectedKeys.length
    && existingEvent.plantingPalletKeys.every((key, index) => key === normalizedSelectedKeys[index]);
  const plantingCountsByPallet = buildPlantingCountsByPalletForKeys(normalizedSelectedKeys);
  const existingPlantingCountsByPallet = existingEvent
    ? buildPlantingCountsByPalletForKeys(existingEvent.plantingPalletKeys, existingEvent.plantingCountsByPallet)
    : {};
  const existingHasCompletePlantingCounts = !!existingEvent
    && existingEvent.plantingPalletKeys.every(key => (
      ALLOWED_YIELDS.includes(Number(existingEvent.plantingCountsByPallet?.[key]))
    ));
  const samePlantingCounts = samePlantingKeys && existingHasCompletePlantingCounts
    && normalizedSelectedKeys.every(key => (
      plantingCountsByPallet[key] === existingPlantingCountsByPallet[key]
    ));
  const existingSeedlingHouseKeys = normalizeSeedlingHousePalletKeys(existingEvent?.seedlingHousePalletKeys || []);
  const seedlingHousePlan = getSeedlingHousePlanForHarvestKeys(record.palletKeys, {
    takeCount: actualSeedlingTrayCount,
    selectionMode: "manual",
    referenceDate: parseDateOnlyString(record.date) || new Date(),
    sourceRecords: records.filter(item => Number(item?.id) !== Number(record.id)),
    excludeEventId: existingEvent?.eventId,
    shouldShowSelection: true
  });
  const seedlingHousePalletKeys = sameTrayCount && existingSeedlingHouseKeys.length
    ? existingSeedlingHouseKeys
    : seedlingHousePlan.selectedKeys;
  const event = normalizePlantingEvent({
    palletNumberingVersion: CURRENT_PALLET_NUMBERING_VERSION,
    eventId: existingEvent?.eventId || getNextPlantingEventId(),
    plantingDate,
    sourceAllocations,
    plantingPalletKeys: normalizedSelectedKeys,
    plantingCountsByPallet,
    actualSeedlingTrayCount,
    seedlingHousePalletKeys,
    actualTakenSeedlingCount: sameTrayCount
      ? existingEvent.actualTakenSeedlingCount
      : getActualTakenSeedlingTotalForTrayCount(actualSeedlingTrayCount),
    actualPlantedSeedlingCount: samePlantingKeys && samePlantingCounts
      ? existingEvent.actualPlantedSeedlingCount
      : getActualPlantedSeedlingTotal(normalizedSelectedKeys, plantingCountsByPallet),
    actualSeedlingCarryoverMode,
    actualSeedlingLossRate: sameTrayCount && samePlantingKeys && samePlantingCounts
      && existingEvent.actualSeedlingCarryoverMode === actualSeedlingCarryoverMode
      ? existingEvent.actualSeedlingLossRate
      : actualSeedlingLossRate,
    qualityMemo,
    createdAt: existingEvent?.createdAt || "",
    updatedAt: existingEvent?.updatedAt || "",
    openingCarryoverBefore: existingEvent?.openingCarryoverBefore ?? null,
    detailsUnknown: false
  });
  if(!event){
    showToast("苗植え記録を作成できませんでした。入力内容を確認してください");
    return;
  }
  const unselectedPreviousLots = getUnselectedPreviousUnplantedPalletLots(
    sourceAllocations,
    record,
    { excludeEventId: existingEvent?.eventId }
  );
  const needsPreviousUnplantedWarning = unselectedPreviousLots.length > 0;
  if(needsPreviousUnplantedWarning){
    const shouldSave = await askPlantingUnselectedWarningConfirm(unselectedPreviousLots);
    if(!shouldSave){
      showToast("苗植え記録の保存をキャンセルしました");
      return;
    }
  }
  if(!needsPreviousUnplantedWarning && !confirmPlantingRecordBeforeSend(
    record,
    normalizedSelectedKeys,
    plantingDate,
    actualSeedlingTrayCount,
    event.actualSeedlingLossRate,
    actualSeedlingCarryoverMode,
    event.actualTakenSeedlingCount,
    event.actualPlantedSeedlingCount,
    event.qualityMemo
  )){
    showToast("送信をキャンセルしました");
    return;
  }

  const existingIndex = plantingEvents.findIndex(item => Number(item.eventId) === Number(event.eventId));
  if(existingIndex >= 0) plantingEvents[existingIndex] = event;
  else plantingEvents.push(event);
  savePlantingEventsToStorage();
  setPlantingEventSyncStatus(event, "edited");
  syncHarvestPlantingPendingFlags();
  maybePromptRecordExport();
  refreshRecordDataUi({ maps: false });
  clearHarvestPrediction();
  resetAllCasePlacements();
  resetForecastCasesInput();
  captureRecordBaseSelection();
  clearRecordForm();
  if(!getLatestPendingPlantingRecord()) showWorkflowCompletionCelebration();
  saveHarvestStateToStorage();
  const sendQueued = queueGoogleSheetPlantingEventSend(event, {
    successMessage: existingEvent ? "苗植え記録を更新して送信しました" : "苗植え記録を送信しました",
    failureMessage: "苗植え場所はアプリに記録済みです。スプレッドシートは未送信です"
  });
  showToast(sendQueued
    ? (existingEvent
        ? "苗植え記録を更新しました。スプレッドシートへ送信中です"
        : "苗植え場所を記録しました。スプレッドシートへ送信中です")
    : "苗植え場所を記録しました。スプレッドシートは未送信です");
}

function resumePlantingRecord(id, options = {}){
  if(!options.auto && !ensureGoogleSheetLocalMutationAllowed("苗植え記録を再開")) return;
  const record = getRecordById(id);
  if(!record || record.type !== "fullHarvest"){
    showToast("苗植え場所を記録する収穫記録が見つかりません");
    return;
  }
  const recordDateInput = document.getElementById("recordDateInput");
  if(recordDateInput) recordDateInput.value = record.plantingDate || record.date || "";
  updateRecordWeekdayDisplay();
  const recordCasesInput = document.getElementById("recordCasesInput");
  if(recordCasesInput) recordCasesInput.value = String(record.cases || "");
  const recordActualSeedlingTrayCountInput = document.getElementById("recordActualSeedlingTrayCountInput");
  if(recordActualSeedlingTrayCountInput){
    delete recordActualSeedlingTrayCountInput.dataset.userEdited;
  }
  syncRecordActualSeedlingTrayCountInput(record, { force: true });
  setRecordSeedlingCarryoverMode(record.actualSeedlingCarryoverMode || "loss", { silent: true });
  const recordMemoInput = document.getElementById("recordMemoInput");
  if(recordMemoInput) recordMemoInput.value = record.memo || "";
  editingPlantingEventId = null;
  invalidatePlantingAllowedPalletSetCache();
  enterPlantingRecordMode(record);
  updateRecordActualLoss();
  updateRecordActualSeedlingDisplays();
  saveHarvestStateToStorage();
  if(options.switchToRecordTab){
    switchTab("record");
  }
  showToast(options.auto ? "未完了の苗植え記録を再開しました" : "苗植え場所の記録を再開しました");
}

function editPlantingEvent(eventId){
  if(!ensureProtectedOperationAccess("苗植え記録の編集")) return;
  if(!ensureGoogleSheetLocalMutationAllowed("苗植え記録を編集")) return;
  const event = getPlantingEventById(eventId);
  const preferredHarvestId = event?.sourceAllocations?.[0]?.harvestRecordId;
  const record = getRecordById(preferredHarvestId);
  if(!event || !record || record.type !== "fullHarvest"){
    showToast("編集する苗植え記録の収穫元が見つかりません");
    return;
  }
  if(!ensureSyncConflictResolvedBeforeChange("planting", event, "苗植え記録を編集")) return;
  if(isPlantingEventBeforeLatestOpeningBoundary(event)){
    showToast("この履歴は新しい繰越基準より前にあるため編集できません");
    return;
  }
  if(switchTab("record") === false) return;
  if(!isRecordEditMode()) captureForecastSelectionState();

  editingPlantingEventId = Number(event.eventId);
  plantingRecordDraft = {
    recordId: Number(record.id),
    keys: [...event.plantingPalletKeys],
    plantingCountPreset: normalizePlantingCountPreset(
      Object.values(event.plantingCountsByPallet || {})[0],
      getConfiguredPlantingCountForFirstKey(event.plantingPalletKeys)
    ),
    plantingCountsByPallet: buildPlantingCountsByPalletForKeys(
      event.plantingPalletKeys,
      event.plantingCountsByPallet
    ),
    date: event.plantingDate,
    actualSeedlingTrayCount: event.detailsUnknown ? "" : String(event.actualSeedlingTrayCount ?? ""),
    actualSeedlingCarryoverMode: event.actualSeedlingCarryoverMode,
    actualSeedlingUserEdited: true,
    plantingSummaryInput: formatPlantingSummaryForKeys(event.plantingPalletKeys),
    recordPlantingSummaryEdited: false,
    qualityMemo: event.qualityMemo
  };
  invalidatePlantingAllowedPalletSetCache();
  enterPlantingRecordMode(record);
  refreshRecordModeUi();
  showToast("苗植え記録を編集中です");
}

async function confirmDeletePlantingEvent(eventId){
  if(!ensureProtectedOperationAccess("苗植え記録の削除")) return;
  if(!ensureGoogleSheetLocalMutationAllowed("苗植え記録を削除")) return;
  const event = getPlantingEventById(eventId);
  if(!event){
    showToast("削除する苗植え記録が見つかりません");
    return;
  }
  if(!ensureSyncConflictResolvedBeforeChange("planting", event, "苗植え記録を削除")) return;
  if(isPlantingEventBeforeLatestOpeningBoundary(event)){
    showToast("この履歴は新しい繰越基準より前にあるため削除できません");
    return;
  }
  if(!window.confirm("この苗植え記録をアプリから削除しますか？\n\n削除後30日以内なら、削除済みの記録から復元できます。")) return;

  const wasSynced = !isPlantingEventUnsent(event);
  const isOpeningCheckpoint = hasPlantingOpeningCarryover(event);
  const requiresSheetDelete = wasSynced || isOpeningCheckpoint;
  const configValidation = validateGoogleSheetConfig(loadGoogleSheetConfig());
  if(requiresSheetDelete && !configValidation.ok){
    showRecordImportError(configValidation.message + "。スプレッドシート連携済みの苗植え記録を削除するには、連携設定が必要です。", "削除前に設定してください");
    return;
  }
  let shouldDeleteFromSheet = false;
  if(requiresSheetDelete && configValidation.ok){
    if(isOpeningCheckpoint){
      shouldDeleteFromSheet = window.confirm(
        "この古い履歴は1,000件以前の繰越基準です。計算を保つため、アプリとスプレッドシートの両方から削除する必要があります。\n\n両方から削除しますか？"
      );
      if(!shouldDeleteFromSheet) return;
    }else{
      shouldDeleteFromSheet = window.confirm(
        "スプレッドシート側の苗植え記録も削除しますか？\n\n「OK」: アプリとスプレッドシートから削除\n「キャンセル」: アプリからのみ削除"
      );
    }
  }
  let sheetDeleted = false;
  let remoteMissing = false;
  const operationOwner = beginGoogleSheetOperation("sending");
  if(!operationOwner){
    showToast(getGoogleSheetOperationBusyMessage("苗植え記録を削除"));
    return;
  }

  try{
    if(shouldDeleteFromSheet){
      try{
        const result = await postGoogleSheetPlantingEvent(event, "delete", { config: configValidation.config, silent: true });
        sheetDeleted = !!(result.deleted || result.alreadyDeleted || result.notFound);
        remoteMissing = !!result.notFound;
      }catch(e){
        showRecordImportError("スプレッドシート側の削除に失敗したため、アプリ側も残しています。\n\n詳細: " + String(e?.message || e), "削除失敗");
        return;
      }
    }

    addPlantingEventToTrash(event, { sheetDeleted, wasSynced: wasSynced && !remoteMissing });
    if(event.openingCarryoverBefore !== null
      && event.openingCarryoverBefore !== undefined
      && String(event.openingCarryoverBefore).trim() !== ""){
      const nextEvent = plantingEvents
        .filter(item => Number(item.eventId) !== Number(event.eventId)
          && comparePlantingEventsAsc(item, event) > 0)
        .sort(comparePlantingEventsAsc)[0];
      if(nextEvent && (nextEvent.openingCarryoverBefore === null
        || nextEvent.openingCarryoverBefore === undefined)){
        nextEvent.openingCarryoverBefore = event.openingCarryoverBefore;
      }
    }
    plantingEvents = plantingEvents.filter(item => Number(item.eventId) !== Number(event.eventId));
    const status = loadPlantingEventSyncStatus();
    delete status[String(event.eventId)];
    savePlantingEventSyncStatus(status);
    savePlantingEventsToStorage();
    syncHarvestPlantingPendingFlags();
    if(Number(editingPlantingEventId) === Number(event.eventId)) clearRecordForm();
    refreshRecordHistoryViews();
    updateGoogleSheetResendButtonState();
    refreshHarvestMapViews();
    showToast(sheetDeleted ? "苗植え記録をアプリとスプレッドシートから削除しました" : "苗植え記録をアプリから削除しました");
  }finally{
    endGoogleSheetOperation(operationOwner);
  }
}

function formatRestoreHarvestRecordDetails(record){
  if(!record) return "記録情報なし";
  const recordType = record.type === "partialHarvest" ? "部分収穫記録" : "通常収穫記録";
  const recordId = getSafePositiveRecordId(record.id);
  const locationText = record.type === "partialHarvest"
    ? (formatPartialHarvestSummary(record.targets) || "場所情報なし")
    : (formatConsistencyPalletKeys(getPalletKeysFromRecord(record), 12)
      || String(record.palletSummary || "").trim()
      || "場所情報なし");
  return [
    `日付: ${record.date || "日付不明"}`,
    `種類: ${recordType}`,
    `記録ID: ${recordId === null ? "不明" : recordId}`,
    `ケース数: ${String(record.cases ?? "不明")}`,
    `場所: ${locationText}`
  ].join("\n");
}

function formatRestorePlantingEventDetails(event){
  if(!event) return "記録情報なし";
  const eventId = getSafePositiveRecordId(event.eventId);
  const sourceIds = [...new Set((event.sourceAllocations || [])
    .map(allocation => getSafePositiveRecordId(allocation.harvestRecordId))
    .filter(id => id !== null))];
  return [
    `日付: ${event.plantingDate || "日付不明"}`,
    `記録ID: ${eventId === null ? "不明" : eventId}`,
    `収穫元ID: ${sourceIds.length ? sourceIds.join("、") : "不明"}`,
    `苗植え場所: ${formatConsistencyPalletKeys(event.plantingPalletKeys, 12) || "場所情報なし"}`
  ].join("\n");
}

function getPlantingEventRestoreBlockers(event){
  const blockers = [];
  if(!event) return ["復元する苗植え記録の内容を読み込めませんでした。"];

  const existingEvent = getPlantingEventById(event.eventId);
  if(existingEvent){
    blockers.push([
      `同じ記録ID（${event.eventId}）の苗植え記録が現在の記録一覧にあります。`,
      "競合している現在の記録:",
      formatRestorePlantingEventDetails(existingEvent),
      "内容が同じなら復元は不要です。別の記録なら、現在の記録を削除してから復元してください。"
    ].join("\n"));
    return blockers;
  }

  const ownerByLot = new Map();
  plantingEvents.forEach(ownerEvent => {
    ownerEvent.sourceAllocations.forEach(allocation => {
      allocation.palletKeys.forEach(key => {
        const lotKey = getPlantingLotKey(allocation.harvestRecordId, key);
        if(!ownerByLot.has(lotKey)) ownerByLot.set(lotKey, []);
        ownerByLot.get(lotKey).push(ownerEvent);
      });
    });
  });

  (event.sourceAllocations || []).forEach(allocation => {
    const sourceId = getSafePositiveRecordId(allocation.harvestRecordId);
    const sourceRecord = sourceId === null ? null : getRecordById(sourceId);
    const allocationLocations = formatConsistencyPalletKeys(allocation.palletKeys, 12) || "場所情報なし";
    if(!sourceRecord){
      const deletedSource = deletedRecords.find(item => (
        Number(item.record?.id) === Number(sourceId)
      ));
      blockers.push(deletedSource
        ? [
            `収穫元ID ${sourceId} の収穫記録が削除済みです。`,
            `対象の収穫パレット: ${allocationLocations}`,
            "削除済みにある収穫元:",
            formatRestoreHarvestRecordDetails(deletedSource.record),
            "先にこの収穫記録を復元してください。"
          ].join("\n")
        : [
            `収穫元ID ${sourceId === null ? "不明" : sourceId} の収穫記録が見つかりません。`,
            `対象の収穫パレット: ${allocationLocations}`,
            "スプレッドシートとの同期または収穫記録の削除履歴を確認してください。"
          ].join("\n"));
      return;
    }
    if(sourceRecord.type !== "fullHarvest"){
      blockers.push([
        `収穫元ID ${sourceId} が通常収穫記録ではありません。`,
        `対象の収穫パレット: ${allocationLocations}`,
        "現在の収穫元:",
        formatRestoreHarvestRecordDetails(sourceRecord)
      ].join("\n"));
      return;
    }

    const sourceKeys = new Set(getPalletKeysFromRecord(sourceRecord));
    const removedKeys = allocation.palletKeys.filter(key => !sourceKeys.has(key));
    if(removedKeys.length){
      blockers.push([
        `収穫元ID ${sourceId} の収穫場所から、必要なパレットが外れています。`,
        `外れている場所: ${formatConsistencyPalletKeys(removedKeys, 12)}`,
        "現在の収穫元:",
        formatRestoreHarvestRecordDetails(sourceRecord),
        "収穫元の記録を編集して場所を戻すか、この苗植え記録の内容を見直してください。"
      ].join("\n"));
    }

    const occupiedByEvent = new Map();
    allocation.palletKeys.forEach(key => {
      const ownerEvents = ownerByLot.get(getPlantingLotKey(sourceId, key)) || [];
      ownerEvents.forEach(ownerEvent => {
        if(!occupiedByEvent.has(ownerEvent)) occupiedByEvent.set(ownerEvent, []);
        occupiedByEvent.get(ownerEvent).push(key);
      });
    });
    occupiedByEvent.forEach((keys, ownerEvent) => {
      blockers.push([
        `同じ収穫パレットが別の苗植え記録で使用されています。`,
        `重複している収穫元の場所: ${formatConsistencyPalletKeys(keys, 12)}`,
        "競合している苗植え記録:",
        formatRestorePlantingEventDetails(ownerEvent),
        "競合している苗植え記録を先に編集または削除してください。"
      ].join("\n"));
    });
  });

  return blockers;
}

function showPlantingEventRestoreBlockers(event, blockers){
  showRecordImportError([
    "復元対象:",
    formatRestorePlantingEventDetails(event),
    "",
    "復元できない原因:",
    ...blockers.map((blocker, index) => `${index + 1}. ${blocker}`)
  ].join("\n"), "苗植え記録を復元できません");
}

async function restoreDeletedPlantingEvent(eventId){
  if(!ensureProtectedOperationAccess("削除した苗植え記録の復元")) return;
  if(!ensureGoogleSheetLocalMutationAllowed("削除した苗植え記録を復元")) return;
  const entry = deletedPlantingEvents.find(item => Number(item.event?.eventId) === Number(eventId));
  if(!entry){
    showRecordImportError([
      `検索した苗植え記録ID: ${String(eventId || "不明")}`,
      `現在の削除済み苗植え記録: ${deletedPlantingEvents.length}件`,
      "",
      "考えられる原因:",
      "・すでに復元または完全削除されている",
      "・削除から30日を過ぎて自動的に消去された",
      "・別端末との同期で削除済み一覧が更新された"
    ].join("\n"), "復元対象が見つかりません");
    renderDeletedRecordList();
    return;
  }
  const restoreBlockers = getPlantingEventRestoreBlockers(entry.event);
  if(restoreBlockers.length){
    showPlantingEventRestoreBlockers(entry.event, restoreBlockers);
    return;
  }
  const configValidation = entry.sheetDeleted
    ? validateGoogleSheetConfig(loadGoogleSheetConfig())
    : null;
  if(entry.sheetDeleted && !configValidation?.ok){
    showRecordImportError([
      "復元対象:",
      formatRestorePlantingEventDetails(entry.event),
      "",
      "処理箇所: アプリメニュー内のGoogle連携設定",
      `原因: ${configValidation?.message || "Google連携設定を確認できません"}`,
      "設定を修正してから、もう一度復元してください。"
    ].join("\n"), "復元前にGoogle連携設定を確認してください");
    return;
  }
  const config = configValidation?.config || null;
  const operationOwner = beginGoogleSheetOperation("sending");
  if(!operationOwner){
    showRecordImportError([
      "復元対象:",
      formatRestorePlantingEventDetails(entry.event),
      "",
      "処理箇所: スプレッドシート同期処理",
      `原因: ${getGoogleSheetOperationBusyMessage("復元")}`
    ].join("\n"), "現在は復元できません");
    return;
  }
  let eventToRestore = entry.event;
  try{
    if(entry.sheetDeleted){
      try{
        const result = await postGoogleSheetPlantingEvent(entry.event, "restore", { config, silent: true });
        const restoredRemoteEvent = normalizePlantingEvent(result?.event);
        if(!restoredRemoteEvent){
          showRecordImportError([
            "復元対象:",
            formatRestorePlantingEventDetails(entry.event),
            "",
            "処理箇所: Apps Scriptから返された苗植え記録",
            "原因: 復元応答に、アプリで読み込める日付・収穫元・パレット情報がありません。",
            "Apps Scriptのデプロイ版とスプレッドシートの該当行を確認してください。"
          ].join("\n"), "復元応答を読み込めません");
          return;
        }
        eventToRestore = {
          ...restoredRemoteEvent,
          openingCarryoverBefore: restoredRemoteEvent.openingCarryoverBefore
            ?? entry.event.openingCarryoverBefore
            ?? null
        };
      }catch(e){
        showRecordImportError([
          "復元対象:",
          formatRestorePlantingEventDetails(entry.event),
          "",
          "処理箇所: スプレッドシート / Apps Script",
          `原因: ${String(e?.message || e)}`,
          "アプリ側では削除済みのまま保持しています。"
        ].join("\n"), "苗植え記録の復元に失敗しました");
        return;
      }
    }

    const postRestoreBlockers = getPlantingEventRestoreBlockers(eventToRestore);
    if(postRestoreBlockers.length){
      showPlantingEventRestoreBlockers(eventToRestore, postRestoreBlockers);
      return;
    }

    if(eventToRestore.openingCarryoverBefore !== null
      && eventToRestore.openingCarryoverBefore !== undefined){
      plantingEvents.forEach(item => {
        if(comparePlantingEventsAsc(item, eventToRestore) > 0){
          item.openingCarryoverBefore = null;
        }
      });
    }
    plantingEvents.push(eventToRestore);
    deletedPlantingEvents = deletedPlantingEvents.filter(item => Number(item.event?.eventId) !== Number(eventId));
    saveDeletedPlantingEventsToStorage();
    savePlantingEventsToStorage();
    setPlantingEventSyncStatus(eventToRestore, entry.sheetDeleted || entry.wasSynced ? "confirmed" : "edited");
    syncHarvestPlantingPendingFlags();
    refreshRecordHistoryViews();
    refreshHarvestMapViews();
    showToast(entry.sheetDeleted ? "苗植え記録をアプリとスプレッドシートに復元しました" : "苗植え記録を復元しました");
  }finally{
    endGoogleSheetOperation(operationOwner);
  }
}
