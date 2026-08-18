function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function normalizePalletNumberingVersion(value) {
  return normalizeRequiredInteger(
    value,
    "パレット番号方式",
    CURRENT_PALLET_NUMBERING_VERSION,
    CURRENT_PALLET_NUMBERING_VERSION
  );
}

function comparePalletKeys(left, right) {
  const leftParts = String(left || "").split("-");
  const rightParts = String(right || "").split("-");
  return Number(leftParts[0]) - Number(rightParts[0])
    || String(leftParts[1] || "").localeCompare(String(rightParts[1] || ""))
    || Number(leftParts[2]) - Number(rightParts[2]);
}

function getSeedlingHouseOrderIndex(key) {
  const match = String(key || "").match(/^1-([A-F])-(\d+)$/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const bed = match[1];
  const number = Number(match[2]);
  const sequence = [
    { bed: "A", direction: 1 },
    { bed: "B", direction: 1 },
    { bed: "D", direction: -1 },
    { bed: "C", direction: -1 },
    { bed: "E", direction: 1 },
    { bed: "F", direction: 1 }
  ];
  const bedIndex = sequence.findIndex(item => item.bed === bed);
  if (bedIndex < 0 || !Number.isInteger(number) || number < 1 || number > PALLETS_PER_BED) {
    return Number.MAX_SAFE_INTEGER;
  }
  const numberIndex = sequence[bedIndex].direction < 0
    ? PALLETS_PER_BED - number
    : number - 1;
  return bedIndex * PALLETS_PER_BED + numberIndex;
}

function normalizeSeedlingHousePalletKeys(value) {
  if (value === null || typeof value === "undefined" || value === "") return [];
  if (!Array.isArray(value)) throw new Error("1号棟苗取り場所は配列で指定してください");
  if (value.length > HARVEST_BEDS.length * PALLETS_PER_BED) {
    throw new Error("1号棟苗取り場所が1号棟の収容数を超えています");
  }
  const keys = [];
  const seen = new Set();
  value.forEach(item => {
    if (typeof item !== "string") throw new Error("1号棟苗取り場所の形式が正しくありません");
    const key = item.trim();
    if (getSeedlingHouseOrderIndex(key) === Number.MAX_SAFE_INTEGER) {
      throw new Error("1号棟苗取り場所が範囲外です");
    }
    if (seen.has(key)) throw new Error("1号棟苗取り場所が重複しています");
    seen.add(key);
    keys.push(key);
  });
  return keys.sort((left, right) => getSeedlingHouseOrderIndex(left) - getSeedlingHouseOrderIndex(right));
}


function normalizeHarvestRecord(record) {
  if (!isPlainObject(record)) throw new Error("記録データはオブジェクトで指定してください");

  const type = normalizeRequiredEnum(record.type, "記録種別", RECORD_TYPES);
  const id = normalizeRequiredInteger(record.id, "記録ID", 1, Number.MAX_SAFE_INTEGER);
  normalizePalletNumberingVersion(record.palletNumberingVersion);
  const recordUuid = normalizeRequiredRecordUuid(record.recordUuid);
  const createdAt = normalizeOptionalTimestamp(record.createdAt, "作成日時");
  const updatedAt = normalizeOptionalTimestamp(record.updatedAt, "更新日時");
  const date = normalizeRequiredDate(record.date, "収穫日");
  const cases = normalizeRequiredInteger(record.cases, "ケース数", 1, RECORD_CASES_LIMIT);
  const suppliedDuplicateKey = normalizeOptionalText(
    record.duplicateKey,
    "重複判定キー",
    RECORD_DUPLICATE_KEY_LENGTH_LIMIT,
    true
  );
  if (suppliedDuplicateKey && suppliedDuplicateKey !== date + "__" + cases) {
    throw new Error("重複判定キーが記録内容と一致しません");
  }

  const memo = normalizeOptionalText(record.memo, "メモ", RECORD_MEMO_LENGTH_LIMIT, false);
  const rawTargets = normalizeRecordTargets(record.targets);
  const rawPalletKeys = normalizeDirectPalletKeys(record.palletKeys, "収穫パレット");
  const rawPlantingPalletKeys = normalizeDirectPalletKeys(
    record.plantingPalletKeys,
    "苗植えパレット"
  );
  const targets = rawTargets;
  const palletKeys = rawPalletKeys;
  const plantingPalletKeys = rawPlantingPalletKeys;

  if (type === "partialHarvest") {
    if (!targets.length) throw new Error("先取り収穫の対象がありません");
    if (palletKeys.length || plantingPalletKeys.length) {
      throw new Error("先取り収穫にはパレット一覧を指定できません");
    }
    return {
      id,
      recordUuid,
      palletNumberingVersion: CURRENT_PALLET_NUMBERING_VERSION,
      duplicateKey: date + "__" + cases,
      type,
      date,
      cases,
      palletSummary: formatValidatedPartialHarvestSummary(targets),
      plannedSeedlingTrayCount: 0,
      plantingCaseInstruction: "",
      plantingSummary: "",
      plantingDate: "",
      actualSeedlingTrayCount: 0,
      actualSeedlingCarryoverMode: "loss",
      actualSeedlingLossRate: "",
      actualLoss: "",
      qualityMemo: null,
      qualityText: "",
      sizeRating: "unknown",
      plantingAge: null,
      memo,
      palletKeys: [],
      plantingPalletKeys: [],
      targets,
      createdAt,
      updatedAt
    };
  }

  if (!palletKeys.length) throw new Error("収穫パレットがありません");
  if (targets.length) throw new Error("通常収穫には先取り対象を指定できません");

  normalizeRequiredText(
    record.palletSummary,
    "収穫場所",
    RECORD_SUMMARY_LENGTH_LIMIT,
    true
  );
  const palletSummary = formatRecordedPalletSummary(palletKeys);
  const plannedSeedlingTrayCount = normalizeOptionalInteger(
    record.plannedSeedlingTrayCount,
    "予定苗枚数",
    0,
    RECORD_SEEDLING_TRAY_LIMIT,
    0
  );
  const suppliedPlantingSummary = normalizeOptionalText(
    record.plantingSummary,
    "苗植え場所",
    RECORD_SUMMARY_LENGTH_LIMIT,
    false
  );
  const plantingSummary = suppliedPlantingSummary;
  const plantingDate = normalizeOptionalDate(record.plantingDate, "苗植え日");
  const actualSeedlingTrayCount = normalizeOptionalInteger(
    record.actualSeedlingTrayCount,
    "実苗枚数",
    0,
    RECORD_SEEDLING_TRAY_LIMIT,
    0
  );
  const actualSeedlingLossRate = normalizeOptionalFiniteNumber(
    record.actualSeedlingLossRate,
    "実苗ロス率",
    0,
    100,
    ""
  );
  const actualLoss = normalizeRequiredFiniteNumber(record.actualLoss, "実ロス率", -999999, 100);
  const qualityMemo = normalizeQualityMemoInput(record.qualityMemo);
  const qualityText = normalizeOptionalText(
    record.qualityText,
    "品質メモ",
    RECORD_QUALITY_LENGTH_LIMIT,
    false
  );
  const sizeRating = normalizeOptionalSizeRating(record.sizeRating);
  const plantingAge = normalizePlantingAgeInput(record.plantingAge);
  const plantingCaseInstruction = normalizeOptionalText(
    record.plantingCaseInstruction,
    "ケース配置指示",
    RECORD_SUMMARY_LENGTH_LIMIT,
    false
  );
  const actualSeedlingCarryoverMode = normalizeOptionalCarryoverMode(record.actualSeedlingCarryoverMode);

  return {
    id,
    recordUuid,
    palletNumberingVersion: CURRENT_PALLET_NUMBERING_VERSION,
    duplicateKey: date + "__" + cases,
    type,
    date,
    cases,
    palletSummary,
    plannedSeedlingTrayCount,
    plantingCaseInstruction,
    plantingSummary,
    plantingDate,
    actualSeedlingTrayCount,
    actualSeedlingCarryoverMode,
    actualSeedlingLossRate,
    actualLoss,
    qualityMemo,
    qualityText,
    sizeRating,
    plantingAge,
    memo,
    palletKeys,
    plantingPalletKeys,
    targets: [],
    createdAt,
    updatedAt
  };
}

function normalizeOptionalRecordUuid(value) {
  if (value === null || typeof value === "undefined" || value === "") return "";
  if (typeof value !== "string" || value.length > RECORD_UUID_LENGTH_LIMIT) {
    throw new Error("記録UUIDの形式が正しくありません");
  }
  const text = value.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(text)) {
    throw new Error("記録UUIDの形式が正しくありません");
  }
  return text;
}

