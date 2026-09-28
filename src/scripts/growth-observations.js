(function(root, factory){
  const api = factory();
  if(typeof module === "object" && module.exports) module.exports = api;
  if(root) root.HarvestGrowthObservations = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(){
  "use strict";
  const PREFIX = "harvestnaviGrowthObservations_v1:";
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const clone = value => JSON.parse(JSON.stringify(value));
  const integer = value => Number.isSafeInteger(value) && value >= 0;
  function validDate(value){
    if(typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
  }
  function instant(value){
    if(typeof value !== "string" || value.length > 40) return NaN;
    const parts = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);
    return parts && validDate(parts[1]) && Number(parts[2]) < 24 && Number(parts[3]) < 60 && Number(parts[4]) < 60
      ? Date.parse(value) : NaN;
  }
  function japanDay(time){ return new Date(time + 9 * 3600000).toISOString().slice(0,10); }
  function keys(value){
    if(!Array.isArray(value) || !value.length || value.length > 3744) throw new Error("対象パレットを選択してください");
    if(value.some(key => typeof key !== "string" || !/^[2-9]-[A-F]-(?:[1-9]|[1-6][0-9]|7[0-8])$/.test(key))){
      throw new Error("対象パレットの形式が正しくありません");
    }
    return [...new Set(value)].sort((a,b) => a.localeCompare(b, "en", {numeric:true}));
  }
  const KINDS = ["ready","ec","condition","environment","manualOffset","fieldAssessment"];
  const SEVERITIES = ["unknown","none","low","high"];
  function text(value, label, limit, required = false){
    if(value === undefined && !required) return "";
    if(typeof value !== "string" || value.length > limit || value.includes("\u0000") || (required && !value.trim())) throw new Error(`${label}の形式が正しくありません`);
    return value;
  }
  function identity(row){
    return JSON.stringify([row.kind || "ready",row.plantingEventId,row.plantingDate,row.building,row.bed,
      row.date,row.startDate,row.palletKeys,row.createdAt]);
  }
  function content(row){
    const value = {...row};
    ["revision","syncedAt","createdAt","updatedAt"].forEach(key => delete value[key]);
    return JSON.stringify(value);
  }
  function create(options = {}){
    const storage = () => options.storage || (typeof harvestnaviLocalStorage !== "undefined" ? harvestnaviLocalStorage : null);
    const role = () => String(options.getRole ? options.getRole() : getActiveRecordsStorageKey());
    const now = () => options.now ? options.now() : Date.now();
    const uuid = () => options.uuid ? options.uuid() : crypto.randomUUID();
    const cache = new Map();
    let inFlight = null;
    function normalize(input){
      if(!input || typeof input !== "object" || Array.isArray(input)) throw new Error("生育確認記録の形式が正しくありません");
      const observationId = String(input.observationId || "").toLowerCase();
      if(!UUID.test(observationId)) throw new Error("生育確認記録のIDが正しくありません");
      const kind = input.kind === undefined ? "ready" : input.kind;
      if(!KINDS.includes(kind)) throw new Error("生育確認記録の種類が正しくありません");
      if(!Number.isFinite(instant(input.createdAt)) || !Number.isFinite(instant(input.updatedAt))
        || instant(input.updatedAt) < instant(input.createdAt)) throw new Error("生育確認記録の日時が正しくありません");
      if(input.deletedAt !== undefined && input.deletedAt !== "" && !Number.isFinite(instant(input.deletedAt))) throw new Error("生育確認記録の削除日時が正しくありません");
      if(!integer(input.revision)) throw new Error("生育確認記録の同期番号が正しくありません");
      const row = {observationId,kind};
      const cropKind = ["ready","manualOffset","fieldAssessment"].includes(kind);
      if(cropKind){
        if(!Number.isSafeInteger(input.plantingEventId) || input.plantingEventId <= 0) throw new Error("苗植え記録のIDが正しくありません");
        if(!validDate(input.plantingDate)) throw new Error("苗植え日が正しくありません");
        Object.assign(row,{plantingEventId:input.plantingEventId,plantingDate:input.plantingDate,palletKeys:keys(input.palletKeys)});
      }else{
        if(!Number.isInteger(input.building) || input.building < 2 || input.building > 9) throw new Error("号棟が正しくありません");
        const bed = input.bed === undefined ? "" : input.bed;
        if(typeof bed !== "string" || (bed !== "" && !/^[A-F]$/.test(bed))) throw new Error("ベッドが正しくありません");
        const palletKeys = input.palletKeys === undefined || (Array.isArray(input.palletKeys) && !input.palletKeys.length) ? [] : keys(input.palletKeys);
        if(palletKeys.some(key => Number(key.split("-")[0]) !== input.building || (bed && key.split("-")[1] !== bed))) throw new Error("対象パレットと号棟・ベッドが一致しません");
        Object.assign(row,{building:input.building,bed,palletKeys});
      }
      const dayField = kind === "ready" ? "readyDate" : (["condition","environment"].includes(kind) ? "startDate" : "date");
      const day = input[dayField];
      if(!validDate(day) || day > japanDay(now()) || (cropKind && day < row.plantingDate)) throw new Error("確認日は苗植え日以降、今日以前の実在する日付を入力してください");
      row[dayField] = day;
      if(["condition","environment"].includes(kind)){
        const endDate = input.endDate === undefined ? "" : input.endDate;
        if(endDate !== "" && (!validDate(endDate) || endDate < day)) throw new Error("終了日は開始日以降の日付を入力してください");
        row.endDate = endDate;
      }
      if(kind !== "ready"){
        const payload = input.payload;
        if(!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("生育確認の内容が正しくありません");
        const allowed = {
          ec:["value","unit","isAbnormal"], condition:["type","dataPolicy","note"],
          environment:["temperature","light","humidity","dataPolicy"],
          manualOffset:["days","sourcePredictionId"], fieldAssessment:["size","quality"]
        }[kind];
        if(Object.keys(payload).some(key => !allowed.includes(key))) throw new Error("生育確認に未対応の項目が含まれています");
        if(kind === "ec"){
          if(typeof payload.value !== "number" || !Number.isFinite(payload.value) || payload.value < 0 || payload.value > 50
            || payload.unit !== "mS/cm" || (payload.isAbnormal !== undefined && typeof payload.isAbnormal !== "boolean")) throw new Error("ECは0〜50 mS/cmの測定値を入力してください");
          row.payload = {value:payload.value,unit:"mS/cm"};
          if(payload.isAbnormal !== undefined) row.payload.isAbnormal = payload.isAbnormal;
        }else if(kind === "condition"){
          if(!["shadeChange","equipmentFailure","abnormalSeedlings","hydroponicTrouble","abnormalEc","other"].includes(payload.type)
            || (payload.dataPolicy !== undefined && payload.dataPolicy !== "exclude")) throw new Error("特殊条件の種類が正しくありません");
          row.payload = {type:payload.type,dataPolicy:"exclude",note:text(payload.note,"特殊条件のメモ",300)};
        }else if(kind === "environment"){
          if(["temperature","light","humidity"].some(key => !["high","low","base"].includes(payload[key]))
            || !["normal","downweight","exclude"].includes(payload.dataPolicy)) throw new Error("環境設定が正しくありません");
          row.payload = {temperature:payload.temperature,light:payload.light,humidity:payload.humidity,dataPolicy:payload.dataPolicy};
        }else if(kind === "manualOffset"){
          if(!Number.isInteger(payload.days) || payload.days < -30 || payload.days > 30) throw new Error("補正日数は−30〜30日の整数を入力してください");
          row.payload = {days:payload.days,sourcePredictionId:text(payload.sourcePredictionId,"元の予測ID",200,true)};
        }else{
          if(!["unknown","small","normal","large"].includes(payload.size)) throw new Error("現場の大きさ評価が正しくありません");
          const quality = payload.quality === undefined ? {} : payload.quality;
          if(!quality || typeof quality !== "object" || Array.isArray(quality)
            || Object.keys(quality).some(key => !["tipburn","elongated","uneven"].includes(key))) throw new Error("品質評価が正しくありません");
          const normalized = {};
          ["tipburn","elongated","uneven"].forEach(key => {
            const value = quality[key] === undefined ? "unknown" : quality[key];
            if(!SEVERITIES.includes(value)) throw new Error("品質評価は不明・なし・少し・多いから選択してください");
            normalized[key] = value;
          });
          row.payload = {size:payload.size,quality:normalized};
        }
      }
      Object.assign(row,{createdAt:new Date(instant(input.createdAt)).toISOString(),updatedAt:new Date(instant(input.updatedAt)).toISOString(),
        deletedAt:input.deletedAt ? new Date(instant(input.deletedAt)).toISOString() : "",revision:input.revision});
      if(input.syncedAt !== undefined){
        if(!Number.isFinite(instant(input.syncedAt))) throw new Error("生育確認記録の共有日時が正しくありません");
        row.syncedAt = new Date(instant(input.syncedAt)).toISOString();
      }
      return row;
    }

    function empty(){ return {schemaVersion:1, observations:[], pending:{}, conflicts:{}, cursor:0, localRevision:0}; }
    function validateState(value){
      if(!value || value.schemaVersion !== 1 || !Array.isArray(value.observations)
        || !integer(value.cursor) || !integer(value.localRevision ?? 0)) throw new Error("適期確認記録の保存形式を読み込めません");
      const state = { ...empty(), ...clone(value), observations:value.observations.map(normalize) };
      const ids = new Set(state.observations.map(row => row.observationId));
      if(ids.size !== state.observations.length) throw new Error("適期確認記録のIDが重複しています");
      for(const field of ["pending", "conflicts"]){
        if(!state[field] || typeof state[field] !== "object" || Array.isArray(state[field])) throw new Error("適期確認の送信状態を読み込めません");
        Object.keys(state[field]).forEach(id => { if(!ids.has(id)) throw new Error("適期確認の送信対象が見つかりません"); });
      }
      Object.values(state.pending).forEach(entry => {
        if(!entry || !integer(entry.baseRevision)) throw new Error("適期確認の送信番号が正しくありません");
      });
      Object.entries(state.conflicts).forEach(([id,entry]) => {
        if(!entry || typeof entry !== "object" || Array.isArray(entry) || !("server" in entry)) throw new Error("適期確認の競合状態が正しくありません");
        if(entry.server !== null){
          entry.server = normalize(entry.server);
          if(entry.server.observationId !== id) throw new Error("適期確認の競合IDが一致しません");
        }
      });
      return state;
    }
    function index(state){
      const byId = new Map(), byCrop = new Map();
      state.observations.forEach(row => {
        byId.set(row.observationId,row);
        const key = `${row.plantingEventId}:${row.plantingDate}`;
        if(!byCrop.has(key)) byCrop.set(key,[]);
        byCrop.get(key).push(row);
      });
      return {state, byId, byCrop};
    }
    function load(scope = role()){
      if(cache.has(scope)) return cache.get(scope);
      if(!storage()) throw new Error("適期確認を保存する機能が利用できません");
      const value = storage().readJson(PREFIX + scope, null);
      const entry = index(value === null ? empty() : validateState(value));
      cache.set(scope,entry);
      return entry;
    }
    function commit(scope, state){
      state.localRevision = load(scope).state.localRevision + 1;
      // A failed atomic storage write must leave both cached records and pending jobs untouched.
      storage().writeJson(PREFIX + scope,state);
      cache.set(scope,index(state));
    }
    function stamp(previous){ return new Date(Math.max(now(), (instant(previous) || 0) + 1)).toISOString(); }
    function save(input){
      const scope = role(), entry = load(scope);
      const id = input?.observationId ? String(input.observationId).toLowerCase() : uuid();
      const old = entry.byId.get(id);
      if(input?.observationId && !old) throw new Error("編集する適期確認記録が見つかりません");
      if(old?.deletedAt) throw new Error("削除済みの適期確認記録は編集できません");
      const updatedAt = stamp(old?.updatedAt);
      const row = normalize({...old,...input,observationId:id,createdAt:old?.createdAt || updatedAt,
        updatedAt,deletedAt:"",revision:old?.revision || 0});
      if(old && identity(old) !== identity(row)) throw new Error("編集では苗植え記録と対象パレットを変更できません");
      const state = clone(entry.state);
      const at = state.observations.findIndex(item => item.observationId === id);
      if(at < 0) state.observations.push(row); else state.observations[at] = row;
      state.pending[id] = state.pending[id] || {baseRevision:old?.revision || 0};
      commit(scope,state);
      return clone(row);
    }
    function remove(id){
      id = String(id).toLowerCase();
      const scope = role(), entry = load(scope), old = entry.byId.get(id);
      if(!old) throw new Error("削除する適期確認記録が見つかりません");
      if(old.deletedAt) return clone(old);
      const updatedAt = stamp(old.updatedAt);
      const row = {...old,updatedAt,deletedAt:updatedAt};
      const state = clone(entry.state);
      state.observations[state.observations.findIndex(item => item.observationId === id)] = row;
      state.pending[id] = state.pending[id] || {baseRevision:old.revision};
      commit(scope,state);
      return clone(row);
    }
    function list({includeDeleted = false, kind} = {}){
      return load().state.observations.filter(row => (includeDeleted || !row.deletedAt) && (kind === undefined || row.kind === kind)).map(clone);
    }
    function match({plantingEventId,plantingDate,palletKeys,asOf,kind = "ready"} = {}){
      if(!palletKeys?.length) return [];
      const selected = new Set(keys(palletKeys));
      const cutoff = asOf === undefined ? now() : (validDate(asOf) ? Date.parse(`${asOf}T23:59:59.999+09:00`) : Date.parse(asOf));
      if(!Number.isFinite(cutoff)) throw new Error("適期確認の基準日時が正しくありません");
      return (load().byCrop.get(`${plantingEventId}:${plantingDate}`) || []).filter(row => !row.deletedAt && row.kind === kind
        && instant(row.createdAt) <= cutoff && instant(row.updatedAt) <= cutoff && (row.readyDate || row.date) <= japanDay(cutoff)
        && row.palletKeys.some(key => selected.has(key))).map(clone);
    }
    function backup(){ return {...clone(load().state),role:role()}; }
    function mergeBackup(value){
      const incoming = validateState(value), scope = role(), entry = load(scope), state = clone(entry.state);
      let imported = 0, skipped = 0, conflictCount = 0;
      incoming.observations.forEach(row => {
        const old = entry.byId.get(row.observationId), id = row.observationId;
        if(old && identity(old) === identity(row) && content(old) === content(row)){ skipped++; return; }
        if(old && (identity(old) !== identity(row) || state.pending[id] || incoming.pending[id]
          || old.revision === row.revision)){
          state.conflicts[id] = {server:row,source:"backup",detectedAt:new Date(now()).toISOString()};
          conflictCount++;
          return;
        }
        if(old && row.revision < old.revision){ skipped++; return; }
        const at = state.observations.findIndex(item => item.observationId === id);
        const baseRevision = old?.revision ?? incoming.pending[id]?.baseRevision ?? row.revision;
        if(at < 0) state.observations.push(row); else state.observations[at] = row;
        state.pending[id] = {baseRevision};
        if(incoming.conflicts[id]) state.conflicts[id] = clone(incoming.conflicts[id]);
        imported++;
      });
      if(imported || conflictCount) commit(scope,state);
      return {imported,skipped,conflicts:conflictCount};
    }

    function conflicts(){ return Object.entries(load().state.conflicts).map(([observationId,value]) => ({observationId,...clone(value)})); }
    function resolveConflict(id, choice){
      if(!["local","server"].includes(choice)) throw new Error("残す適期確認記録を選択してください");
      const scope = role(), entry = load(scope), conflict = entry.state.conflicts[id];
      if(!conflict) throw new Error("適期確認の競合が見つかりません");
      const state = clone(entry.state), at = state.observations.findIndex(row => row.observationId === id);
      const local = state.observations[at];
      if(conflict.source === "backup"){
        // A backup is another local proposal, not proof that the server accepted it.
        if(choice === "server"){
          if(!conflict.server || identity(local) !== identity(conflict.server)) throw new Error("作や対象が異なる記録は置き換えられません。端末の記録を残してください");
          state.observations[at] = {...clone(conflict.server),revision:local.revision,updatedAt:stamp(local.updatedAt)};
          if(state.observations[at].deletedAt) state.observations[at].deletedAt = state.observations[at].updatedAt;
          state.pending[id] = {baseRevision:state.pending[id]?.baseRevision ?? local.revision};
        }
        delete state.conflicts[id];
        commit(scope,state);
        return clone(state.observations[at]);
      }
      if(choice === "server"){
        if(conflict.server) state.observations[at] = clone(conflict.server);
        else state.observations.splice(at,1);
        delete state.pending[id];
      }else{
        if(conflict.server && identity(local) !== identity(conflict.server)) throw new Error("共有済み記録の作や対象を変更できません。共有済みの記録を選択してください");
        state.observations[at].revision = conflict.server?.revision || 0;
        state.observations[at].updatedAt = stamp(state.observations[at].updatedAt);
        if(state.observations[at].deletedAt) state.observations[at].deletedAt = state.observations[at].updatedAt;
        state.pending[id] = {baseRevision:conflict.server?.revision || 0};
      }
      delete state.conflicts[id];
      commit(scope,state);
      return choice === "server" ? clone(conflict.server) : clone(state.observations[at]);
    }
    function validateResponse(result, sent, cursor){
      if(!result || result.ok !== true || result.protocolVersion !== 1){
        throw new Error(result?.protocolVersion !== 1 ? "連携先が適期確認の同期に未対応です。記録は端末に保存されています" : String(result.message || "適期確認を共有できませんでした"));
      }
      if(!Array.isArray(result.accepted) || !Array.isArray(result.conflicts) || !Array.isArray(result.rows)
        || !integer(result.nextCursor) || result.nextCursor < cursor || typeof result.hasMore !== "boolean"
        || (result.hasMore && result.nextCursor <= cursor)) throw new Error("適期確認の同期応答が正しくありません");
      const sentById = new Map(sent.map(row => [row.observationId,row])), handled = new Set();
      const accepted = result.accepted.map(item => {
        const original = sentById.get(item?.observationId), canonical = normalize(item?.observation);
        if(!original || handled.has(item.observationId) || item.clientUpdatedAt !== original.updatedAt
          || canonical.observationId !== original.observationId || identity(canonical) !== identity(original)
          || canonical.revision <= 0 || canonical.revision < original.baseRevision
          || content(canonical) !== content(normalize(original))) throw new Error("適期確認の送信結果が一致しません");
        handled.add(item.observationId);
        return {...item,observation:canonical};
      });
      const conflicts = result.conflicts.map(item => {
        if(!sentById.has(item?.observationId) || handled.has(item.observationId)) throw new Error("適期確認の競合応答が一致しません");
        handled.add(item.observationId);
        const server = item.server === null ? null : normalize(item.server);
        if(server && server.observationId !== item.observationId) throw new Error("適期確認の競合IDが一致しません");
        return {observationId:item.observationId,server};
      });
      if(handled.size !== sent.length) throw new Error("適期確認の送信結果が不足しています");
      const rows = result.rows.map(normalize);
      if(rows.some(row => row.revision <= 0 || row.revision > result.nextCursor)) throw new Error("適期確認の取得番号が正しくありません");
      return {...result,accepted,conflicts,rows};
    }
    function applyResponse(scope, result, sent){
      const current = load(scope), state = clone(current.state);
      const byId = new Map(state.observations.map(row => [row.observationId,row]));
      const sentById = new Map(sent.map(row => [row.observationId,row]));
      result.accepted.forEach(item => {
        const id = item.observationId, local = byId.get(id), original = sentById.get(id), remote = item.observation;
        if(local && local.updatedAt === original.updatedAt && content(local) === content(normalize(original)) && state.pending[id]){
          byId.set(id,remote); delete state.pending[id]; delete state.conflicts[id];
        }else if(local && state.pending[id] && remote.revision >= local.revision){
          // Keep a newer local edit/deletion while advancing its compare-and-swap base.
          local.revision = remote.revision;
          state.pending[id].baseRevision = remote.revision;
        }
      });
      result.conflicts.forEach(item => {
        if(byId.has(item.observationId)) state.conflicts[item.observationId] = {server:item.server,detectedAt:new Date(now()).toISOString()};
      });
      result.rows.forEach(remote => {
        const local = byId.get(remote.observationId);
        if(state.pending[remote.observationId] || state.conflicts[remote.observationId]) return;
        if(local && identity(local) !== identity(remote)){
          state.conflicts[remote.observationId] = {server:remote,detectedAt:new Date(now()).toISOString()};
          return;
        }
        if(!local || remote.revision > local.revision) byId.set(remote.observationId,remote);
      });
      state.observations = [...byId.values()];
      state.cursor = result.nextCursor;
      if(JSON.stringify(state) !== JSON.stringify(current.state)) commit(scope,state);
    }
    async function runSync(scope, settings){
      const config = settings.config || (options.getConfig ? options.getConfig() : (typeof loadGoogleSheetConfig === "function" ? loadGoogleSheetConfig() : null));
      if(!config?.url) throw new Error("Google連携設定が必要です。適期確認は端末に保存されています");
      let synced = 0, hasMore = false;
      // Snapshot pending work once. Edits made during this synchronization remain queued.
      const initial = load(scope), snapshots = initial.state.observations.filter(row => initial.state.pending[row.observationId]
        && !initial.state.conflicts[row.observationId]).map(row => ({...clone(row),baseRevision:initial.state.pending[row.observationId].baseRevision}));
      let offset = 0;
      for(let page = 0; page < 20; page++){
        const state = load(scope).state, mutations = [];
        let chars = 0;
        while(offset < snapshots.length && mutations.length < 50){
          const row = snapshots[offset], size = JSON.stringify(row).length;
          if(mutations.length && chars + size > 180000) break;
          mutations.push(row); chars += size; offset++;
        }
        const payload = {app:"Harvestnavi",action:"syncGrowthObservations",protocolVersion:1,token:config.token || "",mutations,cursor:state.cursor,limit:200};
        const Controller = options.AbortController || (typeof AbortController !== "undefined" ? AbortController : null);
        const controller = Controller ? new Controller() : null;
        const timeoutMs = Math.max(1, Math.min(120000, settings.timeoutMs || 25000));
        let timer;
        try{
          const fetcher = options.fetch || fetch;
          const operation = (async () => {
            const response = await fetcher(config.url,{method:"POST",mode:"cors",headers:{"Content-Type":"text/plain;charset=utf-8"},
              body:JSON.stringify(payload),signal:controller?.signal});
            if(response.ok === false) throw new Error(`適期確認の通信に失敗しました（HTTP ${response.status}）`);
            const text = await response.text();
            if(text.length > 2000000) throw new Error("適期確認の応答が大きすぎます");
            return JSON.parse(text);
          })();
          const timeout = new Promise((_,reject) => { timer = setTimeout(() => { controller?.abort(); reject(new Error("適期確認の通信がタイムアウトしました。未送信として保存されています")); },timeoutMs); });
          const result = validateResponse(await Promise.race([operation,timeout]),mutations,state.cursor);
          applyResponse(scope,result,mutations);
          synced += result.accepted.length;
          hasMore = result.hasMore;
        }finally{ clearTimeout(timer); }
        if(!hasMore && offset >= snapshots.length) break;
      }
      const state = load(scope).state;
      return {synced,pending:Object.keys(state.pending).length,conflicts:Object.keys(state.conflicts).length,cursor:state.cursor,hasMore:hasMore || offset < snapshots.length};
    }
    function sync(settings = {}){
      if(inFlight) return inFlight;
      const scope = role();
      inFlight = runSync(scope,settings).finally(() => { inFlight = null; });
      return inFlight;
    }
    return Object.freeze({schemaVersion:1,list,save,remove,match,sync,backup,mergeBackup,restore:mergeBackup,
      pendingCount:() => Object.keys(load().state.pending).length,pendingIds:() => Object.keys(load().state.pending),
      conflicts,resolveConflict,revision:() => load().state.localRevision,resetCache:() => cache.clear()});
  }
  return Object.freeze({...create(),create});
});
