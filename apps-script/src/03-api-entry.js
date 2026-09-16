function doPost(e) {
  requestScopedSpreadsheet = null;
  requestScopedChangedHarvestRecordIds = new Set();
  let apiStage = "リクエスト本文の確認中";
  try {
    const body = parseApiRequestBody(e);
    apiStage = "操作の種類の確認中";
    const operation = resolveApiOperation(body);
    apiStage = "連携トークンの確認中";
    const fastCheckPropertyValues = isHarvestRevisionFastCheckCandidate(body)
      ? PropertiesService.getScriptProperties().getProperties()
      : null;
    const accessRole = assertApiAuthenticated(body.token, fastCheckPropertyValues);
    assertApiOperationAllowedForRole(operation, accessRole);

    if (operation === "identifyAccessRole") {
      return jsonResponse({
        ok: true,
        accessRole: accessRole
      });
    }

    if (operation === "checkUpdates") {
      apiStage = "同期番号の高速確認中";
      const revisionCheck = getRevisionUpdateCheckResponse(body, fastCheckPropertyValues);
      if (revisionCheck) {
        return jsonResponse({ ok: true, ...revisionCheck });
      }
    }

    if (operation === "checkUpdates") {
      apiStage = "更新情報の確認中";
      const includePlanting = body.includePlanting !== false;
      const syncResult = listHarvestRecordsForSync(normalizeRecordListOptions({
        limit: body.limit,
        syncMode: true,
        cursor: body.cursor
      }));
      const deletedRecords = syncResult.deletedRecords || [];
      const plantingSyncResult = includePlanting
        ? listPlantingEventsForSync(normalizePlantingEventListOptions({
            limit: PLANTING_EVENT_LIST_LIMIT,
            syncMode: true,
            cursor: body.plantingCursor,
            fallbackSeedlingLossRate: body.fallbackSeedlingLossRate,
            fallbackSeedlingPattern: body.fallbackSeedlingPattern,
            fallbackPlantingCountsByBed: body.fallbackPlantingCountsByBed
          }))
        : null;
      return jsonResponse({
        ok: true,
        recordVersions: (syncResult.records || []).map(record => ({
          recordUuid: record.recordUuid || "",
          id: record.id,
          updatedAt: record.updatedAt || ""
        })),
        deletedRecordUuids: deletedRecords.map(item => item.recordUuid).filter(Boolean),
        deletedRecordIds: deletedRecords
          .filter(item => !item.recordUuid)
          .map(item => item.id)
          .filter(id => id !== null),
        hasMore: syncResult.hasMore === true,
        nextCursor: syncResult.nextCursor || null,
        plantingVersions: plantingSyncResult
          ? plantingSyncResult.events.map(event => ({
              eventId: event.eventId,
              updatedAt: getEffectivePlantingEventUpdatedAt(event)
            }))
          : [],
        deletedEventIds: includePlanting ? listDeletedPlantingEventIds() : [],
        plantingHasMore: plantingSyncResult ? plantingSyncResult.hasMore : false,
        plantingNextCursor: plantingSyncResult ? plantingSyncResult.nextCursor : null
      });
    }

    if (operation === "workerSnapshot") {
      apiStage = "作業者用の計算データを読み込み中";
      return jsonResponse({
        ok: true,
        ...buildWorkerCalculationSnapshot(body)
      });
    }

    if (operation === "syncAll") {
      apiStage = "収穫・苗植え記録の一括読み込み中";
      const revisionSync = getRevisionSyncResponse(body);
      if (revisionSync && !revisionSync.resetRequired) {
        return jsonResponse({ ok: true, ...revisionSync });
      }
      const syncRevisionSnapshot = getHarvestSyncRevisionState().revision;
      const restartRevisionSync = !!revisionSync
        && revisionSync.resetRequired
        && body.revisionReset !== true;
      const recordOptions = normalizeRecordListOptions({
        limit: body.limit,
        syncMode: true,
        cursor: restartRevisionSync ? null : body.cursor
      });
      const plantingOptions = normalizePlantingEventListOptions({
        limit: body.plantingLimit,
        syncMode: true,
        cursor: restartRevisionSync ? null : body.plantingCursor,
        fallbackSeedlingLossRate: body.fallbackSeedlingLossRate,
        fallbackSeedlingPattern: body.fallbackSeedlingPattern,
        fallbackPlantingCountsByBed: body.fallbackPlantingCountsByBed
      });
      const syncResult = listHarvestRecordsForSync(recordOptions);
      const plantingSyncResult = listPlantingEventsForSync(plantingOptions);
      return jsonResponse({
        ok: true,
        ...buildCombinedRecordSyncApiResult(syncResult, plantingSyncResult, {
          recordCursor: recordOptions.cursor,
          plantingCursor: plantingOptions.cursor
        }),
        revisionSync: hasHarvestSyncRevisionRequest(body),
        revisionReset: hasHarvestSyncRevisionRequest(body),
        syncRevision: syncRevisionSnapshot,
        currentSyncRevision: syncRevisionSnapshot,
        nextSyncRevision: syncRevisionSnapshot
      });
    }

    if (operation === "listRecords") {
      apiStage = "収穫記録の読み込み中";
      const syncResult = listHarvestRecordsForSync(normalizeRecordListOptions({
        recentDays: body.recentDays,
        limit: body.limit,
        syncMode: body.syncMode,
        cursor: body.cursor
      }));
      const apiResult = buildHarvestRecordListApiResult(syncResult);
      return jsonResponse({
        ok: true,
        ...apiResult
      });
    }

    if (operation === "deleteRecord") {
      apiStage = "収穫記録の削除中";
      const result = deleteHarvestRecord(body.record);
      const revisionAcknowledgement = recordHarvestRecordSyncResult(
        { ...result, record: result.record || body.record },
        "delete"
      );
      return jsonResponse({
        ok: true,
        ...result,
        ...revisionAcknowledgement,
        record: result.record ? compactHarvestRecordForApi(result.record) : null
      });
    }

    if (operation === "restoreRecord") {
      apiStage = "収穫記録の復元中";
      const result = restoreHarvestRecord(body.record);
      const revisionAcknowledgement = recordHarvestRecordSyncResult(result, "upsert");
      return jsonResponse({
        ok: true,
        ...result,
        ...revisionAcknowledgement,
        record: result.record ? compactHarvestRecordForApi(result.record) : null
      });
    }

    if (operation === "listPlantingEvents") {
      apiStage = "苗植えイベントの読み込み中";
      const listOptions = normalizePlantingEventListOptions({
        recentDays: body.recentDays,
        limit: body.limit,
        syncMode: body.syncMode,
        cursor: body.cursor,
        fallbackSeedlingLossRate: body.fallbackSeedlingLossRate,
        fallbackSeedlingPattern: body.fallbackSeedlingPattern,
        fallbackPlantingCountsByBed: body.fallbackPlantingCountsByBed
      });
      const syncResult = listOptions.syncMode ? listPlantingEventsForSync(listOptions) : null;
      return jsonResponse({
        ok: true,
        events: syncResult ? syncResult.events : listPlantingEventsForApi(listOptions),
        deletedEventIds: listDeletedPlantingEventIds(),
        hasMore: syncResult ? syncResult.hasMore : false,
        nextCursor: syncResult ? syncResult.nextCursor : null
      });
    }

    if (operation === "savePlantingEvent") {
      apiStage = "苗植えイベントの保存中";
      const result = savePlantingEvent(body.event);
      const revisionAcknowledgement = recordPlantingEventSyncResult(result, body.event, "upsert");
      apiStage = "苗植えイベントの応答作成中";
      return jsonResponse({
        ok: true,
        ...result,
        ...revisionAcknowledgement,
        message: result.updated ? "苗植えイベントを更新しました" : "苗植えイベントを保存しました"
      });
    }

    if (operation === "deletePlantingEvent") {
      apiStage = "苗植えイベントの削除中";
      const result = deletePlantingEvent(body.event);
      const revisionAcknowledgement = recordPlantingEventSyncResult(result, body.event, "delete");
      return jsonResponse({
        ok: true,
        ...result,
        ...revisionAcknowledgement
      });
    }

    if (operation === "restorePlantingEvent") {
      apiStage = "苗植えイベントの復元中";
      const result = restorePlantingEvent(body.event);
      const revisionAcknowledgement = recordPlantingEventSyncResult(result, body.event, "upsert");
      return jsonResponse({
        ok: true,
        ...result,
        ...revisionAcknowledgement
      });
    }

    if (operation === "getMonitorContent") {
      apiStage = "モニター内容の読み込み中";
      return jsonResponse({
        ok: true,
        content: getMonitorContent()
      });
    }

    if (operation === "saveMonitorContent") {
      apiStage = "モニター内容の保存中";
      return jsonResponse({
        ok: true,
        ...saveMonitorContent(normalizeMonitorContentInput(body.content))
      });
    }

    if (operation === "enqueueDayBatch") {
      apiStage = "当日の記録を受信箱へ保存中";
      const result = enqueueHarvestDayBatch(
        body.records,
        body.plantingEvents,
        body.batchId,
        body.syncRevision
      );
      return jsonResponse({
        ok: true,
        ...compactHarvestRecordInboxApiResult(result)
      });
    }

    if (operation === "checkDayBatchInboxStatus") {
      apiStage = "受信箱の処理状況を確認中";
      const result = getHarvestDayBatchInboxStatus(body.batchId);
      return jsonResponse({
        ok: true,
        ...compactHarvestRecordInboxApiResult(result)
      });
    }

    if (operation === "checkDayBatchStatus") {
      apiStage = "当日の一括送信結果を確認中";
      const result = getHarvestDayBatchSendStatus(
        body.records,
        body.plantingEvents,
        body.batchId
      );
      return jsonResponse({
        ok: true,
        recordResults: result.recordResults.map(item => ({
          ...item,
          record: item.record ? compactHarvestRecordForApi(item.record) : null
        })),
        plantingResults: result.plantingResults.map(item => ({
          ...item,
          event: item.event ? compactPlantingEventForApi(item.event) : null
        }))
      });
    }

    if (operation === "listMonitorHistory") {
      apiStage = "モニター履歴の読み込み中";
      return jsonResponse({
        ok: true,
        history: listMonitorHistory(normalizeMonitorHistoryOptions({
          limit: body.limit
        }))
      });
    }

    if (operation === "saveDayBatch") {
      apiStage = "当日の収穫・苗植え記録の一括保存中";
      const result = saveHarvestDayBatch(body.records, body.plantingEvents, body.batchId);
      apiStage = "当日の収穫・苗植え記録の応答作成中";
      return jsonResponse({
        ok: true,
        ...result,
        recordResults: result.recordResults.map(item => ({
          ...item,
          record: item.record ? compactHarvestRecordForApi(item.record) : item.record
        }))
      });
    }

    if (operation === "saveRecordBatch") {
      apiStage = "収穫記録の一括保存中";
      const result = saveHarvestRecordsBatch(body.records);
      const revisionAcknowledgement = recordHarvestSyncChangesSafely(result.results
        .filter(item => item && item.ok === true && item.record && !item.duplicate)
        .map(item => ({
          entityType: "record",
          recordUuid: item.record.recordUuid,
          entityId: item.record.id,
          action: "upsert"
        })));
      apiStage = "収穫記録の一括応答作成中";
      return jsonResponse({
        ok: true,
        ...result,
        ...revisionAcknowledgement,
        results: result.results.map(item => ({
          ...item,
          record: item.record ? compactHarvestRecordForApi(item.record) : item.record
        }))
      });
    }

    if (operation !== "saveRecord") throw new Error("許可されていない操作です");
    apiStage = "収穫記録の保存中";
    const result = saveHarvestRecord(body.record, body.duplicateKey);
    const revisionAcknowledgement = recordHarvestRecordSyncResult(result, "upsert");

    apiStage = "収穫記録の応答作成中";
    return jsonResponse({
      ok: true,
      duplicate: result.duplicate,
      updated: result.updated,
      ...revisionAcknowledgement,
      record: result.record ? compactHarvestRecordForApi(result.record) : null,
      message: result.updated ? "記録を更新しました" : (result.duplicate ? "保存済みの記録です" : "保存しました")
    });
  } catch (err) {
    return jsonResponse({
      ok: false,
      message: "[" + API_BUILD_VERSION + "] " + apiStage + ": " +
        String(err && err.message ? err.message : err)
    });
  }
}