function normalizeRequiredRecordUuid(value) {
  const recordUuid = normalizeOptionalRecordUuid(value);
  if (!recordUuid) throw new Error("記録UUIDがありません");
  return recordUuid;
}

function normalizePlantingEvent(event) {
  if (!isPlainObject(event)) throw new Error("苗植えイベントはオブジェクトで指定してください");

  const eventId = normalizeRequiredInteger(
    event.eventId,
    "苗植えイベントID",
    1,
    Number.MAX_SAFE_INTEGER
  );
  normalizePalletNumberingVersion(event.palletNumberingVersion);
  const plantingDate = normalizeRequiredDate(event.plantingDate, "苗植え日");
  const actualSeedlingTrayCount = normalizeOptionalInteger(
    event.actualSeedlingTrayCount,
    "実苗枚数",
    0,
    RECORD_SEEDLING_TRAY_LIMIT,
    0
  );
  const seedlingHousePalletKeys = normalizeSeedlingHousePalletKeys(event.seedlingHousePalletKeys);
  if (seedlingHousePalletKeys.length > actualSeedlingTrayCount) {
    throw new Error("1号棟苗取り場所が実苗枚数を超えています");
  }
  const seedlingHousePrimaryPlantingDate = event.seedlingHousePrimaryPlantingDate
    ? normalizeRequiredDate(event.seedlingHousePrimaryPlantingDate, "1号棟一次定植日")
    : (seedlingHousePalletKeys.length ? plantingDate : "");
  const rawSeedlingHouseNextStartKey = String(event.seedlingHouseNextStartKey || "").trim();
  const seedlingHouseNextStartKey = rawSeedlingHouseNextStartKey
    ? normalizeSeedlingHousePalletKeys([rawSeedlingHouseNextStartKey])[0]
    : "";
  if (rawSeedlingHouseNextStartKey && !seedlingHouseNextStartKey) {
    throw new Error("1号棟の次回開始場所が正しくありません");
  }
  const rawSourceAllocations = normalizePlantingSourceAllocations(event.sourceAllocations, {
    allowEmptyPalletKeys: actualSeedlingTrayCount === 0
  });
  const rawPlantingPalletKeys = normalizeDirectPalletKeys(
    event.plantingPalletKeys,
    "苗植えイベントのパレット"
  );
  const sourceAllocations = rawSourceAllocations;
  const plantingPalletKeys = rawPlantingPalletKeys;
  const noPlantingEvent = actualSeedlingTrayCount === 0 &&
    sourceAllocations.length === 1 &&
    sourceAllocations[0].palletKeys.length === 0 &&
    plantingPalletKeys.length === 0;
  if (sourceAllocations.some(allocation => allocation.palletKeys.length === 0) && !noPlantingEvent) {
    throw new Error("苗植え場所なしで記録できるのは実苗枚数が0枚のときだけです");
  }
  if (!plantingPalletKeys.length && !noPlantingEvent) {
    throw new Error("苗植えイベントのパレットがありません");
  }

  const allocatedKeys = [];
  sourceAllocations.forEach(allocation => {
    allocation.palletKeys.forEach(key => allocatedKeys.push(key));
  });
  const uniqueAllocatedKeys = new Set(allocatedKeys);
  if (uniqueAllocatedKeys.size !== allocatedKeys.length) {
    throw new Error("収穫元割当に同じパレットが重複しています");
  }
  const plantingKeySet = new Set(plantingPalletKeys);
  if (plantingKeySet.size !== uniqueAllocatedKeys.size ||
    plantingPalletKeys.some(key => !uniqueAllocatedKeys.has(key))) {
    throw new Error("収穫元割当と苗植えパレットが一致しません");
  }
  const plantingCountsByPallet = applyHistoricalPlantingCountBackfill(
    plantingDate,
    plantingPalletKeys,
    normalizePlantingCountsByPallet(event.plantingCountsByPallet, plantingKeySet)
  );

  const actualTakenSeedlingCount = normalizeOptionalInteger(
    event.actualTakenSeedlingCount,
    "実際に取った苗株数",
    0,
    PLANTING_EVENT_SEEDLING_COUNT_LIMIT,
    ""
  );
  const actualPlantedSeedlingCount = normalizeOptionalInteger(
    event.actualPlantedSeedlingCount,
    "実際に苗植えした株数",
    0,
    PLANTING_EVENT_SEEDLING_COUNT_LIMIT,
    ""
  );
  if (noPlantingEvent && (Number(actualTakenSeedlingCount || 0) !== 0 ||
    Number(actualPlantedSeedlingCount || 0) !== 0)) {
    throw new Error("苗植えなしの記録では苗株数を0にしてください");
  }

  return {
    palletNumberingVersion: CURRENT_PALLET_NUMBERING_VERSION,
    eventId,
    plantingDate,
    sourceAllocations,
    plantingPalletKeys,
    plantingCountsByPallet,
    actualSeedlingTrayCount,
    seedlingHousePalletKeys,
    seedlingHousePrimaryPlantingDate,
    seedlingHouseNextStartKey,
    actualTakenSeedlingCount,
    actualPlantedSeedlingCount,
    actualSeedlingCarryoverMode: normalizeOptionalCarryoverMode(event.actualSeedlingCarryoverMode),
    actualSeedlingLossRate: normalizeOptionalFiniteNumber(
      event.actualSeedlingLossRate,
      "実苗ロス率",
      0,
      100,
      ""
    ),
    qualityMemo: normalizePlantingQualityMemoInput(event.qualityMemo),
    detailsUnknown: normalizePlantingEventDetailsUnknown(event.detailsUnknown),
    createdAt: normalizeOptionalTimestamp(event.createdAt, "作成日時"),
    updatedAt: normalizeOptionalTimestamp(event.updatedAt, "更新日時")
  };
}

