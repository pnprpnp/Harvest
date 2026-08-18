function loadSettings(){
  try{
    const parsed = harvestnaviLocalStorage.readJson(SETTINGS_KEY, null);
    if(!parsed) return deepClone(defaultSettings);

    const merged = deepClone(defaultSettings);
    if(Number.isFinite(Number(parsed.defaultLossRate))) merged.defaultLossRate = Number(parsed.defaultLossRate);
    merged.defaultYieldPerPallet = normalizeYield(parsed.defaultYieldPerPallet, defaultSettings.defaultYieldPerPallet);
    merged.defaultPlantingCount = normalizeYield(parsed.defaultPlantingCount, defaultSettings.defaultPlantingCount);
    merged.useBedLossSettings = !!parsed.useBedLossSettings;
    merged.useBedYieldSettings = !!parsed.useBedYieldSettings;
    merged.useBedPlantSettings = !!parsed.useBedPlantSettings;
    merged.seedlingLossRate = clampNumber(parsed.seedlingLossRate, 0, 100, defaultSettings.seedlingLossRate);
    merged.specialPallet60CountPer3 = clampNumber(parsed.specialPallet60CountPer3, 0, 3, defaultSettings.specialPallet60CountPer3);
    merged.seedlingHouseInitialStartKey = isValidSeedlingHousePalletKey(parsed.seedlingHouseInitialStartKey)
      ? String(parsed.seedlingHouseInitialStartKey)
      : "";
    if(parsed.beds){
      ["A","B","C","D","E","F"].forEach(b => {
        if(parsed.beds[b]){
          merged.beds[b].yield = normalizeYield(parsed.beds[b].yield, merged.defaultYieldPerPallet);
          merged.beds[b].lossRate = normalizeLossInput(parsed.beds[b].lossRate);
          merged.beds[b].plant = normalizeYield(parsed.beds[b].plant, merged.defaultPlantingCount);
          merged.beds[b].yieldUseFrontBack = !!parsed.beds[b].yieldUseFrontBack;
          merged.beds[b].yieldFrontCount = clampNumber(parsed.beds[b].yieldFrontCount, 0, PALLETS_PER_BED, 39);
          merged.beds[b].yieldFront = normalizeYield(parsed.beds[b].yieldFront, merged.beds[b].yield);
          merged.beds[b].yieldBack = normalizeYield(parsed.beds[b].yieldBack, merged.beds[b].yield);
          merged.beds[b].plantUseFrontBack = !!parsed.beds[b].plantUseFrontBack;
          merged.beds[b].plantFrontCount = clampNumber(parsed.beds[b].plantFrontCount, 0, PALLETS_PER_BED, 39);
          merged.beds[b].plantFront = normalizeYield(parsed.beds[b].plantFront, merged.beds[b].plant);
          merged.beds[b].plantBack = normalizeYield(parsed.beds[b].plantBack, merged.beds[b].plant);
        }
      });
    }
    return merged;
  }catch(e){
    return deepClone(defaultSettings);
  }
}

function saveSettingsToStorage(){
  harvestnaviLocalStorage.writeJson(SETTINGS_KEY, settings);
  invalidatePlantingEventStateCache();
  invalidateDashboardDerivedData();
}

function compressPalletKeysToRanges(keys){
  if(!Array.isArray(keys) || !keys.length) return [];

  const groups = {};
  keys.forEach(key => {
    const p = parsePalletKey(String(key || ""));
    if(!BUILDINGS.includes(p.building) || !bedOrder.includes(p.bed) || !Number.isFinite(p.number)) return;
    const groupKey = `${p.building}-${p.bed}`;
    if(!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(p.number);
  });

  const ranges = [];
  BUILDINGS.forEach(building => {
    bedOrder.forEach(bed => {
      const groupKey = `${building}-${bed}`;
      const nums = [...new Set(groups[groupKey] || [])]
        .filter(number => number >= 1 && number <= PALLETS_PER_BED)
        .sort((a, b) => a - b);
      if(!nums.length) return;

      let start = nums[0];
      let prev = nums[0];
      for(let i = 1; i < nums.length; i++){
        const cur = nums[i];
        if(cur === prev + 1){
          prev = cur;
          continue;
        }
        ranges.push(`${building}-${bed}-${start}-${prev}`);
        start = cur;
        prev = cur;
      }
      ranges.push(`${building}-${bed}-${start}-${prev}`);
    });
  });

  return ranges;
}

function expandPalletRangesToKeys(ranges){
  if(!Array.isArray(ranges) || !ranges.length) return [];

  const keys = [];
  ranges.forEach(range => {
    if(typeof range === "string"){
      const parts = range.split("-");
      if(parts.length !== 4) return;
      const building = Number(parts[0]);
      const bed = parts[1];
      const start = Number(parts[2]);
      const end = Number(parts[3]);
      if(!BUILDINGS.includes(building) || !bedOrder.includes(bed)) return;
      if(!Number.isFinite(start) || !Number.isFinite(end)) return;
      const from = Math.max(1, Math.min(start, end));
      const to = Math.min(PALLETS_PER_BED, Math.max(start, end));
      for(let number = from; number <= to; number++){
        keys.push(getPalletKey(building, bed, number));
      }
      return;
    }

    if(range && typeof range === "object"){
      const building = Number(range.building);
      const bed = String(range.bed || "");
      const start = Number(range.start);
      const end = Number(range.end);
      if(!BUILDINGS.includes(building) || !bedOrder.includes(bed)) return;
      if(!Number.isFinite(start) || !Number.isFinite(end)) return;
      const from = Math.max(1, Math.min(start, end));
      const to = Math.min(PALLETS_PER_BED, Math.max(start, end));
      for(let number = from; number <= to; number++){
        keys.push(getPalletKey(building, bed, number));
      }
    }
  });

  return [...new Set(keys)].sort((a, b) => getOrderIndexFromKey(a) - getOrderIndexFromKey(b));
}

function expandPalletKeyItemsToKeys(items){
  if(!Array.isArray(items) || !items.length) return [];

  const keys = [];
  items.forEach(item => {
    if(typeof item === "string"){
      const text = item.trim();
      if(!text) return;

      const parts = text.split("-");
      if(parts.length === 3){
        const building = Number(parts[0]);
        const bed = parts[1];
        const number = Number(parts[2]);
        if(!BUILDINGS.includes(building) || !bedOrder.includes(bed)) return;
        if(!Number.isFinite(number) || number < 1 || number > PALLETS_PER_BED) return;
        keys.push(getPalletKey(building, bed, number));
        return;
      }

      if(parts.length === 4){
        keys.push(...expandPalletRangesToKeys([text]));
      }
      return;
    }

    if(item && typeof item === "object"){
      const building = Number(item.building);
      const bed = String(item.bed || "");
      const number = Number(item.number);
      if(BUILDINGS.includes(building) && bedOrder.includes(bed) && Number.isFinite(number)){
        if(number >= 1 && number <= PALLETS_PER_BED){
          keys.push(getPalletKey(building, bed, number));
        }
        return;
      }

      keys.push(...expandPalletRangesToKeys([item]));
    }
  });

  return [...new Set(keys)].sort((a, b) => getOrderIndexFromKey(a) - getOrderIndexFromKey(b));
}

function parsePalletSummaryToKeys(summary){
  const text = String(summary || "").trim();
  if(!text) return [];

  const keys = [];
  text.split(/\n+/).forEach(line => {
    const match = line.trim().match(/^(\d+)号棟\s*([A-Z])\s*[:：]\s*(.+)$/);
    if(!match) return;

    const building = Number(match[1]);
    const bed = match[2];
    if(!BUILDINGS.includes(building) || !bedOrder.includes(bed)) return;

    match[3].split(/[,\s、]+/).forEach(part => {
      const rangeText = part.trim();
      if(!rangeText) return;

      const sideRangeMatch = rangeText.match(/^(右|左)\s*[（(]\s*(\d+)(?:\s*[-〜~]\s*(\d+))?\s*[）)]$/);
      if(sideRangeMatch){
        const expectedParity = sideRangeMatch[1] === "右" ? 0 : 1;
        const first = Number(sideRangeMatch[2]);
        const last = Number(sideRangeMatch[3] || sideRangeMatch[2]);
        const start = Math.min(first, last);
        const end = Math.max(first, last);
        if(!Number.isFinite(start) || !Number.isFinite(end)) return;
        if(start % 2 !== expectedParity || end % 2 !== expectedParity) return;
        for(let number = start; number <= end; number += 2){
          if(number < 1 || number > PALLETS_PER_BED) continue;
          keys.push(getPalletKey(building, bed, number));
        }
        return;
      }

      const rangeMatch = rangeText.match(/^(\d+)(?:[-〜~](\d+))?$/);
      if(!rangeMatch) return;

      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2] || rangeMatch[1]);
      if(!Number.isFinite(start) || !Number.isFinite(end)) return;

      keys.push(...expandPalletRangesToKeys([`${building}-${bed}-${start}-${end}`]));
    });
  });

  return [...new Set(keys)].sort((a, b) => getOrderIndexFromKey(a) - getOrderIndexFromKey(b));
}

