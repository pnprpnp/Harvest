// ===== 部分収穫：保存・編集 =====
const PARTIAL_HARVEST_BATCH_MAX_ENTRIES = 20;
let partialHarvestBatchEntrySequence = 0;

function formatPartialHarvestSummary(targets){
  const normalized = normalizePartialHarvestTargets(targets);
  if(!normalized.length) return "";
  const groups = {};
  normalized.forEach(target => {
    const key = `${target.building}-${target.plantsPerPallet}`;
    if(!groups[key]){
      groups[key] = {
        building: target.building,
        plantsPerPallet: target.plantsPerPallet,
        beds: new Set()
      };
    }
    groups[key].beds.add(target.bed);
  });

  return Object.values(groups).map(group => (
    `${group.building}号棟 ${bedOrder.filter(bed => group.beds.has(bed)).join(",")}ベッド（各パレット平均 約${Math.round(group.plantsPerPallet * 100) / 100}株分）`
  )).join("\n");
}

function buildPartialHarvestTargets(building, beds, cases){
  const normalizedBuilding = Number(building);
  const normalizedCases = clampNumber(cases, 0, 999999, 0);
  const normalizedBeds = bedOrder.filter(bed => (
    Array.isArray(beds) && beds.includes(bed)
  ));
  if(!BUILDINGS.includes(normalizedBuilding) || !normalizedBeds.length || normalizedCases <= 0) return [];

  const plantsPerPallet = Math.round(
    (normalizedCases * CASE_SIZE / (PALLETS_PER_BED * normalizedBeds.length)) * 1000000
  ) / 1000000;
  return normalizedBeds.map(bed => ({
    building: normalizedBuilding,
    bed,
    start: 1,
    end: PALLETS_PER_BED,
    plantsPerPallet
  }));
}

function getPartialHarvestRemainingPlantsValue(value){
  if(value === null || value === undefined || String(value).trim() === "") return null;
  return getStrictDecimalInRange(String(value), 0, 999);
}

function getPartialHarvestBatchEntries(){
  return Array.from(document.querySelectorAll("[data-partial-harvest-entry-id]"));
}

function getPartialHarvestBatchEntry(entryId = "primary"){
  const normalizedEntryId = String(entryId || "primary");
  return getPartialHarvestBatchEntries().find(entry => (
    entry.dataset.partialHarvestEntryId === normalizedEntryId
  )) || null;
}

function getSelectedPartialHarvestBeds(entryId = "primary"){
  const entry = getPartialHarvestBatchEntry(entryId);
  if(!entry) return [];
  return bedOrder.filter(bed => (
    !!Array.from(entry.querySelectorAll('[data-partial-harvest-role="bed"]:checked'))
      .find(input => input.value === bed)
  ));
}

function getPartialHarvestRemainingPlantsByBed(entryId = "primary"){
  const entry = getPartialHarvestBatchEntry(entryId);
  const values = {};
  bedOrder.forEach(bed => {
    const input = entry?.querySelector(`[data-partial-harvest-remaining-bed="${bed}"]`);
    values[bed] = input?.value ?? "";
  });
  return values;
}

function estimatePartialHarvestFromRemainingPlants(
  building,
  beds,
  remainingPlantsByBed,
  date,
  sourceRecords = records,
  predictionGetter = getPredictedHarvestForPallet
){
  const normalizedBuilding = Number(building);
  const normalizedBeds = bedOrder.filter(bed => Array.isArray(beds) && beds.includes(bed));
  const targetDate = parseDateOnlyString(date);
  if(!BUILDINGS.includes(normalizedBuilding)){
    return { ok:false, status:"invalid-building", message:"号棟を選択してください", bedEstimates:[] };
  }
  if(!normalizedBeds.length){
    return { ok:false, status:"no-beds", message:"先に部分収穫したベッドを選択してください", bedEstimates:[] };
  }
  if(!targetDate){
    return { ok:false, status:"invalid-date", message:"収穫日を入力してください", bedEstimates:[] };
  }

  const normalizedRemainingPlantsByBed = {};
  const missingBeds = [];
  normalizedBeds.forEach(bed => {
    const remainingPlants = getPartialHarvestRemainingPlantsValue(remainingPlantsByBed?.[bed]);
    if(remainingPlants === null) missingBeds.push(bed);
    else normalizedRemainingPlantsByBed[bed] = remainingPlants;
  });
  if(missingBeds.length){
    return {
      ok:false,
      status:"missing-remaining-plants",
      message:`${missingBeds.join("・")}ベッドの残り株数を入力してください`,
      missingBeds,
      bedEstimates:[]
    };
  }

  const bedEstimates = normalizedBeds.map(bed => {
    let predictedHeadsBefore = 0;
    for(let number = 1; number <= PALLETS_PER_BED; number++){
      predictedHeadsBefore += Math.max(0, Number(
        predictionGetter(normalizedBuilding, bed, number, targetDate, sourceRecords)
      ) || 0);
    }
    const remainingPlantsPerPallet = normalizedRemainingPlantsByBed[bed];
    const remainingHeads = remainingPlantsPerPallet * PALLETS_PER_BED;
    return {
      bed,
      predictedHeadsBefore,
      predictedPlantsPerPallet: predictedHeadsBefore / PALLETS_PER_BED,
      remainingPlantsPerPallet,
      remainingHeads,
      estimatedHarvestedHeads: predictedHeadsBefore - remainingHeads
    };
  });

  const overPrediction = bedEstimates.find(estimate => estimate.estimatedHarvestedHeads < -0.01);
  if(overPrediction){
    return {
      ok:false,
      status:"remaining-over-prediction",
      message:`${overPrediction.bed}ベッドの残り株数が、収穫前予測の平均${overPrediction.predictedPlantsPerPallet.toFixed(1)}株を上回っています`,
      bedEstimates
    };
  }

  const noHarvest = bedEstimates.find(estimate => estimate.estimatedHarvestedHeads <= 0.01);
  if(noHarvest){
    return {
      ok:false,
      status:"no-estimated-harvest",
      message:`${noHarvest.bed}ベッドは収穫した株数を予想できません。残り株数を確認してください`,
      bedEstimates
    };
  }

  const estimatedHarvestedHeads = bedEstimates.reduce((total, estimate) => (
    total + estimate.estimatedHarvestedHeads
  ), 0);
  const estimatedCases = estimatedHarvestedHeads / CASE_SIZE;
  const suggestedCases = Math.max(0, Math.round(estimatedCases));
  const signature = JSON.stringify({
    building:normalizedBuilding,
    date:formatDateOnlyString(targetDate),
    beds:bedEstimates.map(estimate => [
      estimate.bed,
      Math.round(estimate.remainingPlantsPerPallet * 10000) / 10000,
      Math.round(estimate.predictedHeadsBefore * 10000) / 10000
    ])
  });
  if(suggestedCases < 1){
    return {
      ok:false,
      status:"under-one-case",
      message:`予想は約${estimatedCases.toFixed(1)}ケースです。1ケース未満のためケース数へ反映できません`,
      bedEstimates,
      estimatedHarvestedHeads,
      estimatedCases,
      suggestedCases,
      signature
    };
  }
  return {
    ok:true,
    status:"ready",
    building:normalizedBuilding,
    beds:normalizedBeds,
    date:formatDateOnlyString(targetDate),
    bedEstimates,
    estimatedHarvestedHeads,
    estimatedCases,
    suggestedCases,
    signature
  };
}

