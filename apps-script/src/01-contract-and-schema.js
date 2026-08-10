// スタンドアロンのApps Scriptでは、接続先IDをスクリプト プロパティへ保存します。
// スプレッドシートに紐づいたApps Scriptは、未設定でも紐づけ先を使用できます。
const SPREADSHEET_ID_PROPERTY_NAME = "HARVEST_SPREADSHEET_ID";
const SHEET_NAME = "記録";
const RECORD_TRASH_SHEET_NAME = "削除済み記録";
const RECORD_TOMBSTONE_SHEET_NAME = "記録削除ID";
const RECORD_TRASH_RETENTION_DAYS = 30;
const PLANTING_EVENT_SHEET_NAME = "苗植えイベント";
const PLANTING_EVENT_TRASH_SHEET_NAME = "削除済み苗植えイベント";
const PLANTING_EVENT_TOMBSTONE_SHEET_NAME = "苗植えイベント削除ID";
const MONITOR_SHEET_NAME = "モニター設定";
const MONITOR_HISTORY_SHEET_NAME = "モニター編集履歴";
const MONITOR_HISTORY_LIMIT = 1000;
const API_TOKEN_PROPERTY_NAME = "HARVEST_API_TOKEN";
const HARVEST_RECORD_REPAIR_BACKUP_PROPERTY =
  "HARVEST_RECORD_REPAIR_BACKUP_V1_20260809";
const SYNC_REVISION_PROPERTY_NAME = "HARVEST_SYNC_REVISION_V1";
const SYNC_REVISION_FLOOR_PROPERTY_NAME = "HARVEST_SYNC_REVISION_FLOOR_V1";
const SYNC_CHANGE_LOG_SHEET_NAME = "同期変更履歴";
const SYNC_CHANGE_LOG_HEADERS = [
  "同期番号",
  "対象",
  "記録UUID",
  "対象ID",
  "操作",
  "更新日時"
];
const SYNC_CHANGE_LOG_PAGE_LIMIT = 100;
const SYNC_CHANGE_LOG_RESPONSE_CHAR_LIMIT = 800000;
const SYNC_CHANGE_LOG_MAX_ROWS = 20000;
const SYNC_CHANGE_LOG_RETAINED_ROWS = 10000;
const API_BUILD_VERSION = "2026-08-10-planting-count-presets-1";
const API_TOKEN_MIN_LENGTH = 32;
const API_TOKEN_MAX_LENGTH = 512;
const API_MAX_BODY_CHARACTERS = 500000;
const API_MAX_BODY_BYTES = 1000000;
const API_BATCH_RECORD_LIMIT = 100;
const RECORD_CASES_LIMIT = 999999;
const RECORD_SEEDLING_TRAY_LIMIT = 999999;
const RECORD_PALLET_KEY_LIMIT = 3744;
const RECORD_TARGET_LIMIT = 48;
const RECORD_MEMO_LENGTH_LIMIT = 10000;
const RECORD_SUMMARY_LENGTH_LIMIT = 20000;
const RECORD_QUALITY_LENGTH_LIMIT = 2000;
const RECORD_DUPLICATE_KEY_LENGTH_LIMIT = 128;
const RECORD_UUID_LENGTH_LIMIT = 64;
const PLANTING_AGE_SUMMARY_LENGTH_LIMIT = 2000;
const PLANTING_AGE_DETAIL_LENGTH_LIMIT = 20000;
const MONITOR_INSTRUCTION_LENGTH_LIMIT = 20000;
const MONITOR_MEMO_LENGTH_LIMIT = 50000;
const MONITOR_MEMO_ITEM_LIMIT = 100;
const MONITOR_MEMO_ITEM_LENGTH_LIMIT = 5000;
const RECORD_LIST_LIMIT = 1000;
const RECORD_LIST_RECENT_DAYS_LIMIT = 3650;
const RECORD_TOMBSTONE_LIST_LIMIT = 10000;
const HARVEST_RECORD_API_RESPONSE_CHAR_LIMIT = 600000;
const COMBINED_SYNC_API_RESPONSE_CHAR_LIMIT = 900000;
const PLANTING_EVENT_ALLOCATION_LIMIT = 1000;
const PLANTING_EVENT_LIST_LIMIT = 1000;
const PLANTING_EVENT_TOMBSTONE_LIST_LIMIT = 10000;
const PLANTING_EVENT_API_EVENT_RESPONSE_CHAR_LIMIT = 800000;
const PLANTING_EVENT_SEEDLING_COUNT_LIMIT = 999999999;
const RECORD_SYNC_SCHEMA_VERSION = 4;
const RECORD_SYNC_PROVIDED_FIELDS_MIN_VERSION = 2;
const HARVEST_BUILDINGS = [2, 3, 4, 5, 6, 7, 8, 9];
const HARVEST_BEDS = ["A", "B", "C", "D", "E", "F"];
const PALLETS_PER_BED = 78;
const CURRENT_PALLET_NUMBERING_VERSION = 2;
const RECORD_TYPES = ["fullHarvest", "partialHarvest"];
const QUALITY_TAGS = ["large", "small", "elongated", "chip"];
const RECORD_FORMULA_SAFE_TEXT_KEYS = new Set([
  "palletSummary",
  "plantingCaseInstruction",
  "plantingSummary",
  "qualityText",
  "plantingAge",
  "memo"
]);
const HARVEST_WRITE_MARKER_PREFIX = "__HARVEST_WRITING_V1__";
const PLANTING_WRITE_MARKER_PREFIX = "__PLANTING_WRITING_V1__";

