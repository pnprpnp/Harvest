function validateHarvestRecordInboxSheetHeaders(sheet, expectedHeaders, label) {
  if (!sheet) throw new Error(label + "がありません");
  if (sheet.getMaxColumns() < expectedHeaders.length) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      expectedHeaders.length - sheet.getMaxColumns()
    );
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, expectedHeaders.length).setFontWeight("bold");
    sheet.hideSheet();
    return;
  }
  const actual = sheet
    .getRange(1, 1, 1, expectedHeaders.length)
    .getValues()[0]
    .map(value => String(value || "").trim());
  if (actual.length !== expectedHeaders.length || actual.some(
    (value, index) => value !== expectedHeaders[index]
  )) {
    throw new Error(label + "の見出しが現在の形式と異なります");
  }
}

function ensureHarvestRecordInboxSheet() {
  const spreadsheet = getSpreadsheet();
  let sheet = spreadsheet.getSheetByName(HARVEST_RECORD_INBOX_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(HARVEST_RECORD_INBOX_SHEET_NAME);
  validateHarvestRecordInboxSheetHeaders(
    sheet,
    HARVEST_RECORD_INBOX_HEADERS,
    HARVEST_RECORD_INBOX_SHEET_NAME
  );
  return sheet;
}

function ensureHarvestRecordInboxHeadSheet() {
  const spreadsheet = getSpreadsheet();
  let sheet = spreadsheet.getSheetByName(HARVEST_RECORD_INBOX_HEAD_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(HARVEST_RECORD_INBOX_HEAD_SHEET_NAME);
  validateHarvestRecordInboxSheetHeaders(
    sheet,
    HARVEST_RECORD_INBOX_HEAD_HEADERS,
    HARVEST_RECORD_INBOX_HEAD_SHEET_NAME
  );
  return sheet;
}

function getHarvestRecordInboxPayloadChunks(serialized) {
  const text = String(serialized || "");
  const chunks = [];
  for (
    let offset = 0;
    offset < text.length;
    offset += HARVEST_RECORD_INBOX_PAYLOAD_CHUNK_CHARACTERS
  ) {
    chunks.push("!" + text.slice(
      offset,
      offset + HARVEST_RECORD_INBOX_PAYLOAD_CHUNK_CHARACTERS
    ));
  }
  if (chunks.length > HARVEST_RECORD_INBOX_PAYLOAD_CHUNK_COUNT) {
    throw new Error("記録受信箱へ保存できる大きさを超えています");
  }
  while (chunks.length < HARVEST_RECORD_INBOX_PAYLOAD_CHUNK_COUNT) chunks.push("!");
  return chunks;
}

function decodeHarvestRecordInboxPayloadChunk(value) {
  const text = String(value || "");
  // 「!」はスプレッドシートへ文字列として保存するためのマーカーです。
  // 初期試験版で保存したマーカーなしの行も、そのまま読み込めます。
  return text.charAt(0) === "!" ? text.slice(1) : text;
}

function normalizeHarvestRecordInboxDate(value) {
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Number.isFinite(value.getTime()) ? value : null;
  }
  const date = new Date(String(value || ""));
  return Number.isFinite(date.getTime()) ? date : null;
}

function findHarvestRecordInboxRow(sheet, batchId) {
  const normalizedId = normalizeHarvestDayBatchId(batchId);
  if (!sheet || !normalizedId || sheet.getLastRow() < 2) return 0;
  const match = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(normalizedId)
    .matchEntireCell(true)
    .findNext();
  return match ? match.getRow() : 0;
}

function readHarvestRecordInboxMetadataAtRow(sheet, rowNumber) {
  if (!sheet || !Number.isSafeInteger(rowNumber) || rowNumber < 2) return null;
  const row = sheet
    .getRange(rowNumber, 1, 1, 10)
    .getValues()[0];
  return {
    rowNumber,
    batchId: String(row[0] || "").trim(),
    fingerprint: String(row[1] || "").trim(),
    status: String(row[2] || "").trim(),
    acceptedAt: normalizeHarvestRecordInboxDate(row[3]),
    processingStartedAt: normalizeHarvestRecordInboxDate(row[4]),
    processedAt: normalizeHarvestRecordInboxDate(row[5]),
    attemptCount: Math.max(0, Math.trunc(Number(row[6]) || 0)),
    nextAttemptAt: normalizeHarvestRecordInboxDate(row[7]),
    errorMessage: String(row[8] || "").trim(),
    resultJson: String(row[9] || "").trim()
  };
}

function readHarvestRecordInboxPayloadAtRow(sheet, rowNumber) {
  if (!sheet || !Number.isSafeInteger(rowNumber) || rowNumber < 2) return null;
  const payloadText = sheet
    .getRange(rowNumber, 11, 1, HARVEST_RECORD_INBOX_PAYLOAD_CHUNK_COUNT)
    .getValues()[0]
    .map(decodeHarvestRecordInboxPayloadChunk)
    .join("");
  try {
    return payloadText ? JSON.parse(payloadText) : null;
  } catch (err) {
    throw new Error("記録受信箱の内容を読み込めません");
  }
}

function readHarvestRecordInboxEntryAtRow(sheet, rowNumber) {
  const entry = readHarvestRecordInboxMetadataAtRow(sheet, rowNumber);
  if (!entry) return null;
  entry.payload = readHarvestRecordInboxPayloadAtRow(sheet, rowNumber);
  return entry;
}

function readHarvestRecordInboxStatusEntryAtRow(sheet, rowNumber) {
  const entry = readHarvestRecordInboxMetadataAtRow(sheet, rowNumber);
  if (!entry) return null;
  if (entry.status === HARVEST_RECORD_INBOX_STATUSES.completed) {
    entry.payload = readHarvestRecordInboxPayloadAtRow(sheet, rowNumber);
  }
  return entry;
}

function getHarvestRecordInboxEntry(sheet, batchId) {
  const rowNumber = findHarvestRecordInboxRow(sheet, batchId);
  return rowNumber ? readHarvestRecordInboxEntryAtRow(sheet, rowNumber) : null;
}

function getHarvestRecordInboxStatusEntry(sheet, batchId) {
  const rowNumber = findHarvestRecordInboxRow(sheet, batchId);
  return rowNumber ? readHarvestRecordInboxStatusEntryAtRow(sheet, rowNumber) : null;
}

function validateHarvestRecordInboxPayload(records, plantingEvents, batchId) {
  const normalizedId = normalizeHarvestDayBatchId(batchId);
  if (!normalizedId) throw new Error("受信箱の受付IDが正しくありません");
  if (!Array.isArray(records) || !Array.isArray(plantingEvents)) {
    throw new Error("受信箱へ送る記録が正しくありません");
  }
  const itemCount = records.length + plantingEvents.length;
  if (itemCount < 1 || records.length > API_BATCH_RECORD_LIMIT ||
    itemCount > API_DAY_BATCH_ITEM_LIMIT) {
    throw new Error("受信箱へ送れる記録は" + API_DAY_BATCH_ITEM_LIMIT + "件までです");
  }
  records.forEach(record => normalizeHarvestRecord(record));
  plantingEvents.forEach(event => normalizePlantingEvent(event));
  return normalizedId;
}

function buildHarvestRecordInboxStatus(entry) {
  if (!entry) {
    return {
      accepted: false,
      processed: false,
      queueStatus: "missing",
      message: "受信した記録が見つかりません"
    };
  }
  const response = {
    accepted: true,
    processed: entry.status === HARVEST_RECORD_INBOX_STATUSES.completed,
    queueStatus: entry.status,
    batchId: entry.batchId,
    acceptedAt: entry.acceptedAt ? entry.acceptedAt.toISOString() : "",
    processedAt: entry.processedAt ? entry.processedAt.toISOString() : "",
    attemptCount: entry.attemptCount
  };
  if (entry.status === HARVEST_RECORD_INBOX_STATUSES.failed) {
    response.failed = true;
    response.message = entry.errorMessage || "スプレッドシート本体へ反映できませんでした";
    return response;
  }
  if (entry.status !== HARVEST_RECORD_INBOX_STATUSES.completed) return response;
  try {
    const receipt = JSON.parse(entry.resultJson || "null");
    const payload = entry.payload || {};
    const result = buildHarvestDayBatchStatusFromReceipt(
      receipt,
      Array.isArray(payload.records) ? payload.records : [],
      Array.isArray(payload.plantingEvents) ? payload.plantingEvents : []
    );
    if (!result) throw new Error("処理結果を復元できません");
    return { ...response, ...result };
  } catch (err) {
    return {
      ...response,
      processed: false,
      failed: true,
      queueStatus: HARVEST_RECORD_INBOX_STATUSES.failed,
      message: "受信箱の処理結果を確認できません"
    };
  }
}

function compactHarvestRecordInboxApiResult(result) {
  const source = result && typeof result === "object" ? result : {};
  return {
    ...source,
    recordResults: Array.isArray(source.recordResults)
      ? source.recordResults.map(item => ({
          ...item,
          record: item && item.record ? compactHarvestRecordForApi(item.record) : null
        }))
      : undefined,
    plantingResults: Array.isArray(source.plantingResults)
      ? source.plantingResults.map(item => ({
          ...item,
          event: item && item.event ? compactPlantingEventForApi(item.event) : null
        }))
      : undefined
  };
}

function enqueueHarvestDayBatch(records, plantingEvents, batchId, syncRevision) {
  const normalizedId = validateHarvestRecordInboxPayload(records, plantingEvents, batchId);
  const fingerprint = getHarvestDayBatchRequestFingerprint(records, plantingEvents);
  const serializedPayload = JSON.stringify({
    version: 1,
    batchId: normalizedId,
    syncRevision: Number.isSafeInteger(Number(syncRevision)) ? Number(syncRevision) : null,
    records,
    plantingEvents
  });
  const chunks = getHarvestRecordInboxPayloadChunks(serializedPayload);
  // Webアプリを複数端末から同時に使っても、同じ受付IDを重複追加しないよう
  // ユーザー単位ではなくスクリプト全体で排他します。
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("受信箱が混み合っています。自動で再送します");
  try {
    const sheet = ensureHarvestRecordInboxSheet();
    const existing = getHarvestRecordInboxStatusEntry(sheet, normalizedId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new Error("同じ受付IDで異なる記録が送信されています");
      }
      if ([
        HARVEST_RECORD_INBOX_STATUSES.queued,
        HARVEST_RECORD_INBOX_STATUSES.processing
      ].includes(existing.status)) {
        ensureHarvestRecordInboxTriggerInstalledUnlocked();
      }
      return buildHarvestRecordInboxStatus(existing);
    }
    const acceptedAt = new Date();
    sheet.appendRow([
      normalizedId,
      fingerprint,
      HARVEST_RECORD_INBOX_STATUSES.queued,
      acceptedAt,
      "",
      "",
      0,
      acceptedAt,
      "",
      "",
      ...chunks
    ]);
    SpreadsheetApp.flush();
    ensureHarvestRecordInboxTriggerInstalledUnlocked();
    return {
      accepted: true,
      processed: false,
      queueStatus: HARVEST_RECORD_INBOX_STATUSES.queued,
      batchId: normalizedId,
      acceptedAt: acceptedAt.toISOString(),
      attemptCount: 0
    };
  } finally {
    lock.releaseLock();
  }
}

