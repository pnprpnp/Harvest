"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const planner=require("../src/scripts/growth-planner.js"),yieldEngine=require("../src/scripts/growth-yield.js");
process.env.TZ="Asia/Tokyo";
const asOf="2026-10-01T12:00:00+09:00";
const source=fs.readFileSync(require.resolve("../src/scripts/app/07-dashboard.js"),"utf8");
function planting(id,counts,extra={}){
  return {eventId:id,plantingDate:"2026-09-01",plantingPalletKeys:Object.keys(counts),
    plantingCountsByPallet:counts,...extra};
}
function cohort(keys,status,date="2026-10-02",id=1){
  return {palletKeys:keys,plantingEventId:id,input:{targetDate:date},
    prediction:{status,confidence:{label:"参考値"}},currentPrediction:{status:"small"}};
}
function fixture(cohorts,plantingEvents,records=[],extraForecasts=[],lossRates={}){
  const palletForecasts=new Map(extraForecasts.map(([key,date])=>[key,{date:new Date(`${date}T00:00:00+09:00`),lossRate:lossRates[key] ?? 0}]));
  const predictions=new Map();
  cohorts.forEach(c=>{
    c.palletKeys.forEach(key=>palletForecasts.set(key,{date:new Date(`${c.input.targetDate}T00:00:00+09:00`),lossRate:lossRates[key] ?? 0}));
    const [building,bed]=c.palletKeys[0].split("-");
    const id=`${building}-${bed}`;
    if(!predictions.has(id)) predictions.set(id,{building:Number(building),bed,hasCurrentCrop:true,cohorts:[]});
    predictions.get(id).cohorts.push(c);
  });
  const model={asOf,scope:"test",modelVersion:"frozen",baseModel:{palletForecasts,canForecast:true},predictions,
    weather:{forecastEndDate:"2026-10-07",daily:Array.from({length:7},(_,i)=>({source:"forecast",date:`2026-10-0${i+1}`}))}};
  const dataset=yieldEngine.buildDataset({plantingEvents,records,asOf});
  let datasetReads=0,quantities=0;
  const container={innerHTML:""};
  const context=vm.createContext({Date,HarvestGrowthPlanner:planner,HarvestGrowthYield:yieldEngine,
    document:{getElementById:()=>container},dashboardGrowthPlanningShowsQuantity:false,
    getDashboardGrowthYieldAnalysis:()=>{datasetReads++;return {dataset};},
    getDashboardGrowthYieldPrediction:(palletKeys,plantingEventId)=>{
      quantities++;
      return yieldEngine.predict({planner,model:{rows:[{factor:0.5,building:5}]},dataset,palletKeys,plantingEventId});
    },getDashboardGrowthPlanningItems:()=>[],readDashboardGrowthChangeState:()=>({notifications:[]}),
    escapeHtml:value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))});
  for(const name of ["parseDateOnlyString","startOfLocalDay","formatDateOnlyString","addDays","getDashboardGrowthScheduledPlanningItems","renderDashboardGrowthPlanning"]){
    const start=source.indexOf(`function ${name}(`),end=source.indexOf("\n}",start);
    assert.ok(start>=0 && end>start,name);
    vm.runInContext(source.slice(start,end+2),context);
  }
  return {model,context,container,reads:()=>({datasetReads,quantities}),
    items:options=>context.getDashboardGrowthScheduledPlanningItems(model,options),
    calendar:()=>planner.scheduledCalendar(context.getDashboardGrowthScheduledPlanningItems(model),{
      today:asOf.slice(0,10),forecastEndDate:model.weather.forecastEndDate,forecastDates:model.weather.daily.map(day=>day.date)})};
}
test("the guide's scheduled pallets use their scheduled-day size and actual counts, not today's size or whole beds",()=>{
  const counts={"5-A-1":20,"5-A-2":20,"5-B-1":16,"5-C-1":12};
  const f=fixture([cohort(["5-A-1"],"large"),cohort(["5-B-1"],"normal"),cohort(["5-C-1"],"large")],[planting(1,counts)]);
  const day=f.calendar()[1];
  assert.equal(day.sizes.large.heads,32);assert.equal(day.sizes.normal.heads,16);assert.equal(day.sizes.small.heads,0);
  assert.equal(day.entries.flatMap(item=>item.palletKeys).length,3);
  f.context.renderDashboardGrowthPlanning(f.model);
  assert.match(f.container.innerHTML,/10\/2（金）<\/strong>.*大きめ2\.7ケース・ちょうど良い1\.3ケース/);
  assert.doesNotMatch(f.container.innerHTML,/開始：|期間中：|32ベッド/);
});
test("a bed split across harvest dates only contributes each day's selected portion",()=>{
  const f=fixture([cohort(["5-A-1"],"normal"),cohort(["5-A-2"],"large","2026-10-03")],
    [planting(1,{"5-A-1":12,"5-A-2":20})]);
  const days=f.calendar();
  assert.equal(days[1].sizes.normal.heads,12);assert.equal(days[1].sizes.large.heads,0);
  assert.equal(days[2].sizes.large.heads,20);assert.equal(days[2].sizes.normal.heads,0);
});
const partial={id:1,recordUuid:"partial-1",type:"partialHarvest",date:"2026-09-30",cases:1,
  targets:[{building:5,bed:"A",start:1,end:2,plantsPerPallet:6}]};