function buildPartialHarvestTargetsFromRemainingEstimate(building, estimate, cases){
  const normalizedBuilding = Number(building);
  const normalizedCases = getStrictIntegerInRange(cases, 1, RECORD_MAX_CASES);
  const bedEstimates = estimate?.ok && Array.isArray(estimate.bedEstimates)
    ? estimate.bedEstimates.filter(item => bedOrder.includes(item?.bed) && item.estimatedHarvestedHeads > 0)
    : [];
  const estimatedHarvestedHeads = bedEstimates.reduce((total, item) => (
    total + item.estimatedHarvestedHeads
  ), 0);
  if(!BUILDINGS.includes(normalizedBuilding) || normalizedCases === null || estimatedHarvestedHeads <= 0) return [];

  const confirmedHarvestedHeads = normalizedCases * CASE_SIZE;
  return bedEstimates.map(item => ({
    building:normalizedBuilding,
    bed:item.bed,
    start:1,
    end:PALLETS_PER_BED,
    plantsPerPallet:Math.round((
      confirmedHarvestedHeads
      * item.estimatedHarvestedHeads
      / estimatedHarvestedHeads
      / PALLETS_PER_BED
    ) * 1000000) / 1000000
  }));
}

function getCurrentPartialHarvestRemainingEstimate(sourceRecords = records, entryId = "primary"){
  const entry = getPartialHarvestBatchEntry(entryId);
  return estimatePartialHarvestFromRemainingPlants(
    entry?.querySelector('[data-partial-harvest-role="building"]')?.value || currentBuilding,
    getSelectedPartialHarvestBeds(entryId),
    getPartialHarvestRemainingPlantsByBed(entryId),
    document.getElementById("recordDateInput")?.value || "",
    sourceRecords
  );
}

function getPartialHarvestTargetsForCurrentRemainingEstimate(
  building,
  beds,
  cases,
  date,
  sourceRecords = records,
  entryId = "primary"
){
  const fallbackTargets = buildPartialHarvestTargets(building, beds, cases);
  const entry = getPartialHarvestBatchEntry(entryId);
  const casesInput = entry?.querySelector('[data-partial-harvest-role="cases"]');
  const appliedSignature = casesInput?.dataset.remainingEstimateSignature || "";
  if(!appliedSignature) return { targets:fallbackTargets, usedRemainingEstimate:false, estimate:null };

  const estimate = estimatePartialHarvestFromRemainingPlants(
    building,
    beds,
    getPartialHarvestRemainingPlantsByBed(entryId),
    date,
    sourceRecords
  );
  if(!estimate.ok || estimate.signature !== appliedSignature){
    return { targets:fallbackTargets, usedRemainingEstimate:false, estimate };
  }
  const targets = buildPartialHarvestTargetsFromRemainingEstimate(building, estimate, cases);
  return {
    targets:targets.length === beds.length ? targets : fallbackTargets,
    usedRemainingEstimate:targets.length === beds.length,
    estimate
  };
}

function getPartialHarvestRemainingEstimateBreakdown(estimate){
  if(!Array.isArray(estimate?.bedEstimates) || !estimate.bedEstimates.length) return "";
  return estimate.bedEstimates.map(item => (
    `${item.bed}: 収穫前 平均${item.predictedPlantsPerPallet.toFixed(1)}株 → 残り${item.remainingPlantsPerPallet.toFixed(1)}株`
  )).join(" ／ ");
}

function handlePartialHarvestCasesInput(entryId = "primary"){
  const entry = getPartialHarvestBatchEntry(entryId);
  const applyButton = entry?.querySelector(".partialHarvestApplyRemainingEstimateBtn");
  const casesInput = entry?.querySelector('[data-partial-harvest-role="cases"]');
  const suggestedCases = getStrictIntegerInRange(
    applyButton?.dataset.suggestedCases || "",
    1,
    RECORD_MAX_CASES
  );
  const estimateSignature = applyButton?.dataset.remainingEstimateSignature || "";
  if(!applyButton || suggestedCases === null || !estimateSignature){
    updatePartialHarvestBatchSummary();
    return;
  }
  const currentCases = getStrictIntegerInRange(casesInput?.value || "", 1, RECORD_MAX_CASES);
  const alreadyApplied = casesInput?.dataset.remainingEstimateSignature === estimateSignature
    && currentCases === suggestedCases;
  applyButton.disabled = alreadyApplied;
  applyButton.textContent = alreadyApplied
    ? `${suggestedCases}ケースを入力済み`
    : `予想の${suggestedCases}ケースを入力する`;
  updatePartialHarvestBatchSummary();
}

function refreshPartialHarvestRemainingEstimator(entryId = "primary"){
  const entry = getPartialHarvestBatchEntry(entryId);
  const details = entry?.querySelector(".partialHarvestRemainingEstimator");
  const result = entry?.querySelector(".partialHarvestRemainingEstimateResult");
  const primary = entry?.querySelector(".partialHarvestRemainingEstimatePrimary");
  const breakdown = entry?.querySelector(".partialHarvestRemainingEstimateBreakdown");
  const applyButton = entry?.querySelector(".partialHarvestApplyRemainingEstimateBtn");
  const casesInput = entry?.querySelector('[data-partial-harvest-role="cases"]');
  if(!details || !result || !primary || !breakdown || !applyButton) return null;

  const selectedBeds = new Set(getSelectedPartialHarvestBeds(entryId));
  entry.querySelectorAll("[data-partial-harvest-remaining-row]").forEach(row => {
    row.hidden = !selectedBeds.has(row.dataset.partialHarvestRemainingRow);
  });
  if(!details.open){
    result.hidden = true;
    applyButton.disabled = true;
    applyButton.textContent = "予想をケース数へ入力する";
    delete applyButton.dataset.suggestedCases;
    delete applyButton.dataset.remainingEstimateSignature;
    updatePartialHarvestBatchSummary();
    return null;
  }

  const estimate = getCurrentPartialHarvestRemainingEstimate(records, entryId);
  result.hidden = false;
  result.classList.toggle("is-ready", estimate.ok);
  result.classList.toggle("has-warning", !estimate.ok);
  breakdown.textContent = getPartialHarvestRemainingEstimateBreakdown(estimate);
  if(!estimate.ok){
    primary.textContent = estimate.message || "残り株数を確認してください";
    applyButton.disabled = true;
    applyButton.textContent = "予想をケース数へ入力する";
    delete applyButton.dataset.suggestedCases;
    delete applyButton.dataset.remainingEstimateSignature;
    updatePartialHarvestBatchSummary();
    return estimate;
  }

  primary.textContent = `予想：${estimate.suggestedCases}ケース（計算上は約${estimate.estimatedCases.toFixed(1)}ケース）`;
  applyButton.dataset.suggestedCases = String(estimate.suggestedCases);
  applyButton.dataset.remainingEstimateSignature = estimate.signature;
  handlePartialHarvestCasesInput(entryId);
  return estimate;
}

