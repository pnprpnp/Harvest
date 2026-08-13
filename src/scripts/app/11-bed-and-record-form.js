function updatePartialHarvestDeductionNote(casePlan = getHarvestCasePlan()){
  const note = document.getElementById("partialHarvestDeductionNote");
  if(!note) return;
  const partialCases = clampNumber(casePlan?.partialCases, 0, 999999, 0);
  const regularCases = clampNumber(casePlan?.regularCases, 0, 999999, 0);
  note.hidden = partialCases <= 0;
  note.textContent = partialCases > 0
    ? `うち部分収穫済み: ${partialCases}ケース\n通常順で収穫する分: ${regularCases}ケース`
    : "";
}

function updateRecordPartialHarvestIncludedNote(){
  const note = document.getElementById("recordPartialHarvestIncludedNote");
  if(!note) return;
  const partialCases = getPartialHarvestCaseDeductionForDate(getHarvestTargetDateString());
  const shouldShow = recordSelectionMode !== "planting" && partialCases > 0;
  note.hidden = !shouldShow;
  note.textContent = shouldShow
    ? "部分収穫も合わせたケース数を入力してください"
    : "";
}

function renderForecastSummary(){
  const casePlan = getHarvestCasePlan();
  const cases = casePlan.totalCases;
  updatePartialHarvestDeductionNote(casePlan);
  updateRecordPartialHarvestIncludedNote();
  const seedlingCounts = getSeedlingInstructionCounts();
  let startLabel = "開始パレット: -";
  if(harvestSummary && harvestSummary.start){
    const p = parsePalletKey(harvestSummary.start);
    startLabel = `開始パレット: ${p.building}号棟 ${p.bed}-${p.number}`;
  }

  let filledCount = 0;
  let endLabel = "終了パレット: -";

  if(harvestSummary){
    filledCount = harvestSummary.filledCount;
    if(harvestSummary.end && harvestSummary.end !== "-"){
      const e = parsePalletKey(harvestSummary.end);
      endLabel = `終了パレット: ${e.building}号棟 ${e.bed}-${e.number}`;
    }
  }

  const remainingCases = getRemainingCasesForCurrentBuilding();

  document.getElementById("forecastSummary").textContent =
    startLabel + "\n" +
    "選択枚数: " + filledCount + "\n" +
    endLabel;

  const instructionBox = document.getElementById("instructionSummary");
  if(instructionBox){
    const completedCases = getHarvestProgressActualCases() + casePlan.partialCases;
    const caseLineHtml = hasAppliedHarvestProgress()
      ? `収穫ケース数: <span class="instructionEmphasis">残り ${escapeHtml(formatHarvestProgressCases(getHarvestProgressRemainingTargetCases()))}ケース</span><span class="instructionAutoNote">（目標 ${escapeHtml(String(cases))} / 収穫済み ${escapeHtml(formatHarvestProgressCases(completedCases))}）</span>`
      : `収穫ケース数: <span class="instructionEmphasis">${escapeHtml(String(cases))}ケース</span>`;
    const harvestLocationLine = formatHarvestLocationInstruction(getHarvestProgressRemainingSelectionKeys());
    const remainingCasesLine = "残すケース: " + getCasePlacementSummaryText();
    instructionBox.innerHTML = [
      `<div class="monitorLine">${getSeedlingInstructionEditorHtml(seedlingCounts.totalCount, seedlingCounts.additionalCount, seedlingCounts.carryoverSeedlings)} / ${caseLineHtml}</div>`,
      formatInstructionDisplayHtml(harvestLocationLine),
      formatInstructionDisplayHtml(remainingCasesLine)
    ].join("");
    bindSeedlingInlineInput();
  }

  const remainingBox = document.getElementById("remainingCasesSummary");
  if(remainingBox){
    remainingBox.textContent = "残り " + remainingCases + "ケース";
  }
  const remainingCard = document.getElementById("remainingCasesSummaryCard");
  if(remainingCard){
    remainingCard.classList.remove("warning", "danger");
  }

  updateBuildingLastHarvestInfo();
  renderCasePlacementSummary();
  if(isMonitorModeOpen){
    renderMonitorMode();
  }
  updateHarvestProgressUi();
  scheduleWorkflowGuideUpdate();
}

