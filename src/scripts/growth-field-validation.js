/* Retrospective field-assessment review. Never a training-label adapter. */
(function(root,factory){
  const api=factory();
  if(typeof module === "object" && module.exports) module.exports=api;
  if(root) root.HarvestGrowthFieldValidation=api;
})(typeof globalThis !== "undefined" ? globalThis : this,function(){
  "use strict";
  const DAY=86400000, KEY=/^[2-9]-[A-F]-(?:[1-9]|[1-6][0-9]|7[0-8])$/;
  const QUALITY=["elongated","uneven","tipburn"], SIZE={small:0,normal:1,large:2};
  const MINIMUM_CROPS=20;
  const instant=value=>typeof value === "number" && Number.isFinite(value) ? value
    : value instanceof Date ? value.getTime() : typeof value === "string" && value.trim() ? Date.parse(value) : NaN;
  function day(value){
    if(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)){
      const time=Date.parse(value+"T00:00:00Z");
      return Number.isFinite(time) && new Date(time).toISOString().slice(0,10)===value ? value : null;
    }
    const time=instant(value);return Number.isFinite(time) ? new Date(time+9*3600000).toISOString().slice(0,10) : null;
  }
  function cutoff(value){
    const date=day(value), time=instant(typeof value === "string" && value.length===10 ? value+"T00:00:00+09:00" : value);
    if(!date || !Number.isFinite(time)) throw new Error("途中評価の検証には有効な判定日時が必要です");
    return {date,time};
  }
  const days=(a,b)=>Math.round((Date.parse(b+"T00:00:00Z")-Date.parse(a+"T00:00:00Z"))/DAY);
  function palletKeys(value){
    if(!Array.isArray(value) || !value.length || value.some(key=>typeof key !== "string" || !KEY.test(key))) return [];
    return [...new Set(value)].sort();
  }
  function cropKey(row){
    const plantingDate=day(row?.plantingDate), id=row?.plantingEventId;
    return plantingDate && (typeof id === "string" && id.trim() || Number.isSafeInteger(id) && id>0) ? `${id}:${plantingDate}` : null;
  }
  function severity(value){
    return ({low:"slight",high:"many",present:"legacy-present"})[value]
      || (["none","slight","many","legacy-present"].includes(value) ? value : "unknown");
  }
  const quality=value=>Object.fromEntries(QUALITY.map(key=>[key,severity(value?.[key])]));
  const size=value=>Object.hasOwn(SIZE,value) ? value : "unknown";
  function knownTime(row,fallback){
    const values=[row.availableAt,row.recordedAt,row.createdAt,row.updatedAt,row.plantingAvailableAt].filter(value=>value!==undefined && value!==null && value!=="");
    if(values.some(value=>!Number.isFinite(instant(value)))) return NaN;
    return values.length ? Math.max(...values.map(instant)) : instant(fallback+"T23:59:59.999+09:00");
  }
  function observationEvents(observations,boundary){
    const byId=new Map();
    (Array.isArray(observations)?observations:[]).forEach(row=>{
      if(!row || !["fieldAssessment","ready"].includes(row.kind) || !row.observationId || !cropKey(row)) return;
      const date=day(row.kind==="ready" ? row.readyDate : row.date), keys=palletKeys(row.palletKeys);
      const created=instant(row.createdAt), updated=instant(row.updatedAt), known=knownTime(row,date);
      if(!date || !keys.length || date<day(row.plantingDate) || date>boundary.date || !Number.isFinite(created)
        || !Number.isFinite(updated) || updated<created || !Number.isFinite(known) || known>=boundary.time) return;
      const old=byId.get(String(row.observationId));
      if(!old || known>old.known || known===old.known && (row.revision||0)>(old.row.revision||0)) byId.set(String(row.observationId),{row,date,keys,known});
    });
    return [...byId.values()].filter(({row})=>!row.deletedAt || instant(row.deletedAt)>=boundary.time).map(({row,date,keys,known})=>({
      id:String(row.observationId),cropId:cropKey(row),plantingEventId:row.plantingEventId,plantingDate:day(row.plantingDate),
      kind:row.kind,date,palletKeys:keys,availableAt:new Date(known).toISOString(),
      size:row.kind==="fieldAssessment" ? size(row.payload?.size) : "unknown",
      quality:quality(row.kind==="fieldAssessment" ? row.payload?.quality : null),trainingEligible:false
    }));
  }
  function outcomeEvents(samples,boundary,excluded){
    const byId=new Map();
    (Array.isArray(samples)?samples:[]).forEach((row,index)=>{
      if(!row || !cropKey(row)) {excluded.missingCrop++;return;}
      const date=day(row.date || row.harvestDate), plantingDate=day(row.plantingDate), keys=palletKeys(row.palletKeys);
      const known=knownTime(row,date), age=date ? days(plantingDate,date) : 0;
      if(!date || age<1 || age>180 || !Number.isFinite(known) || known>=boundary.time || date>=boundary.date){excluded.notAvailableOrInvalid++;return;}
      const partial=String(row.signalKind||"").startsWith("partial-") || row.partialHarvest===true || row.type==="partialHarvest";
      if(!keys.length || partial && row.signalKind!=="partial-position" && row.positionKnown!==true){excluded.unknownPosition++;return;}
      if(row.estimatedPlanting===true || row.plantingDateEstimated===true){excluded.estimatedPlanting++;return;}
      const id=String(row.id || `${row.groupId || index}:${cropKey(row)}:${date}:${keys.join(",")}`);
      const event={id,cropId:cropKey(row),plantingEventId:row.plantingEventId,plantingDate,date,palletKeys:keys,
        kind:partial ? "partialHarvest" : "harvest",size:partial ? "large" : size(row.sizeRating),
        quality:partial ? quality(null) : quality(row.symptoms),availableAt:new Date(known).toISOString(),trainingEligible:false};
      const previous=byId.get(id);
      if(!previous || instant(previous.availableAt)<known) byId.set(id,event);
      const readyDate=day(row.readyDate);
      if(readyDate && readyDate>=plantingDate && readyDate<=date && !partial){
        byId.set(`${id}:ready`,{...event,id:`${id}:ready`,kind:"ready",date:readyDate,size:"unknown",quality:quality(null)});
      }
    });
    return [...byId.values()];
  }
  function transition(from,to,dateGap,ordinal){
    if(from==="unknown" || to==="unknown") return "unknown";
    if(from===to) return "unchanged";
    if(dateGap===0) return "sameDayDifference";
    if(ordinal[from]===undefined || ordinal[to]===undefined) return "changed";
    return ordinal[to]>ordinal[from] ? "increased" : "decreased";
  }
  function evaluate({samples=[],observations=[],asOf,maxCrops=256,maxEventsPerCrop=128,maxComparisons=2048}={}){
    const boundary=cutoff(asOf), excluded={missingCrop:0,notAvailableOrInvalid:0,unknownPosition:0,estimatedPlanting:0};
    const events=[...observationEvents(observations,boundary),...outcomeEvents(samples,boundary,excluded)];
    const groups=new Map();
    events.forEach(event=>{const rows=groups.get(event.cropId)||[];rows.push(event);groups.set(event.cropId,rows);});
    const candidates=[...groups].filter(([,rows])=>rows.some(row=>row.kind==="fieldAssessment"))
      .sort((a,b)=>b[1].reduce((date,row)=>row.date>date?row.date:date,"").localeCompare(a[1].reduce((date,row)=>row.date>date?row.date:date,"")) || a[0].localeCompare(b[0]));
    const cropLimit=Math.max(1,Math.min(1024,Number.isInteger(maxCrops)?maxCrops:256));
    const eventLimit=Math.max(2,Math.min(256,Number.isInteger(maxEventsPerCrop)?maxEventsPerCrop:128));
    const comparisonLimit=Math.max(1,Math.min(8192,Number.isInteger(maxComparisons)?maxComparisons:2048));
    const trajectories=[], comparisons=[];let truncatedEvents=0, truncatedComparisons=false;
    candidates.slice(0,cropLimit).forEach(([cropId,raw])=>{
      const dedup=new Map();
      raw.sort((a,b)=>a.date.localeCompare(b.date)||a.availableAt.localeCompare(b.availableAt)||a.id.localeCompare(b.id)).forEach(row=>{
        // Ready copied into a harvest row and its independent observation are one physical event.
        const key=row.kind==="ready" ? `${row.kind}:${row.date}:${row.palletKeys.join(",")}` : `${row.kind}:${row.id}`;
        if(!dedup.has(key)) dedup.set(key,row);
      });
      const all=[...dedup.values()], rows=all.slice(-eventLimit);truncatedEvents+=Math.max(0,all.length-eventLimit);
      const cropComparisons=[];
      rows.forEach((from,i)=>{
        if(from.kind!=="fieldAssessment") return;
        const covered=new Set(from.palletKeys);
        rows.slice(i+1).forEach(to=>{
          const overlap=to.palletKeys.filter(key=>covered.has(key));
          if(!overlap.length || to.date<from.date) return;
          if(comparisons.length>=comparisonLimit){truncatedComparisons=true;return;}
          const gap=days(from.date,to.date), q=Object.fromEntries(QUALITY.map(key=>[key,{
            from:from.quality[key],to:to.quality[key],transition:transition(from.quality[key],to.quality[key],gap,{none:0,slight:1,many:2})
          }]));
          const pair={cropId,fromId:from.id,toId:to.id,fromDate:from.date,toDate:to.date,days:gap,toKind:to.kind,
            palletKeys:overlap,scope:"overlap-only",size:{from:from.size,to:to.size,
              transition:to.kind==="ready" ? "notASizeLabel" : to.kind==="partialHarvest" ? "selectivePartialLarge" : transition(from.size,to.size,gap,SIZE)},
            quality:q,trainingEligible:false,error:false};
          cropComparisons.push(pair);comparisons.push(pair);
        });
      });
      trajectories.push({cropId,plantingEventId:rows[0]?.plantingEventId,plantingDate:rows[0]?.plantingDate,
        events:rows,comparisons:cropComparisons,trainingEligible:false});
    });
    const finalPairs=comparisons.filter(row=>row.toKind!=="fieldAssessment");
    const countTransitions=values=>values.reduce((out,value)=>{out[value]=(out[value]||0)+1;return out;},{});
    const independentCrops=new Set(finalPairs.map(row=>row.cropId)).size;
    const dates=finalPairs.map(row=>row.toDate).sort();
    const support=independentCrops>=MINIMUM_CROPS;
    return {schemaVersion:1,kind:"field-trajectory-review",asOf:new Date(boundary.time).toISOString(),
      trainingEligible:false,reference:true,status:support?"reference":"insufficient-data",minimumIndependentCrops:MINIMUM_CROPS,
      summary:{assessedCrops:trajectories.length,independentCrops,comparisons:comparisons.length,outcomeComparisons:finalPairs.length,
        period:{from:dates[0]||null,to:dates.at(-1)||null},endpointKinds:countTransitions(finalPairs.map(row=>row.toKind)),
        size:countTransitions(finalPairs.map(row=>row.size.transition)),
        quality:Object.fromEntries(QUALITY.map(key=>[key,countTransitions(finalPairs.map(row=>row.quality[key].transition))]))},
      trajectories,excluded,truncated:{crops:Math.max(0,candidates.length-cropLimit),events:truncatedEvents,comparisons:truncatedComparisons},
      criteria:{minimumIndependentCrops:MINIMUM_CROPS,purpose:"検証計画を見直す目安。精度の証明や教師への自動昇格条件ではありません。",
        promotion:"作を分離した時系列検証で改善と品質非劣化を確認するまで、途中評価を正式教師に使用しません。"},
      limitations:["小→並→大など日数に伴う変化を誤り・的中率として扱いません。減少や品質変化も要確認の経過であり入力誤りとは断定しません。",
        "適期確認は大きさの正解に変換せず、部分収穫の大評価は選別した株の信号として区別します。",
        "未確認・不明の品質は症状なしに変換しません。一部パレットの評価は共通する対象だけで比較します。",
        "同じ定植イベントのベッド・パレット・途中入力回数を独立作数として水増ししません。",
        "現在の記録版を使う事後の整合性確認です。後日修正された旧版を復元した検証ではありません。"]};
  }
  return Object.freeze({schemaVersion:1,evaluate});
});