function refreshAllPartialHarvestRemainingEstimators(){
  getPartialHarvestBatchEntries().forEach(entry => {
    refreshPartialHarvestRemainingEstimator(entry.dataset.partialHarvestEntryId);
  });
}

function applyPartialHarvestRemainingEstimate(entryId = "primary"){
  const estimate = getCurrentPartialHarvestRemainingEstimate(records, entryId);
  if(!estimate.ok){
    refreshPartialHarvestRemainingEstimator(entryId);
    showToast(estimate.message || "残り株数を確認してください");
    return;
  }
  const entry = getPartialHarvestBatchEntry(entryId);
  const casesInput = entry?.querySelector('[data-partial-harvest-role="cases"]');
  if(!casesInput) return;
  casesInput.value = String(estimate.suggestedCases);
  casesInput.dataset.remainingEstimateSignature = estimate.signature;
  refreshPartialHarvestRemainingEstimator(entryId);
  scheduleHarvestStateSave();
}

function resetPartialHarvestRemainingEstimator(entryId = "primary"){
  const entry = getPartialHarvestBatchEntry(entryId);
  entry?.querySelectorAll("[data-partial-harvest-remaining-bed]").forEach(input => {
    input.value = "";
  });
  const casesInput = entry?.querySelector('[data-partial-harvest-role="cases"]');
  if(casesInput) delete casesInput.dataset.remainingEstimateSignature;
  refreshPartialHarvestRemainingEstimator(entryId);
}

function updatePartialHarvestBatchEntryTitles(){
  getPartialHarvestBatchEntries().forEach((entry, index) => {
    const title = entry.querySelector(".partialHarvestBatchEntryTitle");
    if(title) title.textContent = `場所 ${index + 1}`;
  });
}

function updatePartialHarvestBatchSummary(){
  const entries = getPartialHarvestBatchEntries();
  const summary = document.getElementById("partialHarvestBatchSummary");
  const saveButton = document.getElementById("partialHarvestBatchSaveBtn");
  const validCases = entries.map(entry => getStrictIntegerInRange(
    entry.querySelector('[data-partial-harvest-role="cases"]')?.value || "",
    1,
    RECORD_MAX_CASES
  ));
  const enteredCount = validCases.filter(value => value !== null).length;
  const totalCases = validCases.reduce((total, value) => total + (value || 0), 0);
  if(summary){
    if(entries.length === 1 && enteredCount === 0){
      summary.textContent = "1か所を入力できます";
    }else{
      summary.textContent = `${enteredCount}／${entries.length}か所入力済み　合計 ${totalCases}ケース`;
    }
  }
  if(saveButton){
    saveButton.textContent = entries.length === 1
      ? "この場所を記録する"
      : `${entries.length}か所をまとめて記録する`;
  }
}

function bindPartialHarvestBatchEntryEvents(entry){
  entry.querySelectorAll("[data-ui-input]").forEach(element => {
    element.addEventListener("input", handleStaticUiInput);
  });
  entry.querySelectorAll("[data-ui-change]").forEach(element => {
    element.addEventListener("change", handleStaticUiChange);
  });
  entry.querySelectorAll("[data-ui-toggle]").forEach(element => {
    element.addEventListener("toggle", event => {
      runStaticUiAction(element, event, "data-ui-toggle");
    });
  });
}

function createPartialHarvestBatchEntry(entryId, building){
  const primary = getPartialHarvestBatchEntry("primary");
  if(!primary) return null;
  const entry = primary.cloneNode(true);
  entry.id = `partialHarvestBatchEntry_${entryId}`;
  entry.dataset.partialHarvestEntryId = entryId;

  const idMap = new Map();
  entry.querySelectorAll("[id]").forEach(element => {
    const previousId = element.id;
    const nextId = `${previousId}_${entryId}`;
    idMap.set(previousId, nextId);
    element.id = nextId;
  });
  entry.querySelectorAll("label[for]").forEach(label => {
    const nextId = idMap.get(label.htmlFor);
    if(nextId) label.htmlFor = nextId;
  });
  entry.querySelectorAll("[data-ui-arg]").forEach(element => {
    element.dataset.uiArg = entryId;
  });

  const removeButton = entry.querySelector(".partialHarvestBatchRemoveBtn");
  if(removeButton) removeButton.hidden = false;
  const buildingInput = entry.querySelector('[data-partial-harvest-role="building"]');
  if(buildingInput) buildingInput.value = String(BUILDINGS.includes(Number(building)) ? Number(building) : currentBuilding);
  entry.querySelectorAll('[data-partial-harvest-role="bed"]').forEach(input => {
    input.checked = false;
    input.name = `partialHarvestBed_${entryId}`;
  });
  entry.querySelectorAll('[data-partial-harvest-remaining-bed]').forEach(input => {
    input.value = "";
  });
  entry.querySelectorAll('[data-partial-harvest-remaining-row]').forEach(row => {
    row.hidden = true;
  });
  const casesInput = entry.querySelector('[data-partial-harvest-role="cases"]');
  if(casesInput){
    casesInput.value = "";
    delete casesInput.dataset.remainingEstimateSignature;
  }
  const estimator = entry.querySelector(".partialHarvestRemainingEstimator");
  if(estimator) estimator.open = false;
  const result = entry.querySelector(".partialHarvestRemainingEstimateResult");
  if(result){
    result.hidden = true;
    result.classList.remove("is-ready", "has-warning");
  }
  const primaryResult = entry.querySelector(".partialHarvestRemainingEstimatePrimary");
  const breakdown = entry.querySelector(".partialHarvestRemainingEstimateBreakdown");
  if(primaryResult) primaryResult.textContent = "";
  if(breakdown) breakdown.textContent = "";
  const applyButton = entry.querySelector(".partialHarvestApplyRemainingEstimateBtn");
  if(applyButton){
    applyButton.disabled = true;
    applyButton.textContent = "予想をケース数へ入力する";
    delete applyButton.dataset.suggestedCases;
    delete applyButton.dataset.remainingEstimateSignature;
  }
  bindPartialHarvestBatchEntryEvents(entry);
  return entry;
}

