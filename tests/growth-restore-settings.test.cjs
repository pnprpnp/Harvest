"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const settings=require("../src/scripts/growth-restore-settings.js");
const normalizeLocation=value=>value && /^\d{6}$/.test(value.officeCode) && /^\d{6}$/.test(value.forecastAreaCode)
  && /^\d{7}$/.test(value.class20Code) ? {officeCode:value.officeCode,forecastAreaCode:value.forecastAreaCode,class20Code:value.class20Code,name:String(value.name || "地点")} : null;
const location=(n,name)=>({officeCode:`${n}00000`,forecastAreaCode:`${n}00001`,class20Code:`${n}000001`,name});
const adjustments={2:{temperature:"base",light:"base"},3:{temperature:"high",light:"base"}};
const normalizeAdjustments=value=>Object.fromEntries(["2","3"].map(key=>[key,{...adjustments[key],...value?.[key]}]));
function environment(){
  const keys={location:"growthLocation",adjustments:"growthAdjustments"},data=new Map([
    [keys.location,JSON.stringify(location(1,"現在地点"),null,2)],[keys.adjustments,JSON.stringify(adjustments,null,2)],["farmRecords","untouched"]
  ]),hooks={};let role="local-records",safety=0;
  const storage={getItem:key=>data.get(key) ?? null,setItem(key,value){hooks.set?.(key,value);data.set(key,value);hooks.afterSet?.(key,value);},removeItem(key){hooks.remove?.(key);data.delete(key);}};
  const options={storage,keys,getRole:()=>role,normalizeLocation,normalizeAdjustments,ensureSafety:async()=>{safety++;await hooks.safety?.();}};
  return {api:settings.create(options),create:()=>settings.create(options),data,keys,hooks,storage,role:()=>role,setRole:value=>role=value,safety:()=>safety,
    incoming:{incomingLocation:location(2,"元地点"),incomingAdjustments:{2:{temperature:"low",light:"high"}}}};
}

test("settings preview never writes and omitted/current choices preserve exact local bytes",async()=>{
  const env=environment(),before=[...env.data],plan=env.api.preview(env.incoming);
  assert.equal(plan.differences.location,true);assert.deepEqual(plan.differences.buildings,["2"]);
  assert.equal(plan.incoming.adjustments[3].temperature,"high","missing buildings retain current values");
  assert.deepEqual([...env.data],before);
  assert.equal((await env.api.apply(plan)).applied,false);
  assert.equal((await env.api.apply(plan,{location:"current",adjustments:"current"})).applied,false);
  assert.equal(env.safety(),0);assert.deepEqual([...env.data],before);
});

test("settings choices independently apply after safety and never modify records or unselected bytes",async()=>{
  for(const chosen of ["location","adjustments"]){
    const env=environment(),plan=env.api.preview(env.incoming),unchosen=chosen==="location"?"adjustments":"location";
    const result=await env.api.apply(plan,{[chosen]:"incoming"});
    assert.equal(result.applied,true);assert.equal(result[`${chosen}Changed`],true);assert.equal(result[`${unchosen}Changed`],false);
    assert.deepEqual(JSON.parse(env.data.get(env.keys[chosen])),plan.incoming[chosen]);
    assert.equal(env.data.get(env.keys[unchosen]),plan.before[env.keys[unchosen]]);
    assert.equal(env.data.get("farmRecords"),"untouched");assert.equal(env.safety(),1);
    assert.equal(env.data.has(env.api.journalKey(env.role())),false);
  }
});

test("invalid imported settings stay unavailable instead of becoming made-up defaults",async()=>{
  const env=environment();
  for(const bad of [{2:{temperature:"wrong",light:"base"}},{999:{temperature:"high",light:"high"}},[],{}]){
    const plan=env.api.preview({incomingLocation:{latitude:1,longitude:2},incomingAdjustments:bad});
    assert.equal(plan.incoming.location,null);assert.equal(plan.incoming.adjustments,null);assert.equal(plan.warnings.length,2);
    await assert.rejects(env.api.apply(plan,{location:"incoming"}),/取り込み可能/);
    await assert.rejects(env.api.apply(plan,{adjustments:"incoming"}),/取り込み可能/);
  }
});

test("changed settings after preview and role/settings changes during safety refuse to overwrite newer data",async()=>{
  for(const when of ["preview","safety-location","safety-role"]){
    const env=environment(),plan=env.api.preview(env.incoming),newer=JSON.stringify(location(3,"別の変更"));
    if(when==="preview") env.data.set(env.keys.location,newer);
    else env.hooks.safety=()=>when==="safety-role" ? env.setRole("another-role") : env.data.set(env.keys.location,newer);
    await assert.rejects(env.api.apply(plan,{location:"incoming",adjustments:"incoming"}),/更新|利用者/);
    assert.equal(env.data.get(env.keys.adjustments),plan.before[env.keys.adjustments]);
    assert.equal(env.data.get(env.keys.location),when==="safety-role" ? plan.before[env.keys.location] : newer);
  }
});

