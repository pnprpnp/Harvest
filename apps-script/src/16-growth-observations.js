// Independent crop-ready observations. Neither planting/harvest records nor their
// sync revisions are mutated. Tombstones remain in this dedicated sheet.
function normalizeGrowthObservationInteger(value, label, minimum, maximum) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(label + "が範囲外です");
  }
  return value;
}

function normalizeGrowthObservationTimestamp(value, label, optional) {
  if (optional && value === "") return "";
  if (typeof value !== "string" || value.length > 40 || !value) {
    throw new Error(label + "はISO日時で指定してください");
  }
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);
  if (!match || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) {
    throw new Error(label + "の形式が正しくありません");
  }
  normalizeRequiredDate(match[1], label);
  return normalizeOptionalTimestamp(value, label);
}

function normalizeGrowthObservationEnum(value, choices, label) {
  if (!choices.includes(value)) throw new Error(label + "が範囲外です");
  return value;
}

function normalizeGrowthObservationText(value, label, maximum, required) {
  if (!required && value === undefined) return undefined;
  if (typeof value !== "string" || value.length > maximum || value.includes("\u0000") || required && !value.trim()) {
    throw new Error(label + "の形式が正しくありません");
  }
  return value;
}

function normalizeGrowthObservationKeys(value, required) {
  if (!Array.isArray(value) || required && !value.length || value.length > RECORD_PALLET_KEY_LIMIT) {
    throw new Error("生育確認の対象パレット数が範囲外です");
  }
  return [...new Set(value.map(key => {
    if (typeof key !== "string" || key.length > 8 || !/^[2-9]-[A-F]-(?:[1-9]|[1-6][0-9]|7[0-8])$/.test(key)) {
      throw new Error("生育確認の対象パレットが範囲外です");
    }
    return key;
  }))].sort(comparePalletKeys);
}