function addPartialHarvestBatchEntry(){
  const container = document.getElementById("partialHarvestBatchEntries");
  const entries = getPartialHarvestBatchEntries();
  if(!container) return;
  if(entries.length >= PARTIAL_HARVEST_BATCH_MAX_ENTRIES){
    showToast(`一度に記録できる場所は${PARTIAL_HARVEST_BATCH_MAX_ENTRIES}か所までです`);
    return;
  }
  const previousBuilding = entries[entries.length - 1]
    ?.querySelector('[data-partial-harvest-role="building"]')?.value;
  const entryId = `entry${++partialHarvestBatchEntrySequence}`;
  const entry = createPartialHarvestBatchEntry(entryId, previousBuilding);
  if(!entry) return;
  container.appendChild(entry);
  updatePartialHarvestBatchEntryTitles();
  updatePartialHarvestBatchSummary();
  entry.querySelector('[data-partial-harvest-role="building"]')?.focus();
}

function removePartialHarvestBatchEntry(entryId){
  const normalizedEntryId = String(entryId || "");
  if(!normalizedEntryId || normalizedEntryId === "primary") return;
  const entry = getPartialHarvestBatchEntry(normalizedEntryId);
  if(!entry) return;
  entry.remove();
  updatePartialHarvestBatchEntryTitles();
  updatePartialHarvestBatchSummary();
}

function resetPartialHarvestBatchEntries(){
  getPartialHarvestBatchEntries().forEach(entry => {
    if(entry.dataset.partialHarvestEntryId !== "primary") entry.remove();
  });
  const primary = getPartialHarvestBatchEntry("primary");
  if(!primary) return;
  const buildingInput = primary.querySelector('[data-partial-harvest-role="building"]');
  if(buildingInput) buildingInput.value = String(currentBuilding);
  primary.querySelectorAll('[data-partial-harvest-role="bed"]').forEach(input => {
    input.checked = false;
  });
  const casesInput = primary.querySelector('[data-partial-harvest-role="cases"]');
  if(casesInput) casesInput.value = "";
  const estimator = primary.querySelector(".partialHarvestRemainingEstimator");
  if(estimator) estimator.open = false;
  resetPartialHarvestRemainingEstimator("primary");
  updatePartialHarvestBatchEntryTitles();
  updatePartialHarvestBatchSummary();
}

function validatePartialHarvestBatchEntries(date, sourceRecords = records){
  if(!date) return { ok:false, message:"日付を入力してください", entries:[] };
  const seenLocations = new Map();
  const normalizedEntries = [];
  const entryElements = getPartialHarvestBatchEntries();
  for(let index = 0; index < entryElements.length; index++){
    const entry = entryElements[index];
    const entryId = entry.dataset.partialHarvestEntryId || "primary";
    const building = Number(entry.querySelector('[data-partial-harvest-role="building"]')?.value);
    const beds = getSelectedPartialHarvestBeds(entryId);
    const cases = getStrictIntegerInRange(
      entry.querySelector('[data-partial-harvest-role="cases"]')?.value || "",
      1,
      RECORD_MAX_CASES
    );
    const positionLabel = `場所 ${index + 1}`;
    if(!BUILDINGS.includes(building) || !beds.length){
      return { ok:false, message:`${positionLabel}の号棟とベッドを入力してください`, entries:[] };
    }
    if(cases === null){
      return { ok:false, message:`${positionLabel}のケース数を1以上の整数で入力してください`, entries:[] };
    }
    for(const bed of beds){
      const locationKey = `${building}-${bed}`;
      if(seenLocations.has(locationKey)){
        return {
          ok:false,
          message:`${building}号棟${bed}ベッドが「${seenLocations.get(locationKey)}」と「${positionLabel}」に重複しています`,
          entries:[]
        };
      }
      seenLocations.set(locationKey, positionLabel);
    }
    const targetResult = getPartialHarvestTargetsForCurrentRemainingEstimate(
      building,
      beds,
      cases,
      date,
      sourceRecords,
      entryId
    );
    normalizedEntries.push({
      entryId,
      building,
      beds,
      cases,
      targets:targetResult.targets,
      remainingEstimate:getPartialHarvestRemainingCaseEstimate(building, beds, cases, date, sourceRecords)
    });
  }
  return {
    ok:true,
    entries:normalizedEntries,
    totalCases:normalizedEntries.reduce((total, entry) => total + entry.cases, 0)
  };
}

function getNextLocalHarvestRecordIds(count, sourceRecords = records){
  const reservedRecords = [];
  for(let index = 0; index < count; index++){
    const id = getNextLocalHarvestRecordId([
      ...(Array.isArray(sourceRecords) ? sourceRecords : []),
      ...reservedRecords
    ]);
    if(id === null) return [];
    reservedRecords.push({ id });
  }
  return reservedRecords.map(record => record.id);
}

function getPartialHarvestBatchSaveToastMessage(options = {}){
  const count = Math.max(1, Number(options.count) || 1);
  const totalCases = Math.max(0, Number(options.totalCases) || 0);
  const sendText = String(options.syncState || (options.sendQueued ? "送信中" : "未送信"));
  const predictionUpdate = options.predictionUpdate || {};
  const savedText = `${count}か所・合計${totalCases}ケースの部分収穫を記録しました`;
  if(predictionUpdate.recalculated){
    const resultText = predictionUpdate.changed
      ? "収穫予想が変わったため、収穫場所を確認してください"
      : "収穫予想を再確認しました";
    return `${savedText}。${resultText}（${sendText}）`;
  }
  if(predictionUpdate.attempted){
    return `${savedText}。収穫予想を更新できなかったため、「計算する」を押してください（${sendText}）`;
  }
  return `${savedText}（${sendText}）`;
}

function getPartialHarvestEditFormModel(record){
  if(!record || record.type !== "partialHarvest") return null;
  const targets = normalizePartialHarvestTargets(record.targets);
  if(!targets.length) return null;
  const buildings = [...new Set(targets.map(target => target.building))];
  const isWholeBedRecord = buildings.length === 1
    && targets.every(target => (
      target.building === buildings[0]
      && target.start === 1
      && target.end === PALLETS_PER_BED
    ));
  if(!isWholeBedRecord) return null;
  return {
    date: String(record.date || ""),
    building: buildings[0],
    beds: bedOrder.filter(bed => targets.some(target => target.bed === bed)),
    cases: clampNumber(record.cases, 0, 999999, 0),
    memo: stripPartialHarvestAutoMemo(record.memo)
  };
}

function stripPartialHarvestAutoMemo(memo){
  return String(memo || "")
    .split(/\r?\n/)
    .filter(line => !/^部分収穫後の残り予想: 約[\d,.]+ケース（目安）$/.test(line.trim()))
    .join("\n")
    .trim();
}