function drawBeds(){
  cancelBedDetailOpenLongPress();
  const container = document.getElementById("beds");
  container.innerHTML = "";
  const recordedSet = getRecordedPalletSet();
  const selectedSet = new Set(harvestFillKeys || []);
  const progressCompletedSet = getAppliedHarvestProgressCompletedKeySet();
  const partialHarvestSourceRecords = getActiveHarvestTimelineRecords(records);
  const hasPartialHarvestRecords = partialHarvestSourceRecords.some(record => record.type === "partialHarvest");
  const targetDate = getHarvestTargetDate();
  const partialHarvestLookup = hasPartialHarvestRecords
    ? getHarvestRecordLookup(targetDate, partialHarvestSourceRecords)
    : null;

  bedMap.forEach(b => {
    const bed = document.createElement("div");
    const isProgressCompleted = isHarvestProgressCompletedBed(currentBuilding, b);
    const summaryCounts = getBedSummaryCounts(currentBuilding, b, { selectedSet, recordedSet });
    const collapsedStateClass = isBedFullyFilledInCurrentBuilding(b, recordedSet, selectedSet)
      ? " bedCollapsedFull"
      : "";
    bed.className = "bed bedCollapsed simulationBedOverview" + collapsedStateClass
      + (isProgressCompleted ? " harvestProgressCompletedBed" : "");

    const title = document.createElement("div");
    let titleCls = "bedTitle";
    if(isBedFullyFilledInCurrentBuilding(b, recordedSet, selectedSet)) titleCls += " bedFullySelected";
    title.className = titleCls;
    title.innerHTML = `<span class="bedTitleMain">${b}</span>${isProgressCompleted ? '<span class="harvestProgressCompletedBadge">完了</span>' : ''}`;
    bed.appendChild(title);

    appendBedOverviewMap(bed, currentBuilding, b, {
      selectedSet,
      recordedSet,
      progressCompletedSet,
      hasPartialHarvestRecords,
      targetDate,
      partialHarvestSourceRecords,
      partialHarvestLookup
    });
    const counts = document.createElement("div");
    counts.className = "simulationBedOverviewCounts";
    counts.innerHTML = `
      <span class="simulationBedOverviewCountSelected">選択 ${summaryCounts.selected}</span>
      <span class="simulationBedOverviewCountRecorded">記録済 ${summaryCounts.recorded}</span>
    `;
    bed.appendChild(counts);
    attachBedDetailOpenLongPressHandlers(bed, "forecast", currentBuilding, b);
    bed.setAttribute(
      "aria-label",
      `${currentBuilding}号棟 ${b}ベッド。選択 ${summaryCounts.selected}パレット、記録済み ${summaryCounts.recorded}パレット。長押しで拡大してパレットを選択`
    );
    container.appendChild(bed);
  });
}


function toggleRecordPallet(building, bed, number){
  const key = getPalletKey(building, bed, number);
  const recordedSet = getRecordTabRecordedPalletSet();

  if(recordSelectionMode === "planting" && !isPlantingSelectionAllowed(key, { fast: true })){
    showToast("苗植え場所は、今回収穫した場所か前回苗植えしなかった場所だけ選択できます");
    return;
  }

  if(recordSelectionMode !== "planting" && isRecorded(building, bed, number, { recordedSet, context: "record" })){
    showToast("記録済みパレットは調整できません");
    return;
  }

  const fillIndex = harvestFillKeys.indexOf(key);
  if(fillIndex >= 0){
    if(recordSelectionMode === "planting"
      && getPlantingCountForSelectedKey(key) !== recordPlantingCountPreset){
      const nextCounts = {
        ...recordPlantingCountsByPallet,
        [key]: recordPlantingCountPreset
      };
      if(!canPlantSeedlingKeysWithinCapacity(harvestFillKeys, getActivePlantingRecord(), nextCounts)){
        showToast(getPlantingCapacityExceededMessage());
        return;
      }
      setRecordPlantingCountForKey(key);
      recalcHarvestSummary();
      renderHarvestSelectionMapsForActiveTab();
      renderForecastSummary();
      syncRecordPlantingSummaryFromSelection();
      updateRecordActualLoss();
      updateRecordPlantingCountPresetUi();
      scheduleHarvestStateSave();
      return;
    }
    harvestFillKeys.splice(fillIndex, 1);
    if(recordSelectionMode === "planting") removeRecordPlantingCountForKey(key);
    recalcHarvestSummary();
    renderHarvestSelectionMapsForActiveTab();
    renderForecastSummary();
    if(recordSelectionMode === "harvest") document.getElementById("recordPalletSummaryInput").value = formatPalletSummary(harvestFillKeys);
    syncRecordPlantingSummaryFromSelection();
    updateRecordActualLoss();
    scheduleHarvestStateSave();
    return;
  }else{
    if(recordSelectionMode === "planting" && !canAddPlantingPallet(key, getActivePlantingRecord(), recordPlantingCountPreset)){
      showToast(getPlantingCapacityExceededMessage());
      return;
    }
    harvestFillKeys.push(key);
    if(recordSelectionMode === "planting") setRecordPlantingCountForKey(key);
    sortHarvestFillKeys();
    recalcHarvestSummary();
    renderHarvestSelectionMapsForActiveTab();
    renderForecastSummary();
    if(recordSelectionMode === "harvest") document.getElementById("recordPalletSummaryInput").value = formatPalletSummary(harvestFillKeys);
    syncRecordPlantingSummaryFromSelection();
    updateRecordActualLoss();
    scheduleHarvestStateSave();
    return;
  }
}

