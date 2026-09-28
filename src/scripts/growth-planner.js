// Presentation-independent planning. Counts remain unrounded until display.
(function(root, factory){
  const api = factory();
  if(typeof module === "object" && module.exports) module.exports = api;
  else root.HarvestGrowthPlanner = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(){
  "use strict";
  const CASE_SIZE = 12;
  const dayMs = 86400000;
  const day = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) && Number.isFinite(Date.parse(value)) ? String(value) : null;
  const add = (value,n) => new Date(Date.parse(value) + n * dayMs).toISOString().slice(0,10);
  const diff = (a,b) => Math.round((Date.parse(b) - Date.parse(a)) / dayMs);
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const quantile = (values,q) => {
    const a = values.slice().sort((x,y) => x-y);
    if(!a.length) return null;
    const k = (a.length-1)*q, i = Math.floor(k);
    return a[i] + (a[Math.ceil(k)]-a[i])*(k-i);
  };
  function fitYield(rows){
    const unique = new Map();
    (rows || []).forEach(row => {
      if(!row.id || unique.has(String(row.id)) || !finite(row.plantedHeads) || row.plantedHeads <= 0
        || !finite(row.cases) || row.cases < 0 || row.incomplete || row.special) return;
      const factor = (row.cases * CASE_SIZE + (row.partialHeads || 0)) / row.plantedHeads;
      if(factor < 0 || factor > 1) return; // Ambiguous or inconsistent counts never teach a loss rate.
      unique.set(String(row.id),{factor,building:row.building});
    });
    return { schemaVersion:1, rows:[...unique.values()] };
  }
  function quantity(model, {pallets = [],building} = {}){
    let planted = 0, partial = 0, missing = 0;
    pallets.forEach(pallet => {
      if(!finite(pallet.plantedHeads) || pallet.plantedHeads <= 0){ missing++; return; }
      planted += pallet.plantedHeads;
      partial += Math.min(pallet.plantedHeads, Math.max(0,pallet.partialHeads || 0));
    });
    if(missing || !pallets.length) return {center:null,low:null,high:null,missingPallets:missing,reference:true,sampleCount:0,caseSize:CASE_SIZE};
    const all = model?.rows || [], local = all.filter(row => row.building === building);
    const farm = quantile(all.map(row => row.factor),.5);
    const house = quantile(local.map(row => row.factor),.5);
    const weight = local.length/(local.length+12);
    const factor = farm === null ? 1 : (house === null ? farm : farm*(1-weight)+house*weight);
    const maximum = Math.max(0,planted-partial)/CASE_SIZE;
    const center = Math.min(maximum,Math.max(0,planted*factor-partial)/CASE_SIZE);
    const enough = all.length >= 8;
    const lowFactor = enough ? Math.max(0,quantile(all.map(row => row.factor),.1)-1/(all.length+1)) : 0;
    const highFactor = enough ? Math.min(1,quantile(all.map(row => row.factor),.9)+1/(all.length+1)) : 1;
    return { center,low:Math.min(center,Math.max(0,planted*lowFactor-partial)/CASE_SIZE),
      high:Math.max(center,Math.min(maximum,Math.max(0,planted*highFactor-partial)/CASE_SIZE)),
      plantedHeads:planted,partialHeads:partial,missingPallets:0,sampleCount:all.length,
      reference:!enough,intervalKind:enough ? "empirical-reference" : "possible-range",caseSize:CASE_SIZE };
  }
  const riskLevel = risk => ({alert:"high",watch:"medium",low:"low",medium:"medium",high:"high"})[risk?.level] || "unknown";
  function adjusted(item,offset,horizon){
    const days = finite(offset) ? Math.max(-30,Math.min(30,offset)) : 0;
    const shift = value => value && day(value) && (!horizon || add(value,days) <= horizon) ? add(value,days) : null;
    return {...item,aiReadyStart:item.readyStart || item.readyDate || null,aiReadyEnd:item.readyEnd || null,
      readyStart:shift(item.readyStart || item.readyDate),readyEnd:shift(item.readyEnd),manualOffsetDays:days};
  }
  function priority(item,today){
    // A high quality risk alone can never promote a small/unknown crop to harvest.
    if(!["normal","large"].includes(item.currentStatus)) return "later";
    const high = Object.values(item.risk || {}).some(risk => riskLevel(risk) === "high");
    if(item.currentStatus === "large" || (item.readyEnd && item.readyEnd <= today) || high) return "urgent";
    if(item.currentStatus === "normal") return "today";
    return "later";
  }
  function calendar(items,{today,forecastEndDate,forecastDates} = {}){
    if(!day(today)) return [];
    const available = forecastDates ? new Set(forecastDates) : null;
    const seen = new Set();
    const unique = (items || []).filter(item => {
      const id = item.id || `${item.building}-${item.bed}`;
      if(seen.has(id)) return false;
      seen.add(id); return true;
    });
    return Array.from({length:14},(_,index) => {
      const date = add(today,index), predicted = !!forecastEndDate && date <= forecastEndDate && (!available || available.has(date));
      if(!predicted) return {date,predicted:false,reason:"気象予報範囲外のため未予測",entries:[],ongoing:[],cases:null};
      const entries = unique.filter(item => (item.readyStart || item.readyDate) === date);
      const ongoing = unique.filter(item => (item.readyStart || item.readyDate) < date && item.readyEnd >= date);
      const known = entries.filter(item => finite(item.quantity?.center));
      return {date,predicted:true,entries,ongoing,cases:known.reduce((sum,item)=>sum+item.quantity.center,0),
        low:known.reduce((sum,item)=>sum+item.quantity.low,0),high:known.reduce((sum,item)=>sum+item.quantity.high,0),
        missingQuantities:entries.length-known.length};
    });
  }
  function warnings(items,today){
    const order = {elongated:0,uneven:1,tipburn:2}, strength = {high:3,medium:2};
    return (items || []).flatMap(item => Object.keys(order).flatMap(kind => {
      const risk = item.risk?.[kind], level = riskLevel(risk);
      return strength[level] ? [{id:item.id,building:item.building,bed:item.bed,kind,level,risk,
        daysToReady:(item.readyStart || item.readyDate) ? diff(today,item.readyStart || item.readyDate) : null,
        currentStatus:item.currentStatus}] : [];
    })).sort((a,b)=>strength[b.level]-strength[a.level] || order[a.kind]-order[b.kind]
      || (a.daysToReady ?? Infinity)-(b.daysToReady ?? Infinity)).slice(0,3);
  }
  function changes(previous,current){
    const prior = new Map((previous || []).map(item=>[item.id,item]));
    return (current || []).flatMap(item => {
      const old = prior.get(item.id);
      if(!old || !item.id) return [];
      const result = [], before = old.aiReadyStart || old.readyStart || old.readyDate,
        after = item.aiReadyStart || item.readyStart || item.readyDate;
      if(day(before) && day(after) && Math.abs(diff(before,after)) >= 2){
        result.push({id:item.id,building:item.building,bed:item.bed,type:"ready",before,after,days:diff(before,after)});
      }
      ["elongated","uneven","tipburn"].forEach(kind=>{
        if(riskLevel(old.risk?.[kind]) === "low" && riskLevel(item.risk?.[kind]) === "high"){
          result.push({id:item.id,building:item.building,bed:item.bed,type:"risk",kind,before:"low",after:"high"});
        }
      });
      return result;
    });
  }
  return Object.freeze({CASE_SIZE,fitYield,quantity,calendar,priority,warnings,changes,adjusted,riskLevel});
});
