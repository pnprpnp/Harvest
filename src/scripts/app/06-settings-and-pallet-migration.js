function populateSettingsForm(){
  document.getElementById("defaultLossRateInput").value = settings.defaultLossRate;
  document.getElementById("defaultYieldInput").value = String(settings.defaultYieldPerPallet);
  document.getElementById("defaultPlantingCountInput").value = String(settings.defaultPlantingCount);
  document.getElementById("useBedLossSettings").checked = !!settings.useBedLossSettings;
  document.getElementById("useBedYieldSettings").checked = !!settings.useBedYieldSettings;
  document.getElementById("useBedPlantSettings").checked = !!settings.useBedPlantSettings;
  document.getElementById("seedlingLossRateInput").value = settings.seedlingLossRate;
  document.getElementById("specialPallet60CountInput").value = String(settings.specialPallet60CountPer3);
  document.getElementById("accessPasswordInput").value = "";

  ["A","B","C","D","E","F"].forEach(b => {
    document.getElementById("yield_" + b).value = String(settings.beds[b].yield);
    document.getElementById("loss_" + b).value = settings.beds[b].lossRate;
    document.getElementById("plant_" + b).value = String(settings.beds[b].plant);
    document.getElementById("yieldUseFrontBack_" + b).checked = !!settings.beds[b].yieldUseFrontBack;
    document.getElementById("yieldFrontCount_" + b).value = settings.beds[b].yieldFrontCount;
    document.getElementById("yieldFront_" + b).value = String(settings.beds[b].yieldFront);
    document.getElementById("yieldBack_" + b).value = String(settings.beds[b].yieldBack);
    document.getElementById("plantUseFrontBack_" + b).checked = !!settings.beds[b].plantUseFrontBack;
    document.getElementById("plantFrontCount_" + b).value = settings.beds[b].plantFrontCount;
    document.getElementById("plantFront_" + b).value = String(settings.beds[b].plantFront);
    document.getElementById("plantBack_" + b).value = String(settings.beds[b].plantBack);
  });

  refreshOverrideControls();
  refreshBedTabSummaries();
  updateAccessProtectionStatus();
}

function readSettingsForm(){
  const next = deepClone(settings);

  next.defaultLossRate = clampNumber(document.getElementById("defaultLossRateInput").value, 0, 100, defaultSettings.defaultLossRate);
  next.defaultYieldPerPallet = normalizeYield(document.getElementById("defaultYieldInput").value, defaultSettings.defaultYieldPerPallet);
  next.defaultPlantingCount = normalizeYield(document.getElementById("defaultPlantingCountInput").value, defaultSettings.defaultPlantingCount);
  next.useBedLossSettings = !!document.getElementById("useBedLossSettings").checked;
  next.useBedYieldSettings = !!document.getElementById("useBedYieldSettings").checked;
  next.useBedPlantSettings = !!document.getElementById("useBedPlantSettings").checked;
  next.seedlingLossRate = clampNumber(document.getElementById("seedlingLossRateInput").value, 0, 100, defaultSettings.seedlingLossRate);
  next.specialPallet60CountPer3 = clampNumber(document.getElementById("specialPallet60CountInput").value, 0, 3, defaultSettings.specialPallet60CountPer3);

  ["A","B","C","D","E","F"].forEach(b => {
    next.beds[b].yield = normalizeYield(document.getElementById("yield_" + b).value, next.defaultYieldPerPallet);
    next.beds[b].lossRate = normalizeLossInput(document.getElementById("loss_" + b).value);
    next.beds[b].plant = normalizeYield(document.getElementById("plant_" + b).value, next.defaultPlantingCount);
    next.beds[b].yieldUseFrontBack = !!document.getElementById("yieldUseFrontBack_" + b).checked;
    next.beds[b].yieldFrontCount = clampNumber(document.getElementById("yieldFrontCount_" + b).value, 0, PALLETS_PER_BED, 39);
    next.beds[b].yieldFront = normalizeYield(document.getElementById("yieldFront_" + b).value, next.beds[b].yield);
    next.beds[b].yieldBack = normalizeYield(document.getElementById("yieldBack_" + b).value, next.beds[b].yield);
    next.beds[b].plantUseFrontBack = !!document.getElementById("plantUseFrontBack_" + b).checked;
    next.beds[b].plantFrontCount = clampNumber(document.getElementById("plantFrontCount_" + b).value, 0, PALLETS_PER_BED, 39);
    next.beds[b].plantFront = normalizeYield(document.getElementById("plantFront_" + b).value, next.beds[b].plant);
    next.beds[b].plantBack = normalizeYield(document.getElementById("plantBack_" + b).value, next.beds[b].plant);
  });

  return next;
}

