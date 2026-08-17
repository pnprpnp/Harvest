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
  const frontInput = document.getElementById("frontCaseInput");
  const middleInput = document.getElementById("middleCaseInput");
  const backInput = document.getElementById("backCaseInput");
  const rawValues = [frontInput?.value, middleInput?.value, backInput?.value];
  const front = clampNumber(frontInput?.value || 0, 0, 999999, 0);
  const middle = clampNumber(middleInput?.value || 0, 0, 999999, 0);
  const back = clampNumber(backInput?.value || 0, 0, 999999, 0);
  const totalValue = document.getElementById("casePlacementTotalValue");
  const compactSummary = document.getElementById("casePlacementCompactSummary");
  const details = document.getElementById("casePlacementDetails");
  if(totalValue) totalValue.textContent = String(front + middle + back);
  if(compactSummary) compactSummary.textContent = `奥${back}・中央${middle}・手前${front}`;
  if(details){
    const needsInput = rawValues.every(value => String(value ?? "").trim() === "");
    details.classList.toggle("casePlacementNeedsInput", needsInput);
  }
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
