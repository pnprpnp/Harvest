/* Explanatory crop analogues. Matched-age inputs only; no fitting or label override. */
(function(root,factory){
  const api=factory();
  if(typeof module === "object" && module.exports) module.exports=api;
  if(root) root.HarvestGrowthSimilarity=api;
})(typeof globalThis !== "undefined" ? globalThis : this,function(){
  "use strict";
  const DAY=86400000, KEY=/^[2-9]-[A-F]-(?:[1-9]|[1-6][0-9]|7[0-8])$/;
  const QUALITY=["elongated","uneven","tipburn"], SIZE={small:0,normal:1,large:2};
  const number=value=>typeof value === "number" && Number.isFinite(value) ? value : null;
  const time=value=>typeof value === "number" && Number.isFinite(value) ? value
    : value instanceof Date ? value.getTime() : typeof value === "string" && value.trim() ? Date.parse(value) : NaN;
  function day(value){
    if(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)){
      const at=Date.parse(value+"T00:00:00Z");return Number.isFinite(at)&&new Date(at).toISOString().slice(0,10)===value ? value : null;
    }
    const at=time(value);return Number.isFinite(at)?new Date(at+9*3600000).toISOString().slice(0,10):null;
  }
  const addDays=(date,count)=>new Date(Date.parse(date+"T00:00:00Z")+count*DAY).toISOString().slice(0,10);
  const age=(start,end)=>Math.round((Date.parse(end+"T00:00:00Z")-Date.parse(start+"T00:00:00Z"))/DAY);
  const mean=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
  function keys(values){
    return Array.isArray(values)&&values.length&&!values.some(value=>typeof value!=="string"||!KEY.test(value)) ? [...new Set(values)].sort() : [];
  }
  function scope(input){
    const palletKeys=keys(input?.palletKeys?.length?input.palletKeys:input?.positionKey?[input.positionKey]:[]);
    const building=Number(input?.building), bed=String(input?.bed||"");
    const plantingDate=day(input?.plantingDate), id=input?.plantingEventId;
    if(!palletKeys.length || !plantingDate || !(typeof id==="string"&&id.trim()||Number.isSafeInteger(id)&&id>0)
      || !palletKeys.every(key=>Number(key.split("-")[0])===building&&key.split("-")[1]===bed)) return null;
    return {plantingEventId:id,plantingDate,building,bed,palletKeys,independentCropId:`${id}:${plantingDate}`,
      cropId:`${id}:${plantingDate}:${building}-${bed}`};
  }
  function available(row,fallback){
    const values=[row?.availableAt,row?.recordedAt,row?.createdAt,row?.updatedAt,row?.plantingAvailableAt].filter(value=>value!==undefined&&value!==null&&value!=="");
    if(values.some(value=>!Number.isFinite(time(value)))) return NaN;
    return values.length?Math.max(...values.map(time)):time(fallback+"T23:59:59.999+09:00");
  }
  function prepareObservations(observations,cutoff){
    const byId=new Map();
    (Array.isArray(observations)?observations:[]).forEach(row=>{
      if(!row || !["fieldAssessment","condition","environment","ec"].includes(row.kind) || !row.observationId) return;
      const startDate=day(row.date||row.startDate), endDate=day(row.endDate), known=available(row,startDate);
      if(!startDate || row.endDate&&!endDate || endDate&&endDate<startDate || !Number.isFinite(time(row.createdAt))
        || !Number.isFinite(time(row.updatedAt)) || time(row.updatedAt)<time(row.createdAt) || !Number.isFinite(known) || known>=cutoff) return;
      if(row.palletKeys?.length&&!keys(row.palletKeys).length) return;
      const old=byId.get(row.observationId);
      if(!old||old.known<known||old.known===known&&(row.revision||0)>(old.revision||0)) byId.set(row.observationId,{...row,startDate,endDate,known,palletKeys:keys(row.palletKeys)});
    });
    return [...byId.values()].filter(row=>!row.deletedAt||time(row.deletedAt)>=cutoff);
  }
  function createIndex({samples=[],observations=[],weatherDaily=[],asOf,engine,maxCrops=512}={}){
    engine=engine||(typeof HarvestGrowthModel!=="undefined"?HarvestGrowthModel:null);
    const date=day(asOf), cutoff=time(typeof asOf==="string"&&asOf.length===10?asOf+"T00:00:00+09:00":asOf);
    if(!date||!Number.isFinite(cutoff)||!engine?.prepareWeather) throw new Error("類似作の参照には判定日時と気象処理が必要です");
    const weather=engine.prepareWeather(weatherDaily,{asOf});
    const groups=new Map(), excluded={unknownScope:0,unavailable:0,partial:0,estimatedPlanting:0};
    (Array.isArray(samples)?samples:[]).forEach(row=>{
      const s=scope(row), outcomeDate=day(row?.date), known=available(row,outcomeDate);
      if(!s){excluded.unknownScope++;return;}
      if(!outcomeDate||outcomeDate>=date||age(s.plantingDate,outcomeDate)<1||age(s.plantingDate,outcomeDate)>180
        || !Number.isFinite(known)||known>=cutoff){excluded.unavailable++;return;}
      if(String(row.signalKind||"").startsWith("partial-")||row.partialHarvest===true||row.type==="partialHarvest"){excluded.partial++;return;}
      if(row.estimatedPlanting===true||row.plantingDateEstimated===true){excluded.estimatedPlanting++;return;}
      let group=groups.get(s.cropId);
      if(!group){group={...s,palletKeys:[],outcomes:[],lastOutcomeDate:outcomeDate,legacySpecial:false};groups.set(s.cropId,group);}
      const base=row.growthEvidence?.baseTraining||row;
      // A legacy flag without a time-scoped condition cannot reconstruct normal conditions at this age.
      group.legacySpecial ||= row.special===true || row.specialCondition===true || row.specialCondition?.excludeFromTraining===true
        || base.excludedFromTraining===true || base.excludeFromTraining===true || ["exclude","downweight"].includes(base.dataPolicy)
        || (row.specialConditions||[]).some(condition=>condition.source!=="typed-observation");
      group.palletKeys=keys([...group.palletKeys,...s.palletKeys]);
      const outcome={id:String(row.id||row.groupId||s.cropId+":"+outcomeDate),date:outcomeDate,
        readyDate:day(row.readyDate),size:Object.hasOwn(SIZE,row.sizeRating)?row.sizeRating:"unknown",
        quality:row.symptoms?{...row.symptoms}:{},palletKeys:s.palletKeys,availableAt:new Date(known).toISOString()};
      if(!group.outcomes.some(old=>old.id===outcome.id)) group.outcomes.push(outcome);
      if(outcomeDate>group.lastOutcomeDate) group.lastOutcomeDate=outcomeDate;
    });
    const all=[...groups.values()].sort((a,b)=>b.lastOutcomeDate.localeCompare(a.lastOutcomeDate)||a.cropId.localeCompare(b.cropId));
    const limit=Math.max(1,Math.min(2048,Number.isInteger(maxCrops)?maxCrops:512));
    const prepared=prepareObservations(observations,cutoff), byCrop=new Map(), byBuilding=new Map();
    prepared.forEach(row=>{
      const index=row.kind==="fieldAssessment"?byCrop:byBuilding;
      const key=row.kind==="fieldAssessment"?`${row.plantingEventId}:${day(row.plantingDate)}`:Number(row.building);
      const list=index.get(key)||[];list.push(row);index.set(key,list);
    });
    return {schemaVersion:1,asOf:new Date(cutoff).toISOString(),date,cutoff,crops:all.slice(0,limit),
      weather:weather.observations,byCrop,byBuilding,excluded,truncatedCrops:Math.max(0,all.length-limit),featureCache:new Map()};
  }
  function severity(value){return ({none:0,low:1,slight:1,high:2,many:2})[value]??null;}
  function related(row,s){
    if(row.kind==="fieldAssessment"){
      if(String(row.plantingEventId)!==String(s.plantingEventId)||day(row.plantingDate)!==s.plantingDate||!row.palletKeys.length) return false;
    }else if(Number(row.building)!==s.building||row.bed&&row.bed!==s.bed) return false;
    return !row.palletKeys.length||s.palletKeys.every(key=>row.palletKeys.includes(key));
  }
  function features(index,s,endDate,cutoff){
    const cacheKey=`${s.cropId}:${s.palletKeys.join(",")}:${endDate}:${cutoff}`;
    if(index.featureCache.has(cacheKey)) return index.featureCache.get(cacheKey);
    const days=age(s.plantingDate,endDate), bins=Array.from({length:3},()=>({temperature:[],sunshine:[],light:[]}));
    let temperatureDays=0,sunshineDays=0,lightDays=0;
    for(let i=0;i<days;i++){
      const row=index.weather.get(addDays(s.plantingDate,i));
      if(!row||row.estimated===true) continue;
      const published=row.availableAt||row.observedAt;
      if(published && (!Number.isFinite(time(published))||time(published)>=cutoff)) continue;
      const bin=bins[Math.min(2,Math.floor(i*3/days))];
      if(row.estimatedTemperature!==true&&number(row.meanTemp)!==null){bin.temperature.push(row.meanTemp);temperatureDays++;}
      if(row.estimatedLight!==true){
        if(number(row.sunshineHours)!==null&&row.sunshineHours>=0&&row.sunshineHours<=24){bin.sunshine.push(row.sunshineHours);sunshineDays++;}
        if(number(row.lightIndex)!==null&&row.lightIndex>=0){bin.light.push(row.lightIndex);lightDays++;}
      }
    }
    const observations=[...(index.byCrop.get(s.independentCropId)||[]),...(index.byBuilding.get(s.building)||[])]
      .filter(row=>row.known<cutoff&&row.startDate<endDate&&(!row.endDate||row.endDate>=s.plantingDate)&&related(row,s));
    const field=Array.from({length:3},()=>null), special=new Set();
    observations.sort((a,b)=>a.startDate.localeCompare(b.startDate)||a.known-b.known||String(a.observationId).localeCompare(String(b.observationId))).forEach(row=>{
      if(row.kind==="fieldAssessment"){
        const at=age(s.plantingDate,row.startDate);if(at<0||at>=days) return;
        field[Math.min(2,Math.floor(at*3/days))]={size:SIZE[row.payload?.size]??null,
          quality:Object.fromEntries(QUALITY.map(key=>[key,severity(row.payload?.quality?.[key])])),age:at};
      }else if(row.kind==="condition") special.add(String(row.payload?.type||"other"));
      else if(row.kind==="ec"&&row.payload?.isAbnormal===true) special.add("abnormalEc");
      else if(row.kind==="environment"&&["exclude","downweight"].includes(row.payload?.dataPolicy)) special.add("environment:"+row.payload.dataPolicy);
    });
    const result={age:days,weather:bins.map(bin=>Object.fromEntries(Object.entries(bin).map(([key,values])=>[key,mean(values)]))),
      coverage:{temperature:days?temperatureDays/days:0,sunshine:days?sunshineDays/days:0,light:days?lightDays/days:0},
      field,special:[...special].sort()};
    // Per-index derived cache is capped even when many bed cohorts are queried.
    if(index.featureCache.size>=2048) index.featureCache.delete(index.featureCache.keys().next().value);
    index.featureCache.set(cacheKey,result);return result;
  }
  function seasonDistance(a,b){
    const aDay=Date.parse("2000-"+a.slice(5)+"T00:00:00Z"),bDay=Date.parse("2000-"+b.slice(5)+"T00:00:00Z");
    const distance=Math.abs(aDay-bDay)/DAY;return Math.min(distance,366-distance);
  }
  function distance(a,b,key){
    const values=a.map((row,i)=>number(row[key])!==null&&number(b[i]?.[key])!==null?Math.abs(row[key]-b[i][key]):null).filter(value=>value!==null);
    return values.length===3?mean(values):null;
  }
  function fieldDistance(a,b){
    const differences=[];let points=0;
    a.forEach((row,i)=>{
      const other=b[i];if(!row||!other) return;
      const values=[];
      if(number(row.size)!==null&&number(other.size)!==null) values.push(Math.abs(row.size-other.size)/2);
      QUALITY.forEach(key=>{if(number(row.quality[key])!==null&&number(other.quality[key])!==null) values.push(Math.abs(row.quality[key]-other.quality[key])/2);});
      if(values.length){differences.push(mean(values));points++;}
    });
    return {difference:mean(differences),points};
  }
  function find({index,input,maxResults=3}={}){
    if(!index||index.schemaVersion!==1||!(index.weather instanceof Map)) throw new Error("類似作の参照索引がありません");
    const s=scope(input), criteria={minimumObservedDays:7,minimumWeatherCoverage:0.7,maximumSeasonGapDays:60,
      maximumTemperatureDifferenceC:4,maximumSunshineDifferenceHours:3,maximumLightProxyDifference:0.35,maximumMeanDistance:0.6,
      method:"同じ栽培日数の3期間平均を等重みで比較。号棟・ベッドは同程度の距離のときの優先順に使用。",
      calibrated:false};
    const output={schemaVersion:1,reference:true,trainingEligible:false,status:"insufficient-data",asOf:index.asOf,matches:[],criteria,
      reasons:[],examinedCrops:0,truncatedCrops:index.truncatedCrops,
      limitations:["類似作は過去事例の説明です。現在の予測値・学習の正解・信頼度を変更しません。",
        "一致条件は未校正の検索目安です。日照時間が比較できない場合の光指標は日射量の実測ではありません。",
        "過去作の特徴は現在と同じ栽培日数まで、当時利用可能だった記録に限定します。結果は選択後の参考として表示します。"]};
    if(!s){output.reasons.push("作とパレット範囲が確定していないため類似作を表示しません。");return output;}
    const cropAge=age(s.plantingDate,index.date);
    if(cropAge<criteria.minimumObservedDays||cropAge>180){output.reasons.push("比較できる栽培日数が不足しています。");return output;}
    const current=features(index,s,index.date,index.cutoff);
    const currentSpecial=[...current.special];
    // Already-scoped evidence may explicitly mark a legacy special crop.
    if(input.special===true||input.specialCondition===true||!input.growthEvidence&&input.excludedFromTraining===true) currentSpecial.push("explicit-special");
    const matches=[];
    index.crops.forEach(candidate=>{
      if(candidate.independentCropId===s.independentCropId||candidate.legacySpecial) return;
      const comparisonDate=addDays(candidate.plantingDate,cropAge);
      // Only pallets that still existed at the matched age can describe this stage.
      const outcomes=candidate.outcomes.filter(row=>row.date>=comparisonDate);
      if(!outcomes.length||comparisonDate>=index.date) return;
      const selected={...candidate,palletKeys:keys(outcomes.flatMap(row=>row.palletKeys))};
      const past=features(index,selected,comparisonDate,time(comparisonDate+"T00:00:00+09:00"));
      output.examinedCrops++;
      if(JSON.stringify([...new Set(currentSpecial)].sort())!==JSON.stringify(past.special)) return;
      const season=seasonDistance(s.plantingDate,candidate.plantingDate);
      if(season>criteria.maximumSeasonGapDays||Math.min(current.coverage.temperature,past.coverage.temperature)<0.7
        || Math.min(current.coverage.temperature,past.coverage.temperature)*cropAge<7) return;
      const lightKind=Math.min(current.coverage.sunshine,past.coverage.sunshine)>=0.7?"sunshine":"light";
      if(Math.min(current.coverage[lightKind],past.coverage[lightKind])<0.7||Math.min(current.coverage[lightKind],past.coverage[lightKind])*cropAge<7) return;
      const temperature=distance(current.weather,past.weather,"temperature"),light=distance(current.weather,past.weather,lightKind);
      const lightTolerance=lightKind==="sunshine"?3:0.35;
      if(temperature===null||light===null||temperature>4||light>lightTolerance) return;
      const field=fieldDistance(current.field,past.field);
      const values=[season/60,temperature/4,light/lightTolerance];
      if(field.difference!==null) values.push(field.difference);
      const score=mean(values);if(score>criteria.maximumMeanDistance) return;
      const location=candidate.building===s.building?(candidate.bed===s.bed?"sameBed":"sameBuilding"):"otherBuilding";
      matches.push({cropId:candidate.cropId,independentCropId:candidate.independentCropId,
        plantingEventId:candidate.plantingEventId,plantingDate:candidate.plantingDate,building:candidate.building,bed:candidate.bed,
        palletKeys:selected.palletKeys,comparisonDate,ageDays:cropAge,location,distance:score,special:past.special,
        differences:{seasonDays:season,temperatureC:temperature,light,lightKind,field:field.difference,fieldPeriods:field.points},
        coverage:{current:current.coverage,past:past.coverage},outcomes:outcomes.map(row=>({...row,palletKeys:row.palletKeys.slice(),quality:{...row.quality}})),
        trainingEligible:false});
    });
    const tiers={sameBed:0,sameBuilding:1,otherBuilding:2};
    // Location only breaks transparent 0.1-wide similarity bands, not a hidden weight.
    matches.sort((a,b)=>Math.floor(a.distance*10)-Math.floor(b.distance*10)||tiers[a.location]-tiers[b.location]
      ||a.distance-b.distance||a.cropId.localeCompare(b.cropId));
    const seen=new Set(),limit=Math.max(1,Math.min(5,Number.isInteger(maxResults)?maxResults:3));
    output.matches=matches.filter(row=>{if(seen.has(row.independentCropId))return false;seen.add(row.independentCropId);return true;}).slice(0,limit);
    output.status=output.matches.length?"reference":"insufficient-data";
    if(!output.matches.length) output.reasons.push("同じ栽培日数・時期・気温・日照の条件に十分近い過去作はありません。");
    return output;
  }
  return Object.freeze({schemaVersion:1,createIndex,find});
});