function clampNumber(value, min, max, fallback){
  const n = Number(value);
  if(!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeCasePlacement(value){
  return {
    front: clampNumber(value?.front, 0, 999999, 0),
    middle: clampNumber(value?.middle, 0, 999999, 0),
    back: clampNumber(value?.back, 0, 999999, 0)
  };
}

function normalizeCasePlacementInput(value){
  return {
    front: value?.front === "" ? "" : clampNumber(value?.front, 0, 999999, 0),
    middle: value?.middle === "" ? "" : clampNumber(value?.middle, 0, 999999, 0),
    back: value?.back === "" ? "" : clampNumber(value?.back, 0, 999999, 0)
  };
}

function getCasePlacementForBuilding(building){
  const key = String(building);
  if(!casePlacementByBuilding[key]){
    casePlacementByBuilding[key] = { ...DEFAULT_CASE_PLACEMENT };
  }
  return normalizeCasePlacement(casePlacementByBuilding[key]);
}

function getCasePlacementInputForBuilding(building){
  const key = String(building);
  if(!casePlacementByBuilding[key]){
    casePlacementByBuilding[key] = { ...DEFAULT_CASE_PLACEMENT };
  }
  return normalizeCasePlacementInput(casePlacementByBuilding[key]);
}

function syncCurrentCasePlacementFromInputs(){
  const frontInput = document.getElementById("frontCaseInput");
  const middleInput = document.getElementById("middleCaseInput");
  const backInput = document.getElementById("backCaseInput");
  if(!frontInput || !middleInput || !backInput) return;

  casePlacementByBuilding[String(casePlacementBuilding)] = {
    front: frontInput.value === "" ? "" : clampNumber(frontInput.value, 0, 999999, 0),
    middle: middleInput.value === "" ? "" : clampNumber(middleInput.value, 0, 999999, 0),
    back: backInput.value === "" ? "" : clampNumber(backInput.value, 0, 999999, 0)
  };
}

function populateCasePlacementInputs(){
  const placement = getCasePlacementInputForBuilding(casePlacementBuilding);
  const frontInput = document.getElementById("frontCaseInput");
  const middleInput = document.getElementById("middleCaseInput");
  const backInput = document.getElementById("backCaseInput");
  if(frontInput) frontInput.value = placement.front;
  if(middleInput) middleInput.value = placement.middle;
  if(backInput) backInput.value = placement.back;
  updateCasePlacementTotal();
  refreshEmptyInputHighlights();
}

function updateCasePlacementTotal(){
  const front = clampNumber(document.getElementById("frontCaseInput")?.value || 0, 0, 999999, 0);
  const middle = clampNumber(document.getElementById("middleCaseInput")?.value || 0, 0, 999999, 0);
  const back = clampNumber(document.getElementById("backCaseInput")?.value || 0, 0, 999999, 0);
  const totalValue = document.getElementById("casePlacementTotalValue");
  if(totalValue) totalValue.textContent = String(front + middle + back);
}

function formatSettingValue(value){
  if(typeof value === "boolean") return value ? "有効" : "無効";
  if(value === "" || value === null || typeof value === "undefined") return "未入力";
  return String(value);
}

function pushSettingChangeLine(lines, label, beforeValue, afterValue, suffix = ""){
  if(beforeValue === afterValue) return;
  lines.push(`${label}を${formatSettingValue(afterValue)}${suffix}に変更しました。`);
}

function getYieldSettingsChangeMemoLines(previousSettings, nextSettings){
  const lines = [];
  pushSettingChangeLine(lines, "収穫時の全体個数", previousSettings.defaultYieldPerPallet, nextSettings.defaultYieldPerPallet, "個");
  pushSettingChangeLine(lines, "収穫時のベッド別設定", !!previousSettings.useBedYieldSettings, !!nextSettings.useBedYieldSettings);

  bedOrder.forEach(bed => {
    const before = previousSettings.beds?.[bed] || {};
    const after = nextSettings.beds?.[bed] || {};
    pushSettingChangeLine(lines, `収穫時 ${bed}ベッドの個数`, before.yield, after.yield, "個");
    pushSettingChangeLine(lines, `収穫時 ${bed}ベッドの手前奥設定`, !!before.yieldUseFrontBack, !!after.yieldUseFrontBack);
    pushSettingChangeLine(lines, `収穫時 ${bed}ベッドの手前パレット数`, before.yieldFrontCount, after.yieldFrontCount, "枚");
    pushSettingChangeLine(lines, `収穫時 ${bed}ベッドの手前個数`, before.yieldFront, after.yieldFront, "個");
    pushSettingChangeLine(lines, `収穫時 ${bed}ベッドの奥個数`, before.yieldBack, after.yieldBack, "個");
  });

  return lines;
}

function getPlantSettingsChangeMemoLines(previousSettings, nextSettings){
  const lines = [];
  pushSettingChangeLine(lines, "苗の全体個数", previousSettings.defaultPlantingCount, nextSettings.defaultPlantingCount, "個");
  pushSettingChangeLine(lines, "苗のベッド別設定", !!previousSettings.useBedPlantSettings, !!nextSettings.useBedPlantSettings);

  bedOrder.forEach(bed => {
    const before = previousSettings.beds?.[bed] || {};
    const after = nextSettings.beds?.[bed] || {};
    pushSettingChangeLine(lines, `苗 ${bed}ベッドの個数`, before.plant, after.plant, "個");
    pushSettingChangeLine(lines, `苗 ${bed}ベッドの手前奥設定`, !!before.plantUseFrontBack, !!after.plantUseFrontBack);
    pushSettingChangeLine(lines, `苗 ${bed}ベッドの手前パレット数`, before.plantFrontCount, after.plantFrontCount, "枚");
    pushSettingChangeLine(lines, `苗 ${bed}ベッドの手前個数`, before.plantFront, after.plantFront, "個");
    pushSettingChangeLine(lines, `苗 ${bed}ベッドの奥個数`, before.plantBack, after.plantBack, "個");
  });

  return lines;
}

function appendSettingsChangeMemo(previousSettings, nextSettings){
  const memoInput = document.getElementById("recordMemoInput");
  if(!memoInput || !previousSettings || !nextSettings) return;

  let memo = memoInput.value || "";
  const lines = [
    ...getYieldSettingsChangeMemoLines(previousSettings, nextSettings),
    ...getPlantSettingsChangeMemoLines(previousSettings, nextSettings)
  ];
  lines.forEach(line => {
    memo = appendAutoMemo(memo, line);
  });

  memoInput.value = memo;
  saveHarvestStateToStorage();
}

function saveSettings(){
  let unlockResult = null;
  if(isAnyProtectedOperationEnabled() && !protectedAccessUnlocked){
    unlockResult = applyAccessUnlockInput(document.getElementById("accessPasswordInput")?.value || "");
    if(unlockResult !== true){
      showToast("設定を保存するには正しい固定パスワードが必要です");
      return false;
    }
  }
  const previousSettings = deepClone(settings);
  const nextSettings = readSettingsForm();
  if(!hasPresetAccessPassword()){
    showToast("固定パスワードが未設定です");
    return false;
  }
  if(unlockResult === null){
    unlockResult = applyAccessUnlockInput(document.getElementById("accessPasswordInput")?.value || "");
  }
  appendSettingsChangeMemo(previousSettings, nextSettings);
  settings = nextSettings;
  saveSettingsToStorage();
  settingsDirty = false;
  clearHarvestPrediction();
  saveHarvestStateToStorage();
  populateSettingsForm();
  if(unlockResult === true){
    syncAccessProtectionDetails({ forceClosed: true });
    showToast("設定を保存してロックを解除しました");
  }else if(unlockResult === false){
    showToast("設定を保存しました。パスワードが違うためロックは解除されていません");
  }else{
    showToast("設定を保存しました");
  }
  return true;
}

function resetSettings(){
  if(!ensureProtectedOperationAccess("設定の初期化")) return;
  const previousSettings = deepClone(settings);
  const nextSettings = deepClone(defaultSettings);
  appendSettingsChangeMemo(previousSettings, nextSettings);
  settings = nextSettings;
  resetProtectedAccessSession();
  saveProtectedAccessAuth(false);
  saveSettingsToStorage();
  populateSettingsForm();
  settingsDirty = false;
  clearHarvestPrediction();
  saveHarvestStateToStorage();
  showToast("設定を初期化しました");
}

function getPalletKey(building, bed, number){
  return `${building}-${bed}-${number}`;
}

function parsePalletKey(key){
  const parts = key.split("-");
  return {
    building: Number(parts[0]),
    bed: parts[1],
    number: Number(parts[2])
  };
}

function isStoredPalletNumberingCurrent(value){
  const syncSchemaVersion = Number(value?.syncSchemaVersion);
  const recordId = Number(value?.id);
  const eventId = Number(value?.eventId);
  return Number(value?.palletNumberingVersion) === CURRENT_PALLET_NUMBERING_VERSION
    || (Number.isSafeInteger(syncSchemaVersion) && syncSchemaVersion >= 4)
    || (Number.isSafeInteger(recordId) && recordId >= 10000000000000)
    || (Number.isSafeInteger(eventId) && eventId >= 10000000000000);
}

function migrateLegacyPalletNumber(number){
  const normalizedNumber = Number(number);
  if(!Number.isInteger(normalizedNumber)
    || normalizedNumber < 1
    || normalizedNumber > PALLETS_PER_BED){
    return normalizedNumber;
  }
  return normalizedNumber % 2 === 0 ? normalizedNumber - 1 : normalizedNumber + 1;
}

function migrateLegacyPalletKey(key){
  if(!isValidPalletKeyString(key)) return "";
  const pallet = parsePalletKey(key);
  return getPalletKey(
    pallet.building,
    pallet.bed,
    migrateLegacyPalletNumber(pallet.number)
  );
}

function migrateLegacyPalletKeys(keys){
  return [...new Set((Array.isArray(keys) ? keys : [])
    .map(migrateLegacyPalletKey)
    .filter(Boolean))]
    .sort((a, b) => getOrderIndexFromKey(a) - getOrderIndexFromKey(b));
}

function migrateLegacyPartialHarvestTargets(targets){
  return normalizePartialHarvestTargets(targets).flatMap(target => {
    const convertedNumbers = [];
    for(let number = target.start; number <= target.end; number++){
      convertedNumbers.push(migrateLegacyPalletNumber(number));
    }
    convertedNumbers.sort((a, b) => a - b);
    const convertedTargets = [];
    let start = convertedNumbers[0];
    let previous = convertedNumbers[0];
    for(let index = 1; index <= convertedNumbers.length; index++){
      const current = convertedNumbers[index];
      if(current === previous + 1){
        previous = current;
        continue;
      }
      convertedTargets.push({ ...target, start, end: previous });
      start = current;
      previous = current;
    }
    return convertedTargets;
  });
}

function migrateStoredHarvestRecordToCurrentNumbering(record){
  if(!record || typeof record !== "object" || Array.isArray(record)) return record;
  if(isStoredPalletNumberingCurrent(record)){
    return { ...record, palletNumberingVersion: CURRENT_PALLET_NUMBERING_VERSION };
  }
  if(record.type === "partialHarvest"){
    const targets = migrateLegacyPartialHarvestTargets(record.targets);
    return {
      ...record,
      palletNumberingVersion: CURRENT_PALLET_NUMBERING_VERSION,
      targets,
      palletSummary: targets.length ? formatPartialHarvestSummary(targets) : record.palletSummary
    };
  }

  const palletKeys = migrateLegacyPalletKeys([
    ...expandPalletKeyItemsToKeys(record.palletKeys),
    ...expandPalletRangesToKeys(record.palletRanges),
    ...parsePalletSummaryToKeys(record.palletSummary)
  ]);
  const plantingPalletKeys = migrateLegacyPalletKeys([
    ...expandPalletKeyItemsToKeys(record.plantingPalletKeys),
    ...expandPalletRangesToKeys(record.plantingRanges),
    ...parsePalletSummaryToKeys(record.plantingSummary)
  ]).filter(key => palletKeys.includes(key));

  return {
    ...record,
    palletNumberingVersion: CURRENT_PALLET_NUMBERING_VERSION,
    palletKeys,
    palletRanges: compressPalletKeysToRanges(palletKeys),
    palletSummary: palletKeys.length ? formatPalletSummary(palletKeys) : record.palletSummary,
    plantingPalletKeys,
    plantingRanges: compressPalletKeysToRanges(plantingPalletKeys),
    plantingSummary: plantingPalletKeys.length
      ? formatPlantingSummaryForKeys(plantingPalletKeys)
      : record.plantingSummary
  };
}

function migrateStoredPlantingEventToCurrentNumbering(event){
  if(!event || typeof event !== "object" || Array.isArray(event)) return event;
  if(isStoredPalletNumberingCurrent(event)){
    return { ...event, palletNumberingVersion: CURRENT_PALLET_NUMBERING_VERSION };
  }
  return {
    ...event,
    palletNumberingVersion: CURRENT_PALLET_NUMBERING_VERSION,
    sourceAllocations: Array.isArray(event.sourceAllocations)
      ? event.sourceAllocations.map(allocation => ({
          ...allocation,
          palletKeys: migrateLegacyPalletKeys(allocation?.palletKeys)
        }))
      : event.sourceAllocations,
    plantingPalletKeys: migrateLegacyPalletKeys(event.plantingPalletKeys)
  };
}

function migrateStoredHarvestStateToCurrentNumbering(state){
  if(!state || typeof state !== "object" || Array.isArray(state)) return state;
  if(isStoredPalletNumberingCurrent(state)){
    return { ...state, palletNumberingVersion: CURRENT_PALLET_NUMBERING_VERSION };
  }
  const harvestFillKeys = migrateLegacyPalletKeys(state.harvestFillKeys);
  const plantingRecordDraft = state.plantingRecordDraft && typeof state.plantingRecordDraft === "object"
    ? {
        ...state.plantingRecordDraft,
        keys: migrateLegacyPalletKeys(state.plantingRecordDraft.keys)
      }
    : state.plantingRecordDraft;
  const forecastSelectionState = state.forecastSelectionState && typeof state.forecastSelectionState === "object"
    ? {
        ...state.forecastSelectionState,
        keys: migrateLegacyPalletKeys(state.forecastSelectionState.keys)
      }
    : state.forecastSelectionState;
  const harvestProgressState = state.harvestProgressState && typeof state.harvestProgressState === "object"
    ? {
        ...state.harvestProgressState,
        planKeys: migrateLegacyPalletKeys(state.harvestProgressState.planKeys)
      }
    : state.harvestProgressState;
  return {
    ...state,
    palletNumberingVersion: CURRENT_PALLET_NUMBERING_VERSION,
    harvestFillKeys,
    plantingRecordDraft,
    forecastSelectionState,
    harvestProgressState,
    recordPalletSummaryInput: formatPalletSummary(harvestFillKeys),
    recordPlantingSummaryInput: formatPlantingSummaryForKeys(plantingRecordDraft?.keys || [])
  };
}

function migrateLocalPalletNumberingToLeftOriginOnce(){
  try{
    if(localStorage.getItem(PALLET_NUMBERING_MIGRATION_KEY) === "done") return;

    const migrateArrayStorage = (key, migrateItem) => {
      const raw = localStorage.getItem(key);
      if(!raw) return;
      const parsed = JSON.parse(raw);
      if(!Array.isArray(parsed)) return;
      localStorage.setItem(key, JSON.stringify(parsed.map(migrateItem)));
    };

    migrateArrayStorage(RECORDS_KEY, migrateStoredHarvestRecordToCurrentNumbering);
    migrateArrayStorage(PLANTING_EVENTS_KEY, migrateStoredPlantingEventToCurrentNumbering);
    migrateArrayStorage(RECORD_TRASH_KEY, entry => ({
      ...entry,
      record: migrateStoredHarvestRecordToCurrentNumbering(entry?.record)
    }));
    migrateArrayStorage(PLANTING_EVENT_TRASH_KEY, entry => ({
      ...entry,
      event: migrateStoredPlantingEventToCurrentNumbering(entry?.event)
    }));

    const stateRaw = localStorage.getItem(HARVEST_STATE_KEY);
    if(stateRaw){
      const state = migrateStoredHarvestStateToCurrentNumbering(JSON.parse(stateRaw));
      localStorage.setItem(HARVEST_STATE_KEY, JSON.stringify(state));
    }
    localStorage.setItem(PALLET_NUMBERING_MIGRATION_KEY, "done");
  }catch(error){
    console.error("パレット番号の保存データ移行に失敗しました", error);
    throw error;
  }
}

function updateBuildingLabel(){
  const mainBtn = document.getElementById("currentBuildingBtn");
  const partialBuildingInput = document.getElementById("partialHarvestBuildingInput");
  if(mainBtn) mainBtn.textContent = currentBuilding + "号棟";
  if(partialBuildingInput) partialBuildingInput.value = String(currentBuilding);
  updateBuildingLastHarvestInfo();
}

function updateCasePlacementBuildingLabel(){
  const caseBtn = document.getElementById("casePlacementBuildingBtn");
  if(caseBtn) caseBtn.textContent = casePlacementBuilding + "号棟";
}

function syncCurrentBuildingToCasePlacement(options = {}){
  const nextBuildingValue = BUILDINGS.includes(Number(casePlacementBuilding))
    ? Number(casePlacementBuilding)
    : MIN_BUILDING;
  const changed = currentBuilding !== nextBuildingValue;
  currentBuilding = nextBuildingValue;

  if(changed){
    closeBedDetailWindow();
    hideBedActionMenu();
    hideRecordBedActionMenu();
    expandedForecastBed = null;
    expandedRecordBed = null;
  }

  updateBuildingLabel();
  if(!options.skipRendering){
    drawBeds();
    drawRecordBeds();
  }
  if(!options.skipSummary){
    renderForecastSummary();
  }
}