/**
 * Apps Script のエディタから一度だけ手動実行してください。
 * 返された値（実行ログにも出ます）をアプリの Google 連携トークンに設定します。
 * 交換する場合は regenerateHarvestApiToken() を手動実行します。
 */
function setupHarvestApiToken(forceRegenerate) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const properties = PropertiesService.getScriptProperties();
    const current = String(properties.getProperty(API_TOKEN_PROPERTY_NAME) || "").trim();
    if (!forceRegenerate && current.length >= API_TOKEN_MIN_LENGTH && current.length <= API_TOKEN_MAX_LENGTH) {
      console.log(API_TOKEN_PROPERTY_NAME + ": " + current);
      return current;
    }

    const entropy = [
      Utilities.getUuid(),
      Utilities.getUuid(),
      Utilities.getUuid(),
      Utilities.getUuid(),
      String(Date.now()),
      String(Math.random())
    ].join("|");
    const bytes = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      entropy,
      Utilities.Charset.UTF_8
    );
    const token = Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, "");
    properties.setProperty(API_TOKEN_PROPERTY_NAME, token);
    console.log(API_TOKEN_PROPERTY_NAME + ": " + token);
    return token;
  } finally {
    lock.releaseLock();
  }
}

// トークンを交換する時だけ手動実行してください。交換後は全端末の設定更新が必要です。
function regenerateHarvestApiToken() {
  return setupHarvestApiToken(true);
}

