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

window.onload = () => {
  try{
  restoreWorkflowBarVisibility();
  installAppTopChromeLayoutSync();
  window.addEventListener("resize", () => {
    if(isMonitorModeOpen) updateMonitorFitScale();
    if(isMonitorPreviewOpen()) updateMonitorPreviewScale();
  });
  document.addEventListener("fullscreenchange", () => {
    if(isMonitorModeOpen) updateMonitorFitScale();
    if(isMonitorPreviewOpen()) updateMonitorPreviewScale();
  });

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
  normalizeRecordsStorageOnce();
  migrateLegacyPlantingEvents();
  syncHarvestPlantingPendingFlags();

  const savedHarvestState = loadHarvestStateFromStorage();
  if(savedHarvestState){
    currentBuilding = savedHarvestState.currentBuilding;
    casePlacementBuilding = savedHarvestState.casePlacementBuilding || savedHarvestState.currentBuilding;
    harvestFillKeys = savedHarvestState.harvestFillKeys;
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
    recordCasesEdited = !!savedHarvestState.recordCasesEdited;
    recordPlantingSummaryEdited = !!savedHarvestState.recordPlantingSummaryEdited;
    recordSelectionMode = savedHarvestState.recordSelectionMode || "harvest";
    activePlantingRecordId = savedHarvestState.activePlantingRecordId;
    editingPlantingEventId = savedHarvestState.editingPlantingEventId;
    plantingRecordDraft = savedHarvestState.plantingRecordDraft;
    forecastSelectionState = savedHarvestState.forecastSelectionState;
    workflowMonitorCheckpointSignature = savedHarvestState.workflowMonitorCheckpointSignature || "";
    workflowHarvestRecordingActive = !!savedHarvestState.workflowHarvestRecordingActive;
    workflowPlantingSessionActive = !!savedHarvestState.workflowPlantingSessionActive;
    if(editingPlantingEventId && !getPlantingEventById(editingPlantingEventId)){
      editingPlantingEventId = null;
      recordSelectionMode = "harvest";
      activePlantingRecordId = null;
      plantingRecordDraft = null;
      workflowPlantingSessionActive = false;
    }else if(recordSelectionMode === "planting" && (!getActivePlantingRecord() || (!editingPlantingEventId && !workflowPlantingSessionActive))){
      recordSelectionMode = "harvest";
      activePlantingRecordId = null;
      plantingRecordDraft = null;
      workflowPlantingSessionActive = false;
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

    if(harvestFillKeys.length){
      recalcHarvestSummary();
    }else{
      harvestSummary = null;
    }
  }

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
  const dashboardStartDayInputs = getDashboardStartDayInputs();
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

  ["recordActualSeedlingTrayCountInput"].forEach(id => {
    const input = document.getElementById(id);
    if(!input) return;
    input.addEventListener("input", () => {
      updateRecordActualSeedlingDisplays();
      updateRecordSeedlingDiffDisplay();
      scheduleHarvestStateSave();
    });
  });

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
    recordMemoInput.addEventListener("input", () => {
      scheduleHarvestStateSave();
    });
  }

  const recordPlantingSummaryInput = document.getElementById("recordPlantingSummaryInput");
  if(recordPlantingSummaryInput){
    recordPlantingSummaryInput.addEventListener("input", () => {
      recordPlantingSummaryEdited = true;
      scheduleHarvestStateSave();
    });
  }

  const startupPlantingRecord = getStartupPlantingRecordToResume(savedHarvestState);
  if(startupPlantingRecord){
    if(editingPlantingEventId){
      enterPlantingRecordMode(startupPlantingRecord);
      switchTab("record");
      showToast("編集中の苗植え記録を再開しました");
    }else{
      resumePlantingRecord(startupPlantingRecord.id, { auto: true, switchToRecordTab: true });
    }
  }

  const mainCasesInput = document.getElementById("casesInput");
  if(mainCasesInput){
    mainCasesInput.addEventListener("input", () => {
      scheduleHarvestStateSave();
    });
  }

  dashboardStartDayInputs.forEach(startDayInput => {
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

  const recordImportInput = document.getElementById("recordImportInput");
  if(recordImportInput){
    recordImportInput.addEventListener("change", (event) => {
      importRecordsFromFile(event.target.files?.[0]);
    });
  }

  document.addEventListener("keydown", (event) => {
    if(event.key !== "Escape") return;
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
    if(isMonitorModeOpen){
      closeMonitorMode();
    }
  });

  document.addEventListener("pointermove", handlePalletDragMove, { passive:false });
  document.addEventListener("pointerup", finishPalletDrag, { passive:false });
  document.addEventListener("pointercancel", finishPalletDrag, { passive:false });
  document.addEventListener("pointerup", finishBedDetailOpenReleaseGuard);
  document.addEventListener("pointercancel", finishBedDetailOpenReleaseGuard);

  const monitorEditorModal = document.getElementById("monitorEditorModal");
  if(monitorEditorModal){
    monitorEditorModal.addEventListener("click", (event) => {
      if(event.target === monitorEditorModal){
        closeMonitorEditorWindow();
      }
    });
  }

  const appMenuModal = document.getElementById("appMenuModal");
  if(appMenuModal){
    appMenuModal.addEventListener("click", (event) => {
      if(event.target === appMenuModal){
        closeAppMenuWindow();
      }
    });
  }

  const monitorPreviewModal = document.getElementById("monitorPreviewModal");
  if(monitorPreviewModal){
    monitorPreviewModal.addEventListener("click", (event) => {
      if(event.target === monitorPreviewModal){
        resolveMonitorPreview(false);
      }
    });
  }

  const dashboardModal = document.getElementById("dashboardModal");
  if(dashboardModal){
    dashboardModal.addEventListener("click", (event) => {
      if(event.target === dashboardModal){
        closeDashboardWindow();
      }
    });
  }

  const syncConflictPanel = document.getElementById("syncConflictPanel");
  if(syncConflictPanel){
    syncConflictPanel.addEventListener("click", (event) => {
      if(event.target === syncConflictPanel) closeSyncConflictPanel();
    });
  }

  const plantingAgeModal = document.getElementById("plantingAgeModal");
  if(plantingAgeModal){
    plantingAgeModal.addEventListener("click", (event) => {
      if(event.target === plantingAgeModal){
        closePlantingAgeWindow();
      }
    });
  }

  const recordDetailModal = document.getElementById("recordDetailModal");
  if(recordDetailModal){
    recordDetailModal.addEventListener("click", (event) => {
      if(event.target === recordDetailModal){
        closeRecordDetailWindow();
      }
    });
    recordDetailModal.addEventListener("keydown", (event) => {
      if(event.key !== "Tab") return;
      event.preventDefault();
      document.getElementById("recordDetailWindowCloseBtn")?.focus({ preventScroll: true });
    });
  }

  const partialHarvestEditModal = document.getElementById("partialHarvestEditModal");
  if(partialHarvestEditModal){
    partialHarvestEditModal.addEventListener("click", (event) => {
      if(event.target === partialHarvestEditModal){
        closePartialHarvestEditWindow();
      }
    });
  }

  const bedDetailModal = document.getElementById("bedDetailModal");
  if(bedDetailModal){
    bedDetailModal.addEventListener("click", (event) => {
      if(event.target === bedDetailModal){
        closeBedDetailWindow();
      }
    });
  }

  const forecastSettingsModal = document.getElementById("forecastSettingsModal");
  if(forecastSettingsModal){
    forecastSettingsModal.addEventListener("click", (event) => {
      if(event.target === forecastSettingsModal){
        closeForecastSettingsWindow();
      }
    });
  }

  saveHarvestStateToStorage();
  refreshProtectedAccessState();
  updateAccessProtectionStatus();
  refreshEmptyInputHighlights();
  updateWorkflowGuide();
  sessionStorage.removeItem("harvestForecastStartupRecovered");
  const appVersionNotice = sessionStorage.getItem("harvestnaviAppUpdatedNotice_v1");
  if(appVersionNotice){
    sessionStorage.removeItem("harvestnaviAppUpdatedNotice_v1");
    showToast(appVersionNotice === "rollback"
      ? "前の安定版に戻しました"
      : "アプリを最新版に更新しました");
  }
  hideWelcomeScreen();
  scheduleWorkflowTitleHintOnce(appVersionNotice ? 3800 : 1800);
  scheduleDashboardPreloadDuringIdle();
  }catch(error){
    console.error(error);
    if(!sessionStorage.getItem("harvestForecastStartupRecovered")){
      sessionStorage.setItem("harvestForecastStartupRecovered", "1");
      clearHarvestStateFromStorage();
      window.location.reload();
      return;
    }
    document.body.innerHTML = `<div style="padding:20px;font-family:sans-serif;line-height:1.7;">
      <h1 style="font-size:20px;">アプリの起動に失敗しました</h1>
      <p>途中保存データを外しても起動できませんでした。記録データは削除していません。</p>
      <pre style="white-space:pre-wrap;background:#f1f5f9;padding:12px;border-radius:8px;">${escapeHtml(error && error.stack ? error.stack : String(error))}</pre>
      <button type="button" onclick="recoverHarvestnaviPreviousVersion(this)" style="width:100%;min-height:48px;border:0;border-radius:12px;background:#334155;color:#fff;font-size:15px;font-weight:800;">前の安定版に戻す</button>
      <div style="margin-top:8px;color:#64748b;font-size:13px;"></div>
    </div>`;
  }
};
