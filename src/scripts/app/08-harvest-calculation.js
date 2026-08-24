function getHarvestTargetDateString(){
  const recordDateValue = document.getElementById("recordDateInput")?.value || "";
  return recordDateValue || formatDateOnlyString(new Date());
}

function getLocalDayDiff(fromDate, toDate){
  return Math.floor((startOfLocalDay(toDate).getTime() - startOfLocalDay(fromDate).getTime()) / 86400000);
}

function getEffectivePlantingDateForRecord(record){
  if(!record || record.type !== "fullHarvest" || record.plantingPending) return null;
  const plantingDate = parseDateOnlyString(String(record.plantingDate || "").trim());
  if(plantingDate) return plantingDate;
  return parseDateOnlyString(String(record.date || "").trim());
}

function getLatestPlantingStateByPallet(targetDate, options = {}){
  const targetDay = startOfLocalDay(targetDate);
  const includeTargetDate = !!options.includeTargetDate;
  const cacheKey = `${formatDateOnlyString(targetDay)}:${includeTargetDate ? 1 : 0}`;
  if(plantingStateByPalletCache.has(cacheKey)){
    return plantingStateByPalletCache.get(cacheKey);
  }
  const map = new Map();

  for(const event of plantingEvents){
    const plantingDate = parseDateOnlyString(String(event?.plantingDate || "").trim());
    if(!plantingDate) continue;
    const recordDay = startOfLocalDay(plantingDate);
    const diffDays = getLocalDayDiff(recordDay, targetDay);
    if(diffDays < 0) continue;
    if(diffDays > CALCULATION_LOOKBACK_DAYS) continue;
    if(includeTargetDate ? recordDay.getTime() > targetDay.getTime() : recordDay.getTime() >= targetDay.getTime()) continue;

    const plantingKeys = Array.isArray(event.plantingPalletKeys) ? event.plantingPalletKeys : [];
    if(!plantingKeys.length) continue;

    plantingKeys.forEach(key => {
      const palletKey = String(key || "");
      const current = map.get(palletKey);
      const eventId = Number(event?.eventId) || 0;
      if(!current
        || recordDay.getTime() > current.date.getTime()
        || (recordDay.getTime() === current.date.getTime() && eventId > current.eventId)){
        const explicitCount = Number(event?.plantingCountsByPallet?.[palletKey]);
        map.set(palletKey, {
          date: recordDay,
          eventId,
          plantingCount: ALLOWED_YIELDS.includes(explicitCount) ? explicitCount : null
        });
      }
    });
  }

  plantingStateByPalletCache.set(cacheKey, map);
  if(plantingStateByPalletCache.size > 16){
    plantingStateByPalletCache.delete(plantingStateByPalletCache.keys().next().value);
  }
  return map;
}

function getLatestPlantingDateByPallet(targetDate, options = {}){
  const targetDay = startOfLocalDay(targetDate);
  const includeTargetDate = !!options.includeTargetDate;
  const cacheKey = `${formatDateOnlyString(targetDay)}:${includeTargetDate ? 1 : 0}`;
  if(plantingDateByPalletCache.has(cacheKey)) return plantingDateByPalletCache.get(cacheKey);
  const map = new Map();
  getLatestPlantingStateByPallet(targetDay, options).forEach((state, key) => {
    if(state?.date) map.set(key, state.date);
  });
  plantingDateByPalletCache.set(cacheKey, map);
  if(plantingDateByPalletCache.size > 16){
    plantingDateByPalletCache.delete(plantingDateByPalletCache.keys().next().value);
  }
  return map;
}

function getSelectedPlantingAgeItemsForBuilding(building){
  const targetDate = getHarvestTargetDate();
  const plantingDateByPallet = getLatestPlantingDateByPallet(targetDate);
  const selectedKeys = [...new Set(harvestFillKeys || [])]
    .map(key => String(key || ""))
    .filter(key => {
      const p = parsePalletKey(key);
      return p.building === building && bedOrder.includes(p.bed) && Number.isFinite(p.number);
    })
    .sort((a, b) => getOrderIndexFromKey(a) - getOrderIndexFromKey(b));

  return selectedKeys.map(key => {
    const p = parsePalletKey(key);
    const plantingDate = plantingDateByPallet.get(key) || null;
    return {
      key,
      building: p.building,
      bed: p.bed,
      number: p.number,
      plantingDate,
      ageDays: plantingDate ? getLocalDayDiff(plantingDate, targetDate) : null
    };
  });
}

function formatPlantingAgeMainText(items){
  if(!items.length) return "未選択";

  const ages = items
    .map(item => item.ageDays)
    .filter(age => Number.isFinite(age));

  if(!ages.length) return "定植記録なし";

  const minAge = Math.min(...ages);
  const maxAge = Math.max(...ages);
  const hasUnknown = ages.length < items.length;
  const rangeText = minAge === maxAge ? `${minAge}日目` : `${minAge}〜${maxAge}日目`;
  return "定植から" + rangeText + (hasUnknown ? "（一部記録なし）" : "");
}

function formatPlantingAgeDetailHtml(items){
  if(!items.length) return "この号棟の収穫場所を選択してください";

  return formatPlantingAgeDetailRows(items, "html");
}

function formatPlantingAgeDetailText(items){
  if(!items.length) return "";

  return formatPlantingAgeDetailRows(items, "text");
}

function getPlantingAgeMapGroupLabel(ageDays){
  return Number.isFinite(ageDays) ? `${ageDays}日目` : "定植記録なし";
}

function getPlantingAgeMapGroupCssVariables(groupIndex){
  const safeIndex = Math.max(0, Math.trunc(Number(groupIndex) || 0));
  const hue = Math.round((142 + safeIndex * 137.508) % 360);
  const lightness = 43 + (Math.floor(safeIndex / 3) % 3) * 6;
  return `--planting-age-color:hsl(${hue},68%,${lightness}%);--planting-age-border:hsl(${hue},72%,34%)`;
}

function buildPlantingAgeMapModel(items){
  const sourceItems = Array.isArray(items) ? items : [];
  const finiteAges = [...new Set(sourceItems
    .map(item => item.ageDays)
    .filter(ageDays => Number.isFinite(ageDays)))]
    .sort((left, right) => left - right);
  const groups = finiteAges.map((ageDays, index) => ({
    key: String(ageDays),
    ageDays,
    index
  }));
  if(sourceItems.some(item => !Number.isFinite(item.ageDays))){
    groups.push({ key: "unknown", ageDays: null, index: null });
  }
  const groupByAgeKey = new Map(groups.map(group => [group.key, group]));
  const groupByPalletKey = new Map();
  const itemsByBed = new Map();

  sourceItems.forEach(item => {
    const ageKey = Number.isFinite(item.ageDays) ? String(item.ageDays) : "unknown";
    const group = groupByAgeKey.get(ageKey);
    if(!group) return;
    groupByPalletKey.set(item.key, group);
    if(!itemsByBed.has(item.bed)) itemsByBed.set(item.bed, []);
    itemsByBed.get(item.bed).push(item);
  });

  return { groups, groupByPalletKey, itemsByBed };
}

function getPlantingAgeMapGroupSwatchHtml(group){
  const unknownClass = Number.isFinite(group?.ageDays) ? "" : " is-unknown";
  const style = Number.isInteger(group?.index)
    ? ` style="${getPlantingAgeMapGroupCssVariables(group.index)}"`
    : "";
  return `<span class="plantingAgeMapSwatch${unknownClass}"${style}></span>`;
}

function renderPlantingAgeDetailMap(container, items, building = currentBuilding){
  if(!container) return;
  container.innerHTML = "";
  if(!Array.isArray(items) || !items.length){
    container.innerHTML = '<div class="plantingAgeMapEmpty">この号棟の収穫場所を選択してください</div>';
    return;
  }

  const model = buildPlantingAgeMapModel(items);
  const heading = document.createElement("div");
  heading.className = "plantingAgeMapHeading";
  heading.textContent = `${building}号棟`;
  container.appendChild(heading);

  const legend = document.createElement("div");
  legend.className = "plantingAgeMapLegend";
  legend.setAttribute("aria-label", "定植日数の色分け");
  legend.innerHTML = model.groups.map(group => `
    <span class="plantingAgeMapLegendItem">
      ${getPlantingAgeMapGroupSwatchHtml(group)}
      ${getPlantingAgeMapGroupLabel(group.ageDays)}
    </span>
  `).join("");
  container.appendChild(legend);

  const beds = document.createElement("div");
  beds.className = "plantingAgeMapBeds";
  bedMap.forEach(bedName => {
    const bedItems = model.itemsByBed.get(bedName) || [];
    const bed = document.createElement("section");
    bed.className = "bed bedCollapsed simulationBedOverview plantingAgeMapBed";

    const title = document.createElement("div");
    title.className = "bedTitle";
    title.innerHTML = `<span class="bedTitleMain">${escapeHtml(bedName)}</span>`;
    bed.appendChild(title);

    appendBedOverviewMap(bed, building, bedName, {
      selectedSet: new Set(bedItems.map(item => item.key)),
      plantingAgeGroupByKey: model.groupByPalletKey
    });

    const bedGroups = new Map();
    bedItems.forEach(item => {
      const group = model.groupByPalletKey.get(item.key);
      if(!group) return;
      if(!bedGroups.has(group.key)) bedGroups.set(group.key, { group, count: 0 });
      bedGroups.get(group.key).count++;
    });
    const summary = document.createElement("div");
    summary.className = "plantingAgeMapBedSummary";
    if(bedGroups.size){
      summary.innerHTML = [...bedGroups.values()].map(({ group, count }) => `
        <span class="plantingAgeMapBedSummaryItem">
          ${getPlantingAgeMapGroupSwatchHtml(group)}
          ${getPlantingAgeMapGroupLabel(group.ageDays)}・${count}枚
        </span>
      `).join("");
    }else{
      summary.classList.add("is-empty");
      summary.textContent = "選択なし";
    }
    bed.appendChild(summary);
    const bedSummaryText = bedGroups.size
      ? [...bedGroups.values()]
          .map(({ group, count }) => `${getPlantingAgeMapGroupLabel(group.ageDays)} ${count}枚`)
          .join("、")
      : "今回の選択なし";
    bed.setAttribute("aria-label", `${building}号棟 ${bedName}ベッド。${bedSummaryText}`);
    beds.appendChild(bed);
  });
  container.appendChild(beds);
}

function formatPlantingAgeDetailRows(items, format){
  const rows = [];
  bedOrder.forEach(bed => {
    const bedItems = items
      .filter(item => item.bed === bed)
      .sort((a, b) => a.number - b.number);
    if(!bedItems.length) return;

    const groupsByAge = new Map();
    bedItems.forEach(item => {
      const ageKey = Number.isFinite(item.ageDays) ? String(item.ageDays) : "unknown";
      if(!groupsByAge.has(ageKey)){
        groupsByAge.set(ageKey, {
          ageDays: item.ageDays,
          palletNumbers: []
        });
      }
      groupsByAge.get(ageKey).palletNumbers.push(item.number);
    });

    const rangeText = [...groupsByAge.values()]
      .sort((left, right) => left.palletNumbers[0] - right.palletNumbers[0])
      .map(group => {
        const numberText = formatPalletNumberSideRanges(group.palletNumbers);
        const ageText = Number.isFinite(group.ageDays) ? `${group.ageDays}日目` : "定植記録なし";
        return `${numberText}: ${ageText}`;
      }).join("、");

    if(format === "text"){
      rows.push(`${bed}ベッド ${rangeText}`);
      return;
    }

    rows.push(`
      <div class="plantingAgeBedRow">
        <div class="plantingAgeBedName">${bed}ベッド</div>
        <div class="plantingAgeBedRanges">${rangeText}</div>
      </div>
    `);
  });

  return format === "text"
    ? rows.join("\n")
    : (rows.join("") || "この号棟の収穫場所を選択してください");
}

