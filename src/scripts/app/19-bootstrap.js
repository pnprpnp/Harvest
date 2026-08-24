function finalizeHarvestnaviStartup(){
  saveHarvestStateToStorage();
  refreshProtectedAccessState();
  updateAccessProtectionStatus();
  refreshEmptyInputHighlights();
  updateWorkflowGuide();
  harvestnaviSessionStorage.removeItem("harvestForecastStartupRecovered");
  const appVersionNotice = harvestnaviSessionStorage.getItem("harvestnaviAppUpdatedNotice_v1");
  if(appVersionNotice){
    harvestnaviSessionStorage.removeItem("harvestnaviAppUpdatedNotice_v1");
    showToast(appVersionNotice === "rollback"
      ? "前の安定版に戻しました"
      : "アプリを最新版に更新しました");
  }
  hideWelcomeScreen();
  scheduleDashboardPreloadDuringIdle();
}

function showHarvestnaviStartupFailure(error){
  console.error(error);
  if(!harvestnaviSessionStorage.getItem("harvestForecastStartupRecovered")){
    harvestnaviSessionStorage.setItem("harvestForecastStartupRecovered", "1");
    clearHarvestStateFromStorage();
    window.location.reload();
    return;
  }
  document.body.innerHTML = `<div style="padding:20px;font-family:sans-serif;line-height:1.7;">
    <h1 style="font-size:20px;">アプリの起動に失敗しました</h1>
    <p>途中保存データを外しても起動できませんでした。記録データは削除していません。</p>
    <pre style="white-space:pre-wrap;background:#f1f5f9;padding:12px;border-radius:8px;">${escapeHtml(error && error.stack ? error.stack : String(error))}</pre>
    <button id="startupRecoveryBtn" type="button" style="width:100%;min-height:48px;border:0;border-radius:12px;background:#334155;color:#fff;font-size:15px;font-weight:800;">前の安定版に戻す</button>
    <div style="margin-top:8px;color:#64748b;font-size:13px;"></div>
  </div>`;
  const recoveryButton = document.getElementById("startupRecoveryBtn");
  recoveryButton?.addEventListener("click", () => recoverHarvestnaviPreviousVersion(recoveryButton));
}

function initializeHarvestnaviApp(){
  try{
    restoreWorkflowBarVisibility();
    installAppTopChromeLayoutSync();
    installStaticUiEventHandlers();
    installCasePlacementBuildingSwipe();
    installStartupViewportEvents();
    installMainTabViewportScrollLock();
    initializeStartupSettingsAndStorage();

    const savedHarvestState = loadHarvestStateFromStorage();
    restoreHarvestStateAtStartup(savedHarvestState);
    initializeWorkflowGuideProgress();
    initializeStartupViews(savedHarvestState);
    installStartupRecordFormEvents();
    resumeStartupPlantingRecord(savedHarvestState);
    installStartupDashboardEvents();
    installStartupImportEvent();
    installStartupGlobalEvents();
    finalizeHarvestnaviStartup();
  }catch(error){
    showHarvestnaviStartupFailure(error);
  }
}

window.addEventListener("load", initializeHarvestnaviApp, { once:true });
