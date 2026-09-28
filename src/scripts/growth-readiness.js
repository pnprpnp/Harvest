(function(root, factory){
  const api = factory();
  if(typeof module === "object" && module.exports) module.exports = api;
  if(root) root.HarvestGrowthReadiness = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(){
  "use strict";
  function day(value){
    if(typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value ? value : "";
  }
  function time(value){
    if(typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return NaN;
    return Date.parse(value);
  }
  function available(row){
    const created = time(row.createdAt), updated = time(row.updatedAt);
    return Number.isFinite(created) && Number.isFinite(updated) && updated >= created ? updated : NaN;
  }
  const pallet = /^[2-9]-[A-F]-(?:[1-9]|[1-6][0-9]|7[0-8])$/;
  function resolve({plantingEventId,plantingDate,palletKeys,harvestDate,manual = {},observations = [],asOf} = {}){
    if(!Number.isSafeInteger(plantingEventId) || plantingEventId <= 0 || !day(plantingDate)
      || !Array.isArray(palletKeys) || palletKeys.some(key => typeof key !== "string" || !pallet.test(key))){
      throw new Error("適期日の照合対象が正しくありません");
    }
    if(harvestDate !== undefined && harvestDate !== "" && (!day(harvestDate) || harvestDate < plantingDate)) throw new Error("収穫日が正しくありません");
    const cutoff = asOf === undefined ? Infinity : day(asOf) ? Date.parse(`${asOf}T23:59:59.999+09:00`) : time(asOf);
    if(Number.isNaN(cutoff)) throw new Error("適期日の照合基準が正しくありません");
    const cutoffDay = cutoff === Infinity ? "9999-12-31" : new Date(cutoff + 9 * 3600000).toISOString().slice(0,10);
    const lastDay = harvestDate && harvestDate < cutoffDay ? harvestDate : cutoffDay;
    const validReady = value => day(value) && value >= plantingDate && value <= lastDay;
    const selected = [...new Set(palletKeys)].sort((a,b) => a.localeCompare(b,"en",{numeric:true}));
    if(!selected.length) return [];
    const unknown = keys => ({palletKeys:keys,readyDate:"",availableAt:"",observationIds:[]});
    const mode = manual.mode === undefined ? "auto" : manual.mode;
    if(!["auto","manual","none"].includes(mode)) throw new Error("適期日の確認方法が正しくありません");
    if(mode === "none") return [unknown(selected)];
    if(mode === "manual"){
      const knownAt = time(manual.availableAt);
      // Explicit but incomplete manual input must never reactivate automatic inheritance.
      if(!validReady(manual.date) || !Number.isFinite(knownAt) || knownAt > cutoff) return [unknown(selected)];
      return [{palletKeys:selected,readyDate:manual.date,availableAt:new Date(knownAt).toISOString(),observationIds:[]}];
    }
    const perPallet = new Map(selected.map(key => [key,[]]));
    // Current observations do not retain revision history. Ignore every superseded
    // version of a deleted/edited ID; never reconstruct a past value from a tombstone.
    const current = new Map();
    (Array.isArray(observations) ? observations : []).forEach(row => {
      if(!row || typeof row.observationId !== "string" || !row.observationId) return;
      const prior = current.get(row.observationId);
      if(!prior) current.set(row.observationId,row);
      else {
        const revision = Number(row.revision) || 0, priorRevision = Number(prior.revision) || 0;
        const edited = available(row), priorEdited = available(prior);
        if(revision > priorRevision || (revision === priorRevision && edited > priorEdited)) current.set(row.observationId,row);
        else if(revision === priorRevision && edited === priorEdited && (row.deletedAt || row.readyDate !== prior.readyDate)){
          current.set(row.observationId,{...row,deletedAt:row.deletedAt || "conflicting"});
        }
      }
    });
    current.forEach(row => {
      if((row.kind || "ready") !== "ready" || row.deletedAt || row.plantingEventId !== plantingEventId
        || row.plantingDate !== plantingDate || !validReady(row.readyDate) || !Array.isArray(row.palletKeys)) return;
      const knownAt = available(row);
      if(!Number.isFinite(knownAt) || knownAt > cutoff) return;
      row.palletKeys.forEach(key => { if(perPallet.has(key)) perPallet.get(key).push({row,knownAt}); });
    });
    const groups = new Map();
    perPallet.forEach((candidates,key) => {
      const latest = candidates.reduce((result,item) => Math.max(result,item.knownAt),-Infinity);
      const current = candidates.filter(item => item.knownAt === latest);
      const dates = new Set(current.map(item => item.row.readyDate));
      const readyDate = dates.size === 1 ? current[0].row.readyDate : "";
      if(!groups.has(readyDate)) groups.set(readyDate,{...unknown([]),readyDate});
      const group = groups.get(readyDate);
      group.palletKeys.push(key);
      if(readyDate){
        const date = new Date(latest).toISOString();
        if(!group.availableAt || date > group.availableAt) group.availableAt = date;
        current.forEach(item => { if(!group.observationIds.includes(item.row.observationId)) group.observationIds.push(item.row.observationId); });
      }
    });
    return [...groups.values()].map(group => ({...group,observationIds:group.observationIds.sort()}));
  }
  return Object.freeze({resolve});
});
