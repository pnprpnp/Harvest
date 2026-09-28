// Optional settings adoption after backup data has been merged. The default is
// always to retain current settings; old weather/prediction payloads are untouched.
let dashboardGrowthRestoreSettingsController=null;
let dashboardGrowthRestoreSettingsPlan=null;

function resolveDashboardGrowthBackupTargetScope(payload,{role}){
  const source=String(payload.scope || "").match(/:(\d{6}:\d{6}:\d{7})$/);
  const location=normalizeDashboardGrowthLocation(payload.restoration?.location);
  if(!source || location && getDashboardGrowthLocationKey(location)!==source[1]){
    throw new Error("バックアップの元地点を確認できません。現在地点への混入を防ぐため復元を中止しました。");
  }
  return `${role}:${source[1]}`;
}

function getDashboardGrowthRestoreSettingsController(){
  if(!dashboardGrowthRestoreSettingsController) dashboardGrowthRestoreSettingsController=HarvestGrowthRestoreSettings.create({
    storage:harvestnaviLocalStorage,keys:{location:DASHBOARD_GROWTH_LOCATION_KEY,adjustments:DASHBOARD_GROWTH_BUILDING_ADJUSTMENTS_KEY},
    getRole:()=>getActiveRecordsStorageKey(),normalizeLocation:normalizeDashboardGrowthLocation,
    normalizeAdjustments:normalizeDashboardGrowthBuildingAdjustments,ensureSafety:()=>ensureDashboardGrowthSafetySnapshot()
  });
  return dashboardGrowthRestoreSettingsController;
}

function renderDashboardGrowthRestoreSettings(incoming){
  const container=document.getElementById("dashboardGrowthRestoreStatus");
  if(!container) return;
  let plan;
  try{plan=getDashboardGrowthRestoreSettingsController().preview(incoming);}
  catch(error){container.append(document.createTextNode(" 設定の差分を読み込めません。現在の設定は維持されています。"));return;}
  dashboardGrowthRestoreSettingsPlan=plan;
  const section=document.createElement("div");
  const description=document.createElement("p");
  description.textContent="地点と号棟環境補正は個別に選べます。選択しない項目は現在設定を維持します。過去の予報・予測は元地点のまま保存し、書き換えません。";
  section.append(description);
  const addChoice=(id,title,detail,available)=>{
    const line=document.createElement("p"),label=document.createElement("label"),select=document.createElement("select");
    select.id=id;label.htmlFor=id;label.textContent=`${title}：${detail} `;
    [["current","現在の設定を維持"],["incoming","バックアップ側へ変更"]].forEach(([value,text])=>{
      const option=document.createElement("option");option.value=value;option.textContent=text;
      option.disabled=value==="incoming" && !available;select.append(option);
    });
    select.value="current";line.append(label,select);section.append(line);
  };
  addChoice("dashboardGrowthRestoreLocationChoice","地点",
    `${getDashboardGrowthLocationDisplayName(plan.current.location)} → ${getDashboardGrowthLocationDisplayName(plan.incoming.location)}`,
    plan.differences.location);
  const labels={low:"低め",base:"基準",high:"高め"};
  const changes=plan.differences.buildings.map(key=>{
    const before=plan.current.adjustments[key],after=plan.incoming.adjustments[key];
    return `${key}号棟 温度 ${labels[before.temperature]}→${labels[after.temperature]}、日光 ${labels[before.light]}→${labels[after.light]}`;
  });
  addChoice("dashboardGrowthRestoreAdjustmentsChoice","号棟環境補正",changes.join(" / ") || "変更なし",changes.length>0);
  if(plan.warnings.length){const warning=document.createElement("p");warning.textContent=plan.warnings.join(" ");section.append(warning);}
  const button=document.createElement("button");button.type="button";button.className="dashboardInlineBtn";
  button.textContent="選んだ設定を確定";button.addEventListener("click",()=>applyDashboardGrowthRestoredSettings(button));section.append(button);
  const recovery=document.createElement("button");recovery.type="button";recovery.className="dashboardInlineBtn";
  recovery.textContent="設定の安全保存から復旧";recovery.addEventListener("click",recoverDashboardGrowthRestoredSettings);
  if(harvestnaviLocalStorage.getItem(getDashboardGrowthRestoreSettingsController().journalKey(plan.role))) section.append(recovery);
  container.append(section);
}