function formatStoredPalletSummaryForDisplay(summary, fallbackKeys = []){
  const text = String(summary || "").trim();
  const parsedKeys = parsePalletSummaryToKeys(text);
  if(parsedKeys.length) return formatPalletSummary(parsedKeys);

  const directKeys = getDirectPalletKeys(fallbackKeys);
  if(directKeys?.length) return formatPalletSummary(directKeys);
  return text;
}

function isValidPalletKeyString(key){
  const text = String(key || "").trim();
  if(!/^\d+-[A-Z]-\d+$/.test(text)) return false;
  const p = parsePalletKey(text);
  return BUILDINGS.includes(p.building) && bedOrder.includes(p.bed) && Number.isFinite(p.number) && p.number >= 1 && p.number <= PALLETS_PER_BED;
}

function getDirectPalletKeys(items){
  if(!Array.isArray(items)) return null;
  const keys = [];
  for(const item of items){
    if(typeof item !== "string") return null;
    const key = item.trim();
    if(!isValidPalletKeyString(key)) return null;
    keys.push(key);
  }
  return [...new Set(keys)].sort((a, b) => getOrderIndexFromKey(a) - getOrderIndexFromKey(b));
}

function getPalletKeysFromRecord(record){
  if(!record || typeof record !== "object") return [];
  if(record.type === "partialHarvest") return [];
  const directKeys = getDirectPalletKeys(record.palletKeys);
  if(directKeys && directKeys.length && !record.palletRanges?.length){
    return directKeys;
  }
  return [...new Set([
    ...(directKeys || expandPalletKeyItemsToKeys(record.palletKeys)),
    ...expandPalletRangesToKeys(record.palletRanges)
  ])].sort((a, b) => getOrderIndexFromKey(a) - getOrderIndexFromKey(b));
}

function getPlantingPalletKeysFromRecord(record, harvestKeys = null){
  if(!record || typeof record !== "object" || record.type === "partialHarvest") return [];
  const directKeys = getDirectPalletKeys(record.plantingPalletKeys);
  if(directKeys && directKeys.length && !record.plantingRanges?.length){
    return directKeys;
  }
  const keys = [...new Set([
    ...(directKeys || expandPalletKeyItemsToKeys(record.plantingPalletKeys)),
    ...expandPalletRangesToKeys(record.plantingRanges)
  ])].sort((a, b) => getOrderIndexFromKey(a) - getOrderIndexFromKey(b));
  return keys;
}

function normalizePartialHarvestTargets(targets){
  if(!Array.isArray(targets)) return [];

  return targets.map(target => {
    if(!target || typeof target !== "object") return null;
    const building = Number(target.building);
    const bed = String(target.bed || "");
    const start = clampNumber(target.start, 1, PALLETS_PER_BED, NaN);
    const end = clampNumber(target.end, 1, PALLETS_PER_BED, NaN);
    const plantsPerPallet = clampNumber(target.plantsPerPallet, 0, 999, NaN);
    if(!BUILDINGS.includes(building) || !bedOrder.includes(bed)) return null;
    if(!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(plantsPerPallet) || plantsPerPallet <= 0) return null;

    return {
      building,
      bed,
      start: Math.min(start, end),
      end: Math.max(start, end),
      plantsPerPallet
    };
  }).filter(Boolean);
}

function normalizeQualityTag(value){
  const text = String(value || "").trim();
  if(text === "大きい") return "large";
  if(text === "中") return "medium";
  if(text === "小さい") return "small";
  if(text === "徒長") return "elongated";
  if(text === "チップ") return "chip";
  return ["large", "medium", "small", "elongated", "chip"].includes(text) ? text : "";
}

function normalizeQualityMemo(value){
  if(typeof value === "string"){
    const parts = value
      .split(/[,\n、|]+/)
      .map(item => item.trim())
      .filter(Boolean);
    const tags = [];
    const otherParts = [];
    parts.forEach(part => {
      const tag = normalizeQualityTag(part);
      if(tag){
        tags.push(tag);
      }else if(part !== "-"){
        otherParts.push(part);
      }
    });
    return normalizeQualityMemo({ tags, other: otherParts.join("、") });
  }

  const source = value && typeof value === "object" ? value : {};
  const rawTags = Array.isArray(source.tags) ? source.tags : [];
  const tags = [...new Set(rawTags.map(normalizeQualityTag).filter(Boolean))];
  const other = String(source.other || "").trim();
  const otherParts = other
    .split(/[,\n、|]+/)
    .map(item => item.trim())
    .filter(Boolean);
  const includesMedium = otherParts.some(part => normalizeQualityTag(part) === "medium");
  if(!includesMedium) return { tags, other };
  const retainedOtherParts = [];
  otherParts.forEach(part => {
    if(normalizeQualityTag(part) === "medium"){
      tags.push("medium");
    }else{
      retainedOtherParts.push(part);
    }
  });
  return {
    tags: [...new Set(tags)],
    other: retainedOtherParts.join("、")
  };
}

function normalizeOptionalQualityMemo(value){
  if(value === null || value === undefined || String(value).trim() === "") return null;
  const qualityMemo = normalizeQualityMemo(value);
  return qualityMemo.tags.length || qualityMemo.other ? qualityMemo : null;
}

function formatPlantingQualityMemo(value){
  return formatQualityMemo(normalizeOptionalQualityMemo(value)) || "不明";
}

function getQualityTagLabel(value){
  const labels = {
    large: "大きい",
    medium: "中",
    small: "小さい",
    elongated: "徒長",
    chip: "チップ"
  };
  return labels[normalizeQualityTag(value)] || "";
}

function formatQualityMemo(value){
  const qualityMemo = normalizeQualityMemo(value);
  return [
    ...qualityMemo.tags.map(getQualityTagLabel).filter(Boolean),
    qualityMemo.other
  ].filter(Boolean).join("、");
}

function getSelectedQualityMemo(){
  const tags = Array.from(document.querySelectorAll('input[name="qualityMemoTag"]:checked'))
    .map(input => normalizeQualityTag(input.value))
    .filter(Boolean);
  const otherEnabled = !!document.getElementById("qualityMemoOtherToggle")?.checked;
  const other = otherEnabled ? String(document.getElementById("qualityMemoOtherInput")?.value || "").trim() : "";
  return normalizeQualityMemo({ tags, other });
}

function getPlantingQualityMemoForGoogleTransfer(value){
  const qualityMemo = normalizeOptionalQualityMemo(value);
  if(!qualityMemo) return null;
  const hasMedium = qualityMemo.tags.includes("medium");
  return {
    tags: qualityMemo.tags.filter(tag => tag !== "medium"),
    other: [
      hasMedium ? "中" : "",
      qualityMemo.other
    ].filter(Boolean).join("、")
  };
}

function updateQualityMemoOtherVisibility(){
  const toggle = document.getElementById("qualityMemoOtherToggle");
  const input = document.getElementById("qualityMemoOtherInput");
  if(!input) return;
  const showOther = !!toggle?.checked;
  input.hidden = !showOther;
  if(!showOther) input.value = "";
}

function setSelectedQualityMemo(value){
  const qualityMemo = normalizeQualityMemo(value);
  document.querySelectorAll('input[name="qualityMemoTag"]').forEach(input => {
    input.checked = qualityMemo.tags.includes(normalizeQualityTag(input.value));
  });
  const otherToggle = document.getElementById("qualityMemoOtherToggle");
  if(otherToggle) otherToggle.checked = !!qualityMemo.other;
  const otherInput = document.getElementById("qualityMemoOtherInput");
  if(otherInput) otherInput.value = qualityMemo.other;
  updateQualityMemoOtherVisibility();
  updateRecordInputGuides();
}

function updateRecordAutoValueNotes(){
  const casesInput = document.getElementById("recordCasesInput");
  const casesNote = document.getElementById("recordCasesAutoValueNote");
  if(casesNote){
    const showCasesNote = recordSelectionMode !== "planting"
      && !recordCasesEdited
      && String(casesInput?.value || "").trim() !== "";
    casesNote.hidden = !showCasesNote;
  }

  const seedlingInput = document.getElementById("recordActualSeedlingTrayCountInput");
  const seedlingNote = document.getElementById("recordSeedlingAutoValueNote");
  if(seedlingNote){
    const showSeedlingNote = recordSelectionMode === "planting"
      && seedlingInput?.dataset.userEdited !== "1"
      && String(seedlingInput?.value || "").trim() !== "";
    seedlingNote.hidden = !showSeedlingNote;
  }
}