function getPartialHarvestRemainingCaseEstimate(building, beds, cases, date, sourceRecords = records){
  const targetDate = parseDateOnlyString(date) || new Date();
  let predictedHeads = 0;
  beds.forEach(bed => {
    for(let number = 1; number <= PALLETS_PER_BED; number++){
      predictedHeads += getPredictedHarvestForPallet(building, bed, number, targetDate, sourceRecords);
    }
  });
  const predictedCasesBefore = predictedHeads / CASE_SIZE;
  return Math.max(0, Math.round(predictedCasesBefore - cases));
}

function getNextLocalHarvestRecordId(sourceRecords = records){
  const usedIds = new Set((Array.isArray(sourceRecords) ? sourceRecords : [])
    .map(record => getSafePositiveRecordId(record?.id))
    .filter(id => id !== null));
  (Array.isArray(deletedRecords) ? deletedRecords : []).forEach(entry => {
    const id = getSafePositiveRecordId(entry?.record?.id);
    if(id !== null) usedIds.add(id);
  });
  let candidate = Math.min(Date.now(), RECORD_MAX_ID);
  while(usedIds.has(candidate) && candidate < RECORD_MAX_ID) candidate++;
  return usedIds.has(candidate) ? null : candidate;
}

function getHarvestRecordDerivedValues(record, sourceRecords = records){
  if(!record || record.type !== "fullHarvest"){
    return { actualLoss: "", plantingCaseInstruction: "" };
  }
  const targetDate = parseDateOnlyString(record.date);
  return {
    actualLoss: targetDate
      ? getActualLossRateForPalletKeys(
          getPalletKeysFromRecord(record),
          clampNumber(record.cases, 0, 999999, 0),
          targetDate,
          sourceRecords
        )
      : "",
    plantingCaseInstruction: getRemainingHarvestableCaseInstruction(record, sourceRecords)
  };
}

function areHarvestLossValuesEqual(left, right){
  const leftText = String(left ?? "").trim();
  const rightText = String(right ?? "").trim();
  if(!leftText || !rightText) return leftText === rightText;
  const leftNumber = Number(leftText);
  const rightNumber = Number(rightText);
  return Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
    ? Math.abs(leftNumber - rightNumber) < 0.0001
    : leftText === rightText;
}

function buildHarvestPartialSplitPlan(sourceRecord, partialRecord, sourceRecords = records){
  const baseRecords = (Array.isArray(sourceRecords) ? sourceRecords : []).slice().sort(compareRecordsByDateDesc);
  const source = findHarvestRecordByIdentity(sourceRecord, baseRecords);
  if(!source || source.type !== "fullHarvest"){
    return { ok: false, message: "分ける通常収穫記録が見つかりません" };
  }

  const sourceCases = getStrictIntegerInRange(source.cases, 1, RECORD_MAX_CASES);
  const splitCases = getStrictIntegerInRange(partialRecord?.cases, 1, RECORD_MAX_CASES);
  if(sourceCases === null || splitCases === null || splitCases >= sourceCases){
    return { ok: false, message: "部分収穫分は、通常収穫を1ケース以上残すケース数にしてください" };
  }
  const targets = normalizePartialHarvestTargets(partialRecord?.targets);
  if(!targets.length){
    return { ok: false, message: "部分収穫した号棟とベッドを入力してください" };
  }

  const sourceIdentityKey = getHarvestRecordIdentityKey(source);
  const nextSource = {
    ...source,
    cases: sourceCases - splitCases
  };
  nextSource.duplicateKey = getRecordDuplicateKey(nextSource);
  const nextPartial = {
    ...partialRecord,
    type: "partialHarvest",
    date: source.date,
    cases: splitCases,
    targets,
    palletKeys: []
  };
  nextPartial.duplicateKey = getRecordDuplicateKey(nextPartial);

  let candidateRecords = baseRecords.map(record => (
    getHarvestRecordIdentityKey(record) === sourceIdentityKey ? nextSource : record
  ));
  candidateRecords.push(nextPartial);
  candidateRecords.sort(compareRecordsByDateDesc);

  const splitDate = parseDateOnlyString(source.date);
  const changedRecordByKey = new Map();
  const recordChanges = [];
  baseRecords.forEach(beforeRecord => {
    if(beforeRecord?.type !== "fullHarvest") return;
    const recordDate = parseDateOnlyString(beforeRecord.date);
    const daysAfterSplit = splitDate && recordDate ? getLocalDayDiff(splitDate, recordDate) : -1;
    const recordIdentityKey = getHarvestRecordIdentityKey(beforeRecord);
    const isSource = recordIdentityKey === sourceIdentityKey;
    if(!isSource && (daysAfterSplit < 0 || daysAfterSplit > CALCULATION_LOOKBACK_DAYS)) return;

    const afterRecord = findHarvestRecordByIdentity(beforeRecord, candidateRecords);
    if(!afterRecord) return;
    const beforeDerived = getHarvestRecordDerivedValues(beforeRecord, baseRecords);
    const afterDerived = getHarvestRecordDerivedValues(afterRecord, candidateRecords);
    if(isSource && !afterDerived.actualLoss){
      return;
    }

    const actualLossFormulaChanged = !areHarvestLossValuesEqual(
      beforeDerived.actualLoss,
      afterDerived.actualLoss
    );
    const instructionFormulaChanged = beforeDerived.plantingCaseInstruction
      !== afterDerived.plantingCaseInstruction;
    const nextRecord = { ...afterRecord };
    let shouldReplace = isSource;
    let actualLossChange = null;
    let plantingCaseInstructionChange = null;

    if(afterDerived.actualLoss && (isSource || actualLossFormulaChanged)){
      if(!areHarvestLossValuesEqual(beforeRecord.actualLoss, afterDerived.actualLoss)){
        actualLossChange = {
          before: String(beforeRecord.actualLoss ?? "").trim() || "-",
          after: afterDerived.actualLoss
        };
      }
      nextRecord.actualLoss = afterDerived.actualLoss;
      shouldReplace = true;
    }

    if(isSource || instructionFormulaChanged){
      if(String(beforeRecord.plantingCaseInstruction || "").trim()
        !== String(afterDerived.plantingCaseInstruction || "").trim()){
        plantingCaseInstructionChange = {
          before: String(beforeRecord.plantingCaseInstruction || "").trim() || "-",
          after: String(afterDerived.plantingCaseInstruction || "").trim() || "-"
        };
      }
      nextRecord.plantingCaseInstruction = afterDerived.plantingCaseInstruction;
      shouldReplace = true;
    }

    if(isSource) nextRecord.duplicateKey = getRecordDuplicateKey(nextRecord);
    if(shouldReplace) changedRecordByKey.set(recordIdentityKey, nextRecord);
    if(isSource || actualLossChange || plantingCaseInstructionChange){
      recordChanges.push({
        id: Number(beforeRecord.id),
        recordUuid: normalizeRecordUuid(beforeRecord.recordUuid),
        date: String(beforeRecord.date || ""),
        isSource,
        casesBefore: isSource ? sourceCases : null,
        casesAfter: isSource ? sourceCases - splitCases : null,
        actualLossChange,
        plantingCaseInstructionChange
      });
    }
  });

  const plannedSource = changedRecordByKey.get(sourceIdentityKey);
  if(!plannedSource || !String(plannedSource.actualLoss || "").trim()){
    return { ok: false, message: "分けた後の収穫ロス率を計算できません" };
  }

  candidateRecords = candidateRecords.map(record => (
    changedRecordByKey.get(getHarvestRecordIdentityKey(record)) || record
  ));
  candidateRecords.sort(compareRecordsByDateDesc);

  const recordsToSync = [
    plannedSource,
    nextPartial,
    ...recordChanges
      .filter(change => !change.isSource && (change.actualLossChange || change.plantingCaseInstructionChange))
      .map(change => findHarvestRecordByIdentity(change, candidateRecords))
      .filter(Boolean)
  ].filter((record, index, list) => (
    list.findIndex(item => getHarvestRecordIdentityKey(item) === getHarvestRecordIdentityKey(record)) === index
  ));

  return {
    ok: true,
    message: "",
    sourceCases,
    regularCases: sourceCases - splitCases,
    partialCases: splitCases,
    totalCases: sourceCases,
    sourceRecord: plannedSource,
    partialRecord: nextPartial,
    records: candidateRecords,
    recordChanges,
    recordsToSync
  };
}

