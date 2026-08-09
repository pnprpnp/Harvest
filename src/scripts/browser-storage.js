function createBrowserStorageGateway(storage, label){
  let lastError = null;

  function createOperationError(operation, key, cause){
    const storageError = new Error(
      `${label}の${operation}に失敗しました（保存項目: ${String(key || "不明")}）`
    );
    storageError.name = "HarvestnaviStorageError";
    storageError.operation = operation;
    storageError.storageKey = String(key || "");
    storageError.cause = cause;
    lastError = storageError;
    return storageError;
  }

  function execute(operation, key, callback){
    try{
      return callback();
    }catch(cause){
      throw createOperationError(operation, key, cause);
    }
  }

  function getItem(key){
    return execute("読み込み", key, () => storage.getItem(key));
  }

  function setItem(key, value){
    return execute("保存", key, () => storage.setItem(key, String(value)));
  }

  function removeItem(key){
    return execute("削除", key, () => storage.removeItem(key));
  }

  function readJson(key, fallbackValue){
    return execute("JSON読み込み", key, () => {
      const raw = storage.getItem(key);
      if(raw === null || typeof raw === "undefined") return fallbackValue;
      return JSON.parse(raw);
    });
  }

  function writeJson(key, value){
    return execute("JSON保存", key, () => storage.setItem(key, JSON.stringify(value)));
  }

  function snapshotItems(keys){
    const snapshot = {};
    [...new Set(Array.isArray(keys) ? keys : [])].forEach(key => {
      snapshot[key] = getItem(key);
    });
    return snapshot;
  }

  function restoreItems(snapshot, keys){
    const values = snapshot && typeof snapshot === "object" ? snapshot : {};
    const restoreKeys = Array.isArray(keys) ? keys : Object.keys(values);
    [...new Set(restoreKeys)].forEach(key => removeItem(key));
    Object.entries(values).forEach(([key, value]) => {
      if(value !== null && typeof value !== "undefined") setItem(key, value);
    });
  }

  return Object.freeze({
    getItem,
    setItem,
    removeItem,
    readJson,
    writeJson,
    snapshotItems,
    restoreItems,
    getLastError: () => lastError
  });
}

const harvestnaviLocalStorage = createBrowserStorageGateway(window.localStorage, "端末内保存");
const harvestnaviSessionStorage = createBrowserStorageGateway(window.sessionStorage, "一時保存");
