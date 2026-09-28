// Production wiring for frozen models. UI controls can call these narrow actions.
let dashboardGrowthManagementRegistry = null;
let dashboardGrowthRiskEvidenceCache = null;
let dashboardGrowthBackupController = null;
let dashboardGrowthYieldAnalysisCache = null;
let dashboardGrowthSafetyArchive = null;
const dashboardGrowthFrozenYieldCache = new Map();

// Reconcile inputs once per record revision. Production quantity coefficients
// always come from the selected immutable generation, never a live refit.
function getDashboardGrowthYieldAnalysis(asOf=getDashboardGrowthAsOf()){
  const key=`${getDashboardGrowthHistoryScope()}:${dashboardGrowthDataRevision}:${HarvestGrowthObservations.revision()}:${arguments.length ? asOf : asOf.slice(0,10)}`;
  if(dashboardGrowthYieldAnalysisCache?.key!==key){
    const observations=HarvestGrowthObservations.list();
    const dataset=HarvestGrowthYield.buildDataset({records,plantingEvents,asOf,evidence:HarvestGrowthEvidence,observations});
    dashboardGrowthYieldAnalysisCache={key,asOf,dataset,observations,validation:null};
  }
  return dashboardGrowthYieldAnalysisCache;
}

function getDashboardGrowthFrozenYieldModel(modelVersion){
  const scope=getDashboardGrowthHistoryScope();
  const cacheKey=modelVersion ? `${scope}:${modelVersion}` : null;
  if(cacheKey && dashboardGrowthFrozenYieldCache.has(cacheKey)) return dashboardGrowthFrozenYieldCache.get(cacheKey);
  let resolvedVersion=modelVersion||null;
  try{
    const registry=getDashboardGrowthLearningRegistry();
    const snapshot=modelVersion ? registry.getGeneration(modelVersion)?.modelSnapshot : registry.getActiveSnapshot();
    resolvedVersion=snapshot?.modelVersion||resolvedVersion;
    const key=resolvedVersion ? `${scope}:${resolvedVersion}` : null;
    if(key && dashboardGrowthFrozenYieldCache.has(key)) return dashboardGrowthFrozenYieldCache.get(key);
    if(snapshot?.coefficients?.yield){
      const fitted={...HarvestGrowthYield.hydrateModel(snapshot.coefficients.yield,{asOf:getDashboardGrowthAsOf()}),modelVersion:snapshot.modelVersion,frozen:true};
      dashboardGrowthFrozenYieldCache.set(key,fitted);
      while(dashboardGrowthFrozenYieldCache.size>6) dashboardGrowthFrozenYieldCache.delete(dashboardGrowthFrozenYieldCache.keys().next().value);
      return fitted;
    }
  }catch(error){
    return {schemaVersion:1,model:{schemaVersion:1,rows:[]},frozen:false,modelVersion:resolvedVersion,
      trainedAsOf:null,referenceReason:"ケース数モデルを復元できないため参考値"};
  }
  return {schemaVersion:1,model:{schemaVersion:1,rows:[]},frozen:false,modelVersion:resolvedVersion,
    trainedAsOf:null,referenceReason:"このモデル世代にはケース数係数がないため参考値"};
}

function getDashboardGrowthYieldPrediction(palletKeys,plantingEventId,modelVersion,asOf){
  const {dataset}=asOf ? getDashboardGrowthYieldAnalysis(asOf) : getDashboardGrowthYieldAnalysis(),fitted=getDashboardGrowthFrozenYieldModel(modelVersion);
  const result=HarvestGrowthYield.predict({planner:HarvestGrowthPlanner,model:fitted.model,dataset,palletKeys,plantingEventId});
  return {...result,modelVersion:fitted.modelVersion,yieldTrainedAsOf:fitted.trainedAsOf,
    frozen:fitted.frozen,reference:!fitted.frozen || result.reference,referenceReason:fitted.referenceReason||null};
}