function normalizePlantingCountsByPallet(value, plantingKeySet) {
  if (value === null || typeof value === "undefined" || value === "") return {};
  if (!isPlainObject(value)) {
    throw new Error("パレット別植え付け株数はオブジェクトで指定してください");
  }
  const normalized = {};
  Object.keys(value).forEach(key => {
    if (!plantingKeySet.has(key)) {
      throw new Error("パレット別植え付け株数に苗植え場所ではないパレットがあります");
    }
    const count = normalizeRequiredInteger(value[key], "パレット別植え付け株数", 12, 20);
    if (![12, 16, 20].includes(count)) {
      throw new Error("パレット別植え付け株数は12・16・20のいずれかで指定してください");
    }
    normalized[key] = count;
  });
  return normalized;
}

function applyHistoricalPlantingCountBackfill(plantingDate, plantingPalletKeys, countsByPallet) {
  const normalized = { ...(countsByPallet || {}) };
  if (plantingDate < PLANTING_COUNT_BACKFILL_START_DATE ||
      plantingDate > PLANTING_COUNT_BACKFILL_END_DATE) {
    return normalized;
  }
  plantingPalletKeys.forEach(key => {
    if ([12, 16, 20].includes(Number(normalized[key]))) return;
    normalized[key] = PLANTING_COUNT_BACKFILL_VALUE;
  });
  return normalized;
}