function getHarvestDayBatchInboxStatus(batchId) {
  const normalizedId = normalizeHarvestDayBatchId(batchId);
  if (!normalizedId) throw new Error("受信箱の受付IDが正しくありません");
  const sheet = getSpreadsheet().getSheetByName(HARVEST_RECORD_INBOX_SHEET_NAME);
  if (!sheet) return buildHarvestRecordInboxStatus(null);
  const entry = getHarvestRecordInboxStatusEntry(sheet, normalizedId);
  if (shouldRecoverHarvestRecordInboxTrigger(entry)) {
    ensureHarvestRecordInboxTriggerInstalled();
  }
  return buildHarvestRecordInboxStatus(entry);
}

function shouldRecoverHarvestRecordInboxTrigger(entry, now = Date.now()) {
  if (!entry) return false;
  if (entry.status === HARVEST_RECORD_INBOX_STATUSES.queued) {
    const dueAt = entry.nextAttemptAt || entry.acceptedAt;
    return !dueAt || now - dueAt.getTime() >= HARVEST_RECORD_INBOX_TRIGGER_RECOVERY_DELAY_MS;
  }
  if (entry.status === HARVEST_RECORD_INBOX_STATUSES.processing) {
    return !entry.processingStartedAt ||
      now - entry.processingStartedAt.getTime() >= HARVEST_RECORD_INBOX_PROCESSING_LEASE_MS;
  }
  return false;
}