/**
 * 作業者端末用の制限トークンを発行します。
 * Apps Script のエディタから一度だけ実行し、作業者端末の連携トークンへ設定してください。
 */
function setupHarvestWorkerApiToken(forceRegenerate) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const properties = PropertiesService.getScriptProperties();
    const current = String(properties.getProperty(WORKER_API_TOKEN_PROPERTY_NAME) || "").trim();
    if (!forceRegenerate && current.length >= API_TOKEN_MIN_LENGTH && current.length <= API_TOKEN_MAX_LENGTH) {
      console.log(WORKER_API_TOKEN_PROPERTY_NAME + ": " + current);
      return current;
    }

    const entropy = [
      Utilities.getUuid(),
      Utilities.getUuid(),
      Utilities.getUuid(),
      Utilities.getUuid(),
      String(Date.now()),
      String(Math.random())
    ].join("|");
    const bytes = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      entropy,
      Utilities.Charset.UTF_8
    );
    const token = Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, "");
    properties.setProperty(WORKER_API_TOKEN_PROPERTY_NAME, token);
    console.log(WORKER_API_TOKEN_PROPERTY_NAME + ": " + token);
    return token;
  } finally {
    lock.releaseLock();
  }
}

function regenerateHarvestWorkerApiToken() {
  return setupHarvestWorkerApiToken(true);
}

