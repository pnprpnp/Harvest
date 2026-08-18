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
    enterPlantingRecordMode(startupPlantingRecord);
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
  document.addEventListener("pointerup", finishBedDetailOpenReleaseGuard);
  document.addEventListener("pointercancel", finishBedDetailOpenReleaseGuard);
  document.getElementById("recordDetailModal")?.addEventListener("keydown", handleRecordDetailFocusTrap);
}
