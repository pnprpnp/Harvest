function updatePartialHarvestDeductionNote(casePlan = getHarvestCasePlan()){
  const note = document.getElementById("partialHarvestDeductionNote");
  if(!note) return;
  const partialCases = clampNumber(casePlan?.partialCases, 0, 999999, 0);
  const regularCases = clampNumber(casePlan?.regularCases, 0, 999999, 0);
  const overageCases = getHarvestSelectionOverageCases();
  const lines = partialCases > 0
    ? [`うち部分収穫済み: ${partialCases}ケース`, `通常順で収穫する分: ${regularCases}ケース`]
    : [];
  if(overageCases > 0) lines.push(`${formatHarvestProgressCases(overageCases)}ケース超過`);
  note.hidden = !lines.length;
  note.textContent = lines.join("\n");
  note.classList.toggle("has-overage", overageCases > 0);
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

function renderSeedlingHouseUi(plan = getCurrentSeedlingHousePlan()){
  const nextPosition = formatSeedlingHousePosition(plan.nextKey);
  const openButton = document.getElementById("seedlingHouseOpenBtn");
  if(openButton){
    openButton.setAttribute("aria-label", `1号棟の苗取り場所。次回開始 ${nextPosition}`);
  }

  const summary = document.getElementById("seedlingHouseSummary");
  const note = document.getElementById("seedlingHousePlanNote");
  const beds = document.getElementById("seedlingHouseBeds");
  if(!summary || !note || !beds) return;

  const showSelection = !!plan.shouldShowSelection;
  const selectedKeys = showSelection ? plan.selectedKeys : [];
  const skippedKeys = showSelection ? plan.skippedKeys : [];
  if(showSelection){
    const allocatedSegments = Array.isArray(plan.allocatedSegments) && plan.allocatedSegments.length
      ? plan.allocatedSegments
      : [{ type: "selected", keys: selectedKeys }];
    summary.textContent = allocatedSegments.map(segment => (
      `${segment.keys.length}枚${segment.type === "skipped" ? "飛ばす" : "取る"}`
    )).join(" → ");
    note.textContent = `開始 ${nextPosition} ／ ` + allocatedSegments.map(segment => (
      `${segment.type === "skipped" ? "飛ばす" : "取る"} ${formatSeedlingHouseSelectionRange(segment.keys)}`
    )).join(" → ");
  }else{
    summary.textContent = `次回開始 ${nextPosition}`;
    note.textContent = "計算前は次回の苗取り開始場所だけを表示します。";
  }

  const modal = document.getElementById("seedlingHouseModal");
  if(!modal?.classList.contains("show")){
    beds.innerHTML = "";
    return;
  }

  const selectedSet = new Set(selectedKeys);
  const skippedSet = new Set(skippedKeys);
  beds.innerHTML = "";

  bedMap.forEach(bedName => {
    const item = SEEDLING_HOUSE_BED_SEQUENCE.find(entry => entry.bed === bedName)
      || { bed: bedName, direction: 1 };
    const bed = document.createElement("button");
    bed.type = "button";
    bed.className = "bed bedCollapsed simulationBedOverview seedlingHouseBedOverview";
    bed.dataset.uiClick = "setSeedlingHouseBed";
    bed.dataset.uiArg = item.bed;
    const title = document.createElement("div");
    title.className = "bedTitle";
    title.innerHTML = `<span class="bedTitleMain">${escapeHtml(item.bed)}</span><span class="bedTitleHint">${item.direction < 0 ? "78 → 1" : "1 → 78"}</span>`;
    bed.appendChild(title);
    appendBedOverviewMap(bed, SEEDLING_HOUSE_BUILDING, item.bed, {
      selectedSet,
      seedlingSkippedSet: skippedSet,
      seedlingNextSet: !showSelection && plan.nextKey ? new Set([plan.nextKey]) : new Set()
    });
    const counts = getBedSummaryCounts(SEEDLING_HOUSE_BUILDING, item.bed, { selectedSet });
    const skippedCount = [...skippedSet].filter(key => parsePalletKey(key).bed === item.bed).length;
    const countRow = document.createElement("div");
    countRow.className = "simulationBedOverviewCounts";
    countRow.innerHTML = [
      counts.selected ? `<span class="simulationBedOverviewCountSelected">取る ${counts.selected}</span>` : "",
      skippedCount ? `<span class="seedlingHouseBedCountSkipped">残す ${skippedCount}</span>` : ""
    ].filter(Boolean).join("");
    bed.appendChild(countRow);
    bed.setAttribute("aria-haspopup", "dialog");
    bed.setAttribute("aria-controls", "seedlingHousePrimaryDetail");
    bed.setAttribute("aria-expanded", seedlingHouseSelectedBed === item.bed ? "true" : "false");
    bed.setAttribute("aria-label", `1号棟 ${item.bed}ベッド。${item.direction < 0 ? "78から1" : "1から78"}の順。今回取る${counts.selected}枚、飛ばして残す${skippedCount}枚。一次定植日数を表示`);
    beds.appendChild(bed);
  });
  renderSeedlingHousePrimaryDetail();
}

function getSeedlingHousePrimaryLotsForBed(bed, referenceDate = new Date()){
  if(!bedOrder.includes(bed)) return [];
  const currentByKey = new Map();
  [...plantingEvents].sort(comparePlantingEventsAsc).forEach(event => {
    (event.seedlingHousePalletKeys || []).forEach(key => currentByKey.set(key, event));
  });
  const lotsByEvent = new Map();
  currentByKey.forEach((event, key) => {
    const pallet = parsePalletKey(key);
    if(pallet.bed !== bed) return;
    const eventId = Number(event.eventId);
    if(!lotsByEvent.has(eventId)){
      const primaryDateText = event.seedlingHousePrimaryPlantingDate || event.plantingDate || "";
      const primaryDate = parseDateOnlyString(primaryDateText);
      lotsByEvent.set(eventId, {
        event,
        eventId,
        primaryDateText,
        ageDays: primaryDate ? Math.max(0, getLocalDayDiff(primaryDate, startOfLocalDay(referenceDate))) : null,
        keys: []
      });
    }
    lotsByEvent.get(eventId).keys.push(key);
  });
  return [...lotsByEvent.values()].sort((left, right) => (
    String(right.primaryDateText).localeCompare(String(left.primaryDateText))
    || right.eventId - left.eventId
  ));
}

function renderSeedlingHousePrimaryDetail(){
  const detail = document.getElementById("seedlingHousePrimaryDetail");
  if(!detail) return;
  const bed = bedOrder.includes(seedlingHouseSelectedBed) ? seedlingHouseSelectedBed : "";
  if(!bed){
    detail.hidden = true;
    return;
  }
  const lots = getSeedlingHousePrimaryLotsForBed(bed);
  detail.innerHTML = `
    <div class="dashboardSeedlingStatusDetailHeader">
      <div class="dashboardSeedlingStatusDetailHeading">
        <span id="seedlingHousePrimaryDetailTitle" class="dashboardSeedlingStatusDetailTitle">${escapeHtml(bed)}ベッドの一次定植</span>
      </div>
      <button type="button" class="dashboardSeedlingStatusDetailClose" data-ui-click="closeSeedlingHousePrimaryDetail" aria-label="詳細を閉じる">×</button>
    </div>
    <div class="seedlingHousePrimaryLots">
      ${lots.length ? lots.map(lot => {
        const isEditing = seedlingHousePrimaryDateEditingEventId === lot.eventId;
        return `<section class="seedlingHousePrimaryLot">
          <div class="seedlingHousePrimaryAge">${lot.ageDays === null ? "一次定植日未記録" : `一次定植から${lot.ageDays}日`}</div>
          <div class="seedlingHousePrimaryMeta">${lot.keys.length}枚</div>
          ${isEditing ? `<div class="seedlingHousePrimaryEditRow">
            <input id="seedlingHousePrimaryDateInput" type="date" value="${escapeHtml(lot.primaryDateText)}" aria-label="一次定植日">
            <button type="button" class="thirdBtn" data-ui-click="saveSeedlingHousePrimaryPlantingDate" data-ui-number="${lot.eventId}">保存</button>
            <button type="button" class="secondaryBtn" data-ui-click="cancelSeedlingHousePrimaryDateEdit">取消</button>
          </div>` : `<div class="seedlingHousePrimaryDateRow">
            <span>一次定植日 ${escapeHtml(lot.primaryDateText || "未記録")}</span>
            <button type="button" class="secondaryBtn" data-ui-click="beginSeedlingHousePrimaryDateEdit" data-ui-number="${lot.eventId}">日付を編集</button>
          </div>`}
        </section>`;
      }).join("") : `<div class="seedlingHousePrimaryEmpty">このベッドの一次定植記録はまだありません</div>`}
    </div>`;
  detail.hidden = false;
  requestAnimationFrame(positionSeedlingHousePrimaryDetail);
}

function positionSeedlingHousePrimaryDetail(){
  const detail = document.getElementById("seedlingHousePrimaryDetail");
  const bed = document.querySelector(`[data-ui-click="setSeedlingHouseBed"][data-ui-arg="${seedlingHouseSelectedBed}"]`);
  if(!detail || detail.hidden || !bed) return;
  const rect = bed.getBoundingClientRect();
  const margin = 12;
  const availableBelow = window.innerHeight - rect.bottom - margin;
  const availableAbove = rect.top - margin;
  detail.style.maxHeight = `${Math.max(140, Math.max(availableBelow, availableAbove) - 8)}px`;
  const height = Math.min(detail.scrollHeight, parseFloat(detail.style.maxHeight));
  const top = availableBelow >= Math.min(height, 180)
    ? rect.bottom + 8
    : Math.max(margin, rect.top - height - 8);
  const width = detail.offsetWidth;
  const left = Math.min(Math.max(margin, rect.left + (rect.width - width) / 2), window.innerWidth - width - margin);
  detail.style.top = `${top}px`;
  detail.style.left = `${Math.max(margin, left)}px`;
}

function setSeedlingHouseBed(bed){
  if(!bedOrder.includes(bed)) return;
  seedlingHouseSelectedBed = bed;
  seedlingHousePrimaryDateEditingEventId = null;
  renderSeedlingHouseUi();
}

function closeSeedlingHousePrimaryDetail(){
  const bed = seedlingHouseSelectedBed;
  seedlingHouseSelectedBed = null;
  seedlingHousePrimaryDateEditingEventId = null;
  const detail = document.getElementById("seedlingHousePrimaryDetail");
  if(detail){
    detail.hidden = true;
    detail.style.removeProperty("top");
    detail.style.removeProperty("left");
    detail.style.removeProperty("max-height");
  }
  document.querySelector(`[data-ui-click="setSeedlingHouseBed"][data-ui-arg="${bed}"]`)
    ?.setAttribute("aria-expanded", "false");
}

function beginSeedlingHousePrimaryDateEdit(eventId){
  seedlingHousePrimaryDateEditingEventId = Number(eventId);
  renderSeedlingHousePrimaryDetail();
}

function cancelSeedlingHousePrimaryDateEdit(){
  seedlingHousePrimaryDateEditingEventId = null;
  renderSeedlingHousePrimaryDetail();
}

function saveSeedlingHousePrimaryPlantingDate(eventId){
  if(!ensureGoogleSheetLocalMutationAllowed("一次定植日を編集")) return;
  const value = String(document.getElementById("seedlingHousePrimaryDateInput")?.value || "").trim();
  if(!isStrictDateOnlyString(value)){
    showToast("一次定植日を入力してください");
    return;
  }
  const index = plantingEvents.findIndex(event => Number(event.eventId) === Number(eventId));
  if(index < 0){
    showToast("編集する苗取り記録が見つかりません");
    return;
  }
  const updatedEvent = normalizePlantingEvent({
    ...plantingEvents[index],
    seedlingHousePrimaryPlantingDate: value
  });
  if(!updatedEvent){
    showToast("一次定植日を更新できませんでした");
    return;
  }
  plantingEvents[index] = updatedEvent;
  savePlantingEventsToStorage();
  setPlantingEventSyncStatus(updatedEvent, "edited");
  queueGoogleSheetPlantingEventSend(updatedEvent, {
    successMessage: "1号棟の一次定植日を更新して送信しました",
    failureMessage: "一次定植日は端末内に保存済みです。スプレッドシートは未送信です"
  });
  seedlingHousePrimaryDateEditingEventId = null;
  renderSeedlingHouseUi();
  showToast("一次定植日を更新しました");
}

function toggleSeedlingHouseStartEditor(){
  const editor = document.getElementById("seedlingHouseStartEditor");
  if(!editor) return;
  editor.hidden = !editor.hidden;
  if(editor.hidden) return;
  const nextKey = getCurrentSeedlingHousePlan().nextKey;
  const pallet = parsePalletKey(nextKey);
  const bedInput = document.getElementById("seedlingHouseStartBedInput");
  const numberInput = document.getElementById("seedlingHouseStartNumberInput");
  if(bedInput) bedInput.value = bedOrder.includes(pallet.bed) ? pallet.bed : "A";
  if(numberInput) numberInput.value = Number.isInteger(pallet.number) ? String(pallet.number) : "1";
}

function saveSeedlingHouseStartCorrection(){
  if(!ensureGoogleSheetLocalMutationAllowed("1号棟の開始位置を修正")) return;
  const bed = String(document.getElementById("seedlingHouseStartBedInput")?.value || "");
  const number = Math.trunc(Number(document.getElementById("seedlingHouseStartNumberInput")?.value));
  const key = getPalletKey(SEEDLING_HOUSE_BUILDING, bed, number);
  if(!isValidSeedlingHousePalletKey(key)){
    showToast("開始位置はA〜Fベッドの1〜78で指定してください");
    return;
  }
  const latestEvent = [...plantingEvents].sort(comparePlantingEventsDesc)[0] || null;
  if(latestEvent){
    const index = plantingEvents.findIndex(event => Number(event.eventId) === Number(latestEvent.eventId));
    const updatedEvent = normalizePlantingEvent({ ...latestEvent, seedlingHouseNextStartKey: key });
    if(index < 0 || !updatedEvent){
      showToast("開始位置を保存できませんでした");
      return;
    }
    plantingEvents[index] = updatedEvent;
    settings.seedlingHouseInitialStartKey = "";
    saveSettingsToStorage();
    savePlantingEventsToStorage();
    setPlantingEventSyncStatus(updatedEvent, "edited");
    queueGoogleSheetPlantingEventSend(updatedEvent, {
      successMessage: "1号棟の開始位置を修正して送信しました",
      failureMessage: "開始位置は端末内に保存済みです。スプレッドシートは未送信です"
    });
  }else{
    settings.seedlingHouseInitialStartKey = key;
    saveSettingsToStorage();
  }
  const editor = document.getElementById("seedlingHouseStartEditor");
  if(editor) editor.hidden = true;
  renderSeedlingHouseUi();
  showToast(`1号棟の開始位置を${formatSeedlingHousePosition(key)}に変更しました`);
}

function formatMonitorTabDetailValueHtml(value){
  return String(value || "")
    .split("\n")
    .map(line => formatInstructionLineHtml(line || " "))
    .join("<br>");
}

function getMonitorTabCaseSummarySections(value){
  const placementLines = [];
  const remainingByBuilding = new Map();
  const remainingOtherLines = [];
  const locationLabels = {
    "手前":"前",
    "前側":"前",
    "前":"前",
    "中央":"中",
    "中側":"中",
    "中":"中",
    "後ろ":"奥",
    "後側":"奥",
    "奥側":"奥",
    "奥":"奥"
  };

  String(value || "").split("\n").forEach(rawLine => {
    const line = rawLine.trim();
    if(!line || line === "なし") return;
    const placementMatch = line.match(/^(\d+)号棟\s*配置\s*[:：]\s*([\d,.]+)\s*ケース$/);
    if(placementMatch){
      placementLines.push(`${placementMatch[1]}号棟：${placementMatch[2]}ケース`);
      return;
    }
    const remainingMatch = line.match(/^(\d+)号棟\s*(手前|前側|前|中央|中側|中|後ろ|後側|奥側|奥)\s*[:：]\s*([\d,.]+)\s*ケース(?:\s*残す)?$/);
    if(remainingMatch){
      const building = remainingMatch[1];
      if(!remainingByBuilding.has(building)) remainingByBuilding.set(building, {});
      remainingByBuilding.get(building)[locationLabels[remainingMatch[2]]] = remainingMatch[3];
      return;
    }
    remainingOtherLines.push(line);
  });

  const remainingLines = Array.from(remainingByBuilding.entries()).map(([building, locations]) => {
    const details = ["前", "中", "奥"]
      .filter(location => Object.prototype.hasOwnProperty.call(locations, location))
      .map(location => location + locations[location])
      .join("");
    return `${building}号棟：${details}ケース`;
  });
  remainingLines.push(...remainingOtherLines);
  return {
    placement:placementLines.length ? placementLines.join("\n") : "なし",
    remaining:remainingLines.length ? remainingLines.join("\n") : "なし"
  };
}

function formatMonitorTabMetricValueHtml(value, fallbackUnit){
  const parts = getMonitorMetricParts(value, fallbackUnit);
  const unit = parts.unit || "";
  const noteContent = parts.note
    ? escapeHtml(parts.note).replace(
        /（未定植分\s+\d+枚）/g,
        '<span class="monitorUnplantedSeedlingNote">$&</span>'
      )
    : "";
  const noteHtml = parts.note
    ? `<span class="instructionAutoNote">${noteContent}</span>`
    : "";
  return `<span class="instructionEmphasis">${escapeHtml(parts.value)}${escapeHtml(unit)}</span>${noteHtml}`;
}

function getMonitorSendSummaryLabelHtml(label, iconKind){
  const iconPaths = {
    seedling:'<path d="M10 16V8.5"></path><path d="M10 10c-3.2 0-5.2-1.7-5.5-5 3.4-.2 5.3 1.5 5.5 5Z"></path><path d="M10 12c3 0 4.8-1.6 5.1-4.6-3.1-.2-4.9 1.4-5.1 4.6Z"></path><path d="M6 16h8"></path>',
    cases:'<path d="m4 6 6-3 6 3-6 3Z"></path><path d="M4 6v7l6 4 6-4V6"></path><path d="M10 9v8"></path>',
    location:'<path d="M15.2 8.1c0 3.8-5.2 8.4-5.2 8.4S4.8 11.9 4.8 8.1a5.2 5.2 0 1 1 10.4 0Z"></path><circle cx="10" cy="8.1" r="1.7"></circle>',
    remaining:'<rect x="3.5" y="4" width="13" height="12" rx="1.8"></rect><path d="M3.5 8h13M7.8 4v12"></path>'
  };
  return `<span class="monitorSendSummaryLabel"><svg class="monitorSendSummaryIcon" viewBox="0 0 20 20" aria-hidden="true">${iconPaths[iconKind] || iconPaths.remaining}</svg><span>${escapeHtml(label)}</span></span>`;
}

function renderForecastSummary(){
  const casePlan = getHarvestCasePlan();
  updateHarvestCalculationButtonState();
  updatePartialHarvestDeductionNote(casePlan);
  updateRecordPartialHarvestIncludedNote();
  renderSeedlingHouseUi();
  const resultActions = document.getElementById("forecastResultActions");
  const hasForecastResult = !!harvestSummary
    && Array.isArray(harvestFillKeys)
    && harvestFillKeys.length > 0;
  if(resultActions){
    resultActions.hidden = !hasForecastResult;
  }
  document.getElementById("forecastSimulationCard")
    ?.classList.toggle("has-forecast-result-actions", hasForecastResult);
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
    const monitorContent = buildCurrentMonitorRemoteContent();
    const monitorFields = parseMonitorInstructionFields(monitorContent.instructionText);
    const seedlingValueHtml = formatMonitorTabMetricValueHtml(monitorFields.seedling, "枚");
    const caseValueHtml = formatMonitorTabMetricValueHtml(monitorFields.cases, "ケース");
    const harvestLocationValue = monitorFields.harvestLocation || "-";
    const remainingCasesValue = monitorFields.remainingCases || "なし";
    const caseSummarySections = getMonitorTabCaseSummarySections(remainingCasesValue);
    instructionBox.innerHTML = `
      <div class="monitorSendMetricGrid">
        <div class="monitorSendMetricItem">
          ${getMonitorSendSummaryLabelHtml("苗枚数", "seedling")}
          <div class="monitorSendSummaryValue">${seedlingValueHtml}</div>
        </div>
        <div class="monitorSendMetricItem">
          ${getMonitorSendSummaryLabelHtml("収穫ケース数", "cases")}
          <div class="monitorSendSummaryValue">${caseValueHtml}</div>
        </div>
      </div>
      <div class="monitorSendDetailItem">
        ${getMonitorSendSummaryLabelHtml("収穫場所", "location")}
        <div class="monitorSendDetailValue">${formatMonitorTabDetailValueHtml(harvestLocationValue)}</div>
      </div>
      <div class="monitorSendDetailItem">
        ${getMonitorSendSummaryLabelHtml("配置コンテナ数", "cases")}
        <div class="monitorSendDetailValue casePlacementContainerValue">${formatMonitorTabDetailValueHtml(caseSummarySections.placement)}</div>
      </div>
      <div class="monitorSendDetailItem">
        ${getMonitorSendSummaryLabelHtml("残すコンテナ数", "remaining")}
        <div class="monitorSendDetailValue remainingCaseValue">${formatMonitorTabDetailValueHtml(caseSummarySections.remaining)}</div>
      </div>`;
    renderMonitorMemoReadOnly(monitorContent);
  }
  renderMonitorTabControls();

  const remainingBox = document.getElementById("remainingCasesSummary");
  if(remainingBox){
    remainingBox.textContent = remainingCases + "ケース";
  }
  const remainingCard = document.getElementById("remainingCasesSummaryCard");
  if(remainingCard){
    remainingCard.classList.remove("warning", "danger");
  }
  renderForecastPlantingAgeResult();

  updateBuildingLastHarvestInfo();
  renderCasePlacementSummary();
  if(isMonitorModeOpen){
    renderMonitorMode();
  }
  updateHarvestProgressUi();
  scheduleWorkflowGuideUpdate();
  scheduleMainTabViewportScrollLock();
}