function parseApiRequestBody(e) {
  const postData = e && e.postData;
  const raw = postData && typeof postData.contents === "string" ? postData.contents : "";
  if (!raw) throw new Error("リクエスト本文がありません");
  if (raw.length > API_MAX_BODY_CHARACTERS) throw new Error("リクエスト本文が大きすぎます");

  const declaredLength = Number(postData && postData.length);
  if (Number.isFinite(declaredLength) && declaredLength > API_MAX_BODY_BYTES) {
    throw new Error("リクエスト本文が大きすぎます");
  }
  const actualLength = Utilities.newBlob(raw).getBytes().length;
  if (actualLength > API_MAX_BODY_BYTES) throw new Error("リクエスト本文が大きすぎます");

  let body;
  try {
    body = JSON.parse(raw);
  } catch (err) {
    throw new Error("JSON形式のリクエストではありません");
  }
  if (!isPlainObject(body)) throw new Error("リクエスト本文はオブジェクトで指定してください");
  if (typeof body.app !== "undefined" && body.app !== "Harvestnavi") {
    throw new Error("対象アプリが違います");
  }
  if (typeof body.version !== "undefined" && body.version !== 1) {
    throw new Error("対応していないリクエスト形式です");
  }
  return body;
}

function resolveApiOperation(body) {
  const operationByAction = {
    identifyAccessRole: "identifyAccessRole",
    checkUpdates: "checkUpdates",
    workerSnapshot: "workerSnapshot",
    syncAll: "syncAll",
    listRecords: "listRecords",
    deleteRecord: "deleteRecord",
    restoreRecord: "restoreRecord",
    listPlantingEvents: "listPlantingEvents",
    savePlantingEvent: "savePlantingEvent",
    deletePlantingEvent: "deletePlantingEvent",
    restorePlantingEvent: "restorePlantingEvent",
    getMonitorContent: "getMonitorContent",
    saveMonitorContent: "saveMonitorContent",
    listMonitorHistory: "listMonitorHistory",
    saveDayBatch: "saveDayBatch",
    checkDayBatchStatus: "checkDayBatchStatus",
    enqueueDayBatch: "enqueueDayBatch",
    checkDayBatchInboxStatus: "checkDayBatchInboxStatus"
  };
  const operationByType = {
    "harvest-access-role": "identifyAccessRole",
    "harvest-update-check": "checkUpdates",
    "harvest-worker-snapshot": "workerSnapshot",
    "harvest-sync-all": "syncAll",
    "harvest-record": "saveRecord",
    "harvest-record-batch": "saveRecordBatch",
    "harvest-day-batch": "saveDayBatch",
    "harvest-day-batch-status": "checkDayBatchStatus",
    "harvest-day-batch-inbox": "enqueueDayBatch",
    "harvest-day-batch-inbox-status": "checkDayBatchInboxStatus",
    "harvest-record-list": "listRecords",
    "harvest-record-delete": "deleteRecord",
    "harvest-record-restore": "restoreRecord",
    "planting-event": "savePlantingEvent",
    "planting-event-list": "listPlantingEvents",
    "planting-event-delete": "deletePlantingEvent",
    "planting-event-restore": "restorePlantingEvent",
    "harvest-monitor-content": "getMonitorContent",
    "harvest-monitor-save": "saveMonitorContent",
    "harvest-monitor-history": "listMonitorHistory"
  };
  const action = normalizeOptionalRequestSelector(body.action, "action");
  const type = normalizeOptionalRequestSelector(body.type, "type");
  const actionOperation = action && Object.prototype.hasOwnProperty.call(operationByAction, action)
    ? operationByAction[action]
    : "";
  const typeOperation = type && Object.prototype.hasOwnProperty.call(operationByType, type)
    ? operationByType[type]
    : "";

  if ((action && !actionOperation) || (type && !typeOperation)) {
    throw new Error("許可されていない操作です");
  }
  if (actionOperation && typeOperation && actionOperation !== typeOperation) {
    throw new Error("actionとtypeの組み合わせが一致しません");
  }
  const operation = actionOperation || typeOperation;
  if (!operation) throw new Error("操作の種類がありません");

  if (["saveRecord", "deleteRecord", "restoreRecord"].includes(operation) && !isPlainObject(body.record)) {
    throw new Error("記録データがありません");
  }
  if (["savePlantingEvent", "deletePlantingEvent", "restorePlantingEvent"].includes(operation) &&
    !isPlainObject(body.event)) {
    throw new Error("苗植えイベントがありません");
  }
  if (operation === "saveRecordBatch") {
    if (!Array.isArray(body.records)) throw new Error("recordsが配列ではありません");
    if (body.records.length > API_BATCH_RECORD_LIMIT) {
      throw new Error("一度に送信できる記録は" + API_BATCH_RECORD_LIMIT + "件までです");
    }
  }
  if (operation === "saveDayBatch") {
    if (!Array.isArray(body.records)) throw new Error("recordsが配列ではありません");
    if (!Array.isArray(body.plantingEvents)) {
      throw new Error("plantingEventsが配列ではありません");
    }
    const itemCount = body.records.length + body.plantingEvents.length;
    if (itemCount < 1) throw new Error("送信する記録がありません");
    if (body.records.length > API_BATCH_RECORD_LIMIT || itemCount > API_DAY_BATCH_ITEM_LIMIT) {
      throw new Error("一度に送信できる当日の記録は" + API_DAY_BATCH_ITEM_LIMIT + "件までです");
    }
    if (Object.prototype.hasOwnProperty.call(body, "batchId")) {
      body.batchId = normalizeHarvestDayBatchId(body.batchId);
      if (!body.batchId) throw new Error("一括送信IDの形式が正しくありません");
    }
  }
  if (operation === "enqueueDayBatch") {
    if (!Array.isArray(body.records)) throw new Error("recordsが配列ではありません");
    if (!Array.isArray(body.plantingEvents)) {
      throw new Error("plantingEventsが配列ではありません");
    }
    const itemCount = body.records.length + body.plantingEvents.length;
    if (itemCount < 1) throw new Error("受信箱へ送る記録がありません");
    if (body.records.length > API_BATCH_RECORD_LIMIT || itemCount > API_DAY_BATCH_ITEM_LIMIT) {
      throw new Error("受信箱へ送れる当日の記録は" + API_DAY_BATCH_ITEM_LIMIT + "件までです");
    }
    body.batchId = normalizeHarvestDayBatchId(body.batchId);
    if (!body.batchId) throw new Error("受信箱の受付IDが正しくありません");
  }
  if (operation === "checkDayBatchInboxStatus") {
    body.batchId = normalizeHarvestDayBatchId(body.batchId);
    if (!body.batchId) throw new Error("受信箱の受付IDが正しくありません");
  }
  if (operation === "checkDayBatchStatus") {
    if (!Array.isArray(body.records)) {
      throw new Error("recordsが配列ではありません");
    }
    if (!Array.isArray(body.plantingEvents)) {
      throw new Error("plantingEventsが配列ではありません");
    }
    const itemCount = body.records.length + body.plantingEvents.length;
    if (itemCount < 1) throw new Error("確認する記録がありません");
    if (itemCount > API_DAY_BATCH_ITEM_LIMIT) {
      throw new Error("一度に確認できる当日の記録は" + API_DAY_BATCH_ITEM_LIMIT + "件までです");
    }
    body.records.forEach(record => {
      if (!isPlainObject(record)) throw new Error("確認する収穫記録が正しくありません");
    });
    body.plantingEvents.forEach(event => {
      if (!isPlainObject(event)) throw new Error("確認する苗植え記録が正しくありません");
    });
    if (Object.prototype.hasOwnProperty.call(body, "batchId")) {
      body.batchId = normalizeHarvestDayBatchId(body.batchId);
      if (!body.batchId) throw new Error("一括送信IDの形式が正しくありません");
    }
  }
  if (operation === "saveMonitorContent" && !isPlainObject(body.content)) {
    throw new Error("モニター内容がありません");
  }
  return operation;
}

