// ===== 部分収穫：保存・編集 =====
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

async function savePartialHarvestRecord(){
  if(!ensureProtectedOperationAccess("各パレット部分収穫の保存")) return;
  if(!ensureGoogleSheetLocalMutationAllowed("各パレット部分収穫を保存", { allowBackgroundSend: true })) return;
  const date = document.getElementById("recordDateInput").value;
  const cases = clampNumber(document.getElementById("partialHarvestCasesInput")?.value || 0, 0, 999999, 0);
  const building = clampNumber(document.getElementById("partialHarvestBuildingInput")?.value || currentBuilding, MIN_BUILDING, MAX_BUILDING, NaN);
  const beds = Array.from(document.querySelectorAll('input[name="partialHarvestBed"]:checked'))
    .map(input => input.value)
    .filter(bed => bedOrder.includes(bed));
  const enteredMemo = document.getElementById("recordMemoInput")?.value.trim() || "";

  if(!date){
    showToast("日付を入力してください");
    return;
  }
  if(!BUILDINGS.includes(building) || !beds.length){
    showToast("各パレットから部分収穫した号棟とベッドを入力してください");
    return;
  }
  if(cases <= 0){
    showToast("各パレット部分収穫で取れたケース数を入力してください");
    return;
  }

  const targets = buildPartialHarvestTargets(building, beds, cases);
  const remainingEstimate = getPartialHarvestRemainingCaseEstimate(building, beds, cases, date);
  const memo = appendAutoMemo(enteredMemo, `部分収穫後の残り予想: 約${remainingEstimate}ケース（目安）`);

  const record = {
    ...getCurrentRecordSyncMetadata(),
    palletNumberingVersion: CURRENT_PALLET_NUMBERING_VERSION,
    id: Date.now(),
    type: "partialHarvest",
    date,
    cases,
    memo,
    targets,
    palletKeys: []
  };
  record.duplicateKey = getRecordDuplicateKey(record);

  records.unshift(record);
  saveRecordsToStorage();
  maybePromptRecordExport();
  clearCasePlacement();
  const predictionUpdate = recalculateHarvestPredictionAfterPartialHarvest([date]);
  const sendQueued = queueGoogleSheetRecordSend(record, {
    successMessage: getPartialHarvestSaveToastMessage({
      syncState: "送信済み",
      remainingEstimate,
      predictionUpdate
    }),
    failureMessage: getPartialHarvestSaveToastMessage({
      syncState: "未送信",
      remainingEstimate,
      predictionUpdate
    })
  });
  refreshRecordDataUi({ actualLoss: true });
  document.getElementById("partialHarvestCasesInput").value = "";
  showToast(getPartialHarvestSaveToastMessage({
    sendQueued,
    remainingEstimate,
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
