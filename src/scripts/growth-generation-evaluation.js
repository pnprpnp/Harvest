/* Fair comparison of two frozen generations, including updates within one
 * method. Only forecast origins AFTER both generations existed are eligible.
 * No fitting, network access, saved-state writes or automatic adoption.
 */
(function(root, factory){
  const api = factory();
  if(typeof module === "object" && module.exports) module.exports = api;
  if(root) root.HarvestGrowthGenerationEvaluation = api;
})(typeof globalThis === "object" ? globalThis : this, function(){
  "use strict";
  const SYMPTOMS = ["elongated", "uneven", "tipburn"];
  const RANK = { small:0, normal:1, large:2 };
  const GRADE = { none:0, slight:1, many:2 };
  const number = value => typeof value === "number" && Number.isFinite(value) ? value : null;
  const instant = value => number(value) !== null ? value : typeof value === "string" && value.trim()
    && Number.isFinite(Date.parse(value.length === 10 ? value + "T00:00:00+09:00" : value))
    ? Date.parse(value.length === 10 ? value + "T00:00:00+09:00" : value) : null;
  const severity = value => ({ low:"slight", high:"many" })[value] || value;
  function readyAt(snapshot, riskEngine){
    const trained = instant(snapshot?.trainedAsOf);
    if(trained === null) throw new Error("比較する世代の学習完了日時が不明です");
    const quality = riskEngine && snapshot.coefficients?.quality;
    if(!quality) return trained;
    const qualityTrained = instant(quality.trainedAt ?? quality.trainedAsOf);
    if(qualityTrained === null) throw new Error("比較する品質モデルの学習完了日時が不明です");
    return Math.max(trained, qualityTrained);
  }
  function archivedForecasts(history){
    const rows = [];
    let missingAvailability = 0, missingIssue = 0;
    (Array.isArray(history) ? history : []).forEach(snapshot => {
      const daily = snapshot.date ? [snapshot] : snapshot.daily || snapshot.forecastDaily || [];
      daily.forEach(day => {
        const issuedAt = day.issuedAt || day.forecastIssuedAt || snapshot.issuedAt;
        const availableAt = day.availableAt || day.capturedAt || day.retrievedAt
          || snapshot.availableAt || snapshot.capturedAt || snapshot.retrievedAt;
        if(instant(issuedAt) === null){ missingIssue++; return; }
        // An issue time alone cannot prove this device had archived the forecast.
        if(instant(availableAt) === null){ missingAvailability++; return; }
        rows.push({ ...day, source:"forecast", issuedAt, availableAt });
      });
    });
    return { rows, missingAvailability, missingIssue };
  }
  function defaultScore(engine, prediction, sample, origin, targetDate, risk){
    const known = targetDate === sample.date && sample.signalKind !== "partial-bed"
      && RANK[sample.sizeRating] !== undefined && RANK[prediction?.status] !== undefined;
    const ready = sample.readyDate && sample.readyDate > origin && prediction?.readyStart;
    let constraint = known ? 0 : null;
    if(known && sample.sizeRating === "small" && prediction.status !== "small") constraint = prediction.readyStart
      ? Math.max(1, engine.daysBetween(prediction.readyStart, sample.date) + 1) : 1;
    if(known && sample.sizeRating === "normal" && prediction.status !== "normal") constraint = prediction.status === "small"
      ? prediction.readyStart ? Math.max(1, engine.daysBetween(sample.date, prediction.readyStart)) : 1
      : prediction.readyEnd ? Math.max(1, engine.daysBetween(prediction.readyEnd, sample.date)) : 1;
    if(known && sample.sizeRating === "large" && prediction.status !== "large") constraint = prediction.readyEnd
      ? Math.max(1, engine.daysBetween(sample.date, prediction.readyEnd) + 1) : 1;
    return { actual:sample.sizeRating, predicted:prediction?.status || "unknown",
      ordinalError:known ? Math.abs(RANK[sample.sizeRating] - RANK[prediction.status]) : null,
      readyError:ready ? engine.daysBetween(sample.readyDate, prediction.readyStart) : null,
      windowConstraintLoss:constraint, normalHarvestProxyError:null,
      intervalHit:ready && prediction.interval ? Number(sample.readyDate >= prediction.interval.start && sample.readyDate <= prediction.interval.end) : null,
      confidence:prediction?.confidence?.level || "reference", trainingCrops:prediction?.basis?.independentCrops || 0,
      qualityErrors:Object.fromEntries(SYMPTOMS.map(key => [key, GRADE[severity(sample.symptoms?.[key])] !== undefined
        && GRADE[risk?.[key]?.severity] !== undefined && !risk[key].outOfForecast
        ? Math.abs(GRADE[severity(sample.symptoms[key])] - GRADE[risk[key].severity]) : null])) };
  }
  function summarize(engine, rows){
    const result = engine.metrics(rows);
    result.quality = Object.fromEntries(SYMPTOMS.map(symptom => {
      const known = rows.filter(row => number(row.qualityErrors?.[symptom]) !== null);
      const scored = engine.metrics(known.map(row => ({ ...row, ordinalError:row.qualityErrors[symptom] })));
      return [symptom, { count:known.length, independentCrops:scored.independentCrops, mae:scored.ordinalMAE,
        status:known.length ? "frozen-generation-comparison" : "not-evaluated" }];
    }));
    return result;
  }
  function compareFrozen({ engine, activeSnapshot, candidateSnapshot, samples, asOf, weatherDaily = [],
    forecastHistory = [], riskEngine, score, leadDays = 3, maxFolds = 24 } = {}){
    if(!engine || ["normalizeSamples", "dateKey", "addDays", "daysBetween", "prepareWeather", "hydrateModel", "predict", "metrics", "comparePredictions"]
      .some(key => typeof engine[key] !== "function")) throw new Error("世代比較に必要な生育エンジンがありません");
    const asOfDay = engine.dateKey(asOf), asOfInstant = instant(asOf);
    if(!asOfDay || asOfInstant === null) throw new Error("世代比較には有効な評価時点が必要です");
    const activeReady = readyAt(activeSnapshot, riskEngine), candidateReady = readyAt(candidateSnapshot, riskEngine);
    const earliest = Math.max(activeReady, candidateReady);
    leadDays = Math.max(1, Math.min(28, Math.floor(number(leadDays) ?? 3)));
    maxFolds = Math.max(1, Math.min(40, Math.floor(number(maxFolds) ?? 24)));
    const normalized = engine.normalizeSamples(samples, asOf);
    const archive = archivedForecasts(forecastHistory);
    // Live forecasts are deliberately excluded. Replay requires the archive's
    // original issue AND capture/availability timestamps.
    const observations = (Array.isArray(weatherDaily) ? weatherDaily : []).filter(day => day?.source === "observation");
    const byOrigin = new Map();
    const excluded = { ...normalized.excluded, beforeBothGenerations:0, plantingUnavailableAtOrigin:0,
      forecastMissingIssue:archive.missingIssue, forecastMissingAvailability:archive.missingAvailability };
    normalized.samples.forEach(sample => {
      const origin = engine.addDays(sample.date, -leadDays), originInstant = instant(origin);
      if(originInstant <= earliest){ excluded.beforeBothGenerations++; return; }
      if(sample.plantingDate > origin || sample.plantingAvailableAt !== null && sample.plantingAvailableAt !== undefined
        && instant(sample.plantingAvailableAt) >= originInstant){ excluded.plantingUnavailableAtOrigin++; return; }
      const rows = byOrigin.get(origin) || []; rows.push(sample); byOrigin.set(origin, rows);
    });
    const origins = [...byOrigin.keys()].sort();
    const selectedOrigins = origins.length <= maxFolds ? origins : maxFolds === 1 ? [origins[0]]
      : [...new Set(Array.from({ length:maxFolds }, (_, i) => origins[Math.floor(i * (origins.length - 1) / (maxFolds - 1))]))];
    const activeRows = [], candidateRows = [], errors = [], foldCoverage = [];
    const scoreFn = typeof score === "function" ? score : (prediction, sample, origin, targetDate, risk) => defaultScore(engine, prediction, sample, origin, targetDate, risk);
    selectedOrigins.forEach(origin => {
      const originTime = origin + "T00:00:00+09:00";
      const options = { asOf:originTime, weatherDaily:observations, forecastHistory:archive.rows };
      let models, risks, context;
      try{
        context = engine.prepareWeather(observations, options);
        models = [activeSnapshot, candidateSnapshot].map(snapshot => engine.hydrateModel(snapshot, options));
        const riskWeather = [...context.observations.values(), ...context.forecasts.values()];
        risks = [activeSnapshot, candidateSnapshot].map(snapshot => riskEngine && snapshot.coefficients?.quality
          ? riskEngine.hydrateModel(snapshot.coefficients.quality, { asOf:originTime, weatherDaily:riskWeather }) : null);
      }catch(error){ errors.push({ origin, message:String(error.message || error) }); return; }
      let scored = 0;
      byOrigin.get(origin).forEach(sample => {
        // Future harvest ratings, recorded readiness and symptoms are outcomes,
        // never predictors sent to either frozen generation.
        const input = { asOf:originTime, plantingDate:sample.plantingDate, targetDate:sample.date,
          building:sample.building, bed:sample.bed, palletKeys:sample.palletKeys,
          positionKey:sample.positionKey, plantingEventId:sample.plantingEventId,
          manualAdjustment:sample.manualAdjustment, environmentRegimes:sample.environmentRegimes };
        const symptomSample = { ...sample, symptoms:Object.fromEntries(SYMPTOMS.map(key => [key, severity(sample.symptoms?.[key])])) };
        try{
          const scores = models.map((model, index) => {
            const prediction = engine.predict(model, input);
            const quality = risks[index] ? riskEngine.predict(risks[index], { ...input, forecastDate:sample.date }) : null;
            const row = { ...scoreFn(prediction, symptomSample, origin, sample.date, quality),
              id:sample.id, groupId:sample.groupId, cropId:sample.cropId, asOf:origin, outcomeDate:sample.date,
              availableAt:sample.availableAt, building:sample.building, bed:sample.bed,
              season:Math.floor((Number(sample.date.slice(5,7)) % 12) / 3), signalKind:sample.signalKind || "harvest",
              dayCounts:prediction.dayCounts || null };
            if(!context.forecasts.size){
              row.qualityErrors = Object.fromEntries(SYMPTOMS.map(key => [key, null]));
            }
            if(!context.forecasts.size || prediction.predictionAvailable === false || prediction.outOfForecast){
              row.ordinalError = row.readyError = row.windowConstraintLoss = row.intervalHit = null;
            }
            if(sample.signalKind === "partial-bed") row.ordinalError = row.windowConstraintLoss = null;
            return row;
          });
          activeRows.push(scores[0]); candidateRows.push(scores[1]);
          if(scores.some(row => number(row.ordinalError) !== null || number(row.readyError) !== null
            || SYMPTOMS.some(key => number(row.qualityErrors?.[key]) !== null))) scored++;
        }catch(error){ errors.push({ origin, sampleId:sample.id, message:String(error.message || error) }); }
      });
      foldCoverage.push({ origin, samples:byOrigin.get(origin).length, scoredSamples:scored,
        archivedForecastDays:context.forecasts.size, forecastEndDate:context.forecastEndDate });
    });
    const compared = engine.comparePredictions(candidateRows, activeRows, { asOf, allowPriorBaseline:true });
    const gate = errors.length ? { ...compared, accepted:false, reason:"frozenGenerationEvaluationError" } : compared;
    return { schemaVersion:1, kind:"frozen-generation-archived-forecast", asOf:asOfDay, leadDays,
      activeModelVersion:activeSnapshot.modelVersion, candidateModelVersion:candidateSnapshot.modelVersion,
      sameMethod:activeSnapshot.method === candidateSnapshot.method,
      generationAvailableAfter:new Date(earliest).toISOString(),
      active:summarize(engine, activeRows), candidate:summarize(engine, candidateRows), activeRows, candidateRows,
      gate, requiresApproval:true, excluded, errors, foldCoverage,
      coverage:{ eligibleOrigins:origins.length, evaluatedOrigins:selectedOrigins.length,
        evaluatedSamples:activeRows.length, scoredSamples:foldCoverage.reduce((total, fold) => total + fold.scoredSamples, 0) },
      limitations:["両方の係数世代と品質モデルが完成した後の原点だけを比較します。同じ方式の係数更新も対象です。",
        "発表時刻と保存・利用可能時刻が確認できる過去予報だけを使用します。未保存の予報を将来実測や平年値で補いません。",
        "過去観測は現在保存されている版です。観測の訂正や上書きされた入力・環境設定を完全には再現できません。",
        "これは凍結係数による保存予報の再計算です。当時保存した予測そのものの比較とは別に表示します。",
        "原点は実際の収穫日の一定日前です。当時の作業予定を再現した評価ではありません。",
        ...(riskEngine ? [] : ["品質モデルを受け取っていないため品質は未評価です。"])] };
  }
  return Object.freeze({ schemaVersion:1, compareFrozen });
});