function getCurrentPlantingAgeSnapshot(){
  const items = getSelectedPlantingAgeItemsForBuilding(currentBuilding);
  const summary = formatPlantingAgeMainText(items);
  const detail = formatPlantingAgeDetailText(items);

  return {
    building: currentBuilding,
    summary,
    detail
  };
}

function normalizePlantingAgeSnapshot(value){
  if(!value) return null;

  if(typeof value === "string"){
    const text = value.trim();
    if(!text) return null;
    return {
      building: "",
      summary: text,
      detail: ""
    };
  }

  if(typeof value !== "object") return null;

  const summary = String(value.summary || "").trim();
  const detail = String(value.detail || "").trim();
  const building = String(value.building || "").trim();
  if(!summary && !detail) return null;

  return {
    building,
    summary,
    detail
  };
}

function formatPlantingAgeForRecord(record){
  const plantingAge = normalizePlantingAgeSnapshot(record?.plantingAge);
  if(!plantingAge) return "";

  const buildingPrefix = plantingAge.building ? plantingAge.building + "号棟 " : "";
  return [
    buildingPrefix + plantingAge.summary,
    plantingAge.detail
  ].filter(Boolean).join("\n");
}

function parsePlantingAgePalletNumbersForDisplay(value){
  const numbers = [];
  const parts = String(value || "").split(",").map(part => part.trim()).filter(Boolean);
  if(!parts.length) return [];

  for(const part of parts){
    const sideMatch = part.match(/^(左|右)\s*[（(]\s*(\d+)(?:\s*[-〜~]\s*(\d+))?\s*[）)]$/);
    if(sideMatch){
      const expectedParity = sideMatch[1] === "左" ? 1 : 0;
      const start = Number(sideMatch[2]);
      const end = Number(sideMatch[3] || sideMatch[2]);
      if(start > end || start % 2 !== expectedParity || end % 2 !== expectedParity) return [];
      for(let number = start; number <= end; number += 2){
        if(number < 1 || number > PALLETS_PER_BED) return [];
        numbers.push(number);
      }
      continue;
    }

    const rangeMatch = part.match(/^(\d+)(?:\s*[-〜~]\s*(\d+))?$/);
    if(!rangeMatch) return [];
    const start = Number(rangeMatch[1]);
    const end = Number(rangeMatch[2] || rangeMatch[1]);
    if(start > end || start < 1 || end > PALLETS_PER_BED) return [];
    for(let number = start; number <= end; number++) numbers.push(number);
  }

  return [...new Set(numbers)].sort((left, right) => left - right);
}

function formatPlantingAgeDetailLineForDisplay(line){
  const match = String(line || "").match(/^(\s*)([A-F])ベッド\s+(.+?)(\s*)$/);
  if(!match) return line;

  const groupsByAgeText = new Map();
  const sections = match[3].split("、").map(section => section.trim()).filter(Boolean);
  if(!sections.length) return line;

  for(const section of sections){
    const sectionMatch = section.match(/^(.+?)\s*[:：]\s*(.+)$/);
    if(!sectionMatch) return line;
    const palletNumbers = parsePlantingAgePalletNumbersForDisplay(sectionMatch[1]);
    const ageText = sectionMatch[2].trim();
    if(!palletNumbers.length || !ageText) return line;
    if(!groupsByAgeText.has(ageText)){
      groupsByAgeText.set(ageText, {
        ageText,
        palletNumbers: []
      });
    }
    groupsByAgeText.get(ageText).palletNumbers.push(...palletNumbers);
  }

  const detailText = [...groupsByAgeText.values()]
    .map(group => ({
      ...group,
      palletNumbers: [...new Set(group.palletNumbers)].sort((left, right) => left - right)
    }))
    .sort((left, right) => left.palletNumbers[0] - right.palletNumbers[0])
    .map(group => `${formatPalletNumberSideRanges(group.palletNumbers)}: ${group.ageText}`)
    .join("、");
  return `${match[1]}${match[2]}ベッド ${detailText}${match[4]}`;
}

function formatPlantingAgeForRecordDetailDisplay(record){
  return formatPlantingAgeForRecord(record)
    .split("\n")
    .map(formatPlantingAgeDetailLineForDisplay)
    .join("\n");
}

function renderPlantingAgeInfo(options = {}){
  const items = getSelectedPlantingAgeItemsForBuilding(currentBuilding);
  const mainText = formatPlantingAgeMainText(items);
  const startPositionText = items.length ? `${items[0].bed}-${items[0].number}` : "未選択";

  const mainInfo = document.getElementById("plantingAgeSummary");
  const recordInfo = document.getElementById("recordBuildingLastHarvestInfo");
  const detail = document.getElementById("plantingAgeDetail");
  const recordDetail = document.getElementById("recordPlantingAgeDetail");

  if(mainInfo) mainInfo.textContent = startPositionText;
  if(recordInfo) recordInfo.textContent = mainText;
  if(detail && options.renderDetail) renderPlantingAgeDetailMap(detail, items, currentBuilding);
  if(recordDetail) recordDetail.innerHTML = formatPlantingAgeDetailHtml(items);
}

function formatForecastPlantingAgeRange(items){
  const sourceItems = Array.isArray(items) ? items : [];
  if(!sourceItems.length) return "未選択";
  const ages = sourceItems
    .map(item => item.ageDays)
    .filter(ageDays => Number.isFinite(ageDays));
  if(!ages.length) return "未記録";
  const minAge = Math.min(...ages);
  const maxAge = Math.max(...ages);
  return minAge === maxAge ? `${minAge}日` : `${minAge}〜${maxAge}日`;
}

function renderForecastPlantingAgeResult(){
  const result = document.getElementById("forecastPlantingAgeResult");
  const range = document.getElementById("forecastPlantingAgeRange");
  const statusCard = document.getElementById("forecastPlacementStatusCard");
  if(!result || !range) return;

  const shouldShow = harvestSelectionMode === "auto"
    && !!harvestSummary
    && Array.isArray(harvestFillKeys)
    && harvestFillKeys.length > 0;
  result.hidden = !shouldShow;
  if(statusCard) statusCard.classList.toggle("hasPlantingAgeDetail", shouldShow);
  if(!shouldShow){
    range.textContent = "未選択";
    return;
  }

  range.textContent = formatForecastPlantingAgeRange(
    getSelectedPlantingAgeItemsForBuilding(currentBuilding)
  );
}

function getRecentHarvestRecordsByCount(referenceDate = new Date(), limit = RECORDED_LOOKBACK_COUNT, sourceRecords = records){
  const referenceDay = startOfLocalDay(referenceDate);
  const safeLimit = clampNumber(limit, 1, 1000, RECORDED_LOOKBACK_COUNT);
  const recentRecords = [];

  sourceRecords = getActiveHarvestTimelineRecords(sourceRecords);

  for(const record of (Array.isArray(sourceRecords) ? sourceRecords : [])){
    if(record?.type === "partialHarvest") continue;
    if(!Array.isArray(record?.palletKeys) || !record.palletKeys.length) continue;
    const recordDate = parseDateOnlyString(record?.date);
    if(!recordDate) continue;
    if(getLocalDayDiff(recordDate, referenceDay) < 0) continue;
    recentRecords.push(record);
    if(recentRecords.length >= safeLimit) break;
  }

  return recentRecords;
}

function getRecordedPalletSetFromRecords(sourceRecords){
  const set = new Set();
  (Array.isArray(sourceRecords) ? sourceRecords : []).forEach(record => {
    if(!Array.isArray(record?.palletKeys)) return;
    record.palletKeys.forEach(key => set.add(key));
  });
  return set;
}

function getRecordedPalletSet(referenceDate = new Date()){
  return getRecordedPalletSetFromRecords(getRecentHarvestRecordsByCount(referenceDate));
}

function getRecordEditingReferenceDate(){
  return parseDateOnlyString(document.getElementById("recordDateInput")?.value || "") || new Date();
}

function getRecordTabRecordedPalletSet(){
  return getRecordedPalletSetFromRecords(
    getRecentHarvestRecordsByCount(
      getRecordEditingReferenceDate(),
      RECORDED_LOOKBACK_COUNT,
      getActiveHarvestTimelineRecords(records)
    )
  );
}

function isRecorded(building, bed, number, options = {}){
  const recordedSet = options.recordedSet || (
    options.context === "record"
      ? getRecordTabRecordedPalletSet()
      : getRecordedPalletSet()
  );
  return recordedSet.has(getPalletKey(building, bed, number));
}

function isFilled(building, bed, number){
  return harvestFillKeys.includes(getPalletKey(building, bed, number));
}

function isBedFullyFilledInCurrentBuilding(bed, recordedSet = getRecordedPalletSet(), selectedSet = new Set(harvestFillKeys || [])){
  let hasTarget = false;
  for(let number=1; number<=PALLETS_PER_BED; number++){
    if(isRecorded(currentBuilding, bed, number, { recordedSet })) continue;
    hasTarget = true;
    if(!selectedSet.has(getPalletKey(currentBuilding, bed, number))) return false;
  }
  return hasTarget;
}

function getCurrentHarvestTotalRaw(keys = harvestFillKeys){
  const sourceKeys = Array.isArray(keys) ? keys : [];
  const useProgressActual = recordSelectionMode !== "planting"
    && sourceKeys === harvestFillKeys
    && hasAppliedHarvestProgress();
  const completedSet = useProgressActual
    ? getAppliedHarvestProgressCompletedKeySet()
    : new Set();
  let total = useProgressActual ? getHarvestProgressActualCases() * CASE_SIZE : 0;
  sourceKeys.forEach(key => {
    if(completedSet.has(key)) return;
    const p = parsePalletKey(key);
    total += getPredictedHarvestForPallet(p.building, p.bed, p.number);
  });
  return total;
}

function getCurrentHarvestTotal(){
  return Math.round(getCurrentHarvestTotalRaw() * 10) / 10;
}

function togglePallet(building, bed, number){
  const key = getPalletKey(building, bed, number);

  if(isHarvestProgressCompletedPallet(key)){
    showToast("途中経過で完了にしたベッドです。変更は途中経過から行ってください");
    return;
  }
  if(isRecorded(building, bed, number)){
    showToast("記録済みパレットは選択できません");
    return;
  }

  const fillIndex = harvestFillKeys.indexOf(key);
  if(fillIndex >= 0){
    harvestFillKeys.splice(fillIndex, 1);
    refreshAfterHarvestSelectionChanged();
    return;
  }else{
    const needHeads = getManualHarvestNeedHeads();
    const nextRawTotal = getCurrentHarvestTotalRaw()
      + getPredictedHarvestForPallet(building, bed, number);
    const nextTotal = Math.round(nextRawTotal * 10) / 10;
    if(!canAddHarvestSelectionTotal(getCurrentHarvestTotalRaw(), nextTotal, needHeads)){
      showToast("必要個数を超えるため追加できません");
      return;
    }
    harvestFillKeys.push(key);
    sortHarvestFillKeys();
    refreshAfterHarvestSelectionChanged({ currentHarvestTotal: nextTotal });
    return;
  }
}

