(function(root, factory){
  const compression = typeof module === "object" && module.exports
    ? require("./vendor/lz-string-1.5.0.min.js")
    : root?.LZString;
  const api = factory(compression);
  if(typeof module === "object" && module.exports) module.exports = api;
  if(root) root.HarvestGrowthSafety = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(compression){
  "use strict";
  const PREFIX = "harvestnaviGrowthSafety_v1:";
  const COMPRESSED_ENCODING = "lz-string-utf16-v1", COMPRESSION_THRESHOLD = 64 * 1024;
  const verified = new WeakMap(), running = new WeakMap();
  const copy = value => JSON.parse(JSON.stringify(value));
  const own = (value,key) => Object.prototype.hasOwnProperty.call(value,key);
  function canonical(value){
    if(value === null) return "null";
    if(Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if(typeof value === "object") return `{${Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
    if(typeof value === "number" && !Number.isFinite(value)) throw new Error("安全確認の対象に不正な数値があります");
    const text = JSON.stringify(value);
    if(text === undefined) throw new Error("安全確認の対象に保存できない値があります");
    return text;
  }
  // Diagnostic fingerprints, not a signature. Write/rollback verification always
  // compares the complete original strings as well; it never relies on a hash alone.
  function fingerprint(value){
    const text = canonical(value); let first = 2166136261, second = 2246822519;
    for(let i=0;i<text.length;i++){
      first = Math.imul(first ^ text.charCodeAt(i),16777619);
      second = Math.imul(second ^ text.charCodeAt(i),3266489917);
    }
    return `${text.length}:${(first >>> 0).toString(16)}:${(second >>> 0).toString(16)}`;
  }
  function storageKey(scope){
    if(typeof scope !== "string" || !scope || scope.includes("\0")) throw new Error("安全保存の利用者区分が正しくありません");
    return PREFIX + scope;
  }
  function normalizeKeys(scope, value){
    if(!value || typeof value !== "object" || Array.isArray(value)) throw new Error("安全保存の保存先指定が必要です");
    const keys = {};
    for(const field of ["records","plantingEvents","settings"]){
      if(typeof value[field] !== "string" || !value[field] || value[field].includes("\0")) throw new Error("安全保存の保存先指定が正しくありません");
      keys[field] = value[field];
    }
    const extra = value.extra === undefined ? [] : value.extra;
    if(!Array.isArray(extra) || extra.some(key => typeof key !== "string" || !key || key.includes("\0"))) throw new Error("安全保存の追加保存先が正しくありません");
    keys.extra = [...new Set(extra)].sort();
    const all = [...Object.values(keys).slice(0,3),...keys.extra];
    if(new Set(all).size !== all.length || all.includes(storageKey(scope))) throw new Error("安全保存の保存先が重複しています");
    return keys;
  }
  function allKeys(keys){ return [keys.records,keys.plantingEvents,keys.settings,...keys.extra]; }
  function capture(storage, keys){
    return Object.fromEntries(allKeys(keys).map(key => {
      const value = storage.getItem(key);
      if(value !== null && typeof value !== "string") throw new Error("端末の保存値をそのまま読み取れません");
      return [key,value];
    }));
  }
  function parse(value, fallback){ return value === null ? fallback : JSON.parse(value); }
  function rawState(raw, keys){
    return {records:parse(raw[keys.records],[]),plantingEvents:parse(raw[keys.plantingEvents],[]),settings:parse(raw[keys.settings],null)};
  }
  function expand(items){
    if(items === undefined || items === null) return [];
    if(!Array.isArray(items)) throw new Error("パレット情報の形式が正しくありません");
    const found = new Set();
    items.forEach(item => {
      const parts = typeof item === "string" ? item.trim().split("-") : null;
      if(parts && ![3,4].includes(parts.length)) throw new Error("パレット情報を安全に確認できません");
      const building = Number(parts ? parts[0] : item?.building), bed = String(parts ? parts[1] : item?.bed);
      const start = Number(parts ? parts[2] : item?.number ?? item?.start);
      const end = Number(parts ? parts[3] ?? parts[2] : item?.number ?? item?.end);
      if(!Number.isInteger(building) || building < 2 || building > 9 || !/^[A-F]$/.test(bed)
        || !Number.isInteger(start) || !Number.isInteger(end) || Math.min(start,end) < 1 || Math.max(start,end) > 78){
        throw new Error("パレット情報を安全に確認できません");
      }
      for(let n=Math.min(start,end);n<=Math.max(start,end);n++) found.add(`${building}-${bed}-${n}`);
    });
    return [...found].sort();
  }
  function palletKeys(row, planting = false){
    return expand([...(row[planting ? "plantingPalletKeys" : "palletKeys"] || []),...(row[planting ? "plantingRanges" : "palletRanges"] || [])]);
  }
  function number(value){
    const result = value === undefined || value === "" || value === null ? 0 : Number(value);
    if(!Number.isFinite(result)) throw new Error("記録の数量を安全に確認できません");
    return result;
  }
  function identity(value,label){
    if(!Number.isSafeInteger(Number(value)) || Number(value) <= 0) throw new Error(`${label}のIDを安全に確認できません`);
    return String(value);
  }
  function evidence(data){
    if(!data || !Array.isArray(data.records) || !Array.isArray(data.plantingEvents)
      || (data.settings !== null && (typeof data.settings !== "object" || Array.isArray(data.settings)))) throw new Error("記録・苗植え・設定の安全確認ができません");
    const records = data.records.map(row => {
      if(!row || typeof row !== "object" || Array.isArray(row)) throw new Error("記録を安全に確認できません");
      const partial = row.type === "partialHarvest";
      if(row.type !== undefined && !["fullHarvest","partialHarvest"].includes(row.type)) throw new Error("記録の種類を安全に確認できません");
      const targets = partial ? (row.targets || []).map(target => ({palletKeys:expand([target]),plantsPerPallet:number(target.plantsPerPallet)})) : [];
      if(partial && !Array.isArray(row.targets)) throw new Error("部分収穫の対象を安全に確認できません");
      targets.sort((a,b) => canonical(a).localeCompare(canonical(b)));
      return {id:identity(row.id,"収穫記録"),uuid:String(row.recordUuid || ""),type:partial ? "partialHarvest" : "fullHarvest",
        date:String(row.date || ""),cases:number(row.cases),palletKeys:partial ? [] : palletKeys(row),targets,
        plantingDate:String(row.plantingDate || ""),plantingPalletKeys:partial ? [] : palletKeys(row,true)};
    }).sort((a,b) => a.id.localeCompare(b.id));
    const planting = data.plantingEvents.map(row => {
      if(!row || typeof row !== "object" || Array.isArray(row)) throw new Error("苗植え記録を安全に確認できません");
      const allocations = (row.sourceAllocations || []).map(item => ({harvestRecordId:identity(item.harvestRecordId,"苗植え元記録"),palletKeys:expand([...(item.palletKeys || []),...(item.palletRanges || [])])}));
      allocations.sort((a,b) => a.harvestRecordId.localeCompare(b.harvestRecordId));
      const direct = palletKeys(row,true);
      return {id:identity(row.eventId,"苗植え記録"),date:String(row.plantingDate || ""),palletKeys:direct.length ? direct : [...new Set(allocations.flatMap(item => item.palletKeys))].sort(),
        actualSeedlingTrayCount:number(row.actualSeedlingTrayCount),sourceAllocations:allocations};
    }).sort((a,b) => a.id.localeCompare(b.id));
    if(new Set(records.map(row => row.id)).size !== records.length || new Set(planting.map(row => row.id)).size !== planting.length) throw new Error("記録IDが重複しているため安全確認できません");
    return {records,planting,settings:data.settings};
  }
  function inventoryFromEvidence(value){
    const partial = value.records.filter(row => row.type === "partialHarvest");
    const pallets = value.records.map(row => [row.id,row.palletKeys,row.plantingPalletKeys,row.targets]);
    return {recordCount:value.records.length,fullHarvestCount:value.records.length-partial.length,partialHarvestCount:partial.length,plantingEventCount:value.planting.length,
      harvestPalletCount:value.records.reduce((total,row) => total+row.palletKeys.length,0),
      partialPalletCount:partial.reduce((total,row) => total+row.targets.reduce((n,target) => n+target.palletKeys.length,0),0),
      plantingPalletCount:value.planting.reduce((total,row) => total+row.palletKeys.length,0),
      recordsFingerprint:fingerprint(value.records),partialFingerprint:fingerprint(partial),plantingFingerprint:fingerprint(value.planting),
      palletsFingerprint:fingerprint(pallets),settingsFingerprint:fingerprint(value.settings)};
  }
  function inventory(data){ return inventoryFromEvidence(evidence(data)); }
  function assertSameHistory(raw, memory){
    if(canonical(raw.records) !== canonical(memory.records) || canonical(raw.planting) !== canonical(memory.planting)){
      throw new Error("保存済み記録と画面上の記録の件数・数量・パレット対応が一致しません。変更前の状態を維持しました");
    }
  }
  function validateSnapshot(value, scope){
    if(!value || value.schemaVersion !== 1 || value.scope !== scope || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) throw new Error("変更前の安全保存を検証できません");
    const keys = normalizeKeys(scope,value.keys);
    if(!value.raw || typeof value.raw !== "object" || Array.isArray(value.raw)
      || canonical(Object.keys(value.raw).sort()) !== canonical(allKeys(keys).sort())
      || Object.values(value.raw).some(item => item !== null && typeof item !== "string")) throw new Error("安全保存の元データが不足しています");
    const rawEvidence = evidence(rawState(value.raw,keys));
    if(canonical(inventoryFromEvidence(rawEvidence)) !== canonical(value.rawInventory)
      || fingerprint(value.raw) !== value.rawFingerprint) throw new Error("安全保存の元データと確認値が一致しません");
    // The memory baseline includes normalized settings as well as raw settings;
    // app defaults must not be mistaken for a migration or silently overwrite raw data.
    const memoryEvidence = evidence(value.memory);
    assertSameHistory(rawEvidence,memoryEvidence);
    if(canonical(inventoryFromEvidence(memoryEvidence)) !== canonical(value.memoryInventory)) throw new Error("安全保存の画面上データと確認値が一致しません");
    return value;
  }
  function encodeSnapshot(snapshot){
    const text = JSON.stringify(snapshot);
    if(text.length < COMPRESSION_THRESHOLD) return text;
    if(typeof compression?.compressToUTF16 !== "function" || typeof compression?.decompressFromUTF16 !== "function"){
      throw new Error("安全保存の圧縮処理を読み込めませんでした");
    }
    const payload = compression.compressToUTF16(text);
    // 元の保存文字列と画面上の全項目を、欠落なく復元できることを確認する。
    if(compression.decompressFromUTF16(payload) !== text) throw new Error("安全保存の圧縮内容を確認できません");
    const encoded = JSON.stringify({schemaVersion:1,encoding:COMPRESSED_ENCODING,originalLength:text.length,payload});
    return encoded.length < text.length ? encoded : text;
  }
  function decodeSnapshot(text,scope){
    const value = JSON.parse(text);
    if(value?.encoding === undefined) return validateSnapshot(value,scope);
    if(value.schemaVersion !== 1 || value.encoding !== COMPRESSED_ENCODING
      || !Number.isSafeInteger(value.originalLength) || value.originalLength <= 0
      || typeof value.payload !== "string" || typeof compression?.decompressFromUTF16 !== "function"){
      throw new Error("安全保存の圧縮形式を検証できません");
    }
    const decoded = compression.decompressFromUTF16(value.payload);
    if(typeof decoded !== "string" || decoded.length !== value.originalLength) throw new Error("安全保存の圧縮データを読み戻せません");
    return validateSnapshot(JSON.parse(decoded),scope);
  }
  function readSnapshot(storage,scope){
    const text = storage.getItem(storageKey(scope));
    return text === null ? null : copy(decodeSnapshot(text,scope));
  }
  function summary(snapshot,created){
    return {created,key:storageKey(snapshot.scope),schemaVersion:1,createdAt:snapshot.createdAt,
      rawInventory:copy(snapshot.rawInventory),memoryInventory:copy(snapshot.memoryInventory)};
  }
  function ensureSnapshot(storage,scope,inputKeys,data){
    const key = storageKey(scope), keys = normalizeKeys(scope,inputKeys), existing = storage.getItem(key);
    if(existing !== null){
      let memo = verified.get(storage)?.get(scope);
      if(!memo || memo.text !== existing){
        const snapshot = decodeSnapshot(existing,scope);
        memo = {text:existing,snapshot};
        if(!verified.has(storage)) verified.set(storage,new Map());
        verified.get(storage).set(scope,memo);
      }
      if(canonical(memo.snapshot.keys) !== canonical(keys)) throw new Error("安全保存の対象が変わっています。元の安全保存は保持しました");
      return summary(memo.snapshot,false);
    }
    const raw = capture(storage,keys), memory = copy({records:data.records,plantingEvents:data.plantingEvents,settings:data.settings});
    const rawEvidence = evidence(rawState(raw,keys)), memoryEvidence = evidence(memory);
    assertSameHistory(rawEvidence,memoryEvidence);
    const snapshot = {schemaVersion:1,scope,createdAt:new Date(typeof data.now === "function" ? data.now() : data.now ?? Date.now()).toISOString(),keys,raw,memory,
      rawInventory:inventoryFromEvidence(rawEvidence),memoryInventory:inventoryFromEvidence(memoryEvidence),rawFingerprint:fingerprint(raw)};
    const text = encodeSnapshot(snapshot);
    storage.setItem(key,text);
    if(storage.getItem(key) !== text) throw new Error("変更前の安全保存を読み戻せません。元の記録は変更していません");
    decodeSnapshot(text,scope);
    if(canonical(capture(storage,keys)) !== canonical(raw)){
      // Another writer changed source data while the snapshot was saved. Never
      // replace that writer's work or claim this snapshot is a current baseline.
      if(storage.getItem(key) === text) storage.removeItem(key);
      throw new Error("安全保存中に元の記録が更新されました。もう一度操作してください");
    }
    if(!verified.has(storage)) verified.set(storage,new Map());
    verified.get(storage).set(scope,{text,snapshot});
    return summary(snapshot,true);
  }
  function verifyPreserved(before,after,key,path,allowChange){
    if(canonical(before) === canonical(after)) return;
    if(allowChange?.({key,path:path.slice(),before:copy(before),after:after === undefined ? undefined : copy(after)})) return;
    if(before && after && typeof before === "object" && typeof after === "object" && Array.isArray(before) === Array.isArray(after)){
      if(Array.isArray(before) && before.length !== after.length) throw new Error("移行によって記録件数が変わりました");
      for(const field of Object.keys(before)){
        if(!own(after,field)) throw new Error("移行によって既存の記録項目が失われました");
        verifyPreserved(before[field],after[field],key,[...path,field],allowChange);
      }
      return;
    }
    throw new Error("移行によって許可されていない既存値が変わりました");
  }
  async function restoreRaw(storage,raw){
    const failures = [];
    for(const [key,value] of Object.entries(raw)){
      try{
        if(storage.getItem(key) === value) continue;
        if(value === null) storage.removeItem(key); else storage.setItem(key,value);
      }catch(error){ /* Check the final bytes below, including writes that threw after completion. */ }
    }
    for(const [key,value] of Object.entries(raw)){
      try{ if(storage.getItem(key) !== value) failures.push({key,error:new Error("読み戻し不一致")}); }
      catch(error){ failures.push({key,error}); }
    }
    return failures;
  }
  async function runMigration(storage,scope,inputKeys,options){
    if(!options || ["getState","apply","restoreState"].some(key => typeof options[key] !== "function")) throw new Error("移行前後の状態取得・復元処理が必要です");
    if(running.get(storage)?.has(scope)) throw new Error("同じ利用者の安全確認が進行中です");
    if(!running.has(storage)) running.set(storage,new Set());
    running.get(storage).add(scope);
    let beforeRaw, beforeMemory, keys;
    try{
      keys = normalizeKeys(scope,inputKeys);
      beforeMemory = copy(options.getState());
      ensureSnapshot(storage,scope,keys,beforeMemory);
      beforeRaw = capture(storage,keys);
      const beforeRawData = rawState(beforeRaw,keys);
      assertSameHistory(evidence(beforeRawData),evidence(beforeMemory));
      const result = await options.apply();
      const afterRaw = capture(storage,keys), afterMemory = copy(options.getState());
      const afterRawData = rawState(afterRaw,keys);
      // Full structural preservation supplements the count/fingerprint audit.
      for(const key of allKeys(keys)){
        if(beforeRaw[key] !== null && beforeRaw[key] !== afterRaw[key]){
          if(afterRaw[key] === null) throw new Error("移行によって保存項目が失われました");
          verifyPreserved(JSON.parse(beforeRaw[key]),JSON.parse(afterRaw[key]),key,[],options.allowChange);
        }
      }
      verifyPreserved(beforeMemory,afterMemory,"memory",[],options.allowChange);
      assertSameHistory(evidence(beforeRawData),evidence(afterRawData));
      assertSameHistory(evidence(beforeMemory),evidence(afterMemory));
      assertSameHistory(evidence(afterRawData),evidence(afterMemory));
      if(canonical(beforeRawData.settings) !== canonical(afterRawData.settings)
        || canonical(beforeMemory.settings) !== canonical(afterMemory.settings)) throw new Error("移行によって栽培設定が変わりました");
      return {result,verified:true,before:inventory(beforeMemory),after:inventory(afterMemory)};
    }catch(cause){
      if(!beforeRaw) throw cause;
      await restoreRaw(storage,beforeRaw);
      const failures = [];
      try{ await options.restoreState(copy(beforeMemory)); }
      catch(error){ failures.push({key:"memory",error}); }
      // Application restoration may invalidate caches or redraw components that
      // persist derived state. Restore original bytes again after that callback.
      failures.push(...await restoreRaw(storage,beforeRaw));
      try{ if(canonical(options.getState()) !== canonical(beforeMemory)) failures.push({key:"memory",error:new Error("復元後の状態不一致")}); }
      catch(error){ failures.push({key:"memory",error}); }
      const error = new Error(failures.length ? "移行を中止しましたが、変更前の状態への復元を確認できません。安全保存からの復旧が必要です" : "移行を中止し、変更前の状態へ戻しました");
      error.cause = cause; error.rollbackSucceeded = !failures.length; error.failedKeys = [...new Set(failures.map(item => item.key))];
      throw error;
    }finally{ running.get(storage).delete(scope); }
  }
  function resetCache(storage,scope){
    if(storage && scope !== undefined) verified.get(storage)?.delete(scope);
    else if(storage) verified.delete(storage);
  }
  return Object.freeze({schemaVersion:1,storageKey,rollbackKeys:scope=>[storageKey(scope)],inventory,ensureSnapshot,readSnapshot,runMigration,resetCache});
});
