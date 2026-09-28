/* Settings are an explicit, independent step after immutable backup import.
 * The journal only admits the two growth settings keys; records and model
 * generations never belong to this transaction. */
(function(root,factory){
  const api=factory();
  if(typeof module === "object" && module.exports) module.exports=api;
  else root.HarvestGrowthRestoreSettings=api;
})(typeof globalThis !== "undefined" ? globalThis : this,function(){
  "use strict";
  const plain=value=>!!value && typeof value==="object" && !Array.isArray(value) && Object.getPrototypeOf(value)===Object.prototype;
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const parse=raw=>raw===null ? null : JSON.parse(raw);
  function create({storage,keys,getRole,normalizeLocation,normalizeAdjustments,ensureSafety=()=>{},now=()=>Date.now()}={}){
    let running=false;
    const names=[keys.location,keys.adjustments];
    const journalKey=role=>`harvestnaviGrowthSettingsRestore_v1:${role}`;
    const read=()=>Object.fromEntries(names.map(key=>[key,storage.getItem(key)]));
    function write(key,value){storage.setItem(key,value);if(storage.getItem(key)!==value) throw new Error("設定の読み戻しが一致しません");}
    function preview(input={}){
      const before=read(),current={location:normalizeLocation(parse(before[keys.location])),adjustments:normalizeAdjustments(parse(before[keys.adjustments]))};
      const warnings=[],location=normalizeLocation(input.incomingLocation);
      if(input.incomingLocation && !location) warnings.push("バックアップの地点形式が無効なため地点は取り込めません。");
      let adjustments=null;
      if(input.incomingAdjustments!==null && input.incomingAdjustments!==undefined){
        const value=input.incomingAdjustments;
        const valid=plain(value) && Object.keys(value).length>0 && Object.entries(value).every(([key,item])=>
          Object.prototype.hasOwnProperty.call(current.adjustments,key) && plain(item)
          && [item.temperature,item.light].every(setting=>["low","base","high"].includes(setting)));
        if(valid) adjustments=normalizeAdjustments({...current.adjustments,...value});
        else warnings.push("バックアップの号棟環境補正が無効なため補正は取り込めません。");
      }
      return {schemaVersion:1,role:getRole(),before,current,incoming:{location,adjustments},warnings,
        differences:{location:!!location && !equal(location,current.location),
          buildings:adjustments ? Object.keys(current.adjustments).filter(key=>!equal(current.adjustments[key],adjustments[key])) : []}};
    }
    function restoreBefore(journal){
      const failed=[];
      Object.entries(journal.before).forEach(([key,before])=>{
        try{
          const value=storage.getItem(key);
          if(value!==before && value!==journal.after[key]) throw new Error("設定に別の変更があります");
          if(value!==before){if(before===null) storage.removeItem(key);else write(key,before);}
          if(storage.getItem(key)!==before) throw new Error("設定を復旧できません");
        }catch(error){failed.push(key);}
      });
      return failed;
    }
    function readJournal(){
      const role=getRole(),key=journalKey(role),raw=storage.getItem(key);
      if(!raw) return null;
      const journal=JSON.parse(raw);
      if(journal.schemaVersion!==1 || journal.role!==role || !["prepared","committed"].includes(journal.phase)
        || !plain(journal.before) || !plain(journal.after) || !Object.keys(journal.before).length
        || Object.keys(journal.before).length!==Object.keys(journal.after).length
        || Object.entries(journal.before).some(([name,value])=>!names.includes(name) || value!==null && typeof value!=="string")
        || Object.entries(journal.after).some(([name,value])=>!Object.prototype.hasOwnProperty.call(journal.before,name) || typeof value!=="string")){
        throw new Error("設定復元の安全保存を確認できません");
      }
      return {journal,key};
    }
    function keepCurrent(approval){
      if(approval?.explicit!==true) throw new Error("現在設定を維持する選択が必要です");
      if(approval.role!==getRole() || !equal(approval.before,read())) throw new Error("設定が更新されました。現在設定を確認し直してください");
      const pending=readJournal();
      if(!pending) return {kept:false};
      storage.removeItem(pending.key);return {kept:true};
    }
    function recover(){
      const pending=readJournal();
      if(!pending) return {recovered:false};
      const {journal,key}=pending;
      if(journal.phase==="committed" && Object.entries(journal.after).every(([name,value])=>storage.getItem(name)===value)){
        storage.removeItem(key);return {recovered:false,completed:true};
      }
      const failed=restoreBefore(journal);
      if(failed.length){const error=new Error("設定に別の変更または保存障害があるため復旧を中止しました");error.failedKeys=failed;throw error;}
      storage.removeItem(key);return {recovered:true};
    }
    async function apply(plan,choices={}){
      if(running) throw new Error("設定の復元が進行中です");
      // Omitting a choice always means keeping the current value.
      const location=choices.location==="incoming",adjustments=choices.adjustments==="incoming";
      if(!location && !adjustments) return {applied:false,locationChanged:false,adjustmentsChanged:false};
      if(!plan || plan.schemaVersion!==1 || plan.role!==getRole() || !plain(plan.before)) throw new Error("利用者が変わりました。設定の差分を確認し直してください");
      if(location && !plan.incoming?.location || adjustments && !plan.incoming?.adjustments) throw new Error("取り込み可能な設定がありません");
      const check=preview({incomingLocation:plan.incoming.location,incomingAdjustments:plan.incoming.adjustments});
      if(!equal(plan.before,check.before) || !equal(plan.incoming,check.incoming)) throw new Error("設定が更新されました。差分を確認し直してください");
      const after={};
      if(location && check.differences.location) after[keys.location]=JSON.stringify(check.incoming.location);
      if(adjustments && check.differences.buildings.length) after[keys.adjustments]=JSON.stringify(check.incoming.adjustments);
      if(!Object.keys(after).length) return {applied:false,locationChanged:false,adjustmentsChanged:false};
      running=true;
      const role=getRole(),key=journalKey(role);let journal=null,committed=false;
      try{
        if(storage.getItem(key)) throw new Error("前回の設定復元の復旧を先に実行してください");
        await ensureSafety();
        if(getRole()!==role || !equal(read(),plan.before)) throw new Error("設定または利用者が更新されました。差分を確認し直してください");
        if(storage.getItem(key)) throw new Error("別の設定復元が開始されました");
        journal={schemaVersion:1,role,phase:"prepared",at:new Date(now()).toISOString(),
          before:Object.fromEntries(Object.keys(after).map(name=>[name,plan.before[name]])),after};
        write(key,JSON.stringify(journal));
        for(const [name,value] of Object.entries(after)){
          if(getRole()!==role || storage.getItem(name)!==journal.before[name]) throw new Error("設定に別の変更があります");
          write(name,value);
        }
        if(Object.entries(after).some(([name,value])=>storage.getItem(name)!==value)) throw new Error("設定に別の変更があります");
        journal.phase="committed";write(key,JSON.stringify(journal));committed=true;
        try{storage.removeItem(key);}catch(error){ /* Verified committed journal is safe to recover. */ }
        return {applied:true,locationChanged:Object.prototype.hasOwnProperty.call(after,keys.location),
          adjustmentsChanged:Object.prototype.hasOwnProperty.call(after,keys.adjustments)};
      }catch(cause){
        if(!journal || committed) throw cause;
        const failed=restoreBefore(journal);
        if(!failed.length) try{storage.removeItem(key);}catch(error){failed.push(key);}
        const error=new Error(failed.length ? "設定の復旧が必要です。別の変更がある設定は上書きしていません。" : "設定を保存できなかったため、変更前へ戻しました。");
        error.cause=cause;error.rollbackSucceeded=!failed.length;error.failedKeys=failed;throw error;
      }finally{running=false;}
    }
    return Object.freeze({preview,apply,recover,keepCurrent,journalKey});
  }
  return Object.freeze({schemaVersion:1,create});
});
