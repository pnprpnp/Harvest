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
function fixture(cohorts,plantingEvents,records=[],extraForecasts=[]){
  const palletForecasts=new Map(extraForecasts.map(([key,date])=>[key,{date:new Date(`${date}T00:00:00+09:00`)}]));
  const predictions=new Map();
  cohorts.forEach(c=>{
    c.palletKeys.forEach(key=>palletForecasts.set(key,{date:new Date(`${c.input.targetDate}T00:00:00+09:00`)}));
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
  assert.match(f.container.innerHTML,/10\/2<\/strong>.*大きめ32株・ちょうど良い16株/);
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
    assert.match(f.container.innerHTML,/株数不明/);assert.doesNotMatch(f.container.innerHTML,/大きめ14株/);
  }
});
test("missing stock counts and unknown size are distinct, with no invented zero",()=>{
  const f=fixture([cohort(["5-A-1"],"large"),cohort(["5-B-1"],"large","2026-10-02",2),
    cohort(["5-C-1"],"unknown","2026-10-02",3)],
    [planting(1,{"5-A-1":20}),planting(2,{"5-B-1":null}),planting(3,{"5-C-1":12})]);
  assert.equal(f.calendar()[1].sizes.large.heads,20);assert.equal(f.calendar()[1].sizes.large.unknownPallets,1);
  assert.equal(f.calendar()[1].sizes.unknown.heads,12);
  f.context.renderDashboardGrowthPlanning(f.model);
  assert.match(f.container.innerHTML,/大きめ20株＋株数不明・大きさ不明12株/);
});
test("only exact scheduled inputs are reused; absent current crops and mismatched dates cannot gain a size",()=>{
  const f=fixture([cohort(["5-A-1"],"large")],[planting(1,{"5-A-1":20})],[],[["5-B-1","2026-10-02"]]);
  f.model.baseModel.palletForecasts.set("5-A-1",{date:new Date("2026-10-03T00:00:00+09:00")});
  const days=f.calendar();
  assert.equal(days[1].sizes.unknown.unknownPallets,1);assert.equal(days[2].sizes.unknown.heads,20);
  assert.equal(days[2].sizes.large.heads,0);
});
test("forecast limits, missing dates and the 14-day bound never invent size predictions",()=>{
  const f=fixture([cohort(["5-A-1"],"large","2026-10-08"),cohort(["5-B-1"],"normal","2026-10-15")],
    [planting(1,{"5-A-1":20,"5-B-1":20})]);
  assert.equal(f.items().length,1);assert.equal(f.calendar().length,14);
  assert.equal(f.calendar()[7].predicted,false);assert.equal(f.calendar()[7].sizes,null);
  f.context.renderDashboardGrowthPlanning(f.model);
  assert.match(f.container.innerHTML,/10\/8<\/strong><span>気象予報範囲外のため未予測/);
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
  assert.match(f.container.innerHTML,/大きめ20株/);
  assert.match(f.container.innerHTML,/残存ケース数：0.8ケース/);
  f.model.predictions=new Map(f.model.predictions);
  assert.notEqual(f.items(),first);assert.equal(f.reads().datasetReads,2);
});
test("no scheduled harvest and an unavailable guide have explicit empty states",()=>{
  const f=fixture([],[]);f.context.renderDashboardGrowthPlanning(f.model);
  assert.equal((f.container.innerHTML.match(/収穫予定なし/g)||[]).length,14);
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
