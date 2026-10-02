"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const engine=require("../src/scripts/growth-model.js");
process.env.TZ="Asia/Tokyo";
const source=fs.readFileSync(require.resolve("../src/scripts/app/07-dashboard.js"),"utf8");
const c=vm.createContext({Date,HarvestGrowthModel:engine,
  escapeHtml:value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))});
for(const name of ["parseDateOnlyString","getDashboardGrowthTemperatureTotal","getDashboardGrowthTemperatureHtml"]){
  const start=source.indexOf(`function ${name}(`),end=source.indexOf("\n}",start);
  assert.ok(start>=0 && end>start,name);vm.runInContext(source.slice(start,end+2),c);
}
const asOf="2026-10-02T12:00:00+09:00",issuedAt="2026-10-01T17:00:00+09:00";
const observed=(date,meanTemp,extra={})=>({date,meanTemp,source:"observation",...extra});
const forecast=(date,meanTemp,extra={})=>({date,meanTemp,source:"forecast",issuedAt,...extra});
function context(extra=[]){
  return engine.prepareWeather([observed("2026-09-30",19.125),observed("2026-10-01",20.25),
    forecast("2026-10-02",21.5),forecast("2026-10-03",22.75),...extra],{asOf});
}
test("temperature sums both boundary days independently of light and retains full precision",()=>{
  const weather=context(),before=[...weather.observations.values(),...weather.forecasts.values()].map(day=>({...day}));
  assert.equal(weather.getDay("2026-10-03"),null,"growth cannot use a forecast without light");
  const current=c.getDashboardGrowthTemperatureTotal(weather,"2026-09-30","2026-10-02");
  const planned=c.getDashboardGrowthTemperatureTotal(weather,"2026-09-30","2026-10-03");
  assert.equal(current.total,60.875);assert.equal(planned.total,83.625);
  assert.equal(current.dayCounts.observed,2);assert.equal(current.dayCounts.forecast,1);
  assert.equal(planned.dayCounts.total,4);assert.equal(planned.missingDays,0);
  assert.equal(c.getDashboardGrowthTemperatureTotal(weather,"2026-10-01","2026-10-01").total,20.25);
  assert.equal(c.getDashboardGrowthTemperatureTotal(weather,"2026-09-30","2026-10-02"),current);
  assert.deepEqual([...weather.observations.values(),...weather.forecasts.values()],before);
});
test("missing days, future observations, and unavailable forecasts cannot invent a full total",()=>{
  const weather=context([observed("2026-10-04",99),forecast("2026-10-05",25,{issuedAt:""}),
    forecast("2026-10-06",26,{issuedAt:"2026-10-03T12:00:00+09:00"}),
    forecast("2026-10-07",24,{estimatedTemperature:true})]);
  for(const [start,end,missing] of [["2026-09-29","2026-10-03",1],["2026-10-02","2026-10-07",4]]){
    const total=c.getDashboardGrowthTemperatureTotal(weather,start,end);
    assert.equal(total.total,null);assert.equal(total.missingDays,missing);
  }
  assert.equal(c.getDashboardGrowthTemperatureTotal(weather,"2026-10-03","2026-10-02"),null);
  assert.equal(c.getDashboardGrowthTemperatureTotal(weather,"bad","2026-10-02"),null);
  assert.equal(c.getDashboardGrowthTemperatureTotal(weather,"2020-01-01","2026-10-02"),null);
});
test("verified substitute temperatures are counted separately and future substitute evidence is rejected",()=>{
  const raw=observed("2026-10-01",18,{weatherPolicy:"provider-fallback-v1",fallbackFields:["meanTemp"],
    fieldSources:{meanTemp:{provider:"nasa-power",retrievedAt:"2026-10-02T10:00:00+09:00"}},jmaValues:{meanTemp:null}});
  let weather=engine.prepareWeather([raw],{asOf});
  const total=c.getDashboardGrowthTemperatureTotal(weather,"2026-10-01","2026-10-01");
  assert.equal(total.total,18);assert.equal(total.dayCounts.fallback,1);assert.equal(total.dayCounts.observed,0);
  weather=engine.prepareWeather([{...raw,fieldSources:{meanTemp:{provider:"nasa-power",retrievedAt:"2026-10-03T10:00:00+09:00"}}}],{asOf});
  assert.equal(c.getDashboardGrowthTemperatureTotal(weather,"2026-10-01","2026-10-01").total,null);
});
test("zero and negative means are kept, while replacing weather produces a fresh index",()=>{
  const weather=engine.prepareWeather([observed("2026-09-30",-2),observed("2026-10-01",0)],{asOf});
  assert.equal(c.getDashboardGrowthTemperatureTotal(weather,"2026-09-30","2026-10-01").total,-2);
  assert.equal(c.getDashboardGrowthTemperatureTotal(weather,"2026-10-01","2026-10-01").total,0);
  const newWeather=engine.prepareWeather([observed("2026-10-01",10)],{asOf});
  assert.equal(c.getDashboardGrowthTemperatureTotal(newWeather,"2026-10-01","2026-10-01").total,10);
  assert.notEqual(newWeather.temperatureTotalCache,weather.temperatureTotalCache);
});
test("details distinguish dates, missing temperatures, current totals, and scheduled totals",()=>{
  const weather=context();
  const cohort=(start,end,key)=>({input:{plantingDate:start},palletKeys:[key],temperatureTotals:{
    current:c.getDashboardGrowthTemperatureTotal(weather,start,"2026-10-02"),
    scheduled:c.getDashboardGrowthTemperatureTotal(weather,start,end)}});
  const item={range:{},cohorts:[cohort("2026-09-30","2026-10-03","2-A-1"),cohort("2026-10-01","2026-10-04","2-A-2")]};
  const html=c.getDashboardGrowthTemperatureHtml(item);
  assert.match(html,/60\.9℃・日/);assert.match(html,/83\.6℃・日/);assert.match(html,/41\.8℃・日/);
  assert.match(html,/9\/30定植/);assert.match(html,/10\/1定植/);
  assert.match(html,/平均気温が1日不足/);assert.match(html,/観測2日・予報2日/);
  assert.match(html,/日照係数や号棟の気温補正は加えません/);
  assert.match(html,/現在まで/);assert.match(html,/予定日まで/);
  item.range=null;
  assert.doesNotMatch(c.getDashboardGrowthTemperatureHtml(item),/予定日まで/);
  assert.equal(c.getDashboardGrowthTemperatureHtml({cohorts:[]}),"");
});