test("quota failure rolls both settings back byte-for-byte and leaves immutable archives untouched",async()=>{
  const env=environment(),before=[...env.data],plan=env.api.preview(env.incoming);let once=false;
  env.data.set("immutablePrediction","original-weather-input");
  env.hooks.set=key=>{if(key===env.keys.adjustments&&!once){once=true;throw new Error("quota");}};
  await assert.rejects(env.api.apply(plan,{location:"incoming",adjustments:"incoming"}),error=>error.rollbackSucceeded===true);
  for(const [key,value] of before) assert.equal(env.data.get(key),value);
  assert.equal(env.data.get("immutablePrediction"),"original-weather-input");
});

test("failed rollback keeps a recoverable journal across location change and never overwrites a concurrent setting",async()=>{
  for(const concurrent of [false,true]){
    const env=environment(),plan=env.api.preview(env.incoming),newer=JSON.stringify(location(3,"並行更新"));
    env.hooks.set=(key,value)=>{
      if(key===env.keys.adjustments){if(concurrent) env.data.set(env.keys.location,newer);throw new Error("quota");}
      if(key===env.keys.location&&value===plan.before[key]) throw new Error("rollback blocked");
    };
    await assert.rejects(env.api.apply(plan,{location:"incoming",adjustments:"incoming"}),error=>error.rollbackSucceeded===false);
    assert.ok(env.data.has(env.api.journalKey(env.role())));
    delete env.hooks.set;
    if(concurrent){assert.throws(()=>env.api.recover(),/別の変更/);assert.equal(env.data.get(env.keys.location),newer);}
    else{assert.equal(env.api.recover().recovered,true);assert.equal(env.data.get(env.keys.location),plan.before[env.keys.location]);}
  }
});

test("prepared or committed setting recovery cannot name farm keys or another role",()=>{
  for(const phase of ["prepared","committed"]){
    const env=environment(),key=env.api.journalKey(env.role());
    const journal={schemaVersion:1,role:env.role(),phase,before:{farmRecords:"untouched"},after:{farmRecords:"replacement"}};
    const raw=JSON.stringify(journal);env.data.set(key,raw);
    assert.throws(()=>env.api.recover(),/安全保存/);assert.equal(env.data.get("farmRecords"),"untouched");assert.equal(env.data.get(key),raw);
  }
});

test("committed settings left after journal cleanup failure remain committed on recovery",async()=>{
  const env=environment(),key=env.api.journalKey(env.role());env.hooks.remove=name=>{if(name===key)throw new Error("cleanup blocked");};
  await env.api.apply(env.api.preview(env.incoming),{location:"incoming"});
  const restored=env.data.get(env.keys.location);delete env.hooks.remove;
  assert.equal(env.api.recover().completed,true);assert.equal(env.data.get(env.keys.location),restored);
});

test("explicit keep-current resolves an interrupted settings journal only for the values the user reviewed",async()=>{
  const env=environment(),plan=env.api.preview(env.incoming);
  env.hooks.set=(key,value)=>{if(key===env.keys.adjustments||key===env.keys.location&&value===plan.before[key])throw new Error("blocked");};
  await assert.rejects(env.api.apply(plan,{location:"incoming",adjustments:"incoming"}));delete env.hooks.set;
  const reviewed=env.api.preview(),journalKey=env.api.journalKey(env.role());
  assert.throws(()=>env.api.keepCurrent({}),/選択/);
  env.data.set(env.keys.location,JSON.stringify(location(3,"並行更新")));
  assert.throws(()=>env.api.keepCurrent({explicit:true,role:reviewed.role,before:reviewed.before}),/更新/);
  assert.ok(env.data.has(journalKey));
  const current=env.api.preview(),raw=env.data.get(env.keys.location);
  assert.equal(env.api.keepCurrent({explicit:true,role:current.role,before:current.before}).kept,true);
  assert.equal(env.data.get(env.keys.location),raw);assert.equal(env.data.has(journalKey),false);
});