const MONITOR_SETTING_KEYS = [
  "enabled",
  "version",
  "instructionText",
  "memoText",
  "harvestFillKeys",
  "updatedAt"
];

const MONITOR_SETTING_LABELS = {
  enabled: "遠隔表示を使う",
  version: "更新番号",
  instructionText: "指示内容",
  memoText: "メモ欄",
  harvestFillKeys: "収穫場所キーJSON",
  updatedAt: "更新日時"
};

const MONITOR_HISTORY_KEYS = [
  "savedAt",
  "version",
  "enabled",
  "instructionText",
  "memoText",
  "harvestFillKeys"
];

const MONITOR_HISTORY_HEADERS = [
  "保存日時",
  "更新番号",
  "遠隔表示",
  "指示内容",
  "メモ欄",
  "収穫場所キーJSON"
];

const FIELD_KEYS = [
  "duplicateKey",
  "id",
  "recordUuid",
  "type",
  "date",
  "cases",
  "palletSummary",
  "plannedSeedlingTrayCount",
  "plantingCaseInstruction",
  "plantingSummary",
  "plantingDate",
  "actualSeedlingTrayCount",
  "actualSeedlingCarryoverMode",
  "actualSeedlingLossRate",
  "actualLoss",
  "qualityText",
  "sizeRating",
  "plantingAge",
  "memo",
  "palletKeys",
  "plantingPalletKeys",
  "targets",
  "createdAt",
  "updatedAt",
  "receivedAt",
  "palletNumberingVersion"
];

const HEADER_LABELS = {
  duplicateKey: "重複判定キー",
  id: "記録ID",
  recordUuid: "記録UUID",
  type: "記録種別",
  date: "収穫日",
  cases: "ケース数",
  palletSummary: "収穫場所",
  plannedSeedlingTrayCount: "予定苗枚数",
  plantingCaseInstruction: "ケース指示",
  plantingSummary: "苗植え場所",
  plantingDate: "苗植え日",
  actualSeedlingTrayCount: "実苗枚数",
  actualSeedlingCarryoverMode: "余り苗区分",
  actualSeedlingLossRate: "実苗ロス率",
  actualLoss: "実ロス率",
  qualityText: "品質メモ",
  sizeRating: "大きさ",
  plantingAge: "定植日数",
  memo: "メモ",
  palletKeys: "パレット詳細",
  plantingPalletKeys: "苗植え詳細",
  targets: "先取り詳細",
  createdAt: "作成日時",
  updatedAt: "更新日時",
  receivedAt: "受信日時",
  palletNumberingVersion: "パレット番号方式"
};

const HEADERS = FIELD_KEYS.map(key => HEADER_LABELS[key]);
const RECORD_TRASH_HEADERS = HEADERS.concat(["削除日時", "復元期限"]);
const RECORD_TOMBSTONE_HEADERS = ["記録UUID", "記録ID", "削除日時"];
const RECORD_SYNC_PRESERVED_FIELD_KEYS = [
  "plantingCaseInstruction",
  "actualSeedlingCarryoverMode"
];

const PLANTING_EVENT_FIELD_KEYS = [
  "eventId",
  "plantingDate",
  "sourceAllocations",
  "plantingPalletKeys",
  "plantingCountsByPallet",
  "actualSeedlingTrayCount",
  "actualTakenSeedlingCount",
  "actualPlantedSeedlingCount",
  "actualSeedlingCarryoverMode",
  "actualSeedlingLossRate",
  "qualityMemo",
  "createdAt",
  "updatedAt",
  "detailsUnknown",
  "palletNumberingVersion"
];

const PLANTING_EVENT_HEADER_LABELS = {
  eventId: "苗植えイベントID",
  plantingDate: "苗植え日",
  sourceAllocations: "収穫元割当JSON",
  plantingPalletKeys: "苗植え詳細JSON",
  plantingCountsByPallet: "パレット別植え付け株数JSON",
  actualSeedlingTrayCount: "実苗枚数",
  actualTakenSeedlingCount: "実取得苗株数",
  actualPlantedSeedlingCount: "実苗植え株数",
  actualSeedlingCarryoverMode: "余り苗区分",
  actualSeedlingLossRate: "実苗ロス率",
  qualityMemo: "苗の品質メモ",
  detailsUnknown: "苗数量情報",
  createdAt: "作成日時",
  updatedAt: "更新日時",
  palletNumberingVersion: "パレット番号方式"
};

const PLANTING_EVENT_HEADERS = PLANTING_EVENT_FIELD_KEYS.map(
  key => PLANTING_EVENT_HEADER_LABELS[key]
);
const PLANTING_EVENT_TRASH_HEADERS = PLANTING_EVENT_HEADERS.concat(["削除日時", "復元期限"]);
const PLANTING_EVENT_TOMBSTONE_HEADERS = ["苗植えイベントID", "削除日時"];
const PLANTING_EVENT_FORMULA_SAFE_KEYS = new Set([
  "sourceAllocations",
  "plantingPalletKeys",
  "plantingCountsByPallet",
  "qualityMemo"
]);

let requestScopedSpreadsheet = null;
let requestScopedChangedHarvestRecordIds = new Set();
