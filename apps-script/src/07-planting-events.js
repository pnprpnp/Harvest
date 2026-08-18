function savePlantingEvent(event) {
  let normalizedEvent;
  try {
    normalizedEvent = normalizePlantingEvent(event);
  } catch (err) {
    throw new Error("苗植えイベントの受信値確認中に失敗しました: " + String(err && err.message || err));
  }
  return withRecordWriteLock(() => savePlantingEventUnlocked(normalizedEvent));
}

function savePlantingEventUnlocked(event) {
  let sheet;
  let headers;
  try {
    sheet = getPlantingEventSheet();
    headers = ensurePlantingEventHeaders(sheet);
  } catch (err) {
    throw new Error("苗植えイベントシートの準備中に失敗しました: " + String(err && err.message || err));
  }
  let existingTrashSheet;
  try {
    existingTrashSheet = getExistingPlantingEventTrashSheet();
  } catch (err) {
    throw new Error("削除済み苗植えイベントシートの確認中に失敗しました: " +
      String(err && err.message || err));
  }
  if (existingTrashSheet) {
    try {
      ensurePlantingEventTrashSheet(existingTrashSheet);
      purgeExpiredPlantingEventTrash(existingTrashSheet);
    } catch (err) {
      throw new Error("削除済み苗植えイベントの整理中に失敗しました: " + String(err && err.message || err));
    }
  }
  try {
    assertPlantingEventIsNotDeleted(event, getDeletedPlantingEventIdSet());
  } catch (err) {
    throw new Error("苗植えイベントの削除状態確認中に失敗しました: " + String(err && err.message || err));
  }
  try {
    assertPlantingEventSourcesExist(event);
  } catch (err) {
    throw new Error("苗植え元の収穫記録の確認中に失敗しました: " + String(err && err.message || err));
  }
  try {
    assertPlantingEventAllocationsAvailable(event, sheet, headers);
  } catch (err) {
    throw new Error("苗植え済みパレットの確認中に失敗しました: " + String(err && err.message || err));
  }
  const affectedHarvestRecordIds = getHarvestRecordIdsFromPlantingEvent(event);

  const now = new Date().toISOString();
  let existingRowNumber;
  try {
    existingRowNumber = findPlantingEventRowById(sheet, headers, event.eventId, true);
  } catch (err) {
    throw new Error("苗植えイベントIDの検索中に失敗しました: " + String(err && err.message || err));
  }
  let createdAt = event.createdAt || now;
  let previousUpdatedAt = "";
  if (existingRowNumber > 0) {
    let existingEvent;
    let existingRow;
    try {
      existingRow = readPlantingEventRowValues(sheet, existingRowNumber, headers);
    } catch (err) {
      throw new Error("既存の苗植えイベント行の読み取り中に失敗しました: " + String(err && err.message || err));
    }
    const writeMarker = getPlantingWriteMarker(headers, existingRow);
    if (writeMarker) {
      if (!plantingWriteMarkerMatchesRequest(writeMarker, event)) {
        throw new Error(
          "同じ苗植えイベントIDで別内容の未完了送信があります。記録を同期してから再送してください"
        );
      }
      const rowEventIdColumn = getPlantingEventHeaderColumn(headers, "eventId");
      const rowEventId = rowEventIdColumn > 0
        ? String(existingRow[rowEventIdColumn - 1] == null ? "" : existingRow[rowEventIdColumn - 1]).trim()
        : "";
      if (rowEventId && rowEventId !== String(event.eventId)) {
        throw new Error("苗植えイベントの未完了行でIDが競合しています");
      }
      const createdAtColumn = getPlantingEventHeaderColumn(headers, "createdAt");
      const storedCreatedAt = createdAtColumn > 0
        ? formatPlantingEventTimestamp(existingRow[createdAtColumn - 1])
        : "";
      createdAt = storedCreatedAt || createdAt;
      previousUpdatedAt = String(writeMarker.baseUpdatedAt || "");
      existingEvent = null;
    } else if (!isCommittedPlantingEventRow(headers, existingRow)) {
      throw new Error("苗植えイベント行の未完了マーカーがありません");
    } else {
      try {
        existingEvent = rowToPlantingEvent(headers, existingRow);
        getHarvestRecordIdsFromPlantingEvent(existingEvent)
          .forEach(id => affectedHarvestRecordIds.add(id));
      } catch (err) {
        if (!isRecoverableIncompletePlantingEventRow(headers, existingRow, event.eventId)) {
          throw new Error("既存の苗植えイベント行の読み取り中に失敗しました: " + String(err && err.message || err));
        }
        existingEvent = null;
        previousUpdatedAt = event.updatedAt || "";
      }
    }
    if (existingEvent &&
      getPlantingEventContentSignature(event) === getPlantingEventContentSignature(existingEvent)) {
      syncRecordSheetPlantingLocationSummaries(affectedHarvestRecordIds);
      return { updated: true, unchanged: true, event: existingEvent };
    }
    if (existingEvent && event.updatedAt && existingEvent.updatedAt && event.updatedAt !== existingEvent.updatedAt) {
      throw new Error("この苗植えイベントは別の端末で更新されています。最新履歴を読み込んでから編集してください");
    }
    if (existingEvent && !event.updatedAt) {
      throw new Error("同じ苗植えイベントIDの別内容が保存済みです。最新履歴を読み込んでください");
    }
    if (existingEvent) {
      createdAt = existingEvent.createdAt || createdAt;
      previousUpdatedAt = existingEvent.updatedAt || "";
    }
  }

  const eventToWrite = {
    ...event,
    createdAt,
    updatedAt: getNextPlantingEventUpdatedAt(previousUpdatedAt)
  };
  try {
    if (existingRowNumber > 0) {
      writePlantingEventRow(sheet, existingRowNumber, headers, eventToWrite, event);
    } else {
      appendPlantingEventRow(sheet, headers, eventToWrite, event);
    }
  } catch (err) {
    throw new Error("苗植えイベント行の更新中に失敗しました: " + String(err && err.message || err));
  }
  try {
    syncRecordSheetPlantingLocationSummaries(affectedHarvestRecordIds);
  } catch (err) {
    throw new Error("記録シートの苗植え場所への反映中に失敗しました: " + String(err && err.message || err));
  }
  return {
    updated: existingRowNumber > 0,
    event: eventToWrite
  };
}