function updateRecordInputGuides(){
  const dateInput = document.getElementById("recordDateInput");
  if(dateInput){
    dateInput.classList.toggle("recordInputNeedsAttention", !dateInput.value);
  }

  const casesInput = document.getElementById("recordCasesInput");
  if(casesInput){
    const cases = Number(casesInput.value);
    const needsInput = casesInput.value === "" || !Number.isFinite(cases) || cases <= 0;
    casesInput.classList.toggle("recordInputNeedsAttention", needsInput);
  }

  const qualityRow = document.querySelector(".qualityChoiceRow");
  if(qualityRow){
    const qualityMemo = getSelectedQualityMemo();
    const hasQualityMemo = qualityMemo.tags.length > 0 || !!qualityMemo.other;
    qualityRow.classList.toggle("needsAttention", recordSelectionMode !== "planting" && !hasQualityMemo);
  }
  updateRecordAutoValueNotes();
}

function getRecordStorageCommonFields(record, type){
  return {
    ...getRecordSyncMetadata(record),
    palletNumberingVersion: CURRENT_PALLET_NUMBERING_VERSION,
    id: record.id,
    duplicateKey: getRecordDuplicateKey(record),
    type,
    date: record.date,
    cases: record.cases,
    memo: record.memo || ""
  };
}

function getNormalizedRecordCommonFields(record, type){
  return {
    ...getRecordSyncMetadata(record),
    palletNumberingVersion: CURRENT_PALLET_NUMBERING_VERSION,
    duplicateKey: String(record.duplicateKey || "").trim(),
    type,
    memo: record.memo || ""
  };
}

function serializeRecordForStorage(record){
  const type = record?.type === "partialHarvest" ? "partialHarvest" : "fullHarvest";
  const commonFields = getRecordStorageCommonFields(record, type);
  if(type === "partialHarvest"){
    return {
      ...commonFields,
      targets: normalizePartialHarvestTargets(record.targets)
    };
  }

  const payload = {
    ...commonFields,
    palletSummary: record.palletSummary,
    plannedSeedlingTrayCount: clampNumber(record.plannedSeedlingTrayCount, 0, 999999, 0),
    plantingCaseInstruction: String(record.plantingCaseInstruction || "").trim(),
    plantingSummary: record.plantingSummary || "",
    plantingDate: record.plantingDate || "",
    actualSeedlingTrayCount: clampNumber(record.actualSeedlingTrayCount, 0, 999999, 0),
    actualSeedlingCarryoverMode: normalizeSeedlingCarryoverMode(record.actualSeedlingCarryoverMode),
    actualSeedlingLossRate: String(record.actualSeedlingLossRate ?? "").trim(),
    actualLoss: record.actualLoss,
    qualityMemo: normalizeQualityMemo(record.qualityMemo),
    plantingAge: record.plantingAge || null,
    // 読み込み元の古い範囲ではなく、画面上の現在選択を保存する。
    palletRanges: compressPalletKeysToRanges(record.palletKeys),
    plantingRanges: compressPalletKeysToRanges(record.plantingPalletKeys),
    plantingPending: !!record.plantingPending
  };

  return payload;
}

function normalizeStoredRecord(record){
  if(!record || typeof record !== "object") return null;
  if(Number(record.palletNumberingVersion) !== CURRENT_PALLET_NUMBERING_VERSION) return null;
  if(!normalizeRecordUuid(record.recordUuid)) return null;
  if(record.type === "partialHarvest"){
    const targets = normalizePartialHarvestTargets(record.targets);
    if(!targets.length) return null;
    return {
      ...getNormalizedRecordCommonFields(record, "partialHarvest"),
      id: record.id,
      date: String(record.date || "").trim(),
      cases: clampNumber(record.cases, 0, 999999, 0),
      targets,
      palletKeys: []
    };
  }

  const palletKeys = getPalletKeysFromRecord(record);
  if(!palletKeys.length) return null;
  const plantingPalletKeys = getPlantingPalletKeysFromRecord(record, palletKeys);
  return {
    ...record,
    ...getNormalizedRecordCommonFields(record, "fullHarvest"),
    plannedSeedlingTrayCount: clampNumber(record.plannedSeedlingTrayCount, 0, 999999, 0),
    plantingCaseInstruction: String(record.plantingCaseInstruction || "").trim(),
    plantingSummary: String(record.plantingSummary || "").trim(),
    plantingDate: String(record.plantingDate || "").trim(),
    actualSeedlingTrayCount: clampNumber(record.actualSeedlingTrayCount, 0, 999999, 0),
    actualSeedlingCarryoverMode: normalizeSeedlingCarryoverMode(record.actualSeedlingCarryoverMode),
    actualSeedlingLossRate: String(record.actualSeedlingLossRate ?? "").trim(),
    plantingPending: !!record.plantingPending,
    plantingPalletKeys,
    qualityMemo: normalizeQualityMemo(record.qualityMemo),
    plantingAge: normalizePlantingAgeSnapshot(record.plantingAge),
    palletKeys
  };
}

function normalizeRecordSnapshot(record, overrides = null){
  if(!record || typeof record !== "object") return null;
  const source = overrides && typeof overrides === "object"
    ? { ...record, ...overrides }
    : record;
  const normalized = normalizeStoredRecord(source);
  if(normalized?.type === "fullHarvest"){
    const currentPalletKeys = getDirectPalletKeys(source.palletKeys);
    const currentPlantingPalletKeys = getDirectPalletKeys(source.plantingPalletKeys);
    if(currentPalletKeys !== null){
      normalized.palletKeys = currentPalletKeys;
      normalized.palletSummary = formatPalletSummary(currentPalletKeys);
    }
    if(currentPlantingPalletKeys !== null) normalized.plantingPalletKeys = currentPlantingPalletKeys;
  }
  return normalized
    ? normalizeStoredRecord(serializeRecordForStorage(normalized))
    : null;
}

function normalizePlantingEventSourceAllocations(value, options = {}){
  if(!Array.isArray(value) || value.length > GOOGLE_SHEET_MAX_LIST_RECORDS) return [];
  const allowEmptyPalletKeys = options.allowEmptyPalletKeys === true;
  const allocations = [];
  const seenLots = new Set();
  const seenPalletKeys = new Set();
  const seenHarvestRecordIds = new Set();
  let hasDuplicatePalletKey = false;

  value.forEach(allocation => {
    if(!allocation || typeof allocation !== "object" || Array.isArray(allocation)){
      hasDuplicatePalletKey = true;
      return;
    }
    const harvestRecordId = getSafePositiveRecordId(allocation.harvestRecordId);
    let palletKeys = null;
    if(Object.prototype.hasOwnProperty.call(allocation, "palletKeys")){
      palletKeys = Array.isArray(allocation.palletKeys)
        && allocation.palletKeys.length <= RECORD_MAX_PALLET_KEYS
        ? getDirectPalletKeys(allocation.palletKeys)
        : null;
    }else if(Array.isArray(allocation.palletRanges)
      && allocation.palletRanges.length <= RECORD_MAX_PALLET_KEYS){
      const expandedKeys = [];
      const expandedKeySet = new Set();
      let rangesAreValid = true;
      allocation.palletRanges.forEach(range => {
        const match = typeof range === "string"
          ? range.trim().match(/^(\d+)-([A-Z])-(\d+)-(\d+)$/)
          : null;
        if(!match){
          rangesAreValid = false;
          return;
        }
        const building = Number(match[1]);
        const bed = match[2];
        const start = Number(match[3]);
        const end = Number(match[4]);
        if(!BUILDINGS.includes(building) || !bedOrder.includes(bed)
          || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)
          || start < 1 || end > PALLETS_PER_BED || start > end){
          rangesAreValid = false;
          return;
        }
        for(let number = start; number <= end; number++){
          if(expandedKeys.length >= RECORD_MAX_PALLET_KEYS - seenPalletKeys.size){
            rangesAreValid = false;
            return;
          }
          const key = getPalletKey(building, bed, number);
          if(expandedKeySet.has(key)){
            rangesAreValid = false;
            return;
          }
          expandedKeySet.add(key);
          expandedKeys.push(key);
        }
      });
      if(rangesAreValid && expandedKeys.length <= RECORD_MAX_PALLET_KEYS){
        palletKeys = expandedKeys.sort((a, b) => getOrderIndexFromKey(a) - getOrderIndexFromKey(b));
      }
    }
    if(harvestRecordId === null
      || !Array.isArray(palletKeys)
      || (!palletKeys.length && !allowEmptyPalletKeys)){
      hasDuplicatePalletKey = true;
      return;
    }
    if(seenHarvestRecordIds.has(harvestRecordId)){
      hasDuplicatePalletKey = true;
      return;
    }
    seenHarvestRecordIds.add(harvestRecordId);
    const uniqueKeys = palletKeys.filter(key => {
      const lotKey = harvestRecordId + "::" + key;
      if(seenLots.has(lotKey) || seenPalletKeys.has(key)){
        hasDuplicatePalletKey = true;
        return false;
      }
      seenLots.add(lotKey);
      seenPalletKeys.add(key);
      return true;
    });
    if(uniqueKeys.length || allowEmptyPalletKeys){
      allocations.push({ harvestRecordId, palletKeys: uniqueKeys });
    }
  });

  return hasDuplicatePalletKey ? [] : allocations;
}