function normalizeGrowthObservation(value) {
  if (!isPlainObject(value)) throw new Error("適期確認はオブジェクトで指定してください");
  if (typeof value.observationId !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.observationId)) {
    throw new Error("適期確認UUIDの形式が正しくありません");
  }
  const kind = normalizeGrowthObservationEnum(value.kind === undefined ? "ready" : value.kind,
    ["ready", "ec", "condition", "environment", "manualOffset", "fieldAssessment"], "生育確認の種類");
  const crop = ["ready", "manualOffset", "fieldAssessment"].includes(kind);
  const scope = { palletKeys:normalizeGrowthObservationKeys(value.palletKeys === undefined && !crop ? [] : value.palletKeys, crop) };
  if (crop) {
    scope.plantingEventId = normalizeGrowthObservationInteger(value.plantingEventId, "苗植えイベントID", 1, Number.MAX_SAFE_INTEGER);
    scope.plantingDate = normalizeRequiredDate(value.plantingDate, "苗植え日");
  } else {
    scope.building = normalizeGrowthObservationInteger(value.building, "号棟", 2, 9);
    scope.bed = value.bed === undefined || value.bed === "" ? "" : normalizeGrowthObservationEnum(value.bed, HARVEST_BEDS, "ベッド");
    if (scope.palletKeys.some(key => !key.startsWith(scope.building + "-") || scope.bed && key.split("-")[1] !== scope.bed)) {
      throw new Error("対象パレットが指定した号棟・ベッドの範囲外です");
    }
  }
  const createdAt = normalizeGrowthObservationTimestamp(value.createdAt, "端末作成日時", false);
  const updatedAt = normalizeGrowthObservationTimestamp(value.updatedAt, "端末更新日時", false);
  const deletedAt = normalizeGrowthObservationTimestamp(value.deletedAt, "取消日時", true);
  if (updatedAt < createdAt || deletedAt && deletedAt < createdAt) throw new Error("更新・取消日時は作成日時以降にしてください");
  const detail = {};
  if (kind === "ready") {
    detail.readyDate = deletedAt && value.readyDate === "" ? "" : normalizeRequiredDate(value.readyDate, "適期確認日");
    if (detail.readyDate && detail.readyDate < scope.plantingDate) throw new Error("適期確認日は苗植え日以降にしてください");
  } else {
    if (!isPlainObject(value.payload)) throw new Error("生育確認の内容がありません");
    const payload = value.payload;
    const allowed = {
      ec:["value", "unit", "isAbnormal"], condition:["type", "dataPolicy", "note"],
      environment:["temperature", "light", "humidity", "dataPolicy"],
      manualOffset:["days", "sourcePredictionId"], fieldAssessment:["size", "quality"]
    }[kind];
    if (Object.keys(payload).some(key => !allowed.includes(key))) throw new Error("生育確認に未対応の項目があります");
    if (["condition", "environment"].includes(kind)) {
      detail.startDate = normalizeRequiredDate(value.startDate, "適用開始日");
      detail.endDate = value.endDate === "" ? "" : normalizeRequiredDate(value.endDate, "適用終了日");
      if (detail.endDate && detail.endDate < detail.startDate) throw new Error("適用終了日は開始日以降にしてください");
    } else {
      detail.date = normalizeRequiredDate(value.date, "確認日");
      if (scope.plantingDate && detail.date < scope.plantingDate) throw new Error("確認日は苗植え日以降にしてください");
    }
    if (kind === "ec") {
      if (typeof payload.value !== "number" || !Number.isFinite(payload.value) || payload.value < 0 || payload.value > 50) throw new Error("ECが範囲外です");
      detail.payload = { value:payload.value, unit:normalizeGrowthObservationEnum(payload.unit, ["mS/cm"], "EC単位") };
      if (payload.isAbnormal !== undefined) {
        if (typeof payload.isAbnormal !== "boolean") throw new Error("EC異常区分の形式が正しくありません");
        detail.payload.isAbnormal = payload.isAbnormal;
      }
    } else if (kind === "condition") {
      detail.payload = {
        type:normalizeGrowthObservationEnum(payload.type, ["shadeChange", "equipmentFailure", "abnormalSeedlings", "hydroponicTrouble", "abnormalEc", "other"], "特殊条件"),
        dataPolicy:normalizeGrowthObservationEnum(payload.dataPolicy, ["exclude"], "特殊条件データの利用方針")
      };
      const note = normalizeGrowthObservationText(payload.note, "特殊条件のメモ", 300, false);
      if (note !== undefined) detail.payload.note = note;
    } else if (kind === "environment") {
      detail.payload = {
        temperature:normalizeGrowthObservationEnum(payload.temperature, ["high", "low", "base"], "温度特性"),
        light:normalizeGrowthObservationEnum(payload.light, ["high", "low", "base"], "日照特性"),
        humidity:normalizeGrowthObservationEnum(payload.humidity, ["high", "low", "base"], "湿度特性"),
        dataPolicy:normalizeGrowthObservationEnum(payload.dataPolicy, ["normal", "downweight", "exclude"], "環境データの利用方針")
      };
    } else if (kind === "manualOffset") {
      detail.payload = {
        days:normalizeGrowthObservationInteger(payload.days, "適期日の手動補正", -30, 30),
        sourcePredictionId:normalizeGrowthObservationText(payload.sourcePredictionId, "元予測ID", 200, true)
      };
    } else {
      if (payload.quality !== undefined && !isPlainObject(payload.quality)) throw new Error("品質確認の形式が正しくありません");
      if (Object.keys(payload.quality || {}).some(key => !["tipburn", "elongated", "uneven"].includes(key))) throw new Error("品質確認に未対応の項目があります");
      detail.payload = { size:normalizeGrowthObservationEnum(payload.size, ["unknown", "small", "normal", "large"], "生育途中の大きさ"), quality:{} };
      ["tipburn", "elongated", "uneven"].forEach(key => {
        detail.payload.quality[key] = normalizeGrowthObservationEnum(payload.quality?.[key] === undefined ? "unknown" : payload.quality[key],
          ["unknown", "none", "low", "high"], "生育途中の品質");
      });
    }
  }
  // Client timestamps are retained, even if a device clock is inaccurate.
  // syncedAt is assigned separately by this server; CAS never trusts clock order.
  if (value.revision !== undefined) normalizeGrowthObservationInteger(value.revision, "適期確認の同期番号", 0, Number.MAX_SAFE_INTEGER);
  return { observationId:value.observationId.toLowerCase(), kind, ...scope, ...detail, createdAt, updatedAt, deletedAt };
}