function addOrRemoveWholeBed(bed){
  if(isHarvestProgressCompletedBed(currentBuilding, bed)){
    showToast("途中経過で完了にしたベッドです。変更は途中経過から行ってください");
    return;
  }
  const needHeads = getManualHarvestNeedHeads();
  const recordedSet = getRecordedPalletSet();
  const selectedSet = new Set(harvestFillKeys || []);
  const fullyFilled = isBedFullyFilledInCurrentBuilding(bed, recordedSet, selectedSet);

  if(fullyFilled){
    harvestFillKeys = harvestFillKeys.filter(key => {
      const p = parsePalletKey(key);
      return !(p.building === currentBuilding && p.bed === bed);
    });
    refreshAfterHarvestSelectionChanged();
    showToast(currentBuilding + "号棟 " + bed + "ベッドを全削除しました");
    return;
  }

  let added = 0;
  let runningHarvestTotal = getCurrentHarvestTotalRaw();
  for(let number=1; number<=PALLETS_PER_BED; number++){
    const key = getPalletKey(currentBuilding, bed, number);
    if(recordedSet.has(key)) continue;
    if(selectedSet.has(key)) continue;

    const predictedHarvest = getPredictedHarvestForPallet(currentBuilding, bed, number);
    const nextTotal = Math.round(runningHarvestTotal * 10) / 10 + predictedHarvest;
    if(!canAddHarvestSelectionTotal(runningHarvestTotal, nextTotal, needHeads)) break;

    harvestFillKeys.push(key);
    selectedSet.add(key);
    runningHarvestTotal += predictedHarvest;
    added++;
  }

  if(added === 0){
    showToast(needHeads === null ? "追加できるパレットがありません" : "必要個数を超えるため追加できません");
    return;
  }

  sortHarvestFillKeys();
  refreshAfterHarvestSelectionChanged({ currentHarvestTotal: runningHarvestTotal });
  showToast(currentBuilding + "号棟 " + bed + "ベッドを一括追加しました");
}

function showBedActionMenu(bed){
  hideRecordBedActionMenu();
  activeBedActionBed = bed;
  const menu = document.getElementById("bedActionMenu");
  const title = document.getElementById("bedActionTitle");
  if(title) title.textContent = currentBuilding + "号棟 " + bed + "ベッドの操作";
  if(menu) menu.classList.add("show");
}

function hideBedActionMenu(){
  const menu = document.getElementById("bedActionMenu");
  if(menu) menu.classList.remove("show");
  activeBedActionBed = null;
}

function showRecordBedActionMenu(bed){
  hideBedActionMenu();
  activeRecordBedActionBed = bed;
  const menu = document.getElementById("recordBedActionMenu");
  const title = document.getElementById("recordBedActionTitle");
  const startInput = document.getElementById("recordBedRangeStartInput");
  const endInput = document.getElementById("recordBedRangeEndInput");
  if(title) title.textContent = currentBuilding + "号棟 " + bed + "ベッドの" + (recordSelectionMode === "planting" ? "苗植え枚数調整" : "収穫枚数調整");
  if(startInput) startInput.value = "";
  if(endInput) endInput.value = "";
  if(menu){
    menu.classList.add("show");
  }
  setTimeout(() => startInput?.focus(), 0);
}

function hideRecordBedActionMenu(){
  const menu = document.getElementById("recordBedActionMenu");
  if(menu){
    menu.classList.remove("show");
  }
  activeRecordBedActionBed = null;
}

function getBedSummaryCounts(building, bed, options = {}){
  const selectedSet = options.selectedSet || new Set(harvestFillKeys || []);
  const recordedSet = options.recordedSet || new Set();
  const allowedSet = options.allowedSet || null;
  let selected = 0;
  let recorded = 0;
  let selectable = 0;
  let allowed = 0;
  let unavailable = 0;

  for(let number = 1; number <= PALLETS_PER_BED; number++){
    const key = getPalletKey(building, bed, number);
    if(selectedSet.has(key)) selected++;
    if(recordedSet.has(key)) recorded++;
    else selectable++;
    if(allowedSet){
      if(allowedSet.has(key)) allowed++;
      else unavailable++;
    }
  }

  return { selected, recorded, selectable, allowed, unavailable };
}

function getSelectedNumbersForBed(building, bed, selectedSet = new Set(harvestFillKeys || [])){
  const numbers = [];
  for(let number = 1; number <= PALLETS_PER_BED; number++){
    if(selectedSet.has(getPalletKey(building, bed, number))){
      numbers.push(number);
    }
  }
  return numbers;
}

function appendBedMiniMap(bedElement, building, bed, options = {}){
  if(!bedElement) return;
  const selectedSet = options.selectedSet || new Set(harvestFillKeys || []);
  const recordedSet = options.recordedSet || new Set();
  const allowedSet = options.allowedSet || null;
  const selectedNumbers = getSelectedNumbersForBed(building, bed, selectedSet);
  const hasPartialHarvest = getPartialHarvestCountForPallet(building, bed, 1) > 0;
  const segments = buildMonitorBedSegments(selectedNumbers, building, bed, recordedSet).reverse();
  const bar = document.createElement("div");
  bar.className = "bedMiniMapBar";
  bar.innerHTML = segments.map(segment => {
    let allowedCount = 0;
    if(allowedSet){
      for(let number = segment.start; number <= segment.end; number++){
        if(allowedSet.has(getPalletKey(building, bed, number))) allowedCount++;
      }
    }
    const plantingClass = allowedSet
      ? (segment.selectedCount > 0 ? "plantingSelected" : (allowedCount > 0 ? "plantingSelectable" : "plantingUnavailable"))
      : "";
    const segmentClasses = [
      "bedMiniMapSegment",
      segment.location,
      segment.selectedActive || segment.selectedPartial ? "selected" : "",
      segment.selectedActive ? "active" : "",
      segment.selectedPartial ? "partial" : "",
      segment.recordedActive || segment.recordedPartial ? "recorded" : "",
      segment.recordedActive ? "active" : "",
      segment.recordedPartial ? "partial" : "",
      hasPartialHarvest ? "partialHarvest" : "",
      plantingClass
    ].filter(Boolean).join(" ");
    const title = [
      segment.location === "back" ? "奥" : (segment.location === "middle" ? "中央" : "手前"),
      segment.selectedCount ? `今回:${segment.selectedCount}枚` : "",
      segment.recordedCount ? `収穫済み:${segment.recordedCount}枚` : "",
      hasPartialHarvest ? "各パレット部分収穫あり" : "",
      allowedSet && allowedCount ? `選択可能:${allowedCount}枚` : "",
      allowedSet && !allowedCount ? "選択不可" : ""
    ].filter(Boolean).join(" ");
    return `<span class="${segmentClasses}" title="${escapeHtml(title)}"></span>`;
  }).join("");
  bedElement.appendChild(bar);
}

function getBedOverviewMapCellHtml(building, bed, number, sectionStart, options = {}){
  const key = getPalletKey(building, bed, number);
  const selectedSet = options.selectedSet || new Set();
  const recordedSet = options.recordedSet || new Set();
  const progressCompletedSet = options.progressCompletedSet || new Set();
  const seedlingSkippedSet = options.seedlingSkippedSet instanceof Set
    ? options.seedlingSkippedSet
    : new Set();
  const seedlingNextSet = options.seedlingNextSet instanceof Set
    ? options.seedlingNextSet
    : new Set();
  const plantingAllowedSet = options.plantingAllowedSet instanceof Set
    ? options.plantingAllowedSet
    : null;
  const plantingAgeGroup = options.plantingAgeGroupByKey instanceof Map
    ? options.plantingAgeGroupByKey.get(key)
    : null;
  const partialHarvestCount = options.hasPartialHarvestRecords
    ? getPartialHarvestCountForPallet(
        building,
        bed,
        number,
        options.targetDate,
        options.partialHarvestSourceRecords,
        { lookup: options.partialHarvestLookup }
      )
    : 0;
  const classes = ["dashboardSeedlingBedMapCell", "simulationBedMapCell"];
  let stateText = "未選択";
  let styleText = "";

  if(plantingAllowedSet){
    if(!plantingAllowedSet.has(key)){
      classes.push("is-planting-unavailable");
      stateText = "選択不可";
    }else if(selectedSet.has(key)){
      classes.push("is-planting-selected");
      const plantingCount = getPlantingCountForSelectedKey(key, options.plantingCountsByPallet);
      classes.push(`is-planting-count-${plantingCount}`);
      stateText = `選択済み、${plantingCount}植え`;
      if(options.plantingFlowStage === "quality"){
        const qualityMemo = normalizeOptionalQualityMemo(options.plantingQualityByPallet?.[key]);
        const qualityTag = qualityMemo?.tags?.find(tag => RECORD_PLANTING_FLOW_QUALITY_TAGS.includes(tag)) || "unset";
        classes.push(`is-planting-quality-${qualityTag}`);
        stateText += qualityTag === "unset" ? "、品質未設定" : `、${getQualityTagLabel(qualityTag)}`;
      }
    }else{
      classes.push("is-planting-selectable");
      stateText = "選択可能";
    }
  }else{
    if(selectedSet.has(key)){
      classes.push("is-selected");
      stateText = "選択中";
      if(plantingAgeGroup){
        classes.push("is-planting-age");
        if(Number.isFinite(plantingAgeGroup.ageDays)){
          styleText = getPlantingAgeMapGroupCssVariables(plantingAgeGroup.index);
          stateText = `定植から${plantingAgeGroup.ageDays}日目`;
        }else{
          classes.push("is-planting-age-unknown");
          stateText = "定植記録なし";
        }
      }
    }
    if(seedlingSkippedSet.has(key)){
      classes.push("is-seedling-skipped");
      stateText = "飛ばして残す";
    }
    if(seedlingNextSet.has(key)){
      classes.push("is-seedling-next");
      stateText = "次回開始";
    }
    if(partialHarvestCount > 0){
      classes.push("is-partial-harvest");
      stateText += `、部分収穫 ${partialHarvestCount}株`;
    }
    if(progressCompletedSet.has(key)){
      classes.push("is-progress-completed");
      stateText = "途中経過で完了";
    }
    if(recordedSet.has(key)){
      classes.push("is-recorded");
      stateText = "記録済み";
    }
  }
  if(sectionStart) classes.push("is-section-start");

  return `<span class="${classes.join(" ")}"${styleText ? ` style="${styleText}"` : ""} title="${number}番 ${escapeHtml(stateText)}"></span>`;
}

function appendBedOverviewMap(bedElement, building, bed, options = {}){
  if(!bedElement) return;
  const cells = [];
  for(let row = ROWS; row >= 1; row--){
    const displayRowIndex = ROWS - row;
    const sectionStart = displayRowIndex > 0
      && Math.floor(displayRowIndex * 6 / ROWS) > Math.floor((displayRowIndex - 1) * 6 / ROWS);
    cells.push(getBedOverviewMapCellHtml(building, bed, row * 2 - 1, sectionStart, options));
    cells.push(getBedOverviewMapCellHtml(building, bed, row * 2, sectionStart, options));
  }

  const map = document.createElement("div");
  map.className = "dashboardSeedlingBedMap simulationBedMap"
    + (options.context === "record" ? " recordBedMap" : "");
  map.setAttribute("aria-hidden", "true");
  map.innerHTML = `<div class="dashboardSeedlingBedMapGrid">${cells.join("")}</div>`;
  bedElement.appendChild(map);
}

