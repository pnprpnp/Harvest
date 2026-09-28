"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync(require("node:path").join(__dirname,"../src/scripts/app/07-dashboard.js"),"utf8");
function setup(initial){
  let cached=initial,calls=0,fail=false,stale=false,clock=Date.parse("2026-09-27T12:00:00+09:00");
  class Clock extends Date {constructor(...args){super(...(args.length ? args : [clock]));}static now(){return clock;}}
  const daily=[{date:"2026-09-27",source:"forecast",meanTemp:20,lightIndex:1,issuedAt:"2026-09-27T05:00:00+09:00"}];
  const c=vm.createContext({Date:Clock,DASHBOARD_GROWTH_WEATHER_CACHE_KEY:"cache",getDashboardGrowthLocationKey:()=>"station",
    getDashboardGrowthWeatherCache:()=>cached,harvestnaviLocalStorage:{writeJson:(key,value)=>{cached=value;}},
    fetchDashboardGrowthWeatherFromRelay:async()=>{calls++;if(fail) throw new Error("offline");return {daily,fetchedAt:clock,forecastEndDate:"2026-09-27",stale};}});
  const start=source.indexOf("async function loadDashboardGrowthWeather("),end=source.indexOf("\nfunction getDashboardGrowthMedian",start);
  vm.runInContext(source.slice(start,end),c);
  return {load:options=>c.loadDashboardGrowthWeather({},options),get calls(){return calls;},get cached(){return cached;},
    set fail(value){fail=value;},set stale(value){stale=value;},advance:ms=>{clock+=ms;}};
}
test("only successful weather is reused for 24 hours and manual refresh bypasses it",async()=>{
  const f=setup(null);await f.load();f.advance(24*3600000-1);assert.equal((await f.load()).usedCache,true);assert.equal(f.calls,1);
  await f.load({force:true});assert.equal(f.calls,2);f.advance(24*3600000);assert.equal((await f.load()).usedCache,false);assert.equal(f.calls,3);
});
test("stale relay replies never become a new 24-hour success window",async()=>{
  const f=setup(null);f.stale=true;await f.load();await f.load();assert.equal(f.calls,2);assert.equal(f.cached.stale,true);
});
test("offline fallback preserves archived days and original forecast end",async()=>{
  const f=setup(null);const prior=await f.load();f.advance(24*3600000);f.fail=true;
  const result=await f.load();assert.equal(result.stale,true);assert.deepEqual(result.daily,prior.daily);
  assert.equal(result.forecastEndDate,prior.forecastEndDate);assert.equal(f.cached.successfulAt,prior.successfulAt);
});