function normalizePlantingSourceAllocations(value, options) {
  const allowEmptyPalletKeys = options && options.allowEmptyPalletKeys === true;
  if (!Array.isArray(value)) throw new Error("収穫元割当は配列で指定してください");
  if (!value.length) throw new Error("収穫元割当がありません");
  if (value.length > PLANTING_EVENT_ALLOCATION_LIMIT) {
    throw new Error("収穫元割当は" + PLANTING_EVENT_ALLOCATION_LIMIT + "件までです");
  }

  const seenHarvestRecordIds = new Set();
  return value.map((allocation, index) => {
    if (!isPlainObject(allocation)) {
      throw new Error("収穫元割当" + (index + 1) + "の形式が正しくありません");
    }
    const harvestRecordId = normalizeRequiredInteger(
      allocation.harvestRecordId,
      "収穫元割当" + (index + 1) + "の収穫記録ID",
      1,
      Number.MAX_SAFE_INTEGER
    );
    if (seenHarvestRecordIds.has(harvestRecordId)) {
      throw new Error("同じ収穫記録IDの割当が重複しています");
    }
    seenHarvestRecordIds.add(harvestRecordId);

    const palletKeys = normalizeDirectPalletKeys(
      allocation.palletKeys,
      "収穫元割当" + (index + 1) + "のパレット"
    );
    if (!palletKeys.length && !allowEmptyPalletKeys) {
      throw new Error("収穫元割当" + (index + 1) + "のパレットがありません");
    }
    return { harvestRecordId, palletKeys };
  });
}

function normalizeOptionalTimestamp(value, label) {
  if (value === null || typeof value === "undefined" || value === "") return "";
  if (Object.prototype.toString.call(value) === "[object Date]") {
    if (!Number.isFinite(value.getTime())) throw new Error(label + "の形式が正しくありません");
    return value.toISOString();
  }
  if (typeof value !== "string" || value.length > 64) {
    throw new Error(label + "の形式が正しくありません");
  }
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+\-]\d{2}:\d{2})$/.test(text)) {
    throw new Error(label + "はISO 8601形式で指定してください");
  }
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) throw new Error(label + "の形式が正しくありません");
  return date.toISOString();
}

function normalizeRecordTargets(value) {
  if (value === null || typeof value === "undefined") return [];
  if (!Array.isArray(value)) throw new Error("先取り対象は配列で指定してください");
  if (value.length > RECORD_TARGET_LIMIT) {
    throw new Error("先取り対象は" + RECORD_TARGET_LIMIT + "件までです");
  }

  return value.map((target, index) => {
    if (!isPlainObject(target)) throw new Error("先取り対象" + (index + 1) + "の形式が正しくありません");
    const building = normalizeRequiredInteger(target.building, "先取り対象の号棟", 2, 9);
    if (!HARVEST_BUILDINGS.includes(building)) throw new Error("先取り対象の号棟が範囲外です");
    const bed = normalizeRequiredEnum(target.bed, "先取り対象のベッド", HARVEST_BEDS);
    const start = normalizeRequiredInteger(target.start, "先取り対象の開始番号", 1, PALLETS_PER_BED);
    const end = normalizeRequiredInteger(target.end, "先取り対象の終了番号", 1, PALLETS_PER_BED);
    if (start > end) throw new Error("先取り対象の開始番号と終了番号が逆です");
    const plantsPerPallet = normalizeRequiredFiniteNumber(
      target.plantsPerPallet,
      "パレット当たりの株数",
      0.000001,
      999
    );
    return { building, bed, start, end, plantsPerPallet };
  });
}