function getPlantingEventContentSignature(event) {
  return JSON.stringify({
    eventId: event.eventId,
    plantingDate: event.plantingDate,
    sourceAllocations: event.sourceAllocations,
    plantingPalletKeys: event.plantingPalletKeys,
    plantingCountsByPallet: event.plantingCountsByPallet,
    actualSeedlingTrayCount: event.actualSeedlingTrayCount,
    seedlingHousePalletKeys: event.seedlingHousePalletKeys,
    seedlingHousePrimaryPlantingDate: event.seedlingHousePrimaryPlantingDate,
    seedlingHouseNextStartKey: event.seedlingHouseNextStartKey,
    actualTakenSeedlingCount: event.actualTakenSeedlingCount,
    actualPlantedSeedlingCount: event.actualPlantedSeedlingCount,
    actualSeedlingCarryoverMode: event.actualSeedlingCarryoverMode,
    actualSeedlingLossRate: event.actualSeedlingLossRate,
    qualityMemo: event.qualityMemo,
    detailsUnknown: event.detailsUnknown
  });
}

function assertPlantingEventDeleteIsCurrent(requestedEvent, existingEvent) {
  if (requestedEvent.updatedAt && existingEvent.updatedAt &&
    requestedEvent.updatedAt !== existingEvent.updatedAt) {
    throw new Error(
      "この苗植えイベントは別の端末で更新されています。最新履歴を読み込んでから削除してください"
    );
  }
  if (!requestedEvent.updatedAt &&
    getPlantingEventContentSignature(requestedEvent) !== getPlantingEventContentSignature(existingEvent)) {
    throw new Error(
      "同じ苗植えイベントIDの別内容が保存済みです。最新履歴を読み込んでから削除してください"
    );
  }
}

function listPlantingEvents(options) {
  const normalizedOptions = normalizePlantingEventListOptions(
    typeof options === "undefined" ? {} : options
  );
  return withRecordReadLock(() => {
    const sheet = getExistingPlantingEventSheet();
    if (!sheet) return [];

    const headers = getPlantingEventHeadersForRead(sheet);
    if (!headers.length || sheet.getLastRow() < 2) return [];

    return getPlantingEventRowsForList(sheet, headers, normalizedOptions)
      .map(row => rowToPlantingEvent(headers, row));
  });
}

function listPlantingEventsForApi(options) {
  const normalizedOptions = normalizePlantingEventListOptions(
    typeof options === "undefined" ? {} : options
  );
  return withRecordReadLock(() => {
    const sheet = getExistingPlantingEventSheet();
    if (!sheet) return [];

    const headers = getPlantingEventHeadersForRead(sheet);
    if (!headers.length || sheet.getLastRow() < 2) return [];

    const events = getPlantingEventRowsForList(sheet, headers, normalizedOptions)
      .map(row => rowToPlantingEvent(headers, row));
    if (!events.length) return [];

    let compactEvents = events.map(compactPlantingEventForApi);
    let compactCharacterCount = compactEvents.reduce(
      (total, event) => total + JSON.stringify(event).length + 1,
      2
    );
    while (events.length > 1 && compactCharacterCount > PLANTING_EVENT_API_EVENT_RESPONSE_CHAR_LIMIT) {
      const removedCompactEvent = compactEvents.pop();
      events.pop();
      compactCharacterCount -= JSON.stringify(removedCompactEvent).length + 1;
    }

    if (sheet.getLastRow() - 1 > events.length) {
      const oldestEvent = events.reduce((oldest, event) => (
        comparePlantingEventOrderAscending(event, oldest) < 0 ? event : oldest
      ));
      const opening = calculatePlantingEventOpeningCarryover(
        sheet,
        headers,
        oldestEvent,
        normalizedOptions.fallbackSeedlingLossRate,
        normalizedOptions.fallbackSeedlingPattern,
        normalizedOptions.fallbackPlantingCountsByBed
      );
      if (opening.hasEarlierEvents) {
        oldestEvent.openingCarryoverBefore = opening.carryover;
      }
    }
    compactEvents = events.map(compactPlantingEventForApi);
    return compactEvents;
  });
}

function getEffectivePlantingEventUpdatedAt(event) {
  const candidates = [event && event.updatedAt, event && event.createdAt];
  for (let index = 0; index < candidates.length; index++) {
    const time = new Date(String(candidates[index] || "")).getTime();
    if (Number.isFinite(time)) return new Date(time).toISOString();
  }
  const plantingDate = parseRecordDateValue(event && event.plantingDate);
  if (plantingDate) return new Date(startOfScriptDay(plantingDate).getTime()).toISOString();
  return new Date(0).toISOString();
}

