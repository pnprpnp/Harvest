function hideWelcomeScreen(){
  const screen = document.getElementById("welcomeScreen");
  if(!screen) return;
  if(!window.__harvestnaviWelcomeHasPainted){
    requestAnimationFrame(hideWelcomeScreen);
    return;
  }
  const minimumVisibleMs = 1100;
  const shownAt = Number(window.__harvestnaviWelcomePaintAt) || Date.now();
  const elapsedMs = Math.max(0, Date.now() - shownAt);
  const delayMs = Math.max(0, minimumVisibleMs - elapsedMs);
  setTimeout(() => {
    screen.classList.add("hide");
    setTimeout(() => screen.remove(), 460);
  }, delayMs);
}

function initializeStartupSettingsAndStorage(){
  monitorPreviewLayoutPreference = getStoredMonitorPreviewLayoutPreference()
    || monitorPreviewLayoutPreference;
  applyAppAccessRoleUi();
  moveCalculationSettingsToForecast();
  populateSettingsForm();
  populateGoogleSheetConfigForm();
  populateDashboardStartDayOptions();
  installSettingsDirtyWatchers();
  installNumberInputAutoSelect();
  installUnitInputTapFocus();
  installEmptyInputHighlights();
  installHarvestStateSaveFlushListeners();
  installMonitorViewportResizeObserver();
  syncHarvestPlantingPendingFlags();
}

function resetInvalidStartupPlantingState(){
  editingPlantingEventId = null;
  recordSelectionMode = "harvest";
  recordAdditionalBuildings = [];
  activePlantingRecordId = null;
  plantingRecordDraft = null;
  recordPlantingCountPreset = 20;
  recordPlantingCountsByPallet = {};
  recordPlantingFlowEnabled = false;
  recordPlantingFlowStage = "building";
  recordPlantingFlowBuilding = null;
  recordPlantingCompletedBuildings = [];
  recordPlantingQualityPreset = "medium";
  workflowPlantingSessionActive = false;
}

function restoreHarvestStateAtStartup(savedHarvestState){
  if(!savedHarvestState) return;
  currentBuilding = savedHarvestState.currentBuilding;
  casePlacementBuilding = savedHarvestState.casePlacementBuilding || savedHarvestState.currentBuilding;
  harvestFillKeys = savedHarvestState.harvestFillKeys;
  harvestOverageKeys = normalizeHarvestOverageKeys(
    savedHarvestState.harvestOverageKeys,
    savedHarvestState.harvestFillKeys
  );
  harvestSummary = savedHarvestState.harvestSummary;
  manualSeedlingCount = savedHarvestState.manualSeedlingCount;
  harvestCasesAutoEstimated = !!savedHarvestState.harvestCasesAutoEstimated;
  harvestSelectionMode = savedHarvestState.harvestSelectionMode === "none" && harvestFillKeys.length
    ? "manual"
    : savedHarvestState.harvestSelectionMode;
  harvestProgressState = savedHarvestState.harvestProgressState;
  harvestProgressAvailable = !!savedHarvestState.harvestProgressAvailable;
  harvestProgressBuilding = savedHarvestState.harvestProgressBuilding;
  monitorMemoInputsDirty = !!savedHarvestState.monitorMemoInputsDirty;
  monitorPreviewLayoutPreference = getStoredMonitorPreviewLayoutPreference()
    || normalizeMonitorPreviewLayout(savedHarvestState.monitorPreviewLayoutPreference);
  monitorContentDraftOverride = savedHarvestState.monitorContentDraftOverride;
  monitorContentDraftBaseSignature = savedHarvestState.monitorContentDraftBaseSignature || "";
  recordCasesEdited = !!savedHarvestState.recordCasesEdited;
  recordPlantingSummaryEdited = !!savedHarvestState.recordPlantingSummaryEdited;
  recordAdditionalBuildings = Array.isArray(savedHarvestState.recordAdditionalBuildings)
    ? [...new Set(savedHarvestState.recordAdditionalBuildings.filter(building => BUILDINGS.includes(Number(building))).map(Number))]
    : [];
  recordSelectionMode = savedHarvestState.recordSelectionMode || "harvest";
  recordPlantingCountPreset = normalizePlantingCountPreset(savedHarvestState.recordPlantingCountPreset);
  recordPlantingCountsByPallet = normalizePlantingCountsByPallet(
    savedHarvestState.recordPlantingCountsByPallet,
    savedHarvestState.harvestFillKeys
  );
  recordPlantingFlowEnabled = savedHarvestState.recordPlantingFlowEnabled === true;
  recordPlantingFlowStage = savedHarvestState.recordPlantingFlowStage || "building";
  recordPlantingFlowBuilding = savedHarvestState.recordPlantingFlowBuilding;
  recordPlantingCompletedBuildings = savedHarvestState.recordPlantingCompletedBuildings || [];
  recordPlantingQualityPreset = savedHarvestState.recordPlantingQualityPreset || "medium";
  activePlantingRecordId = savedHarvestState.activePlantingRecordId;
  editingPlantingEventId = savedHarvestState.editingPlantingEventId;
  plantingRecordDraft = savedHarvestState.plantingRecordDraft;
  forecastSelectionState = savedHarvestState.forecastSelectionState;
  workflowMonitorCheckpointSignature = savedHarvestState.workflowMonitorCheckpointSignature || "";
  workflowHarvestRecordingActive = !!savedHarvestState.workflowHarvestRecordingActive;
  workflowPlantingSessionActive = !!savedHarvestState.workflowPlantingSessionActive;
  if(editingPlantingEventId && !getPlantingEventById(editingPlantingEventId)){
    resetInvalidStartupPlantingState();
  }else if(recordSelectionMode === "planting" && (!getActivePlantingRecord() || (!editingPlantingEventId && !workflowPlantingSessionActive))){
    resetInvalidStartupPlantingState();
  }
  casePlacementByBuilding = savedHarvestState.casePlacementByBuilding || {};

  if(!savedHarvestState.casePlacementByBuilding && (savedHarvestState.frontCaseInput !== "" || savedHarvestState.middleCaseInput !== "" || savedHarvestState.backCaseInput !== "")){
    casePlacementByBuilding[String(casePlacementBuilding)] = {
      front: clampNumber(savedHarvestState.frontCaseInput || 0, 0, 999999, 0),
      middle: clampNumber(savedHarvestState.middleCaseInput || 0, 0, 999999, 0),
      back: clampNumber(savedHarvestState.backCaseInput || 0, 0, 999999, 0)
    };
  }

  const casesInput = document.getElementById("casesInput");
  if(casesInput) casesInput.value = savedHarvestState.casesInput;
  updateHarvestCasesAutoEstimatedAppearance();

  renderMonitorMemoInputs(savedHarvestState.monitorMemoItems || normalizeMonitorMemoItems(null, savedHarvestState.monitorMemoInput || ""));

  const recordCasesInput = document.getElementById("recordCasesInput");
  if(recordCasesInput) recordCasesInput.value = savedHarvestState.recordCasesInput;

  const recordActualSeedlingTrayCountInput = document.getElementById("recordActualSeedlingTrayCountInput");
  if(recordActualSeedlingTrayCountInput) recordActualSeedlingTrayCountInput.value = savedHarvestState.recordActualSeedlingTrayCountInput || "";
  setRecordSeedlingCarryoverMode(savedHarvestState.recordActualSeedlingCarryoverMode || "loss", { silent: true });

  const recordSummaryInput = document.getElementById("recordPalletSummaryInput");
  if(recordSummaryInput){
    recordSummaryInput.value = savedHarvestState.recordPalletSummaryInput || formatPalletSummary(harvestFillKeys);
  }

  const recordPlantingSummaryInput = document.getElementById("recordPlantingSummaryInput");
  if(recordPlantingSummaryInput){
    recordPlantingSummaryInput.value = savedHarvestState.recordPlantingSummaryInput || "";
  }

  const recordMemoInput = document.getElementById("recordMemoInput");
  if(recordMemoInput) recordMemoInput.value = savedHarvestState.recordMemoInput || "";

  setSelectedQualityMemo(savedHarvestState.qualityMemo);
  if(harvestFillKeys.length) recalcHarvestSummary();
  else harvestSummary = null;
}