function inspectDashboardGrowthYield(){
  const analysis=getDashboardGrowthYieldAnalysis();
  if(!analysis.validation) analysis.validation=HarvestGrowthYield.backtest({planner:HarvestGrowthPlanner,
    records,plantingEvents,asOf:analysis.asOf,evidence:HarvestGrowthEvidence,observations:analysis.observations,maxFolds:24});
  return analysis.validation;
}

function getDashboardGrowthBackupController(){
  if(!dashboardGrowthBackupController) dashboardGrowthBackupController=HarvestGrowthBackup.create({
    storage:harvestnaviLocalStorage,history:HarvestGrowthHistory,
    observationFactory:options=>HarvestGrowthObservations.create(options),modelFactory:options=>HarvestGrowthManagement.create(options),
    getScope:()=>getDashboardGrowthHistoryScope(),getRole:()=>getActiveRecordsStorageKey(),
    resolveTargetScope:resolveDashboardGrowthBackupTargetScope,
    ensureSafety:()=>ensureDashboardGrowthSafetySnapshot(),
    invalidate:()=>{HarvestGrowthObservations.resetCache();getDashboardGrowthLearningRegistry().invalidate();
      dashboardGrowthForecastHistoryCache=null;invalidateDashboardGrowthEvidence();}
  });
  return dashboardGrowthBackupController;
}

async function restoreDashboardGrowthBackup(payload){
  if(!ensureProtectedOperationAccess("生育予測のバックアップ復元")) return null;
  return await getDashboardGrowthBackupController().restore(payload);
}

function recoverDashboardGrowthBackup(){
  if(!ensureProtectedOperationAccess("生育予測の復元処理の復旧")) return null;
  return getDashboardGrowthBackupController().recover();
}

function getDashboardGrowthSafetyArchive(){
  if(!dashboardGrowthSafetyArchive) dashboardGrowthSafetyArchive=HarvestGrowthSafety.createArchive({
    storage:harvestnaviLocalStorage,archive:HarvestGrowthSafetyStorage.create()
  });
  return dashboardGrowthSafetyArchive;
}

async function ensureDashboardGrowthSafetySnapshot(){
  const scope=getActiveRecordsStorageKey(),revision=dashboardGrowthDataRevision;
  const result=await getDashboardGrowthSafetyArchive().ensureSnapshot(scope,{
    records:scope,plantingEvents:getActivePlantingEventsStorageKey(),settings:SETTINGS_KEY,
    extra:[DASHBOARD_GROWTH_BUILDING_ADJUSTMENTS_KEY,DASHBOARD_GROWTH_LOCATION_KEY]
  },()=>({records,plantingEvents,settings}));
  if(scope!==getActiveRecordsStorageKey() || revision!==dashboardGrowthDataRevision){
    throw new Error("安全保存中に利用者または記録が更新されました。もう一度操作してください");
  }
  return result;
}

function getDashboardGrowthLearningRegistry(){
  if(!dashboardGrowthManagementRegistry) dashboardGrowthManagementRegistry = HarvestGrowthManagement.create({
    storage:harvestnaviLocalStorage,getRole:()=>getDashboardGrowthHistoryScope()
  });
  return dashboardGrowthManagementRegistry;
}

async function getDashboardGrowthEvidenceSignature(samples,asOf=getDashboardGrowthAsOf()){
  // Weather acquisition times are deliberately absent: refresh is inference.
  // Field opinions, EC metadata and manual display offsets are not teachers.
  const trainingSamples=HarvestGrowthModel.normalizeSamples(samples,asOf).samples
    .map(({growthEvidence,...sample})=>sample);
  const evidence = JSON.stringify({samples:trainingSamples,
    adjustments:getDashboardGrowthBuildingAdjustments(),
    // Quantity-only edits and completed crops without size labels must also
    // invalidate evaluation. The observation comments/offsets remain excluded.
    yield:typeof HarvestGrowthYield === "undefined" ? null : (()=>{
      const dataset=getDashboardGrowthYieldAnalysis(asOf).dataset;
      return {training:dataset.yieldRows,outcomes:dataset.harvestRows.map(row=>({id:row.id,cropId:row.cropId,date:row.date,
        availableAt:row.availableAt,palletKeys:row.palletKeys,cases:row.cases,evaluable:row.evaluable,input:row.input}))};
    })()});
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(evidence));
  return [...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,"0")).join("");
}