function normalizeDirectPalletKeys(value, label) {
  if (value === null || typeof value === "undefined") return [];
  if (!Array.isArray(value)) throw new Error(label + "は配列で指定してください");
  if (value.length > RECORD_PALLET_KEY_LIMIT) {
    throw new Error(label + "は" + RECORD_PALLET_KEY_LIMIT + "件までです");
  }

  const keys = value.map((item, index) => {
    if (typeof item !== "string" || item.length > 16) {
      throw new Error(label + (index + 1) + "の形式が正しくありません");
    }
    const match = item.trim().match(/^(\d+)-([A-F])-(\d+)$/);
    if (!match) throw new Error(label + (index + 1) + "の形式が正しくありません");
    const building = Number(match[1]);
    const bed = match[2];
    const number = Number(match[3]);
    if (!HARVEST_BUILDINGS.includes(building) || !HARVEST_BEDS.includes(bed) ||
      !Number.isInteger(number) || number < 1 || number > PALLETS_PER_BED) {
      throw new Error(label + (index + 1) + "が範囲外です");
    }
    return building + "-" + bed + "-" + number;
  });
  return Array.from(new Set(keys));
}

function normalizeMonitorPalletKeys(value, label) {
  if (value === null || typeof value === "undefined") return [];
  if (!Array.isArray(value)) throw new Error(label + "は配列で指定してください");
  if (value.length > RECORD_PALLET_KEY_LIMIT) {
    throw new Error(label + "は" + RECORD_PALLET_KEY_LIMIT + "件までです");
  }

  const keys = value.map((item, index) => {
    if (typeof item !== "string" || item.length > 24) {
      throw new Error(label + (index + 1) + "の形式が正しくありません");
    }
    const match = item.trim().match(/^(\d+)-([A-F])-(\d+)(?:-(\d+))?$/);
    if (!match) throw new Error(label + (index + 1) + "の形式が正しくありません");
    const building = Number(match[1]);
    const bed = match[2];
    const start = Number(match[3]);
    const end = typeof match[4] === "undefined" ? start : Number(match[4]);
    if (!HARVEST_BUILDINGS.includes(building) || !HARVEST_BEDS.includes(bed) ||
      !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > PALLETS_PER_BED || start > end) {
      throw new Error(label + (index + 1) + "が範囲外です");
    }
    return building + "-" + bed + "-" + start + (end === start ? "" : "-" + end);
  });
  return Array.from(new Set(keys));
}

function normalizeQualityMemoInput(value) {
  if (value === null || typeof value === "undefined" || value === "") return null;
  if (typeof value === "string") {
    return { tags: [], other: normalizeOptionalText(value, "品質メモ", RECORD_QUALITY_LENGTH_LIMIT, false) };
  }
  if (!isPlainObject(value)) throw new Error("品質メモの形式が正しくありません");

  const rawTags = typeof value.tags === "undefined" ? [] : value.tags;
  if (!Array.isArray(rawTags) || rawTags.length > QUALITY_TAGS.length) {
    throw new Error("品質タグの形式が正しくありません");
  }
  const tags = rawTags.map(tag => normalizeQualityTagInput(tag));
  const other = normalizeOptionalText(
    value.other,
    "品質メモ",
    RECORD_QUALITY_LENGTH_LIMIT,
    false
  );
  return { tags: Array.from(new Set(tags)), other };
}

function normalizePlantingQualityMemoInput(value) {
  if (value === null || typeof value === "undefined" || String(value).trim() === "") return null;
  if (typeof value === "string") {
    const aliases = { "大きい": "large", "小さい": "small", "徒長": "elongated", "チップ": "chip" };
    const tags = [];
    const otherParts = [];
    value.split(/[,、|\n]+/).map(item => item.trim()).filter(Boolean).forEach(item => {
      const tag = aliases[item] || (QUALITY_TAGS.includes(item) ? item : "");
      if (tag) tags.push(tag);
      else if (item !== "-" && item !== "不明") otherParts.push(item);
    });
    if (!tags.length && !otherParts.length) return null;
    return normalizeQualityMemoInput({ tags, other: otherParts.join("、") });
  }
  const qualityMemo = normalizeQualityMemoInput(value);
  return qualityMemo && (qualityMemo.tags.length || qualityMemo.other) ? qualityMemo : null;
}

