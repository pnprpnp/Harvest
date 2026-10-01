/* Exact-scope yield reconciliation. No per-pallet allocation of record totals.
 * Reuses HarvestGrowthPlanner.fitYield/quantity through dependency injection.
 */
(function(root, factory){
  const api = factory();
  if(typeof module === "object" && module.exports) module.exports = api;
  if(root) root.HarvestGrowthYield = api;
})(typeof globalThis === "object" ? globalThis : this, function(){
  "use strict";
  const CASE_SIZE = 12, KEY = /^[2-9]-[A-F]-(?:[1-9]|[1-6][0-9]|7[0-8])$/;
  const number = value => ["string", "number"].includes(typeof value) && String(value).trim() && Number.isFinite(Number(value)) ? Number(value) : null;
  function day(value){
    if(typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const time = Date.parse(value + "T00:00:00Z");
    return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === value ? value : null;
  }
  const instant = value => typeof value === "number" && Number.isFinite(value) ? value
    : typeof value === "string" && value.trim() && Number.isFinite(Date.parse(value.length === 10 ? value + "T00:00:00+09:00" : value))
      ? Date.parse(value.length === 10 ? value + "T00:00:00+09:00" : value) : null;
  function cutoff(asOf){
    const time = instant(asOf);
    if(time === null) throw new Error("ケース数計算には有効な判定時点が必要です");
    return { time, date:new Date(time + 9 * 3600000).toISOString().slice(0,10) };
  }
  const available = row => {
    const values = [row?.createdAt, row?.updatedAt, row?.availableAt].map(instant).filter(value => value !== null);
    return values.length ? Math.max(...values) : null;
  };
  const keys = values => Array.isArray(values) && values.every(key => typeof key === "string" && KEY.test(key)) ? [...new Set(values)].sort() : null;
  function rangeKeys(ranges){
    if(ranges !== undefined && !Array.isArray(ranges)) return null;
    const result = [];
    for(const raw of ranges || []){
      const parts = typeof raw === "string" ? raw.split("-") : null;
      const range = parts ? { building:parts[0], bed:parts[1], start:parts[2], end:parts[3] } : raw;
      if(parts && parts.length !== 4 || !range) return null;
      const building = number(range.building), start = number(range.start), end = number(range.end);
      if(!Number.isInteger(building) || building < 2 || building > 9 || !/^[A-F]$/.test(String(range.bed))
        || !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < 1 || start > 78 || end > 78) return null;
      for(let n = Math.min(start,end); n <= Math.max(start,end); n++) result.push(`${building}-${range.bed}-${n}`);
    }
    return [...new Set(result)].sort();
  }
  function recordKeys(record){
    const direct = record.palletKeys === undefined ? [] : keys(record.palletKeys);
    const ranges = rangeKeys(record.palletRanges);
    return direct && ranges ? [...new Set([...direct,...ranges])].sort() : null;
  }
  function known(row, date, boundary){
    const time = available(row);
    return !!day(date) && date <= boundary.date && (time === null
      ? date < boundary.date || boundary.time > instant(boundary.date)
      : time < boundary.time);
  }
  function special(row, boundary){
    const when = instant(row?.exclusionAvailableAt);
    return !!(row?.special === true || row?.specialCondition === true || row?.specialCondition?.excludeFromTraining === true || row?.excludedFromTraining === true)
      && (when === null || when < boundary.time);
  }
  function headsFor(crop, selected){
    if(crop.detailsUnknown) return null;
    const allExplicit = crop.keys.every(key => crop.counts.has(key));
    const explicitTotal = allExplicit ? crop.keys.reduce((sum,key) => sum + crop.counts.get(key),0) : null;
    const knownTotal = [...crop.counts.values()].reduce((sum,value) => sum + value,0);
    if(crop.actualTotal !== null && knownTotal > crop.actualTotal) return null;
    if(crop.actualTotal !== null && explicitTotal !== null && crop.actualTotal !== explicitTotal) return null;
    if(selected.every(key => crop.counts.has(key))) return selected.reduce((sum,key) => sum + crop.counts.get(key),0);
    return selected.length === crop.keys.length && crop.keys.every(key => selected.includes(key)) ? crop.actualTotal : null;
  }
  function scopeInput(crop, selected, includePalletCounts=false){
    const plantedHeads = headsFor(crop, selected), selectedSet = new Set(selected);
    const reasons = [...crop.invalid];
    if(!(plantedHeads > 0)) reasons.push("unknownActualPlantedHeads");
    let partialHeads = 0;
    const partialIds = [];
    crop.partials.forEach(partial => {
      const overlap = partial.keys.filter(key => selectedSet.has(key));
      if(!overlap.length) return;
      if(overlap.length !== partial.keys.length){ reasons.push("partialScopeCannotBeAllocated"); return; }
      partialHeads += partial.heads; partialIds.push(partial.id);
    });
    if(plantedHeads !== null && partialHeads > plantedHeads + 1e-8) reasons.push("partialExceedsPlantedHeads");
    const buildings = [...new Set(selected.map(key => Number(key.split("-")[0])))];
    return { valid:reasons.length === 0, reasons:[...new Set(reasons)], cropId:crop.id, plantingEventId:crop.eventId,
      plantingDate:crop.plantingDate, building:buildings.length === 1 ? buildings[0] : null, palletKeys:selected.slice(),
      plantedHeads, partialHeads, partialRecordIds:partialIds,
      plantedHeadsByPallet:includePalletCounts && selected.every(key=>crop.counts.has(key))
        ? Object.fromEntries(selected.map(key=>[key,crop.counts.get(key)])) : null,
      aggregation:"exact-scope-total-no-position-allocation",
      // A scope total is passed as one quantity bucket, not assigned to a real pallet.
      pallets:reasons.length ? [] : [{ palletKeys:selected.slice(), plantedHeads, partialHeads }] };
  }
  function buildDataset({ records = [], plantingEvents = [], asOf, evidence, observations = [] } = {}){
    const boundary = cutoff(asOf), diagnostics = {}, rejected = [], timelines = [], ids = new Map();
    const reject = (id, reason) => { diagnostics[reason] = (diagnostics[reason] || 0) + 1; rejected.push({ id, reason }); };
    function enqueue(row, type, id, date){
      if(!id || !day(date)){ reject(id || "unknown", "missingIdentityOrDate"); return; }
      if(!known(row,date,boundary)){ reject(id,"notYetAvailable"); return; }
      if(row.deletedAt){ reject(id,"deleted"); return; }
      const uniqueId = `${type === "planting" ? "planting" : "record"}:${id}`;
      const previous = ids.get(uniqueId), entry = { row, type, id:String(id), date, time:available(row) };
      if(previous){
        if(JSON.stringify(previous.row) === JSON.stringify(row)){ reject(id,"duplicate"); return; }
        if(previous.time !== null && entry.time !== null && previous.time !== entry.time){
          if(previous.time < entry.time) ids.set(uniqueId,entry);
          reject(id,"supersededVersion"); return;
        }
        previous.ambiguous = true; reject(id,"conflictingDuplicate"); return;
      }
      ids.set(uniqueId,entry);
    }
    (Array.isArray(plantingEvents) ? plantingEvents : []).filter(Boolean).forEach(event => enqueue(event,"planting",event.eventId,event.plantingDate));
    (Array.isArray(records) ? records : []).filter(Boolean).forEach(record => enqueue(record,record.type === "partialHarvest" ? "partial" : "full",record.recordUuid || record.id,record.date));
    timelines.push(...ids.values());
    const order = { partial:0, full:1, planting:2 };
    timelines.sort((a,b) => a.date.localeCompare(b.date) || order[a.type]-order[b.type] || a.id.localeCompare(b.id));
    const activeByPallet = new Map(), lastByPallet = new Map(), crops = new Map(), harvestRows = [];
    timelines.forEach(entry => {
      const { row, id, date, time } = entry;
      if(entry.type === "planting"){
        const selected = keys(row.plantingPalletKeys || (Array.isArray(row.sourceAllocations) ? row.sourceAllocations.flatMap(item => item?.palletKeys || []) : []));
        if(!selected?.length){ reject(id,"missingPlantingScope"); return; }
        const counts = new Map();
        selected.forEach(key => { const count = number(row.plantingCountsByPallet?.[key]); if([12,16,20].includes(count)) counts.set(key,count); });
        const total = number(row.actualPlantedSeedlingCount);
        const crop = { id:`planting:${id}`, eventId:row.eventId, plantingDate:date, keys:selected, counts,
          actualTotal:Number.isInteger(total) && total > 0 ? total : null, detailsUnknown:row.detailsUnknown === true,
          plantingAvailableAt:time, availableAt:time, closed:new Set(), partials:[], cases:0, finalDate:null,
          special:special(row,boundary), invalid:new Set(entry.ambiguous ? ["conflictingDuplicate"] : []) };
        if(total === 0 && counts.size) crop.invalid.add("conflictingPlantedHeads");
        if(total !== null && (total < 0 || !Number.isInteger(total) || total > selected.length * 20)) crop.invalid.add("implausiblePlantedHeads");
        crops.set(crop.id,crop);
        selected.forEach(key => {
          const old = activeByPallet.get(key);
          if(old) old.invalid.add("replantedWithoutFullHarvest");
          activeByPallet.set(key,crop); lastByPallet.set(key,crop);
        });
        return;
      }
      let selected, invalidTarget = false;
      if(entry.type === "partial"){
        const seen = new Set(), targets = Array.isArray(row.targets) ? row.targets : [];
        selected = [];
        targets.forEach(target => {
          const expanded = rangeKeys([target]);
          if(!expanded || !(number(target.plantsPerPallet) > 0)){ invalidTarget = true; return; }
          expanded.forEach(key => { if(seen.has(key)) invalidTarget = true; seen.add(key); selected.push(key); });
        });
        if(!targets.length) invalidTarget = true;
      }else selected = recordKeys(row);
      if(!selected?.length){ reject(id,"missingHarvestScope"); return; }
      const linked = [...new Set(selected.map(key => activeByPallet.get(key)).filter(Boolean))];
      const missing = selected.some(key => !activeByPallet.has(key));
      const reasons = [];
      if(missing) reasons.push("unknownOrAlreadyHarvestedCrop");
      if(linked.length !== 1) reasons.push("mixedCrops");
      if(invalidTarget) reasons.push("invalidOrOverlappingPartialTargets");
      if(entry.ambiguous) reasons.push("conflictingDuplicate");
      const cases = number(row.cases);
      if(cases === null || cases < 0 || entry.type === "partial" && cases <= 0) reasons.push("unknownCases");
      if(reasons.length){
        reasons.forEach(reason => reject(id,reason));
        [...new Set([...linked,...selected.map(key => lastByPallet.get(key)).filter(Boolean)])].forEach(crop => reasons.forEach(reason => crop.invalid.add(reason)));
      }
      if(entry.type === "partial"){
        if(!reasons.length){
          const crop = linked[0];
          crop.partials.push({ id, date, keys:selected.slice(), heads:cases*CASE_SIZE, availableAt:time });
          crop.availableAt = Math.max(crop.availableAt || 0,time || 0) || null;
          crop.special ||= special(row,boundary);
        }
        return;
      }
      if(!reasons.length){
        const crop = linked[0], input = scopeInput(crop,selected);
        crop.cases += cases; crop.finalDate = date;
        crop.availableAt = Math.max(crop.availableAt || 0,time || 0) || null;
        crop.special ||= special(row,boundary);
        harvestRows.push({ id, cropId:crop.id, plantingEventId:crop.eventId, plantingDate:crop.plantingDate, date,
          availableAt:Math.max(time || 0,crop.plantingAvailableAt || 0) || null, palletKeys:selected.slice(),
          cases, building:input.building, input, sameDayPartial:crop.partials.some(partial => partial.date === date && partial.keys.some(key => selected.includes(key))) });
      }
      selected.forEach(key => { const crop = activeByPallet.get(key); if(crop) crop.closed.add(key); activeByPallet.delete(key); });
    });
    const yieldRows = [];
    crops.forEach(crop => {
      const scope = scopeInput(crop,crop.keys);
      if(evidence?.annotate && observations.length){
        const buildings = [...new Set(crop.keys.map(key => Number(key.split("-")[0])))];
        const inputs = buildings.map(building => ({ id:crop.id, plantingEventId:crop.eventId, plantingDate:crop.plantingDate,
          date:crop.finalDate || boundary.date, building, palletKeys:crop.keys.filter(key => Number(key.split("-")[0]) === building) }));
        const annotated = evidence.annotate(inputs,observations,{asOf});
        crop.special ||= annotated.some(row => row.excludedFromTraining || row.growthEvidence?.ignoredPartialScope?.some(item => item.kind === "condition"));
      }
      const complete = crop.closed.size === crop.keys.length && !!crop.finalDate;
      const totalHarvested = crop.cases*CASE_SIZE + scope.partialHeads;
      const reasons = [...scope.reasons];
      if(!complete) reasons.push("incompleteCrop");
      if(crop.special) reasons.push("specialExcluded");
      if(scope.plantedHeads !== null && totalHarvested > scope.plantedHeads + 1e-8) reasons.push("harvestExceedsPlantedHeads");
      crop.reasons = [...new Set(reasons)];
      if(complete && !crop.reasons.length && crop.finalDate < boundary.date){
        yieldRows.push({ id:crop.id, cropId:crop.id, plantingEventId:crop.eventId, date:crop.finalDate,
          availableAt:crop.availableAt, building:scope.building, plantedHeads:scope.plantedHeads,
          partialHeads:scope.partialHeads, cases:crop.cases, source:"reconciled-complete-crop" });
      }
    });
    harvestRows.forEach(row => {
      const crop = crops.get(row.cropId);
      row.special = crop.special;
      const impossible = row.input.plantedHeads !== null && row.cases * CASE_SIZE + row.input.partialHeads > row.input.plantedHeads + 1e-8;
      row.evaluable = row.input.valid && !row.special && !crop.invalid.size && !row.sameDayPartial && !impossible;
      row.reasons = [...new Set([...row.input.reasons,...crop.invalid,...(row.special ? ["specialExcluded"] : []),
        ...(row.sameDayPartial ? ["sameDayPartialOrderUnknown"] : []),...(impossible ? ["harvestExceedsPlantedHeads"] : [])])];
    });
    return { schemaVersion:1, asOf:boundary.date, yieldRows, harvestRows, diagnostics, rejected,
      crops:[...crops.values()].map(crop => ({ id:crop.id, plantingEventId:crop.eventId, plantingDate:crop.plantingDate,
        palletKeys:crop.keys.slice(), complete:crop.closed.size === crop.keys.length, reasons:crop.reasons })),
      _index:{ activeByPallet, crops },
      limitations:["部分収穫の平均plantsPerPalletを実測の位置別株数として使いません。記録ケース数の合計だけを範囲一致時に使用します。",
        "混合作・欠損苗数・範囲を分割しないと控除できない部分収穫は未評価です。",
        "既存保存処理が過去に補完した苗数や、上書きされた古い入力版は元の入力状態を完全に復元できません。"] };
  }
  function currentInput(dataset,{ palletKeys, plantingEventId, includePalletCounts=false } = {}){
    const selected = keys(palletKeys), index = dataset?._index;
    if(!selected?.length || !index) return { valid:false, reasons:["missingPredictionScope"], pallets:[] };
    const crops = [...new Set(selected.map(key => index.activeByPallet.get(key)).filter(Boolean))];
    if(crops.length !== 1 || selected.some(key => !index.activeByPallet.has(key))) return { valid:false, reasons:["mixedOrUnknownCurrentCrop"], pallets:[] };
    const crop = crops[0];
    if(plantingEventId !== undefined && String(plantingEventId) !== String(crop.eventId)) return { valid:false, reasons:["differentPlantingEvent"], pallets:[] };
    const input = scopeInput(crop,selected,includePalletCounts);
    if(crop.special){ input.valid=false; input.reasons.push("specialExcluded"); input.pallets=[]; }
    return input;
  }
  function fit({ planner, dataset, ...options } = {}){
    if(!planner?.fitYield) throw new Error("既存の収量計算が必要です");
    const source = dataset || buildDataset(options);
    return { schemaVersion:1, asOf:source.asOf, model:planner.fitYield(source.yieldRows), sampleCount:source.yieldRows.length, diagnostics:source.diagnostics };
  }
  // Stored beside the growth coefficients. Never mutate an older generation to
  // add coefficients learned after its original training instant.
  function exportModel({planner,dataset,asOf} = {}){
    const boundary=cutoff(asOf), rows=dataset.yieldRows.filter(row=>row.date < boundary.date
      && (row.availableAt === null || row.availableAt < boundary.time));
    const dates=rows.map(row=>row.date).sort();
    return {schemaVersion:1,trainedAsOf:new Date(boundary.time).toISOString(),model:planner.fitYield(rows),
      training:{independentCrops:new Set(rows.map(row=>row.cropId)).size,cropIds:[...new Set(rows.map(row=>row.cropId))].sort(),
        startDate:dates[0] || null,endDate:dates.at(-1) || null},intervalKind:"empirical-reference-not-calibrated"};
  }
  function hydrateModel(snapshot,{asOf} = {}){
    if(!snapshot || snapshot.schemaVersion !== 1 || instant(snapshot.trainedAsOf) === null
      || asOf && instant(snapshot.trainedAsOf) > cutoff(asOf).time
      || snapshot.model?.schemaVersion !== 1 || !Array.isArray(snapshot.model.rows)
      || snapshot.model.rows.some(row=>typeof row?.factor !== "number" || !Number.isFinite(row.factor) || row.factor < 0 || row.factor > 1
        || row.building !== null && (!Number.isInteger(row.building) || row.building < 2 || row.building > 9))
      || !Array.isArray(snapshot.training?.cropIds)
      || new Set(snapshot.training.cropIds).size !== snapshot.training.cropIds.length
      || snapshot.training.independentCrops !== snapshot.training.cropIds.length
      || snapshot.model.rows.length !== snapshot.training.independentCrops) throw new Error("保存ケース数モデルの係数・学習日時が不正です");
    return JSON.parse(JSON.stringify(snapshot));
  }
  function metrics(rows=[]){
    const known=rows.filter(row=>typeof row.error === "number" && Number.isFinite(row.error));
    const average=getter=>{
      const groups=new Map();known.forEach(row=>{const list=groups.get(row.cropId)||[];list.push(getter(row));groups.set(row.cropId,list);});
      return groups.size ? [...groups.values()].reduce((sum,list)=>sum+list.reduce((a,b)=>a+b,0)/list.length,0)/groups.size : null;
    };
    const dates=known.map(row=>row.outcomeDate).filter(day).sort();
    const independentCrops=new Set(known.map(row=>row.cropId)).size;
    const spanDays=dates.length ? Math.round((Date.parse(dates.at(-1))-Date.parse(dates[0]))/86400000) : 0;
    return {predictions:known.length,independentCrops,folds:new Set(known.map(row=>row.asOf)).size,
      mae:average(row=>Math.abs(row.error)),bias:average(row=>row.error),intervalCoverage:average(row=>row.intervalHit),
      startDate:dates[0]||null,endDate:dates.at(-1)||null,spanDays,
      sufficient:independentCrops>=16 && spanDays>=42,
      intervalKind:"empirical-reference-not-calibrated",status:independentCrops>=16 && spanDays>=42 ? "reference-evaluation" : "insufficient-data"};
  }
  function scored(actual,prediction,input,origin,actualCases=actual.cases){
    return {id:actual.id,cropId:actual.cropId,groupId:actual.cropId,plantingEventId:actual.plantingEventId,
      asOf:origin,outcomeDate:actual.date,availableAt:actual.availableAt,building:actual.building,
      season:Math.floor((Number(actual.date.slice(5,7))%12)/3),actualCases,predictedCases:prediction.center,
      low:prediction.low,high:prediction.high,error:prediction.center-actualCases,
      intervalHit:Number(actualCases>=prediction.low && actualCases<=prediction.high),reference:prediction.reference,
      plantedHeads:input.plantedHeads,knownPartialHeads:input.partialHeads};
  }
  // This is a last-priority non-regression check, never a growth adoption gate.
  // Every contrast is averaged per crop before estimating sampling uncertainty.
  function compareRows(activeRows,candidateRows,{asOf} = {}){
    const candidateById=new Map(candidateRows.map(row=>[`${row.cropId}:${row.id}:${row.asOf}`,row]));
    const pairs=activeRows.map(row=>[row,candidateById.get(`${row.cropId}:${row.id}:${row.asOf}`)]).filter(pair=>pair[1]);
    const active=metrics(pairs.map(pair=>pair[0])),candidate=metrics(pairs.map(pair=>pair[1]));
    const unavailable={accepted:true,blocking:false,reason:"insufficientYieldEvidence",label:"ケース数は評価データ不足",
      independentCrops:active.independentCrops,spanDays:active.spanDays,minimumCrops:16,minimumSpanDays:42};
    if(!active.sufficient || !candidate.sufficient) return {active,candidate,gate:unavailable};
    function compareGroup(selected,label,minimum=8){
      const grouped=new Map();selected.forEach(pair=>{const list=grouped.get(pair[0].cropId)||[];list.push(pair);grouped.set(pair[0].cropId,list);});
      if(grouped.size<minimum) return {label,independentCrops:grouped.size,status:"insufficient-data",regressions:[]};
      const contrasts={mae:(a,c)=>Math.abs(c.error)-Math.abs(a.error),coverage:(a,c)=>a.intervalHit-c.intervalHit};
      const details=Object.fromEntries(Object.entries(contrasts).map(([key,getter])=>{
        const values=[...grouped.values()].map(list=>list.reduce((sum,[a,c])=>sum+getter(a,c),0)/list.length);
        const mean=values.reduce((a,b)=>a+b,0)/values.length;
        const standardError=Math.sqrt(values.reduce((sum,value)=>sum+(value-mean)**2,0)/(values.length-1)/values.length);
        return [key,{mean,standardError,regression:mean>Math.max(1e-9,1.645*standardError)}];
      }));
      const a=metrics(selected.map(pair=>pair[0])),c=metrics(selected.map(pair=>pair[1]));
      const errorDelta=[...grouped.values()].map(list=>list.reduce((sum,[a,c])=>sum+c.error-a.error,0)/list.length);
      const mean=errorDelta.reduce((a,b)=>a+b,0)/errorDelta.length;
      const standardError=Math.sqrt(errorDelta.reduce((sum,value)=>sum+(value-mean)**2,0)/(errorDelta.length-1)/errorDelta.length);
      details.bias={mean:Math.abs(c.bias)-Math.abs(a.bias),standardError,
        regression:Math.abs(c.bias)-Math.abs(a.bias)>Math.max(1e-9,1.645*standardError)};
      return {label,independentCrops:grouped.size,status:"reference-evaluation",active:a,candidate:c,details,
        regressions:Object.keys(details).filter(key=>details[key].regression)};
    }
    const recentFrom=new Date(cutoff(asOf).time-90*86400000).toISOString().slice(0,10);
    const groups=[compareGroup(pairs,"all",16),compareGroup(pairs.filter(([row])=>row.outcomeDate>=recentFrom),"recent")];
    for(const field of ["building","season"]){
      [...new Set(pairs.map(([row])=>row[field]))].forEach(value=>groups.push(compareGroup(pairs.filter(([row])=>row[field]===value),`${field}:${value}`)));
    }
    const regressions=groups.filter(group=>group.regressions.length);
    return {active,candidate,groups,gate:{accepted:!regressions.length,blocking:!!regressions.length,
      reason:regressions.length ? "yieldRegression" : "yieldNoDetectedRegression",independentCrops:active.independentCrops,
      spanDays:active.spanDays,minimumCrops:16,minimumSpanDays:42,
      label:regressions.length ? "ケース数で悪化を検出" : "ケース数で明確な悪化は未検出",regressions:regressions.map(group=>({group:group.label,metrics:group.regressions})),
      uncertaintyRule:"independent-crop paired mean; one-sided 95% normal approximation; reference only"}};
  }
  function compareFrozen({planner,activeSnapshot,candidateSnapshot,records=[],plantingEvents=[],asOf,evidence,observations=[],maxFolds=24}={}){
    const activeRows=[],candidateRows=[],excluded=[];
    const result=()=>({kind:"frozen-yield-paired-reconstruction",activeRows,candidateRows,excluded,
      ...compareRows(activeRows,candidateRows,{asOf}),
      limitations:["両世代の完成後の収穫日開始時点を同条件で比較します。収穫予定日や気象予報範囲を延長しません。",
        "独立作ごとの平均で評価します。過去に上書きされた入力版は再現できず、不明な範囲配分は採点しません。"]});
    let active,candidate;
    try{active=hydrateModel(activeSnapshot?.coefficients?.yield,{asOf});candidate=hydrateModel(candidateSnapshot?.coefficients?.yield,{asOf});}
    catch(error){excluded.push({reason:"missingOrInvalidFrozenYield",message:String(error.message||error)});return result();}
    const after=Math.max(instant(activeSnapshot.trainedAsOf),instant(candidateSnapshot.trainedAsOf),instant(active.trainedAsOf),instant(candidate.trainedAsOf));
    const trainedIds=new Set([...active.training.cropIds,...candidate.training.cropIds]);
    const truth=buildDataset({records,plantingEvents,asOf,evidence,observations});
    const targets=truth.harvestRows.filter(row=>row.date<truth.asOf && row.evaluable && !trainedIds.has(row.cropId) && instant(row.date)>after);
    const dates=[...new Set(targets.map(row=>row.date))].sort(),limit=Math.max(1,Math.min(40,Math.floor(number(maxFolds)??24)));
    const selected=dates.length<=limit ? dates : limit===1 ? [dates[0]] : [...new Set(Array.from({length:limit},(_,i)=>dates[Math.floor(i*(dates.length-1)/(limit-1))]))];
    selected.forEach(origin=>{
      const past=buildDataset({records,plantingEvents,asOf:origin,evidence,observations});
      targets.filter(row=>row.date===origin).forEach(actual=>{
        const input=currentInput(past,{palletKeys:actual.palletKeys,plantingEventId:actual.plantingEventId});
        if(!input.valid){excluded.push({id:actual.id,reasons:input.reasons});return;}
        const predictions=[active,candidate].map(fit=>planner.quantity(fit.model,input));
        if(predictions.some(prediction=>prediction.center===null)) return;
        activeRows.push(scored(actual,predictions[0],input,origin));candidateRows.push(scored(actual,predictions[1],input,origin));
      });
    });
    return result();
  }
  function compareSaved({entries=[],activeSnapshot,candidateSnapshot,candidateIds=[candidateSnapshot?.modelVersion],records=[],plantingEvents=[],asOf,evidence,observations=[],leadDays=3}={}){
    const activeRows=[],candidateRows=[],excluded=[],boundary=cutoff(asOf);
    const result=()=>({kind:"prospective-yield-paired",leadDays,activeRows,candidateRows,excluded,...compareRows(activeRows,candidateRows,{asOf})});
    let active,candidate;
    try{active=hydrateModel(activeSnapshot?.coefficients?.yield,{asOf});candidate=hydrateModel(candidateSnapshot?.coefficients?.yield,{asOf});}
    catch(error){excluded.push({reason:"missingOrInvalidFrozenYield"});return result();}
    const after=Math.max(instant(activeSnapshot.trainedAsOf),instant(candidateSnapshot.trainedAsOf),instant(active.trainedAsOf),instant(candidate.trainedAsOf));
    const trainedIds=new Set([...active.training.cropIds,...candidate.training.cropIds]);
    const truth=buildDataset({records,plantingEvents,asOf,evidence,observations});
    const snapshots=entries.filter(entry=>entry?.kind==="prediction" && entry.payload?.modelVersion===activeSnapshot.modelVersion
      && candidateIds.includes(entry.payload?.shadowModelVersion) && instant(entry.capturedAt)!==null
      && instant(entry.capturedAt)>after && instant(entry.capturedAt)<boundary.time
      && cutoff(entry.capturedAt).date===entry.asOf && day(entry.payload?.asOf?.slice(0,10))===entry.asOf
      && instant(entry.payload.asOf)!==null && instant(entry.payload.asOf)>after && instant(entry.payload.asOf)<=instant(entry.capturedAt))
      .slice().sort((a,b)=>instant(a.capturedAt)-instant(b.capturedAt));
    const pastByInstant=new Map();
    truth.harvestRows.filter(row=>row.evaluable && row.date<truth.asOf && !trainedIds.has(row.cropId)).forEach(actual=>{
      for(const entry of snapshots){
        if((Date.parse(actual.date)-Date.parse(entry.asOf))/86400000<leadDays) continue;
        const pair=entry.payload.predictions?.find(item=>String(item.plantingEventId)===String(actual.plantingEventId)
          && item.plantingDate===actual.plantingDate && keys(item.palletKeys)?.join(",")===actual.palletKeys.join(","));
        if(!pair?.quantity || !pair?.shadowQuantity) continue;
        if(!pastByInstant.has(entry.payload.asOf)) pastByInstant.set(entry.payload.asOf,buildDataset({records,plantingEvents,asOf:entry.payload.asOf,evidence,observations}));
        const input=currentInput(pastByInstant.get(entry.payload.asOf),{palletKeys:actual.palletKeys,plantingEventId:actual.plantingEventId});
        const forecasts=[pair.quantity,pair.shadowQuantity];
        if(!input.valid || forecasts.some((prediction,index)=>prediction.available!==true || prediction.frozen!==true
          || prediction.modelVersion!==(index ? entry.payload.shadowModelVersion : entry.payload.modelVersion)
          || instant(prediction.yieldTrainedAsOf)!==instant(index ? candidate.trainedAsOf : active.trainedAsOf)
          || prediction.input?.cropId!==input.cropId
          || prediction.input?.plantedHeads!==input.plantedHeads || prediction.input?.partialHeads!==input.partialHeads
          || [prediction.center,prediction.low,prediction.high].some(value=>typeof value!=="number" || !Number.isFinite(value))
          || prediction.low<0 || prediction.low>prediction.center || prediction.high<prediction.center)) continue;
        const extraPartial=actual.input.partialHeads-input.partialHeads;
        if(extraPartial<0) continue;
        const actualCases=actual.cases+extraPartial/CASE_SIZE;
        activeRows.push(scored(actual,forecasts[0],input,entry.asOf,actualCases));
        candidateRows.push(scored(actual,forecasts[1],input,entry.asOf,actualCases));break;
      }
    });
    return result();
  }
  // Calibration consumes only predictions actually saved before their outcome;
  // historical reconstructions must not masquerade as prospective accuracy.
  function scoreSaved({entries=[],records=[],plantingEvents=[],asOf,evidence,observations=[],modelVersion,leadDays=3}={}){
    const boundary=cutoff(asOf),truth=buildDataset({records,plantingEvents,asOf,evidence,observations}),rows=[];
    const past=new Map();
    const snapshots=entries.filter(entry=>entry?.kind==="prediction" && (!modelVersion || entry.payload?.modelVersion===modelVersion)
      && instant(entry.capturedAt)!==null && instant(entry.capturedAt)<boundary.time
      && cutoff(entry.capturedAt).date===entry.asOf && entry.payload?.asOf?.slice(0,10)===entry.asOf
      && instant(entry.payload.asOf)!==null && instant(entry.payload.asOf)<=instant(entry.capturedAt)
      && instant(entry.payload?.modelTrainedAsOf)!==null && instant(entry.payload.modelTrainedAsOf)<=instant(entry.payload.asOf))
      .slice().sort((a,b)=>instant(a.capturedAt)-instant(b.capturedAt));
    truth.harvestRows.filter(row=>row.evaluable && row.date<truth.asOf).forEach(actual=>{
      const seen=new Set();
      for(const entry of snapshots){
        const version=entry.payload.modelVersion;
        if(seen.has(version) || (Date.parse(actual.date)-Date.parse(entry.asOf))/86400000<leadDays) continue;
        const pair=entry.payload.predictions?.find(item=>String(item.plantingEventId)===String(actual.plantingEventId)
          && item.plantingDate===actual.plantingDate && keys(item.palletKeys)?.join(",")===actual.palletKeys.join(","));
        const prediction=pair?.quantity;
        if(!prediction?.available || prediction.frozen!==true || prediction.modelVersion!==version
          || instant(prediction.yieldTrainedAsOf)===null || instant(prediction.yieldTrainedAsOf)>instant(entry.payload.asOf)) continue;
        if(!past.has(entry.payload.asOf)) past.set(entry.payload.asOf,buildDataset({records,plantingEvents,asOf:entry.payload.asOf,evidence,observations}));
        const input=currentInput(past.get(entry.payload.asOf),{palletKeys:actual.palletKeys,plantingEventId:actual.plantingEventId});
        if(!input.valid || prediction.input?.cropId!==input.cropId || prediction.input?.plantedHeads!==input.plantedHeads
          || prediction.input?.partialHeads!==input.partialHeads || [prediction.center,prediction.low,prediction.high].some(value=>typeof value!=="number" || !Number.isFinite(value))
          || prediction.low<0 || prediction.low>prediction.center || prediction.high<prediction.center) continue;
        const extraPartial=actual.input.partialHeads-input.partialHeads;
        if(extraPartial<0) continue;
        rows.push({...scored(actual,prediction,input,entry.asOf,actual.cases+extraPartial/CASE_SIZE),modelVersion:version,capturedAt:entry.capturedAt});
        seen.add(version);
      }
    });
    return {kind:"saved-yield-calibration",rows,metrics:metrics(rows),leadDays};
  }
  function predict({ planner, model, dataset, palletKeys, plantingEventId } = {}){
    if(!planner?.quantity) throw new Error("既存のケース数計算が必要です");
    const input = currentInput(dataset,{palletKeys,plantingEventId});
    const result = planner.quantity(model?.model || model,input.valid ? input : {pallets:[]});
    return { ...result, available:input.valid && result.center !== null, input, reasons:input.reasons,
      quantityKind:"remaining-cases-in-specified-scope", readinessEvaluated:false };
  }
  function backtest({ planner, records, plantingEvents, asOf, maxFolds = 24, evidence, observations = [] } = {}){
    if(!planner?.fitYield || !planner?.quantity) throw new Error("既存の収量計算が必要です");
    const truth = buildDataset({records,plantingEvents,asOf,evidence,observations}), rows = [], excluded = [];
    const targets = truth.harvestRows.filter(row => row.date < truth.asOf && row.evaluable);
    const dates = [...new Set(targets.map(row => row.date))].sort();
    const limit = Math.max(1,Math.min(40,Math.floor(number(maxFolds) ?? 24)));
    const selected = dates.length <= limit ? dates : limit === 1 ? [dates[0]]
      : [...new Set(Array.from({length:limit},(_,i) => dates[Math.floor(i*(dates.length-1)/(limit-1))]))];
    selected.forEach(origin => {
      const past = buildDataset({records,plantingEvents,asOf:origin,evidence,observations});
      targets.filter(row => row.date === origin).forEach(actual => {
        const input = currentInput(past,{palletKeys:actual.palletKeys,plantingEventId:actual.plantingEventId});
        if(!input.valid){ excluded.push({id:actual.id,reasons:input.reasons}); return; }
        const training = past.yieldRows.filter(row => row.cropId !== actual.cropId && row.date < origin
          && (row.availableAt === null || row.availableAt < instant(origin)));
        const fitted = planner.fitYield(training), prediction = planner.quantity(fitted,input);
        if(prediction.center === null){ excluded.push({id:actual.id,reasons:["quantityUnavailable"]}); return; }
        rows.push({id:actual.id,cropId:actual.cropId,plantingEventId:actual.plantingEventId,asOf:origin,outcomeDate:actual.date,building:actual.building,
          actualCases:actual.cases,predictedCases:prediction.center,low:prediction.low,high:prediction.high,
          error:prediction.center-actual.cases,intervalHit:Number(actual.cases >= prediction.low && actual.cases <= prediction.high),
          trainingCrops:training.length,trainingCropIds:training.map(row => row.cropId),reference:prediction.reference,
          plantedHeads:input.plantedHeads,knownPartialHeads:input.partialHeads});
      });
    });
    return {schemaVersion:1,kind:"chronological-yield-reconstruction",rows,excluded,
      metrics:metrics(rows),
      unscored:truth.harvestRows.filter(row=>!row.evaluable).map(row=>({id:row.id,reasons:row.reasons})),
      rejectedRecords:truth.rejected,
      reconciliation:truth.diagnostics,limitations:[...truth.limitations,
        "各収穫日の開始時点より前に確定した別の作だけで学習します。同日部分収穫の順序が分からない収穫は採点しません。",
        "これは苗数と残存数量の比較です。予報範囲外の日の適期や収穫予定ケースを保証するものではありません。"]};
  }
  return Object.freeze({schemaVersion:1,buildDataset,currentInput,fit,predict,backtest,exportModel,hydrateModel,metrics,compareRows,compareFrozen,compareSaved,scoreSaved});
});
