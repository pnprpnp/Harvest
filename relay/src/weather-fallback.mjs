// Missing-field supplements only. Native JMA values and the JMA horizon win.
export const WEATHER_POLICY = "provider-fallback-v1";
const DAY = 86400000, HOUR = 3600000;
const FIELDS = ["meanTemp", "minTemp", "maxTemp", "lightIndex"];
const number = value => typeof value === "number" && Number.isFinite(value) ? value : null;
const dateAt = time => new Date(time + 9 * HOUR).toISOString().slice(0, 10);
const addDays = (date, days) => new Date(Date.parse(date + "T00:00:00Z") + days * DAY).toISOString().slice(0, 10);
const clamp = value => Math.max(0.3, Math.min(1.2, value));
export function validField(field, value){
  const n = number(value);
  return n !== null && (field === "lightIndex" ? n >= 0 && n <= 2 : n >= -40 && n <= 55);
}
export function prepareJmaDay(raw){
  const day = {...raw, provider:"jma", weatherPolicy:WEATHER_POLICY,
    fallbackUsed:false, fallbackProvider:null, estimated:false, fallbackFields:[], fieldSources:{},
    minTemp:raw.minTemp ?? null, maxTemp:raw.maxTemp ?? null, meanTemp:raw.meanTemp ?? null, lightIndex:raw.lightIndex ?? null};
  // Legacy cached forecasts can contain synthetic extrema. They are not JMA.
  if(raw.source === "forecast" && raw.estimatedTemperature){
    if(!raw.minTempIssuedAt) day.minTemp = null;
    if(!raw.maxTempIssuedAt) day.maxTemp = null;
    day.meanTemp = null;
  }
  if(raw.source === "forecast" && raw.estimatedLight) day.lightIndex = null;
  for(const field of FIELDS){
    if(!validField(field, day[field])) day[field] = null;
    day.fieldSources[field] = {provider:"jma", estimated:false,
      issuedAt:raw.source === "forecast" ? (field === "lightIndex" ? raw.lightIssuedAt : raw[`${field}IssuedAt`]) || raw.issuedAt : null,
      retrievedAt:raw.retrievedAt || null, value:day[field]};
  }
  day.jmaValues = Object.fromEntries(FIELDS.map(field => [field, day[field]]));
  day.jmaFieldSources = {...day.fieldSources};
  day.estimatedTemperature = day.meanTemp === null;
  day.estimatedLight = day.lightIndex === null;
  return day;
}
export function supplementDay(day, fallback){
  if(!fallback) return day;
  const result = {...day, fieldSources:{...day.fieldSources}, fallbackFields:[...(day.fallbackFields || [])]};
  for(const field of FIELDS){
    if(validField(field, result[field]) || !validField(field, fallback[field])) continue;
    result[field] = fallback[field];
    result.fieldSources[field] = {...fallback.fieldSources[field], value:fallback[field],
      ...(field !== "lightIndex" ? {temperatureSet:{meanTemp:fallback.meanTemp,minTemp:fallback.minTemp,maxTemp:fallback.maxTemp}} : {})};
    if(!result.fallbackFields.includes(field)) result.fallbackFields.push(field);
  }
  result.fallbackUsed = result.fallbackFields.length > 0;
  result.fallbackProvider = result.fallbackUsed ? fallback.fallbackProvider : null;
  result.retrievedAt = result.retrievedAt || result.fallbackFields.map(field => result.fieldSources[field]?.retrievedAt).filter(Boolean).sort().at(-1) || null;
  result.estimated = result.fallbackUsed;
  result.estimatedTemperature = ["meanTemp", "minTemp", "maxTemp"].some(field => result.fallbackFields.includes(field)) || result.meanTemp === null;
  result.estimatedLight = result.fallbackFields.includes("lightIndex") || result.lightIndex === null;
  if(result.fallbackFields.includes("meanTemp")) result.temperatureSource = `${result.fallbackProvider}-hourly-reference`;
  if(result.fallbackFields.includes("lightIndex")) result.lightSource = result.fallbackProvider === "nasa-power" ? "relative-solar-radiation" : "cloud-cover-reference";
  result.mixedTemperatureSources = new Set(["meanTemp","minTemp","maxTemp"].map(field => result.fieldSources[field]?.provider).filter(Boolean)).size > 1;
  return result;
}
export function reuseJmaForecast(day, previous){
  if(!previous || previous.source !== "forecast") return day;
  const original = previous.jmaValues ? {...previous, ...previous.jmaValues, fieldSources:previous.jmaFieldSources} : prepareJmaDay(previous);
  const result = {...day, fieldSources:{...day.fieldSources}};
  for(const field of FIELDS){
    if(!validField(field, result[field]) && validField(field, original[field])){
      result[field] = original[field];
      result.fieldSources[field] = original.fieldSources[field];
    }
  }
  if(result.meanTemp === null && result.minTemp !== null && result.maxTemp !== null && result.minTemp <= result.maxTemp){
    result.meanTemp = (result.minTemp + result.maxTemp) / 2;
    result.fieldSources.meanTemp = {provider:"jma", estimated:false, value:result.meanTemp,
      issuedAt:[result.fieldSources.minTemp.issuedAt, result.fieldSources.maxTemp.issuedAt].filter(Boolean).sort().at(-1),
      retrievedAt:[result.fieldSources.minTemp.retrievedAt, result.fieldSources.maxTemp.retrievedAt].filter(Boolean).sort().at(-1),
      formula:"(JMA minTemp + JMA maxTemp) / 2"};
  }
  result.jmaValues = Object.fromEntries(FIELDS.map(field => [field, result[field]]));
  result.jmaFieldSources = {...result.fieldSources};
  result.estimatedTemperature = result.meanTemp === null;
  result.estimatedLight = result.lightIndex === null;
  return result;
}
export function parseNasaHourly(payload, startDate, endDate, retrievedAt){
  if(payload?.header?.time_standard !== "UTC") return [];
  const parameters = payload.properties?.parameter || {}, units = payload.parameters || {};
  const fill = payload.header.fill_value ?? -999;
  const solarUnit = units.ALLSKY_SFC_SW_DWN?.units;
  const clearUnit = units.CLRSKY_SFC_SW_DWN?.units;
  const valid = (key, stamp) => {
    const value = number(parameters[key]?.[stamp]);
    return value !== null && value !== fill ? value : null;
  };
  const daily = [];
  for(let date = startDate; date <= endDate; date = addDays(date, 1)){
    const midnight = Date.parse(date + "T00:00:00+09:00");
    const values = key => Array.from({length:24}, (_, hour) => {
      const stamp = new Date(midnight + hour * HOUR).toISOString().slice(0, 13).replace(/[-T]/g, "");
      return valid(key, stamp);
    });
    const temps = values("T2M"), solar = values("ALLSKY_SFC_SW_DWN"), clear = values("CLRSKY_SFC_SW_DWN");
    const hasTemps = /^(C|celsius)$/i.test(units.T2M?.units || "") && temps.every(v => validField("meanTemp", v));
    const solarUnitsKnown = ["MJ/hr", "MJ/m^2/hr", "Wh/m^2", "W/m^2"].includes(solarUnit) && solarUnit === clearUnit;
    const hasLight = solarUnitsKnown && solar.every(v => v !== null && v >= 0) && clear.every(v => v !== null && v >= 0);
    const sum = list => list.reduce((total, value) => total + value, 0);
    const totalSolar = hasLight ? sum(solar) : null, totalClear = hasLight ? sum(clear) : null;
    const lightIndex = totalClear > 0 ? clamp(1.12 * totalSolar / totalClear) : null;
    const common = {provider:"nasa-power", estimated:true, retrievedAt, availableAt:retrievedAt, timeStandard:"Asia/Tokyo (24 UTC hours)",
      originalTimeStandard:"UTC", grid:true, sources:payload.header.sources || []};
    const day = {date, source:"observation", provider:"nasa-power", fallbackProvider:"nasa-power", estimated:true,
      meanTemp:hasTemps ? sum(temps) / 24 : null, minTemp:hasTemps ? Math.min(...temps) : null,
      maxTemp:hasTemps ? Math.max(...temps) : null, lightIndex, retrievedAt, fieldSources:{}};
    for(const field of FIELDS) day.fieldSources[field] = {...common,
      parameter:field === "lightIndex" ? "ALLSKY_SFC_SW_DWN,CLRSKY_SFC_SW_DWN" : "T2M", unit:field === "lightIndex" ? solarUnit : units.T2M?.units,
      formula:field === "lightIndex" ? "clamp(1.12 * sum(ALLSKY_SFC_SW_DWN) / sum(CLRSKY_SFC_SW_DWN), 0.3, 1.2)"
        : `${{meanTemp:"mean", minTemp:"min", maxTemp:"max"}[field]}(24 hourly T2M values in JST)`,
      ...(field === "lightIndex" ? {rawSolarTotal:totalSolar, rawClearSkyTotal:totalClear, sunshineHours:null} : {})};
    if(FIELDS.some(field => validField(field, day[field]))) daily.push(day);
  }
  return daily;
}
export function parseJmaTodayPoints(payload, today, retrievedAt){
  return Object.entries(payload || {}).flatMap(([key,item]) => {
    if(!/^\d{14}$/.test(key) || key.slice(0,8) !== today.replaceAll("-","") || item?.temp?.[1] !== 0
      || !validField("meanTemp",item.temp[0])) return [];
    const time = Date.parse(`${today}T${key.slice(8,10)}:${key.slice(10,12)}:${key.slice(12,14)}+09:00`);
    return Number.isFinite(time) && time <= Date.parse(retrievedAt) ? [{time,air_temperature:item.temp[0],provider:"jma",retrievedAt}] : [];
  });
}
export function parseMetForecast(payload, retrievedAt, todayObservations = [], asOf = retrievedAt){
  const issuedAt = payload?.properties?.meta?.updated_at;
  if(!Number.isFinite(Date.parse(issuedAt)) || Date.parse(issuedAt) > Date.parse(retrievedAt)) return [];
  const units = payload.properties.meta.units || {};
  let points = (payload.properties.timeseries || []).map(item => ({time:Date.parse(item.time), ...item.data?.instant?.details}))
    .filter(item => Number.isFinite(item.time)).sort((a,b) => a.time - b.time);
  const firstForecast = points[0]?.time, today = dateAt(Date.parse(asOf));
  const observations = todayObservations.filter(point => point.provider === "jma" && dateAt(point.time) === today
    && point.time < firstForecast && point.time <= Date.parse(asOf) && Date.parse(point.retrievedAt) <= Date.parse(asOf)
    && validField("meanTemp",point.air_temperature));
  points = [...observations, ...points].sort((a,b) => a.time - b.time);
  const dates = [...new Set(points.map(item => dateAt(item.time)))];
  const daily = [];
  for(const date of dates){
    const start = Date.parse(date + "T00:00:00+09:00"), end = start + DAY;
    let hours = 0, observationHours = 0, thermal = 0, cloudHours = 0, cloudTotal = 0, min = Infinity, max = -Infinity;
    let coveredStart = null, coveredEnd = null;
    for(let i = 0; i < points.length - 1; i++){
      const left = points[i], right = points[i + 1], from = Math.max(start, left.time), to = Math.min(end, right.time);
      if(to <= from || right.time - left.time > 6 * HOUR || right.time === left.time) continue;
      if(left.provider === "jma" && right.time - left.time > HOUR) continue;
      if(!validField("meanTemp", left.air_temperature) || !validField("meanTemp", right.air_temperature)) continue;
      const interpolate = (a,b,time) => a + (b - a) * (time - left.time) / (right.time - left.time);
      const first = interpolate(left.air_temperature, right.air_temperature, from), last = interpolate(left.air_temperature, right.air_temperature, to);
      const duration = (to - from) / HOUR;
      thermal += (first + last) / 2 * duration; hours += duration;
      if(left.provider === "jma" && right.provider === "jma") observationHours += duration;
      min = Math.min(min, first, last); max = Math.max(max, first, last);
      coveredStart = coveredStart === null ? from : Math.min(coveredStart, from); coveredEnd = to;
      const a = number(left.cloud_area_fraction), b = number(right.cloud_area_fraction);
      if(a !== null && b !== null && a >= 0 && a <= 100 && b >= 0 && b <= 100){
        cloudTotal += (interpolate(a,b,from) + interpolate(a,b,to)) / 2 * duration; cloudHours += duration;
      }
    }
    // A partial forecast cannot stand in for the entire day's temperature.
    // Today can join already observed JMA temperatures to the remaining forecast.
    const complete = Math.abs(hours - 24) < 1e-6;
    if(!complete) continue;
    const observationRetrievedAt = observationHours > 0 ? observations.map(point => point.retrievedAt).sort().at(-1) : null;
    const common = {provider:"met-no", estimated:true, issuedAt, retrievedAt, availableAt:[retrievedAt,observationRetrievedAt].filter(Boolean).sort().at(-1),
      timeStandard:"Asia/Tokyo", coverageHours:hours, completeDailyCoverage:complete,
      jmaObservationHours:observationHours, forecastCoverageHours:hours - observationHours,
      ...(observationHours > 0 ? {observationProvider:"jma",observationRetrievedAt} : {}),
      periodStart:new Date(coveredStart).toISOString(), periodEnd:new Date(coveredEnd).toISOString()};
    const lightIndex = units.cloud_area_fraction === "%" && Math.abs(cloudHours - hours) < 1e-6
      ? clamp(1.12 - 0.6 * (cloudTotal / cloudHours) / 100) : null;
    const hasTemperature = units.air_temperature === "celsius";
    const day = {date, source:"forecast", provider:"met-no", fallbackProvider:"met-no", issuedAt, retrievedAt,
      meanTemp:hasTemperature ? thermal / hours : null, minTemp:hasTemperature ? min : null, maxTemp:hasTemperature ? max : null, lightIndex, fieldSources:{}};
    for(const field of FIELDS) day.fieldSources[field] = {...common, parameter:field === "lightIndex" ? "cloud_area_fraction" : "air_temperature",
      unit:field === "lightIndex" ? "%" : "celsius", formula:field === "lightIndex" ? "clamp(1.12 - 0.6 * timeWeightedMeanCloudPercent / 100, 0.3, 1.2)"
        : `${{meanTemp:"time-weighted mean", minTemp:"min", maxTemp:"max"}[field]}(piecewise-linear ${observationHours > 0 ? "JMA observed + MET forecast" : "MET forecast"} temperatures in JST day)`};
    daily.push(day);
  }
  return daily;
}
export async function fetchWeatherFallbacks({daily, existingDaily = [], forecastEndDate, today, startDate, coordinates, cache = {}, request, now = new Date(), clock = () => now}){
  const errors = [], nextCache = {...cache};
  const byDate = new Map(daily.map(raw => [raw.date, raw.weatherPolicy ? raw : prepareJmaDay(raw)]));
  const previous = new Map(existingDaily.map(day => [day.date, day]));
  for(const [date, day] of byDate){
    if(day.source === "forecast" && date >= today && date <= forecastEndDate) byDate.set(date, reuseJmaForecast(day, previous.get(date)));
  }
  if(!coordinates){ errors.push("補完用の気象観測地点の緯度・経度を取得できません"); return {daily:[...byDate.values()], cache:nextCache, errors}; }
  const needs = (day, provider) => FIELDS.some(field => !validField(field, day[field])
    || day.fieldSources?.[field]?.provider === provider);
  const nasaMissing = [];
  for(let date = startDate; date < today; date = addDays(date, 1)){
    const day = byDate.get(date);
    if(!day || needs(day, "nasa-power")) nasaMissing.push(date);
  }
  const nasa = {...cache.nasa, daily:[...(cache.nasa?.daily || [])]};
  const nasaByDate = new Map(nasa.daily.map(day => [day.date, day]));
  const pending = nasaMissing.filter(date => FIELDS.some(field => {
    const native = byDate.get(date);
    const needed = !validField(field, native?.[field]) || native?.fieldSources?.[field]?.provider === "nasa-power";
    return needed && !validField(field, nasaByDate.get(date)?.[field]);
  }));
  const requestDate = pending.find(date => date > (nasa.checkedThrough || "")) || pending[0];
  if(requestDate && (!nasa.nextAttemptAt || Date.parse(nasa.nextAttemptAt) <= now.getTime())){
    const end = [addDays(requestDate, 30), addDays(today, -1)].sort()[0];
    const url = new URL("https://power.larc.nasa.gov/api/temporal/hourly/point");
    for(const [key,value] of Object.entries({parameters:"T2M,ALLSKY_SFC_SW_DWN,CLRSKY_SFC_SW_DWN", community:"AG",
      latitude:coordinates.latitude, longitude:coordinates.longitude, start:addDays(requestDate, -1).replaceAll("-", ""), end:end.replaceAll("-", ""), format:"JSON", "time-standard":"UTC"})) url.searchParams.set(key, value);
    try{
      const response = await request(url.toString(), {headers:{"User-Agent":"Harvestnavi/1.0 https://github.com/pnprpnp/Harvest"}}, 15000);
      if(!response.ok) throw new Error(`NASA POWER HTTP ${response.status}`);
      const payload = await response.json();
      for(const day of parseNasaHourly(payload, requestDate, end, clock().toISOString())) nasaByDate.set(day.date, day);
      nasa.lastError = "";
    }catch(error){ nasa.lastError = String(error?.message || error); errors.push(nasa.lastError); }
    nasa.nextAttemptAt = new Date(now.getTime() + DAY).toISOString();
    nasa.checkedThrough = end;
  }
  for(const date of nasaMissing){
    const native = byDate.get(date) || prepareJmaDay({date,source:"observation"});
    const fallback = nasaByDate.get(date) || previous.get(date);
    byDate.set(date, supplementDay(native, fallback?.fallbackProvider === "nasa-power" ? fallback : null));
  }
  const neededDates = new Set(nasaMissing);
  nasa.daily = [...nasaByDate.values()].filter(day => neededDates.has(day.date));
  nextCache.nasa = nasa;
  const metMissing = [];
  for(let date = today; forecastEndDate && date <= forecastEndDate; date = addDays(date, 1)){
    const day = byDate.get(date);
    if(!day || needs(day, "met-no")) metMissing.push(date);
  }
  // Seek a complete same-day JMA observation prefix before forecasting its
  // missing temperature set. The native daily forecast fields still win.
  let jmaToday = cache.jmaToday?.date === today ? {...cache.jmaToday} : {date:today,points:[],chunks:[]};
  const todayDay = byDate.get(today);
  const todayNeedsTemperature = metMissing.includes(today) && ["meanTemp","minTemp","maxTemp"].some(field =>
    !validField(field,todayDay?.[field]) || todayDay?.fieldSources?.[field]?.provider === "met-no");
  if(todayNeedsTemperature && coordinates.stationCode){
    const japanHour = new Date(now.getTime() + 9 * HOUR).getUTCHours();
    const chunks = Array.from({length:Math.floor(japanHour / 3) + 1},(_,index) => index * 3)
      .filter(hour => hour === Math.floor(japanHour / 3) * 3 || !jmaToday.chunks.includes(hour));
    const results = await Promise.allSettled(chunks.map(async hour => {
      const url = `https://www.jma.go.jp/bosai/amedas/data/point/${encodeURIComponent(coordinates.stationCode)}/${today.replaceAll("-","")}_${String(hour).padStart(2,"0")}.json`;
      const response = await request(url,{},15000);
      if(!response.ok) throw new Error(`気象庁の当日時間別観測 HTTP ${response.status}`);
      const payload = await response.json();
      return {hour,points:parseJmaTodayPoints(payload,today,clock().toISOString())};
    }));
    const pointByTime = new Map((jmaToday.points || []).map(point => [point.time,point]));
    results.forEach(result => {
      if(result.status !== "fulfilled"){errors.push(String(result.reason?.message || result.reason));return;}
      result.value.points.forEach(point => pointByTime.set(point.time,point));
      if(result.value.points.length && result.value.hour < Math.floor(japanHour / 3) * 3 && !jmaToday.chunks.includes(result.value.hour)) jmaToday.chunks.push(result.value.hour);
    });
    jmaToday.points = [...pointByTime.values()].sort((a,b) => a.time - b.time);
  }
  nextCache.jmaToday = jmaToday;
  let met = {...cache.met};
  if(metMissing.length && (!met.expiresAt || Date.parse(met.expiresAt) <= now.getTime())){
    const url = new URL("https://api.met.no/weatherapi/locationforecast/2.0/compact");
    url.searchParams.set("lat", Math.trunc(coordinates.latitude * 10000) / 10000);
    url.searchParams.set("lon", Math.trunc(coordinates.longitude * 10000) / 10000);
    try{
      const response = await request(url.toString(), {headers:{"User-Agent":"Harvestnavi/1.0 https://github.com/pnprpnp/Harvest", "Accept":"application/json",
        ...(met.lastModified ? {"If-Modified-Since":met.lastModified} : {})}}, 15000);
      if(response.status !== 304 && !response.ok) throw new Error(`MET Norway HTTP ${response.status}`);
      if(response.status !== 304){
        const payload = await response.json(), retrievedAt = clock().toISOString();
        // Keep only the compact fields needed to rejoin today's JMA prefix on 304.
        met.payload = {properties:{meta:payload?.properties?.meta,timeseries:(payload?.properties?.timeseries || []).map(item =>
          ({time:item.time,data:{instant:{details:{air_temperature:item.data?.instant?.details?.air_temperature,
            cloud_area_fraction:item.data?.instant?.details?.cloud_area_fraction}}}}))}};
        met.retrievedAt = retrievedAt;
      }
      met.lastModified = response.headers.get("Last-Modified") || met.lastModified;
      met.expiresAt = response.headers.get("Expires") || new Date(now.getTime() + HOUR).toISOString();
      if(Date.parse(met.expiresAt) <= now.getTime()) met.expiresAt = new Date(now.getTime() + 60000).toISOString();
      met.lastError = "";
    }catch(error){met.lastError = String(error?.message || error);errors.push(met.lastError);met.expiresAt = new Date(now.getTime() + HOUR).toISOString();}
  }
  if(met.payload) met.daily = parseMetForecast(met.payload,met.retrievedAt,jmaToday.points,clock().toISOString());
  const metByDate = new Map((met.daily || []).map(day => [day.date, day]));
  for(const date of metMissing){
    const native = byDate.get(date) || prepareJmaDay({date,source:"forecast"});
    const supplemented = supplementDay(native, metByDate.get(date));
    supplemented.jmaForecastEndDate = forecastEndDate;
    supplemented.issuedAt = native.issuedAt || metByDate.get(date)?.issuedAt || null;
    byDate.set(date, supplemented);
  }
  nextCache.met = met;
  return {daily:[...byDate.values()].sort((a,b) => a.date.localeCompare(b.date)), cache:nextCache,
    errors:[...new Set([...errors, nasaMissing.length && nasa.lastError, metMissing.length && met.lastError].filter(Boolean))]};
}