function normalizeQualityTagInput(value) {
  if (typeof value !== "string") throw new Error("品質タグの形式が正しくありません");
  const aliases = { "大きい": "large", "小さい": "small", "徒長": "elongated", "チップ": "chip" };
  const tag = aliases[value.trim()] || value.trim();
  if (!QUALITY_TAGS.includes(tag)) throw new Error("許可されていない品質タグです");
  return tag;
}

function normalizePlantingAgeInput(value) {
  if (value === null || typeof value === "undefined" || value === "") return null;
  if (typeof value === "string") {
    return normalizeRequiredText(value, "定植日数", PLANTING_AGE_DETAIL_LENGTH_LIMIT, false);
  }
  if (!isPlainObject(value)) throw new Error("定植日数の形式が正しくありません");

  let building = "";
  if (value.building !== null && typeof value.building !== "undefined" && String(value.building).trim() !== "") {
    building = normalizeRequiredInteger(value.building, "定植日数の号棟", 2, 9);
    if (!HARVEST_BUILDINGS.includes(building)) throw new Error("定植日数の号棟が範囲外です");
  }
  const summary = normalizeOptionalText(
    value.summary,
    "定植日数の概要",
    PLANTING_AGE_SUMMARY_LENGTH_LIMIT,
    false
  );
  const detail = normalizeOptionalText(
    value.detail,
    "定植日数の詳細",
    PLANTING_AGE_DETAIL_LENGTH_LIMIT,
    false
  );
  if (!summary.trim() && !detail.trim()) return null;
  return { building, summary, detail };
}

function normalizeOptionalSizeRating(value) {
  if (value === null || typeof value === "undefined" || value === "") return "unknown";
  return normalizeRequiredEnum(
    value,
    "大きさ",
    ["unknown", "normal", "large", "small", "不明", "並", "大きい", "小さい"]
  );
}

function normalizeOptionalCarryoverMode(value) {
  if (value === null || typeof value === "undefined" || value === "") return "loss";
  return normalizeRequiredEnum(value, "苗の繰越状態", ["loss", "carryover"]);
}

function normalizePlantingEventDetailsUnknown(value) {
  if (value === null || typeof value === "undefined" || value === "") return false;
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const text = String(value).trim().toLowerCase();
  if (["true", "1", "不明"].includes(text)) return true;
  if (["false", "0", "既知"].includes(text)) return false;
  throw new Error("苗数量情報の形式が正しくありません");
}

function formatValidatedPartialHarvestSummary(targets) {
  return targets.map(target => (
    target.building + "号棟 " + target.bed + "ベッド " + target.start + "〜" + target.end +
    ": 各" + target.plantsPerPallet + "株"
  )).join("\n");
}

function normalizeRequiredEnum(value, label, allowedValues) {
  if (typeof value !== "string") throw new Error(label + "の形式が正しくありません");
  const normalized = value.trim();
  if (!allowedValues.includes(normalized)) throw new Error(label + "が許可された値ではありません");
  return normalized;
}

function normalizeRequiredInteger(value, label, min, max) {
  const number = parseStrictNumber(value, label, true);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new Error(label + "が範囲外です");
  }
  return number;
}

function normalizeOptionalInteger(value, label, min, max, fallback) {
  if (value === null || typeof value === "undefined" || value === "") return fallback;
  return normalizeRequiredInteger(value, label, min, max);
}

function normalizeRequiredFiniteNumber(value, label, min, max) {
  const number = parseStrictNumber(value, label, false);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(label + "が範囲外です");
  }
  return number;
}

function normalizeOptionalFiniteNumber(value, label, min, max, fallback) {
  if (value === null || typeof value === "undefined" || value === "") return fallback;
  return normalizeRequiredFiniteNumber(value, label, min, max);
}

function parseStrictNumber(value, label, integerOnly) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(label + "の形式が正しくありません");
    return value;
  }
  if (typeof value !== "string") throw new Error(label + "の形式が正しくありません");
  const text = value.trim();
  const pattern = integerOnly ? /^\d+$/ : /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;
  if (!pattern.test(text)) throw new Error(label + "の形式が正しくありません");
  const number = Number(text);
  if (!Number.isFinite(number)) throw new Error(label + "の形式が正しくありません");
  return number;
}

function normalizeRequiredDate(value, label) {
  if (typeof value !== "string") throw new Error(label + "の形式が正しくありません");
  const text = value.trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(label + "はYYYY-MM-DD形式で指定してください");

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(label + "に実在しない日付が指定されています");
  }
  return text;
}

function normalizeOptionalDate(value, label) {
  if (value === null || typeof value === "undefined" || value === "") return "";
  return normalizeRequiredDate(value, label);
}