function getDashboardGrowthEngineSamples(source,asOf){
  const samples=source.samples.map(sample=>({...sample,
    plantingDate:formatDateOnlyString(sample.plantingDate),date:formatDateOnlyString(sample.date),
    manualAdjustment:getDashboardGrowthBuildingAdjustment(sample.building)}));
  return HarvestGrowthEvidence.annotate(samples,HarvestGrowthObservations.list(),{asOf});
}

function getDashboardGrowthObservationsByBuilding(){
  const result=new Map();
  HarvestGrowthObservations.list().forEach(row=>{
    const buildings=row.building ? [Number(row.building)]
      : [...new Set((row.palletKeys || []).map(key=>Number(key.split("-")[0])))];
    buildings.forEach(building=>{if(!result.has(building)) result.set(building,[]);result.get(building).push(row);});
  });
  return result;
}

function getDashboardGrowthObservationScopes(byBuilding){
  const idsByPallet=new Map();
  byBuilding.forEach(rows=>rows.forEach(row=>{
    if(row.kind==="ready") return;
    (row.palletKeys || []).forEach(key=>{
      if(!idsByPallet.has(key)) idsByPallet.set(key,new Set());
      idsByPallet.get(key).add(row.observationId);
    });
  }));
  return new Map([...idsByPallet].map(([key,ids])=>[key,[...ids].sort().join(",")]));
}

function getDashboardGrowthFrozenRiskFit(options,modelVersion){
  try{
    const registry=getDashboardGrowthLearningRegistry();
    const snapshot=modelVersion ? registry.getGeneration(modelVersion)?.modelSnapshot : registry.getActiveSnapshot();
    if(snapshot?.coefficients?.quality) return HarvestGrowthRisk.hydrateModel(snapshot.coefficients.quality,options);
  }catch(error){ /* A corrupt/missing quality generation is a reference prior. */ }
  return HarvestGrowthRisk.fit([],options);
}