function normalizeOptionalRequestSelector(value, label) {
  if (value === null || typeof value === "undefined" || value === "") return "";
  if (typeof value !== "string" || value.length > 64) {
    throw new Error(label + "の形式が正しくありません");
  }
  return value;
}

function assertApiAuthenticated(providedToken, propertyValues) {
  const expectedAdminToken = getConfiguredApiToken(propertyValues);
  const hasValidFormat = typeof providedToken === "string" && providedToken.length <= API_TOKEN_MAX_LENGTH;
  const candidate = typeof providedToken === "string"
    ? providedToken.slice(0, API_TOKEN_MAX_LENGTH)
    : "";
  const adminMatches = constantTimeTokenEquals(candidate, expectedAdminToken);
  if (hasValidFormat && adminMatches) return "admin";

  const expectedWorkerToken = getConfiguredWorkerApiToken(propertyValues);
  const workerMatches = constantTimeTokenEquals(candidate, expectedWorkerToken || expectedAdminToken)
    && !!expectedWorkerToken;
  if (!hasValidFormat || !workerMatches) throw new Error("認証できませんでした");
  return "worker";
}

function getConfiguredApiToken(propertyValues) {
  const tokenValue = isPlainObject(propertyValues)
    ? propertyValues[API_TOKEN_PROPERTY_NAME]
    : PropertiesService.getScriptProperties().getProperty(API_TOKEN_PROPERTY_NAME);
  const token = String(tokenValue || "").trim();
  if (token.length < API_TOKEN_MIN_LENGTH || token.length > API_TOKEN_MAX_LENGTH) {
    throw new Error("サーバー認証が未設定です。setupHarvestApiTokenを手動実行してください");
  }
  return token;
}

function getConfiguredWorkerApiToken(propertyValues) {
  const tokenValue = isPlainObject(propertyValues)
    ? propertyValues[WORKER_API_TOKEN_PROPERTY_NAME]
    : PropertiesService.getScriptProperties().getProperty(WORKER_API_TOKEN_PROPERTY_NAME);
  const token = String(tokenValue || "").trim();
  if (!token) return "";
  if (token.length < API_TOKEN_MIN_LENGTH || token.length > API_TOKEN_MAX_LENGTH) {
    throw new Error("作業者用のサーバー認証設定が正しくありません");
  }
  return token;
}

function assertApiOperationAllowedForRole(operation, accessRole) {
  if (accessRole !== "worker") return;
  const workerOperations = [
    "identifyAccessRole",
    "workerSnapshot",
    "saveRecord",
    "saveRecordBatch",
    "saveDayBatch",
    "checkDayBatchStatus",
    "enqueueDayBatch",
    "checkDayBatchInboxStatus",
    "savePlantingEvent",
    "getMonitorContent",
    "saveMonitorContent"
  ];
  if (!workerOperations.includes(operation)) {
    throw new Error("この操作は管理者だけが利用できます");
  }
}