function formatHarvestPartialSplitConfirmation(plan){
  const lossChanges = plan.recordChanges.filter(change => change.actualLossChange);
  const otherLossChanges = lossChanges.filter(change => !change.isSource);
  const instructionChanges = plan.recordChanges.filter(change => change.plantingCaseInstructionChange);
  const lines = [
    "通常収穫の一部を部分収穫へ分けて保存しますか？",
    "",
    `日付: ${plan.sourceRecord.date}`,
    `この記録分の合計: ${plan.totalCases}ケース（変わりません）`,
    `通常収穫: ${plan.sourceCases} → ${plan.regularCases}ケース`,
    `部分収穫: 0 → ${plan.partialCases}ケース`,
    `場所: ${formatPartialHarvestSummary(plan.partialRecord.targets) || "-"}`,
    ""
  ];

  if(lossChanges.length){
    lines.push("収穫ロス率も再計算されます。");
    lossChanges.slice(0, 6).forEach(change => {
      const label = change.isSource ? "この記録" : `${change.date}の別記録`;
      const beforeText = change.actualLossChange.before === "-"
        ? "-"
        : `${change.actualLossChange.before}%`;
      lines.push(`・${label}: ${beforeText} → ${change.actualLossChange.after}%`);
    });
    if(lossChanges.length > 6) lines.push(`・ほか${lossChanges.length - 6}件`);
  }else{
    lines.push("他の記録の収穫ロス率は変わりません。");
  }
  if(otherLossChanges.length){
    lines.push(`別の通常収穫記録 ${otherLossChanges.length}件のロス率を更新します。`);
  }
  if(instructionChanges.length){
    lines.push(`「残り収穫可能ケース」の案内も${instructionChanges.length}件更新します。`);
  }
  lines.push(
    "部分収穫の表示と今後の収穫予想も再計算されます。",
    "",
    "この変更を進めますか？"
  );
  return lines.join("\n");
}

function updateHarvestPartialSplitPreview(){
  const record = splittingHarvestRecordId ? getRecordById(splittingHarvestRecordId) : null;
  const preview = document.getElementById("harvestPartialSplitPreview");
  if(!record || !preview) return;
  const totalCases = clampNumber(record.cases, 0, 999999, 0);
  const inputText = String(document.getElementById("harvestPartialSplitCasesInput")?.value || "").trim();
  const splitCases = Number(inputText);
  if(!inputText || !Number.isSafeInteger(splitCases) || splitCases <= 0){
    preview.textContent = `この記録分の合計 ${totalCases}ケース。部分収穫だったケース数を入力してください。`;
    preview.classList.remove("is-error");
    return;
  }
  if(splitCases >= totalCases){
    preview.textContent = `通常収穫を1ケース以上残すため、${Math.max(1, totalCases - 1)}ケース以下にしてください。`;
    preview.classList.add("is-error");
    return;
  }
  preview.textContent = `この記録分の合計 ${totalCases}ケース（変更なし）＝ 通常収穫 ${totalCases - splitCases}ケース ＋ 部分収穫 ${splitCases}ケース`;
  preview.classList.remove("is-error");
}

function openHarvestPartialSplitWindow(id){
  if(!ensureProtectedOperationAccess("通常収穫の一部を部分収穫へ分ける")) return;
  if(!ensureGoogleSheetLocalMutationAllowed("通常収穫の一部を部分収穫へ分ける")) return;
  if(editingHarvestRecordId || editingPartialHarvestRecordId || splittingHarvestRecordId
    || editingPlantingEventId || activePlantingRecordId){
    showToast("編集中の記録を保存または破棄してから、通常収穫を分けてください");
    return;
  }
  const record = getRecordById(id);
  if(!record || record.type !== "fullHarvest"){
    showToast("分ける通常収穫記録が見つかりません");
    return;
  }
  if(!ensureSyncConflictResolvedBeforeChange("record", record, "通常収穫の一部を部分収穫へ分ける")) return;
  const recordCases = getStrictIntegerInRange(record.cases, 2, RECORD_MAX_CASES);
  if(recordCases === null){
    showToast("通常収穫を1ケース以上残せる記録だけ分けられます");
    return;
  }

  const modal = document.getElementById("harvestPartialSplitModal");
  const casesInput = document.getElementById("harvestPartialSplitCasesInput");
  const buildingInput = document.getElementById("harvestPartialSplitBuildingInput");
  const sourceSummary = document.getElementById("harvestPartialSplitSourceSummary");
  if(!modal || !casesInput || !buildingInput || !sourceSummary) return;

  splittingHarvestRecordId = Number(record.id);
  harvestPartialSplitReturnFocus = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  sourceSummary.textContent = `${record.date || "日付なし"}の通常収穫 ${recordCases}ケース`;
  casesInput.value = "";
  casesInput.max = String(recordCases - 1);
  const firstPallet = getPalletKeysFromRecord(record)
    .map(key => parsePalletKey(String(key || "")))
    .find(pallet => BUILDINGS.includes(pallet.building));
  buildingInput.value = String(firstPallet?.building || currentBuilding || MIN_BUILDING);
  document.querySelectorAll('input[name="harvestPartialSplitBed"]').forEach(input => {
    input.checked = false;
  });
  updateHarvestPartialSplitPreview();
  showPageBlockingUi(modal);
  requestAnimationFrame(() => casesInput.focus({ preventScroll: true }));
}

