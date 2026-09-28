/* Pure, time-scoped join of optional field observations onto growth inputs.
 * No fitting, storage, record mutation or inferred abnormal-EC threshold.
 */
(function(root, factory){
  const api = factory();
  if(typeof module === "object" && module.exports) module.exports = api;
  if(root) root.HarvestGrowthEvidence = api;
})(typeof globalThis === "object" ? globalThis : this, function(){
  "use strict";
  const SOURCE = "typed-observation";
  const KINDS = new Set(["ec", "condition", "environment", "manualOffset", "fieldAssessment"]);
  const KEY = /^[2-9]-[A-F]-(?:[1-9]|[1-6][0-9]|7[0-8])$/;
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const numeric = value => typeof value === "number" && Number.isFinite(value) ? value : null;
  const instant = value => typeof value === "number" && Number.isFinite(value) ? value
    : typeof value === "string" && value.trim() && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
  function day(value){
    if(value instanceof Date || typeof value === "string" && value.length > 10){
      const time = instant(value instanceof Date ? value.getTime() : value);
      return time === null ? null : new Date(time + 9 * 3600000).toISOString().slice(0, 10);
    }
    if(typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const time = Date.parse(value + "T00:00:00Z");
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? value : null;
  }
  function boundary(value){
    const date = day(value), time = instant(typeof value === "string" && value.length === 10 ? value + "T00:00:00+09:00" : value instanceof Date ? value.getTime() : value);
    if(!date || time === null) throw new Error("生育確認の付与には有効な判定時点が必要です");
    return { date, time };
  }
  const keys = values => [...new Set((Array.isArray(values) ? values : []).filter(value => typeof value === "string" && KEY.test(value)))].sort();
  const severity = value => ({ low:"slight", high:"many", present:"legacy-present" })[value]
    || (["none", "slight", "many", "legacy-present"].includes(value) ? value : "unknown");
  function prepare(observations, cutoff){
    const byId = new Map();
    (Array.isArray(observations) ? observations : []).forEach(row => {
      if(!row || !KINDS.has(row.kind) || !row.observationId || !row.payload) return;
      if(row.palletKeys !== undefined && (!Array.isArray(row.palletKeys) || row.palletKeys.some(key => typeof key !== "string" || !KEY.test(key)))) return;
      const p = row.payload;
      if(row.kind === "environment" && (!["temperature", "light", "humidity"].every(key => ["high", "low", "base"].includes(p[key])) || !["normal", "downweight", "exclude"].includes(p.dataPolicy))) return;
      if(row.kind === "condition" && (!["shadeChange", "equipmentFailure", "abnormalSeedlings", "hydroponicTrouble", "abnormalEc", "other"].includes(p.type) || p.dataPolicy !== "exclude")) return;
      if(row.kind === "ec" && (numeric(p.value) === null || p.value < 0 || p.value > 50 || p.unit !== "mS/cm" || own(p,"isAbnormal") && typeof p.isAbnormal !== "boolean")) return;
      if(row.kind === "manualOffset" && (!Number.isInteger(p.days) || p.days < -30 || p.days > 30 || typeof p.sourcePredictionId !== "string" || !p.sourcePredictionId.trim())) return;
      const created = instant(row.createdAt), updated = instant(row.updatedAt), supplied = instant(row.availableAt);
      // Current-version records cannot reconstruct an earlier, overwritten revision.
      if(created === null || updated === null || updated < created) return;
      const available = Math.max(created, updated, supplied ?? -Infinity);
      if(available >= cutoff.time) return;
      const start = day(row.startDate || row.date), end = day(row.endDate) || (row.startDate ? null : start);
      if(!start || start > cutoff.date || row.endDate && !end || end && end < start) return;
      const deletedAt = instant(row.deletedAt);
      const prepared = { ...row, startDate:start, endDate:end, palletKeys:keys(row.palletKeys),
        availableAt:new Date(available).toISOString(), availableInstant:available,
        deleted:deletedAt !== null && deletedAt < cutoff.time };
      const previous = byId.get(String(row.observationId));
      if(!previous || available > previous.availableInstant
        || available === previous.availableInstant && Number(row.revision || 0) > Number(previous.revision || 0)) byId.set(String(row.observationId), prepared);
    });
    return [...byId.values()].filter(row => !row.deleted).sort((a,b) => a.startDate.localeCompare(b.startDate)
      || a.availableInstant - b.availableInstant || String(a.observationId).localeCompare(String(b.observationId)));
  }
  function sampleScope(sample){
    const palletKeys = keys(sample.palletKeys?.length ? sample.palletKeys : sample.positionKey ? [sample.positionKey] : []);
    const buildings = [...new Set(palletKeys.map(key => Number(key.split("-")[0])))];
    const beds = [...new Set(palletKeys.map(key => key.split("-")[1]))];
    const building = Number(sample.building ?? (buildings.length === 1 ? buildings[0] : NaN));
    const bed = String(sample.bed || (beds.length === 1 ? beds[0] : ""));
    const consistent = (!Array.isArray(sample.palletKeys) || sample.palletKeys.every(key => typeof key === "string" && KEY.test(key)))
      && (!sample.positionKey || KEY.test(sample.positionKey)) && Number.isInteger(building) && building >= 2 && building <= 9
      && (!bed || /^[A-F]$/.test(bed)) && palletKeys.every(key => Number(key.split("-")[0]) === building && (!bed || key.split("-")[1] === bed));
    return { building, bed, palletKeys, consistent };
  }
  function scopeMatch(sample, scope, row){
    if(!scope.consistent) return "none";
    if(["manualOffset", "fieldAssessment"].includes(row.kind)){
      if(sample.plantingEventId == null || String(sample.plantingEventId) !== String(row.plantingEventId)
        || day(sample.plantingDate) !== day(row.plantingDate)) return "none";
    }else if(Number(row.building) !== scope.building || row.bed && row.bed !== scope.bed) return "none";
    if(!row.palletKeys.length) return ["manualOffset", "fieldAssessment"].includes(row.kind) ? "none" : "full";
    const covered = new Set(row.palletKeys);
    if(!scope.palletKeys.length) return row.palletKeys.some(key => Number(key.split("-")[0]) === scope.building
      && (!scope.bed || key.split("-")[1] === scope.bed)) ? "unknown-position" : "none";
    const matches = scope.palletKeys.filter(key => covered.has(key)).length;
    return matches === scope.palletKeys.length ? "full" : matches ? "partial" : "none";
  }
  function metadata(row){
    return { source:SOURCE, observationId:String(row.observationId), kind:row.kind, startDate:row.startDate,
      endDate:row.endDate || null, availableAt:row.availableAt,
      scope:{ building:row.building ?? null, bed:row.bed || "", palletKeys:row.palletKeys.slice() } };
  }
  const externalEntries = entries => (Array.isArray(entries) ? entries : []).filter(entry => entry?.source !== SOURCE).map(entry => ({ ...entry }));
  function annotate(samples, observations, options = {}){
    const cutoff = boundary(options.asOf), prepared = prepare(observations, cutoff);
    const byBuilding = new Map(), byCrop = new Map();
    prepared.forEach(row => {
      const crop = ["manualOffset", "fieldAssessment"].includes(row.kind);
      const index = crop ? byCrop : byBuilding, key = crop ? String(row.plantingEventId) : Number(row.building);
      const list = index.get(key) || []; list.push(row); index.set(key, list);
    });
    return (Array.isArray(samples) ? samples : []).map(sample => {
      const output = { ...sample }, scope = sampleScope(sample);
      const prior = sample.growthEvidence?.source === SOURCE ? sample.growthEvidence.baseTraining : sample;
      const baseTraining = {};
      ["excludedFromTraining", "exclusionAvailableAt"].forEach(key => {
        if(own(prior, key)){ baseTraining[key] = prior[key]; output[key] = prior[key]; } else delete output[key];
      });
      const evidence = { schemaVersion:1, source:SOURCE, asOf:new Date(cutoff.time).toISOString(), baseTraining,
        appliedIds:[], ignoredPartialScope:[], ec:[], fieldAssessments:[], manualOffsets:[], reasons:[],
        confidenceReduced:false, trainingInputsChanged:false,
        reconstruction:"Only versions available at the cutoff; overwritten earlier revisions cannot be reconstructed." };
      output.environmentRegimes = externalEntries(sample.environmentRegimes);
      output.trainingPolicies = externalEntries(sample.trainingPolicies);
      output.specialConditions = externalEntries(sample.specialConditions);
      output.growthEvidence = evidence;
      const plantingDate = day(sample.plantingDate), end = day(sample.date || sample.harvestDate || sample.targetDate) || cutoff.date;
      if(!plantingDate || plantingDate > end || !scope.consistent){
        evidence.reasons.push({ code:"missingCropScope", text:"苗植え日または対象範囲が不明のため追加の確認記録を適用していません" });
        return output;
      }
      const relevant = [...(byBuilding.get(scope.building) || []), ...(byCrop.get(String(sample.plantingEventId)) || [])];
      relevant.forEach(row => {
        if(row.startDate > end || row.endDate && row.endDate < plantingDate) return;
        const match = scopeMatch(sample, scope, row);
        if(match === "none") return;
        if(match !== "full"){
          evidence.ignoredPartialScope.push({ ...metadata(row), reason:match });
          return;
        }
        const meta = metadata(row), payload = row.payload;
        evidence.appliedIds.push(meta.observationId);
        if(row.kind === "environment"){
          if(!["temperature", "light", "humidity"].every(key => ["high", "low", "base"].includes(payload[key]))) return;
          output.environmentRegimes.push({ ...meta,
            scopePriority:row.palletKeys.length ? 2 : row.bed ? 1 : 0,
            temperatureOffsetC:({ high:1, low:-1, base:0 })[payload.temperature],
            lightMultiplier:({ high:1.12, low:0.88, base:1 })[payload.light],
            humidity:payload.humidity, assumption:"explicit-user-environment-prior" });
          evidence.trainingInputsChanged = true;
          if(payload.humidity !== "base") evidence.reasons.push({ code:"humidityUncalibrated", observationId:meta.observationId,
            text:"湿度の環境傾向は記録済みですが、湿度による数値補正は未検証です" });
          if(["exclude", "downweight"].includes(payload.dataPolicy)) output.trainingPolicies.push({ ...meta,
            dataPolicy:payload.dataPolicy, weightFactor:payload.dataPolicy === "downweight" ? 0.5 : 0,
            weightKind:"explicit-training-policy-not-measured-growth-effect" });
        }else if(row.kind === "condition"){
          output.specialConditions.push({ ...meta, type:payload.type, note:typeof payload.note === "string" ? payload.note : "" });
          if(payload.dataPolicy === "exclude") output.trainingPolicies.push({ ...meta, dataPolicy:"exclude", weightFactor:0 });
          evidence.confidenceReduced = true;
          evidence.trainingInputsChanged = true;
          evidence.reasons.push({ code:"specialCondition", observationId:meta.observationId, text:"特殊条件の記録があるため予測は参考値です" });
        }else if(row.kind === "ec"){
          if(numeric(payload.value) === null || payload.unit !== "mS/cm") return;
          evidence.ec.push({ ...meta, date:row.startDate, value:payload.value, unit:"mS/cm",
            isAbnormal:typeof payload.isAbnormal === "boolean" ? payload.isAbnormal : null });
          if(payload.isAbnormal === true){
            evidence.confidenceReduced = true;
            evidence.reasons.push({ code:"explicitAbnormalEc", observationId:meta.observationId, text:"EC異常の記録があるため予測は参考値です" });
          }
        }else if(row.kind === "manualOffset"){
          if(!Number.isInteger(payload.days) || payload.days < -30 || payload.days > 30) return;
          evidence.manualOffsets.push({ ...meta, date:row.startDate, days:payload.days,
            sourcePredictionId:String(payload.sourcePredictionId || ""), trainingEligible:false });
        }else if(row.kind === "fieldAssessment"){
          evidence.fieldAssessments.push({ ...meta, date:row.startDate,
            size:["small", "normal", "large"].includes(payload.size) ? payload.size : "unknown",
            quality:Object.fromEntries(["elongated", "uneven", "tipburn"].map(key => [key, severity(payload.quality?.[key])])), trainingEligible:false });
        }
      });
      const byDate = (a,b) => String(a.startDate || "").localeCompare(String(b.startDate || ""))
        || (instant(a.availableAt) || 0) - (instant(b.availableAt) || 0) || String(a.observationId || "").localeCompare(String(b.observationId || ""));
      [output.environmentRegimes, output.trainingPolicies, output.specialConditions, evidence.manualOffsets, evidence.fieldAssessments, evidence.ec].forEach(rows => rows.sort(byDate));
      evidence.manualOffset = evidence.manualOffsets.at(-1) || null;
      if(evidence.ignoredPartialScope.length){
        evidence.confidenceReduced = true;
        evidence.reasons.push({ code:"partialScopeNotApplied", text:"一部位置だけの確認記録はベッド全体へ広げず、対象を分けた予測で使用します" });
      }
      const exclusions = output.trainingPolicies.filter(policy => policy.dataPolicy === "exclude"
        && instant(policy.availableAt) !== null && instant(policy.availableAt) < cutoff.time);
      if(exclusions.length){
        output.excludedFromTraining = true;
        const dates = exclusions.map(policy => policy.availableAt);
        if(baseTraining.excludedFromTraining && instant(baseTraining.exclusionAvailableAt) !== null) dates.push(baseTraining.exclusionAvailableAt);
        if(baseTraining.excludedFromTraining && instant(baseTraining.exclusionAvailableAt) === null) delete output.exclusionAvailableAt;
        else output.exclusionAvailableAt = dates.sort((a,b) => instant(a) - instant(b))[0];
      }
      evidence.appliedIds = [...new Set(evidence.appliedIds)].sort();
      return output;
    });
  }
  return Object.freeze({ schemaVersion:1, annotate });
});
