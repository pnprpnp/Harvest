/* Historical symptom/weather associations. Frequencies describe recorded crops;
 * they are not calibrated probabilities or evidence of a causal relationship.
 * All predictions remain reference-only until prospective validation exists.
 */
(function(root, factory){
  const api = factory();
  if(typeof module === "object" && module.exports) module.exports = api;
  if(root) root.HarvestGrowthRisk = api;
})(typeof globalThis === "object" ? globalThis : this, function(){
  "use strict";
  const DAY = 86400000;
  const SYMPTOMS = ["elongated", "uneven", "tipburn"];
  const normalizeSeverity = value => ["none", "slight", "many", "legacy-present"].includes(value)
    ? value : ({ present:"legacy-present", low:"slight", high:"many" })[value] || "unknown";
  const present = value => ["slight", "many", "legacy-present"].includes(value);
  const WINDOW_DAYS = 7;
  const MIN_COVERAGE = 0.8;
  const PRIOR_STRENGTH = 6;
  const clamp = (number, min, max) => Math.max(min, Math.min(max, number));
  function numeric(value){
    if(typeof value !== "number" && typeof value !== "string") return null;
    if(String(value).trim() === "") return null;
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }
  function dateKey(value){
    let text = String(value || "");
    if(value instanceof Date || text.length > 10){
      const time = new Date(value).getTime();
      if(!Number.isFinite(time)) return null;
      text = new Date(time + 9 * 3600000).toISOString().slice(0, 10);
    }
    if(!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    const time = Date.parse(text + "T00:00:00Z");
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === text ? text : null;
  }
  function timestamp(value){
    if(value === null || value === undefined || value === "") return null;
    const time = typeof value === "number" ? value : Date.parse(String(value));
    return Number.isFinite(time) ? time : null;
  }
  function cutoff(value){
    const date = dateKey(value);
    if(!date) throw new Error("Growth risk requires an explicit valid asOf date");
    const instant = timestamp(value instanceof Date || String(value).length > 10
      ? value : date + "T00:00:00+09:00");
    return { date, instant };
  }
  const addDays = (date, days) => new Date(Date.parse(date + "T00:00:00Z") + days * DAY).toISOString().slice(0, 10);
  function adjustment(value){
    return {
      temperatureOffsetC:clamp(numeric(value?.temperatureOffsetC) ?? 0, -5, 5),
      lightMultiplier:clamp(numeric(value?.lightMultiplier) ?? 1, 0.5, 1.5)
    };
  }
  function datedAdjustment(value, regimes, date, instant){
    const applicable = (Array.isArray(regimes) ? regimes : []).filter(regime => dateKey(regime.startDate)
      && dateKey(regime.startDate) <= date && (!dateKey(regime.endDate) || dateKey(regime.endDate) >= date)
      && (timestamp(regime.availableAt) === null || timestamp(regime.availableAt) < instant))
      .sort((a,b) => (numeric(a.scopePriority) || 0) - (numeric(b.scopePriority) || 0) || String(a.startDate).localeCompare(String(b.startDate))
        || (timestamp(a.availableAt) || 0) - (timestamp(b.availableAt) || 0));
    return adjustment(applicable.reduce((result, regime) => ({ ...result, ...regime }), value || {}));
  }
  function normalizeWeather(raw){
    const date = dateKey(raw?.date);
    if(!date) return null;
    const temperature = numeric(raw.meanTemp);
    const sunshineHours = numeric(raw.sunshineHours);
    const reportedLight = numeric(raw.lightIndex);
    const light = sunshineHours !== null && sunshineHours >= 0 && sunshineHours <= 24
      ? clamp(sunshineHours / 8, 0.3, 1.2) : reportedLight;
    return {
      ...raw, date,
      meanTemp:temperature !== null && temperature >= -60 && temperature <= 60 ? temperature : null,
      lightIndex:light !== null && light >= 0 && light <= 2 ? light : null
    };
  }
  function prepareWeather(weatherDaily, boundary){
    const observations = new Map(), forecasts = new Map();
    (Array.isArray(weatherDaily) ? weatherDaily : []).forEach(raw => {
      const day = normalizeWeather(raw);
      if(!day) return;
      // Download time does not change when an old observation was measured.
      const availableAt = timestamp(day.source === "observation" ? (day.availableAt || day.observedAt)
        : (day.availableAt || day.capturedAt || day.retrievedAt));
      if(availableAt !== null && availableAt > boundary.instant) return;
      if(day.source === "observation" && day.date < boundary.date){
        observations.set(day.date, day);
      }else if(day.source === "forecast" && day.date >= boundary.date){
        const issuedAt = timestamp(day.issuedAt || day.forecastIssuedAt);
        if(issuedAt === null || issuedAt > boundary.instant) return;
        const prior = forecasts.get(day.date);
        if(!prior || issuedAt > prior.issuedAt) forecasts.set(day.date, { ...day, issuedAt });
      }
    });
    return { observations, forecasts };
  }
  function summarizeWindow(index, start, end, symptom, manual, requireComplete, regimes, instant){
    let expectedDays = 0, knownDays = 0, exposedDays = 0;
    for(let date = start; date <= end; date = addDays(date, 1)){
      expectedDays++;
      const day = index.get(date);
      if(!day || day.meanTemp === null || day.estimatedTemperature === true) continue;
      if(symptom === "elongated" && (day.lightIndex === null || day.estimatedLight === true)) continue;
      if(symptom === "uneven" && (numeric(day.maxTemp) === null || numeric(day.minTemp) === null)) continue;
      knownDays++;
      const effective = regimes?.length ? datedAdjustment(manual, regimes, date, instant) : manual;
      const temperature = day.meanTemp + effective.temperatureOffsetC;
      const light = day.lightIndex === null ? null : day.lightIndex * effective.lightMultiplier;
      if(symptom === "tipburn" ? temperature >= 22 : symptom === "elongated" ? temperature >= 21 && light < 0.8
        : Number(day.maxTemp) - Number(day.minTemp) >= 8) exposedDays++;
    }
    const coverage = expectedDays ? knownDays / expectedDays : 0;
    return { expectedDays, knownDays, exposedDays, coverage,
      exposed:exposedDays > 0,
      eligible:expectedDays > 0 && (!requireComplete || coverage >= MIN_COVERAGE) };
  }
  function normalizedRows(samples, boundary, observations){
    const rows = [], seen = new Set();
    const excluded = { invalidDate:0, future:0, duplicate:0, partial:0, specialCondition:0 };
    (Array.isArray(samples) ? samples : []).forEach((sample, index) => {
      const date = dateKey(sample?.date);
      const plantingDate = dateKey(sample?.plantingDate);
      if(!date || plantingDate && plantingDate > date){ excluded.invalidDate++; return; }
      const availableAt = timestamp(sample.availableAt || sample.recordedAt);
      if(date >= boundary.date || availableAt !== null && availableAt >= boundary.instant){ excluded.future++; return; }
      const plantingKnown = timestamp(sample.plantingAvailableAt);
      if(plantingKnown !== null && plantingKnown > boundary.instant){ excluded.future++; return; }
      const exclusionKnown = timestamp(sample.exclusionAvailableAt);
      if((sample.excludedFromTraining || sample.specialCondition === true || sample.specialCondition?.excludeFromTraining)
        && (exclusionKnown === null || exclusionKnown < boundary.instant)){ excluded.specialCondition++; return; }
      if(sample.type === "partialHarvest" || sample.partialHarvest === true || String(sample.signalKind).startsWith("partial-")){ excluded.partial++; return; }
      const policyWeight = (Array.isArray(sample.trainingPolicies) ? sample.trainingPolicies : []).reduce((weight, policy) => {
        const known = timestamp(policy.availableAt);
        if(known === null || known >= boundary.instant || policy.startDate > date || policy.endDate && plantingDate && policy.endDate < plantingDate) return weight;
        return policy.dataPolicy === "exclude" ? 0 : policy.dataPolicy === "downweight"
          ? Math.min(weight, clamp(numeric(policy.weightFactor) ?? 0.5, 0, 1)) : weight;
      }, 1);
      const weight = clamp(numeric(sample.qualityWeight) ?? 1, 0, 1) * policyWeight;
      if(weight <= 0){ excluded.specialCondition++; return; }
      const id = String(sample.id || `${sample.building}:${sample.bed || ""}:${date}:${index}`);
      if(seen.has(id)){ excluded.duplicate++; return; }
      seen.add(id);
      const row = { id, building:String(sample.building ?? ""), date, weight,
        groupId:String(sample.groupId || sample.id || `${sample.building}:${date}`),
        cropId:sample.cropId ? String(sample.cropId) : null, outcomes:{}, exposures:{} };
      let start = addDays(date, -(WINDOW_DAYS - 1));
      if(plantingDate && plantingDate > start) start = plantingDate;
      SYMPTOMS.forEach(symptom => {
        // Legacy booleans do not establish that absence was actually checked.
        const status = sample.symptoms?.[symptom];
        row.outcomes[symptom] = normalizeSeverity(status);
        row.exposures[symptom] = summarizeWindow(observations, start, date, symptom,
          adjustment(sample.manualAdjustment), true, sample.environmentRegimes, boundary.instant);
      });
      rows.push(row);
    });
    rows.sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
    return { rows, excluded };
  }
  function independentGroups(rows){
    // A record copied to several beds, or repeated records for the same crop,
    // must not inflate the number of independent outcomes.
    const parent = rows.map((_, index) => index), identifiers = new Map();
    const find = index => {
      while(parent[index] !== index){ parent[index] = parent[parent[index]]; index = parent[index]; }
      return index;
    };
    rows.forEach((row, index) => {
      [`record:${row.groupId}`, ...(row.cropId ? [`crop:${row.cropId}`] : [])].forEach(key => {
        if(identifiers.has(key)) parent[find(index)] = find(identifiers.get(key));
        else identifiers.set(key, index);
      });
    });
    const groups = new Map();
    rows.forEach((row, index) => {
      const key = find(index), group = groups.get(key) || [];
      group.push(row); groups.set(key, group);
    });
    return [...groups.values()];
  }
  function summarizeGroups(groups, symptom){
    let confirmedCount = 0, presentCount = 0;
    const excluded = { unknown:0, conflictingOutcome:0, insufficientWeather:0, mixedExposure:0 };
    const bucket = () => ({ count:0, presentCount:0, effectiveCount:0, effectivePresentCount:0,
      severityCounts:{ none:0, slight:0, many:0, "legacy-present":0 }, effectiveSeverityCounts:{ none:0, slight:0, many:0, "legacy-present":0 } });
    const exposed = bucket(), unexposed = bucket();
    groups.forEach(group => {
      const confirmed = group.filter(row => row.outcomes[symptom] !== "unknown");
      if(!confirmed.length){ excluded.unknown++; return; }
      confirmedCount++;
      const hasSymptom = confirmed.some(row => present(row.outcomes[symptom]));
      if(hasSymptom) presentCount++;
      if(new Set(confirmed.map(row => row.outcomes[symptom])).size > 1){ excluded.conflictingOutcome++; return; }
      if(confirmed.some(row => !row.exposures[symptom].eligible)){ excluded.insufficientWeather++; return; }
      if(new Set(confirmed.map(row => row.exposures[symptom].exposed)).size > 1){ excluded.mixedExposure++; return; }
      const bucket = confirmed[0].exposures[symptom].exposed ? exposed : unexposed;
      const weight = Math.min(...confirmed.map(row => row.weight ?? 1));
      bucket.count++;
      if(hasSymptom) bucket.presentCount++;
      bucket.effectiveCount += weight;
      if(hasSymptom) bucket.effectivePresentCount += weight;
      bucket.severityCounts[confirmed[0].outcomes[symptom]]++;
      bucket.effectiveSeverityCounts[confirmed[0].outcomes[symptom]] += weight;
    });
    const count = exposed.count + unexposed.count;
    const effectiveCount = exposed.effectiveCount + unexposed.effectiveCount;
    const positiveCount = exposed.effectivePresentCount + unexposed.effectivePresentCount;
    const pooledRate = effectiveCount ? positiveCount / effectiveCount : null;
    [exposed, unexposed].forEach(bucket => {
      bucket.rawRate = bucket.count ? bucket.presentCount / bucket.count : null;
      bucket.shrunkRate = bucket.effectiveCount && pooledRate !== null
        ? (bucket.effectivePresentCount + PRIOR_STRENGTH * pooledRate) / (bucket.effectiveCount + PRIOR_STRENGTH) : null;
    });
    return { confirmedCount, presentCount,
      association:{
        kind:"historical-conditional-frequency", status:effectiveCount >= 12 && exposed.effectiveCount >= 5 && unexposed.effectiveCount >= 5
          ? "descriptive" : "insufficient-data",
        windowDays:WINDOW_DAYS, minimumCoverage:MIN_COVERAGE,
        definition:symptom === "tipburn" ? "mean-temperature-at-least-22" : symptom === "elongated"
          ? "mean-temperature-at-least-21-and-light-below-0.8" : "daily-temperature-range-at-least-8-reference-feature",
        minimumExposedDays:1, exposed, unexposed, eligibleCount:count, effectiveCount, pooledRate,
        priorStrength:PRIOR_STRENGTH,
        shrunkRateDifference:exposed.shrunkRate !== null && unexposed.shrunkRate !== null
          ? exposed.shrunkRate - unexposed.shrunkRate : null,
        excluded,
        validation:{ status:"not-validated", reason:"過去の条件別集計です。予報を使った前向き検証は未実施です。" }
      }
    };
  }
  function fit(samples, options = {}){
    const boundary = cutoff(options.asOf);
    const weather = prepareWeather(options.weatherDaily, boundary);
    const normalized = normalizedRows(samples, boundary, weather.observations);
    const rowsByBuilding = new Map();
    normalized.rows.forEach(row => {
      const rows = rowsByBuilding.get(row.building) || [];
      rows.push(row); rowsByBuilding.set(row.building, rows);
    });
    const buildings = Object.create(null);
    rowsByBuilding.forEach((rows, building) => {
      const groups = independentGroups(rows);
      buildings[building] = Object.fromEntries(SYMPTOMS.map(symptom => [symptom, summarizeGroups(groups, symptom)]));
    });
    return { version:2, asOf:boundary.date, asOfInstant:boundary.instant, buildings,
      excluded:normalized.excluded, forecastDays:[...weather.forecasts.values()],
      weatherInput:options.weatherDaily };
  }
  function predict(model, input = {}){
    const boundary = cutoff(input.asOf);
    const fitAvailable = model && model.asOfInstant <= boundary.instant;
    const weather = fitAvailable && model.asOfInstant === boundary.instant
      && (!input.weatherDaily || input.weatherDaily === model.weatherInput)
      ? new Map(model.forecastDays.map(day => [day.date, day]))
      : prepareWeather(input.weatherDaily || model?.forecastDays, boundary).forecasts;
    const target = dateKey(input.forecastDate);
    const end = target && target < addDays(boundary.date, WINDOW_DAYS - 1)
      ? target : addDays(boundary.date, WINDOW_DAYS - 1);
    const result = {};
    SYMPTOMS.forEach(symptom => {
      const historic = fitAvailable && Object.prototype.hasOwnProperty.call(model.buildings || {}, String(input.building))
        ? model.buildings[String(input.building)][symptom] : summarizeGroups([], symptom);
      const current = summarizeWindow(weather, boundary.date, end, symptom, adjustment(input.manualAdjustment), false, input.environmentRegimes, boundary.instant);
      const condition = symptom === "tipburn" ? "平均気温22℃以上" : symptom === "elongated"
        ? "平均気温21℃以上かつ日照係数0.8未満" : "日較差8℃以上（検証用の参考条件）";
      const association = historic.association;
      const parts = [`${condition}の予報が${current.exposedDays}日（有効な予報${current.knownDays}日）。`];
      if(historic.confirmedCount){
        parts.push(`同じ号棟の確認済み${historic.confirmedCount}作中、症状あり${historic.presentCount}作。`);
      }else{
        parts.push("同じ号棟の確認済み症状記録がありません。");
      }
      if(association.eligibleCount){
        parts.push(`収穫直前の最大${WINDOW_DAYS}日間の気象と比較できた過去${association.eligibleCount}作では、` +
          `条件あり${association.exposed.count}作中${association.exposed.presentCount}作、` +
          `条件なし${association.unexposed.count}作中${association.unexposed.presentCount}作に症状を記録。`);
      }
      if(association.status === "insufficient-data") parts.push("気象条件との関係を判断するデータが不足しています。");
      parts.push("条件別の過去集計で、因果関係・発生確率は未検証です。");
      const bucket = current.exposed ? association.exposed : association.unexposed;
      const enough = association.status === "descriptive" && (bucket.effectiveCount ?? bucket.count) >= 5 && current.coverage >= MIN_COVERAGE;
      const frequency = enough ? bucket.shrunkRate : null;
      const level = frequency === null ? "unknown" : frequency >= 0.5 ? "high" : frequency >= 0.2 ? "medium" : "low";
      const severity = bucket.effectiveSeverityCounts || bucket.severityCounts || {};
      const knownSeverityCount = (severity.none || 0) + (severity.slight || 0) + (severity.many || 0);
      const predictedSeverity = enough && knownSeverityCount >= 8 && knownSeverityCount / Math.max(1, bucket.effectiveCount ?? bucket.count) >= MIN_COVERAGE
        ? ["none", "slight", "many"].sort((a,b) => (severity[b] || 0) - (severity[a] || 0))[0] : "unknown";
      const forecastEndDate = [...weather.keys()].sort().pop() || null;
      const outOfForecast = !forecastEndDate || target && target > forecastEndDate;
      result[symptom] = {
        level:outOfForecast ? "unknown" : level,
        label:outOfForecast ? "気象予報範囲外のため未予測" : ({ low:"低", medium:"中", high:"高", unknown:"判断材料不足" })[level],
        reference:true, confidence:{ level:"low", label:"低", reason:"品質予測の前向き検証は不足" },
        severity:outOfForecast ? "unknown" : predictedSeverity, riskStartsAt:!outOfForecast && ["medium", "high"].includes(level)
          ? [...weather.keys()].sort().find(date => date >= boundary.date && date <= end && summarizeWindow(weather, date, date, symptom, adjustment(input.manualAdjustment), false, input.environmentRegimes, boundary.instant).exposedDays > 0) || null : null,
        outOfForecast, forecastEndDate, positionFallback:!!input.positionKey,
        riskStartsAtKind:"reference-weather-condition",
        reason:parts.join(""), confirmedCount:historic.confirmedCount, presentCount:historic.presentCount,
        weatherDays:current.exposedDays, forecastWeatherDays:current.knownDays,
        expectedWeatherDays:current.expectedDays, association, validation:association.validation
      };
    });
    return result;
  }
  function exportModel(model){
    return JSON.parse(JSON.stringify({ schemaVersion:2, trainedAsOf:model.asOf, trainedAt:model.asOfInstant, buildings:model.buildings }));
  }
  function hydrateModel(snapshot, options = {}){
    if(snapshot?.schemaVersion !== 2 || !snapshot.buildings || typeof snapshot.buildings !== "object") throw new Error("品質モデルが不正です");
    const boundary = cutoff(options.asOf);
    if(timestamp(snapshot.trainedAt) === null || snapshot.trainedAt > boundary.instant) throw new Error("品質モデルより前の時点です");
    const weather = prepareWeather(options.weatherDaily, boundary);
    return { version:2, asOf:boundary.date, asOfInstant:boundary.instant, buildings:JSON.parse(JSON.stringify(snapshot.buildings)),
      excluded:{}, forecastDays:[...weather.forecasts.values()], weatherInput:options.weatherDaily, restored:true };
  }
  function backtest(samples, options = {}){
    const boundary = cutoff(options.asOf), rows = [];
    const outcomes = (samples || []).filter(sample => dateKey(sample.date) && dateKey(sample.date) < boundary.date
      && (timestamp(sample.availableAt || sample.recordedAt) === null || timestamp(sample.availableAt || sample.recordedAt) <= boundary.instant))
      .map((sample, index) => ({ ...sample, id:sample.id || `row:${index}`,
        groupId:sample.groupId || sample.id || `${sample.building}:${sample.date}`,
        cropId:sample.cropId || `${sample.building}:${sample.bed || ""}:${sample.plantingDate || sample.date}` }));
    const archive = (options.forecastHistory || []).flatMap(snapshot => snapshot.date ? [{ ...snapshot, source:"forecast" }]
      : (snapshot.daily || snapshot.forecastDaily || []).map(day => ({ ...day, source:"forecast",
        issuedAt:day.issuedAt || snapshot.issuedAt || snapshot.fetchedAt,
        availableAt:day.availableAt || snapshot.availableAt || snapshot.capturedAt || snapshot.retrievedAt })));
    const days = (options.weatherDaily || []).concat(archive);
    const dates = [...new Set(outcomes.map(sample => dateKey(sample.date)))].sort();
    const selected = dates.length > 24 ? [...new Set(Array.from({ length:24 }, (_, i) => dates[Math.floor(i * (dates.length - 1) / 23)]))] : dates;
    selected.forEach(date => {
      const origin = addDays(date, -6);
      const testing = outcomes.filter(sample => dateKey(sample.date) === date);
      const crops = new Set(testing.map(sample => sample.cropId)), groups = new Set(testing.map(sample => sample.groupId));
      const training = outcomes.filter(sample => dateKey(sample.date) < origin && !crops.has(sample.cropId) && !groups.has(sample.groupId));
      const fitted = fit(training, { asOf:origin, weatherDaily:days });
      testing.forEach(sample => {
        const plantingKnown = timestamp(sample.plantingAvailableAt);
        if(plantingKnown !== null && plantingKnown >= cutoff(origin).instant) return;
        const prediction = predict(fitted, { asOf:origin, forecastDate:date, building:sample.building,
          manualAdjustment:sample.manualAdjustment, environmentRegimes:sample.environmentRegimes });
        SYMPTOMS.forEach(symptom => {
          const actual = normalizeSeverity(sample.symptoms?.[symptom]);
          const estimated = prediction[symptom].severity;
          const ranks = { none:0, slight:1, many:2 };
          rows.push({ id:sample.id, groupId:sample.groupId, cropId:sample.cropId, date, origin, building:sample.building, symptom,
            actual, predicted:estimated, loss:actual in ranks && estimated in ranks && !prediction[symptom].outOfForecast
              ? Math.abs(ranks[actual] - ranks[estimated]) : null });
        });
      });
    });
    return { schemaVersion:2, priority:SYMPTOMS, rows,
      metrics:Object.fromEntries(SYMPTOMS.map(symptom => {
        const known = rows.filter(row => row.symptom === symptom && row.loss !== null);
        const independent = independentGroups(known);
        const mean = independent.length ? independent.reduce((sum, group) => sum + group.reduce((n,row) => n + row.loss, 0) / group.length, 0) / independent.length : null;
        return [symptom, { count:known.length, independentCrops:independent.length, mae:mean,
          status:independent.length >= 16 ? "reference-evaluation" : "insufficient-data" }];
      })) };
  }
  return { fit, predict, backtest, exportModel, hydrateModel };
});