function listPlantingEventsForSync(options) {
  const normalizedOptions = normalizePlantingEventListOptions(
    typeof options === "undefined" ? {} : options
  );
  return withRecordReadLock(() => {
    const sheet = getExistingPlantingEventSheet();
    if (!sheet) {
      return { events: [], hasMore: false, nextCursor: normalizedOptions.cursor || null };
    }

    const headers = getPlantingEventHeadersForRead(sheet);
    const rowCount = sheet.getLastRow() - 1;
    if (!headers.length || rowCount <= 0) {
      return { events: [], hasMore: false, nextCursor: normalizedOptions.cursor || null };
    }

    const cursorTime = normalizedOptions.cursor
      ? new Date(normalizedOptions.cursor.updatedAt).getTime()
      : -Infinity;
    const cursorEventId = normalizedOptions.cursor ? normalizedOptions.cursor.eventId : 0;
    const rows = sheet.getRange(2, 1, rowCount, headers.length).getValues();
    const items = rows
      .map((row, index) => ({ row, rowNumber: index + 2 }))
      .filter(item => isCommittedPlantingEventRow(headers, item.row))
      .map(item => {
        const row = item.row;
        const event = rowToPlantingEvent(headers, row);
        const eventId = Number(event && event.eventId || 0);
        const updatedAt = getEffectivePlantingEventUpdatedAt(event);
        const updatedTime = new Date(updatedAt).getTime();
        if (!Number.isSafeInteger(eventId) || eventId <= 0 || !Number.isFinite(updatedTime)) {
          throw new Error("苗植えイベントの同期情報が正しくありません: 行" + item.rowNumber);
        }
        return { event, eventId, updatedAt, updatedTime, rowNumber: item.rowNumber };
      })
      .filter(item => (
        item.updatedTime > cursorTime ||
        (item.updatedTime === cursorTime && item.eventId > cursorEventId)
      ))
      .sort((left, right) => (
        left.updatedTime - right.updatedTime ||
        left.eventId - right.eventId ||
        left.rowNumber - right.rowNumber
      ));

    const limit = normalizedOptions.limit || PLANTING_EVENT_LIST_LIMIT;
    const selected = items.slice(0, limit);
    let compactEvents = selected.map(item => compactPlantingEventForApi(item.event));
    let compactCharacterCount = compactEvents.reduce(
      (total, event) => total + JSON.stringify(event).length + 1,
      2
    );
    while (selected.length > 1 && compactCharacterCount > PLANTING_EVENT_API_EVENT_RESPONSE_CHAR_LIMIT) {
      const removedCompactEvent = compactEvents.pop();
      selected.pop();
      compactCharacterCount -= JSON.stringify(removedCompactEvent).length + 1;
    }

    const last = selected[selected.length - 1];
    return {
      events: compactEvents,
      hasMore: items.length > selected.length,
      nextCursor: last
        ? { updatedAt: last.updatedAt, eventId: last.eventId }
        : (normalizedOptions.cursor || null)
    };
  });
}

function comparePlantingEventOrderAscending(left, right) {
  const leftDate = parseRecordDateValue(left && left.plantingDate);
  const rightDate = parseRecordDateValue(right && right.plantingDate);
  const leftTime = leftDate ? startOfScriptDay(leftDate).getTime() : Number.MAX_SAFE_INTEGER;
  const rightTime = rightDate ? startOfScriptDay(rightDate).getTime() : Number.MAX_SAFE_INTEGER;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return Number(left && left.eventId || 0) - Number(right && right.eventId || 0);
}

function readPlantingEventColumnValues(sheet, headers, key, rowCount) {
  const column = getPlantingEventHeaderColumn(headers, key);
  if (column <= 0) return Array(rowCount).fill("");
  return sheet.getRange(2, column, rowCount, 1).getValues().map(row => row[0]);
}

function normalizePlantingCarryoverCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(PLANTING_EVENT_SEEDLING_COUNT_LIMIT, Math.floor(number));
}

function calculatePlantingFallbackTakenCount(trayCountValue, pattern) {
  const trayCount = normalizePlantingCarryoverCount(trayCountValue);
  const safePattern = Array.isArray(pattern) && pattern.length ? pattern : [120, 120, 120];
  if (!trayCount || !safePattern.length) return 0;
  const cycleTotal = safePattern.reduce(
    (total, value) => total + normalizePlantingCarryoverCount(value),
    0
  );
  const fullCycles = Math.floor(trayCount / safePattern.length);
  const remainder = trayCount % safePattern.length;
  let total = Math.min(
    PLANTING_EVENT_SEEDLING_COUNT_LIMIT,
    fullCycles * cycleTotal
  );
  for (let index = 0; index < remainder && total < PLANTING_EVENT_SEEDLING_COUNT_LIMIT; index++) {
    total += normalizePlantingCarryoverCount(safePattern[index]);
  }
  return Math.min(PLANTING_EVENT_SEEDLING_COUNT_LIMIT, total);
}

function calculatePlantingFallbackPlantedCount(value, countsByBed) {
  let keys;
  try {
    keys = normalizeDirectPalletKeys(
      parseStoredJsonArray(value, "苗植えパレット"),
      "苗植えパレット"
    );
  } catch (error) {
    return 0;
  }
  let total = 0;
  keys.forEach(key => {
    const match = String(key || "").match(/^\d+-([A-F])-(\d+)$/);
    if (!match) return;
    const bed = match[1];
    const number = Number(match[2]);
    const count = countsByBed && Array.isArray(countsByBed[bed])
      ? countsByBed[bed][number - 1]
      : 20;
    total = Math.min(
      PLANTING_EVENT_SEEDLING_COUNT_LIMIT,
      total + normalizePlantingCarryoverCount(count)
    );
  });
  return total;
}