function getRecordMapBuildings(allowedSet = null){
  const sourceKeys = [
    ...(harvestFillKeys || []),
    ...(allowedSet instanceof Set ? allowedSet : [])
  ];
  const buildings = [...new Set(sourceKeys.map(key => parsePalletKey(key).building))]
    .filter(building => BUILDINGS.includes(building))
    .sort((a, b) => a - b);
  if(buildings.includes(2) && buildings.includes(9)){
    return [9, ...buildings.filter(building => building !== 9)];
  }
  return buildings;
}

function handleRecordBuildingBedClick(building, bed){
  if(!BUILDINGS.includes(building) || !bedMap.includes(bed)) return;
  currentBuilding = building;
  updateBuildingLabel();
  drawBeds();
  renderForecastSummary();
  openBedDetailWindow("record", bed);
}

function drawRecordBeds(){
  cancelBedDetailOpenLongPress();
  const recordTab = document.getElementById("recordTab");
  if(recordTab && recordTab.style.display === "none") return;

  const container = document.getElementById("recordBeds");
  if(!container) return;
  container.innerHTML = "";
  const recordedSet = getRecordTabRecordedPalletSet();
  const selectedSet = new Set(harvestFillKeys || []);
  const plantingAllowedSet = recordSelectionMode === "planting" ? getPlantingAllowedPalletSet({ fast: true }) : null;
  const buildings = getRecordMapBuildings(plantingAllowedSet);
  const partialHarvestSourceRecords = getActiveHarvestTimelineRecords(records);
  const hasPartialHarvestRecords = recordSelectionMode !== "planting"
    && partialHarvestSourceRecords.some(record => record.type === "partialHarvest");
  const targetDate = getHarvestTargetDate();
  const partialHarvestLookup = hasPartialHarvestRecords
    ? getHarvestRecordLookup(targetDate, partialHarvestSourceRecords)
    : null;

  if(!buildings.length){
    const empty = document.createElement("div");
    empty.className = "recordBuildingMapEmpty";
    empty.textContent = recordSelectionMode === "planting"
      ? "苗植えできる未定植の場所はありません。"
      : "シミュで収穫場所を選択すると、ここに号棟ごとの縦型パレット配置図が表示されます。";
    container.appendChild(empty);
    return;
  }

  buildings.forEach(building => {
    const section = document.createElement("div");
    section.className = "recordBuildingMapSection";

    const buildingTitle = document.createElement("div");
    buildingTitle.className = "recordBuildingMapTitle";
    buildingTitle.textContent = building + "号棟";
    section.appendChild(buildingTitle);

    const beds = document.createElement("div");
    beds.className = "recordBuildingMapBeds";

    bedMap.forEach(b => {
      const bed = document.createElement("div");
      const summaryCounts = getBedSummaryCounts(building, b, { selectedSet, recordedSet });
      let selectableCount = 0;
      if(plantingAllowedSet){
        for(let number = 1; number <= PALLETS_PER_BED; number++){
          if(plantingAllowedSet.has(getPalletKey(building, b, number))) selectableCount++;
        }
      }
      const collapsedStateClass = summaryCounts.selected >= PALLETS_PER_BED
        ? " bedCollapsedFull"
        : (!summaryCounts.selected && !(plantingAllowedSet ? selectableCount : summaryCounts.recorded)
            ? " bedCollapsedInactive"
            : "");
      bed.className = "bed bedCollapsed simulationBedOverview recordBedOverview"
        + collapsedStateClass
        + (recordSelectionMode === "planting" ? " plantingBedMap" : "");

      const title = document.createElement("div");
      let titleCls = "bedTitle";
      if(summaryCounts.selected >= PALLETS_PER_BED) titleCls += " bedFullySelected";
      title.className = titleCls;
      title.innerHTML = `<span class="bedTitleMain">${b}</span>`;
      bed.appendChild(title);

      appendBedOverviewMap(bed, building, b, {
        context: "record",
        selectedSet,
        recordedSet,
        plantingAllowedSet,
        plantingCountsByPallet: recordPlantingCountsByPallet,
        hasPartialHarvestRecords,
        targetDate,
        partialHarvestSourceRecords,
        partialHarvestLookup
      });
      const counts = document.createElement("div");
      counts.className = "simulationBedOverviewCounts recordBedOverviewCounts";
      const bedSelectedKeys = harvestFillKeys.filter(key => {
        const pallet = parsePalletKey(key);
        return pallet.building === building && pallet.bed === b;
      });
      const plantingDistribution = getRecordPlantingCountDistribution(bedSelectedKeys);
      const plantingCountText = [12, 16, 20]
        .filter(count => plantingDistribution[count] > 0)
        .map(count => `${count}×${plantingDistribution[count]}`)
        .join("/");
      counts.innerHTML = plantingAllowedSet
        ? (plantingCountText
            ? `<span class="recordBedOverviewCountBreakdown">${plantingCountText}</span>`
            : "")
        : `
          <span class="simulationBedOverviewCountSelected">選択 ${summaryCounts.selected}</span>
          <span class="simulationBedOverviewCountRecorded">記録済 ${summaryCounts.recorded}</span>
        `;
      bed.appendChild(counts);
      attachBedDetailOpenLongPressHandlers(bed, "record", building, b);
      bed.setAttribute(
        "aria-label",
        plantingAllowedSet
          ? `${building}号棟 ${b}ベッド。植え付け数 ${plantingCountText || "未選択"}。長押しで拡大してパレットを選択`
          : `${building}号棟 ${b}ベッド。選択 ${summaryCounts.selected}パレット、記録済み ${summaryCounts.recorded}パレット。長押しで拡大してパレットを選択`
      );
      beds.appendChild(bed);
    });

    section.appendChild(beds);
    container.appendChild(section);
  });
}


