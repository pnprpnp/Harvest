"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
function fixture(){
  let resolve,reject,writes=0,queues=0;
  const ready=new Promise((yes,no)=>{resolve=yes;reject=no;}),messages=[],notifications=[];
  const inputs=Object.fromEntries(Object.entries({recordDateInput:"2026-09-24",recordCasesInput:"255",recordPalletSummaryInput:"8号棟A:1",recordMemoInput:"既存メモ"})
    .map(([key,value])=>[key,{value}]));
  const button={disabled:false},card={setAttribute(){},removeAttribute(){}};
  const record={id:1,type:"fullHarvest",date:"2026-09-24",cases:255,actualLoss:"-3.7",palletKeys:["8-A-1"]};
  const context=vm.createContext({console,records:[record],editingHarvestRecordId:1,recordSelectionMode:"harvest",recordSaveUiTransitionPending:false,
    recordPartialHarvestDraft:{entries:[]},harvestFillKeys:["8-A-1"],harvestEditReturnPlantingRecordId:null,
    document:{getElementById:id=>inputs[id] || (id==="recordPrimaryActionBtn"?button:id==="recordSaveCard"?card:null)},
    ensureProtectedOperationAccess:()=>true,ensureGoogleSheetLocalMutationAllowed:()=>true,getRecordById:()=>record,
    clampNumber:Number,normalizeRecordPartialHarvestDraft:()=>({isValid:false,isEmpty:true}),getRegularHarvestCases:()=>255,
    getRecordActualLossValue:()=>"10.8",getRecordActualSeedlingTrayCount:()=>0,getRecordSeedlingCarryoverMode:()=>"",
    getSelectedQualityMemo:()=>"",getSelectedHarvestSizeRating:()=>"normal",getSelectedHarvestGrowthDetail:()=>({bedOverrides:{}}),
    getCurrentPlantingAgeSnapshot:()=>({}),isStrictDateOnlyString:()=>true,confirmHarvestRecordWarnings:()=>true,
    ensureDashboardGrowthSafetySnapshot:()=>ready,showToast:(message,options)=>{messages.push(message);notifications.push(options);},isGoogleSheetSendQueueFailure:queued=>!queued,getSafePositiveRecordId:()=>null,
    getRemotePlantingEventDependenciesForHarvest:()=>[],getPlannedSeedlingTrayCountForRecord:()=>0,
    RECORD_SYNC_SCHEMA_VERSION:3,RECORD_SYNC_FIELD_KEYS:[],getRemainingHarvestableCaseInstruction:()=>"",getRecordDuplicateKey:()=>"uuid",
    saveRecordsToStorage:()=>{writes++;},queueGoogleSheetRecordSend:()=>{queues++;return true;},scheduleRecordSaveUiTransition:()=>{}});
  vm.runInContext(fs.readFileSync(require.resolve("../src/scripts/app/12-record-save-and-restore.js"),"utf8"),context);
  context.scheduleRecordSaveUiTransition=()=>{};
  return {context,record,inputs,button,messages,notifications,resolve,reject,get writes(){return writes;},get queues(){return queues;}};
}
test("harvest update waits for safety verification and rejects repeated clicks before changing loss",async()=>{
  const f=fixture(),pending=f.context.saveRecord();
  assert.equal(f.record.actualLoss,"-3.7");assert.equal(f.writes,0);assert.equal(f.queues,0);assert.equal(f.button.disabled,true);
  await f.context.saveRecord();assert.equal(f.writes,0);
  f.resolve();await pending;
  assert.equal(f.record.actualLoss,"10.8");assert.equal(f.writes,1);assert.equal(f.queues,1);assert.equal(f.button.disabled,false);
});
test("failed safety save retains the preceding record and re-enables retry",async()=>{
  const f=fixture(),before=JSON.stringify(f.record),pending=f.context.saveRecord();f.reject(new Error("denied"));await pending;
  assert.equal(JSON.stringify(f.record),before);assert.equal(f.writes,0);assert.equal(f.queues,0);assert.equal(f.button.disabled,false);
  assert.match(f.messages[0],/記録は未変更/);assert.equal(f.context.recordSaveUiTransitionPending,false);
  assert.equal(f.notifications[0].error,true);
});
test("changing inputs or cancelling an edit while safety is pending cannot save the old selection",async()=>{
  for(const change of [f=>{f.inputs.recordCasesInput.value="250";},f=>{f.context.editingHarvestRecordId=null;}]){
    const f=fixture(),before=JSON.stringify(f.record),pending=f.context.saveRecord();change(f);f.resolve();await pending;
    assert.equal(JSON.stringify(f.record),before);assert.equal(f.writes,0);assert.equal(f.queues,0);assert.equal(f.button.disabled,false);
    assert.match(f.messages[0],/入力が変わ/);
    assert.equal(f.notifications[0]?.error,undefined);
  }
});
test("runtime safety wait detects role and history changes before authorizing a record update",async()=>{
  for(const change of [c=>{c.role="worker";},c=>{c.dashboardGrowthDataRevision++;}]){
    let release;const gate=new Promise(resolve=>{release=resolve;});
    const c=vm.createContext({role:"owner",dashboardGrowthDataRevision:0,
      getActiveRecordsStorageKey:()=>c.role,getActivePlantingEventsStorageKey:()=>"planting",SETTINGS_KEY:"settings",
      DASHBOARD_GROWTH_BUILDING_ADJUSTMENTS_KEY:"adjustments",DASHBOARD_GROWTH_LOCATION_KEY:"location",
      records:[],plantingEvents:[],settings:{},harvestnaviLocalStorage:{},HarvestGrowthSafetyStorage:{create:()=>({})},
      HarvestGrowthSafety:{createArchive:()=>({ensureSnapshot:()=>gate})}});
    vm.runInContext(fs.readFileSync(require.resolve("../src/scripts/app/growth-runtime.js"),"utf8"),c);
    const pending=c.ensureDashboardGrowthSafetySnapshot();change(c);release({created:true});
    await assert.rejects(pending,/利用者または記録が更新/);
  }
});
test("growth export waits for the archived safety snapshot and rejects a switched role",async()=>{
  for(const switchRole of [false,true]){
    let release,role="owner",payload=null;const gate=new Promise(resolve=>{release=resolve;});
    const c=vm.createContext({dashboardGrowthPredictionModelCache:{scope:"owner:site",samples:[],engineSamples:[]},
      ensureProtectedOperationAccess:()=>true,getActiveRecordsStorageKey:()=>role,
      HarvestGrowthHistory:{list:async()=>[],backupScope:async()=>({rows:[]})},DASHBOARD_GROWTH_CULTIVAR:"crop",
      HarvestGrowthModel:{schemaVersion:1},HarvestGrowthObservations:{backup:()=>({})},
      getDashboardGrowthLearningRegistry:()=>({exportBackup:()=>({})}),getDashboardGrowthSafetyArchive:()=>({readSnapshot:()=>gate}),
      getDashboardGrowthBuildingAdjustments:()=>({}),getDashboardGrowthLocation:()=>({}),evaluateDashboardGrowthSavedPredictions:()=>({}),
      URL:{createObjectURL:()=>"blob:test",revokeObjectURL:()=>{}},Blob:class{constructor(parts){payload=JSON.parse(parts[0]);}},
      document:{createElement:()=>({click(){},remove(){}}),body:{appendChild(){}}},formatDateOnlyString:()=>"2026-09-28",setTimeout:()=>{},showToast:()=>{}});
    const source=fs.readFileSync(require.resolve("../src/scripts/app/07-dashboard.js"),"utf8");
    vm.runInContext(source.slice(source.indexOf("async function exportDashboardGrowthHistory(){"),source.indexOf("function getDashboardGrowthBuildingTrend(")),c);
    const pending=c.exportDashboardGrowthHistory();await Promise.resolve();assert.equal(payload,null);
    if(switchRole)role="worker";release({raw:{records:"original"}});await pending;
    if(switchRole)assert.equal(payload,null);
    else assert.deepEqual(payload.restoration.safetySnapshot,{raw:{records:"original"}});
  }
});