function getHarvestRecordInboxHeadKeyForRecord(record) {
  const uuid = String(record && record.recordUuid || "").trim().toLowerCase();
  return uuid ? "record:" + uuid : "";
}

function getHarvestRecordInboxHeadKeyForPlantingEvent(event) {
  const eventId = Number(event && event.eventId);
  return Number.isSafeInteger(eventId) && eventId > 0 ? "planting:" + eventId : "";
}

function loadHarvestRecordInboxHeads(keys) {
  const requested = new Set(Array.isArray(keys) ? keys.filter(Boolean) : []);
  const result = new Map();
  if (!requested.size) return result;
  const sheet = ensureHarvestRecordInboxHeadSheet();
  if (sheet.getLastRow() < 2) return result;
  const rows = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, HARVEST_RECORD_INBOX_HEAD_HEADERS.length)
    .getValues();
  for (let index = rows.length - 1; index >= 0 && result.size < requested.size; index--) {
    const row = rows[index];
    const key = String(row[0] || "").trim();
    if (!requested.has(key) || result.has(key)) continue;
    result.set(key, {
      canonicalId: Number(row[1]),
      updatedAt: normalizeWriteTimestampToken(row[2]),
      batchId: String(row[3] || "").trim(),
      acceptedAt: normalizeHarvestRecordInboxDate(row[4])
    });
  }
  return result;
}