function syncRecordCasesFromMain(force = false){
  const mainCases = document.getElementById("casesInput");
  const recordCases = document.getElementById("recordCasesInput");
  if(!mainCases || !recordCases) return;

  if(force || !recordCasesEdited || recordCases.value === ""){
    recordCases.value = mainCases.value || "";
  }
  updateRecordAutoValueNotes();
}

function getActualLossRateFromSelectedPallets(cases, targetDate = null, sourceRecords = records){
  if(!harvestFillKeys.length || cases <= 0) return "";

  let plantedTotal = 0;
  let partialHarvestTotal = 0;
  const targetDay = startOfLocalDay(targetDate || getHarvestTargetDate());
  harvestFillKeys.forEach(key => {
    const p = parsePalletKey(key);
    plantedTotal += getHarvestPlantCountForPallet(p.building, p.bed, p.number, targetDay);
    partialHarvestTotal += getPartialHarvestCountForPallet(
      p.building,
      p.bed,
      p.number,
      targetDay,
      sourceRecords
    );
  });

  if(plantedTotal <= 0) return "";

  const shippedHeads = cases * CASE_SIZE + partialHarvestTotal;
  const actualHarvestRate = (shippedHeads / plantedTotal) * 100;
  const actualLossRate = 100 - actualHarvestRate;

  return (Math.round(actualLossRate * 10) / 10).toFixed(1);
}

function updateRecordActualLoss(){
  const display = document.getElementById("recordActualLossInput");
  if(!display) return;
  updateRecordInputGuides();

  const cases = clampNumber(
    document.getElementById("recordCasesInput")?.value || document.getElementById("casesInput")?.value || 0,
    0, 999999, 0
  );

  const date = document.getElementById("recordDateInput")?.value || getHarvestTargetDateString();
  const targetDate = parseDateOnlyString(date) || getHarvestTargetDate();
  const value = getActualLossRateFromSelectedPallets(
    getRegularHarvestCases(cases, date),
    targetDate
  );
  display.dataset.value = value === "" ? "" : value;
  display.textContent = value === "" ? "--" : value + "%";
  display.classList.toggle("empty", value === "");
  updateRecordInputGuides();
}

function getRecordActualLossValue(){
  const display = document.getElementById("recordActualLossInput");
  if(!display) return "";
  return String(display.dataset.value || "").trim();
}

