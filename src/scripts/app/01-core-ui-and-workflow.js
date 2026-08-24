window.addEventListener("error", event => {
  const message = event.error?.stack || event.message || "不明なエラー";
  document.body.innerHTML = `<div style="padding:20px;font-family:sans-serif;line-height:1.7;">
    <h1 style="font-size:20px;">アプリの起動に失敗しました</h1>
    <p>記録データは削除していません。下の内容を確認してください。</p>
    <pre style="white-space:pre-wrap;background:#f1f5f9;padding:12px;border-radius:8px;">${String(message).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</pre>
    <button id="runtimeErrorRecoveryBtn" type="button" style="width:100%;min-height:48px;border:0;border-radius:12px;background:#334155;color:#fff;font-size:15px;font-weight:800;">前の安定版に戻す</button>
    <div style="margin-top:8px;color:#64748b;font-size:13px;"></div>
  </div>`;
  const recoveryButton = document.getElementById("runtimeErrorRecoveryBtn");
  recoveryButton?.addEventListener("click", () => recoverHarvestnaviPreviousVersion(recoveryButton));
});
const SETTINGS_KEY = "harvestForecastSettings_v16";
const RECORDS_KEY = "harvestForecastRecords_v9";
const PLANTING_EVENTS_KEY = "harvestForecastPlantingEvents_v1";
const PLANTING_EVENT_SYNC_STATUS_KEY = "harvestForecastPlantingEventSyncStatus_v1";
const PLANTING_EVENT_TRASH_KEY = "harvestForecastPlantingEventTrash_v1";
const HARVEST_STATE_KEY = "harvestForecastCurrentState_v1";
const GOOGLE_SHEET_CONFIG_KEY = "harvestForecastGoogleSheetConfig_v1";
const GOOGLE_SHEET_SYNC_STATUS_KEY = "harvestForecastGoogleSheetSyncStatus_v1";
const GOOGLE_SHEET_SYNC_REVISION_KEY = "harvestForecastGoogleSheetSyncRevision_v1";
const GOOGLE_SHEET_SYNC_CONFLICTS_KEY = "harvestForecastGoogleSheetSyncConflicts_v1";
const GOOGLE_SHEET_SYNC_CONFLICT_MAX_ITEMS = 2000;
const RECORD_TRASH_KEY = "harvestForecastRecordTrash_v1";
const RECORD_EXPORT_STATUS_KEY = "harvestForecastRecordExportStatus_v1";
const DASHBOARD_FILTER_KEY = "harvestForecastDashboardFilter_v1";
const PROTECTED_ACCESS_AUTH_KEY = "harvestForecastProtectedAccessAuth_v1";
const WORKFLOW_BAR_VISIBILITY_KEY = "harvestForecastWorkflowBarVisible_v2";
const WORKFLOW_TITLE_HINT_SHOWN_KEY = "harvestnaviWorkflowTitleHintShown_v1";
const WORKFLOW_GUIDE_STATE_KEY = "harvestnaviWorkflowGuideState_v1";
const APP_UPDATE_AUTO_CHECK_AT_KEY = "harvestnaviAppUpdateAutoCheckAt_v1";
const MONITOR_PREVIEW_LAYOUT_KEY = "harvestnaviMonitorPreviewLayout_v1";
const MONITOR_DESIGN_WIDTH = 1280;
const MONITOR_DESIGN_HEIGHT = 720;
const MONITOR_MAX_SCALE = 2;
const GOOGLE_SHEET_TIMEOUT_MS = 10000;
const GOOGLE_SHEET_IMPORT_TIMEOUT_MS = 3 * 60 * 1000;
const GOOGLE_SHEET_BATCH_TIMEOUT_MS = 30000;
const RECORD_AVAILABILITY_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const APP_UPDATE_AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const GOOGLE_SHEET_MAX_REQUEST_CHARS = 500000;
const GOOGLE_SHEET_MAX_REQUEST_BYTES = 1000000;
const GOOGLE_SHEET_MAX_RESPONSE_CHARS = 1000000;
const GOOGLE_SHEET_MAX_RESPONSE_BYTES = 2000000;
const GOOGLE_SHEET_MAX_BATCH_RECORDS = 100;
const GOOGLE_SHEET_MAX_LIST_RECORDS = 1000;
const PLANTING_CANDIDATE_RECORD_LIMIT = 3;
const GOOGLE_SHEET_MAX_LIST_RECORD_TOMBSTONES = 10000;
const GOOGLE_SHEET_MAX_RECORD_SYNC_PAGES = 10;
const GOOGLE_SHEET_MAX_LIST_PLANTING_EVENTS = 1000;
const GOOGLE_SHEET_MAX_LIST_PLANTING_EVENT_TOMBSTONES = 10000;
const GOOGLE_SHEET_MAX_HISTORY_ITEMS = 1000;
const GOOGLE_SHEET_MAX_RECENT_DAYS = 3650;
const RECORD_SYNC_SCHEMA_VERSION = 3;
const RECORD_SYNC_FIELD_KEYS = [
  "plantingCaseInstruction",
  "actualSeedlingCarryoverMode"
];
const RECORD_MAX_ID = Number.MAX_SAFE_INTEGER;
const RECORD_MAX_CASES = 999999;
const RECORD_MAX_SEEDLING_TRAYS = 999999;
const RECORD_MAX_PALLET_KEYS = 3744;
const RECORD_MAX_TARGETS = 48;
const RECORD_MAX_DUPLICATE_KEY_LENGTH = 128;
const RECORD_UUID_MAX_LENGTH = 64;
const RECORD_SYNC_TIMESTAMP_MAX_LENGTH = 64;
const RECORD_MAX_MEMO_LENGTH = 10000;
const RECORD_MAX_SUMMARY_LENGTH = 20000;
const RECORD_MAX_QUALITY_LENGTH = 2000;
const RECORD_MAX_PLANTING_AGE_SUMMARY_LENGTH = 2000;
const RECORD_MAX_PLANTING_AGE_DETAIL_LENGTH = 20000;
const MONITOR_MAX_INSTRUCTION_LENGTH = 20000;
const MONITOR_MAX_MEMO_LENGTH = 50000;
const MONITOR_MAX_MEMO_ITEMS = 100;
const MONITOR_MAX_MEMO_ITEM_LENGTH = 5000;
const RECORD_TRASH_RETENTION_DAYS = 30;
const RECORD_TRASH_RETENTION_MS = RECORD_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const FIREBASE_SDK_VERSION = "12.16.0";
const FIREBASE_MONITOR_CONFIG = Object.freeze({
  apiKey: "AIzaSyBjqY3snw3gAK77MU9T6o_xj7U2KotxI1I",
  authDomain: "harvestnavi.firebaseapp.com",
  databaseURL: "https://harvestnavi-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "harvestnavi",
  storageBucket: "harvestnavi.firebasestorage.app",
  messagingSenderId: "396610265537",
  appId: "1:396610265537:web:7cb4b8a0f34881d43e8f40"
});
const FIREBASE_MONITOR_SIGNAL_PATH = "monitorSignals/main";
const MONITOR_FALLBACK_POLL_INTERVAL_MS = 5 * 60 * 1000;
const MONITOR_PREVIEW_PREFETCH_MAX_AGE_MS = 30000;
const RECORDED_LOOKBACK_COUNT = 7;
const GOOGLE_SHEET_STARTUP_IMPORT_LIMIT = RECORDED_LOOKBACK_COUNT;
const GOOGLE_SHEET_HEADER_IMPORT_LIMIT = RECORDED_LOOKBACK_COUNT;
const CASE_SIZE = 12;
const CALCULATION_LOOKBACK_DAYS = 35;
const HARVEST_CYCLE_GAP_DAYS = 7;
const RECORD_LIST_DISPLAY_LIMIT = 30;
const DASHBOARD_RECORD_FILTER_DELAY_MS = 180;
const HARVEST_STATE_SAVE_DELAY_MS = 250;
const HARVEST_RECORD_LOOKUP_VALIDATION_LIMIT = 24;
const RECORD_EXPORT_PROMPT_COUNT = 300;
const RECORD_BACKUP_MAX_ITEMS = 10000;
const MIN_BUILDING = 2;
const MAX_BUILDING = 9;
const BUILDINGS = [2,3,4,5,6,7,8,9];
const bedMap = ["F","D","B","E","C","A"];
const bedOrder = ["A","B","C","D","E","F"];
const ROWS = 39;
const COLS = 2;
const PALLETS_PER_BED = 78;
const SEEDLING_HOUSE_BUILDING = 1;
const SEEDLING_HOUSE_BED_SEQUENCE = Object.freeze([
  Object.freeze({ bed: "A", direction: 1 }),
  Object.freeze({ bed: "B", direction: 1 }),
  Object.freeze({ bed: "D", direction: -1 }),
  Object.freeze({ bed: "C", direction: -1 }),
  Object.freeze({ bed: "E", direction: 1 }),
  Object.freeze({ bed: "F", direction: 1 })
]);
const SEEDLING_HOUSE_POSITION_COUNT = bedOrder.length * PALLETS_PER_BED;
const CURRENT_PALLET_NUMBERING_VERSION = 2;
const PALLETS_PER_PIN = 4;
const HARVEST_FORECAST_WEEKDAYS = [0, 2, 3, 4, 6];
const DASHBOARD_FORECAST_DAY_COLORS = Object.freeze([
  "#ef4444",
  "#f97316",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
  "#8b5cf6"
]);
const DASHBOARD_FORECAST_LATER_COLOR = "#94a3b8";
const DASHBOARD_FORECAST_EMPTY_COLOR = "#e5e5ea";
const ALLOWED_YIELDS = [20, 16, 12];
const PLANTING_COUNT_BACKFILL_START_DATE = "2026-07-01";
const PLANTING_COUNT_BACKFILL_END_DATE = "2026-07-31";
const PLANTING_COUNT_BACKFILL_VALUE = 12;
const PRESET_ACCESS_PASSWORD = "1234";
const DEFAULT_CASE_PLACEMENT = { front: "", middle: "", back: "" };
const STANDARD_CASE_PLACEMENT = { front: "", middle: 80, back: 40 };

const defaultSettings = {
  defaultLossRate: 0,
  defaultYieldPerPallet: 20,
  defaultPlantingCount: 20,
  useBedLossSettings: false,
  useBedYieldSettings: false,
  useBedPlantSettings: false,
  seedlingLossRate: 0,
  specialPallet60CountPer3: 2,
  seedlingHouseInitialStartKey: "",
  beds: {
    A: { yield: 20, lossRate: "", plant: 20, yieldUseFrontBack: false, yieldFrontCount: 39, yieldFront: 20, yieldBack: 20, plantUseFrontBack: false, plantFrontCount: 39, plantFront: 20, plantBack: 20 },
    B: { yield: 20, lossRate: "", plant: 20, yieldUseFrontBack: false, yieldFrontCount: 39, yieldFront: 20, yieldBack: 20, plantUseFrontBack: false, plantFrontCount: 39, plantFront: 20, plantBack: 20 },
    C: { yield: 20, lossRate: "", plant: 20, yieldUseFrontBack: false, yieldFrontCount: 39, yieldFront: 20, yieldBack: 20, plantUseFrontBack: false, plantFrontCount: 39, plantFront: 20, plantBack: 20 },
    D: { yield: 20, lossRate: "", plant: 20, yieldUseFrontBack: false, yieldFrontCount: 39, yieldFront: 20, yieldBack: 20, plantUseFrontBack: false, plantFrontCount: 39, plantFront: 20, plantBack: 20 },
    E: { yield: 20, lossRate: "", plant: 20, yieldUseFrontBack: false, yieldFrontCount: 39, yieldFront: 20, yieldBack: 20, plantUseFrontBack: false, plantFrontCount: 39, plantFront: 20, plantBack: 20 },
    F: { yield: 20, lossRate: "", plant: 20, yieldUseFrontBack: false, yieldFrontCount: 39, yieldFront: 20, yieldBack: 20, plantUseFrontBack: false, plantFrontCount: 39, plantFront: 20, plantBack: 20 }
  }
};

let settings = loadSettings();
let currentBuilding = 2;
let casePlacementBuilding = 2;
let harvestFillKeys = [];
let harvestSummary = null;
let records = loadRecords();
let plantingEvents = loadPlantingEvents();
let deletedPlantingEvents = loadDeletedPlantingEvents();
let deletedRecords = loadDeletedRecords();
let syncConflicts = loadSyncConflicts();
let activeSyncConflictId = "";
let syncConflictBulkRunning = false;
let workflowPendingRecordCache = null;
let workflowPendingRecordCacheReady = false;
let activeBedActionBed = null;
let activeRecordBedActionBed = null;
let expandedForecastBed = null;
let expandedRecordBed = null;
let activeBedDetailContext = null;
let activeBedDetailBed = null;
let recordDetailReturnFocus = null;
let seedlingHouseReturnFocus = null;
let seedlingHouseSelectedBed = null;
let seedlingHousePrimaryDateEditingEventId = null;
let recordDetailLocationModel = null;
let recordDetailLocationBuilding = null;
let recordDetailLocationSelectedBed = null;
let recordDetailLocationSelectedGroupClass = null;
let recordDetailLocationSelectedPalletKeys = new Set();
let recordDetailDayContext = null;
let recordDetailDayLocationView = "harvest";
let recordDetailLoadToken = 0;
let partialHarvestEditReturnFocus = null;
let dashboardCasesAllReturnFocus = null;
let dashboardForecastInfoReturnFocus = null;
let dashboardCalendarInfoReturnFocus = null;
let dashboardForecastDaysAllReturnFocus = null;
let dashboardRecordCalendarMonth = null;
let palletDragState = null;
let recordCasesEdited = false;
let harvestCasesAutoEstimated = false;
let harvestSelectionMode = "none";
let harvestProgressState = null;
let harvestProgressAvailable = false;
let harvestProgressBuilding = 2;
let recordPlantingSummaryEdited = false;
let activeAppTab = "forecast";
const MAIN_TAB_DEFINITIONS = Object.freeze({
  forecast: { label: "シミュ", afterSelection: prepareForecastMainTabSelection, afterPaint: finishForecastMainTabSelection },
  monitor: { label: "モニター", afterPaint: finishMonitorMainTabSelection },
  record: { label: "記録", loadingTargetId: "recordBeds", afterSelection: prepareRecordMainTabSelection, afterPaint: finishRecordMainTabSelection },
  dashboard: { label: "集計", afterSelection: prepareDashboardMainTabSelection, keepsDashboardRender: true }
});
const MAIN_TAB_NAMES = Object.freeze(Object.keys(MAIN_TAB_DEFINITIONS));
let tabSwitchScheduleId = 0;
let dashboardRenderScheduleId = 0;
let dashboardRenderedDayKey = "";
const dashboardRenderedSubtabs = new Set();
let dashboardRecordFilterTimer = null;
let dashboardHarvestForecastBuilding = null;
let dashboardSeedlingStatusBuilding = null;
let dashboardSeedlingStatusSelectedBed = "F";
let dashboardSeedlingStatusSelectedLotIndex = null;
let dashboardSeedlingStatusDetailOpen = false;
let dashboardSeedlingStatusDetailPositionFrame = 0;
let dashboardSeedlingStatusModelCache = null;
let dashboardHarvestForecastModelCache = null;
let dashboardPastCalendarActive = false;
let dashboardPastCalendarStartMonth = null;
let dashboardPastCalendarItemsByDateCache = null;
let dashboardHarvestForecastCasesValue = null;
let dashboardHarvestForecastLossValue = null;
let dashboardHarvestForecastCasesDraftValue = null;
let dashboardHarvestForecastLossDraftValue = null;
let dashboardHarvestForecastInputsDirty = false;
let harvestStateSaveTimer = null;
let pendingHarvestStateSaveOptions = null;
let harvestStateSaveDeferId = 0;
const tabScrollPositions = {
  forecast: 0,
  monitor: 0,
  record: 0,
  dashboard: 0
};
let recordBaseFillKeys = [];
let recordAdditionalBuildings = [];
let recordSelectionMode = "harvest";
let recordPlantingCountPreset = 20;
let recordPlantingCountsByPallet = {};
let recordPlantingFlowEnabled = false;
let recordPlantingFlowStage = "building";
let recordPlantingFlowBuilding = null;
let recordPlantingCompletedBuildings = [];
let recordPlantingQualityPreset = "medium";
let activePlantingRecordId = null;
let plantingRecordDraft = null;
let plantingAllowedPalletSetCache = null;
let plantingAllowedPalletSetCacheRecordId = null;
let plantingAllowedPalletSetCacheRecordCount = 0;
let plantingAllowedPalletSetCacheEventId = null;
let plantingEventStateCache = null;
let plantingEventStateCacheKey = "";
let harvestRecordLookupCache = new Map();
let harvestRecordEditTimelineCache = null;
let harvestRecordEditTimelineCacheId = null;
let harvestRecordEditTimelineCacheRecordCount = 0;
let harvestRecordEditTimelineCacheDate = "";
let plantingDateByPalletCache = new Map();
let plantingStateByPalletCache = new Map();
let harvestRecordLookupEnabled = true;
let harvestRecordLookupValidationRemaining = HARVEST_RECORD_LOOKUP_VALIDATION_LIMIT;
let recordHistoryCache = null;
let editingPlantingEventId = null;
let editingHarvestRecordId = null;
let editingPartialHarvestRecordId = null;
let editingHarvestSelectionKeys = null;
let forecastSelectionState = null;
let settingsDirty = false;
let casePlacementByBuilding = {};
let appUpdateConfirmResolver = null;
let plantingUnselectedWarningResolver = null;
let recordSeedlingReselectConfirmResolver = null;
let recordAvailabilityCheckLastStartedAt = 0;
let availabilityCheckPromise = null;
let googleSheetConfirmResolver = null;
let googleSheetSendState = "idle";
let googleSheetOperationOwner = null;
let googleSheetOperationSequence = 0;
const googleSheetBackgroundRecordQueue = new Map();
const googleSheetBackgroundPlantingQueue = new Map();
let googleSheetBackgroundSendRunning = false;
let googleSheetBackgroundSendTimer = null;
let googleSheetStartupImportStarted = false;
let dashboardFilter = loadDashboardFilter();
let protectedAccessUnlocked = false;
let isMonitorModeOpen = false;
let manualSeedlingCount = null;
let monitorRemoteContent = null;
let monitorRemoteSignature = "";
let monitorRemoteFetchedContent = null;
let monitorRemoteFetchedAt = 0;
let monitorRemotePrefetchPromise = null;
let monitorRemotePollTimer = null;
let monitorRemotePollInFlight = false;
let monitorRemoteRefreshPending = false;
let monitorFirebaseClientPromise = null;
let monitorFirebaseSignalUnsubscribe = null;
let monitorFirebaseConnectionUnsubscribe = null;
let monitorFirebaseListenerGeneration = 0;
let monitorFirebaseLastRevision = "";
let monitorFirebaseLastSignalUpdatedAt = 0;
let monitorFirebaseConnected = false;
let monitorFirebaseListenerReady = false;
let monitorFirebaseFallbackNoticeShown = false;
let monitorMemoInputsDirty = false;
let monitorMemoRemoteLoadGeneration = 0;
let monitorRemoteEditorHarvestFillKeys = [];
let monitorRemoteEditorPreviewLayout = "preview1";
let monitorContentDraftOverride = null;
let monitorContentDraftBaseSignature = "";
let monitorModeOpenInProgress = false;
let monitorModeLoading = false;
let monitorCurrentSaveInProgress = false;
let monitorViewportResizeObserver = null;
let monitorPreviewResolver = null;
let monitorPreviewContent = null;
let monitorPreviewSelectedLayout = "preview1";
let monitorPreviewLayoutPreference = "preview1";
let monitorTodayRefreshTimer = null;
let workflowMonitorCheckpointSignature = "";
let workflowHarvestRecordingActive = false;
let workflowPlantingSessionActive = false;
let workflowGuideUpdateFrame = null;
let workflowGuideStage = 1;
let workflowGuideFurthestStage = 1;
let appTopChromeResizeObserver = null;