function applyHarvestRecordInboxBaseVersions(payload, acceptedAt) {
  const source = payload || {};
  const records = (Array.isArray(source.records) ? source.records : []).map(record => ({ ...record }));
  const plantingEvents = (Array.isArray(source.plantingEvents) ? source.plantingEvents : []).map(event => ({
    ...event,
    sourceAllocations: Array.isArray(event && event.sourceAllocations)
      ? event.sourceAllocations.map(allocation => ({
          ...allocation,
          palletKeys: Array.isArray(allocation && allocation.palletKeys)
            ? [...allocation.palletKeys]
            : []
        }))
      : []
  }));
  const keys = records.map(getHarvestRecordInboxHeadKeyForRecord)
    .concat(plantingEvents.map(getHarvestRecordInboxHeadKeyForPlantingEvent))
    .filter(Boolean);
  const heads = loadHarvestRecordInboxHeads(keys);
  const acceptedTime = acceptedAt ? acceptedAt.getTime() : 0;
  const canUseHead = head => head && head.updatedAt && head.acceptedAt &&
    (!acceptedTime || head.acceptedAt.getTime() <= acceptedTime);
  records.forEach(record => {
    const head = heads.get(getHarvestRecordInboxHeadKeyForRecord(record));
    if (!canUseHead(head)) return;
    record.updatedAt = head.updatedAt;
  });
  plantingEvents.forEach(event => {
    const head = heads.get(getHarvestRecordInboxHeadKeyForPlantingEvent(event));
    if (!canUseHead(head)) return;
    event.updatedAt = head.updatedAt;
  });
  return { records, plantingEvents };
}

function appendHarvestRecordInboxHeads(batchId, acceptedAt, result) {
  const rows = [];
  (Array.isArray(result && result.recordResults) ? result.recordResults : []).forEach(item => {
    if (!item || item.ok !== true || !item.record) return;
    const key = getHarvestRecordInboxHeadKeyForRecord(item.record);
    if (!key) return;
    rows.push([
      key,
      Number(item.record.id) || "",
      normalizeWriteTimestampToken(item.record.updatedAt),
      batchId,
      acceptedAt || new Date()
    ]);
  });
  (Array.isArray(result && result.plantingResults) ? result.plantingResults : []).forEach(item => {
    if (!item || item.ok !== true || !item.event) return;
    const key = getHarvestRecordInboxHeadKeyForPlantingEvent(item.event);
    if (!key) return;
    rows.push([
      key,
      Number(item.event.eventId) || "",
      normalizeWriteTimestampToken(item.event.updatedAt),
      batchId,
      acceptedAt || new Date()
    ]);
  });
  if (!rows.length) return;
  const sheet = ensureHarvestRecordInboxHeadSheet();
  const startRow = Math.max(2, sheet.getLastRow() + 1);
  sheet.getRange(startRow, 1, rows.length, HARVEST_RECORD_INBOX_HEAD_HEADERS.length)
    .setValues(rows);
}

