// ===== モニター：内容の同期・通知・編集 =====
function buildGoogleSheetMonitorContentPayload(config){
  return {
    app: "Harvestnavi",
    type: "harvest-monitor-content",
    action: "getMonitorContent",
    version: 1,
    token: config.token || ""
  };
}

function buildGoogleSheetMonitorSavePayload(config, content){
  const saveContent = { ...(content || {}) };
  delete saveContent.version;
  delete saveContent.updatedAt;
  return {
    app: "Harvestnavi",
    type: "harvest-monitor-save",
    action: "saveMonitorContent",
    version: 1,
    token: config.token || "",
    content: saveContent
  };
}

function buildGoogleSheetMonitorHistoryPayload(config, options = {}){
  return {
    app: "Harvestnavi",
    type: "harvest-monitor-history",
    action: "listMonitorHistory",
    version: 1,
    token: config.token || "",
    limit: clampNumber(options.limit, 1, GOOGLE_SHEET_MAX_HISTORY_ITEMS, 20)
  };
}

function extractMonitorContentFromGoogleSheetResponse(result){
  if(!result || typeof result !== "object") return null;
  if(result.content && typeof result.content === "object") return result.content;
  if(result.monitor && typeof result.monitor === "object") return result.monitor;
  return result;
}

function normalizeMonitorMemoItems(items, fallbackText = ""){
  if(Array.isArray(items)){
    return items.map(item => String(item ?? ""));
  }
  const fallbackMemoText = String(fallbackText || "");
  return fallbackMemoText ? [fallbackMemoText] : [];
}

function getMonitorMemoTextFromItems(items){
  return normalizeMonitorMemoItems(items)
    .map(item => String(item || "").trim())
    .filter(Boolean)
    .join("\n\n");
}

function getMonitorMemoItemsFromText(text){
  return String(text || "")
    .split(/\n{2,}/)
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeRemoteMonitorContent(content){
  if(!content || typeof content !== "object" || Array.isArray(content)) return null;
  if(Object.prototype.hasOwnProperty.call(content, "palletRanges")) return null;
  if(content.version !== undefined && content.version !== null && content.version !== ""
    && getStrictIntegerInRange(content.version, 0, Number.MAX_SAFE_INTEGER) === null) return null;
  if(content.updatedAt !== undefined && content.updatedAt !== null
    && (typeof content.updatedAt !== "string" || !isBoundedTextValue(content.updatedAt.trim(), 64))) return null;
  if(content.instructionText !== undefined && content.instructionText !== null && typeof content.instructionText !== "string") return null;
  if(content.memoText !== undefined && content.memoText !== null && typeof content.memoText !== "string") return null;
  if(!isBoundedTextValue(content.instructionText, MONITOR_MAX_INSTRUCTION_LENGTH)) return null;
  if(!isBoundedTextValue(content.memoText, MONITOR_MAX_MEMO_LENGTH)) return null;
  if(content.memoItems !== undefined && content.memoItems !== null && !Array.isArray(content.memoItems)) return null;
  if(Array.isArray(content.memoItems) && content.memoItems.length > MONITOR_MAX_MEMO_ITEMS) return null;
  if(Array.isArray(content.memoItems) && content.memoItems.some(item => typeof item !== "string" || !isBoundedTextValue(item, MONITOR_MAX_MEMO_ITEM_LENGTH))) return null;
  if(Array.isArray(content.harvestFillKeys) && content.harvestFillKeys.length > RECORD_MAX_PALLET_KEYS) return null;
  if(content.harvestFillKeys !== undefined && content.harvestFillKeys !== null && !Array.isArray(content.harvestFillKeys)) return null;
  if(Array.isArray(content.harvestFillKeys) && content.harvestFillKeys.some(item => typeof item !== "string" || !isValidTransferPalletItem(item))) return null;

  if(content.enabled !== undefined && content.enabled !== null && content.enabled !== ""){
    const enabledText = String(content.enabled).trim().toLowerCase();
    if(!["true", "1", "yes", "on", "有効", "使う", "false", "0", "no", "off", "無効", "使わない"].includes(enabledText)) return null;
  }

  const enabled = content.enabled === true || ["true", "1", "yes", "on", "有効", "使う"].includes(String(content.enabled || "").trim().toLowerCase());
  const harvestKeys = expandPalletKeyItemsToKeys(content.harvestFillKeys);
  const memoItems = normalizeMonitorMemoItems(content.memoItems, content.memoText);
  if(getMonitorMemoTextFromItems(memoItems).length > MONITOR_MAX_MEMO_LENGTH) return null;
  const uniqueHarvestKeys = [...new Set(harvestKeys)].sort((a, b) => getOrderIndexFromKey(a) - getOrderIndexFromKey(b));
  if(uniqueHarvestKeys.length > RECORD_MAX_PALLET_KEYS) return null;
  return {
    enabled,
    version: String(content.version ?? ""),
    updatedAt: String(content.updatedAt ?? ""),
    instructionText: String(content.instructionText || ""),
    memoText: String(content.memoText || memoItems.join("\n\n")),
    memoItems,
    harvestFillKeys: uniqueHarvestKeys
  };
}

function getMonitorRemoteSignature(content){
  if(!content || !content.enabled) return "disabled";
  return JSON.stringify({
    version: content.version,
    updatedAt: content.updatedAt,
    instructionText: content.instructionText,
    memoText: content.memoText,
    memoItems: content.memoItems,
    harvestFillKeys: content.harvestFillKeys
  });
}

function getMonitorNotificationRevision(content){
  const normalized = normalizeRemoteMonitorContent(content);
  const source = normalized ? JSON.stringify({
    enabled: normalized.enabled,
    instructionText: normalized.instructionText,
    memoText: normalized.memoText,
    memoItems: normalized.memoItems,
    harvestFillKeys: normalized.harvestFillKeys
  }) : "invalid";
  let first = 2166136261;
  let second = 5381;
  for(let index = 0; index < source.length; index++){
    const code = source.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second, 33) ^ code;
  }
  return `v1-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}-${source.length.toString(36)}`;
}