function calculatePlantingEventOpeningCarryover(
  sheet,
  headers,
  oldestEvent,
  fallbackSeedlingLossRate,
  fallbackSeedlingPattern,
  fallbackPlantingCountsByBed
) {
  const rowCount = Math.max(0, sheet.getLastRow() - 1);
  if (!rowCount || !oldestEvent) return { hasEarlierEvents: false, carryover: 0 };

  const valuesByKey = {};
  [
    "eventId",
    "plantingDate",
    "actualSeedlingTrayCount",
    "actualTakenSeedlingCount",
    "actualPlantedSeedlingCount",
    "actualSeedlingCarryoverMode",
    "actualSeedlingLossRate",
    "detailsUnknown",
    "updatedAt"
  ].forEach(key => {
    valuesByKey[key] = readPlantingEventColumnValues(sheet, headers, key, rowCount);
  });
  const hasUpdatedAtColumn = getPlantingEventHeaderColumn(headers, "updatedAt") > 0;

  const oldestDate = parseRecordDateValue(oldestEvent.plantingDate);
  const oldestTime = oldestDate ? startOfScriptDay(oldestDate).getTime() : Number.MAX_SAFE_INTEGER;
  const oldestEventId = Number(oldestEvent.eventId);
  const safeFallbackLossRate = Number.isFinite(Number(fallbackSeedlingLossRate))
    ? Math.max(0, Math.min(100, Number(fallbackSeedlingLossRate)))
    : 0;
  const earlierEvents = [];
  for (let index = 0; index < rowCount; index++) {
    if (hasUpdatedAtColumn && !isCommittedWriteTimestamp(valuesByKey.updatedAt[index])) continue;
    const eventDate = parseRecordDateValue(valuesByKey.plantingDate[index]);
    const eventId = Number(valuesByKey.eventId[index]);
    if (!eventDate || !Number.isSafeInteger(eventId) || eventId <= 0) continue;
    const eventTime = startOfScriptDay(eventDate).getTime();
    if (eventTime > oldestTime || (eventTime === oldestTime && eventId >= oldestEventId)) continue;
    const rawLossRate = String(valuesByKey.actualSeedlingLossRate[index] ?? "").trim();
    const parsedLossRate = Number(rawLossRate);
    const rawTakenTotal = String(valuesByKey.actualTakenSeedlingCount[index] ?? "").trim();
    const rawPlantedTotal = String(valuesByKey.actualPlantedSeedlingCount[index] ?? "").trim();
    const detailsUnknown = normalizePlantingEventDetailsUnknown(valuesByKey.detailsUnknown[index]);
    earlierEvents.push({
      eventId,
      time: eventTime,
      rowOrder: index,
      sourceRowIndex: index,
      detailsUnknown,
      takenTotal: rawTakenTotal === ""
        ? calculatePlantingFallbackTakenCount(
            valuesByKey.actualSeedlingTrayCount[index],
            fallbackSeedlingPattern
          )
        : normalizePlantingCarryoverCount(valuesByKey.actualTakenSeedlingCount[index]),
      plantedTotal: rawPlantedTotal === ""
        ? null
        : normalizePlantingCarryoverCount(valuesByKey.actualPlantedSeedlingCount[index]),
      mode: String(valuesByKey.actualSeedlingCarryoverMode[index] || "").trim() === "carryover"
        ? "carryover"
        : "loss",
      lossRate: rawLossRate === ""
        ? safeFallbackLossRate
        : Number.isFinite(parsedLossRate)
        ? Math.max(0, Math.min(100, parsedLossRate))
        : 0
    });
  }

  if (earlierEvents.some(event => event.plantedTotal === null)) {
    const plantingKeyValues = readPlantingEventColumnValues(
      sheet,
      headers,
      "plantingPalletKeys",
      rowCount
    );
    earlierEvents.forEach(event => {
      if (event.detailsUnknown) return;
      if (event.plantedTotal !== null) return;
      event.plantedTotal = calculatePlantingFallbackPlantedCount(
        plantingKeyValues[event.sourceRowIndex],
        fallbackPlantingCountsByBed
      );
    });
  }

  earlierEvents.sort((left, right) => (
    left.time - right.time || left.eventId - right.eventId || left.rowOrder - right.rowOrder
  ));
  let carryover = 0;
  earlierEvents.forEach(event => {
    if (event.detailsUnknown) return;
    const usedFromCarryover = Math.min(carryover, event.plantedTotal);
    const remainingCarryover = Math.max(0, carryover - usedFromCarryover);
    const remainingNeed = Math.max(0, event.plantedTotal - usedFromCarryover);
    const usedFromCurrent = Math.min(event.takenTotal, remainingNeed);
    if (event.mode !== "carryover") {
      carryover = 0;
      return;
    }
    const lossCount = Math.round(event.takenTotal * event.lossRate / 100);
    const currentCarryover = Math.max(0, event.takenTotal - usedFromCurrent - lossCount);
    carryover = Math.min(
      PLANTING_EVENT_SEEDLING_COUNT_LIMIT,
      Math.max(0, remainingCarryover + currentCarryover)
    );
  });
  return {
    hasEarlierEvents: earlierEvents.length > 0,
    carryover: normalizePlantingCarryoverCount(carryover)
  };
}

function compressPlantingPalletKeysToRanges(keys) {
  const numbersByGroup = new Map();
  (Array.isArray(keys) ? keys : []).forEach(key => {
    const match = String(key || "").trim().match(/^(\d+)-([A-F])-(\d+)$/);
    if (!match) return;
    const building = Number(match[1]);
    const bed = match[2];
    const number = Number(match[3]);
    if (!HARVEST_BUILDINGS.includes(building) || !HARVEST_BEDS.includes(bed) ||
      !Number.isInteger(number) || number < 1 || number > PALLETS_PER_BED) return;
    const groupKey = building + "-" + bed;
    if (!numbersByGroup.has(groupKey)) numbersByGroup.set(groupKey, new Set());
    numbersByGroup.get(groupKey).add(number);
  });

  const ranges = [];
  HARVEST_BUILDINGS.forEach(building => {
    HARVEST_BEDS.forEach(bed => {
      const numbers = Array.from(numbersByGroup.get(building + "-" + bed) || [])
        .sort((left, right) => left - right);
      if (!numbers.length) return;
      let start = numbers[0];
      let previous = numbers[0];
      for (let index = 1; index <= numbers.length; index++) {
        const current = numbers[index];
        if (current === previous + 1) {
          previous = current;
          continue;
        }
        ranges.push(building + "-" + bed + "-" + start + "-" + previous);
        start = current;
        previous = current;
      }
    });
  });
  return ranges;
}