function drawBeds(){
  const container = document.getElementById("beds");
  container.innerHTML = "";
  const recordedSet = getRecordedPalletSet();
  const selectedSet = new Set(harvestFillKeys || []);
  const overageSet = getHarvestOverageKeySet();
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
      overageSet,
      hasPartialHarvestRecords,
      targetDate,
      partialHarvestSourceRecords,
      partialHarvestLookup
    });
    const counts = document.createElement("div");
    counts.className = "simulationBedOverviewCounts";
    counts.innerHTML = summaryCounts.selectable > 0
      ? `
        <span class="simulationBedOverviewCountSelected">選択 ${summaryCounts.selected}</span>
        <span class="simulationBedOverviewCountSelectable">選択可 ${summaryCounts.selectable}</span>
      `
      : "";
    bed.appendChild(counts);
    attachBedDetailOpenTapHandler(bed, "forecast", currentBuilding, b);
    bed.setAttribute(
      "aria-label",
      `${currentBuilding}号棟 ${b}ベッド。選択 ${summaryCounts.selected}パレット、選択可能 ${summaryCounts.selectable}パレット。タップで拡大してパレットを選択`
    );
    container.appendChild(bed);
  });
}


function toggleRecordPallet(building, bed, number){
  const key = getPalletKey(building, bed, number);
  const recordedSet = getRecordTabRecordedPalletSet();

  const flowAssignmentChanged = applyRecordPlantingFlowAssignment(key);
  if(flowAssignmentChanged !== null){
    if(flowAssignmentChanged){
      recalcHarvestSummary();
      renderHarvestSelectionMapsForActiveTab();
      renderForecastSummary();
      syncRecordPlantingSummaryFromSelection();
      updateRecordActualLoss();
      updateRecordPlantingCountPresetUi();
      renderRecordPlantingFlow();
      scheduleHarvestStateSave();
    }
    return;
  }

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
      && !isRecordPlantingFlowActive()
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
    if(recordSelectionMode === "planting"){
      removeRecordPlantingCountForKey(key);
      removeRecordPlantingQualityForKey(key);
      markRecordPlantingFlowBuildingDirty(building);
    }else{
      removeHarvestSelectionOverage(key);
    }
    reconcileHarvestSelectionOverage();
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
    const nextTotal = recordSelectionMode === "harvest"
      ? getCurrentHarvestTotalRaw() + getPredictedHarvestForPallet(building, bed, number)
      : 0;
    harvestFillKeys.push(key);
    if(recordSelectionMode === "planting"){
      setRecordPlantingCountForKey(key);
      markRecordPlantingFlowBuildingDirty(building);
    }else{
      markHarvestSelectionOverage(key, nextTotal);
    }
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
  const additionalBuildings = recordSelectionMode === "planting"
    ? []
    : [...new Set(recordAdditionalBuildings.map(Number).filter(building => BUILDINGS.includes(building)))];
  const additionalBuildingSet = new Set(additionalBuildings);
  const sortedBuildings = [...new Set(sourceKeys.map(key => parsePalletKey(key).building))]
    .filter(building => BUILDINGS.includes(building))
    .filter(building => !additionalBuildingSet.has(building))
    .sort((a, b) => a - b);
  if(sortedBuildings.includes(2) && sortedBuildings.includes(9)){
    sortedBuildings.splice(sortedBuildings.indexOf(9), 1);
    sortedBuildings.unshift(9);
  }
  return [...sortedBuildings, ...additionalBuildings];
}

