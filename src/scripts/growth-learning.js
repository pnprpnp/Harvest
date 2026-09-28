// Training lifecycle and prospective comparisons, independent of DOM and transport.
(function(root,factory){
  const api=factory();
  if(typeof module === "object" && module.exports) module.exports=api;
  else root.HarvestGrowthLearning=api;
})(typeof globalThis !== "undefined" ? globalThis : this,function(){
  "use strict";
  const clone=value=>JSON.parse(JSON.stringify(value));
  const labels={small:0,normal:1,large:2};
  const date=value=>typeof value === "string" ? value.slice(0,10) : "";
  const days=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/86400000);
  function score(prediction,sample,origin,targetDate,risk){
    const known=targetDate === sample.date && sample.signalKind !== "partial-bed"
      && labels[sample.sizeRating] !== undefined && labels[prediction?.status] !== undefined;
    const actualReady=sample.readyDate && sample.readyDate > origin && prediction?.readyStart;
    // Interval membership is a constraint, never an invented point optimum.
    let constraint=null;
    if(known){
      constraint=0;
      if(sample.sizeRating === "small" && prediction.status !== "small") constraint=prediction.readyStart ? Math.max(1,days(prediction.readyStart,sample.date)+1) : 1;
      if(sample.sizeRating === "normal" && prediction.status !== "normal") constraint=prediction.status === "small"
        ? prediction.readyStart ? Math.max(1,days(sample.date,prediction.readyStart)) : 1
        : prediction.readyEnd ? Math.max(1,days(prediction.readyEnd,sample.date)) : 1;
      if(sample.sizeRating === "large" && prediction.status !== "large") constraint=prediction.readyEnd ? Math.max(1,days(sample.date,prediction.readyEnd)+1) : 1;
    }
    const grades={none:0,slight:1,many:2};
    const qualityErrors=Object.fromEntries(["elongated","uneven","tipburn"].map(key=>{
      const actual=sample.symptoms?.[key],estimated=risk?.[key]?.severity;
      return [key,targetDate === sample.date && grades[actual] !== undefined && grades[estimated] !== undefined
        && !risk[key].outOfForecast ? Math.abs(grades[actual]-grades[estimated]) : null];
    }));
    return {id:sample.id,groupId:sample.groupId,cropId:sample.cropId,asOf:origin,outcomeDate:sample.date,qualityErrors,
      availableAt:sample.availableAt,building:sample.building,bed:sample.bed,
      season:Math.floor((Number(sample.date.slice(5,7)) % 12)/3),signalKind:sample.signalKind || "harvest",
      actual:sample.sizeRating,predicted:prediction?.status || "unknown",
      ordinalError:known ? Math.abs(labels[sample.sizeRating]-labels[prediction.status]) : null,
      readyError:actualReady ? days(sample.readyDate,prediction.readyStart) : null,
      windowConstraintLoss:constraint,normalHarvestProxyError:null,
      intervalHit:actualReady && prediction.interval ? Number(sample.readyDate >= prediction.interval.start && sample.readyDate <= prediction.interval.end) : null,
      confidence:prediction?.confidence?.level || "reference",trainingCrops:prediction?.basis?.independentCrops || 0};
  }
  function compareSaved(engine,entries,samples,{candidateId,candidateIds=[candidateId],activeId,asOf,leadDays=3}={}){
    const active=[],candidate=[];
    const rows=(entries || []).filter(entry=>entry?.kind === "prediction" && entry.payload?.modelVersion === activeId
      && candidateIds.includes(entry.payload?.shadowModelVersion) && Date.parse(entry.capturedAt) <= Date.parse(asOf))
      .slice().sort((a,b)=>a.capturedAt.localeCompare(b.capturedAt));
    (samples || []).forEach(sample=>{
      if(sample.signalKind === "partial-bed" || sample.date >= date(asOf)
        || sample.availableAt && Date.parse(sample.availableAt) >= Date.parse(asOf)) return;
      for(const entry of rows){
        const origin=engine.dateKey(entry.capturedAt), declared=engine.dateKey(entry.payload.asOf);
        if(!origin || declared !== entry.asOf || origin !== declared || days(origin,sample.date) < leadDays) continue;
        if(!Number.isFinite(Date.parse(entry.payload.modelTrainedAsOf)) || !Number.isFinite(Date.parse(entry.payload.shadowTrainedAsOf))
          || Date.parse(entry.payload.modelTrainedAsOf) > Date.parse(entry.capturedAt)
          || Date.parse(entry.payload.shadowTrainedAsOf) > Date.parse(entry.capturedAt)) continue;
        if(sample.plantingAvailableAt && Date.parse(sample.plantingAvailableAt) >= Date.parse(entry.capturedAt)) continue;
        const pairs=(entry.payload.predictions || []).filter(item=>item.building === sample.building && item.bed === sample.bed
          && item.plantingDate === sample.plantingDate && (sample.plantingEventId === undefined || item.plantingEventId === sample.plantingEventId)
          && item.palletKeys?.some(key=>sample.palletKeys?.includes(key)) && item.shadowPrediction);
        if(!pairs.length) continue;
        const covered=new Set(pairs.flatMap(pair=>pair.palletKeys || []));
        if(sample.palletKeys?.some(key=>!covered.has(key))) continue;
        const scored=[];
        const used=new Set();
        pairs.forEach(pair=>{
          const keys=pair.palletKeys.filter(key=>sample.palletKeys.includes(key) && !used.has(key)).sort();
          if(!keys.length) return;
          keys.forEach(key=>used.add(key));
          const label=pairs.length === 1 ? sample : {...sample,id:`${sample.id}@${keys.join(",")}`,palletKeys:keys};
          const a=score(pair.prediction,label,origin,pair.targetDate,pair.risk),c=score(pair.shadowPrediction,label,origin,pair.targetDate,pair.shadowRisk);
          const useful=row=>row.ordinalError !== null || row.readyError !== null || Object.values(row.qualityErrors).some(value=>value !== null);
          if(useful(a) || useful(c)) scored.push({a,c});
        });
        if(!scored.length) continue;
        scored.forEach(({a,c})=>{active.push(a);candidate.push(c);});
        break; // Earliest eligible stored forecast; never cherry-pick the best.
      }
    });
    return {kind:"prospective-paired",leadDays,active:engine.metrics(active),candidate:engine.metrics(candidate),
      activeRows:active,candidateRows:candidate,gate:engine.comparePredictions(candidate,active,{asOf,allowPriorBaseline:true}),
      limitations:["同じ日時・同じ作・同じ気象で端末に保存した新旧予測だけを比較します。", "保存開始前の予報や未来の観測値から予測を再現しません。"]};
  }
  function create({engine,registry,evaluate,evaluateGenerations,fitAuxiliary,hydrateAuxiliary,fitYieldAuxiliary,evaluateYield,
    readPredictions=async()=>[],isCurrent=()=>true,version=()=>`growth-${Date.now()}`}={}){
    if(!engine || !registry || !evaluate) throw new Error("学習処理の依存先が不足しています");
    async function prepare({samples,asOf,weatherDaily,forecastHistory=[],dataSignature}={}){
      if(!isCurrent()) return null;
      const options={asOf,weatherDaily,forecastHistory,leadDays:3};
      const empty={methods:{},rows:{},selection:{candidateMethod:null,requiresApproval:true},limitations:[],breakdown:{}};
      let active=registry.getActiveSnapshot();
      const storedState=registry.getState();
      // Importing another device's chosen model creates a choice conflict.
      // Its saved baseline may serve as fallback, but must not be silently
      // activated or replaced by a freshly fitted initial generation.
      if(!active && storedState.baselineId) active=registry.getGeneration(storedState.baselineId)?.modelSnapshot || null;
      if(!active){
        const fit=engine.fit(samples,{...options,selectedMethod:"legacy",validation:empty});
        active=engine.exportModel(fit,{modelVersion:version()});
        if(fitAuxiliary) active.coefficients.quality=fitAuxiliary(samples,options);
        if(fitYieldAuxiliary) active.coefficients.yield=fitYieldAuxiliary(options);
        if(!isCurrent()) return null;
        registry.initialBaseline(active,{dataSignature});
      }
      let state=registry.getState(),evaluation=state.evaluation?.summary || {};
      if(state.activeId && registry.needsEvaluation(dataSignature)){
        const validation=await evaluate(samples,{...options,baselineMethod:active.method});
        if(!isCurrent()) return null;
        let candidate=registry.getCandidateSnapshot();
        const usable=engine.normalizeSamples(samples,asOf).samples.filter(row=>!row.excludedFromTraining
          && row.signalKind !== "partial-bed" && (row.readyDate || labels[row.sizeRating] !== undefined));
        const currentCrops=Math.min(new Set(usable.map(row=>row.cropId)).size,new Set(usable.map(row=>row.groupId)).size);
        const warmedUp=candidate && (candidate.training.independentCrops || 0) < 8 && currentCrops >= 8;
        // A trial generation remains frozen while its prospective evidence grows.
        // New outcomes do not silently replace that generation on every harvest.
        function beginTrial(reason){
          const method=validation.selection?.candidateMethod || active.method;
          const fit=engine.fit(samples,{...options,selectedMethod:method,validation});
          candidate=engine.exportModel(fit,{modelVersion:version()});
          if(fitAuxiliary) candidate.coefficients.quality=fitAuxiliary(samples,options);
          if(fitYieldAuxiliary) candidate.coefficients.yield=fitYieldAuxiliary(options);
          registry.registerCandidate(candidate,{eligible:false,dataSignature,
            settings:{stage:"shadow",comparedWith:active.modelVersion,reason},validation});
          registry.setShadowMode(true);
        }
        // A seed fitted before any farm labels must not stay frozen forever.
        // Replace it once at the eight-independent-crop milestone, keeping the
        // old generation and every prediction. Weather alone cannot do this.
        if(!candidate || warmedUp || fitYieldAuxiliary && !candidate.coefficients.yield){
          beginTrial(warmedUp ? "initial-evidence-milestone" : candidate ? "yield-auxiliary-added" : "new-trial");
        }
        const entries=await readPredictions();
        if(!isCurrent()) return null;
        const originalId=registry.getGeneration(candidate.modelVersion)?.settings?.shadowOf || candidate.modelVersion;
        const comparison=compareSaved(engine,entries,samples,{candidateIds:[candidate.modelVersion,originalId],activeId:active.modelVersion,asOf});
        const methodGate=validation.selection?.gates?.[candidate.method];
        const generationComparison=evaluateGenerations ? await evaluateGenerations({activeSnapshot:active,candidateSnapshot:candidate,
          samples,...options}) : {gate:{accepted:false,reason:"missingFrozenEvaluation"}};
        if(!isCurrent()) return null;
        const generationSummary={active:generationComparison.active || null,candidate:generationComparison.candidate || null,
          gate:generationComparison.gate,coverage:generationComparison.coverage || null,sameMethod:candidate.method === active.method};
        const yieldComparison=evaluateYield ? await evaluateYield({activeSnapshot:active,candidateSnapshot:candidate,
          candidateIds:[candidate.modelVersion,originalId],entries,...options}) : null;
        if(!isCurrent()) return null;
        // Prospective validation protects against applying coefficients trained
        // on today's outcomes to yesterday's backtest. Both gates must pass.
        if((candidate.method === active.method || methodGate?.accepted) && generationComparison.gate.accepted && comparison.gate.accepted
          && yieldComparison?.gate?.blocking !== true){
          const promoted={...clone(candidate),modelVersion:version()};
          registry.registerCandidate(promoted,{eligible:true,dataSignature,
            settings:{stage:"validated",shadowOf:originalId,comparedWith:active.modelVersion},
            validation:{walkForward:validation,generations:generationSummary,prospective:{active:comparison.active,candidate:comparison.candidate,gate:comparison.gate},yield:yieldComparison}});
        }else if(!comparison.gate.accepted && comparison.gate.independentCrops >= 16 && comparison.gate.spanDays >= 42
          && currentCrops >= (candidate.training.independentCrops || 0) + 8){
          // A fully tested failed trial can be replaced with a new immutable
          // generation; it must collect its own future evidence from zero.
          beginTrial("failed-trial-with-new-evidence");
        }
        evaluation={validation,generations:generationSummary,prospective:{active:comparison.active,candidate:comparison.candidate,gate:comparison.gate},yield:yieldComparison,
          activeId:active.modelVersion,evaluatedAt:asOf};
        registry.recordEvaluation(dataSignature,evaluation);
        state=registry.getState();
      }
      const runtime=registry.runWithFallback(snapshot=>engine.hydrateModel(snapshot,options));
      if(!runtime.value) throw new Error("採用済みモデルを読み込めません");
      const actualSnapshot=registry.getGeneration(runtime.modelId)?.modelSnapshot || active;
      const candidate=state.shadowEnabled ? registry.getCandidateSnapshot() : null;
      let shadow=null,shadowError="";
      if(candidate){
        try{ shadow=engine.hydrateModel(candidate,options); }
        catch(error){ shadowError=String(error.message || error); }
      }
      return {fit:runtime.value,shadowFit:shadow,
        riskFit:hydrateAuxiliary ? hydrateAuxiliary(actualSnapshot.coefficients.quality,options) : null,
        shadowRiskFit:shadow && hydrateAuxiliary ? hydrateAuxiliary(candidate.coefficients.quality,options) : null,
        modelVersion:runtime.modelVersion,
        shadowModelVersion:shadow ? candidate.modelVersion : null,runtime,shadowError,
        validation:evaluation.validation || empty,state};
    }
    return Object.freeze({prepare});
  }
  return Object.freeze({create,compareSaved,score});
});