function claimNextHarvestRecordInboxEntry() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) return null;
  try {
    const sheet = ensureHarvestRecordInboxSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;
    const now = Date.now();
    const states = sheet.getRange(2, 3, lastRow - 1, 6).getValues();
    let selectedIndex = -1;
    for (let index = 0; index < states.length; index++) {
      const status = String(states[index][0] || "").trim();
      const processingStartedAt = normalizeHarvestRecordInboxDate(states[index][2]);
      if (status === HARVEST_RECORD_INBOX_STATUSES.processing) {
        const isStale = !processingStartedAt ||
          now - processingStartedAt.getTime() >= HARVEST_RECORD_INBOX_PROCESSING_LEASE_MS;
        if (!isStale) return null;
        selectedIndex = index;
        break;
      }
      if (status !== HARVEST_RECORD_INBOX_STATUSES.queued) continue;
      const nextAttemptAt = normalizeHarvestRecordInboxDate(states[index][5]);
      if (nextAttemptAt && nextAttemptAt.getTime() > now) continue;
      selectedIndex = index;
      break;
    }
    if (selectedIndex < 0) return null;
    const rowNumber = selectedIndex + 2;
    const attemptCount = Math.max(0, Math.trunc(Number(states[selectedIndex][4]) || 0)) + 1;
    sheet.getRange(rowNumber, 3, 1, 7).setValues([[
      HARVEST_RECORD_INBOX_STATUSES.processing,
      states[selectedIndex][1],
      new Date(now),
      "",
      attemptCount,
      "",
      ""
    ]]);
    SpreadsheetApp.flush();
    return { rowNumber, attemptCount };
  } finally {
    lock.releaseLock();
  }
}

function finalizeHarvestRecordInboxEntry(batchId, values) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = ensureHarvestRecordInboxSheet();
    const rowNumber = findHarvestRecordInboxRow(sheet, batchId);
    if (!rowNumber) throw new Error("処理中の受信記録が見つかりません");
    const current = sheet.getRange(rowNumber, 3, 1, 8).getValues()[0];
    const next = [...current];
    if (Object.prototype.hasOwnProperty.call(values, "status")) next[0] = values.status;
    if (Object.prototype.hasOwnProperty.call(values, "processingStartedAt")) {
      next[2] = values.processingStartedAt || "";
    }
    if (Object.prototype.hasOwnProperty.call(values, "processedAt")) next[3] = values.processedAt || "";
    if (Object.prototype.hasOwnProperty.call(values, "attemptCount")) next[4] = values.attemptCount;
    if (Object.prototype.hasOwnProperty.call(values, "nextAttemptAt")) next[5] = values.nextAttemptAt || "";
    if (Object.prototype.hasOwnProperty.call(values, "errorMessage")) {
      next[6] = escapeSpreadsheetFormulaText(String(values.errorMessage || "").slice(0, 4000));
    }
    if (Object.prototype.hasOwnProperty.call(values, "resultJson")) {
      next[7] = String(values.resultJson || "").slice(0, HARVEST_RECORD_INBOX_RESULT_MAX_CHARACTERS);
    }
    sheet.getRange(rowNumber, 3, 1, 8).setValues([next]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}

function getHarvestRecordInboxRetryDelayMs(attemptCount) {
  const attempt = Math.max(1, Math.trunc(Number(attemptCount) || 1));
  return Math.min(30 * 60 * 1000, 60 * 1000 * Math.pow(2, attempt - 1));
}