function deepClone(obj){
  return JSON.parse(JSON.stringify(obj));
}

function normalizeYield(value, fallback){
  const n = Number(value);
  return ALLOWED_YIELDS.includes(n) ? n : fallback;
}

function toggleAccordion(button){
  const group = button.closest(".accordionGroup");
  if(!group) return;
  group.classList.toggle("open");
}

function switchBedTab(button, groupName, bedName){
  const content = button.closest(".accordionContent");
  if(!content) return;

  content.querySelectorAll(`.bedTabs[data-tab-group="${groupName}"] .bedTabBtn`).forEach(btn => {
    btn.classList.toggle("active", btn === button);
  });

  content.querySelectorAll(`.bedTabPanel[data-tab-panel^="${groupName}-"]`).forEach(panel => {
    panel.classList.toggle("active", panel.dataset.tabPanel === `${groupName}-${bedName}`);
  });
}

function normalizeLossInput(value){
  if(value === "" || value === null || typeof value === "undefined") return "";
  const n = Number(value);
  if(!Number.isFinite(n)) return "";
  return Math.min(100, Math.max(0, n));
}

function isProtectedTab(tabName){
  return tabName === "record" || tabName === "dashboard";
}

function hasPresetAccessPassword(){
  return !!String(PRESET_ACCESS_PASSWORD || "").trim();
}

function resetProtectedAccessSession(){
  protectedAccessUnlocked = false;
}

function loadProtectedAccessAuth(){
  try{
    return harvestnaviLocalStorage.getItem(PROTECTED_ACCESS_AUTH_KEY) === "1";
  }catch(e){
    return false;
  }
}

function saveProtectedAccessAuth(isAuthorized){
  try{
    if(isAuthorized){
      harvestnaviLocalStorage.setItem(PROTECTED_ACCESS_AUTH_KEY, "1");
    }else{
      harvestnaviLocalStorage.removeItem(PROTECTED_ACCESS_AUTH_KEY);
    }
  }catch(e){
    return;
  }
}

function refreshProtectedAccessState(){
  protectedAccessUnlocked = hasPresetAccessPassword() && loadProtectedAccessAuth();
}

function syncAccessProtectionDetails(options = {}){
  const details = document.getElementById("accessProtectionDetails");
  if(!details) return;
  const forceClosed = !!options.forceClosed;
  let googleConfigNeedsAttention = false;
  if(typeof loadGoogleSheetConfig === "function" && typeof validateGoogleSheetConfig === "function"){
    try{
      googleConfigNeedsAttention = !validateGoogleSheetConfig(loadGoogleSheetConfig()).ok;
    }catch(e){
      googleConfigNeedsAttention = true;
    }
  }
  details.open = forceClosed ? false : (!protectedAccessUnlocked || googleConfigNeedsAttention);
}

function updateAccessProtectionStatus(){
  const box = document.getElementById("accessProtectionStatus");
  if(!box) return;
  if(!hasPresetAccessPassword()){
    box.textContent = "固定パスワードが未設定です。コード内の PRESET_ACCESS_PASSWORD を設定してください。";
    return;
  }
  box.textContent = protectedAccessUnlocked
    ? "この端末では記録・集計のロックが解除済みです。"
    : "この端末では記録・集計がロック中です。解除用パスワードを入力して保存してください。";
  syncAccessProtectionDetails();
}

function applyAccessUnlockInput(value){
  const entered = String(value || "");
  if(!entered) return null;
  if(!hasPresetAccessPassword()) return false;
  const isValid = entered === String(PRESET_ACCESS_PASSWORD);
  if(isValid){
    saveProtectedAccessAuth(true);
    refreshProtectedAccessState();
  }
  return isValid;
}

function ensureProtectedTabAccess(tabName){
  if(!isProtectedTab(tabName)) return true;
  if(protectedAccessUnlocked) return true;
  showToast("設定タブで解除用パスワードを入力して保存してください");
  return false;
}

function isAnyProtectedOperationEnabled(){
  return true;
}

function ensureProtectedOperationAccess(actionLabel){
  if(!isAnyProtectedOperationEnabled()) return true;
  if(protectedAccessUnlocked) return true;
  showToast((actionLabel || "この操作") + "には解除用パスワードが必要です");
  return false;
}

function showToast(message){
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove("show"), 2800);
}

const PAGE_BLOCKING_UI_IDS = Object.freeze([
  "monitorEditorModal",
  "monitorPreviewModal",
  "appMenuModal",
  "forecastSettingsModal",
  "dashboardModal",
  "dashboardCasesAllModal",
  "dashboardCalendarInfoModal",
  "dashboardForecastInfoModal",
  "dashboardForecastDaysAllModal",
  "plantingAgeModal",
  "harvestProgressModal",
  "seedlingHouseModal",
  "bedDetailModal",
  "recordDetailModal",
  "partialHarvestEditModal",
  "syncConflictPanel"
]);

function isPageBlockingUiOpen(){
  return isMonitorModeOpen || PAGE_BLOCKING_UI_IDS.some(id => (
    document.getElementById(id)?.classList.contains("show")
  ));
}

function showPageBlockingUi(element){
  if(!element) return false;
  element.classList.add("show");
  document.body.style.overflow = "hidden";
  return true;
}

function restorePageAfterBlockingUiClose(){
  if(isPageBlockingUiOpen()) return;
  const tabBar = document.querySelector(".tabBar");
  if(tabBar) tabBar.classList.remove("monitorHidden");
  document.body.style.overflow = "";
}

function hidePageBlockingUi(element){
  if(element) element.classList.remove("show");
  restorePageAfterBlockingUiClose();
}

function openMonitorEditorWindow(){
  const modal = document.getElementById("monitorEditorModal");
  const body = document.getElementById("monitorEditorModalBody");
  const content = document.getElementById("monitorRemoteEditorContent");
  const tabBar = document.querySelector(".tabBar");
  if(!modal || !body || !content) return;
  populateMonitorRemoteEditor(buildCurrentMonitorRemoteContent());
  setMonitorRemoteEditorStatus("");
  body.innerHTML = "";
  body.appendChild(content);
  showPageBlockingUi(modal);
  if(tabBar) tabBar.classList.add("monitorHidden");
  requestAnimationFrame(() => document.getElementById("monitorRemoteSeedlingValueInput")?.focus());
}

function closeMonitorEditorWindow(){
  const modal = document.getElementById("monitorEditorModal");
  const content = document.getElementById("monitorRemoteEditorContent");
  const storage = document.getElementById("monitorEditorStorage");
  if(content && storage){
    storage.appendChild(content);
  }
  hidePageBlockingUi(modal);
}

function openDashboardWindow(){
  switchTab("dashboard");
}

function openDashboardForecastInfoWindow(){
  const modal = document.getElementById("dashboardForecastInfoModal");
  const closeButton = document.getElementById("dashboardForecastInfoWindowClose");
  if(!modal) return;
  dashboardForecastInfoReturnFocus = document.activeElement;
  showPageBlockingUi(modal);
  requestAnimationFrame(() => closeButton?.focus());
}

function closeDashboardForecastInfoWindow(){
  const modal = document.getElementById("dashboardForecastInfoModal");
  hidePageBlockingUi(modal);
  const returnFocus = dashboardForecastInfoReturnFocus;
  dashboardForecastInfoReturnFocus = null;
  requestAnimationFrame(() => returnFocus?.focus?.());
}

function openDashboardCalendarInfoWindow(){
  const modal = document.getElementById("dashboardCalendarInfoModal");
  const closeButton = document.getElementById("dashboardCalendarInfoWindowClose");
  if(!modal) return;
  dashboardCalendarInfoReturnFocus = document.activeElement;
  showPageBlockingUi(modal);
  requestAnimationFrame(() => closeButton?.focus());
}

function closeDashboardCalendarInfoWindow(){
  const modal = document.getElementById("dashboardCalendarInfoModal");
  hidePageBlockingUi(modal);
  const returnFocus = dashboardCalendarInfoReturnFocus;
  dashboardCalendarInfoReturnFocus = null;
  requestAnimationFrame(() => returnFocus?.focus?.());
}

function openDashboardForecastDaysAllWindow(){
  const modal = document.getElementById("dashboardForecastDaysAllModal");
  const closeButton = document.getElementById("dashboardForecastDaysAllWindowClose");
  const container = document.getElementById("dashboardForecastDaysAllList");
  if(!modal || !container) return;
  dashboardForecastDaysAllReturnFocus = document.activeElement;
  const model = dashboardHarvestForecastModelCache || buildDashboardHarvestForecastModel();
  renderDashboardHarvestForecastDayList(container, model);
  showPageBlockingUi(modal);
  requestAnimationFrame(() => closeButton?.focus());
}

function closeDashboardForecastDaysAllWindow(){
  const modal = document.getElementById("dashboardForecastDaysAllModal");
  hidePageBlockingUi(modal);
  const returnFocus = dashboardForecastDaysAllReturnFocus;
  dashboardForecastDaysAllReturnFocus = null;
  requestAnimationFrame(() => returnFocus?.focus?.());
}

function openDashboardCasesAllWindow(){
  const modal = document.getElementById("dashboardCasesAllModal");
  const closeButton = document.getElementById("dashboardCasesAllWindowClose");
  if(!modal) return;
  dashboardCasesAllReturnFocus = document.activeElement;
  renderDashboardCasesAllWindow();
  showPageBlockingUi(modal);
  requestAnimationFrame(() => closeButton?.focus());
}

function closeDashboardCasesAllWindow(){
  const modal = document.getElementById("dashboardCasesAllModal");
  hidePageBlockingUi(modal);
  const returnFocus = dashboardCasesAllReturnFocus;
  dashboardCasesAllReturnFocus = null;
  requestAnimationFrame(() => returnFocus?.focus?.());
}

function closeDashboardWindow(){
  const modal = document.getElementById("dashboardModal");
  const body = document.getElementById("dashboardStorage");
  const dashboard = document.getElementById("dashboardTab");
  if(body && dashboard){
    dashboard.style.display = "none";
    body.appendChild(dashboard);
  }
  hidePageBlockingUi(modal);
}

function moveMenuSettingsToWindow(){
  const body = document.getElementById("appMenuWindowBody");
  const accessDetails = document.getElementById("accessProtectionDetails");
  const recordHelpDetails = document.getElementById("recordHelpDetails");
  const dashboardStartDayMenuSetting = document.getElementById("dashboardStartDayMenuSetting");
  if(!body || !accessDetails) return;
  if(recordHelpDetails && dashboardStartDayMenuSetting){
    dashboardStartDayMenuSetting.before(recordHelpDetails);
  }else if(recordHelpDetails){
    body.appendChild(recordHelpDetails);
  }
  body.appendChild(accessDetails);
}

function restoreMenuSettingsToSettingsTab(){
  const restorePoint = document.getElementById("appMenuSettingsRestorePoint");
  const accessDetails = document.getElementById("accessProtectionDetails");
  const recordHelpRestorePoint = document.getElementById("recordHelpRestorePoint");
  const recordHelpDetails = document.getElementById("recordHelpDetails");
  if(!restorePoint || !accessDetails) return;
  if(recordHelpRestorePoint && recordHelpDetails){
    recordHelpRestorePoint.before(recordHelpDetails);
  }
  restorePoint.before(accessDetails);
}

async function refreshAppRollbackAvailability(){
  const button = document.getElementById("appRollbackBtn");
  const status = document.getElementById("appRollbackStatus");
  if(!button) return;
  button.hidden = false;
  button.disabled = true;
  button.textContent = "前の安定版に戻す";
  if(status){
    status.textContent = "前の安定版は、次回の手動更新後から利用できます。";
    status.hidden = false;
  }
  try{
    if(typeof window.getHarvestnaviAppCacheState !== "function") return;
    const state = await window.getHarvestnaviAppCacheState();
    if(!state?.previousCache || !state?.previousVersion) return;
    button.disabled = false;
    button.textContent = "前の安定版に戻す";
    if(status){
      status.textContent = "現在版で問題が起きた場合だけ使用してください。";
      status.hidden = false;
    }
  }catch(e){}
}

async function confirmAppVersionRollback(){
  const button = document.getElementById("appRollbackBtn");
  const status = document.getElementById("appRollbackStatus");
  if(button?.disabled) return;
  if(!window.confirm("現在のアプリを終了して、前の安定版に戻しますか？\n\n記録データは削除されません。")) return;
  if(settingsDirty && !saveSettings()) return;

  if(button) button.disabled = true;
  if(status){
    status.textContent = "前の安定版に戻しています...";
    status.hidden = false;
  }
  try{
    saveHarvestStateToStorage();
    if(typeof window.rollbackHarvestnaviAppUpdate !== "function"){
      throw new Error("安定版へ戻す機能を読み込めませんでした");
    }
    await window.rollbackHarvestnaviAppUpdate();
  }catch(e){
    if(button) button.disabled = false;
    if(status){
      status.textContent = "安定版へ戻せませんでした: " + String(e?.message || e);
      status.hidden = false;
    }
  }
}

function openAppMenuWindow(){
  const modal = document.getElementById("appMenuModal");
  if(!modal) return;
  moveMenuSettingsToWindow();
  syncThemePreferenceControls();
  syncAccessProtectionDetails();
  showPageBlockingUi(modal);
  refreshAppRollbackAvailability();
}

function closeAppMenuWindow(){
  const modal = document.getElementById("appMenuModal");
  if(settingsDirty){
    const shouldSave = confirm("設定が変更されています。保存しますか？");
    if(shouldSave){
      if(!saveSettings()) return;
    }else{
      populateSettingsForm();
      settingsDirty = false;
    }
  }
  restoreMenuSettingsToSettingsTab();
  hidePageBlockingUi(modal);
}

function saveAppMenuSettingsAndClose(){
  if(!saveSettings()) return;
  closeAppMenuWindow();
}

function openPlantingAgeWindow(){
  const modal = document.getElementById("plantingAgeModal");
  if(!modal) return;
  renderPlantingAgeInfo({ renderDetail: true });
  showPageBlockingUi(modal);
}

function closePlantingAgeWindow(){
  const modal = document.getElementById("plantingAgeModal");
  hidePageBlockingUi(modal);
}

function openSeedlingHouseWindow(){
  const modal = document.getElementById("seedlingHouseModal");
  if(!modal) return;
  seedlingHouseReturnFocus = document.activeElement;
  seedlingHouseSelectedBed = null;
  seedlingHousePrimaryDateEditingEventId = null;
  showPageBlockingUi(modal);
  renderSeedlingHouseUi();
  document.getElementById("seedlingHouseWindowClose")?.focus();
}

function closeSeedlingHouseWindow(options = {}){
  const modal = document.getElementById("seedlingHouseModal");
  const returnFocus = seedlingHouseReturnFocus;
  seedlingHouseReturnFocus = null;
  closeSeedlingHousePrimaryDetail();
  hidePageBlockingUi(modal);
  const beds = document.getElementById("seedlingHouseBeds");
  if(beds) beds.innerHTML = "";
  const startEditor = document.getElementById("seedlingHouseStartEditor");
  if(startEditor) startEditor.hidden = true;
  if(options.restoreFocus !== false && returnFocus && typeof returnFocus.focus === "function"){
    returnFocus.focus();
  }
}

function openForecastSettingsWindow(){
  const modal = document.getElementById("forecastSettingsModal");
  if(!modal) return;
  refreshBedTabSummaries();
  showPageBlockingUi(modal);
}