function formatRecordedPalletSummary(keys) {
  const numbersByGroup = new Map();
  (Array.isArray(keys) ? keys : []).forEach(key => {
    const match = String(key || "").trim().match(/^(\d+)-([A-F])-(\d+)$/);
    if (!match) return;
    const building = Number(match[1]);
    const bed = match[2];
    const number = Number(match[3]);
    if (!HARVEST_BUILDINGS.includes(building) || !HARVEST_BEDS.includes(bed) ||
      !Number.isInteger(number) || number < 1 || number > PALLETS_PER_BED) return;
    const groupKey = building + "-" + bed;
    if (!numbersByGroup.has(groupKey)) numbersByGroup.set(groupKey, []);
    numbersByGroup.get(groupKey).push(number);
  });

  const parts = [];
  HARVEST_BUILDINGS.forEach(building => {
    HARVEST_BEDS.forEach(bed => {
      const numbers = numbersByGroup.get(building + "-" + bed);
      if (numbers && numbers.length) {
        parts.push(building + "号棟" + bed + ":" + formatRecordedPalletNumberRanges(numbers));
      }
    });
  });
  return parts.join("\n");
}

function formatRecordedPalletNumberRanges(numbers) {
  const normalizedNumbers = Array.from(new Set(Array.isArray(numbers) ? numbers : []))
    .map(Number)
    .filter(number => Number.isInteger(number) && number >= 1 && number <= PALLETS_PER_BED)
    .sort((left, right) => left - right);
  const parts = [];
  const numbersInRegularRanges = new Set();

  // 1ずつ続く通常の範囲を優先し、従来どおり「開始-終了」で表示する。
  let regularStartIndex = 0;
  for (let index = 1; index <= normalizedNumbers.length; index++) {
    if (index < normalizedNumbers.length &&
      normalizedNumbers[index] === normalizedNumbers[index - 1] + 1) {
      continue;
    }
    if (index - regularStartIndex >= 2) {
      const start = normalizedNumbers[regularStartIndex];
      const end = normalizedNumbers[index - 1];
      parts.push({ start, text: start + "-" + end });
      for (let itemIndex = regularStartIndex; itemIndex < index; itemIndex++) {
        numbersInRegularRanges.add(normalizedNumbers[itemIndex]);
      }
    }
    regularStartIndex = index;
  }

  [
    { label: "左", parity: 1 },
    { label: "右", parity: 0 }
  ].forEach(side => {
    const sideNumbers = normalizedNumbers.filter(number => (
      !numbersInRegularRanges.has(number) && number % 2 === side.parity
    ));
    if (!sideNumbers.length) return;
    let start = sideNumbers[0];
    let previous = sideNumbers[0];

    for (let index = 1; index <= sideNumbers.length; index++) {
      const current = sideNumbers[index];
      if (current === previous + 2) {
        previous = current;
        continue;
      }
      parts.push({
        start,
        text: start === previous ? String(start) : side.label + "(" + start + "-" + previous + ")"
      });
      start = current;
      previous = current;
    }
  });

  return parts
    .sort((left, right) => left.start - right.start)
    .map(part => part.text)
    .join(",");
}

function getHarvestRecordPalletKeysForPlantingSource(record) {
  return normalizeDirectPalletKeys(
    parseStoredJsonArray(record && record.palletKeys, "収穫記録のパレット"),
    "収穫記録のパレット"
  );
}

function compactPlantingEventForApi(event) {
  const compactEvent = {
    ...event,
    sourceAllocations: event.sourceAllocations.map(allocation => ({
      harvestRecordId: allocation.harvestRecordId,
      palletRanges: compressPlantingPalletKeysToRanges(allocation.palletKeys)
    }))
  };
  delete compactEvent.plantingPalletKeys;
  return compactEvent;
}