function applyRecordBedRange(action){
  const bed = activeRecordBedActionBed;
  const startValue = Number(document.getElementById("recordBedRangeStartInput")?.value || 0);
  const endValue = Number(document.getElementById("recordBedRangeEndInput")?.value || 0);
  const recordedSet = getRecordTabRecordedPalletSet();
  const plantingAllowedSet = recordSelectionMode === "planting" ? getPlantingAllowedPalletSet({ fast: true }) : null;
  hideRecordBedActionMenu();
  if(!bed) return;
  if(!Number.isFinite(startValue) || !Number.isFinite(endValue) || startValue <= 0 || endValue <= 0){
    showToast("開始と終了のパレット番号を入力してください");
    return;
  }

  const start = Math.max(1, Math.min(PALLETS_PER_BED, Math.trunc(startValue)));
  const end = Math.max(1, Math.min(PALLETS_PER_BED, Math.trunc(endValue)));
  const rangeStart = Math.min(start, end);
  const rangeEnd = Math.max(start, end);
  if(rangeStart > rangeEnd){
    showToast("パレット番号の範囲を確認してください");
    return;
  }

  if(isRecordPlantingFlowActive() && ["count", "quality"].includes(recordPlantingFlowStage)){
    if(action !== "add"){
      showToast("場所の変更は「場所選択に戻る」から行ってください");
      return;
    }
    let assigned = 0;
    for(let number = rangeStart; number <= rangeEnd; number++){
      const key = getPalletKey(currentBuilding, bed, number);
      if(applyRecordPlantingFlowAssignment(key, { silent: true }) === true) assigned++;
    }
    if(!assigned){
      showToast("指定範囲に変更できる場所がありません");
      return;
    }
    refreshAfterHarvestSelectionChanged();
    refreshBedDetailWindow();
    showToast(`${currentBuilding}号棟 ${bed}ベッドの${assigned}枚を設定しました`);
    return;
  }

  let changed = 0;
  let plantingCapacityReached = false;
  if(action === "add"){
    for(let number = rangeStart; number <= rangeEnd; number++){
      const key = getPalletKey(currentBuilding, bed, number);
      if(plantingAllowedSet){
        if(!plantingAllowedSet.has(key)) continue;
      }else if(isRecorded(currentBuilding, bed, number, { recordedSet, context: "record" })){
        continue;
      }
      if(harvestFillKeys.includes(key)) continue;
      if(recordSelectionMode === "planting" && !canAddPlantingPallet(key)){
        plantingCapacityReached = true;
        continue;
      }

      harvestFillKeys.push(key);
      if(recordSelectionMode === "planting"){
        setRecordPlantingCountForKey(key);
        markRecordPlantingFlowBuildingDirty(currentBuilding);
      }
      changed++;
    }
  }else{
    for(let number = rangeStart; number <= rangeEnd; number++){
      const key = getPalletKey(currentBuilding, bed, number);
      const fillIndex = harvestFillKeys.indexOf(key);
      if(fillIndex < 0) continue;

      harvestFillKeys.splice(fillIndex, 1);
      if(recordSelectionMode === "planting"){
        removeRecordPlantingCountForKey(key);
        removeRecordPlantingQualityForKey(key);
        markRecordPlantingFlowBuildingDirty(currentBuilding);
      }
      changed++;
    }
  }

  if(changed === 0){
    showToast(
      action === "add" && plantingCapacityReached
        ? getPlantingCapacityExceededMessage()
        : (action === "add" ? "追加できるパレットがありません" : "削除できる選択がありません")
    );
    return;
  }

  sortHarvestFillKeys();
  refreshAfterHarvestSelectionChanged();
  refreshBedDetailWindow();
  showToast(plantingCapacityReached
    ? "苗数の上限までパレットを追加しました"
    : currentBuilding + "号棟 " + bed + "ベッドのパレット番号" + rangeStart + "から" + rangeEnd + "を" + changed + "枚" + (action === "add" ? "追加" : "削除") + "しました");
}

function clearSelectedRecordBedFromMenu(){
  const bed = activeRecordBedActionBed;
  hideRecordBedActionMenu();
  if(!bed) return;
  if(isRecordPlantingFlowActive() && ["count", "quality"].includes(recordPlantingFlowStage)){
    showToast("場所の変更は「場所選択に戻る」から行ってください");
    return;
  }

  const beforeCount = harvestFillKeys.length;
  harvestFillKeys = harvestFillKeys.filter(key => {
    const p = parsePalletKey(key);
    return !(p.building === currentBuilding && p.bed === bed);
  });

  if(harvestFillKeys.length === beforeCount){
    showToast("このベッドに解除する選択がありません");
    return;
  }

  if(recordSelectionMode === "planting"){
    const retainedSet = new Set(harvestFillKeys);
    recordPlantingCountsByPallet = normalizePlantingCountsByPallet(recordPlantingCountsByPallet, harvestFillKeys);
    if(plantingRecordDraft?.qualityMemoByPallet){
      plantingRecordDraft.qualityMemoByPallet = normalizeQualityMemoByPallet(
        plantingRecordDraft.qualityMemoByPallet,
        [...retainedSet]
      );
    }
    markRecordPlantingFlowBuildingDirty(currentBuilding);
  }

  refreshAfterHarvestSelectionChanged();
  refreshBedDetailWindow();
  showToast(currentBuilding + "号棟 " + bed + "ベッドを全解除しました");
}

function selectBedToNeed(direction){
  const bed = activeBedActionBed;
  hideBedActionMenu();
  if(!bed) return;
  if(isHarvestProgressCompletedBed(currentBuilding, bed)){
    showToast("途中経過で完了にしたベッドです。変更は途中経過から行ってください");
    return;
  }

  const needHeads = getManualHarvestNeedHeads();

  const originalKeys = [...harvestFillKeys];
  harvestFillKeys = harvestFillKeys.filter(key => {
    const p = parsePalletKey(key);
    return !(p.building === currentBuilding && p.bed === bed);
  });

  if(needHeads !== null && getCurrentHarvestTotal() >= needHeads){
    harvestFillKeys = originalKeys;
    showToast("すでに必要個数に達しています");
    return;
  }

  const numbers = [];
  if(direction === "back"){
    for(let number = PALLETS_PER_BED; number >= 1; number--) numbers.push(number);
  }else{
    for(let number = 1; number <= PALLETS_PER_BED; number++) numbers.push(number);
  }

  let added = 0;
  for(const number of numbers){
    if(isRecorded(currentBuilding, bed, number)) continue;

    const key = getPalletKey(currentBuilding, bed, number);
    if(harvestFillKeys.includes(key)) continue;

    const nextTotal = getCurrentHarvestTotal() + getPredictedHarvestForPallet(currentBuilding, bed, number);
    if(!canAddHarvestSelectionTotal(getCurrentHarvestTotal(), nextTotal, needHeads)) break;

    harvestFillKeys.push(key);
    added++;
  }

  if(added === 0){
    harvestFillKeys = originalKeys;
    showToast(needHeads === null ? "追加できるパレットがありません" : "必要個数を超えるため追加できません");
    return;
  }

  sortHarvestFillKeys();
  refreshAfterHarvestSelectionChanged();
  refreshBedDetailWindow();
  showToast(currentBuilding + "号棟 " + bed + "ベッドを" + (direction === "back" ? "後ろ" : "前") + "から選択しました");
}

function clearSelectedBedFromMenu(){
  const bed = activeBedActionBed;
  hideBedActionMenu();
  if(!bed) return;
  if(isHarvestProgressCompletedBed(currentBuilding, bed)){
    showToast("途中経過で完了にしたベッドです。変更は途中経過から行ってください");
    return;
  }

  const beforeCount = harvestFillKeys.length;
  harvestFillKeys = harvestFillKeys.filter(key => {
    const p = parsePalletKey(key);
    return !(p.building === currentBuilding && p.bed === bed);
  });

  if(harvestFillKeys.length === beforeCount){
    showToast("このベッドに解除する選択がありません");
    return;
  }

  refreshAfterHarvestSelectionChanged();
  refreshBedDetailWindow();
  showToast(currentBuilding + "号棟 " + bed + "ベッドを全解除しました");
}

function openBedDetailFromOverview(context, building, bed){
  if(context === "record"){
    handleRecordBuildingBedClick(building, bed);
    return;
  }
  if(currentBuilding !== building) return;
  openBedDetailWindow("forecast", bed);
}