async function getMonitorFirebaseClient(){
  if(monitorFirebaseClientPromise) return monitorFirebaseClientPromise;

  const sdkBaseUrl = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
  const request = (async () => {
    const [appModule, authModule, databaseModule] = await Promise.all([
      import(`${sdkBaseUrl}/firebase-app.js`),
      import(`${sdkBaseUrl}/firebase-auth.js`),
      import(`${sdkBaseUrl}/firebase-database.js`)
    ]);
    const appName = "harvestnavi-monitor-signal";
    const existingApp = appModule.getApps().find(item => item.name === appName);
    const app = existingApp || appModule.initializeApp(FIREBASE_MONITOR_CONFIG, appName);
    const auth = authModule.getAuth(app);
    if(typeof auth.authStateReady === "function"){
      await auth.authStateReady();
    }
    if(!auth.currentUser){
      await authModule.signInAnonymously(auth);
    }
    return {
      database: databaseModule.getDatabase(app, FIREBASE_MONITOR_CONFIG.databaseURL),
      databaseModule
    };
  })();
  monitorFirebaseClientPromise = request;
  try{
    return await request;
  }catch(error){
    if(monitorFirebaseClientPromise === request) monitorFirebaseClientPromise = null;
    throw error;
  }
}

async function notifyMonitorUpdateWithFirebase(content){
  try{
    const client = await getMonitorFirebaseClient();
    const signalRef = client.databaseModule.ref(client.database, FIREBASE_MONITOR_SIGNAL_PATH);
    await client.databaseModule.set(signalRef, {
      revision: getMonitorNotificationRevision(content),
      updatedAt: client.databaseModule.serverTimestamp()
    });
    return true;
  }catch(error){
    console.warn("Firebase monitor notification failed", error);
    return false;
  }
}

function startMonitorFallbackPolling(){
  if(monitorRemotePollTimer || !isMonitorModeOpen) return;
  monitorRemotePollTimer = setInterval(() => {
    queueMonitorRefreshFromNotification();
  }, MONITOR_FALLBACK_POLL_INTERVAL_MS);
}

function stopMonitorFallbackPolling(){
  if(!monitorRemotePollTimer) return;
  clearInterval(monitorRemotePollTimer);
  monitorRemotePollTimer = null;
}

function isCurrentMonitorContentAtLeastFirebaseSignal(){
  if(!monitorFirebaseLastRevision) return true;
  if(getMonitorNotificationRevision(monitorRemoteFetchedContent) === monitorFirebaseLastRevision) return true;
  const contentUpdatedAt = Date.parse(String(monitorRemoteFetchedContent?.updatedAt || ""));
  return Number.isFinite(contentUpdatedAt)
    && monitorFirebaseLastSignalUpdatedAt > 0
    && contentUpdatedAt >= monitorFirebaseLastSignalUpdatedAt;
}

function queueMonitorRefreshFromNotification(){
  if(!isMonitorModeOpen) return;
  if(monitorRemotePollInFlight){
    monitorRemoteRefreshPending = true;
    return;
  }
  fetchMonitorRemoteContent({ silentErrors: true }).then(content => {
    if(!isMonitorModeOpen) return;
    if(!content){
      startMonitorFallbackPolling();
      return;
    }
    if(monitorFirebaseConnected && monitorFirebaseListenerReady && isCurrentMonitorContentAtLeastFirebaseSignal()){
      stopMonitorFallbackPolling();
    }
  }).catch(error => {
    console.warn("Monitor refresh after Firebase notification failed", error);
    startMonitorFallbackPolling();
  });
}