function renderRecordBuildingDisplayControls(){
  const controls = document.getElementById("recordBuildingDisplayControls");
  const options = document.getElementById("recordBuildingAddOptions");
  const summary = document.getElementById("recordBuildingDisplaySummary");
  const chooser = document.getElementById("recordBuildingAddChooser");
  const openButton = document.getElementById("recordBuildingAddOpenBtn");
  if(!controls || !options) return;

  const isHarvestMode = recordSelectionMode !== "planting";
  controls.hidden = !isHarvestMode;
  if(!isHarvestMode){
    if(chooser) chooser.hidden = true;
    if(openButton) openButton.setAttribute("aria-expanded", "false");
    return;
  }

  const displayedBuildings = getRecordMapBuildings();
  const availableBuildings = BUILDINGS.filter(building => !displayedBuildings.includes(building));
  options.innerHTML = availableBuildings.map(building => (
    `<button type="button" data-ui-click="addRecordBuildingDisplay" data-ui-number="${building}">${building}号棟</button>`
  )).join("");
  if(openButton) openButton.disabled = availableBuildings.length === 0;
  if(!availableBuildings.length && chooser){
    chooser.hidden = true;
    if(openButton) openButton.setAttribute("aria-expanded", "false");
  }
  if(summary){
    summary.textContent = displayedBuildings.length
      ? `表示中: ${displayedBuildings.map(building => `${building}号棟`).join("・")}`
      : "表示中の号棟はありません";
  }
}

