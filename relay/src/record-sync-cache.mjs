// A bounded cache of verified sync pages. Sheets remains the source of truth.
export const RECORD_SYNC_CACHE_MAX_AGE_MS = 60_000;
const CACHE_MAX_BYTES = 1_000_000;
const CACHE_MAX_PAGES = 64;

function canonicalJson(value){
  if(Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if(value && typeof value === "object"){
    return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonicalJson(value[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}

function revision(value){
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function normalizeRelayRecordSyncRequest(payload, sourceUrl){
  if(payload?.app !== "Harvestnavi" || payload.type !== "harvest-sync-all"
    || payload.action !== "syncAll" || payload.version !== 1){
    throw new Error("中継受信のリクエストが正しくありません");
  }
  if(String(payload.sourceUrl || "").replace(/\/+$/, "") !== sourceUrl.replace(/\/+$/, "")){
    throw new Error("中継とGoogleの接続先が一致しません");
  }
  if(payload.syncRevision !== null && revision(payload.syncRevision) === null){
    throw new Error("中継受信の同期番号が正しくありません");
  }
  // Preserve legacy reconstruction conditions in both the request and cache key.
  const request = {app:"Harvestnavi", type:"harvest-sync-all", action:"syncAll", version:1,
    syncRevision:payload.syncRevision, revisionReset:payload.revisionReset === true,
    cursor:payload.cursor || null, plantingCursor:payload.plantingCursor || null,
    fallbackSeedlingLossRate:payload.fallbackSeedlingLossRate ?? 0,
    fallbackSeedlingPattern:payload.fallbackSeedlingPattern ?? [120,120,120],
    fallbackPlantingCountsByBed:payload.fallbackPlantingCountsByBed ?? {},
    limit:payload.limit ?? 1000, plantingLimit:payload.plantingLimit ?? 1000};
  if(!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 1000
    || !Number.isInteger(request.plantingLimit) || request.plantingLimit < 1 || request.plantingLimit > 1000){
    throw new Error("中継受信の取得件数が正しくありません");
  }
  return request;
}

function validateSyncResult(result){
  if(result?.ok !== true || result.revisionSync !== true || !Array.isArray(result.records)
    || !Array.isArray(result.events) || revision(result.nextSyncRevision ?? result.syncRevision) === null
    || revision(result.currentSyncRevision) === null){
    throw new Error("Googleの中継受信応答を確認できません");
  }
  if((result.nextSyncRevision ?? result.syncRevision) > result.currentSyncRevision){
    throw new Error("Googleの中継受信応答の同期番号が一致しません");
  }
  for(const field of ["deletedRecords","deletedRecordUuids","deletedRecordIds","deletedEventIds"]){
    if(result[field] !== undefined && !Array.isArray(result[field])) throw new Error("Googleの削除記録を確認できません");
  }
  return result;
}

function cacheStatement(env, key, scope, generation, result, checkedAt){
  const text = JSON.stringify(result);
  if(new TextEncoder().encode(text).length > CACHE_MAX_BYTES) return null;
  return env.DB.prepare(`
    INSERT INTO relay_record_sync_pages (cache_key, scope_key, generation, response_json, checked_at)
    SELECT ?1, ?2, ?3, ?4, ?5
    WHERE (SELECT generation FROM relay_record_sync_state WHERE id = 'current') = ?3
    ON CONFLICT(cache_key) DO UPDATE SET response_json = excluded.response_json,
      checked_at = excluded.checked_at
    WHERE excluded.checked_at >= relay_record_sync_pages.checked_at
      AND json_extract(excluded.response_json, '$.currentSyncRevision')
        >= json_extract(relay_record_sync_pages.response_json, '$.currentSyncRevision')
  `).bind(key, scope, generation, text, checkedAt);
}

async function storeVerifiedPage(env, request, result, scope, generation, checkedAt, hash){
  const key = await hash(scope + ":" + generation + ":" + canonicalJson(request));
  const statements = [cacheStatement(env, key, scope, generation, result, checkedAt)].filter(Boolean);
  const head = result.currentSyncRevision;
  if(result.hasMore !== true && result.plantingHasMore !== true
    && (result.nextSyncRevision ?? result.syncRevision) === head){
    // A device already at this confirmed revision has no changes to receive.
    const empty = {ok:true, revisionSync:true, syncRevision:head, currentSyncRevision:head,
      nextSyncRevision:head, records:[], events:[], deletedRecords:[], deletedRecordUuids:[],
      deletedRecordIds:[], deletedEventIds:[], hasMore:false, plantingHasMore:false};
    const headRequest = {...request, syncRevision:head, revisionReset:false, cursor:null, plantingCursor:null};
    const headKey = await hash(scope + ":" + generation + ":" + canonicalJson(headRequest));
    if(headKey !== key) statements.push(cacheStatement(env, headKey, scope, generation, empty, checkedAt));
  }
  statements.push(env.DB.prepare(`DELETE FROM relay_record_sync_pages
    WHERE cache_key IN (SELECT cache_key FROM relay_record_sync_pages
      ORDER BY checked_at DESC, cache_key LIMIT -1 OFFSET ?1)` ).bind(CACHE_MAX_PAGES));
  await env.DB.batch(statements);
}

export async function invalidateRelayRecordSyncCache(env){
  // Generation fencing prevents an older in-flight read repopulating a new cache.
  await env.DB.prepare("UPDATE relay_record_sync_state SET generation = generation + 1 WHERE id = 'current'").run();
}

export async function cleanupRelayRecordSyncCache(env, now = Date.now()){
  await env.DB.prepare("DELETE FROM relay_record_sync_pages WHERE checked_at < ?1")
    .bind(now - 2 * RECORD_SYNC_CACHE_MAX_AGE_MS).run();
}

export async function getRelayRecordSync(payload, env, dependencies){
  const request = normalizeRelayRecordSyncRequest(payload, String(env.APPS_SCRIPT_URL));
  const {hash, post, now = Date.now} = dependencies;
  const state = await env.DB.prepare("SELECT generation FROM relay_record_sync_state WHERE id = 'current'").first();
  if(!state || revision(state.generation) === null) throw new Error("中継受信の初期設定が完了していません");
  const scope = await hash(canonicalJson({url:env.APPS_SCRIPT_URL, tokenHash:env.RELAY_TOKEN_SHA256,
    clientTokenHash:await hash(payload.token)}));
  const key = await hash(scope + ":" + state.generation + ":" + canonicalJson(request));
  const row = await env.DB.prepare(`SELECT response_json, checked_at FROM relay_record_sync_pages
    WHERE cache_key = ?1 AND generation = (SELECT generation FROM relay_record_sync_state WHERE id = 'current')`
  ).bind(key).first();
  const startedAt = now();
  if(payload.forceFresh !== true && row && startedAt >= row.checked_at
    && startedAt - row.checked_at < RECORD_SYNC_CACHE_MAX_AGE_MS){
    try{
      const result = validateSyncResult(JSON.parse(row.response_json));
      return {...result, relayCache:{hit:true, checkedAt:new Date(row.checked_at).toISOString(),
        maxAgeMs:RECORD_SYNC_CACHE_MAX_AGE_MS}};
    }catch(error){
      console.warn("中継受信の保存内容を再取得します", error.message);
    }
  }
  // Use the caller's Google token, retaining Google's administrator-only read check.
  // The relay's existing worker token must never be elevated to full-history access.
  const result = validateSyncResult(await post(request, payload.token));
  try{
    await storeVerifiedPage(env, request, result, scope, state.generation, startedAt, hash);
  }catch(error){
    // Cache/storage limits never turn a successful Google read into a failed import.
    console.warn("中継受信結果を再利用用に保存できませんでした", error.message);
  }
  return {...result, relayCache:{hit:false, checkedAt:new Date(startedAt).toISOString(),
    maxAgeMs:RECORD_SYNC_CACHE_MAX_AGE_MS}};
}
