"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const engine=require("../src/scripts/growth-model.js"),analysis=require("../src/scripts/growth-analysis.js");
function weather(start,count,extra={}){return Array.from({length:count},(_,i)=>({date:engine.addDays(start,i),source:"observation",meanTemp:18,lightIndex:1,...extra}));}
function fixture(){
  const asOf="2025-01-26T12:00:00+09:00",analysisAsOf="2025-02-03T12:00:00+09:00";
  const weatherDaily=weather("2025-01-01",25).concat(weather("2025-01-26",7,
    {source:"forecast",meanTemp:10,issuedAt:"2025-01-26T06:00:00+09:00"}));
  const observedDaily=weather("2025-01-26",7);
  const input={plantingDate:"2025-01-01",targetDate:"2025-02-01",building:2,bed:"A",palletKeys:["2-A-1"]};
  const fitted=engine.fit([],{asOf,weatherDaily,selectedMethod:"safe",validation:{methods:{},rows:{},selection:{}}});
  return {engine,asOf,analysisAsOf,weatherDaily,observedDaily,input,
    modelSnapshot:engine.exportModel(fitted,{modelVersion:"diagnostic-frozen"}),savedPrediction:engine.predict(fitted,input),actual:{readyDate:"2025-01-28"}};
}

test("weather substitution decomposes the saved date error with identical model and input",()=>{
  const options=fixture(),before=JSON.stringify(options);
  const result=analysis.analyzeFailure(options);
  assert.equal(result.productionEligible,false);assert.equal(result.reference,true);assert.equal(result.reproduced,true);
  assert.equal(result.weather.temperature.mae,8);assert.equal(result.weather.temperature.meanError,-8);
  assert.equal(result.weather.forecastDays,7);assert.equal(result.substitutedDays,7);
  assert.equal(result.decomposition.originalReadyDate,"2025-01-31");
  assert.equal(result.decomposition.observedWeatherReadyDate,"2025-01-27");
  assert.equal(result.decomposition.totalErrorDays,3);
  assert.equal(result.decomposition.weatherEffectDays,4);assert.equal(result.decomposition.remainingErrorDays,-1);
  assert.equal(result.decomposition.weatherEffectDays+result.decomposition.remainingErrorDays,result.readyErrorDays);
  assert.equal(JSON.stringify(options),before,"analysis cannot mutate any saved input");
});

test("partial, not-yet-published and estimated observations cannot produce a complete causal split",()=>{
  for(const change of [days=>days.slice(0,6),days=>days.map(row=>({...row,availableAt:"2025-02-05"})),
    days=>days.map(row=>({...row,estimatedTemperature:true}))]){
    const options=fixture();options.observedDaily=change(options.observedDaily);
    const result=analysis.analyzeFailure(options);
    assert.equal(result.decomposition,null);assert.ok(result.weather.missingDates.length>0);
  }
  const options=fixture();options.observedDaily[0].meanTemp=null;
  const partial=analysis.analyzeFailure(options);assert.equal(partial.decomposition,null);assert.equal(partial.weather.temperature.count,6);
});

test("changed saved predictions or missing coefficient snapshots do not masquerade as reproduced models",()=>{
  const changed=fixture();changed.savedPrediction={...changed.savedPrediction,ratio:999};
  const result=analysis.analyzeFailure(changed);assert.equal(result.reproduced,false);assert.equal(result.decomposition,null);
  const old=fixture();delete old.modelSnapshot;
  const limited=analysis.analyzeFailure(old);assert.equal(limited.decomposition,null);assert.equal(limited.weather.temperature.count,7);
  assert.equal(limited.readyErrorDays,3);
});

test("size ratings do not create a true ready date and future confirmations remain unknown",()=>{
  const options=fixture();options.actual={sizeRating:"normal"};
  let result=analysis.analyzeFailure(options);assert.equal(result.readyErrorDays,null);assert.equal(result.decomposition,null);
  options.actual={readyDate:"2025-02-10"};result=analysis.analyzeFailure(options);assert.equal(result.readyErrorDays,null);
  options.actual={readyDate:"2025-01-28",availableAt:"2025-02-05"};result=analysis.analyzeFailure(options);assert.equal(result.readyErrorDays,null);
});

test("manual date correction is evaluated separately without entering model coefficients",()=>{
  const options=fixture();options.manualOffsetDays=-2;
  const result=analysis.analyzeFailure(options);
  assert.deepEqual(result.manualCorrection,{days:-2,rawErrorDays:3,adjustedErrorDays:1,absoluteErrorImprovementDays:2});
  assert.equal(result.decomposition.totalErrorDays,3);
  options.manualOffsetDays=2;
  assert.equal(analysis.analyzeFailure(options).manualCorrection.absoluteErrorImprovementDays,-2);
});

test("special-condition context respects the crop scope and never asserts an unmeasured cause",()=>{
  const options=fixture();options.conditions=[
    {kind:"condition",building:2,bed:"A",startDate:"2025-01-02",endDate:"2025-01-03",palletKeys:["2-A-1"]},
    {kind:"condition",building:3,bed:"A",startDate:"2025-01-02"},
    {kind:"condition",building:2,bed:"B",startDate:"2025-01-02"},
    {kind:"condition",building:2,bed:"A",startDate:"2025-02-20"},
    {kind:"condition",building:2,bed:"A",startDate:"2025-01-02",deletedAt:"2025-01-05"}
  ];
  const result=analysis.analyzeFailure(options);
  assert.equal(result.context[0].count,1);assert.match(result.context[0].reason,/因果関係は未確定/);
});

test("weather diagnostics do not extend the original forecast or accept future-issued forecasts",()=>{
  const options=fixture();options.observedDaily.push(...weather("2025-02-02",30,{meanTemp:40}));
  assert.equal(analysis.compareWeather(options).forecastDays,7);
  const future=fixture();future.weatherDaily=future.weatherDaily.map(row=>row.source==="forecast"?{...row,issuedAt:"2025-01-27T06:00:00+09:00"}:row);
  assert.equal(analysis.compareWeather(future).forecastDays,0);
  assert.throws(()=>analysis.compareWeather({...options,analysisAsOf:"2025-01-01"}));
});