function getRecordActualSeedlingTrayCount(){
  const input = document.getElementById("recordActualSeedlingTrayCountInput");
  const inputValue = String(input?.value || "").trim();
  if(inputValue !== ""){
    return clampNumber(inputValue, 0, 999999, 0);
  }
  const activeRecord = getActivePlantingRecord();
  if(activeRecord?.type === "fullHarvest"){
    return clampNumber(activeRecord.actualSeedlingTrayCount, 0, 999999, 0)
      || clampNumber(activeRecord.plannedSeedlingTrayCount, 0, 999999, 0);
  }
  return 0;
}

function getSeedlingCountFromTrayCount(trayCount){
  const safeTrayCount = clampNumber(trayCount, 0, 999999, 0);
  if(safeTrayCount <= 0) return 0;

  const pattern = getSpecialPalletPattern(settings.specialPallet60CountPer3);
  if(!pattern.length) return 0;

  let total = 0;
  for(let index = 0; index < safeTrayCount; index++){
    total += pattern[index % pattern.length];
  }
  return total;
}

function getEstimatedSeedlingTrayCountFromSeedlings(seedlingCount){
  const safeSeedlingCount = clampNumber(seedlingCount, 0, 999999999, 0);
  if(safeSeedlingCount <= 0) return 0;
  const pattern = getSpecialPalletPattern(settings.specialPallet60CountPer3);
  if(!pattern.length) return 0;
  let total = 0;
  let trayCount = 0;
  while(total < safeSeedlingCount && trayCount < RECORD_MAX_SEEDLING_TRAYS){
    total += pattern[trayCount % pattern.length];
    trayCount++;
  }
  return trayCount;
}

function getActualTakenSeedlingTotal(){
  return getSeedlingCountFromTrayCount(getRecordActualSeedlingTrayCount());
}

function getActualPlantedSeedlingTotal(keys = harvestFillKeys, countsByPallet = recordPlantingCountsByPallet){
  if(!Array.isArray(keys) || !keys.length) return 0;
  let total = 0;
  keys.forEach(key => {
    const p = parsePalletKey(String(key || ""));
    if(!BUILDINGS.includes(p.building) || !bedOrder.includes(p.bed) || !Number.isFinite(p.number)) return;
    total += getPlantingCountForSelectedKey(key, countsByPallet);
  });
  return total;
}

function getPlantingAvailableSeedlingTotal(record = getActivePlantingRecord()){
  const takenTotal = getActualTakenSeedlingTotal();
  const carryoverTotal = record?.type === "fullHarvest"
    ? getCarryoverSeedlingStockBeforeRecord(record.id)
    : getCurrentCarryoverSeedlingStock();
  return takenTotal + carryoverTotal;
}

function canPlantSeedlingKeysWithinCapacity(keys, record = getActivePlantingRecord(), countsByPallet = recordPlantingCountsByPallet){
  return getActualPlantedSeedlingTotal(keys, countsByPallet) <= getPlantingAvailableSeedlingTotal(record);
}

function getSequentialPlantingPalletKeysWithinCapacity(keys, record = getActivePlantingRecord()){
  const orderedKeys = [...new Set(Array.isArray(keys) ? keys : [])]
    .sort((a, b) => getOrderIndexFromKey(a) - getOrderIndexFromKey(b));
  const availableTotal = getPlantingAvailableSeedlingTotal(record);
  const selectedKeys = [];
  let plantedTotal = 0;

  for(const key of orderedKeys){
    const pallet = parsePalletKey(String(key || ""));
    if(!BUILDINGS.includes(pallet.building)
      || !bedOrder.includes(pallet.bed)
      || !Number.isFinite(pallet.number)){
      continue;
    }

    const plantingCount = getPlantingCountForPallet(pallet.bed, pallet.number);
    if(plantedTotal + plantingCount > availableTotal) break;
    selectedKeys.push(key);
    plantedTotal += plantingCount;
  }

  return selectedKeys;
}

function canAddPlantingPallet(key, record = getActivePlantingRecord(), plantingCount = recordPlantingCountPreset){
  if(recordSelectionMode !== "planting" || harvestFillKeys.includes(key)) return true;
  return canPlantSeedlingKeysWithinCapacity(
    [...harvestFillKeys, key],
    record,
    { ...recordPlantingCountsByPallet, [key]: normalizePlantingCountPreset(plantingCount) }
  );
}

function getPlantingCapacityExceededMessage(record = getActivePlantingRecord()){
  const availableTotal = getPlantingAvailableSeedlingTotal(record);
  return `苗数が不足しているため選択できません（植えられる上限 ${availableTotal}株）`;
}

