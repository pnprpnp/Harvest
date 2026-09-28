"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync(require("node:path").join(__dirname,"../src/scripts/app/07-dashboard.js"),"utf8");
function setup(initial){
  let cached=initial,calls=0,fail=false,stale=false,clock=Date.parse("2026-09-27T12:00:00+09:00");
  class Clock extends Date {constructor(...args){super(...(args.length ? args : [clock]));}static now(){return clock;}}
  const daily=[{date:"2026-09-27",source:"forecast",meanTemp:20,lightIndex:1,issuedAt:"2026-09-27T05:00:00+09:00"}];
  const c=vm.createContext({Date:Clock,DASHBOARD_GROWTH_WEATHER_CACHE_KEY:"cache",getDashboardGrowthLocationKey:()=>"station",
    getDashboardGrowthWeatherCache:()=>cached,harvestnaviLocalStorage:{writeJson:(key,value)=>{cached=value;}},
    fetchDashboardGrowthWeatherFromRelay:async()=>{calls++;if(fail) throw new Error("offline");return {daily,fetchedAt:clock,forecastEndDate:"2026-09-27",stale,weatherPolicy:"provider-fallback-v1",
      refreshStatus:stale ? "retry" : "ready",lastError:stale ? "upstream error" : "",nextAttemptAt:stale ? "2026-09-27T04:00:00.000Z" : null};}});
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
  assert.equal(f.cached.refreshStatus,"retry");assert.equal(f.cached.lastError,"upstream error");
  assert.equal(f.cached.nextAttemptAt,"2026-09-27T04:00:00.000Z");
});
test("offline fallback preserves archived days and original forecast end",async()=>{
  const f=setup(null);const prior=await f.load();f.advance(24*3600000);f.fail=true;
  const result=await f.load();assert.equal(result.stale,true);assert.deepEqual(result.daily,prior.daily);
  assert.equal(result.forecastEndDate,prior.forecastEndDate);assert.equal(f.cached.successfulAt,prior.successfulAt);
  assert.equal(result.fetchError,"offline");assert.equal(f.cached.fetchError,undefined);
});
test("legacy cache is refreshed once for the new weather policy but remains available offline",async()=>{
  const old={daily:[{date:"2026-09-27",source:"forecast",meanTemp:20,lightIndex:1}],successfulAt:Date.parse("2026-09-27T11:00:00+09:00"),stale:false};
  const online=setup(old);assert.equal((await online.load()).usedCache,false);assert.equal(online.calls,1);
  assert.equal(online.cached.weatherPolicy,"provider-fallback-v1");assert.equal((await online.load()).usedCache,true);
  const offline=setup(old);offline.fail=true;const result=await offline.load();assert.equal(result.usedCache,true);
  assert.equal(offline.cached,old);assert.deepEqual(result.daily,old.daily);
});