function normalizePlantingEvent(value){
  if(!value || typeof value !== "object" || Array.isArray(value)) return null;
  if(Number(value.palletNumberingVersion) !== CURRENT_PALLET_NUMBERING_VERSION) return null;
  const eventId = getSafePositiveRecordId(value.eventId ?? value.id);
  const plantingDate = String(value.plantingDate || "").trim();
  if(eventId === null || !isStrictDateOnlyString(plantingDate)) return null;

  const actualSeedlingTrayCount = getStrictIntegerInRange(
    value.actualSeedlingTrayCount ?? 0,
    0,
    RECORD_MAX_SEEDLING_TRAYS
  );
  if(actualSeedlingTrayCount === null) return null;
  if(value.seedlingHousePalletKeys !== undefined && !Array.isArray(value.seedlingHousePalletKeys)) return null;
  const seedlingHousePalletKeys = normalizeSeedlingHousePalletKeys(value.seedlingHousePalletKeys || []);
  if(Array.isArray(value.seedlingHousePalletKeys)
    && seedlingHousePalletKeys.length !== value.seedlingHousePalletKeys.length) return null;
  if(seedlingHousePalletKeys.length > actualSeedlingTrayCount) return null;
  const rawPrimaryPlantingDate = String(value.seedlingHousePrimaryPlantingDate || "").trim();
  if(rawPrimaryPlantingDate && !isStrictDateOnlyString(rawPrimaryPlantingDate)) return null;
  const seedlingHousePrimaryPlantingDate = rawPrimaryPlantingDate
    || (seedlingHousePalletKeys.length ? plantingDate : "");
  const seedlingHouseNextStartKey = String(value.seedlingHouseNextStartKey || "").trim();
  if(seedlingHouseNextStartKey && !isValidSeedlingHousePalletKey(seedlingHouseNextStartKey)) return null;
  const sourceAllocations = normalizePlantingEventSourceAllocations(value.sourceAllocations, {
    allowEmptyPalletKeys: actualSeedlingTrayCount === 0
  });
  if(!sourceAllocations.length) return null;
  const allocatedPalletKeys = [...new Set(sourceAllocations.flatMap(allocation => allocation.palletKeys))]
    .sort((a, b) => getOrderIndexFromKey(a) - getOrderIndexFromKey(b));
  const directPlantingKeys = getDirectPalletKeys(value.plantingPalletKeys);
  const plantingPalletKeys = directPlantingKeys?.length ? directPlantingKeys : allocatedPalletKeys;
  const noPlantingEvent = actualSeedlingTrayCount === 0
    && sourceAllocations.length === 1
    && sourceAllocations[0].palletKeys.length === 0
    && plantingPalletKeys.length === 0;
  if(sourceAllocations.some(allocation => allocation.palletKeys.length === 0) && !noPlantingEvent){
    return null;
  }
  if(plantingPalletKeys.length !== allocatedPalletKeys.length
    || plantingPalletKeys.some((key, index) => key !== allocatedPalletKeys[index])){
    return null;
  }
  const plantingCountsByPallet = applyHistoricalPlantingCountBackfill(
    plantingDate,
    plantingPalletKeys,
    value.plantingCountsByPallet
  );

  const fallbackTakenSeedlingCount = getSeedlingCountFromTrayCount(actualSeedlingTrayCount);
  const rawTakenSeedlingCount = String(value.actualTakenSeedlingCount ?? "").trim() === ""
    ? fallbackTakenSeedlingCount
    : value.actualTakenSeedlingCount;
  const actualTakenSeedlingCount = getStrictIntegerInRange(
    rawTakenSeedlingCount,
    0,
    999999999
  );
  const fallbackPlantedSeedlingCount = getActualPlantedSeedlingTotal(
    plantingPalletKeys,
    plantingCountsByPallet
  );
  const rawPlantedSeedlingCount = String(value.actualPlantedSeedlingCount ?? "").trim() === ""
    ? fallbackPlantedSeedlingCount
    : value.actualPlantedSeedlingCount;
  const actualPlantedSeedlingCount = getStrictIntegerInRange(
    rawPlantedSeedlingCount,
    0,
    999999999
  );
  if(actualTakenSeedlingCount === null || actualPlantedSeedlingCount === null) return null;
  if(noPlantingEvent && (actualTakenSeedlingCount !== 0 || actualPlantedSeedlingCount !== 0)){
    return null;
  }
  const actualSeedlingCarryoverMode = normalizeSeedlingCarryoverMode(value.actualSeedlingCarryoverMode);
  const rawLossRate = String(value.actualSeedlingLossRate ?? "").trim();
  if(rawLossRate !== "" && getStrictDecimalInRange(rawLossRate, 0, 100) === null) return null;
  const detailsUnknown = value.detailsUnknown === true
    || ["true", "1", "不明"].includes(String(value.detailsUnknown || "").trim().toLowerCase());
  const qualityMemo = normalizeOptionalQualityMemo(value.qualityMemo);
  const hasOpeningCarryover = value.openingCarryoverBefore !== undefined
    && value.openingCarryoverBefore !== null
    && String(value.openingCarryoverBefore).trim() !== "";
  const openingCarryoverBefore = hasOpeningCarryover
    ? getStrictIntegerInRange(value.openingCarryoverBefore, 0, 999999999)
    : null;
  if(hasOpeningCarryover && openingCarryoverBefore === null) return null;

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
    actualSeedlingCarryoverMode,
    actualSeedlingLossRate: rawLossRate,
    qualityMemo,
    detailsUnknown,
    openingCarryoverBefore,
    createdAt: String(value.createdAt || "").slice(0, 64),
    updatedAt: String(value.updatedAt || "").slice(0, 64)
  };
}

function isNoPlantingEvent(event){
  return !!event
    && Number(event.actualSeedlingTrayCount) === 0
    && Array.isArray(event.plantingPalletKeys)
    && event.plantingPalletKeys.length === 0
    && Array.isArray(event.sourceAllocations)
    && event.sourceAllocations.length === 1
    && Array.isArray(event.sourceAllocations[0]?.palletKeys)
    && event.sourceAllocations[0].palletKeys.length === 0;
}

function serializePlantingEventForStorage(event){
  const normalized = normalizePlantingEvent(event);
  if(!normalized) return null;
  if(normalized.openingCarryoverBefore === null){
    const { openingCarryoverBefore, ...compactEvent } = normalized;
    return compactEvent;
  }
  return normalized;
}

function comparePlantingEventsAsc(a, b){
  const timeA = parseDateOnlyString(a?.plantingDate)?.getTime() ?? Infinity;
  const timeB = parseDateOnlyString(b?.plantingDate)?.getTime() ?? Infinity;
  if(timeA !== timeB) return timeA - timeB;
  return Number(a?.eventId || 0) - Number(b?.eventId || 0);
}

function comparePlantingEventsDesc(a, b){
  return comparePlantingEventsAsc(b, a);
}

function hasPlantingOpeningCarryover(event){
  return event?.openingCarryoverBefore !== null
    && event?.openingCarryoverBefore !== undefined
    && String(event.openingCarryoverBefore).trim() !== "";
}

function wouldCrossPlantingOpeningBoundary(existingEvent, plantingDate){
  if(!existingEvent || plantingDate === existingEvent.plantingDate) return false;
  const proposedEvent = { ...existingEvent, plantingDate };
  return plantingEvents.some(boundaryEvent => {
    if(Number(boundaryEvent.eventId) === Number(existingEvent.eventId)
      || !hasPlantingOpeningCarryover(boundaryEvent)) return false;
    const beforeSide = Math.sign(comparePlantingEventsAsc(existingEvent, boundaryEvent));
    const afterSide = Math.sign(comparePlantingEventsAsc(proposedEvent, boundaryEvent));
    return beforeSide !== afterSide;
  });
}

function getLatestPlantingOpeningBoundary(){
  return plantingEvents
    .filter(hasPlantingOpeningCarryover)
    .sort(comparePlantingEventsDesc)[0] || null;
}