function deletePlantingEvent(event) {
  const normalizedEvent = normalizePlantingEvent(event);
  return withRecordWriteLock(() => {
    const sheet = getPlantingEventSheet();
    const headers = ensurePlantingEventHeaders(sheet);
    const trashSheet = getPlantingEventTrashSheet();
    ensurePlantingEventTrashSheet(trashSheet);
    purgeExpiredPlantingEventTrash(trashSheet);
    const affectedHarvestRecordIds = getHarvestRecordIdsFromPlantingEvent(normalizedEvent);

    const existingTrashRow = findPlantingEventTrashRowById(trashSheet, normalizedEvent.eventId);
    const rowNumber = findPlantingEventRowById(
      sheet,
      headers,
      normalizedEvent.eventId,
      true
    );
    let sourceRow = null;
    if (rowNumber > 0) {
      sourceRow = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
      const writeMarker = getPlantingWriteMarker(headers, sourceRow);
      if (writeMarker) {
        if (!plantingWriteMarkerMatchesRequest(writeMarker, normalizedEvent, "any")) {
          throw new Error(
            "同じ苗植えイベントIDで別内容の未完了送信があります。データ保護のため削除しません"
          );
        }
        const createdAtColumn = getPlantingEventHeaderColumn(headers, "createdAt");
        const storedCreatedAt = createdAtColumn > 0
          ? formatPlantingEventTimestamp(sourceRow[createdAtColumn - 1])
          : "";
        const eventToBackup = {
          ...normalizedEvent,
          createdAt: storedCreatedAt || normalizedEvent.createdAt || new Date().toISOString(),
          updatedAt: getNextPlantingEventUpdatedAt(
            writeMarker.baseUpdatedAt || normalizedEvent.updatedAt
          )
        };
        let deletedAt;
        let expiresAt;
        if (existingTrashRow > 0) {
          const savedTrashValues = trashSheet
            .getRange(existingTrashRow, 1, 1, PLANTING_EVENT_TRASH_HEADERS.length)
            .getValues()[0];
          deletedAt = new Date(savedTrashValues[PLANTING_EVENT_HEADERS.length] || new Date());
          expiresAt = new Date(
            savedTrashValues[PLANTING_EVENT_HEADERS.length + 1] ||
            (deletedAt.getTime() + RECORD_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000)
          );
        } else {
          deletedAt = new Date();
          expiresAt = new Date(
            deletedAt.getTime() + RECORD_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000
          );
          trashSheet.appendRow(
            buildPlantingEventRow(PLANTING_EVENT_HEADERS, eventToBackup)
              .concat([deletedAt, expiresAt])
          );
        }
        rememberDeletedPlantingEventId(normalizedEvent.eventId, deletedAt);
        SpreadsheetApp.flush();
        sheet.deleteRow(rowNumber);
        syncRecordSheetPlantingLocationSummaries(affectedHarvestRecordIds);
        return {
          deleted: true,
          alreadyDeleted: existingTrashRow > 0,
          notFound: false,
          recoveredIncompleteWrite: true,
          deletedAt: deletedAt.toISOString(),
          expiresAt: expiresAt.toISOString()
        };
      }
      if (!isCommittedPlantingEventRow(headers, sourceRow)) {
        throw new Error(
          "同じ苗植えイベントIDの署名がない未完了行があります。データ保護のため削除しません"
        );
      }
      const existingEvent = rowToPlantingEvent(headers, sourceRow);
      assertPlantingEventDeleteIsCurrent(normalizedEvent, existingEvent);
    }
    if (existingTrashRow > 0) {
      rememberDeletedPlantingEventId(normalizedEvent.eventId);
      if (rowNumber > 0) sheet.deleteRow(rowNumber);
      syncRecordSheetPlantingLocationSummaries(affectedHarvestRecordIds);
      return { deleted: true, alreadyDeleted: true, notFound: false };
    }
    if (rowNumber <= 0) {
      rememberDeletedPlantingEventId(normalizedEvent.eventId);
      syncRecordSheetPlantingLocationSummaries(affectedHarvestRecordIds);
      return { deleted: false, alreadyDeleted: false, notFound: true };
    }

    const row = remapPlantingEventRow(headers, sourceRow, PLANTING_EVENT_HEADERS);
    const safeRow = row.map((value, index) => (
      PLANTING_EVENT_FORMULA_SAFE_KEYS.has(getPlantingEventHeaderKey(PLANTING_EVENT_HEADERS[index]))
        ? escapeSpreadsheetFormulaText(value)
        : value
    ));
    const deletedAt = new Date();
    const expiresAt = new Date(
      deletedAt.getTime() + RECORD_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000
    );
    trashSheet.appendRow(safeRow.concat([deletedAt, expiresAt]));
    rememberDeletedPlantingEventId(normalizedEvent.eventId, deletedAt);
    SpreadsheetApp.flush();
    sheet.deleteRow(rowNumber);
    syncRecordSheetPlantingLocationSummaries(affectedHarvestRecordIds);
    return {
      deleted: true,
      alreadyDeleted: false,
      notFound: false,
      deletedAt: deletedAt.toISOString(),
      expiresAt: expiresAt.toISOString()
    };
  });
}