test("overlapping controllers reject the second journal after the asynchronous safety checkpoint",async()=>{
  const env=environment(),plan=env.api.preview(env.incoming);let release;const waiting=new Promise(done=>release=done);
  env.hooks.safety=()=>waiting;
  const first=env.api.apply(plan,{location:"incoming"});
  await assert.rejects(env.api.apply(plan,{location:"incoming"}),/進行中/);
  const second=env.create().apply(plan,{location:"incoming"});release();
  await first;await assert.rejects(second,/更新|開始/);
});

test("backup scope resolver preserves source location and changes only the record role",()=>{
  const context=vm.createContext({normalizeDashboardGrowthLocation:normalizeLocation,
    getDashboardGrowthLocationKey:value=>`${value.officeCode}:${value.forecastAreaCode}:${value.class20Code}`});
  vm.runInContext(fs.readFileSync(require.resolve("../src/scripts/app/growth-restore-settings.js"),"utf8"),context);
  const resolve=context.resolveDashboardGrowthBackupTargetScope;
  const payload={scope:"remote-records:200000:200001:2000001",restoration:{location:location(2,"元地点")}};
  assert.equal(resolve(payload,{role:"local-records"}),"local-records:200000:200001:2000001");
  assert.equal(resolve({...payload,restoration:{}},{role:"local-records"}),"local-records:200000:200001:2000001");
  assert.throws(()=>resolve({...payload,restoration:{location:location(3,"矛盾した地点")}},{role:"local-records"}),/元地点/);
  assert.throws(()=>resolve({...payload,scope:"unverifiable"},{role:"local-records"}),/元地点/);
});

test("restored location discards an in-flight old-site prediction and starts new-site weather before rendering",async()=>{
  const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
  const old=deferred(),next=deferred(),loads=[],rendered=[],archived=[];
  const context=vm.createContext({Promise,setTimeout,Date,console,performance:{now:()=>0},document:{getElementById:()=>null},
    activeAppTab:"dashboard",dashboardFilter:{dashboardSubtab:"growth"},normalizeDashboardSubtab:value=>value,
    dashboardGrowthPredictionModelCache:null,dashboardGrowthWeatherLoading:null,dashboardGrowthDataRevision:0,
    dashboardRenderedSubtabs:new Set(),dashboardGrowthForecastHistoryCache:null,dashboardGrowthBuildingAdjustmentsCache:null,
    dashboardGrowthManagementRegistry:null,dashboardGrowthRiskEvidenceCache:null,dashboardGrowthYieldAnalysisCache:null,
    currentLocation:"old",getDashboardGrowthLocation:()=>context.currentLocation,
    getDashboardGrowthHistoryScope:value=>`role:${value || context.currentLocation}`,
    loadDashboardGrowthWeather:site=>{loads.push(site);return site==="old"?old.promise:next.promise;},
    loadDashboardGrowthForecastHistory:async()=>{},setDashboardGrowthLoading:()=>{},getDashboardGrowthAsOf:()=>"2026-09-28T10:00:00+09:00",
    getDashboardGrowthSourceState:()=>({}),getDashboardGrowthEngineSamples:()=>[],getDashboardGrowthEvidenceSignature:async()=>"signature",
    prepareDashboardGrowthLearning:async()=>({}),buildDashboardGrowthPredictionModel:weather=>({scope:`role:${context.currentLocation}`,weather}),
    renderDashboardGrowthPredictionModel:model=>rendered.push(model),saveDashboardGrowthHistory:async model=>archived.push(model),
    syncDashboardGrowthLocationMenu:()=>{},renderDashboardGrowthBuildingAdjustmentMenu:()=>{},
    invalidateDashboardGrowthEvidence:()=>{context.dashboardGrowthDataRevision++;context.dashboardGrowthPredictionModelCache=null;}
  });
  const dashboard=fs.readFileSync(require.resolve("../src/scripts/app/07-dashboard.js"),"utf8");
  vm.runInContext(dashboard.slice(dashboard.indexOf("async function renderDashboardGrowthPrediction(options"),dashboard.indexOf("function setDashboardGrowthPredictionBuilding")),context);
  vm.runInContext(fs.readFileSync(require.resolve("../src/scripts/app/growth-restore-settings.js"),"utf8"),context);
  const initial=context.renderDashboardGrowthPrediction();
  context.currentLocation="new";context.invalidateDashboardGrowthRestoredSettings();
  assert.deepEqual(loads,["old"]);
  old.resolve({daily:[],site:"old"});await initial;
  assert.deepEqual(loads,["old","new"]);assert.equal(rendered.length,0);
  next.resolve({daily:[],site:"new"});await context.dashboardGrowthWeatherLoading;
  assert.equal(rendered.length,1);assert.equal(rendered[0].scope,"role:new");assert.equal(rendered[0].weather.site,"new");
  assert.deepEqual(archived,rendered);
});
