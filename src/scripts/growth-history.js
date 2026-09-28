// Immutable local forecast/prediction journal. No farm records are sent externally.
// IndexedDB keeps growing history out of synchronous localStorage and startup reads.
const HarvestGrowthHistory = (() => {
  const schemaVersion = 1;
  const KINDS = ["weather","weather-input","model","prediction"];
  const PREDICTION_REFERENCES = {weatherId:"weather",weatherInputId:"weather-input",modelId:"model",shadowModelId:"model"};
  let opening = null;
  const copy = value => JSON.parse(JSON.stringify(value));
  function validScope(scope){
    if(typeof scope !== "string" || !scope || scope.length > 500 || scope.includes("\u0000")) throw new Error("予測履歴の保存先が正しくありません");
    return scope;
  }
  function validDay(value){
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      && Number.isFinite(Date.parse(value + "T00:00:00Z")) && new Date(value + "T00:00:00Z").toISOString().slice(0,10) === value;
  }
  function contentFor(entry){ return { schemaVersion, scope:entry.scope, kind:entry.kind, asOf:entry.asOf, payload:entry.payload }; }
  function assertJson(value, depth = 0){
    if(depth > 40) throw new Error("予測履歴の構造が深すぎます");
    if(value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) return;
    if(Array.isArray(value)){ value.forEach(item => assertJson(item,depth+1)); return; }
    if(!value || typeof value !== "object" || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) throw new Error("予測履歴はJSONで指定してください");
    Object.keys(value).forEach(key => {
      if(["__proto__","prototype","constructor"].includes(key)) throw new Error("予測履歴に使用できない項目があります");
      if(value[key] !== undefined) assertJson(value[key],depth+1);
    });
  }
  async function digest(entry){
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(contentFor(entry))));
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2,"0")).join("");
  }
  function normalizeContent(scope,kind,asOf,payload){
    validScope(scope);
    if(!KINDS.includes(kind) || !validDay(asOf)) throw new Error("予測履歴の種類・基準日が正しくありません");
    if(!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("予測履歴の内容がありません");
    assertJson(payload);
    if(kind === "prediction") Object.keys(PREDICTION_REFERENCES).forEach(key => {
      const id = payload[key];
      if(id !== undefined && id !== null && id !== "" && (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id))) throw new Error("予測履歴の参照IDが正しくありません");
    });
    return {schemaVersion,scope,kind,asOf,payload:copy(payload)};
  }
  async function normalizeEntry(value){
    if(!value || value.schemaVersion !== schemaVersion || typeof value.id !== "string" || !/^[a-f0-9]{64}$/.test(value.id)) throw new Error("予測履歴の版・IDが正しくありません");
    const row = normalizeContent(value.scope,value.kind,value.asOf,value.payload);
    const capture = typeof value.capturedAt === "string" && value.capturedAt.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);
    if(!capture || !validDay(capture[1]) || Number(capture[2]) > 23 || Number(capture[3]) > 59 || Number(capture[4]) > 59
      || !Number.isFinite(Date.parse(value.capturedAt))) throw new Error("予測履歴の保存日時が正しくありません");
    if(await digest(row) !== value.id) throw new Error("予測履歴のSHA256検証に失敗しました。元の履歴は変更していません");
    // Do not refresh capture time on import: it bounds what could have been known.
    return {id:value.id,...row,capturedAt:value.capturedAt};
  }
  function open(){
    if(opening) return opening;
    opening = new Promise((resolve, reject) => {
      if(typeof indexedDB === "undefined") return reject(new Error("この環境では予測履歴を保存できません"));
      const request = indexedDB.open("harvestnaviGrowthHistory", schemaVersion);
      request.onupgradeneeded = () => {
        const db = request.result;
        const entries = db.createObjectStore("entries", { keyPath:"id" });
        entries.createIndex("scopeKindDate", ["scope", "kind", "asOf"]);
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); opening = null; };
        resolve(db);
      };
      request.onerror = () => { opening = null; reject(request.error); };
      request.onblocked = () => { opening = null; reject(new Error("別の画面が予測履歴を使用しています。開き直して再保存してください")); };
    }).catch(error => { opening = null; throw error; });
    return opening;
  }
  async function save(scope, kind, asOf, payload){
    const row = normalizeContent(scope,kind,asOf,payload);
    const id = await digest(row);
    const db = await open();
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("entries", "readwrite");
      const entries = transaction.objectStore("entries");
      const request = entries.get(id);
      request.onsuccess = () => {
        // Opening the same prediction again must not alter its original capture time.
        if(!request.result) entries.add({ id, ...row, capturedAt:new Date().toISOString() });
      };
      transaction.oncomplete = () => resolve(id);
      transaction.onabort = () => reject(transaction.error || new Error("予測履歴を保存できませんでした"));
      transaction.onerror = () => {}; // The abort event reports failure after rollback.
    });
  }
  async function list(scope, kind, from = "0000-01-01", through = "9999-12-31"){
    validScope(scope);
    const db = await open();
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("entries", "readonly");
      const index = transaction.objectStore("entries").index("scopeKindDate");
      const request = index.getAll(IDBKeyRange.bound([scope, kind, from], [scope, kind, through]));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function get(id){
    if(typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id)) throw new Error("予測履歴IDの形式が正しくありません");
    const db = await open();
    return await new Promise((resolve,reject) => {
      const transaction = db.transaction("entries","readonly");
      const request = transaction.objectStore("entries").get(id);
      transaction.oncomplete = () => resolve(request.result || null);
      transaction.onabort = () => reject(transaction.error || new Error("予測履歴を読み込めませんでした"));
      transaction.onerror = () => {};
    });
  }
  async function backupScope(scope){
    validScope(scope); const db = await open();
    return await new Promise((resolve,reject) => {
      const transaction = db.transaction("entries","readonly");
      const request = transaction.objectStore("entries").index("scopeKindDate")
        .getAll(IDBKeyRange.bound([scope,"",""],[scope,"\uffff","\uffff"]));
      transaction.oncomplete = () => resolve({schemaVersion,scope,rows:request.result});
      transaction.onabort = () => reject(transaction.error || new Error("予測履歴を読み込めませんでした"));
      transaction.onerror = () => {};
    });
  }
  async function mergeBackup(input, options = {}){
    const values = Array.isArray(input) ? input : input?.schemaVersion === schemaVersion ? input.rows : null;
    if(!Array.isArray(values)) throw new Error("予測履歴のバックアップ形式が正しくありません");
    // Hash work must finish before opening a transaction; awaiting it within an
    // IDB transaction would allow Safari to close the transaction prematurely.
    const validated = [];
    for(let index=0; index<values.length; index+=32){
      validated.push(...await Promise.all(values.slice(index,index+32).map(normalizeEntry)));
    }
    const sources = [...new Set(validated.map(row => row.scope))];
    const remapping = options.targetScope !== undefined;
    if(remapping){
      validScope(options.targetScope);
      if(sources.length > 1 || options.sourceScope !== undefined && sources.some(scope => scope !== options.sourceScope)) throw new Error("保存先の変更は1つの元保存先を明示して実行してください");
    }
    const idMap = {}, prepared = [], originals = new Map(validated.map(row => [row.id,row]));
    // All referenced objects precede predictions, independently of backup order.
    for(const kind of KINDS){
      for(const original of validated.filter(row => row.kind === kind)){
        const row = copy(original);
        if(remapping && row.scope !== options.targetScope){
          row.scope = options.targetScope;
          if(kind === "prediction") Object.entries(PREDICTION_REFERENCES).forEach(([key,expectedKind]) => {
            const referenceId = row.payload[key];
            if(referenceId === undefined || referenceId === null || referenceId === "") return;
            const referenced = originals.get(referenceId);
            if(!referenced || !idMap[referenceId] || referenced.kind !== expectedKind || referenced.scope !== original.scope){
              throw new Error("保存先を変更するには対応する気象・モデルの履歴も必要です（" + key + "）");
            }
            row.payload[key] = idMap[referenceId];
          });
          row.id = await digest(row);
        }
        idMap[original.id] = row.id; prepared.push(row);
      }
    }
    const byId = new Map();
    for(const row of prepared){
      const previous = byId.get(row.id);
      if(previous && (previous.capturedAt !== row.capturedAt || JSON.stringify(contentFor(previous)) !== JSON.stringify(contentFor(row)))) throw new Error("同じ予測履歴IDに異なる内容または保存日時があります");
      byId.set(row.id,row);
    }
    const db = await open();
    return await new Promise((resolve,reject) => {
      const transaction = db.transaction("entries","readwrite"), entries = transaction.objectStore("entries");
      let added = 0, existing = 0, conflict = null;
      for(const row of byId.values()){
        const request = entries.get(row.id);
        request.onsuccess = () => {
          if(conflict) return;
          if(request.result){
            const prior = request.result;
            if(prior.capturedAt !== row.capturedAt || JSON.stringify(contentFor(prior)) !== JSON.stringify(contentFor(row))){
              conflict = new Error("同じ予測履歴IDが競合しています。既存の保存日時・内容は上書きしていません");
              transaction.abort(); return;
            }
            existing++;
          }else { entries.add(row); added++; }
        };
      }
      transaction.oncomplete = () => resolve({added,existing,remapped:remapping && sources.some(scope => scope !== options.targetScope),idMap});
      transaction.onabort = () => reject(conflict || transaction.error || new Error("予測履歴の復元に失敗しました。元の履歴は変更していません"));
      transaction.onerror = () => {};
    });
  }
  return Object.freeze({ schemaVersion, save, list, get, backupScope, mergeBackup });
})();
