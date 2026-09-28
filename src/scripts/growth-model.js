/* Harvestnavi growth model. Pure, deterministic and independent of browser storage.
 * Dates are Japanese calendar dates. Historical observations on asOf itself are
 * unavailable until the following day. This is a deliberately conservative cut.
 * Harvest size is an ordinal observation, not a measured harvest-ready date.
 */
(function(root, factory){
  const api = Object.freeze({ ...factory(), getBacktestWorkerSource:() =>
    `"use strict"; const engine = (${factory.toString()})(); self.onmessage = event => { const message = event.data || {}; try { self.postMessage({ id:message.id, result:engine.backtest(message.samples, message.options) }); } catch(error) { self.postMessage({ id:message.id, error:String(error && error.message || error) }); } };` });
  if(typeof module === "object" && module.exports) module.exports = api;
  if(root) root.HarvestGrowthModel = api;
})(typeof globalThis === "object" ? globalThis : this, function(){
  "use strict";
  const VERSION = 2;
  const DAY = 86400000;
  const LIMIT = 180;
  const SIZE = { small:0, normal:1, large:2 };
  const PARAMETERS = [
    { id:"weather", temperaturePower:1, lightPower:1 },
    { id:"temperature-soft", temperaturePower:0.7, lightPower:1 },
    { id:"light-soft", temperaturePower:1, lightPower:0.5 },
    { id:"both-soft", temperaturePower:0.7, lightPower:0.5 },
    { id:"weather-recent", temperaturePower:1, lightPower:1, periodWeight:"recent180" },
    { id:"weather-decay", temperaturePower:1, lightPower:1, periodWeight:"decay180" }
  ];
  const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
  const numeric = value => !["number", "string"].includes(typeof value) || String(value).trim() === ""
    ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
  function dateKey(value){
    const raw = String(value || "");
    const timestampDate = value instanceof Date || raw.length > 10 ? new Date(value).getTime() : null;
    const text = timestampDate !== null && Number.isFinite(timestampDate)
      ? new Date(timestampDate + 9 * 3600000).toISOString().slice(0, 10) : raw;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    const time = Date.parse(text + "T00:00:00Z");
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === text ? text : null;
  }
  const timeOf = date => Date.parse(date + "T00:00:00Z");
  const addDays = (date, days) => new Date(timeOf(date) + days * DAY).toISOString().slice(0, 10);
  const daysBetween = (start, end) => Math.round((timeOf(end) - timeOf(start)) / DAY);
  const median = values => quantile(values, 0.5);
  function quantile(values, q){
    const sorted = values.filter(x => numeric(x) !== null).map(Number).sort((a, b) => a - b);
    if(!sorted.length) return null;
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
  }
  function legacyMedian(values){
    const sorted = values.filter(x => numeric(x) !== null).map(Number).sort((a, b) => a - b);
    const n = sorted.length;
    return n ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2 : null;
  }
  function weightedQuantile(rows, getter, q = 0.5){
    const sorted = rows.map(row => ({ value:getter(row), weight:row.weight ?? 1 }))
      .filter(row => numeric(row.value) !== null && row.weight > 0).sort((a, b) => a.value - b.value);
    const weight = sorted.reduce((sum, row) => sum + row.weight, 0);
    let current = 0;
    for(const row of sorted){ current += row.weight; if(current >= weight * q) return row.value; }
    return null;
  }
  const uniqueCount = (rows, key = null) => key ? new Set(rows.map(row => row[key])).size
    : Math.min(new Set(rows.map(row => row.groupId)).size, new Set(rows.map(row => row.cropId || row.groupId)).size);
  function cutoffInstant(asOf){
    const text = String(asOf || "");
    return Date.parse(text.length > 10 ? text : text + "T00:00:00+09:00");
  }
  function timestamp(value){
    if(numeric(value) !== null && /^\d+$/.test(String(value))) return Number(value);
    const valueTime = Date.parse(String(value || ""));
    return Number.isFinite(valueTime) ? valueTime : null;
  }
  function evaluationAvailableBefore(row, asOf, instant = cutoffInstant(asOf)){
    const availableAt = timestamp(row.availableAt);
    return row.outcomeDate < dateKey(asOf) && (availableAt === null || availableAt < instant);
  }
  function adjustment(value){
    return {
      temperatureOffsetC:clamp(numeric(value?.temperatureOffsetC) ?? 0, -5, 5),
      lightMultiplier:clamp(numeric(value?.lightMultiplier) ?? 1, 0.5, 1.5)
    };
  }
  function datedAdjustment(value, regimes, date, instant){
    const applicable = (Array.isArray(regimes) ? regimes : []).filter(regime =>
      dateKey(regime.startDate) && dateKey(regime.startDate) <= date
      && (!dateKey(regime.endDate) || dateKey(regime.endDate) >= date)
      && (timestamp(regime.availableAt) === null || timestamp(regime.availableAt) < instant))
      .sort((a, b) => (numeric(a.scopePriority) || 0) - (numeric(b.scopePriority) || 0) || String(a.startDate).localeCompare(String(b.startDate))
        || (timestamp(a.availableAt) || 0) - (timestamp(b.availableAt) || 0));
    return adjustment(applicable.reduce((result, regime) => ({ ...result, ...regime }), value || {}));
  }
  function excludedAt(sample, instant){
    const excluded = sample.excludedFromTraining === true || sample.specialCondition === true
      || sample.specialCondition?.excludeFromTraining === true;
    const knownAt = timestamp(sample.exclusionAvailableAt);
    return excluded && (knownAt === null || knownAt < instant);
  }
  function trainingWeightAt(sample, instant){
    return (Array.isArray(sample.trainingPolicies) ? sample.trainingPolicies : []).reduce((weight, policy) => {
      const knownAt = timestamp(policy.availableAt);
      if(knownAt === null || knownAt >= instant || policy.startDate > sample.date || policy.endDate && policy.endDate < sample.plantingDate) return weight;
      if(policy.dataPolicy === "exclude") return 0;
      if(policy.dataPolicy === "downweight") return Math.min(weight, clamp(numeric(policy.weightFactor) ?? 0.5, 0, 1));
      return weight;
    }, 1);
  }
  function reweightSamples(rows){
    const counts = new Map(), cropCounts = new Map();
    rows.forEach(row => {
      const family = row.signalKind?.startsWith("partial-") ? row.signalKind : "harvest";
      counts.set(`${row.groupId}:${family}`, (counts.get(`${row.groupId}:${family}`) || 0) + 1);
      cropCounts.set(`${row.cropId}:${family}`, (cropCounts.get(`${row.cropId}:${family}`) || 0) + 1);
    });
    return rows.map(row => {
      const family = row.signalKind?.startsWith("partial-") ? row.signalKind : "harvest";
      return { ...row, weight:row.qualityWeight / Math.max(counts.get(`${row.groupId}:${family}`), cropCounts.get(`${row.cropId}:${family}`)) };
    });
  }
  function normalizeSamples(input, asOf){
    const end = dateKey(asOf);
    const instant = cutoffInstant(asOf);
    const excluded = {};
    const seen = new Set();
    const rows = [];
    const reject = reason => { excluded[reason] = (excluded[reason] || 0) + 1; };
    (Array.isArray(input) ? input : []).forEach((sample, index) => {
      const plantingDate = dateKey(sample?.plantingDate);
      const date = dateKey(sample?.date);
      if(!plantingDate || !date){ reject("invalidDate"); return; }
      const age = daysBetween(plantingDate, date);
      if(age < 5 || age > LIMIT){ reject("implausibleAge"); return; }
      const availableAt = timestamp(sample.availableAt || sample.recordedAt);
      const plantingAvailableAt = timestamp(sample.plantingAvailableAt);
      if(!end || date >= end || availableAt !== null && availableAt >= instant){ reject("notYetAvailable"); return; }
      if(plantingAvailableAt !== null && plantingAvailableAt >= instant){ reject("plantingNotYetAvailable"); return; }
      if(sample.estimatedPlanting === true || sample.plantingDateEstimated === true){ reject("estimatedPlanting"); return; }
      const partial = sample.partialHarvest === true || sample.type === "partialHarvest" || String(sample.signalKind).startsWith("partial-");
      const signalKind = partial ? sample.signalKind === "partial-position" ? "partial-position" : "partial-bed" : sample.signalKind || "harvest";
      const positionKnown = signalKind === "partial-position" || sample.positionKnown === true;
      const palletKeys = signalKind === "partial-bed" ? [] : [...new Set((sample.palletKeys || []).filter(key => /^\d+-[A-F]-\d+$/.test(key)))];
      if(signalKind === "partial-position" && !palletKeys.length){ reject("partialPositionMissing"); return; }
      const id = String(sample.id || `${sample.building}-${sample.bed}-${plantingDate}-${date}-${index}`);
      if(seen.has(id)){ reject("duplicate"); return; }
      seen.add(id);
      let readyDate = dateKey(sample.readyDate);
      if(readyDate && (readyDate < plantingDate || readyDate > date)) readyDate = null;
      const sizeRating = partial ? "large" : Object.prototype.hasOwnProperty.call(SIZE, sample.sizeRating) ? sample.sizeRating : "unknown";
      rows.push({
        ...sample, id, date, plantingDate, readyDate, sizeRating, signalKind, positionKnown, palletKeys,
        building:Number(sample.building), bed:String(sample.bed || ""),
        bedKey:`${sample.building}-${sample.bed || ""}`,
        groupId:String(sample.groupId || sample.cropId || `${plantingDate}:${date}`),
        cropId:String(sample.cropId || sample.groupId || `${sample.building}:${sample.bed}:${plantingDate}`),
        ageDays:age,
        qualityWeight:clamp(numeric(sample.qualityWeight) ?? 1, 0, 1) * (signalKind === "partial-bed" ? 0.25 : 1),
        manualAdjustment:adjustment(sample.manualAdjustment),
        availableAt, plantingAvailableAt
      });
    });
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    return { samples:reweightSamples(rows), excluded };
  }
  function normalizeWeather(day){
    const date = dateKey(day?.date);
    if(!date) return null;
    let meanTemp = numeric(day.meanTemp);
    const minTemp = numeric(day.minTemp), maxTemp = numeric(day.maxTemp);
    if(meanTemp === null && minTemp !== null && maxTemp !== null) meanTemp = (minTemp + maxTemp) / 2;
    if(meanTemp !== null && (meanTemp < -40 || meanTemp > 55)) meanTemp = null;
    const sunshineHours = numeric(day.sunshineHours);
    // Sunshine duration is only a proxy for usable light, never a PAR/DLI measurement.
    let lightIndex = sunshineHours !== null && sunshineHours >= 0 && sunshineHours <= 24
      ? clamp(sunshineHours / 8, 0.3, 1.2) : numeric(day.lightIndex);
    if(lightIndex !== null && (lightIndex < 0 || lightIndex > 2)) lightIndex = null;
    return { ...day, date, meanTemp, minTemp, maxTemp, lightIndex, sunshineHours,
      lightSource:sunshineHours !== null ? "sunshine" : "weather-code" };
  }
  function prepareWeather(weatherDaily, options = {}){
    const asOf = dateKey(options.asOf);
    if(!asOf) throw new Error("Growth model requires an explicit valid asOf date");
    const instant = cutoffInstant(options.asOf);
    const observations = new Map(), forecasts = new Map(), received = new Map();
    const ingest = (raw, inheritedIssue) => {
      const day = normalizeWeather(raw);
      if(!day) return;
      received.set(day.date, inheritedIssue && day.source === "forecast"
        ? { ...day, forecastIssuedAt:day.forecastIssuedAt || inheritedIssue } : day);
      if(day.source === "observation"){
        // Retrieval time is not the original publication time. Re-downloading a
        // historic observation must not erase it from every historical fold.
        // Explicit publication/availability timestamps still constrain the fold.
        const availableAt = timestamp(day.availableAt || day.observedAt);
        if(day.date < asOf && (availableAt === null || availableAt <= instant)) observations.set(day.date, day);
        return;
      }
      if(day.source !== "forecast" || day.date < asOf) return;
      const availableAt = timestamp(day.availableAt || day.capturedAt || day.retrievedAt);
      const issuedAt = timestamp(day.issuedAt || day.forecastIssuedAt || inheritedIssue);
      if(issuedAt === null || issuedAt > instant || availableAt !== null && availableAt > instant) return;
      const previous = forecasts.get(day.date);
      if(!previous || issuedAt > previous.issuedAt) forecasts.set(day.date, { ...day, issuedAt });
    };
    (Array.isArray(weatherDaily) ? weatherDaily : []).forEach(day => ingest(day));
    (Array.isArray(options.forecastHistory) ? options.forecastHistory : []).forEach(snapshot => {
      if(snapshot.date){
        if(timestamp(snapshot.availableAt || snapshot.capturedAt || snapshot.retrievedAt)!==null) ingest({ ...snapshot, source:"forecast" });
        return;
      }
      (snapshot.daily || snapshot.forecastDaily || []).forEach(day => {
        const availableAt=day.availableAt || snapshot.availableAt || snapshot.capturedAt || snapshot.retrievedAt;
        if(timestamp(availableAt)!==null) ingest({...day,source:"forecast",availableAt},snapshot.issuedAt);
      });
    });
    const seasonal = [...observations.values()].filter(day => day.meanTemp !== null && day.lightIndex !== null);
    const climateCache = new Map(), dayCache = new Map(), unitCache = new Map();
    const dayOfYear = date => daysBetween(date.slice(0, 4) + "-01-01", date);
    function climate(date){
      const key = date.slice(5);
      if(climateCache.has(key)) return climateCache.get(key);
      const targetDay = dayOfYear(date);
      const nearby = seasonal.filter(day => {
        const diff = Math.abs(dayOfYear(day.date) - targetDay);
        return Math.min(diff, 366 - diff) <= 15;
      });
      const result = {
        meanTemp:median(nearby.map(day => day.meanTemp)) ?? 19,
        lightIndex:median(nearby.map(day => day.lightIndex)) ?? 0.85,
        source:nearby.length ? "climate" : "default",
        climateCount:nearby.length,
        estimated:true
      };
      climateCache.set(key, result);
      return result;
    }
    function getDay(date){
      if(dayCache.has(date)) return dayCache.get(date);
      const direct = observations.get(date) || forecasts.get(date);
      // A future day is usable only when that day's issued JMA forecast supplies
      // the inputs. Never extend the forecast with climate or generic normals.
      if(date >= asOf){
        const future = direct?.source === "forecast" && direct.meanTemp !== null && direct.lightIndex !== null
          && !direct.estimatedTemperature && !direct.estimatedLight ? { ...direct, estimated:false } : null;
        dayCache.set(date, future);
        return future;
      }
      const fallback = climate(date);
      const validDirect = direct && direct.meanTemp !== null && direct.lightIndex !== null;
      const day = validDirect ? { ...direct, estimated:!!direct.estimatedTemperature || !!direct.estimatedLight }
        : { ...fallback, ...direct, meanTemp:direct?.meanTemp ?? fallback.meanTemp,
          lightIndex:direct?.lightIndex ?? fallback.lightIndex, source:direct?.source || fallback.source, estimated:true };
      day.date = date;
      dayCache.set(date, day);
      return day;
    }
    const forecastEndDate = [...forecasts.keys()].sort().pop() || null;
    const gapCache = new Map(), gapRangeCache = new Map();
    function getGap(date){
      if(gapCache.has(date)) return gapCache.get(date);
      const future = date >= asOf;
      const direct = future ? forecasts.get(date) : observations.get(date);
      const raw = direct || received.get(date);
      let code = "", fields = [];
      if(!direct){
        if(raw?.source === (future ? "forecast" : "observation")){
          const issuedAt = timestamp(raw.issuedAt || raw.forecastIssuedAt);
          code = future && issuedAt === null ? "missingIssueTime" : "notAvailableAtCutoff";
        }else code = future ? (!forecastEndDate || date > forecastEndDate ? "outsideForecast" : "noForecast") : "noObservation";
      }else{
        if(direct.meanTemp === null || direct.estimatedTemperature) fields.push("temperature");
        if(direct.lightIndex === null || direct.estimatedLight) fields.push("light");
        if(fields.length) code = "missingFields";
      }
      const gap = code ? { date, kind:future ? "forecast" : "observation", code, fields,
        unavailable:future, estimated:!future, source:raw?.source || null } : null;
      gapCache.set(date, gap);
      return gap;
    }
    function getGaps(start, end){
      if(!dateKey(start) || !dateKey(end) || start > end || daysBetween(start, end) > 730) return [];
      const key = `${start}|${end}`;
      if(gapRangeCache.has(key)) return gapRangeCache.get(key);
      const gaps = [];
      for(let date = start; date <= end; date = addDays(date, 1)){
        const gap = getGap(date);
        if(gap) gaps.push(gap);
      }
      gapRangeCache.set(key, gaps);
      return gaps;
    }
    return { asOf, asOfInstant:instant, forecastEndDate, observations, forecasts, climate, getDay, getGap, getGaps, unitCache,
      provenance:{ historicalForecasts:forecasts.size, observationDays:observations.size } };
  }
  function dailyUnit(day, manual, parameter = PARAMETERS[0]){
    if(!day) return null;
    if(parameter.id === "calendar") return 1;
    const temperature = day.meanTemp + manual.temperatureOffsetC;
    let thermal = 0;
    if(temperature > 5 && temperature < 32){
      thermal = temperature < 18 ? (temperature - 5) / 13 : temperature <= 24 ? 1 : (32 - temperature) / 8;
    }
    return Math.pow(Math.max(0, thermal), parameter.temperaturePower)
      * Math.pow(clamp(day.lightIndex * manual.lightMultiplier, 0.3, 1.2), parameter.lightPower);
  }
  function accumulate(context, start, end, manualValue, parameter = PARAMETERS[0], regimes = []){
    if(!start || !end || start > end || daysBetween(start, end) > 730) return null;
    const manual = adjustment(manualValue);
    const cacheKey = `${start}|${end}|${manual.temperatureOffsetC}|${manual.lightMultiplier}|${parameter.id}|${regimes.length ? JSON.stringify(regimes) : ""}`;
    if(context.unitCache.has(cacheKey)) return context.unitCache.get(cacheKey);
    const counts = { observed:0, forecast:0, estimated:0, missing:0, total:0, default:0, unavailable:0 };
    let total = 0, informationWeight = 0, forecastWeight = 0, maxForecastAgeDays = null;
    for(let date = start; date <= end; date = addDays(date, 1)){
      const day = context.getDay(date);
      counts.total++;
      if(!day){ counts.unavailable++; counts.missing++; continue; }
      total += dailyUnit(day, regimes.length ? datedAdjustment(manual, regimes, date, context.asOfInstant) : manual, parameter);
      const issuedAt = timestamp(day.issuedAt || day.forecastIssuedAt);
      const forecastAge = day.source === "forecast" && issuedAt !== null
        ? Math.max(0, (context.asOfInstant - issuedAt) / DAY) : null;
      if(forecastAge !== null) maxForecastAgeDays = Math.max(maxForecastAgeDays || 0, forecastAge);
      if(day.estimated || !["forecast", "observation"].includes(day.source)){
        counts.estimated++;
        informationWeight += day.source === "default" ? 0.1 : 0.3;
        if(day.source === "default") counts.default++;
        if(day.source === "observation" || date < context.asOf) counts.missing++;
      }else if(day.source === "observation"){
        counts.observed++; informationWeight++;
      }else{
        counts.forecast++;
        const reliability = { A:1, B:0.9, C:0.75 }[day.reliability] || 0.85;
        const weight = clamp(0.8 - 0.045 * Math.max(0, daysBetween(context.asOf, date)), 0.35, 0.8)
          * Math.exp(-(forecastAge || 0) / 3) * reliability;
        informationWeight += weight; forecastWeight += weight;
      }
    }
    const result = { total, complete:counts.unavailable === 0, dayCounts:counts, coverage:counts.observed / counts.total,
      weatherReliability:informationWeight / counts.total,
      forecastAgeDays:maxForecastAgeDays, meanForecastInformationWeight:counts.forecast ? forecastWeight / counts.forecast : null };
    context.unitCache.set(cacheKey, result);
    return result;
  }
  function ordinalLoss(row, target){
    const ratio = Math.log(Math.max(0.001, row.units) / target);
    let loss = row.readyUnits > 0 ? Math.abs(Math.log(row.readyUnits / (target * 0.88))) : 0;
    if(row.sizeRating === "normal") loss += Math.max(0, Math.log(0.88) - ratio, ratio - Math.log(1.12));
    if(row.sizeRating === "small") loss += Math.max(0, ratio - Math.log(0.88) + 0.005);
    if(row.sizeRating === "large") loss += Math.max(0, Math.log(1.12) - ratio + 0.005);
    return loss;
  }
  function robustTarget(rows, prior, priorWeight){
    if(!rows.length) return prior;
    const candidates = [prior];
    rows.forEach(row => {
      if(row.units <= 0) return;
      if(row.readyUnits > 0) candidates.push(row.readyUnits / 0.88);
      if(row.sizeRating === "normal") candidates.push(row.units / 0.88, row.units / 1.12);
      candidates.push(row.units / (0.88 * Math.exp(-0.006)), row.units / (1.12 * Math.exp(0.006)));
    });
    let best = prior, bestLoss = Infinity;
    candidates.forEach(target => {
      if(target <= 0 || !Number.isFinite(target)) return;
      const loss = rows.reduce((sum, row) => sum + row.weight * ordinalLoss(row, target), 0)
        + priorWeight * Math.abs(Math.log(target / prior));
      if(loss < bestLoss - 1e-12){ bestLoss = loss; best = target; }
    });
    return best;
  }
  function learnWindow(rows, target, enabled){
    const initial = { lower:0.88, upper:1.12, learned:false, reference:true };
    const normal = rows.filter(row => row.sizeRating === "normal");
    const small = rows.filter(row => row.sizeRating === "small");
    const large = rows.filter(row => row.sizeRating === "large");
    const starts = rows.filter(row => row.readyUnits > 0);
    if(!enabled || uniqueCount(rows) < 16 || uniqueCount(normal) < 4 || uniqueCount(large) < 3
      || uniqueCount(small) < 3 && uniqueCount(starts) < 4) return initial;
    const ratios = rows.map(row => row.units / target).filter(value => value > 0);
    const cuts = [0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9].map(q => quantile(ratios, q));
    // Small and large are strict constraints. Candidate boundaries must sit
    // beyond those observations rather than reclassifying their exact value as normal.
    const lowerGrid = [...new Set([0.88, ...cuts.map(value => value * Math.exp(0.006)),
      ...[0.25,0.5,0.75].map(q => quantile(starts.map(row => row.readyUnits / target), q))].filter(value => value > 0))];
    const upperGrid = [...new Set([1.12, ...cuts.map(value => value * Math.exp(-0.006))].filter(value => value > 0))];
    let best = initial, bestLoss = Infinity;
    lowerGrid.forEach(lower => upperGrid.forEach(upper => {
      if(lower < 0.4 || upper > 2 || upper <= lower * 1.02) return;
      let loss = 2 * (Math.abs(Math.log(lower / 0.88)) + Math.abs(Math.log(upper / 1.12)));
      rows.forEach(row => {
        const ratio = row.units / target;
        let error = row.readyUnits > 0 ? Math.abs(Math.log(row.readyUnits / (target * lower))) : 0;
        if(row.sizeRating === "small") error += Math.max(0, Math.log(ratio / lower) + 0.005);
        if(row.sizeRating === "normal") error += Math.max(0, Math.log(lower / ratio), Math.log(ratio / upper));
        if(row.sizeRating === "large") error += Math.max(0, Math.log(upper / ratio) + 0.005);
        loss += row.weight * error;
      });
      if(loss < bestLoss){ bestLoss = loss; best = { lower, upper, learned:true, reference:false }; }
    }));
    return best;
  }
  function buildCandidate(samples, context, method, parameter = PARAMETERS[0]){
    const rows = [];
    const weakEvidence = samples.filter(sample => sample.signalKind === "partial-bed").map(sample => ({
      bedKey:sample.bedKey, date:sample.date, groupId:sample.groupId, cropId:sample.cropId, signalKind:"partial-bed", positionKnown:false
    }));
    samples.forEach(sample => {
      const policyWeight = trainingWeightAt(sample, context.asOfInstant);
      if(excludedAt(sample, context.asOfInstant) || sample.weight <= 0 || policyWeight <= 0 || sample.signalKind === "partial-bed" || method === "legacy" && sample.signalKind?.startsWith("partial-")) return;
      const age = daysBetween(sample.date, context.asOf);
      if(parameter.periodWeight === "recent180" && age > 180) return;
      const end = sample.date;
      const values = accumulate(context, sample.plantingDate, end, sample.manualAdjustment, parameter, sample.environmentRegimes);
      if(!values || !values.total) return;
      if(method === "legacy" && values.coverage < 1 || method !== "legacy" && parameter.id !== "calendar" && values.coverage < 0.8) return;
      const hasLabel = sample.readyDate || sample.sizeRating !== "unknown";
      if(method !== "legacy" && !hasLabel) return;
      const readyValues = sample.readyDate ? accumulate(context, sample.plantingDate, sample.readyDate, sample.manualAdjustment, parameter, sample.environmentRegimes) : null;
      rows.push({ ...sample, units:values.total, readyUnits:readyValues?.complete ? readyValues.total : null,
        weight:sample.weight * policyWeight * (parameter.id === "calendar" ? 1 : values.coverage)
          * (parameter.periodWeight === "decay180" ? Math.exp(-age * Math.LN2 / 180) : 1) });
    });
    const prior = parameter.id === "calendar" ? 36 : 36 * 0.85;
    const labelled = rows.filter(row => row.sizeRating !== "unknown" || row.readyDate);
    const normal = labelled.filter(row => row.readyUnits > 0);
    const anchor = weightedQuantile(normal, row => row.readyUnits / 0.88) ?? prior;
    const farmTarget = robustTarget(labelled, anchor, 3);
    const byBuilding = new Map(), byBed = new Map();
    const buildings = [...new Set(rows.map(row => row.building))];
    buildings.forEach(building => {
      const local = labelled.filter(row => row.building === building);
      const count = uniqueCount(local);
      // Partial pooling: estimate on local data, then shrink the log effect.
      const localRaw = robustTarget(local, farmTarget, 0.5);
      const canLearnBuilding = method === "adaptive" && count >= 4;
      const localTarget = canLearnBuilding
        ? farmTarget * Math.exp(clamp(Math.log(localRaw / farmTarget), -0.35, 0.35) * count / (count + 8)) : farmTarget;
      byBuilding.set(building, { target:localTarget, count, learned:canLearnBuilding });
      [...new Set(local.map(row => row.bed))].forEach(bed => {
        const bedRows = local.filter(row => row.bed === bed);
        const bedCount = uniqueCount(bedRows);
        const usable = method === "adaptive" && bedCount >= 8 && uniqueCount(bedRows, "date") >= 3;
        const bedRaw = robustTarget(bedRows, localTarget, 0.5);
        byBed.set(`${building}-${bed}`, { count:bedCount, learned:usable,
          target:usable ? localTarget * Math.exp(clamp(Math.log(bedRaw / localTarget), -0.25, 0.25) * bedCount / (bedCount + 16)) : localTarget });
      });
    });
    const bySeason = new Map();
    if(method === "adaptive" && uniqueCount(normal) >= 24 && new Set(normal.map(row => row.date.slice(5, 7))).size >= 6){
      for(let month = 1; month <= 12; month++){
        const peers = normal.filter(row => {
          const difference = Math.abs(Number(row.date.slice(5, 7)) - month);
          return Math.min(difference, 12 - difference) <= 1;
        });
        const count = uniqueCount(peers);
        const residual = weightedQuantile(peers, row => Math.log((row.readyUnits / 0.88) / (byBuilding.get(row.building)?.target || farmTarget)));
        bySeason.set(month, { count, factor:count >= 8 && residual !== null ? Math.exp(clamp(residual, -0.2, 0.2) * count / (count + 20)) : 1 });
      }
    }
    const byPosition = new Map();
    if(method === "adaptive"){
      const positions = new Map();
      labelled.filter(row => row.positionKnown).forEach(row => row.palletKeys.forEach(key => {
        const peers = positions.get(key) || []; peers.push(row); positions.set(key, peers);
      }));
      positions.forEach((peers, key) => {
        const count = uniqueCount(peers), bedKey = key.split("-").slice(0, 2).join("-");
        const base = byBed.get(bedKey)?.target || farmTarget;
        const raw = robustTarget(peers, base, 0.5);
        byPosition.set(key, { count, learned:count >= 8,
          target:count >= 8 ? base * Math.exp(clamp(Math.log(raw / base), -0.25, 0.25) * count / (count + 16)) : base });
      });
    }
    return { method, parameter, rows, farmTarget, byBuilding, byBed, bySeason, byPosition, weakEvidence, prior,
      window:learnWindow(labelled, farmTarget, method === "adaptive"),
      independentCrops:uniqueCount(labelled), anchorCount:uniqueCount(normal), labelledCount:labelled.length };
  }
  function targetFor(candidate, building, bed, date, positionKey = null){
    if(candidate.method === "legacy"){
      if(candidate.legacyTargets) return candidate.legacyTargets[String(building)] ?? candidate.legacyGlobalTarget;
      const usable = candidate.rows.filter(row => row.units > 0);
      const local = usable.filter(row => row.building === Number(building));
      const localLabels = local.filter(row => row.sizeRating !== "unknown");
      const allLabels = usable.filter(row => row.sizeRating !== "unknown");
      const labels = localLabels.length >= 3 ? localLabels : allLabels;
      const subset = labels.length ? labels : local.length >= 3 ? local : usable;
      return legacyMedian(subset.map(row => row.units * (row.sizeRating === "small" ? 1.1 : row.sizeRating === "large" ? 0.9 : 1))) ?? candidate.prior;
    }
    const localTarget = candidate.byPosition?.get(positionKey)?.target || candidate.byBed.get(`${building}-${bed}`)?.target
      || candidate.byBuilding.get(Number(building))?.target || candidate.farmTarget;
    return localTarget * (candidate.bySeason.get(Number(String(date || "").slice(5, 7)))?.factor || 1);
  }
  function predictCandidate(candidate, context, input, residuals = []){
    const plantingDate = dateKey(input.plantingDate), targetDate = dateKey(input.targetDate);
    if(!plantingDate || !targetDate || plantingDate > targetDate || daysBetween(plantingDate, targetDate) > LIMIT){
      return { status:"unknown", ratio:null, progress:null, readyDate:null, interval:null, dayCounts:null,
        basis:{ reason:"invalidOrMissingPlantingDate" } };
    }
    const positionKey = input.positionKey || (input.palletKeys?.length === 1 ? input.palletKeys[0] : null);
    const target = targetFor(candidate, input.building, input.bed, targetDate, positionKey);
    const window = candidate.window || { lower:0.88, upper:1.12, learned:false, reference:true };
    const projected = accumulate(context, plantingDate, targetDate, input.manualAdjustment, candidate.parameter, input.environmentRegimes);
    const latestCurrent = context.getDay(context.asOf) ? context.asOf : addDays(context.asOf, -1);
    const currentEnd = latestCurrent < targetDate ? latestCurrent : targetDate;
    const current = currentEnd >= plantingDate ? accumulate(context, plantingDate, currentEnd, input.manualAdjustment, candidate.parameter, input.environmentRegimes) : null;
    const ratio = target > 0 && projected?.complete ? projected.total / target : null;
    const status = ratio === null ? "unknown" : ratio < window.lower ? "small" : ratio > window.upper ? "large" : "normal";
    let readyDate = null, readyEnd = null;
    if(target > 0){
      let units = 0;
      const lastDate = context.forecastEndDate || addDays(context.asOf, -1);
      for(let date = plantingDate, i = 0; i <= LIMIT && date <= lastDate; i++, date = addDays(date, 1)){
        const day = context.getDay(date);
        if(!day) break;
        units += dailyUnit(day, datedAdjustment(input.manualAdjustment, input.environmentRegimes, date, context.asOfInstant), candidate.parameter);
        if(!readyDate && units >= target * window.lower) readyDate = date;
        if(units > target * window.upper){ readyEnd = readyDate === date ? date : addDays(date, -1); break; }
      }
    }
    const calibration = residuals.filter(row => row.readyError !== null && Number.isFinite(row.readyError));
    const width = uniqueCount(calibration) >= 8 ? quantile(calibration.map(row => Math.abs(row.readyError)), 0.9) : null;
    const interval = readyDate && width !== null ? {
      start:[plantingDate, addDays(readyDate, -Math.ceil(width))].sort().pop(),
      end:[context.forecastEndDate || addDays(context.asOf, -1), addDays(readyDate, Math.ceil(width))].sort()[0],
      kind:"actual-ready-error", nominalCoverage:addDays(readyDate, Math.ceil(width)) > (context.forecastEndDate || addDays(context.asOf, -1)) ? null : 0.9,
      calibrationNominalCoverage:0.9, calibrationCount:uniqueCount(calibration),
      truncated:addDays(readyDate, Math.ceil(width)) > (context.forecastEndDate || addDays(context.asOf, -1))
    } : null;
    return { status, ratio, progress:target > 0 && current ? current.total / target : null,
      readyDate, readyStart:readyDate, readyEnd, windowTruncated:!readyEnd,
      readyWindow:{ start:readyDate, end:readyEnd, truncated:!readyEnd, learned:window.learned, reference:window.reference },
      positionKey, positionFallback:!!positionKey && !candidate.byPosition?.get(positionKey)?.learned,
      outOfForecast:targetDate >= context.asOf && (!context.forecastEndDate || targetDate > context.forecastEndDate),
      forecastEndDate:context.forecastEndDate, predictionAvailable:ratio !== null,
      interval, dayCounts:projected?.dayCounts || null,
      weatherReliability:projected?.weatherReliability ?? null, forecastAgeDays:projected?.forecastAgeDays ?? null,
      basis:{ currentGrowthUnits:current?.total ?? null, currentThrough:currentEnd,
        projectedGrowthUnits:projected?.complete ? projected.total : null,
        targetGrowthUnits:target, startGrowthUnits:target * window.lower, endGrowthUnits:target * window.upper,
        windowLower:window.lower, windowUpper:window.upper, windowLearned:window.learned,
        units:candidate.parameter.id === "calendar" ? "days" : "growth-index",
        weatherUsed:candidate.parameter.id !== "calendar",
        weatherReliability:projected?.weatherReliability ?? null, forecastAgeDays:projected?.forecastAgeDays ?? null,
        meanForecastInformationWeight:projected?.meanForecastInformationWeight ?? null,
        weatherReliabilityKind:"information-weight-not-probability",
        independentCrops:candidate.independentCrops, anchorCount:candidate.anchorCount,
        buildingCrops:candidate.byBuilding.get(Number(input.building))?.count || 0,
        bedCrops:candidate.byBed.get(`${input.building}-${input.bed}`)?.count || 0,
        buildingFactor:(candidate.byBuilding.get(Number(input.building))?.target || candidate.farmTarget) / candidate.farmTarget,
        bedFactor:(candidate.byBed.get(`${input.building}-${input.bed}`)?.target || candidate.farmTarget) / (candidate.byBuilding.get(Number(input.building))?.target || candidate.farmTarget),
        seasonFactor:candidate.bySeason.get(Number(targetDate.slice(5, 7)))?.factor || 1,
        temperaturePower:candidate.parameter.temperaturePower ?? 0, lightPower:candidate.parameter.lightPower ?? 0,
        manualAdjustment:adjustment(input.manualAdjustment) } };
  }
  function scorePrediction(prediction, sample, asOf){
    const weak = sample.signalKind === "partial-bed";
    const known = !weak && sample.sizeRating !== "unknown" && prediction.status !== "unknown";
    const readyError = sample.readyDate && sample.readyDate > asOf && prediction.readyDate ? daysBetween(sample.readyDate, prediction.readyDate) : null;
    let windowConstraintLoss = null;
    if(known){
      windowConstraintLoss = 0;
      if(sample.sizeRating === "small" && prediction.status !== "small") windowConstraintLoss = prediction.readyStart ? Math.max(1, daysBetween(prediction.readyStart, sample.date) + 1) : 1;
      if(sample.sizeRating === "normal" && prediction.status !== "normal") windowConstraintLoss = prediction.status === "small"
        ? prediction.readyStart ? Math.max(1, daysBetween(sample.date, prediction.readyStart)) : 1
        : prediction.readyEnd ? Math.max(1, daysBetween(prediction.readyEnd, sample.date)) : 1;
      if(sample.sizeRating === "large" && prediction.status !== "large") windowConstraintLoss = prediction.readyEnd ? Math.max(1, daysBetween(sample.date, prediction.readyEnd) + 1) : 1;
    }
    return { id:sample.id, groupId:sample.groupId, cropId:sample.cropId, asOf, outcomeDate:sample.date,
      availableAt:sample.availableAt,
      trainingCrops:prediction.basis?.independentCrops ?? 0, building:sample.building, bed:sample.bed,
      season:Math.floor((Number(sample.date.slice(5, 7)) % 12) / 3), signalKind:sample.signalKind || "harvest",
      actual:sample.sizeRating, predicted:prediction.status,
      ordinalError:known ? Math.abs(SIZE[sample.sizeRating] - SIZE[prediction.status]) : null,
      readyError,
      normalHarvestProxyError:null,
      windowConstraintLoss,
      intervalHit:readyError !== null && prediction.interval ? Number(sample.readyDate >= prediction.interval.start && sample.readyDate <= prediction.interval.end) : null,
      dayCounts:prediction.dayCounts, confidence:prediction.confidence?.level || "reference" };
  }
  function metrics(rows){
    const labelled = rows.filter(row => row.ordinalError !== null);
    const dates = rows.filter(row => row.readyError !== null);
    const proxies = rows.filter(row => row.normalHarvestProxyError !== null);
    const intervals = rows.filter(row => row.intervalHit !== null);
    const windows = rows.filter(row => numeric(row.windowConstraintLoss) !== null);
    const average = (items, getter) => {
      if(!items.length) return null;
      const groups = new Map();
      items.forEach(item => { const key = item.groupId || item.label; const values = groups.get(key) || []; values.push(getter(item)); groups.set(key, values); });
      return [...groups.values()].reduce((sum, values) => sum + values.reduce((a, b) => a + b, 0) / values.length, 0) / groups.size;
    };
    const perClass = Object.keys(SIZE).map(label => ({ label, rows:labelled.filter(row => row.actual === label) })).filter(group => group.rows.length);
    return { predictions:rows.length, independentCrops:uniqueCount(rows), folds:uniqueCount(rows, "asOf"),
      labelledCount:labelled.length, ordinalMAE:average(labelled, row => row.ordinalError),
      accuracy:average(labelled, row => Number(row.ordinalError === 0)),
      balancedAccuracy:average(perClass, group => average(group.rows, row => Number(row.ordinalError === 0))),
      readyDateCount:dates.length, readyDateMAE:average(dates, row => Math.abs(row.readyError)),
      windowConstraintCount:windows.length, windowConstraintLoss:average(windows, row => row.windowConstraintLoss),
      windowMetricKind:"ordinal-window-constraint-lower-bound-days",
      normalHarvestProxyCount:proxies.length, normalHarvestProxyMAE:average(proxies, row => Math.abs(row.normalHarvestProxyError)),
      intervalCount:intervals.length, intervalCoverage:average(intervals, row => row.intervalHit),
      evaluationConfidence:uniqueCount(labelled) >= 16 ? "medium" : "low",
      quality:{ elongated:{ status:"not-evaluated" }, uneven:{ status:"not-evaluated" }, tipburn:{ status:"not-evaluated" } },
      cases:{ status:"not-evaluated" },
      byConfidence:Object.fromEntries([...new Set(labelled.map(row => row.confidence))].map(level => {
        const local = labelled.filter(row => row.confidence === level);
        return [level, { count:local.length, independentCrops:uniqueCount(local), accuracy:average(local, row => Number(row.ordinalError === 0)) }];
      })) };
  }
  function confidenceFor(candidate, evidence, output){
    const counts = output.dayCounts || { total:0, estimated:0 };
    let level = "reference", label = "参考値";
    if(output.status === "unknown"){ level = "insufficient"; label = "データ不足"; }
    else if(candidate.anchorCount >= 8 && evidence.independentCrops >= 16 && evidence.labelledCount >= 16
      && evidence.accuracy >= 0.65 && counts.estimated / Math.max(1, counts.total) <= 0.2
      && output.weatherReliability >= 0.8 && (output.forecastAgeDays === null || output.forecastAgeDays <= 2)){
      level = "moderate"; label = "中";
    }
    if(output.positionFallback && level === "moderate"){ level = "reference"; label = "参考値"; }
    return { level, label, grade:level === "moderate" ? "medium" : "low", gradeLabel:level === "moderate" ? "中" : "低",
      validationCount:evidence.labelledCount, historicalAccuracy:evidence.accuracy,
      weatherReliability:output.weatherReliability ?? null, forecastAgeDays:output.forecastAgeDays ?? null };
  }
  function breakdownMetrics(rows){
    const latest = rows.map(row => row.outcomeDate).filter(Boolean).sort().pop();
    const by = key => Object.fromEntries([...new Set(rows.map(row => row[key]).filter(value => value !== undefined))]
      .map(value => [String(value), metrics(rows.filter(row => row[key] === value))]));
    return { all:metrics(rows), recent:metrics(latest ? rows.filter(row => row.outcomeDate >= addDays(latest, -90)) : []),
      seasons:by("season"), buildings:by("building") };
  }
  function compareGate(candidateRows, baselineRows, minimum = 16, options = {}){
    const comparable = baselineRows.filter(row => options.allowPriorBaseline === true || row.trainingCrops === undefined || row.trainingCrops > 0);
    const candidateById = new Map(candidateRows.map(row => [row.id, row]));
    const baseById = new Map(comparable.map(row => [row.id, row]));
    const paired = candidateRows.filter(row => baseById.has(row.id));
    const lostClassifications = comparable.filter(row => row.ordinalError !== null && candidateById.get(row.id)?.ordinalError == null).length;
    const lostReadyDates = comparable.filter(row => row.readyError !== null && candidateById.get(row.id)?.readyError == null).length;
    const lostQualityPredictions = Object.fromEntries(["elongated", "uneven", "tipburn"].map(symptom => [symptom,
      comparable.filter(row => numeric(row.qualityErrors?.[symptom]) !== null && numeric(candidateById.get(row.id)?.qualityErrors?.[symptom]) === null).length]));
    const basic = { accepted:false, independentCrops:uniqueCount(paired), folds:uniqueCount(paired, "asOf"),
      spanDays:paired.length ? daysBetween(paired.map(row => row.asOf).sort()[0], paired.map(row => row.asOf).sort().pop()) : 0,
      improvement:null, requiresApproval:true };
    if(lostClassifications || lostReadyDates || Object.values(lostQualityPredictions).some(count => count > 0)) return {
      ...basic, reason:"reducedPredictionCoverage", lostClassifications, lostReadyDates, lostQualityPredictions };
    const datePairs = paired.filter(row => numeric(row.readyError) !== null && numeric(baseById.get(row.id).readyError) !== null);
    const windowPairs = paired.filter(row => numeric(row.windowConstraintLoss) !== null && numeric(baseById.get(row.id).windowConstraintLoss) !== null);
    const realReadyGain = datePairs.length ? metrics(datePairs.map(row => baseById.get(row.id))).readyDateMAE - metrics(datePairs).readyDateMAE : null;
    // Even a good lower-priority score must never conceal observed timing decay.
    if(realReadyGain !== null && realReadyGain < -1e-9) return { ...basic, reason:"readyDateRegression", readyDateImprovementDays:realReadyGain };
    const useDates = uniqueCount(datePairs) >= minimum;
    const primary = useDates ? datePairs : windowPairs;
    const metric = useDates ? "actualReadyDateMAE" : "windowConstraintLoss";
    const value = row => useDates ? Math.abs(row.readyError) : row.windowConstraintLoss;
    const groupMean = (rows, getter) => {
      const groups = new Map();
      rows.forEach(row => { const key = row.groupId || row.id, list = groups.get(key) || []; list.push(getter(row)); groups.set(key, list); });
      return groups.size ? [...groups.values()].reduce((sum, values) => sum + values.reduce((a,b) => a + b, 0) / values.length, 0) / groups.size : null;
    };
    const mean = rows => groupMean(rows, value);
    const primaryBase = primary.map(row => baseById.get(row.id));
    const score = mean(primary), baseline = mean(primaryBase);
    const enough = uniqueCount(primary) >= minimum && uniqueCount(primary, "asOf") >= 5
      && basic.spanDays >= 42;
    if(!enough) return { ...basic, reason:"insufficientReadinessValidation", metric,
      evaluatedCrops:uniqueCount(primary), missingForecastOrGroundTruth:true };
    const gain = baseline - score;
    if(gain < -1e-9) return { ...basic, reason:"readinessRegression", metric, improvement:gain };
    const candidateMetrics = metrics(primary), baselineMetrics = metrics(primaryBase);
    const sizeGain = candidateMetrics.ordinalMAE !== null && baselineMetrics.ordinalMAE !== null
      ? baselineMetrics.ordinalMAE - candidateMetrics.ordinalMAE : null;
    const primaryWin = gain >= Math.max(useDates ? 0.25 : 0.03, baseline * 0.1);
    const sizeWinAtTie = Math.abs(gain) < 1e-9 && sizeGain >= Math.max(0.03, (baselineMetrics.ordinalMAE || 0) * 0.1)
      && candidateMetrics.balancedAccuracy >= baselineMetrics.balancedAccuracy;
    // Quality ranks before size. Separate risk engines are not silently scored
    // as correct; if quality predictions are supplied, no component may regress.
    let qualityDecision = null;
    for(const symptom of ["elongated", "uneven", "tipburn"]){
      const known = paired.filter(row => numeric(row.qualityErrors?.[symptom]) !== null
        && numeric(baseById.get(row.id).qualityErrors?.[symptom]) !== null);
      const difference = known.length ? groupMean(known, row => row.qualityErrors[symptom] - baseById.get(row.id).qualityErrors[symptom]) : 0;
      if(difference > 1e-9){
        return { ...basic, reason:"qualityRegression", symptom, metric, improvement:gain };
      }
      if(!qualityDecision && uniqueCount(known) >= minimum && -difference >= 0.03) qualityDecision = { symptom, improvement:-difference, rows:known };
    }
    const qualityWinAtTie = Math.abs(gain) < 1e-9 && !!qualityDecision;
    if(!primaryWin && !qualityWinAtTie && !sizeWinAtTie) return { ...basic, reason:"noDemonstratedImprovement", metric, improvement:gain };
    const latest = primary.map(row => row.outcomeDate).sort().pop();
    const slices = [{ key:"recent", rows:primary.filter(row => row.outcomeDate >= addDays(latest, -90)) }];
    ["season", "building"].forEach(key => [...new Set(primary.map(row => row[key]).filter(v => v !== undefined))]
      .forEach(v => slices.push({ key:`${key}:${v}`, rows:primary.filter(row => row[key] === v) })));
    const sliceChecks = slices.map(slice => ({ key:slice.key, crops:uniqueCount(slice.rows),
      status:uniqueCount(slice.rows) < 5 ? "insufficient-data" : "evaluated",
      difference:mean(slice.rows) - mean(slice.rows.map(row => baseById.get(row.id))) }));
    const regressed = sliceChecks.find(slice => slice.status === "evaluated" && slice.difference > 1e-9);
    if(regressed) return { ...basic, reason:"subgroupRegression", subgroup:regressed.key, metric, improvement:gain, sliceChecks };
    const stabilityRows = qualityWinAtTie ? qualityDecision.rows : primary;
    const folds = [...new Set(stabilityRows.map(row => row.asOf))].map(asOf => {
      const local = stabilityRows.filter(row => row.asOf === asOf);
      return groupMean(local, row => primaryWin ? value(baseById.get(row.id)) - value(row)
        : qualityWinAtTie ? baseById.get(row.id).qualityErrors[qualityDecision.symptom] - row.qualityErrors[qualityDecision.symptom]
          : baseById.get(row.id).ordinalError - row.ordinalError);
    });
    if(folds.filter(value => value >= -1e-9).length / folds.length < 0.6 || folds.filter(value => value > 1e-9).length < 2){
      return { ...basic, reason:"unstableImprovement", metric, improvement:gain, sliceChecks };
    }
    return { ...basic, accepted:true, reason:"chronologicalImprovement", metric,
      improvement:primaryWin ? gain / (useDates ? 7 : 1) : qualityWinAtTie ? qualityDecision.improvement : sizeGain,
      decidingPriority:primaryWin ? "readiness" : qualityWinAtTie ? qualityDecision.symptom : "size",
      priorityRank:primaryWin ? 0 : qualityWinAtTie ? ["elongated", "uneven", "tipburn"].indexOf(qualityDecision.symptom) + 1 : 4,
      readyDateImprovementDays:realReadyGain, sliceChecks,
      priority:["readiness", "elongated", "uneven", "tipburn", "size", "cases"],
      qualityValidation:"separate-engine-not-evaluated-here" };
  }
  function pickParameter(history, asOf){
    const available = id => (history[id] || []).filter(row => evaluationAvailableBefore(row, asOf));
    const baseline = available("safe");
    let best = null, bestGain = 0, bestPriority = Infinity;
    PARAMETERS.forEach(parameter => {
      const gate = compareGate(available(parameter.id), baseline);
      if(gate.accepted && (gate.priorityRank < bestPriority || gate.priorityRank === bestPriority && gate.improvement > bestGain)){
        best = parameter; bestGain = gate.improvement; bestPriority = gate.priorityRank;
      }
    });
    return best;
  }
  function selectValidatedMethod(resultRows, baselineMethod = "safe"){
    const gates = {};
    let selectedMethod = baselineMethod, improvement = 0, candidateMethod = null, bestPriority = Infinity;
    // Calendar is the simplest hypothesis; on equal evidence prefer it to a
    // local target or adaptive response. All alternatives must beat safe.
    ["calendar", "legacy", "safe", "adaptive"].filter(method => method !== baselineMethod).forEach(method => {
      const gate = compareGate(resultRows[method] || [], resultRows[baselineMethod] || []);
      gates[method] = gate;
      if(gate.accepted && (gate.priorityRank < bestPriority || gate.priorityRank === bestPriority && gate.improvement > improvement)){
        selectedMethod = method; candidateMethod = method; improvement = gate.improvement; bestPriority = gate.priorityRank;
      }
    });
    return { selectedMethod, candidateMethod, baselineMethod, requiresApproval:true, gates,
      legacyComparison:compareGate(resultRows.safe || [], resultRows.legacy || []),
      reason:!candidateMethod ? "noValidatedReplacement"
        : selectedMethod === "legacy" ? "chronologicalLegacyImprovement" : "chronologicalImprovement" };
  }
  function backtest(input, options = {}){
    const asOf = dateKey(options.asOf);
    if(!asOf) throw new Error("Growth backtest requires an explicit asOf date");
    const normalized = normalizeSamples(input, options.asOf);
    const samples = normalized.samples;
    const leadDays = clamp(Math.floor(numeric(options.leadDays) ?? 3), 1, 28);
    const maxFolds = clamp(Math.floor(numeric(options.maxFolds) ?? 24), 5, 40);
    const dates = [...new Set(samples.map(row => addDays(row.date, -leadDays)))].sort();
    // Bounded, deterministic chronological sampling. Cohorts on one day stay together.
    const selectedDates = dates.length <= maxFolds ? dates : [...new Set(Array.from({ length:maxFolds }, (_, i) => dates[Math.floor(i * (dates.length - 1) / (maxFolds - 1))]))];
    const resultRows = { legacy:[], safe:[], calendar:[], adaptive:[] };
    const parameterRows = { safe:[], ...Object.fromEntries(PARAMETERS.map(parameter => [parameter.id, []])) };
    let plantingUnavailableAtOrigin = 0;
    selectedDates.forEach(cutoff => {
      const instant = cutoffInstant(cutoff);
      const testing = samples.filter(row => {
        if(addDays(row.date, -leadDays) !== cutoff || row.plantingDate > cutoff) return false;
        if(row.plantingAvailableAt !== null && row.plantingAvailableAt >= instant){ plantingUnavailableAtOrigin++; return false; }
        return true;
      });
      if(!testing.length) return;
      const excludedCrops = new Set(testing.map(row => row.cropId));
      const excludedGroups = new Set(testing.map(row => row.groupId));
      // Recompute weights inside the fold: future rows sharing a crop/record must
      // never change the weight of an already available training observation.
      const train = reweightSamples(samples.filter(row => row.date < cutoff && !excludedCrops.has(row.cropId) && !excludedGroups.has(row.groupId)
        && (row.availableAt === null || row.availableAt < instant)
        && (row.plantingAvailableAt === null || row.plantingAvailableAt < instant)));
      const context = prepareWeather(options.weatherDaily, { asOf:cutoff, forecastHistory:options.forecastHistory });
      const candidates = {
        legacy:buildCandidate(train, context, "legacy"),
        safe:buildCandidate(train, context, "safe"),
        calendar:buildCandidate(train, context, "calendar", { id:"calendar" })
      };
      const chosenParameter = pickParameter(parameterRows, cutoff);
      const parameterCandidates = Object.fromEntries(PARAMETERS.map(parameter => [parameter.id,
        buildCandidate(train, context, "adaptive", parameter)]));
      candidates.adaptive = chosenParameter ? parameterCandidates[chosenParameter.id] : candidates.safe;
      // Keep every bed label; metrics average within a harvest group and evidence
      // counts are bounded by BOTH harvest groups and planting cohorts.
      testing.forEach(sample => {
        const predictionInput = { ...sample, targetDate:sample.date };
        Object.entries(candidates).forEach(([name, candidate]) => {
          const prior = resultRows[name].filter(row => evaluationAvailableBefore(row, cutoff));
          const prediction = predictCandidate(candidate, context, predictionInput, prior);
          prediction.confidence = confidenceFor(candidate, metrics(prior), prediction);
          resultRows[name].push(scorePrediction(prediction, sample, cutoff));
        });
        PARAMETERS.forEach(parameter => {
          parameterRows[parameter.id].push(scorePrediction(predictCandidate(parameterCandidates[parameter.id], context, predictionInput), sample, cutoff));
        });
        parameterRows.safe.push(scorePrediction(predictCandidate(candidates.safe, context, predictionInput), sample, cutoff));
      });
    });
    return { schemaVersion:VERSION, asOf, leadDays, methods:Object.fromEntries(Object.entries(resultRows).map(([name, rows]) => [name, metrics(rows)])),
      rows:resultRows, parameterRows, selectedParameter:pickParameter(parameterRows, options.asOf),
      selection:selectValidatedMethod(resultRows, options.baselineMethod || "legacy"),
      breakdown:Object.fromEntries(Object.entries(resultRows).map(([name, rows]) => [name, breakdownMetrics(rows)])),
      excluded:{ ...normalized.excluded, plantingUnavailableAtOrigin },
      limitations:["過去の予報は発表日時付き保存分だけ使用。未保存・予報範囲外の未来日は未予測・未評価。",
        "過去観測は現行保存版による時点再構成です。取得時刻は初回公表時刻とみなさず、当時の観測値の訂正・改訂まで完全再現できません。",
        "当時の入力・修正履歴が残っていない記録は、現在保存されている内容を収穫日で分割。",
        "苗植え記録の入力・修正時刻が残る場合は予測時点までに既知の作だけ検証。時刻のない旧記録は当時の入力状態を完全再現できません。",
        "方式採用の比較は基本方式にも学習実績がある時点から行い、判定不能が増える候補は採用しません。全期間の誤差は別途集計します。",
        "当時の号棟手動補正の履歴がない期間は、渡された補正設定による再計算。",
        "並での収穫は適期区間内という制約です。適期開始日の誤差は実際に確認した適期日だけで評価。",
        "評価日は実際の収穫日の一定日前。過去の作業予定そのものの再現ではありません。"] };
  }
  function fit(input, options = {}){
    if(options.approvedModel) return hydrateModel(options.approvedModel, options);
    const asOf = dateKey(options.asOf);
    if(!asOf) throw new Error("Growth model requires an explicit asOf date");
    const normalized = normalizeSamples(input, options.asOf);
    const weatherContext = prepareWeather(options.weatherDaily, { asOf:options.asOf, forecastHistory:options.forecastHistory });
    const validation = options.validation || backtest(input, options);
    let selectedMethod = ["legacy", "safe", "calendar", "adaptive"].includes(options.selectedMethod) ? options.selectedMethod : "legacy";
    const validatedParameter = validation.parameterRows ? pickParameter(validation.parameterRows, options.asOf)
      : dateKey(validation.asOf) && cutoffInstant(validation.asOf) <= cutoffInstant(options.asOf) ? validation.selectedParameter : null;
    let parameter = selectedMethod === "calendar" ? { id:"calendar" }
      : selectedMethod === "adaptive" ? validatedParameter || PARAMETERS[0] : PARAMETERS[0];
    let candidate = buildCandidate(normalized.samples, weatherContext, selectedMethod, parameter);
    let selectionFallback = null;
    if(!["safe", "legacy"].includes(selectedMethod) && candidate.rows.length === 0){
      selectionFallback = { from:selectedMethod, reason:"currentCandidateUnavailable" };
      selectedMethod = "safe";
      candidate = buildCandidate(normalized.samples, weatherContext, "safe", PARAMETERS[0]);
    }
    return { schemaVersion:VERSION, asOf, trainedAsOf:String(options.asOf), selectedMethod, candidate, weatherContext,
      validation, selectionFallback, excluded:normalized.excluded, samples:normalized.samples,
      stage:candidate.independentCrops < 8 ? "initial" : selectedMethod === "safe" ? "collecting" : "farm-calibrated" };
  }
  function predict(model, input){
    if(input.asOf && cutoffInstant(input.asOf) < model.weatherContext.asOfInstant){
      throw new Error("Refit the growth model before predicting an earlier asOf time");
    }
    const context = input.weatherDaily || dateKey(input.asOf || model.asOf) !== model.asOf
      ? prepareWeather(input.weatherDaily || [...model.weatherContext.observations.values(), ...model.weatherContext.forecasts.values()],
        { asOf:input.asOf || model.asOf, forecastHistory:input.forecastHistory }) : model.weatherContext;
    // A fitted model cannot be rewound to an earlier historical cutoff.
    if(context.asOf < model.asOf) throw new Error("Refit the growth model before predicting an earlier asOf date");
    const rows = (model.validation.rows[model.selectedMethod] || []).filter(row => evaluationAvailableBefore(row, context.asOf, context.asOfInstant));
    const output = predictCandidate(model.candidate, context, input, rows);
    const weatherGaps = context.getGaps(dateKey(input.plantingDate), dateKey(input.targetDate));
    const evidence = metrics(rows);
    const counts = output.dayCounts || { total:0, estimated:0, forecast:0 };
    // No 'high' before field calibration with independent date observations.
    const reasons = [];
    if(output.outOfForecast) reasons.push("気象予報範囲外のため未予測");
    else if(!output.predictionAvailable) reasons.push("予測に必要な気象または生育記録が不足");
    if(output.ratio !== null) reasons.push(`予定日の生育指数は目標の${Math.round(output.ratio * 100)}%`);
    reasons.push(`独立した過去${model.candidate.independentCrops}作を使用`);
    if(model.selectedMethod === "calendar") reasons.push("栽培日数による比較。気象係数は未使用");
    else if(counts.total) reasons.push(`実測${counts.observed}日・予報${counts.forecast}日・推定${counts.estimated}日`);
    if(output.forecastAgeDays > 2) reasons.push(`予報の発表から最大${Math.round(output.forecastAgeDays * 10) / 10}日経過。参考値として表示`);
    if(!model.candidate.anchorCount) reasons.push("実測の適期開始日が不足。サイズの区間制約と初期目安による参考値");
    if(output.positionFallback) reasons.push("この位置の実績が不足しているためベッド・号棟の目安を使用");
    if(model.stage === "collecting") reasons.push("追加の自動補正は精度改善を未確認のため未採用");
    if(model.selectionFallback) reasons.push("検証で選んだ方式を現在のデータでは計算できないため基本方式を使用");
    return { ...output, weatherGaps, schemaVersion:VERSION, method:model.selectedMethod, stage:model.stage,
      confidence:confidenceFor(model.candidate, evidence, output),
      validation:evidence, reasons, mainReasons:reasons.slice(0, 3),
      readyDateKind:model.candidate.anchorCount ? "estimated-reference" : "initial-rule-reference" };
  }
  function summarize(model){
    const candidate = model.candidate;
    return { schemaVersion:VERSION, asOf:model.asOf, method:model.selectedMethod, stage:model.stage,
      selectionFallback:model.selectionFallback,
      parameter:{ ...candidate.parameter }, farmTarget:candidate.farmTarget,
      independentCrops:candidate.independentCrops, anchorCount:candidate.anchorCount,
      buildingTargets:Object.fromEntries(candidate.byBuilding), bedTargets:Object.fromEntries(candidate.byBed),
      seasonalFactors:Object.fromEntries(candidate.bySeason),
      // Legacy local/global sample-switch rules need these derived targets for reproduction.
      legacyBuildingTargets:candidate.method === "legacy" ? candidate.legacyTargets || Object.fromEntries([...new Set(candidate.rows.map(row => row.building))]
        .map(building => [building, targetFor(candidate, building, "")])) : null,
      validation:{ methods:model.validation.methods, selection:model.validation.selection } };
  }
  function comparePredictions(candidateRows, activeRows, options = {}){
    const before = rows => (Array.isArray(rows) ? rows : []).filter(row => !options.asOf || evaluationAvailableBefore(row, options.asOf));
    return compareGate(before(candidateRows), before(activeRows), options.minimum || 16,
      { allowPriorBaseline:options.allowPriorBaseline === true });
  }
  function diagnoseWeather(snapshot, options = {}){
    const originalModel = hydrateModel(snapshot, options);
    const context = originalModel.weatherContext;
    const analysisDay = dateKey(options.analysisAsOf), analysisInstant = cutoffInstant(options.analysisAsOf);
    if(!analysisDay || analysisInstant < context.asOfInstant) throw new Error("診断時点は元の予測時点以降を指定してください");
    const observations = new Map();
    (options.observedDaily || []).forEach(raw => {
      const day = normalizeWeather(raw);
      const availableAt = timestamp(day?.availableAt || day?.observedAt);
      if(day?.source === "observation" && day.date < analysisDay && (availableAt === null || availableAt <= analysisInstant)
        && day.meanTemp !== null && day.lightIndex !== null && !day.estimatedTemperature && !day.estimatedLight) observations.set(day.date, day);
    });
    const substitutedDays = [], missingObservationDays = [];
    const query = options.input || {};
    const original = predictCandidate(originalModel.candidate, context, query);
    const diagnosticContext = { ...context, unitCache:new Map(), getDay:date => {
      const originalDay = context.getDay(date);
      if(!originalDay || date < context.asOf || originalDay.source !== "forecast") return originalDay;
      const observed = observations.get(date);
      if(!observed){ if(!missingObservationDays.includes(date)) missingObservationDays.push(date); return originalDay; }
      if(!substitutedDays.includes(date)) substitutedDays.push(date);
      return { ...observed, estimated:false };
    } };
    const counterfactual = predictCandidate(originalModel.candidate, diagnosticContext, query);
    return { kind:"retrospective-weather-substitution", productionEligible:false,
      asOf:context.asOf, analysisAsOf:analysisDay, forecastEndDate:context.forecastEndDate,
      original, counterfactual, substitutedDays:substitutedDays.sort(), missingObservationDays:missingObservationDays.sort(),
      limitation:"係数・元の予報範囲を固定した事後比較です。実測のない予報日は元の予報を維持し、原因を断定しません。" };
  }
  function exportModel(model, options = {}){
    const candidate = model.candidate;
    const coefficients = {
      farmTarget:candidate.farmTarget, prior:candidate.prior,
      byBuilding:Object.fromEntries(candidate.byBuilding), byBed:Object.fromEntries(candidate.byBed), bySeason:Object.fromEntries(candidate.bySeason),
      byPosition:Object.fromEntries(candidate.byPosition || []),
      independentCrops:candidate.independentCrops, anchorCount:candidate.anchorCount, labelledCount:candidate.labelledCount,
      window:candidate.window || { lower:0.88, upper:1.12, learned:false },
      legacyTargets:candidate.method === "legacy" ? candidate.legacyTargets || Object.fromEntries([...new Set(candidate.rows.map(row => row.building))]
        .map(building => [building, targetFor(candidate, building, "")])) : null,
      legacyGlobalTarget:candidate.method === "legacy" ? candidate.legacyGlobalTarget ?? targetFor(candidate, -1, "") : null
    };
    if(candidate.quality) coefficients.quality = candidate.quality;
    if(candidate.yield) coefficients.yield = candidate.yield;
    const signature = JSON.stringify([model.selectedMethod, candidate.parameter, coefficients]);
    let hash = 2166136261;
    for(let i = 0; i < signature.length; i++) hash = Math.imul(hash ^ signature.charCodeAt(i), 16777619) >>> 0;
    const samples = model.samples || [];
    return JSON.parse(JSON.stringify({ schemaVersion:VERSION,
      modelVersion:options.modelVersion || model.modelVersion || `growth-${model.asOf}-${hash.toString(16)}`,
      createdAt:model.trainedAsOf || model.asOf, trainedAsOf:model.trainedAsOf || model.asOf,
      method:model.selectedMethod, parameters:{ ...candidate.parameter }, coefficients,
      training:model.training || { startDate:samples[0]?.date || null, endDate:samples[samples.length - 1]?.date || null,
        sampleCount:samples.length, independentCrops:candidate.independentCrops,
        features:candidate.parameter.id === "calendar" ? ["ageDays"] : ["temperature", "sunshineProxy", "manualEnvironment", ...(candidate.method === "adaptive" ? ["building", "bed", "season"] : [])] },
      validation:{ methods:model.validation.methods, selection:model.validation.selection,
        rows:{ [model.selectedMethod]:model.validation.rows?.[model.selectedMethod] || [] },
        limitations:model.validation.limitations || [], breakdown:model.validation.breakdown || null }
    }));
  }
  function hydrateModel(snapshot, options = {}){
    const methods = ["legacy", "safe", "calendar", "adaptive"];
    if(!snapshot || snapshot.schemaVersion !== VERSION || !methods.includes(snapshot.method)
      || !snapshot.coefficients || !(numeric(snapshot.coefficients.farmTarget) > 0)) throw new Error("保存モデルの係数または版が不正です");
    const parameter = snapshot.parameters || {};
    if(parameter.id !== "calendar" && (!(numeric(parameter.temperaturePower) > 0) || !(numeric(parameter.lightPower) >= 0))) throw new Error("保存モデルの気象係数が不正です");
    const convertMap = (value, numericKeys = false) => new Map(Object.entries(value || {}).map(([key, item]) => {
      if(!item || numeric(item.target ?? item.factor) === null || (item.target ?? item.factor) <= 0) throw new Error("保存モデルの補正が不正です");
      return [numericKeys ? Number(key) : key, { ...item }];
    }));
    const c = snapshot.coefficients;
    if(c.window && (!(numeric(c.window.lower) > 0) || !(numeric(c.window.upper) > numeric(c.window.lower)))) throw new Error("保存モデルの適期境界が不正です");
    if(snapshot.method === "legacy" && (!(numeric(c.legacyGlobalTarget) > 0)
      || Object.values(c.legacyTargets || {}).some(value => !(numeric(value) > 0)))) throw new Error("保存モデルの旧方式目標が不正です");
    const candidate = { ...c, method:snapshot.method, parameter:{ ...parameter }, rows:[],
      byBuilding:convertMap(c.byBuilding, true), byBed:convertMap(c.byBed), bySeason:convertMap(c.bySeason, true) };
    candidate.byPosition = convertMap(c.byPosition);
    const asOf = dateKey(options.asOf);
    if(!asOf || !dateKey(snapshot.trainedAsOf) || cutoffInstant(snapshot.trainedAsOf) > cutoffInstant(options.asOf)) throw new Error("保存モデルより前の時点へは復元できません");
    return { schemaVersion:VERSION, asOf, trainedAsOf:snapshot.trainedAsOf, modelVersion:snapshot.modelVersion,
      selectedMethod:snapshot.method, candidate, training:snapshot.training, samples:[], excluded:{},
      weatherContext:prepareWeather(options.weatherDaily, options), validation:{ methods:{}, rows:{}, selection:{}, ...snapshot.validation },
      stage:candidate.independentCrops < 8 ? "initial" : "approved", selectionFallback:null, restored:true };
  }
  return Object.freeze({ schemaVersion:VERSION, fit, predict, backtest, prepareWeather,
    summarize, exportModel, hydrateModel, comparePredictions, diagnoseWeather, normalizeSamples, metrics, dateKey, addDays, daysBetween,
    _test:{ dailyUnit, accumulate, buildCandidate, predictCandidate, compareGate, targetFor, PARAMETERS,
      evaluationAvailableBefore, pickParameter, selectValidatedMethod } });
});