function toggleRecordBuildingAddChooser(){
  if(recordSelectionMode === "planting") return;
  const chooser = document.getElementById("recordBuildingAddChooser");
  const openButton = document.getElementById("recordBuildingAddOpenBtn");
  if(!chooser || openButton?.disabled) return;
  chooser.hidden = !chooser.hidden;
  if(openButton) openButton.setAttribute("aria-expanded", String(!chooser.hidden));
  if(!chooser.hidden) chooser.querySelector("button")?.focus();
}

function addRecordBuildingDisplay(building){
  if(recordSelectionMode === "planting") return;
  const normalizedBuilding = Number(building);
  if(!BUILDINGS.includes(normalizedBuilding)) return;
  if(getRecordMapBuildings().includes(normalizedBuilding)) return;
  recordAdditionalBuildings.push(normalizedBuilding);
  const chooser = document.getElementById("recordBuildingAddChooser");
  const openButton = document.getElementById("recordBuildingAddOpenBtn");
  if(chooser) chooser.hidden = true;
  if(openButton) openButton.setAttribute("aria-expanded", "false");
  renderRecordBuildingDisplayControls();
  drawRecordBeds();
  scheduleHarvestStateSave();
}

function removeRecordBuildingDisplay(building){
  if(recordSelectionMode === "planting") return;
  const normalizedBuilding = Number(building);
  if(!recordAdditionalBuildings.includes(normalizedBuilding)) return;

  recordAdditionalBuildings = recordAdditionalBuildings.filter(item => Number(item) !== normalizedBuilding);
  const previousKeyCount = harvestFillKeys.length;
  harvestFillKeys = harvestFillKeys.filter(key => parsePalletKey(key).building !== normalizedBuilding);
  const removedSelectionCount = previousKeyCount - harvestFillKeys.length;

  if(removedSelectionCount > 0){
    refreshAfterHarvestSelectionChanged();
    if(activeAppTab !== "record") drawRecordBeds();
  }else{
    drawRecordBeds();
    scheduleHarvestStateSave();
  }
  showToast(removedSelectionCount > 0
    ? `${normalizedBuilding}号棟と選択中の${removedSelectionCount}枚を削除しました`
    : `${normalizedBuilding}号棟を削除しました`);
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
  const recordTab = document.getElementById("recordTab");
  if(recordTab && recordTab.style.display === "none") return;

  const container = document.getElementById("recordBeds");
  if(!container) return;
  container.innerHTML = "";
  renderRecordBuildingDisplayControls();
  renderRecordPlantingFlow();
  const recordedSet = getRecordTabRecordedPalletSet();
  const selectedSet = new Set(harvestFillKeys || []);
  const plantingAllowedSet = recordSelectionMode === "planting" ? getPlantingAllowedPalletSet({ fast: true }) : null;
  const allBuildings = getRecordMapBuildings(plantingAllowedSet);
  const buildings = isRecordPlantingFlowActive()
    ? (recordPlantingFlowStage !== "building" && allBuildings.includes(Number(recordPlantingFlowBuilding))
        ? [Number(recordPlantingFlowBuilding)]
        : [])
    : allBuildings;
  const partialHarvestSourceRecords = getActiveHarvestTimelineRecords(records);
  const hasPartialHarvestRecords = recordSelectionMode !== "planting"
    && partialHarvestSourceRecords.some(record => record.type === "partialHarvest");
  const targetDate = getHarvestTargetDate();
  const partialHarvestLookup = hasPartialHarvestRecords
    ? getHarvestRecordLookup(targetDate, partialHarvestSourceRecords)
    : null;

  if(!buildings.length){
    if(isRecordPlantingFlowActive() && recordPlantingFlowStage === "building") return;
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
    const isAdditionalBuilding = recordSelectionMode !== "planting"
      && recordAdditionalBuildings.includes(building);
    buildingTitle.className = "recordBuildingMapTitle" + (isAdditionalBuilding ? " hasRemoveAction" : "");
    const buildingTitleText = document.createElement("span");
    buildingTitleText.className = "recordBuildingMapTitleText";
    buildingTitleText.textContent = building + "号棟";
    buildingTitle.appendChild(buildingTitleText);
    if(isAdditionalBuilding){
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "recordBuildingMapRemoveBtn";
      removeButton.textContent = "削除";
      removeButton.dataset.uiClick = "removeRecordBuildingDisplay";
      removeButton.dataset.uiNumber = String(building);
      removeButton.setAttribute("aria-label", `${building}号棟の追加表示を削除`);
      buildingTitle.appendChild(removeButton);
    }
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
        overageSet: recordSelectionMode === "harvest" ? getHarvestOverageKeySet() : new Set(),
        recordedSet,
        plantingAllowedSet,
        plantingCountsByPallet: recordPlantingCountsByPallet,
        plantingFlowStage: isRecordPlantingFlowActive() ? recordPlantingFlowStage : "",
        plantingQualityByPallet: getRecordPlantingFlowQualityByPallet(),
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
      const qualityText = isRecordPlantingFlowActive() && recordPlantingFlowStage === "quality"
        ? formatPlantingQualityDistribution(bedSelectedKeys, getRecordPlantingFlowQualityByPallet())
        : "";
      counts.innerHTML = plantingAllowedSet
        ? ((qualityText || plantingCountText)
            ? `<span class="recordBedOverviewCountBreakdown">${escapeHtml(qualityText || plantingCountText)}</span>`
            : "")
        : `
          <span class="simulationBedOverviewCountSelected">選択 ${summaryCounts.selected}</span>
          <span class="simulationBedOverviewCountRecorded">記録済 ${summaryCounts.recorded}</span>
        `;
      bed.appendChild(counts);
      attachBedDetailOpenTapHandler(bed, "record", building, b);
      bed.setAttribute(
        "aria-label",
        plantingAllowedSet
          ? `${building}号棟 ${b}ベッド。植え付け数 ${plantingCountText || "未選択"}。タップで拡大してパレットを選択`
          : `${building}号棟 ${b}ベッド。選択 ${summaryCounts.selected}パレット、記録済み ${summaryCounts.recorded}パレット。タップで拡大してパレットを選択`
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

function getActualLossRateForPalletKeys(palletKeys, cases, targetDate = null, sourceRecords = records){
  const normalizedKeys = [...new Set(Array.isArray(palletKeys) ? palletKeys : [])]
    .filter(key => isValidPalletKeyString(String(key || "")));
  if(!normalizedKeys.length || cases <= 0) return "";

  let plantedTotal = 0;
  let partialHarvestTotal = 0;
  const targetDay = startOfLocalDay(targetDate || getHarvestTargetDate());
  normalizedKeys.forEach(key => {
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

function getActualLossRateFromSelectedPallets(cases, targetDate = null, sourceRecords = records){
  return getActualLossRateForPalletKeys(harvestFillKeys, cases, targetDate, sourceRecords);
}

function getHarvestLossPartialAllocationUncertaintyPoints(
  palletKeys,
  targetDate = null,
  sourceRecords = records
){
  const selectedKeys = [...new Set(Array.isArray(palletKeys) ? palletKeys : [])]
    .map(key => String(key || ""))
    .filter(isValidPalletKeyString);
  if(!selectedKeys.length) return 0;

  const targetDay = startOfLocalDay(targetDate || getHarvestTargetDate());
  const selectedSet = new Set(selectedKeys);
  const timelineRecords = getActiveHarvestTimelineRecords(sourceRecords);
  const lookup = getHarvestRecordLookup(targetDay, timelineRecords);
  const plantedTotal = selectedKeys.reduce((total, key) => {
    const pallet = parsePalletKey(key);
    return total + getHarvestPlantCountForPallet(
      pallet.building,
      pallet.bed,
      pallet.number,
      targetDay
    );
  }, 0);
  if(plantedTotal <= 0) return 0;

  let uncertainHeads = 0;
  timelineRecords.forEach(record => {
    if(record?.type !== "partialHarvest") return;
    const recordDate = parseDateOnlyString(record.date);
    if(!recordDate) return;
    const recordDay = startOfLocalDay(recordDate);
    const diffDays = getLocalDayDiff(recordDay, targetDay);
    if(diffDays < 0 || diffDays > CALCULATION_LOOKBACK_DAYS) return;

    const targetKeys = new Set();
    normalizePartialHarvestTargets(record.targets).forEach(target => {
      for(let number = target.start; number <= target.end; number++){
        targetKeys.add(getPalletKey(target.building, target.bed, number));
      }
    });
    if(!targetKeys.size) return;

    let hasActiveSelectedTarget = false;
    let hasOtherTarget = false;
    targetKeys.forEach(key => {
      const latestFullHarvestDate = getLatestFullHarvestDateForPallet(
        key,
        targetDay,
        timelineRecords,
        { lookup }
      );
      const belongsToCurrentCycle = !latestFullHarvestDate
        || recordDay.getTime() > latestFullHarvestDate.getTime();
      if(belongsToCurrentCycle && selectedSet.has(key)){
        hasActiveSelectedTarget = true;
      }else{
        hasOtherTarget = true;
      }
    });

    if(hasActiveSelectedTarget && hasOtherTarget){
      uncertainHeads += clampNumber(record.cases, 0, 999999, 0) * CASE_SIZE;
    }
  });

  return Math.round((uncertainHeads / plantedTotal) * 1000) / 10;
}

function getHarvestLossEstimateStatus(palletKeys, targetDate = null, sourceRecords = records){
  const uncertaintyPoints = getHarvestLossPartialAllocationUncertaintyPoints(
    palletKeys,
    targetDate,
    sourceRecords
  );
  return {
    isEstimated: uncertaintyPoints >= HARVEST_LOSS_ESTIMATE_THRESHOLD_POINTS,
    uncertaintyPoints
  };
}

function getHarvestLossTimelineRecordsBeforeRecord(record, sourceRecords = records){
  if(!record || record.type !== "fullHarvest") return sourceRecords;
  const recordIdentityKey = getHarvestRecordIdentityKey(record);
  return (Array.isArray(sourceRecords) ? sourceRecords : []).filter(candidate => (
    getHarvestRecordIdentityKey(candidate) !== recordIdentityKey
    && compareRecordsByDateDesc(candidate, record) > 0
  ));
}

function isHarvestLossEstimatedForRecord(record, sourceRecords = records){
  if(!record || record.type !== "fullHarvest") return false;
  const targetDate = parseDateOnlyString(record.date);
  if(!targetDate) return false;
  return getHarvestLossEstimateStatus(
    getPalletKeysFromRecord(record),
    targetDate,
    getHarvestLossTimelineRecordsBeforeRecord(record, sourceRecords)
  ).isEstimated;
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
  const estimateStatus = getHarvestLossEstimateStatus(harvestFillKeys, targetDate);
  const isEstimated = value !== "" && estimateStatus.isEstimated;
  const label = document.querySelector(".recordActualLossField > label");
  if(label) label.textContent = isEstimated ? "推定ロス率" : "実際のロス率";
  display.dataset.value = value === "" ? "" : value;
  display.dataset.uncertaintyPoints = String(estimateStatus.uncertaintyPoints);
  display.textContent = value === "" ? "--" : value + "%";
  display.classList.toggle("empty", value === "");
  display.classList.toggle("estimated", isEstimated);
  display.title = isEstimated
    ? `部分収穫場所による誤差幅が約${estimateStatus.uncertaintyPoints}ポイントあるため推定値です`
    : "";
  display.setAttribute(
    "aria-label",
    value === ""
      ? "ロス率を計算できません"
      : `${isEstimated ? "推定ロス率" : "実際のロス率"} ${value}%`
  );
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

function getRemainingHarvestableCaseInstruction(record, sourceRecords = records){
  if(!record || record.type !== "fullHarvest") return "対象の収穫記録がありません";
  const recordKeys = Array.isArray(record.palletKeys)
    ? record.palletKeys
    : getPalletKeysFromRecord(record);
  const targetBuildings = BUILDINGS.filter(building => recordKeys.some(key => {
    return parsePalletKey(String(key || "")).building === building;
  }));
  if(!targetBuildings.length) return "対象の号棟がありません";

  const referenceDate = parseDateOnlyString(record.date) || new Date();
  const recordedSet = getRecordedPalletSetFromRecords(
    getRecentHarvestRecordsByCount(referenceDate, RECORDED_LOOKBACK_COUNT, sourceRecords)
  );
  const lines = targetBuildings.map(building => {
    const remainingCases = getRemainingHarvestableCasesForBuilding(building, {
      referenceDate,
      recordedSet,
      excludedPalletKeys: recordKeys,
      sourceRecords
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

function askRecordSeedlingReselectConfirm(previousCount, nextCount){
  const panel = document.getElementById("recordSeedlingReselectConfirmPanel");
  const message = document.getElementById("recordSeedlingReselectConfirmMessage");
  const yesButton = document.getElementById("recordSeedlingReselectConfirmYes");
  const noButton = document.getElementById("recordSeedlingReselectConfirmNo");
  const noticeText = [
    `実際に取った苗を${previousCount}枚から${nextCount}枚へ変更しました。`,
    "新しい枚数に合わせて苗植え場所を自動で選択し直しますか？",
    "「選択し直さない」を選ぶと、現在の場所を保ったまま苗ロス率だけ更新します。"
  ].join("\n");

  if(!panel){
    return Promise.resolve(window.confirm(noticeText));
  }
  if(recordSeedlingReselectConfirmResolver){
    resolveRecordSeedlingReselectConfirm(false);
  }

  if(message) message.textContent = noticeText;
  if(yesButton) yesButton.disabled = false;
  if(noButton) noButton.disabled = false;
  panel.classList.add("show");
  requestAnimationFrame(() => noButton?.focus());

  return new Promise(resolve => {
    recordSeedlingReselectConfirmResolver = resolve;
  });
}

function resolveRecordSeedlingReselectConfirm(shouldReselect){
  const panel = document.getElementById("recordSeedlingReselectConfirmPanel");
  const message = document.getElementById("recordSeedlingReselectConfirmMessage");
  const yesButton = document.getElementById("recordSeedlingReselectConfirmYes");
  const noButton = document.getElementById("recordSeedlingReselectConfirmNo");
  if(panel) panel.classList.remove("show");
  if(yesButton) yesButton.disabled = true;
  if(noButton) noButton.disabled = true;
  if(message) message.textContent = "";

  if(recordSeedlingReselectConfirmResolver){
    recordSeedlingReselectConfirmResolver(!!shouldReselect);
    recordSeedlingReselectConfirmResolver = null;
  }
}

async function handleRecordActualSeedlingTrayCountBlur(input){
  if(!input) return;
  const value = input.value;
  const previousCount = clampNumber(input.dataset.previousValue, 0, 999999, 0);
  const nextCount = getRecordActualSeedlingTrayCount();
  const enteredSinceFocus = input.dataset.enteredSinceFocus === "1";
  const actualCountChanged = enteredSinceFocus && previousCount !== nextCount;
  const restorePrevious = input.dataset.clearedOnFocus === "1"
    && !enteredSinceFocus
    && String(value || "").trim() === "";
  if(restorePrevious){
    input.value = input.dataset.previousValue || "";
    delete input.dataset.userEdited;
  }
  delete input.dataset.previousValue;
  delete input.dataset.clearedOnFocus;
  delete input.dataset.enteredSinceFocus;

  if(actualCountChanged && recordSelectionMode === "planting" && !editingPlantingEventId){
    const shouldReselect = await askRecordSeedlingReselectConfirm(previousCount, nextCount);
    if(shouldReselect){
      const record = getActivePlantingRecord();
      const candidateKeys = [
        ...getUnplantedPalletKeysForHarvest(record?.id),
        ...harvestFillKeys
      ];
      harvestFillKeys = getSequentialPlantingPalletKeysWithinCapacity(candidateKeys, record);
      if(isRecordPlantingFlowActive()){
        recordPlantingCompletedBuildings = [];
        recordPlantingFlowStage = "building";
        recordPlantingFlowBuilding = null;
      }
      refreshAfterHarvestSelectionChanged();
      return;
    }
  }

  updateRecordActualSeedlingDisplays();
  updateRecordSeedlingDiffDisplay();
  saveHarvestStateToStorage();
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
    void handleRecordActualSeedlingTrayCountBlur(input);
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
  refreshAllPartialHarvestRemainingEstimators();
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
  resetPartialHarvestBatchEntries();
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
  if(!ensureProtectedOperationAccess("収穫記録に戻る", { workerAllowed: true })) return;
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
