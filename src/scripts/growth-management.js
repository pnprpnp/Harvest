(function(root, factory){
  const api = factory();
  if(typeof module === "object" && module.exports) module.exports = api;
  if(root) root.HarvestGrowthManagement = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(){
  "use strict";
  const PREFIX = "harvestnaviGrowthModels_v1:";
  const SNAPSHOT_LIMIT = 300000, REGISTRY_LIMIT = 2000000;
  const SNAPSHOT_FIELDS = ["schemaVersion","modelVersion","createdAt","trainedAsOf","method","parameters","coefficients","training","validation"];
  const FORBIDDEN = new Set(["__proto__","constructor","prototype","weatherDaily","weatherContext","rawWeather","samples","sourceRecords","records","plantingEvents"]);
  const plain = value => !!value && typeof value === "object" && !Array.isArray(value)
    && [Object.prototype,null].includes(Object.getPrototypeOf(value));
  const clone = value => JSON.parse(JSON.stringify(value));
  function json(value, depth = 0){
    if(depth > 25) throw new Error("モデルの保存内容が深すぎます");
    if(value === null || typeof value === "string" || typeof value === "boolean") return value;
    if(typeof value === "number" && Number.isFinite(value)) return value;
    if(Array.isArray(value)) return value.map(item => json(item, depth + 1));
    if(!plain(value)) throw new Error("モデルは有限の数値を含むJSONで保存してください");
    const result = {};
    for(const key of Object.keys(value).sort()){
      if(FORBIDDEN.has(key)) throw new Error("元記録や気象データはモデル世代へ保存できません");
      result[key] = json(value[key], depth + 1);
    }
    return result;
  }
  const equal = (left, right) => JSON.stringify(json(left)) === JSON.stringify(json(right));
  function identifier(value){
    if(typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/.test(value)) throw new Error("モデル版の形式が正しくありません");
    return value;
  }
  function signature(value){
    if(typeof value !== "string" || !value || value.length > 2000 || value.includes("\u0000")) throw new Error("教師データの更新署名が正しくありません");
    return value;
  }
  function snapshot(value){
    if(!plain(value) || Object.keys(value).some(key => !SNAPSHOT_FIELDS.includes(key))) throw new Error("保存モデルの構造が正しくありません");
    identifier(value.modelVersion);
    if(!Number.isSafeInteger(value.schemaVersion) || value.schemaVersion < 1
      || !["legacy","safe","calendar","adaptive"].includes(value.method)
      || !plain(value.coefficients) || typeof value.coefficients.farmTarget !== "number" || !(value.coefficients.farmTarget > 0)
      || !plain(value.parameters) || !plain(value.training) || !plain(value.validation)) throw new Error("保存モデルの係数・学習情報が正しくありません");
    const result = json(value);
    if(JSON.stringify(result).length > SNAPSHOT_LIMIT) throw new Error("保存モデルが大きすぎます。元記録・気象データを取り除いてください");
    return result;
  }
  function timestamp(value){
    if(typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("モデル履歴の日時が正しくありません");
    return new Date(value).toISOString();
  }
  function empty(){
    return {schemaVersion:1,generations:[],activeId:null,candidateId:null,baselineId:null,
      lastWorking:{id:null,at:null,previousIds:[]},evaluation:{dataSignature:null,at:null,summary:null},
      shadowEnabled:false,history:[],conflicts:[],localRevision:0};
  }
  function create(options = {}){
    const cache = new Map(), runtime = new Map();
    const storage = () => options.storage || (typeof harvestnaviLocalStorage !== "undefined" ? harvestnaviLocalStorage : null);
    const role = () => {
      const value = options.getRole ? options.getRole() : typeof getActiveRecordsStorageKey === "function" ? getActiveRecordsStorageKey() : "default";
      if(typeof value !== "string" || !value || value.length > 200) throw new Error("モデルを保存する利用者が不明です");
      return value;
    };
    const now = () => timestamp(new Date(options.now ? options.now() : Date.now()).toISOString());
    function validate(value){
      if(!plain(value) || value.schemaVersion !== 1 || !Array.isArray(value.generations)
        || !Array.isArray(value.history) || !Array.isArray(value.conflicts)
        || !Number.isSafeInteger(value.localRevision) || value.localRevision < 0) throw new Error("モデル世代の保存形式を読み込めません");
      const state = json(value), ids = new Set();
      state.generations.forEach(generation => {
        if(!plain(generation) || generation.id !== generation.modelVersion || ids.has(generation.id)) throw new Error("モデル世代が重複または破損しています");
        identifier(generation.id); ids.add(generation.id);
        generation.modelSnapshot = snapshot(generation.modelSnapshot);
        if(generation.modelSnapshot.modelVersion !== generation.id || !Array.isArray(generation.activePeriods)
          || typeof generation.eligible !== "boolean") throw new Error("モデル世代の識別情報が一致しません");
        timestamp(generation.createdAt);
        if(generation.adoptedAt) timestamp(generation.adoptedAt);
        generation.activePeriods.forEach(period => { timestamp(period.from); if(period.to) timestamp(period.to); });
      });
      for(const key of ["activeId","candidateId","baselineId"]){
        if(state[key] !== null && !ids.has(state[key])) throw new Error("選択されたモデル世代が見つかりません");
      }
      if(state.baselineId && state.generations.find(item => item.id === state.baselineId).modelSnapshot.method !== "legacy") throw new Error("初期モデルは旧方式である必要があります");
      if(!plain(state.lastWorking) || !Array.isArray(state.lastWorking.previousIds)
        || [state.lastWorking.id,...state.lastWorking.previousIds].some(id => id !== null && !ids.has(id))) throw new Error("最終正常モデルの保存内容が正しくありません");
      if(state.lastWorking.at) timestamp(state.lastWorking.at);
      if(!plain(state.evaluation) || typeof state.shadowEnabled !== "boolean") throw new Error("モデルの検証状態が正しくありません");
      if(state.evaluation.dataSignature !== null) signature(state.evaluation.dataSignature);
      return state;
    }
    function index(state){ return {state,byId:new Map(state.generations.map(item => [item.id,item]))}; }
    function load(scope = role()){
      if(cache.has(scope)) return cache.get(scope);
      const store = storage();
      if(!store) throw new Error("モデルを端末へ保存できません");
      const raw = store.readJson ? store.readJson(PREFIX + scope, null) : JSON.parse(store.getItem(PREFIX + scope) || "null");
      const entry = index(raw === null ? empty() : validate(raw)); cache.set(scope,entry); return entry;
    }
    function commit(scope, state){
      state.localRevision = load(scope).state.localRevision + 1;
      const text = JSON.stringify(state);
      if(text.length > (options.maxRegistryCharacters || REGISTRY_LIMIT)) throw new Error("モデル世代の保存容量が不足しています。既存世代は削除していません");
      const store = storage();
      // Update the cache only after the durable atomic write succeeds.
      if(store.writeJson) store.writeJson(PREFIX + scope,state); else store.setItem(PREFIX + scope,text);
      cache.set(scope,index(state));
    }
    function generation(value, metadata = {}){
      const modelSnapshot = snapshot(value), createdAt = now();
      if(options.validateSnapshot) options.validateSnapshot(clone(modelSnapshot));
      const training = modelSnapshot.training;
      const count = metadata.count === undefined ? training.sampleCount || 0 : metadata.count;
      if(!Number.isSafeInteger(count) || count < 0) throw new Error("モデルの学習件数が正しくありません");
      // Calibration residuals stay in modelSnapshot.validation; the visible
      // generation metadata stores aggregates without duplicating those rows.
      const validation = metadata.validation || Object.fromEntries(Object.entries(modelSnapshot.validation).filter(([key]) => key !== "rows"));
      return {id:modelSnapshot.modelVersion,modelVersion:modelSnapshot.modelVersion,createdAt,adoptedAt:null,
        trainingPeriod:json(metadata.trainingPeriod || {startDate:training.startDate || null,endDate:training.endDate || null}),
        count,features:json(metadata.features || training.features || []),validation:json(validation),settings:json(metadata.settings || {}),
        modelSnapshot,eligible:metadata.eligible === true,evaluationSignature:metadata.dataSignature ? signature(metadata.dataSignature) : null,
        activeFrom:null,activeTo:null,activePeriods:[]};
    }
    function history(state,type,details = {}){
      const event = {id:options.uuid ? options.uuid() : typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,type,at:now(),...details};
      state.history.push(event); return event;
    }
    function initialBaseline(value, metadata = {}){
      const scope = role(), current = load(scope);
      if(current.state.baselineId) return clone(current.byId.get(current.state.baselineId));
      if(current.state.activeId || current.state.generations.length) throw new Error("既存のモデル世代を初期モデルで上書きできません");
      const item = generation(value,metadata);
      if(item.modelSnapshot.method !== "legacy") throw new Error("初期モデルには旧生育予測方式を使用してください");
      const state = clone(current.state), at = now();
      item.adoptedAt = at; item.activeFrom = at; item.activePeriods.push({from:at,to:null});
      state.generations.push(item); state.activeId = item.id; state.baselineId = item.id;
      history(state,"initialBaseline",{from:null,to:item.id}); commit(scope,state); return clone(item);
    }
    function registerCandidate(value, metadata = {}){
      const scope = role(), current = load(scope);
      if(!current.state.baselineId) throw new Error("先に旧方式の初期モデルを保存してください");
      const item = generation(value,metadata), previous = current.byId.get(item.id);
      if(previous && !equal(previous.modelSnapshot,item.modelSnapshot)) throw new Error("同じモデル版に異なる内容が存在します。新しい版として登録してください");
      if(previous){
        if(previous.id === current.state.activeId) return clone(previous);
        if(previous.eligible !== item.eligible || previous.evaluationSignature !== item.evaluationSignature) throw new Error("既存世代の検証結果は変更できません。新しい版として登録してください");
      }
      const state = clone(current.state);
      if(!previous) state.generations.push(item);
      if(state.candidateId === item.id) return clone(previous || item);
      state.candidateId = item.id;
      history(state,"registerCandidate",{modelId:item.id,eligible:item.eligible}); commit(scope,state);
      return clone(previous || item);
    }
    function select(id, approval, type){
      if(!approval || approval.explicit !== true) throw new Error("モデル切替には利用者本人の承認が必要です");
      const scope = role(), current = load(scope), next = current.byId.get(identifier(id));
      if(!next) throw new Error("切替先のモデル世代が見つかりません");
      if(current.state.conflicts.some(item => item.type === "generation" && item.modelId === id && !item.resolvedAt)) throw new Error("このモデル世代には未解決の競合があります");
      if(type === "adopt" && !next.eligible) throw new Error("検証条件を満たしていないモデルは採用できません");
      if(type === "adopt" && next.id !== current.state.candidateId) throw new Error("現在の採用候補以外のモデルは採用できません");
      if(type === "adopt" && current.state.evaluation?.dataSignature
        && next.evaluationSignature !== current.state.evaluation.dataSignature) throw new Error("教師データが更新されています。最新の評価を通過した候補を確認してください");
      if(type === "rollback" && !next.adoptedAt) throw new Error("未採用の候補へ戻すことはできません");
      if(current.state.activeId === id) return clone(next);
      const state = clone(current.state), at = now(), from = state.activeId;
      const previous = state.generations.find(item => item.id === from), target = state.generations.find(item => item.id === id);
      if(previous){
        previous.activeTo = at;
        const open = previous.activePeriods[previous.activePeriods.length - 1]; if(open && !open.to) open.to = at;
      }
      target.adoptedAt ||= at; target.activeFrom = at; target.activeTo = null; target.activePeriods.push({from:at,to:null});
      state.activeId = id; if(state.candidateId === id) state.candidateId = null;
      history(state,type,{from,to:id}); commit(scope,state); runtime.delete(scope); return clone(target);
    }
    function getActiveSnapshot(){ const entry = load(); return entry.state.activeId ? clone(entry.byId.get(entry.state.activeId).modelSnapshot) : null; }
    function getCandidateSnapshot(){ const entry = load(); return entry.state.candidateId ? clone(entry.byId.get(entry.state.candidateId).modelSnapshot) : null; }
    function recordEvaluation(dataSignature, summary = {}){
      signature(dataSignature); const scope = role(), state = clone(load(scope).state);
      state.evaluation = {dataSignature,at:now(),summary:json(summary)}; commit(scope,state); return clone(state.evaluation);
    }
    function setShadowMode(enabled){
      if(typeof enabled !== "boolean") throw new Error("検証モードの指定が正しくありません");
      const scope = role(), state = clone(load(scope).state);
      if(state.shadowEnabled !== enabled){ state.shadowEnabled = enabled; history(state,"shadowMode",{enabled}); commit(scope,state); }
      return enabled;
    }
    function markWorking(scope,id,at){
      const current = load(scope), previous = current.state.lastWorking;
      if(previous.id === id && Date.parse(at) - Date.parse(previous.at || 0) < 60000) return;
      const state = clone(current.state);
      state.lastWorking = {id,at,previousIds:[previous.id,...previous.previousIds].filter((value,index,array) => value && value !== id && array.indexOf(value) === index)};
      commit(scope,state);
    }
    function runWithFallback(execute){
      if(typeof execute !== "function") throw new Error("モデルの推論処理が必要です");
      const scope = role(), entry = load(scope), state = entry.state, failures = [];
      const ids = [state.activeId,state.lastWorking.id,...state.lastWorking.previousIds,state.baselineId]
        .filter((id,index,array) => id && array.indexOf(id) === index);
      for(const id of ids){
        try {
          const item = entry.byId.get(id), value = execute(clone(item.modelSnapshot),clone(item));
          if(value && typeof value.then === "function") throw new Error("推論処理は同期関数で指定してください");
          if(value === undefined || value === null) throw new Error("モデルの推論結果がありません");
          const at = now(), fallback = id !== state.activeId;
          const status = {modelId:id,modelVersion:item.modelVersion,activeId:state.activeId,fallback,
            label:fallback ? "現在フォールバック中" : "通常予測",lastWorkingAt:at,failures};
          runtime.set(scope,status);
          try { markWorking(scope,id,at); } catch(error){ status.storageError = String(error.message || error); }
          return {value,...clone(status)};
        }catch(error){ failures.push({modelId:id,message:String(error.message || error).slice(0,300)}); }
      }
      const status = {modelId:null,modelVersion:null,activeId:state.activeId,fallback:true,label:"予測を利用できません",
        lastWorkingAt:state.lastWorking.at,failures}; runtime.set(scope,status); return {value:null,...clone(status)};
    }
    function mergeBackup(input){
      const incoming = validate(input), scope = role(), current = load(scope), state = clone(current.state);
      const added = [], conflicts = [], byId = new Map(state.generations.map(item => [item.id,item]));
      const addConflict = item => {
        if(!state.conflicts.some(existing => !existing.resolvedAt && equal(existing.detail,item.detail) && existing.type === item.type)){
          state.conflicts.push(item); conflicts.push(item);
        }
      };
      incoming.generations.forEach(item => {
        const existing = byId.get(item.id);
        if(!existing){ state.generations.push(clone(item)); byId.set(item.id,item); added.push(item.id); return; }
        if(!equal(existing.modelSnapshot,item.modelSnapshot) || !equal(existing.settings,item.settings)
          || existing.eligible !== item.eligible || existing.evaluationSignature !== item.evaluationSignature){
          addConflict({type:"generation",modelId:item.id,at:now(),detail:{incoming:clone(item)}}); return;
        }
        // Adoption periods are historical facts from both devices; activeId below
        // remains the current device's explicit choice, regardless of timestamps.
        const periods = [...existing.activePeriods,...item.activePeriods];
        existing.activePeriods = periods.filter((period,index) => periods.findIndex(other => equal(period,other)) === index)
          .sort((a,b) => a.from.localeCompare(b.from));
        if(!existing.adoptedAt && item.adoptedAt) existing.adoptedAt = item.adoptedAt;
      });
      const knownEvents = new Map(state.history.map(item => [item.id,item]));
      incoming.history.forEach(item => {
        if(!knownEvents.has(item.id)){ state.history.push(clone(item)); knownEvents.set(item.id,item); }
        else if(!equal(knownEvents.get(item.id),item)) addConflict({type:"history",at:now(),detail:{incoming:clone(item)}});
      });
      if(incoming.activeId && incoming.activeId !== state.activeId){
        addConflict({type:"activeChoice",at:now(),detail:{localId:state.activeId,incomingId:incoming.activeId}});
      }
      if(incoming.baselineId && !state.baselineId) state.baselineId = incoming.baselineId;
      incoming.conflicts.forEach(item => { if(!state.conflicts.some(existing => equal(existing,item))) state.conflicts.push(clone(item)); });
      // Restoring never silently activates a model, including an empty device.
      history(state,"mergeBackup",{added,conflictCount:conflicts.length}); commit(scope,state);
      return {added,conflicts:clone(conflicts),activeId:state.activeId};
    }
    function resolveActiveConflict(index, approval){
      const scope = role(), state = load(scope).state, conflict = state.conflicts[index];
      if(!approval || approval.explicit !== true || !conflict || conflict.type !== "activeChoice" || conflict.resolvedAt) throw new Error("モデル選択の競合を確認してください");
      const id = approval.keepLocal ? state.activeId : conflict.detail.incomingId;
      if(id && id !== state.activeId){
        const target = load(scope).byId.get(id);
        select(id,{explicit:true},target.adoptedAt ? "rollback" : "adopt");
      }
      const next = clone(load(scope).state); next.conflicts[index].resolvedAt = now();
      history(next,"resolveActiveConflict",{selectedId:id}); commit(scope,next); return getActiveSnapshot();
    }
    return Object.freeze({initialBaseline,registerCandidate,adopt:(id,approval) => select(id,approval,"adopt"),
      rollback:(id,approval) => select(id,approval,"rollback"),getActiveSnapshot,getCandidateSnapshot,
      getState:() => clone(load().state),getGeneration:id => { const item = load().byId.get(id); return item ? clone(item) : null; },
      needsEvaluation:dataSignature => load().state.evaluation.dataSignature !== signature(dataSignature),recordEvaluation,setShadowMode,
      runWithFallback,getRuntimeStatus:() => clone(runtime.get(role()) || null),exportBackup:() => clone(load().state),mergeBackup,resolveActiveConflict,
      invalidate:() => {cache.delete(role());runtime.delete(role());} });
  }
  return Object.freeze({schemaVersion:1,storagePrefix:PREFIX,create});
});