function getActualSeedlingLossRateValue(){
  if(recordSelectionMode !== "planting") return "";
  const activeRecord = getActivePlantingRecord();
  const usage = getSeedlingUsageContext({
    recordId: activeRecord?.id
  });
  if(usage.takenTotal <= 0) return "";
  if(usage.plantedTotal <= 0) return "";
  return (Math.round(usage.effectiveLossRate * 10) / 10).toFixed(1);
}

function getRecordSeedlingDiffSummaryText(record = getActivePlantingRecord()){
  if(!record || record.type !== "fullHarvest"){
    return "苗枚数の差を表示する収穫記録がありません。";
  }

  const plannedCount = clampNumber(record.plannedSeedlingTrayCount, 0, 999999, 0);
  const carryoverSeedlings = getCarryoverSeedlingStockBeforeRecord(record.id);
  const actualSeedlingKeys = getSeedlingKeysWithUnplanted(record.palletKeys, { recordId: record.id });
  const actualRequiredCount = getSeedlingTrayCountNeededForKeys(actualSeedlingKeys, { carryoverSeedlings });
  const usage = getSeedlingUsageContext({
    recordId: record.id
  });
  const diff = actualRequiredCount - plannedCount;
  const diffText = diff === 0
    ? "追加でとる枚数: 0枚"
    : (diff > 0 ? `差: +${diff}枚` : `差: ${diff}枚`);

  const lines = [
    usage.mode === "carryover"
      ? `今回余った苗: あり（${formatSeedlingCarryoverLossSourceText(usage)}）`
      : "今回余った苗: なし",
    carryoverSeedlings > 0 ? `前回余った苗: ${carryoverSeedlings}株` : "前回余った苗: 0株",
    `予想した苗枚数: ${plannedCount}枚`,
    `収穫後に分かった実際に必要な苗枚数: ${actualRequiredCount}枚`
  ];

  if(usage.mode === "carryover" && usage.takenTotal > 0){
    lines.push(`今回取った苗のうち繰越見込み: ${usage.currentCarryoverAfter}株`);
  }

  lines.push(diffText);
  return lines.join("\n");
}

function getRemainingHarvestableCaseInstruction(record){
  if(!record || record.type !== "fullHarvest") return "対象の収穫記録がありません";
  const recordKeys = Array.isArray(record.palletKeys)
    ? record.palletKeys
    : getPalletKeysFromRecord(record);
  const targetBuildings = BUILDINGS.filter(building => recordKeys.some(key => {
    return parsePalletKey(String(key || "")).building === building;
  }));
  if(!targetBuildings.length) return "対象の号棟がありません";

  const referenceDate = parseDateOnlyString(record.date) || new Date();
  const recordedSet = getRecordedPalletSet(referenceDate);
  const lines = targetBuildings.map(building => {
    const remainingCases = getRemainingHarvestableCasesForBuilding(building, {
      referenceDate,
      recordedSet,
      excludedPalletKeys: recordKeys
    });
    if(remainingCases <= 0) return "";
    return `${building}号棟：${formatDashboardMetricNumber(remainingCases)}ケース`;
  }).filter(Boolean);
  return lines.length ? lines.join("\n") : "残りなし";
}

function updateRecordSeedlingDiffDisplay(){
  const box = document.getElementById("recordSeedlingDiffBox");
  if(box) box.textContent = getRecordSeedlingDiffSummaryText();

  const record = getActivePlantingRecord();
  const caseInstruction = document.getElementById("recordPlantingCaseInstruction");
  const additionalInstruction = document.getElementById("recordAdditionalSeedlingInstruction");
  if(!record || record.type !== "fullHarvest"){
    if(caseInstruction) caseInstruction.textContent = "対象の収穫記録がありません";
    if(additionalInstruction) additionalInstruction.textContent = "0枚";
    return;
  }

  const plannedCount = clampNumber(record.plannedSeedlingTrayCount, 0, 999999, 0);
  const carryoverSeedlings = getCarryoverSeedlingStockBeforeRecord(record.id);
  const actualSeedlingKeys = getSeedlingKeysWithUnplanted(record.palletKeys, { recordId: record.id });
  const actualRequiredCount = getSeedlingTrayCountNeededForKeys(actualSeedlingKeys, { carryoverSeedlings });
  const additionalCount = Math.max(0, actualRequiredCount - plannedCount);
  const caseText = getRemainingHarvestableCaseInstruction(record);

  if(caseInstruction){
    caseInstruction.textContent = caseText;
  }
  if(additionalInstruction){
    additionalInstruction.textContent = additionalCount + "枚";
  }
}