function normalizeHarvestDayBatchId(value) {
  const text = String(value == null ? "" : value).trim();
  if (!text || text.length > HARVEST_DAY_BATCH_ID_MAX_LENGTH) return "";
  return /^[A-Za-z0-9_-]+$/.test(text) ? text : "";
}

function getHarvestDayBatchRequestFingerprint(records, plantingEvents) {
  const text = JSON.stringify({
    records: Array.isArray(records) ? records : [],
    plantingEvents: Array.isArray(plantingEvents) ? plantingEvents : []
  });
  let first = 2166136261;
  let second = 2246822519;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619) >>> 0;
    second = Math.imul(second ^ (code + index), 3266489917) >>> 0;
  }
  return text.length.toString(36) + "-" + first.toString(36) + "-" + second.toString(36);
}

function getHarvestDayBatchReceiptCacheKey(batchId) {
  const normalizedId = normalizeHarvestDayBatchId(batchId);
  return normalizedId ? HARVEST_DAY_BATCH_RECEIPT_CACHE_PREFIX + normalizedId : "";
}

function buildHarvestDayBatchReceipt(batchId, records, plantingEvents, result) {
  const normalizedId = normalizeHarvestDayBatchId(batchId);
  if (!normalizedId || !result) return null;
  const recordResults = Array.isArray(result.recordResults) ? result.recordResults : [];
  const plantingResults = Array.isArray(result.plantingResults) ? result.plantingResults : [];
  if (recordResults.length !== records.length || plantingResults.length !== plantingEvents.length) return null;
  if (recordResults.some(item => !item || item.ok !== true || !item.record)) return null;
  if (plantingResults.some(item => !item || item.ok !== true || !item.event)) return null;

  const now = Date.now();
  return {
    version: 1,
    batchId: normalizedId,
    savedAt: now,
    expiresAt: now + HARVEST_DAY_BATCH_RECEIPT_TTL_MS,
    requestFingerprint: getHarvestDayBatchRequestFingerprint(records, plantingEvents),
    previousSyncRevision: Number.isSafeInteger(Number(result.previousSyncRevision))
      ? Number(result.previousSyncRevision)
      : null,
    syncRevision: Number.isSafeInteger(Number(result.syncRevision))
      ? Number(result.syncRevision)
      : null,
    recordResults: recordResults.map((item, index) => ({
      index,
      requestedId: Number(records[index] && records[index].id),
      canonicalId: Number(item.record.id),
      recordUuid: String(item.record.recordUuid || "").trim().toLowerCase(),
      duplicateKey: String(item.record.duplicateKey || ""),
      createdAt: String(item.record.createdAt || ""),
      updatedAt: String(item.record.updatedAt || "")
    })),
    plantingResults: plantingResults.map((item, index) => ({
      index,
      eventId: Number(item.event.eventId),
      createdAt: String(item.event.createdAt || ""),
      updatedAt: String(item.event.updatedAt || "")
    }))
  };
}

function saveHarvestDayBatchReceipt(batchId, records, plantingEvents, result) {
  try {
    const receipt = buildHarvestDayBatchReceipt(batchId, records, plantingEvents, result);
    if (!receipt) return false;
    const serialized = JSON.stringify(receipt);
    if (serialized.length > HARVEST_DAY_BATCH_RECEIPT_MAX_CHARACTERS) return false;
    CacheService.getScriptCache().put(
      getHarvestDayBatchReceiptCacheKey(batchId),
      serialized,
      HARVEST_DAY_BATCH_RECEIPT_TTL_SECONDS
    );
    return true;
  } catch (err) {
    console.warn("当日一括送信の受付情報を保存できませんでした: " + String(err && err.message || err));
    return false;
  }
}

function loadHarvestDayBatchReceipt(batchId, records, plantingEvents) {
  const key = getHarvestDayBatchReceiptCacheKey(batchId);
  if (!key) return null;
  try {
    const cache = CacheService.getScriptCache();
    const serialized = cache.get(key);
    if (!serialized) return null;
    const receipt = JSON.parse(serialized);
    if (!receipt || receipt.version !== 1 || Number(receipt.expiresAt) <= Date.now()) {
      cache.remove(key);
      return null;
    }
    const fingerprint = getHarvestDayBatchRequestFingerprint(records, plantingEvents);
    return receipt.requestFingerprint === fingerprint ? receipt : null;
  } catch (err) {
    return null;
  }
}