function processHarvestRecordInbox() {
  const claim = claimNextHarvestRecordInboxEntry();
  if (!claim) {
    cleanupHarvestRecordInbox();
    removeHarvestRecordInboxTriggerIfIdle();
    return { processed: false };
  }
  const sheet = ensureHarvestRecordInboxSheet();
  let entry = null;
  try {
    entry = readHarvestRecordInboxEntryAtRow(sheet, claim.rowNumber);
  } catch (err) {
    const batchId = String(sheet.getRange(claim.rowNumber, 1).getValue() || "").trim();
    if (normalizeHarvestDayBatchId(batchId)) {
      finalizeHarvestRecordInboxEntry(batchId, {
        status: HARVEST_RECORD_INBOX_STATUSES.failed,
        processingStartedAt: "",
        processedAt: new Date(),
        attemptCount: claim.attemptCount,
        nextAttemptAt: "",
        errorMessage: String(err && err.message || err)
      });
    }
    console.warn("記録受信箱の内容を読み込めませんでした: " + String(err && err.message || err));
    removeHarvestRecordInboxTriggerIfIdle();
    return { processed: true, completed: false };
  }
  if (!entry || !entry.payload || entry.batchId !== entry.payload.batchId) {
    const message = "受信箱の記録内容が正しくありません";
    finalizeHarvestRecordInboxEntry(entry && entry.batchId, {
      status: HARVEST_RECORD_INBOX_STATUSES.failed,
      processingStartedAt: "",
      processedAt: new Date(),
      attemptCount: claim.attemptCount,
      nextAttemptAt: "",
      errorMessage: message
    });
    removeHarvestRecordInboxTriggerIfIdle();
    throw new Error(message);
  }
  try {
    const prepared = applyHarvestRecordInboxBaseVersions(entry.payload, entry.acceptedAt);
    const result = saveHarvestDayBatch(
      prepared.records,
      prepared.plantingEvents,
      entry.batchId
    );
    if (Number(result.failed) > 0) {
      const failedItem = (result.recordResults || []).concat(result.plantingResults || [])
        .find(item => !item || item.ok !== true);
      throw new Error(String(failedItem && failedItem.message || "一部の記録を反映できませんでした"));
    }
    const receipt = buildHarvestDayBatchReceipt(
      entry.batchId,
      entry.payload.records,
      entry.payload.plantingEvents,
      result
    );
    if (!receipt) throw new Error("受信箱の処理結果を保存できませんでした");
    const resultJson = JSON.stringify(receipt);
    if (resultJson.length > HARVEST_RECORD_INBOX_RESULT_MAX_CHARACTERS) {
      throw new Error("受信箱の処理結果が大きすぎます");
    }
    appendHarvestRecordInboxHeads(entry.batchId, entry.acceptedAt, result);
    finalizeHarvestRecordInboxEntry(entry.batchId, {
      status: HARVEST_RECORD_INBOX_STATUSES.completed,
      processingStartedAt: "",
      processedAt: new Date(),
      attemptCount: claim.attemptCount,
      nextAttemptAt: "",
      errorMessage: "",
      resultJson
    });
    removeHarvestRecordInboxTriggerIfIdle();
    return { processed: true, batchId: entry.batchId, completed: true };
  } catch (err) {
    const message = String(err && err.message || err || "受信箱の処理に失敗しました");
    const exhausted = claim.attemptCount >= HARVEST_RECORD_INBOX_MAX_ATTEMPTS;
    finalizeHarvestRecordInboxEntry(entry.batchId, {
      status: exhausted
        ? HARVEST_RECORD_INBOX_STATUSES.failed
        : HARVEST_RECORD_INBOX_STATUSES.queued,
      processingStartedAt: "",
      processedAt: exhausted ? new Date() : "",
      attemptCount: claim.attemptCount,
      nextAttemptAt: exhausted
        ? ""
        : new Date(Date.now() + getHarvestRecordInboxRetryDelayMs(claim.attemptCount)),
      errorMessage: message
    });
    console.warn("記録受信箱の処理に失敗しました: " + message);
    removeHarvestRecordInboxTriggerIfIdle();
    return {
      processed: true,
      batchId: entry.batchId,
      completed: false,
      retryScheduled: !exhausted,
      message
    };
  }
}