async function startMonitorFirebaseUpdates(generation){
  try{
    const client = await getMonitorFirebaseClient();
    if(!isMonitorModeOpen || generation !== monitorFirebaseListenerGeneration) return;

    const signalRef = client.databaseModule.ref(client.database, FIREBASE_MONITOR_SIGNAL_PATH);
    monitorFirebaseSignalUnsubscribe = client.databaseModule.onValue(signalRef, snapshot => {
      if(generation !== monitorFirebaseListenerGeneration) return;
      monitorFirebaseListenerReady = true;
      const signal = snapshot.val();
      const revision = typeof signal?.revision === "string" ? signal.revision : "";
      monitorFirebaseLastRevision = revision;
      monitorFirebaseLastSignalUpdatedAt = Number.isFinite(Number(signal?.updatedAt))
        ? Number(signal.updatedAt)
        : 0;
      if(isCurrentMonitorContentAtLeastFirebaseSignal()){
        if(monitorFirebaseConnected) stopMonitorFallbackPolling();
      }else{
        queueMonitorRefreshFromNotification();
      }
    }, error => {
      console.warn("Firebase monitor listener failed", error);
      if(generation !== monitorFirebaseListenerGeneration) return;
      monitorFirebaseListenerReady = false;
      startMonitorFallbackPolling();
      if(!monitorFirebaseFallbackNoticeShown){
        monitorFirebaseFallbackNoticeShown = true;
        showToast("更新通知に接続できないため定期確認に切り替えました");
      }
    });

    const connectionRef = client.databaseModule.ref(client.database, ".info/connected");
    monitorFirebaseConnectionUnsubscribe = client.databaseModule.onValue(connectionRef, snapshot => {
      if(generation !== monitorFirebaseListenerGeneration) return;
      monitorFirebaseConnected = snapshot.val() === true;
      if(monitorFirebaseConnected && monitorFirebaseListenerReady && isCurrentMonitorContentAtLeastFirebaseSignal()){
        stopMonitorFallbackPolling();
      }else{
        startMonitorFallbackPolling();
      }
    });
  }catch(error){
    console.warn("Firebase monitor setup failed", error);
    if(generation !== monitorFirebaseListenerGeneration) return;
    startMonitorFallbackPolling();
    if(!monitorFirebaseFallbackNoticeShown){
      monitorFirebaseFallbackNoticeShown = true;
      showToast("更新通知に接続できないため定期確認に切り替えました");
    }
  }
}

function isMonitorRemoteContentFresh(maxAgeMs = MONITOR_PREVIEW_PREFETCH_MAX_AGE_MS){
  if(!monitorRemoteFetchedAt) return false;
  const elapsed = Date.now() - monitorRemoteFetchedAt;
  return elapsed >= 0 && elapsed <= maxAgeMs;
}

function prefetchMonitorRemoteContent(){
  const config = getValidatedGoogleSheetConfig({ silent: true });
  if(!config) return Promise.resolve(null);
  if(isMonitorRemoteContentFresh()) return Promise.resolve(monitorRemoteFetchedContent);
  if(monitorRemotePrefetchPromise) return monitorRemotePrefetchPromise;

  const request = fetchMonitorRemoteContent({ silentErrors: true });
  monitorRemotePrefetchPromise = request;
  const clearRequest = () => {
    if(monitorRemotePrefetchPromise === request){
      monitorRemotePrefetchPromise = null;
    }
  };
  request.then(clearRequest, clearRequest);
  return request;
}

async function refreshMonitorMemoInputsOnTabOpen(){
  const generation = ++monitorMemoRemoteLoadGeneration;
  if(monitorMemoInputsDirty) return;
  let content = null;
  try{
    content = await prefetchMonitorRemoteContent();
  }catch(error){
    console.warn("Monitor memo prefetch failed", error);
  }
  if(generation !== monitorMemoRemoteLoadGeneration
    || activeAppTab !== "monitor"
    || monitorMemoInputsDirty
    || !content) return;

  const remoteItems = normalizeMonitorMemoItems(content.memoItems, content.memoText);
  const currentItems = getMonitorMemoInputValues();
  if(JSON.stringify(remoteItems) === JSON.stringify(currentItems)) return;
  renderMonitorMemoInputs(remoteItems);
  monitorMemoInputsDirty = false;
  saveHarvestStateToStorage();
}