function attachBedDetailOpenTapHandler(element, context, building, bed){
  element.onclick = () => openBedDetailFromOverview(context, building, bed);
  element.oncontextmenu = (event) => event.preventDefault();
  element.ondragstart = (event) => event.preventDefault();
  element.onkeydown = (event) => {
    if(event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openBedDetailFromOverview(context, building, bed);
  };
  element.tabIndex = 0;
  element.setAttribute("role", "button");
  element.setAttribute("aria-label", `${building}号棟 ${bed}ベッド。タップで詳細表示`);
}

function isBedDetailWindowOpen(){
  return !!document.getElementById("bedDetailModal")?.classList.contains("show");
}

function openBedDetailWindow(context, bed){
  if(!bedMap.includes(bed)) return;
  activeBedDetailContext = context === "record" ? "record" : "forecast";
  activeBedDetailBed = bed;
  expandedForecastBed = null;
  expandedRecordBed = null;
  renderBedDetailWindow();
  const modal = document.getElementById("bedDetailModal");
  showPageBlockingUi(modal);
}

function closeBedDetailWindow(){
  const modal = document.getElementById("bedDetailModal");
  hidePageBlockingUi(modal);
  palletDragState = null;
  hideBedActionMenu();
  hideRecordBedActionMenu();
  activeBedDetailContext = null;
  activeBedDetailBed = null;
}

function refreshBedDetailWindow(){
  if(isBedDetailWindowOpen()){
    renderBedDetailWindow();
  }
}

function showPalletDragToast(message){
  if(!message) return;
  if(palletDragState){
    if(palletDragState.toastMessages.has(message)) return;
    palletDragState.toastMessages.add(message);
  }
  showToast(message);
}

function applyForecastPalletDragChange(building, bed, number, mode){
  const key = getPalletKey(building, bed, number);
  const fillIndex = harvestFillKeys.indexOf(key);

  if(isHarvestProgressCompletedPallet(key)){
    showPalletDragToast("途中経過で完了にしたベッドです。変更は途中経過から行ってください");
    return false;
  }
  if(isRecorded(building, bed, number)){
    showPalletDragToast("記録済みパレットは選択できません");
    return false;
  }

  if(mode === "remove"){
    if(fillIndex < 0) return false;
    harvestFillKeys.splice(fillIndex, 1);
    return true;
  }

  if(fillIndex >= 0) return false;

  const needHeads = getManualHarvestNeedHeads();
  const nextTotal = getCurrentHarvestTotal() + getPredictedHarvestForPallet(building, bed, number);
  if(!canAddHarvestSelectionTotal(getCurrentHarvestTotal(), nextTotal, needHeads)){
    showPalletDragToast("必要個数を超えるため追加できません");
    return false;
  }

  harvestFillKeys.push(key);
  return true;
}

function applyRecordPalletDragChange(building, bed, number, mode){
  const key = getPalletKey(building, bed, number);
  const recordedSet = getRecordTabRecordedPalletSet();

  const flowAssignmentChanged = applyRecordPlantingFlowAssignment(key, { drag: true });
  if(flowAssignmentChanged !== null) return flowAssignmentChanged;

  if(recordSelectionMode === "planting" && !isPlantingSelectionAllowed(key, { fast: true })){
    showPalletDragToast("苗植え場所は、今回収穫した場所か前回苗植えしなかった場所だけ選択できます");
    return false;
  }

  if(recordSelectionMode !== "planting" && isRecorded(building, bed, number, { recordedSet, context: "record" })){
    showPalletDragToast("記録済みパレットは調整できません");
    return false;
  }

  const fillIndex = harvestFillKeys.indexOf(key);
  if(mode === "remove"){
    if(fillIndex < 0) return false;
    harvestFillKeys.splice(fillIndex, 1);
    if(recordSelectionMode === "planting"){
      removeRecordPlantingCountForKey(key);
      removeRecordPlantingQualityForKey(key);
      markRecordPlantingFlowBuildingDirty(building);
    }
    return true;
  }

  if(fillIndex >= 0){
    if(recordSelectionMode !== "planting"
      || getPlantingCountForSelectedKey(key) === recordPlantingCountPreset){
      return false;
    }
    const nextCounts = {
      ...recordPlantingCountsByPallet,
      [key]: recordPlantingCountPreset
    };
    if(!canPlantSeedlingKeysWithinCapacity(harvestFillKeys, getActivePlantingRecord(), nextCounts)){
      showPalletDragToast(getPlantingCapacityExceededMessage());
      return false;
    }
    setRecordPlantingCountForKey(key);
    return true;
  }
  if(recordSelectionMode === "planting" && !canAddPlantingPallet(key)){
    showPalletDragToast(getPlantingCapacityExceededMessage());
    return false;
  }
  harvestFillKeys.push(key);
  if(recordSelectionMode === "planting"){
    setRecordPlantingCountForKey(key);
    markRecordPlantingFlowBuildingDirty(building);
  }
  return true;
}

function updatePalletElementForDrag(pallet, context, mode){
  if(!pallet) return;
  if(mode === "add"){
    pallet.classList.add("harvestFill");
    if(context === "record" && recordSelectionMode === "planting"){
      pallet.classList.remove("plantingSelectablePallet");
      pallet.classList.remove(
        "plantingCount12", "plantingCount16", "plantingCount20",
        "plantingQualityLarge", "plantingQualityMedium", "plantingQualitySmall",
        "plantingQualityElongated", "plantingQualityUnset"
      );
      pallet.classList.add("plantingSelectedPallet", `plantingCount${recordPlantingCountPreset}`);
      if(isRecordPlantingFlowActive() && recordPlantingFlowStage === "quality"){
        const qualityClass = {
          large: "plantingQualityLarge",
          medium: "plantingQualityMedium",
          small: "plantingQualitySmall",
          elongated: "plantingQualityElongated"
        }[recordPlantingQualityPreset];
        if(qualityClass) pallet.classList.add(qualityClass);
      }
    }
    return;
  }

  pallet.classList.remove(
    "harvestFill",
    "harvestStart",
    "harvestEnd",
    "plantingSelectedPallet",
    "plantingCount12",
    "plantingCount16",
    "plantingCount20",
    "plantingQualityLarge",
    "plantingQualityMedium",
    "plantingQualitySmall",
    "plantingQualityElongated",
    "plantingQualityUnset"
  );
  if(context === "record" && recordSelectionMode === "planting" && !pallet.classList.contains("plantingUnavailablePallet")){
    pallet.classList.add("plantingSelectablePallet");
  }
}

function applyPalletDragTarget(pallet){
  if(!palletDragState || !pallet) return;
  const key = pallet.dataset.palletKey;
  if(!key || palletDragState.touchedKeys.has(key)) return;
  palletDragState.touchedKeys.add(key);

  const building = Number(pallet.dataset.building);
  const number = Number(pallet.dataset.number);
  const bed = pallet.dataset.bed;
  if(!Number.isFinite(building) || !Number.isFinite(number) || !bed) return;

  const changed = palletDragState.context === "record"
    ? applyRecordPalletDragChange(building, bed, number, palletDragState.mode)
    : applyForecastPalletDragChange(building, bed, number, palletDragState.mode);

  if(changed){
    palletDragState.changed = true;
    updatePalletElementForDrag(pallet, palletDragState.context, palletDragState.mode);
  }
}

function getPalletElementFromPointer(event){
  const target = document.elementFromPoint(event.clientX, event.clientY);
  const pallet = target?.closest?.(".bedDetailContent .pallet[data-pallet-key]");
  return pallet || null;
}

function startPalletDrag(event, context, building, bed, number){
  if(event.pointerType === "mouse" && event.button !== 0) return;
  const key = getPalletKey(building, bed, number);
  const isSelected = harvestFillKeys.includes(key);
  const shouldOverwritePlantingCount = context === "record"
    && recordSelectionMode === "planting"
    && !isRecordPlantingFlowActive()
    && isSelected
    && getPlantingCountForSelectedKey(key) !== recordPlantingCountPreset;
  const isPlantingFlowAssignment = context === "record"
    && isRecordPlantingFlowActive()
    && ["count", "quality"].includes(recordPlantingFlowStage);
  palletDragState = {
    pointerId: event.pointerId,
    context,
    mode: isPlantingFlowAssignment ? "add" : (isSelected && !shouldOverwritePlantingCount ? "remove" : "add"),
    captureElement: event.currentTarget,
    touchedKeys: new Set(),
    toastMessages: new Set(),
    changed: false
  };
  event.preventDefault();
  event.currentTarget?.setPointerCapture?.(event.pointerId);
  applyPalletDragTarget(event.currentTarget);
}

function handlePalletDragMove(event){
  if(!palletDragState || event.pointerId !== palletDragState.pointerId) return;
  event.preventDefault();
  applyPalletDragTarget(getPalletElementFromPointer(event));
}

function finishPalletDrag(event){
  if(!palletDragState || event.pointerId !== palletDragState.pointerId) return;
  event.preventDefault();
  const changed = palletDragState.changed;
  try{
    palletDragState.captureElement?.releasePointerCapture?.(event.pointerId);
  }catch(e){}
  palletDragState = null;
  if(!changed) return;

  sortHarvestFillKeys();
  refreshAfterHarvestSelectionChanged();
  refreshBedDetailWindow();
}

function attachPalletDragHandlers(pallet, context, building, bed, number){
  const key = getPalletKey(building, bed, number);
  pallet.dataset.palletKey = key;
  pallet.dataset.building = String(building);
  pallet.dataset.bed = bed;
  pallet.dataset.number = String(number);
  pallet.onpointerdown = (event) => startPalletDrag(event, context, building, bed, number);
}

function openBedDetailBulkActions(){
  if(!activeBedDetailBed) return;
  if(activeBedDetailContext === "record"){
    showRecordBedActionMenu(activeBedDetailBed);
  }else{
    showBedActionMenu(activeBedDetailBed);
  }
}

function renderBedDetailWindow(){
  const body = document.getElementById("bedDetailWindowBody");
  const title = document.getElementById("bedDetailWindowTitle");
  if(!body || !title || !activeBedDetailBed) return;

  title.textContent = `${currentBuilding}-${activeBedDetailBed}`;
  title.onmousedown = null;
  title.onmouseup = null;
  title.onmouseleave = null;
  title.ontouchstart = null;
  title.ontouchend = null;
  title.ontouchcancel = null;
  body.innerHTML = "";
  if(activeBedDetailContext === "record" && recordSelectionMode === "planting"){
    const legend = document.createElement("div");
    legend.className = "recordPlantingLegend bedDetailPlantingLegend";
    legend.setAttribute("aria-label", "各パレットの色分け");
    legend.innerHTML = isRecordPlantingFlowActive() && recordPlantingFlowStage === "quality"
      ? `
        <span class="recordLegendItem"><span class="recordLegendSwatch qualityLarge"></span>大きい</span>
        <span class="recordLegendItem"><span class="recordLegendSwatch qualityMedium"></span>中</span>
        <span class="recordLegendItem"><span class="recordLegendSwatch qualitySmall"></span>小さい</span>
        <span class="recordLegendItem"><span class="recordLegendSwatch qualityElongated"></span>徒長</span>
      `
      : (isRecordPlantingFlowActive() && recordPlantingFlowStage === "location"
        ? `
          <span class="recordLegendItem"><span class="recordLegendSwatch selectable"></span>選択可能</span>
          <span class="recordLegendItem"><span class="recordLegendSwatch selected"></span>苗植え場所</span>
          <span class="recordLegendItem"><span class="recordLegendSwatch unavailable"></span>選択不可</span>
        `
      : `
        <span class="recordLegendItem"><span class="recordLegendSwatch count12"></span>12植え</span>
        <span class="recordLegendItem"><span class="recordLegendSwatch count16"></span>16植え</span>
        <span class="recordLegendItem"><span class="recordLegendSwatch count20"></span>20植え</span>
      `);
    body.appendChild(legend);
  }
  const content = document.createElement("div");
  content.className = "bedDetailContent";
  if(activeBedDetailContext === "record" && isRecordPlantingFlowActive()){
    content.classList.add(`recordPlantingFlowStage-${recordPlantingFlowStage}`);
  }
  if(activeBedDetailContext === "record"){
    appendRecordBedDetail(content, activeBedDetailBed);
  }else{
    appendForecastBedDetail(content, activeBedDetailBed);
  }
  body.appendChild(content);
}

function getPalletLayoutClassName(number, splitInfo){
  let className = "pallet";
  if(number % 2 === 0) className += " palletEven";
  if(splitInfo){
    if(splitInfo.hasFront && number <= splitInfo.frontCount) className += " frontZone";
    if(splitInfo.hasBack && number > splitInfo.frontCount) className += " backZone";
  }
  if(number % 8 === 0 || number % 8 === 7) className += " multiple8Pair";
  if(number === 39 || number === 40) className += " centerStrong";
  return className;
}

function appendForecastBedDetail(container, b){
  const bed = document.createElement("div");
  bed.className = "bed bedExpanded";
  const splitInfo = getYieldSplitVisualInfo(b);
  const recordedSet = getRecordedPalletSet();
  const selectedSet = new Set(harvestFillKeys || []);
  const progressCompletedSet = getAppliedHarvestProgressCompletedKeySet();
  const hasPartialHarvestRecords = records.some(record => record.type === "partialHarvest");

  const grid = document.createElement("div");
  grid.className = "palletGrid";
  let count = 1;

  for(let r = ROWS - 1; r >= 0; r--){
    for(let c = 0; c < COLS; c++){
      const number = count;
      const key = getPalletKey(currentBuilding, b, number);
      const pallet = document.createElement("div");
      let cls = getPalletLayoutClassName(number, splitInfo);
      const partialHarvestCount = hasPartialHarvestRecords ? getPartialHarvestCountForPallet(currentBuilding, b, number) : 0;
      if(partialHarvestCount > 0) cls += " partialHarvestPallet";
      if(selectedSet.has(key)) cls += " harvestFill";
      if(recordedSet.has(key)) cls += " recordedPallet";
      if(progressCompletedSet.has(key)) cls += " harvestProgressCompletedPallet";

      if(harvestSummary && harvestSummary.start === key) cls += " harvestStart";
      if(harvestSummary && harvestSummary.end === key) cls += " harvestEnd";

      pallet.className = cls;
      pallet.textContent = number;
      pallet.title = `${currentBuilding}号棟 ${b}-${number}` + (partialHarvestCount > 0 ? " 部分収穫あり" : "");
      pallet.style.gridRowStart = r + 1;
      pallet.style.gridColumnStart = c + 1;
      attachPalletDragHandlers(pallet, "forecast", currentBuilding, b, number);

      grid.appendChild(pallet);
      count++;
    }
  }

  bed.appendChild(grid);
  appendYieldSplitInfo(bed, splitInfo);
  container.appendChild(bed);
}

function appendRecordBedDetail(container, b){
  const bed = document.createElement("div");
  bed.className = "bed bedExpanded";
  const splitInfo = getYieldSplitVisualInfo(b);
  const recordedSet = getRecordTabRecordedPalletSet();
  const plantingAllowedSet = recordSelectionMode === "planting" ? getPlantingAllowedPalletSet({ fast: true }) : null;
  const plantingQualityByPallet = isRecordPlantingFlowActive() && recordPlantingFlowStage === "quality"
    ? getRecordPlantingFlowQualityByPallet()
    : {};

  const grid = document.createElement("div");
  grid.className = "palletGrid";
  let count = 1;

  for(let r = ROWS - 1; r >= 0; r--){
    for(let c = 0; c < COLS; c++){
      const number = count;
      const key = getPalletKey(currentBuilding, b, number);
      const pallet = document.createElement("div");
      let cls = getPalletLayoutClassName(number, splitInfo);
      const partialHarvestCount = getPartialHarvestCountForPallet(currentBuilding, b, number);
      if(partialHarvestCount > 0) cls += " partialHarvestPallet";
      const isSelected = isFilled(currentBuilding, b, number);
      if(isSelected) cls += " harvestFill";
      if(recordSelectionMode === "planting"){
        if(!plantingAllowedSet.has(key)){
          cls += " plantingUnavailablePallet";
        }else if(isSelected){
          const plantingCount = getPlantingCountForSelectedKey(key);
          cls += ` plantingSelectedPallet plantingCount${plantingCount}`;
          if(isRecordPlantingFlowActive() && recordPlantingFlowStage === "quality"){
            const qualityClass = {
              large: "plantingQualityLarge",
              medium: "plantingQualityMedium",
              small: "plantingQualitySmall",
              elongated: "plantingQualityElongated"
            }[normalizeOptionalQualityMemo(plantingQualityByPallet[key])?.tags?.find(tag => RECORD_PLANTING_FLOW_QUALITY_TAGS.includes(tag))] || "plantingQualityUnset";
            cls += ` ${qualityClass}`;
          }
        }else{
          cls += " plantingSelectablePallet";
        }
      }else if(recordedSet.has(key)){
        cls += " recordedPallet";
      }

      if(harvestSummary && harvestSummary.start === key) cls += " harvestStart";
      if(harvestSummary && harvestSummary.end === key) cls += " harvestEnd";

      pallet.className = cls;
      pallet.textContent = number;
      let statusText = "";
      if(recordSelectionMode === "planting"){
        statusText = plantingAllowedSet.has(key)
          ? (isSelected ? ` 選択済み ${getPlantingCountForSelectedKey(key)}植え` : " 選択可能")
          : " 選択不可";
        if(isSelected && isRecordPlantingFlowActive() && recordPlantingFlowStage === "quality"){
          const qualityTag = normalizeOptionalQualityMemo(plantingQualityByPallet[key])?.tags
            ?.find(tag => RECORD_PLANTING_FLOW_QUALITY_TAGS.includes(tag)) || "";
          statusText += qualityTag ? ` ${getQualityTagLabel(qualityTag)}` : " 品質未設定";
        }
      }
      pallet.title = `${currentBuilding}号棟 ${b}-${number}` + statusText + (partialHarvestCount > 0 ? " 部分収穫あり" : "");
      pallet.style.gridRowStart = r + 1;
      pallet.style.gridColumnStart = c + 1;
      attachPalletDragHandlers(pallet, "record", currentBuilding, b, number);

      grid.appendChild(pallet);
      count++;
    }
  }

  bed.appendChild(grid);
  appendYieldSplitInfo(bed, splitInfo);
  container.appendChild(bed);
}

function clearHarvestPrediction(){
  hideBedActionMenu();
  hideRecordBedActionMenu();
  workflowMonitorCheckpointSignature = "";
  workflowHarvestRecordingActive = false;
  harvestSelectionMode = "none";
  harvestProgressState = null;
  harvestProgressAvailable = false;
  harvestFillKeys = [];
  harvestSummary = null;
  manualSeedlingCount = null;
  forecastSelectionState = null;
  if(harvestCasesAutoEstimated){
    const casesInput = document.getElementById("casesInput");
    if(casesInput) casesInput.value = "";
    harvestCasesAutoEstimated = false;
    updateHarvestCasesAutoEstimatedAppearance();
    syncRecordCasesFromMain(false);
  }
  refreshHarvestMapViews();
  document.getElementById("recordPalletSummaryInput").value = "";
  updateRecordActualLoss();
  updateHarvestProgressUi();
  clearHarvestStateFromStorage();
  scheduleWorkflowGuideUpdate();
}

function getConfiguredHarvestPlantCountForPallet(bed, number){
  const bedSettings = settings?.beds?.[bed] || {};
  if(!settings?.useBedYieldSettings){
    return normalizeYield(settings?.defaultYieldPerPallet, defaultSettings.defaultYieldPerPallet);
  }
  const raw = bedSettings.yield;
  const baseYield = normalizeYield(raw, settings.defaultYieldPerPallet);

  if(!bedSettings.yieldUseFrontBack){
    return baseYield;
  }

  const frontCount = clampNumber(bedSettings.yieldFrontCount, 0, PALLETS_PER_BED, 39);
  const frontYield = normalizeYield(bedSettings.yieldFront, baseYield);
  const backYield = normalizeYield(bedSettings.yieldBack, baseYield);

  return Number(number) <= frontCount ? frontYield : backYield;
}

function getHarvestPlantCountForPallet(building, bed, number, targetDate = null){
  const key = getPalletKey(Number(building), bed, Number(number));
  if(isValidPalletKeyString(key)){
    const targetDay = startOfLocalDay(targetDate || getHarvestTargetDate());
    const plantingState = getLatestPlantingStateByPallet(targetDay).get(key);
    if(ALLOWED_YIELDS.includes(Number(plantingState?.plantingCount))){
      return Number(plantingState.plantingCount);
    }
  }
  return getConfiguredHarvestPlantCountForPallet(bed, number);
}

function getYieldSplitVisualInfo(bed){
  const bedSettings = settings?.beds?.[bed] || {};
  const useBedYield = !!settings?.useBedYieldSettings;
  const useSplit = !!bedSettings.yieldUseFrontBack;
  if(!useBedYield || !useSplit) return null;

  const frontCount = clampNumber(bedSettings.yieldFrontCount, 0, PALLETS_PER_BED, 39);
  const backCount = Math.max(0, PALLETS_PER_BED - frontCount);

  return {
    frontCount,
    backCount,
    hasFront: frontCount > 0,
    hasBack: backCount > 0
  };
}

function appendYieldSplitInfo(bedElement, splitInfo){
  if(!bedElement || !splitInfo) return;
  const info = document.createElement("div");
  info.className = "bedZoneInfo";
  info.innerHTML = `
    <div class="bedZoneLegend">
      <span class="bedZoneChip front">手前 ${splitInfo.frontCount}枚</span>
      <span class="bedZoneChip back">奥 ${splitInfo.backCount}枚</span>
    </div>
  `;
  bedElement.appendChild(info);
}

function getAppliedLossRateForBed(bed){
  if(!settings?.useBedLossSettings){
    return clampNumber(settings.defaultLossRate, 0, 100, 0);
  }
  const bedLoss = settings?.beds?.[bed]?.lossRate;
  if(bedLoss === "" || bedLoss === null || typeof bedLoss === "undefined"){
    return clampNumber(settings.defaultLossRate, 0, 100, 0);
  }
  return clampNumber(bedLoss, 0, 100, clampNumber(settings.defaultLossRate, 0, 100, 0));
}

function getPredictedHarvestForBed(building, bed, number, targetDate = null){
  const plantCount = getHarvestPlantCountForPallet(building, bed, number, targetDate);
  const lossRate = getAppliedLossRateForBed(bed);
  return plantCount * (100 - lossRate) / 100;
}

function getLatestFullHarvestDateForPalletReference(key, targetDate, sourceRecords = records){
  const targetDay = startOfLocalDay(targetDate || new Date());

  for(const record of (Array.isArray(sourceRecords) ? sourceRecords : [])){
    const recordDate = parseDateOnlyString(record.date);
    if(!recordDate) continue;
    const recordDay = startOfLocalDay(recordDate);
    const diffDays = getLocalDayDiff(recordDay, targetDay);
    if(diffDays < 0) continue;
    if(diffDays > CALCULATION_LOOKBACK_DAYS) break;
    if(recordDay.getTime() >= targetDay.getTime()) continue;
    if(record.type === "partialHarvest") continue;
    if(!Array.isArray(record.palletKeys) || !record.palletKeys.includes(key)) continue;

    return recordDay;
  }

  return null;
}

function getPartialHarvestCountForPalletReference(building, bed, number, targetDate = null, sourceRecords = records){
  const key = getPalletKey(building, bed, number);
  const targetDay = startOfLocalDay(targetDate || getHarvestTargetDate());
  const latestFullHarvestDate = getLatestFullHarvestDateForPalletReference(key, targetDay, sourceRecords);
  let total = 0;

  for(const record of (Array.isArray(sourceRecords) ? sourceRecords : [])){
    const recordDate = parseDateOnlyString(record.date);
    if(!recordDate) continue;
    const recordDay = startOfLocalDay(recordDate);
    const diffDays = getLocalDayDiff(recordDay, targetDay);
    if(diffDays < 0) continue;
    if(diffDays > CALCULATION_LOOKBACK_DAYS) break;
    if(recordDay.getTime() > targetDay.getTime()) continue;
    if(latestFullHarvestDate && recordDay.getTime() <= latestFullHarvestDate.getTime()) break;
    if(record.type !== "partialHarvest") continue;

    normalizePartialHarvestTargets(record.targets).forEach(target => {
      if(target.building !== building || target.bed !== bed) return;
      if(number < target.start || number > target.end) return;
      total += target.plantsPerPallet;
    });
  }

  return total;
}

function invalidateHarvestRecordLookupCache(){
  harvestRecordLookupCache.clear();
}

function buildHarvestRecordLookup(targetDate, sourceRecords = records){
  const targetDay = startOfLocalDay(targetDate || getHarvestTargetDate());
  const targetTime = targetDay.getTime();
  const earliestTime = addDays(targetDay, -CALCULATION_LOOKBACK_DAYS).getTime();
  const dayGroups = new Map();

  for(const record of (Array.isArray(sourceRecords) ? sourceRecords : [])){
    const recordDate = parseDateOnlyString(record?.date);
    if(!recordDate) continue;
    const recordTime = startOfLocalDay(recordDate).getTime();
    if(recordTime < earliestTime || recordTime > targetTime) continue;
    if(!dayGroups.has(recordTime)){
      dayGroups.set(recordTime, {
        fullHarvestKeys: new Set(),
        partialTargets: []
      });
    }
    const group = dayGroups.get(recordTime);
    if(record?.type === "partialHarvest"){
      group.partialTargets.push(...normalizePartialHarvestTargets(record.targets));
    }else if(recordTime < targetTime && Array.isArray(record?.palletKeys)){
      record.palletKeys.forEach(key => group.fullHarvestKeys.add(key));
    }
  }

  const latestFullHarvestDateByPallet = new Map();
  const partialHarvestCountByPallet = new Map();
  [...dayGroups.entries()]
    .sort((left, right) => left[0] - right[0])
    .forEach(([recordTime, group]) => {
      if(recordTime < targetTime){
        group.fullHarvestKeys.forEach(key => {
          latestFullHarvestDateByPallet.set(key, new Date(recordTime));
          partialHarvestCountByPallet.delete(key);
        });
      }

      group.partialTargets.forEach(target => {
        for(let number = target.start; number <= target.end; number++){
          const key = getPalletKey(target.building, target.bed, number);
          if(recordTime < targetTime && group.fullHarvestKeys.has(key)) continue;
          partialHarvestCountByPallet.set(
            key,
            (partialHarvestCountByPallet.get(key) || 0) + target.plantsPerPallet
          );
        }
      });
    });

  return {
    targetDay,
    latestFullHarvestDateByPallet,
    partialHarvestCountByPallet
  };
}

function getHarvestRecordLookup(targetDate, sourceRecords = records){
  if(!harvestRecordLookupEnabled) return null;
  const targetDay = startOfLocalDay(targetDate || getHarvestTargetDate());
  const isEditTimeline = sourceRecords === harvestRecordEditTimelineCache;
  const useCache = sourceRecords === records || isEditTimeline;
  const cacheKey = isEditTimeline
    ? `edit:${harvestRecordEditTimelineCacheId}:${harvestRecordEditTimelineCacheDate}:${formatDateOnlyString(targetDay)}`
    : formatDateOnlyString(targetDay);
  try{
    if(useCache && harvestRecordLookupCache.has(cacheKey)){
      return harvestRecordLookupCache.get(cacheKey);
    }
    const lookup = buildHarvestRecordLookup(targetDay, sourceRecords);
    if(useCache){
      harvestRecordLookupCache.set(cacheKey, lookup);
      if(harvestRecordLookupCache.size > 16){
        harvestRecordLookupCache.delete(harvestRecordLookupCache.keys().next().value);
      }
    }
    return lookup;
  }catch(error){
    harvestRecordLookupEnabled = false;
    invalidateHarvestRecordLookupCache();
    console.error("収穫記録の高速検索を無効化しました", error);
    return null;
  }
}

function getLatestFullHarvestDateForPallet(key, targetDate, sourceRecords = records, options = {}){
  const lookup = options.lookup || getHarvestRecordLookup(targetDate, sourceRecords);
  if(!lookup){
    return getLatestFullHarvestDateForPalletReference(key, targetDate, sourceRecords);
  }
  return lookup.latestFullHarvestDateByPallet.get(key) || null;
}

function getPartialHarvestCountForPallet(building, bed, number, targetDate = null, sourceRecords = records, options = {}){
  sourceRecords = getActiveHarvestTimelineRecords(sourceRecords);
  if(!harvestRecordLookupEnabled){
    return getPartialHarvestCountForPalletReference(building, bed, number, targetDate, sourceRecords);
  }
  const key = getPalletKey(building, bed, number);
  const lookup = options.lookup || getHarvestRecordLookup(targetDate, sourceRecords);
  if(!lookup){
    return getPartialHarvestCountForPalletReference(building, bed, number, targetDate, sourceRecords);
  }
  const fastTotal = lookup.partialHarvestCountByPallet.get(key) || 0;
  if(harvestRecordLookupValidationRemaining > 0){
    const referenceTotal = getPartialHarvestCountForPalletReference(
      building,
      bed,
      number,
      targetDate,
      sourceRecords
    );
    harvestRecordLookupValidationRemaining--;
    if(Math.abs(fastTotal - referenceTotal) > 0.000001){
      harvestRecordLookupEnabled = false;
      invalidateHarvestRecordLookupCache();
      console.error("収穫記録の高速検索結果が一致しないため従来計算へ戻しました", {
        key,
        targetDate: formatDateOnlyString(startOfLocalDay(targetDate || getHarvestTargetDate())),
        fastTotal,
        referenceTotal
      });
      return referenceTotal;
    }
  }
  return fastTotal;
}

function getPredictedHarvestForPallet(building, bed, number, targetDate = null, sourceRecords = records){
  const baseHarvest = getPredictedHarvestForBed(building, bed, number, targetDate);
  const partialCount = getPartialHarvestCountForPallet(building, bed, number, targetDate, sourceRecords);
  return Math.max(0, baseHarvest - partialCount);
}

function getPartialHarvestCasesForDate(dateStr, sourceRecords = records){
  if(!dateStr) return 0;
  sourceRecords = getActiveHarvestTimelineRecords(sourceRecords);
  return (Array.isArray(sourceRecords) ? sourceRecords : []).reduce((total, record) => {
    if(record.type !== "partialHarvest") return total;
    if(record.date !== dateStr) return total;
    return total + clampNumber(record.cases, 0, 999999, 0);
  }, 0);
}

function getHarvestCaseTotalsByDate(sourceRecords = records){
  const totalsByDate = new Map();
  (Array.isArray(sourceRecords) ? sourceRecords : []).forEach(record => {
    const dateKey = String(record?.date || "").trim();
    if(!parseDateOnlyString(dateKey)) return;
    if(!totalsByDate.has(dateKey)){
      totalsByDate.set(dateKey, {
        fullCases: 0,
        partialCases: 0,
        totalCases: 0,
        fullRecordCount: 0,
        partialRecordCount: 0
      });
    }
    const totals = totalsByDate.get(dateKey);
    const cases = clampNumber(record?.cases, 0, 999999, 0);
    if(record?.type === "partialHarvest"){
      totals.partialCases += cases;
      totals.partialRecordCount++;
    }else{
      totals.fullCases += cases;
      totals.fullRecordCount++;
    }
    totals.totalCases += cases;
  });
  return totalsByDate;
}

function getHarvestCaseTotalsForDate(dateStr, sourceRecords = records, totalsByDate = null){
  const dateKey = String(dateStr || "").trim();
  const totals = (totalsByDate instanceof Map ? totalsByDate : getHarvestCaseTotalsByDate(sourceRecords)).get(dateKey);
  return totals || {
    fullCases: 0,
    partialCases: 0,
    totalCases: 0,
    fullRecordCount: 0,
    partialRecordCount: 0
  };
}

function getHarvestRecordCaseDisplayText(record, totalsByDate = null){
  const cases = clampNumber(record?.cases, 0, 999999, 0);
  const totals = getHarvestCaseTotalsForDate(record?.date, records, totalsByDate);
  const hasSameDayFullAndPartial = totals.fullRecordCount > 0 && totals.partialRecordCount > 0;
  if(!hasSameDayFullAndPartial) return String(cases);
  if(record?.type === "partialHarvest") return `(${cases})`;
  return String(totals.totalCases);
}

function hasFullHarvestRecordForDate(dateStr, sourceRecords = records, options = {}){
  const dateKey = String(dateStr || "").trim();
  if(!dateKey) return false;
  const excludedRecordId = options.excludeRecordId === null
    || typeof options.excludeRecordId === "undefined"
    ? ""
    : String(options.excludeRecordId);
  return (Array.isArray(sourceRecords) ? sourceRecords : []).some(record => (
    record?.type !== "partialHarvest"
    && String(record?.date || "").trim() === dateKey
    && (!excludedRecordId || String(record?.id) !== excludedRecordId)
  ));
}

function getPartialHarvestCaseDeductionForDate(dateStr, sourceRecords = records, options = {}){
  sourceRecords = getActiveHarvestTimelineRecords(sourceRecords);
  const excludeRecordId = Object.prototype.hasOwnProperty.call(options, "excludeRecordId")
    ? options.excludeRecordId
    : editingHarvestRecordId;
  if(hasFullHarvestRecordForDate(dateStr, sourceRecords, { excludeRecordId })) return 0;
  return getPartialHarvestCasesForDate(dateStr, sourceRecords);
}

function getRegularHarvestCases(totalCases, dateStr = getHarvestTargetDateString(), options = {}){
  const safeTotal = clampNumber(totalCases, 0, 999999, 0);
  const partialCases = getPartialHarvestCaseDeductionForDate(dateStr, records, options);
  return Math.max(0, safeTotal - partialCases);
}

function getHarvestCasePlan(totalCases = null, options = {}){
  const dateStr = getHarvestTargetDateString();
  const total = totalCases === null
    ? clampNumber(document.getElementById("casesInput")?.value || 0, 0, 999999, 0)
    : clampNumber(totalCases, 0, 999999, 0);
  const recordedPartialCases = getPartialHarvestCasesForDate(dateStr);
  const partial = getPartialHarvestCaseDeductionForDate(dateStr, records, options);
  return {
    date: dateStr,
    totalCases: total,
    partialCases: partial,
    recordedPartialCases,
    regularCases: Math.max(0, total - partial)
  };
}

function appendAutoMemo(baseMemo, note){
  const memo = String(baseMemo || "").trim();
  if(!note) return memo;
  if(memo.includes(note)) return memo;
  return memo ? memo + "\n" + note : note;
}

function getNextPallet(building, bed, number){
  let nextBuilding = building;
  let nextBed = bed;
  let nextNumber = number + 1;

  if(nextNumber > PALLETS_PER_BED){
    nextNumber = 1;
    const bedIndex = bedOrder.indexOf(bed);
    if(bedIndex < bedOrder.length - 1){
      nextBed = bedOrder[bedIndex + 1];
    }else{
      nextBed = bedOrder[0];
      const buildingIndex = BUILDINGS.indexOf(building);
      nextBuilding = BUILDINGS[(buildingIndex + 1) % BUILDINGS.length];
    }
  }

  return { building: nextBuilding, bed: nextBed, number: nextNumber };
}

function getOrderIndexFromKey(key){
  const p = parsePalletKey(key);
  const buildingIndex = BUILDINGS.indexOf(p.building);
  const bedIndex = bedOrder.indexOf(p.bed);
  return buildingIndex * bedOrder.length * PALLETS_PER_BED + bedIndex * PALLETS_PER_BED + (p.number - 1);
}

function sortHarvestFillKeys(){
  harvestFillKeys.sort((a,b) => getOrderIndexFromKey(a) - getOrderIndexFromKey(b));
}

function findFirstAvailableInHarvestOrder(startBuilding, recordedSet = getRecordedPalletSet()){
  const startIndex = Math.max(0, BUILDINGS.indexOf(startBuilding));
  for(let buildingOffset = 0; buildingOffset < BUILDINGS.length; buildingOffset++){
    const building = BUILDINGS[(startIndex + buildingOffset) % BUILDINGS.length];
    for(const bed of bedOrder){
      for(let number = 1; number <= PALLETS_PER_BED; number++){
        const key = getPalletKey(building, bed, number);
        if(!recordedSet.has(key)){
          return key;
        }
      }
    }
  }
  return null;
}

function getPreviousBuilding(building){
  const index = BUILDINGS.indexOf(building);
  if(index < 0) return null;
  return BUILDINGS[(index - 1 + BUILDINGS.length) % BUILDINGS.length];
}

function getUnharvestedCountForBuilding(building){
  const recordedSet = getRecordedPalletSet();
  const selectedSet = new Set(harvestFillKeys || []);
  let count = 0;

  for(const bed of bedOrder){
    for(let number = 1; number <= PALLETS_PER_BED; number++){
      const key = getPalletKey(building, bed, number);
      if(recordedSet.has(key)) continue;
      if(selectedSet.has(key)) continue;
      count++;
    }
  }

  return count;
}

function getRecordedCountForBuilding(building, recordedSet = getRecordedPalletSet()){
  let count = 0;
  for(const bed of bedOrder){
    for(let number = 1; number <= PALLETS_PER_BED; number++){
      if(recordedSet.has(getPalletKey(building, bed, number))) count++;
    }
  }
  return count;
}

function getNextBuildingInOrder(building){
  const index = BUILDINGS.indexOf(building);
  if(index < 0) return MIN_BUILDING;
  return BUILDINGS[(index + 1) % BUILDINGS.length];
}

function getLatestRecordedBuildingFromRecords(sourceRecords){
  const latestRecord = Array.isArray(sourceRecords) ? sourceRecords[0] : null;
  if(!latestRecord) return null;

  const buildings = [...new Set(latestRecord.palletKeys.map(key => parsePalletKey(String(key || "")).building))]
    .filter(building => BUILDINGS.includes(building))
    .sort((a, b) => BUILDINGS.indexOf(a) - BUILDINGS.indexOf(b));
  return buildings.length ? buildings[buildings.length - 1] : null;
}

function getPriorityInProgressBuilding(inProgressBuildings){
  const candidates = [...new Set(inProgressBuildings)]
    .filter(building => BUILDINGS.includes(building))
    .sort((a, b) => a - b);
  if(!candidates.length) return null;

  // 通常は号棟番号が小さい方を優先する。ただし2号棟と9号棟が
  // ともに途中なら、収穫順が一周する境目として2号棟を後回しにする。
  if(candidates.includes(2) && candidates.includes(9)){
    return candidates.find(building => building !== 2) ?? 9;
  }
  return candidates[0];
}

function getFirstIncompleteBuildingAfterCompletedRun(completedBuildings){
  const completedSet = new Set(
    completedBuildings.filter(building => BUILDINGS.includes(building))
  );
  if(!completedSet.size) return null;

  // 9号棟まで収穫済みなら2号棟側へ一周したものとして扱う。
  // その後も全収穫済みの棟が続く場合は、最初の未完了棟まで進める。
  let building = completedSet.has(MAX_BUILDING)
    ? MAX_BUILDING
    : Math.max(...completedSet);

  for(let offset = 0; offset < BUILDINGS.length; offset++){
    building = getNextBuildingInOrder(building);
    if(!completedSet.has(building)) return building;
  }
  return null;
}

function getStartupHarvestBuildingFromRecentRecords(recentRecords){
  const recordedSet = getRecordedPalletSetFromRecords(recentRecords);
  const palletsPerBuilding = bedOrder.length * PALLETS_PER_BED;

  const completedBuildings = BUILDINGS.filter(building =>
    getRecordedCountForBuilding(building, recordedSet) >= palletsPerBuilding
  );
  const firstAfterCompletedRun = getFirstIncompleteBuildingAfterCompletedRun(completedBuildings);
  if(firstAfterCompletedRun !== null){
    return firstAfterCompletedRun;
  }

  const inProgressBuildings = BUILDINGS.filter(building => {
    const count = getRecordedCountForBuilding(building, recordedSet);
    return count > 0 && count < palletsPerBuilding;
  });
  if(inProgressBuildings.length){
    return getPriorityInProgressBuilding(inProgressBuildings);
  }

  const latestBuilding = getLatestRecordedBuildingFromRecords(recentRecords);
  if(!latestBuilding) return MIN_BUILDING;

  const latestCount = getRecordedCountForBuilding(latestBuilding, recordedSet);
  if(latestCount >= palletsPerBuilding){
    return getNextBuildingInOrder(latestBuilding);
  }
  return latestBuilding;
}

function getStartupHarvestBuilding(referenceDate = new Date(), sourceRecords = records){
  const recentRecords = getRecentHarvestRecordsByCount(referenceDate, RECORDED_LOOKBACK_COUNT, sourceRecords);
  return getStartupHarvestBuildingFromRecentRecords(recentRecords);
}

function calculateHarvestSelectionFromRecords(options = {}){
  const referenceDate = startOfLocalDay(options.referenceDate || new Date());
  const partialTargetDate = startOfLocalDay(options.partialTargetDate || referenceDate);
  const sourceRecords = Array.isArray(options.sourceRecords) ? options.sourceRecords : records;
  const needHeads = Math.max(0, Number(options.needHeads) || 0);
  const harvestRate = Number.isFinite(Number(options.harvestRate))
    ? clampNumber(options.harvestRate, 0, 1, 1)
    : null;
  const additionalExcludedSet = new Set(
    options.additionalExcludedPalletKeys
      && typeof options.additionalExcludedPalletKeys[Symbol.iterator] === "function"
      ? options.additionalExcludedPalletKeys
      : []
  );
  const buildSelectionRecordedSet = harvestRecords => {
    const set = getRecordedPalletSetFromRecords(harvestRecords);
    additionalExcludedSet.forEach(key => set.add(key));
    return set;
  };
  let recentRecords = getRecentHarvestRecordsByCount(referenceDate, RECORDED_LOOKBACK_COUNT, sourceRecords);
  let recordedSet = buildSelectionRecordedSet(recentRecords);
  let startBuilding = getStartupHarvestBuildingFromRecentRecords(recentRecords);
  let autoStartKey = findFirstAvailableInHarvestOrder(startBuilding, recordedSet);
  let releasedRecordCount = 0;

  while(!autoStartKey && options.releaseOldestIfBlocked && recentRecords.length){
    // 直近の参照件数だけで全パレットが埋まる特殊な状態でも予想を止めない。
    // 仮想記録が1件増えるたび、本来この順で外れる古い記録から解放する。
    recentRecords = recentRecords.slice(0, -1);
    releasedRecordCount++;
    recordedSet = buildSelectionRecordedSet(recentRecords);
    startBuilding = getStartupHarvestBuildingFromRecentRecords(recentRecords);
    autoStartKey = findFirstAvailableInHarvestOrder(startBuilding, recordedSet);
  }

  if(!autoStartKey || needHeads <= 0){
    return {
      palletKeys: [],
      start: autoStartKey,
      end: null,
      totalHarvest: 0,
      hasEnough: false,
      needHeads,
      startBuilding,
      recentRecords,
      recordedSet,
      releasedRecordCount
    };
  }

  const harvestRecordLookup = getHarvestRecordLookup(partialTargetDate, sourceRecords);
  const palletKeys = [];
  let current = parsePalletKey(autoStartKey);
  let totalHarvest = 0;
  let guard = 0;
  const maxLoop = BUILDINGS.length * bedOrder.length * PALLETS_PER_BED;

  while(totalHarvest < needHeads && guard < maxLoop){
    const key = getPalletKey(current.building, current.bed, current.number);
    if(!recordedSet.has(key)){
      const partialCount = getPartialHarvestCountForPallet(
        current.building,
        current.bed,
        current.number,
        partialTargetDate,
        sourceRecords,
        { lookup: harvestRecordLookup }
      );
      const baseHarvest = harvestRate === null
        ? getPredictedHarvestForBed(current.building, current.bed, current.number, partialTargetDate)
        : getHarvestPlantCountForPallet(current.building, current.bed, current.number, partialTargetDate) * harvestRate;
      const harvest = Math.max(0, baseHarvest - partialCount);
      palletKeys.push(key);
      totalHarvest += harvest;
    }
    current = getNextPallet(current.building, current.bed, current.number);
    guard++;
  }

  return {
    palletKeys,
    start: autoStartKey,
    end: palletKeys.length ? palletKeys[palletKeys.length - 1] : null,
    totalHarvest: Math.round(totalHarvest * 10) / 10,
    hasEnough: totalHarvest >= needHeads,
    needHeads,
    startBuilding,
    recentRecords,
    recordedSet,
    releasedRecordCount
  };
}

function alertIfPreviousBuildingHasLeftovers(building = currentBuilding){
  const previousBuilding = getPreviousBuilding(building);
  if(!previousBuilding) return;

  const unharvestedCount = getUnharvestedCountForBuilding(previousBuilding);
  if(unharvestedCount <= 0) return;

  alert(previousBuilding + "号棟に取り残しがあります。\n未収穫パレット: " + unharvestedCount + "枚");
}

function runHarvestPrediction(options = {}){
  harvestProgressAvailable = false;
  updateHarvestProgressVisibility();
  if(harvestProgressState){
    resetHarvestProgress({ restorePlan: true, silent: true, render: true, save: false });
  }
  const silent = !!options.silent;
  const casePlan = getHarvestCasePlan();
  const needHeads = casePlan.regularCases * CASE_SIZE;

  if(casePlan.totalCases <= 0){
    if(!silent) showToast("収穫ケースを入力してください");
    return null;
  }
  if(needHeads <= 0){
    if(!silent) showToast("各パレット部分収穫だけで今回の収穫ケース数に達しています");
    return null;
  }

  const selection = calculateHarvestSelectionFromRecords({
    referenceDate: new Date(),
    sourceRecords: records,
    needHeads,
    partialTargetDate: getHarvestTargetDate()
  });
  if(!options.skipLeftoverAlert) alertIfPreviousBuildingHasLeftovers(selection.startBuilding);

  const autoStartKey = selection.start;
  if(!autoStartKey){
    if(!silent) showToast("未収穫パレットがありません");
    return null;
  }

  const resolvedStartBuilding = parsePalletKey(autoStartKey).building;
  if(currentBuilding !== resolvedStartBuilding || casePlacementBuilding !== resolvedStartBuilding){
    syncCurrentCasePlacementFromInputs();
    currentBuilding = resolvedStartBuilding;
    casePlacementBuilding = resolvedStartBuilding;
    updateBuildingLabel();
    updateCasePlacementBuildingLabel();
    populateCasePlacementInputs();
  }

  harvestFillKeys = [...selection.palletKeys];
  harvestSummary = {
    start: autoStartKey,
    end: selection.end || "-",
    filledCount: harvestFillKeys.length,
    totalHarvest: selection.totalHarvest,
    needHeads
  };
  harvestSelectionMode = "auto";
  harvestProgressAvailable = true;

  if(!selection.hasEnough && !silent){
    showToast("記録済みを除外して1周分見ても必要個数に届きませんでした");
  }

  if(!options.preserveManualSeedlingCount) manualSeedlingCount = null;
  refreshAfterHarvestSelectionChanged({ selectionChangeSource: "auto" });
  completeWorkflowGuideCalculation();
  return selection;
}

function getHarvestPredictionResultSignature(){
  return JSON.stringify({
    palletKeys: [...harvestFillKeys],
    start: harvestSummary?.start || "",
    end: harvestSummary?.end || "",
    filledCount: clampNumber(harvestSummary?.filledCount, 0, 999999, 0),
    totalHarvest: clampNumber(harvestSummary?.totalHarvest, 0, 999999999, 0),
    needHeads: clampNumber(harvestSummary?.needHeads, 0, 999999999, 0)
  });
}

function recalculateHarvestPredictionAfterPartialHarvest(affectedDates){
  const targetDate = getHarvestTargetDateString();
  const normalizedDates = new Set(
    (Array.isArray(affectedDates) ? affectedDates : [affectedDates])
      .map(value => String(value || "").trim())
      .filter(Boolean)
  );
  const hasExistingPrediction = !!harvestSummary && harvestFillKeys.length > 0;
  const totalCases = getHarvestCasePlan().totalCases;
  if(!normalizedDates.has(targetDate) || !hasExistingPrediction || totalCases <= 0){
    return {
      attempted: false,
      recalculated: false,
      changed: false,
      hasEnough: true
    };
  }

  const previousSignature = getHarvestPredictionResultSignature();
  const selection = runHarvestPrediction({
    silent: true,
    skipLeftoverAlert: true,
    preserveManualSeedlingCount: true
  });
  if(!selection){
    return {
      attempted: true,
      recalculated: false,
      changed: false,
      hasEnough: false
    };
  }
  return {
    attempted: true,
    recalculated: true,
    changed: previousSignature !== getHarvestPredictionResultSignature(),
    hasEnough: !!selection.hasEnough
  };
}

function getPartialHarvestSaveToastMessage(options = {}){
  const actionText = options.edited ? "部分収穫記録を更新しました" : "部分収穫を記録しました";
  const sendText = String(options.syncState || (options.sendQueued ? "送信中" : "未送信"));
  const predictionUpdate = options.predictionUpdate || {};
  if(predictionUpdate.recalculated){
    const resultText = predictionUpdate.changed
      ? "計算結果が変わりました。収穫場所を確認してください"
      : "計算結果を再確認しました";
    const shortageText = predictionUpdate.hasEnough
      ? ""
      : "。なお、必要個数には届いていません";
    return `${actionText}。${resultText}${shortageText}（${sendText}）`;
  }
  if(predictionUpdate.attempted){
    return `${actionText}。計算結果を更新できなかったため、「計算する」を押してください（${sendText}）`;
  }
  if(options.edited){
    return `${actionText}（${sendText}）`;
  }
  return `${actionText}。残り予想は約${options.remainingEstimate}ケースです（${sendText}）`;
}

function recalcHarvestSummary(currentHarvestTotal = null){
  sortHarvestFillKeys();

  harvestSummary = {
    start: harvestFillKeys.length ? harvestFillKeys[0] : null,
    end: harvestFillKeys.length ? harvestFillKeys[harvestFillKeys.length - 1] : "-",
    filledCount: harvestFillKeys.length,
    totalHarvest: Number.isFinite(Number(currentHarvestTotal))
      ? Math.round(Number(currentHarvestTotal) * 10) / 10
      : getCurrentHarvestTotal(),
    needHeads: getHarvestCasePlan().regularCases * CASE_SIZE
  };
}

function scrollToRecordSaveCard(){
  const target = document.getElementById("recordSaveCard");
  if(!target) return;
  const headerOffset = getAppTopChromeOffset();
  const top = target.getBoundingClientRect().top + window.pageYOffset - headerOffset;
  window.scrollTo({ top: Math.max(0, top), behavior: getWorkflowScrollBehavior("smooth") });
}
