import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {WEATHER_POLICY, prepareJmaDay, supplementDay, reuseJmaForecast, parseNasaHourly, parseJmaTodayPoints, parseMetForecast, fetchWeatherFallbacks} from "../src/weather-fallback.mjs";
import {buildGrowthWeatherResponse, getGrowthWeatherCoverage, parseJmaPastDailyCsv} from "../src/worker.mjs";
const require = createRequire(import.meta.url), engine = require("../../src/scripts/growth-model.js"), risk = require("../../src/scripts/growth-risk.js");
const now = new Date("2026-09-28T12:00:00Z"), stamp=now.toISOString();
const coords={latitude:37.48833333,longitude:139.91};
function native(date,source="observation",overrides={}){
  return prepareJmaDay({date,source,meanTemp:20,minTemp:15,maxTemp:25,lightIndex:1,
    ...(source==="forecast" ? {issuedAt:"2026-09-28T00:00:00Z"} : {}),retrievedAt:stamp,...overrides});
}
function nasaPayload(date="2026-09-27",overrides={}){
  const parameter={T2M:{},ALLSKY_SFC_SW_DWN:{},CLRSKY_SFC_SW_DWN:{}};
  for(let hour=0;hour<24;hour++){
    const key=new Date(Date.parse(date+"T00:00:00+09:00")+hour*3600000).toISOString().slice(0,13).replace(/[-T]/g,"");
    parameter.T2M[key]=10+hour/2;parameter.ALLSKY_SFC_SW_DWN[key]=0.5;parameter.CLRSKY_SFC_SW_DWN[key]=1;
  }
  return {header:{time_standard:"UTC",fill_value:-999,sources:["MERRA2","SYN1DEG"]},properties:{parameter},parameters:{T2M:{units:"C"},ALLSKY_SFC_SW_DWN:{units:"MJ/hr"},CLRSKY_SFC_SW_DWN:{units:"MJ/hr"}},...overrides};
}
function metPayload(start="2026-09-28T00:00:00+09:00",hours=72){
  return {properties:{meta:{updated_at:"2026-09-27T12:00:00Z",units:{air_temperature:"celsius",cloud_area_fraction:"%"}},
    timeseries:Array.from({length:hours+1},(_,i)=>({time:new Date(Date.parse(start)+i*3600000).toISOString(),
      data:{instant:{details:{air_temperature:12+i%24/2,cloud_area_fraction:50}}}}))}};
}
function options(daily,extra={}){return {daily,today:"2026-09-28",startDate:"2026-09-27",forecastEndDate:"2026-09-29",coordinates:coords,now,...extra};}
function requestMock(calls,payloads={}){
  return async(url,init)=>{
    calls.push({url,init});
    return new Response(JSON.stringify(url.includes("nasa") ? payloads.nasa || nasaPayload() : payloads.met || metPayload()),
      {status:200,headers:{Expires:"Mon, 28 Sep 2026 13:00:00 GMT","Last-Modified":"Mon, 28 Sep 2026 12:00:00 GMT"}});
  };
}
test("complete JMA fields cause no fallback requests and preserve all native values",async()=>{
  const calls=[],daily=[native("2026-09-27"),native("2026-09-28","forecast"),native("2026-09-29","forecast")];
  const result=await fetchWeatherFallbacks(options(daily,{request:requestMock(calls)}));
  assert.equal(calls.length,0);assert.deepEqual(result.daily,daily);assert.deepEqual(result.errors,[]);
});
test("NASA fills only missing historical extrema, stores UTC-to-JST aggregation, and never replaces JMA mean or light",async()=>{
  const calls=[],past=native("2026-09-27","observation",{minTemp:null,maxTemp:null});
  const result=await fetchWeatherFallbacks(options([past,native("2026-09-28","forecast"),native("2026-09-29","forecast")],{request:requestMock(calls)}));
  assert.equal(calls.length,1);assert.match(calls[0].url,/time-standard=UTC/);
  const day=result.daily[0];assert.equal(day.meanTemp,20);assert.equal(day.lightIndex,1);
  assert.equal(day.minTemp,10);assert.equal(day.maxTemp,21.5);assert.deepEqual(day.fallbackFields,["minTemp","maxTemp"]);
  assert.equal(day.fieldSources.minTemp.provider,"nasa-power");assert.equal(day.fieldSources.minTemp.grid,true);
  assert.equal(day.fieldSources.minTemp.availableAt,stamp);assert.match(day.fieldSources.minTemp.formula,/24 hourly/);
  const fit=engine.fit([],{asOf:stamp,weatherDaily:result.daily,validation:{methods:{},rows:{},selection:{}}});
  const prediction=engine.predict(fit,{plantingDate:"2026-09-27",targetDate:"2026-09-29",building:2,bed:"A"});
  assert.notEqual(prediction.status,"unknown");assert.equal(prediction.dayCounts.fallback,1);assert.equal(prediction.weatherFallbacks.length,1);
});
test("NASA radiation remains radiation, not sunshine duration, and missing hours/units/fill values cannot become measurements",()=>{
  const payload=nasaPayload(),day=parseNasaHourly(payload,"2026-09-27","2026-09-27",stamp)[0];
  assert.equal(day.lightIndex,0.56);assert.equal(day.sunshineHours,undefined);
  assert.equal(day.fieldSources.lightIndex.unit,"MJ/hr");assert.equal(day.fieldSources.lightIndex.rawSolarTotal,12);
  const key=Object.keys(payload.properties.parameter.T2M)[0];payload.properties.parameter.T2M[key]=-999;
  payload.properties.parameter.ALLSKY_SFC_SW_DWN[key]=-999;
  assert.equal(parseNasaHourly(payload,"2026-09-27","2026-09-27",stamp).length,0);
  assert.equal(parseNasaHourly({...nasaPayload(),header:{time_standard:"LST"}},"2026-09-27","2026-09-27",stamp).length,0);
});
test("today first reuses issued JMA forecasts; otherwise MET fills its coherent temperature set without overwriting existing JMA extrema",async()=>{
  const missing=native("2026-09-28","forecast",{meanTemp:null,minTemp:null});
  const reused=reuseJmaForecast(missing,native("2026-09-28","forecast"));
  assert.equal(reused.meanTemp,20);assert.equal(reused.fallbackUsed,false);
  const calls=[];
  const result=await fetchWeatherFallbacks(options([native("2026-09-27"),missing,native("2026-09-29","forecast")],{request:requestMock(calls)}));
  assert.equal(calls.length,1);assert.match(calls[0].url,/api.met.no/);
  const day=result.daily[1];assert.equal(day.maxTemp,25);assert.equal(day.lightIndex,1);
  assert.equal(day.minTemp,12);assert.equal(day.meanTemp,17.75);
  assert.equal(day.fieldSources.meanTemp.provider,"met-no");assert.equal(day.fieldSources.meanTemp.temperatureSet.maxTemp,23.5);
  const context=engine.prepareWeather(result.daily,{asOf:stamp});assert.ok(context.getDay("2026-09-28"));
  assert.equal(context.getGap("2026-09-28"),null);
});
test("MET fills future internal missing dates, keeps the JMA horizon, and counts supplements below native reliability",async()=>{
  const calls=[],daily=[native("2026-09-27"),native("2026-09-28","forecast")];
  const result=await fetchWeatherFallbacks(options(daily,{request:requestMock(calls)}));
  assert.deepEqual(result.daily.map(day=>day.date),["2026-09-27","2026-09-28","2026-09-29"]);
  const context=engine.prepareWeather(result.daily,{asOf:stamp});
  assert.equal(context.forecastEndDate,"2026-09-29");assert.equal(context.getDay("2026-09-30"),null);
  const nativeUnits=engine._test.accumulate(context,"2026-09-28","2026-09-28",{});
  const alternative=engine._test.accumulate(context,"2026-09-29","2026-09-29",{});
  assert.equal(alternative.dayCounts.fallback,1);assert.equal(alternative.dayCounts.unavailable,0);
  assert.ok(alternative.weatherReliability<nativeUnits.weatherReliability);
});
test("today requires JMA observations plus remaining MET forecast to cover the full day; partial-day averages cannot substitute for a day",()=>{
  const today=metPayload("2026-09-28T21:00:00+09:00",27);
  assert.equal(parseMetForecast(today,stamp)[0].date,"2026-09-29","remaining hours alone must not count as today's daily mean");
  const payload=Object.fromEntries(Array.from({length:21},(_,hour)=>[`20260928${String(hour).padStart(2,"0")}0000`,{temp:[20,0]}]));
  const observed=parseJmaTodayPoints(payload,"2026-09-28",stamp),rows=parseMetForecast(today,stamp,observed);
  assert.equal(rows[0].date,"2026-09-28");assert.equal(rows[0].fieldSources.meanTemp.coverageHours,24);
  assert.equal(rows[0].fieldSources.meanTemp.jmaObservationHours,20);assert.equal(rows[0].fieldSources.meanTemp.completeDailyCoverage,true);
  assert.equal(rows[0].lightIndex,null,"past hours of cloud coverage cannot be invented");
  assert.equal(rows[1].fieldSources.meanTemp.coverageHours,24);
  assert.equal(parseMetForecast(today,stamp,observed.slice(1))[0].date,"2026-09-29","missing midnight leaves today unavailable");
  assert.equal(parseJmaTodayPoints({"20260928000000":{temp:[20,1]}},"2026-09-28",stamp).length,0,"JMA quality flags must be respected");
  const future=metPayload("2026-09-29T06:00:00+09:00",18);
  assert.equal(parseMetForecast(future,stamp).length,0);
});
test("provider failure keeps missing values missing and diagnostics list the exact date and fields",async()=>{
  const calls=[],bad=native("2026-09-29","forecast",{meanTemp:null,minTemp:null,lightIndex:null});
  const result=await fetchWeatherFallbacks(options([native("2026-09-27"),native("2026-09-28","forecast"),bad],{
    request:async url=>{calls.push(url);throw new Error("HTTP 503");}}));
  assert.equal(calls.length,1);assert.ok(result.errors.includes("HTTP 503"));
  assert.equal(result.daily[2].meanTemp,null);assert.equal(result.daily[2].lightIndex,null);
  const fit=engine.fit([],{asOf:stamp,weatherDaily:result.daily,validation:{methods:{},rows:{},selection:{}}});
  const output=engine.predict(fit,{plantingDate:"2026-09-27",targetDate:"2026-09-29",building:2,bed:"A"});
  assert.equal(output.status,"unknown");assert.equal(output.dayCounts.unavailable,1);
  assert.deepEqual(output.weatherGaps[0].fields,["meanTemp","light","minTemp"]);
  const absent=engine.prepareWeather([native("2026-09-27","observation",{meanTemp:null,lightIndex:null})],{asOf:stamp});
  assert.equal(absent.getDay("2026-09-27"),null,"new missing past data cannot silently become a generic climate average");
  const absentMean=engine.prepareWeather([native("2026-09-27","observation",{meanTemp:null})],{asOf:stamp});
  assert.equal(absentMean.getDay("2026-09-27"),null,"valid extrema cannot silently invent a missing measured daily mean");
});
test("fallback publication and retrieval timestamps stop future leakage into growth and risk historical contexts",()=>{
  const nasa=parseNasaHourly(nasaPayload(),"2026-09-27","2026-09-27",stamp)[0];
  const nativeDay=native("2026-09-27","observation",{lightIndex:null});
  const mixed=supplementDay(nativeDay,nasa),before=engine.prepareWeather([mixed],{asOf:"2026-09-28T00:00:00+09:00"});
  assert.equal(before.observations.get("2026-09-27").meanTemp,20);
  assert.equal(before.observations.get("2026-09-27").lightIndex,null);assert.equal(before.getDay("2026-09-27"),null);
  const fittedRisk=risk.fit([],{asOf:"2026-09-28T00:00:00+09:00",weatherDaily:[mixed]});
  assert.equal(fittedRisk.weatherInput[0].lightIndex,mixed.lightIndex,"raw source input is not mutated by the cutoff");
  const met=parseMetForecast(metPayload(),stamp)[1];
  const supplemented=supplementDay(native("2026-09-29","forecast",{meanTemp:null,minTemp:null,maxTemp:null}),met);
  assert.equal(engine.prepareWeather([supplemented],{asOf:"2026-09-28T10:00:00Z"}).getDay("2026-09-29"),null);
  const copied=JSON.stringify(mixed);engine.prepareWeather([mixed],{asOf:stamp}).getDay("2026-09-27");assert.equal(JSON.stringify(mixed),copied);
});
test("provider caches honour MET expiry/If-Modified-Since and NASA's bounded retry; JMA repair still tracks native holes",async()=>{
  const calls=[],daily=[native("2026-09-27","observation",{lightIndex:null}),native("2026-09-28","forecast"),native("2026-09-29","forecast",{lightIndex:null})];
  const first=await fetchWeatherFallbacks(options(daily,{request:requestMock(calls)}));assert.equal(calls.length,2);
  const second=await fetchWeatherFallbacks(options(daily,{cache:first.cache,request:requestMock(calls)}));assert.equal(calls.length,2);
  const coverage=getGrowthWeatherCoverage(second.daily,"2026-09-27","2026-09-27");assert.equal(coverage.lightMissingDays,1);
  const later=await fetchWeatherFallbacks(options(daily,{now:new Date(now.getTime()+2*3600000),cache:first.cache,
    request:async(url,init)=>{assert.ok(init.headers["If-Modified-Since"]);return new Response(null,{status:304,headers:{Expires:"Mon, 28 Sep 2026 16:00:00 GMT"}});}}));
  assert.equal(later.daily[2].fallbackUsed,true);assert.equal(later.daily[2].fieldSources.lightIndex.availableAt,stamp,"304 must not invent a new forecast capture time");
});
test("NASA caches only needed dates and does not retry unneeded solar data when native JMA light is complete",async()=>{
  const payload=nasaPayload();payload.properties.parameter.ALLSKY_SFC_SW_DWN={};
  const calls=[],daily=[native("2026-09-27","observation",{minTemp:null,maxTemp:null}),native("2026-09-28","forecast"),native("2026-09-29","forecast")];
  const first=await fetchWeatherFallbacks(options(daily,{request:requestMock(calls,{nasa:payload})}));
  assert.equal(first.cache.nasa.daily.length,1);assert.equal(first.cache.nasa.daily[0].lightIndex,null);
  await fetchWeatherFallbacks(options(daily,{now:new Date(now.getTime()+2*86400000),cache:first.cache,request:requestMock(calls,{nasa:payload})}));
  assert.equal(calls.length,1,"solar latency must not trigger requests for a day whose JMA light is complete");
});
test("partially supplemented days stay visible when another required field remains missing",()=>{
  const value=supplementDay(native("2026-09-27","observation",{meanTemp:null,lightIndex:null}),{fallbackProvider:"nasa-power",meanTemp:20,
    fieldSources:{meanTemp:{provider:"nasa-power",estimated:true,retrievedAt:stamp,availableAt:stamp}}});
  const context=engine.prepareWeather([value],{asOf:stamp});
  assert.equal(context.getDay(value.date),null);assert.equal(context.getFallbacks(value.date,value.date).length,1);
  assert.deepEqual(context.getGap(value.date).fields,["light"]);
});
test("native CSV reads all extrema, retains missing days, and the API omits private provider caches",()=>{
  const rows=parseJmaPastDailyCsv("2026,9,27,20,25,15,8\n2026,9,28,,,,",{extrema:true});
  assert.equal(rows[0].maxTemp,25);assert.equal(rows[0].minTemp,15);assert.equal(rows[0].sunshineHours,8);assert.equal(rows.length,2);
  const response=buildGrowthWeatherResponse({normal_json:JSON.stringify({weatherPolicy:WEATHER_POLICY,fallbackCache:{met:{daily:Array(30).fill({})}}}),daily_json:"[]"});
  assert.equal(response.weatherPolicy,WEATHER_POLICY);assert.equal(response.normal.fallbackCache,undefined);
});
test("one fallback day lowers moderate confidence; many fallback days reduce the existing continuous information weight further",()=>{
  const asOf="2025-06-01T12:00:00+09:00";
  const daily=Array.from({length:151},(_,i)=>native(engine.addDays("2025-01-01",i)));
  const forecast=Array.from({length:7},(_,i)=>prepareJmaDay({date:engine.addDays("2025-06-01",i),source:"forecast",
    meanTemp:20,minTemp:15,maxTemp:25,lightIndex:1,issuedAt:"2025-06-01T06:00:00+09:00"}));
  const samples=Array.from({length:22},(_,i)=>{const plantingDate=engine.addDays("2025-01-01",i*7);return {id:`row-${i}`,groupId:`g-${i}`,cropId:`c-${i}`,
    plantingDate,date:engine.addDays(plantingDate,29),readyDate:engine.addDays(plantingDate,25),building:3,bed:"A",sizeRating:"normal"};});
  const forecastHistory=samples.flatMap(row=>Array.from({length:4},(_,i)=>({date:engine.addDays(row.date,i-3),source:"forecast",meanTemp:20,lightIndex:1,
    issuedAt:engine.addDays(row.date,-3)+"T00:00:00+09:00",availableAt:engine.addDays(row.date,-3)+"T00:00:00+09:00"})));
  const fit=engine.fit(samples,{asOf,weatherDaily:[...daily,...forecast],forecastHistory});
  const snapshot=engine.exportModel(fit),query={plantingDate:"2025-05-15",targetDate:"2025-06-07",building:3,bed:"A"};
  const normal=engine.predict(fit,query);assert.equal(normal.confidence.level,"moderate");
  const supplement=(day)=>supplementDay(native(day.date,"observation",{lightIndex:null}),{
    fallbackProvider:"nasa-power",lightIndex:1,fieldSources:{lightIndex:{provider:"nasa-power",estimated:true,
      availableAt:"2025-05-31T00:00:00Z",retrievedAt:"2025-05-31T00:00:00Z"}}});
  const one=[...daily.map(day=>day.date==="2025-05-30"?supplement(day):day),...forecast];
  const many=[...daily.map(day=>day.date>="2025-05-15"?supplement(day):day),...forecast];
  const altered=weatherDaily=>engine.predict(engine.hydrateModel(snapshot,{asOf,weatherDaily}),query);
  const single=altered(one),multiple=altered(many);
  assert.equal(single.confidence.level,"reference");assert.equal(single.confidence.fallbackDays,1);
  assert.ok(multiple.weatherReliability<single.weatherReliability);assert.ok(single.weatherReliability<normal.weatherReliability);
  assert.equal(JSON.stringify(engine.exportModel(fit)),JSON.stringify(snapshot),"weather refresh cannot alter the saved generation coefficients");
});
test("legacy saved inputs keep the same calculated results and genuinely missing auxiliary extrema need not stop growth",()=>{
  const daily=[{date:"2026-09-27",source:"observation",meanTemp:20,lightIndex:null},
    {date:"2026-09-28",source:"forecast",meanTemp:20,lightIndex:1,issuedAt:"2026-09-28T00:00:00Z"}];
  const query={plantingDate:"2026-09-27",targetDate:"2026-09-28",building:2,bed:"A"},validation={methods:{},rows:{},selection:{}};
  // Frozen from 48bbabb / 20260928-growth-weather-gaps, without requiring Git history.
  const before={ratio:0.06045751633986929,progress:0.06045751633986929,readyDate:null,readyEnd:null,status:"small",
    weatherReliability:0.4378037864628088,confidence:{level:"reference"}};
  const after=engine.predict(engine.fit([],{asOf:stamp,weatherDaily:daily,validation}),query);
  for(const field of ["ratio","progress","readyDate","readyEnd","status","weatherReliability"]) assert.equal(after[field],before[field],field);
  assert.equal(after.confidence.level,before.confidence.level);
  const auxiliary=engine.prepareWeather([native("2026-09-27","observation",{minTemp:null})],{asOf:stamp});
  assert.ok(auxiliary.getDay("2026-09-27"));assert.deepEqual(auxiliary.getGap("2026-09-27").fields,["minTemp"]);
  assert.equal(auxiliary.getGap("2026-09-27").unavailable,false);
});
