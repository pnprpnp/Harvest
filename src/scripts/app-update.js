(() => {
  const VERSION_STORAGE_KEY = "harvestnaviAppSourceVersion_v1";
  const UPDATED_NOTICE_KEY = "harvestnaviAppUpdatedNotice_v1";
  const VERSION_QUERY_KEY = "__hnv";
  const CHECK_QUERY_KEY = "__hncheck";
  const VERSION_MANIFEST_PATH = "version.json";
  const APP_VERSION_PATTERN = /^[a-z0-9_-]{8,80}$/;
  const VERSION_MANIFEST_MAX_LENGTH = 4096;
  const SERVICE_WORKER_MESSAGE_TIMEOUT_MS = 45000;
  let updateCheckPromise = null;
  let loadedSourceVersionPromise = null;
  let serviceWorkerRegistrationPromise = null;

  function ensureAppServiceWorker(){
    if(!("serviceWorker" in navigator)){
      return Promise.reject(new Error("この端末では固定更新を利用できません"));
    }
    if(!serviceWorkerRegistrationPromise){
      serviceWorkerRegistrationPromise = navigator.serviceWorker
        .register("./sw.js", { scope: "./", updateViaCache: "none" })
        .then(() => navigator.serviceWorker.ready)
        .catch(error => {
          serviceWorkerRegistrationPromise = null;
          throw error;
        });
    }
    return serviceWorkerRegistrationPromise;
  }

  async function sendServiceWorkerCommand(type, payload = {}){
    const registration = await ensureAppServiceWorker();
    const worker = registration.active || navigator.serviceWorker.controller;
    if(!worker) throw new Error("固定更新の準備が完了していません");

    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => reject(new Error("固定更新の処理がタイムアウトしました")), SERVICE_WORKER_MESSAGE_TIMEOUT_MS);
      channel.port1.onmessage = event => {
        clearTimeout(timer);
        const result = event.data || {};
        if(result.ok === true) resolve(result);
        else reject(new Error(result.message || "固定更新を完了できませんでした"));
      };
      worker.postMessage({ type, ...payload }, [channel.port2]);
    });
  }

  function getCanonicalAppUrl(){
    const url = new URL(window.location.href);
    url.hash = "";
    url.searchParams.delete(VERSION_QUERY_KEY);
    url.searchParams.delete(CHECK_QUERY_KEY);
    return url;
  }

  async function getSourceVersion(source){
    if(window.crypto?.subtle && typeof TextEncoder !== "undefined"){
      const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
      return Array.from(new Uint8Array(digest))
        .slice(0, 12)
        .map(value => value.toString(16).padStart(2, "0"))
        .join("");
    }

    let first = 2166136261;
    let second = 5381;
    for(let index = 0; index < source.length; index++){
      const code = source.charCodeAt(index);
      first = Math.imul(first ^ code, 16777619);
      second = Math.imul(second, 33) ^ code;
    }
    return `${source.length.toString(36)}-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
  }

  function normalizeAppSource(source){
    const text = String(source || "");
    if(typeof DOMParser !== "undefined"){
      try{
        const parsed = new DOMParser().parseFromString(text, "text/html");
        if(parsed?.documentElement) return parsed.documentElement.outerHTML;
      }catch(e){}
    }
    return text.replace(/^\s*<!doctype[^>]*>\s*/i, "").trim();
  }

  function getComparableSourceVersion(source){
    return getSourceVersion(normalizeAppSource(source));
  }

  function normalizeDeclaredAppVersion(value){
    const version = String(value || "").trim().toLowerCase();
    return APP_VERSION_PATTERN.test(version) ? version : "";
  }

  function getDeclaredAppVersionFromDocument(root){
    return normalizeDeclaredAppVersion(
      root?.querySelector?.('meta[name="harvestnavi-version"]')?.getAttribute("content")
    );
  }

  function getDeclaredAppVersionFromSource(source){
    if(typeof DOMParser === "undefined") return "";
    try{
      return getDeclaredAppVersionFromDocument(
        new DOMParser().parseFromString(String(source || ""), "text/html")
      );
    }catch(e){
      return "";
    }
  }

  function captureLoadedSourceVersion(){
    const declaredVersion = getDeclaredAppVersionFromDocument(document);
    if(declaredVersion){
      loadedSourceVersionPromise = Promise.resolve(declaredVersion);
      return;
    }
    loadedSourceVersionPromise = getComparableSourceVersion(document.documentElement?.outerHTML || "");
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", captureLoadedSourceVersion, { once: true });
  }else{
    captureLoadedSourceVersion();
  }

  function openAppVersion(version, notice = "updated"){
    const target = getCanonicalAppUrl();
    target.searchParams.set(VERSION_QUERY_KEY, version);
    try{
      sessionStorage.setItem(UPDATED_NOTICE_KEY, notice);
    }catch(e){}
    window.location.replace(target.toString());
  }

  async function downloadAppUpdateSource(version){
    const expectedVersion = normalizeDeclaredAppVersion(version);
    if(!expectedVersion) throw new Error("更新するバージョンが正しくありません");
    const sourceUrl = getCanonicalAppUrl();
    sourceUrl.searchParams.set(CHECK_QUERY_KEY, "source-" + Date.now());
    const response = await fetch(sourceUrl.toString(), {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Cache-Control": "no-cache" }
    });
    if(!response.ok) throw new Error("最新版の内容を取得できませんでした");
    const source = await response.text();
    const declaredVersion = getDeclaredAppVersionFromSource(source);
    if(declaredVersion !== expectedVersion){
      throw new Error("最新版の確認結果が一致しません。少し待ってから再確認してください");
    }
    return source;
  }

  async function applyAppUpdate(version, indexSource = ""){
    const nextVersion = String(version || "").trim();
    if(!nextVersion) throw new Error("更新するバージョンが見つかりません");
    const source = String(indexSource || "") || await downloadAppUpdateSource(nextVersion);
    if(!source) throw new Error("最新版の内容が見つかりません");
    const verifiedVersion = getDeclaredAppVersionFromSource(source)
      || await getComparableSourceVersion(source);
    if(verifiedVersion !== nextVersion) throw new Error("最新版の確認結果が一致しません");
    await sendServiceWorkerCommand("HARVESTNAVI_STAGE_UPDATE", {
      version: nextVersion,
      indexSource: source
    });
    try{
      localStorage.setItem(VERSION_STORAGE_KEY, nextVersion);
    }catch(e){}
    openAppVersion(nextVersion);
  }

  async function rollbackAppUpdate(){
    const result = await sendServiceWorkerCommand("HARVESTNAVI_ROLLBACK");
    const previousVersion = String(result?.meta?.activeVersion || "").trim();
    if(!previousVersion) throw new Error("戻すバージョンを確認できません");
    try{
      localStorage.setItem(VERSION_STORAGE_KEY, previousVersion);
    }catch(e){}
    openAppVersion(previousVersion, "rollback");
  }

  async function getAppCacheState(){
    const result = await sendServiceWorkerCommand("HARVESTNAVI_GET_CACHE_STATE");
    return result?.meta || null;
  }

  async function checkForAppUpdate(){
    const now = Date.now();
    if(updateCheckPromise) return updateCheckPromise;

    updateCheckPromise = (async () => {
      const checkUrl = new URL(VERSION_MANIFEST_PATH, getCanonicalAppUrl());
      checkUrl.searchParams.set(CHECK_QUERY_KEY, String(now));
      const response = await fetch(checkUrl.toString(), {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Cache-Control": "no-cache" }
      });
      if(!response.ok) throw new Error("最新版の情報を取得できませんでした");

      const manifestText = await response.text();
      if(!manifestText || manifestText.length > VERSION_MANIFEST_MAX_LENGTH){
        throw new Error("最新版の情報が正しくありません");
      }
      let manifest = null;
      try{
        manifest = JSON.parse(manifestText);
      }catch(e){
        throw new Error("最新版の情報を読み込めませんでした");
      }
      const latestVersion = normalizeDeclaredAppVersion(manifest?.version);
      if(!latestVersion) throw new Error("最新版のバージョンが正しくありません");
      let loadedVersion = "";
      try{
        loadedVersion = await loadedSourceVersionPromise || "";
      }catch(e){}
      const urlVersion = new URL(window.location.href).searchParams.get(VERSION_QUERY_KEY) || "";
      let savedVersion = "";
      try{
        savedVersion = localStorage.getItem(VERSION_STORAGE_KEY) || "";
      }catch(e){}
      const currentVersion = loadedVersion || urlVersion || savedVersion;

      return {
        updateAvailable: !currentVersion || currentVersion !== latestVersion,
        latestVersion
      };
    })().catch(error => {
      console.warn("アプリの更新確認に失敗しました", error);
      throw error;
    }).finally(() => {
      updateCheckPromise = null;
    });

    return updateCheckPromise;
  }

  window.checkHarvestnaviAppUpdate = checkForAppUpdate;
  window.applyHarvestnaviAppUpdate = applyAppUpdate;
  window.rollbackHarvestnaviAppUpdate = rollbackAppUpdate;
  window.getHarvestnaviAppCacheState = getAppCacheState;
  window.recoverHarvestnaviPreviousVersion = async button => {
    const status = button?.nextElementSibling;
    if(button) button.disabled = true;
    if(status) status.textContent = "前の安定版に戻しています...";
    try{
      await rollbackAppUpdate();
    }catch(e){
      if(button) button.disabled = false;
      if(status) status.textContent = "戻せませんでした: " + String(e?.message || e);
    }
  };
  ensureAppServiceWorker().catch(error => {
    console.warn("Service Worker registration failed", error);
  });
})();