async function getFreshMonitorRemoteContent(){
  if(isMonitorRemoteContentFresh()) return monitorRemoteFetchedContent;

  if(monitorRemotePrefetchPromise){
    await monitorRemotePrefetchPromise;
    if(isMonitorRemoteContentFresh()) return monitorRemoteFetchedContent;
  }

  const latestContent = await fetchMonitorRemoteContent({ silentErrors: true, force: true });
  if(isMonitorRemoteContentFresh()) return monitorRemoteFetchedContent;
  return latestContent || monitorRemoteFetchedContent;
}

async function fetchMonitorRemoteContent(options = {}){
  const config = getValidatedGoogleSheetConfig({ silent: !!options.silentErrors });
  if(!config || (monitorRemotePollInFlight && !options.force)) return null;

  monitorRemotePollInFlight = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOOGLE_SHEET_TIMEOUT_MS);
  const payload = buildValidatedGoogleSheetRequestBody(buildGoogleSheetMonitorContentPayload(config));

  try{
    const response = await fetch(config.url, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: payload,
      signal: controller.signal
    });

    const text = await response.text();
    if(!isWithinGoogleSheetResponseLimits(text)){
      throw new Error("モニター設定の応答が大きすぎます");
    }
    let result = {};
    try{
      result = text ? JSON.parse(text) : {};
    }catch(e){
      throw new Error("モニター設定の応答を読み込めません");
    }

    if(result.ok !== true){
      throw new Error(result.message || "モニター設定を取得できません");
    }

    const nextContent = normalizeRemoteMonitorContent(extractMonitorContentFromGoogleSheetResponse(result));
    if(!nextContent) throw new Error("モニター設定に不正な値が含まれています");
    const nextSignature = getMonitorRemoteSignature(nextContent);
    const changed = nextSignature !== monitorRemoteSignature;
    monitorRemoteSignature = nextSignature;
    monitorRemoteFetchedContent = nextContent;
    monitorRemoteFetchedAt = Date.now();
    monitorRemoteContent = nextContent && nextContent.enabled ? nextContent : null;
    renderMonitorTabControls();

    if(changed && isMonitorModeOpen){
      renderMonitorMode();
    }
    return nextContent;
  }catch(e){
    if(!options.silentErrors){
      showToast("モニター設定を取得できませんでした");
    }
    return null;
  }finally{
    clearTimeout(timer);
    monitorRemotePollInFlight = false;
    if(monitorRemoteRefreshPending && isMonitorModeOpen){
      monitorRemoteRefreshPending = false;
      queueMonitorRefreshFromNotification();
    }
  }
}

function startMonitorRemoteUpdates(){
  stopMonitorRemoteUpdates({ keepContent: true });
  const config = getValidatedGoogleSheetConfig({ silent: true });
  if(!config){
    monitorRemoteContent = null;
    monitorRemoteSignature = "";
    monitorRemoteFetchedContent = null;
    monitorRemoteFetchedAt = 0;
    return;
  }

  prefetchMonitorRemoteContent();
  const generation = monitorFirebaseListenerGeneration;
  startMonitorFallbackPolling();
  startMonitorFirebaseUpdates(generation);
}

function stopMonitorRemoteUpdates(options = {}){
  monitorFirebaseListenerGeneration++;
  if(monitorFirebaseSignalUnsubscribe) monitorFirebaseSignalUnsubscribe();
  if(monitorFirebaseConnectionUnsubscribe) monitorFirebaseConnectionUnsubscribe();
  monitorFirebaseSignalUnsubscribe = null;
  monitorFirebaseConnectionUnsubscribe = null;
  monitorRemoteRefreshPending = false;
  monitorFirebaseLastRevision = "";
  monitorFirebaseLastSignalUpdatedAt = 0;
  monitorFirebaseConnected = false;
  monitorFirebaseListenerReady = false;
  stopMonitorFallbackPolling();
  if(!options.keepContent){
    monitorRemoteContent = null;
    monitorRemoteSignature = "";
    monitorRemoteFetchedContent = null;
    monitorRemoteFetchedAt = 0;
  }
}

function setMonitorRemoteEditorStatus(message){
  const status = document.getElementById("monitorRemoteEditorStatus");
  if(status){
    status.textContent = String(message || "");
    status.hidden = !status.textContent;
  }
}