async function prepareDashboardGrowthLearning(samples,options,isCurrent){
  const scope=getDashboardGrowthHistoryScope();
  const controller=HarvestGrowthLearning.create({engine:HarvestGrowthModel,registry:getDashboardGrowthLearningRegistry(),
    evaluate:runDashboardGrowthEvaluation,isCurrent,
    evaluateGenerations:options=>HarvestGrowthGenerationEvaluation.compareFrozen({engine:HarvestGrowthModel,
      riskEngine:HarvestGrowthRisk,score:HarvestGrowthLearning.score,...options}),
    fitAuxiliary:(rows,fitOptions)=>HarvestGrowthRisk.exportModel(HarvestGrowthRisk.fit(rows,fitOptions)),
    hydrateAuxiliary:(snapshot,inferenceOptions)=>snapshot ? HarvestGrowthRisk.hydrateModel(snapshot,inferenceOptions)
      : HarvestGrowthRisk.fit([],inferenceOptions),
    fitYieldAuxiliary:typeof HarvestGrowthYield === "undefined" ? undefined : fitOptions=>HarvestGrowthYield.exportModel({
      planner:HarvestGrowthPlanner,dataset:getDashboardGrowthYieldAnalysis(fitOptions.asOf).dataset,asOf:fitOptions.asOf}),
    evaluateYield:typeof HarvestGrowthYield === "undefined" ? undefined : evaluationOptions=>{
      const input={...evaluationOptions,planner:HarvestGrowthPlanner,records,plantingEvents,
        evidence:HarvestGrowthEvidence,observations:HarvestGrowthObservations.list()};
      const frozen=HarvestGrowthYield.compareFrozen(input),prospective=HarvestGrowthYield.compareSaved(input);
      const blocking=frozen.gate.blocking || prospective.gate.blocking;
      const gate=blocking ? {...(frozen.gate.blocking ? frozen.gate : prospective.gate),blocking:true,accepted:false}
        : frozen.gate.reason!=="insufficientYieldEvidence" ? frozen.gate : prospective.gate;
      // Persist summaries only; raw paired rows are reproducible diagnostic data.
      const summarize=({activeRows,candidateRows,...summary})=>summary;
      return {frozen:summarize(frozen),prospective:summarize(prospective),gate,priority:"after-readiness-quality-and-size"};
    },
    readPredictions:()=>HarvestGrowthHistory.list(scope,"prediction"),
    version:()=>`growth-${Date.now()}-${crypto.randomUUID().slice(0,8)}`});
  try{ return await controller.prepare({...options,samples}); }
  catch(error){
    if(!isCurrent()) return null;
    let fit;
    try{ fit=getDashboardGrowthFrozenFit(options); }
    catch(registryError){ fit=HarvestGrowthModel.fit([],{...options,selectedMethod:"legacy",validation:{methods:{},rows:{},selection:{},limitations:[]}}); }
    return {fit,shadowFit:null,riskFit:getDashboardGrowthFrozenRiskFit(options,fit.modelVersion || "legacy-prior-fallback"),
      modelVersion:fit.modelVersion || "legacy-prior-fallback",shadowModelVersion:null,
      validation:fit.validation,runtime:{fallback:true,label:"候補評価または保存に失敗したため、保存済みモデル・旧方式で予測しています",error:String(error.message || error)}};
  }
}

function getDashboardGrowthFrozenFit(options){
  const registry=getDashboardGrowthLearningRegistry();
  if(registry.getActiveSnapshot()){
    const runtime=registry.runWithFallback(snapshot=>HarvestGrowthModel.hydrateModel(snapshot,options));
    if(!runtime.value) throw new Error("保存済みのモデルを復元できません");
    return runtime.value;
  }
  // Startup/registry failures may use the prior only. No weather-triggered fit
  // of farm data and no silent model adoption is permitted on this path.
  return HarvestGrowthModel.fit([],{...options,selectedMethod:"legacy",validation:{methods:{},rows:{},selection:{},limitations:[]}});
}

function getDashboardGrowthCachedRiskFit(samples,options){
  const key=`${getDashboardGrowthHistoryScope()}:${options.dataSignature || dashboardGrowthDataRevision}`;
  if(dashboardGrowthRiskEvidenceCache?.key !== key){
    dashboardGrowthRiskEvidenceCache={key,fit:HarvestGrowthRisk.fit(samples,options)};
  }
  return dashboardGrowthRiskEvidenceCache.fit;
}

async function adoptDashboardGrowthCandidate(modelVersion){
  if(!ensureProtectedOperationAccess("生育予測モデルの採用")) return false;
  const scope=getDashboardGrowthHistoryScope(),registry=getDashboardGrowthLearningRegistry();
  const source=getDashboardGrowthSourceState();
  const samples=getDashboardGrowthEngineSamples(source,getDashboardGrowthAsOf());
  const dataSignature=await getDashboardGrowthEvidenceSignature(samples);
  if(scope !== getDashboardGrowthHistoryScope()) return false;
  const state=registry.getState(),generation=registry.getGeneration(modelVersion);
  if(!generation?.eligible || state.candidateId !== modelVersion || generation.settings?.comparedWith !== state.activeId
    || generation.evaluationSignature !== dataSignature || state.evaluation.dataSignature !== dataSignature
    || !state.evaluation.summary?.prospective?.gate?.accepted
    || !state.evaluation.summary?.generations?.gate?.accepted
    || state.evaluation.summary?.yield?.gate?.blocking === true
    || (generation.modelSnapshot.method !== registry.getActiveSnapshot()?.method
      && !state.evaluation.summary?.validation?.selection?.gates?.[generation.modelSnapshot.method]?.accepted)){
    showToast("現在の採用モデルに対する検証条件を満たしていません"); return false;
  }
  registry.adopt(modelVersion,{explicit:true});
  dashboardGrowthPredictionModelCache=null; dashboardRenderedSubtabs.delete("growth");
  renderDashboardGrowthPrediction(); return true;
}

