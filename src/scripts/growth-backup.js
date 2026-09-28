/* Growth-only restore transaction. Farm records are never replaced here.
 * Immutable IDB archives commit first. A failed local commit restores the exact
 * local bytes; imported archives remain available for an idempotent retry.
 */
(function(root,factory){
  const api=factory();
  if(typeof module === "object" && module.exports) module.exports=api;
  else root.HarvestGrowthBackup=api;
})(typeof globalThis !== "undefined" ? globalThis : this,function(){
  "use strict";
  const clone=value=>JSON.parse(JSON.stringify(value));
  function create({storage,history,observationFactory,modelFactory,getScope,getRole,
    ensureSafety,resolveTargetScope=(_payload,{scope})=>scope,invalidate=()=>{},now=()=>Date.now()}={}){
    let running=false;
    const journalKey=scope=>`harvestnaviGrowthRestore_v1:${scope}`;
    function write(key,value){storage.setItem(key,value);if(storage.getItem(key)!==value) throw new Error("復元内容の読み戻しが一致しません");}
    function restoreBefore(journal){
      const failed=[];
      Object.entries(journal.before).forEach(([key,before])=>{
        try{
          const value=storage.getItem(key);
          if(value!==before && value!==journal.after[key]) throw new Error("復元中に別の変更が保存されました");
          if(value!==before){if(before===null) storage.removeItem(key);else write(key,before);}
          if(storage.getItem(key)!==before) throw new Error("復旧の読み戻しが一致しません");
        }catch(error){failed.push(key);}
      });
      return failed;
    }
    function recover(){
      const scope=getScope(),key=journalKey(scope),raw=storage.getItem(key);
      if(!raw) return {recovered:false};
      const journal=JSON.parse(raw);
      const targetScope=journal.targetScope || scope;
      const validTarget=typeof targetScope==="string" && targetScope.startsWith(`${getRole()}:`)
        && targetScope.length<=500 && !targetScope.includes("\u0000");
      const allowed=[`harvestnaviGrowthObservations_v1:${getRole()}`,`harvestnaviGrowthModels_v1:${targetScope}`];
      const plain=value=>!!value && typeof value==="object" && !Array.isArray(value) && Object.getPrototypeOf(value)===Object.prototype;
      if(journal.schemaVersion!==1 || journal.scope!==scope || journal.role!==getRole() || !validTarget
        || !plain(journal.before) || !plain(journal.after) || !Object.keys(journal.before).length || !["prepared","committed"].includes(journal.phase)
        || Object.entries(journal.before).some(([name,value])=>!allowed.includes(name) || value!==null && typeof value!=="string")
        || Object.entries(journal.after).some(([name,value])=>!allowed.includes(name) || !Object.prototype.hasOwnProperty.call(journal.before,name)
          || typeof value!=="string")) throw new Error("復元処理の安全保存を確認できません");
      if(journal.phase==="committed" && Object.entries(journal.before).every(([name,value])=>
        storage.getItem(name)===(Object.prototype.hasOwnProperty.call(journal.after,name) ? journal.after[name] : value))){
        storage.removeItem(key);return {recovered:false,completed:true};
      }
      const failed=restoreBefore(journal);
      invalidate();
      if(failed.length){const error=new Error("別の変更または保存障害があるため自動復旧を中止しました");error.failedKeys=failed;throw error;}
      storage.removeItem(key);
      return {recovered:true,archivesRetained:true};
    }
    async function restore(payload){
      if(running) throw new Error("生育予測の復元が進行中です");
      running=true;
      let journal=null,archiveResult=null,committed=false;
      const scope=getScope(),role=getRole(),key=journalKey(scope);
      try{
        if(storage.getItem(key)) throw new Error("前回の復元処理の復旧を先に実行してください");
        if(payload?.app!=="Harvestnavi" || payload.type!=="growth-evaluation-backup" || payload.schemaVersion!==1
          || payload.restoration?.schemaVersion!==1 || !payload.restoration.history || !payload.restoration.observations
          || !payload.restoration.models) throw new Error("復元情報付きの生育予測バックアップが必要です");
        const incoming=clone(payload.restoration);
        // Changing the storage role must not relabel another site's weather as
        // the current site's input. The caller validates the source site; local
        // settings remain unchanged until a separate explicit selection.
        const targetScope=resolveTargetScope(payload,{scope,role});
        if(typeof targetScope!=="string" || !targetScope.startsWith(`${role}:`)
          || targetScope.length>500 || targetScope.includes("\u0000")) throw new Error("復元先の地点を確認できません");
        const sourceIds=new Set((incoming.history.rows || []).filter(row=>row.kind==="prediction").map(row=>row.id));
        const observationRows=[...(incoming.observations.observations || []),
          ...Object.values(incoming.observations.conflicts || {}).map(item=>item.server).filter(Boolean)];
        for(const row of observationRows){
          if(row.kind==="manualOffset" && !sourceIds.has(row.payload?.sourcePredictionId)) throw new Error("手動補正の元予測がバックアップにありません");
        }
        // Preflight all local schemas/merges without changing localStorage.
        const before={},after={};
        const overlay={
          getItem(name){if(!(name in before)) before[name]=storage.getItem(name);return name in after ? after[name] : before[name];},
          setItem(name,value){this.getItem(name);after[name]=String(value);},
          readJson(name,fallback){const value=this.getItem(name);return value===null ? fallback : JSON.parse(value);},
          writeJson(name,value){this.setItem(name,JSON.stringify(value));}
        };
        const stage=()=>({observations:observationFactory({storage:overlay,getRole:()=>role,now}),
          models:modelFactory({storage:overlay,getRole:()=>targetScope,now})});
        let staged=stage();
        staged.observations.mergeBackup(incoming.observations);
        staged.models.mergeBackup(incoming.models);
        await ensureSafety();
        if(getScope()!==scope || getRole()!==role) throw new Error("利用者または地点が切り替わったため復元を中止しました");
        if(storage.getItem(key)) throw new Error("別の復元処理が開始されました");
        for(const [name,value] of Object.entries(before)) if(storage.getItem(name)!==value) throw new Error("復元中に元データが更新されました");
        journal={schemaVersion:1,phase:"prepared",scope,targetScope,role,at:new Date(now()).toISOString(),before,after};
        write(key,JSON.stringify(journal));
        archiveResult=await history.mergeBackup(incoming.history,{sourceScope:payload.scope,targetScope});
        if(getScope()!==scope || getRole()!==role) throw new Error("利用者または地点が切り替わったため復元を中止しました");
        observationRows.forEach(row=>{if(row.kind==="manualOffset") row.payload.sourcePredictionId=archiveResult.idMap[row.payload.sourcePredictionId];});
        // Rebuild from original bytes after archive IDs have been mapped.
        Object.keys(after).forEach(name=>delete after[name]);
        staged=stage();
        const observations=staged.observations.mergeBackup(incoming.observations);
        const models=staged.models.mergeBackup(incoming.models);
        for(const [name,value] of Object.entries(before)) if(storage.getItem(name)!==value) throw new Error("復元中に元データが更新されました");
        write(key,JSON.stringify(journal));
        for(const [name,value] of Object.entries(after)) write(name,value);
        journal.phase="committed";write(key,JSON.stringify(journal));committed=true;
        invalidate();
        try{storage.removeItem(key);}catch(error){ /* Committed journal is safe to clear on recovery. */ }
        return {observations,models,history:archiveResult,activeUnchanged:true,targetScope,
          settings:{applied:false,incomingLocation:incoming.location || null,incomingAdjustments:incoming.adjustments || null}};
      }catch(cause){
        if(!journal || committed) throw cause;
        const failed=restoreBefore(journal);
        invalidate();
        if(!failed.length) try{storage.removeItem(key);}catch(error){failed.push(key);}
        const error=new Error(failed.length ? "復元を中止しました。安全保存からの復旧が必要です" : "復元を中止し、端末の記録・採用モデルを元に戻しました");
        error.cause=cause;error.rollbackSucceeded=!failed.length;error.failedKeys=failed;
        error.archivesRetained=!!archiveResult;throw error;
      }finally{running=false;}
    }
    return Object.freeze({restore,recover,journalKey});
  }
  return Object.freeze({schemaVersion:1,create});
});