function updateRecordActualSeedlingDisplays(){
  updateRecordAutoValueNotes();
  const totalDisplay = document.getElementById("recordActualSeedlingTotalDisplay");
  const lossDisplay = document.getElementById("recordActualSeedlingLossInput");
  const activeRecord = getActivePlantingRecord();
  const usage = getSeedlingUsageContext({
    recordId: activeRecord?.id
  });
  updateRecordSeedlingCarryoverHint();
  const takenTotal = usage.takenTotal;
  const lossValue = getActualSeedlingLossRateValue();

  if(totalDisplay){
    totalDisplay.dataset.value = takenTotal > 0 ? String(takenTotal) : "";
    totalDisplay.textContent = takenTotal > 0
      ? (usage.mode === "carryover" && usage.currentCarryoverAfter > 0
          ? `${takenTotal}（繰越見込み ${usage.currentCarryoverAfter}株）`
          : String(takenTotal))
      : "--";
    totalDisplay.classList.toggle("empty", takenTotal <= 0);
  }

  if(lossDisplay){
    lossDisplay.dataset.value = lossValue === "" ? "" : lossValue;
    lossDisplay.textContent = lossValue === "" ? "--" : lossValue + "%";
    lossDisplay.classList.toggle("empty", lossValue === "");
  }
}

function bindRecordActualSeedlingTrayCountInput(){
  const input = document.getElementById("recordActualSeedlingTrayCountInput");
  if(!input || input.dataset.bound === "1") return;

  input.addEventListener("focus", () => {
    if(input.dataset.clearedOnFocus === "1") return;
    input.dataset.previousValue = input.value;
    input.dataset.clearedOnFocus = "1";
    input.dataset.enteredSinceFocus = "0";
    input.value = "";
    updateRecordAutoValueNotes();
  });

  input.addEventListener("input", () => {
    input.dataset.userEdited = "1";
    if(input.dataset.clearedOnFocus === "1"){
      input.dataset.enteredSinceFocus = "1";
    }
    updateRecordAutoValueNotes();
  });

  input.addEventListener("keydown", event => {
    if(event.key === "Enter"){
      event.preventDefault();
      input.blur();
    }
  });

  input.addEventListener("blur", () => {
    const value = input.value;
    const actualCountChanged = input.dataset.enteredSinceFocus === "1";
    const restorePrevious = input.dataset.clearedOnFocus === "1"
      && input.dataset.enteredSinceFocus !== "1"
      && String(value || "").trim() === "";
    if(restorePrevious){
      input.value = input.dataset.previousValue || "";
      delete input.dataset.userEdited;
    }
    delete input.dataset.previousValue;
    delete input.dataset.clearedOnFocus;
    delete input.dataset.enteredSinceFocus;
    if(actualCountChanged && recordSelectionMode === "planting" && !editingPlantingEventId){
      const record = getActivePlantingRecord();
      const candidateKeys = [
        ...getUnplantedPalletKeysForHarvest(record?.id),
        ...harvestFillKeys
      ];
      harvestFillKeys = getSequentialPlantingPalletKeysWithinCapacity(candidateKeys, record);
      refreshAfterHarvestSelectionChanged();
      return;
    }
    updateRecordActualSeedlingDisplays();
    updateRecordSeedlingDiffDisplay();
    saveHarvestStateToStorage();
  });

  input.dataset.bound = "1";
}

