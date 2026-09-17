const MAX_REQUEST_BYTES = 1_000_000;
const MAX_BATCH_ITEMS = 100;
const FORWARD_TIMEOUT_MS = 30_000;
const FORWARD_LEASE_MS = 2 * 60 * 1000;
const CLEANUP_RETENTION_DAYS = 30;

function jsonResponse(value, status = 200){
  return new Response(JSON.stringify(value), {
    status,
    headers:{
      "Content-Type":"application/json;charset=utf-8",
      "Cache-Control":"no-store",
      "Access-Control-Allow-Origin":"*",
      "Access-Control-Allow-Headers":"Content-Type",
      "Access-Control-Allow-Methods":"GET,POST,OPTIONS"
    }
  });
}

function tokensMatch(left, right){
  const leftText = String(left || "");
  const rightText = String(right || "");
  if(!leftText || leftText.length !== rightText.length) return false;
  let mismatch = 0;
  for(let index = 0; index < leftText.length; index++){
    mismatch |= leftText.charCodeAt(index) ^ rightText.charCodeAt(index);
  }
  return mismatch === 0;
}

async function relayTokenMatches(providedToken, expectedHash){
  const token = typeof providedToken === "string" ? providedToken : "";
  const normalizedHash = String(expectedHash || "").trim().toLowerCase();
  if(token.length < 32 || token.length > 512 || !/^[a-f0-9]{64}$/.test(normalizedHash)){
    return false;
  }
  return tokensMatch(await sha256(token), normalizedHash);
}

function isRelayReady(env){
  return !!(
    env?.DB
    && String(env?.APPS_SCRIPT_URL || "").startsWith("https://script.google.com/")
    && String(env?.APPS_SCRIPT_TOKEN || "").length >= 32
    && /^[a-f0-9]{64}$/i.test(String(env?.RELAY_TOKEN_SHA256 || ""))
  );
}

function normalizeBatchId(value){
  const batchId = String(value || "").trim();
  return /^[A-Za-z0-9_-]{1,80}$/.test(batchId) ? batchId : "";
}

function validateBatchPayload(payload){
  if(payload?.app !== "Harvestnavi"
    || payload?.type !== "harvest-day-batch-inbox"
    || payload?.action !== "enqueueDayBatch"){
    throw new Error("中継サーバーへ送る記録形式が正しくありません");
  }
  const batchId = normalizeBatchId(payload.batchId);
  if(!batchId) throw new Error("受付IDが正しくありません");
  const records = Array.isArray(payload.records) ? payload.records : null;
  const plantingEvents = Array.isArray(payload.plantingEvents) ? payload.plantingEvents : null;
  if(!records || !plantingEvents) throw new Error("記録の配列が正しくありません");
  const itemCount = records.length + plantingEvents.length;
  if(itemCount < 1 || itemCount > MAX_BATCH_ITEMS){
    throw new Error("一度に受け付けられる記録件数を超えています");
  }
  return batchId;
}

function validateStatusPayload(payload){
  if(payload?.app !== "Harvestnavi"
    || payload?.type !== "harvest-day-batch-inbox-status"
    || payload?.action !== "checkDayBatchInboxStatus"){
    throw new Error("受付状況の確認形式が正しくありません");
  }
  const batchId = normalizeBatchId(payload.batchId);
  if(!batchId) throw new Error("受付IDが正しくありません");
  return batchId;
}

async function readRequestJson(request){
  const declaredLength = Number(request.headers.get("content-length"));
  if(Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES){
    throw new Error("送信内容が大きすぎます");
  }
  const text = await request.text();
  if(!text || new TextEncoder().encode(text).length > MAX_REQUEST_BYTES){
    throw new Error("送信内容が大きすぎます");
  }
  try{
    return JSON.parse(text);
  }catch(error){
    throw new Error("送信内容を読み込めません");
  }
}

function withoutToken(payload){
  const copy = { ...payload };
  delete copy.token;
  return copy;
}

async function sha256(text){
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map(value => value.toString(16).padStart(2, "0"))
    .join("");
}

function waitUntil(context, promise){
  const guarded = Promise.resolve(promise).catch(error => {
    console.error("Harvestnavi relay background task failed", error);
  });
  if(typeof context?.waitUntil === "function") context.waitUntil(guarded);
  return guarded;
}

async function getBatch(env, batchId){
  return env.DB.prepare(`
    SELECT batch_id, fingerprint, payload_json, result_json, status,
      accepted_at, updated_at, forwarded_at, completed_at, attempts, last_error
    FROM relay_batches
    WHERE batch_id = ?1
  `).bind(batchId).first();
}

async function updateBatchFailure(env, batchId, status, error){
  const message = String(error?.message || error || "中継処理に失敗しました").slice(0, 2000);
  await env.DB.prepare(`
    UPDATE relay_batches
    SET status = ?2, last_error = ?3, updated_at = ?4
    WHERE batch_id = ?1
  `).bind(batchId, status, message, new Date().toISOString()).run();
}