function normalizeGrowthObservationSyncRequest(body) {
  if (!isPlainObject(body) || body.app !== "Harvestnavi"
      || body.protocolVersion !== GROWTH_OBSERVATION_PROTOCOL_VERSION) {
    throw new Error("対応していない適期確認の同期形式です");
  }
  if (!Array.isArray(body.mutations) || body.mutations.length > GROWTH_OBSERVATION_MUTATION_LIMIT) {
    throw new Error("適期確認は一度に" + GROWTH_OBSERVATION_MUTATION_LIMIT + "件まで送信できます");
  }
  const seen = new Set();
  const mutations = body.mutations.map(value => {
    const observation = normalizeGrowthObservation(value);
    const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const observedDate = observation.readyDate || observation.date || observation.startDate || "";
    if (observedDate > today) throw new Error("生育確認日・適用開始日は今日以前にしてください");
    if (seen.has(observation.observationId)) throw new Error("同じ適期確認が重複しています");
    seen.add(observation.observationId);
    return { observation,
      baseRevision:normalizeGrowthObservationInteger(value.baseRevision, "更新前の同期番号", 0, Number.MAX_SAFE_INTEGER),
      clientUpdatedAt:value.updatedAt };
  });
  return {
    mutations,
    cursor:normalizeGrowthObservationInteger(body.cursor === undefined ? 0 : body.cursor, "適期確認の取得位置", 0, Number.MAX_SAFE_INTEGER),
    limit:normalizeGrowthObservationInteger(body.limit === undefined ? GROWTH_OBSERVATION_PAGE_LIMIT : body.limit,
      "適期確認の取得件数", 1, GROWTH_OBSERVATION_PAGE_LIMIT)
  };
}

function ensureGrowthObservationSheet() {
  const spreadsheet = getSpreadsheet();
  let sheet = spreadsheet.getSheetByName(GROWTH_OBSERVATION_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(GROWTH_OBSERVATION_SHEET_NAME);
  const width = GROWTH_OBSERVATION_HEADERS.length;
  if (!sheet.getLastRow()) {
    if (sheet.getMaxColumns() < width) sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());
    sheet.getRange(1, 1, 1, width).setValues([GROWTH_OBSERVATION_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, width).setFontWeight("bold");
  } else {
    if (sheet.getMaxColumns() < width) throw new Error("適期確認シートの見出しが現在の形式と異なります");
    const actual = sheet.getRange(1, 1, 1, width).getValues()[0];
    if (actual.some((value, index) => value !== GROWTH_OBSERVATION_HEADERS[index])) {
      throw new Error("適期確認シートの見出しが現在の形式と異なります");
    }
  }
  return sheet;
}

function growthObservationToSheetRow(observation) {
  return [observation.observationId, observation.kind, JSON.stringify(normalizeGrowthObservation(observation)),
    observation.createdAt, observation.updatedAt, observation.deletedAt, observation.revision, observation.syncedAt];
}

function readGrowthObservations(sheet) {
  const lastRow = sheet.getLastRow();
  const values = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, GROWTH_OBSERVATION_HEADERS.length).getValues() : [];
  const entries = new Map(), revisions = new Set();
  let revision = 0;
  values.forEach((row, index) => {
    if (row.every(value => value === "" || value === null)) return;
    let content;
    try { content = JSON.parse(String(row[2] || "")); }
    catch (error) { throw new Error("生育確認シートの内容を読み込めません（" + (index + 2) + "行目）"); }
    const observation = normalizeGrowthObservation(content);
    if (observation.observationId !== row[0] || observation.kind !== row[1]
      || observation.createdAt !== row[3] || observation.updatedAt !== row[4] || observation.deletedAt !== row[5]) {
      throw new Error("生育確認シートの内容と識別情報が一致しません");
    }
    observation.revision = normalizeGrowthObservationInteger(Number(row[6]), "保存済み生育確認の同期番号", 1, Number.MAX_SAFE_INTEGER);
    observation.syncedAt = normalizeGrowthObservationTimestamp(row[7], "サーバー保存日時", false);
    if (entries.has(observation.observationId) || revisions.has(observation.revision)) {
      throw new Error("適期確認シートにUUIDまたは同期番号の重複があります");
    }
    entries.set(observation.observationId, { observation, rowNumber:index + 2 });
    revisions.add(observation.revision);
    revision = Math.max(revision, observation.revision);
  });
  return { entries, revision, lastRow };
}

