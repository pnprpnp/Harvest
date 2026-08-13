function loadGoogleSheetConfig(){
  try{
    const parsed = harvestnaviLocalStorage.readJson(GOOGLE_SHEET_CONFIG_KEY, null);
    if(!parsed) return { url: "", token: "" };
    return {
      url: String(parsed.url || "").trim(),
      token: String(parsed.token || "").trim()
    };
  }catch(e){
    return { url: "", token: "" };
  }
}

function validateGoogleSheetConfig(config){
  const normalized = {
    url: String(config?.url || "").trim(),
    token: String(config?.token || "").trim()
  };

  if(!normalized.url && !normalized.token){
    return { ok: false, config: normalized, message: "Google連携URLと連携トークンを設定してください" };
  }
  if(!normalized.url){
    return { ok: false, config: normalized, message: "Google連携URLを設定してください" };
  }
  if(!normalized.token){
    return { ok: false, config: normalized, message: "Google連携トークンを設定してください" };
  }
  if(normalized.token.length < 32){
    return { ok: false, config: normalized, message: "Google連携トークンは32文字以上で設定してください" };
  }
  if(normalized.url.length > 2048){
    return { ok: false, config: normalized, message: "Google連携URLが長すぎます" };
  }
  if(normalized.token.length > 512){
    return { ok: false, config: normalized, message: "Google連携トークンが長すぎます" };
  }

  try{
    const parsedUrl = new URL(normalized.url);
    if(parsedUrl.protocol !== "https:"){
      return { ok: false, config: normalized, message: "Google連携URLには https のURLを設定してください" };
    }
    const isAppsScriptWebAppUrl = parsedUrl.hostname === "script.google.com"
      && !parsedUrl.username
      && !parsedUrl.password
      && !parsedUrl.port
      && /^\/(?:a\/[^/]+\/)?macros\/s\/[A-Za-z0-9_-]+\/exec\/?$/.test(parsedUrl.pathname);
    if(!isAppsScriptWebAppUrl){
      return { ok: false, config: normalized, message: "Google連携URLには Apps ScriptのWebアプリURL（/execで終わるURL）を設定してください" };
    }
  }catch(e){
    return { ok: false, config: normalized, message: "Google連携URLの形式が正しくありません" };
  }

  return { ok: true, config: normalized, message: "" };
}

function getValidatedGoogleSheetConfig(options = {}){
  const validation = validateGoogleSheetConfig(options.config || loadGoogleSheetConfig());
  if(validation.ok) return validation.config;

  if(typeof options.statusSetter === "function"){
    options.statusSetter(validation.message + "。");
  }
  if(!options.silent){
    if(options.showImportError){
      showRecordImportError(validation.message, options.errorTitle || "Google連携設定が必要です");
    }else{
      showToast(validation.message);
    }
  }
  return null;
}

function buildValidatedGoogleSheetRequestBody(payload){
  const text = JSON.stringify(payload);
  if(!isWithinGoogleSheetTextLimits(text)){
    throw new Error("送信内容が大きすぎます。記録を分けて送信してください");
  }
  return text;
}

async function fetchGoogleSheetReadRequest(url, options){
  try{
    return await fetch(url, options);
  }catch(firstError){
    if(firstError?.name === "AbortError" || options?.signal?.aborted) throw firstError;
    await new Promise(resolve => setTimeout(resolve, 500));
    try{
      return await fetch(url, options);
    }catch(secondError){
      if(secondError?.name === "AbortError" || options?.signal?.aborted) throw secondError;
      throw new Error(
        "Apps Scriptに接続できませんでした。通信状態とGoogle連携URLを確認し、Webアプリを再デプロイした直後は少し待ってから再試行してください"
      );
    }
  }
}

function getUtf8ByteLength(text){
  const value = String(text || "");
  return typeof TextEncoder === "function"
    ? new TextEncoder().encode(value).length
    : unescape(encodeURIComponent(value)).length;
}

function isWithinGoogleSheetTextLimits(text){
  const value = String(text || "");
  return value.length <= GOOGLE_SHEET_MAX_REQUEST_CHARS
    && getUtf8ByteLength(value) <= GOOGLE_SHEET_MAX_REQUEST_BYTES;
}

function isWithinGoogleSheetResponseLimits(text){
  const value = String(text || "");
  return value.length <= GOOGLE_SHEET_MAX_RESPONSE_CHARS
    && getUtf8ByteLength(value) <= GOOGLE_SHEET_MAX_RESPONSE_BYTES;
}

function isBoundedTextValue(value, maxLength){
  if(typeof value === "symbol") return false;
  const text = String(value ?? "");
  return text.length <= maxLength && !text.includes("\u0000");
}

function hasBoundedJsonLength(value, maxLength){
  try{
    const text = JSON.stringify(value);
    return typeof text === "string" && text.length <= maxLength;
  }catch(e){
    return false;
  }
}