async function postAppsScript(env, payload){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);
  try{
    const response = await fetch(String(env.APPS_SCRIPT_URL), {
      method:"POST",
      headers:{ "Content-Type":"text/plain;charset=utf-8" },
      body:JSON.stringify({ ...payload, token:String(env.APPS_SCRIPT_TOKEN) }),
      signal:controller.signal
    });
    const text = await response.text();
    if(text.length > 2_000_000) throw new Error("Apps Scriptの応答が大きすぎます");
    let result;
    try{
      result = text ? JSON.parse(text) : {};
    }catch(error){
      throw new Error("Apps Scriptの応答を読み込めません");
    }
    if(result.ok !== true) throw new Error(result.message || "Apps Scriptへの転送に失敗しました");
    return result;
  }finally{
    clearTimeout(timer);
  }
}

async function forwardBatch(env, batchId){
  const now = new Date();
  const leaseCutoff = new Date(now.getTime() - FORWARD_LEASE_MS).toISOString();
  const lease = await env.DB.prepare(`
    UPDATE relay_batches
    SET status = 'forwarding', attempts = attempts + 1, updated_at = ?2, last_error = NULL
    WHERE batch_id = ?1
      AND (
        status IN ('queued', 'retry')
        OR (status = 'forwarding' AND updated_at < ?3)
      )
  `).bind(batchId, now.toISOString(), leaseCutoff).run();
  if(Number(lease?.meta?.changes || 0) < 1) return false;

  const row = await getBatch(env, batchId);
  if(!row?.payload_json){
    await updateBatchFailure(env, batchId, "failed", "転送する記録内容がありません");
    return false;
  }
  try{
    const payload = JSON.parse(row.payload_json);
    const result = await postAppsScript(env, payload);
    if(result.accepted !== true){
      throw new Error(result.message || "Apps Scriptが記録を受け付けませんでした");
    }
    const completed = result.processed === true && result.queueStatus === "completed";
    const timestamp = new Date().toISOString();
    await env.DB.prepare(`
      UPDATE relay_batches
      SET status = ?2, forwarded_at = COALESCE(forwarded_at, ?3),
        completed_at = CASE WHEN ?2 = 'completed' THEN ?3 ELSE completed_at END,
        result_json = CASE WHEN ?2 = 'completed' THEN ?4 ELSE result_json END,
        payload_json = CASE WHEN ?2 = 'completed' THEN NULL ELSE payload_json END,
        last_error = NULL, updated_at = ?3
      WHERE batch_id = ?1
    `).bind(
      batchId,
      completed ? "completed" : "forwarded",
      timestamp,
      completed ? JSON.stringify(result) : null
    ).run();
    return true;
  }catch(error){
    const retryable = error?.name === "AbortError"
      || error instanceof TypeError
      || /通信|タイムアウト|一時的|temporar|lock|service invoked/i.test(String(error?.message || error));
    await updateBatchFailure(env, batchId, retryable ? "retry" : "failed", error);
    if(retryable) throw error;
    return false;
  }
}

