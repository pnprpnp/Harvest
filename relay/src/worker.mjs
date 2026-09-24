const MAX_REQUEST_BYTES = 1_000_000;
const MAX_BATCH_ITEMS = 100;
const FORWARD_TIMEOUT_MS = 30_000;
const FORWARD_LEASE_MS = 2 * 60 * 1000;
const CLEANUP_RETENTION_DAYS = 30;
const WEATHER_REFRESH_MS = 6 * 60 * 60 * 1000;
const WEATHER_REFRESH_LEASE_MS = 2 * 60 * 1000;
const WEATHER_RETRY_DELAYS_MS = [5 * 60 * 1000, 15 * 60 * 1000, 60 * 60 * 1000];
const WEATHER_HISTORY_MAX_DAYS = 5 * 365;
const JMA_REQUEST_TIMEOUT_MS = 45_000;
const JMA_OBSERVATION_URL = "https://www.data.jma.go.jp/risk/obsdl/show/table";
const JMA_STATION_URL = "https://www.data.jma.go.jp/risk/obsdl/top/station";
const JMA_FORECAST_BASE_URL = "https://www.jma.go.jp/bosai/forecast/data/forecast";

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

function isGrowthWeatherReady(env){
  return !!(
    env?.DB
    && /^[a-f0-9]{64}$/i.test(String(env?.RELAY_TOKEN_SHA256 || ""))
  );
}

function normalizeBatchId(value){
  const batchId = String(value || "").trim();
  return /^[A-Za-z0-9_-]{1,80}$/.test(batchId) ? batchId : "";
}

function normalizeGrowthWeatherLocation(value){
  if(!value || typeof value !== "object" || Array.isArray(value)) return null;
  const officeCode = String(value.officeCode || "").trim();
  const forecastAreaCode = String(value.forecastAreaCode || "").trim();
  const class20Code = String(value.class20Code || "").trim();
  if(!/^\d{6}$/.test(officeCode) || !/^\d{6}$/.test(forecastAreaCode) || !/^\d{7}$/.test(class20Code)){
    return null;
  }
  return {
    officeCode,
    forecastAreaCode,
    class20Code,
    name:String(value.name || "設定地点").trim().slice(0, 100) || "設定地点",
    admin1:String(value.admin1 || "").trim().slice(0, 100),
    forecastAreaName:String(value.forecastAreaName || "").trim().slice(0, 100)
  };
}

function getGrowthWeatherLocationKey(location){
  const normalized = normalizeGrowthWeatherLocation(location);
  return normalized
    ? `${normalized.officeCode}:${normalized.forecastAreaCode}`
    : "";
}

function parseDateKey(value){
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === match[0] ? date : null;
}

function formatDateKey(date){
  return new Date(date).toISOString().slice(0, 10);
}

function addDateKey(dateKey, days){
  const date = parseDateKey(dateKey);
  if(!date) return "";
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return formatDateKey(date);
}

