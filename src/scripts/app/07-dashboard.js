// ===== 集計：収穫開始カレンダー =====
function getHarvestCycleStartDetailsByBuilding(sourceRecords = records){
  const dateMapsByBuilding = new Map(BUILDINGS.map(building => [building, new Map()]));
  sourceRecords.forEach(record => {
    const date = parseDateOnlyString(record.date);
    if(!date) return;
    const isPartialHarvest = record.type === "partialHarvest";
    getDashboardRecordBuildings(record).forEach(building => {
      const dateMap = dateMapsByBuilding.get(building);
      if(!dateMap) return;
      const existing = dateMap.get(record.date) || {
        date,
        hasFullHarvest: false,
        hasPartialHarvest: false
      };
      if(isPartialHarvest) existing.hasPartialHarvest = true;
      else existing.hasFullHarvest = true;
      dateMap.set(record.date, existing);
    });
  });

  const startsByBuilding = new Map();
  dateMapsByBuilding.forEach((dateMap, building) => {
    const activities = [...dateMap.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
    const cycles = [];
    activities.forEach(activity => {
      const latestCycleActivities = cycles.length
        ? cycles[cycles.length - 1].activities
        : [];
      const previousActivity = latestCycleActivities.length
        ? latestCycleActivities[latestCycleActivities.length - 1]
        : null;
      const diffDays = previousActivity
        ? Math.floor(
          (startOfLocalDay(activity.date).getTime() - startOfLocalDay(previousActivity.date).getTime()) / 86400000
        )
        : null;
      if(!previousActivity || diffDays > HARVEST_CYCLE_GAP_DAYS){
        cycles.push({ activities: [activity] });
      }else{
        cycles[cycles.length - 1].activities.push(activity);
      }
    });

    const cycleStarts = cycles.flatMap(cycle => {
      const firstActivity = cycle.activities[0];
      const firstFullHarvest = cycle.activities.find(activity => activity.hasFullHarvest) || null;
      const starts = [];
      if(firstActivity.hasPartialHarvest && !firstActivity.hasFullHarvest){
        starts.push({
          date: firstActivity.date,
          type: "partialHarvest"
        });
      }
      if(firstFullHarvest){
        starts.push({
          date: firstFullHarvest.date,
          type: "fullHarvest"
        });
      }
      return starts;
    }).sort((left, right) => (
      left.date.getTime() - right.date.getTime()
      || Number(left.type === "partialHarvest") - Number(right.type === "partialHarvest")
    ));
    startsByBuilding.set(building, cycleStarts);
  });
  return startsByBuilding;
}

function getHarvestCycleStartsByBuilding(sourceRecords = records){
  const detailsByBuilding = getHarvestCycleStartDetailsByBuilding(sourceRecords);
  return new Map([...detailsByBuilding].map(([building, starts]) => (
    [building, starts.map(start => start.date)]
  )));
}

function getDashboardHarvestStartItemsByDate(sourceRecords = records, options = {}){
  const itemsByDate = new Map();
  const startsByBuilding = getHarvestCycleStartDetailsByBuilding(sourceRecords);
  const rangeStart = options.startDate instanceof Date
    ? startOfLocalDay(options.startDate).getTime()
    : -Infinity;
  const rangeEnd = options.endDateExclusive instanceof Date
    ? startOfLocalDay(options.endDateExclusive).getTime()
    : Infinity;
  BUILDINGS.forEach(building => {
    const starts = startsByBuilding.get(building) || [];
    const normalStarts = starts.filter(start => start.type === "fullHarvest");
    starts.forEach(start => {
      const startTime = startOfLocalDay(start.date).getTime();
      if(startTime < rangeStart || startTime >= rangeEnd) return;
      const previousNormalStarts = normalStarts
        .filter(normalStart => normalStart.date.getTime() < start.date.getTime());
      const previousNormalStart = previousNormalStarts.length
        ? previousNormalStarts[previousNormalStarts.length - 1]
        : null;
      const daysSincePreviousStart = previousNormalStart
        ? Math.max(0, Math.floor(
          (startOfLocalDay(start.date).getTime() - startOfLocalDay(previousNormalStart.date).getTime()) / 86400000
        ))
        : null;
      const dateKey = formatDateOnlyString(start.date);
      if(!itemsByDate.has(dateKey)) itemsByDate.set(dateKey, []);
      itemsByDate.get(dateKey).push({
        building,
        daysSincePreviousStart,
        type: start.type
      });
    });
  });
  itemsByDate.forEach(items => items.sort((a, b) => (
    Number(a.type === "partialHarvest") - Number(b.type === "partialHarvest")
    || a.building - b.building
  )));
  return itemsByDate;
}

function createDashboardHarvestStartMonth(start, suffix){
  const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);
  return {
    start: monthStart,
    suffix,
    label: `${monthStart.getFullYear()}年${monthStart.getMonth() + 1}月`,
    daysInMonth: new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate()
  };
}

function getDashboardHarvestStartMonths(referenceDate = new Date()){
  const reference = startOfLocalDay(referenceDate);
  const currentMonth = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const previousMonth = new Date(reference.getFullYear(), reference.getMonth() - 1, 1);
  return [
    createDashboardHarvestStartMonth(previousMonth, "先月"),
    createDashboardHarvestStartMonth(currentMonth, "今月")
  ];
}

function normalizeDashboardCalendarMonth(value){
  if(value instanceof Date && Number.isFinite(value.getTime())){
    return new Date(value.getFullYear(), value.getMonth(), 1);
  }
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})$/);
  if(!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if(!Number.isSafeInteger(year) || year < 1900 || year > 9999
    || !Number.isSafeInteger(month) || month < 1 || month > 12) return null;
  return new Date(year, month - 1, 1);
}

function formatDashboardCalendarMonthValue(value){
  const month = normalizeDashboardCalendarMonth(value);
  if(!month) return "";
  return [
    String(month.getFullYear()).padStart(4, "0"),
    String(month.getMonth() + 1).padStart(2, "0")
  ].join("-");
}

function getDefaultDashboardPastCalendarStartMonth(referenceDate = new Date()){
  const reference = startOfLocalDay(referenceDate);
  return new Date(reference.getFullYear(), reference.getMonth() - 2, 1);
}

function getDashboardPastCalendarStartMonth(){
  const normalized = normalizeDashboardCalendarMonth(dashboardPastCalendarStartMonth)
    || getDefaultDashboardPastCalendarStartMonth();
  dashboardPastCalendarStartMonth = normalized;
  return normalized;
}

function getDashboardPastCalendarMonths(){
  const startMonth = getDashboardPastCalendarStartMonth();
  return [
    createDashboardHarvestStartMonth(startMonth, "選択月"),
    createDashboardHarvestStartMonth(
      new Date(startMonth.getFullYear(), startMonth.getMonth() + 1, 1),
      "翌月"
    )
  ];
}

function getDashboardPastCalendarItemsByDate(){
  if(!dashboardPastCalendarItemsByDateCache){
    dashboardPastCalendarItemsByDateCache = getDashboardHarvestStartItemsByDate(records);
  }
  return dashboardPastCalendarItemsByDateCache;
}

function syncDashboardPastCalendarControls(){
  const button = document.getElementById("dashboardCalendarPastBtn");
  const controls = document.getElementById("dashboardCalendarHistoryControls");
  const monthInput = document.getElementById("dashboardCalendarMonthInput");
  if(button){
    button.textContent = dashboardPastCalendarActive ? "現在へ" : "年月を選択";
    button.setAttribute("aria-pressed", dashboardPastCalendarActive ? "true" : "false");
    button.setAttribute("aria-expanded", dashboardPastCalendarActive ? "true" : "false");
  }
  if(controls) controls.hidden = !dashboardPastCalendarActive;
  if(monthInput && dashboardPastCalendarActive){
    monthInput.value = formatDashboardCalendarMonthValue(getDashboardPastCalendarStartMonth());
  }
}

function toggleDashboardPastCalendar(){
  dashboardPastCalendarActive = !dashboardPastCalendarActive;
  if(dashboardPastCalendarActive){
    getDashboardPastCalendarStartMonth();
    syncDashboardPastCalendarControls();
    // 過去全体の索引は、このボタンが押された時に初めて作る。
    getDashboardPastCalendarItemsByDate();
  }else{
    syncDashboardPastCalendarControls();
  }
  renderDashboardHarvestStartTimeline();
}

function setDashboardPastCalendarMonth(value){
  const month = normalizeDashboardCalendarMonth(value);
  if(!month){
    syncDashboardPastCalendarControls();
    return;
  }
  dashboardPastCalendarStartMonth = month;
  if(!dashboardPastCalendarActive) dashboardPastCalendarActive = true;
  renderDashboardHarvestStartTimeline();
}

function shiftDashboardPastCalendarMonth(direction){
  const offset = Number(direction) < 0 ? -1 : 1;
  const current = getDashboardPastCalendarStartMonth();
  dashboardPastCalendarStartMonth = new Date(
    current.getFullYear(),
    current.getMonth() + offset,
    1
  );
  if(!dashboardPastCalendarActive) dashboardPastCalendarActive = true;
  renderDashboardHarvestStartTimeline();
}

function renderDashboardHarvestStartTimeline(referenceDate = new Date()){
  const container = document.getElementById("dashboardHarvestStartTimeline");
  if(!container) return;
  syncDashboardPastCalendarControls();
  const months = dashboardPastCalendarActive
    ? getDashboardPastCalendarMonths()
    : getDashboardHarvestStartMonths(referenceDate);
  const visibleStart = months[0].start;
  const lastMonth = months[months.length - 1].start;
  const visibleEnd = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 1);
  const todayKey = formatDateOnlyString(startOfLocalDay(new Date()));
  const itemsByDate = dashboardPastCalendarActive
    ? getDashboardPastCalendarItemsByDate()
    : getDashboardHarvestStartItemsByDate(records, {
        startDate: visibleStart,
        endDateExclusive: visibleEnd
      });
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  container.innerHTML = months.map(month => {
    const dayRows = Array.from({ length: month.daysInMonth }, (_, index) => {
      const date = new Date(month.start.getFullYear(), month.start.getMonth(), index + 1);
      const dateKey = formatDateOnlyString(date);
      const startItems = itemsByDate.get(dateKey) || [];
      const weekday = date.getDay();
      const weekdayClass = weekday === 0 ? " sunday" : (weekday === 6 ? " saturday" : "");
      const rowClass = [
        "dashboardHarvestStartDay",
        startItems.length ? "has-start" : "",
        dateKey === todayKey ? "is-today" : ""
      ].filter(Boolean).join(" ");
      return `
        <div class="${rowClass}" data-dashboard-harvest-start-date="${dateKey}">
          <div class="dashboardHarvestStartDate${weekdayClass}">${date.getDate()}(${weekdays[weekday]})</div>
          <div class="dashboardHarvestStartBuildings">
            ${startItems.map(item => {
              const elapsedText = Number.isFinite(item.daysSincePreviousStart) ? `${item.daysSincePreviousStart}日` : "初回";
              const elapsedLabel = Number.isFinite(item.daysSincePreviousStart)
                ? `前回の通常収穫開始日から${item.daysSincePreviousStart}日`
                : "比較できる前回の通常収穫開始記録なし";
              if(item.type === "partialHarvest"){
                return `<span class="dashboardHarvestStartPartial" aria-label="${item.building}号棟を部分収穫で開始。${elapsedLabel}">(${item.building}:${elapsedText})</span>`;
              }
              return `<span class="dashboardHarvestStartEntry"><span class="dashboardHarvestStartBuilding">${item.building}号棟</span><span class="dashboardHarvestStartElapsed" aria-label="${elapsedLabel}">${elapsedText}</span></span>`;
            }).join("")}
          </div>
        </div>
      `;
    }).join("");
    return `
      <section class="dashboardHarvestStartMonthColumn" aria-label="${escapeHtml(month.label + " " + month.suffix)}">
        <div class="dashboardHarvestStartMonthTitle">${escapeHtml(month.label)}（${escapeHtml(month.suffix)}）</div>
        <div class="dashboardHarvestStartMonthDays">${dayRows}</div>
      </section>
    `;
  }).join("");
}

function updateBuildingLastHarvestInfo(){
  renderPlantingAgeInfo();
}

// ===== 号棟選択：シミュ・ケース配置の前後移動 =====
function getAdjacentBuilding(building, direction){
  const nextBuildingValue = Number(building) + direction;
  if(nextBuildingValue > MAX_BUILDING) return MIN_BUILDING;
  if(nextBuildingValue < MIN_BUILDING) return MAX_BUILDING;
  return nextBuildingValue;
}

function shiftCurrentBuilding(direction){
  closeBedDetailWindow();
  hideBedActionMenu();
  hideRecordBedActionMenu();
  syncCurrentCasePlacementFromInputs();
  expandedForecastBed = null;
  expandedRecordBed = null;
  currentBuilding = getAdjacentBuilding(currentBuilding, direction);
  updateBuildingLabel();
  refreshHarvestMapViews();
}

function nextBuilding(){
  shiftCurrentBuilding(1);
}

function prevBuilding(){
  shiftCurrentBuilding(-1);
}

function shiftCasePlacementBuilding(direction){
  syncCurrentCasePlacementFromInputs();
  casePlacementBuilding = getAdjacentBuilding(casePlacementBuilding, direction);
  updateCasePlacementBuildingLabel();
  populateCasePlacementInputs();
  syncCurrentBuildingToCasePlacement({ skipSummary: true });
  renderForecastSummary();
  saveHarvestStateToStorage();
}

function nextCasePlacementBuilding(){
  shiftCasePlacementBuilding(1);
}

function prevCasePlacementBuilding(){
  shiftCasePlacementBuilding(-1);
}

function parseDateOnlyString(value){
  if(typeof value !== "string") return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if(Number.isNaN(date.getTime())) return null;
  return date;
}

function startOfLocalDay(date){
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getHarvestTargetDate(){
  const recordDateValue = document.getElementById("recordDateInput")?.value || "";
  return startOfLocalDay(parseDateOnlyString(recordDateValue) || new Date());
}

function formatDateOnlyString(date){
  const d = startOfLocalDay(date);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0")
  ].join("-");
}

function getDefaultDashboardStartDay(){
  return 1;
}

function normalizeDashboardSubtab(value){
  if(value === "cards") return "graphs";
  return ["guide", "calendar", "seedlings", "graphs"].includes(value) ? value : "guide";
}

function normalizeDashboardRecordTypeFilter(value){
  return ["all", "full", "partial", "planting", "attention"].includes(value) ? value : "all";
}

function invalidateDashboardDerivedData(){
  dashboardHarvestForecastModelCache = null;
  dashboardSeedlingStatusModelCache = null;
  dashboardSeedlingStatusSelectedLotIndex = null;
  dashboardPastCalendarItemsByDateCache = null;
  dashboardRenderedSubtabs.clear();
  dashboardRenderedDayKey = "";
}

function loadDashboardFilter(){
  try{
    const parsed = harvestnaviLocalStorage.readJson(DASHBOARD_FILTER_KEY, null);
    if(!parsed) return {
      startDay: getDefaultDashboardStartDay(),
      graphStartDate: "",
      graphEndDate: "",
      casesGranularity: "month",
      lossGranularity: "month",
      harvestForecastView: "beds",
      dashboardSubtab: "guide",
      recordType: "all",
      recordSearch: "",
      recordStartDate: "",
      recordEndDate: ""
    };
    const normalizeGranularity = value => ["month", "year"].includes(value) ? value : "month";
    const startDay = clampNumber(parsed?.startDay, 1, 31, getDefaultDashboardStartDay());
    return {
      startDay,
      historyPeriodStart: parseDateOnlyString(parsed?.historyPeriodStart || "") ? String(parsed.historyPeriodStart) : "",
      graphStartDate: "",
      graphEndDate: "",
      casesGranularity: normalizeGranularity(parsed?.casesGranularity),
      lossGranularity: normalizeGranularity(parsed?.lossGranularity),
      harvestForecastView: ["beds", "days"].includes(parsed?.harvestForecastView)
        ? parsed.harvestForecastView
        : "beds",
      dashboardSubtab: normalizeDashboardSubtab(parsed?.dashboardSubtab),
      recordType: normalizeDashboardRecordTypeFilter(parsed?.recordType),
      recordSearch: String(parsed?.recordSearch || "").trim(),
      recordStartDate: parseDateOnlyString(parsed?.recordStartDate || "") ? String(parsed.recordStartDate) : "",
      recordEndDate: parseDateOnlyString(parsed?.recordEndDate || "") ? String(parsed.recordEndDate) : ""
    };
  }catch(e){
    return {
      startDay: getDefaultDashboardStartDay(),
      historyPeriodStart: "",
      graphStartDate: "",
      graphEndDate: "",
      casesGranularity: "month",
      lossGranularity: "month",
      harvestForecastView: "beds",
      dashboardSubtab: "guide",
      recordType: "all",
      recordSearch: "",
      recordStartDate: "",
      recordEndDate: ""
    };
  }
}