function closeForecastSettingsWindow(){
  const modal = document.getElementById("forecastSettingsModal");
  if(settingsDirty){
    const shouldSave = confirm("計算設定が変更されています。保存しますか？");
    if(shouldSave){
      if(!saveSettings()) return;
    }else{
      populateSettingsForm();
      settingsDirty = false;
    }
  }
  document.querySelectorAll("#forecastSettingsWindowBody details[open]").forEach(details => {
    details.open = false;
  });
  hidePageBlockingUi(modal);
}

function saveForecastSettingsAndClose(){
  if(!saveSettings()) return;
  closeForecastSettingsWindow();
}

function updateMonitorFitScale(){
  const viewport = document.getElementById("monitorModeViewport");
  const body = document.getElementById("monitorModeBody");
  if(!viewport || !body) return;

  body.style.setProperty("--monitor-design-width", MONITOR_DESIGN_WIDTH + "px");
  body.style.setProperty("--monitor-design-height", MONITOR_DESIGN_HEIGHT + "px");
  const isNarrowViewport = viewport.clientWidth <= 640;

  const widthScale = viewport.clientWidth / MONITOR_DESIGN_WIDTH;
  const heightScale = viewport.clientHeight / MONITOR_DESIGN_HEIGHT;
  const autoScale = Math.min(widthScale, heightScale);
  const narrowViewportSafetyScale = isNarrowViewport ? 0.98 : 1;
  const minScale = isNarrowViewport ? 0.18 : 0.35;
  const scale = Math.min(MONITOR_MAX_SCALE, Math.max(minScale, autoScale * narrowViewportSafetyScale));
  body.style.setProperty("--monitor-fit-scale", String(scale));
  body.style.setProperty("--monitor-offset-x", Math.max(0, (viewport.clientWidth - MONITOR_DESIGN_WIDTH * scale) / 2) + "px");
  body.style.setProperty("--monitor-offset-y", Math.max(0, (viewport.clientHeight - MONITOR_DESIGN_HEIGHT * scale) / 2) + "px");
}

function installMonitorViewportResizeObserver(){
  const viewport = document.getElementById("monitorModeViewport");
  if(!viewport || typeof ResizeObserver === "undefined" || monitorViewportResizeObserver) return;
  monitorViewportResizeObserver = new ResizeObserver(() => {
    if(isMonitorModeOpen) updateMonitorFitScale();
  });
  monitorViewportResizeObserver.observe(viewport);
}

function updateMonitorPreviewScale(){
  const viewport = document.getElementById("monitorPreviewViewport");
  const body = document.getElementById("monitorPreviewBody");
  if(!viewport || !body) return;
  body.style.setProperty("--monitor-design-width", MONITOR_DESIGN_WIDTH + "px");
  body.style.setProperty("--monitor-design-height", MONITOR_DESIGN_HEIGHT + "px");
  const scale = Math.min(
    viewport.clientWidth / MONITOR_DESIGN_WIDTH,
    viewport.clientHeight / MONITOR_DESIGN_HEIGHT
  );
  body.style.setProperty("--monitor-fit-scale", String(scale));
  body.style.setProperty("--monitor-offset-x", Math.max(0, (viewport.clientWidth - MONITOR_DESIGN_WIDTH * scale) / 2) + "px");
  body.style.setProperty("--monitor-offset-y", Math.max(0, (viewport.clientHeight - MONITOR_DESIGN_HEIGHT * scale) / 2) + "px");
}

function renderMonitorPreviewContent(content = monitorPreviewContent, previewLayout = monitorPreviewSelectedLayout){
  const body = document.getElementById("monitorPreviewBody");
  if(!body) return;
  const normalized = normalizeRemoteMonitorContent(content || {}) || content || {};
  body.innerHTML = buildMonitorDashboardHtml(normalized, { previewLayout });
  requestAnimationFrame(() => {
    fitMonitorSummaryMetricText(body);
    fitMonitorHarvestLocationText(body);
    fitMonitorPreview2CaseText(body);
    updateMonitorPreviewScale();
  });
}

function refreshMonitorPreviewLayoutSwitch(){
  document.querySelectorAll("[data-monitor-preview-layout]").forEach(button => {
    const isActive = button.dataset.monitorPreviewLayout === monitorPreviewSelectedLayout;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });
}

function setMonitorPreviewLayout(layout){
  monitorPreviewSelectedLayout = normalizeMonitorPreviewLayout(layout);
  refreshMonitorPreviewLayoutSwitch();
  renderMonitorPreviewContent(monitorPreviewContent, monitorPreviewSelectedLayout);
}

function showMonitorPreviewConfirm(content){
  return new Promise(resolve => {
    const modal = document.getElementById("monitorPreviewModal");
    if(!modal){
      resolve(false);
      return;
    }
    const normalized = normalizeRemoteMonitorContent(content || {}) || content || {};
    monitorPreviewContent = normalized;
    monitorPreviewSelectedLayout = normalizeMonitorPreviewLayout(
      monitorPreviewLayoutPreference || normalized.previewLayout
    );
    monitorPreviewResolver = resolve;
    refreshMonitorPreviewLayoutSwitch();
    renderMonitorPreviewContent(normalized, monitorPreviewSelectedLayout);
    showPageBlockingUi(modal);
  });
}

function isMonitorPreviewOpen(){
  return !!document.getElementById("monitorPreviewModal")?.classList.contains("show");
}

function resolveMonitorPreview(confirmed){
  const modal = document.getElementById("monitorPreviewModal");
  hidePageBlockingUi(modal);
  const resolver = monitorPreviewResolver;
  monitorPreviewResolver = null;
  const selectedLayout = confirmed ? monitorPreviewSelectedLayout : null;
  monitorPreviewContent = null;
  if(resolver) resolver(selectedLayout);
}

async function openMonitorMode(){
  if(monitorModeOpenInProgress) return;
  monitorModeOpenInProgress = true;
  const overlay = document.getElementById("monitorModeOverlay");
  const tabBar = document.querySelector(".tabBar");
  if(!overlay){
    monitorModeOpenInProgress = false;
    return;
  }

  try{
    const config = getValidatedGoogleSheetConfig({ silent: true });
    isMonitorModeOpen = true;
    monitorModeLoading = !!config;
    showPageBlockingUi(overlay);
    if(tabBar) tabBar.classList.add("monitorHidden");
    installMonitorViewportResizeObserver();
    updateMonitorFitScale();
    renderMonitorMode();
    startMonitorTodayRefreshTimer();
    if(document.documentElement.requestFullscreen && !document.fullscreenElement){
      document.documentElement.requestFullscreen()
        .then(updateMonitorFitScale)
        .catch(() => {});
    }

    if(config){
      await getFreshMonitorRemoteContent();
      monitorModeLoading = false;
      renderMonitorMode();
      updateMonitorFitScale();
    }

    startMonitorRemoteUpdates();
  }finally{
    monitorModeLoading = false;
    monitorModeOpenInProgress = false;
  }
}

function closeMonitorMode(){
  isMonitorModeOpen = false;
  monitorModeLoading = false;
  const overlay = document.getElementById("monitorModeOverlay");
  hidePageBlockingUi(overlay);
  stopMonitorRemoteUpdates();
  stopMonitorTodayRefreshTimer();
  if(document.fullscreenElement && document.exitFullscreen){
    document.exitFullscreen().catch(() => {});
  }
}


function cancelPendingHarvestStateSave(){
  if(harvestStateSaveTimer !== null){
    clearTimeout(harvestStateSaveTimer);
    harvestStateSaveTimer = null;
  }
  pendingHarvestStateSaveOptions = null;
}

function saveHarvestStateToStorage(options = {}){
  cancelPendingHarvestStateSave();
  syncCurrentCasePlacementFromInputs();
  if(!options.skipPlantingDraftCapture && activeAppTab === "record" && recordSelectionMode === "planting"){
    capturePlantingRecordDraft();
  }
  const payload = {
    palletNumberingVersion: CURRENT_PALLET_NUMBERING_VERSION,
    currentBuilding,
    casePlacementBuilding,
    harvestFillKeys,
    harvestSummary,
    manualSeedlingCount,
    casesInput: document.getElementById("casesInput")?.value || "",
    harvestCasesAutoEstimated,
    harvestSelectionMode,
    harvestProgressState,
    harvestProgressAvailable,
    harvestProgressBuilding,
    monitorMemoInput: getMonitorMemoTextFromItems(getMonitorMemoInputValues()),
    monitorMemoItems: getMonitorMemoInputValues(),
    monitorMemoInputsDirty,
    monitorPreviewLayoutPreference,
    monitorContentDraftOverride,
    monitorContentDraftBaseSignature,
    casePlacementByBuilding,
    recordCasesInput: document.getElementById("recordCasesInput")?.value || "",
    recordActualSeedlingTrayCountInput: document.getElementById("recordActualSeedlingTrayCountInput")?.value || "",
    recordActualSeedlingCarryoverMode: getRecordSeedlingCarryoverMode(),
    recordPalletSummaryInput: document.getElementById("recordPalletSummaryInput")?.value || "",
    recordPlantingSummaryInput: document.getElementById("recordPlantingSummaryInput")?.value || "",
    recordMemoInput: document.getElementById("recordMemoInput")?.value || "",
    qualityMemo: getSelectedQualityMemo(),
    qualityMemoByPallet: recordSelectionMode === "planting"
      ? normalizeQualityMemoByPallet(plantingRecordDraft?.qualityMemoByPallet, harvestFillKeys)
      : {},
    recordCasesEdited,
    recordPlantingSummaryEdited,
    recordAdditionalBuildings: [...recordAdditionalBuildings],
    recordSelectionMode,
    recordPlantingCountPreset,
    recordPlantingCountsByPallet,
    recordPlantingFlowEnabled,
    recordPlantingFlowStage,
    recordPlantingFlowBuilding,
    recordPlantingCompletedBuildings,
    recordPlantingQualityPreset,
    activePlantingRecordId,
    editingPlantingEventId,
    plantingRecordDraft,
    forecastSelectionState,
    workflowMonitorCheckpointSignature,
    workflowHarvestRecordingActive,
    workflowPlantingSessionActive,
    savedAt: new Date().toISOString()
  };
  harvestnaviLocalStorage.writeJson(HARVEST_STATE_KEY, payload);
  scheduleWorkflowGuideUpdate();
}

function scheduleHarvestStateSave(options = {}){
  pendingHarvestStateSaveOptions = {
    ...(pendingHarvestStateSaveOptions || {}),
    ...options
  };
  if(harvestStateSaveTimer !== null) clearTimeout(harvestStateSaveTimer);
  harvestStateSaveTimer = setTimeout(() => {
    const pendingOptions = pendingHarvestStateSaveOptions || {};
    harvestStateSaveTimer = null;
    pendingHarvestStateSaveOptions = null;
    saveHarvestStateToStorageSafely(pendingOptions);
  }, HARVEST_STATE_SAVE_DELAY_MS);
}

function saveHarvestStateToStorageSafely(options = {}){
  try{
    saveHarvestStateToStorage(options);
    return true;
  }catch(error){
    console.error("Failed to save current harvest state", error);
    if(document.visibilityState !== "hidden"){
      showToast("入力内容の一時保存に失敗しました");
    }
    return false;
  }
}

function flushPendingHarvestStateSave(){
  if(harvestStateSaveTimer === null && pendingHarvestStateSaveOptions === null) return false;
  harvestStateSaveDeferId++;
  const pendingOptions = pendingHarvestStateSaveOptions || {};
  if(harvestStateSaveTimer !== null) clearTimeout(harvestStateSaveTimer);
  harvestStateSaveTimer = null;
  pendingHarvestStateSaveOptions = null;
  saveHarvestStateToStorageSafely(pendingOptions);
  return true;
}

function deferPendingHarvestStateSaveUntilUiSettles(){
  if(harvestStateSaveTimer === null && pendingHarvestStateSaveOptions === null) return false;
  if(harvestStateSaveTimer !== null) clearTimeout(harvestStateSaveTimer);
  harvestStateSaveTimer = null;
  const deferId = ++harvestStateSaveDeferId;
  runAfterUiSettles(() => {
    if(
      deferId !== harvestStateSaveDeferId
      || harvestStateSaveTimer !== null
      || pendingHarvestStateSaveOptions === null
    ) return;
    const pendingOptions = pendingHarvestStateSaveOptions || {};
    pendingHarvestStateSaveOptions = null;
    saveHarvestStateToStorageSafely(pendingOptions);
  });
  return true;
}

function reschedulePendingHarvestStateSave(){
  if(harvestStateSaveTimer === null && pendingHarvestStateSaveOptions === null) return false;
  scheduleHarvestStateSave();
  return true;
}

function installHarvestStateSaveFlushListeners(){
  if(document.documentElement.dataset.harvestStateSaveFlushInstalled === "1") return;
  document.addEventListener("change", reschedulePendingHarvestStateSave);
  document.addEventListener("focusout", reschedulePendingHarvestStateSave);
  document.addEventListener("visibilitychange", () => {
    if(document.visibilityState === "hidden") flushPendingHarvestStateSave();
  });
  window.addEventListener("pagehide", flushPendingHarvestStateSave);
  document.documentElement.dataset.harvestStateSaveFlushInstalled = "1";
}

function loadHarvestStateFromStorage(){
  try{
    const parsed = harvestnaviLocalStorage.readJson(HARVEST_STATE_KEY, null);
    if(!parsed) return null;
    if(Number(parsed.palletNumberingVersion) !== CURRENT_PALLET_NUMBERING_VERSION) return null;
    return {
      currentBuilding: BUILDINGS.includes(Number(parsed.currentBuilding)) ? Number(parsed.currentBuilding) : 2,
      casePlacementBuilding: BUILDINGS.includes(Number(parsed.casePlacementBuilding)) ? Number(parsed.casePlacementBuilding) : null,
      harvestFillKeys: Array.isArray(parsed.harvestFillKeys) ? parsed.harvestFillKeys.filter(v => typeof v === "string") : [],
      harvestSummary: parsed.harvestSummary && typeof parsed.harvestSummary === "object" ? parsed.harvestSummary : null,
      manualSeedlingCount: normalizeManualSeedlingCount(parsed.manualSeedlingCount),
      casesInput: parsed.casesInput ?? "",
      harvestCasesAutoEstimated: !!parsed.harvestCasesAutoEstimated,
      harvestSelectionMode: normalizeHarvestSelectionMode(parsed.harvestSelectionMode),
      harvestProgressState: normalizeHarvestProgressState(parsed.harvestProgressState),
      harvestProgressAvailable: typeof parsed.harvestProgressAvailable === "boolean"
        ? parsed.harvestProgressAvailable
        : (normalizeHarvestSelectionMode(parsed.harvestSelectionMode) === "auto"
          || !!normalizeHarvestProgressState(parsed.harvestProgressState)),
      harvestProgressBuilding: BUILDINGS.includes(Number(parsed.harvestProgressBuilding))
        ? Number(parsed.harvestProgressBuilding)
        : 2,
      monitorMemoInput: parsed.monitorMemoInput ?? "",
      monitorMemoItems: Array.isArray(parsed.monitorMemoItems) ? parsed.monitorMemoItems.map(item => String(item ?? "")) : null,
      monitorMemoInputsDirty: parsed.monitorMemoInputsDirty === true,
      monitorPreviewLayoutPreference: normalizeMonitorPreviewLayout(parsed.monitorPreviewLayoutPreference),
      monitorContentDraftOverride: normalizeRemoteMonitorContent(parsed.monitorContentDraftOverride),
      monitorContentDraftBaseSignature: typeof parsed.monitorContentDraftBaseSignature === "string"
        ? parsed.monitorContentDraftBaseSignature.slice(0, 128)
        : "",
      casePlacementByBuilding: parsed.casePlacementByBuilding && typeof parsed.casePlacementByBuilding === "object" ? parsed.casePlacementByBuilding : null,
      frontCaseInput: parsed.frontCaseInput ?? "",
      middleCaseInput: parsed.middleCaseInput ?? "",
      backCaseInput: parsed.backCaseInput ?? "",
      recordCasesInput: parsed.recordCasesInput ?? "",
      recordActualSeedlingTrayCountInput: parsed.recordActualSeedlingTrayCountInput ?? "",
      recordActualSeedlingCarryoverMode: normalizeSeedlingCarryoverMode(parsed.recordActualSeedlingCarryoverMode),
      recordPalletSummaryInput: parsed.recordPalletSummaryInput ?? "",
      recordPlantingSummaryInput: parsed.recordPlantingSummaryInput ?? "",
      recordMemoInput: parsed.recordMemoInput ?? "",
      qualityMemo: normalizeQualityMemo(parsed.qualityMemo || null),
      qualityMemoByPallet: normalizeQualityMemoByPallet(parsed.qualityMemoByPallet, parsed.harvestFillKeys),
      recordCasesEdited: !!parsed.recordCasesEdited,
      recordPlantingSummaryEdited: !!parsed.recordPlantingSummaryEdited,
      recordAdditionalBuildings: Array.isArray(parsed.recordAdditionalBuildings)
        ? [...new Set(parsed.recordAdditionalBuildings.map(value => Number(value)).filter(building => BUILDINGS.includes(building)))]
        : [],
      recordSelectionMode: parsed.recordSelectionMode === "planting" ? "planting" : "harvest",
      recordPlantingCountPreset: normalizePlantingCountPreset(parsed.recordPlantingCountPreset),
      recordPlantingCountsByPallet: normalizePlantingCountsByPallet(parsed.recordPlantingCountsByPallet, parsed.harvestFillKeys),
      recordPlantingFlowEnabled: parsed.recordPlantingFlowEnabled === true,
      recordPlantingFlowStage: ["building", "location", "count", "quality"].includes(parsed.recordPlantingFlowStage)
        ? parsed.recordPlantingFlowStage
        : "building",
      recordPlantingFlowBuilding: BUILDINGS.includes(Number(parsed.recordPlantingFlowBuilding))
        ? Number(parsed.recordPlantingFlowBuilding)
        : null,
      recordPlantingCompletedBuildings: Array.isArray(parsed.recordPlantingCompletedBuildings)
        ? [...new Set(parsed.recordPlantingCompletedBuildings.map(Number).filter(building => BUILDINGS.includes(building)))]
        : [],
      recordPlantingQualityPreset: ["large", "medium", "small", "elongated"].includes(normalizeQualityTag(parsed.recordPlantingQualityPreset))
        ? normalizeQualityTag(parsed.recordPlantingQualityPreset)
        : "medium",
      activePlantingRecordId: Number.isFinite(Number(parsed.activePlantingRecordId)) ? Number(parsed.activePlantingRecordId) : null,
      editingPlantingEventId: getSafePositiveRecordId(parsed.editingPlantingEventId),
      plantingRecordDraft: normalizePlantingRecordDraft(parsed.plantingRecordDraft),
      forecastSelectionState: normalizeForecastSelectionState(parsed.forecastSelectionState),
      workflowMonitorCheckpointSignature: typeof parsed.workflowMonitorCheckpointSignature === "string" ? parsed.workflowMonitorCheckpointSignature : "",
      workflowHarvestRecordingActive: !!parsed.workflowHarvestRecordingActive,
      workflowPlantingSessionActive: !!parsed.workflowPlantingSessionActive
    };
  }catch(e){
    return null;
  }
}