test("matching size and date scopes merge before subtracting one exact partial total",()=>{
  const f=fixture([cohort(["5-A-1"],"large"),cohort(["5-A-2"],"large")],
    [planting(1,{"5-A-1":20,"5-A-2":20})],[partial]);
  assert.equal(f.items().length,1);assert.equal(f.calendar()[1].sizes.large.heads,28);
});
test("partial totals crossing predicted sizes or dates stay unknown rather than being distributed",()=>{
  for(const [status,date] of [["normal","2026-10-02"],["large","2026-10-03"]]){
    const f=fixture([cohort(["5-A-1"],"large"),cohort(["5-A-2"],status,date)],
      [planting(1,{"5-A-1":20,"5-A-2":20})],[partial]);
    assert.ok(f.items().every(item=>item.heads===null));
    f.context.renderDashboardGrowthPlanning(f.model);
    assert.match(f.container.innerHTML,/ケース数不明/);assert.doesNotMatch(f.container.innerHTML,/大きめ1\.2ケース/);
  }
});
test("missing stock counts and unknown size are distinct, with no invented zero",()=>{
  const f=fixture([cohort(["5-A-1"],"large"),cohort(["5-B-1"],"large","2026-10-02",2),
    cohort(["5-C-1"],"unknown","2026-10-02",3)],
    [planting(1,{"5-A-1":20}),planting(2,{"5-B-1":null}),planting(3,{"5-C-1":12})]);
  assert.equal(f.calendar()[1].sizes.large.heads,20);assert.equal(f.calendar()[1].sizes.large.unknownPallets,1);
  assert.equal(f.calendar()[1].sizes.unknown.heads,12);
  f.context.renderDashboardGrowthPlanning(f.model);
  assert.match(f.container.innerHTML,/大きめ1\.7ケース＋ケース数不明・大きさ不明1ケース/);
});
test("only exact scheduled inputs are reused; absent current crops and mismatched dates cannot gain a size",()=>{
  const f=fixture([cohort(["5-A-1"],"large")],[planting(1,{"5-A-1":20})],[],[["5-B-1","2026-10-02"]]);
  f.model.baseModel.palletForecasts.set("5-A-1",{date:new Date("2026-10-03T00:00:00+09:00"),lossRate:0});
  const days=f.calendar();
  assert.equal(days[1].sizes.unknown.unknownPallets,1);assert.equal(days[2].sizes.unknown.heads,20);
  assert.equal(days[2].sizes.large.heads,0);
});
test("forecast limits, missing dates and the seven-day bound never invent size predictions",()=>{
  const f=fixture([cohort(["5-A-1"],"large","2026-10-07"),cohort(["5-B-1"],"normal","2026-10-08")],
    [planting(1,{"5-A-1":20,"5-B-1":20})]);
  f.model.weather.forecastEndDate="2026-10-06";f.model.weather.daily.pop();
  assert.equal(f.items().length,1);assert.equal(f.calendar().length,7);
  assert.equal(f.calendar()[0].date,"2026-10-01");assert.equal(f.calendar()[6].date,"2026-10-07");
  assert.equal(f.calendar()[6].predicted,false);assert.equal(f.calendar()[6].sizes,null);
  f.context.renderDashboardGrowthPlanning(f.model);
  assert.match(f.container.innerHTML,/今後7日の収穫予定と大きさ/);
  assert.match(f.container.innerHTML,/10\/7（水）<\/strong><span>気象予報範囲外のため未予測/);
  assert.doesNotMatch(f.container.innerHTML,/10\/8（木）<\/strong>/);
  const item={id:"one",date:"2026-10-02",status:"large",heads:20,palletKeys:["5-A-1"]};
  const days=planner.scheduledCalendar([item,item],{today:"2026-10-01",forecastEndDate:"2026-10-07",forecastDates:["2026-10-01"]});
  assert.equal(days[1].predicted,false);assert.equal(days[1].entries.length,1);
});
test("repeated rendering reuses counts, lazily computes quantities once, and rebuilding predictions invalidates counts",()=>{
  const f=fixture([cohort(["5-A-1"],"large")],[planting(1,{"5-A-1":20})]);
  const first=f.items();assert.equal(f.items(),first);f.context.renderDashboardGrowthPlanning(f.model);
  assert.deepEqual(f.reads(),{datasetReads:1,quantities:0});
  f.context.dashboardGrowthPlanningShowsQuantity=true;
  f.context.renderDashboardGrowthPlanning(f.model);f.context.renderDashboardGrowthPlanning(f.model);
  assert.deepEqual(f.reads(),{datasetReads:1,quantities:1});
  assert.match(f.container.innerHTML,/大きめ1\.7ケース/);
  assert.match(f.container.innerHTML,/残存ケース数：0.8ケース/);
  f.model.predictions=new Map(f.model.predictions);
  assert.notEqual(f.items(),first);assert.equal(f.reads().datasetReads,2);
});
test("no scheduled harvest and an unavailable guide have explicit empty states",()=>{
  const f=fixture([],[]);f.context.renderDashboardGrowthPlanning(f.model);
  assert.equal((f.container.innerHTML.match(/収穫予定なし/g)||[]).length,7);
  assert.equal(f.reads().datasetReads,0);
  f.model.baseModel.canForecast=false;f.context.renderDashboardGrowthPlanning(f.model);
  assert.match(f.container.innerHTML,/「目安」で収穫予定を計算すると/);
});
test("future partial records do not change today's stock snapshot or stored record formats",()=>{
  const events=[planting(1,{"5-A-1":20,"5-A-2":20})],records=[{...partial,date:"2026-10-02"}];
  const before=JSON.stringify({events,records});
  const f=fixture([cohort(["5-A-1","5-A-2"],"large")],events,records);
  assert.equal(f.calendar()[1].sizes.large.heads,40);
  assert.equal(JSON.stringify({events,records}),before);
});

