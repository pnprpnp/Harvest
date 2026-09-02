function installStartupViewportEvents(){
  window.addEventListener("resize", () => {
    if(isMonitorModeOpen) updateMonitorFitScale();
    if(isMonitorPreviewOpen()) updateMonitorPreviewScale();
  });
  document.addEventListener("fullscreenchange", () => {
    if(isMonitorModeOpen) updateMonitorFitScale();
    if(isMonitorPreviewOpen()) updateMonitorPreviewScale();
  });
}

let casePlacementBuildingSwipeInstalled = false;
let harvestProgressBuildingSwipeInstalled = false;
let recordHarvestBuildingSwipeInstalled = false;
const CASE_PLACEMENT_BUILDING_SWIPE_THRESHOLD_PX = 32;
const CASE_PLACEMENT_BUILDING_SWIPE_DIRECTION_RATIO = 1.15;

function installSimulationBuildingPagerSwipe(pagerId, shiftBuilding){
  const pager = document.getElementById(pagerId);
  if(!pager || typeof shiftBuilding !== "function") return false;
  let swipeState = null;
  let suppressClickUntil = 0;

  const clearSwipeState = pointerId => {
    const state = swipeState;
    if(!state || (pointerId !== undefined && state.pointerId !== pointerId)) return null;
    swipeState = null;
    try{
      if(pager.hasPointerCapture?.(state.pointerId)) pager.releasePointerCapture(state.pointerId);
    }catch(_error){
      // Pointer capture may already be released after a browser-handled vertical scroll.
    }
    return state;
  };

  pager.addEventListener("pointerdown", event => {
    if(event.pointerType === "mouse" && event.button !== 0) return;
    swipeState = {
      pointerId:event.pointerId,
      startX:event.clientX,
      startY:event.clientY
    };
    try{
      pager.setPointerCapture?.(event.pointerId);
    }catch(_error){
      // Swiping still works when pointer capture is unavailable.
    }
  });

  pager.addEventListener("pointerup", event => {
    const state = clearSwipeState(event.pointerId);
    if(!state) return;
    const deltaX = event.clientX - state.startX;
    const deltaY = event.clientY - state.startY;
    const horizontalDistance = Math.abs(deltaX);
    if(horizontalDistance < CASE_PLACEMENT_BUILDING_SWIPE_THRESHOLD_PX
      || horizontalDistance <= Math.abs(deltaY) * CASE_PLACEMENT_BUILDING_SWIPE_DIRECTION_RATIO){
      return;
    }
    suppressClickUntil = performance.now() + 450;
    event.preventDefault();
    shiftBuilding(deltaX < 0 ? 1 : -1);
  });

  pager.addEventListener("pointercancel", event => {
    clearSwipeState(event.pointerId);
  });

  pager.addEventListener("click", event => {
    if(performance.now() > suppressClickUntil) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  return true;
}

function installCasePlacementBuildingSwipe(){
  if(!casePlacementBuildingSwipeInstalled){
    casePlacementBuildingSwipeInstalled = installSimulationBuildingPagerSwipe(
      "casePlacementBuildingPager",
      direction => shiftCasePlacementBuilding(direction)
    );
  }
  if(!harvestProgressBuildingSwipeInstalled){
    harvestProgressBuildingSwipeInstalled = installSimulationBuildingPagerSwipe(
      "harvestProgressBuildingPager",
      direction => shiftHarvestProgressBuilding(direction)
    );
  }
  if(!recordHarvestBuildingSwipeInstalled){
    recordHarvestBuildingSwipeInstalled = installSimulationBuildingPagerSwipe(
      "recordHarvestBuildingPager",
      direction => shiftRecordHarvestBuilding(direction)
    );
  }
}

function installStartupRecordFormEvents(){
  const recordDateInput = document.getElementById("recordDateInput");
  if(recordDateInput){
    recordDateInput.addEventListener("input", () => handleRecordDateUpdate(false));
    recordDateInput.addEventListener("change", () => handleRecordDateUpdate(true));
  }

  const recordCasesInput = document.getElementById("recordCasesInput");
  if(recordCasesInput){
    recordCasesInput.addEventListener("input", () => {
      recordCasesEdited = true;
      updateRecordActualLoss();
      updateRecordInputGuides();
      scheduleHarvestStateSave();
    });
  }

  const recordActualSeedlingTrayCountInput = document.getElementById("recordActualSeedlingTrayCountInput");
  if(recordActualSeedlingTrayCountInput){
    recordActualSeedlingTrayCountInput.addEventListener("input", () => {
      updateRecordActualSeedlingDisplays();
      updateRecordSeedlingDiffDisplay();
      scheduleHarvestStateSave();
    });
  }

  document.querySelectorAll('input[name="qualityMemoTag"]').forEach(input => {
    input.addEventListener("change", () => {
      updateQualityMemoOtherVisibility();
      updateRecordInputGuides();
      saveHarvestStateToStorage();
    });
  });

  const qualityMemoOtherInput = document.getElementById("qualityMemoOtherInput");
  if(qualityMemoOtherInput){
    qualityMemoOtherInput.addEventListener("input", () => {
      updateRecordInputGuides();
      scheduleHarvestStateSave();
    });
  }

  const recordMemoInput = document.getElementById("recordMemoInput");
  if(recordMemoInput){
    recordMemoInput.addEventListener("input", scheduleHarvestStateSave);
  }

  const recordPlantingSummaryInput = document.getElementById("recordPlantingSummaryInput");
  if(recordPlantingSummaryInput){
    recordPlantingSummaryInput.addEventListener("input", () => {
      recordPlantingSummaryEdited = true;
      scheduleHarvestStateSave();
    });
  }

  const mainCasesInput = document.getElementById("casesInput");
  if(mainCasesInput){
    mainCasesInput.addEventListener("input", scheduleHarvestStateSave);
  }
}

function resumeStartupPlantingRecord(savedHarvestState){
  const startupPlantingRecord = getStartupPlantingRecordToResume(savedHarvestState);
  if(!startupPlantingRecord) return;
  if(editingPlantingEventId){
    enterPlantingRecordMode(startupPlantingRecord, { resumeFlow: true });
    switchTab("record");
    showToast("編集中の苗植え記録を再開しました");
  }else{
    resumePlantingRecord(startupPlantingRecord.id, { auto: true, switchToRecordTab: true });
  }
}

function installStartupDashboardEvents(){
  getDashboardStartDayInputs().forEach(startDayInput => {
    const handleDashboardInput = () => {
      const nextDay = clampNumber(startDayInput.value, 1, 31, getDefaultDashboardStartDay());
      if(dashboardFilter.startDay === nextDay){
        syncDashboardStartDayInputs(nextDay);
        return;
      }
      dashboardFilter.startDay = nextDay;
      syncDashboardStartDayInputs(nextDay);
      saveDashboardFilter();
      renderDashboard();
    };
    startDayInput.addEventListener("input", handleDashboardInput);
    startDayInput.addEventListener("change", handleDashboardInput);
  });

  [
    ["dashboardCasesGranularityInput", "casesGranularity"],
    ["dashboardLossGranularityInput", "lossGranularity"]
  ].forEach(([id, key]) => {
    const input = document.getElementById(id);
    if(!input) return;
    input.addEventListener("change", () => {
      dashboardFilter[key] = ["month", "year"].includes(input.value) ? input.value : "month";
      saveDashboardFilter();
      renderDashboard();
    });
  });

  const dashboardRecordSearchInput = document.getElementById("dashboardRecordSearchInput");
  if(dashboardRecordSearchInput){
    const updateDashboardRecordSearch = () => {
      dashboardFilter.recordSearch = String(dashboardRecordSearchInput.value || "").trim();
    };
    dashboardRecordSearchInput.addEventListener("input", event => {
      if(event.isComposing) return;
      updateDashboardRecordSearch();
      scheduleDashboardRecordFilterRefresh();
    });
    dashboardRecordSearchInput.addEventListener("compositionend", () => {
      updateDashboardRecordSearch();
      scheduleDashboardRecordFilterRefresh();
    });
    dashboardRecordSearchInput.addEventListener("change", () => {
      updateDashboardRecordSearch();
      runDashboardRecordFilterRefresh();
    });
  }

  [
    ["dashboardRecordStartDateInput", "recordStartDate"],
    ["dashboardRecordEndDateInput", "recordEndDate"]
  ].forEach(([id, key]) => {
    const input = document.getElementById(id);
    if(!input) return;
    input.addEventListener("input", () => {
      dashboardFilter[key] = input.value || "";
      scheduleDashboardRecordFilterRefresh();
    });
    input.addEventListener("change", () => {
      dashboardFilter[key] = input.value || "";
      runDashboardRecordFilterRefresh();
    });
  });
}

function installStartupImportEvent(){
  const recordImportInput = document.getElementById("recordImportInput");
  if(!recordImportInput) return;
  recordImportInput.addEventListener("change", event => {
    importRecordsFromFile(event.target.files?.[0]);
  });
}

function handleStartupEscapeKey(event){
  if(event.key !== "Escape") return;
  if(dashboardSeedlingStatusDetailOpen){
    closeDashboardSeedlingStatusDetail();
    return;
  }
  const syncConflictPanel = document.getElementById("syncConflictPanel");
  if(syncConflictPanel?.classList.contains("show")){
    closeSyncConflictPanel();
    return;
  }
  const plantingUnselectedWarningPanel = document.getElementById("plantingUnselectedWarningPanel");
  if(plantingUnselectedWarningPanel?.classList.contains("show")){
    resolvePlantingUnselectedWarning(false);
    return;
  }
  const recordSeedlingReselectConfirmPanel = document.getElementById("recordSeedlingReselectConfirmPanel");
  if(recordSeedlingReselectConfirmPanel?.classList.contains("show")){
    resolveRecordSeedlingReselectConfirm(false);
    return;
  }
  const appUpdateConfirmPanel = document.getElementById("appUpdateConfirmPanel");
  if(appUpdateConfirmPanel?.classList.contains("show")){
    resolveAppUpdateConfirm(false);
    return;
  }
  const recordDetailModal = document.getElementById("recordDetailModal");
  if(recordDetailModal?.classList.contains("show")){
    closeRecordDetailWindow();
    return;
  }
  const partialHarvestEditModal = document.getElementById("partialHarvestEditModal");
  if(partialHarvestEditModal?.classList.contains("show")){
    closePartialHarvestEditWindow();
    return;
  }
  const harvestPartialSplitModal = document.getElementById("harvestPartialSplitModal");
  if(harvestPartialSplitModal?.classList.contains("show")){
    closeHarvestPartialSplitWindow();
    return;
  }
  const appMenuModal = document.getElementById("appMenuModal");
  if(appMenuModal?.classList.contains("show")){
    closeAppMenuWindow();
    return;
  }
  const forecastSettingsModal = document.getElementById("forecastSettingsModal");
  if(forecastSettingsModal?.classList.contains("show")){
    closeForecastSettingsWindow();
    return;
  }
  const plantingAgeModal = document.getElementById("plantingAgeModal");
  if(plantingAgeModal?.classList.contains("show")){
    closePlantingAgeWindow();
    return;
  }
  const harvestProgressModal = document.getElementById("harvestProgressModal");
  if(harvestProgressModal?.classList.contains("show")){
    closeHarvestProgressWindow();
    return;
  }
  const seedlingHouseModal = document.getElementById("seedlingHouseModal");
  if(seedlingHouseModal?.classList.contains("show")){
    const primaryDetail = document.getElementById("seedlingHousePrimaryDetail");
    if(primaryDetail && !primaryDetail.hidden){
      closeSeedlingHousePrimaryDetail();
      return;
    }
    closeSeedlingHouseWindow();
    return;
  }
  const bedDetailModal = document.getElementById("bedDetailModal");
  if(bedDetailModal?.classList.contains("show")){
    closeBedDetailWindow();
    return;
  }
  if(isMonitorPreviewOpen()){
    resolveMonitorPreview(false);
    return;
  }
  const dashboardCalendarInfoModal = document.getElementById("dashboardCalendarInfoModal");
  if(dashboardCalendarInfoModal?.classList.contains("show")){
    closeDashboardCalendarInfoWindow();
    return;
  }
  const dashboardModal = document.getElementById("dashboardModal");
  if(dashboardModal?.classList.contains("show")){
    closeDashboardWindow();
    return;
  }
  const editorModal = document.getElementById("monitorEditorModal");
  if(editorModal?.classList.contains("show")){
    closeMonitorEditorWindow();
    return;
  }
  if(isMonitorModeOpen) closeMonitorMode();
}

function handleRecordDetailFocusTrap(event){
  if(event.key !== "Tab") return;
  event.preventDefault();
  document.getElementById("recordDetailWindowCloseBtn")?.focus({ preventScroll: true });
}

function installStartupGlobalEvents(){
  document.addEventListener("keydown", handleStartupEscapeKey);
  window.addEventListener("resize", () => {
    if(dashboardSeedlingStatusDetailOpen){
      scheduleDashboardSeedlingStatusDetailPosition({ ensureBedVisible: true });
    }
    if(seedlingHouseSelectedBed) positionSeedlingHousePrimaryDetail();
  });
  window.addEventListener("scroll", () => {
    if(dashboardSeedlingStatusDetailOpen){
      scheduleDashboardSeedlingStatusDetailPosition();
    }
    if(seedlingHouseSelectedBed) positionSeedlingHousePrimaryDetail();
  }, { passive: true, capture: true });
  document.addEventListener("pointermove", handlePalletDragMove, { passive:false });
  document.addEventListener("pointerup", finishPalletDrag, { passive:false });
  document.addEventListener("pointercancel", finishPalletDrag, { passive:false });
  document.getElementById("recordDetailModal")?.addEventListener("keydown", handleRecordDetailFocusTrap);
}