function clearHarvestStateFromStorage(){
  cancelPendingHarvestStateSave();
  harvestnaviLocalStorage.removeItem(HARVEST_STATE_KEY);
}

function updateHarvestCasesAutoEstimatedAppearance(){
  const casesInput = document.getElementById("casesInput");
  if(!casesInput) return;
  const isAutoEstimated = harvestCasesAutoEstimated && String(casesInput.value || "").trim() !== "";
  const labelText = isAutoEstimated ? "収穫ケース数（逆算値）" : "収穫ケース数";
  const field = casesInput.closest(".forecastCaseField");
  const label = document.getElementById("forecastCasesLabel");
  casesInput.classList.toggle("harvestCasesAutoEstimated", isAutoEstimated);
  field?.classList.toggle("is-auto-estimated", isAutoEstimated);
  if(label) label.textContent = labelText;
  casesInput.setAttribute("aria-label", labelText);
  casesInput.title = isAutoEstimated ? "パレット選択から自動計算された値" : "";
}

function updateHarvestCalculationButtonState(){
  const button = document.getElementById("harvestCalculateBtn");
  const casesInput = document.getElementById("casesInput");
  if(!button || !casesInput) return;
  const hasCases = String(casesInput.value || "").trim() !== ""
    && getHarvestCasePlan().totalCases > 0;
  const isCalculated = hasCases && hasWorkflowCalculationResult();
  button.disabled = !hasCases || isCalculated;
  button.classList.toggle("is-calculated", isCalculated);
  button.setAttribute("aria-label", isCalculated ? "計算済み" : "計算");
  button.title = !hasCases
    ? "収穫ケース数を入力してください"
    : (isCalculated ? "現在の内容は計算済みです" : "");
}

function markHarvestCasesAsManuallyEdited(){
  harvestCasesAutoEstimated = false;
  updateHarvestCasesAutoEstimatedAppearance();
}

function updateEstimatedHarvestCasesFromSelection(currentHarvestTotal = null){
  if(activeAppTab !== "forecast") return;
  const casesInput = document.getElementById("casesInput");
  if(!casesInput) return;
  const progressState = normalizeHarvestProgressState(harvestProgressState);
  if(isReverseHarvestProgressState(progressState) && hasAppliedHarvestProgress()){
    updateHarvestCasesAutoEstimatedAppearance();
    return;
  }
  if(casesInput.value !== "" && !harvestCasesAutoEstimated) return;

  const resolvedHarvestTotal = Number.isFinite(Number(currentHarvestTotal))
    ? Number(currentHarvestTotal)
    : getCurrentHarvestTotal();
  const estimatedRegularCases = harvestFillKeys.length
    ? Math.max(0, Math.floor(resolvedHarvestTotal / CASE_SIZE))
    : 0;
  const partialHarvestCases = harvestFillKeys.length
    ? getPartialHarvestCaseDeductionForDate(getHarvestTargetDateString())
    : 0;
  const estimatedCases = harvestFillKeys.length
    ? estimatedRegularCases + partialHarvestCases
    : 0;
  casesInput.value = estimatedCases > 0 ? String(estimatedCases) : "";
  harvestCasesAutoEstimated = estimatedCases > 0;
  if(harvestSummary){
    harvestSummary.needHeads = getHarvestCasePlan().regularCases * CASE_SIZE;
  }
  updateHarvestCasesAutoEstimatedAppearance();
  syncRecordCasesFromMain(false);
  updateEmptyInputHighlight(casesInput);
}

function getManualHarvestNeedHeads(){
  const casesInput = document.getElementById("casesInput");
  if(!casesInput || harvestCasesAutoEstimated || String(casesInput.value || "").trim() === "") {
    return null;
  }
  return getHarvestCasePlan().regularCases * CASE_SIZE;
}

function canAddHarvestSelectionTotal(currentTotal, nextTotal, needHeads){
  if(needHeads === null) return true;
  if(nextTotal <= needHeads) return true;
  return hasAppliedHarvestProgress() && currentTotal < needHeads;
}

function renderHarvestSelectionMapsForActiveTab(){
  if(activeAppTab === "forecast"){
    drawBeds();
  }else if(activeAppTab === "record"){
    drawRecordBeds();
  }
}

function refreshHarvestMapViews(){
  drawBeds();
  drawRecordBeds();
  renderForecastSummary();
}

function refreshAfterHarvestSelectionChanged(options = {}){
  const keepRecordSummary = !!options.keepRecordSummary;
  if(activeAppTab === "forecast"){
    invalidateWorkflowMonitorCheckpoint();
    const automaticSources = new Set(["auto", "progress-auto", "progress-reset"]);
    if(!automaticSources.has(options.selectionChangeSource)){
      markForecastHarvestSelectionAsManual();
    }
  }

  const currentHarvestTotal = Number.isFinite(Number(options.currentHarvestTotal))
    ? Math.round(Number(options.currentHarvestTotal) * 10) / 10
    : (harvestFillKeys.length ? getCurrentHarvestTotal() : 0);
  if(harvestFillKeys.length){
    recalcHarvestSummary(currentHarvestTotal);
  }else{
    harvestSummary = null;
  }

  updateEstimatedHarvestCasesFromSelection(currentHarvestTotal);
  syncReverseHarvestProgressAvailability();
  renderHarvestSelectionMapsForActiveTab();
  renderForecastSummary();

  const summaryInput = document.getElementById("recordPalletSummaryInput");
  if(summaryInput){
    if(recordSelectionMode === "harvest"){
      summaryInput.value = keepRecordSummary ? (summaryInput.value || "") : formatPalletSummary(harvestFillKeys);
    }
  }
  syncRecordPlantingSummaryFromSelection();

  updateRecordActualLoss();
  updateRecordSeedlingDiffDisplay();
  updateRecordActualSeedlingDisplays();
  updateRecordPlantingCountPresetUi();
  scheduleWorkflowGuideUpdate();
  scheduleHarvestStateSave();
}


function getBedTabSummaryText(groupName, bedName){
  if(groupName === "yield"){
    const useSplit = !!document.getElementById(`yieldUseFrontBack_${bedName}`)?.checked;
    if(useSplit){
      const front = document.getElementById(`yieldFront_${bedName}`)?.value || "";
      const back = document.getElementById(`yieldBack_${bedName}`)?.value || "";
      const frontCount = document.getElementById(`yieldFrontCount_${bedName}`)?.value || "";
      return `手${front} / 奥${back}` + (frontCount !== "" ? ` (${frontCount})` : "");
    }
  }

  if(groupName === "plant"){
    const useSplit = !!document.getElementById(`plantUseFrontBack_${bedName}`)?.checked;
    if(useSplit){
      const front = document.getElementById(`plantFront_${bedName}`)?.value || "";
      const back = document.getElementById(`plantBack_${bedName}`)?.value || "";
      const frontCount = document.getElementById(`plantFrontCount_${bedName}`)?.value || "";
      return `手${front} / 奥${back}` + (frontCount !== "" ? ` (${frontCount})` : "");
    }
  }

  const input = document.getElementById(groupName + "_" + bedName);
  if(!input) return "";

  const value = String(input.value || "").trim();
  if(groupName === "loss") return !!document.getElementById("useBedLossSettings")?.checked ? (value === "" ? "全体" : `${value}%`) : "全体";
  if(groupName === "yield" && !document.getElementById("useBedYieldSettings")?.checked) return "全体";
  if(groupName === "plant" && !document.getElementById("useBedPlantSettings")?.checked) return "全体";
  return value === "" ? "未入力" : `${value}個`;
}

function getForecastSettingsSummaryText(){
  const lossInput = document.getElementById("defaultLossRateInput");
  const yieldInput = document.getElementById("defaultYieldInput");
  const plantInput = document.getElementById("defaultPlantingCountInput");
  const special60Input = document.getElementById("specialPallet60CountInput");
  const loss = String(lossInput?.value || "0").trim() || "0";
  const yieldValue = String(yieldInput?.value || "").trim() || "-";
  const plantValue = String(plantInput?.value || "").trim() || "-";
  const special60 = String(special60Input?.value || "0").trim() || "0";
  const lossMark = document.getElementById("useBedLossSettings")?.checked ? "*" : "";
  const yieldMark = document.getElementById("useBedYieldSettings")?.checked ? "*" : "";
  const plantMark = document.getElementById("useBedPlantSettings")?.checked ? "*" : "";
  return `ロス ${loss}%${lossMark}・${yieldValue}${yieldMark} / ${plantValue}${plantMark} / 60(${special60}/3)`;
}

function updateForecastSettingsSummary(){
  const el = document.getElementById("forecastSettingsSummary");
  if(el) el.textContent = getForecastSettingsSummaryText();
  updateHarvestCalculationButtonState();
}

function getCalculationSettingValue(inputId, fallback = "-"){
  const value = String(document.getElementById(inputId)?.value ?? "").trim();
  return value === "" ? fallback : value;
}

function getCalculationSettingsClusterValues(title){
  const values = [];
  if(title === "収穫ロス率"){
    values.push(["全体", `${getCalculationSettingValue("defaultLossRateInput", "0")}%`]);
    if(document.getElementById("useBedLossSettings")?.checked){
      bedOrder.forEach(bedName => {
        values.push([bedName, getBedTabSummaryText("loss", bedName)]);
      });
    }
  }else if(title === "収穫時の個数"){
    values.push(["全体", `${getCalculationSettingValue("defaultYieldInput")}個`]);
    if(document.getElementById("useBedYieldSettings")?.checked){
      bedOrder.forEach(bedName => {
        values.push([bedName, getBedTabSummaryText("yield", bedName)]);
      });
    }
  }else if(title === "苗の個数"){
    values.push(["全体", `${getCalculationSettingValue("defaultPlantingCountInput")}個`]);
    if(document.getElementById("useBedPlantSettings")?.checked){
      bedOrder.forEach(bedName => {
        values.push([bedName, getBedTabSummaryText("plant", bedName)]);
      });
    }
  }else if(title === "苗取り補足"){
    values.push(["苗ロス", `${getCalculationSettingValue("seedlingLossRateInput", "0")}%`]);
    values.push(["60個用", `${getCalculationSettingValue("specialPallet60CountInput", "0")}/3枚`]);
  }
  return values;
}

function refreshCalculationSettingsClusterValues(){
  document.querySelectorAll("#forecastSettingsWindowBody .settingClusterDetails").forEach(details => {
    const header = details.querySelector(":scope > .settingClusterSummary .clusterHeader");
    const title = header?.querySelector(".clusterTitle")?.textContent?.trim() || "";
    if(!header || !title) return;

    let valuesWrap = header.querySelector(":scope > .settingClusterValues");
    if(!valuesWrap){
      valuesWrap = document.createElement("div");
      valuesWrap.className = "settingClusterValues";
      header.appendChild(valuesWrap);
    }
    valuesWrap.replaceChildren();

    getCalculationSettingsClusterValues(title).forEach(([label, value]) => {
      const item = document.createElement("span");
      item.className = "settingClusterValueItem";
      const labelEl = document.createElement("span");
      labelEl.className = "settingClusterValueLabel";
      labelEl.textContent = label;
      const valueEl = document.createElement("span");
      valueEl.className = "settingClusterValueText";
      valueEl.textContent = value;
      item.append(labelEl, valueEl);
      valuesWrap.appendChild(item);
    });
  });
}

function refreshYieldFrontBackVisibility(){
  bedOrder.forEach(bedName => {
    const wrap = document.getElementById(`yieldSplitBox_${bedName}`);
    const checkbox = document.getElementById(`yieldUseFrontBack_${bedName}`);
    if(wrap && checkbox){
      const enabled = !!document.getElementById("useBedYieldSettings")?.checked;
      wrap.classList.toggle("disabled", !enabled || !checkbox.checked);
    }
  });
}

function refreshPlantFrontBackVisibility(){
  bedOrder.forEach(bedName => {
    const wrap = document.getElementById(`plantSplitBox_${bedName}`);
    const checkbox = document.getElementById(`plantUseFrontBack_${bedName}`);
    if(wrap && checkbox){
      const enabled = !!document.getElementById("useBedPlantSettings")?.checked;
      wrap.classList.toggle("disabled", !enabled || !checkbox.checked);
    }
  });
}

function setDisabledState(targetId, disabled){
  const wrap = document.getElementById(targetId);
  if(!wrap) return;
  wrap.classList.toggle("fieldDisabled", disabled);
  wrap.querySelectorAll("input, select, button, textarea").forEach(el => {
    el.disabled = disabled;
  });
}

function syncAccordionOpenState(groupId, shouldOpen){
  return;
}

function refreshOverrideControls(){
  const useBedLoss = !!document.getElementById("useBedLossSettings")?.checked;
  const useBedYield = !!document.getElementById("useBedYieldSettings")?.checked;
  const useBedPlant = !!document.getElementById("useBedPlantSettings")?.checked;

  setDisabledState("defaultLossRateWrap", useBedLoss);
  setDisabledState("defaultYieldWrap", useBedYield);
  setDisabledState("defaultPlantWrap", useBedPlant);
  setDisabledState("bedLossAccordion", !useBedLoss);
  setDisabledState("bedYieldAccordion", !useBedYield);
  setDisabledState("bedPlantAccordion", !useBedPlant);
  const bedLossAccordion = document.getElementById("bedLossAccordion");
  const bedYieldAccordion = document.getElementById("bedYieldAccordion");
  const bedPlantAccordion = document.getElementById("bedPlantAccordion");
  if(bedLossAccordion) bedLossAccordion.hidden = !useBedLoss;
  if(bedYieldAccordion) bedYieldAccordion.hidden = !useBedYield;
  if(bedPlantAccordion) bedPlantAccordion.hidden = !useBedPlant;

  syncAccordionOpenState("bedLossAccordion", useBedLoss);
  syncAccordionOpenState("bedYieldAccordion", useBedYield);
  syncAccordionOpenState("bedPlantAccordion", useBedPlant);

  refreshYieldFrontBackVisibility();
  refreshPlantFrontBackVisibility();
  updateForecastSettingsSummary();
}

function refreshBedTabSummaries(){
  ["yield","loss","plant"].forEach(groupName => {
    bedOrder.forEach(bedName => {
      const el = document.getElementById(`tabValue_${groupName}_${bedName}`);
      if(el){
        el.textContent = getBedTabSummaryText(groupName, bedName);
      }
    });
  });
  updateForecastSettingsSummary();
  refreshCalculationSettingsClusterValues();
}

function makeSettingClusterCollapsible(cluster){
  if(!cluster || cluster.tagName === "DETAILS") return cluster;

  const details = document.createElement("details");
  details.className = cluster.className + " settingClusterDetails";

  const summary = document.createElement("summary");
  summary.className = "settingClusterSummary";

  const body = document.createElement("div");
  body.className = "settingClusterDetailsBody";

  const header = cluster.querySelector(":scope > .clusterHeader");
  if(header){
    summary.appendChild(header);
  }

  while(cluster.firstChild){
    body.appendChild(cluster.firstChild);
  }

  details.appendChild(summary);
  details.appendChild(body);
  cluster.replaceWith(details);
  return details;
}

function moveCalculationSettingsToForecast(){
  const target = document.getElementById("forecastSettingsWindowBody");
  if(!target) return;

  const titlesToMove = new Set(["収穫ロス率", "収穫時の個数", "苗の個数", "苗取り補足"]);
  const clusters = Array.from(document.querySelectorAll("#settingsTab .settingCluster"));
  clusters.forEach(cluster => {
    const title = cluster.querySelector(".clusterTitle")?.textContent?.trim();
    if(titlesToMove.has(title)){
      target.appendChild(makeSettingClusterCollapsible(cluster));
    }
  });
}

