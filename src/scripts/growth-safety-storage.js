// Durable safety baselines have their own IndexedDB store, outside localStorage.
(function(root,factory){
  const api=factory(root);
  if(typeof module === "object" && module.exports) module.exports=api;
  else root.HarvestGrowthSafetyStorage=api;
})(typeof globalThis !== "undefined" ? globalThis : this,function(root){
  "use strict";
  function create({indexedDB=root.indexedDB,databaseName="harvestnaviGrowthSafety"}={}){
    let opening=null;
    function open(){
      if(opening) return opening;
      opening=new Promise((resolve,reject)=>{
        if(!indexedDB) return reject(new Error("この環境では変更前の記録を安全保存できません"));
        const request=indexedDB.open(databaseName,1);
        let failed=false;
        request.onupgradeneeded=()=>request.result.createObjectStore("snapshots");
        request.onsuccess=()=>{
          const db=request.result;
          if(failed){db.close();return;}
          db.onversionchange=()=>{db.close();opening=null;};
          resolve(db);
        };
        request.onerror=()=>{failed=true;reject(request.error);};
        request.onblocked=()=>{failed=true;reject(new Error("別の画面が安全保存を使用しています。開き直して再保存してください"));};
      }).catch(error=>{opening=null;throw error;});
      return opening;
    }
    async function transaction(key,mode,action){
      const db=await open();
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction("snapshots",mode),store=tx.objectStore("snapshots");
        const request=store.get(key);let result=null,failure=null;
        request.onsuccess=()=>{
          try{result=action(store,request.result ?? null);}
          catch(error){failure=error;tx.abort();}
        };
        // Request success is insufficient: wait for the durable transaction commit.
        tx.oncomplete=()=>resolve(result);
        tx.onabort=()=>reject(failure || tx.error || new Error("変更前の記録の安全保存に失敗しました"));
        tx.onerror=()=>{};
      });
    }
    return Object.freeze({
      getItem:key=>transaction(key,"readonly",(_store,text)=>text),
      addItem:(key,text)=>transaction(key,"readwrite",(store,existing)=>{
        if(existing !== null) return false;
        store.add(text,key);return true;
      }),
      removeItemIfMatches:(key,text)=>transaction(key,"readwrite",(store,existing)=>{
        if(existing !== text) return false;
        store.delete(key);return true;
      })
    });
  }
  return Object.freeze({create});
});
