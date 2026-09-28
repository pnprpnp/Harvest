// Derived calibration reports. Frozen forecasts and farm records are never rewritten.
(function(root,factory){
  const api=factory();
  if(typeof module==="object" && module.exports) module.exports=api;
  if(root) root.HarvestGrowthCalibration=api;
})(typeof globalThis!=="undefined" ? globalThis : this,function(){
  "use strict";
  const finite=value=>typeof value==="number" && Number.isFinite(value);
  const instant=value=>typeof value==="number" ? (finite(value) ? value : NaN)
    : typeof value==="string" && value ? Date.parse(value.length===10 ? value+"T00:00:00+09:00" : value) : NaN;
  const day=value=>Number.isFinite(instant(value)) ? new Date(instant(value)+9*3600000).toISOString().slice(0,10) : "";
  const difference=(a,b)=>Math.round((instant(b)-instant(a))/86400000);
  const average=values=>values.length ? values.reduce((a,b)=>a+b,0)/values.length : null;
  const symptoms=["elongated","uneven","tipburn"];
  const thresholds=Object.freeze({summaryCrops:16,summarySpanDays:42,calibrationCrops:20,validationCrops:20,
    calibrationSpanDays:90,validationOrigins:5,targetCoverage:0.8,minimumCoverage:0.7});
  // Connected crop/harvest identities prevent shared labels and split pallets
  // from inflating support, including when one crop spans several harvests.
  function components(rows){
    const parent=new Map();
    function find(key){if(!parent.has(key)) parent.set(key,key);if(parent.get(key)!==key) parent.set(key,find(parent.get(key)));return parent.get(key);}
    const tokens=rows.map((row,index)=>[row.cropId ? `crop:${row.cropId}` : "",row.groupId ? `group:${row.groupId}` : "",
      row.plantingEventId ? `planting:${row.plantingEventId}` : ""].filter(Boolean));
    tokens.forEach((keys,index)=>{if(!keys.length) keys.push(`unknown:${index}`);keys.forEach(key=>parent.set(find(key),find(keys[0])));});
    const groups=new Map();rows.forEach((row,index)=>{const key=find(tokens[index][0]);if(!groups.has(key)) groups.set(key,[]);groups.get(key).push(row);});
    return [...groups.values()];
  }
  function measure(groups,getter){
    const values=groups.map(group=>average(group.map(getter).filter(finite))).filter(finite);
    return {independentCrops:values.length,value:average(values)};
  }
  function period(rows){const dates=rows.map(row=>day(row.outcomeDate)).filter(Boolean).sort();return {start:dates[0] || null,end:dates.at(-1) || null,spanDays:dates.length ? difference(dates[0],dates.at(-1)) : 0};}
  function summarize(rows){
    const groups=components(rows),range=period(rows);
    const metric=getter=>{const result=measure(groups,getter);return {...result,status:result.independentCrops>=thresholds.summaryCrops && range.spanDays>=thresholds.summarySpanDays ? "reference-evaluation" : "insufficient-data"};};
    return {predictions:rows.length,independentCrops:groups.length,period:range,
      readyMAE:metric(row=>finite(row.readyError) ? Math.abs(row.readyError) : null),
      readyBias:metric(row=>row.readyError),intervalCoverage:metric(row=>row.intervalHit),
      sizeAccuracy:metric(row=>finite(row.ordinalError) ? Number(row.ordinalError===0) : null),
      quality:Object.fromEntries(symptoms.map(key=>[key,{mae:metric(row=>row.qualityErrors?.[key]),
        accuracy:metric(row=>finite(row.qualityErrors?.[key]) ? Number(row.qualityErrors[key]===0) : null)}])),
      cases:{mae:metric(row=>finite(row.caseError) ? Math.abs(row.caseError) : null),bias:metric(row=>row.caseError),
        coverage:metric(row=>row.caseIntervalHit)},
      confidenceLabel:groups.length ? "参考値・低" : "データ不足"};
  }
  const quantile=(values,p)=>{const sorted=values.slice().sort((a,b)=>a-b);return sorted.length ? sorted[Math.max(0,Math.min(sorted.length-1,Math.ceil((sorted.length+1)*p)-1))] : null;};
  function intervalProposal(rows){
    const known=rows.filter(row=>row.provenanceVerified===true && finite(row.readyError));
    const groups=components(known),origins=[...new Set(known.map(row=>row.asOf))].sort();
    const base={status:"insufficient-data",applied:false,targetCoverage:thresholds.targetCoverage,independentCrops:groups.length,
      calibrationCrops:0,validationCrops:0,validationCoverage:null,offsets:null,highEligible:false};
    // Find the first temporal split with 20 completed calibration crops and
    // 20 wholly later crops. A shared crop/label never crosses the split.
    for(const origin of origins){
      const cutoff=instant(origin);
      const training=groups.filter(group=>group.every(row=>instant(row.availableAt)<cutoff && instant(row.outcomeDate)<cutoff));
      const trainingSet=new Set(training);
      const validation=groups.filter(group=>!trainingSet.has(group) && group.every(row=>instant(row.asOf)>=cutoff));
      if(training.length<thresholds.calibrationCrops || validation.length<thresholds.validationCrops) continue;
      const residuals=training.map(group=>average(group.map(row=>row.readyError)));
      const lower=-quantile(residuals,0.9),upper=-quantile(residuals,0.1);
      // Validation uses the same interval fixed BEFORE these forecasts existed.
      const hits=validation.map(group=>average(group.map(row=>Number(-row.readyError>=lower && -row.readyError<=upper))));
      const validationRows=validation.flat(),coverage=average(hits),original=measure(validation,row=>row.intervalHit).value;
      const originCount=new Set(validationRows.map(row=>row.asOf)).size;
      const enough=period(known).spanDays>=thresholds.calibrationSpanDays && originCount>=thresholds.validationOrigins;
      const passed=enough && coverage>=thresholds.minimumCoverage && (original===null || coverage>=original-0.05);
      const confidence=validationRows.map(row=>row.confidence);
      return {...base,status:passed ? "validated-reference" : enough ? "validation-failed" : "insufficient-data",
        calibrationCrops:training.length,validationCrops:validation.length,validationOrigins:originCount,
        validationCoverage:coverage,originalCoverage:original,validationPeriod:period(validationRows),cutoff:origin,
        offsets:{startDays:lower,endDays:upper},widthDays:upper-lower,
        // A ready-date-only check cannot certify size, quality, cases or weather.
        highEligible:false,confidenceGroups:[...new Set(confidence)],
        reason:passed ? "chronological-holdout-passed-reference-only" : "insufficient-or-failed-holdout"};
    }
    return base;
  }
  function build({rows=[],caseRows=[],asOf,modelVersion}={}){
    const cutoff=instant(asOf),date=day(asOf);
    if(!Number.isFinite(cutoff)) throw new Error("校正には評価時点が必要です");
    const excluded={future:0,unavailable:0,invalid:0,duplicate:0},seen=new Set();
    const normalized=[...rows,...caseRows.map(row=>({...row,caseError:row.error,caseIntervalHit:row.intervalHit,
      intervalHit:null,readyError:null,ordinalError:null,metricKind:"cases"}))].filter(row=>{
      if(!row || !row.cropId && !row.groupId || !day(row.outcomeDate) || !day(row.asOf)){excluded.invalid++;return false;}
      if(day(row.outcomeDate)>=date || instant(row.asOf)>=cutoff){excluded.future++;return false;}
      if(row.availableAt!=null && row.availableAt!=="" && (!Number.isFinite(instant(row.availableAt)) || instant(row.availableAt)>=cutoff)){excluded.unavailable++;return false;}
      if(modelVersion && row.modelVersion!==modelVersion) return false;
      const key=JSON.stringify([row.modelVersion,row.metricKind,row.id,row.predictionId,row.asOf]);
      if(seen.has(key)){excluded.duplicate++;return false;}seen.add(key);return true;
    });
    const section=local=>({metrics:summarize(local),interval:new Set(local.map(row=>row.modelVersion || "unknown")).size>1
      ? {status:"mixed-generations",applied:false,highEligible:false,independentCrops:components(local).length}
      : intervalProposal(local)});
    const groupBy=getter=>Object.fromEntries([...new Set(normalized.map(getter).filter(value=>value!==""))].sort().map(key=>[key,section(normalized.filter(row=>getter(row)===key))]));
    const recent=new Date(cutoff-90*86400000).toISOString().slice(0,10);
    return {schemaVersion:1,kind:"saved-forecast-calibration",asOf,modelVersion:modelVersion || null,thresholds,excluded,
      all:section(normalized),recent:section(normalized.filter(row=>day(row.outcomeDate)>=recent)),
      seasons:groupBy(row=>String(Math.floor((Number(day(row.outcomeDate).slice(5,7))%12)/3))),
      buildings:groupBy(row=>row.building==null ? "" : String(row.building)),
      byConfidence:groupBy(row=>row.confidence || "reference"),
      generations:groupBy(row=>row.modelVersion || "unknown"),
      productionConfidenceChanged:false,
      limitations:["予測・結果の元データは変更しません。件数だけで高信頼度へ昇格しません。",
        "区間補正は、当時のモデル・入力時刻を確認できる同じ世代の保存予測だけで検証します。",
        "20作で補正幅を決め、その後の別20作・5予測時点・全体90日以上で検証する参考提案です。",
        "採用済みの予測区間へ自動適用しません。地点・季節ごとの実績不足は不足のまま表示します。"]};
  }
  return Object.freeze({schemaVersion:1,thresholds,build,summarize,intervalProposal});
});