function compactHarvestRecordInboxHeads() {
  const sheet = ensureHarvestRecordInboxHeadSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return 0;
  const rows = sheet
    .getRange(2, 1, lastRow - 1, HARVEST_RECORD_INBOX_HEAD_HEADERS.length)
    .getValues();
  const latestByKey = new Map();
  rows.forEach(row => {
    const key = String(row[0] || "").trim();
    if (key) latestByKey.set(key, row);
  });
  if (latestByKey.size === rows.length) return 0;
  sheet.getRange(2, 1, lastRow - 1, HARVEST_RECORD_INBOX_HEAD_HEADERS.length).clearContent();
  const compacted = [...latestByKey.values()];
  if (compacted.length) {
    sheet.getRange(2, 1, compacted.length, HARVEST_RECORD_INBOX_HEAD_HEADERS.length)
      .setValues(compacted);
  }
  if (lastRow > compacted.length + 1) {
    sheet.deleteRows(compacted.length + 2, lastRow - compacted.length - 1);
  }
  return rows.length - compacted.length;
}

function cleanupHarvestRecordInbox() {
  const sheet = getSpreadsheet().getSheetByName(HARVEST_RECORD_INBOX_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const rows = sheet.getRange(2, 3, sheet.getLastRow() - 1, 4).getValues();
  const cutoff = Date.now() - HARVEST_RECORD_INBOX_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const rowsToDelete = [];
  rows.forEach((row, index) => {
    const status = String(row[0] || "").trim();
    if (![HARVEST_RECORD_INBOX_STATUSES.completed, HARVEST_RECORD_INBOX_STATUSES.failed].includes(status)) return;
    const processedAt = normalizeHarvestRecordInboxDate(row[3]);
    if (processedAt && processedAt.getTime() < cutoff) rowsToDelete.push(index + 2);
  });
  rowsToDelete.reverse().forEach(rowNumber => sheet.deleteRow(rowNumber));
  if (ensureHarvestRecordInboxHeadSheet().getLastRow() > 2000) {
    compactHarvestRecordInboxHeads();
  }
  return rowsToDelete.length;
}

function installHarvestRecordInboxTrigger() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const handler = "processHarvestRecordInbox";
    ScriptApp.getProjectTriggers()
      .filter(trigger => trigger.getHandlerFunction() === handler)
      .forEach(trigger => ScriptApp.deleteTrigger(trigger));
    ScriptApp.newTrigger(handler).timeBased().everyMinutes(1).create();
    return true;
  } finally {
    lock.releaseLock();
  }
}

function getHarvestRecordInboxProcessorTriggers() {
  const handler = "processHarvestRecordInbox";
  return ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === handler);
}

function ensureHarvestRecordInboxTriggerInstalledUnlocked() {
  const triggers = getHarvestRecordInboxProcessorTriggers();
  triggers.slice(1).forEach(trigger => ScriptApp.deleteTrigger(trigger));
  if (!triggers.length) {
    ScriptApp.newTrigger("processHarvestRecordInbox").timeBased().everyMinutes(1).create();
  }
  return true;
}

function ensureHarvestRecordInboxTriggerInstalled() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return false;
  try {
    return ensureHarvestRecordInboxTriggerInstalledUnlocked();
  } finally {
    lock.releaseLock();
  }
}

function hasPendingHarvestRecordInboxEntriesUnlocked(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return false;
  return sheet.getRange(2, 3, sheet.getLastRow() - 1, 1).getValues()
    .some(row => [
      HARVEST_RECORD_INBOX_STATUSES.queued,
      HARVEST_RECORD_INBOX_STATUSES.processing
    ].includes(String(row[0] || "").trim()));
}

function removeHarvestRecordInboxTriggerIfIdle(sheetOverride) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return false;
  try {
    const sheet = sheetOverride ||
      getSpreadsheet().getSheetByName(HARVEST_RECORD_INBOX_SHEET_NAME);
    if (hasPendingHarvestRecordInboxEntriesUnlocked(sheet)) return false;
    getHarvestRecordInboxProcessorTriggers()
      .forEach(trigger => ScriptApp.deleteTrigger(trigger));
    return true;
  } finally {
    lock.releaseLock();
  }
}

function setupHarvestRecordInbox() {
  ensureHarvestRecordInboxSheet();
  ensureHarvestRecordInboxHeadSheet();
  installHarvestRecordInboxTrigger();
  SpreadsheetApp.flush();
  return {
    ok: true,
    inboxSheet: HARVEST_RECORD_INBOX_SHEET_NAME,
    processor: "1分ごと"
  };
}