function getJapanTodayKey(now = new Date()){
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function normalizeRequestedWeatherStartDate(value, now = new Date()){
  const todayKey = getJapanTodayKey(now);
  const earliestKey = addDateKey(todayKey, -WEATHER_HISTORY_MAX_DAYS);
  const requested = parseDateKey(value) ? String(value) : addDateKey(todayKey, -730);
  if(requested < earliestKey) return earliestKey;
  if(requested >= todayKey) return addDateKey(todayKey, -730);
  return requested;
}

function getGrowthWeatherRetryDelayMs(failureCount){
  const count = Math.max(1, Math.floor(Number(failureCount) || 1));
  return WEATHER_RETRY_DELAYS_MS[Math.min(count - 1, WEATHER_RETRY_DELAYS_MS.length - 1)];
}

function canAttemptGrowthWeatherRefresh(row, now = new Date()){
  if(String(row?.status || "") !== "retry") return true;
  const nextAttempt = new Date(String(row?.next_attempt_at || ""));
  return !Number.isFinite(nextAttempt.getTime()) || nextAttempt.getTime() <= now.getTime();
}

function validateGrowthWeatherPayload(payload, now = new Date()){
  if(payload?.app !== "Harvestnavi"
    || payload?.type !== "growth-weather"
    || payload?.action !== "getGrowthWeather"){
    throw new Error("気象データの要求形式が正しくありません");
  }
  const location = normalizeGrowthWeatherLocation(payload.location);
  if(!location) throw new Error("気象地点が正しくありません");
  return {
    location,
    locationKey:getGrowthWeatherLocationKey(location),
    requestedStartDate:normalizeRequestedWeatherStartDate(payload.requestedStartDate, now)
  };
}

function getJmaLightIndex(weatherCode){
  const group = Math.floor(Number(weatherCode) / 100);
  if(group === 1) return 1.12;
  if(group === 2) return 0.76;
  if(group === 3) return 0.52;
  if(group === 4) return 0.44;
  return 0.8;
}

function getJmaLightIndexFromSunshineHours(sunshineHours){
  const hours = Number(sunshineHours);
  if(!Number.isFinite(hours)) return null;
  return Math.max(0.3, Math.min(1.2, hours / 8));
}

function getJmaForecastNumber(value){
  if(value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function buildJmaForecastDaily(forecastPayload, location){
  const reports = Array.isArray(forecastPayload) ? forecastPayload : [];
  const shortReport = reports[0] || {};
  const weeklyReport = reports[1] || {};
  const dailyByDate = new Map();
  const ensureDay = dateKey => {
    if(!parseDateKey(dateKey)) return null;
    if(!dailyByDate.has(dateKey)) dailyByDate.set(dateKey, { date:dateKey, source:"forecast" });
    return dailyByDate.get(dateKey);
  };

  const weeklyWeatherSeries = (weeklyReport.timeSeries || []).find(series => (
    Array.isArray(series?.areas) && series.areas.some(area => Array.isArray(area?.weatherCodes))
  ));
  const weeklyWeatherArea = weeklyWeatherSeries?.areas?.find(area => area?.area?.code === location.officeCode)
    || weeklyWeatherSeries?.areas?.[0];
  (weeklyWeatherSeries?.timeDefines || []).forEach((time, index) => {
    const day = ensureDay(String(time || "").slice(0, 10));
    if(!day) return;
    const weatherCode = Number(weeklyWeatherArea?.weatherCodes?.[index]);
    if(Number.isFinite(weatherCode)){
      day.weatherCode = weatherCode;
      day.lightIndex = getJmaLightIndex(weatherCode);
    }
    day.reliability = String(weeklyWeatherArea?.reliabilities?.[index] || "");
  });

  const shortWeatherSeries = (shortReport.timeSeries || []).find(series => (
    Array.isArray(series?.areas) && series.areas.some(area => (
      area?.area?.code === location.forecastAreaCode && Array.isArray(area?.weatherCodes)
    ))
  ));
  const shortWeatherAreaIndex = Math.max(0, (shortWeatherSeries?.areas || []).findIndex(area => (
    area?.area?.code === location.forecastAreaCode
  )));
  const shortWeatherArea = shortWeatherSeries?.areas?.[shortWeatherAreaIndex];
  (shortWeatherSeries?.timeDefines || []).forEach((time, index) => {
    const day = ensureDay(String(time || "").slice(0, 10));
    if(!day) return;
    const weatherCode = Number(shortWeatherArea?.weatherCodes?.[index]);
    if(Number.isFinite(weatherCode)){
      day.weatherCode = weatherCode;
      day.lightIndex = getJmaLightIndex(weatherCode);
    }
  });

  const weeklyTempSeries = (weeklyReport.timeSeries || []).find(series => (
    Array.isArray(series?.areas) && series.areas.some(area => Array.isArray(area?.tempsMax))
  ));
  const weeklyTempArea = weeklyTempSeries?.areas?.[0];
  (weeklyTempSeries?.timeDefines || []).forEach((time, index) => {
    const day = ensureDay(String(time || "").slice(0, 10));
    if(!day) return;
    const minTemp = getJmaForecastNumber(weeklyTempArea?.tempsMin?.[index]);
    const maxTemp = getJmaForecastNumber(weeklyTempArea?.tempsMax?.[index]);
    if(minTemp !== null) day.minTemp = minTemp;
    if(maxTemp !== null) day.maxTemp = maxTemp;
  });

  const shortTempSeries = (shortReport.timeSeries || []).find(series => (
    Array.isArray(series?.areas) && series.areas.some(area => Array.isArray(area?.temps))
  ));
  const shortTempArea = shortTempSeries?.areas?.[shortWeatherAreaIndex] || shortTempSeries?.areas?.[0];
  (shortTempSeries?.timeDefines || []).forEach((time, index) => {
    const day = ensureDay(String(time || "").slice(0, 10));
    const temperature = getJmaForecastNumber(shortTempArea?.temps?.[index]);
    if(!day || temperature === null) return;
    const hour = Number(String(time || "").slice(11, 13));
    if(Number.isFinite(hour) && hour <= 6) day.minTemp = temperature;
    else day.maxTemp = temperature;
  });

  const normalArea = weeklyReport?.tempAverage?.areas?.[0] || {};
  const normalMin = getJmaForecastNumber(normalArea.min);
  const normalMax = getJmaForecastNumber(normalArea.max);
  const fallbackMin = normalMin === null ? 14 : normalMin;
  const fallbackMax = normalMax === null ? 24 : normalMax;
  const daily = [...dailyByDate.values()].map(day => {
    const hasMin = Number.isFinite(Number(day.minTemp));
    const hasMax = Number.isFinite(Number(day.maxTemp));
    const minTemp = hasMin ? Number(day.minTemp) : fallbackMin;
    const maxTemp = hasMax ? Number(day.maxTemp) : fallbackMax;
    return {
      ...day,
      minTemp,
      maxTemp,
      meanTemp:(minTemp + maxTemp) / 2,
      lightIndex:Number.isFinite(Number(day.lightIndex)) ? Number(day.lightIndex) : 0.8,
      estimatedTemperature:!hasMin || !hasMax
    };
  }).sort((left, right) => left.date.localeCompare(right.date));
  return {
    daily,
    station:{
      amedasCode:String(shortTempArea?.area?.code || weeklyTempArea?.area?.code || ""),
      name:String(shortTempArea?.area?.name || weeklyTempArea?.area?.name || "")
    },
    normal:{
      minTemp:fallbackMin,
      maxTemp:fallbackMax,
      meanTemp:(fallbackMin + fallbackMax) / 2,
      lightIndex:0.85
    }
  };
}

function parseJmaPastDailyCsv(text){
  return String(text || "").split(/\r?\n/).flatMap(line => {
    const columns = line.replace(/\r$/, "").split(",");
    if(columns.length < 5 || !/^\d{4}$/.test(columns[0])) return [];
    const year = Number(columns[0]);
    const month = Number(columns[1]);
    const dayOfMonth = Number(columns[2]);
    const date = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;
    const meanTempText = String(columns[3] || "").trim();
    const sunshineHoursText = String(columns[4] || "").trim();
    if(!meanTempText || !sunshineHoursText) return [];
    const meanTemp = Number(meanTempText);
    const sunshineHours = Number(sunshineHoursText);
    const lightIndex = getJmaLightIndexFromSunshineHours(sunshineHours);
    if(!parseDateKey(date) || !Number.isFinite(meanTemp) || !Number.isFinite(sunshineHours) || lightIndex === null){
      return [];
    }
    return [{ date, meanTemp, sunshineHours, lightIndex, source:"observation" }];
  });
}

function decodeHtmlText(value){
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseJmaPrefectureOptions(html){
  const items = [];
  const pattern = /<div class="prefecture"[^>]*>([^<]+)<input[^>]+name="prid"[^>]+value="(\d+)"/g;
  let match;
  while((match = pattern.exec(String(html || "")))){
    items.push({ name:decodeHtmlText(match[1]).trim(), code:match[2] });
  }
  return items;
}

function parseJmaStationOptions(html){
  const byId = new Map();
  const pattern = /<input[^>]+name="stid"[^>]+value="([^"]+)"[^>]*>\s*<input[^>]+name="stname"[^>]+value="([^"]+)"/g;
  let match;
  while((match = pattern.exec(String(html || "")))){
    const id = String(match[1] || "").trim();
    if(id && !byId.has(id)) byId.set(id, { id, name:decodeHtmlText(match[2]).trim() });
  }
  return [...byId.values()];
}

function normalizeJmaPlaceName(value){
  return String(value || "").normalize("NFKC").replace(/[\s　]/g, "")
    .replace(/(都|道|府|県|地方|管内)$/g, "");
}

function findJmaNamedOption(options, name){
  const target = normalizeJmaPlaceName(name);
  if(!target) return null;
  return options.find(item => normalizeJmaPlaceName(item.name) === target)
    || options.find(item => (
      normalizeJmaPlaceName(item.name).includes(target)
      || target.includes(normalizeJmaPlaceName(item.name))
    ))
    || null;
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

async function fetchWithTimeout(url, options = {}, timeoutMs = JMA_REQUEST_TIMEOUT_MS){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try{
    return await fetch(url, { ...options, signal:controller.signal });
  }finally{
    clearTimeout(timer);
  }
}

async function fetchJmaText(url, options = {}){
  const response = await fetchWithTimeout(url, options);
  if(!response.ok) throw new Error(`気象庁データを取得できません（HTTP ${response.status}）`);
  return await response.text();
}

async function fetchJmaFormText(url, values){
  return await fetchJmaText(url, {
    method:"POST",
    headers:{ "Content-Type":"application/x-www-form-urlencoded;charset=UTF-8" },
    body:new URLSearchParams(values)
  });
}

async function resolveJmaObservationStation(location, forecastStation){
  const prefectureHtml = await fetchJmaFormText(JMA_STATION_URL, { pd:"00" });
  const prefecture = findJmaNamedOption(parseJmaPrefectureOptions(prefectureHtml), location.admin1);
  if(!prefecture) throw new Error(`${location.admin1 || "設定地域"}の気象庁観測地点を特定できません`);
  const stationHtml = await fetchJmaFormText(JMA_STATION_URL, { pd:prefecture.code });
  const station = findJmaNamedOption(parseJmaStationOptions(stationHtml), forecastStation?.name);
  if(!station) throw new Error(`${forecastStation?.name || location.name}の気象庁観測地点を特定できません`);
  return station;
}

async function fetchJmaObservationDaily(stationId, startDate, endDate){
  if(!parseDateKey(startDate) || !parseDateKey(endDate) || startDate > endDate) return [];
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  const response = await fetchWithTimeout(JMA_OBSERVATION_URL, {
    method:"POST",
    headers:{ "Content-Type":"application/x-www-form-urlencoded;charset=UTF-8" },
    body:new URLSearchParams({
      stationNumList:JSON.stringify([stationId]),
      aggrgPeriod:"1",
      elementNumList:JSON.stringify([["201", ""], ["401", ""]]),
      interAnnualFlag:"1",
      interAnnualType:"1",
      ymdList:JSON.stringify([
        String(start.getUTCFullYear()),
        String(end.getUTCFullYear()),
        String(start.getUTCMonth() + 1),
        String(end.getUTCMonth() + 1),
        String(start.getUTCDate()),
        String(end.getUTCDate())
      ]),
      optionNumList:"[]",
      downloadFlag:"true",
      rmkFlag:"0",
      disconnectFlag:"0",
      youbiFlag:"0",
      fukenFlag:"0",
      kijiFlag:"0",
      huukouFlag:"0",
      csvFlag:"1",
      jikantaiFlag:"0",
      jikantaiList:"[1,24]",
      ymdLiteral:"0"
    })
  });
  if(!response.ok) throw new Error(`気象庁の過去データを取得できません（HTTP ${response.status}）`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  const daily = parseJmaPastDailyCsv(text);
  if(!daily.length) throw new Error("気象庁の過去データが空です");
  return daily;
}

async function getGrowthWeatherRow(env, locationKey){
  return await env.DB.prepare(`
    SELECT location_key, location_json, requested_start_date,
      station_id, station_name, station_amedas_code, daily_json, normal_json,
      forecast_end_date, history_start_date, history_through, status,
      failure_count, next_attempt_at,
      refreshed_at, last_attempt_at, last_error, created_at, updated_at
    FROM growth_weather_cache
    WHERE location_key = ?1
  `).bind(locationKey).first();
}

async function registerGrowthWeatherLocation(env, request){
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO growth_weather_cache (
      location_key, location_json, requested_start_date, daily_json, status,
      created_at, updated_at
    ) VALUES (?1, ?2, ?3, '[]', 'queued', ?4, ?4)
    ON CONFLICT(location_key) DO UPDATE SET
      location_json = excluded.location_json,
      requested_start_date = CASE
        WHEN excluded.requested_start_date < growth_weather_cache.requested_start_date
          THEN excluded.requested_start_date
        ELSE growth_weather_cache.requested_start_date
      END,
      updated_at = excluded.updated_at
  `).bind(
    request.locationKey,
    JSON.stringify(request.location),
    request.requestedStartDate,
    now
  ).run();
  return await getGrowthWeatherRow(env, request.locationKey);
}

function parseJsonValue(text, fallback){
  try{
    const value = JSON.parse(String(text || ""));
    return value ?? fallback;
  }catch(error){
    return fallback;
  }
}

function getWeatherRowDaily(row){
  const daily = parseJsonValue(row?.daily_json, []);
  return Array.isArray(daily) ? daily : [];
}

function isGrowthWeatherRowComplete(row, requestedStartDate, now = new Date()){
  const todayKey = getJapanTodayKey(now);
  const yesterdayKey = addDateKey(todayKey, -1);
  const refreshedAt = new Date(String(row?.refreshed_at || ""));
  return getWeatherRowDaily(row).length > 0
    && String(row?.history_start_date || "") <= requestedStartDate
    && String(row?.history_through || "") >= yesterdayKey
    && String(row?.forecast_end_date || "") >= todayKey
    && Number.isFinite(refreshedAt.getTime())
    && now.getTime() - refreshedAt.getTime() < WEATHER_REFRESH_MS;
}

function buildGrowthWeatherResponse(row, options = {}){
  const daily = getWeatherRowDaily(row);
  return {
    ok:true,
    provider:"jma",
    timezone:"Asia/Tokyo",
    fetchedAt:new Date(String(row?.refreshed_at || "")).getTime() || Date.now(),
    stale:options.stale === true,
    forecastEndDate:String(row?.forecast_end_date || ""),
    historyStartDate:String(row?.history_start_date || ""),
    historyThrough:String(row?.history_through || ""),
    station:{
      id:String(row?.station_id || ""),
      amedasCode:String(row?.station_amedas_code || ""),
      name:String(row?.station_name || "")
    },
    normal:parseJsonValue(row?.normal_json, {}),
    daily
  };
}

function getObservationNormal(daily, fallback){
  const observations = daily.filter(day => day?.source === "observation");
  const average = key => {
    const values = observations.map(day => Number(day?.[key])).filter(Number.isFinite);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  const meanTemp = average("meanTemp");
  const lightIndex = average("lightIndex");
  return {
    minTemp:Number.isFinite(Number(fallback?.minTemp)) ? Number(fallback.minTemp) : 14,
    maxTemp:Number.isFinite(Number(fallback?.maxTemp)) ? Number(fallback.maxTemp) : 24,
    meanTemp:Number.isFinite(meanTemp)
      ? meanTemp
      : (Number.isFinite(Number(fallback?.meanTemp)) ? Number(fallback.meanTemp) : 19),
    lightIndex:Number.isFinite(lightIndex)
      ? lightIndex
      : (Number.isFinite(Number(fallback?.lightIndex)) ? Number(fallback.lightIndex) : 0.85)
  };
}

async function updateGrowthWeatherFailure(env, locationKey, error){
  const row = await getGrowthWeatherRow(env, locationKey);
  const failureCount = Math.max(0, Number(row?.failure_count || 0)) + 1;
  const now = new Date();
  const nextAttemptAt = new Date(now.getTime() + getGrowthWeatherRetryDelayMs(failureCount)).toISOString();
  await env.DB.prepare(`
    UPDATE growth_weather_cache
    SET status = 'retry', failure_count = ?2, next_attempt_at = ?3,
      last_error = ?4, updated_at = ?5
    WHERE location_key = ?1
  `).bind(
    locationKey,
    failureCount,
    nextAttemptAt,
    String(error?.message || error || "気象データの更新に失敗しました").slice(0, 2000),
    now.toISOString()
  ).run();
}

async function refreshGrowthWeatherLocation(env, locationKey){
  const now = new Date();
  const nowIso = now.toISOString();
  const leaseCutoff = new Date(now.getTime() - WEATHER_REFRESH_LEASE_MS).toISOString();
  const lease = await env.DB.prepare(`
    UPDATE growth_weather_cache
    SET status = 'refreshing', last_attempt_at = ?2, updated_at = ?2, last_error = NULL
    WHERE location_key = ?1
      AND (status != 'refreshing' OR last_attempt_at IS NULL OR last_attempt_at < ?3)
  `).bind(locationKey, nowIso, leaseCutoff).run();
  if(Number(lease?.meta?.changes || 0) < 1) return await getGrowthWeatherRow(env, locationKey);

  let row = await getGrowthWeatherRow(env, locationKey);
  try{
    const location = normalizeGrowthWeatherLocation(parseJsonValue(row?.location_json, null));
    if(!location) throw new Error("保存済みの気象地点が正しくありません");
    const forecastResponse = await fetchWithTimeout(
      `${JMA_FORECAST_BASE_URL}/${encodeURIComponent(location.officeCode)}.json`,
      { headers:{ "User-Agent":"Harvestnavi/1.0 (+growth-weather-cache)" } }
    );
    if(!forecastResponse.ok){
      throw new Error(`気象庁の予報を取得できません（HTTP ${forecastResponse.status}）`);
    }
    const forecast = buildJmaForecastDaily(await forecastResponse.json(), location);
    if(!forecast.daily.length) throw new Error("気象庁の予報データが空です");

    let stationId = String(row?.station_id || "");
    let stationName = String(row?.station_name || forecast.station.name || "");
    if(!stationId){
      const resolved = await resolveJmaObservationStation(location, forecast.station);
      stationId = resolved.id;
      stationName = resolved.name;
    }

    const todayKey = getJapanTodayKey(now);
    const yesterdayKey = addDateKey(todayKey, -1);
    const requestedStartDate = normalizeRequestedWeatherStartDate(row?.requested_start_date, now);
    const existingDaily = getWeatherRowDaily(row);
    let historyStartDate = String(row?.history_start_date || "");
    let historyThrough = String(row?.history_through || "");
    let fetchStart = "";
    if(!historyStartDate || historyStartDate > requestedStartDate){
      fetchStart = requestedStartDate;
    }else if(!historyThrough || historyThrough < yesterdayKey){
      fetchStart = historyThrough ? addDateKey(historyThrough, -7) : requestedStartDate;
      if(fetchStart < requestedStartDate) fetchStart = requestedStartDate;
    }

    let observations = [];
    if(fetchStart && fetchStart <= yesterdayKey){
      observations = await fetchJmaObservationDaily(stationId, fetchStart, yesterdayKey);
      historyStartDate = !historyStartDate || requestedStartDate < historyStartDate
        ? requestedStartDate
        : historyStartDate;
      historyThrough = yesterdayKey;
    }

    const dailyByDate = new Map(existingDaily
      .filter(day => day?.source === "observation" && parseDateKey(day.date) && day.date >= requestedStartDate)
      .map(day => [day.date, day]));
    if(fetchStart){
      [...dailyByDate.keys()].forEach(date => {
        if(date >= fetchStart && date <= yesterdayKey) dailyByDate.delete(date);
      });
    }
    observations.forEach(day => dailyByDate.set(day.date, day));
    forecast.daily.forEach(day => dailyByDate.set(day.date, day));
    const daily = [...dailyByDate.values()].sort((left, right) => left.date.localeCompare(right.date));
    const normal = getObservationNormal(daily, forecast.normal);
    const forecastEndDate = forecast.daily[forecast.daily.length - 1]?.date || "";
    await env.DB.prepare(`
      UPDATE growth_weather_cache
      SET station_id = ?2, station_name = ?3, station_amedas_code = ?4,
        daily_json = ?5, normal_json = ?6, forecast_end_date = ?7,
        history_start_date = ?8, history_through = ?9, status = 'ready',
        failure_count = 0, next_attempt_at = NULL,
        refreshed_at = ?10, last_attempt_at = ?10, last_error = NULL, updated_at = ?10
      WHERE location_key = ?1
    `).bind(
      locationKey,
      stationId,
      stationName,
      String(forecast.station.amedasCode || row?.station_amedas_code || ""),
      JSON.stringify(daily),
      JSON.stringify(normal),
      forecastEndDate,
      historyStartDate || requestedStartDate,
      historyThrough || yesterdayKey,
      nowIso
    ).run();
    return await getGrowthWeatherRow(env, locationKey);
  }catch(error){
    await updateGrowthWeatherFailure(env, locationKey, error);
    throw error;
  }
}

async function getGrowthWeather(payload, env, context){
  const request = validateGrowthWeatherPayload(payload);
  let row = await registerGrowthWeatherLocation(env, request);
  if(isGrowthWeatherRowComplete(row, request.requestedStartDate)){
    return jsonResponse(buildGrowthWeatherResponse(row));
  }
  const cachedDaily = getWeatherRowDaily(row);
  const coversRequestedHistory = cachedDaily.length > 0
    && String(row?.history_start_date || "") <= request.requestedStartDate;
  if(coversRequestedHistory){
    if(canAttemptGrowthWeatherRefresh(row)){
      waitUntil(context, refreshGrowthWeatherLocation(env, request.locationKey));
    }
    return jsonResponse(buildGrowthWeatherResponse(row, { stale:true }));
  }
  if(!canAttemptGrowthWeatherRefresh(row)){
    throw new Error(`気象データを準備できませんでした。次回は${String(row.next_attempt_at || "しばらく後")}以降に再試行します`);
  }
  row = await refreshGrowthWeatherLocation(env, request.locationKey);
  if(!getWeatherRowDaily(row).length) throw new Error("気象データを準備できませんでした");
  return jsonResponse(buildGrowthWeatherResponse(row));
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

async function processGrowthWeatherSubscriptions(env){
  const nowIso = new Date().toISOString();
  const refreshBefore = new Date(Date.now() - WEATHER_REFRESH_MS).toISOString();
  const staleLease = new Date(Date.now() - WEATHER_REFRESH_LEASE_MS).toISOString();
  const rows = await env.DB.prepare(`
    SELECT location_key
    FROM growth_weather_cache
    WHERE status = 'queued'
      OR (status = 'retry' AND (next_attempt_at IS NULL OR next_attempt_at <= ?3))
      OR (status = 'refreshing' AND last_attempt_at < ?1)
      OR (status = 'ready' AND (refreshed_at IS NULL OR refreshed_at < ?2))
    ORDER BY updated_at ASC
    LIMIT 2
  `).bind(staleLease, refreshBefore, nowIso).all();
  await Promise.allSettled(
    (rows?.results || []).map(row => refreshGrowthWeatherLocation(env, row.location_key))
  );
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
        ready,
        growthWeatherReady:isGrowthWeatherReady(env)
      }, ready ? 200 : 503);
    }
    if(request.method === "POST" && url.pathname === "/weather"){
      if(!isGrowthWeatherReady(env)){
        return jsonResponse({ ok:false, message:"気象データ中継の設定が完了していません" }, 503);
      }
      try{
        const payload = await readRequestJson(request);
        if(!await relayTokenMatches(payload?.token, env.RELAY_TOKEN_SHA256)){
          return jsonResponse({ ok:false, message:"中継サーバーの認証に失敗しました" }, 403);
        }
        return await getGrowthWeather(payload, env, context);
      }catch(error){
        return jsonResponse({ ok:false, message:String(error?.message || error) }, 400);
      }
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
    context.waitUntil(Promise.allSettled([
      processPendingBatches(env),
      processGrowthWeatherSubscriptions(env)
    ]));
  }
};

export {
  checkBatchStatus,
  enqueueBatch,
  forwardBatch,
  buildJmaForecastDaily,
  canAttemptGrowthWeatherRefresh,
  getGrowthWeatherRetryDelayMs,
  getJmaLightIndexFromSunshineHours,
  parseJmaPastDailyCsv,
  parseJmaPrefectureOptions,
  parseJmaStationOptions,
  processPendingBatches,
  processGrowthWeatherSubscriptions,
  relayTokenMatches,
  tokensMatch,
  validateBatchPayload,
  validateGrowthWeatherPayload,
  validateStatusPayload
};