function buildHarvestDayBatchStatusFromReceipt(receipt, records, plantingEvents) {
  if (!receipt || !Array.isArray(receipt.recordResults) || !Array.isArray(receipt.plantingResults)) {
    return null;
  }
  if (receipt.recordResults.length !== records.length || receipt.plantingResults.length !== plantingEvents.length) {
    return null;
  }
  try {
    const recordIdMappings = new Map();
    const recordResults = records.map((requestedRecord, index) => {
      const metadata = receipt.recordResults[index];
      if (!metadata || Number(metadata.index) !== index) throw new Error("収穫記録の受付情報が正しくありません");
      const normalized = normalizeHarvestRecord(requestedRecord);
      const canonicalId = Number(metadata.canonicalId);
      const requestedId = Number(metadata.requestedId);
      if (!Number.isSafeInteger(canonicalId) || canonicalId <= 0) throw new Error("確定した収穫記録IDが正しくありません");
      if (Number.isSafeInteger(requestedId) && requestedId > 0) {
        recordIdMappings.set(requestedId, { ok: true, canonicalId });
      }
      return {
        index,
        ok: true,
        pending: false,
        record: {
          ...normalized,
          id: canonicalId,
          recordUuid: metadata.recordUuid || normalized.recordUuid,
          duplicateKey: metadata.duplicateKey || normalized.duplicateKey,
          createdAt: metadata.createdAt || normalized.createdAt,
          updatedAt: metadata.updatedAt || normalized.updatedAt
        }
      };
    });
    const plantingResults = plantingEvents.map((requestedEvent, index) => {
      const metadata = receipt.plantingResults[index];
      if (!metadata || Number(metadata.index) !== index) throw new Error("苗植え記録の受付情報が正しくありません");
      const event = normalizePlantingEvent(
        remapHarvestDayBatchPlantingEvent(requestedEvent, recordIdMappings)
      );
      if (Number(event.eventId) !== Number(metadata.eventId)) throw new Error("苗植えイベントIDが一致しません");
      return {
        index,
        ok: true,
        pending: false,
        event: {
          ...event,
          createdAt: metadata.createdAt || event.createdAt,
          updatedAt: metadata.updatedAt || event.updatedAt
        }
      };
    });
    return {
      recordResults,
      plantingResults,
      confirmedByReceipt: true,
      previousSyncRevision: Number.isSafeInteger(Number(receipt.previousSyncRevision))
        ? Number(receipt.previousSyncRevision)
        : null,
      syncRevision: Number.isSafeInteger(Number(receipt.syncRevision))
        ? Number(receipt.syncRevision)
        : null
    };
  } catch (err) {
    return null;
  }
}

function saveHarvestDayBatch(records, plantingEvents, batchId) {
  const startedAt = Date.now();
  let operationFinishedAt = startedAt;
  const result = withRecordWriteLock(() => {
    const lockAcquiredAt = Date.now();
    const dayBatchContext = createHarvestDayBatchSaveContext(records, plantingEvents);
    const contextReadyAt = Date.now();
    const recordBatch = records.length
      ? saveHarvestRecordsBatchUnlocked(records, { dayBatchContext })
      : { total: 0, saved: 0, updated: 0, duplicate: 0, failed: 0, results: [] };
    const recordsSavedAt = Date.now();
    const plantingBatch = savePlantingEventsBatchUnlocked(
      plantingEvents,
      records,
      recordBatch.results,
      dayBatchContext
    );
    const plantingSavedAt = Date.now();
    const batchResult = {
      total: recordBatch.total + plantingBatch.total,
      saved: recordBatch.saved + plantingBatch.saved,
      updated: recordBatch.updated + plantingBatch.updated,
      duplicate: recordBatch.duplicate + plantingBatch.duplicate,
      unchanged: plantingBatch.unchanged,
      failed: recordBatch.failed + plantingBatch.failed,
      recordResults: recordBatch.results,
      plantingResults: plantingBatch.results
    };
    const revisionAcknowledgement = recordHarvestSyncChangesWithinWriteLockSafely(
      buildHarvestDayBatchSyncChanges(batchResult)
    );
    operationFinishedAt = Date.now();
    return {
      ...batchResult,
      ...revisionAcknowledgement,
      serverTiming: {
        lockWaitMs: lockAcquiredAt - startedAt,
        contextMs: contextReadyAt - lockAcquiredAt,
        harvestWriteMs: recordsSavedAt - contextReadyAt,
        plantingWriteMs: plantingSavedAt - recordsSavedAt,
        revisionMs: operationFinishedAt - plantingSavedAt
      }
    };
  });
  const flushedAt = Date.now();
  result.serverTiming.flushAndReleaseMs = flushedAt - operationFinishedAt;
  const receiptStartedAt = Date.now();
  result.receiptSaved = saveHarvestDayBatchReceipt(batchId, records, plantingEvents, result);
  result.serverTiming.receiptMs = Date.now() - receiptStartedAt;
  result.serverTiming.totalMs = Date.now() - startedAt;
  console.log("saveDayBatch timing: " + JSON.stringify(result.serverTiming));
  return result;
}