function installSettingsDirtyWatchers(){
  [
    "defaultLossRateInput","defaultYieldInput","defaultPlantingCountInput","seedlingLossRateInput","specialPallet60CountInput",
    "accessPasswordInput",
    "useBedLossSettings","useBedYieldSettings","useBedPlantSettings",
    "yield_A","loss_A","plant_A","yield_B","loss_B","plant_B","yield_C","loss_C","plant_C",
    "yield_D","loss_D","plant_D","yield_E","loss_E","plant_E","yield_F","loss_F","plant_F",
    "yieldUseFrontBack_A","yieldFrontCount_A","yieldFront_A","yieldBack_A",
    "yieldUseFrontBack_B","yieldFrontCount_B","yieldFront_B","yieldBack_B",
    "yieldUseFrontBack_C","yieldFrontCount_C","yieldFront_C","yieldBack_C",
    "yieldUseFrontBack_D","yieldFrontCount_D","yieldFront_D","yieldBack_D",
    "yieldUseFrontBack_E","yieldFrontCount_E","yieldFront_E","yieldBack_E",
    "yieldUseFrontBack_F","yieldFrontCount_F","yieldFront_F","yieldBack_F",
    "plantUseFrontBack_A","plantFrontCount_A","plantFront_A","plantBack_A",
    "plantUseFrontBack_B","plantFrontCount_B","plantFront_B","plantBack_B",
    "plantUseFrontBack_C","plantFrontCount_C","plantFront_C","plantBack_C",
    "plantUseFrontBack_D","plantFrontCount_D","plantFront_D","plantBack_D",
    "plantUseFrontBack_E","plantFrontCount_E","plantFront_E","plantBack_E",
    "plantUseFrontBack_F","plantFrontCount_F","plantFront_F","plantBack_F"
  ].forEach(id => {
    const el = document.getElementById(id);
    if(el && !el.dataset.dirtyWatchInstalled){
      const markDirtyAndRefresh = () => {
        settingsDirty = true;
        refreshOverrideControls();
        refreshBedTabSummaries();
      };
      el.addEventListener("input", markDirtyAndRefresh);
      el.addEventListener("change", () => {
        settingsDirty = true;
        if(id.startsWith("yieldUseFrontBack_")) refreshYieldFrontBackVisibility();
        if(id.startsWith("plantUseFrontBack_")) refreshPlantFrontBackVisibility();
        refreshOverrideControls();
        refreshBedTabSummaries();
      });
      el.dataset.dirtyWatchInstalled = "1";
    }
  });
}

function installNumberInputAutoSelect(){
  document.querySelectorAll('input[type="number"]').forEach(input => {
    if(input.dataset.autoSelectInstalled) return;
    input.addEventListener("focus", () => {
      setTimeout(() => input.select(), 0);
    });
    input.addEventListener("mouseup", event => {
      event.preventDefault();
    });
    input.dataset.autoSelectInstalled = "1";
  });
}

function installUnitInputTapFocus(){
  if(document.documentElement.dataset.unitInputTapFocusInstalled) return;
  document.addEventListener("click", event => {
    const target = event.target;
    if(!(target instanceof Element) || target instanceof HTMLInputElement) return;
    const wrap = target.closest(".inputUnitWrap, .seedlingInlineWrap");
    const input = wrap?.querySelector("input:not(:disabled)");
    if(input) input.focus();
  });
  document.documentElement.dataset.unitInputTapFocusInstalled = "1";
}