function saveDashboardFilter(){
  harvestnaviLocalStorage.writeJson(DASHBOARD_FILTER_KEY, dashboardFilter);
}

function getDashboardStartDayInputs(){
  return Array.from(document.querySelectorAll("[data-dashboard-start-day-input]"));
}

function syncDashboardStartDayInputs(day = dashboardFilter.startDay){
  const normalizedDay = clampNumber(day, 1, 31, getDefaultDashboardStartDay());
  getDashboardStartDayInputs().forEach(select => {
    if(String(select.value) !== String(normalizedDay)){
      select.value = String(normalizedDay);
    }
  });
}

function populateDashboardStartDayOptions(){
  const optionsHtml = Array.from({ length: 31 }, (_, index) => {
    const day = index + 1;
    return `<option value="${day}">${day}日</option>`;
  }).join("");
  getDashboardStartDayInputs().forEach(select => {
    if(!select.dataset.optionsReady){
      select.innerHTML = optionsHtml;
      select.dataset.optionsReady = "1";
    }
  });
  syncDashboardStartDayInputs();
}

function revealDashboardSelectedBuildingButton(tabsId, selectedButtonSelector){
  const tabs = document.getElementById(tabsId);
  if(!tabs || tabs.hidden || tabs.clientWidth <= 0) return false;
  const selectedButton = tabs.querySelector(selectedButtonSelector);
  if(!selectedButton) return false;

  const maxScrollLeft = Math.max(0, tabs.scrollWidth - tabs.clientWidth);
  const centeredScrollLeft = selectedButton.offsetLeft
    - (tabs.clientWidth - selectedButton.offsetWidth) / 2;
  tabs.scrollLeft = Math.min(maxScrollLeft, Math.max(0, centeredScrollLeft));
  return true;
}

function scheduleDashboardSelectedBuildingButtonReveal(subtab = dashboardFilter.dashboardSubtab){
  const activeSubtab = normalizeDashboardSubtab(subtab);
  const target = activeSubtab === "seedlings"
    ? {
        tabsId: "dashboardSeedlingStatusBuildingTabs",
        selector: "[data-dashboard-seedling-building].active"
      }
    : (activeSubtab === "guide" && getDashboardHarvestForecastView() === "beds"
        ? {
            tabsId: "dashboardHarvestForecastBuildingTabs",
            selector: "[data-dashboard-forecast-building].active"
          }
        : null);
  if(!target) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      revealDashboardSelectedBuildingButton(target.tabsId, target.selector);
    });
  });
}

function syncDashboardSubtabUi(){
  const activeSubtab = normalizeDashboardSubtab(dashboardFilter.dashboardSubtab);
  document.querySelectorAll("[data-dashboard-subtab]").forEach(button => {
    const isActive = button.dataset.dashboardSubtab === activeSubtab;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
    button.tabIndex = isActive ? 0 : -1;
  });
  document.querySelectorAll("[data-dashboard-subtab-panel]").forEach(panel => {
    panel.hidden = panel.dataset.dashboardSubtabPanel !== activeSubtab;
  });
  scheduleDashboardSelectedBuildingButtonReveal(activeSubtab);
}

function setDashboardSubtab(value){
  const nextSubtab = normalizeDashboardSubtab(value);
  if(dashboardFilter.dashboardSubtab !== nextSubtab){
    dashboardFilter.dashboardSubtab = nextSubtab;
    saveDashboardFilter();
  }
  syncDashboardSubtabUi();
  renderDashboardSubtab(nextSubtab);
  dashboardRenderedDayKey = formatDateOnlyString(new Date());
}

function handleDashboardSubtabKeydown(event){
  if(!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const buttons = Array.from(document.querySelectorAll("[data-dashboard-subtab]"));
  if(!buttons.length) return;
  const currentIndex = Math.max(0, buttons.indexOf(event.target));
  let nextIndex = currentIndex;
  if(event.key === "Home") nextIndex = 0;
  if(event.key === "End") nextIndex = buttons.length - 1;
  if(event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
  if(event.key === "ArrowRight") nextIndex = (currentIndex + 1) % buttons.length;
  event.preventDefault();
  const nextButton = buttons[nextIndex];
  setDashboardSubtab(nextButton?.dataset.dashboardSubtab);
  nextButton?.focus();
}

function addMonthsClamped(date, months){
  const source = startOfLocalDay(date);
  const targetYear = source.getFullYear();
  const targetMonthIndex = source.getMonth() + months;
  const firstOfTargetMonth = new Date(targetYear, targetMonthIndex, 1);
  const lastOfTargetMonth = new Date(firstOfTargetMonth.getFullYear(), firstOfTargetMonth.getMonth() + 1, 0);
  const targetDay = Math.min(source.getDate(), lastOfTargetMonth.getDate());
  return new Date(firstOfTargetMonth.getFullYear(), firstOfTargetMonth.getMonth(), targetDay);
}

function addDays(date, days){
  const source = startOfLocalDay(date);
  return new Date(source.getFullYear(), source.getMonth(), source.getDate() + days);
}

function buildClampedMonthDayDate(year, monthIndex, dayOfMonth){
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(dayOfMonth, lastDay));
}

function getDashboardSelectedStartDay(){
  const inputValue = Number(dashboardFilter.startDay || getDefaultDashboardStartDay());
  return clampNumber(inputValue, 1, 31, getDefaultDashboardStartDay());
}

function getLatestDashboardBoundaryDate(dayOfMonth, referenceDate = new Date()){
  const ref = startOfLocalDay(referenceDate);
  let candidate = buildClampedMonthDayDate(ref.getFullYear(), ref.getMonth(), dayOfMonth);
  if(candidate.getTime() > ref.getTime()){
    candidate = buildClampedMonthDayDate(ref.getFullYear(), ref.getMonth() - 1, dayOfMonth);
  }
  return candidate;
}

function getNextDashboardBoundaryDate(boundaryDate, dayOfMonth = getDashboardSelectedStartDay()){
  const start = startOfLocalDay(boundaryDate);
  return buildClampedMonthDayDate(start.getFullYear(), start.getMonth() + 1, dayOfMonth);
}

function getDashboardPeriod(){
  const dayOfMonth = getDashboardSelectedStartDay();
  const endInclusive = startOfLocalDay(new Date());
  const start = getLatestDashboardBoundaryDate(dayOfMonth, endInclusive);
  const endExclusive = addDays(endInclusive, 1);
  return {
    start,
    endExclusive,
    endInclusive,
    startLabel: formatDateOnlyString(start),
    endLabel: formatDateOnlyString(endInclusive),
    dayOfMonth
  };
}

function getDashboardGranularityLabel(granularity){
  if(granularity === "month") return "月";
  if(granularity === "year") return "年";
  return "日";
}

function getDashboardChartPeriod(startDate, granularity){
  const endInclusive = startOfLocalDay(new Date());
  const endExclusive = addDays(endInclusive, 1);
  const dayOfMonth = getDashboardSelectedStartDay();
  let start = startOfLocalDay(startDate);
  if(granularity === "month"){
    start = buildClampedMonthDayDate(start.getFullYear(), start.getMonth() - 11, dayOfMonth);
  }else if(granularity === "year"){
    start = buildClampedMonthDayDate(start.getFullYear() - 4, start.getMonth(), dayOfMonth);
  }
  return {
    start,
    endExclusive,
    endInclusive,
    startLabel: formatDateOnlyString(start),
    endLabel: formatDateOnlyString(endInclusive),
    granularity,
    dayOfMonth
  };
}

function cancelDashboardRecordFilterRefresh(){
  if(dashboardRecordFilterTimer !== null){
    clearTimeout(dashboardRecordFilterTimer);
    dashboardRecordFilterTimer = null;
  }
}

function normalizeDashboardRecordCalendarMonth(value, fallbackDate = new Date()){
  if(value instanceof Date && !Number.isNaN(value.getTime())){
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
  }
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})$/);
  if(match){
    const year = Number(match[1]);
    const month = Number(match[2]);
    if(year >= 1 && year <= 9999 && month >= 1 && month <= 12) return `${match[1]}-${match[2]}`;
  }
  return `${fallbackDate.getFullYear()}-${String(fallbackDate.getMonth() + 1).padStart(2, "0")}`;
}

function getDashboardRecordCalendarPeriod(month = dashboardRecordCalendarMonth){
  const monthKey = normalizeDashboardRecordCalendarMonth(month);
  const [year, monthNumber] = monthKey.split("-").map(Number);
  const start = new Date(year, monthNumber - 1, 1);
  const endExclusive = new Date(year, monthNumber, 1);
  return {
    monthKey,
    year,
    month: monthNumber,
    start,
    endExclusive,
    endInclusive: addDays(endExclusive, -1),
    startLabel: formatDateOnlyString(start),
    endLabel: formatDateOnlyString(addDays(endExclusive, -1)),
    isCustom: false,
    isAllPeriod: false
  };
}

function loadDashboardRecordCalendarMonth(month = new Date()){
  dashboardRecordCalendarMonth = normalizeDashboardRecordCalendarMonth(month);
  renderDashboardRecordResults();
  return dashboardRecordCalendarMonth;
}

function shiftDashboardRecordCalendarMonth(offset){
  const period = getDashboardRecordCalendarPeriod();
  const monthOffset = Math.trunc(clampNumber(offset, -1200, 1200, 0));
  return loadDashboardRecordCalendarMonth(new Date(period.year, period.month - 1 + monthOffset, 1));
}

function getDashboardRecordTypeFilterLabel(value = dashboardFilter.recordType){
  const normalized = normalizeDashboardRecordTypeFilter(value);
  if(normalized === "full") return "通常収穫";
  if(normalized === "partial") return "部分収穫";
  if(normalized === "planting") return "苗植え";
  if(normalized === "attention") return "要確認";
  return "すべて";
}