function isBeforeLatestPlantingOpeningBoundary(plantingDate){
  const latestBoundary = getLatestPlantingOpeningBoundary();
  if(!latestBoundary) return false;
  return comparePlantingEventsAsc(
    { plantingDate, eventId: Number.MAX_SAFE_INTEGER },
    latestBoundary
  ) < 0;
}

function isPlantingEventBeforeLatestOpeningBoundary(event){
  const latestBoundary = getLatestPlantingOpeningBoundary();
  return !!event && !!latestBoundary
    && comparePlantingEventsAsc(event, latestBoundary) < 0;
}

function loadPlantingEvents(){
  try{
    const parsed = harvestnaviLocalStorage.readJson(PLANTING_EVENTS_KEY, []);
    if(!Array.isArray(parsed)) return [];
    return parsed.map(normalizePlantingEvent).filter(Boolean).sort(comparePlantingEventsAsc);
  }catch(e){
    return [];
  }
}

function savePlantingEventsToStorage(){
  plantingEvents = plantingEvents
    .map(normalizePlantingEvent)
    .filter(Boolean)
    .sort(comparePlantingEventsAsc);
  harvestnaviLocalStorage.writeJson(
    PLANTING_EVENTS_KEY,
    plantingEvents.map(serializePlantingEventForStorage).filter(Boolean)
  );
  completeRecordDataMutation();
}