function renderMonitorEditHistoryList(history){
  const box = document.getElementById("monitorEditHistoryList");
  if(!box) return;
  const list = Array.isArray(history)
    ? history.slice(0, GOOGLE_SHEET_MAX_HISTORY_ITEMS).map(item => {
        if(!item || typeof item !== "object" || Array.isArray(item)) return null;
        if(!isBoundedTextValue(item.savedAt, 128) || !isBoundedTextValue(item.version, 128)) return null;
        const normalized = normalizeRemoteMonitorContent({ ...item, enabled: true });
        return normalized ? { ...normalized, savedAt: String(item.savedAt || "") } : null;
      }).filter(Boolean)
    : [];
  if(!list.length){
    box.innerHTML = `<div class="monitorEmpty">編集履歴はまだありません。</div>`;
    return;
  }

  box.innerHTML = list.map(item => {
    const instructionPreview = String(item.instructionText || "")
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean)
      .slice(0, 3)
      .join(" / ");
    const memoPreview = getMonitorMemoTextFromItems(item.memoItems) || String(item.memoText || "").trim();
    return `
      <div class="recordItem">
        <div class="recordTitle">${escapeHtml(item.savedAt || "-")} 更新番号 ${escapeHtml(item.version || "-")}</div>
        <div class="recordMeta">${escapeHtml(instructionPreview || "指示内容なし")}
${memoPreview ? "メモ: " + escapeHtml(memoPreview) : ""}</div>
      </div>
    `;
  }).join("");
}

function getMonitorRemoteEditorElements(){
  return {
    seedlingInput: document.getElementById("monitorRemoteSeedlingValueInput"),
    casesInput: document.getElementById("monitorRemoteCasesValueInput"),
    harvestLocationInput: document.getElementById("monitorRemoteHarvestLocationValueInput"),
    remainingCasesInput: document.getElementById("monitorRemoteRemainingCasesValueInput")
  };
}

function getEmptyMonitorInstructionFields(){
  return {
    seedling: "",
    cases: "",
    harvestLocation: "",
    remainingCases: ""
  };
}

function parseMonitorInstructionFields(text){
  const fields = getEmptyMonitorInstructionFields();
  const labelToKey = {
    "苗": "seedling",
    "収穫ケース数": "cases",
    "収穫場所": "harvestLocation",
    "残すケース": "remainingCases"
  };
  const normalizedText = String(text || "").replace(/\s*\/\s*収穫ケース数\s*[:：]/g, "\n収穫ケース数:");
  const lines = normalizedText.split("\n");
  let activeKey = "";

  lines.forEach(line => {
    const match = String(line || "").match(/^\s*([^:：\n]+)[:：]\s*(.*)$/);
    const nextKey = match ? labelToKey[String(match[1] || "").trim()] : "";
    if(nextKey){
      activeKey = nextKey;
      fields[activeKey] = String(match[2] || "").trim();
      return;
    }

    if(activeKey && String(line || "").trim()){
      fields[activeKey] = fields[activeKey]
        ? fields[activeKey] + "\n" + String(line || "")
        : String(line || "");
    }
  });

  return fields;
}

function buildMonitorInstructionTextFromFields(fields){
  const source = fields || {};
  const seedling = removeSeedlingAutoNote(source.seedling);
  const cases = String(source.cases || "").trim();
  const harvestLocation = String(source.harvestLocation || "").trim();
  const remainingCases = String(source.remainingCases || "").trim();
  const lines = [
    "苗: " + seedling + " / 収穫ケース数: " + cases
  ];

  lines.push("収穫場所: " + harvestLocation);
  lines.push("残すケース: " + remainingCases);
  return lines.join("\n");
}

function removeSeedlingAutoNote(value){
  return String(value || "")
    .replace(/（自動:\s*\d+枚）/g, "")
    .replace(/\(自動:\s*\d+枚\)/g, "")
    .trim();
}

function getMonitorCasePlacementSummaryText(keys = []){
  const remainingLines = String(getCasePlacementSummaryText() || "")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
  const remainingByBuilding = {};
  const otherLines = [];
  remainingLines.forEach(line => {
    const building = Number(line.match(/^(\d+)号棟/)?.[1]);
    if(BUILDINGS.includes(building)){
      if(!remainingByBuilding[String(building)]) remainingByBuilding[String(building)] = [];
      remainingByBuilding[String(building)].push(line);
    }else if(line !== "なし"){
      otherLines.push(line);
    }
  });

  const selectedBuildings = new Set();
  (Array.isArray(keys) ? keys : []).forEach(key => {
    const parsed = parsePalletKey(String(key || ""));
    if(BUILDINGS.includes(parsed.building)) selectedBuildings.add(parsed.building);
  });
  const processingOrder = getCasePlacementProcessingOrder();
  const lines = [];
  processingOrder.forEach(building => {
    const placement = getCasePlacementForBuilding(building);
    const total = placement.front + placement.middle + placement.back;
    const buildingRemainingLines = remainingByBuilding[String(building)] || [];
    if(total <= 0 && !selectedBuildings.has(building) && !buildingRemainingLines.length) return;
    lines.push(`${building}号棟 配置: ${total}ケース`);
    lines.push(...buildingRemainingLines);
  });
  lines.push(...otherLines);
  return lines.length ? lines.join("\n") : "なし";
}