function initializeStartupViews(savedHarvestState){
  const startupHarvestBuilding = getStartupHarvestBuilding();
  casePlacementBuilding = startupHarvestBuilding;
  currentBuilding = startupHarvestBuilding;
  updateBuildingLabel();
  updateCasePlacementBuildingLabel();
  populateCasePlacementInputs();
  refreshRecordModeUi();
  drawBeds();
  renderForecastSummary();
  updateHarvestProgressUi();
  populateMonitorRemoteEditor({
    enabled: false,
    instructionText: buildMonitorInstructionTextFromFields(getCurrentMonitorInstructionFields()),
    memoText: getMonitorMemoTextFromItems(getMonitorMemoInputValues()),
    memoItems: getMonitorMemoInputValues(),
    harvestFillKeys: getHarvestProgressRemainingSelectionKeys()
  });
  setTodayToRecordDate();
  syncDashboardStartDayInputs(dashboardFilter.startDay || getDefaultDashboardStartDay());

  const dashboardCasesGranularityInput = document.getElementById("dashboardCasesGranularityInput");
  const dashboardLossGranularityInput = document.getElementById("dashboardLossGranularityInput");
  if(dashboardCasesGranularityInput) dashboardCasesGranularityInput.value = dashboardFilter.casesGranularity || "month";
  if(dashboardLossGranularityInput) dashboardLossGranularityInput.value = dashboardFilter.lossGranularity || "month";
  const dashboardRecordSearchInput = document.getElementById("dashboardRecordSearchInput");
  const dashboardRecordStartDateInput = document.getElementById("dashboardRecordStartDateInput");
  const dashboardRecordEndDateInput = document.getElementById("dashboardRecordEndDateInput");
  if(dashboardRecordSearchInput) dashboardRecordSearchInput.value = dashboardFilter.recordSearch || "";
  if(dashboardRecordStartDateInput) dashboardRecordStartDateInput.value = dashboardFilter.recordStartDate || "";
  if(dashboardRecordEndDateInput) dashboardRecordEndDateInput.value = dashboardFilter.recordEndDate || "";
  if(!savedHarvestState){
    setSelectedQualityMemo(null);
    renderMonitorMemoInputs();
  }

  updateBuildingLastHarvestInfo();
  renderRecordList();
  updateGoogleSheetResendButtonState();
  updateHeaderLatestRecordDate();
  installAvailabilityChecks();
  syncRecordCasesFromMain(true);
  captureRecordBaseSelection();

  const recordSummaryInput = document.getElementById("recordPalletSummaryInput");
  if(recordSummaryInput){
    recordSummaryInput.value = recordSummaryInput.value || formatPalletSummary(harvestFillKeys);
  }
  syncRecordPlantingSummaryFromSelection();
  updateRecordActualLoss();
  updateRecordActualSeedlingDisplays();
  bindRecordActualSeedlingTrayCountInput();
  bindRecordSeedlingCarryoverModeInputs();
  updateRecordSeedlingCarryoverHint();
}