function rollbackDashboardGrowthModel(modelVersion){
  if(!ensureProtectedOperationAccess("生育予測モデルを以前の版へ戻す操作")) return false;
  getDashboardGrowthLearningRegistry().rollback(modelVersion,{explicit:true});
  dashboardGrowthPredictionModelCache=null; dashboardRenderedSubtabs.delete("growth");
  renderDashboardGrowthPrediction(); return true;
}

async function confirmDashboardGrowthCandidate(modelVersion){
  if(!window.confirm("検証済みの候補モデルを生育予測に採用しますか？ 採用後も以前の版へ戻せます。")) return false;
  try{return await adoptDashboardGrowthCandidate(modelVersion);}
  catch(error){showToast(error?.message || "候補モデルを採用できませんでした");return false;}
}

function confirmDashboardGrowthRollback(modelVersion){
  if(!window.confirm("生育予測を、この以前のモデル版へ戻しますか？ 予測履歴は削除されません。")) return false;
  try{return rollbackDashboardGrowthModel(modelVersion);}
  catch(error){showToast(error?.message || "以前のモデルへ戻せませんでした");return false;}
}

function resolveDashboardGrowthActiveConflict(index,choice){
  if(!ensureProtectedOperationAccess("復元した生育予測モデルの選択")) return false;
  const keepLocal=choice==="local";
  if(!window.confirm(keepLocal ? "現在使用中のモデルを維持しますか？" : "バックアップ側のモデルを使用しますか？")) return false;
  try{
    getDashboardGrowthLearningRegistry().resolveActiveConflict(index,{explicit:true,keepLocal});
    dashboardGrowthPredictionModelCache=null;dashboardRenderedSubtabs.delete("growth");renderDashboardGrowthPrediction();return true;
  }catch(error){showToast(error?.message || "モデルの選択を確定できませんでした");return false;}
}

function showDashboardGrowthPlanningQuantity(){
  dashboardGrowthPlanningShowsQuantity=true;
  if(dashboardGrowthPredictionModelCache) renderDashboardGrowthPlanning(dashboardGrowthPredictionModelCache);
}

function openDashboardGrowthBackupRestorePicker(){
  if(showDashboardGrowthPendingSettingsRecovery()) return;
  document.getElementById("dashboardGrowthBackupRestoreFile")?.click();
}

function setDashboardGrowthRestoreStatus(message,recovery=false){
  const container=document.getElementById("dashboardGrowthRestoreStatus");
  if(!container) return;
  container.textContent=message;
  if(recovery){
    const button=document.createElement("button");
    button.type="button";button.className="dashboardInlineBtn";button.textContent="安全保存から復旧";
    button.addEventListener("click",recoverDashboardGrowthRestore,{once:true});container.append(" ",button);
  }
}