async function enqueueBatch(payload, env, context){
  const batchId = validateBatchPayload(payload);
  const storedPayload = withoutToken(payload);
  const payloadJson = JSON.stringify(storedPayload);
  const fingerprint = await sha256(payloadJson);
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT OR IGNORE INTO relay_batches (
      batch_id, fingerprint, payload_json, status, accepted_at, updated_at,
      attempts, last_error
    ) VALUES (?1, ?2, ?3, 'queued', ?4, ?4, 0, NULL)
  `).bind(batchId, fingerprint, payloadJson, now).run();

  let row = await getBatch(env, batchId);
  if(!row || row.fingerprint !== fingerprint){
    return jsonResponse({
      ok:false,
      message:"同じ受付IDで異なる内容が送信されています"
    }, 409);
  }
  if(row.status === "failed"){
    await env.DB.prepare(`
      UPDATE relay_batches
      SET status = 'queued', payload_json = ?2, result_json = NULL,
        last_error = NULL, updated_at = ?3
      WHERE batch_id = ?1
    `).bind(batchId, payloadJson, now).run();
    row = await getBatch(env, batchId);
  }
  if(["queued", "retry"].includes(row.status)){
    waitUntil(context, forwardBatch(env, batchId));
  }
  if(row.status === "completed" && row.result_json){
    return jsonResponse(JSON.parse(row.result_json));
  }
  return jsonResponse({
    ok:true,
    accepted:true,
    processed:false,
    queueStatus:"queued",
    relayAccepted:true,
    batchId,
    acceptedAt:row.accepted_at || now
  });
}

function buildQueuedStatus(row){
  return {
    ok:true,
    accepted:true,
    processed:false,
    failed:false,
    queueStatus:"queued",
    relayAccepted:true,
    batchId:row.batch_id,
    acceptedAt:row.accepted_at,
    attemptCount:Number(row.attempts || 0)
  };
}

async function checkBatchStatus(payload, env, context){
  const batchId = validateStatusPayload(payload);
  let row = await getBatch(env, batchId);
  if(!row){
    return jsonResponse({
      ok:true,
      accepted:false,
      processed:false,
      failed:false,
      queueStatus:"missing",
      batchId
    });
  }
  if(row.status === "completed" && row.result_json){
    return jsonResponse(JSON.parse(row.result_json));
  }
  if(row.status === "failed"){
    return jsonResponse({
      ok:true,
      accepted:true,
      processed:false,
      failed:true,
      queueStatus:"failed",
      relayAccepted:true,
      batchId,
      acceptedAt:row.accepted_at,
      message:row.last_error || "Apps Scriptへの転送に失敗しました"
    });
  }
  if(["queued", "retry", "forwarding"].includes(row.status)){
    waitUntil(context, forwardBatch(env, batchId));
    return jsonResponse(buildQueuedStatus(row));
  }

  try{
    const result = await postAppsScript(env, {
      app:"Harvestnavi",
      type:"harvest-day-batch-inbox-status",
      action:"checkDayBatchInboxStatus",
      version:1,
      batchId
    });
    if(result.processed === true && result.queueStatus === "completed"){
      const timestamp = new Date().toISOString();
      await env.DB.prepare(`
        UPDATE relay_batches
        SET status = 'completed', completed_at = ?2, result_json = ?3,
          payload_json = NULL, last_error = NULL, updated_at = ?2
        WHERE batch_id = ?1
      `).bind(batchId, timestamp, JSON.stringify(result)).run();
      return jsonResponse(result);
    }
    if(result.failed === true || result.queueStatus === "failed"){
      await updateBatchFailure(env, batchId, "failed", result.message || "Apps Scriptへの反映に失敗しました");
      return jsonResponse({ ...result, relayAccepted:true });
    }
    if(result.queueStatus === "missing"){
      await env.DB.prepare(`
        UPDATE relay_batches
        SET status = 'retry', updated_at = ?2
        WHERE batch_id = ?1
      `).bind(batchId, new Date().toISOString()).run();
      waitUntil(context, forwardBatch(env, batchId));
      row = await getBatch(env, batchId);
      return jsonResponse(buildQueuedStatus(row));
    }
    return jsonResponse({ ...result, accepted:true, relayAccepted:true });
  }catch(error){
    console.warn("Apps Script status check failed", error);
    return jsonResponse(buildQueuedStatus(row));
  }
}

async function processPendingBatches(env){
  const staleLease = new Date(Date.now() - FORWARD_LEASE_MS).toISOString();
  const rows = await env.DB.prepare(`
    SELECT batch_id
    FROM relay_batches
    WHERE status IN ('queued', 'retry')
      OR (status = 'forwarding' AND updated_at < ?1)
    ORDER BY accepted_at ASC
    LIMIT 10
  `).bind(staleLease).all();
  await Promise.allSettled(
    (rows?.results || []).map(row => forwardBatch(env, row.batch_id))
  );
  const cleanupBefore = new Date(
    Date.now() - CLEANUP_RETENTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  await env.DB.prepare(`
    DELETE FROM relay_batches
    WHERE status IN ('completed', 'failed') AND updated_at < ?1
  `).bind(cleanupBefore).run();
}

export default {
  async fetch(request, env, context){
    if(request.method === "OPTIONS") return jsonResponse({ ok:true });
    const url = new URL(request.url);
    if(request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")){
      const ready = isRelayReady(env);
      return jsonResponse({
        ok:ready,
        service:"harvestnavi-record-relay",
        ready
      }, ready ? 200 : 503);
    }
    if(request.method !== "POST" || url.pathname !== "/"){
      return jsonResponse({ ok:false, message:"見つかりません" }, 404);
    }
    if(!isRelayReady(env)){
      return jsonResponse({ ok:false, message:"中継サーバーの設定が完了していません" }, 503);
    }
    try{
      const payload = await readRequestJson(request);
      if(!await relayTokenMatches(payload?.token, env.RELAY_TOKEN_SHA256)){
        return jsonResponse({ ok:false, message:"中継サーバーの認証に失敗しました" }, 403);
      }
      if(payload.type === "harvest-day-batch-inbox"){
        return await enqueueBatch(payload, env, context);
      }
      if(payload.type === "harvest-day-batch-inbox-status"){
        return await checkBatchStatus(payload, env, context);
      }
      return jsonResponse({ ok:false, message:"中継サーバーで扱えない操作です" }, 400);
    }catch(error){
      return jsonResponse({ ok:false, message:String(error?.message || error) }, 400);
    }
  },

  async scheduled(_controller, env, context){
    context.waitUntil(processPendingBatches(env));
  }
};

export {
  checkBatchStatus,
  enqueueBatch,
  forwardBatch,
  processPendingBatches,
  relayTokenMatches,
  tokensMatch,
  validateBatchPayload,
  validateStatusPayload
};