function formatPalletNumberSideRanges(numbers){
  const normalizedNumbers = [...new Set(Array.isArray(numbers) ? numbers : [])]
    .map(Number)
    .filter(number => Number.isInteger(number) && number >= 1 && number <= PALLETS_PER_BED)
    .sort((a, b) => a - b);
  const parts = [];
  const numbersInRegularRanges = new Set();

  // 1ずつ続く通常の範囲を優先し、従来どおり「開始-終了」で表示する。
  let regularStartIndex = 0;
  for(let index = 1; index <= normalizedNumbers.length; index++){
    if(index < normalizedNumbers.length && normalizedNumbers[index] === normalizedNumbers[index - 1] + 1){
      continue;
    }
    if(index - regularStartIndex >= 2){
      const start = normalizedNumbers[regularStartIndex];
      const end = normalizedNumbers[index - 1];
      parts.push({ start, text: `${start}-${end}` });
      for(let itemIndex = regularStartIndex; itemIndex < index; itemIndex++){
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
    if(!sideNumbers.length) return;
    let start = sideNumbers[0];
    let previous = sideNumbers[0];

    for(let index = 1; index <= sideNumbers.length; index++){
      const current = sideNumbers[index];
      if(current === previous + 2){
        previous = current;
        continue;
      }
      parts.push({
        start,
        text: start === previous ? String(start) : `${side.label}(${start}-${previous})`
      });
      start = current;
      previous = current;
    }
  });

  return parts
    .sort((a, b) => a.start - b.start)
    .map(part => part.text)
    .join(",");
}

function formatPalletSummary(keys){
  if(!keys || keys.length === 0) return "";

  const groups = {};
  keys.forEach(key => {
    const {building, bed, number} = parsePalletKey(key);
    const groupKey = `${building}号棟${bed}`;
    if(!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(number);
  });

  const orderedGroupKeys = [];
  BUILDINGS.forEach(building => {
    bedOrder.forEach(bed => {
      const groupKey = `${building}号棟${bed}`;
      if(groups[groupKey] && groups[groupKey].length > 0){
        orderedGroupKeys.push(groupKey);
      }
    });
  });

  const parts = orderedGroupKeys.map(groupKey => {
    return `${groupKey}:${formatPalletNumberSideRanges(groups[groupKey])}`;
  });

  return parts.join("\n");
}

function updateRecordWeekdayDisplay(){
  const input = document.getElementById("recordDateInput");
  const display = document.getElementById("recordWeekdayDisplay");
  if(!input || !display) return;

  const date = parseDateOnlyString(input.value);
  if(!date){
    display.textContent = "（--）";
    return;
  }

  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  display.textContent = `（${weekdays[date.getDay()]}）`;
}

function refreshRecordDateDependentUi(){
  updateRecordWeekdayDisplay();
  renderRecordList();
  renderForecastSummary();
  updateRecordActualLoss();
  updateRecordSeedlingCarryoverHint();
  updateRecordActualSeedlingDisplays();
  updateBuildingLastHarvestInfo();
  drawRecordBeds();
}

function handleRecordDateUpdate(saveImmediately = false){
  if(harvestProgressState && !isHarvestProgressContextCurrent(harvestProgressState)){
    resetHarvestProgress({ restorePlan: true, silent: true, save: false });
  }
  refreshRecordDateDependentUi();
  if(saveImmediately){
    saveHarvestStateToStorage();
  }else{
    scheduleHarvestStateSave();
  }
}

function setTodayToRecordDate(){
  const el = document.getElementById("recordDateInput");
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth()+1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  el.value = `${y}-${m}-${d}`;
  updateRecordWeekdayDisplay();
}

function clearRecordForm(){
  const wasEditingRecord = isRecordEditMode();
  if(wasEditingRecord && restoreForecastSelectionState()){
    captureRecordBaseSelection();
  }
  editingHarvestRecordId = null;
  editingHarvestSelectionKeys = null;
  enterHarvestRecordMode();
  restoreRecordSelectionToBase();
  setTodayToRecordDate();
  recordCasesEdited = false;
  recordPlantingSummaryEdited = false;
  syncRecordCasesFromMain(true);
  syncRecordPlantingSummaryFromSelection({ force: true });
  const memoInput = document.getElementById("recordMemoInput");
  if(memoInput) memoInput.value = "";
  const actualSeedlingTrayCountInput = document.getElementById("recordActualSeedlingTrayCountInput");
  if(actualSeedlingTrayCountInput){
    actualSeedlingTrayCountInput.value = "";
    delete actualSeedlingTrayCountInput.dataset.userEdited;
  }
  setRecordSeedlingCarryoverMode("loss", { silent: true });
  const partialCasesInput = document.getElementById("partialHarvestCasesInput");
  if(partialCasesInput) partialCasesInput.value = "";
  document.querySelectorAll('input[name="partialHarvestBed"]').forEach(input => {
    input.checked = false;
  });
  setSelectedQualityMemo(null);
  updateRecordActualLoss();
  updateRecordActualSeedlingDisplays();
  saveHarvestStateToStorage();
}

function resetPlantingRecordChanges(){
  const record = getActivePlantingRecord();
  if(recordSelectionMode !== "planting" || !record || record.type !== "fullHarvest"){
    clearRecordForm();
    return;
  }
  if(!ensureProtectedOperationAccess("収穫記録に戻る")) return;
  if(!ensureGoogleSheetLocalMutationAllowed("収穫記録に戻る操作を")) return;

  hideBedActionMenu();
  hideRecordBedActionMenu();
  plantingRecordDraft = null;
  editingPlantingEventId = null;
  invalidatePlantingAllowedPalletSetCache();
  editHarvestRecord(record.id, {
    accessChecked: true,
    skipForecastCapture: true,
    returnFromPlantingClear: true
  });
}