function closeHarvestPartialSplitWindow(options = {}){
  const modal = document.getElementById("harvestPartialSplitModal");
  const returnFocus = harvestPartialSplitReturnFocus;
  hidePageBlockingUi(modal);
  splittingHarvestRecordId = null;
  harvestPartialSplitReturnFocus = null;
  const casesInput = document.getElementById("harvestPartialSplitCasesInput");
  if(casesInput) casesInput.value = "";
  document.querySelectorAll('input[name="harvestPartialSplitBed"]').forEach(input => {
    input.checked = false;
  });
  if(options.restoreFocus !== false && returnFocus?.isConnected){
    requestAnimationFrame(() => returnFocus.focus({ preventScroll: true }));
  }
}

function saveHarvestPartialSplit(){
  if(!ensureProtectedOperationAccess("通常収穫と部分収穫への分割を保存")) return;
  if(!ensureGoogleSheetLocalMutationAllowed("通常収穫と部分収穫への分割を保存", { allowBackgroundSend: true })) return;
  const sourceRecord = splittingHarvestRecordId ? getRecordById(splittingHarvestRecordId) : null;
  if(!sourceRecord || sourceRecord.type !== "fullHarvest"){
    showToast("分ける通常収穫記録が見つかりません");
    closeHarvestPartialSplitWindow();
    return;
  }
  if(!ensureSyncConflictResolvedBeforeChange("record", sourceRecord, "通常収穫の一部を部分収穫へ分ける")) return;

  const sourceCases = getStrictIntegerInRange(sourceRecord.cases, 2, RECORD_MAX_CASES);
  const partialCases = getStrictIntegerInRange(
    document.getElementById("harvestPartialSplitCasesInput")?.value,
    1,
    RECORD_MAX_CASES
  );
  const building = getStrictIntegerInRange(
    document.getElementById("harvestPartialSplitBuildingInput")?.value,
    MIN_BUILDING,
    MAX_BUILDING
  );
  const beds = Array.from(document.querySelectorAll('input[name="harvestPartialSplitBed"]:checked'))
    .map(input => input.value)
    .filter(bed => bedOrder.includes(bed));
  if(sourceCases === null || partialCases === null || partialCases >= sourceCases){
    showToast("部分収穫分は、通常収穫を1ケース以上残すケース数にしてください");
    return;
  }
  if(building === null || !beds.length){
    showToast("部分収穫した号棟とベッドを入力してください");
    return;
  }

  const id = getNextLocalHarvestRecordId();
  if(id === null){
    showToast("新しい部分収穫記録の番号を作れませんでした");
    return;
  }
  const targets = buildPartialHarvestTargets(building, beds, partialCases);
  const remainingEstimate = getPartialHarvestRemainingCaseEstimate(
    building,
    beds,
    partialCases,
    sourceRecord.date,
    records
  );
  const partialRecord = {
    ...getCurrentRecordSyncMetadata(),
    palletNumberingVersion: CURRENT_PALLET_NUMBERING_VERSION,
    id,
    type: "partialHarvest",
    date: sourceRecord.date,
    cases: partialCases,
    memo: [
      `通常収穫${sourceCases}ケースのうち${partialCases}ケースを部分収穫へ訂正`,
      `部分収穫後の残り予想: 約${remainingEstimate}ケース（目安）`
    ].join("\n"),
    targets,
    palletKeys: []
  };
  partialRecord.duplicateKey = getRecordDuplicateKey(partialRecord);

  const plan = buildHarvestPartialSplitPlan(sourceRecord, partialRecord, records);
  if(!plan.ok){
    showToast(plan.message);
    return;
  }
  const conflictingChange = plan.recordsToSync.find(record => (
    getHarvestRecordIdentityKey(record) !== getHarvestRecordIdentityKey(sourceRecord)
    && hasSyncConflictForEntity("record", record)
  ));
  if(conflictingChange){
    showToast(`${conflictingChange.date || "別日"}の影響記録に同期の競合があります。先に競合を解消してください`);
    return;
  }
  if(!window.confirm(formatHarvestPartialSplitConfirmation(plan))){
    showToast("通常収穫と部分収穫への分割をキャンセルしました");
    return;
  }

  records = plan.records;
  saveRecordsToStorage();
  syncHarvestPlantingPendingFlags();
  maybePromptRecordExport();
  closeHarvestPartialSplitWindow();
  const queuedCount = plan.recordsToSync.reduce((count, record) => (
    count + Number(queueGoogleSheetRecordSend(record, {
      successMessage: record === plan.recordsToSync[plan.recordsToSync.length - 1]
        ? "通常収穫と部分収穫への分割を送信しました"
        : "",
      failureMessage: "変更は端末内に保存されています。スプレッドシートは未送信です"
    }))
  ), 0);
  const predictionUpdate = recalculateHarvestPredictionAfterPartialHarvest([sourceRecord.date]);
  refreshRecordDataUi({ actualLoss: true });

  const otherLossCount = plan.recordChanges.filter(change => !change.isSource && change.actualLossChange).length;
  const predictionText = predictionUpdate.recalculated && predictionUpdate.changed
    ? " 収穫予想も変わったため、収穫場所を確認してください。"
    : "";
  const otherLossText = otherLossCount
    ? ` 別の通常収穫${otherLossCount}件のロス率も更新しました。`
    : "";
  showToast(
    `${sourceCases}ケースを通常${plan.regularCases}・部分${partialCases}ケースに分けました。`
    + otherLossText
    + predictionText
    + (queuedCount ? " スプレッドシートへ送信中です。" : " スプレッドシートは未送信です。")
  );
}

async function savePartialHarvestRecord(){
  if(!ensureProtectedOperationAccess("各パレット部分収穫の保存", { workerAllowed: true })) return;
  if(!ensureGoogleSheetLocalMutationAllowed("各パレット部分収穫を保存", { allowBackgroundSend: true })) return;
  const date = document.getElementById("recordDateInput").value;
  const enteredMemo = document.getElementById("recordMemoInput")?.value.trim() || "";
  const batch = validatePartialHarvestBatchEntries(date);
  if(!batch.ok){
    showToast(batch.message || "部分収穫の入力内容を確認してください");
    return;
  }

  const recordIds = getNextLocalHarvestRecordIds(batch.entries.length);
  if(recordIds.length !== batch.entries.length){
    showToast("部分収穫記録の番号を作成できませんでした");
    return;
  }
  const newRecords = batch.entries.map((entry, index) => {
    const memo = appendAutoMemo(
      enteredMemo,
      `部分収穫後の残り予想: 約${entry.remainingEstimate}ケース（目安）`
    );
    const record = {
      ...getCurrentRecordSyncMetadata(),
      palletNumberingVersion:CURRENT_PALLET_NUMBERING_VERSION,
      id:recordIds[index],
      type:"partialHarvest",
      date,
      cases:entry.cases,
      memo,
      targets:entry.targets,
      palletKeys:[]
    };
    record.duplicateKey = getRecordDuplicateKey(record);
    return record;
  });

  batch.entries.forEach(entry => {
    appendHarvestProgressEntry(
      "partial",
      entry.beds.map(bed => getHarvestProgressBedKey(entry.building, bed)),
      entry.cases
    );
  });
  records.unshift(...newRecords);
  saveRecordsToStorage();
  maybePromptRecordExport();
  clearCasePlacement();
  const predictionUpdate = recalculateHarvestPredictionAfterPartialHarvest([date]);
  const queuedCount = queueGoogleSheetRecordBatchSend(newRecords, {
    successMessage:getPartialHarvestBatchSaveToastMessage({
      count:newRecords.length,
      totalCases:batch.totalCases,
      syncState: "送信済み",
      predictionUpdate
    }),
    failureMessage:getPartialHarvestBatchSaveToastMessage({
      count:newRecords.length,
      totalCases:batch.totalCases,
      syncState: "未送信",
      predictionUpdate
    })
  });
  refreshRecordDataUi({ actualLoss: true });
  resetPartialHarvestBatchEntries();
  showToast(getPartialHarvestBatchSaveToastMessage({
    count:newRecords.length,
    totalCases:batch.totalCases,
    sendQueued:queuedCount === newRecords.length,
    predictionUpdate
  }));
}