function restorePlantingEvent(event) {
  const normalizedEvent = normalizePlantingEvent(event);
  return withRecordWriteLock(() => {
    const sheet = getPlantingEventSheet();
    const headers = ensurePlantingEventHeaders(sheet);
    const trashSheet = getPlantingEventTrashSheet();
    ensurePlantingEventTrashSheet(trashSheet);
    purgeExpiredPlantingEventTrash(trashSheet);

    const existingRow = findPlantingEventRowById(
      sheet,
      headers,
      normalizedEvent.eventId,
      true
    );
    const trashRow = findPlantingEventTrashRowById(trashSheet, normalizedEvent.eventId);
    const existingSourceRow = existingRow > 0
      ? sheet.getRange(existingRow, 1, 1, headers.length).getValues()[0]
      : null;
    const incompleteMarker = existingSourceRow
      ? getPlantingWriteMarker(headers, existingSourceRow)
      : null;
    if (incompleteMarker &&
      !plantingWriteMarkerMatchesRequest(incompleteMarker, normalizedEvent, "restore")) {
      throw new Error(
        "同じ苗植えイベントIDで復元とは異なる未完了送信があります。データ保護のため上書きしません"
      );
    }
    let eventToRestore = normalizedEvent;
    if (trashRow > 0) {
      const row = trashSheet
        .getRange(trashRow, 1, 1, PLANTING_EVENT_HEADERS.length)
        .getValues()[0];
      eventToRestore = rowToPlantingEvent(PLANTING_EVENT_HEADERS, row);
      eventToRestore = {
        ...eventToRestore,
        updatedAt: getNextPlantingEventUpdatedAt(eventToRestore.updatedAt)
      };
    } else if (existingRow > 0) {
      if (incompleteMarker) {
        eventToRestore = {
          ...normalizedEvent,
          createdAt: normalizedEvent.createdAt || new Date().toISOString(),
          updatedAt: getNextPlantingEventUpdatedAt(
            incompleteMarker.baseUpdatedAt || normalizedEvent.updatedAt
          )
        };
      } else if (!isCommittedPlantingEventRow(headers, existingSourceRow)) {
        throw new Error("同じ苗植えイベントIDの未完了行があるため復元できません。先に記録を再送してください");
      } else {
        eventToRestore = rowToPlantingEvent(headers, existingSourceRow);
      }
    }

    assertPlantingEventSourcesExist(eventToRestore);
    assertPlantingEventAllocationsAvailable(eventToRestore, sheet, headers);
    const affectedHarvestRecordIds = getHarvestRecordIdsFromPlantingEvent(eventToRestore);

    if (existingRow > 0) {
      if (trashRow > 0) {
        writePlantingEventRow(
          sheet,
          existingRow,
          headers,
          eventToRestore,
          normalizedEvent,
          "restore"
        );
        SpreadsheetApp.flush();
        trashSheet.deleteRow(trashRow);
      } else if (incompleteMarker) {
        writePlantingEventRow(
          sheet,
          existingRow,
          headers,
          eventToRestore,
          normalizedEvent,
          "restore"
        );
        SpreadsheetApp.flush();
      }
      forgetDeletedPlantingEventId(normalizedEvent.eventId);
      syncRecordSheetPlantingLocationSummaries(affectedHarvestRecordIds);
      return {
        restored: true,
        alreadyRestored: !incompleteMarker && trashRow <= 0,
        recovered: !!incompleteMarker,
        event: eventToRestore
      };
    }

    if (trashRow > 0) {
      appendPlantingEventRow(
        sheet,
        headers,
        eventToRestore,
        normalizedEvent,
        "restore"
      );
      SpreadsheetApp.flush();
      trashSheet.deleteRow(trashRow);
      forgetDeletedPlantingEventId(normalizedEvent.eventId);
      syncRecordSheetPlantingLocationSummaries(affectedHarvestRecordIds);
      return {
        restored: true,
        alreadyRestored: false,
        event: eventToRestore
      };
    }

    const now = new Date().toISOString();
    eventToRestore = {
      ...eventToRestore,
      createdAt: eventToRestore.createdAt || now,
      updatedAt: now
    };
    appendPlantingEventRow(
      sheet,
      headers,
      eventToRestore,
      normalizedEvent,
      "restore"
    );
    forgetDeletedPlantingEventId(normalizedEvent.eventId);
    syncRecordSheetPlantingLocationSummaries(affectedHarvestRecordIds);
    return {
      restored: true,
      alreadyRestored: false,
      restoredFromAppBackup: true,
      event: eventToRestore
    };
  });
}

function getNextPlantingEventUpdatedAt(previousValue) {
  const previousTime = new Date(String(previousValue || "")).getTime();
  const now = Date.now();
  const nextTime = Number.isFinite(previousTime) && previousTime >= now
    ? previousTime + 1
    : now;
  return new Date(nextTime).toISOString();
}

function assertPlantingEventSourcesExist(event) {
  const recordSheet = getExistingRecordSheet();
  if (!recordSheet) throw new Error("収穫記録シートがないため苗植えイベントを保存できません");
  const recordHeaders = getRecordHeadersForRead(recordSheet);
  if (!recordHeaders.length || recordSheet.getLastRow() < 2) {
    throw new Error("苗植えイベントに対応する収穫記録がありません");
  }

  const recordRows = buildHarvestRecordRowLookup(recordSheet, recordHeaders);
  const recordsById = new Map();
  event.sourceAllocations.forEach(allocation => {
    const id = String(allocation.harvestRecordId);
    const rowNumber = recordRows.byId.get(id);
    if (!rowNumber) {
      throw new Error("収穫記録ID " + allocation.harvestRecordId + " が見つかりません");
    }
    recordsById.set(id, getHarvestRecordAtRow(recordSheet, rowNumber, recordHeaders));
  });

  event.sourceAllocations.forEach(allocation => {
    const record = recordsById.get(String(allocation.harvestRecordId));
    if (!record) {
      throw new Error("収穫記録ID " + allocation.harvestRecordId + " が見つかりません");
    }
    if (String(record.type || "").trim() !== "fullHarvest") {
      throw new Error("先取り収穫には苗植えイベントを割り当てられません");
    }
    const harvestKeys = getHarvestRecordPalletKeysForPlantingSource(record);
    const harvestKeySet = new Set(harvestKeys);
    const invalidKey = allocation.palletKeys.find(key => !harvestKeySet.has(key));
    if (invalidKey) {
      throw new Error(
        "収穫記録ID " + allocation.harvestRecordId + " に含まれないパレットが割り当てられています: " + invalidKey
      );
    }
  });
}

function getPlantingEventAllocatedKeysForHarvestRecord(harvestRecordId) {
  return buildPlantingEventAllocatedKeysByHarvestRecord().get(Number(harvestRecordId)) || new Set();
}

function buildPlantingEventAllocatedKeysByHarvestRecord(options) {
  const normalizedOptions = options && typeof options === "object" ? options : {};
  const targetIds = normalizedOptions.targetHarvestRecordIds
    ? new Set(
        Array.from(normalizedOptions.targetHarvestRecordIds)
          .map(Number)
          .filter(id => Number.isSafeInteger(id) && id > 0)
      )
    : null;
  const excludeEventId = Number(normalizedOptions.excludeEventId);
  const sheet = getExistingPlantingEventSheet();
  const allocatedByHarvestRecord = new Map();
  if (!sheet || sheet.getLastRow() < 2) return allocatedByHarvestRecord;
  const headers = getPlantingEventHeadersForRead(sheet);
  if (!headers.length) return allocatedByHarvestRecord;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  rows.forEach(row => {
    if (!isCommittedPlantingEventRow(headers, row)) return;
    const event = rowToPlantingEvent(headers, row);
    if (Number.isSafeInteger(excludeEventId) && Number(event.eventId) === excludeEventId) return;
    event.sourceAllocations.forEach(allocation => {
      const harvestRecordId = Number(allocation.harvestRecordId);
      if (targetIds && !targetIds.has(harvestRecordId)) return;
      if (!allocatedByHarvestRecord.has(harvestRecordId)) {
        allocatedByHarvestRecord.set(harvestRecordId, new Set());
      }
      allocation.palletKeys.forEach(key => allocatedByHarvestRecord.get(harvestRecordId).add(key));
    });
  });
  return allocatedByHarvestRecord;
}

