// Post-outcome diagnostics only. These results must never replace a saved
// forecast, enter a historical performance score, or become training labels.
(function(root,factory){
  const api = factory();
  if(typeof module === "object" && module.exports) module.exports = api;
  if(root) root.HarvestGrowthAnalysis = api;
})(typeof globalThis !== "undefined" ? globalThis : this,function(){
  "use strict";
  const number = value => typeof value === "number" && Number.isFinite(value) ? value : null;
  const mean = values => values.length ? values.reduce((sum,value)=>sum+value,0)/values.length : null;
  const errorSummary = values => ({count:values.length,meanError:mean(values),mae:mean(values.map(Math.abs))});
  function resolveEngine(options){
    const engine = options.engine || (typeof HarvestGrowthModel !== "undefined" ? HarvestGrowthModel : null);
    if(!engine || typeof engine.prepareWeather !== "function") throw new Error("生育モデルの診断機能を利用できません");
    return engine;
  }
  function compareWeather(options){
    const engine = resolveEngine(options);
    if(!engine.dateKey(options.asOf) || !engine.dateKey(options.analysisAsOf)
      || engine.dateKey(options.analysisAsOf) < engine.dateKey(options.asOf)) throw new Error("元の予測日時と分析日時を指定してください");
    const forecast = engine.prepareWeather(options.weatherDaily || [],{asOf:options.asOf,forecastHistory:options.forecastHistory});
    const observed = engine.prepareWeather(options.observedDaily || [],{asOf:options.analysisAsOf});
    const from = engine.dateKey(options.fromDate) || engine.dateKey(options.asOf);
    const through = engine.dateKey(options.throughDate) || forecast.forecastEndDate;
    const temperature = [], light = [], sunshine = [], observedDates = [], missingDates = [];
    const dates = [...forecast.forecasts.keys()].filter(date => date >= from && through && date <= through).sort();
    dates.forEach(date=>{
      const a=forecast.forecasts.get(date), b=observed.observations.get(date);
      if(!b || b.estimatedTemperature === true || b.estimatedLight === true || b.estimated === true){ missingDates.push(date);return; }
      if(number(b.meanTemp)===null || number(b.lightIndex)===null) missingDates.push(date);
      else observedDates.push(date);
      if(number(a.meanTemp)!==null && number(b.meanTemp)!==null) temperature.push(a.meanTemp-b.meanTemp);
      if(number(a.lightIndex)!==null && number(b.lightIndex)!==null) light.push(a.lightIndex-b.lightIndex);
      if(number(a.sunshineHours)!==null && number(b.sunshineHours)!==null) sunshine.push(a.sunshineHours-b.sunshineHours);
    });
    return {forecastDays:dates.length,observedDays:observedDates.length,missingDates,
      coverage:dates.length ? observedDates.length/dates.length : null,
      temperature:errorSummary(temperature),lightProxy:errorSummary(light),sunshineHours:errorSummary(sunshine),
      signConvention:"forecast-minus-observation",lightIsProxy:true};
  }
  function analyzeFailure(options){
    const engine = resolveEngine(options), saved = options.savedPrediction || {}, actual = options.actual || {};
    const analysisDate = engine.dateKey(options.analysisAsOf), origin = engine.dateKey(options.asOf);
    if(!analysisDate || !origin || analysisDate < origin) throw new Error("分析日時は元の予測日時以降にしてください");
    const ready = engine.dateKey(actual.readyDate), savedReady = engine.dateKey(saved.readyDate);
    const knownReady = ready && ready <= analysisDate && (!actual.availableAt || Date.parse(actual.availableAt) <= Date.parse(options.analysisAsOf));
    const rawError = savedReady && knownReady ? engine.daysBetween(ready,savedReady) : null;
    const result = {schemaVersion:1,kind:"retrospective-failure-analysis",reference:true,productionEligible:false,
      modelVersion:options.modelSnapshot?.modelVersion || options.modelVersion || null,
      asOf:options.asOf,analysisAsOf:options.analysisAsOf,readyErrorDays:rawError,
      weather:compareWeather({...options,fromDate:origin}),reproduced:false,
      decomposition:null,manualCorrection:null,context:[],reasons:[],
      limitations:["実測への差替えは事後の参考診断です。当時の予測精度や学習用の正解としては扱いません。",
        "差替え後の残差には生育式・号棟や位置の補正・苗の差・記録誤差等が含まれ、単独の原因を断定できません。",
        "光の指標は日照時間や天気からの代用値で、植物が受けた実日射量の誤差ではありません。"]};
    if(!knownReady) result.reasons.push("実際の適期確認日が未入力または分析時点で未確定のため、日数誤差は未評価です。");
    if(result.weather.temperature.count) result.reasons.push(`予報と後日の実測を比較できる${result.weather.temperature.count}日分の平均気温MAEは${result.weather.temperature.mae.toFixed(1)}℃です。`);
    if(result.weather.missingDates.length) result.reasons.push(`元の予報${result.weather.forecastDays}日のうち${result.weather.missingDates.length}日は比較できる実測がありません。`);
    if(Number.isInteger(options.manualOffsetDays) && Math.abs(options.manualOffsetDays)<=30 && rawError!==null){
      const adjustedErrorDays=rawError+options.manualOffsetDays;
      result.manualCorrection={days:options.manualOffsetDays,rawErrorDays:rawError,adjustedErrorDays,
        absoluteErrorImprovementDays:Math.abs(rawError)-Math.abs(adjustedErrorDays)};
    }
    const conditions = (options.conditions || []).filter(condition=>{
      const start=engine.dateKey(condition.startDate),end=engine.dateKey(condition.endDate);
      if(condition.kind && condition.kind!=="condition") return false;
      if(condition.building!==undefined && condition.building!==options.input?.building) return false;
      if(condition.bed && condition.bed!==options.input?.bed) return false;
      if(condition.palletKeys?.length && !condition.palletKeys.some(key=>options.input?.palletKeys?.includes(key))) return false;
      return !condition.deletedAt && start && start<=analysisDate && start<=(ready||analysisDate)
        && (!end || end>=(engine.dateKey(options.input?.plantingDate)||origin));
    });
    if(conditions.length) result.context.push({kind:"specialConditions",count:conditions.length,
      reason:`栽培期間に重なる特殊条件記録が${conditions.length}件あります。因果関係は未確定です。`});
    const adjustment = options.input?.manualAdjustment;
    if(adjustment) result.context.push({kind:"manualEnvironment",value:JSON.parse(JSON.stringify(adjustment)),reason:"保存時の号棟手動補正を固定して比較します。"});
    if(!options.modelSnapshot || !options.input || !Array.isArray(options.weatherDaily) || !options.weatherDaily.length){
      result.reasons.push("保存時のモデル係数・栽培入力・気象一式が揃わないため、天気と生育式の日数誤差は分解できません。");return result;
    }
    if(typeof engine.diagnoseWeather!=="function"){
      result.reasons.push("保存モデルを固定する気象診断が利用できないため、原因別の日数は未評価です。");return result;
    }
    let diagnostic;
    try {
      diagnostic=engine.diagnoseWeather(options.modelSnapshot,{asOf:options.asOf,input:options.input,
        weatherDaily:options.weatherDaily,forecastHistory:options.forecastHistory,
        observedDaily:options.observedDaily,analysisAsOf:options.analysisAsOf});
    }catch(error){ result.reasons.push(`保存時の再計算に失敗しました: ${String(error.message||error).slice(0,150)}`);return result; }
    const original=diagnostic.original,counterfactual=diagnostic.counterfactual;
    if(!original || !counterfactual){result.reasons.push("同じ条件の比較結果を計算できませんでした。");return result;}
    const sameNumber=(a,b)=>a===b || number(a)!==null&&number(b)!==null&&Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a));
    result.reproduced = ["readyDate","status"].every(key=>saved[key]===undefined||saved[key]===original[key])
      && (saved.ratio===undefined||sameNumber(saved.ratio,original.ratio))
      && (saved.basis?.targetGrowthUnits===undefined||sameNumber(saved.basis.targetGrowthUnits,original.basis?.targetGrowthUnits));
    if(!result.reproduced){result.reasons.push("保存予測を再現できなかったため、モデルや設定の変更が混ざる日数分解は表示しません。");return result;}
    const missing = Array.isArray(diagnostic.missingObservationDays) ? diagnostic.missingObservationDays.length : diagnostic.missingObservationDays;
    const substituted = Array.isArray(diagnostic.substitutedDays) ? diagnostic.substitutedDays.length : diagnostic.substitutedDays;
    result.substitutedDays = substituted || 0;
    if(missing || !substituted || result.weather.missingDates.length){
      result.reasons.push("元の予報範囲全体の実測が揃っていないため、部分的な気象差を全誤差の原因とは扱いません。");return result;
    }
    const observedReady=engine.dateKey(counterfactual.readyDate),originalReady=engine.dateKey(original.readyDate);
    if(!knownReady || !observedReady || !originalReady){
      result.reasons.push("元の予報範囲内で両方の適期日を求められないため、気象による日数差は未評価です。");return result;
    }
    result.decomposition={totalErrorDays:engine.daysBetween(ready,originalReady),
      weatherEffectDays:engine.daysBetween(observedReady,originalReady),remainingErrorDays:engine.daysBetween(ready,observedReady),
      originalReadyDate:originalReady,observedWeatherReadyDate:observedReady,actualReadyDate:ready,
      signConvention:"predicted-minus-actual",reference:true};
    result.reasons.push(`同じモデル・入力のまま予報だけを実測へ差替えた適期日は、元の予測から${engine.daysBetween(originalReady,observedReady)}日変わりました。`);
    return result;
  }
  return Object.freeze({schemaVersion:1,compareWeather,analyzeFailure});
});
