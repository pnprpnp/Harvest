"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm");
const engine = require("../src/scripts/growth-model.js");
const source = fs.readFileSync(require("node:path").join(__dirname,"../src/scripts/app/07-dashboard.js"),"utf8");
function setup(){
  const container = {innerHTML:""};
  const context = vm.createContext({Date, HarvestGrowthModel:engine,
    document:{getElementById:()=>container},
    escapeHtml:value=>String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c])});
  for(const name of ["parseDateOnlyString","buildDashboardGrowthWeatherDiagnostics","getDashboardGrowthWeatherGapReason",
    "getDashboardGrowthWeatherGapsHtml","renderDashboardGrowthWeatherDiagnostics","getDashboardGrowthLearningBasisHtml"]){
    const start=source.indexOf(`function ${name}(`),end=source.indexOf("\n}",start);
    vm.runInContext(source.slice(start,end+2),context);
  }
  return {context,container};
}
function fixture(){
  return {historyStartDate:"2026-05-28",normal:{historyCheckedThrough:"2026-06-02"},daily:[
    {date:"2026-05-28",source:"observation",meanTemp:20,sunshineHours:8},
    ...Array.from({length:5},(_,i)=>({date:engine.addDays("2026-05-29",i),source:"observation",meanTemp:20,lightIndex:null})),
    {date:"2026-09-28",source:"forecast",meanTemp:17.65,lightIndex:0.52,estimatedTemperature:true,issuedAt:"2026-09-28T17:00:00+09:00"},
    {date:"2026-09-29",source:"forecast",meanTemp:20,lightIndex:1,issuedAt:"2026-09-28T17:00:00+09:00"}
  ]};
}
test("weather overview and uncalculable bed show exact gap ranges and separate past estimates from unavailable forecasts",()=>{
  const {context:c,container}=setup(),weather=fixture();
  const prepared=engine.prepareWeather(weather.daily,{asOf:"2026-09-28T19:00:00+09:00"});
  const diagnostics=c.buildDashboardGrowthWeatherDiagnostics(weather,prepared);
  assert.equal(diagnostics.observationDays,5);assert.equal(diagnostics.forecastDays,1);
  c.renderDashboardGrowthWeatherDiagnostics({weather,weatherDiagnostics:diagnostics});
  assert.match(container.innerHTML,/2026\/5\/29〜2026\/6\/2（5日）/);
  assert.match(container.innerHTML,/日照時間/);assert.match(container.innerHTML,/過去の不足分は推定/);
  assert.match(container.innerHTML,/2026\/9\/28/);assert.match(container.innerHTML,/この日を含む期間は未予測/);
  const gap=prepared.getGap("2026-09-28");
  const html=c.getDashboardGrowthLearningBasisHtml({basis:{},cohorts:[{prediction:{weatherGaps:[gap,gap]}}]});
  assert.match(html,/対象期間の気象データ不足/);
  assert.equal((html.match(/<li>/g)||[]).length,1,"shared cohort gaps should appear once");
});
test("communication failures remain visible and error text cannot become HTML",()=>{
  const {context:c,container}=setup();
  c.renderDashboardGrowthWeatherDiagnostics({weather:{stale:true,fetchError:'<img src=x onerror=alert(1)>',lastError:"HTTP 503",
    nextAttemptAt:"2026-09-28T20:00:00+09:00"},weatherDiagnostics:{gaps:[],observationDays:0,forecastDays:0}});
  assert.match(container.innerHTML,/今回の取得失敗/);assert.match(container.innerHTML,/&lt;img/);
  assert.doesNotMatch(container.innerHTML,/<img/);assert.match(container.innerHTML,/HTTP 503/);
  assert.match(container.innerHTML,/次回取得予定/);assert.match(container.innerHTML,/保存済み/);
});