function getCurrentMonitorInstructionFields(){
  const casePlan = getHarvestCasePlan();
  const seedlingCounts = getSeedlingInstructionCounts();
  const remainingKeys = getHarvestProgressRemainingSelectionKeys();
  const completedCases = getHarvestProgressActualCases() + casePlan.partialCases;
  const casesText = hasAppliedHarvestProgress()
    ? `${formatHarvestProgressCases(getHarvestProgressRemainingTargetCases())}ケース\n目標 ${formatHarvestProgressCases(casePlan.totalCases)}ケース / 収穫済み ${formatHarvestProgressCases(completedCases)}ケース`
    : String(casePlan.totalCases);
  const skipSeedlingText = getHarvestOrderSkipSeedlingText();
  const unplantedSeedlingText = `（未定植分 ${seedlingCounts.additionalCount}枚）`;
  const seedlingText = getSeedlingInstructionTextForMonitor(
    seedlingCounts.totalCount,
    seedlingCounts.carryoverSeedlings
  ).replace(/^苗:\s*/, "")
    + unplantedSeedlingText
    + (skipSeedlingText ? `（${skipSeedlingText}）` : "");
  return {
    seedling: seedlingText,
    cases: casesText,
    harvestLocation: formatHarvestLocationInstruction(remainingKeys).replace(/^収穫場所:\s*/, ""),
    remainingCases: getMonitorCasePlacementSummaryText(remainingKeys)
  };
}

function populateMonitorRemoteEditor(content){
  const els = getMonitorRemoteEditorElements();
  const normalized = normalizeRemoteMonitorContent(content || {}) || {
    enabled: false,
    instructionText: "",
    memoText: "",
    memoItems: [],
    harvestFillKeys: []
  };
  const fields = parseMonitorInstructionFields(normalized.instructionText || "");
  monitorRemoteEditorHarvestFillKeys = Array.isArray(normalized.harvestFillKeys) ? normalized.harvestFillKeys : [];
  if(els.seedlingInput) els.seedlingInput.value = fields.seedling;
  if(els.casesInput) els.casesInput.value = fields.cases;
  if(els.harvestLocationInput) els.harvestLocationInput.value = fields.harvestLocation;
  if(els.remainingCasesInput) els.remainingCasesInput.value = fields.remainingCases;
  renderMonitorRemoteMemoInputs(normalized.memoItems || normalizeMonitorMemoItems(null, normalized.memoText || ""));
}

function readMonitorRemoteEditorContent(){
  const els = getMonitorRemoteEditorElements();
  const fields = {
    seedling: els.seedlingInput?.value || "",
    cases: els.casesInput?.value || "",
    harvestLocation: els.harvestLocationInput?.value || "",
    remainingCases: els.remainingCasesInput?.value || ""
  };
  return {
    enabled: true,
    instructionText: buildMonitorInstructionTextFromFields(fields),
    memoText: getMonitorMemoTextFromItems(getMonitorRemoteMemoInputValues()),
    memoItems: getMonitorRemoteMemoInputValues(),
    harvestFillKeys: compressPalletKeysToRanges(monitorRemoteEditorHarvestFillKeys)
  };
}

function buildCalculatedMonitorRemoteContent(){
  const memoItems = getMonitorMemoInputValues();
  const remainingKeys = getHarvestProgressRemainingSelectionKeys();

  return {
    enabled: true,
    instructionText: buildMonitorInstructionTextFromFields(getCurrentMonitorInstructionFields()),
    memoText: getMonitorMemoTextFromItems(memoItems),
    memoItems,
    harvestFillKeys: compressPalletKeysToRanges(remainingKeys)
  };
}

function getMonitorContentDraftBaseSignature(){
  const content = buildCalculatedMonitorRemoteContent();
  return hashWorkflowCheckpoint(JSON.stringify({
    instructionText: content.instructionText,
    harvestFillKeys: content.harvestFillKeys
  }));
}

function getActiveMonitorContentDraft(){
  if(!monitorContentDraftOverride || !monitorContentDraftBaseSignature) return null;
  if(monitorContentDraftBaseSignature !== getMonitorContentDraftBaseSignature()) return null;
  return normalizeRemoteMonitorContent(monitorContentDraftOverride);
}