function invalidateDashboardGrowthRestoredSettings(recalculate=true){
  dashboardGrowthBuildingAdjustmentsCache=null;
  dashboardGrowthForecastHistoryCache=null;
  dashboardGrowthManagementRegistry=null;
  dashboardGrowthRiskEvidenceCache=null;
  dashboardGrowthYieldAnalysisCache=null;
  invalidateDashboardGrowthEvidence();
  syncDashboardGrowthLocationMenu();
  renderDashboardGrowthBuildingAdjustmentMenu();
  if(typeof syncAppMenuSummaries==="function") syncAppMenuSummaries();
  // Existing revision/scope guards discard an in-flight old-site result. Its
  // finally handler starts the new request; the cache checks the location key.
  if(recalculate && activeAppTab==="dashboard" && normalizeDashboardSubtab(dashboardFilter.dashboardSubtab)==="growth") renderDashboardGrowthPrediction({force:true});
}

async function applyDashboardGrowthRestoredSettings(button){
  if(!ensureProtectedOperationAccess("復元した地点・号棟環境補正の採用")) return false;
  const plan=dashboardGrowthRestoreSettingsPlan;
  if(!plan) return false;
  const choices={location:document.getElementById("dashboardGrowthRestoreLocationChoice")?.value || "current",
    adjustments:document.getElementById("dashboardGrowthRestoreAdjustmentsChoice")?.value || "current"};
  if(button) button.disabled=true;
  try{
    const result=await getDashboardGrowthRestoreSettingsController().apply(plan,choices);
    dashboardGrowthRestoreSettingsPlan=null;
    setDashboardGrowthRestoreStatus(result.applied ? "選択した設定を保存しました。今後の予測を現在の地点・補正で再計算します。過去の予測履歴は変更していません。" : "現在の地点・号棟環境補正を維持しました。");
    if(result.applied) invalidateDashboardGrowthRestoredSettings();
    return true;
  }catch(error){
    setDashboardGrowthRestoreStatus(error?.message || "設定を保存できませんでした。");
    renderDashboardGrowthRestoreSettings({incomingLocation:plan.incoming.location,incomingAdjustments:plan.incoming.adjustments});
    // A partial write may have survived a storage failure. Never render stale
    // cached settings while waiting for an explicit recovery attempt.
    invalidateDashboardGrowthRestoredSettings(error?.rollbackSucceeded!==false);
    return false;
  }finally{if(button) button.disabled=false;}
}

function recoverDashboardGrowthRestoredSettings(){
  if(!ensureProtectedOperationAccess("地点・号棟環境補正の復旧")) return false;
  try{
    const result=getDashboardGrowthRestoreSettingsController().recover();
    dashboardGrowthRestoreSettingsPlan=null;
    setDashboardGrowthRestoreStatus(result.recovered ? "設定を変更前へ復旧しました。過去の予測履歴は変更していません。" : "設定の安全保存を確認しました。復旧が必要な変更はありません。");
    invalidateDashboardGrowthRestoredSettings();return true;
  }catch(error){showDashboardGrowthPendingSettingsRecovery(error?.message || "別の変更があるため設定の復旧を止めました。");return false;}
}

function showDashboardGrowthPendingSettingsRecovery(message="前回の設定復元が途中で止まっています。現在設定を確認し、復旧方法を選んでください。"){
  const controller=getDashboardGrowthRestoreSettingsController();
  if(!harvestnaviLocalStorage.getItem(controller.journalKey(getActiveRecordsStorageKey()))) return false;
  setDashboardGrowthRestoreStatus(message);
  const container=document.getElementById("dashboardGrowthRestoreStatus");
  if(!container) return false;
  const current=document.createElement("p");
  const labels={low:"低め",base:"基準",high:"高め"};
  // Read persisted values directly, because a previous interrupted write may
  // have changed them without updating the in-memory menu cache.
  const retained=controller.preview();
  current.textContent=`現在の地点：${getDashboardGrowthLocationDisplayName(retained.current.location)}。 `
    + Object.entries(retained.current.adjustments).map(([key,value])=>`${key}号棟 温度${labels[value.temperature]}・日光${labels[value.light]}`).join(" / ");
  container.append(current);
  const recovery=document.createElement("button");recovery.type="button";recovery.className="dashboardInlineBtn";
  recovery.textContent="変更前の設定へ復旧";recovery.addEventListener("click",recoverDashboardGrowthRestoredSettings);container.append(recovery);
  const keep=document.createElement("button");keep.type="button";keep.className="dashboardInlineBtn";
  keep.textContent="表示中の現在設定を維持して終了";
  keep.addEventListener("click",()=>{
    if(!ensureProtectedOperationAccess("設定復旧時の現在設定の維持")) return;
    try{
      controller.keepCurrent({explicit:true,role:retained.role,before:retained.before});dashboardGrowthRestoreSettingsPlan=null;
      setDashboardGrowthRestoreStatus("現在の地点・号棟環境補正を維持して復旧確認を終了しました。");
      invalidateDashboardGrowthRestoredSettings();
    }catch(error){setDashboardGrowthRestoreStatus(error?.message || "復旧確認を終了できませんでした。");}
  });
  container.append(keep);return true;
}