function loadDeletedPlantingEvents(){
  try{
    const parsed = harvestnaviLocalStorage.readJson(PLANTING_EVENT_TRASH_KEY, []);
    if(!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.map(entry => {
      const event = normalizePlantingEvent(entry?.event);
      const deletedAt = String(entry?.deletedAt || "");
      const expiresAt = String(entry?.expiresAt || "");
      if(!event || !Number.isFinite(new Date(expiresAt).getTime()) || new Date(expiresAt).getTime() <= now) return null;
      return {
        event,
        deletedAt,
        expiresAt,
        sheetDeleted: !!entry.sheetDeleted,
        wasSynced: !!entry.wasSynced
      };
    }).filter(Boolean);
  }catch(e){
    return [];
  }
}

function saveDeletedPlantingEventsToStorage(){
  const now = Date.now();
  deletedPlantingEvents = deletedPlantingEvents.filter(entry => {
    const expiresTime = new Date(entry?.expiresAt || "").getTime();
    return normalizePlantingEvent(entry?.event) && Number.isFinite(expiresTime) && expiresTime > now;
  });
  harvestnaviLocalStorage.writeJson(PLANTING_EVENT_TRASH_KEY,
    deletedPlantingEvents.map(entry => ({
      ...entry,
      event: serializePlantingEventForStorage(entry.event)
    }))
  );
}

function pruneExpiredDeletedPlantingEvents(now = Date.now()){
  const beforeCount = deletedPlantingEvents.length;
  deletedPlantingEvents = deletedPlantingEvents.filter(entry => (
    new Date(entry?.expiresAt || "").getTime() > now
  ));
  return deletedPlantingEvents.length !== beforeCount;
}

function addPlantingEventToTrash(event, options = {}){
  const normalized = normalizePlantingEvent(event);
  if(!normalized) return;
  const deletedAt = new Date();
  deletedPlantingEvents = deletedPlantingEvents.filter(entry => Number(entry.event?.eventId) !== Number(normalized.eventId));
  deletedPlantingEvents.unshift({
    event: normalized,
    deletedAt: deletedAt.toISOString(),
    expiresAt: new Date(deletedAt.getTime() + RECORD_TRASH_RETENTION_MS).toISOString(),
    sheetDeleted: !!options.sheetDeleted,
    wasSynced: !!options.wasSynced
  });
  saveDeletedPlantingEventsToStorage();
}

function isPlantingEventTemporarilyDeleted(eventId){
  return deletedPlantingEvents.some(entry => Number(entry.event?.eventId) === Number(eventId));
}

function loadPlantingEventSyncStatus(){
  try{
    const parsed = harvestnaviLocalStorage.readJson(PLANTING_EVENT_SYNC_STATUS_KEY, {});
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  }catch(e){
    return {};
  }
}

function savePlantingEventSyncStatus(status){
  harvestnaviLocalStorage.writeJson(PLANTING_EVENT_SYNC_STATUS_KEY, status || {});
}

function setPlantingEventSyncStatus(event, state){
  const eventId = getSafePositiveRecordId(event?.eventId);
  if(eventId === null) return;
  const status = loadPlantingEventSyncStatus();
  status[String(eventId)] = { state, updatedAt: new Date().toISOString() };
  savePlantingEventSyncStatus(status);
  updateGoogleSheetResendButtonState();
}

function isPlantingEventUnsent(event, status = loadPlantingEventSyncStatus()){
  const eventId = getSafePositiveRecordId(event?.eventId);
  if(eventId === null) return false;
  const state = String(status[String(eventId)]?.state || "");
  return state !== "confirmed" && state !== "unconfirmed";
}

function getGoogleSheetUnsentPlantingEvents(){
  const config = getValidatedGoogleSheetConfig({ silent: true });
  if(!config) return [];
  const status = loadPlantingEventSyncStatus();
  return plantingEvents.filter(event => (
    isPlantingEventUnsent(event, status)
    && !hasSyncConflictForEntity("planting", event)
  ));
}

function getNextPlantingEventId(){
  const used = new Set(plantingEvents.map(event => Number(event.eventId)));
  let eventId = Math.max(1, Date.now());
  while(used.has(eventId) && eventId < Number.MAX_SAFE_INTEGER) eventId++;
  return eventId;
}

function invalidatePlantingEventStateCache(){
  plantingEventStateCache = null;
  plantingEventStateCacheKey = "";
  plantingDateByPalletCache.clear();
  plantingStateByPalletCache.clear();
  invalidatePlantingAllowedPalletSetCache();
}

function getPlantingLotKey(harvestRecordId, palletKey){
  return String(harvestRecordId) + "::" + String(palletKey || "");
}

function calculatePlantingEventUsage(events, options = {}){
  const usageByEventId = new Map();
  let carryover = 0;
  const openingPosition = options.openingPosition || null;
  // Google側の取得上限より前にある履歴は、先頭イベントへ付いた繰越残高から再開する。
  const openingCarryoverOverride = getStrictIntegerInRange(
    options.openingCarryoverBefore,
    0,
    999999999
  );
  let openingOverrideApplied = openingCarryoverOverride === null || !openingPosition;

  [...(Array.isArray(events) ? events : [])].sort(comparePlantingEventsAsc).forEach(event => {
    if(!openingOverrideApplied && comparePlantingEventsAsc(event, openingPosition) > 0){
      carryover = openingCarryoverOverride;
      openingOverrideApplied = true;
    }
    if(event.openingCarryoverBefore !== null
      && event.openingCarryoverBefore !== undefined
      && String(event.openingCarryoverBefore).trim() !== ""){
      carryover = clampNumber(event.openingCarryoverBefore, 0, 999999999, carryover);
    }
    const carryoverBefore = carryover;
    if(event.detailsUnknown){
      usageByEventId.set(Number(event.eventId), {
        eventId: Number(event.eventId),
        carryoverBefore,
        takenTotal: null,
        plantedTotal: null,
        usedFromCarryover: null,
        usedFromCurrent: null,
        actualLossSeedlings: null,
        effectiveLossRate: null,
        currentCarryoverAfter: null,
        carryoverAfter: carryover,
        insufficientSeedlings: false,
        detailsUnknown: true
      });
      return;
    }
    const takenTotal = clampNumber(
      event.actualTakenSeedlingCount,
      0,
      999999999,
      getSeedlingCountFromTrayCount(event.actualSeedlingTrayCount)
    );
    const plantedTotal = clampNumber(
      event.actualPlantedSeedlingCount,
      0,
      999999999,
      getActualPlantedSeedlingTotal(event.plantingPalletKeys, event.plantingCountsByPallet)
    );
    const usedFromCarryover = Math.min(carryoverBefore, plantedTotal);
    const remainingCarryover = Math.max(0, carryoverBefore - usedFromCarryover);
    const remainingNeed = Math.max(0, plantedTotal - usedFromCarryover);
    const usedFromCurrent = Math.min(takenTotal, remainingNeed);
    const fallbackLossRate = takenTotal > 0
      ? Math.max(0, ((takenTotal - usedFromCurrent) / takenTotal) * 100)
      : 0;
    const rawLossRate = String(event.actualSeedlingLossRate ?? "").trim();
    const effectiveLossRate = rawLossRate === ""
      ? (event.actualSeedlingCarryoverMode === "carryover"
          ? clampNumber(settings.seedlingLossRate, 0, 100, 0)
          : fallbackLossRate)
      : clampNumber(rawLossRate, 0, 100, fallbackLossRate);
    const actualLossSeedlings = event.actualSeedlingCarryoverMode === "carryover"
      ? getSeedlingLossCountFromRate(takenTotal, effectiveLossRate)
      : Math.max(0, takenTotal - usedFromCurrent);
    const currentCarryoverAfter = event.actualSeedlingCarryoverMode === "carryover"
      ? Math.max(0, takenTotal - usedFromCurrent - actualLossSeedlings)
      : 0;
    carryover = event.actualSeedlingCarryoverMode === "carryover"
      ? Math.max(0, remainingCarryover + currentCarryoverAfter)
      : 0;

    usageByEventId.set(Number(event.eventId), {
      eventId: Number(event.eventId),
      carryoverBefore,
      takenTotal,
      plantedTotal,
      usedFromCarryover,
      usedFromCurrent,
      actualLossSeedlings,
      effectiveLossRate,
      currentCarryoverAfter,
      carryoverAfter: carryover,
      insufficientSeedlings: carryoverBefore + takenTotal < plantedTotal
    });
  });

  if(!openingOverrideApplied) carryover = openingCarryoverOverride;

  return { usageByEventId, currentCarryover: carryover };
}

function getPlantingCarryoverBeforePosition(plantingDateValue, eventId = null){
  const targetDate = parseDateOnlyString(String(plantingDateValue || "").trim()) || new Date();
  const targetTime = startOfLocalDay(targetDate).getTime();
  const safeEventId = getSafePositiveRecordId(eventId);
  const targetEvent = safeEventId === null ? null : getPlantingEventById(safeEventId);
  if(targetEvent?.openingCarryoverBefore !== null
    && targetEvent?.openingCarryoverBefore !== undefined
    && String(targetEvent.openingCarryoverBefore).trim() !== ""){
    return clampNumber(targetEvent.openingCarryoverBefore, 0, 999999999, 0);
  }
  const earlierEvents = plantingEvents.filter(event => {
    if(safeEventId !== null && Number(event.eventId) === safeEventId) return false;
    const eventDate = parseDateOnlyString(String(event.plantingDate || ""));
    if(!eventDate) return false;
    const eventTime = startOfLocalDay(eventDate).getTime();
    if(eventTime < targetTime) return true;
    return eventTime === targetTime
      && (safeEventId === null || Number(event.eventId) < safeEventId);
  });
  return calculatePlantingEventUsage(earlierEvents).currentCarryover;
}

function buildPlantingEventStateIndex(options = {}){
  const excludeEventId = getSafePositiveRecordId(options.excludeEventId);
  const harvestRecords = records
    .filter(record => record?.type === "fullHarvest")
    .sort((a, b) => {
      const timeA = parseDateOnlyString(a?.date)?.getTime() ?? Infinity;
      const timeB = parseDateOnlyString(b?.date)?.getTime() ?? Infinity;
      if(timeA !== timeB) return timeA - timeB;
      return Number(a?.id || 0) - Number(b?.id || 0);
    });
  const harvestById = new Map();
  const pendingByHarvestId = new Map();
  const allocatedLotKeys = new Set();
  const eventsByHarvestId = new Map();
  const noPlantingCompletedHarvestIds = new Set();
  const orderedEvents = plantingEvents
    .filter(event => excludeEventId === null || Number(event.eventId) !== excludeEventId)
    .sort(comparePlantingEventsAsc);

  harvestRecords.forEach((record, harvestOrder) => {
    const harvestRecordId = Number(record.id);
    const palletKeys = getPalletKeysFromRecord(record);
    harvestById.set(harvestRecordId, { record, harvestOrder, palletKeys });
    pendingByHarvestId.set(harvestRecordId, new Set(palletKeys));
  });

  orderedEvents.forEach(event => {
    event.sourceAllocations.forEach(allocation => {
      const harvestRecordId = Number(allocation.harvestRecordId);
      if(!eventsByHarvestId.has(harvestRecordId)) eventsByHarvestId.set(harvestRecordId, []);
      eventsByHarvestId.get(harvestRecordId).push(event);
      if(isNoPlantingEvent(event)) noPlantingCompletedHarvestIds.add(harvestRecordId);
      const pendingKeys = pendingByHarvestId.get(harvestRecordId);
      allocation.palletKeys.forEach(key => {
        allocatedLotKeys.add(getPlantingLotKey(harvestRecordId, key));
        pendingKeys?.delete(key);
      });
    });

  });

  const excludedEvent = excludeEventId === null ? null : getPlantingEventById(excludeEventId);
  const usageLedger = calculatePlantingEventUsage(orderedEvents, excludedEvent?.openingCarryoverBefore !== null
    && excludedEvent?.openingCarryoverBefore !== undefined
    ? {
        openingCarryoverBefore: excludedEvent.openingCarryoverBefore,
        openingPosition: excludedEvent
      }
    : {});

  const pendingOwnersByPalletKey = new Map();
  const allowedPalletSet = new Set();
  pendingByHarvestId.forEach((pendingKeys, harvestRecordId) => {
    const harvestInfo = harvestById.get(harvestRecordId);
    pendingKeys.forEach(palletKey => {
      allowedPalletSet.add(palletKey);
      if(!pendingOwnersByPalletKey.has(palletKey)) pendingOwnersByPalletKey.set(palletKey, []);
      pendingOwnersByPalletKey.get(palletKey).push({
        harvestRecordId,
        palletKey,
        harvestOrder: harvestInfo?.harvestOrder ?? -1,
        harvestDate: harvestInfo?.record?.date || ""
      });
    });
  });
  pendingOwnersByPalletKey.forEach(owners => {
    owners.sort((a, b) => b.harvestOrder - a.harvestOrder);
  });

  return {
    harvestById,
    pendingByHarvestId,
    pendingOwnersByPalletKey,
    allowedPalletSet,
    allocatedLotKeys,
    eventsByHarvestId,
    noPlantingCompletedHarvestIds,
    orderedEvents,
    usageByEventId: usageLedger.usageByEventId,
    currentCarryover: usageLedger.currentCarryover
  };
}

function getPlantingEventStateIndex(){
  if(!plantingEventStateCache){
    plantingEventStateCache = buildPlantingEventStateIndex();
  }
  return plantingEventStateCache;
}

function getPlantingEventById(eventId){
  const safeId = getSafePositiveRecordId(eventId);
  if(safeId === null) return null;
  return plantingEvents.find(event => Number(event.eventId) === safeId) || null;
}

function getPlantingEventsForHarvest(harvestRecordId){
  return [...(getPlantingEventStateIndex().eventsByHarvestId.get(Number(harvestRecordId)) || [])]
    .sort(comparePlantingEventsDesc);
}

function getRemotePlantingEventDependenciesForHarvest(harvestRecordId){
  const targetId = Number(harvestRecordId);
  const active = getPlantingEventsForHarvest(targetId);
  const appOnlyDeleted = deletedPlantingEvents
    .filter(entry => entry.wasSynced && !entry.sheetDeleted)
    .map(entry => entry.event)
    .filter(event => event.sourceAllocations.some(allocation => Number(allocation.harvestRecordId) === targetId));
  return [...active, ...appOnlyDeleted];
}

function getUnplantedPalletKeysForHarvest(harvestRecordId){
  const keys = getPlantingEventStateIndex().pendingByHarvestId.get(Number(harvestRecordId));
  return keys
    ? [...keys].sort((a, b) => getOrderIndexFromKey(a) - getOrderIndexFromKey(b))
    : [];
}

function getPlantingEventUsage(eventId){
  return getPlantingEventStateIndex().usageByEventId.get(Number(eventId)) || null;
}

function resolvePlantingEventAllocations(selectedKeys, options = {}){
  const preferredHarvestId = getSafePositiveRecordId(options.preferredHarvestId);
  const existingEvent = options.existingEvent || (options.excludeEventId ? getPlantingEventById(options.excludeEventId) : null);
  const existingOwnerByPalletKey = new Map();
  (existingEvent?.sourceAllocations || []).forEach(allocation => {
    allocation.palletKeys.forEach(key => existingOwnerByPalletKey.set(key, Number(allocation.harvestRecordId)));
  });
  const state = options.excludeEventId
    ? buildPlantingEventStateIndex({ excludeEventId: options.excludeEventId })
    : getPlantingEventStateIndex();
  const groups = new Map();

  [...new Set(Array.isArray(selectedKeys) ? selectedKeys : [])].forEach(palletKey => {
    const owners = state.pendingOwnersByPalletKey.get(palletKey) || [];
    const existingOwnerId = existingOwnerByPalletKey.get(palletKey);
    const owner = owners.find(item => Number(item.harvestRecordId) === Number(existingOwnerId))
      || owners.find(item => preferredHarvestId !== null && item.harvestRecordId === preferredHarvestId)
      || owners[0];
    if(!owner) return;
    if(!groups.has(owner.harvestRecordId)) groups.set(owner.harvestRecordId, []);
    groups.get(owner.harvestRecordId).push(palletKey);
  });

  return [...groups.entries()].map(([harvestRecordId, palletKeys]) => ({
    harvestRecordId,
    palletKeys: [...new Set(palletKeys)].sort((a, b) => getOrderIndexFromKey(a) - getOrderIndexFromKey(b))
  }));
}

function syncHarvestPlantingPendingFlags(options = {}){
  const state = getPlantingEventStateIndex();
  let changed = false;
  records.forEach(record => {
    if(record?.type !== "fullHarvest") return;
    const harvestRecordId = Number(record.id);
    const nextPending = (state.pendingByHarvestId.get(harvestRecordId)?.size || 0) > 0
      && !state.noPlantingCompletedHarvestIds.has(harvestRecordId);
    if(!!record.plantingPending === nextPending) return;
    record.plantingPending = nextPending;
    changed = true;
  });
  if(changed) invalidateRecordHistoryCache();
  if(changed && options.persist !== false) saveRecordsToStorage();
  return changed;
}

function compareRecordsByDateDesc(a, b){
  const timeA = parseDateOnlyString(a?.date)?.getTime() ?? -Infinity;
  const timeB = parseDateOnlyString(b?.date)?.getTime() ?? -Infinity;
  if(timeA !== timeB) return timeB - timeA;

  const idA = Number(a?.id);
  const idB = Number(b?.id);
  const safeIdA = Number.isFinite(idA) ? idA : 0;
  const safeIdB = Number.isFinite(idB) ? idB : 0;
  return safeIdB - safeIdA;
}

function getHarvestRecordEditTimelineRecords(recordId = editingHarvestRecordId, boundaryDate = null){
  const safeRecordId = getSafePositiveRecordId(recordId);
  if(safeRecordId === null) return records;
  const editingRecord = records.find(record => (
    getSafePositiveRecordId(record?.id) === safeRecordId
  ));
  if(!editingRecord) return records;
  const requestedBoundaryDate = String(boundaryDate || "").trim();
  const effectiveBoundaryDate = parseDateOnlyString(requestedBoundaryDate)
    ? requestedBoundaryDate
    : String(editingRecord.date || "");
  if(harvestRecordEditTimelineCache
    && harvestRecordEditTimelineCacheId === safeRecordId
    && harvestRecordEditTimelineCacheRecordCount === records.length
    && harvestRecordEditTimelineCacheDate === effectiveBoundaryDate){
    return harvestRecordEditTimelineCache;
  }
  const editingPosition = { ...editingRecord, date: effectiveBoundaryDate };

  // 編集対象と、それより後に作られた履歴を一時的に外し、当時の状態で再計算する。
  harvestRecordEditTimelineCache = records.filter(record => (
    getSafePositiveRecordId(record?.id) !== safeRecordId
    && compareRecordsByDateDesc(record, editingPosition) > 0
  ));
  harvestRecordEditTimelineCacheId = safeRecordId;
  harvestRecordEditTimelineCacheRecordCount = records.length;
  harvestRecordEditTimelineCacheDate = effectiveBoundaryDate;
  return harvestRecordEditTimelineCache;
}

function invalidateHarvestRecordEditTimelineCache(){
  harvestRecordEditTimelineCache = null;
  harvestRecordEditTimelineCacheId = null;
  harvestRecordEditTimelineCacheRecordCount = 0;
  harvestRecordEditTimelineCacheDate = "";
}

function invalidateWorkflowPendingRecordCache(){
  workflowPendingRecordCache = null;
  workflowPendingRecordCacheReady = false;
}

function invalidateRecordDerivedCaches(options = {}){
  if(options.harvestRecords === true){
    invalidateHarvestRecordEditTimelineCache();
    invalidateHarvestRecordLookupCache();
  }
  invalidateRecordHistoryCache();
  invalidatePlantingEventStateCache();
  invalidateDashboardDerivedData();
  invalidateWorkflowPendingRecordCache();
}

function completeRecordDataMutation(options = {}){
  invalidateRecordDerivedCaches(options);
  scheduleWorkflowGuideUpdate();
  if(typeof renderSeedlingHouseUi === "function" && document.getElementById("seedlingHouseOpenBtn")){
    renderSeedlingHouseUi();
  }
}

function getActiveHarvestTimelineRecords(sourceRecords = records){
  if(sourceRecords !== records) return sourceRecords;
  if(activeAppTab !== "record" || recordSelectionMode !== "harvest" || !editingHarvestRecordId){
    return records;
  }
  return getHarvestRecordEditTimelineRecords(
    editingHarvestRecordId,
    document.getElementById("recordDateInput")?.value || null
  );
}

function loadRecords(){
  try{
    const parsed = harvestnaviLocalStorage.readJson(RECORDS_KEY, []);
    if(!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeStoredRecord)
      .filter(record => {
        if(!record) return false;
        if(record.type === "partialHarvest") return record.targets.length > 0;
        return record.palletKeys.length > 0;
      })
      .sort(compareRecordsByDateDesc);
  }catch(e){
    return [];
  }
}

function saveRecordsToStorage(){
  records.sort(compareRecordsByDateDesc);
  harvestnaviLocalStorage.writeJson(RECORDS_KEY, records.map(serializeRecordForStorage));
  completeRecordDataMutation({ harvestRecords: true });
}

function loadDeletedRecords(){
  try{
    const parsed = harvestnaviLocalStorage.readJson(RECORD_TRASH_KEY, []);
    if(!Array.isArray(parsed)) return [];
    const now = Date.now();
    const activeEntries = parsed.map(entry => {
      const record = normalizeStoredRecord(entry?.record);
      const deletedAt = String(entry?.deletedAt || "");
      const deletedTime = new Date(deletedAt).getTime();
      const expiresAt = String(entry?.expiresAt || "");
      const expiresTime = new Date(expiresAt).getTime();
      if(!record || !Number.isFinite(expiresTime) || expiresTime <= now) return null;
      return {
        record,
        deletedAt: Number.isFinite(deletedTime) ? new Date(deletedTime).toISOString() : new Date(now).toISOString(),
        expiresAt: new Date(expiresTime).toISOString(),
        sheetDeleted: !!entry?.sheetDeleted,
        remoteDeleted: !!entry?.remoteDeleted
      };
    }).filter(Boolean);
    harvestnaviLocalStorage.writeJson(RECORD_TRASH_KEY, activeEntries.map(serializeDeletedRecordEntry));
    return activeEntries;
  }catch(e){
    return [];
  }
}

function serializeDeletedRecordEntry(entry){
  return {
    record: serializeRecordForStorage(entry.record),
    deletedAt: entry.deletedAt,
    expiresAt: entry.expiresAt,
    sheetDeleted: !!entry.sheetDeleted,
    remoteDeleted: !!entry.remoteDeleted
  };
}

function saveDeletedRecordsToStorage(){
  const now = Date.now();
  deletedRecords = deletedRecords.filter(entry => new Date(entry.expiresAt).getTime() > now);
  harvestnaviLocalStorage.writeJson(RECORD_TRASH_KEY, deletedRecords.map(serializeDeletedRecordEntry));
}

function pruneExpiredDeletedRecords(now = Date.now()){
  const beforeCount = deletedRecords.length;
  deletedRecords = deletedRecords.filter(entry => (
    new Date(entry?.expiresAt || "").getTime() > now
  ));
  return deletedRecords.length !== beforeCount;
}

function addRecordToTrash(record, options = {}){
  if(!record) return;
  const recordId = String(record.id ?? "");
  const recordUuid = normalizeRecordUuid(record.recordUuid);
  const now = new Date();
  deletedRecords = deletedRecords.filter(entry => {
    const entryUuid = normalizeRecordUuid(entry.record?.recordUuid);
    if(recordUuid && entryUuid) return entryUuid !== recordUuid;
    return String(entry.record?.id ?? "") !== recordId;
  });
  deletedRecords.unshift({
    record: normalizeRecordSnapshot(record),
    deletedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + RECORD_TRASH_RETENTION_MS).toISOString(),
    sheetDeleted: !!options.sheetDeleted,
    remoteDeleted: !!options.remoteDeleted
  });
  if(!options.deferSave) saveDeletedRecordsToStorage();
}