function getHarvestDayBatchSendStatus(records, plantingEvents, batchId) {
  const receiptStatus = buildHarvestDayBatchStatusFromReceipt(
    loadHarvestDayBatchReceipt(batchId, records, plantingEvents),
    records,
    plantingEvents
  );
  if (receiptStatus) return receiptStatus;
  return withRecordReadLock(() => {
    const recordsByUuid = new Map();
    const recordsById = new Map();
    const recordSheet = getExistingRecordSheet();
    if (recordSheet && recordSheet.getLastRow() >= 2) {
      const headers = getRecordHeadersForRead(recordSheet);
      readHarvestRecordRows(recordSheet, headers).forEach(row => {
        if (!isCommittedHarvestRecordRow(headers, row)) return;
        const record = rowToRecord(headers, row);
        const recordUuid = String(record.recordUuid || "").trim().toLowerCase();
        const recordId = Number(record.id);
        if (recordUuid) recordsByUuid.set(recordUuid, record);
        if (Number.isSafeInteger(recordId) && recordId > 0) recordsById.set(recordId, record);
      });
    }

    const plantingEventsById = new Map();
    const plantingSheet = getExistingPlantingEventSheet();
    if (plantingSheet && plantingSheet.getLastRow() >= 2) {
      const headers = getPlantingEventHeadersForRead(plantingSheet);
      const rows = plantingSheet
        .getRange(2, 1, plantingSheet.getLastRow() - 1, headers.length)
        .getValues();
      rows.forEach(row => {
        if (!isCommittedPlantingEventRow(headers, row)) return;
        const event = rowToPlantingEvent(headers, row);
        plantingEventsById.set(Number(event.eventId), event);
      });
    }

    const allocationContext = { plantingEventsById };
    const allocatedKeysByHarvestRecord = rebuildHarvestDayBatchPlantingAllocationMap(
      allocationContext
    );
    const recordIdMappings = new Map();
    const recordResults = records.map((requestedRecord, index) => {
      let normalizedRequest;
      try {
        normalizedRequest = normalizeHarvestRecord(requestedRecord);
      } catch (err) {
        return { index, ok: false, pending: true, record: null };
      }
      const recordUuid = String(normalizedRequest.recordUuid || "").trim().toLowerCase();
      const recordId = Number(normalizedRequest.id);
      const record = recordUuid
        ? recordsByUuid.get(recordUuid)
        : recordsById.get(recordId);
      if (!record) return { index, ok: false, pending: true, record: null };

      const suppliedSyncFields = getSuppliedRecordSyncFields(requestedRecord);
      const recordForComparison = applyPlantingLocationSummaryToHarvestRecord({
        ...mergeOmittedSyncFieldsFromExistingRecord(
          normalizedRequest,
          suppliedSyncFields,
          record
        ),
        id: record.id,
        recordUuid: record.recordUuid,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
      }, allocatedKeysByHarvestRecord);
      const matches = getHarvestRecordContentSignature(recordForComparison) ===
        getHarvestRecordContentSignature(record);
      if (matches && Number.isSafeInteger(recordId) && recordId > 0) {
        recordIdMappings.set(recordId, {
          ok: true,
          canonicalId: Number(record.id)
        });
      }
      return {
        index,
        ok: matches,
        pending: !matches,
        record: matches ? record : null
      };
    });

    return {
      recordResults,
      plantingResults: plantingEvents.map((requestedEvent, index) => {
        let normalizedRequest;
        try {
          normalizedRequest = normalizePlantingEvent(
            remapHarvestDayBatchPlantingEvent(requestedEvent, recordIdMappings)
          );
        } catch (err) {
          return { index, ok: false, pending: true, event: null };
        }
        const event = plantingEventsById.get(Number(normalizedRequest.eventId));
        const matches = !!event && getPlantingEventContentSignature(normalizedRequest) ===
          getPlantingEventContentSignature(event);
        return {
          index,
          ok: matches,
          pending: !matches,
          event: matches ? event : null
        };
      })
    };
  });
}

function buildHarvestDayBatchSyncChanges(result) {
  const changes = [];
  const changedRecordIds = new Set();
  const changedRecordUuids = new Set();
  (result && Array.isArray(result.recordResults) ? result.recordResults : [])
    .forEach(item => {
      if (!item || item.ok !== true || item.duplicate || !item.record) return;
      const recordUuid = String(item.record.recordUuid || "").trim().toLowerCase();
      const recordId = Number(item.record.id);
      if (recordUuid && changedRecordUuids.has(recordUuid)) return;
      if (Number.isSafeInteger(recordId) && recordId > 0 && changedRecordIds.has(recordId)) return;
      changes.push({
        entityType: "record",
        recordUuid,
        entityId: recordId,
        action: "upsert"
      });
      if (recordUuid) changedRecordUuids.add(recordUuid);
      if (Number.isSafeInteger(recordId) && recordId > 0) changedRecordIds.add(recordId);
    });
  (result && Array.isArray(result.plantingResults) ? result.plantingResults : [])
    .forEach(item => {
      if (!item || item.ok !== true || item.unchanged || !item.event) return;
      changes.push({
        entityType: "planting",
        entityId: item.event.eventId,
        action: "upsert"
      });
    });
  requestScopedChangedHarvestRecordIds.forEach(entityId => {
    const recordId = Number(entityId);
    if (!Number.isSafeInteger(recordId) || recordId <= 0 || changedRecordIds.has(recordId)) return;
    changes.push({ entityType: "record", entityId: recordId, action: "upsert" });
    changedRecordIds.add(recordId);
  });
  return changes;
}

function constantTimeTokenEquals(left, right) {
  const leftHash = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(left),
    Utilities.Charset.UTF_8
  );
  const rightHash = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(right),
    Utilities.Charset.UTF_8
  );
  let difference = 0;
  for (let index = 0; index < rightHash.length; index++) {
    difference |= leftHash[index] ^ rightHash[index];
  }
  return difference === 0;
}