function getHarvestRecordIdsFromPlantingEvent(event) {
  const ids = new Set();
  (event && Array.isArray(event.sourceAllocations) ? event.sourceAllocations : [])
    .forEach(allocation => {
      const id = Number(allocation && allocation.harvestRecordId);
      if (Number.isSafeInteger(id) && id > 0) ids.add(id);
    });
  return ids;
}

function applyPlantingLocationSummaryToHarvestRecord(record, allocatedKeysByHarvestRecord) {
  if (!record || record.type !== "fullHarvest" || !allocatedKeysByHarvestRecord) return record;
  const allocatedKeys = allocatedKeysByHarvestRecord.get(Number(record.id));
  if (!allocatedKeys) return record;
  return {
    ...record,
    plantingSummary: formatRecordedPalletSummary(Array.from(allocatedKeys))
  };
}

function syncRecordSheetPlantingLocationSummaries(harvestRecordIds) {
  const targetIds = new Set(
    Array.from(harvestRecordIds || [])
      .map(Number)
      .filter(id => Number.isSafeInteger(id) && id > 0)
  );

  if (!targetIds.size) return 0;
  // 直前の苗植えイベント追加・削除を確定させてから正本を再集計する。
  SpreadsheetApp.flush();
  const allocatedKeysByHarvestRecord = buildPlantingEventAllocatedKeysByHarvestRecord({
    targetHarvestRecordIds: targetIds
  });
  const recordSheet = getExistingRecordSheet();
  if (!recordSheet) throw new Error("苗植え場所を反映する記録シートがありません");
  const recordHeaders = getRecordHeadersForRead(recordSheet);
  const summaryColumn = getHeaderColumn(recordHeaders, "plantingSummary");
  if (summaryColumn <= 0) throw new Error("記録シートに苗植え場所列がありません");
  const recordRows = buildHarvestRecordRowLookup(recordSheet, recordHeaders);
  let changed = 0;

  targetIds.forEach(id => {
    const rowNumber = recordRows.byId.get(String(id));
    if (!rowNumber) {
      throw new Error("苗植え場所を反映する収穫記録ID " + id + " が見つかりません");
    }
    const keys = Array.from(allocatedKeysByHarvestRecord.get(id) || []);
    const nextSummary = formatRecordedPalletSummary(keys);
    const currentSummary = String(recordSheet.getRange(rowNumber, summaryColumn).getValue() || "")
      .replace(/^'(?=[=+\-@])/, "");
    if (currentSummary === nextSummary) return;
    setHarvestRecordColumnValuesWithValidationRecovery(
      recordSheet,
      rowNumber,
      summaryColumn,
      [[escapeSpreadsheetFormulaText(nextSummary)]],
      HEADER_LABELS.plantingSummary,
      "苗植え場所の反映"
    );
    requestScopedChangedHarvestRecordIds.add(id);
    changed++;
  });
  return changed;
}

function assertHarvestRecordSupportsPlantingEvents(record, allocatedKeysByHarvestRecord) {
  const allocationMap = allocatedKeysByHarvestRecord || buildPlantingEventAllocatedKeysByHarvestRecord();
  const harvestRecordId = Number(record.id);
  const allocatedKeys = allocationMap.get(harvestRecordId) || new Set();
  if (!allocationMap.has(harvestRecordId)) return;
  if (record.type !== "fullHarvest") {
    throw new Error("苗植えイベントで使用中の収穫記録は先取り収穫へ変更できません");
  }
  const harvestKeys = new Set(getHarvestRecordPalletKeysForPlantingSource(record));
  const missingKey = Array.from(allocatedKeys).find(key => !harvestKeys.has(key));
  if (missingKey) {
    throw new Error("苗植えイベントで使用中のパレットは収穫記録から削除できません: " + missingKey);
  }
}

function assertHarvestRecordHasNoPlantingEvents(harvestRecordId) {
  if (buildPlantingEventAllocatedKeysByHarvestRecord().has(Number(harvestRecordId))) {
    throw new Error("この収穫記録を使った苗植えイベントがあります。先に苗植えイベントを削除してください");
  }
}

function assertPlantingEventAllocationsAvailable(event, sheet, headers) {
  if (!sheet || sheet.getLastRow() < 2) return;
  const occupied = new Set();
  const eventIdIndex = headers.findIndex(
    header => getPlantingEventHeaderKey(header) === "eventId"
  );
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  rows.forEach(row => {
    if (!isCommittedPlantingEventRow(headers, row)) return;
    // 過去の送信失敗でIDだけ書かれた自分の部分行があっても、
    // JSONの読み取りより先に除外し、後段で完全な行に上書きできるようにする。
    if (eventIdIndex >= 0 && Number(row[eventIdIndex]) === Number(event.eventId)) return;
    const existingEvent = rowToPlantingEvent(headers, row);
    existingEvent.sourceAllocations.forEach(allocation => {
      allocation.palletKeys.forEach(key => {
        occupied.add(String(allocation.harvestRecordId) + "|" + key);
      });
    });
  });

  event.sourceAllocations.forEach(allocation => {
    const duplicateKey = allocation.palletKeys.find(key => (
      occupied.has(String(allocation.harvestRecordId) + "|" + key)
    ));
    if (duplicateKey) {
      throw new Error(
        "収穫記録ID " + allocation.harvestRecordId + " のパレット " + duplicateKey + " は別の苗植えイベントで記録済みです"
      );
    }
  });
}