function isEmptyHighlightTarget(el){
  if(!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
  if(["dashboardForecastCasesInput", "dashboardForecastLossInput"].includes(el.id)) return false;
  if(el instanceof HTMLInputElement){
    return !["checkbox", "radio", "button", "submit", "reset", "file", "hidden"].includes(el.type);
  }
  return true;
}

function updateEmptyInputHighlight(el){
  if(!isEmptyHighlightTarget(el)) return;
  const value = String(el.value || "").trim();
  const requiresPositiveValue = el.id === "casesInput";
  const numberValue = Number(value);
  const isMissing = value === "" || (requiresPositiveValue && (!Number.isFinite(numberValue) || numberValue <= 0));
  el.classList.toggle("emptyInputField", isMissing);
}

function refreshEmptyInputHighlights(){
  document.querySelectorAll("input, textarea").forEach(updateEmptyInputHighlight);
}

function installEmptyInputHighlights(){
  refreshEmptyInputHighlights();
  document.addEventListener("input", event => updateEmptyInputHighlight(event.target));
  document.addEventListener("change", event => updateEmptyInputHighlight(event.target));
}

function normalizeSeedlingCarryoverMode(value){
  return value === "carryover" ? "carryover" : "loss";
}

function normalizeRecordUuid(value){
  const text = String(value || "").trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(text)
    ? text
    : "";
}

function createRecordUuid(){
  try{
    if(globalThis.crypto?.randomUUID){
      const uuid = normalizeRecordUuid(globalThis.crypto.randomUUID());
      if(uuid) return uuid;
    }
    if(globalThis.crypto?.getRandomValues){
      const bytes = new Uint8Array(16);
      globalThis.crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  }catch(e){
    // randomUUIDを使えない環境では下の生成へ進む。
  }
  const seed = `${Date.now()}-${Math.random()}-${Math.random()}`;
  let hash = 2166136261;
  let hex = "";
  for(let index = 0; index < 32; index++){
    hash ^= seed.charCodeAt(index % seed.length) + index;
    hash = Math.imul(hash, 16777619);
    hex += ((hash >>> ((index % 4) * 8)) & 0xff).toString(16).padStart(2, "0");
  }
  hex = hex.slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function normalizeRecordSyncTimestamp(value){
  const text = String(value || "").trim();
  if(!text || text.length > RECORD_SYNC_TIMESTAMP_MAX_LENGTH) return "";
  const time = new Date(text).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
}

function normalizeRecordSyncProvidedFields(record){
  if(!record || !Number.isSafeInteger(record.syncSchemaVersion)
    || record.syncSchemaVersion < RECORD_SYNC_SCHEMA_VERSION
    || !Array.isArray(record.syncProvidedFields)){
    return [];
  }
  return RECORD_SYNC_FIELD_KEYS.filter(key => record.syncProvidedFields.includes(key));
}

function getCurrentRecordSyncMetadata(){
  return {
    syncSchemaVersion: RECORD_SYNC_SCHEMA_VERSION,
    syncProvidedFields: [...RECORD_SYNC_FIELD_KEYS],
    recordUuid: createRecordUuid(),
    createdAt: "",
    updatedAt: ""
  };
}

function getRecordSyncMetadata(record){
  const syncProvidedFields = normalizeRecordSyncProvidedFields(record);
  return {
    syncSchemaVersion: syncProvidedFields.length ? RECORD_SYNC_SCHEMA_VERSION : 0,
    syncProvidedFields,
    recordUuid: normalizeRecordUuid(record?.recordUuid),
    createdAt: normalizeRecordSyncTimestamp(record?.createdAt),
    updatedAt: normalizeRecordSyncTimestamp(record?.updatedAt)
  };
}


function captureRecordBaseSelection(){
  recordBaseFillKeys = [...harvestFillKeys];
}

function restoreRecordSelectionToBase(){
  harvestFillKeys = [...recordBaseFillKeys];
  refreshAfterHarvestSelectionChanged();
}

function normalizePlantingRecordDraft(value){
  if(!value || typeof value !== "object") return null;
  const recordId = Number(value.recordId);
  if(!Number.isFinite(recordId)) return null;
  return {
    recordId,
    keys: Array.isArray(value.keys) ? value.keys.filter(key => typeof key === "string") : [],
    plantingCountPreset: normalizePlantingCountPreset(value.plantingCountPreset),
    plantingCountsByPallet: normalizePlantingCountsByPallet(value.plantingCountsByPallet, value.keys),
    date: String(value.date || "").trim(),
    actualSeedlingTrayCount: String(value.actualSeedlingTrayCount ?? "").trim(),
    actualSeedlingCarryoverMode: normalizeSeedlingCarryoverMode(value.actualSeedlingCarryoverMode),
    actualSeedlingUserEdited: !!value.actualSeedlingUserEdited,
    plantingSummaryInput: String(value.plantingSummaryInput || ""),
    recordPlantingSummaryEdited: !!value.recordPlantingSummaryEdited,
    qualityMemo: normalizeOptionalQualityMemo(value.qualityMemo),
    qualityMemoByPallet: normalizeQualityMemoByPallet(value.qualityMemoByPallet, value.keys)
  };
}

function getPlantingRecordDraftForRecord(record){
  const draft = normalizePlantingRecordDraft(plantingRecordDraft);
  if(!record || !draft) return null;
  return Number(draft.recordId) === Number(record.id) ? draft : null;
}

function capturePlantingRecordDraft(){
  const record = getActivePlantingRecord();
  if(recordSelectionMode !== "planting" || !record || record.type !== "fullHarvest") return;
  plantingRecordDraft = {
    recordId: Number(record.id),
    keys: [...harvestFillKeys],
    plantingCountPreset: recordPlantingCountPreset,
    plantingCountsByPallet: normalizePlantingCountsByPallet(recordPlantingCountsByPallet, harvestFillKeys),
    date: document.getElementById("recordDateInput")?.value || "",
    actualSeedlingTrayCount: document.getElementById("recordActualSeedlingTrayCountInput")?.value || "",
    actualSeedlingCarryoverMode: getRecordSeedlingCarryoverMode(),
    actualSeedlingUserEdited: document.getElementById("recordActualSeedlingTrayCountInput")?.dataset.userEdited === "1",
    plantingSummaryInput: document.getElementById("recordPlantingSummaryInput")?.value || "",
    recordPlantingSummaryEdited,
    qualityMemo: normalizeOptionalQualityMemo(getSelectedQualityMemo()),
    qualityMemoByPallet: normalizeQualityMemoByPallet(
      plantingRecordDraft?.qualityMemoByPallet,
      harvestFillKeys
    )
  };
}

function applyPlantingRecordDraft(record){
  if(!record || record.type !== "fullHarvest") return false;
  const draft = getPlantingRecordDraftForRecord(record);
  harvestFillKeys = draft
    ? [...draft.keys]
    : getUnplantedPalletKeysForHarvest(record.id);
  recordPlantingCountPreset = normalizePlantingCountPreset(
    draft?.plantingCountPreset,
    getConfiguredPlantingCountForFirstKey(harvestFillKeys)
  );
  recordPlantingCountsByPallet = normalizePlantingCountsByPallet(
    draft?.plantingCountsByPallet,
    harvestFillKeys
  );
  ensureRecordPlantingCountsForKeys(harvestFillKeys, { useConfiguredCount: true });

  const dateInput = document.getElementById("recordDateInput");
  if(dateInput){
    dateInput.value = draft?.date || formatDateOnlyString(new Date());
    updateRecordWeekdayDisplay();
  }

  const seedlingInput = document.getElementById("recordActualSeedlingTrayCountInput");
  if(seedlingInput){
    delete seedlingInput.dataset.clearedOnFocus;
    delete seedlingInput.dataset.enteredSinceFocus;
    delete seedlingInput.dataset.previousValue;
    if(draft){
      seedlingInput.value = draft.actualSeedlingTrayCount;
      if(draft.actualSeedlingUserEdited){
        seedlingInput.dataset.userEdited = "1";
      }else{
        delete seedlingInput.dataset.userEdited;
      }
    }else{
      delete seedlingInput.dataset.userEdited;
      syncRecordActualSeedlingTrayCountInput(record, { force: true });
    }
  }

  setRecordSeedlingCarryoverMode(draft?.actualSeedlingCarryoverMode || record.actualSeedlingCarryoverMode || "loss", { silent: true });
  if(!draft){
    harvestFillKeys = getSequentialPlantingPalletKeysWithinCapacity(harvestFillKeys, record);
    recordPlantingCountsByPallet = normalizePlantingCountsByPallet(
      recordPlantingCountsByPallet,
      harvestFillKeys
    );
  }

  recordPlantingSummaryEdited = !!draft?.recordPlantingSummaryEdited;
  const plantingSummaryInput = document.getElementById("recordPlantingSummaryInput");
  if(plantingSummaryInput){
    plantingSummaryInput.value = draft?.plantingSummaryInput || "";
  }
  setSelectedQualityMemo(draft?.qualityMemo || null);
  syncRecordPlantingSummaryFromSelection({ force: !recordPlantingSummaryEdited });
  updateRecordSeedlingDiffDisplay();
  updateRecordActualSeedlingDisplays();
  return !!draft;
}

function normalizeForecastSelectionState(value){
  if(!value || typeof value !== "object") return null;
  return {
    keys: Array.isArray(value.keys) ? value.keys.filter(key => typeof key === "string") : [],
    summary: value.summary && typeof value.summary === "object" ? value.summary : null,
    manualSeedlingCount: normalizeManualSeedlingCount(value.manualSeedlingCount)
  };
}

function normalizeHarvestSelectionMode(value){
  return value === "auto" || value === "manual" ? value : "none";
}

function isReverseHarvestProgressState(value = harvestProgressState){
  const normalized = normalizeHarvestProgressState(value);
  if(normalized) return normalized.fixedReversePlan === true;
  return harvestSelectionMode === "manual" && harvestCasesAutoEstimated;
}

function getHarvestProgressBedKey(building, bed){
  return `${Number(building)}-${String(bed || "")}`;
}

function normalizeHarvestProgressBedKey(value){
  const match = String(value || "").trim().match(/^(\d+)-([A-F])$/);
  if(!match) return "";
  const building = Number(match[1]);
  const bed = match[2];
  return BUILDINGS.includes(building) && bedOrder.includes(bed)
    ? getHarvestProgressBedKey(building, bed)
    : "";
}

function normalizeHarvestProgressState(value){
  if(!value || typeof value !== "object" || Array.isArray(value)) return null;
  const planKeys = Array.isArray(value.planKeys)
    ? [...new Set(value.planKeys.filter(key => typeof key === "string" && isValidPalletKeyString(key)))]
    : [];
  const selectedBeds = Array.isArray(value.selectedBeds)
    ? [...new Set(value.selectedBeds.map(normalizeHarvestProgressBedKey).filter(Boolean))]
    : [];
  const appliedSelectedBeds = Array.isArray(value.appliedSelectedBeds)
    ? [...new Set(value.appliedSelectedBeds.map(normalizeHarvestProgressBedKey).filter(Boolean))]
    : [];
  let actualCasesInput = String(value.actualCasesInput ?? "").trim();
  const hasAppliedCases = value.appliedActualCases !== null
    && value.appliedActualCases !== undefined
    && String(value.appliedActualCases).trim() !== "";
  const appliedActualCases = hasAppliedCases
    ? clampNumber(value.appliedActualCases, 0, 999999, 0)
    : null;
  const usesIncrementalInput = value.inputMode === "incremental";
  if(!usesIncrementalInput && hasAppliedCases && actualCasesInput
    && formatHarvestProgressCases(actualCasesInput) === formatHarvestProgressCases(appliedActualCases)){
    actualCasesInput = "";
  }
  const targetDate = String(value.targetDate || "").trim();
  const baseSelectionMode = normalizeHarvestSelectionMode(value.baseSelectionMode) === "auto" ? "auto" : "manual";

  return {
    inputMode: "incremental",
    baseSelectionMode,
    fixedReversePlan: value.fixedReversePlan === true,
    planKeys,
    selectedBeds,
    appliedSelectedBeds,
    actualCasesInput,
    appliedActualCases,
    targetDate: parseDateOnlyString(targetDate) ? targetDate : "",
    targetCases: clampNumber(value.targetCases, 0, 999999, 0)
  };
}

function ensureHarvestProgressState(){
  const existing = normalizeHarvestProgressState(harvestProgressState);
  if(existing){
    harvestProgressState = existing;
    return harvestProgressState;
  }
  const casePlan = getHarvestCasePlan();
  if(!harvestFillKeys.length || casePlan.totalCases <= 0) return null;
  harvestProgressState = {
    inputMode: "incremental",
    baseSelectionMode: harvestSelectionMode === "auto" ? "auto" : "manual",
    fixedReversePlan: harvestSelectionMode === "manual" && harvestCasesAutoEstimated,
    planKeys: [...harvestFillKeys],
    selectedBeds: [],
    appliedSelectedBeds: [],
    actualCasesInput: "",
    appliedActualCases: null,
    targetDate: casePlan.date,
    targetCases: casePlan.totalCases
  };
  harvestProgressBuilding = BUILDINGS.includes(currentBuilding) ? currentBuilding : MIN_BUILDING;
  return harvestProgressState;
}

function isHarvestProgressContextCurrent(state = harvestProgressState){
  if(!state || typeof state !== "object" || Array.isArray(state)) return false;
  const casePlan = getHarvestCasePlan();
  return state.targetDate === casePlan.date
    && Math.abs(Number(state.targetCases) - casePlan.totalCases) < 0.000001;
}

function hasAppliedHarvestProgress(){
  const state = harvestProgressState;
  return !!state
    && isHarvestProgressContextCurrent(state)
    && Array.isArray(state.appliedSelectedBeds)
    && state.appliedSelectedBeds.length > 0
    && state.appliedActualCases !== null
    && state.appliedActualCases !== undefined
    && Number.isFinite(Number(state.appliedActualCases));
}

function getHarvestProgressKeysForBeds(bedKeys, state = harvestProgressState){
  const selectedBedSet = new Set(
    (Array.isArray(bedKeys) ? bedKeys : [])
      .map(normalizeHarvestProgressBedKey)
      .filter(Boolean)
  );
  if(!selectedBedSet.size) return [];
  const normalizedState = normalizeHarvestProgressState(state);
  const reversePlanSet = isReverseHarvestProgressState(normalizedState)
    ? new Set(normalizedState.planKeys)
    : null;
  const recordedSet = getRecordedPalletSet(getHarvestTargetDate());
  const keys = [];
  BUILDINGS.forEach(building => {
    bedOrder.forEach(bed => {
      if(!selectedBedSet.has(getHarvestProgressBedKey(building, bed))) return;
      for(let number = 1; number <= PALLETS_PER_BED; number++){
        const key = getPalletKey(building, bed, number);
        if(reversePlanSet && !reversePlanSet.has(key)) continue;
        if(!recordedSet.has(key)) keys.push(key);
      }
    });
  });
  return keys;
}

function hasHarvestProgressPlannedPalletInBed(state, building, bed){
  const normalized = normalizeHarvestProgressState(state);
  if(!normalized) return false;
  const planSet = new Set(normalized.planKeys);
  return getSelectedNumbersForBed(Number(building), String(bed || ""), planSet).length > 0;
}

function getAppliedHarvestProgressCompletedKeySet(){
  if(!hasAppliedHarvestProgress()) return new Set();
  return new Set(getHarvestProgressKeysForBeds(harvestProgressState.appliedSelectedBeds));
}

function isHarvestProgressCompletedPallet(key){
  return getAppliedHarvestProgressCompletedKeySet().has(String(key || ""));
}

function isHarvestProgressCompletedBed(building, bed){
  if(!hasAppliedHarvestProgress()) return false;
  return harvestProgressState.appliedSelectedBeds.includes(getHarvestProgressBedKey(building, bed));
}

function getHarvestProgressRemainingSelectionKeys(keys = harvestFillKeys){
  const completedSet = getAppliedHarvestProgressCompletedKeySet();
  return (Array.isArray(keys) ? keys : []).filter(key => !completedSet.has(key));
}

function getHarvestProgressActualCases(){
  return hasAppliedHarvestProgress()
    ? clampNumber(harvestProgressState.appliedActualCases, 0, 999999, 0)
    : 0;
}

function getPendingHarvestProgressBedKeys(state = harvestProgressState){
  const normalized = normalizeHarvestProgressState(state);
  if(!normalized) return [];
  const appliedSet = new Set(normalized.appliedSelectedBeds);
  return normalized.selectedBeds.filter(bedKey => !appliedSet.has(bedKey));
}

function hasUnappliedHarvestProgressChanges(){
  const state = normalizeHarvestProgressState(harvestProgressState);
  if(!state || !hasAppliedHarvestProgress()) return false;
  const selected = [...state.selectedBeds].sort().join("|");
  const applied = [...state.appliedSelectedBeds].sort().join("|");
  const draftCases = String(state.actualCasesInput || "").trim();
  return selected !== applied || draftCases !== "";
}

function getHarvestProgressRemainingTargetCases(){
  return Math.max(0, getHarvestCasePlan().regularCases - getHarvestProgressActualCases());
}

function getHarvestProgressSelectedRemainingHeads(){
  return getHarvestProgressRemainingSelectionKeys().reduce((total, key) => {
    const pallet = parsePalletKey(key);
    return total + getPredictedHarvestForPallet(pallet.building, pallet.bed, pallet.number);
  }, 0);
}

function formatHarvestProgressCases(value){
  const rounded = Math.round(Math.max(0, Number(value) || 0) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatHarvestProgressBedSelection(bedKeys){
  const selectedSet = new Set(
    (Array.isArray(bedKeys) ? bedKeys : [])
      .map(normalizeHarvestProgressBedKey)
      .filter(Boolean)
  );
  const parts = [];
  BUILDINGS.forEach(building => {
    const beds = bedOrder.filter(bed => selectedSet.has(getHarvestProgressBedKey(building, bed)));
    if(beds.length) parts.push(`${building}号棟 ${beds.join("・")}ベッド`);
  });
  return parts.join(" / ");
}

function renderHarvestProgressBeds(){
  const container = document.getElementById("harvestProgressBeds");
  const buildingButton = document.getElementById("harvestProgressBuildingBtn");
  const buildingPager = document.getElementById("harvestProgressBuildingPager");
  const buildingLabel = buildingButton?.querySelector(".buildingPaginationLabel");
  if(buildingLabel) buildingLabel.textContent = harvestProgressBuilding + "号棟";
  else if(buildingButton) buildingButton.textContent = harvestProgressBuilding + "号棟";
  if(buildingPager){
    buildingPager.setAttribute("aria-label", `途中経過の${harvestProgressBuilding}号棟を表示中。左右にスワイプできます`);
  }
  if(!container) return;

  container.innerHTML = "";
  const state = normalizeHarvestProgressState(harvestProgressState);
  const selectedBedSet = new Set(state?.selectedBeds || []);
  const planSet = new Set(harvestFillKeys || []);
  const recordedSet = getRecordedPalletSet(getHarvestTargetDate());

  bedMap.forEach(bedName => {
    const bedKey = getHarvestProgressBedKey(harvestProgressBuilding, bedName);
    const isSelected = selectedBedSet.has(bedKey);
    const isApplied = state?.appliedSelectedBeds.includes(bedKey) || false;
    const availableCount = PALLETS_PER_BED - getBedSummaryCounts(
      harvestProgressBuilding,
      bedName,
      { selectedSet: planSet, recordedSet }
    ).recorded;
    const plannedCount = getSelectedNumbersForBed(harvestProgressBuilding, bedName, planSet).length;
    const reverseMode = isReverseHarvestProgressState(state);
    const canSelectBed = reverseMode ? plannedCount > 0 : availableCount > 0;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "harvestProgressBed"
      + (isSelected ? " is-selected" : "")
      + (isApplied ? " is-applied" : "");
    button.disabled = !canSelectBed;
    button.setAttribute("aria-pressed", String(isSelected));
    button.setAttribute(
      "aria-label",
      `${harvestProgressBuilding}号棟 ${bedName}ベッド。${isApplied ? "途中経過へ反映済み" : (isSelected ? "今回追加する完了ベッドとして選択済み" : "タップして今回の完了に追加する")}`
    );
    button.onclick = () => toggleHarvestProgressBed(harvestProgressBuilding, bedName);

    const title = document.createElement("div");
    title.className = "harvestProgressBedTitle";
    title.innerHTML = `<span>${bedName}</span><span class="harvestProgressBedCheck" aria-hidden="true">✓</span>`;
    button.appendChild(title);
    appendBedMiniMap(button, harvestProgressBuilding, bedName, { selectedSet: planSet, recordedSet });
    const meta = document.createElement("div");
    meta.className = "harvestProgressBedMeta";
    meta.textContent = isApplied
      ? "反映済み"
      : (!canSelectBed
      ? (reverseMode ? "対象外" : "収穫済み")
      : (availableCount <= 0
      ? "収穫済み"
      : (plannedCount > 0 ? `計画 ${plannedCount}枚` : `対象 ${availableCount}枚`)));
    button.appendChild(meta);
    container.appendChild(button);
  });
}

function getHarvestProgressResultModel(){
  const state = normalizeHarvestProgressState(harvestProgressState);
  const casePlan = getHarvestCasePlan();
  if(!harvestFillKeys.length || casePlan.totalCases <= 0){
    return { text: "先に通常の収穫場所を計算または選択してください。", className: "" };
  }
  if(state && !isHarvestProgressContextCurrent(state)){
    return { text: "収穫ケース数または日付が変わりました。途中経過を取り消して選び直してください。", className: "needs-selection" };
  }
  if(!state || !hasAppliedHarvestProgress()){
    const selectedCount = state?.selectedBeds.length || 0;
    return selectedCount > 0
      ? { text: `${selectedCount}ベッドを選択中です。今回取れたケース数を入力して追加してください。`, className: "" }
      : { text: "", className: "" };
  }
  if(hasUnappliedHarvestProgressChanges()){
    return { text: `今回の完了ベッドまたはケース数はまだ反映されていません。「${getHarvestProgressApplyLabel(state)}」を押してください。`, className: "needs-selection" };
  }

  const actualCases = getHarvestProgressActualCases();
  const selectedRemainingCases = getHarvestProgressSelectedRemainingHeads() / CASE_SIZE;
  if(isReverseHarvestProgressState(state)){
    const remainingPlanKeys = getHarvestProgressRemainingSelectionKeys();
    return {
      text: `実績 ${formatHarvestProgressCases(actualCases)}ケース / 逆算予測 ${formatHarvestProgressCases(state.targetCases)}ケース\n`
        + (remainingPlanKeys.length
          ? `残りの選択場所は変更していません（残り予測 約${formatHarvestProgressCases(selectedRemainingCases)}ケース）`
          : "逆算時に選択した場所はすべて完了です。"),
      className: remainingPlanKeys.length ? "" : "is-complete"
    };
  }

  const remainingTargetCases = getHarvestProgressRemainingTargetCases();
  const shortageCases = Math.max(0, remainingTargetCases - selectedRemainingCases);
  const targetText = `完了 ${formatHarvestProgressCases(actualCases)}ケース / 通常収穫目標 ${formatHarvestProgressCases(casePlan.regularCases)}ケース`;

  if(state.baseSelectionMode === "auto"){
    const shortageText = shortageCases > 0.05
      ? `\n予測が不足しています。あと約${Math.ceil(shortageCases)}ケース分を確認してください。`
      : "";
    return {
      text: `${targetText}\n残り${formatHarvestProgressCases(remainingTargetCases)}ケース分の収穫場所を自動更新しました。${shortageText}`,
      className: shortageCases > 0.05 ? "needs-selection" : "is-complete"
    };
  }

  if(shortageCases > 0.05){
    return {
      text: `${targetText}\nあと約${Math.ceil(shortageCases)}ケース分、収穫場所を手動で選択してください。`,
      className: "needs-selection"
    };
  }
  const excessCases = Math.max(0, selectedRemainingCases - remainingTargetCases);
  return {
    text: excessCases > 0.05
      ? `${targetText}\n必要数に達しています。選択は予想で約${formatHarvestProgressCases(excessCases)}ケース分多いため、不要なら手動で解除してください。`
      : `${targetText}\n必要数に達しました。`,
    className: "is-complete"
  };
}

function getHarvestProgressApplyLabel(state = harvestProgressState){
  return isReverseHarvestProgressState(state) ? "追加して反映する" : "追加して再計算する";
}

function updateHarvestProgressVisibility(){
  const panel = document.getElementById("harvestProgressPanel");
  const modal = document.getElementById("harvestProgressModal");
  const openButton = document.getElementById("harvestProgressOpenBtn");
  if(!panel) return false;
  const shouldShow = harvestProgressAvailable
    && harvestFillKeys.length > 0
    && getHarvestCasePlan().totalCases > 0;
  panel.hidden = !shouldShow;
  if(!shouldShow) hidePageBlockingUi(modal);
  if(openButton){
    openButton.disabled = !shouldShow;
    openButton.setAttribute("aria-expanded", String(shouldShow && !!modal?.classList.contains("show")));
  }
  return shouldShow;
}

function updateHarvestProgressUi(){
  const shouldShow = updateHarvestProgressVisibility();
  const state = normalizeHarvestProgressState(harvestProgressState);
  if(state) harvestProgressState = state;
  if(!shouldShow) return;
  const input = document.getElementById("harvestProgressCasesInput");
  if(input && document.activeElement !== input){
    input.value = state?.actualCasesInput || "";
  }
  const selectionText = document.getElementById("harvestProgressSelectionText");
  if(selectionText){
    const pendingBedKeys = getPendingHarvestProgressBedKeys(state);
    selectionText.textContent = pendingBedKeys.length
      ? "今回追加: " + formatHarvestProgressBedSelection(pendingBedKeys)
      : (hasAppliedHarvestProgress()
        ? "新たに完了したベッドを選択してください"
        : "完了したベッドを選択してください");
  }
  const result = document.getElementById("harvestProgressResult");
  if(result){
    const model = getHarvestProgressResultModel();
    result.textContent = model.text;
    result.hidden = !model.text;
    result.classList.toggle("needs-selection", model.className === "needs-selection");
    result.classList.toggle("is-complete", model.className === "is-complete");
  }
  const resetButton = document.getElementById("harvestProgressResetBtn");
  if(resetButton) resetButton.hidden = !state;
  const applyButton = document.getElementById("harvestProgressApplyBtn");
  if(applyButton) applyButton.textContent = getHarvestProgressApplyLabel(state);
  renderHarvestProgressBeds();
}

function syncHarvestProgressModalState(){
  const modal = document.getElementById("harvestProgressModal");
  document.getElementById("harvestProgressOpenBtn")
    ?.setAttribute("aria-expanded", String(!!modal?.classList.contains("show")));
  if(modal?.classList.contains("show")){
    if(!harvestProgressState && harvestFillKeys.length){
      harvestProgressBuilding = currentBuilding;
    }
    updateHarvestProgressUi();
  }
}

function openHarvestProgressWindow(){
  const modal = document.getElementById("harvestProgressModal");
  if(!modal || !updateHarvestProgressVisibility()){
    showToast("先に収穫場所を計算してください");
    return;
  }
  if(!harvestProgressState && harvestFillKeys.length){
    harvestProgressBuilding = currentBuilding;
  }
  showPageBlockingUi(modal);
  syncHarvestProgressModalState();
  document.getElementById("harvestProgressWindowClose")?.focus();
}

function closeHarvestProgressWindow(options = {}){
  const modal = document.getElementById("harvestProgressModal");
  hidePageBlockingUi(modal);
  syncHarvestProgressModalState();
  if(options.restoreFocus !== false){
    document.getElementById("harvestProgressOpenBtn")?.focus();
  }
}

function toggleHarvestProgressInput(){
  const modal = document.getElementById("harvestProgressModal");
  if(modal?.classList.contains("show")) closeHarvestProgressWindow();
  else openHarvestProgressWindow();
}

function shiftHarvestProgressBuilding(direction){
  harvestProgressBuilding = getAdjacentBuilding(harvestProgressBuilding, direction < 0 ? -1 : 1);
  renderHarvestProgressBeds();
  scheduleHarvestStateSave();
}

function toggleHarvestProgressBed(building, bed){
  const state = ensureHarvestProgressState();
  if(!state){
    showToast("先に通常の収穫場所を計算または選択してください");
    return;
  }
  if(isReverseHarvestProgressState(state)
    && !hasHarvestProgressPlannedPalletInBed(state, building, bed)){
    showToast("逆算時に選択した場所を含むベッドだけ指定できます");
    return;
  }
  const bedKey = getHarvestProgressBedKey(building, bed);
  if(state.appliedSelectedBeds.includes(bedKey)){
    showToast("このベッドは途中経過へ反映済みです。全て取り消す場合は「取り消す」を押してください");
    return;
  }
  const selectedSet = new Set(state.selectedBeds);
  if(selectedSet.has(bedKey)) selectedSet.delete(bedKey);
  else selectedSet.add(bedKey);
  state.selectedBeds = [...selectedSet];
  harvestProgressState = state;
  updateHarvestProgressUi();
  saveHarvestStateToStorage();
}

function handleHarvestProgressCasesInput(){
  const state = ensureHarvestProgressState();
  if(!state) return;
  state.actualCasesInput = document.getElementById("harvestProgressCasesInput")?.value || "";
  harvestProgressState = state;
  updateHarvestProgressUi();
  scheduleHarvestStateSave();
}

function syncHarvestProgressPlanAfterManualSelection(){
  const state = normalizeHarvestProgressState(harvestProgressState);
  if(!state) return;
  const completedSet = getAppliedHarvestProgressCompletedKeySet();
  const preservedPlannedCompletedKeys = state.planKeys.filter(key => completedSet.has(key));
  const currentRemainingKeys = harvestFillKeys.filter(key => !completedSet.has(key));
  state.planKeys = [...new Set([...preservedPlannedCompletedKeys, ...currentRemainingKeys])];
  harvestProgressState = state;
}

function syncReverseHarvestProgressAvailability(){
  if(activeAppTab !== "forecast" || harvestSelectionMode !== "manual") return;
  const casePlan = getHarvestCasePlan();
  const state = normalizeHarvestProgressState(harvestProgressState);
  const isReverseProgress = isReverseHarvestProgressState(state);
  if(!isReverseProgress){
    if(!harvestFillKeys.length) harvestProgressAvailable = false;
    return;
  }
  const reverseProgressReady = harvestCasesAutoEstimated
    && harvestFillKeys.length > 0
    && !!harvestSummary
    && casePlan.totalCases > 0;
  harvestProgressAvailable = reverseProgressReady;
  if(!state) return;
  if(!hasAppliedHarvestProgress()){
    state.targetCases = casePlan.totalCases;
    state.targetDate = casePlan.date;
  }
  harvestProgressState = state;
}

function markForecastHarvestSelectionAsManual(){
  if(activeAppTab !== "forecast") return;
  harvestSelectionMode = "manual";
  syncHarvestProgressPlanAfterManualSelection();
}

function recalculateFromHarvestProgress(){
  const state = ensureHarvestProgressState();
  if(!state){
    showToast("先に通常の収穫場所を計算または選択してください");
    return;
  }
  if(!isHarvestProgressContextCurrent(state)){
    showToast("収穫ケース数または日付が変わっています。途中経過を取り消して選び直してください");
    updateHarvestProgressUi();
    return;
  }
  const pendingBedKeys = getPendingHarvestProgressBedKeys(state);
  if(!pendingBedKeys.length){
    showToast("新たに完了したベッドを選択してください");
    return;
  }
  const casesInput = document.getElementById("harvestProgressCasesInput");
  if(!casesInput || String(casesInput.value || "").trim() === ""){
    showToast("完了したベッドから取れたケース数を入力してください");
    casesInput?.focus();
    return;
  }

  const additionalActualCases = clampNumber(casesInput.value, 0, 999999, 0);
  const actualCases = Math.min(999999, getHarvestProgressActualCases() + additionalActualCases);
  const completedKeys = getHarvestProgressKeysForBeds(state.selectedBeds, state);
  if(!completedKeys.length){
    showToast("選択したベッドには今回の収穫対象がありません");
    return;
  }
  const completedSet = new Set(completedKeys);
  const casePlan = getHarvestCasePlan();
  const remainingNeedHeads = Math.max(0, casePlan.regularCases - actualCases) * CASE_SIZE;
  let remainingKeys = [];
  let selection = null;

  if(state.baseSelectionMode === "auto"){
    if(remainingNeedHeads > 0){
      selection = calculateHarvestSelectionFromRecords({
        referenceDate: new Date(),
        sourceRecords: records,
        needHeads: remainingNeedHeads,
        partialTargetDate: getHarvestTargetDate(),
        additionalExcludedPalletKeys: completedSet
      });
      remainingKeys = selection?.palletKeys || [];
    }
    harvestSelectionMode = "auto";
  }else{
    const recordedSet = getRecordedPalletSet(getHarvestTargetDate());
    remainingKeys = state.planKeys.filter(key => !completedSet.has(key) && !recordedSet.has(key));
    harvestSelectionMode = "manual";
  }

  state.actualCasesInput = "";
  state.appliedActualCases = actualCases;
  state.appliedSelectedBeds = [...state.selectedBeds];
  harvestProgressState = state;
  casesInput.value = "";
  harvestFillKeys = [...new Set([...completedKeys, ...remainingKeys])]
    .sort((left, right) => getOrderIndexFromKey(left) - getOrderIndexFromKey(right));

  if(state.baseSelectionMode === "auto" && selection?.start){
    const nextBuildingValue = parsePalletKey(selection.start).building;
    if(BUILDINGS.includes(nextBuildingValue)){
      syncCurrentCasePlacementFromInputs();
      currentBuilding = nextBuildingValue;
      casePlacementBuilding = nextBuildingValue;
      updateBuildingLabel();
      updateCasePlacementBuildingLabel();
      populateCasePlacementInputs();
    }
  }

  refreshAfterHarvestSelectionChanged({
    selectionChangeSource: state.baseSelectionMode === "auto" ? "progress-auto" : "progress-manual"
  });
  updateHarvestProgressUi();
  showToast(state.baseSelectionMode === "auto"
    ? `${formatHarvestProgressCases(additionalActualCases)}ケースを追加し、残りの収穫場所を更新しました`
    : getHarvestProgressResultModel().text.split("\n").slice(-1)[0]);
}

function resetHarvestProgress(options = {}){
  const state = normalizeHarvestProgressState(harvestProgressState);
  if(!state) return false;
  const shouldRestorePlan = options.restorePlan !== false;
  if(shouldRestorePlan){
    harvestFillKeys = [...state.planKeys];
    harvestSelectionMode = state.baseSelectionMode;
  }
  harvestProgressState = null;
  const input = document.getElementById("harvestProgressCasesInput");
  if(input) input.value = "";
  if(options.render !== false){
    refreshAfterHarvestSelectionChanged({ selectionChangeSource: "progress-reset" });
    updateHarvestProgressUi();
  }
  if(options.save !== false) saveHarvestStateToStorage();
  if(!options.silent) showToast("途中経過を取り消しました");
  return true;
}

function handleHarvestCasesInputChange(){
  markHarvestCasesAsManuallyEdited();
  harvestProgressAvailable = false;
  if(harvestProgressState){
    resetHarvestProgress({ restorePlan: true, silent: true, save: false });
  }
  invalidateWorkflowMonitorCheckpoint();
  syncRecordCasesFromMain(false);
  updateRecordActualLoss();
  renderForecastSummary();
  updateHarvestProgressUi();
}

function captureForecastSelectionState(){
  forecastSelectionState = {
    keys: [...harvestFillKeys],
    summary: harvestSummary ? { ...harvestSummary } : null,
    manualSeedlingCount
  };
}

function restoreForecastSelectionState(options = {}){
  const state = normalizeForecastSelectionState(forecastSelectionState);
  if(!state) return false;
  harvestFillKeys = [...state.keys];
  harvestSummary = state.summary;
  manualSeedlingCount = state.manualSeedlingCount;
  if(options.render !== false){
    drawBeds();
    renderForecastSummary();
  }
  return true;
}

function closeRecordFloatingUi(){
  if(typeof closeDashboardSeedlingStatusDetail === "function"){
    closeDashboardSeedlingStatusDetail({ restoreFocus: false });
  }
  closeRecordDetailWindow({ restoreFocus: false });
  closePartialHarvestEditWindow({ restoreFocus: false });
  closeBedDetailWindow();
  hideBedActionMenu();
  hideRecordBedActionMenu();
  hideRecordImportMenu();
  hideGoogleSheetResendHelp();
  hideRecordImportError();
}

function preservePlantingStateBeforeTabSwitch(options = {}){
  try{
    capturePlantingRecordDraft();
    const restored = restoreForecastSelectionState({ render: options.render !== false });
    scheduleHarvestStateSave({ skipPlantingDraftCapture: true });
    return restored;
  }catch(e){
    console.error("Failed to preserve planting state before tab switch", e);
    scheduleHarvestStateSave({ skipPlantingDraftCapture: true });
    return false;
  }
}

function preserveForecastStateBeforeRecordTab(){
  try{
    captureForecastSelectionState();
    scheduleHarvestStateSave({ skipPlantingDraftCapture: false });
    return true;
  }catch(e){
    console.error("Failed to preserve forecast state before record tab", e);
    return false;
  }
}

function runAfterUiSettles(callback){
  requestAnimationFrame(() => {
    setTimeout(callback, 0);
  });
}

function setDashboardLoadingState(isLoading){
  const loadingState = document.getElementById("dashboardLoadingState");
  if(!loadingState) return;
  loadingState.hidden = !isLoading;
}

function scheduleDashboardRenderAfterTabSelection(){
  const activeSubtab = normalizeDashboardSubtab(dashboardFilter.dashboardSubtab);
  if(
    dashboardRenderedDayKey === formatDateOnlyString(new Date())
    && dashboardRenderedSubtabs.has(activeSubtab)
  ){
    setDashboardLoadingState(false);
    return;
  }
  const scheduleId = ++dashboardRenderScheduleId;
  setDashboardLoadingState(true);
  runAfterUiSettles(() => {
    if(scheduleId !== dashboardRenderScheduleId || activeAppTab !== "dashboard"){
      if(scheduleId === dashboardRenderScheduleId) setDashboardLoadingState(false);
      return;
    }
    try{
      renderDashboard();
    }catch(error){
      console.error("集計を読み込めませんでした", error);
    }finally{
      setDashboardLoadingState(false);
    }
  });
}

function preloadDashboardDuringWelcome(){
  try{
    renderDashboard();
    return true;
  }catch(error){
    dashboardRenderedDayKey = "";
    console.warn("ウェルカム画面中に集計を準備できませんでした", error);
    return false;
  }
}

function scheduleDashboardPreloadDuringIdle(){
  if(typeof window.requestIdleCallback !== "function") return false;
  window.requestIdleCallback(() => {
    const activeSubtab = normalizeDashboardSubtab(dashboardFilter.dashboardSubtab);
    if(
      activeAppTab === "dashboard"
      || (
        dashboardRenderedDayKey === formatDateOnlyString(new Date())
        && dashboardRenderedSubtabs.has(activeSubtab)
      )
    ) return;
    preloadDashboardDuringWelcome();
  });
  return true;
}

function renderDashboardIfVisible(){
  const dashboardTab = document.getElementById("dashboardTab");
  if(dashboardTab && dashboardTab.style.display === "block"){
    renderDashboard();
  }
}

function normalizeMainTabName(tabName){
  const normalized = tabName === "settings" ? "forecast" : String(tabName || "");
  return Object.prototype.hasOwnProperty.call(MAIN_TAB_DEFINITIONS, normalized)
    ? normalized
    : "";
}

function saveCurrentTabScrollPosition(){
  if(!activeAppTab) return;
  tabScrollPositions[activeAppTab] = window.pageYOffset || 0;
}

function restoreTabScrollPosition(tabName){
  const top = tabScrollPositions[tabName] || 0;
  requestAnimationFrame(() => {
    window.scrollTo({ top, behavior: "auto" });
  });
}

function doesForecastTabFitWithoutScrolling(){
  if(activeAppTab !== "forecast" || window.innerWidth > 759 || window.innerHeight < 760) return false;
  if(document.getElementById("casePlacementDetails")?.open) return false;
  if(document.getElementById("harvestProgressPanel")?.open) return false;
  const panel = document.querySelector("#forecastTab .casePlacementPanel");
  const actionBar = document.querySelector("#forecastTab .forecastActionRow");
  if(!panel || !actionBar) return false;
  const scrollTop = window.pageYOffset || 0;
  const panelBottomAtPageTop = panel.getBoundingClientRect().bottom + scrollTop;
  return panelBottomAtPageTop <= actionBar.getBoundingClientRect().top + 1;
}

function doesMonitorTabFitWithoutScrolling(){
  if(activeAppTab !== "monitor" || window.innerWidth > 759) return false;
  const card = document.getElementById("monitorCard");
  const tabBar = document.querySelector(".tabBar");
  if(!card || !tabBar || card.getClientRects().length === 0) return false;
  const scrollTop = window.pageYOffset || 0;
  const cardBottomAtPageTop = card.getBoundingClientRect().bottom + scrollTop;
  return cardBottomAtPageTop <= tabBar.getBoundingClientRect().top + 1;
}

function applyMainTabViewportScrollLock(){
  const shouldLock = doesForecastTabFitWithoutScrolling() || doesMonitorTabFitWithoutScrolling();
  document.documentElement.classList.toggle("mainTabViewportScrollLocked", shouldLock);
  if(shouldLock){
    tabScrollPositions[activeAppTab] = 0;
    if(window.pageYOffset) window.scrollTo({ top:0, behavior:"auto" });
  }
  return shouldLock;
}

function scheduleMainTabViewportScrollLock(){
  if(scheduleMainTabViewportScrollLock.frameId){
    cancelAnimationFrame(scheduleMainTabViewportScrollLock.frameId);
  }
  scheduleMainTabViewportScrollLock.frameId = requestAnimationFrame(() => {
    scheduleMainTabViewportScrollLock.frameId = requestAnimationFrame(() => {
      scheduleMainTabViewportScrollLock.frameId = 0;
      applyMainTabViewportScrollLock();
    });
  });
}

function installMainTabViewportScrollLock(){
  if(document.documentElement.dataset.mainTabViewportScrollLockInstalled === "1") return;
  document.documentElement.dataset.mainTabViewportScrollLockInstalled = "1";
  if(typeof ResizeObserver === "function"){
    const observer = new ResizeObserver(scheduleMainTabViewportScrollLock);
    ["forecastSimulationCard", "monitorCard"].forEach(id => {
      const element = document.getElementById(id);
      if(element) observer.observe(element);
    });
    installMainTabViewportScrollLock.observer = observer;
  }
  window.addEventListener("resize", scheduleMainTabViewportScrollLock, { passive:true });
  window.visualViewport?.addEventListener("resize", scheduleMainTabViewportScrollLock, { passive:true });
  scheduleMainTabViewportScrollLock();
}

function handleMainTabPress(tabName){
  tabName = normalizeMainTabName(tabName);
  if(!tabName) return false;
  if(tabName !== activeAppTab) return switchTab(tabName);
  tabScrollPositions[tabName] = 0;
  window.scrollTo({
    top: 0,
    behavior: getWorkflowScrollBehavior("smooth")
  });
  return true;
}

function setMainTabSelection(tabName){
  MAIN_TAB_NAMES.forEach(name => {
    const isSelected = name === tabName;
    const panel = document.getElementById(name + "Tab");
    const button = document.getElementById(name + "TabBtn");
    if(panel) panel.style.display = isSelected ? "block" : "none";
    button?.classList.toggle("active", isSelected);
  });
  const settingsTab = document.getElementById("settingsTab");
  if(settingsTab) settingsTab.style.display = "none";
  scheduleMainTabViewportScrollLock();
}

function setMainTabLoadingState(tabName, isLoading){
  const loadingState = document.getElementById("mainTabLoadingState");
  if(!loadingState) return;
  MAIN_TAB_NAMES.forEach(name => {
    const definition = MAIN_TAB_DEFINITIONS[name];
    document.getElementById(name + "Tab")?.removeAttribute("aria-busy");
    document.getElementById(name + "TabBtn")?.removeAttribute("aria-busy");
    if(definition.loadingTargetId){
      document.getElementById(definition.loadingTargetId)?.removeAttribute("aria-busy");
    }
  });

  if(!isLoading){
    loadingState.classList.remove("is-delayed-visible");
    loadingState.hidden = true;
    loadingState.removeAttribute("data-loading-tab");
    return;
  }

  const definition = MAIN_TAB_DEFINITIONS[tabName];
  const label = definition?.label || "画面";
  const text = document.getElementById("mainTabLoadingText");
  if(text) text.textContent = label + "をロード中...";
  loadingState.setAttribute("data-loading-tab", tabName);
  loadingState.setAttribute("aria-label", label + "をロード中");
  loadingState.classList.remove("is-delayed-visible");
  loadingState.hidden = false;
  // タブを連続して切り替えた場合も、表示待ちの0.3秒を新しいタブから数え直す。
  void loadingState.offsetWidth;
  loadingState.classList.add("is-delayed-visible");
  document.getElementById(tabName + "Tab")?.setAttribute("aria-busy", "true");
  document.getElementById(tabName + "TabBtn")?.setAttribute("aria-busy", "true");
}

function finishRecordMainTabSelection(){ drawRecordBeds(); }

function finishForecastMainTabSelection(){
  drawBeds();
  renderForecastSummary();
  scheduleMainTabViewportScrollLock();
}

function finishMonitorMainTabSelection(){
  renderForecastSummary();
  resizeAllMonitorMemoInputs();
  refreshMonitorMemoInputsOnTabOpen();
  scheduleMainTabViewportScrollLock();
}

function scheduleMainTabPostSelectionWork(tabName){
  const scheduleId = ++tabSwitchScheduleId;
  const definition = MAIN_TAB_DEFINITIONS[tabName];
  const loadingTarget = definition?.loadingTargetId
    ? document.getElementById(definition.loadingTargetId)
    : null;
  setMainTabLoadingState(tabName, true);
  loadingTarget?.setAttribute("aria-busy", "true");

  runAfterUiSettles(() => {
    if(scheduleId !== tabSwitchScheduleId || activeAppTab !== tabName) return;
    try{
      definition?.afterPaint?.();
    }catch(error){
      console.error("Failed to finish tab selection", error);
      showToast("表示の更新に失敗しました。もう一度タブを押してください");
    }finally{
      if(scheduleId === tabSwitchScheduleId){
        loadingTarget?.removeAttribute("aria-busy");
        setMainTabLoadingState(tabName, false);
      }
    }
  });
}

function preserveStateBeforeMainTabSwitch(previousTab, nextTab){
  if(nextTab === "record" && previousTab !== "record" && recordSelectionMode === "planting"){
    preserveForecastStateBeforeRecordTab();
  }
  if(previousTab === "record" && nextTab !== "record" && recordSelectionMode === "planting"){
    preservePlantingStateBeforeTabSwitch({ render: false });
  }else if(previousTab === "record" && nextTab !== "record" && editingHarvestRecordId){
    editingHarvestSelectionKeys = [...harvestFillKeys];
    restoreForecastSelectionState({ render: false });
  }
}

function prepareRecordMainTabSelection(){
  updateTodayHarvestRecordedStatus();
  if(recordSelectionMode === "planting"){
    applyPlantingRecordDraft(getActivePlantingRecord());
  }else if(editingHarvestRecordId && Array.isArray(editingHarvestSelectionKeys)){
    harvestFillKeys = [...editingHarvestSelectionKeys];
    if(harvestFillKeys.length){
      recalcHarvestSummary();
    }else{
      harvestSummary = null;
    }
    const palletSummaryInput = document.getElementById("recordPalletSummaryInput");
    if(palletSummaryInput) palletSummaryInput.value = formatPalletSummary(harvestFillKeys);
  }else{
    captureRecordBaseSelection();
    const palletSummaryInput = document.getElementById("recordPalletSummaryInput");
    if(palletSummaryInput) palletSummaryInput.value = formatPalletSummary(harvestFillKeys);
  }
  refreshRecordModeUi();
  syncRecordPlantingSummaryFromSelection();
  updateRecordActualLoss();
}

function prepareForecastMainTabSelection(){
  syncCurrentBuildingToCasePlacement({ skipRendering: true, skipSummary: true });
}

function prepareDashboardMainTabSelection(){
  syncDashboardSubtabUi();
  scheduleDashboardRenderAfterTabSelection();
}

function cancelDashboardRenderAfterTabSelection(){
  dashboardRenderScheduleId++;
  setDashboardLoadingState(false);
}

function switchTab(tabName){
  tabName = normalizeMainTabName(tabName);
  if(!tabName) return false;
  if(!ensureProtectedTabAccess(tabName)) return false;
  const previousTab = activeAppTab;
  preserveStateBeforeMainTabSwitch(previousTab, tabName);
  saveCurrentTabScrollPosition();
  closeRecordFloatingUi();
  resolveGoogleSheetConfirm(false);
  resolvePlantingUnselectedWarning(false);

  setMainTabSelection(tabName);
  activeAppTab = tabName;
  scheduleMainTabPostSelectionWork(tabName);
  const definition = MAIN_TAB_DEFINITIONS[tabName];
  definition.afterSelection?.();
  if(!definition.keepsDashboardRender){
    cancelDashboardRenderAfterTabSelection();
  }
  deferPendingHarvestStateSaveUntilUiSettles();
  scheduleWorkflowGuideUpdate();
  restoreTabScrollPosition(tabName);
  scheduleMainTabViewportScrollLock();
  return true;
}

const WORKFLOW_GUIDE_STAGES = [
  {
    key: "input",
    title: "ケース配置を入力し、ケース数または収穫場所を指定",
    actionLabel: "次へ"
  },
  {
    key: "calculate",
    title: "計算設定を確認し、計算",
    actionLabel: "次へ"
  },
  {
    key: "monitor",
    title: "内容を確認し、モニターに送信",
    actionLabel: "送信内容を確認"
  },
  {
    key: "harvest",
    title: "収穫完了後、収穫の記録へ",
    actionLabel: "収穫記録へ"
  },
  {
    key: "planting",
    title: "二次定植完了後、二次定植の記録へ",
    actionLabel: "二次定植記録へ"
  }
];
const WORKFLOW_GUIDE_COMPLETE_STAGE = WORKFLOW_GUIDE_STAGES.length + 1;

function getWorkflowPlanStatus(){
  const casePlan = getHarvestCasePlan();
  const casePlacementTotal = getTotalCasePlacementCount();
  const expectedNeedHeads = casePlan.regularCases * CASE_SIZE;
  const selectedKeyCount = Array.isArray(harvestFillKeys) ? harvestFillKeys.length : 0;
  const recordedSet = selectedKeyCount > 0 ? getRecordedPalletSet() : new Set();
  const hasRecordedSelection = selectedKeyCount > 0 && harvestFillKeys.some(key => recordedSet.has(key));
  const currentHarvestTotal = Math.round(getCurrentHarvestTotal() * 10) / 10;
  const summaryHarvestTotal = Number(harvestSummary?.totalHarvest);
  const summaryMatches = !!harvestSummary
    && Number(harvestSummary.filledCount) === selectedKeyCount
    && Number(harvestSummary.needHeads) === expectedNeedHeads
    && Number.isFinite(summaryHarvestTotal)
    && Math.abs(summaryHarvestTotal - currentHarvestTotal) < 0.11;
  const progressSelectionEnough = !hasAppliedHarvestProgress()
    || currentHarvestTotal + 0.1 >= expectedNeedHeads;
  const ready = casePlan.totalCases > 0
    && casePlacementTotal > 0
    && casePlan.regularCases > 0
    && selectedKeyCount > 0
    && !hasRecordedSelection
    && summaryMatches
    && progressSelectionEnough;

  return {
    ready,
    casePlan,
    casePlacementTotal,
    selectedKeyCount,
    hasRecordedSelection,
    summaryMatches,
    progressSelectionEnough
  };
}

function invalidateWorkflowMonitorCheckpoint(){
  if(!workflowMonitorCheckpointSignature && !workflowHarvestRecordingActive) return;
  workflowMonitorCheckpointSignature = "";
  workflowHarvestRecordingActive = false;
  scheduleWorkflowGuideUpdate();
}

function hashWorkflowCheckpoint(value){
  const text = String(value || "");
  let firstHash = 2166136261;
  let secondHash = 5381;
  for(let index = 0; index < text.length; index++){
    const code = text.charCodeAt(index);
    firstHash = Math.imul(firstHash ^ code, 16777619);
    secondHash = Math.imul(secondHash, 33) ^ code;
  }
  return [
    "wf1",
    text.length.toString(36),
    (firstHash >>> 0).toString(36),
    (secondHash >>> 0).toString(36)
  ].join("-");
}

function getWorkflowPlanFingerprint(){
  const monitorContent = buildCurrentMonitorRemoteContent();
  const memoItems = normalizeMonitorMemoItems(monitorContent.memoItems, monitorContent.memoText)
    .map(item => String(item || "").trim())
    .filter(Boolean);
  const selectedKeys = [...new Set(expandPalletKeyItemsToKeys(monitorContent.harvestFillKeys))]
    .sort((a, b) => getOrderIndexFromKey(a) - getOrderIndexFromKey(b));
  return hashWorkflowCheckpoint(JSON.stringify({
    targetDay: getHarvestTargetDateString(),
    instructionText: removeMonitorPreviewLayoutLine(
      String(monitorContent.instructionText || "").replace(/\r\n?/g, "\n")
    ),
    memoItems,
    harvestFillKeys: selectedKeys
  }));
}

function getWorkflowActivePendingRecord(){
  if(recordSelectionMode !== "planting" || !workflowPlantingSessionActive) return null;
  const activeRecord = getActivePlantingRecord();
  return activeRecord?.type === "fullHarvest" ? activeRecord : null;
}

function normalizeWorkflowGuideStage(value, fallback = 1){
  const stage = Math.trunc(Number(value));
  if(stage >= 1 && stage <= WORKFLOW_GUIDE_COMPLETE_STAGE) return stage;
  return fallback;
}

function inferInitialWorkflowGuideStage(){
  if(getWorkflowActivePendingRecord()) return 5;
  if(workflowHarvestRecordingActive && workflowMonitorCheckpointSignature) return 4;
  if(getWorkflowPlanStatus().ready) return 3;
  return 1;
}

function saveWorkflowGuideProgress(){
  try{
    harvestnaviLocalStorage.writeJson(WORKFLOW_GUIDE_STATE_KEY, {
      stage: normalizeWorkflowGuideStage(workflowGuideStage),
      furthestStage:normalizeWorkflowGuideStage(workflowGuideFurthestStage)
    });
  }catch(e){
    console.warn("Failed to save workflow guide progress", e);
  }
}

function initializeWorkflowGuideProgress(){
  let saved = null;
  try{
    saved = harvestnaviLocalStorage.readJson(WORKFLOW_GUIDE_STATE_KEY, null);
  }catch(e){
    saved = null;
  }
  if(saved){
    workflowGuideStage = normalizeWorkflowGuideStage(saved.stage);
    workflowGuideFurthestStage = Math.max(
      workflowGuideStage,
      normalizeWorkflowGuideStage(saved.furthestStage, workflowGuideStage)
    );
  }else{
    workflowGuideStage = inferInitialWorkflowGuideStage();
    workflowGuideFurthestStage = workflowGuideStage;
    saveWorkflowGuideProgress();
  }
  updateWorkflowGuide();
}

function setWorkflowGuideStage(stage, options = {}){
  const nextStage = normalizeWorkflowGuideStage(stage, workflowGuideStage);
  if(nextStage === workflowGuideStage && options.force !== true && options.resetFurthest !== true){
    scheduleWorkflowGuideUpdate();
    return false;
  }
  workflowGuideStage = nextStage;
  workflowGuideFurthestStage = options.resetFurthest === true
    ? nextStage
    : Math.max(workflowGuideFurthestStage, nextStage);
  saveWorkflowGuideProgress();
  scheduleWorkflowGuideUpdate();
  return true;
}

function hasWorkflowCalculationResult(){
  const selectedKeyCount = Array.isArray(harvestFillKeys) ? harvestFillKeys.length : 0;
  const expectedNeedHeads = getHarvestCasePlan().regularCases * CASE_SIZE;
  const currentHarvestTotal = Math.round(getCurrentHarvestTotal() * 10) / 10;
  const summaryHarvestTotal = Number(harvestSummary?.totalHarvest);
  return expectedNeedHeads > 0
    && selectedKeyCount > 0
    && !!harvestSummary
    && Number(harvestSummary.filledCount) === selectedKeyCount
    && Number(harvestSummary.needHeads) === expectedNeedHeads
    && Number.isFinite(summaryHarvestTotal)
    && Math.abs(summaryHarvestTotal - currentHarvestTotal) < 0.11;
}

function getWorkflowGuideState(){
  if(workflowGuideStage === WORKFLOW_GUIDE_COMPLETE_STAGE){
    return {
      stage: WORKFLOW_GUIDE_COMPLETE_STAGE,
      key: "complete",
      title: "お疲れ様でした。",
      actionLabel: "最初に戻る",
      actionEnabled: true,
      showBack: false,
      progress: 100
    };
  }
  const stage = normalizeWorkflowGuideStage(workflowGuideStage);
  const definition = WORKFLOW_GUIDE_STAGES[stage - 1];
  const isCompletedReview = stage < workflowGuideFurthestStage;
  const title = stage === 2 && harvestCasesAutoEstimated
    ? "計算設定と逆算結果を確認"
    : definition.title;
  return {
    stage,
    ...definition,
    title,
    actionLabel:isCompletedReview ? "次へ" : definition.actionLabel,
    actionEnabled: isCompletedReview || stage !== 2 || hasWorkflowCalculationResult(),
    showBack: stage > 1,
    progress: stage * 20,
    isCompletedReview
  };
}

function completeWorkflowGuideCalculation(){
  if(workflowGuideStage <= 2) setWorkflowGuideStage(3);
}

function completeWorkflowGuideMonitorSend(){
  if(workflowGuideStage <= 3) setWorkflowGuideStage(4);
}

function completeWorkflowGuideHarvestRecord(){
  if(workflowGuideStage <= 4) setWorkflowGuideStage(5);
}

function showWorkflowCompletionCelebration(){
  setWorkflowGuideStage(WORKFLOW_GUIDE_COMPLETE_STAGE);
}

function updateWorkflowGuide(){
  if(workflowGuideUpdateFrame !== null && typeof cancelAnimationFrame === "function"){
    cancelAnimationFrame(workflowGuideUpdateFrame);
  }
  workflowGuideUpdateFrame = null;
  const bar = document.getElementById("workflowBar");
  if(!bar) return;
  const state = getWorkflowGuideState();
  bar.dataset.currentStep = state.key;
  const title = document.getElementById("workflowNextTitle");
  if(title) title.textContent = state.title;
  const actionLabel = document.getElementById("workflowNextActionLabel");
  if(actionLabel) actionLabel.textContent = state.actionLabel;
  const actionButton = document.getElementById("workflowNextActionBtn");
  if(actionButton){
    actionButton.disabled = state.actionEnabled === false;
    actionButton.setAttribute("aria-label", state.actionLabel);
    actionButton.title = state.actionEnabled === false ? "計算または配置図からの逆算を完了すると進めます" : "";
  }
  const backButton = document.getElementById("workflowBackActionBtn");
  if(backButton){
    backButton.hidden = !state.showBack;
    backButton.setAttribute("aria-label", "前の工程へ戻る");
  }
  const progressTrack = document.getElementById("workflowProgressTrack");
  if(progressTrack){
    progressTrack.setAttribute("aria-valuenow", String(state.progress));
    progressTrack.setAttribute("aria-valuetext", `今日の作業進捗 ${state.progress}%`);
  }
  const progressFill = document.getElementById("workflowProgressFill");
  if(progressFill){
    progressFill.style.width = `${state.progress}%`;
  }
  const liveRegion = document.getElementById("workflowLiveRegion");
  if(liveRegion){
    const announcement = state.key === "complete"
      ? state.title
      : "現在の作業: " + state.title;
    if(liveRegion.textContent !== announcement) liveRegion.textContent = announcement;
  }
}

function scheduleWorkflowGuideUpdate(){
  if(!document.getElementById("workflowBar")) return;
  if(workflowGuideUpdateFrame !== null) return;
  if(typeof requestAnimationFrame !== "function"){
    updateWorkflowGuide();
    return;
  }
  workflowGuideUpdateFrame = requestAnimationFrame(updateWorkflowGuide);
}

function syncAppTopChromeHeight(){
  const chrome = document.querySelector(".appTopChrome");
  if(!chrome) return;
  const height = Math.ceil(chrome.getBoundingClientRect().height);
  if(!Number.isFinite(height) || height <= 0) return;
  const value = height + "px";
  if(document.documentElement.style.getPropertyValue("--app-top-chrome-height") !== value){
    document.documentElement.style.setProperty("--app-top-chrome-height", value);
  }
}

function setWorkflowBarVisibility(visible, options = {}){
  const bar = document.getElementById("workflowBar");
  const button = document.getElementById("workflowVisibilityBtn");
  const isVisible = visible !== false;
  if(bar) bar.hidden = !isVisible;
  if(button){
    button.classList.toggle("is-collapsed", !isVisible);
    button.setAttribute("aria-expanded", String(isVisible));
    button.setAttribute("aria-label", isVisible ? "Harvestnavi。ナビバーを閉じる" : "Harvestnavi。ナビバーを表示する");
    button.title = isVisible ? "ナビバーを閉じる" : "ナビバーを表示する";
  }
  if(options.persist !== false){
    try{
      harvestnaviLocalStorage.setItem(WORKFLOW_BAR_VISIBILITY_KEY, isVisible ? "1" : "0");
    }catch(e){
      console.warn("Failed to save workflow bar visibility", e);
    }
  }
  requestAnimationFrame(syncAppTopChromeHeight);
}

function toggleWorkflowBarVisibility(){
  document.getElementById("workflowVisibilityBtn")?.classList.remove("show-title-hint");
  markWorkflowTitleHintShown();
  const bar = document.getElementById("workflowBar");
  setWorkflowBarVisibility(!!bar?.hidden);
}

function markWorkflowTitleHintShown(){
  try{
    harvestnaviLocalStorage.setItem(WORKFLOW_TITLE_HINT_SHOWN_KEY, "1");
  }catch(e){}
}

function scheduleWorkflowTitleHintOnce(delayMs = 1800){
  try{
    if(harvestnaviLocalStorage.getItem(WORKFLOW_TITLE_HINT_SHOWN_KEY) === "1") return;
  }catch(e){}
  setTimeout(() => {
    const button = document.getElementById("workflowVisibilityBtn");
    if(!button) return;
    try{
      if(harvestnaviLocalStorage.getItem(WORKFLOW_TITLE_HINT_SHOWN_KEY) === "1") return;
    }catch(e){}
    markWorkflowTitleHintShown();
    button.classList.add("show-title-hint");
    setTimeout(() => button.classList.remove("show-title-hint"), 2600);
  }, Math.max(0, Number(delayMs) || 0));
}

function restoreWorkflowBarVisibility(){
  let visible = false;
  try{
    visible = harvestnaviLocalStorage.getItem(WORKFLOW_BAR_VISIBILITY_KEY) === "1";
  }catch(e){
    visible = false;
  }
  setWorkflowBarVisibility(visible, { persist:false });
}

function installAppTopChromeLayoutSync(){
  const chrome = document.querySelector(".appTopChrome");
  if(!chrome) return;
  syncAppTopChromeHeight();
  if(typeof ResizeObserver !== "undefined" && !appTopChromeResizeObserver){
    appTopChromeResizeObserver = new ResizeObserver(syncAppTopChromeHeight);
    appTopChromeResizeObserver.observe(chrome);
  }
  window.addEventListener("resize", syncAppTopChromeHeight, { passive:true });
  if(window.visualViewport){
    window.visualViewport.addEventListener("resize", syncAppTopChromeHeight, { passive:true });
  }
  requestAnimationFrame(syncAppTopChromeHeight);
}

function getAppTopChromeOffset(){
  const chrome = document.querySelector(".appTopChrome");
  const height = chrome ? chrome.getBoundingClientRect().height : 0;
  return Math.max(0, Math.ceil(height)) + 10;
}

function getWorkflowScrollBehavior(behavior = "auto"){
  const reduceMotion = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return behavior === "smooth" && reduceMotion ? "auto" : behavior;
}

function scrollToWorkflowTarget(targetId, options = {}){
  const target = document.getElementById(targetId);
  if(!target) return;
  const top = target.getBoundingClientRect().top + window.pageYOffset - getAppTopChromeOffset();
  window.scrollTo({ top: Math.max(0, top), behavior: getWorkflowScrollBehavior(options.behavior || "smooth") });
}

function focusWorkflowTarget(targetId){
  const target = document.getElementById(targetId);
  if(!target || typeof target.focus !== "function") return;
  const hadTabIndex = target.hasAttribute("tabindex");
  if(!hadTabIndex) target.setAttribute("tabindex", "-1");
  try{
    target.focus({ preventScroll: true });
  }catch(e){
    target.focus();
  }
  if(!hadTabIndex && typeof target.addEventListener === "function"){
    target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
  }
}

function moveWorkflowGuideBack(){
  const state = getWorkflowGuideState();
  if(state.stage <= 1 || state.stage >= WORKFLOW_GUIDE_COMPLETE_STAGE) return;
  setWorkflowGuideStage(state.stage - 1);
}

function openWorkflowPlantingRecord(){
  const pendingRecord = getWorkflowActivePendingRecord() || getLatestPendingPlantingRecord();
  if(switchTab("record") === false) return;
  if(pendingRecord && (recordSelectionMode !== "planting" || Number(activePlantingRecordId) !== Number(pendingRecord.id))){
    resumePlantingRecord(pendingRecord.id);
    requestAnimationFrame(() => requestAnimationFrame(() => focusWorkflowTarget("recordPlantingStageSection")));
    return;
  }
  requestAnimationFrame(() => requestAnimationFrame(() => {
    scrollToRecordActiveStage({ behavior: "auto" });
    focusWorkflowTarget("recordPlantingStageSection");
  }));
}

function handleWorkflowPrimaryAction(){
  const state = getWorkflowGuideState();
  if(state.isCompletedReview){
    setWorkflowGuideStage(state.stage + 1);
    return;
  }
  if(state.stage === 1){
    setWorkflowGuideStage(2);
    return;
  }
  if(state.stage === 2){
    if(!hasWorkflowCalculationResult()){
      showToast("計算するか、配置図から収穫場所を選択してください");
      return;
    }
    setWorkflowGuideStage(3);
    return;
  }
  if(state.stage === 3){
    if(switchTab("monitor") === false) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      scrollToWorkflowTarget("monitorCard");
      focusWorkflowTarget("monitorCard");
    }));
    return;
  }
  if(state.stage === 4){
    switchToRecordSaveCard({ focus: true });
    return;
  }
  if(state.stage === 5){
    openWorkflowPlantingRecord();
    return;
  }
  setWorkflowGuideStage(1, { resetFurthest:true });
  if(switchTab("forecast") === false) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    scrollToWorkflowTarget("forecastSimulationCard", { behavior: "auto" });
    focusWorkflowTarget("forecastSimulationCard");
  }));
}