function syncDashboardRecordFilterControls(){
  const recordType = normalizeDashboardRecordTypeFilter(dashboardFilter.recordType);
  dashboardFilter.recordType = recordType;
  document.querySelectorAll("[data-dashboard-record-type]").forEach(button => {
    const isActive = button.dataset.dashboardRecordType === recordType;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  const startValue = String(document.getElementById("dashboardRecordStartDateInput")?.value || dashboardFilter.recordStartDate || "");
  const endValue = String(document.getElementById("dashboardRecordEndDateInput")?.value || dashboardFilter.recordEndDate || "");
  const status = document.getElementById("dashboardRecordPeriodStatus");
  if(status){
    status.textContent = startValue || endValue
      ? `${startValue || "最初"} 〜 ${endValue || "最新"}`
      : "全期間";
  }
  if((startValue || endValue) && document.getElementById("dashboardRecordPeriodDetails")){
    document.getElementById("dashboardRecordPeriodDetails").open = true;
  }
  const filterStatus = document.getElementById("dashboardRecordFilterStatus");
  if(filterStatus){
    const activeFilterCount = Number(recordType !== "all")
      + Number(!!String(document.getElementById("dashboardRecordSearchInput")?.value || dashboardFilter.recordSearch || "").trim())
      + Number(!!(startValue || endValue));
    filterStatus.textContent = activeFilterCount ? `${activeFilterCount}件設定` : "なし";
  }
}

function setDashboardRecordTypeFilter(value){
  cancelDashboardRecordFilterRefresh();
  dashboardFilter.recordType = normalizeDashboardRecordTypeFilter(value);
  syncDashboardRecordFilterControls();
  runDashboardRecordFilterRefresh();
}

function renderDashboardRecordResults(){
  syncDashboardRecordFilterControls();
  const calendarPeriod = getDashboardRecordCalendarPeriod();
  dashboardRecordCalendarMonth = calendarPeriod.monthKey;
  const monthLabel = document.getElementById("dashboardRecordCalendarMonthLabel");
  if(monthLabel) monthLabel.textContent = `${calendarPeriod.year}年${calendarPeriod.month}月`;

  const allItems = getDashboardRecordItemsForPeriod(calendarPeriod);
  const dateFilterPeriod = getDashboardTablePeriod(calendarPeriod);
  const filteredItems = dateFilterPeriod.isCustom
    ? allItems.filter(item => isDateInPeriod(item?.date, dateFilterPeriod))
    : allItems;
  const matchingItems = filterDashboardRecordItems(filteredItems);
  const matchingDates = new Set(matchingItems.map(item => String(item?.date || "")));
  const tableItems = allItems.filter(item => matchingDates.has(String(item?.date || "")));
  const keyword = String(
    document.getElementById("dashboardRecordSearchInput")?.value
      || dashboardFilter.recordSearch
      || ""
  ).trim();
  renderDashboardRecordCalendar(tableItems, {
    period: calendarPeriod,
    dateFilterPeriod,
    keyword,
    recordType: dashboardFilter.recordType
  });
}

function runDashboardRecordFilterRefresh(){
  cancelDashboardRecordFilterRefresh();
  saveDashboardFilter();
  renderDashboardRecordResults();
}

function scheduleDashboardRecordFilterRefresh(){
  cancelDashboardRecordFilterRefresh();
  dashboardRecordFilterTimer = setTimeout(() => {
    dashboardRecordFilterTimer = null;
    saveDashboardFilter();
    renderDashboardRecordResults();
  }, DASHBOARD_RECORD_FILTER_DELAY_MS);
}

function clearDashboardRecordFilters(){
  cancelDashboardRecordFilterRefresh();
  dashboardFilter.recordType = "all";
  dashboardFilter.recordSearch = "";
  dashboardFilter.recordStartDate = "";
  dashboardFilter.recordEndDate = "";
  const searchInput = document.getElementById("dashboardRecordSearchInput");
  const startInput = document.getElementById("dashboardRecordStartDateInput");
  const endInput = document.getElementById("dashboardRecordEndDateInput");
  if(searchInput) searchInput.value = "";
  if(startInput) startInput.value = "";
  if(endInput) endInput.value = "";
  const periodDetails = document.getElementById("dashboardRecordPeriodDetails");
  if(periodDetails) periodDetails.open = false;
  syncDashboardRecordFilterControls();
  saveDashboardFilter();
  renderDashboardRecordResults();
}

function isDateInPeriod(dateStr, period){
  const date = parseDateOnlyString(dateStr);
  if(!date) return false;
  const day = startOfLocalDay(date);
  return day.getTime() >= period.start.getTime() && day.getTime() < period.endExclusive.getTime();
}

function isDateInDashboardPeriod(dateStr, period = getDashboardPeriod()){
  return isDateInPeriod(dateStr, period);
}

function getDashboardRecords(){
  return records.filter(record => isDateInDashboardPeriod(record.date)).sort(compareRecordsByDateDesc);
}

function getDashboardRecordsForPeriod(period){
  return records.filter(record => isDateInPeriod(record.date, period)).sort(compareRecordsByDateDesc);
}

function getDashboardPlantingEventsForPeriod(period){
  return plantingEvents
    .filter(event => isDateInPeriod(event.plantingDate, period))
    .sort(comparePlantingEventsDesc);
}

function getDashboardRecordItemsForPeriod(period){
  return getRecordHistoryCache().historyItems.filter(item => isDateInPeriod(item.date, period));
}

function getDashboardHistoryDates(){
  return [
    ...records.map(record => parseDateOnlyString(record.date)),
    ...plantingEvents.map(event => parseDateOnlyString(event.plantingDate))
  ].filter(date => !!date).sort((a, b) => a.getTime() - b.getTime());
}

function getAllRecordsPeriod(){
  const allRecordDates = getDashboardHistoryDates();
  const fallbackDay = startOfLocalDay(new Date());
  const start = allRecordDates[0] ? startOfLocalDay(allRecordDates[0]) : fallbackDay;
  const endInclusive = allRecordDates.length ? startOfLocalDay(allRecordDates[allRecordDates.length - 1]) : fallbackDay;
  return {
    start,
    endInclusive,
    endExclusive: addDays(endInclusive, 1),
    startLabel: formatDateOnlyString(start),
    endLabel: formatDateOnlyString(endInclusive),
    isCustom: false,
    isAllPeriod: true
  };
}

function getDashboardTablePeriod(defaultPeriod = getAllRecordsPeriod()){
  const startValue = String(document.getElementById("dashboardRecordStartDateInput")?.value || dashboardFilter.recordStartDate || "").trim();
  const endValue = String(document.getElementById("dashboardRecordEndDateInput")?.value || dashboardFilter.recordEndDate || "").trim();
  const start = parseDateOnlyString(startValue);
  const end = parseDateOnlyString(endValue);
  if(!start && !end){
    return {
      ...defaultPeriod,
      isCustom: false
    };
  }

  const allRecordDates = getDashboardHistoryDates();
  const fallbackStart = allRecordDates[0] ? startOfLocalDay(allRecordDates[0]) : startOfLocalDay(new Date());
  const fallbackEnd = allRecordDates.length ? startOfLocalDay(allRecordDates[allRecordDates.length - 1]) : startOfLocalDay(new Date());

  const startDay = startOfLocalDay(start || fallbackStart);
  const endDay = startOfLocalDay(end || fallbackEnd);
  const normalizedStart = startDay.getTime() <= endDay.getTime() ? startDay : endDay;
  const normalizedEnd = endDay.getTime() >= startDay.getTime() ? endDay : startDay;

  return {
    start: normalizedStart,
    endInclusive: normalizedEnd,
    endExclusive: addDays(normalizedEnd, 1),
    startLabel: formatDateOnlyString(normalizedStart),
    endLabel: formatDateOnlyString(normalizedEnd),
    isCustom: true
  };
}

function getDashboardRecordSearchText(record, harvestCaseTotalsByDate = null){
  const qualityMemo = record?.type === "partialHarvest" ? "" : formatQualityMemo(record.qualityMemo);
  const summary = record?.type === "partialHarvest"
    ? formatPartialHarvestSummary(record.targets)
    : (record.palletSummary || "");
  const plantingText = record?.type === "partialHarvest"
    ? ""
    : getSameDayPlantingEventsForHarvest(record).map(event => {
        const allocation = event.sourceAllocations.find(item => (
          Number(item.harvestRecordId) === Number(record.id)
        ));
        return [
          event.plantingDate || "",
          formatPlantingSummaryForKeys(allocation?.palletKeys || []),
          event.detailsUnknown ? "苗情報 不明" : `${event.actualSeedlingTrayCount}枚`,
          formatPlantingQualityMemo(event.qualityMemo)
        ].join("\n");
      }).join("\n");
  return [
    record?.date || "",
    getDashboardRecordTypeLabel(record),
    String(record?.cases || ""),
    getHarvestRecordCaseDisplayText(record, harvestCaseTotalsByDate),
    record?.actualLoss || "",
    formatDashboardBuildings(record),
    qualityMemo || "",
    summary || "",
    plantingText,
    record?.memo || ""
  ].join("\n").toLowerCase();
}

function getDashboardPlantingEventSearchText(event){
  const metrics = getPlantingEventListMetrics(event);
  const sourceText = (event?.sourceAllocations || []).map(allocation => {
    const source = getRecordById(allocation.harvestRecordId);
    return `${source?.date || "日付不明"}の収穫 ${allocation.palletKeys.length}パレット`;
  }).join("\n");
  return [
    event?.plantingDate || "",
    "苗植え",
    "二次定植",
    formatPlantingSummaryForKeys(event?.plantingPalletKeys || []) || "苗植えなし",
    metrics.seedlingTrayText,
    metrics.lossRateText,
    formatPlantingQualityMemo(event?.qualityMemo),
    sourceText
  ].join("\n").toLowerCase();
}

function getDashboardRecordItemSearchText(item, harvestCaseTotalsByDate = null){
  return item?.kind === "planting"
    ? getDashboardPlantingEventSearchText(item.value)
    : getDashboardRecordSearchText(item?.value, harvestCaseTotalsByDate);
}

function getDashboardRecordItemAttentionInfo(item){
  const isPlanting = item?.kind === "planting";
  const entity = item?.value;
  const id = isPlanting ? entity?.eventId : entity?.id;
  const issue = getRecordHistoryCache().consistencyAudit?.issueByKey?.get(
    getRecordConsistencyIssueKey(isPlanting ? "planting" : "harvest", id)
  ) || null;
  const conflict = getSyncConflictForEntity(isPlanting ? "planting" : "record", entity);
  const reasons = [
    ...(conflict ? [getSyncConflictReasonText(conflict)] : []),
    ...(issue?.reasons || [])
  ].filter(Boolean);
  return {
    hasAttention: !!(conflict || issue),
    label: conflict ? "競合" : (issue ? "要確認" : ""),
    reasons
  };
}

function getDashboardRecordAttentionInfo(record){
  return getDashboardRecordItemAttentionInfo({ kind: "harvest", value: record });
}

function filterDashboardRecordItems(itemsInPeriod){
  const recordType = normalizeDashboardRecordTypeFilter(dashboardFilter.recordType);
  const keyword = String(document.getElementById("dashboardRecordSearchInput")?.value || dashboardFilter.recordSearch || "").trim().toLowerCase();
  let filteredItems = itemsInPeriod;
  if(recordType === "full"){
    filteredItems = filteredItems.filter(item => item?.kind === "harvest" && item.value?.type !== "partialHarvest");
  }else if(recordType === "partial"){
    filteredItems = filteredItems.filter(item => item?.kind === "harvest" && item.value?.type === "partialHarvest");
  }else if(recordType === "planting"){
    filteredItems = filteredItems.filter(item => item?.kind === "planting");
  }else if(recordType === "attention"){
    filteredItems = filteredItems.filter(item => getDashboardRecordItemAttentionInfo(item).hasAttention);
  }
  if(!keyword) return filteredItems;
  const harvestCaseTotalsByDate = getHarvestCaseTotalsByDate(records);
  return filteredItems.filter(item => (
    getDashboardRecordItemSearchText(item, harvestCaseTotalsByDate).includes(keyword)
  ));
}

function enumerateDatesInPeriod(period){
  const dates = [];
  let cursor = new Date(period.start);
  while(cursor.getTime() < period.endExclusive.getTime()){
    dates.push(new Date(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }
  return dates;
}

function getDashboardBucketKey(date, granularity, dayOfMonth = getDashboardSelectedStartDay()){
  const d = startOfLocalDay(date);
  if(granularity === "month"){
    return formatDateOnlyString(getLatestDashboardBoundaryDate(dayOfMonth, d));
  }
  if(granularity === "year"){
    return `${d.getFullYear()}`;
  }
  return formatDateOnlyString(d);
}

function getDashboardBucketLabel(bucketKey, granularity, dayOfMonth = getDashboardSelectedStartDay()){
  if(granularity === "month"){
    const start = parseDateOnlyString(bucketKey);
    if(!start) return bucketKey;
    if(dayOfMonth === 1){
      return `${start.getFullYear()}/${String(start.getMonth() + 1).padStart(2, "0")}`;
    }
    const end = addDays(getNextDashboardBoundaryDate(start, dayOfMonth), -1);
    return `${start.getMonth() + 1}/${start.getDate()}〜${end.getMonth() + 1}/${end.getDate()}`;
  }
  if(granularity === "year"){
    return bucketKey + "年";
  }
  return bucketKey.slice(5);
}

function getDashboardBucketFullLabel(bucketKey, granularity, dayOfMonth = getDashboardSelectedStartDay()){
  if(granularity === "month"){
    const start = parseDateOnlyString(bucketKey);
    if(!start) return bucketKey;
    if(dayOfMonth === 1){
      return `${start.getFullYear()}/${String(start.getMonth() + 1).padStart(2, "0")}`;
    }
    const end = addDays(getNextDashboardBoundaryDate(start, dayOfMonth), -1);
    return `${formatDateOnlyString(start).replaceAll("-", "/")}〜${formatDateOnlyString(end).replaceAll("-", "/")}`;
  }
  if(granularity === "year"){
    return bucketKey + "年";
  }
  return bucketKey;
}

function getDashboardBucketRangeLabels(bucketKey, granularity, dayOfMonth = getDashboardSelectedStartDay()){
  if(granularity === "month"){
    const start = parseDateOnlyString(bucketKey);
    if(start){
      const end = addDays(getNextDashboardBoundaryDate(start, dayOfMonth), -1);
      return {
        startLabel: formatDateOnlyString(start).replaceAll("-", "/"),
        endLabel: formatDateOnlyString(end).replaceAll("-", "/")
      };
    }
  }
  const label = getDashboardBucketFullLabel(bucketKey, granularity, dayOfMonth);
  return { startLabel: label, endLabel: label };
}

function getDashboardRecordTypeLabel(record){
  return record?.type === "partialHarvest" ? "部分収穫" : "通常収穫";
}

function getDashboardRecordBuildings(record){
  if(record?.type === "partialHarvest"){
    return [...new Set(normalizePartialHarvestTargets(record.targets).map(target => target.building))]
      .filter(building => BUILDINGS.includes(building))
      .sort((a, b) => a - b);
  }

  return [...new Set(getPalletKeysFromRecord(record).map(key => parsePalletKey(String(key || "")).building))]
    .filter(building => BUILDINGS.includes(building))
    .sort((a, b) => a - b);
}

function formatDashboardBuildings(record){
  const buildings = getDashboardRecordBuildings(record);
  return buildings.length ? buildings.map(building => building + "号棟").join(", ") : "-";
}

function getRecordBuildingCaseAllocations(record){
  const weights = {};

  if(record?.type === "partialHarvest"){
    normalizePartialHarvestTargets(record.targets).forEach(target => {
      const span = Math.max(0, target.end - target.start + 1);
      weights[target.building] = (weights[target.building] || 0) + span * target.plantsPerPallet;
    });
  }else{
    (Array.isArray(record?.palletKeys) ? record.palletKeys : []).forEach(key => {
      const parsed = parsePalletKey(String(key || ""));
      if(!BUILDINGS.includes(parsed.building)) return;
      weights[parsed.building] = (weights[parsed.building] || 0) + 1;
    });
  }

  const totalWeight = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if(totalWeight <= 0) return [];

  return Object.entries(weights).map(([building, weight]) => ({
    building: Number(building),
    cases: Number(record?.cases || 0) * (weight / totalWeight)
  }));
}

function getDashboardSummary(recordsInPeriod){
  const harvestCaseTotalsByDate = getHarvestCaseTotalsByDate(recordsInPeriod);
  const totalCases = [...harvestCaseTotalsByDate.values()]
    .reduce((sum, totals) => sum + totals.totalCases, 0);
  const fullRecords = recordsInPeriod.filter(record => record.type !== "partialHarvest");
  const partialRecords = recordsInPeriod.filter(record => record.type === "partialHarvest");
  const lossByDate = new Map();
  fullRecords.forEach(record => {
    const dateKey = String(record?.date || "").trim();
    if(!parseDateOnlyString(dateKey)) return;
    const cases = clampNumber(record.cases, 0, 999999, 0);
    const lossText = String(record.actualLoss ?? "").trim();
    if(lossText === "" || cases <= 0) return;
    const loss = Number(lossText);
    if(!Number.isFinite(loss)) return;
    if(!lossByDate.has(dateKey)) lossByDate.set(dateKey, { weightedLoss: 0, regularCases: 0 });
    const dayLoss = lossByDate.get(dateKey);
    dayLoss.weightedLoss += loss * cases;
    dayLoss.regularCases += cases;
  });
  let lossBase = 0;
  let lossCases = 0;
  lossByDate.forEach((dayLoss, dateKey) => {
    if(dayLoss.regularCases <= 0) return;
    const totalCasesForDate = harvestCaseTotalsByDate.get(dateKey)?.totalCases || dayLoss.regularCases;
    const averageLossForDate = dayLoss.weightedLoss / dayLoss.regularCases;
    lossBase += averageLossForDate * totalCasesForDate;
    lossCases += totalCasesForDate;
  });
  const averageLoss = lossCases > 0 ? lossBase / lossCases : null;
  const qualityMemoCount = fullRecords.filter(record => {
    const text = formatQualityMemo(record.qualityMemo);
    return !!String(text || "").trim();
  }).length;
  const dailyCaseTotals = [...harvestCaseTotalsByDate.values()].map(totals => totals.totalCases);
  const recordDays = dailyCaseTotals.filter(total => total > 100).length;
  const underThresholdRecordDays = dailyCaseTotals.filter(total => total > 0 && total <= 100).length;

  return {
    totalCases,
    totalRecords: recordsInPeriod.length,
    fullRecords: fullRecords.length,
    partialRecords: partialRecords.length,
    averageLoss,
    qualityMemoCount,
    recordDays,
    underThresholdRecordDays
  };
}

function getRecentOneMonthDashboardPeriod(){
  const endInclusive = startOfLocalDay(new Date());
  const endExclusive = addDays(endInclusive, 1);
  const start = addMonthsClamped(endExclusive, -1);
  return {
    start,
    endInclusive,
    endExclusive,
    startLabel: formatDateOnlyString(start),
    endLabel: formatDateOnlyString(endInclusive)
  };
}

function getDashboardRecentMetrics(recordsInPeriod, plantingEventsInPeriod = []){
  const summary = getDashboardSummary(recordsInPeriod);
  const dailyCaseTotals = [...getHarvestCaseTotalsByDate(recordsInPeriod).values()]
    .map(totals => totals.totalCases);
  const harvestDays = dailyCaseTotals.filter(total => total > 0).length;
  const averageCases = harvestDays > 0 ? summary.totalCases / harvestDays : null;
  const seedlingLossValues = plantingEventsInPeriod
    .map(event => String(event.actualSeedlingLossRate ?? "").trim())
    .filter(value => value !== "")
    .map(Number)
    .filter(value => Number.isFinite(value));
  const averageSeedlingLoss = seedlingLossValues.length
    ? seedlingLossValues.reduce((sum, value) => sum + value, 0) / seedlingLossValues.length
    : null;

  return {
    averageCases,
    harvestDays,
    averageLoss: summary.averageLoss,
    averageSeedlingLoss,
    seedlingLossRecordCount: seedlingLossValues.length,
    qualityMemoCount: summary.qualityMemoCount
  };
}

function formatDashboardMetricNumber(value, suffix = ""){
  return value === null ? "--" : (Math.round(value * 10) / 10).toFixed(1) + suffix;
}

function buildDashboardMetricsMarkup(recordsInPeriod, plantingEventsInPeriod = []){
  const metrics = getDashboardRecentMetrics(recordsInPeriod, plantingEventsInPeriod);
  return `
    <div class="dashboardMetricCard">
      <div class="dashboardMetricLabel">平均収穫ケース数</div>
      <div class="dashboardMetricValue">${formatDashboardMetricNumber(metrics.averageCases)}</div>
    </div>
    <div class="dashboardMetricCard">
      <div class="dashboardMetricLabel">平均収穫ロス率</div>
      <div class="dashboardMetricValue">${formatDashboardMetricNumber(metrics.averageLoss, "%")}</div>
    </div>
    <div class="dashboardMetricCard">
      <div class="dashboardMetricLabel">平均苗ロス率</div>
      <div class="dashboardMetricValue">${formatDashboardMetricNumber(metrics.averageSeedlingLoss, "%")}</div>
    </div>
    <div class="dashboardMetricCard">
      <div class="dashboardMetricLabel">品質メモ数</div>
      <div class="dashboardMetricValue">${metrics.qualityMemoCount}</div>
    </div>
  `;
}

function renderDashboardMetrics(){
  const box = document.getElementById("dashboardMetrics");
  const recentPeriod = getRecentOneMonthDashboardPeriod();
  if(!box) return recentPeriod;
  const recentRecords = getDashboardRecordsForPeriod(recentPeriod);
  const recentPlantingEvents = getDashboardPlantingEventsForPeriod(recentPeriod);
  box.innerHTML = buildDashboardMetricsMarkup(recentRecords, recentPlantingEvents);
  return recentPeriod;
}

function getDashboardHistoryPeriods(period = getDashboardPeriod()){
  const allRecordDates = records
    .map(record => parseDateOnlyString(record.date))
    .filter(date => !!date)
    .sort((a, b) => a.getTime() - b.getTime());
  if(!allRecordDates.length) return [];

  const earliestRecordDate = startOfLocalDay(allRecordDates[0]);
  const periods = [];
  let endExclusive = new Date(period.start);

  while(endExclusive.getTime() > earliestRecordDate.getTime()){
    const start = addMonthsClamped(endExclusive, -1);
    const endInclusive = addDays(endExclusive, -1);
    periods.push({
      start,
      endInclusive,
      endExclusive,
      startLabel: formatDateOnlyString(start),
      endLabel: formatDateOnlyString(endInclusive),
      key: formatDateOnlyString(start)
    });
    endExclusive = start;
  }

  return periods;
}

function setDashboardHistoryPeriod(startLabel){
  dashboardFilter.historyPeriodStart = String(startLabel || "").trim();
  saveDashboardFilter();
  renderDashboard();
}

function renderDashboardHistory(period){
  const container = document.getElementById("dashboardHistoryContent");
  const details = document.getElementById("dashboardHistoryDetails");
  if(!container || !details) return;

  const historyPeriods = getDashboardHistoryPeriods(period);
  if(!historyPeriods.length){
    details.open = false;
    container.innerHTML = `<div class="dashboardHistoryEmpty">過去1か月単位で表示できる集計履歴はまだありません。</div>`;
    return;
  }

  const selectedKey = historyPeriods.some(item => item.key === dashboardFilter.historyPeriodStart)
    ? dashboardFilter.historyPeriodStart
    : historyPeriods[0].key;
  if(dashboardFilter.historyPeriodStart !== selectedKey){
    dashboardFilter.historyPeriodStart = selectedKey;
    saveDashboardFilter();
  }

  const selectedPeriod = historyPeriods.find(item => item.key === selectedKey) || historyPeriods[0];
  const selectedRecords = getDashboardRecordsForPeriod(selectedPeriod);
  const selectedPlantingEvents = getDashboardPlantingEventsForPeriod(selectedPeriod);
  container.innerHTML = `
    <details class="dashboardHistoryPicker">
      <summary class="dashboardHistoryPickerSummary">${escapeHtml(selectedPeriod.startLabel)} 〜 ${escapeHtml(selectedPeriod.endLabel)}</summary>
      <div class="dashboardHistoryList">
        ${historyPeriods.map(item => `
          <button
            type="button"
            class="dashboardHistoryBtn ${item.key === selectedPeriod.key ? "active" : ""}"
            data-dashboard-history-start="${escapeHtml(item.key)}"
          >${escapeHtml(item.startLabel)} 〜 ${escapeHtml(item.endLabel)}</button>
        `).join("")}
      </div>
    </details>
    <div class="dashboardHistorySummary">
      <div class="dashboardHistorySummaryTitle">${escapeHtml(selectedPeriod.startLabel)} 〜 ${escapeHtml(selectedPeriod.endLabel)}</div>
      <div class="dashboardHistorySummarySub">基準日 ${period.dayOfMonth}日をもとに切った1か月分の集計です。</div>
      <div class="dashboardCardGrid" style="margin-top:10px;">${buildDashboardMetricsMarkup(selectedRecords, selectedPlantingEvents)}</div>
    </div>
  `;

  container.querySelectorAll("[data-dashboard-history-start]").forEach(button => {
    button.addEventListener("click", () => {
      setDashboardHistoryPeriod(button.dataset.dashboardHistoryStart || "");
    });
  });
}

function buildDashboardCasesSeries(recordsInPeriod, period, granularity){
  const totals = {};
  const dailyTotalsByBucket = {};
  const dayOfMonth = clampNumber(period?.dayOfMonth, 1, 31, getDashboardSelectedStartDay());
  getHarvestCaseTotalsByDate(recordsInPeriod).forEach((caseTotals, dateKey) => {
    const recordDate = parseDateOnlyString(dateKey);
    if(!recordDate) return;
    const key = getDashboardBucketKey(recordDate, granularity, dayOfMonth);
    const cases = clampNumber(caseTotals.totalCases, 0, 999999, 0);
    totals[key] = (totals[key] || 0) + cases;
    if(!dailyTotalsByBucket[key]) dailyTotalsByBucket[key] = {};
    dailyTotalsByBucket[key][dateKey] = cases;
  });

  return Object.keys(totals)
    .sort()
    .map(key => {
      const dailyTotals = Object.values(dailyTotalsByBucket[key] || {});
      const range = getDashboardBucketRangeLabels(key, granularity, dayOfMonth);
      return {
        key,
        label: getDashboardBucketLabel(key, granularity, dayOfMonth),
        fullLabel: getDashboardBucketFullLabel(key, granularity, dayOfMonth),
        rangeStartLabel: range.startLabel,
        rangeEndLabel: range.endLabel,
        value: totals[key],
        harvestDays: dailyTotals.filter(total => total > 100).length,
        underThresholdHarvestDays: dailyTotals.filter(total => total > 0 && total <= 100).length
      };
    });
}

function buildDashboardLossSeries(recordsInPeriod, period, granularity){
  const totals = {};
  const casesByBucket = {};
  const dayOfMonth = clampNumber(period?.dayOfMonth, 1, 31, getDashboardSelectedStartDay());
  const harvestCaseTotalsByDate = getHarvestCaseTotalsByDate(recordsInPeriod);
  const lossByDate = new Map();

  recordsInPeriod.forEach(record => {
    if(record.type === "partialHarvest") return;
    const lossText = String(record.actualLoss ?? "").trim();
    if(lossText === "") return;
    const loss = Number(lossText);
    const cases = clampNumber(record.cases, 0, 999999, 0);
    if(!Number.isFinite(loss) || cases <= 0) return;
    const dateKey = String(record.date || "").trim();
    if(!parseDateOnlyString(dateKey)) return;
    if(!lossByDate.has(dateKey)) lossByDate.set(dateKey, { weightedLoss: 0, regularCases: 0 });
    const dayLoss = lossByDate.get(dateKey);
    dayLoss.weightedLoss += loss * cases;
    dayLoss.regularCases += cases;
  });

  lossByDate.forEach((dayLoss, dateKey) => {
    if(dayLoss.regularCases <= 0) return;
    const recordDate = parseDateOnlyString(dateKey);
    if(!recordDate) return;
    const key = getDashboardBucketKey(recordDate, granularity, dayOfMonth);
    const totalCasesForDate = harvestCaseTotalsByDate.get(dateKey)?.totalCases || dayLoss.regularCases;
    const averageLossForDate = dayLoss.weightedLoss / dayLoss.regularCases;
    totals[key] = (totals[key] || 0) + averageLossForDate * totalCasesForDate;
    casesByBucket[key] = (casesByBucket[key] || 0) + totalCasesForDate;
  });

  return Object.keys(casesByBucket)
    .sort()
    .map(key => {
      const range = getDashboardBucketRangeLabels(key, granularity, dayOfMonth);
      return {
        key,
        label: getDashboardBucketLabel(key, granularity, dayOfMonth),
        fullLabel: getDashboardBucketFullLabel(key, granularity, dayOfMonth),
        rangeStartLabel: range.startLabel,
        rangeEndLabel: range.endLabel,
        value: casesByBucket[key] > 0 ? totals[key] / casesByBucket[key] : null
      };
    });
}

function buildDashboardSeedlingLossSeries(plantingEventsInPeriod, period, granularity){
  const totals = {};
  const countsByBucket = {};
  const dayOfMonth = clampNumber(period?.dayOfMonth, 1, 31, getDashboardSelectedStartDay());

  plantingEventsInPeriod.forEach(event => {
    const rawLoss = String(event.actualSeedlingLossRate ?? "").trim();
    if(rawLoss === "") return;
    const loss = Number(rawLoss);
    if(!Number.isFinite(loss)) return;
    const plantingDate = parseDateOnlyString(event.plantingDate);
    if(!plantingDate) return;
    const key = getDashboardBucketKey(plantingDate, granularity, dayOfMonth);
    totals[key] = (totals[key] || 0) + loss;
    countsByBucket[key] = (countsByBucket[key] || 0) + 1;
  });

  return Object.keys(countsByBucket)
    .sort()
    .map(key => {
      const range = getDashboardBucketRangeLabels(key, granularity, dayOfMonth);
      return {
        key,
        label: getDashboardBucketLabel(key, granularity, dayOfMonth),
        fullLabel: getDashboardBucketFullLabel(key, granularity, dayOfMonth),
        rangeStartLabel: range.startLabel,
        rangeEndLabel: range.endLabel,
        value: countsByBucket[key] > 0 ? totals[key] / countsByBucket[key] : null
      };
    });
}

function buildDashboardLossComparisonSeries(recordsInPeriod, plantingEventsInPeriod, period, granularity){
  const dayOfMonth = clampNumber(period?.dayOfMonth, 1, 31, getDashboardSelectedStartDay());
  const harvestLossSeries = buildDashboardLossSeries(recordsInPeriod, period, granularity);
  const seedlingLossSeries = buildDashboardSeedlingLossSeries(plantingEventsInPeriod, period, granularity);
  const seriesByName = [
    { name: "平均収穫ロス率", color: "#ef4444", source: harvestLossSeries },
    { name: "平均苗ロス率", color: "#2563eb", source: seedlingLossSeries }
  ];
  const keys = [...new Set(seriesByName.flatMap(series => series.source.map(point => point.key)))].sort();

  return seriesByName.map(series => {
    const pointMap = new Map(series.source.map(point => [point.key, point]));
    return {
      name: series.name,
      color: series.color,
      points: keys.map(key => {
        if(pointMap.has(key)) return pointMap.get(key);
        const range = getDashboardBucketRangeLabels(key, granularity, dayOfMonth);
        return {
          key,
          label: getDashboardBucketLabel(key, granularity, dayOfMonth),
          fullLabel: getDashboardBucketFullLabel(key, granularity, dayOfMonth),
          rangeStartLabel: range.startLabel,
          rangeEndLabel: range.endLabel,
          value: null
        };
      })
    };
  });
}

function renderDashboardEmpty(containerId, message){
  const container = document.getElementById(containerId);
  if(!container) return;
  container.innerHTML = `<div class="dashboardEmpty">${escapeHtml(message)}</div>`;
}

function renderDashboardLineChart(containerId, series, options = {}){
  const container = document.getElementById(containerId);
  if(!container) return;

  const validPoints = series.filter(point => Number.isFinite(point.value));
  if(!validPoints.length){
    renderDashboardEmpty(containerId, options.emptyMessage || "この期間のデータがありません。");
    return;
  }

  const minWidth = 640;
  const width = Math.max(minWidth, 84 + Math.max(series.length - 1, 0) * 54);
  const height = 240;
  const padding = { top: 18, right: 12, bottom: 28, left: 40 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...validPoints.map(point => Number(point.value)), 1);
  const roundedMax = options.roundMaxToStep
    ? Math.max(options.roundMaxToStep, Math.ceil(maxValue / options.roundMaxToStep) * options.roundMaxToStep)
    : maxValue;
  const yMax = options.suggestedMax ? Math.max(roundedMax, options.suggestedMax) : roundedMax;
  const xStep = series.length > 1 ? innerWidth / (series.length - 1) : innerWidth / 2;
  const yTicks = 4;

  const points = series.map((point, index) => {
    if(!Number.isFinite(point.value)) return null;
    const x = padding.left + (series.length > 1 ? xStep * index : innerWidth / 2);
    const y = padding.top + innerHeight - (Number(point.value) / yMax) * innerHeight;
    return `${x},${y}`;
  }).filter(Boolean).join(" ");

  const tickLines = Array.from({ length: yTicks + 1 }, (_, index) => {
    const value = yMax * (index / yTicks);
    const y = padding.top + innerHeight - (value / yMax) * innerHeight;
    const label = options.formatValue ? options.formatValue(value, true) : String(Math.round(value));
    return `
      <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#e5e7eb" stroke-width="1" />
      <text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#64748b">${escapeHtml(label)}</text>
    `;
  }).join("");

  const xLabelIndexes = series.length <= 3
    ? series.map((_, index) => index)
    : [...new Set([0, Math.floor((series.length - 1) / 2), series.length - 1])];
  const xLabels = xLabelIndexes.map(index => {
    const x = padding.left + (series.length > 1 ? xStep * index : innerWidth / 2);
    return `<text x="${x}" y="${height - 8}" text-anchor="middle" font-size="11" fill="#64748b">${escapeHtml(series[index].label)}</text>`;
  }).join("");

  const pointDots = series.map((point, index) => {
    if(!Number.isFinite(point.value)) return "";
    const x = padding.left + (series.length > 1 ? xStep * index : innerWidth / 2);
    const y = padding.top + innerHeight - (Number(point.value) / yMax) * innerHeight;
    const title = `${point.fullLabel} ${options.tooltipLabel || ""}${options.formatValue ? options.formatValue(point.value) : point.value}`;
    return `<circle cx="${x}" cy="${y}" r="3.5" fill="${options.color || "#2563eb"}"><title>${escapeHtml(title)}</title></circle>`;
  }).join("");

  container.innerHTML = `
    <div class="dashboardChartScroll">
      <svg class="dashboardChartSvg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(options.ariaLabel || "")}">
        ${tickLines}
        <line x1="${padding.left}" y1="${padding.top + innerHeight}" x2="${width - padding.right}" y2="${padding.top + innerHeight}" stroke="#cbd5e1" stroke-width="1.2" />
        <polyline fill="none" stroke="${options.color || "#2563eb"}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${points}" />
        ${pointDots}
        ${xLabels}
      </svg>
    </div>
  `;
}

function renderDashboardMultiLineChart(containerId, seriesList, options = {}){
  const container = document.getElementById(containerId);
  if(!container) return;

  const allPoints = seriesList.flatMap(series => series.points || []);
  const validPoints = allPoints.filter(point => Number.isFinite(point.value));
  if(!validPoints.length){
    renderDashboardEmpty(containerId, options.emptyMessage || "この期間のデータがありません。");
    return;
  }

  const axisPoints = seriesList.find(series => Array.isArray(series.points) && series.points.length)?.points || [];
  const minWidth = 640;
  const width = Math.max(minWidth, 84 + Math.max(axisPoints.length - 1, 0) * 54);
  const height = 240;
  const padding = { top: 18, right: 12, bottom: 28, left: 40 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...validPoints.map(point => Number(point.value)), 1);
  const roundedMax = options.roundMaxToStep
    ? Math.max(options.roundMaxToStep, Math.ceil(maxValue / options.roundMaxToStep) * options.roundMaxToStep)
    : maxValue;
  const yMax = options.suggestedMax ? Math.max(roundedMax, options.suggestedMax) : roundedMax;
  const xStep = axisPoints.length > 1 ? innerWidth / (axisPoints.length - 1) : innerWidth / 2;
  const yTicks = 4;

  const tickLines = Array.from({ length: yTicks + 1 }, (_, index) => {
    const value = yMax * (index / yTicks);
    const y = padding.top + innerHeight - (value / yMax) * innerHeight;
    const label = options.formatValue ? options.formatValue(value, true) : String(Math.round(value));
    return `
      <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#e5e7eb" stroke-width="1" />
      <text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#64748b">${escapeHtml(label)}</text>
    `;
  }).join("");

  const xLabelIndexes = axisPoints.length <= 3
    ? axisPoints.map((_, index) => index)
    : [...new Set([0, Math.floor((axisPoints.length - 1) / 2), axisPoints.length - 1])];
  const xLabels = xLabelIndexes.map(index => {
    const x = padding.left + (axisPoints.length > 1 ? xStep * index : innerWidth / 2);
    return `<text x="${x}" y="${height - 8}" text-anchor="middle" font-size="11" fill="#64748b">${escapeHtml(axisPoints[index].label)}</text>`;
  }).join("");

  const lineMarkup = seriesList.map(series => {
    const color = series.color || "#2563eb";
    const points = (series.points || []).map((point, index) => {
      if(!Number.isFinite(point.value)) return null;
      const x = padding.left + (axisPoints.length > 1 ? xStep * index : innerWidth / 2);
      const y = padding.top + innerHeight - (Number(point.value) / yMax) * innerHeight;
      return { point, x, y };
    }).filter(Boolean);
    const polylinePoints = points.map(item => `${item.x},${item.y}`).join(" ");
    const dots = points.map(item => {
      const title = `${item.point.fullLabel} ${series.name} ${options.formatValue ? options.formatValue(item.point.value) : item.point.value}`;
      return `<circle cx="${item.x}" cy="${item.y}" r="3.5" fill="${color}"><title>${escapeHtml(title)}</title></circle>`;
    }).join("");
    return `
      <polyline fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${polylinePoints}" />
      ${dots}
    `;
  }).join("");

  const legend = seriesList.map(series => `
    <span class="dashboardChartLegendItem">
      <span class="dashboardChartLegendSwatch" style="background:${series.color || "#2563eb"}"></span>
      ${escapeHtml(series.name)}
    </span>
  `).join("");

  container.innerHTML = `
    <div class="dashboardChartLegend">${legend}</div>
    <div class="dashboardChartScroll">
      <svg class="dashboardChartSvg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(options.ariaLabel || "")}">
        ${tickLines}
        <line x1="${padding.left}" y1="${padding.top + innerHeight}" x2="${width - padding.right}" y2="${padding.top + innerHeight}" stroke="#cbd5e1" stroke-width="1.2" />
        ${lineMarkup}
        ${xLabels}
      </svg>
    </div>
  `;
}

function renderDashboardBarChart(containerId, series, options = {}){
  const container = document.getElementById(containerId);
  if(!container) return;

  const validSeries = series.filter(item => Number.isFinite(item.value) && item.value > 0);
  if(!validSeries.length){
    renderDashboardEmpty(containerId, options.emptyMessage || "この期間のデータがありません。");
    return;
  }

  const fitContainer = !!options.fitContainer;
  const minWidth = fitContainer ? 360 : 640;
  const width = Math.max(minWidth, 96 + series.length * (fitContainer ? 64 : 78));
  const height = 250;
  const padding = { top: 18, right: 12, bottom: 36, left: 40 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...series.map(item => Number(item.value) || 0), 1);
  const barWidth = innerWidth / Math.max(series.length, 1) * 0.58;
  const gap = innerWidth / Math.max(series.length, 1);

  const tickLines = Array.from({ length: 5 }, (_, index) => {
    const value = maxValue * (index / 4);
    const y = padding.top + innerHeight - (value / maxValue) * innerHeight;
    return `
      <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#e5e7eb" stroke-width="1" />
      <text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#64748b">${escapeHtml((options.formatValue ? options.formatValue(value, true) : Math.round(value)).toString())}</text>
    `;
  }).join("");

  const bars = series.map((item, index) => {
    const barHeight = maxValue > 0 ? (Number(item.value) / maxValue) * innerHeight : 0;
    const x = padding.left + gap * index + (gap - barWidth) / 2;
    const y = padding.top + innerHeight - barHeight;
    return `
      <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="8" fill="${options.color || "#16a34a"}">
        <title>${escapeHtml(item.label + " " + (options.formatValue ? options.formatValue(item.value) : item.value))}</title>
      </rect>
      <text x="${x + barWidth / 2}" y="${height - 10}" text-anchor="middle" font-size="11" fill="#64748b">${escapeHtml(item.label)}</text>
      <text x="${x + barWidth / 2}" y="${y - 6}" text-anchor="middle" font-size="11" fill="#0f172a">${escapeHtml((options.formatValue ? options.formatValue(item.value, true) : item.value).toString())}</text>
    `;
  }).join("");

  container.innerHTML = `
    <div class="dashboardChartScroll${fitContainer ? " dashboardChartScrollFit" : ""}">
      <svg class="dashboardChartSvg${fitContainer ? " dashboardChartSvgFit" : ""}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(options.ariaLabel || "")}">
        ${tickLines}
        <line x1="${padding.left}" y1="${padding.top + innerHeight}" x2="${width - padding.right}" y2="${padding.top + innerHeight}" stroke="#cbd5e1" stroke-width="1.2" />
        ${bars}
      </svg>
    </div>
	  `;
	}

function formatDashboardHarvestDayText(harvestDays, underThresholdHarvestDays){
  const mainDays = clampNumber(harvestDays, 0, 999999, 0);
  const subDays = clampNumber(underThresholdHarvestDays, 0, 999999, 0);
  return `${mainDays}日${subDays > 0 ? `（${subDays}日）` : ""}`;
}

function formatDashboardCasesPerHarvestDay(item){
  const cases = clampNumber(item?.value, 0, 999999, 0);
  const harvestDays = clampNumber(item?.harvestDays, 0, 999999, 0);
  if(harvestDays <= 0) return "-";
  return String(Math.round((cases / harvestDays) * 10) / 10);
}

function renderDashboardCasesChartTable(series, options = {}){
  const container = document.getElementById(options.containerId || "dashboardCasesChartTable");
  if(!container) return;
  if(!Array.isArray(series) || !series.length){
    container.innerHTML = "";
    return;
  }
  const orderedSeries = [...series].sort((a, b) => (
    String(b?.key || b?.fullLabel || b?.label || "")
      .localeCompare(String(a?.key || a?.fullLabel || a?.label || ""), "ja")
  ));
  const wrapClass = options.verticalScroll
    ? "dashboardTableWrap dashboardCasesTableWrap dashboardCasesAllTableWrap"
    : "dashboardTableWrap dashboardCasesTableWrap";

  container.innerHTML = `
    <div class="${wrapClass}" style="margin-top:10px;">
      <table class="dashboardTable dashboardCasesTable">
        <thead>
          <tr>
            <th>期間</th>
            <th>A/B</th>
            <th>A.ケース数</th>
            <th>B.収穫日数</th>
          </tr>
        </thead>
        <tbody>
          ${orderedSeries.map(item => `
            <tr>
              <td><div class="dashboardCasesPeriodScroll">${escapeHtml(item.fullLabel || item.label || "-")}</div></td>
              <td>${escapeHtml(formatDashboardCasesPerHarvestDay(item))}</td>
              <td>${escapeHtml(String(Math.round(clampNumber(item.value, 0, 999999, 0) * 10) / 10))}</td>
              <td>${escapeHtml(formatDashboardHarvestDayText(item.harvestDays, item.underThresholdHarvestDays))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    <div class="smallText" style="margin-top:6px;">※A/Bは（）内の日を含まない1日あたりのケース数です。B.収穫日数の（）内は100ケース以内の日です。</div>
  `;
}

function getDashboardCasesSeriesRangeText(series){
  if(!Array.isArray(series) || !series.length) return "データなし";
  const first = String(series[0]?.rangeStartLabel || series[0]?.fullLabel || series[0]?.label || "-");
  const last = String(series[series.length - 1]?.rangeEndLabel || series[series.length - 1]?.fullLabel || series[series.length - 1]?.label || "-");
  return first === last ? first : `${first} 〜 ${last}`;
}

function renderDashboardCasesAllWindow(){
  const granularity = ["month", "year"].includes(dashboardFilter.casesGranularity)
    ? dashboardFilter.casesGranularity
    : "month";
  const dayOfMonth = getDashboardSelectedStartDay();
  const allSeries = buildDashboardCasesSeries(records, { dayOfMonth }, granularity);
  const note = document.getElementById("dashboardCasesAllChartNote");
  if(note){
    note.textContent = `${getDashboardGranularityLabel(granularity)}別 / 基準日 ${dayOfMonth}日 / ${getDashboardCasesSeriesRangeText(allSeries)} / 全${allSeries.length}件`;
  }
  renderDashboardBarChart("dashboardCasesAllChart", allSeries, {
    color: "#16a34a",
    ariaLabel: "収穫ケース数の全件グラフ",
    formatValue: (value, axisOnly = false) => `${axisOnly ? Math.round(value) : Math.round(value * 10) / 10}`
  });
  renderDashboardCasesChartTable(allSeries, {
    containerId: "dashboardCasesAllTable",
    verticalScroll: true
  });
  requestAnimationFrame(() => {
    const chartScroll = document.querySelector("#dashboardCasesAllChart .dashboardChartScroll");
    if(chartScroll) chartScroll.scrollLeft = chartScroll.scrollWidth;
  });
}

function formatDashboardRecordDayDate(dateString){
  const date = parseDateOnlyString(dateString);
  if(!date) return String(dateString || "日付なし");
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}（${weekdays[date.getDay()]}）`;
}

function getDashboardDayHarvestLossText(harvestItems){
  const lossRecords = (Array.isArray(harvestItems) ? harvestItems : [])
    .map(item => item?.value || item)
    .filter(record => record?.type !== "partialHarvest")
    .map(record => ({
      loss: getFiniteNumberInRange(record?.actualLoss, 0, 100),
      cases: clampNumber(record?.cases, 0, 999999, 0)
    }))
    .filter(item => item.loss !== null);
  if(!lossRecords.length) return "-";
  const totalCases = lossRecords.reduce((sum, item) => sum + item.cases, 0);
  const averageLoss = totalCases > 0
    ? lossRecords.reduce((sum, item) => sum + item.loss * item.cases, 0) / totalCases
    : lossRecords.reduce((sum, item) => sum + item.loss, 0) / lossRecords.length;
  return `${Math.round(averageLoss * 10) / 10}%`;
}

function getHarvestRecordPlantingDetailText(record){
  if(!record || record.type === "partialHarvest") return "-";
  const relatedEvents = getPlantingEventsForHarvest(record.id);
  const plantingLines = groupPlantingEventsByDate(relatedEvents).map(group => {
    const metrics = getPlantingEventGroupListMetrics(group.events);
    const palletKeys = [...new Set(group.events.flatMap(event => {
      const allocation = event.sourceAllocations.find(item => (
        Number(item.harvestRecordId) === Number(record.id)
      ));
      return allocation?.palletKeys || [];
    }))].sort((a, b) => getOrderIndexFromKey(a) - getOrderIndexFromKey(b));
    const locationText = formatPalletSummary(palletKeys) || "場所情報なし";
    return `${group.plantingDate || "日付なし"}\n${locationText}\n苗枚数: ${metrics.seedlingTrayText} / 苗ロス率: ${metrics.lossRateText}`;
  });
  if(!plantingLines.length) plantingLines.push("苗植え記録なし");
  plantingLines.push(`未定植: ${getUnplantedPalletKeysForHarvest(record.id).length}枚`);
  return plantingLines.join("\n\n");
}

function groupDashboardRecordItemsByDate(items){
  const groups = new Map();
  (Array.isArray(items) ? items : []).forEach(item => {
    const dateKey = String(item?.date || "");
    if(!groups.has(dateKey)) groups.set(dateKey, { date: dateKey, items: [] });
    groups.get(dateKey).items.push(item);
  });
  return [...groups.values()];
}

function getDashboardRecordCalendarDayMetrics(group){
  const harvestItems = group.items.filter(item => item?.kind === "harvest");
  const caseTotal = harvestItems.reduce((sum, item) => (
    sum + clampNumber(item.value?.cases, 0, 999999, 0)
  ), 0);
  const lossText = getDashboardDayHarvestLossText(harvestItems);
  return { caseTotal, lossText };
}

function renderDashboardRecordCalendar(itemsInPeriod, options = {}){
  const container = document.getElementById("dashboardRecordTable");
  if(!container) return;
  const dayGroups = groupDashboardRecordItemsByDate(itemsInPeriod);
  const period = options.period || getDashboardRecordCalendarPeriod();
  const groupsByDate = new Map(dayGroups.map(group => [group.date, group]));
  const hasKeyword = !!String(options.keyword || "").trim();
  const recordType = normalizeDashboardRecordTypeFilter(options.recordType);
  const typeSummary = recordType === "all" ? "" : ` / ${getDashboardRecordTypeFilterLabel(recordType)}`;
  const countSummary = `${dayGroups.length}日`;
  const dateFilterSummary = options.dateFilterPeriod?.isCustom
    ? ` / ${options.dateFilterPeriod.startLabel} 〜 ${options.dateFilterPeriod.endLabel}`
    : "";
  const summaryText = `${countSummary} / ${period.year}年${period.month}月${typeSummary}${dateFilterSummary}${hasKeyword ? ` / 検索: ${options.keyword}` : ""}`;
  const todayKey = formatDateOnlyString(new Date());
  const firstWeekday = period.start.getDay();
  const daysInMonth = period.endInclusive.getDate();
  const totalCellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const dayCells = Array.from({ length: totalCellCount }, (_, index) => {
    const dayNumber = index - firstWeekday + 1;
    if(dayNumber < 1 || dayNumber > daysInMonth){
      return `<div class="dashboardRecordCalendarDay is-outside" aria-hidden="true"></div>`;
    }
    const date = new Date(period.year, period.month - 1, dayNumber);
    const dateKey = formatDateOnlyString(date);
    const group = groupsByDate.get(dateKey) || null;
    const weekday = date.getDay();
    const stateClasses = [
      weekday === 0 ? "is-sunday" : "",
      weekday === 6 ? "is-saturday" : "",
      dateKey === todayKey ? "is-today" : "",
      group ? "has-records" : ""
    ].filter(Boolean).join(" ");
    if(!group){
      return `
        <div class="dashboardRecordCalendarDay ${stateClasses}" data-dashboard-calendar-date="${dateKey}">
          <time class="dashboardRecordCalendarDateNumber" datetime="${dateKey}">${dayNumber}</time>
        </div>
      `;
    }
    const metrics = getDashboardRecordCalendarDayMetrics(group);
    const lossIsHigh = Number.parseFloat(metrics.lossText) >= 15;
    return `
      <button type="button" class="dashboardRecordCalendarDay ${stateClasses}"
        data-dashboard-calendar-date="${dateKey}" data-dashboard-record-date="${dateKey}"
        data-ui-click="openDashboardDayRecordDetail" data-ui-arg="${dateKey}"
        aria-label="${escapeHtml(`${formatDashboardRecordDayDate(dateKey)}、${metrics.caseTotal}ケース、ロス率${metrics.lossText}、詳細を開く`)}">
        <time class="dashboardRecordCalendarDateNumber" datetime="${dateKey}">${dayNumber}</time>
        <span class="dashboardRecordCalendarCases">${metrics.caseTotal}</span>
        <span class="dashboardRecordCalendarLoss${lossIsHigh ? " dashboardLossHigh" : ""}">${escapeHtml(metrics.lossText)}</span>
      </button>
    `;
  }).join("");

  container.dataset.loadedMonth = period.monthKey;
  container.innerHTML = `
    <div class="dashboardTableSummary" role="status">${escapeHtml(summaryText)}</div>
    <div class="dashboardRecordCalendarWeekdays" aria-hidden="true">
      ${["日", "月", "火", "水", "木", "金", "土"].map((label, index) => `<span class="${index === 0 ? "is-sunday" : (index === 6 ? "is-saturday" : "")}">${label}</span>`).join("")}
    </div>
    <div class="dashboardRecordCalendarGrid">${dayCells}</div>
  `;
}

function getDashboardForecastDateColor(daysAfter){
  if(!Number.isFinite(daysAfter)) return DASHBOARD_FORECAST_EMPTY_COLOR;
  const dayIndex = Math.max(0, Math.floor(daysAfter));
  return dayIndex < DASHBOARD_FORECAST_DAY_COLORS.length
    ? DASHBOARD_FORECAST_DAY_COLORS[dayIndex]
    : DASHBOARD_FORECAST_LATER_COLOR;
}

function formatDashboardForecastDate(date){
  if(!(date instanceof Date) || Number.isNaN(date.getTime())) return "--";
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return `${date.getMonth() + 1}/${date.getDate()}(${weekdays[date.getDay()]})`;
}

function formatDashboardForecastDelay(daysAfter){
  if(!Number.isFinite(daysAfter)) return "";
  return daysAfter === 0 ? "今日" : `${daysAfter}日後`;
}

function getNextDashboardHarvestDate(date){
  let cursor = addDays(date, 1);
  while(!HARVEST_FORECAST_WEEKDAYS.includes(cursor.getDay())){
    cursor = addDays(cursor, 1);
  }
  return cursor;
}

function getFirstDashboardHarvestDate(referenceDate = new Date()){
  let cursor = startOfLocalDay(referenceDate);
  while(!HARVEST_FORECAST_WEEKDAYS.includes(cursor.getDay())){
    cursor = addDays(cursor, 1);
  }
  return cursor;
}

function formatDashboardHarvestForecastInputValue(value){
  if(!Number.isFinite(value)) return "";
  return String(Math.round(value * 10) / 10);
}

function parseDashboardHarvestForecastCasesValue(value){
  const text = String(value ?? "").trim();
  if(!text) return null;
  const number = Number(text);
  return Number.isFinite(number) && number > 0 && number <= RECORD_MAX_CASES
    ? number
    : null;
}

function parseDashboardHarvestForecastLossValue(value){
  const text = String(value ?? "").trim();
  if(!text) return null;
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 && number <= 100
    ? number
    : null;
}

function handleDashboardHarvestForecastInput(kind){
  if(kind === "cases"){
    dashboardHarvestForecastCasesDraftValue = document.getElementById("dashboardForecastCasesInput")?.value ?? "";
  }else if(kind === "loss"){
    dashboardHarvestForecastLossDraftValue = document.getElementById("dashboardForecastLossInput")?.value ?? "";
  }else{
    return;
  }
  const model = dashboardHarvestForecastModelCache || buildDashboardHarvestForecastModel();
  syncDashboardHarvestForecastInputs(model);
}

function resetDashboardHarvestForecastInputs(){
  dashboardHarvestForecastCasesDraftValue = null;
  dashboardHarvestForecastLossDraftValue = null;
  const model = dashboardHarvestForecastModelCache || buildDashboardHarvestForecastModel();
  syncDashboardHarvestForecastInputs(model);
}

function applyDashboardHarvestForecastInputs(){
  const currentModel = dashboardHarvestForecastModelCache || buildDashboardHarvestForecastModel();
  const forecastCases = dashboardHarvestForecastCasesDraftValue === null
    ? currentModel.averageCases
    : parseDashboardHarvestForecastCasesValue(dashboardHarvestForecastCasesDraftValue);
  const forecastLoss = dashboardHarvestForecastLossDraftValue === null
    ? currentModel.averageLoss
    : parseDashboardHarvestForecastLossValue(dashboardHarvestForecastLossDraftValue);
  if(forecastCases === null || forecastLoss === null || forecastLoss >= 100){
    syncDashboardHarvestForecastInputs(currentModel);
    return;
  }

  dashboardHarvestForecastCasesValue = dashboardHarvestForecastCasesDraftValue;
  dashboardHarvestForecastLossValue = dashboardHarvestForecastLossDraftValue;
  dashboardHarvestForecastInputsDirty = false;
  dashboardHarvestForecastModelCache = null;
  renderDashboardHarvestForecast();
}

function syncDashboardHarvestForecastInputs(model){
  const casesInput = document.getElementById("dashboardForecastCasesInput");
  const lossInput = document.getElementById("dashboardForecastLossInput");
  const casesWrap = document.getElementById("dashboardForecastCasesInputWrap");
  const lossWrap = document.getElementById("dashboardForecastLossInputWrap");
  const averageButton = document.getElementById("dashboardForecastAverageBtn");
  const applyButton = document.getElementById("dashboardForecastApplyBtn");
  const casesText = dashboardHarvestForecastCasesDraftValue === null
    ? formatDashboardHarvestForecastInputValue(model.averageCases)
    : dashboardHarvestForecastCasesDraftValue;
  const lossText = dashboardHarvestForecastLossDraftValue === null
    ? formatDashboardHarvestForecastInputValue(model.averageLoss)
    : dashboardHarvestForecastLossDraftValue;

  if(casesInput && casesInput.value !== casesText) casesInput.value = casesText;
  if(lossInput && lossInput.value !== lossText) lossInput.value = lossText;
  const draftForecastCases = dashboardHarvestForecastCasesDraftValue === null
    ? model.averageCases
    : parseDashboardHarvestForecastCasesValue(dashboardHarvestForecastCasesDraftValue);
  const draftForecastLoss = dashboardHarvestForecastLossDraftValue === null
    ? model.averageLoss
    : parseDashboardHarvestForecastLossValue(dashboardHarvestForecastLossDraftValue);
  const casesInvalid = draftForecastCases === null;
  const lossInvalid = draftForecastLoss === null || draftForecastLoss >= 100;
  const valuesMatchCurrentForecast = Number.isFinite(draftForecastCases)
    && Number.isFinite(draftForecastLoss)
    && Number.isFinite(model.forecastCases)
    && Number.isFinite(model.forecastLoss)
    && Math.abs(draftForecastCases - model.forecastCases) < 0.000001
    && Math.abs(draftForecastLoss - model.forecastLoss) < 0.000001;
  dashboardHarvestForecastInputsDirty = !valuesMatchCurrentForecast;
  casesWrap?.classList.toggle("autoValue", dashboardHarvestForecastCasesDraftValue === null);
  lossWrap?.classList.toggle("autoValue", dashboardHarvestForecastLossDraftValue === null);
  casesWrap?.classList.toggle("invalid", casesInvalid);
  lossWrap?.classList.toggle("invalid", lossInvalid);
  casesInput?.setAttribute("aria-invalid", casesInvalid ? "true" : "false");
  lossInput?.setAttribute("aria-invalid", lossInvalid ? "true" : "false");
  if(averageButton){
    averageButton.disabled = dashboardHarvestForecastCasesDraftValue === null
      && dashboardHarvestForecastLossDraftValue === null;
  }
  if(applyButton){
    applyButton.disabled = !dashboardHarvestForecastInputsDirty || casesInvalid || lossInvalid;
  }
}

function buildDashboardHarvestForecastModel(){
  const referenceDate = startOfLocalDay(new Date());
  const recentPeriod = getRecentOneMonthDashboardPeriod();
  const recentRecords = getDashboardRecordsForPeriod(recentPeriod);
  const metrics = getDashboardRecentMetrics(recentRecords);
  const averageCases = Number(metrics.averageCases);
  const averageLoss = metrics.averageLoss === null ? NaN : Number(metrics.averageLoss);
  const recordedSet = getRecordedPalletSetFromRecords(getRecentHarvestRecordsByCount(referenceDate));
  const plantingDateByPallet = getLatestPlantingDateByPallet(referenceDate, { includeTargetDate: true });
  const startBuilding = getStartupHarvestBuilding();
  const totalPalletCount = BUILDINGS.length * bedOrder.length * PALLETS_PER_BED;
  const normalizedAverageCases = Number.isFinite(averageCases) && averageCases > 0 ? averageCases : null;
  const normalizedAverageLoss = Number.isFinite(averageLoss) && averageLoss >= 0 && averageLoss <= 100
    ? averageLoss
    : null;
  const casesUsesAverage = dashboardHarvestForecastCasesValue === null;
  const lossUsesAverage = dashboardHarvestForecastLossValue === null;
  const forecastCases = casesUsesAverage
    ? normalizedAverageCases
    : parseDashboardHarvestForecastCasesValue(dashboardHarvestForecastCasesValue);
  const forecastLoss = lossUsesAverage
    ? normalizedAverageLoss
    : parseDashboardHarvestForecastLossValue(dashboardHarvestForecastLossValue);

  const model = {
    averageCases: normalizedAverageCases,
    averageLoss: normalizedAverageLoss,
    forecastCases,
    forecastLoss,
    casesUsesAverage,
    lossUsesAverage,
    canForecast: forecastCases !== null && forecastLoss !== null && forecastLoss < 100,
    harvestDays: metrics.harvestDays,
    recentPeriod,
    referenceDate,
    recordedSet,
    plantingDateByPallet,
    plantingDateRangeByPallet: new Map(),
    estimatedPlantingPalletKeys: new Set(),
    startBuilding,
    palletForecasts: new Map(),
    bedRanges: new Map(),
    buildingRanges: new Map()
  };
  if(!model.canForecast) return model;

  const virtualRecords = [...records].sort(compareRecordsByDateDesc);
  const harvestRate = Math.max(0, (100 - model.forecastLoss) / 100);
  const maxIterations = totalPalletCount + RECORDED_LOOKBACK_COUNT * 2;
  const actualHarvestDates = new Set(records.filter(record =>
    record?.type !== "partialHarvest"
    && Array.isArray(record?.palletKeys)
    && record.palletKeys.length > 0
  ).map(record => record.date));
  let forecastDate = getFirstDashboardHarvestDate(referenceDate);
  let iterationsWithoutNewForecast = 0;

  for(let iteration = 0; iteration < maxIterations && model.palletForecasts.size < totalPalletCount; iteration++){
    const forecastDateText = formatDateOnlyString(forecastDate);
    // すでに通常収穫が保存されている日は実記録をそのまま使い、
    // 同じ日に平均1日分を重ねて仮想実行しない。
    if(actualHarvestDates.has(forecastDateText)){
      forecastDate = getNextDashboardHarvestDate(forecastDate);
      continue;
    }
    // 実際の「計算する」と同じく、その日にすでに部分収穫したケースは
    // 1日分の平均ケース数から差し引いて通常収穫分だけを選ぶ。
    const partialCases = getPartialHarvestCasesForDate(
      forecastDateText,
      virtualRecords
    );
    const needHeads = Math.max(0, model.forecastCases - partialCases) * CASE_SIZE;
    if(needHeads <= 0){
      forecastDate = getNextDashboardHarvestDate(forecastDate);
      continue;
    }
    const selection = calculateHarvestSelectionFromRecords({
      referenceDate: forecastDate,
      partialTargetDate: forecastDate,
      sourceRecords: virtualRecords,
      needHeads,
      harvestRate,
      additionalExcludedPalletKeys: model.palletForecasts.keys(),
      releaseOldestIfBlocked: true
    });
    if(!selection.palletKeys.length) break;

    let newForecastCount = 0;
    selection.palletKeys.forEach(key => {
      if(model.palletForecasts.has(key)) return;
      model.palletForecasts.set(key, {
        date: new Date(forecastDate),
        daysAfter: getLocalDayDiff(referenceDate, forecastDate),
        harvestDateIndex: iteration,
      });
      newForecastCount++;
    });
    iterationsWithoutNewForecast = newForecastCount > 0 ? 0 : iterationsWithoutNewForecast + 1;

    insertRecordSortedByDateDesc(virtualRecords, {
      id: `dashboard-forecast-${iteration}`,
      type: "fullHarvest",
      date: forecastDateText,
      cases: Math.max(0, model.forecastCases - partialCases),
      palletKeys: [...selection.palletKeys]
    });

    if(iterationsWithoutNewForecast > RECORDED_LOOKBACK_COUNT * 2) break;
    forecastDate = getNextDashboardHarvestDate(forecastDate);
  }

  applyDashboardForecastPlantingDateRanges(model);

  const buildRange = forecasts => {
    if(!forecasts.length) return null;
    const sorted = forecasts.slice().sort((a, b) => a.date.getTime() - b.date.getTime());
    return { start: sorted[0], end: sorted[sorted.length - 1] };
  };
  BUILDINGS.forEach(building => {
    const buildingForecasts = [];
    bedOrder.forEach(bed => {
      const forecasts = [];
      for(let number = 1; number <= PALLETS_PER_BED; number++){
        const forecast = model.palletForecasts.get(getPalletKey(building, bed, number));
        if(forecast){
          forecasts.push(forecast);
          buildingForecasts.push(forecast);
        }
      }
      model.bedRanges.set(`${building}-${bed}`, buildRange(forecasts));
    });
    model.buildingRanges.set(building, buildRange(buildingForecasts));
  });

  return model;
}

function insertRecordSortedByDateDesc(targetRecords, record){
  let low = 0;
  let high = targetRecords.length;
  while(low < high){
    const middle = Math.floor((low + high) / 2);
    if(compareRecordsByDateDesc(record, targetRecords[middle]) < 0){
      high = middle;
    }else{
      low = middle + 1;
    }
  }
  targetRecords.splice(low, 0, record);
}

function applyDashboardForecastPlantingDateRanges(model){
  model.plantingDateByPallet.forEach((plantingDate, key) => {
    model.plantingDateRangeByPallet.set(key, {
      start: new Date(plantingDate),
      end: new Date(plantingDate)
    });
  });
  const futureForecastDates = [...new Map(
    [...model.palletForecasts.values()]
      .filter(forecast => Number(forecast?.daysAfter) >= 1)
      .map(forecast => [formatDateOnlyString(forecast.date), new Date(forecast.date)])
  ).values()].sort((left, right) => left.getTime() - right.getTime());
  const nextPlantingDate = futureForecastDates[0]
    || getFirstDashboardHarvestDate(addDays(model.referenceDate, 1));
  const nextNextPlantingDate = futureForecastDates[1]
    || getNextDashboardHarvestDate(nextPlantingDate);
  getUnplantedPalletSet().forEach(key => {
    model.plantingDateRangeByPallet.set(key, {
      start: new Date(nextPlantingDate),
      end: new Date(nextNextPlantingDate)
    });
    model.estimatedPlantingPalletKeys.add(key);
  });
}

function formatDashboardForecastRange(range){
  if(!range) return { dateText: "予想なし", delayText: "", shortDelayText: "--" };
  const sameDay = range.start.date.getTime() === range.end.date.getTime();
  if(sameDay){
    return {
      dateText: formatDashboardForecastDate(range.start.date),
      delayText: formatDashboardForecastDelay(range.start.daysAfter),
      shortDelayText: formatDashboardForecastDelay(range.start.daysAfter)
    };
  }
  return {
    dateText: `${formatDashboardForecastDate(range.start.date)}\n${formatDashboardForecastDate(range.end.date)}`,
    delayText: range.start.daysAfter === 0
      ? `今日〜${range.end.daysAfter}日後`
      : `${range.start.daysAfter}〜${range.end.daysAfter}日後`,
    shortDelayText: `${range.start.daysAfter}〜${range.end.daysAfter}日後`
  };
}

function formatDashboardForecastBedDateLines(range){
  if(!range) return [{ dateText: "予想なし", delayText: "" }];
  const sameDay = range.start.date.getTime() === range.end.date.getTime();
  const forecasts = sameDay ? [range.start] : [range.start, range.end];
  return forecasts.map(forecast => ({
    dateText: formatDashboardForecastDate(forecast.date),
    delayText: formatDashboardForecastDelay(forecast.daysAfter)
  }));
}

function buildDashboardForecastColorBarRuns(colors){
  const safeColors = Array.isArray(colors) && colors.length
    ? colors
    : [DASHBOARD_FORECAST_EMPTY_COLOR];
  const runs = [];
  safeColors.forEach(color => {
    const lastRun = runs[runs.length - 1];
    if(lastRun?.color === color){
      lastRun.count++;
      return;
    }
    runs.push({ color, count: 1 });
  });
  return runs;
}

function getDashboardForecastBedColorBarHtml(model, building, bed){
  const colors = [];
  const forecasts = [];
  // flex-columnの先頭が上になるため、奥（78番）から手前（1番）の順で色を積む。
  for(let number = PALLETS_PER_BED; number >= 1; number--){
    const forecast = model.palletForecasts.get(getPalletKey(building, bed, number));
    colors.push(getDashboardForecastDateColor(forecast?.daysAfter));
    if(forecast) forecasts.push(forecast);
  }
  forecasts.sort((a, b) => a.date.getTime() - b.date.getTime());
  const range = forecasts.length
    ? { start: forecasts[0], end: forecasts[forecasts.length - 1] }
    : null;
  const rangeText = range ? formatDashboardForecastRange(range).dateText.replace(/\n/g, "、") : "予想なし";
  const label = `${bed}ベッド 奥から手前の収穫時期 ${rangeText}`;
  const colorSlices = buildDashboardForecastColorBarRuns(colors).map(run => {
    return `<span class="dashboardForecastColorSlice" style="background:${run.color};flex-grow:${run.count}"></span>`;
  }).join("");
  return `
    <div class="dashboardForecastColorScale" role="img" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
      <span class="dashboardForecastColorDirection">奥</span>
      <span class="dashboardForecastColorBar" aria-hidden="true">${colorSlices}</span>
      <span class="dashboardForecastColorDirection">手前</span>
    </div>
  `;
}

function getDashboardForecastPlantingAgeStats(model, palletKeys, forecastDate){
  const keys = [...new Set(Array.isArray(palletKeys) ? palletKeys : [])];
  const ages = [];
  let knownCount = 0;
  let includesEstimate = false;
  keys.forEach(key => {
    const keyForecastDate = forecastDate || model.palletForecasts.get(key)?.date;
    if(!keyForecastDate) return;
    const actualDate = model.plantingDateByPallet.get(key);
    const range = model.plantingDateRangeByPallet?.get(key) || (
      actualDate ? { start: actualDate, end: actualDate } : null
    );
    if(!range) return;
    const keyAges = [range.start, range.end]
      .map(plantingDate => getLocalDayDiff(plantingDate, keyForecastDate))
      .filter(ageDays => Number.isFinite(ageDays) && ageDays >= 0);
    if(!keyAges.length) return;
    knownCount++;
    ages.push(...keyAges);
    if(model.estimatedPlantingPalletKeys?.has(key)) includesEstimate = true;
  });
  return {
    totalCount: keys.length,
    knownCount,
    minAge: ages.length ? Math.min(...ages) : null,
    maxAge: ages.length ? Math.max(...ages) : null,
    includesEstimate
  };
}

function getDashboardForecastPlantingAgeNote(stats){
  const estimateMark = stats.includesEstimate ? "?" : "";
  const unknownNote = stats.knownCount < stats.totalCount ? "（一部不明）" : "";
  return estimateMark + unknownNote;
}

function getDashboardForecastBedPlantingAgeText(model, building, bed){
  const palletKeys = [];
  for(let number = 1; number <= PALLETS_PER_BED; number++){
    const key = getPalletKey(building, bed, number);
    const forecast = model.palletForecasts.get(key);
    if(!forecast) continue;
    palletKeys.push(key);
  }
  if(!palletKeys.length) return "";
  const stats = getDashboardForecastPlantingAgeStats(model, palletKeys);
  if(stats.knownCount === 0) return "記録なし";
  const ageText = stats.minAge === stats.maxAge
    ? `${stats.minAge}日`
    : `${stats.minAge}〜${stats.maxAge}日`;
  const estimateMark = stats.includesEstimate ? "?" : "";
  const unknownNote = stats.knownCount < stats.totalCount ? " 一部不明" : "";
  return `${ageText}${estimateMark}${unknownNote}`;
}

function getDashboardHarvestForecastUnavailableText(model){
  const reasons = [];
  if(model.forecastCases === null){
    reasons.push(model.casesUsesAverage
      ? "直近1ヶ月に収穫ケース数の記録がありません"
      : "1日あたり収穫ケース数を0より大きい数で入力してください");
  }
  if(model.forecastLoss === null){
    reasons.push(model.lossUsesAverage
      ? "直近1ヶ月に収穫ロス率を計算できる通常収穫記録がありません"
      : "収穫ロス率を0〜100%で入力してください");
  }
  if(model.forecastLoss !== null && model.forecastLoss >= 100){
    reasons.push("収穫ロス率が100%のため見込み収穫数を計算できません");
  }
  return reasons.join("。");
}

function formatDashboardForecastDailyLocations(palletKeys){
  const bedsByBuilding = new Map();
  [...new Set(Array.isArray(palletKeys) ? palletKeys : [])].forEach(key => {
    const pallet = parsePalletKey(String(key || ""));
    if(!BUILDINGS.includes(pallet.building)
      || !bedOrder.includes(pallet.bed)
      || !Number.isInteger(pallet.number)
      || pallet.number < 1
      || pallet.number > PALLETS_PER_BED) return;
    if(!bedsByBuilding.has(pallet.building)) bedsByBuilding.set(pallet.building, new Map());
    const beds = bedsByBuilding.get(pallet.building);
    if(!beds.has(pallet.bed)) beds.set(pallet.bed, new Set());
    beds.get(pallet.bed).add(pallet.number);
  });
  return BUILDINGS
    .filter(building => bedsByBuilding.has(building))
    .map(building => {
      const beds = bedsByBuilding.get(building);
      const bedLabels = bedOrder
        .filter(bed => beds.has(bed))
        .map(bed => {
          const palletCount = beds.get(bed).size;
          return palletCount >= PALLETS_PER_BED ? bed : `${bed}(${palletCount})`;
        });
      return `${building}-${bedLabels.join(",")}`;
    })
    .join("\n");
}

function getDashboardForecastDailyLocationHtml(locationText){
  return String(locationText || "")
    .split("\n")
    .map(line => {
      const match = line.match(/^(\d+)(-.+)$/);
      if(!match) return escapeHtml(line);
      const bedLabels = match[2].slice(1).split(",").filter(Boolean);
      if(!bedLabels.length) return escapeHtml(line);
      const firstBedHtml = `<span class="dashboardForecastDayBedToken"><span class="dashboardForecastDayBuildingNumber">${escapeHtml(match[1])}</span>-${escapeHtml(bedLabels[0])}</span>`;
      const remainingBedsHtml = bedLabels.slice(1).map(bedLabel => (
        `,<wbr><span class="dashboardForecastDayBedToken">${escapeHtml(bedLabel)}</span>`
      )).join("");
      return `<span class="dashboardForecastDayBuildingLine">${firstBedHtml}${remainingBedsHtml}</span>`;
    })
    .join("");
}

function getDashboardForecastDailyPlantingAgeText(model, palletKeys, forecastDate){
  const keys = [...new Set(Array.isArray(palletKeys) ? palletKeys : [])];
  if(!keys.length) return "-";
  const stats = getDashboardForecastPlantingAgeStats(model, keys, forecastDate);
  if(stats.knownCount === 0) return "定植記録なし";
  const ageText = stats.minAge === stats.maxAge
    ? `${stats.minAge}日`
    : `${stats.minAge}〜${stats.maxAge}日`;
  return ageText + getDashboardForecastPlantingAgeNote(stats);
}

function buildDashboardHarvestForecastDayRows(model){
  if(!model?.canForecast) return [];
  const palletKeysByDay = new Map();
  let lastForecastDay = 0;
  model.palletForecasts.forEach((forecast, key) => {
    const daysAfter = Math.floor(Number(forecast?.daysAfter));
    if(!Number.isFinite(daysAfter) || daysAfter < 1) return;
    if(!palletKeysByDay.has(daysAfter)) palletKeysByDay.set(daysAfter, []);
    palletKeysByDay.get(daysAfter).push(key);
    lastForecastDay = Math.max(lastForecastDay, daysAfter);
  });
  return Array.from({ length: lastForecastDay }, (_, index) => {
    const daysAfter = index + 1;
    const date = addDays(model.referenceDate, daysAfter);
    const palletKeys = palletKeysByDay.get(daysAfter) || [];
    return {
      daysAfter,
      date,
      palletKeys,
      locationText: formatDashboardForecastDailyLocations(palletKeys),
      plantingAgeText: getDashboardForecastDailyPlantingAgeText(model, palletKeys, date)
    };
  });
}

function renderDashboardHarvestForecastDayList(container, model, options = {}){
  if(!container) return 0;
  if(!model.canForecast){
    container.innerHTML = `<div class="dashboardEmpty">${escapeHtml(getDashboardHarvestForecastUnavailableText(model))}。</div>`;
    return 0;
  }
  const rows = buildDashboardHarvestForecastDayRows(model);
  if(!rows.length){
    container.innerHTML = `<div class="dashboardEmpty">1日後以降の収穫予想はありません。</div>`;
    return 0;
  }
  const maxRows = Number(options.maxRows);
  const visibleRows = Number.isFinite(maxRows) && maxRows > 0
    ? rows.slice(0, Math.floor(maxRows))
    : rows;
  container.innerHTML = `
    <div class="dashboardForecastDayHeader" aria-hidden="true">
      <span>日数</span><span>日付</span><span>収穫場所</span><span>定植日数</span>
    </div>
    ${visibleRows.map(row => {
      const hasHarvest = row.palletKeys.length > 0;
      return `<div class="dashboardForecastDayRow${hasHarvest ? "" : " is-empty"}">
        <span class="dashboardForecastDayDelay">${escapeHtml(formatDashboardForecastDelay(row.daysAfter))}</span>
        <span class="dashboardForecastDayDate">${escapeHtml(formatDashboardForecastDate(row.date))}</span>
        <span class="dashboardForecastDayLocation">${hasHarvest ? getDashboardForecastDailyLocationHtml(row.locationText) : "なし"}</span>
        <span class="dashboardForecastDayPlantingAge">${escapeHtml(hasHarvest ? row.plantingAgeText : "-")}</span>
      </div>`;
    }).join("")}
  `;
  return rows.length;
}

function renderDashboardHarvestForecastDays(model){
  const container = document.getElementById("dashboardHarvestForecastDays");
  const toolbar = document.getElementById("dashboardForecastDayListToolbar");
  const moreButton = document.getElementById("dashboardForecastDaysMoreBtn");
  renderDashboardHarvestForecastDayList(container, model);
  if(toolbar) toolbar.hidden = true;
  if(moreButton) moreButton.hidden = true;
}

function renderDashboardHarvestForecastBeds(model){
  const container = document.getElementById("dashboardHarvestForecastBeds");
  if(!container) return;
  if(!model.canForecast){
    container.innerHTML = `<div class="dashboardEmpty" style="grid-column:1/-1;">${escapeHtml(getDashboardHarvestForecastUnavailableText(model))}。</div>`;
    return;
  }

  const building = BUILDINGS.includes(dashboardHarvestForecastBuilding)
    ? dashboardHarvestForecastBuilding
    : model.startBuilding;
  container.innerHTML = bedMap.map(bed => {
    const dateLines = formatDashboardForecastBedDateLines(model.bedRanges.get(`${building}-${bed}`));
    const plantingAgeText = getDashboardForecastBedPlantingAgeText(model, building, bed);
    return `
      <div class="bed bedCollapsed dashboardForecastBed">
        <div class="bedTitle">
          <span class="dashboardForecastBedName">${bed}ベッド</span>
          <span class="dashboardForecastBedDateRows">
            ${dateLines.map(line => `
              <span class="dashboardForecastBedDateRow">
                <span class="dashboardForecastBedDate">${escapeHtml(line.dateText)}</span>
                <span class="dashboardForecastBedDelay">${escapeHtml(line.delayText)}</span>
              </span>
            `).join("")}
          </span>
          ${plantingAgeText ? `
            <span class="dashboardForecastBedPlantingAge">
              <span class="dashboardForecastBedPlantingAgeLabel">定植〜<span class="dashboardForecastBedPlantingAgeLabelHarvest">収穫</span></span>
              <span class="dashboardForecastBedPlantingAgeValue">${escapeHtml(plantingAgeText)}</span>
            </span>
          ` : ""}
        </div>
        ${getDashboardForecastBedColorBarHtml(model, building, bed)}
      </div>
    `;
  }).join("");
}

function getDashboardHarvestForecastView(){
  return dashboardFilter.harvestForecastView === "days" ? "days" : "beds";
}

function renderDashboardHarvestForecastView(model){
  const view = getDashboardHarvestForecastView();
  const showDays = view === "days";
  const tabs = document.getElementById("dashboardHarvestForecastBuildingTabs");
  const beds = document.getElementById("dashboardHarvestForecastBeds");
  const days = document.getElementById("dashboardHarvestForecastDays");
  const daysFrame = document.getElementById("dashboardHarvestForecastDaysFrame");
  const legend = document.getElementById("dashboardHarvestForecastLegend");
  document.querySelectorAll("[data-dashboard-forecast-view]").forEach(button => {
    const active = button.dataset.dashboardForecastView === view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  if(tabs) tabs.hidden = showDays;
  if(beds) beds.hidden = showDays;
  if(daysFrame) daysFrame.hidden = !showDays;
  else if(days) days.hidden = !showDays;
  if(legend) legend.hidden = showDays;
  if(showDays){
    renderDashboardHarvestForecastDays(model);
  }else{
    renderDashboardHarvestForecastBeds(model);
    scheduleDashboardSelectedBuildingButtonReveal("guide");
  }
}

function setDashboardHarvestForecastView(view){
  const normalized = view === "days" ? "days" : "beds";
  dashboardFilter.harvestForecastView = normalized;
  saveDashboardFilter();
  const model = dashboardHarvestForecastModelCache || buildDashboardHarvestForecastModel();
  renderDashboardHarvestForecastView(model);
}

function setDashboardHarvestForecastBuilding(building){
  const normalized = Number(building);
  if(!BUILDINGS.includes(normalized)) return;
  dashboardHarvestForecastBuilding = normalized;
  const model = dashboardHarvestForecastModelCache || buildDashboardHarvestForecastModel();
  document.querySelectorAll("[data-dashboard-forecast-building]").forEach(button => {
    button.classList.toggle("active", Number(button.dataset.dashboardForecastBuilding) === normalized);
  });
  if(getDashboardHarvestForecastView() === "beds") renderDashboardHarvestForecastBeds(model);
}

function renderDashboardHarvestForecast(){
  const tabs = document.getElementById("dashboardHarvestForecastBuildingTabs");
  if(!tabs) return;

  const model = dashboardHarvestForecastModelCache || buildDashboardHarvestForecastModel();
  dashboardHarvestForecastModelCache = model;
  syncDashboardHarvestForecastInputs(model);
  if(!BUILDINGS.includes(dashboardHarvestForecastBuilding)){
    dashboardHarvestForecastBuilding = model.startBuilding;
  }

  tabs.innerHTML = BUILDINGS.map(building => {
    const rangeText = formatDashboardForecastRange(model.buildingRanges.get(building));
    const buildingDelayText = model.canForecast ? rangeText.shortDelayText : "--";
    return `
      <button type="button" class="dashboardForecastBuildingBtn ${building === dashboardHarvestForecastBuilding ? "active" : ""}"
        data-dashboard-forecast-building="${building}" data-ui-click="setDashboardHarvestForecastBuilding" data-ui-number="${building}">
        ${building}号棟
        <span class="dashboardForecastBuildingDay">${escapeHtml(buildingDelayText)}</span>
      </button>
    `;
  }).join("");
  renderDashboardHarvestForecastView(model);
}

function getCurrentPlantingEventByPallet(referenceDate = new Date()){
  const referenceDay = startOfLocalDay(referenceDate);
  const changes = [];

  records.forEach(record => {
    if(record?.type === "partialHarvest") return;
    const recordDate = parseDateOnlyString(String(record?.date || "").trim());
    if(!recordDate || startOfLocalDay(recordDate).getTime() > referenceDay.getTime()) return;
    const palletKeys = getPalletKeysFromRecord(record);
    if(!palletKeys.length) return;
    changes.push({
      date: startOfLocalDay(recordDate),
      typeOrder: 0,
      itemOrder: Number(record?.id || 0),
      palletKeys,
      event: null
    });
  });

  plantingEvents.forEach(event => {
    const plantingDate = parseDateOnlyString(String(event?.plantingDate || "").trim());
    if(!plantingDate || startOfLocalDay(plantingDate).getTime() > referenceDay.getTime()) return;
    const palletKeys = Array.isArray(event?.plantingPalletKeys)
      ? event.plantingPalletKeys.filter(isValidPalletKeyString)
      : [];
    if(!palletKeys.length) return;
    changes.push({
      date: startOfLocalDay(plantingDate),
      typeOrder: 1,
      itemOrder: Number(event?.eventId || 0),
      palletKeys,
      event
    });
  });

  changes.sort((left, right) => (
    left.date.getTime() - right.date.getTime()
    || left.typeOrder - right.typeOrder
    || left.itemOrder - right.itemOrder
  ));

  const currentByPallet = new Map();
  changes.forEach(change => {
    change.palletKeys.forEach(key => {
      if(change.event){
        currentByPallet.set(key, {
          event: change.event,
          plantingDate: change.date
        });
      }else{
        currentByPallet.delete(key);
      }
    });
  });
  return currentByPallet;
}

function getDashboardSeedlingQualityClass(value){
  const qualityMemo = normalizeQualityMemo(value);
  if(!qualityMemo.tags.length && !qualityMemo.other) return "is-unknown";
  if(qualityMemo.tags.includes("elongated") || qualityMemo.tags.includes("chip")) return "is-problem";
  if(qualityMemo.other || qualityMemo.tags.length > 1) return "is-mixed";
  if(qualityMemo.tags[0] === "large") return "is-large";
  if(qualityMemo.tags[0] === "small") return "is-small";
  return "";
}

function buildDashboardSeedlingStatusModel(referenceDate = new Date()){
  const referenceDay = startOfLocalDay(referenceDate);
  const currentByPallet = getCurrentPlantingEventByPallet(referenceDay);
  const bedLotMaps = new Map();

  currentByPallet.forEach((status, palletKey) => {
    const pallet = parsePalletKey(palletKey);
    if(!BUILDINGS.includes(pallet.building)
      || !bedOrder.includes(pallet.bed)
      || !Number.isFinite(pallet.number)) return;
    const bedKey = `${pallet.building}-${pallet.bed}`;
    if(!bedLotMaps.has(bedKey)) bedLotMaps.set(bedKey, new Map());
    const qualityText = formatPlantingQualityMemo(status.event?.qualityMemo);
    const plantingDateText = formatDateOnlyString(status.plantingDate);
    const plantingCount = Number(status.event?.plantingCountsByPallet?.[palletKey]);
    const normalizedPlantingCount = ALLOWED_YIELDS.includes(plantingCount) ? plantingCount : null;
    const plantingCountText = normalizedPlantingCount === null
      ? "株数未記録"
      : `${normalizedPlantingCount}植え`;
    const lotKey = `${plantingDateText}\n${qualityText}\n${plantingCountText}`;
    const lots = bedLotMaps.get(bedKey);
    if(!lots.has(lotKey)){
      lots.set(lotKey, {
        plantingDate: status.plantingDate,
        plantingCount: normalizedPlantingCount,
        plantingCountText,
        qualityText,
        qualityClass: getDashboardSeedlingQualityClass(status.event?.qualityMemo),
        palletCount: 0,
        firstPalletNumber: pallet.number,
        palletNumbers: []
      });
    }
    const lot = lots.get(lotKey);
    lot.palletCount += 1;
    lot.firstPalletNumber = Math.min(lot.firstPalletNumber, pallet.number);
    lot.palletNumbers.push(pallet.number);
  });

  BUILDINGS.forEach(building => {
    bedOrder.forEach(bed => {
      const bedKey = `${building}-${bed}`;
      const unplantedNumbers = [];
      for(let number = 1; number <= PALLETS_PER_BED; number++){
        if(!currentByPallet.has(getPalletKey(building, bed, number))){
          unplantedNumbers.push(number);
        }
      }
      if(!unplantedNumbers.length) return;
      if(!bedLotMaps.has(bedKey)) bedLotMaps.set(bedKey, new Map());
      const lots = bedLotMaps.get(bedKey);
      lots.set("unplanted", {
        plantingDate: null,
        qualityText: "未定植",
        qualityClass: "is-unplanted",
        palletCount: unplantedNumbers.length,
        firstPalletNumber: unplantedNumbers[0],
        palletNumbers: unplantedNumbers,
        isUnplanted: true
      });
    });
  });

  const bedLots = new Map();
  bedLotMaps.forEach((lots, bedKey) => {
    bedLots.set(bedKey, [...lots.values()]
      .map(lot => ({
        ...lot,
        ageDays: lot.isUnplanted
          ? null
          : Math.max(0, getLocalDayDiff(lot.plantingDate, referenceDay))
      }))
      .sort((left, right) => (
        right.firstPalletNumber - left.firstPalletNumber
        || (right.plantingDate?.getTime?.() || 0) - (left.plantingDate?.getTime?.() || 0)
      )));
  });

  return {
    referenceDate: referenceDay,
    bedLots,
    currentByPallet
  };
}

function getDashboardSeedlingBedMapCellHtml(model, building, bed, number, sectionStart){
  const status = model.currentByPallet.get(getPalletKey(building, bed, number));
  if(!status){
    const label = `${number}番 未定植`;
    return `<span class="dashboardSeedlingBedMapCell is-unplanted${sectionStart ? " is-section-start" : ""}" data-dashboard-seedling-pallet-number="${number}" title="${escapeHtml(label)}"></span>`;
  }

  const qualityText = formatPlantingQualityMemo(status.event?.qualityMemo);
  const qualityClass = getDashboardSeedlingQualityClass(status.event?.qualityMemo);
  const plantingCount = Number(status.event?.plantingCountsByPallet?.[getPalletKey(building, bed, number)]);
  const plantingCountText = ALLOWED_YIELDS.includes(plantingCount) ? `${plantingCount}植え` : "株数未記録";
  const ageDays = Math.max(0, getLocalDayDiff(status.plantingDate, model.referenceDate));
  const label = `${number}番 ${qualityText} ${plantingCountText} ${ageDays}日経過`;
  return `<span class="dashboardSeedlingBedMapCell ${qualityClass}${sectionStart ? " is-section-start" : ""}" data-dashboard-seedling-pallet-number="${number}" title="${escapeHtml(label)}"></span>`;
}

function getDashboardSeedlingBedMapHtml(model, building, bed){
  const cells = [];
  for(let row = ROWS; row >= 1; row--){
    const displayRowIndex = ROWS - row;
    const sectionStart = displayRowIndex > 0
      && Math.floor(displayRowIndex * 6 / ROWS) > Math.floor((displayRowIndex - 1) * 6 / ROWS);
    cells.push(getDashboardSeedlingBedMapCellHtml(
      model,
      building,
      bed,
      row * 2 - 1,
      sectionStart
    ));
    cells.push(getDashboardSeedlingBedMapCellHtml(
      model,
      building,
      bed,
      row * 2,
      sectionStart
    ));
  }

  return `
    <div class="dashboardSeedlingBedMap" aria-hidden="true">
      <div class="dashboardSeedlingBedMapGrid">${cells.join("")}</div>
    </div>
  `;
}

function getDashboardSeedlingBedAgeSummary(lots){
  const ages = [...new Set((Array.isArray(lots) ? lots : [])
    .map(lot => lot.ageDays)
    .filter(ageDays => Number.isFinite(ageDays)))]
    .sort((left, right) => left - right);
  if(!ages.length) return "経過日数なし";
  return `${ages.join("、")}日経過`;
}

function getDashboardSeedlingStatusLotHtml(lot, index, isSelected){
  const ageText = lot.isUnplanted ? "" : `${lot.ageDays}日経過`;
  const numberText = formatPalletNumberSideRanges(lot.palletNumbers);
  const ariaLabel = [
    lot.qualityText,
    lot.isUnplanted ? "" : lot.plantingCountText,
    ageText,
    `番号 ${numberText}`,
    `${lot.palletCount}パレット`,
    "パレット位置を表示"
  ].filter(Boolean).join("、");
  return `
    <button type="button"
      class="dashboardSeedlingStatusLot${lot.isUnplanted ? " is-unplanted" : ""}${isSelected ? " is-selected" : ""}"
      data-dashboard-seedling-lot-index="${index}"
      data-ui-click="setDashboardSeedlingStatusLot" data-ui-number="${index}"
      aria-pressed="${isSelected ? "true" : "false"}"
      aria-label="${escapeHtml(ariaLabel)}">
      <span class="dashboardSeedlingStatusLotHeader">
        <span class="dashboardSeedlingStatusQuality ${lot.qualityClass}">${escapeHtml(lot.qualityText)}</span>
        <span class="dashboardSeedlingStatusLotBadges">
          ${lot.isUnplanted ? "" : `<span class="dashboardSeedlingStatusPlantingCount${lot.plantingCount === null ? " is-unrecorded" : ""}">${escapeHtml(lot.plantingCountText)}</span>`}
          <span class="dashboardSeedlingStatusSelectedLabel" aria-hidden="true">選択中</span>
        </span>
      </span>
      ${lot.isUnplanted ? "" : `<span class="dashboardSeedlingStatusAge">${lot.ageDays}日経過</span>`}
      <span class="dashboardSeedlingStatusCount">
        <span>番号 ${escapeHtml(numberText)}</span>
        <span>${lot.palletCount}パレット</span>
      </span>
    </button>
  `;
}

function clearDashboardSeedlingStatusLotSelectionUi(){
  document.querySelectorAll(".dashboardSeedlingStatusLot.is-selected").forEach(button => {
    button.classList.remove("is-selected");
    button.setAttribute("aria-pressed", "false");
  });
  document.querySelectorAll(".dashboardSeedlingStatusBed.has-lot-selection").forEach(bedButton => {
    bedButton.classList.remove("has-lot-selection");
    bedButton.querySelectorAll(".dashboardSeedlingBedMapCell").forEach(cell => {
      cell.classList.remove(
        "is-lot-selected",
        "is-lot-edge-top",
        "is-lot-edge-right",
        "is-lot-edge-bottom",
        "is-lot-edge-left"
      );
    });
  });
}

function applyDashboardSeedlingStatusLotSelection(lots, bed){
  clearDashboardSeedlingStatusLotSelectionUi();
  const selectedIndex = dashboardSeedlingStatusSelectedLotIndex;
  if(!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= lots.length) return;

  const selectedLot = lots[selectedIndex];
  const selectedNumbers = new Set((selectedLot?.palletNumbers || [])
    .map(Number)
    .filter(number => Number.isInteger(number) && number >= 1 && number <= PALLETS_PER_BED));
  if(!selectedNumbers.size) return;

  const lotButton = document.querySelector(`[data-dashboard-seedling-lot-index="${selectedIndex}"]`);
  if(lotButton){
    lotButton.classList.add("is-selected");
    lotButton.setAttribute("aria-pressed", "true");
  }

  const bedButton = document.querySelector(`[data-dashboard-seedling-bed="${bed}"]`);
  if(!bedButton) return;
  bedButton.classList.add("has-lot-selection");
  bedButton.querySelectorAll("[data-dashboard-seedling-pallet-number]").forEach(cell => {
    const number = Number(cell.dataset.dashboardSeedlingPalletNumber);
    const isSelected = selectedNumbers.has(number);
    const hasLeftNeighbor = number % 2 === 0 && selectedNumbers.has(number - 1);
    const hasRightNeighbor = number % 2 === 1 && selectedNumbers.has(number + 1);
    cell.classList.toggle("is-lot-selected", isSelected);
    cell.classList.toggle("is-lot-edge-top", isSelected && !selectedNumbers.has(number + 2));
    cell.classList.toggle("is-lot-edge-right", isSelected && !hasRightNeighbor);
    cell.classList.toggle("is-lot-edge-bottom", isSelected && !selectedNumbers.has(number - 2));
    cell.classList.toggle("is-lot-edge-left", isSelected && !hasLeftNeighbor);
  });
}

function renderDashboardSeedlingStatusDetail(model, building){
  const detail = document.getElementById("dashboardSeedlingStatusDetail");
  if(!detail) return;
  const bed = bedMap.includes(dashboardSeedlingStatusSelectedBed)
    ? dashboardSeedlingStatusSelectedBed
    : bedMap[0];
  const lots = model.bedLots.get(`${building}-${bed}`) || [];
  if(!Number.isInteger(dashboardSeedlingStatusSelectedLotIndex)
    || dashboardSeedlingStatusSelectedLotIndex < 0
    || dashboardSeedlingStatusSelectedLotIndex >= lots.length){
    dashboardSeedlingStatusSelectedLotIndex = null;
  }
  const ageSummary = getDashboardSeedlingBedAgeSummary(lots);
  detail.innerHTML = `
    <div class="dashboardSeedlingStatusDetailHeader">
      <span class="dashboardSeedlingStatusDetailTitle">${bed}ベッドの詳細</span>
      <span class="dashboardSeedlingStatusDetailSummary">${escapeHtml(ageSummary)}</span>
    </div>
    <div class="dashboardSeedlingStatusDetailHint">各表示をタップすると、該当するパレット位置を強調します。</div>
    <div class="dashboardSeedlingStatusLots dashboardSeedlingStatusDetailLots">
      ${lots.map((lot, index) => getDashboardSeedlingStatusLotHtml(
        lot,
        index,
        dashboardSeedlingStatusSelectedLotIndex === index
      )).join("")}
    </div>
  `;
  applyDashboardSeedlingStatusLotSelection(lots, bed);
}

function renderDashboardSeedlingStatusBeds(model){
  const container = document.getElementById("dashboardSeedlingStatusBeds");
  if(!container) return;
  dashboardSeedlingStatusModelCache = model;
  const building = BUILDINGS.includes(dashboardSeedlingStatusBuilding)
    ? dashboardSeedlingStatusBuilding
    : BUILDINGS[0];
  if(!bedMap.includes(dashboardSeedlingStatusSelectedBed)){
    dashboardSeedlingStatusSelectedBed = bedMap[0];
  }

  container.innerHTML = bedMap.map(bed => {
    const lots = model.bedLots.get(`${building}-${bed}`) || [];
    const hasPlantedLot = lots.some(lot => !lot.isUnplanted);
    const ageSummary = getDashboardSeedlingBedAgeSummary(lots);
    const ageAriaLabel = hasPlantedLot ? `定植から現在まで ${ageSummary}` : ageSummary;
    const isSelected = bed === dashboardSeedlingStatusSelectedBed;
    return `
      <button type="button"
        class="bed bedCollapsed dashboardForecastBed dashboardSeedlingStatusBed${hasPlantedLot ? "" : " is-unplanted"}${isSelected ? " is-selected" : ""}"
        data-ui-click="setDashboardSeedlingStatusBed" data-ui-arg="${bed}"
        data-dashboard-seedling-bed="${bed}"
        aria-pressed="${isSelected ? "true" : "false"}"
        aria-label="${bed}ベッド ${escapeHtml(ageAriaLabel)}。詳細を表示">
        <div class="bedTitle">
          <span class="dashboardForecastBedName">${bed}</span>
        </div>
        ${getDashboardSeedlingBedMapHtml(model, building, bed)}
        <span class="dashboardSeedlingStatusAgeBlock">
          ${hasPlantedLot ? `<span class="dashboardSeedlingStatusAgeLabel">定植〜<span class="dashboardSeedlingStatusAgeLabelCurrent">現在</span></span>` : ""}
          <span class="dashboardSeedlingStatusAgeSummary">${escapeHtml(ageSummary)}</span>
        </span>
      </button>
    `;
  }).join("");
  renderDashboardSeedlingStatusDetail(model, building);
}

function setDashboardSeedlingStatusLot(index){
  const normalized = Number(index);
  if(!Number.isInteger(normalized)) return;
  const building = BUILDINGS.includes(dashboardSeedlingStatusBuilding)
    ? dashboardSeedlingStatusBuilding
    : BUILDINGS[0];
  const bed = bedMap.includes(dashboardSeedlingStatusSelectedBed)
    ? dashboardSeedlingStatusSelectedBed
    : bedMap[0];
  const model = dashboardSeedlingStatusModelCache || buildDashboardSeedlingStatusModel();
  const lots = model.bedLots.get(`${building}-${bed}`) || [];
  if(normalized < 0 || normalized >= lots.length) return;

  dashboardSeedlingStatusSelectedLotIndex = dashboardSeedlingStatusSelectedLotIndex === normalized
    ? null
    : normalized;
  applyDashboardSeedlingStatusLotSelection(lots, bed);
}

function setDashboardSeedlingStatusBed(bed){
  if(!bedMap.includes(bed)) return;
  if(dashboardSeedlingStatusSelectedBed !== bed){
    dashboardSeedlingStatusSelectedLotIndex = null;
  }
  dashboardSeedlingStatusSelectedBed = bed;
  document.querySelectorAll("[data-dashboard-seedling-bed]").forEach(button => {
    const isSelected = button.dataset.dashboardSeedlingBed === bed;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", isSelected ? "true" : "false");
  });
  const building = BUILDINGS.includes(dashboardSeedlingStatusBuilding)
    ? dashboardSeedlingStatusBuilding
    : BUILDINGS[0];
  const model = dashboardSeedlingStatusModelCache || buildDashboardSeedlingStatusModel();
  renderDashboardSeedlingStatusDetail(model, building);
}

function setDashboardSeedlingStatusBuilding(building){
  const normalized = Number(building);
  if(!BUILDINGS.includes(normalized)) return;
  if(dashboardSeedlingStatusBuilding !== normalized){
    dashboardSeedlingStatusSelectedLotIndex = null;
  }
  dashboardSeedlingStatusBuilding = normalized;
  document.querySelectorAll("[data-dashboard-seedling-building]").forEach(button => {
    button.classList.toggle("active", Number(button.dataset.dashboardSeedlingBuilding) === normalized);
  });
  const model = dashboardSeedlingStatusModelCache || buildDashboardSeedlingStatusModel();
  renderDashboardSeedlingStatusBeds(model);
}

function renderDashboardSeedlingStatus(){
  const tabs = document.getElementById("dashboardSeedlingStatusBuildingTabs");
  if(!tabs) return;
  const model = dashboardSeedlingStatusModelCache || buildDashboardSeedlingStatusModel();
  if(!BUILDINGS.includes(dashboardSeedlingStatusBuilding)){
    const startupBuilding = Number(getStartupHarvestBuilding());
    dashboardSeedlingStatusBuilding = BUILDINGS.includes(startupBuilding) ? startupBuilding : BUILDINGS[0];
  }

  tabs.innerHTML = BUILDINGS.map(building => {
    return `
      <button type="button" class="dashboardForecastBuildingBtn ${building === dashboardSeedlingStatusBuilding ? "active" : ""}"
        data-dashboard-seedling-building="${building}" data-ui-click="setDashboardSeedlingStatusBuilding" data-ui-number="${building}">
        ${building}号棟
      </button>
    `;
  }).join("");
  renderDashboardSeedlingStatusBeds(model);
}

function renderDashboardGraphs(){
  const period = getDashboardPeriod();
  const metricsPeriod = renderDashboardMetrics();
  const metricsNote = document.getElementById("dashboardMetricsNote");
  if(metricsNote && metricsPeriod){
    metricsNote.textContent = `※直近1ヶ月（${metricsPeriod.startLabel}〜${metricsPeriod.endLabel}）のデータを参照しています。`;
  }

  renderDashboardHistory(period);

  const casesGranularity = ["month", "year"].includes(dashboardFilter.casesGranularity) ? dashboardFilter.casesGranularity : "month";
  const lossGranularity = ["month", "year"].includes(dashboardFilter.lossGranularity) ? dashboardFilter.lossGranularity : "month";
  const dashboardCasesGranularityInput = document.getElementById("dashboardCasesGranularityInput");
  const dashboardLossGranularityInput = document.getElementById("dashboardLossGranularityInput");
  if(dashboardCasesGranularityInput) dashboardCasesGranularityInput.value = casesGranularity;
  if(dashboardLossGranularityInput) dashboardLossGranularityInput.value = lossGranularity;

  const lossPeriod = getDashboardChartPeriod(period.start, lossGranularity);
  const lossRecords = getDashboardRecordsForPeriod(lossPeriod);
  const lossPlantingEvents = getDashboardPlantingEventsForPeriod(lossPeriod);

  const allCasesSeries = buildDashboardCasesSeries(records, period, casesGranularity);
  const casesSeries = allCasesSeries.slice(-5);
  const casesChartNote = document.getElementById("dashboardCasesChartNote");
  if(casesChartNote){
    casesChartNote.textContent = `${getDashboardGranularityLabel(casesGranularity)}別 / 基準日 ${period.dayOfMonth}日 / ${getDashboardCasesSeriesRangeText(casesSeries)}`;
  }
  renderDashboardBarChart("dashboardCasesChart", casesSeries, {
    color: "#16a34a",
    ariaLabel: "収穫ケース数",
    fitContainer: true,
    formatValue: (value, axisOnly = false) => `${axisOnly ? Math.round(value) : Math.round(value * 10) / 10}`
  });
  renderDashboardCasesChartTable(casesSeries);
  const casesMoreButton = document.getElementById("dashboardCasesMoreBtn");
  if(casesMoreButton) casesMoreButton.hidden = allCasesSeries.length <= casesSeries.length;

  const lossChartNote = document.getElementById("dashboardLossChartNote");
  if(lossChartNote){
    lossChartNote.textContent = `通常収穫のみ / ${getDashboardGranularityLabel(lossGranularity)}別 / 基準日 ${lossPeriod.dayOfMonth}日 / ${lossPeriod.startLabel} 〜 ${lossPeriod.endLabel}`;
  }
  renderDashboardMultiLineChart("dashboardLossChart", buildDashboardLossComparisonSeries(lossRecords, lossPlantingEvents, lossPeriod, lossGranularity), {
    ariaLabel: "平均ロス率",
    tooltipLabel: "ロス率 ",
    suggestedMax: 20,
    emptyMessage: "通常収穫のロス率データがありません。",
    formatValue: (value, axisOnly = false) => `${(axisOnly ? Math.round(value) : value.toFixed(1))}%`
  });

}

function renderDashboardSubtab(subtab = dashboardFilter.dashboardSubtab, options = {}){
  const normalizedSubtab = normalizeDashboardSubtab(subtab);
  if(!options.force && dashboardRenderedSubtabs.has(normalizedSubtab)){
    scheduleDashboardSelectedBuildingButtonReveal(normalizedSubtab);
    return;
  }

  if(normalizedSubtab === "guide"){
    renderDashboardHarvestForecast();
  }else if(normalizedSubtab === "calendar"){
    renderDashboardHarvestStartTimeline();
  }else if(normalizedSubtab === "seedlings"){
    renderDashboardSeedlingStatus();
  }else{
    renderDashboardGraphs();
  }
  dashboardRenderedSubtabs.add(normalizedSubtab);
  scheduleDashboardSelectedBuildingButtonReveal(normalizedSubtab);
}

function renderDashboard(){
  const todayKey = formatDateOnlyString(new Date());
  if(dashboardRenderedDayKey && dashboardRenderedDayKey !== todayKey){
    invalidateDashboardDerivedData();
  }

  populateDashboardStartDayOptions();
  const startDayInputs = getDashboardStartDayInputs();
  if(!startDayInputs.length) return;

  const selectedDay = getDashboardSelectedStartDay();
  syncDashboardStartDayInputs(selectedDay);
  if(dashboardFilter.startDay !== selectedDay){
    dashboardFilter.startDay = selectedDay;
    saveDashboardFilter();
  }
  syncDashboardSubtabUi();
  renderDashboardSubtab(dashboardFilter.dashboardSubtab, { force: true });
  dashboardRenderedDayKey = todayKey;
}