function isStrictDateOnlyString(value){
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if(year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

function getFiniteNumberInRange(value, min, max){
  if(value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function getStrictDecimalInRange(value, min, max){
  if(typeof value === "number") return Number.isFinite(value) && value >= min && value <= max ? value : null;
  if(typeof value !== "string") return null;
  const text = value.trim();
  if(!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function getStrictIntegerInRange(value, min, max){
  if(typeof value === "number"){
    return Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
  }
  if(typeof value !== "string") return null;
  const text = value.trim();
  if(!/^\d+$/.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
}

function getSafePositiveRecordId(value){
  return getStrictIntegerInRange(value, 1, RECORD_MAX_ID);
}

function getHarvestRecordIdentity(value){
  return {
    recordUuid: normalizeRecordUuid(value?.recordUuid),
    id: getSafePositiveRecordId(value?.id)
  };
}

function getHarvestRecordIdentityKey(value){
  const identity = getHarvestRecordIdentity(value);
  if(identity.recordUuid) return "uuid:" + identity.recordUuid;
  return identity.id === null ? "" : "id:" + identity.id;
}

function findHarvestRecordByIdentity(identity, sourceRecords = records){
  const normalizedIdentity = getHarvestRecordIdentity(identity);
  const candidates = Array.isArray(sourceRecords) ? sourceRecords : [];
  if(normalizedIdentity.recordUuid){
    return candidates.find(record => (
      normalizeRecordUuid(record?.recordUuid) === normalizedIdentity.recordUuid
    )) || null;
  }
  if(normalizedIdentity.id === null) return null;
  return candidates.find(record => (
    getSafePositiveRecordId(record?.id) === normalizedIdentity.id
  )) || null;
}

function saveGoogleSheetConfigToStorage(config){
  const previousUrl = String(loadGoogleSheetConfig().url || "").trim();
  const nextUrl = String(config?.url || "").trim();
  if(previousUrl && previousUrl !== nextUrl){
    harvestnaviLocalStorage.removeItem(GOOGLE_SHEET_SYNC_REVISION_KEY);
  }
  harvestnaviLocalStorage.writeJson(GOOGLE_SHEET_CONFIG_KEY, {
    url: nextUrl,
    token: String(config?.token || "").trim()
  });
}

function normalizeGoogleSheetSyncCursor(value){
  if(value === undefined || value === null || value === "") return null;
  if(typeof value === "string"){
    const text = value.trim();
    return text && text.length <= 2000 && !text.includes("\u0000") ? text : null;
  }
  if(!value || typeof value !== "object" || Array.isArray(value)
    || !hasBoundedJsonLength(value, 2000)) return null;
  return JSON.parse(JSON.stringify(value));
}

function normalizeGoogleSheetPlantingSyncCursor(value){
  const normalized = normalizeGoogleSheetSyncCursor(value);
  if(!normalized || typeof normalized !== "object") return null;
  const updatedAt = String(normalized.updatedAt || "").trim();
  const eventId = getSafePositiveRecordId(normalized.eventId);
  if(!updatedAt || !Number.isFinite(new Date(updatedAt).getTime()) || eventId === null) return null;
  return { updatedAt, eventId };
}

function normalizeGoogleSheetSyncRevision(value){
  return getStrictIntegerInRange(value, 0, Number.MAX_SAFE_INTEGER);
}

function loadGoogleSheetSyncRevision(config){
  try{
    const parsed = harvestnaviLocalStorage.readJson(GOOGLE_SHEET_SYNC_REVISION_KEY, null);
    if(!parsed || String(parsed.url || "").trim() !== String(config?.url || "").trim()) return null;
    return normalizeGoogleSheetSyncRevision(parsed.revision);
  }catch(e){
    return null;
  }
}

function saveGoogleSheetSyncRevision(config, revision){
  const normalized = normalizeGoogleSheetSyncRevision(revision);
  if(normalized === null){
    harvestnaviLocalStorage.removeItem(GOOGLE_SHEET_SYNC_REVISION_KEY);
    return;
  }
  harvestnaviLocalStorage.writeJson(GOOGLE_SHEET_SYNC_REVISION_KEY, {
    url: String(config?.url || "").trim(),
    revision: normalized
  });
}

function getGoogleSheetMutationSyncRevision(config){
  return loadGoogleSheetSyncRevision(config);
}

function acknowledgeGoogleSheetMutationRevision(config, requestedRevision, result){
  const sentRevision = normalizeGoogleSheetSyncRevision(requestedRevision);
  const currentLocalRevision = loadGoogleSheetSyncRevision(config);
  const previousRemoteRevision = normalizeGoogleSheetSyncRevision(result?.previousSyncRevision);
  const nextRemoteRevision = normalizeGoogleSheetSyncRevision(result?.syncRevision);
  if(sentRevision === null || currentLocalRevision !== sentRevision
    || previousRemoteRevision === null || nextRemoteRevision === null
    || previousRemoteRevision !== sentRevision || nextRemoteRevision < previousRemoteRevision){
    if(sentRevision !== null && previousRemoteRevision !== null
      && previousRemoteRevision !== sentRevision){
      setRecordSyncAvailabilityNotice(true);
    }
    return false;
  }
  saveGoogleSheetSyncRevision(config, nextRemoteRevision);
  setRecordSyncAvailabilityNotice(false);
  return true;
}

function populateGoogleSheetConfigForm(){
  const config = loadGoogleSheetConfig();
  const validation = validateGoogleSheetConfig(config);
  const urlInput = document.getElementById("googleSheetUrlInput");
  const tokenInput = document.getElementById("googleSheetTokenInput");
  const details = document.getElementById("googleSheetConfigDetails");
  if(urlInput) urlInput.value = config.url;
  if(tokenInput) tokenInput.value = config.token;
  if(details) details.open = !validation.ok;
}

function readGoogleSheetConfigForm(){
  return {
    url: String(document.getElementById("googleSheetUrlInput")?.value || "").trim(),
    token: String(document.getElementById("googleSheetTokenInput")?.value || "").trim()
  };
}

function saveGoogleSheetConfig(){
  if(!ensureGoogleSheetLocalMutationAllowed("Google連携設定を保存")) return;
  const config = readGoogleSheetConfigForm();
  const validation = validateGoogleSheetConfig(config);
  if(!validation.ok){
    const details = document.getElementById("googleSheetConfigDetails");
    if(details) details.open = true;
    showToast(validation.message);
    return;
  }
  saveGoogleSheetConfigToStorage(validation.config);
  populateGoogleSheetConfigForm();
  updateGoogleSheetResendButtonState();
  if(isMonitorModeOpen){
    startMonitorRemoteUpdates();
  }
  showToast("Google連携設定を保存しました");
}

function loadGoogleSheetSyncStatus(){
  try{
    const parsed = harvestnaviLocalStorage.readJson(GOOGLE_SHEET_SYNC_STATUS_KEY, null);
    if(!parsed) return {};
    return parsed && typeof parsed === "object" ? parsed : {};
  }catch(e){
    return {};
  }
}

function saveGoogleSheetSyncStatus(status){
  harvestnaviLocalStorage.writeJson(GOOGLE_SHEET_SYNC_STATUS_KEY, status || {});
}

function getGoogleSheetRecordSyncKeys(record){
  if(!record || typeof record !== "object") return [];

  const keys = [];
  const recordUuid = getHarvestRecordIdentity(record).recordUuid;
  const id = String(record.id || "").trim();
  const duplicateKey = String(getRecordDuplicateKey(record) || record.duplicateKey || "").trim();

  if(recordUuid) keys.push("uuid:" + recordUuid);
  if(id) keys.push("id:" + id);
  if(duplicateKey) keys.push("key:" + duplicateKey);

  return [...new Set(keys)];
}

function getGoogleSheetRecordSyncState(record, status = loadGoogleSheetSyncStatus()){
  for(const key of getGoogleSheetRecordSyncKeys(record)){
    const state = String(status[key]?.state || "");
    if(state) return state;
  }
  return "";
}

function hasPendingGoogleSheetRecordChange(record, status = loadGoogleSheetSyncStatus()){
  return ["edited", "failed", "pending", "conflict", "remoteDeleted"].includes(
    getGoogleSheetRecordSyncState(record, status)
  );
}

function clearGoogleSheetRecordSyncStatus(status, record){
  getGoogleSheetRecordSyncKeys(record).forEach(key => delete status[key]);
}

function setGoogleSheetSyncStatus(record, state){
  const keys = getGoogleSheetRecordSyncKeys(record);
  if(!keys.length) return;
  const status = loadGoogleSheetSyncStatus();
  const updatedAt = new Date().toISOString();
  keys.forEach(key => {
    status[key] = {
      state,
      updatedAt
    };
  });
  saveGoogleSheetSyncStatus(status);
  updateGoogleSheetResendButtonState();
}

function markGoogleSheetRecordsSynced(recordsToMark, state = "confirmed"){
  if(!Array.isArray(recordsToMark) || !recordsToMark.length) return;
  const status = loadGoogleSheetSyncStatus();
  const updatedAt = new Date().toISOString();

  recordsToMark.forEach(record => {
    getGoogleSheetRecordSyncKeys(record).forEach(key => {
      status[key] = {
        state,
        updatedAt
      };
    });
  });

  saveGoogleSheetSyncStatus(status);
}

function isGoogleSheetRecordUnsent(record, status){
  const isUnsentState = state => !["confirmed", "unconfirmed", "dependencyConflict"].includes(state);
  const recordUuid = normalizeRecordUuid(record?.recordUuid);
  const uuidState = recordUuid ? String(status["uuid:" + recordUuid]?.state || "") : "";
  if(uuidState) return isUnsentState(uuidState);
  const id = String(record?.id || "").trim();
  const idState = id ? String(status["id:" + id]?.state || "") : "";
  if(idState) return isUnsentState(idState);

  const duplicateKey = String(getRecordDuplicateKey(record) || record?.duplicateKey || "").trim();
  const contentState = duplicateKey ? String(status["key:" + duplicateKey]?.state || "") : "";
  if(contentState) return isUnsentState(contentState);

  return true;
}

function getGoogleSheetUnsentRecords(){
  const config = getValidatedGoogleSheetConfig({ silent: true });
  if(!config) return [];

  const status = loadGoogleSheetSyncStatus();
  return records.filter(record => (
    isGoogleSheetRecordUnsent(record, status)
    && !hasSyncConflictForEntity("record", record)
  ));
}

function getGoogleSheetOperationBusyMessage(action = "操作"){
  if(googleSheetSendState === "syncing"){
    return `記録の同期完了後に${action}してください`;
  }
  if(googleSheetSendState === "confirming"){
    return `送信確認の完了後に${action}してください`;
  }
  return `記録の送信完了後に${action}してください`;
}

function updateGoogleSheetOperationControls(){
  updateGoogleSheetResendButtonState();
  const busy = googleSheetSendState !== "idle";
  const syncing = googleSheetSendState === "syncing";
  const headerButton = document.getElementById("headerRecordSyncBtn");
  if(headerButton){
    headerButton.disabled = busy;
    headerButton.classList.toggle("is-loading", syncing);
    headerButton.setAttribute("aria-busy", syncing ? "true" : "false");
    headerButton.setAttribute("aria-label", syncing
      ? "スプレッドシートから最新の記録を読み込み中"
      : (headerButton.classList.contains("hasAvailabilityNotice")
        ? "未受信の記録があります。スプレッドシートから最新の記録を読み込む"
        : "スプレッドシートから最新の記録を読み込む"));
  }
  const importButton = document.getElementById("googleSheetImportBtn");
  if(importButton){
    importButton.disabled = busy;
    importButton.textContent = syncing ? "読み込み中..." : "スプレッドシートから読み込む";
  }
  const configSaveButton = document.getElementById("googleSheetConfigSaveBtn");
  if(configSaveButton) configSaveButton.disabled = busy;
}

function beginGoogleSheetOperation(nextState){
  if(googleSheetSendState !== "idle" || googleSheetOperationOwner) return null;
  const owner = { id: ++googleSheetOperationSequence };
  googleSheetOperationOwner = owner;
  googleSheetSendState = nextState;
  updateGoogleSheetOperationControls();
  return owner;
}

function changeGoogleSheetOperationState(owner, nextState){
  if(!owner || owner !== googleSheetOperationOwner) return false;
  googleSheetSendState = nextState;
  updateGoogleSheetOperationControls();
  return true;
}

function endGoogleSheetOperation(owner){
  if(!owner || owner !== googleSheetOperationOwner) return false;
  googleSheetOperationOwner = null;
  googleSheetSendState = "idle";
  updateGoogleSheetOperationControls();
  if(!googleSheetBackgroundSendRunning) scheduleGoogleSheetBackgroundSend();
  return true;
}

function ensureGoogleSheetLocalMutationAllowed(action, options = {}){
  if(googleSheetSendState === "idle" && !googleSheetOperationOwner) return true;
  if(options.allowBackgroundSend
    && googleSheetBackgroundSendRunning
    && googleSheetSendState === "sending"){
    return true;
  }
  showToast(getGoogleSheetOperationBusyMessage(action));
  return false;
}

function getGoogleSheetBackgroundRecordKey(record){
  return getHarvestRecordIdentityKey(record);
}

function findGoogleSheetBackgroundRecord(job){
  if(!job) return null;
  return findHarvestRecordByIdentity(
    { recordUuid: job.recordUuid, id: job.recordId },
    records
  );
}

function queueGoogleSheetRecordSend(record, options = {}){
  const key = getGoogleSheetBackgroundRecordKey(record);
  if(!key) return false;
  if(hasSyncConflictForEntity("record", record)){
    setGoogleSheetSyncStatus(record, "conflict");
    return false;
  }
  const validation = validateGoogleSheetConfig(loadGoogleSheetConfig());
  if(!validation.ok){
    setGoogleSheetSyncStatus(record, "failed");
    return false;
  }
  const job = {
    recordUuid: normalizeRecordUuid(record?.recordUuid),
    recordId: getSafePositiveRecordId(record?.id),
    successMessage: String(options.successMessage || ""),
    failureMessage: String(options.failureMessage || "記録は端末内に保存されています。スプレッドシートは未送信です")
  };
  setGoogleSheetSyncStatus(record, "edited");
  googleSheetBackgroundRecordQueue.set(key, job);
  scheduleGoogleSheetBackgroundSend();
  return true;
}

function queueGoogleSheetPlantingEventSend(event, options = {}){
  const eventId = getSafePositiveRecordId(event?.eventId);
  if(eventId === null) return false;
  if(hasSyncConflictForEntity("planting", event)){
    setPlantingEventSyncStatus(event, "conflict");
    return false;
  }
  const validation = validateGoogleSheetConfig(loadGoogleSheetConfig());
  if(!validation.ok){
    setPlantingEventSyncStatus(event, "failed");
    return false;
  }
  const job = {
    eventId,
    successMessage: String(options.successMessage || ""),
    failureMessage: String(options.failureMessage || "苗植え記録は端末内に保存されています。スプレッドシートは未送信です"),
    showFailureDetails: options.showFailureDetails !== false
  };
  setPlantingEventSyncStatus(event, "edited");
  googleSheetBackgroundPlantingQueue.set(String(eventId), job);
  scheduleGoogleSheetBackgroundSend();
  return true;
}

function scheduleGoogleSheetBackgroundSend(delay = 0){
  if(googleSheetBackgroundSendRunning || googleSheetBackgroundSendTimer !== null) return;
  if(!googleSheetBackgroundRecordQueue.size && !googleSheetBackgroundPlantingQueue.size) return;
  googleSheetBackgroundSendTimer = setTimeout(() => {
    googleSheetBackgroundSendTimer = null;
    runGoogleSheetBackgroundSendQueue().catch(error => {
      console.error("Background Google Sheet send failed", error);
    });
  }, Math.max(0, Number(delay) || 0));
}

async function runGoogleSheetBackgroundSendQueue(){
  if(googleSheetBackgroundSendRunning) return;
  if(googleSheetSendState !== "idle" || googleSheetOperationOwner) return;
  googleSheetBackgroundSendRunning = true;

  try{
    while(googleSheetSendState === "idle" && !googleSheetOperationOwner){
      const recordEntry = googleSheetBackgroundRecordQueue.entries().next();
      if(!recordEntry.done){
        const [key, job] = recordEntry.value;
        const record = findGoogleSheetBackgroundRecord(job);
        if(!record){
          if(googleSheetBackgroundRecordQueue.get(key) === job){
            googleSheetBackgroundRecordQueue.delete(key);
          }
          continue;
        }
        const sent = await sendRecordToGoogleSheet(record);
        const isCurrentJob = googleSheetBackgroundRecordQueue.get(key) === job;
        if(isCurrentJob){
          googleSheetBackgroundRecordQueue.delete(key);
          if(sent){
            if(job.successMessage) showToast(job.successMessage);
          }else if(job.failureMessage){
            showToast(job.failureMessage);
          }
        }
        continue;
      }

      const plantingEntry = googleSheetBackgroundPlantingQueue.entries().next();
      if(plantingEntry.done) break;
      const [key, job] = plantingEntry.value;
      const event = getPlantingEventById(job.eventId);
      if(!event){
        if(googleSheetBackgroundPlantingQueue.get(key) === job){
          googleSheetBackgroundPlantingQueue.delete(key);
        }
        continue;
      }
      const result = await syncPlantingEventWithSources(event);
      const isCurrentJob = googleSheetBackgroundPlantingQueue.get(key) === job;
      if(isCurrentJob){
        googleSheetBackgroundPlantingQueue.delete(key);
        if(result.ok){
          if(job.successMessage) showToast(job.successMessage);
        }else{
          if(job.failureMessage) showToast(job.failureMessage);
          if(job.showFailureDetails){
            showRecordImportError(
              "苗植え記録はアプリ内に保存されています。スプレッドシートへの送信だけ失敗しました。\n\n詳細: " +
                String(result.message || "不明なエラー") +
                "\n\n「修正・未送信」から再送信してください。",
              "苗植え記録の送信失敗"
            );
          }
        }
      }
    }
  }finally{
    googleSheetBackgroundSendRunning = false;
    if((googleSheetBackgroundRecordQueue.size || googleSheetBackgroundPlantingQueue.size)
      && googleSheetSendState === "idle"
      && !googleSheetOperationOwner){
      scheduleGoogleSheetBackgroundSend();
    }
  }
}

function updateGoogleSheetResendButtonState(){
  updateSyncConflictButtonState();
  const btn = document.getElementById("googleSheetResendBtn");
  if(!btn) return;

  if(googleSheetSendState === "confirming"){
    btn.disabled = true;
    btn.classList.remove("resendNeedsAttention");
    btn.textContent = "送信確認中...";
    btn.title = "スプレッドシートへの送信確認中です";
    return;
  }

  if(googleSheetSendState === "sending"){
    btn.disabled = true;
    btn.classList.remove("resendNeedsAttention");
    btn.textContent = "送信中...";
    btn.title = "スプレッドシートへ送信中です";
    return;
  }

  if(googleSheetSendState === "syncing"){
    btn.disabled = true;
    btn.classList.remove("resendNeedsAttention");
    btn.textContent = "同期中...";
    btn.title = "スプレッドシートとの記録同期中です";
    return;
  }

  const config = getValidatedGoogleSheetConfig({ silent: true });
  const unsentRecordCount = config ? getGoogleSheetUnsentRecords().length : 0;
  const unsentPlantingEventCount = config ? getGoogleSheetUnsentPlantingEvents().length : 0;
  const unsentCount = unsentRecordCount + unsentPlantingEventCount;
  const needsAttention = unsentCount > 0;

  btn.disabled = false;
  btn.classList.toggle("resendNeedsAttention", needsAttention);
  btn.textContent = unsentCount > 0
    ? "修正・未送信（" + unsentCount + "）"
    : "未送信の記録（0）";
  btn.title = needsAttention
    ? `収穫${unsentRecordCount}件・苗植え${unsentPlantingEventCount}件がスプレッドシート未送信です`
    : "未送信の記録はありません";
}

function updateSyncConflictButtonState(){
  const button = document.getElementById("syncConflictBtn");
  const alert = document.getElementById("syncConflictAlert");
  const alertTitle = document.getElementById("syncConflictAlertTitle");
  const tabBadge = document.getElementById("recordTabConflictBadge");
  const bulkActions = document.getElementById("syncConflictBulkActions");
  const keepAllLocalButton = document.getElementById("syncConflictKeepAllLocalBtn");
  const count = syncConflicts.length;
  if(alert) alert.hidden = count === 0;
  if(alertTitle) alertTitle.textContent = `競合する記録が${count}件あります`;
  if(button){
    button.hidden = count === 0;
    button.textContent = `競合を比較・選択（${count}）`;
    button.title = count ? `${count}件の競合内容を比較して残す方を選びます` : "競合する記録はありません";
  }
  if(tabBadge){
    tabBadge.hidden = count === 0;
    tabBadge.textContent = count > 99 ? "99+" : String(count);
    tabBadge.setAttribute("aria-label", `未解決の競合が${count}件あります`);
  }
  if(bulkActions) bulkActions.hidden = count === 0;
  if(keepAllLocalButton){
    keepAllLocalButton.disabled = syncConflictBulkRunning || count === 0;
    if(!syncConflictBulkRunning){
      keepAllLocalButton.textContent = `すべてこの端末の内容を残す（${count}件）`;
    }
  }
}

function updateSyncConflictBulkProgress(completedCount, totalCount, message = ""){
  const keepAllLocalButton = document.getElementById("syncConflictKeepAllLocalBtn");
  const status = document.getElementById("syncConflictBulkStatus");
  const completed = Math.max(0, Number(completedCount) || 0);
  const total = Math.max(completed, Number(totalCount) || 0);
  if(keepAllLocalButton){
    keepAllLocalButton.disabled = syncConflictBulkRunning || total === 0;
    keepAllLocalButton.textContent = syncConflictBulkRunning
      ? `端末版を反映中（${completed}/${total}件）`
      : `すべてこの端末の内容を残す（${syncConflicts.length}件）`;
  }
  if(status){
    status.hidden = !message;
    status.textContent = message;
  }
}

function getSyncConflictReasonText(entry){
  return {
    both_updated: "端末とスプレッドシートの両方で内容が変更されています。",
    remote_deleted: "スプレッドシートでは削除されていますが、端末には残す内容があります。",
    planting_dependency: "スプレッドシート版の収穫場所では、端末の苗植え記録との対応を保てません。",
    remote_deleted_dependency: "スプレッドシートでは削除されていますが、端末の苗植え記録から参照されています。",
    editing: "同期中に端末側の編集状態が変わったため、自動反映を止めました。"
  }[entry?.reason] || "内容を自動的に決定できないため、両方を保護しています。";
}

function formatSyncConflictPlantingAllocations(event){
  if(!event) return "削除済み";
  return (event.sourceAllocations || []).map(allocation => {
    const ranges = compressPalletKeysToRanges(allocation.palletKeys || []);
    return `収穫ID ${allocation.harvestRecordId}: ${ranges.join("、") || "場所なし"}`;
  }).join("\n") || "場所なし";
}

function formatSyncConflictPlantingCounts(event){
  if(!event) return "削除済み";
  return formatPlantingCountsByPalletSummary(event);
}

function formatSyncConflictQualityMemo(value){
  const normalized = normalizeQualityMemo(value);
  const tagLabels = {
    large: "大きい",
    medium: "中",
    small: "小さい",
    elongated: "徒長",
    chip: "チップ"
  };
  const tags = Array.isArray(normalized?.tags)
    ? normalized.tags.map(tag => tagLabels[tag] || tag)
    : [];
  const other = String(normalized?.other || "").trim();
  return [...tags, other].filter(Boolean).join("、") || "なし";
}

function getSyncConflictComparisonRows(entry){
  const local = entry.localVersion;
  const remote = entry.remoteVersion;
  if(entry.entityType === "planting"){
    return [
      ["苗植え日", local?.plantingDate || "削除済み", remote?.plantingDate || "削除済み"],
      ["苗植え元・場所", formatSyncConflictPlantingAllocations(local), formatSyncConflictPlantingAllocations(remote)],
      ["苗トレー数", local ? String(local.actualSeedlingTrayCount ?? 0) : "削除済み", remote ? String(remote.actualSeedlingTrayCount ?? 0) : "削除済み"],
      ["取った苗株数", local ? String(local.actualTakenSeedlingCount ?? 0) : "削除済み", remote ? String(remote.actualTakenSeedlingCount ?? 0) : "削除済み"],
      ["植えた苗株数", local ? String(local.actualPlantedSeedlingCount ?? 0) : "削除済み", remote ? String(remote.actualPlantedSeedlingCount ?? 0) : "削除済み"],
      ["パレット別の植え付け数", formatSyncConflictPlantingCounts(local), formatSyncConflictPlantingCounts(remote)],
      ["苗ロス率", local ? String(local.actualSeedlingLossRate || "未入力") : "削除済み", remote ? String(remote.actualSeedlingLossRate || "未入力") : "削除済み"],
      ["品質メモ", local ? formatSyncConflictQualityMemo(local.qualityMemo) : "削除済み", remote ? formatSyncConflictQualityMemo(remote.qualityMemo) : "削除済み"],
      ["更新日時", local?.updatedAt || "なし", remote?.updatedAt || "なし"]
    ];
  }
  const getRecordLocation = record => {
    if(!record) return "削除済み";
    if(record.type === "partialHarvest") return formatPartialHarvestSummary(record.targets) || "場所なし";
    return formatStoredPalletSummaryForDisplay(record.palletSummary, getPalletKeysFromRecord(record)) || "場所なし";
  };
  return [
    ["種類", local?.type === "partialHarvest" ? "部分収穫" : (local ? "通常収穫" : "削除済み"), remote?.type === "partialHarvest" ? "部分収穫" : (remote ? "通常収穫" : "削除済み")],
    ["収穫日", local?.date || "削除済み", remote?.date || "削除済み"],
    ["ケース数", local ? String(local.cases ?? 0) : "削除済み", remote ? String(remote.cases ?? 0) : "削除済み"],
    ["収穫場所", getRecordLocation(local), getRecordLocation(remote)],
    ["収穫ロス率", local ? String(local.actualLoss || "未入力") : "削除済み", remote ? String(remote.actualLoss || "未入力") : "削除済み"],
    ["苗植え場所", local ? String(local.plantingSummary || "なし") : "削除済み", remote ? String(remote.plantingSummary || "なし") : "削除済み"],
    ["品質メモ", local ? formatSyncConflictQualityMemo(local.qualityMemo) : "削除済み", remote ? formatSyncConflictQualityMemo(remote.qualityMemo) : "削除済み"],
    ["メモ", local ? String(local.memo || "なし") : "削除済み", remote ? String(remote.memo || "なし") : "削除済み"],
    ["更新日時", local?.updatedAt || "なし", remote?.updatedAt || "なし"]
  ];
}

function isSyncConflictRemoteChoiceBlocked(entry){
  if(entry?.reason === "planting_dependency"
    || entry?.reason === "remote_deleted_dependency") return true;
  if(entry?.entityType !== "record") return false;
  const activeRecord = getActiveRecordForSyncConflict(entry);
  const dependencies = activeRecord?.type === "fullHarvest"
    ? getPlantingEventsForHarvest(activeRecord.id)
    : [];
  if(!dependencies.length) return false;
  if(!entry.remoteVersion || entry.remoteVersion.type !== "fullHarvest") return true;
  const remoteHarvestKeys = new Set(getPalletKeysFromRecord(entry.remoteVersion));
  return dependencies.some(event => event.sourceAllocations.some(allocation => (
    Number(allocation.harvestRecordId) === Number(activeRecord.id)
    && allocation.palletKeys.some(key => !remoteHarvestKeys.has(key))
  )));
}

function renderSyncConflictList(){
  const list = document.getElementById("syncConflictList");
  const title = document.getElementById("syncConflictTitle");
  const navigator = document.getElementById("syncConflictNavigator");
  const position = document.getElementById("syncConflictPosition");
  const previousButton = document.getElementById("syncConflictPreviousBtn");
  const nextButton = document.getElementById("syncConflictNextBtn");
  const closeButton = document.getElementById("syncConflictCloseBtn");
  if(title) title.textContent = `競合する記録（${syncConflicts.length}）`;
  if(closeButton) closeButton.disabled = syncConflictBulkRunning;
  updateSyncConflictButtonState();
  if(!list) return;
  if(!syncConflicts.length){
    activeSyncConflictId = "";
    if(navigator) navigator.hidden = true;
    list.innerHTML = '<div class="smallText">競合する記録はありません。</div>';
    return;
  }
  let activeIndex = syncConflicts.findIndex(entry => entry.conflictId === activeSyncConflictId);
  if(activeIndex < 0) activeIndex = 0;
  const entry = syncConflicts[activeIndex];
  activeSyncConflictId = entry.conflictId;
  if(navigator) navigator.hidden = false;
  if(position){
    position.innerHTML = `${activeIndex + 1} / ${syncConflicts.length}<span class="syncConflictVersionNote">表示版: local-all-v1</span>`;
  }
  if(previousButton) previousButton.disabled = syncConflictBulkRunning || activeIndex <= 0;
  if(nextButton) nextButton.disabled = syncConflictBulkRunning || activeIndex >= syncConflicts.length - 1;
  list.innerHTML = (() => {
    const source = entry.localVersion || entry.remoteVersion;
    const entityTitle = entry.entityType === "planting"
      ? `${source?.plantingDate || "日付なし"} 苗植え記録（ID: ${entry.entityId}）`
      : `${source?.date || "日付なし"} ${source?.type === "partialHarvest" ? "部分収穫" : "収穫記録"}（ID: ${entry.entityId || "-"}）`;
    const comparisonData = getSyncConflictComparisonRows(entry);
    const differentRows = comparisonData.filter(([, localValue, remoteValue]) => (
      String(localValue) !== String(remoteValue)
    ));
    const differentLabels = differentRows.map(([label]) => label);
    const differenceCards = differentRows.map(([label, localValue, remoteValue]) => `
      <div class="syncConflictField">
        <div class="syncConflictFieldName">
          <span>${escapeHtml(label)}</span>
          <span class="syncConflictDifferenceBadge">相違あり</span>
        </div>
        <div class="syncConflictFieldValues">
          <div class="syncConflictVersionValue isDevice">
            <span class="syncConflictVersionLabel">この端末</span>
            <span class="syncConflictVersionText">${escapeHtml(String(localValue))}</span>
          </div>
          <div class="syncConflictVersionValue isSheet">
            <span class="syncConflictVersionLabel">スプレッドシート</span>
            <span class="syncConflictVersionText">${escapeHtml(String(remoteValue))}</span>
          </div>
        </div>
      </div>
    `).join("");
    const safeConflictId = escapeHtml(entry.conflictId);
    const remoteBlocked = isSyncConflictRemoteChoiceBlocked(entry);
    const remoteLabel = entry.remoteVersion
      ? "スプレッドシートの内容を残す"
      : "スプレッドシートに合わせて削除";
    const changedFieldBadges = differentLabels.length
      ? differentLabels.map(label => `<span class="syncConflictChangedField">${escapeHtml(label)}</span>`).join("")
      : '<span class="syncConflictChangedField">同期状態</span>';
    return `
      <section id="syncConflictCard-${escapeHtml(entry.conflictId)}" class="syncConflictCard">
        <div class="syncConflictCardHeader">${escapeHtml(entityTitle)}</div>
        <div class="syncConflictReason">${escapeHtml(getSyncConflictReasonText(entry))}</div>
        <div class="syncConflictChangedFields"><strong>異なる項目:</strong>${changedFieldBadges}</div>
        <div class="syncConflictActions">
          <button type="button" class="actionBtn thirdBtn syncConflictDecisionBtn" data-ui-click="resolveSyncConflict" data-ui-arg="${safeConflictId}" data-ui-arg2="local" ${syncConflictBulkRunning ? "disabled" : ""}>この端末の内容を残す</button>
          <button type="button" class="actionBtn secondaryBtn syncConflictDecisionBtn" data-ui-click="resolveSyncConflict" data-ui-arg="${safeConflictId}" data-ui-arg2="remote" ${(remoteBlocked || syncConflictBulkRunning) ? "disabled" : ""}>${escapeHtml(remoteLabel)}</button>
        </div>
        ${remoteBlocked ? '<div class="syncConflictReason">苗植えとの対応を保つため、スプレッドシートの内容は選べません。関連する苗植え記録との対応を解消するまでは、この端末の内容だけを選択できます。</div>' : ""}
        <div class="syncConflictFieldList">${differenceCards || '<div class="syncConflictField">内容は同じですが、同期状態の確認が必要です。</div>'}</div>
        <div class="syncConflictSameFieldNote">同じ内容の項目は省略しています。</div>
      </section>
    `;
  })();
  list.scrollTop = 0;
}

function moveSyncConflictSelection(direction){
  if(!syncConflicts.length) return;
  const currentIndex = Math.max(0, syncConflicts.findIndex(entry => (
    entry.conflictId === activeSyncConflictId
  )));
  const nextIndex = Math.max(0, Math.min(
    syncConflicts.length - 1,
    currentIndex + (Number(direction) < 0 ? -1 : 1)
  ));
  if(nextIndex === currentIndex) return;
  activeSyncConflictId = syncConflicts[nextIndex].conflictId;
  renderSyncConflictList();
  requestAnimationFrame(() => {
    document.querySelector(".syncConflictDecisionBtn")?.focus({ preventScroll: true });
  });
}

function openSyncConflictPanel(conflictId = ""){
  const panel = document.getElementById("syncConflictPanel");
  if(!panel) return;
  const safeConflictId = /^[A-Za-z0-9:_-]{1,200}$/.test(String(conflictId || ""))
    ? String(conflictId)
    : "";
  if(safeConflictId && syncConflicts.some(entry => entry.conflictId === safeConflictId)){
    activeSyncConflictId = safeConflictId;
  }else if(!syncConflicts.some(entry => entry.conflictId === activeSyncConflictId)){
    activeSyncConflictId = syncConflicts[0]?.conflictId || "";
  }
  renderSyncConflictList();
  showPageBlockingUi(panel);
  requestAnimationFrame(() => {
    document.querySelector(".syncConflictDecisionBtn")?.focus({ preventScroll: true });
  });
}

function closeSyncConflictPanel(){
  if(syncConflictBulkRunning) return;
  const panel = document.getElementById("syncConflictPanel");
  hidePageBlockingUi(panel);
}

function getActiveRecordForSyncConflict(entry){
  return findHarvestRecordByIdentity({
    recordUuid: entry?.recordUuid,
    id: entry?.entityId
  });
}

function replaceActiveRecordForSyncConflict(entry, value){
  const nextRecord = normalizeRecordSnapshot(value);
  if(!nextRecord) throw new Error("反映する収穫記録の形式が正しくありません");
  const current = getActiveRecordForSyncConflict(entry);
  const status = loadGoogleSheetSyncStatus();
  if(current && Number(current.id) !== Number(nextRecord.id)){
    const occupied = getRecordById(nextRecord.id);
    if(occupied && occupied !== current){
      throw new Error("反映先の収穫記録IDが別の記録で使用されています");
    }
    remapHarvestRecordIdReferences(current.id, nextRecord.id, status);
  }
  if(current){
    const index = records.indexOf(current);
    if(index >= 0) records[index] = nextRecord;
    clearGoogleSheetRecordSyncStatus(status, current);
  }else{
    const occupied = getRecordById(nextRecord.id);
    if(occupied) throw new Error("同じ収穫記録IDが既にあります");
    records.push(nextRecord);
  }
  records.sort(compareRecordsByDateDesc);
  saveRecordsToStorage();
  savePlantingEventsToStorage();
  saveDeletedPlantingEventsToStorage();
  saveGoogleSheetSyncStatus(status);
  return nextRecord;
}

function replaceActivePlantingEventForSyncConflict(entry, value){
  const nextEvent = normalizePlantingEvent(value);
  if(!nextEvent) throw new Error("反映する苗植え記録の形式が正しくありません");
  const index = plantingEvents.findIndex(event => Number(event.eventId) === Number(entry.entityId));
  if(index >= 0) plantingEvents[index] = nextEvent;
  else plantingEvents.push(nextEvent);
  savePlantingEventsToStorage();
  return nextEvent;
}

function removeActiveRecordForSyncConflict(entry){
  const current = getActiveRecordForSyncConflict(entry);
  if(!current) return;
  const dependencies = current.type === "fullHarvest" ? getPlantingEventsForHarvest(current.id) : [];
  if(dependencies.length){
    throw new Error("関連する苗植え記録があるため、スプレッドシート側の削除を採用できません");
  }
  addRecordToTrash(current, {
    sheetDeleted: true,
    remoteDeleted: true
  });
  records = records.filter(record => record !== current);
  const status = loadGoogleSheetSyncStatus();
  clearGoogleSheetRecordSyncStatus(status, current);
  saveGoogleSheetSyncStatus(status);
  saveRecordsToStorage();
}

function removeActivePlantingEventForSyncConflict(entry){
  const current = getPlantingEventById(entry.entityId);
  if(!current) return;
  addPlantingEventToTrash(current, {
    sheetDeleted: true,
    wasSynced: true
  });
  plantingEvents = plantingEvents.filter(event => Number(event.eventId) !== Number(entry.entityId));
  const status = loadPlantingEventSyncStatus();
  delete status[String(entry.entityId)];
  savePlantingEventSyncStatus(status);
  savePlantingEventsToStorage();
}

function applyRemoteSyncConflictVersion(entry){
  if(isSyncConflictRemoteChoiceBlocked(entry)){
    throw new Error("苗植え記録との対応を保てないため、スプレッドシート版をそのまま採用できません");
  }
  if(entry.entityType === "record"){
    if(entry.remoteVersion){
      const applied = replaceActiveRecordForSyncConflict(entry, entry.remoteVersion);
      setGoogleSheetSyncStatus(applied, "confirmed");
    }else{
      removeActiveRecordForSyncConflict(entry);
    }
  }else if(entry.remoteVersion){
    const applied = replaceActivePlantingEventForSyncConflict(entry, entry.remoteVersion);
    setPlantingEventSyncStatus(applied, "confirmed");
  }else{
    removeActivePlantingEventForSyncConflict(entry);
  }
  syncHarvestPlantingPendingFlags();
}

async function applyLocalRecordSyncConflictVersion(entry, options = {}){
  const config = getValidatedGoogleSheetConfig({ showImportError: true, errorTitle: "競合解決前に設定してください" });
  if(!config) return false;
  const ownsOperation = !options.operationOwner;
  const operationOwner = options.operationOwner || beginGoogleSheetOperation("sending");
  if(!operationOwner) throw new Error(getGoogleSheetOperationBusyMessage("競合を解決"));
  if(operationOwner !== googleSheetOperationOwner){
    throw new Error("競合解決の処理状態を確認できません");
  }
  try{
    const localVersion = normalizeRecordSnapshot(entry.localVersion);
    if(!localVersion) throw new Error("端末版の収穫記録を読み込めません");
    let baseVersion = entry.remoteVersion
      ? normalizeRecordSnapshot(entry.remoteVersion)
      : null;
    if(!baseVersion){
      const restoreResult = await restoreRecordToGoogleSheet(localVersion, { operationOwner });
      baseVersion = normalizeImportedRecord(normalizeGoogleSheetRowRecord(restoreResult?.record), 0);
      if(!baseVersion) throw new Error("復元後の収穫記録を確認できません");
    }
    const candidate = {
      ...localVersion,
      id: baseVersion.id,
      recordUuid: normalizeRecordUuid(baseVersion.recordUuid)
        || normalizeRecordUuid(localVersion.recordUuid),
      createdAt: baseVersion.createdAt || localVersion.createdAt || "",
      updatedAt: baseVersion.updatedAt || localVersion.updatedAt || ""
    };
    const activeCandidate = replaceActiveRecordForSyncConflict(entry, candidate);
    setGoogleSheetSyncStatus(activeCandidate, "pending");
    const sentSignature = getGoogleSheetRecordSendSignature(activeCandidate, config);
    const result = await sendGoogleSheetRecordMutation(
      buildGoogleSheetRecordPayload(activeCandidate, config),
      "端末版の収穫記録をスプレッドシートへ反映できませんでした",
      { operationOwner }
    );
    if(!setGoogleSheetSyncStatusAfterSend(
      activeCandidate,
      sentSignature,
      config,
      "confirmed",
      result.record
    )){
      throw new Error("送信中に端末版の収穫記録が変更されました");
    }
    return true;
  }finally{
    if(ownsOperation) endGoogleSheetOperation(operationOwner);
  }
}

async function applyLocalPlantingSyncConflictVersion(entry, options = {}){
  const config = getValidatedGoogleSheetConfig({ showImportError: true, errorTitle: "競合解決前に設定してください" });
  if(!config) return false;
  const ownsOperation = !options.operationOwner;
  const operationOwner = options.operationOwner || beginGoogleSheetOperation("sending");
  if(!operationOwner) throw new Error(getGoogleSheetOperationBusyMessage("競合を解決"));
  if(operationOwner !== googleSheetOperationOwner){
    throw new Error("競合解決の処理状態を確認できません");
  }
  try{
    const localVersion = normalizePlantingEvent(entry.localVersion);
    if(!localVersion) throw new Error("端末版の苗植え記録を読み込めません");
    let baseVersion = entry.remoteVersion ? normalizePlantingEvent(entry.remoteVersion) : null;
    if(!baseVersion){
      const restoreResult = await postGoogleSheetPlantingEvent(localVersion, "restore", { config, silent: true });
      baseVersion = normalizePlantingEvent(restoreResult?.event);
      if(!baseVersion) throw new Error("復元後の苗植え記録を確認できません");
    }
    const candidate = {
      ...localVersion,
      eventId: baseVersion.eventId,
      createdAt: baseVersion.createdAt || localVersion.createdAt || "",
      updatedAt: baseVersion.updatedAt || localVersion.updatedAt || ""
    };
    const activeCandidate = replaceActivePlantingEventForSyncConflict(entry, candidate);
    setPlantingEventSyncStatus(activeCandidate, "pending");
    await postGoogleSheetPlantingEvent(activeCandidate, "save", { config, silent: true });
    const confirmed = getPlantingEventById(activeCandidate.eventId) || activeCandidate;
    setPlantingEventSyncStatus(confirmed, "confirmed");
    return true;
  }finally{
    if(ownsOperation) endGoogleSheetOperation(operationOwner);
  }
}

async function acknowledgeSyncRevisionAfterLocalConflictResolution(){
  if(syncConflicts.length) return;
  // 端末版の反映もサーバー側では新しい更新になるため、最後にその差分を
  // 受信して同期番号を追いつかせ、通知ドットが再点灯したままになるのを防ぐ。
  await importRecordsFromGoogleSheet({
    silentErrors: true,
    silentNoChange: true
  });
}

async function resolveAllSyncConflictsWithLocalVersions(){
  if(syncConflictBulkRunning) return;
  if(!ensureProtectedOperationAccess("競合する記録の一括解決")) return;
  if(!ensureGoogleSheetLocalMutationAllowed("競合する記録を一括解決")) return;
  if(!syncConflicts.length){
    showToast("競合する記録はありません");
    return;
  }

  const config = getValidatedGoogleSheetConfig({
    showImportError: true,
    errorTitle: "競合解決前に設定してください"
  });
  if(!config) return;
  const entries = [...syncConflicts].sort((left, right) => {
    if(left.entityType === right.entityType) return 0;
    return left.entityType === "record" ? -1 : 1;
  });
  const missingLocalCount = entries.filter(entry => !entry.localVersion).length;
  if(missingLocalCount){
    showRecordImportError(
      `端末版が保存されていない競合が${missingLocalCount}件あるため、一括処理を開始できません。該当する競合を個別に確認してください。`,
      "端末版を一括選択できません"
    );
    return;
  }
  const currentUrl = String(config.url || "").trim();
  const differentSourceCount = entries.filter(entry => (
    entry.sourceUrl && entry.sourceUrl !== currentUrl
  )).length;
  if(differentSourceCount){
    showRecordImportError(
      `現在とは別のApps Script URLで発生した競合が${differentSourceCount}件あります。元のGoogle連携設定へ戻してから実行してください。`,
      "端末版を一括選択できません"
    );
    return;
  }
  if(!window.confirm(
    `現在の競合${entries.length}件すべてについて、この端末の内容をスプレッドシートへ反映します。\n\nこの操作を実行しますか？`
  )) return;

  const operationOwner = beginGoogleSheetOperation("sending");
  if(!operationOwner){
    showToast(getGoogleSheetOperationBusyMessage("競合を一括解決"));
    return;
  }
  syncConflictBulkRunning = true;
  let completedCount = 0;
  let failedEntry = null;
  let failure = null;
  renderSyncConflictList();
  updateSyncConflictBulkProgress(0, entries.length, "処理中はこの画面を閉じずにお待ちください。");

  try{
    for(const queuedEntry of entries){
      const entry = syncConflicts.find(item => item.conflictId === queuedEntry.conflictId);
      if(!entry) continue;
      try{
        const resolved = entry.entityType === "record"
          ? await applyLocalRecordSyncConflictVersion(entry, { operationOwner })
          : await applyLocalPlantingSyncConflictVersion(entry, { operationOwner });
        if(!resolved) throw new Error("端末版をスプレッドシートへ反映できませんでした");
        removeSyncConflictById(entry.conflictId);
        completedCount++;
        updateSyncConflictBulkProgress(
          completedCount,
          entries.length,
          completedCount < entries.length
            ? `端末版を反映しています（残り${entries.length - completedCount}件）`
            : "すべての端末版を反映しました。"
        );
      }catch(error){
        failedEntry = entry;
        failure = error;
        break;
      }
    }
  }finally{
    syncConflictBulkRunning = false;
    endGoogleSheetOperation(operationOwner);
  }

  activeSyncConflictId = failedEntry?.conflictId || syncConflicts[0]?.conflictId || "";
  syncHarvestPlantingPendingFlags();
  refreshRecordDataUi();
  renderSyncConflictList();
  if(failure){
    updateSyncConflictBulkProgress(
      completedCount,
      entries.length,
      `${completedCount}件を完了しました。未処理の${syncConflicts.length}件は競合一覧に保護しています。`
    );
    showRecordImportError(
      `端末版${completedCount}件の反映後に処理を停止しました。未処理の${syncConflicts.length}件は競合一覧に残しています。\n\n詳細: ${String(failure?.message || failure)}`,
      "競合の一括解決を停止しました"
    );
    return;
  }
  await acknowledgeSyncRevisionAfterLocalConflictResolution();
  if(!syncConflicts.length){
    closeSyncConflictPanel();
    showToast(`端末版${completedCount}件をスプレッドシートへ反映し、すべての競合を解決しました`);
  }else{
    activeSyncConflictId = syncConflicts[0]?.conflictId || "";
    renderSyncConflictList();
    showToast(`端末版${completedCount}件を反映しました。新たに見つかった競合を確認してください`);
  }
}

async function resolveSyncConflict(conflictId, choice){
  if(!ensureProtectedOperationAccess("競合する記録の解決")) return;
  if(!ensureGoogleSheetLocalMutationAllowed("競合する記録を解決")) return;
  const entry = syncConflicts.find(item => item.conflictId === conflictId);
  if(!entry){
    showToast("解決する競合が見つかりません");
    renderSyncConflictList();
    return;
  }
  const currentUrl = String(loadGoogleSheetConfig().url || "").trim();
  if(entry.sourceUrl && entry.sourceUrl !== currentUrl){
    showRecordImportError(
      "この競合は現在とは別のApps Script URLで発生しています。元のGoogle連携設定へ戻してから解決してください。",
      "競合を解決できません"
    );
    return;
  }
  const useLocal = choice === "local";
  const choiceText = useLocal
    ? "この端末の内容をスプレッドシートへ反映します。"
    : (entry.remoteVersion
        ? "スプレッドシートの内容でこの端末を更新します。"
        : "スプレッドシート側の削除に合わせて、この端末からも削除します。");
  if(!window.confirm(choiceText + "\n\nこの操作を実行しますか？")) return;
  try{
    const resolvedIndex = syncConflicts.findIndex(item => item.conflictId === entry.conflictId);
    if(useLocal){
      const resolved = entry.entityType === "record"
        ? await applyLocalRecordSyncConflictVersion(entry)
        : await applyLocalPlantingSyncConflictVersion(entry);
      if(!resolved) return;
    }else{
      applyRemoteSyncConflictVersion(entry);
    }
    removeSyncConflictById(entry.conflictId);
    activeSyncConflictId = syncConflicts[Math.min(
      Math.max(0, resolvedIndex),
      Math.max(0, syncConflicts.length - 1)
    )]?.conflictId || "";
    syncHarvestPlantingPendingFlags();
    refreshRecordDataUi();
    renderSyncConflictList();
    if(useLocal && !syncConflicts.length){
      await acknowledgeSyncRevisionAfterLocalConflictResolution();
      if(syncConflicts.length){
        activeSyncConflictId = syncConflicts[0]?.conflictId || "";
        renderSyncConflictList();
      }
    }
    if(!syncConflicts.length) closeSyncConflictPanel();
    showToast(useLocal
      ? "端末版をスプレッドシートへ反映し、競合を解決しました"
      : "スプレッドシート版を採用し、競合を解決しました");
  }catch(e){
    showRecordImportError(
      "競合を解決できませんでした。両方の内容は競合一覧に保持しています。\n\n詳細: " + String(e?.message || e),
      "競合解決の失敗"
    );
    renderSyncConflictList();
  }
}

function askGoogleSheetSendConfirm(message){
  const panel = document.getElementById("googleSheetConfirmPanel");
  const messageBox = document.getElementById("googleSheetConfirmMessage");
  const sendBtn = document.querySelector(".googleSheetConfirmSend");
  const cancelBtn = document.querySelector(".googleSheetConfirmCancel");

  if(!panel || !messageBox){
    return Promise.resolve(confirm(message));
  }

  if(googleSheetConfirmResolver){
    resolveGoogleSheetConfirm(false);
  }

  messageBox.textContent = message;
  if(sendBtn) sendBtn.disabled = false;
  if(cancelBtn) cancelBtn.disabled = false;
  panel.classList.add("show");

  return new Promise(resolve => {
    googleSheetConfirmResolver = resolve;
  });
}

function resolveGoogleSheetConfirm(shouldSend){
  const panel = document.getElementById("googleSheetConfirmPanel");
  const sendBtn = document.querySelector(".googleSheetConfirmSend");
  const cancelBtn = document.querySelector(".googleSheetConfirmCancel");
  if(panel) panel.classList.remove("show");
  if(sendBtn) sendBtn.disabled = true;
  if(cancelBtn) cancelBtn.disabled = true;

  if(googleSheetConfirmResolver){
    googleSheetConfirmResolver(!!shouldSend);
    googleSheetConfirmResolver = null;
  }
}

function makeRecordContentKey(record){
  return [
    record?.date || "",
    Number(record?.cases || 0)
  ].join("__");
}

function getRecordDuplicateKey(record){
  return makeRecordContentKey(record);
}

function buildGoogleSheetRecordPayload(record, config){
  const isPartial = record?.type === "partialHarvest";
  const duplicateKey = getRecordDuplicateKey(record);
  const syncMetadata = getRecordSyncMetadata(record);
  return {
    app: "Harvestnavi",
    type: "harvest-record",
    version: 1,
    token: config.token || "",
    syncRevision: getGoogleSheetMutationSyncRevision(config),
    duplicateKey,
    record: {
      ...syncMetadata,
      palletNumberingVersion: CURRENT_PALLET_NUMBERING_VERSION,
      id: record.id,
      duplicateKey,
      type: isPartial ? "partialHarvest" : "fullHarvest",
      date: record.date,
      cases: record.cases,
      palletSummary: isPartial ? formatPartialHarvestSummary(record.targets) : record.palletSummary,
      plannedSeedlingTrayCount: isPartial ? 0 : clampNumber(record.plannedSeedlingTrayCount, 0, 999999, 0),
      plantingCaseInstruction: isPartial ? "" : String(record.plantingCaseInstruction || "").trim(),
      plantingSummary: isPartial ? "" : (record.plantingSummary || ""),
      plantingDate: isPartial ? "" : (record.plantingDate || ""),
      actualSeedlingTrayCount: isPartial ? 0 : clampNumber(record.actualSeedlingTrayCount, 0, 999999, 0),
      actualSeedlingCarryoverMode: isPartial ? "loss" : normalizeSeedlingCarryoverMode(record.actualSeedlingCarryoverMode),
      actualSeedlingLossRate: isPartial ? "" : String(record.actualSeedlingLossRate ?? "").trim(),
      memo: record.memo || "",
      actualLoss: isPartial ? "" : record.actualLoss,
      qualityMemo: isPartial ? null : normalizeQualityMemo(record.qualityMemo),
      qualityText: isPartial ? "" : formatQualityMemo(record.qualityMemo),
      plantingAge: isPartial ? null : normalizePlantingAgeSnapshot(record.plantingAge),
      palletKeys: isPartial ? [] : (Array.isArray(record.palletKeys) ? record.palletKeys : []),
      plantingPalletKeys: isPartial ? [] : (Array.isArray(record.plantingPalletKeys) ? record.plantingPalletKeys : []),
      targets: isPartial ? normalizePartialHarvestTargets(record.targets) : []
    }
  };
}

function buildGoogleSheetCombinedSyncPayload(config, options = {}){
  return {
    app: "Harvestnavi",
    type: "harvest-sync-all",
    action: "syncAll",
    version: 1,
    token: config.token || "",
    syncRevision: normalizeGoogleSheetSyncRevision(options.syncRevision),
    revisionReset: options.revisionReset === true ? true : undefined,
    cursor: normalizeGoogleSheetSyncCursor(options.cursor) || undefined,
    plantingCursor: normalizeGoogleSheetPlantingSyncCursor(options.plantingCursor) || undefined,
    fallbackSeedlingLossRate: clampNumber(settings.seedlingLossRate, 0, 100, 0),
    fallbackSeedlingPattern: getSpecialPalletPattern(settings.specialPallet60CountPer3),
    fallbackPlantingCountsByBed: getPlantingEventFallbackPlantingCountsByBed(),
    limit: GOOGLE_SHEET_MAX_LIST_RECORDS,
    plantingLimit: GOOGLE_SHEET_MAX_LIST_PLANTING_EVENTS
  };
}

function buildGoogleSheetUpdateCheckPayload(config, options = {}){
  return {
    app: "Harvestnavi",
    type: "harvest-update-check",
    action: "checkUpdates",
    version: 1,
    token: config.token || "",
    syncRevision: normalizeGoogleSheetSyncRevision(options.syncRevision)
  };
}

function buildGoogleSheetBatchPayload(recordsToSend, config){
  return {
    app: "Harvestnavi",
    type: "harvest-record-batch",
    version: 1,
    token: config.token || "",
    syncRevision: getGoogleSheetMutationSyncRevision(config),
    records: recordsToSend.map(record => buildGoogleSheetRecordPayload(record, config).record)
  };
}

function buildGoogleSheetRecordDeletePayload(record, config){
  return {
    app: "Harvestnavi",
    type: "harvest-record-delete",
    action: "deleteRecord",
    version: 1,
    token: config.token || "",
    syncRevision: getGoogleSheetMutationSyncRevision(config),
    record: buildGoogleSheetRecordPayload(record, config).record
  };
}

function buildGoogleSheetRecordRestorePayload(record, config){
  return {
    app: "Harvestnavi",
    type: "harvest-record-restore",
    action: "restoreRecord",
    version: 1,
    token: config.token || "",
    syncRevision: getGoogleSheetMutationSyncRevision(config),
    record: buildGoogleSheetRecordPayload(record, config).record
  };
}

function getPlantingEventForGoogleTransfer(event){
  const normalized = normalizePlantingEvent(event);
  if(!normalized) throw new Error("苗植え記録の形式が正しくありません");
  return {
    palletNumberingVersion: CURRENT_PALLET_NUMBERING_VERSION,
    eventId: normalized.eventId,
    plantingDate: normalized.plantingDate,
    sourceAllocations: normalized.sourceAllocations.map(allocation => ({
      harvestRecordId: allocation.harvestRecordId,
      palletKeys: [...allocation.palletKeys]
    })),
    plantingPalletKeys: [...normalized.plantingPalletKeys],
    plantingCountsByPallet: { ...normalized.plantingCountsByPallet },
    actualSeedlingTrayCount: normalized.actualSeedlingTrayCount,
    actualTakenSeedlingCount: normalized.actualTakenSeedlingCount,
    actualPlantedSeedlingCount: normalized.actualPlantedSeedlingCount,
    actualSeedlingCarryoverMode: normalized.actualSeedlingCarryoverMode,
    actualSeedlingLossRate: normalized.actualSeedlingLossRate,
    // Apps Script の既存形式とも同期できるよう、「中」は品質メモ本文として送る。
    qualityMemo: getPlantingQualityMemoForGoogleTransfer(normalized.qualityMemo),
    detailsUnknown: normalized.detailsUnknown,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt
  };
}

function getPlantingEventSendSignature(event){
  const value = getPlantingEventForGoogleTransfer(event);
  delete value.createdAt;
  delete value.updatedAt;
  return JSON.stringify(value);
}

function buildGoogleSheetPlantingEventPayload(event, config, operation = "save"){
  const operationConfig = {
    save: { type: "planting-event", action: "savePlantingEvent" },
    delete: { type: "planting-event-delete", action: "deletePlantingEvent" },
    restore: { type: "planting-event-restore", action: "restorePlantingEvent" }
  }[operation];
  if(!operationConfig) throw new Error("苗植え記録の操作が正しくありません");
  return {
    app: "Harvestnavi",
    ...operationConfig,
    version: 1,
    token: config.token || "",
    syncRevision: getGoogleSheetMutationSyncRevision(config),
    event: getPlantingEventForGoogleTransfer(event)
  };
}

function getPlantingEventFallbackPlantingCountsByBed(){
  const countsByBed = {};
  bedOrder.forEach(bed => {
    countsByBed[bed] = Array.from(
      { length: PALLETS_PER_BED },
      (_, index) => getPlantingCountForPallet(bed, index + 1)
    );
  });
  return countsByBed;
}

function buildGoogleSheetPlantingEventListPayload(config, options = {}){
  return {
    app: "Harvestnavi",
    type: "planting-event-list",
    action: "listPlantingEvents",
    version: 1,
    token: config.token || "",
    syncMode: options.syncMode === false ? undefined : true,
    cursor: normalizeGoogleSheetPlantingSyncCursor(options.cursor) || undefined,
    fallbackSeedlingLossRate: clampNumber(settings.seedlingLossRate, 0, 100, 0),
    fallbackSeedlingPattern: getSpecialPalletPattern(settings.specialPallet60CountPer3),
    fallbackPlantingCountsByBed: getPlantingEventFallbackPlantingCountsByBed(),
    recentDays: options.recentDays === undefined
      ? undefined
      : clampNumber(options.recentDays, 1, GOOGLE_SHEET_MAX_RECENT_DAYS, undefined),
    limit: clampNumber(options.limit, 1, GOOGLE_SHEET_MAX_LIST_PLANTING_EVENTS, GOOGLE_SHEET_MAX_LIST_PLANTING_EVENTS)
  };
}

async function postGoogleSheetPlantingEvent(event, operation = "save", options = {}){
  const config = options.config || getValidatedGoogleSheetConfig({ silent: !!options.silent });
  if(!config) throw new Error("Google連携設定が必要です");
  const snapshot = getPlantingEventForGoogleTransfer(event);
  const sentSignature = getPlantingEventSendSignature(snapshot);
  if(operation === "save") setPlantingEventSyncStatus(snapshot, "pending");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOOGLE_SHEET_BATCH_TIMEOUT_MS);

  try{
    const payloadObject = buildGoogleSheetPlantingEventPayload(snapshot, config, operation);
    const response = await fetch(config.url, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: buildValidatedGoogleSheetRequestBody(payloadObject),
      signal: controller.signal
    });
    const text = await response.text();
    if(!isWithinGoogleSheetResponseLimits(text)) throw new Error("スプレッドシートの応答が大きすぎます");
    let result = {};
    try{
      result = text ? JSON.parse(text) : {};
    }catch(e){
      throw new Error("スプレッドシートの応答を読み込めません");
    }
    if(result.ok !== true) throw new Error(result.message || "苗植え記録をスプレッドシートへ送信できませんでした");
    acknowledgeGoogleSheetMutationRevision(config, payloadObject.syncRevision, result);

    if(operation === "save"){
      const current = getPlantingEventById(snapshot.eventId);
      if(!current || getPlantingEventSendSignature(current) !== sentSignature){
        if(current) setPlantingEventSyncStatus(current, "edited");
        throw new Error("送信中に苗植え記録が変更されました。最新版を再送してください");
      }
      const serverEvent = normalizePlantingEvent(result.event);
      if(serverEvent){
        const index = plantingEvents.findIndex(item => Number(item.eventId) === Number(snapshot.eventId));
        if(index >= 0){
          plantingEvents[index] = {
            ...serverEvent,
            openingCarryoverBefore: serverEvent.openingCarryoverBefore ?? current.openingCarryoverBefore ?? null
          };
          savePlantingEventsToStorage();
        }
      }
      setPlantingEventSyncStatus(current, "confirmed");
    }
    return result;
  }catch(e){
    if(operation === "save"){
      const current = getPlantingEventById(snapshot.eventId) || snapshot;
      setPlantingEventSyncStatus(current, "failed");
    }
    if(e?.name === "AbortError") throw new Error("スプレッドシートとの通信がタイムアウトしました");
    throw e;
  }finally{
    clearTimeout(timer);
  }
}

function getPlantingEventSourceRecords(event){
  const ids = new Set((event?.sourceAllocations || []).map(allocation => Number(allocation.harvestRecordId)));
  return records.filter(record => ids.has(Number(record.id)));
}

function isGoogleSheetRecordConfirmed(record, status = loadGoogleSheetSyncStatus()){
  return getGoogleSheetRecordSyncState(record, status) === "confirmed";
}

async function syncPlantingEventWithSources(event, options = {}){
  const manageSendState = options.manageSendState !== false;
  const operationOwner = manageSendState ? beginGoogleSheetOperation("sending") : null;
  if(manageSendState && !operationOwner){
    return { ok: false, message: getGoogleSheetOperationBusyMessage("送信") };
  }
  const config = getValidatedGoogleSheetConfig({ silent: true });
  if(!config){
    setPlantingEventSyncStatus(event, "failed");
    if(operationOwner) endGoogleSheetOperation(operationOwner);
    return { ok: false, message: validateGoogleSheetConfig(loadGoogleSheetConfig()).message };
  }
  try{
    if(!options.sourcesAlreadySent){
      try{
        const sourceRecords = getPlantingEventSourceRecords(event);
        const sourceReferences = (event?.sourceAllocations || []).slice(0, 3).map(allocation => {
          const source = sourceRecords.find(record => Number(record.id) === Number(allocation.harvestRecordId));
          const sourceDate = String(source?.date || "日付不明").slice(0, 10);
          return `${sourceDate} / ID:${String(allocation.harvestRecordId || "不明").slice(0, 20)}`;
        });
        const remainingSourceCount = Math.max(0, (event?.sourceAllocations || []).length - sourceReferences.length);
        const sourceReferenceText = sourceReferences.length
          ? `（${sourceReferences.join("、")}${remainingSourceCount ? `、ほか${remainingSourceCount}件` : ""}）`
          : "";
        if(sourceRecords.length !== event.sourceAllocations.length){
          throw new Error("苗植え元の収穫記録がアプリ内にありません" + sourceReferenceText);
        }
        const recordStatus = loadGoogleSheetSyncStatus();
        const sourceRecordsToSend = sourceRecords.filter(source => !isGoogleSheetRecordConfirmed(source, recordStatus));
        if(sourceRecordsToSend.length){
          const sourceResult = await sendRecordsBatchToGoogleSheet(sourceRecordsToSend, {
            showFailureDialog: false,
            showConfigNotice: false
          });
          if(sourceResult.failCount > 0){
            throw new Error(
              (sourceResult.errorMessage || "苗植え元の収穫記録を先に送信できませんでした") +
              sourceReferenceText
            );
          }
        }
      }catch(e){
        throw new Error("苗植え元の収穫記録の送信中に失敗しました: " + String(e?.message || e));
      }
    }
    let result;
    try{
      result = await postGoogleSheetPlantingEvent(event, "save", { config, silent: true });
    }catch(e){
      const eventReference = `苗植え日:${String(event?.plantingDate || "不明").slice(0, 10)} / ID:${String(event?.eventId || "不明").slice(0, 20)}`;
      throw new Error(
        "苗植えイベント本体の送信中に失敗しました（" + eventReference + "）: " +
        String(e?.message || e)
      );
    }
    return {
      ok: true,
      updated: !!result.updated,
      message: result.message || "",
      syncRevision: normalizeGoogleSheetSyncRevision(result.syncRevision)
    };
  }catch(e){
    setPlantingEventSyncStatus(event, "failed");
    return { ok: false, message: String(e?.message || e) };
  }finally{
    if(operationOwner) endGoogleSheetOperation(operationOwner);
  }
}

async function sendGoogleSheetRecordMutation(payload, failureMessage, options = {}){
  const validation = validateGoogleSheetConfig(loadGoogleSheetConfig());
  if(!validation.ok) throw new Error(validation.message);
  const config = validation.config;
  const recordValidation = validateRecordForGoogleTransfer(payload?.record, { enforceDuplicateKey: false });
  if(!recordValidation.ok) throw new Error(recordValidation.message);
  const suppliedOwner = options.operationOwner || null;
  const operationOwner = suppliedOwner || beginGoogleSheetOperation("sending");
  if(!operationOwner || operationOwner !== googleSheetOperationOwner){
    throw new Error(getGoogleSheetOperationBusyMessage("操作"));
  }
  let timer = null;

  try{
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), GOOGLE_SHEET_BATCH_TIMEOUT_MS);
    const requestBody = buildValidatedGoogleSheetRequestBody({ ...payload, token: config.token });
    const response = await fetch(config.url, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: requestBody,
      signal: controller.signal
    });
    const text = await response.text();
    if(!isWithinGoogleSheetResponseLimits(text)) throw new Error("スプレッドシートの応答が大きすぎます");
    let result;
    try{
      result = text ? JSON.parse(text) : {};
    }catch(e){
      throw new Error("スプレッドシートの応答を読み込めません");
    }
    if(result.ok !== true) throw new Error(result.message || failureMessage);
    acknowledgeGoogleSheetMutationRevision(config, payload?.syncRevision, result);
    return result;
  }catch(e){
    if(e?.name === "AbortError") throw new Error("スプレッドシートとの通信がタイムアウトしました");
    throw e;
  }finally{
    if(timer !== null) clearTimeout(timer);
    if(!suppliedOwner) endGoogleSheetOperation(operationOwner);
  }
}

function deleteRecordFromGoogleSheet(record, options = {}){
  const config = loadGoogleSheetConfig();
  return sendGoogleSheetRecordMutation(
    buildGoogleSheetRecordDeletePayload(record, config),
    "スプレッドシート側の記録を削除できませんでした",
    options
  );
}

function restoreRecordToGoogleSheet(record, options = {}){
  const config = loadGoogleSheetConfig();
  return sendGoogleSheetRecordMutation(
    buildGoogleSheetRecordRestorePayload(record, config),
    "スプレッドシート側の記録を復元できませんでした",
    options
  );
}