async function importDashboardGrowthBackupFile(input){
  const file=input?.files?.[0];
  if(input) input.value="";
  if(!file) return;
  if(file.size>20*1024*1024){setDashboardGrowthRestoreStatus("20MBを超えるファイルは復元できません。");return;}
  setDashboardGrowthRestoreStatus("バックアップを確認しています…");
  try{
    const payload=JSON.parse(await file.text());
    if(!window.confirm("このバックアップの生育観測・モデル世代・予測履歴を統合しますか？ 履歴とモデルは元の地点を保って保存します。収穫・苗植え記録と採用モデルは変更しません。地点・号棟補正は復元後に個別に選べます。")){
      setDashboardGrowthRestoreStatus("復元を取り消しました。");return;
    }
    const result=await restoreDashboardGrowthBackup(payload);
    if(!result){setDashboardGrowthRestoreStatus("復元は実行されませんでした。");return;}
    const observation=result.observations || {},models=result.models || {},history=result.history || {};
    setDashboardGrowthRestoreStatus(`復元しました。生育観測${observation.imported || 0}件、予測履歴${history.added || 0}件、モデル世代${models.added?.length || 0}件を追加。観測競合${observation.conflicts || 0}件、モデル競合${models.conflicts?.length || 0}件。採用モデルと気象地点・手動補正は変更していません。`);
    renderDashboardGrowthRestoreSettings(result.settings);
    dashboardGrowthPredictionModelCache=null;dashboardRenderedSubtabs.delete("growth");renderDashboardGrowthPrediction();
  }catch(error){
    const rollback=error?.rollbackSucceeded===true ? "端末内の変更は元に戻しました。" : "安全保存からの復旧が必要です。";
    const archives=error?.archivesRetained ? "追加済みの予測履歴は保持されています。再実行時に重複しません。" : "";
    setDashboardGrowthRestoreStatus(`復元できませんでした。${rollback}${archives}`,error?.rollbackSucceeded===false);
  }
}

function recoverDashboardGrowthRestore(){
  try{
    const result=recoverDashboardGrowthBackup();
    setDashboardGrowthRestoreStatus(result?.recovered ? "安全保存から復旧しました。追加済みの予測履歴は保持されています。" : "復旧が必要な途中処理はありませんでした。");
  }catch(error){setDashboardGrowthRestoreStatus("別の変更があるため自動復旧できません。現在の記録を変更せず処理を止めました。");}
}

function dashboardGrowthCsvCell(value){
  let text=value===null || value===undefined ? "" : String(value);
  if(/^[\s]*[=+\-@]/.test(text)) text="'"+text;
  return `"${text.replace(/"/g,'""')}"`;
}

async function exportDashboardGrowthCsv(){
  if(!ensureProtectedOperationAccess("生育予測履歴のCSV書き出し")) return;
  const model=dashboardGrowthPredictionModelCache;
  if(!model) return;
  try{
    const entries=await HarvestGrowthHistory.list(model.scope,"prediction");
    const header=["capturedAt","asOf","modelVersion","shadowModelVersion","building","bed","plantingEventId","plantingDate","targetDate","palletKeys","status","readyStart","readyEnd","confidence","outOfForecast","observedDays","forecastDays","estimatedDays","unavailableDays","elongated","uneven","tipburn"];
    const rows=entries.flatMap(entry=>(entry.payload?.predictions || []).map(item=>{
      const prediction=item.prediction || {},counts=prediction.dayCounts || {},risk=item.risk || {};
      return [entry.capturedAt,entry.payload?.asOf || entry.asOf,entry.payload?.modelVersion,entry.payload?.shadowModelVersion,
        item.building,item.bed,item.plantingEventId,item.plantingDate,item.targetDate,(item.palletKeys || []).join("|"),
        prediction.status,prediction.readyStart || prediction.readyDate,prediction.readyEnd,prediction.confidence?.level,
        prediction.outOfForecast===true,counts.observed,counts.forecast,counts.estimated,counts.unavailable,
        risk.elongated?.level || "unknown",risk.uneven?.level || "unknown",risk.tipburn?.level || "unknown"];
    }));
    const csv="\ufeff"+[header,...rows].map(row=>row.map(dashboardGrowthCsvCell).join(",")).join("\r\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})),link=document.createElement("a");
    link.href=url;link.download=`Harvestnavi-growth-${formatDateOnlyString(new Date())}.csv`;document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);showToast(`予測履歴${entries.length}回をCSVで書き出しました`);
  }catch(error){showToast("予測履歴をCSVで書き出せませんでした");}
}