function normalizeRequiredText(value, label, maxLength, trim) {
  const text = normalizeOptionalText(value, label, maxLength, trim);
  if (!text) throw new Error(label + "がありません");
  return text;
}

function normalizeOptionalText(value, label, maxLength, trim) {
  if (value === null || typeof value === "undefined") return "";
  if (typeof value !== "string") throw new Error(label + "の形式が正しくありません");
  const text = trim ? value.trim() : value;
  if (text.length > maxLength) throw new Error(label + "が長すぎます");
  if (text.includes("\u0000")) throw new Error(label + "に使用できない文字が含まれています");
  return text;
}

function normalizeRecordListOptions(options) {
  if (!isPlainObject(options)) throw new Error("記録一覧の条件が正しくありません");
  if (typeof options.syncMode !== "undefined" && typeof options.syncMode !== "boolean") {
    throw new Error("同期モードの形式が正しくありません");
  }
  const cursor = normalizeHarvestRecordSyncCursor(options.cursor);
  return {
    recentDays: normalizeOptionalInteger(
      options.recentDays,
      "参照日数",
      0,
      RECORD_LIST_RECENT_DAYS_LIMIT,
      0
    ),
    limit: normalizeOptionalInteger(options.limit, "取得件数", 1, RECORD_LIST_LIMIT, 0),
    syncMode: options.syncMode === true || cursor !== null,
    cursor
  };
}

function normalizeHarvestRecordSyncCursor(value) {
  if (value === null || typeof value === "undefined" || value === "") return null;
  if (!isPlainObject(value)) throw new Error("同期カーソルの形式が正しくありません");
  const updatedAt = normalizeOptionalTimestamp(value.updatedAt, "同期カーソルの更新日時");
  const recordUuid = normalizeOptionalRecordUuid(value.recordUuid);
  if (!updatedAt || !recordUuid) throw new Error("同期カーソルの識別情報がありません");
  return { updatedAt, recordUuid };
}

function normalizePlantingEventListOptions(options) {
  if (!isPlainObject(options)) throw new Error("苗植えイベント一覧の条件が正しくありません");
  if (typeof options.syncMode !== "undefined" && typeof options.syncMode !== "boolean") {
    throw new Error("苗植えイベント同期モードの形式が正しくありません");
  }
  const cursor = normalizePlantingEventSyncCursor(options.cursor);
  return {
    recentDays: normalizeOptionalInteger(
      options.recentDays,
      "苗植えイベントの参照日数",
      0,
      RECORD_LIST_RECENT_DAYS_LIMIT,
      0
    ),
    limit: normalizeOptionalInteger(
      options.limit,
      "苗植えイベントの取得件数",
      1,
      PLANTING_EVENT_LIST_LIMIT,
      0
    ),
    fallbackSeedlingLossRate: normalizeOptionalFiniteNumber(
      options.fallbackSeedlingLossRate,
      "苗ロス率の補完値",
      0,
      100,
      0
    ),
    fallbackSeedlingPattern: normalizePlantingEventFallbackSeedlingPattern(
      options.fallbackSeedlingPattern
    ),
    fallbackPlantingCountsByBed: normalizePlantingEventFallbackCountsByBed(
      options.fallbackPlantingCountsByBed
    ),
    syncMode: options.syncMode === true || cursor !== null,
    cursor
  };
}

function normalizePlantingEventSyncCursor(value) {
  if (value === null || typeof value === "undefined" || value === "") return null;
  if (!isPlainObject(value)) throw new Error("苗植えイベント同期カーソルの形式が正しくありません");
  const updatedAt = normalizeOptionalTimestamp(value.updatedAt, "苗植えイベント同期カーソルの更新日時");
  const eventId = normalizeOptionalInteger(
    value.eventId,
    "苗植えイベント同期カーソルのイベントID",
    1,
    Number.MAX_SAFE_INTEGER,
    null
  );
  if (!updatedAt || eventId === null) throw new Error("苗植えイベント同期カーソルの識別情報がありません");
  return { updatedAt, eventId };
}

function normalizePlantingEventFallbackSeedlingPattern(value) {
  if (value === null || typeof value === "undefined") return [120, 120, 120];
  if (!Array.isArray(value) || !value.length || value.length > 10) {
    throw new Error("苗枚数換算パターンが正しくありません");
  }
  return value.map((item, index) => normalizeRequiredInteger(
    item,
    "苗枚数換算パターン" + (index + 1),
    0,
    PLANTING_EVENT_SEEDLING_COUNT_LIMIT
  ));
}