function normalizeSyncConflictEntityVersion(entityType, value){
  if(value === null || value === undefined) return null;
  if(entityType === "record"){
    return normalizeRecordSnapshot(value);
  }
  if(entityType === "planting"){
    return normalizePlantingEvent(value);
  }
  return null;
}

function getSyncConflictEntityIdentity(entityType, localVersion, remoteVersion){
  const source = remoteVersion || localVersion;
  if(entityType === "record"){
    const identity = getHarvestRecordIdentity(source);
    return identity.recordUuid
      ? { recordUuid: identity.recordUuid, entityId: identity.id }
      : null;
  }
  if(entityType === "planting"){
    const eventId = getSafePositiveRecordId(source?.eventId);
    return eventId === null ? null : { recordUuid: "", entityId: eventId };
  }
  return null;
}

function getSyncConflictLookupKey(value){
  const entityType = value?.entityType === "planting" ? "planting" : "record";
  const localVersion = normalizeSyncConflictEntityVersion(entityType, value?.localVersion);
  const remoteVersion = normalizeSyncConflictEntityVersion(entityType, value?.remoteVersion);
  const identity = getSyncConflictEntityIdentity(entityType, localVersion, remoteVersion);
  if(!identity) return "";
  if(entityType === "record"){
    return "record:uuid:" + identity.recordUuid;
  }
  return entityType + ":id:" + String(identity.entityId);
}