test("scheduled cases use the applied loss per pallet before subtracting partial harvests once",()=>{
  const f=fixture([cohort(["5-A-1","5-A-2"],"large"),cohort(["5-B-1"],"normal")],
    [planting(1,{"5-A-1":20,"5-A-2":16,"5-B-1":12})],[partial],[],
    {"5-A-1":50,"5-A-2":25,"5-B-1":0});
  assert.equal(f.calendar()[1].sizes.large.heads,10); // 20*0.5 + 16*0.75 - 12.
  assert.equal(f.calendar()[1].sizes.normal.heads,12);
  f.context.renderDashboardGrowthPlanning(f.model);
  assert.match(f.container.innerHTML,/大きめ0\.8ケース・ちょうど良い1ケース/);
  assert.match(f.container.innerHTML,/「目安」で使用中のロス率を反映/);
});
test("a 240-case plan displays only pallet rounding excess after 21 percent loss",()=>{
  const counts=Object.fromEntries(Array.from({length:183},(_,i)=>
    [`5-${["A","B","C"][Math.floor(i/78)]}-${i%78+1}`,20]));
  const keys=Object.keys(counts);
  const f=fixture([cohort(keys,"normal")],[planting(1,counts)],[],[],
    Object.fromEntries(keys.map(key=>[key,21])));
  const cases=f.calendar()[1].sizes.normal.heads/planner.CASE_SIZE;
  assert.ok(cases>240 && cases<242);assert.ok((keys.length-1)*20*0.79/12<240);
});
test("full loss and heavy partial harvests clamp at zero, and missing loss stays unknown",()=>{
  const f=fixture([cohort(["5-A-1","5-A-2"],"large")],
    [planting(1,{"5-A-1":20,"5-A-2":20})],[partial],[],{"5-A-1":100,"5-A-2":100});
  assert.equal(f.calendar()[1].sizes.large.heads,0);
  const g=fixture([cohort(["5-A-1","5-A-2"],"large")],
    [planting(1,{"5-A-1":20,"5-A-2":20})],[partial],[],{"5-A-1":80,"5-A-2":80});
  assert.equal(g.calendar()[1].sizes.large.heads,0);
  g.model.baseModel.palletForecasts.get("5-A-1").lossRate=undefined;
  g.model.baseModel={...g.model.baseModel};
  assert.equal(g.items()[0].heads,null);
});
test("legacy total-only planting records use a common loss without inventing per-pallet counts",()=>{
  const cohorts=[cohort(["5-A-1","5-A-2"],"large")];
  const events=[planting(1,{"5-A-1":null,"5-A-2":null},{actualPlantedSeedlingCount:36})];
  const f=fixture(cohorts,events,[],[],{"5-A-1":25,"5-A-2":25});
  assert.equal(f.calendar()[1].sizes.large.heads,27);
  const g=fixture(cohorts,events,[],[],{"5-A-1":25,"5-A-2":50});
  assert.equal(g.items()[0].heads,null);
});
test("replacing the guide model reapplies loss while reusing the existing growth predictions",()=>{
  const f=fixture([cohort(["5-A-1"],"large")],[planting(1,{"5-A-1":20})]);
  const original=f.items();
  f.model.baseModel={...f.model.baseModel,palletForecasts:new Map([["5-A-1",{
    date:new Date("2026-10-02T00:00:00+09:00"),lossRate:25}]])};
  assert.notEqual(f.items(),original);assert.equal(f.calendar()[1].sizes.large.heads,15);
  assert.deepEqual(f.reads(),{datasetReads:2,quantities:0});
});