function buildCurrentMonitorRemoteContent(){
  const draft = getActiveMonitorContentDraft();
  if(!draft) return buildCalculatedMonitorRemoteContent();
  return {
    enabled:true,
    instructionText:draft.instructionText,
    memoText:getMonitorMemoTextFromItems(draft.memoItems),
    memoItems:draft.memoItems,
    harvestFillKeys:compressPalletKeysToRanges(draft.harvestFillKeys)
  };
}

function fillMonitorRemoteEditorFromCurrentState(){
  const content = buildCurrentMonitorRemoteContent();
  populateMonitorRemoteEditor(content);
  setMonitorRemoteEditorStatus("");
}

function discardMonitorCurrentEditor(){
  populateMonitorRemoteEditor(buildCurrentMonitorRemoteContent());
  closeMonitorEditorWindow();
  showToast("入力途中の編集を破棄しました");
}

function applyMonitorCurrentEditor(){
  const editedContent = normalizeRemoteMonitorContent(readMonitorRemoteEditorContent());
  if(!editedContent){
    setMonitorRemoteEditorStatus("入力内容が長すぎるか、使用できない値が含まれています。");
    showToast("編集内容を反映できませんでした");
    return;
  }

  monitorContentDraftBaseSignature = getMonitorContentDraftBaseSignature();
  monitorContentDraftOverride = {
    enabled:true,
    instructionText:editedContent.instructionText,
    memoText:getMonitorMemoTextFromItems(editedContent.memoItems),
    memoItems:editedContent.memoItems,
    harvestFillKeys:compressPalletKeysToRanges(editedContent.harvestFillKeys)
  };
  renderMonitorMemoInputs(editedContent.memoItems);
  monitorMemoInputsDirty = true;
  invalidateWorkflowMonitorCheckpoint();
  renderForecastSummary();
  saveHarvestStateToStorage();
  closeMonitorEditorWindow();
  showToast("今回送る内容を変更しました");
}

function setCurrentMonitorSaveLoading(isLoading, message = "モニターへ送信中…"){
  const button = document.getElementById("monitorSaveBtn");
  const label = document.getElementById("monitorSaveBtnLabel");
  const defaultMessage = "プレビューして送信";
  if(button){
    button.disabled = !!isLoading;
    button.classList.toggle("is-loading", !!isLoading);
    button.setAttribute("aria-busy", isLoading ? "true" : "false");
    button.setAttribute("aria-label", isLoading ? message : defaultMessage);
  }
  if(label) label.textContent = isLoading ? message : defaultMessage;
}

async function saveCurrentMonitorRemoteContent(){
  if(monitorCurrentSaveInProgress) return;
  monitorCurrentSaveInProgress = true;
  setCurrentMonitorSaveLoading(true, "プレビューを準備中…");

  try{
    const content = buildCurrentMonitorRemoteContent();
    const workflowSignature = getWorkflowPlanFingerprint();
    const workflowPlanWasReady = getWorkflowPlanStatus().ready;
    const shouldSave = await showMonitorPreviewConfirm(content);
    if(!shouldSave) return;

    setCurrentMonitorSaveLoading(true, "モニターへ送信中…");
    populateMonitorRemoteEditor({
      ...content,
      harvestFillKeys
    });
    const saved = await saveMonitorRemoteEditor({ currentWorkflowPlan: true });
    if(saved){
      monitorMemoInputsDirty = false;
      workflowMonitorCheckpointSignature = workflowPlanWasReady ? workflowSignature : "";
      workflowHarvestRecordingActive = workflowPlanWasReady;
      renderMonitorTabControls();
      saveHarvestStateToStorage();
      updateWorkflowGuide();
      switchToRecordSaveCard({ focus: true });
    }
  }catch(e){
    console.error("Failed to save current monitor content", e);
    showToast("モニターへの送信に失敗しました");
  }finally{
    monitorCurrentSaveInProgress = false;
    setCurrentMonitorSaveLoading(false);
  }
}

async function loadMonitorRemoteEditor(){
  const config = getValidatedGoogleSheetConfig({ statusSetter: setMonitorRemoteEditorStatus });
  if(!config) return;

  setMonitorRemoteEditorStatus("保存内容を読み込み中です...");
  const content = await fetchMonitorRemoteContent({ silentErrors: false });
  if(!content){
    setMonitorRemoteEditorStatus("保存内容を読み込めませんでした。");
    return;
  }

  populateMonitorRemoteEditor(content);
  setMonitorRemoteEditorStatus("保存内容を読み込みました。");
}