function normalizePlantingEventFallbackCountsByBed(value) {
  const defaults = {};
  HARVEST_BEDS.forEach(bed => {
    defaults[bed] = Array(PALLETS_PER_BED).fill(20);
  });
  if (value === null || typeof value === "undefined") return defaults;
  if (!isPlainObject(value)) throw new Error("苗植え株数の補完設定が正しくありません");
  const normalized = {};
  HARVEST_BEDS.forEach(bed => {
    const counts = value[bed];
    if (!Array.isArray(counts) || counts.length !== PALLETS_PER_BED) {
      throw new Error(bed + "ベッドの苗植え株数の補完設定が正しくありません");
    }
    normalized[bed] = counts.map((item, index) => normalizeRequiredInteger(
      item,
      bed + "ベッド" + (index + 1) + "番の苗植え株数",
      0,
      PLANTING_EVENT_SEEDLING_COUNT_LIMIT
    ));
  });
  return normalized;
}

function normalizeMonitorHistoryOptions(options) {
  if (!isPlainObject(options)) throw new Error("履歴の条件が正しくありません");
  return {
    limit: normalizeOptionalInteger(options.limit, "履歴の取得件数", 1, MONITOR_HISTORY_LIMIT, 50)
  };
}

function normalizeMonitorContentInput(content) {
  if (!isPlainObject(content)) throw new Error("モニター内容の形式が正しくありません");
  if (Object.prototype.hasOwnProperty.call(content, "palletRanges")) {
    throw new Error("モニターの収穫場所はharvestFillKeysで指定してください");
  }
  const normalized = {};

  const hasVersion = content.version !== null && typeof content.version !== "undefined" && !(
    typeof content.version === "string" && content.version.trim() === ""
  );
  if (hasVersion) {
    normalizeRequiredInteger(content.version, "モニターの更新番号", 0, Number.MAX_SAFE_INTEGER);
  }
  if (typeof content.updatedAt !== "undefined" && content.updatedAt !== null) {
    normalizeOptionalText(content.updatedAt, "モニターの更新日時", 64, true);
  }

  if (Object.prototype.hasOwnProperty.call(content, "enabled")) {
    normalized.enabled = normalizeMonitorEnabledInput(content.enabled);
  }
  if (Object.prototype.hasOwnProperty.call(content, "instructionText")) {
    normalized.instructionText = normalizeOptionalText(
      content.instructionText,
      "モニターの指示内容",
      MONITOR_INSTRUCTION_LENGTH_LIMIT,
      false
    );
  }

  const hasMemoItems = Object.prototype.hasOwnProperty.call(content, "memoItems");
  const hasMemoText = Object.prototype.hasOwnProperty.call(content, "memoText");
  if (hasMemoItems || hasMemoText) {
    const memoItems = normalizeMonitorMemoItemsInput(content.memoItems);
    if (memoItems.join("\n\n").length > MONITOR_MEMO_LENGTH_LIMIT) {
      throw new Error("モニターのメモ項目全体が長すぎます");
    }
    normalized.memoText = normalizeOptionalText(
      !hasMemoText && memoItems.length ? memoItems.join("\n\n") : content.memoText,
      "モニターのメモ",
      MONITOR_MEMO_LENGTH_LIMIT,
      false
    );
    if (hasMemoItems) normalized.memoItems = memoItems;
  }

  if (Object.prototype.hasOwnProperty.call(content, "harvestFillKeys")) {
    normalized.harvestFillKeys = normalizeMonitorPalletKeys(
      content.harvestFillKeys,
      "モニターの収穫場所"
    );
    if (normalized.harvestFillKeys.length > RECORD_PALLET_KEY_LIMIT) {
      throw new Error("モニターの収穫場所は" + RECORD_PALLET_KEY_LIMIT + "件までです");
    }
  }
  return normalized;
}

function normalizeMonitorMemoItemsInput(value) {
  if (value === null || typeof value === "undefined") return [];
  if (!Array.isArray(value)) throw new Error("モニターのメモ項目は配列で指定してください");
  if (value.length > MONITOR_MEMO_ITEM_LIMIT) {
    throw new Error("モニターのメモ項目は" + MONITOR_MEMO_ITEM_LIMIT + "件までです");
  }
  return value.map((item, index) => {
    if (typeof item !== "string") {
      throw new Error("モニターのメモ項目" + (index + 1) + "の形式が正しくありません");
    }
    return normalizeOptionalText(
      item,
      "モニターのメモ項目" + (index + 1),
      MONITOR_MEMO_ITEM_LENGTH_LIMIT,
      false
    );
  });
}

function normalizeMonitorEnabledInput(value) {
  if (typeof value === "undefined" || value === null || value === "") return false;
  if (value === true || value === false) return value;
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error("モニターの有効状態が正しくありません");
  }
  const text = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on", "有効", "使う"].includes(text)) return true;
  if (["false", "0", "no", "off", "無効", "使わない"].includes(text)) return false;
  throw new Error("モニターの有効状態が正しくありません");
}