function growthObservationContentEqual(left, right) {
  return JSON.stringify(normalizeGrowthObservation(left)) === JSON.stringify(normalizeGrowthObservation(right));
}

function growthObservationIdentity(value) {
  return JSON.stringify([value.kind, value.plantingEventId ?? null, value.plantingDate || "",
    value.building ?? null, value.bed || "", value.palletKeys, value.date || "", value.startDate || "", value.createdAt]);
}

function writeGrowthObservationRows(sheet, changed) {
  const ordered = changed.slice().sort((left, right) => left.rowNumber - right.rowNumber);
  const groups = [];
  ordered.forEach(entry => {
    let group = groups[groups.length - 1];
    if (!group || group.start + group.rows.length !== entry.rowNumber) {
      group = { start:entry.rowNumber, rows:[] }; groups.push(group);
    }
    group.rows.push(growthObservationToSheetRow(entry.observation));
  });
  groups.forEach(group => {
    const range = sheet.getRange(group.start, 1, group.rows.length, GROWTH_OBSERVATION_HEADERS.length);
    range.setNumberFormat("@");
    range.setValues(group.rows);
  });
}

function syncGrowthObservations(body) {
  // Validate the complete request before any sheet mutation. Sheet creation,
  // one batch read, conflict checks and writes then share the existing script lock.
  const request = normalizeGrowthObservationSyncRequest(body);
  return withRecordWriteLock(() => {
    const sheet = ensureGrowthObservationSheet();
    const state = readGrowthObservations(sheet);
    const accepted = [], conflicts = [], changed = [];
    const syncedAt = new Date().toISOString();
    request.mutations.forEach(mutation => {
      const incoming = mutation.observation;
      const existing = state.entries.get(incoming.observationId);
      if (existing && growthObservationContentEqual(incoming, existing.observation)) {
        accepted.push({ observationId:incoming.observationId, clientUpdatedAt:mutation.clientUpdatedAt,
          observation:existing.observation });
        return;
      }
      if (mutation.baseRevision !== (existing ? existing.observation.revision : 0)) {
        conflicts.push({ observationId:incoming.observationId, server:existing ? existing.observation : null });
        return;
      }
      if (existing && growthObservationIdentity(incoming) !== growthObservationIdentity(existing.observation)) {
        throw new Error("生育確認の対象や作成日時は変更できません。元の確認を取り消して新しく保存してください");
      }
      if (state.revision >= Number.MAX_SAFE_INTEGER) throw new Error("適期確認の同期番号が上限に達しました");
      const observation = { ...incoming, revision:++state.revision, syncedAt };
      const entry = { observation, rowNumber:existing ? existing.rowNumber : ++state.lastRow };
      state.entries.set(observation.observationId, entry);
      changed.push(entry);
      accepted.push({ observationId:observation.observationId, clientUpdatedAt:mutation.clientUpdatedAt, observation });
    });
    if (changed.length) writeGrowthObservationRows(sheet, changed);
    const pending = [...state.entries.values()].map(entry => entry.observation)
      .filter(observation => observation.revision > request.cursor)
      .sort((left, right) => left.revision - right.revision);
    const rows = [];
    let characters = JSON.stringify({ accepted, conflicts }).length;
    for (const observation of pending) {
      const length = JSON.stringify(observation).length;
      if (rows.length >= request.limit || rows.length && characters + length > GROWTH_OBSERVATION_RESPONSE_CHAR_LIMIT) break;
      rows.push(observation); characters += length;
    }
    return { protocolVersion:GROWTH_OBSERVATION_PROTOCOL_VERSION, accepted, conflicts, rows,
      nextCursor:rows.length ? rows[rows.length - 1].revision : request.cursor,
      hasMore:rows.length < pending.length };
  });
}