function editPartialHarvestRecord(id){
  if(!ensureProtectedOperationAccess("部分収穫記録の編集")) return;
  if(!ensureGoogleSheetLocalMutationAllowed("部分収穫記録を編集")) return;
  if(editingHarvestRecordId || editingPlantingEventId || activePlantingRecordId){
    showToast("編集中の記録を保存または破棄してから、部分収穫記録を編集してください");
    return;
  }

  const record = getRecordById(id);
  const formModel = getPartialHarvestEditFormModel(record);
  if(!record || !formModel){
    showToast("この部分収穫記録は現在の編集画面では編集できません");
    return;
  }
  if(!ensureSyncConflictResolvedBeforeChange("record", record, "部分収穫記録を編集")) return;

  const returnFocus = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  if(switchTab("record") === false) return;

  const modal = document.getElementById("partialHarvestEditModal");
  const dateInput = document.getElementById("partialHarvestEditDateInput");
  const buildingInput = document.getElementById("partialHarvestEditBuildingInput");
  const casesInput = document.getElementById("partialHarvestEditCasesInput");
  const memoInput = document.getElementById("partialHarvestEditMemoInput");
  if(!modal || !dateInput || !buildingInput || !casesInput || !memoInput) return;

  editingPartialHarvestRecordId = Number(record.id);
  partialHarvestEditReturnFocus = returnFocus;
  dateInput.value = formModel.date;
  buildingInput.value = String(formModel.building);
  casesInput.value = formModel.cases > 0 ? String(formModel.cases) : "";
  memoInput.value = formModel.memo;
  document.querySelectorAll('input[name="partialHarvestEditBed"]').forEach(input => {
    input.checked = formModel.beds.includes(input.value);
  });
  showPageBlockingUi(modal);
  requestAnimationFrame(() => dateInput.focus({ preventScroll: true }));
}

function closePartialHarvestEditWindow(options = {}){
  const modal = document.getElementById("partialHarvestEditModal");
  const shouldRestoreFocus = options.restoreFocus !== false;
  const returnFocus = partialHarvestEditReturnFocus;
  hidePageBlockingUi(modal);
  editingPartialHarvestRecordId = null;
  partialHarvestEditReturnFocus = null;
  document.querySelectorAll('input[name="partialHarvestEditBed"]').forEach(input => {
    input.checked = false;
  });
  const casesInput = document.getElementById("partialHarvestEditCasesInput");
  const memoInput = document.getElementById("partialHarvestEditMemoInput");
  if(casesInput) casesInput.value = "";
  if(memoInput) memoInput.value = "";
  if(shouldRestoreFocus && returnFocus?.isConnected){
    requestAnimationFrame(() => returnFocus.focus({ preventScroll: true }));
  }
}

function savePartialHarvestRecordEdit(){
  if(!ensureProtectedOperationAccess("部分収穫記録の保存")) return;
  if(!ensureGoogleSheetLocalMutationAllowed("部分収穫記録を保存", { allowBackgroundSend: true })) return;
  const record = editingPartialHarvestRecordId
    ? getRecordById(editingPartialHarvestRecordId)
    : null;
  if(!record || record.type !== "partialHarvest"){
    showToast("編集する部分収穫記録が見つかりません");
    closePartialHarvestEditWindow();
    return;
  }

  const date = document.getElementById("partialHarvestEditDateInput")?.value || "";
  const building = clampNumber(
    document.getElementById("partialHarvestEditBuildingInput")?.value,
    MIN_BUILDING,
    MAX_BUILDING,
    NaN
  );
  const beds = Array.from(document.querySelectorAll('input[name="partialHarvestEditBed"]:checked'))
    .map(input => input.value)
    .filter(bed => bedOrder.includes(bed));
  const cases = clampNumber(
    document.getElementById("partialHarvestEditCasesInput")?.value || 0,
    0,
    999999,
    0
  );
  const enteredMemo = document.getElementById("partialHarvestEditMemoInput")?.value.trim() || "";

  if(!parseDateOnlyString(date)){
    showToast("日付を入力してください");
    return;
  }
  if(!BUILDINGS.includes(building) || !beds.length){
    showToast("部分収穫した号棟とベッドを入力してください");
    return;
  }
  if(cases <= 0){
    showToast("部分収穫で取れたケース数を入力してください");
    return;
  }

  const targets = buildPartialHarvestTargets(building, beds, cases);
  const sourceRecords = getHarvestRecordEditTimelineRecords(record.id, date);
  const previousDate = String(record.date || "");
  const remainingEstimate = getPartialHarvestRemainingCaseEstimate(
    building,
    beds,
    cases,
    date,
    sourceRecords
  );
  record.date = date;
  record.cases = cases;
  record.memo = appendAutoMemo(
    stripPartialHarvestAutoMemo(enteredMemo),
    `部分収穫後の残り予想: 約${remainingEstimate}ケース（目安）`
  );
  record.targets = targets;
  record.palletKeys = [];
  record.duplicateKey = getRecordDuplicateKey(record);

  records.sort(compareRecordsByDateDesc);
  saveRecordsToStorage();
  closePartialHarvestEditWindow();
  const predictionUpdate = recalculateHarvestPredictionAfterPartialHarvest([previousDate, date]);
  const sendQueued = queueGoogleSheetRecordSend(record, {
    successMessage: getPartialHarvestSaveToastMessage({
      edited: true,
      syncState: "送信済み",
      predictionUpdate
    }),
    failureMessage: getPartialHarvestSaveToastMessage({
      edited: true,
      syncState: "未送信",
      predictionUpdate
    })
  });
  refreshRecordDataUi({ actualLoss: true });
  showToast(getPartialHarvestSaveToastMessage({
    edited: true,
    sendQueued,
    predictionUpdate
  }));
}