function normalizeSyncConflictEntry(value){
  if(!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entityType = value.entityType === "planting" ? "planting" : "record";
  const localVersion = normalizeSyncConflictEntityVersion(entityType, value.localVersion);
  const remoteVersion = normalizeSyncConflictEntityVersion(entityType, value.remoteVersion);
  if(!localVersion && !remoteVersion) return null;
  const identity = getSyncConflictEntityIdentity(entityType, localVersion, remoteVersion);
  if(!identity) return null;
  const reason = [
    "both_updated",
    "remote_deleted",
    "planting_dependency",
    "remote_deleted_dependency",
    "editing"
  ].includes(value.reason) ? value.reason : "both_updated";
  const detectedTime = new Date(String(value.detectedAt || "")).getTime();
  const lastSeenTime = new Date(String(value.lastSeenAt || "")).getTime();
  const now = Date.now();
  const conflictId = String(value.conflictId || "").trim();
  const sourceUrl = String(value.sourceUrl || loadGoogleSheetConfig().url || "").trim().slice(0, 2048);
  return {
    conflictId: /^[A-Za-z0-9:_-]{1,200}$/.test(conflictId)
      ? conflictId
      : `sync-${now}-${Math.random().toString(36).slice(2, 10)}`,
    entityType,
    entityId: identity.entityId,
    recordUuid: identity.recordUuid,
    sourceUrl,
    reason,
    localVersion,
    remoteVersion,
    detectedAt: new Date(Number.isFinite(detectedTime) ? detectedTime : now).toISOString(),
    lastSeenAt: new Date(Number.isFinite(lastSeenTime) ? lastSeenTime : now).toISOString()
  };
}

function serializeSyncConflictEntry(entry){
  const normalized = normalizeSyncConflictEntry(entry);
  if(!normalized) return null;
  return {
    ...normalized,
    localVersion: normalized.entityType === "record"
      ? (normalized.localVersion ? serializeRecordForStorage(normalized.localVersion) : null)
      : (normalized.localVersion ? serializePlantingEventForStorage(normalized.localVersion) : null),
    remoteVersion: normalized.entityType === "record"
      ? (normalized.remoteVersion ? serializeRecordForStorage(normalized.remoteVersion) : null)
      : (normalized.remoteVersion ? serializePlantingEventForStorage(normalized.remoteVersion) : null)
  };
}

function loadSyncConflicts(){
  try{
    const parsed = harvestnaviLocalStorage.readJson(GOOGLE_SHEET_SYNC_CONFLICTS_KEY, []);
    if(!Array.isArray(parsed) || parsed.length > GOOGLE_SHEET_SYNC_CONFLICT_MAX_ITEMS) return [];
    const byKey = new Map();
    parsed.forEach(value => {
      const entry = normalizeSyncConflictEntry(value);
      const key = entry ? getSyncConflictLookupKey(entry) : "";
      if(key) byKey.set(key, entry);
    });
    return [...byKey.values()].sort((left, right) => (
      String(right.lastSeenAt).localeCompare(String(left.lastSeenAt))
    ));
  }catch(e){
    return [];
  }
}

function saveSyncConflictsToStorage(){
  if(syncConflicts.length > GOOGLE_SHEET_SYNC_CONFLICT_MAX_ITEMS){
    throw new Error("競合一覧が" + GOOGLE_SHEET_SYNC_CONFLICT_MAX_ITEMS + "件を超えています");
  }
  harvestnaviLocalStorage.writeJson(
    GOOGLE_SHEET_SYNC_CONFLICTS_KEY,
    syncConflicts.map(serializeSyncConflictEntry).filter(Boolean)
  );
}

function upsertSyncConflict(value){
  const next = normalizeSyncConflictEntry(value);
  if(!next) throw new Error("競合として退避する記録の形式が正しくありません");
  const key = getSyncConflictLookupKey(next);
  const previousConflicts = syncConflicts;
  const nextConflicts = [...syncConflicts];
  const existingIndex = nextConflicts.findIndex(entry => getSyncConflictLookupKey(entry) === key);
  if(existingIndex >= 0){
    const existing = nextConflicts[existingIndex];
    next.conflictId = existing.conflictId;
    next.detectedAt = existing.detectedAt;
    nextConflicts[existingIndex] = next;
  }else{
    if(nextConflicts.length >= GOOGLE_SHEET_SYNC_CONFLICT_MAX_ITEMS){
      throw new Error("競合一覧が上限に達したため同期を続行できません");
    }
    nextConflicts.push(next);
  }
  nextConflicts.sort((left, right) => String(right.lastSeenAt).localeCompare(String(left.lastSeenAt)));
  syncConflicts = nextConflicts;
  try{
    saveSyncConflictsToStorage();
  }catch(error){
    syncConflicts = previousConflicts;
    throw error;
  }
  if(next.entityType === "record"){
    const queueKey = getGoogleSheetBackgroundRecordKey(next.localVersion || next.remoteVersion);
    if(queueKey) googleSheetBackgroundRecordQueue.delete(queueKey);
  }else{
    googleSheetBackgroundPlantingQueue.delete(String(next.entityId));
  }
  return next;
}

function removeSyncConflictById(conflictId){
  const previousConflicts = syncConflicts;
  const nextConflicts = syncConflicts.filter(entry => entry.conflictId !== conflictId);
  if(nextConflicts.length === previousConflicts.length) return false;
  syncConflicts = nextConflicts;
  try{
    saveSyncConflictsToStorage();
  }catch(error){
    syncConflicts = previousConflicts;
    throw error;
  }
  updateSyncConflictButtonState();
  return true;
}

function removeSyncConflictForEntity(entityType, entity){
  const key = getSyncConflictLookupKey({
    entityType,
    localVersion: entity,
    remoteVersion: entity
  });
  if(!key) return false;
  const previousConflicts = syncConflicts;
  const nextConflicts = syncConflicts.filter(entry => getSyncConflictLookupKey(entry) !== key);
  if(nextConflicts.length === previousConflicts.length) return false;
  syncConflicts = nextConflicts;
  try{
    saveSyncConflictsToStorage();
  }catch(error){
    syncConflicts = previousConflicts;
    throw error;
  }
  updateSyncConflictButtonState();
  return true;
}

function hasSyncConflictForEntity(entityType, entity){
  return !!getSyncConflictForEntity(entityType, entity);
}

function getSyncConflictForEntity(entityType, entity){
  const key = getSyncConflictLookupKey({
    entityType,
    localVersion: entity,
    remoteVersion: entity
  });
  return key
    ? (syncConflicts.find(entry => getSyncConflictLookupKey(entry) === key) || null)
    : null;
}

function ensureSyncConflictResolvedBeforeChange(entityType, entity, action){
  if(!hasSyncConflictForEntity(entityType, entity)) return true;
  showToast(`${action}する前に「競合を確認」から残す内容を選んでください`);
  return false;
}

function isRecordTemporarilyDeleted(record){
  const recordUuid = normalizeRecordUuid(record?.recordUuid);
  const id = String(record?.id ?? "").trim();
  const duplicateKey = String(getRecordDuplicateKey(record) || record?.duplicateKey || "").trim();
  return deletedRecords.some(entry => {
    const deletedRecord = entry.record;
    const deletedUuid = normalizeRecordUuid(deletedRecord?.recordUuid);
    if(recordUuid && deletedUuid) return recordUuid === deletedUuid;
    const deletedId = String(deletedRecord?.id ?? "").trim();
    const deletedKey = String(getRecordDuplicateKey(deletedRecord) || deletedRecord?.duplicateKey || "").trim();
    return (id && deletedId === id)
      || (!recordUuid && !deletedUuid && duplicateKey && deletedKey === duplicateKey);
  });
}