async function saveMonitorRemoteContent(content, options = {}){
  const setStatus = typeof options.statusSetter === "function"
    ? options.statusSetter
    : setMonitorRemoteEditorStatus;
  if(!ensureProtectedOperationAccess(options.actionLabel || "モニター編集")){
    setStatus("解除用パスワードを入力してから、もう一度お試しください。");
    return false;
  }
  const config = getValidatedGoogleSheetConfig({ statusSetter: setStatus });
  if(!config) return false;
  const validatedContent = normalizeRemoteMonitorContent(content);
  if(!validatedContent){
    showToast("モニター内容に不正な値があります");
    setStatus("保存できない値、または長すぎる内容が含まれています。");
    return false;
  }

  setStatus("内容を保存中です...");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOOGLE_SHEET_TIMEOUT_MS);

  try{
    const response = await fetch(config.url, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: buildValidatedGoogleSheetRequestBody(buildGoogleSheetMonitorSavePayload(config, validatedContent)),
      signal: controller.signal
    });

    const text = await response.text();
    if(!isWithinGoogleSheetResponseLimits(text)){
      throw new Error("スプレッドシートの応答が大きすぎます");
    }
    let result = {};
    try{
      result = text ? JSON.parse(text) : {};
    }catch(e){
      throw new Error("スプレッドシートの応答を読み込めません");
    }

    if(result.ok !== true){
      throw new Error(result.message || "モニター内容を保存できませんでした");
    }

    const savedContent = normalizeRemoteMonitorContent(extractMonitorContentFromGoogleSheetResponse(result));
    if(options.populateEditor !== false){
      populateMonitorRemoteEditor(savedContent || validatedContent);
    }
    monitorRemoteContent = savedContent && savedContent.enabled ? savedContent : null;
    monitorRemoteSignature = getMonitorRemoteSignature(savedContent);
    monitorRemoteFetchedContent = savedContent || validatedContent;
    monitorRemoteFetchedAt = Date.now();
    if(isMonitorModeOpen) renderMonitorMode();
    if(result.unchanged){
      showToast("前回と同じ内容です");
      setStatus("前回と同じ内容のため、履歴は追加していません。");
    }else{
      showToast("モニター内容を保存しました");
      setStatus("保存しました。履歴に追加し、モニター画面へ更新を通知します。");
      notifyMonitorUpdateWithFirebase(savedContent || validatedContent);
      loadMonitorEditHistory({ silentErrors: true });
    }
    return true;
  }catch(e){
    showToast("モニター内容の保存に失敗しました");
    setStatus("保存に失敗しました: " + String(e && e.message ? e.message : e));
    return false;
  }finally{
    clearTimeout(timer);
  }
}

async function saveMonitorRemoteEditor(options = {}){
  const saved = await saveMonitorRemoteContent(readMonitorRemoteEditorContent());
  if(saved && !options.currentWorkflowPlan){
    renderMonitorMemoInputs(getMonitorRemoteMemoInputValues());
    monitorMemoInputsDirty = false;
    if(workflowMonitorCheckpointSignature || workflowHarvestRecordingActive){
      workflowMonitorCheckpointSignature = "";
      workflowHarvestRecordingActive = false;
    }
    saveHarvestStateToStorage();
  }
  return saved;
}

async function loadMonitorEditHistory(options = {}){
  const silentErrors = !!options.silentErrors;
  const config = getValidatedGoogleSheetConfig({ silent: silentErrors, statusSetter: setMonitorRemoteEditorStatus });
  if(!config) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOOGLE_SHEET_TIMEOUT_MS);

  try{
    const response = await fetch(config.url, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: buildValidatedGoogleSheetRequestBody(buildGoogleSheetMonitorHistoryPayload(config, { limit: 20 })),
      signal: controller.signal
    });

    const text = await response.text();
    if(!isWithinGoogleSheetResponseLimits(text)){
      throw new Error("編集履歴の応答が大きすぎます");
    }
    let result = {};
    try{
      result = text ? JSON.parse(text) : {};
    }catch(e){
      throw new Error("スプレッドシートの応答を読み込めません");
    }

    if(result.ok !== true){
      throw new Error(result.message || "編集履歴を読み込めませんでした");
    }

    if(!Array.isArray(result.history) || result.history.length > GOOGLE_SHEET_MAX_HISTORY_ITEMS){
      throw new Error("編集履歴の件数が上限を超えています");
    }
    renderMonitorEditHistoryList(result.history);
    if(!silentErrors) setMonitorRemoteEditorStatus("編集履歴を読み込みました。");
  }catch(e){
    if(!silentErrors){
      showToast("編集履歴の読み込みに失敗しました");
      setMonitorRemoteEditorStatus("編集履歴の読み込みに失敗しました: " + String(e && e.message ? e.message : e));
    }
  }finally{
    clearTimeout(timer);
  }
}
