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
  return setCasePlacementBuilding(getAdjacentBuilding(casePlacementBuilding, direction));
}

function setCasePlacementBuilding(building){
  const nextBuildingValue = Number(building);
  if(!BUILDINGS.includes(nextBuildingValue)) return false;
  if(nextBuildingValue === casePlacementBuilding){
    updateCasePlacementBuildingLabel();
    return false;
  }
  syncCurrentCasePlacementFromInputs();
  casePlacementBuilding = nextBuildingValue;
  updateCasePlacementBuildingLabel();
  populateCasePlacementInputs();
  syncCurrentBuildingToCasePlacement({ skipSummary: true });
  renderForecastSummary();
  saveHarvestStateToStorage();
  return true;
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
  if(value === "calendar") return "graphs";
  return ["guide", "seedlings", "growth", "graphs"].includes(value) ? value : "guide";
}

function normalizeDashboardResultsView(value){
  return ["harvestStart", "calendar", "graphs"].includes(value) ? value : "calendar";
}

function normalizeDashboardRecordTypeFilter(value){
  return ["all", "full", "partial", "planting", "attention"].includes(value) ? value : "all";
}

function invalidateDashboardDerivedData(){
  dashboardHarvestForecastModelCache = null;
  dashboardSeedlingStatusModelCache = null;
  dashboardGrowthPredictionModelCache = null;
  if(typeof closeDashboardSeedlingStatusDetail === "function"){
    closeDashboardSeedlingStatusDetail({ restoreFocus: false });
  }else{
    dashboardSeedlingStatusSelectedDateIndex = null;
    dashboardSeedlingStatusDetailOpen = false;
    if(dashboardSeedlingStatusDetailPositionFrame){
      cancelAnimationFrame(dashboardSeedlingStatusDetailPositionFrame);
      dashboardSeedlingStatusDetailPositionFrame = 0;
    }
  }
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
      seedlingStatusView: "beds",
      dashboardSubtab: "guide",
      resultsView: "calendar",
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
      seedlingStatusView: ["beds", "ages"].includes(parsed?.seedlingStatusView)
        ? parsed.seedlingStatusView
        : "beds",
      // 生育予測は利用者がこのセッションでタブを押した時だけ読み込む。
      dashboardSubtab: normalizeDashboardSubtab(parsed?.dashboardSubtab) === "growth"
        ? "guide"
        : normalizeDashboardSubtab(parsed?.dashboardSubtab),
      resultsView: normalizeDashboardResultsView(
        parsed?.dashboardSubtab === "calendar" ? "harvestStart" : parsed?.resultsView
      ),
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
      seedlingStatusView: "beds",
      dashboardSubtab: "guide",
      resultsView: "calendar",
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
    : (activeSubtab === "growth"
      ? {
          tabsId: "dashboardGrowthBuildingTabs",
          selector: "[data-dashboard-growth-building].active"
        }
      : (activeSubtab === "guide" && getDashboardHarvestForecastView() === "beds"
        ? {
            tabsId: "dashboardHarvestForecastBuildingTabs",
            selector: "[data-dashboard-forecast-building].active"
          }
        : null));
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
  syncDashboardResultsViewUi();
  scheduleDashboardSelectedBuildingButtonReveal(activeSubtab);
}

function syncDashboardResultsViewUi(){
  const activeView = normalizeDashboardResultsView(dashboardFilter.resultsView);
  dashboardFilter.resultsView = activeView;
  document.querySelectorAll("[data-dashboard-results-view]").forEach(button => {
    const isActive = button.dataset.dashboardResultsView === activeView;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
    button.tabIndex = isActive ? 0 : -1;
  });
  document.querySelectorAll("[data-dashboard-results-view-panel]").forEach(panel => {
    panel.hidden = panel.dataset.dashboardResultsViewPanel !== activeView;
  });
}

function setDashboardResultsView(value){
  const nextView = normalizeDashboardResultsView(value);
  if(dashboardFilter.resultsView !== nextView){
    dashboardFilter.resultsView = nextView;
    saveDashboardFilter();
  }
  syncDashboardResultsViewUi();
  if(nextView === "harvestStart"){
    renderDashboardHarvestStartTimeline();
  }else if(nextView === "graphs"){
    renderDashboardGraphs();
  }else{
    renderDashboardRecordResults();
  }
}

function handleDashboardResultsViewKeydown(event){
  if(!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const buttons = Array.from(document.querySelectorAll("[data-dashboard-results-view]"));
  if(!buttons.length) return;
  const currentIndex = Math.max(0, buttons.indexOf(event.target));
  let nextIndex = currentIndex;
  if(event.key === "Home") nextIndex = 0;
  if(event.key === "End") nextIndex = buttons.length - 1;
  if(event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
  if(event.key === "ArrowRight") nextIndex = (currentIndex + 1) % buttons.length;
  event.preventDefault();
  const nextButton = buttons[nextIndex];
  setDashboardResultsView(nextButton?.dataset.dashboardResultsView);
  nextButton?.focus();
}

function setDashboardSubtab(value){
  const nextSubtab = normalizeDashboardSubtab(value);
  if(nextSubtab !== "seedlings" && dashboardSeedlingStatusDetailOpen){
    closeDashboardSeedlingStatusDetail({ restoreFocus: false });
  }
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
          formatPlantingQualityMemo(getPlantingQualityMemoSummary(event))
        ].join("\n");
      }).join("\n");
  return [
    record?.date || "",
    getDashboardRecordTypeLabel(record),
    String(record?.cases || ""),
    getHarvestRecordCaseDisplayText(record, harvestCaseTotalsByDate),
    record?.actualLoss || "",
    formatDashboardBuildings(record),
    record?.type === "partialHarvest" ? "" : formatHarvestGrowthAssessment(record),
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
    formatPlantingQualityMemo(getPlantingQualityMemoSummary(event)),
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
    <div class="dashboardRecordCalendarFrame">
      <div class="dashboardRecordCalendarWeekdays" aria-hidden="true">
        ${["日", "月", "火", "水", "木", "金", "土"].map((label, index) => `<span class="${index === 0 ? "is-sunday" : (index === 6 ? "is-saturday" : "")}">${label}</span>`).join("")}
      </div>
      <div class="dashboardRecordCalendarGrid">${dayCells}</div>
    </div>
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
  dashboardGrowthPredictionModelCache = null;
  dashboardRenderedSubtabs.delete("growth");
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

function getDashboardSeedlingPlantingCountClass(value){
  const plantingCount = Number(value);
  return ALLOWED_YIELDS.includes(plantingCount)
    ? `is-planting-count-${plantingCount}`
    : "is-planting-count-unrecorded";
}

function getDashboardSeedlingQualitySortOrder(qualityClass){
  const order = {
    "is-large": 0,
    "": 1,
    "is-small": 2,
    "is-problem": 3,
    "is-mixed": 4,
    "is-unknown": 5
  };
  return Object.prototype.hasOwnProperty.call(order, qualityClass) ? order[qualityClass] : 6;
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
    const qualityMemo = getPlantingQualityMemoForPallet(status.event, palletKey);
    const qualityText = formatPlantingQualityMemo(qualityMemo);
    const plantingDateText = formatDateOnlyString(status.plantingDate);
    const plantingCount = Number(status.event?.plantingCountsByPallet?.[palletKey]);
    const normalizedPlantingCount = ALLOWED_YIELDS.includes(plantingCount) ? plantingCount : null;
    const plantingCountText = normalizedPlantingCount === null
      ? "株数未記録"
      : `${normalizedPlantingCount}植え`;
    const qualityClass = getDashboardSeedlingQualityClass(qualityMemo);
    const lotKey = `${plantingDateText}\n${plantingCountText}`;
    const lots = bedLotMaps.get(bedKey);
    if(!lots.has(lotKey)){
      lots.set(lotKey, {
        plantingDate: status.plantingDate,
        plantingCount: normalizedPlantingCount,
        plantingCountText,
        plantingCountClass: getDashboardSeedlingPlantingCountClass(normalizedPlantingCount),
        qualityGroupsByKey: new Map(),
        palletCount: 0,
        firstPalletNumber: pallet.number,
        palletNumbers: []
      });
    }
    const lot = lots.get(lotKey);
    const qualityKey = `${qualityClass}\n${qualityText}`;
    if(!lot.qualityGroupsByKey.has(qualityKey)){
      lot.qualityGroupsByKey.set(qualityKey, {
        qualityText,
        qualityClass,
        palletCount: 0
      });
    }
    lot.qualityGroupsByKey.get(qualityKey).palletCount += 1;
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
        plantingCountText: "未定植",
        plantingCountClass: "is-unplanted",
        qualityGroups: [],
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
      .map(lot => {
        const { qualityGroupsByKey, ...statusLot } = lot;
        return {
          ...statusLot,
          qualityGroups: lot.isUnplanted
            ? []
            : [...qualityGroupsByKey.values()].sort((left, right) => (
              getDashboardSeedlingQualitySortOrder(left.qualityClass)
              - getDashboardSeedlingQualitySortOrder(right.qualityClass)
              || left.qualityText.localeCompare(right.qualityText, "ja")
            )),
          ageDays: lot.isUnplanted
            ? null
            : Math.max(0, getLocalDayDiff(lot.plantingDate, referenceDay))
        };
      })
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

  const qualityMemo = getPlantingQualityMemoForPallet(status.event, getPalletKey(building, bed, number));
  const qualityText = formatPlantingQualityMemo(qualityMemo);
  const plantingCount = Number(status.event?.plantingCountsByPallet?.[getPalletKey(building, bed, number)]);
  const normalizedPlantingCount = ALLOWED_YIELDS.includes(plantingCount) ? plantingCount : null;
  const plantingCountText = normalizedPlantingCount === null ? "株数未記録" : `${normalizedPlantingCount}植え`;
  const plantingCountClass = getDashboardSeedlingPlantingCountClass(normalizedPlantingCount);
  const ageDays = Math.max(0, getLocalDayDiff(status.plantingDate, model.referenceDate));
  const label = `${number}番 ${qualityText} ${plantingCountText} ${ageDays}日経過`;
  return `<span class="dashboardSeedlingBedMapCell ${plantingCountClass}${sectionStart ? " is-section-start" : ""}" data-dashboard-seedling-pallet-number="${number}" title="${escapeHtml(label)}"></span>`;
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

function getDashboardSeedlingStatusLotHtml(lot){
  const qualityGroups = Array.isArray(lot.qualityGroups) ? lot.qualityGroups : [];
  return `
    <span class="dashboardSeedlingStatusLotItem${lot.isUnplanted ? " is-unplanted" : ""}">
      <span class="dashboardSeedlingStatusLot${lot.isUnplanted ? " is-unplanted" : ""}">
        <span class="dashboardSeedlingStatusLotHeader">
          <span class="dashboardSeedlingStatusPlantingCount ${lot.plantingCountClass}">
            ${lot.isUnplanted ? "" : `<span class="dashboardSeedlingStatusPlantingCountSwatch" aria-hidden="true"></span>`}
            ${escapeHtml(lot.plantingCountText)}
          </span>
        </span>
        ${lot.isUnplanted ? "" : `
          <span class="dashboardSeedlingStatusQualitySummary">
            <span class="dashboardSeedlingStatusQualityLabel">品質</span>
            ${qualityGroups.map(group => `
              <span class="dashboardSeedlingStatusQuality ${group.qualityClass}">${escapeHtml(group.qualityText)} ${group.palletCount}</span>
            `).join("")}
          </span>
        `}
      </span>
    </span>
  `;
}

function getDashboardSeedlingStatusDateGroups(lots){
  const groups = [];
  const groupsByDate = new Map();
  (Array.isArray(lots) ? lots : []).forEach((lot, index) => {
    if(lot.isUnplanted){
      groups.push({ isUnplanted: true, entries: [{ lot, index }] });
      return;
    }
    const plantingDateText = formatDateOnlyString(lot.plantingDate);
    if(!groupsByDate.has(plantingDateText)){
      const group = {
        plantingDateText,
        ageDays: lot.ageDays,
        entries: []
      };
      groupsByDate.set(plantingDateText, group);
      groups.push(group);
    }
    groupsByDate.get(plantingDateText).entries.push({ lot, index });
  });
  const plantingCountOrder = new Map([12, 16, 20].map((count, index) => [count, index]));
  groups.forEach(group => {
    if(group.isUnplanted) return;
    group.entries.sort((left, right) => (
      (plantingCountOrder.get(left.lot.plantingCount) ?? ALLOWED_YIELDS.length)
      - (plantingCountOrder.get(right.lot.plantingCount) ?? ALLOWED_YIELDS.length)
    ));
    group.palletNumbers = group.entries.flatMap(entry => entry.lot.palletNumbers);
    group.palletCount = group.palletNumbers.length;
  });
  const plantedGroups = groups
    .filter(group => !group.isUnplanted)
    .sort((left, right) => (
      left.ageDays - right.ageDays
      || right.plantingDateText.localeCompare(left.plantingDateText)
    ));
  plantedGroups.forEach((group, index) => {
    group.selectionIndex = index;
  });
  return [
    ...plantedGroups,
    ...groups.filter(group => group.isUnplanted)
  ];
}

function getDashboardSeedlingStatusDateGroupHtml(group, selectedIndex){
  if(group.isUnplanted){
    const entry = group.entries[0];
    return `<div class="dashboardSeedlingStatusDateGroup is-unplanted">${getDashboardSeedlingStatusLotHtml(
      entry.lot
    )}</div>`;
  }
  const isSelected = selectedIndex === group.selectionIndex;
  const countSummary = group.entries.map(entry => entry.lot.plantingCountText).join("、");
  return `
    <div class="dashboardSeedlingStatusDateGroup${isSelected ? " is-selected" : ""}"
      data-dashboard-seedling-date-index="${group.selectionIndex}">
      <button type="button" class="dashboardSeedlingStatusDateSelect"
        data-ui-click="setDashboardSeedlingStatusDate" data-ui-number="${group.selectionIndex}"
        aria-pressed="${isSelected ? "true" : "false"}"
        aria-label="${group.ageDays}日経過、${escapeHtml(countSummary)}を配置図で表示">
        <span class="dashboardSeedlingStatusDateHeader">
          <span class="dashboardSeedlingStatusAge">${group.ageDays}日経過</span>
        </span>
        <span class="dashboardSeedlingStatusCountGroups">
          ${group.entries.map(entry => getDashboardSeedlingStatusLotHtml(entry.lot)).join("")}
        </span>
      </button>
      <button type="button" class="dashboardSeedlingStatusRecordLink"
        data-ui-click="openRecordHistoryFromDashboardSeedlingStatus" data-ui-arg="${escapeHtml(group.plantingDateText)}"
        aria-label="${escapeHtml(group.plantingDateText)}の記録へ移動">
        記録へ <span aria-hidden="true">›</span>
      </button>
    </div>
  `;
}

function openRecordHistoryFromDashboardSeedlingStatus(dateString){
  const date = String(dateString || "").trim();
  if(!parseDateOnlyString(date)){
    showToast("移動する記録の日付を確認できませんでした");
    return false;
  }
  if(!switchTab("record")) return false;
  showRecordHistoryView({ date, scroll:true, returnTo:"dashboard-seedlings" });
  return true;
}

function clearDashboardSeedlingStatusDateSelectionUi(){
  document.querySelectorAll("#dashboardSeedlingStatusDetail .dashboardSeedlingStatusLots.has-date-selection")
    .forEach(container => container.classList.remove("has-date-selection"));
  document.querySelectorAll("#dashboardSeedlingStatusDetail .dashboardSeedlingStatusDateGroup.is-selected")
    .forEach(group => group.classList.remove("is-selected"));
  document.querySelectorAll("#dashboardSeedlingStatusDetail .dashboardSeedlingStatusDateSelect[aria-pressed='true']")
    .forEach(button => {
      button.setAttribute("aria-pressed", "false");
    });
  document.getElementById("dashboardSeedlingStatusBeds")?.classList.remove("has-date-selection");
  document.querySelectorAll(".dashboardSeedlingStatusBed.has-date-selection").forEach(bedButton => {
    bedButton.classList.remove("has-date-selection");
    bedButton.querySelectorAll(".dashboardSeedlingBedMapCell").forEach(cell => {
      cell.classList.remove(
        "is-date-selected",
        "is-date-edge-top",
        "is-date-edge-right",
        "is-date-edge-bottom",
        "is-date-edge-left"
      );
    });
  });
}

function applyDashboardSeedlingStatusDateSelection(dateGroups, bed){
  const selectedIndex = dashboardSeedlingStatusSelectedDateIndex;
  const selectedGroup = (Array.isArray(dateGroups) ? dateGroups : [])
    .find(group => !group.isUnplanted && group.selectionIndex === selectedIndex);
  const selectedNumbers = new Set((selectedGroup?.palletNumbers || [])
    .map(Number)
    .filter(number => Number.isInteger(number) && number >= 1 && number <= PALLETS_PER_BED));
  const hasSelection = selectedNumbers.size > 0;

  const detailLots = document.querySelector("#dashboardSeedlingStatusDetail .dashboardSeedlingStatusLots");
  detailLots?.classList.toggle("has-date-selection", hasSelection);
  detailLots?.querySelectorAll("[data-dashboard-seedling-date-index]").forEach(dateGroup => {
    const isSelected = hasSelection
      && Number(dateGroup.dataset.dashboardSeedlingDateIndex) === selectedIndex;
    dateGroup.classList.toggle("is-selected", isSelected);
    dateGroup.querySelector(".dashboardSeedlingStatusDateSelect")
      ?.setAttribute("aria-pressed", isSelected ? "true" : "false");
  });

  document.getElementById("dashboardSeedlingStatusBeds")
    ?.classList.toggle("has-date-selection", hasSelection);
  const bedButton = document.querySelector(`[data-dashboard-seedling-bed="${bed}"]`);
  document.querySelectorAll(".dashboardSeedlingStatusBed.has-date-selection").forEach(previousBed => {
    if(hasSelection && previousBed === bedButton) return;
    previousBed.classList.remove("has-date-selection");
    previousBed.querySelectorAll(
      ".is-date-selected, .is-date-edge-top, .is-date-edge-right, .is-date-edge-bottom, .is-date-edge-left"
    ).forEach(cell => {
      cell.classList.remove(
        "is-date-selected",
        "is-date-edge-top",
        "is-date-edge-right",
        "is-date-edge-bottom",
        "is-date-edge-left"
      );
    });
  });
  if(!hasSelection || !bedButton) return;

  bedButton.classList.add("has-date-selection");
  bedButton.querySelectorAll("[data-dashboard-seedling-pallet-number]").forEach(cell => {
    const number = Number(cell.dataset.dashboardSeedlingPalletNumber);
    const isSelected = selectedNumbers.has(number);
    const hasLeftNeighbor = number % 2 === 0 && selectedNumbers.has(number - 1);
    const hasRightNeighbor = number % 2 === 1 && selectedNumbers.has(number + 1);
    cell.classList.toggle("is-date-selected", isSelected);
    cell.classList.toggle("is-date-edge-top", isSelected && !selectedNumbers.has(number + 2));
    cell.classList.toggle("is-date-edge-right", isSelected && !hasRightNeighbor);
    cell.classList.toggle("is-date-edge-bottom", isSelected && !selectedNumbers.has(number - 2));
    cell.classList.toggle("is-date-edge-left", isSelected && !hasLeftNeighbor);
  });
}

function getDashboardSeedlingStatusViewportBottom(){
  const viewportBottom = window.innerHeight - 12;
  const tabBar = document.querySelector(".tabBar");
  if(!tabBar) return viewportBottom;
  const tabBarRect = tabBar.getBoundingClientRect();
  if(tabBarRect.height <= 0 || tabBarRect.top <= 0) return viewportBottom;
  return Math.min(viewportBottom, tabBarRect.top - 8);
}

function positionDashboardSeedlingStatusDetail(options = {}){
  if(!dashboardSeedlingStatusDetailOpen) return false;
  const detail = document.getElementById("dashboardSeedlingStatusDetail");
  const bedButton = document.querySelector(
    `[data-dashboard-seedling-bed="${dashboardSeedlingStatusSelectedBed}"]`
  );
  if(!detail || detail.hidden || !bedButton) return false;

  const viewportTop = 12;
  let viewportBottom = getDashboardSeedlingStatusViewportBottom();
  let bedRect = bedButton.getBoundingClientRect();
  const desiredHeight = Math.min(detail.scrollHeight, 420);
  const minimumUsefulHeight = Math.min(desiredHeight, 150);
  const getSpace = () => ({
    above: Math.max(0, bedRect.top - viewportTop - 8),
    below: Math.max(0, viewportBottom - bedRect.bottom - 8)
  });
  let space = getSpace();
  const bedIsFullyVisible = bedRect.top >= viewportTop && bedRect.bottom <= viewportBottom;
  const hasUsefulSpace = Math.max(space.above, space.below) >= minimumUsefulHeight;

  if(options.ensureBedVisible && (!bedIsFullyVisible || !hasUsefulSpace)){
    window.scrollBy({ top: bedRect.top - viewportTop, left: 0, behavior: "auto" });
    viewportBottom = getDashboardSeedlingStatusViewportBottom();
    bedRect = bedButton.getBoundingClientRect();
    space = getSpace();
  }else if(bedRect.bottom <= viewportTop || bedRect.top >= viewportBottom){
    closeDashboardSeedlingStatusDetail({ restoreFocus: false });
    return false;
  }

  const placeBelow = space.below >= minimumUsefulHeight || space.below >= space.above;
  const availableHeight = Math.max(72, placeBelow ? space.below : space.above);
  detail.style.maxHeight = `${availableHeight}px`;
  const renderedHeight = Math.min(detail.scrollHeight, availableHeight);
  const top = placeBelow
    ? bedRect.bottom + 8
    : bedRect.top - 8 - renderedHeight;
  const width = detail.offsetWidth;
  const centeredLeft = bedRect.left + (bedRect.width - width) / 2;
  const left = Math.min(
    Math.max(12, centeredLeft),
    Math.max(12, window.innerWidth - width - 12)
  );
  detail.style.top = `${Math.max(viewportTop, top)}px`;
  detail.style.left = `${left}px`;
  return true;
}

function scheduleDashboardSeedlingStatusDetailPosition(options = {}){
  if(dashboardSeedlingStatusDetailPositionFrame){
    cancelAnimationFrame(dashboardSeedlingStatusDetailPositionFrame);
  }
  dashboardSeedlingStatusDetailPositionFrame = requestAnimationFrame(() => {
    dashboardSeedlingStatusDetailPositionFrame = 0;
    positionDashboardSeedlingStatusDetail(options);
  });
}

function closeDashboardSeedlingStatusDetail(options = {}){
  const detail = document.getElementById("dashboardSeedlingStatusDetail");
  const selectedBed = dashboardSeedlingStatusSelectedBed;
  dashboardSeedlingStatusDetailOpen = false;
  dashboardSeedlingStatusSelectedDateIndex = null;
  if(dashboardSeedlingStatusDetailPositionFrame){
    cancelAnimationFrame(dashboardSeedlingStatusDetailPositionFrame);
    dashboardSeedlingStatusDetailPositionFrame = 0;
  }
  clearDashboardSeedlingStatusDateSelectionUi();
  document.querySelectorAll("[data-dashboard-seedling-bed]").forEach(button => {
    button.setAttribute("aria-expanded", "false");
  });
  if(detail){
    detail.hidden = true;
    detail.style.removeProperty("top");
    detail.style.removeProperty("left");
    detail.style.removeProperty("max-height");
  }
  if(options.restoreFocus !== false){
    document.querySelector(`[data-dashboard-seedling-bed="${selectedBed}"]`)
      ?.focus({ preventScroll: true });
  }
}

function renderDashboardSeedlingStatusDetail(model, building){
  const detail = document.getElementById("dashboardSeedlingStatusDetail");
  if(!detail) return;
  const bed = bedMap.includes(dashboardSeedlingStatusSelectedBed)
    ? dashboardSeedlingStatusSelectedBed
    : bedMap[0];
  const lots = model.bedLots.get(`${building}-${bed}`) || [];
  const dateGroups = getDashboardSeedlingStatusDateGroups(lots);
  const selectableDateCount = dateGroups.filter(group => !group.isUnplanted).length;
  if(!Number.isInteger(dashboardSeedlingStatusSelectedDateIndex)
    || dashboardSeedlingStatusSelectedDateIndex < 0
    || dashboardSeedlingStatusSelectedDateIndex >= selectableDateCount){
    dashboardSeedlingStatusSelectedDateIndex = null;
  }
  detail.innerHTML = `
    <div class="dashboardSeedlingStatusDetailHeader">
      <div class="dashboardSeedlingStatusDetailHeading">
        <span id="dashboardSeedlingStatusDetailTitle" class="dashboardSeedlingStatusDetailTitle">${bed}ベッドの詳細</span>
      </div>
      <button type="button" class="dashboardSeedlingStatusDetailClose"
        data-ui-click="closeDashboardSeedlingStatusDetail" aria-label="詳細を閉じる">×</button>
    </div>
    <div class="dashboardSeedlingStatusLots dashboardSeedlingStatusDetailLots">
      ${dateGroups.map(group => (
        getDashboardSeedlingStatusDateGroupHtml(group, dashboardSeedlingStatusSelectedDateIndex)
      )).join("")}
    </div>
  `;
  detail.hidden = !dashboardSeedlingStatusDetailOpen;
  applyDashboardSeedlingStatusDateSelection(dateGroups, bed);
  if(dashboardSeedlingStatusDetailOpen){
    scheduleDashboardSeedlingStatusDetailPosition();
  }
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
        aria-haspopup="dialog" aria-controls="dashboardSeedlingStatusDetail"
        aria-expanded="${isSelected && dashboardSeedlingStatusDetailOpen ? "true" : "false"}"
        aria-label="${bed}ベッド ${escapeHtml(ageAriaLabel)}。詳細を表示。選択中に繰り返しタップすると表示を切り替え">
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

function getDashboardSeedlingStatusAgeItems(model){
  const groupsByDate = new Map();
  BUILDINGS.forEach(building => {
    bedOrder.forEach(bed => {
      const lots = model.bedLots.get(`${building}-${bed}`) || [];
      getDashboardSeedlingStatusDateGroups(lots)
        .filter(group => !group.isUnplanted)
        .forEach(group => {
          if(!groupsByDate.has(group.plantingDateText)){
            groupsByDate.set(group.plantingDateText, {
              plantingDateText: group.plantingDateText,
              ageDays: group.ageDays,
              palletKeys: [],
              plantingCounts: new Map()
            });
          }
          const item = groupsByDate.get(group.plantingDateText);
          item.palletKeys.push(...group.palletNumbers.map(number => (
            getPalletKey(building, bed, number)
          )));
          group.entries.forEach(entry => {
            const lot = entry.lot;
            const countKey = lot.plantingCount === null ? "unrecorded" : String(lot.plantingCount);
            if(!item.plantingCounts.has(countKey)){
              item.plantingCounts.set(countKey, {
                plantingCount: lot.plantingCount,
                plantingCountText: lot.plantingCountText,
                plantingCountClass: lot.plantingCountClass,
                palletCount: 0
              });
            }
            item.plantingCounts.get(countKey).palletCount += lot.palletCount;
          });
        });
    });
  });
  const plantingCountOrder = new Map([12, 16, 20].map((count, index) => [count, index]));
  return [...groupsByDate.values()].map(item => ({
    ...item,
    palletKeys: [...new Set(item.palletKeys)].sort((left, right) => (
      getOrderIndexFromKey(left) - getOrderIndexFromKey(right)
    )),
    locationText: formatDashboardForecastDailyLocations(item.palletKeys),
    plantingCounts: [...item.plantingCounts.values()].sort((left, right) => (
      (plantingCountOrder.get(left.plantingCount) ?? ALLOWED_YIELDS.length)
      - (plantingCountOrder.get(right.plantingCount) ?? ALLOWED_YIELDS.length)
    ))
  })).sort((left, right) => (
    right.ageDays - left.ageDays
    || left.plantingDateText.localeCompare(right.plantingDateText)
  ));
}

function getDashboardSeedlingStatusAgePlantingCountsHtml(item){
  return item.plantingCounts.map(count => `
    <span class="dashboardSeedlingStatusAgePlantingCount ${count.plantingCountClass}">
      <span class="dashboardSeedlingStatusPlantingCountSwatch" aria-hidden="true"></span>
      <span>${escapeHtml(count.plantingCountText)}×${count.palletCount}</span>
    </span>
  `).join("");
}

function renderDashboardSeedlingStatusAgeList(model){
  const container = document.getElementById("dashboardSeedlingStatusAgeList");
  if(!container) return;
  const items = getDashboardSeedlingStatusAgeItems(model);
  if(!items.length){
    container.innerHTML = '<div class="dashboardSeedlingStatusAgeEmpty">二次定植の記録はありません。</div>';
    return;
  }
  container.innerHTML = `
    <div class="dashboardForecastDayHeader dashboardSeedlingStatusAgeHeader" aria-hidden="true">
      <span>日数</span><span>定植日</span><span>二次定植場所</span><span>植え付け数</span>
    </div>
    ${items.map(item => `
      <div class="dashboardForecastDayRow dashboardSeedlingStatusAgeRow">
        <span class="dashboardForecastDayDelay">${item.ageDays}日</span>
        <span class="dashboardForecastDayDate">${escapeHtml(formatDashboardForecastDate(
          parseDateOnlyString(item.plantingDateText)
        ))}</span>
        <span class="dashboardForecastDayLocation">${getDashboardForecastDailyLocationHtml(item.locationText)}</span>
        <span class="dashboardSeedlingStatusAgePlantingCounts">${getDashboardSeedlingStatusAgePlantingCountsHtml(item)}</span>
      </div>
    `).join("")}
  `;
}

function getDashboardSeedlingStatusView(){
  return dashboardFilter.seedlingStatusView === "ages" ? "ages" : "beds";
}

function renderDashboardSeedlingStatusView(model){
  const view = getDashboardSeedlingStatusView();
  const showAges = view === "ages";
  const tabs = document.getElementById("dashboardSeedlingStatusBuildingTabs");
  const beds = document.getElementById("dashboardSeedlingStatusBeds");
  const ageList = document.getElementById("dashboardSeedlingStatusAgeList");
  const mapGuide = document.getElementById("dashboardSeedlingStatusMapGuide");
  document.querySelectorAll("[data-dashboard-seedling-view]").forEach(button => {
    const active = button.dataset.dashboardSeedlingView === view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  if(tabs) tabs.hidden = showAges;
  if(beds) beds.hidden = showAges;
  if(ageList) ageList.hidden = !showAges;
  if(mapGuide) mapGuide.hidden = showAges;
  if(showAges){
    renderDashboardSeedlingStatusAgeList(model);
  }else{
    renderDashboardSeedlingStatusBeds(model);
    scheduleDashboardSelectedBuildingButtonReveal("seedlings");
  }
}

function setDashboardSeedlingStatusView(view){
  const normalized = view === "ages" ? "ages" : "beds";
  if(normalized === "ages" && dashboardSeedlingStatusDetailOpen){
    closeDashboardSeedlingStatusDetail({ restoreFocus: false });
  }
  dashboardFilter.seedlingStatusView = normalized;
  saveDashboardFilter();
  const model = dashboardSeedlingStatusModelCache || buildDashboardSeedlingStatusModel();
  renderDashboardSeedlingStatusView(model);
}

function setDashboardSeedlingStatusDate(index){
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
  const dateGroups = getDashboardSeedlingStatusDateGroups(lots);
  const selectableDateCount = dateGroups.filter(group => !group.isUnplanted).length;
  if(normalized < 0 || normalized >= selectableDateCount) return;

  dashboardSeedlingStatusSelectedDateIndex = dashboardSeedlingStatusSelectedDateIndex === normalized
    ? null
    : normalized;
  applyDashboardSeedlingStatusDateSelection(dateGroups, bed);
}

function getNextDashboardSeedlingStatusDateIndex(dateGroups){
  const dateCount = (Array.isArray(dateGroups) ? dateGroups : [])
    .filter(group => !group.isUnplanted).length;
  if(!dateCount) return null;
  const currentIndex = dashboardSeedlingStatusSelectedDateIndex;
  if(!Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex >= dateCount){
    return 0;
  }
  return (currentIndex + 1) % dateCount;
}

function setDashboardSeedlingStatusBed(bed){
  if(!bedMap.includes(bed)) return;
  const isSameBed = dashboardSeedlingStatusSelectedBed === bed;
  const detail = document.getElementById("dashboardSeedlingStatusDetail");
  const canUpdateSelectionOnly = isSameBed
    && dashboardSeedlingStatusDetailOpen
    && detail
    && !detail.hidden;
  if(!isSameBed) dashboardSeedlingStatusSelectedDateIndex = null;
  dashboardSeedlingStatusSelectedBed = bed;
  dashboardSeedlingStatusDetailOpen = true;
  document.querySelectorAll("[data-dashboard-seedling-bed]").forEach(button => {
    const isSelected = button.dataset.dashboardSeedlingBed === bed;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", isSelected ? "true" : "false");
    button.setAttribute("aria-expanded", isSelected ? "true" : "false");
  });
  const building = BUILDINGS.includes(dashboardSeedlingStatusBuilding)
    ? dashboardSeedlingStatusBuilding
    : BUILDINGS[0];
  const model = dashboardSeedlingStatusModelCache || buildDashboardSeedlingStatusModel();
  const lots = model.bedLots.get(`${building}-${bed}`) || [];
  const dateGroups = getDashboardSeedlingStatusDateGroups(lots);
  dashboardSeedlingStatusSelectedDateIndex = getNextDashboardSeedlingStatusDateIndex(dateGroups);
  if(canUpdateSelectionOnly){
    applyDashboardSeedlingStatusDateSelection(dateGroups, bed);
    return;
  }
  renderDashboardSeedlingStatusDetail(model, building);
  scheduleDashboardSeedlingStatusDetailPosition({ ensureBedVisible: true });
}

function setDashboardSeedlingStatusBuilding(building){
  const normalized = Number(building);
  if(!BUILDINGS.includes(normalized)) return;
  if(dashboardSeedlingStatusBuilding !== normalized){
    dashboardSeedlingStatusSelectedDateIndex = null;
    dashboardSeedlingStatusDetailOpen = false;
  }
  dashboardSeedlingStatusBuilding = normalized;
  document.querySelectorAll("[data-dashboard-seedling-building]").forEach(button => {
    button.classList.toggle("active", Number(button.dataset.dashboardSeedlingBuilding) === normalized);
  });
  const model = dashboardSeedlingStatusModelCache || buildDashboardSeedlingStatusModel();
  renderDashboardSeedlingStatusView(model);
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
  renderDashboardSeedlingStatusView(model);
}

// ===== 集計：生育予測β =====
const DASHBOARD_GROWTH_NORMAL_RATIO_MIN = 0.88;
const DASHBOARD_GROWTH_NORMAL_RATIO_MAX = 1.12;

function normalizeDashboardGrowthLocation(value){
  if(!value || typeof value !== "object" || Array.isArray(value)) return null;
  const officeCode = String(value.officeCode || "").trim();
  const forecastAreaCode = String(value.forecastAreaCode || "").trim();
  const class20Code = String(value.class20Code || "").trim();
  if(!/^\d{6}$/.test(officeCode) || !/^\d{6}$/.test(forecastAreaCode) || !/^\d{7}$/.test(class20Code)) return null;
  return {
    officeCode,
    forecastAreaCode,
    class20Code,
    name:String(value.name || "設定地点").trim().slice(0, 100) || "設定地点",
    admin1:String(value.admin1 || "").trim().slice(0, 100),
    forecastAreaName:String(value.forecastAreaName || "").trim().slice(0, 100)
  };
}

function getDashboardGrowthLocation(){
  return normalizeDashboardGrowthLocation(
    harvestnaviLocalStorage.readJson(DASHBOARD_GROWTH_LOCATION_KEY, null)
  );
}

function getDashboardGrowthLocationKey(location){
  const normalized = normalizeDashboardGrowthLocation(location);
  return normalized ? `${normalized.officeCode}:${normalized.forecastAreaCode}:${normalized.class20Code}` : "";
}

function getDashboardGrowthLocationDisplayName(location){
  const normalized = normalizeDashboardGrowthLocation(location);
  if(!normalized) return "未設定";
  const area = normalized.forecastAreaName && normalized.forecastAreaName !== normalized.name
    ? `（${normalized.forecastAreaName}）`
    : "";
  return `${normalized.name}${area}`;
}

function saveDashboardGrowthLocation(location){
  const normalized = normalizeDashboardGrowthLocation(location);
  if(!normalized) return false;
  const previousKey = getDashboardGrowthLocationKey(getDashboardGrowthLocation());
  harvestnaviLocalStorage.writeJson(DASHBOARD_GROWTH_LOCATION_KEY, normalized);
  if(previousKey !== getDashboardGrowthLocationKey(normalized)){
    dashboardGrowthPredictionModelCache = null;
    dashboardRenderedSubtabs.delete("growth");
  }
  return true;
}

function getDashboardGrowthWeatherCache(location){
  const cache = harvestnaviLocalStorage.readJson(DASHBOARD_GROWTH_WEATHER_CACHE_KEY, null);
  if(!cache || typeof cache !== "object" || Array.isArray(cache)) return null;
  if(Number(cache.schemaVersion || 0) !== 3) return null;
  if(cache.locationKey !== getDashboardGrowthLocationKey(location)) return null;
  if(!Array.isArray(cache.daily) || !cache.daily.length) return null;
  return cache;
}

function setDashboardGrowthLoading(loading){
  const loadingState = document.getElementById("dashboardGrowthLoading");
  const content = document.getElementById("dashboardGrowthContent");
  const refreshButton = document.getElementById("dashboardGrowthRefreshBtn");
  if(loadingState) loadingState.hidden = !loading;
  if(content && loading) content.hidden = true;
  if(refreshButton) refreshButton.disabled = loading;
}

async function fetchDashboardGrowthJson(url, timeoutMs = 12000, cacheMode = "no-store"){
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeoutId = setTimeout(() => controller?.abort(), timeoutMs);
  try{
    const response = await fetch(url, {
      method:"GET",
      cache:cacheMode,
      signal:controller?.signal
    });
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  }finally{
    clearTimeout(timeoutId);
  }
}

function getDashboardGrowthLightIndex(weatherCode){
  const group = Math.floor(Number(weatherCode) / 100);
  if(group === 1) return 1.12;
  if(group === 2) return 0.76;
  if(group === 3) return 0.52;
  if(group === 4) return 0.44;
  return 0.8;
}

function getDashboardGrowthLightIndexFromSunshineHours(sunshineHours){
  const hours = Number(sunshineHours);
  if(!Number.isFinite(hours)) return null;
  return Math.max(0.3, Math.min(1.2, hours / 8));
}

function getDashboardGrowthForecastNumber(value){
  if(value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function buildDashboardGrowthDailyWeather(forecastPayload, location){
  const reports = Array.isArray(forecastPayload) ? forecastPayload : [];
  const shortReport = reports[0] || {};
  const weeklyReport = reports[1] || {};
  const dailyByDate = new Map();
  const ensureDay = dateKey => {
    if(!parseDateOnlyString(dateKey)) return null;
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
      day.lightIndex = getDashboardGrowthLightIndex(weatherCode);
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
  const shortWeatherArea = shortWeatherSeries?.areas?.find(area => area?.area?.code === location.forecastAreaCode);
  (shortWeatherSeries?.timeDefines || []).forEach((time, index) => {
    const day = ensureDay(String(time || "").slice(0, 10));
    if(!day) return;
    const weatherCode = Number(shortWeatherArea?.weatherCodes?.[index]);
    if(Number.isFinite(weatherCode)){
      day.weatherCode = weatherCode;
      day.lightIndex = getDashboardGrowthLightIndex(weatherCode);
    }
  });

  const weeklyTempSeries = (weeklyReport.timeSeries || []).find(series => (
    Array.isArray(series?.areas) && series.areas.some(area => Array.isArray(area?.tempsMax))
  ));
  const weeklyTempArea = weeklyTempSeries?.areas?.[0];
  (weeklyTempSeries?.timeDefines || []).forEach((time, index) => {
    const day = ensureDay(String(time || "").slice(0, 10));
    if(!day) return;
    const minTemp = getDashboardGrowthForecastNumber(weeklyTempArea?.tempsMin?.[index]);
    const maxTemp = getDashboardGrowthForecastNumber(weeklyTempArea?.tempsMax?.[index]);
    if(minTemp !== null) day.minTemp = minTemp;
    if(maxTemp !== null) day.maxTemp = maxTemp;
  });

  const shortTempSeries = (shortReport.timeSeries || []).find(series => (
    Array.isArray(series?.areas) && series.areas.some(area => Array.isArray(area?.temps))
  ));
  const shortTempArea = shortTempSeries?.areas?.[shortWeatherAreaIndex] || shortTempSeries?.areas?.[0];
  (shortTempSeries?.timeDefines || []).forEach((time, index) => {
    const day = ensureDay(String(time || "").slice(0, 10));
    const temperature = getDashboardGrowthForecastNumber(shortTempArea?.temps?.[index]);
    if(!day || temperature === null) return;
    const hour = Number(String(time || "").slice(11, 13));
    if(Number.isFinite(hour) && hour <= 6) day.minTemp = temperature;
    else day.maxTemp = temperature;
  });

  const normalArea = weeklyReport?.tempAverage?.areas?.[0] || {};
  const normalMin = getDashboardGrowthForecastNumber(normalArea.min);
  const normalMax = getDashboardGrowthForecastNumber(normalArea.max);
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

function getDashboardGrowthRequiredHistoryStartDate(){
  const cutoff = addDays(startOfLocalDay(new Date()), -730);
  const plantingIndex = buildDashboardGrowthPlantingIndex();
  let earliest = cutoff;
  records.forEach(record => {
    if(record?.type === "partialHarvest") return;
    const harvestDate = parseDateOnlyString(String(record?.date || ""));
    if(!harvestDate || harvestDate.getTime() < cutoff.getTime()) return;
    getPalletKeysFromRecord(record).forEach(key => {
      const plantingDate = getDashboardGrowthPriorPlantingDate(plantingIndex, key, harvestDate);
      if(plantingDate && plantingDate.getTime() < earliest.getTime()) earliest = plantingDate;
    });
  });
  const baseModel = dashboardHarvestForecastModelCache || buildDashboardHarvestForecastModel();
  dashboardHarvestForecastModelCache = baseModel;
  baseModel?.plantingDateByPallet?.forEach(date => {
    if(date instanceof Date && Number.isFinite(date.getTime()) && date.getTime() < earliest.getTime()){
      earliest = startOfLocalDay(date);
    }
  });
  return formatDateOnlyString(earliest);
}

async function fetchDashboardGrowthWeatherFromRelay(location){
  const config = loadGoogleSheetConfig();
  const relayUrl = String(config?.relayUrl || "").trim().replace(/\/+$/, "");
  const token = String(config?.token || "");
  if(!relayUrl || token.length < 32){
    throw new Error("過去の気象データを自動取得するには高速受付サーバーの設定が必要です");
  }
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeoutId = setTimeout(() => controller?.abort(), 45000);
  try{
    const response = await fetch(`${relayUrl}/weather`, {
      method:"POST",
      mode:"cors",
      headers:{ "Content-Type":"text/plain;charset=utf-8" },
      body:JSON.stringify({
        app:"Harvestnavi",
        type:"growth-weather",
        action:"getGrowthWeather",
        version:1,
        token,
        requestedStartDate:getDashboardGrowthRequiredHistoryStartDate(),
        location
      }),
      signal:controller?.signal
    });
    const text = await response.text();
    let result;
    try{
      result = text ? JSON.parse(text) : {};
    }catch(error){
      throw new Error("気象データの応答を読み込めません");
    }
    if(!response.ok || result.ok !== true){
      throw new Error(result.message || `気象データを取得できません（HTTP ${response.status}）`);
    }
    if(!Array.isArray(result.daily) || !result.daily.length){
      throw new Error("気象データが空です");
    }
    return result;
  }finally{
    clearTimeout(timeoutId);
  }
}

async function loadDashboardGrowthWeather(location, options = {}){
  const cached = getDashboardGrowthWeatherCache(location);
  const cacheAge = cached ? Date.now() - Number(cached.fetchedAt || 0) : Infinity;
  if(!options.force && cached && cacheAge < 6 * 60 * 60 * 1000){
    return { ...cached, usedCache:true };
  }
  let relayWeather = null;
  try{
    relayWeather = await fetchDashboardGrowthWeatherFromRelay(location);
  }catch(error){
    if(cached) return { ...cached, usedCache:true, stale:true };
    throw error;
  }
  const cache = {
    schemaVersion:3,
    locationKey:getDashboardGrowthLocationKey(location),
    fetchedAt:Number(relayWeather.fetchedAt || Date.now()),
    provider:"jma",
    timezone:"Asia/Tokyo",
    forecastEndDate:String(relayWeather.forecastEndDate || ""),
    historyStartDate:String(relayWeather.historyStartDate || ""),
    historyThrough:String(relayWeather.historyThrough || ""),
    station:relayWeather.station || null,
    normal:relayWeather.normal || {},
    daily:relayWeather.daily
  };
  harvestnaviLocalStorage.writeJson(DASHBOARD_GROWTH_WEATHER_CACHE_KEY, cache);
  return { ...cache, usedCache:false };
}

function getDashboardGrowthMedian(values){
  const sorted = (Array.isArray(values) ? values : [])
    .map(Number)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if(!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function buildDashboardGrowthWeatherIndex(weather){
  const dailyByDate = new Map();
  const climateParts = new Map();
  const todayKey = formatDateOnlyString(new Date());
  (weather?.daily || []).forEach(day => {
    if(!parseDateOnlyString(day?.date)) return;
    dailyByDate.set(day.date, day);
    if(day.date >= todayKey) return;
    const monthDay = day.date.slice(5);
    const current = climateParts.get(monthDay) || [];
    current.push(day);
    climateParts.set(monthDay, current);
  });
  const climateByMonthDay = new Map();
  climateParts.forEach((days, monthDay) => {
    const average = key => {
      const values = days.map(day => Number(day[key])).filter(Number.isFinite);
      return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    };
    climateByMonthDay.set(monthDay, {
      meanTemp:average("meanTemp"),
      maxTemp:average("maxTemp"),
      minTemp:average("minTemp"),
      lightIndex:average("lightIndex"),
      source:"climate"
    });
  });
  const normal = weather?.normal || {};
  const baseline = {
    meanTemp:Number.isFinite(Number(normal.meanTemp)) ? Number(normal.meanTemp) : 19,
    maxTemp:Number.isFinite(Number(normal.maxTemp)) ? Number(normal.maxTemp) : 24,
    minTemp:Number.isFinite(Number(normal.minTemp)) ? Number(normal.minTemp) : 14,
    lightIndex:Number.isFinite(Number(normal.lightIndex)) ? Number(normal.lightIndex) : 0.85,
    source:"normal"
  };
  return { dailyByDate, climateByMonthDay, baseline };
}

function getDashboardGrowthWeatherDay(weatherIndex, date, options = {}){
  const dateKey = formatDateOnlyString(date);
  const direct = weatherIndex.dailyByDate.get(dateKey);
  if(direct) return { ...direct, estimated:false };
  if(options.allowClimate === false) return null;
  const climate = weatherIndex.climateByMonthDay.get(dateKey.slice(5));
  return { ...(climate || weatherIndex.baseline), date:dateKey, estimated:true };
}

function getDashboardGrowthDefaultBuildingAdjustment(building){
  const normalized = Number(building);
  return {
    temperature:normalized === 2 ? "high" : "base",
    light:normalized === 9 ? "low" : "base"
  };
}

function normalizeDashboardGrowthBuildingAdjustments(value){
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(BUILDINGS.map(building => {
    const defaults = getDashboardGrowthDefaultBuildingAdjustment(building);
    const item = source[String(building)];
    const normalizedItem = item && typeof item === "object" && !Array.isArray(item) ? item : {};
    return [String(building), {
      temperature:["low", "base", "high"].includes(normalizedItem.temperature)
        ? normalizedItem.temperature
        : defaults.temperature,
      light:["low", "base", "high"].includes(normalizedItem.light)
        ? normalizedItem.light
        : defaults.light
    }];
  }));
}

function getDashboardGrowthBuildingAdjustments(){
  if(!dashboardGrowthBuildingAdjustmentsCache){
    dashboardGrowthBuildingAdjustmentsCache = normalizeDashboardGrowthBuildingAdjustments(
      harvestnaviLocalStorage.readJson(DASHBOARD_GROWTH_BUILDING_ADJUSTMENTS_KEY, null)
    );
  }
  return dashboardGrowthBuildingAdjustmentsCache;
}

function saveDashboardGrowthBuildingAdjustments(value){
  const normalized = normalizeDashboardGrowthBuildingAdjustments(value);
  dashboardGrowthBuildingAdjustmentsCache = normalized;
  harvestnaviLocalStorage.writeJson(DASHBOARD_GROWTH_BUILDING_ADJUSTMENTS_KEY, normalized);
  return normalized;
}

function getDashboardGrowthBuildingAdjustment(building){
  const normalized = Number(building);
  const saved = getDashboardGrowthBuildingAdjustments()[String(normalized)]
    || getDashboardGrowthDefaultBuildingAdjustment(normalized);
  return {
    temperatureOffsetC:saved.temperature === "high" ? 1 : (saved.temperature === "low" ? -1 : 0),
    lightMultiplier:saved.light === "high" ? 1.12 : (saved.light === "low" ? 0.88 : 1)
  };
}

function getDashboardGrowthAdjustedWeather(day, building){
  if(!day) return null;
  const adjustment = getDashboardGrowthBuildingAdjustment(building);
  return {
    ...day,
    meanTemp:Number.isFinite(Number(day.meanTemp))
      ? Number(day.meanTemp) + adjustment.temperatureOffsetC
      : null,
    maxTemp:Number.isFinite(Number(day.maxTemp))
      ? Number(day.maxTemp) + adjustment.temperatureOffsetC
      : null,
    lightIndex:Number.isFinite(Number(day.lightIndex))
      ? Number(day.lightIndex) * adjustment.lightMultiplier
      : null
  };
}

function getDashboardGrowthDailyUnit(day, building){
  const adjusted = getDashboardGrowthAdjustedWeather(day, building);
  const temperature = Number(adjusted?.meanTemp);
  const lightIndex = Number(adjusted?.lightIndex);
  if(!Number.isFinite(temperature) || !Number.isFinite(lightIndex)) return null;
  let temperatureFactor = 0;
  if(temperature > 5 && temperature < 32){
    if(temperature < 18) temperatureFactor = (temperature - 5) / 13;
    else if(temperature <= 24) temperatureFactor = 1;
    else temperatureFactor = (32 - temperature) / 8;
  }
  const lightFactor = Math.max(0.3, Math.min(1.2, lightIndex));
  return Math.max(0, temperatureFactor) * lightFactor;
}

function getDashboardGrowthUnits(weatherIndex, startDate, endDate, building, options = {}){
  const start = startOfLocalDay(startDate);
  const end = startOfLocalDay(endDate);
  if(start.getTime() > end.getTime()) return null;
  let total = 0;
  let knownDays = 0;
  let estimatedDays = 0;
  let observationDays = 0;
  let totalDays = 0;
  for(let cursor = start; cursor.getTime() <= end.getTime(); cursor = addDays(cursor, 1)){
    totalDays++;
    const day = getDashboardGrowthWeatherDay(weatherIndex, cursor, {
      allowClimate:options.allowClimate !== false
    });
    if(options.observationsOnly && day?.source !== "observation") continue;
    const unit = getDashboardGrowthDailyUnit(day, building);
    if(unit === null) continue;
    total += unit;
    knownDays++;
    if(day.estimated) estimatedDays++;
    if(day.source === "observation") observationDays++;
  }
  return knownDays ? {
    total,
    knownDays,
    totalDays,
    missingDays:Math.max(0, totalDays - knownDays),
    estimatedDays,
    observationDays
  } : null;
}

function buildDashboardGrowthPlantingIndex(){
  const index = new Map();
  plantingEvents.forEach(event => {
    const date = parseDateOnlyString(String(event?.plantingDate || "").trim());
    if(!date) return;
    (Array.isArray(event?.plantingPalletKeys) ? event.plantingPalletKeys : []).forEach(key => {
      if(!isValidPalletKeyString(key)) return;
      if(!index.has(key)) index.set(key, []);
      index.get(key).push({ date, eventId:Number(event?.eventId || 0) });
    });
  });
  index.forEach(items => items.sort((left, right) => (
    left.date.getTime() - right.date.getTime() || left.eventId - right.eventId
  )));
  return index;
}

function getDashboardGrowthPriorPlantingDate(plantingIndex, palletKey, targetDate){
  const items = plantingIndex.get(palletKey) || [];
  const targetTime = startOfLocalDay(targetDate).getTime();
  let found = null;
  for(const item of items){
    if(item.date.getTime() >= targetTime) break;
    found = item.date;
  }
  return found ? new Date(found) : null;
}

function buildDashboardGrowthTrainingSamples(){
  const plantingIndex = buildDashboardGrowthPlantingIndex();
  const cutoff = addDays(startOfLocalDay(new Date()), -730);
  const samples = [];
  records.forEach(record => {
    if(record?.type === "partialHarvest") return;
    const harvestDate = parseDateOnlyString(String(record?.date || ""));
    if(!harvestDate || harvestDate.getTime() < cutoff.getTime()) return;
    const keysByBed = new Map();
    getPalletKeysFromRecord(record).forEach(key => {
      const bedKey = getHarvestBedKeyFromPalletKey(key);
      if(!bedKey) return;
      if(!keysByBed.has(bedKey)) keysByBed.set(bedKey, []);
      keysByBed.get(bedKey).push(key);
    });
    keysByBed.forEach((palletKeys, bedKey) => {
      const plantingTimes = palletKeys
        .map(key => getDashboardGrowthPriorPlantingDate(plantingIndex, key, harvestDate)?.getTime())
        .filter(Number.isFinite);
      const plantingTime = getDashboardGrowthMedian(plantingTimes);
      if(!Number.isFinite(plantingTime)) return;
      const [buildingText, bed] = bedKey.split("-");
      const building = Number(buildingText);
      const plantingDate = new Date(plantingTime);
      const state = getHarvestGrowthStateForBed(record, bedKey);
      samples.push({
        building,
        bed,
        bedKey,
        plantingDate,
        date:harvestDate,
        ageDays:getLocalDayDiff(plantingDate, harvestDate),
        sizeRating:state.sizeRating,
        uneven:state.uneven,
        tipburn:state.tipburn,
        elongated:state.elongated,
        qualityObserved:state.sizeRating !== "unknown" || state.tipburn || state.elongated
      });
    });
  });
  return samples;
}

function getDashboardGrowthSampleUnits(sample, weatherIndex){
  if(!sample?.plantingDate || !sample?.date) return null;
  const units = getDashboardGrowthUnits(
    weatherIndex,
    sample.plantingDate,
    sample.date,
    sample.building,
    { allowClimate:false, observationsOnly:true }
  );
  if(!units || units.knownDays !== units.totalDays) return null;
  return units.total;
}

function refreshDashboardGrowthSampleUnits(samples, weatherIndex, building = null){
  return samples.map(sample => {
    if(building !== null && Number(sample.building) !== Number(building)) return sample;
    return { ...sample, growthUnits:getDashboardGrowthSampleUnits(sample, weatherIndex) };
  });
}

function getDashboardGrowthTarget(samples, building){
  const usableSamples = samples.filter(sample => Number.isFinite(sample.growthUnits) && sample.growthUnits > 0);
  const buildingSamples = usableSamples.filter(sample => sample.building === building);
  const labelledInBuilding = buildingSamples.filter(sample => sample.sizeRating !== "unknown");
  const labelledAll = usableSamples.filter(sample => sample.sizeRating !== "unknown");
  const labelled = labelledInBuilding.length >= 3 ? labelledInBuilding : labelledAll;
  if(labelled.length){
    const unevenRate = labelled.filter(sample => sample.uneven).length / labelled.length;
    const targetGrowthUnits = labelled.map(sample => {
      if(sample.sizeRating === "small") return sample.growthUnits * 1.1;
      if(sample.sizeRating === "large") return sample.growthUnits * 0.9;
      return sample.growthUnits;
    });
    const sampleConfidence = labelled.length >= 12 ? "高め" : (labelled.length >= 5 ? "中" : "低め");
    const confidence = unevenRate >= 0.3
      ? (sampleConfidence === "高め" ? "中" : "低め")
      : sampleConfidence;
    return {
      growthUnits:getDashboardGrowthMedian(targetGrowthUnits),
      ageDays:getDashboardGrowthMedian(labelled.map(sample => sample.ageDays)),
      ratedCount:labelled.length,
      provisional:false,
      confidence,
      unevenRate
    };
  }
  const fallback = buildingSamples.length >= 3 ? buildingSamples : usableSamples;
  return {
    growthUnits:getDashboardGrowthMedian(fallback.map(sample => sample.growthUnits)),
    ageDays:getDashboardGrowthMedian(fallback.map(sample => sample.ageDays)),
    ratedCount:0,
    provisional:true,
    confidence:"低め",
    unevenRate:0
  };
}

function getDashboardGrowthForecastPalletKeys(model, building, bed){
  const keys = [];
  for(let number = 1; number <= PALLETS_PER_BED; number++){
    const key = getPalletKey(building, bed, number);
    if(model.palletForecasts.has(key)) keys.push(key);
  }
  return keys;
}

function hasDashboardGrowthCurrentPartialHarvest(building, bed, plantingDate){
  if(!plantingDate) return false;
  return records.some(record => {
    if(record?.type !== "partialHarvest") return false;
    const recordDate = parseDateOnlyString(String(record.date || ""));
    if(!recordDate || recordDate.getTime() < startOfLocalDay(plantingDate).getTime()) return false;
    return normalizePartialHarvestTargets(record.targets).some(target => (
      Number(target.building) === Number(building) && target.bed === bed
    ));
  });
}

function getDashboardGrowthRisk(weatherIndex, forecastDate, building, samples){
  const adjustment = getDashboardGrowthBuildingAdjustment(building);
  const today = startOfLocalDay(new Date());
  const lastForecastDate = [...weatherIndex.dailyByDate.values()]
    .filter(day => day?.source === "forecast" && parseDateOnlyString(day.date))
    .map(day => parseDateOnlyString(day.date))
    .sort((left, right) => right.getTime() - left.getTime())[0] || null;
  const end = lastForecastDate && forecastDate.getTime() > lastForecastDate.getTime()
    ? lastForecastDate
    : forecastDate;
  const days = [];
  for(let cursor = today; cursor.getTime() <= end.getTime(); cursor = addDays(cursor, 1)){
    const day = getDashboardGrowthWeatherDay(weatherIndex, cursor, { allowClimate:false });
    if(day) days.push(getDashboardGrowthAdjustedWeather(day, building));
  }
  if(!days.length){
    return {
      tipburn:{ level:"unknown", label:"判定待ち" },
      elongated:{ level:"unknown", label:"判定待ち" }
    };
  }
  const hotDays = days.filter(day => Number(day.maxTemp) >= 28).length;
  const warmBrightDays = days.filter(day => Number(day.meanTemp) >= 22 && Number(day.lightIndex) >= 1).length;
  const warmLowLightDays = days.filter(day => Number(day.meanTemp) >= 21 && Number(day.lightIndex) < 0.8).length;
  const buildingSamples = samples.filter(sample => sample.building === building);
  const observedSamples = buildingSamples.filter(sample => sample.qualityObserved);
  const tipburnRate = observedSamples.length
    ? observedSamples.filter(sample => sample.tipburn).length / observedSamples.length
    : 0;
  const elongatedRate = observedSamples.length
    ? observedSamples.filter(sample => sample.elongated).length / observedSamples.length
    : 0;
  let tipburnScore = Math.min(2, hotDays) + Math.min(1, warmBrightDays);
  if(adjustment.temperatureOffsetC > 0 && hotDays) tipburnScore++;
  if(tipburnRate >= 0.15) tipburnScore++;
  let elongatedScore = Math.min(2, warmLowLightDays) + (hotDays >= 3 ? 1 : 0);
  if(adjustment.lightMultiplier < 1 && days.some(day => Number(day.lightIndex) < 0.9)) elongatedScore++;
  if(elongatedRate >= 0.15) elongatedScore++;
  const toRisk = score => score >= 4
    ? { level:"alert", label:"注意" }
    : (score >= 2 ? { level:"watch", label:"やや注意" } : { level:"low", label:"低め" });
  return { tipburn:toRisk(tipburnScore), elongated:toRisk(elongatedScore) };
}

function getDashboardGrowthBedPrediction(baseModel, weatherIndex, samples, building, bed, target = null){
  const range = baseModel.bedRanges.get(`${building}-${bed}`);
  if(!range) return { building, bed, range:null, status:"unknown", statusLabel:"予定なし" };
  const normalizedTarget = target || getDashboardGrowthTarget(samples, building);
  const palletKeys = getDashboardGrowthForecastPalletKeys(baseModel, building, bed);
  const ratios = [];
  const currentGrowthUnitValues = [];
  const projectedGrowthUnitValues = [];
  const estimatedDayValues = [];
  let earliestPlantingDate = null;
  const today = startOfLocalDay(new Date());
  palletKeys.forEach(key => {
    const plantingDate = baseModel.plantingDateByPallet.get(key);
    const forecast = baseModel.palletForecasts.get(key);
    if(!plantingDate || !forecast?.date || baseModel.estimatedPlantingPalletKeys.has(key)) return;
    if(!earliestPlantingDate || plantingDate.getTime() < earliestPlantingDate.getTime()){
      earliestPlantingDate = plantingDate;
    }
    if(!Number.isFinite(normalizedTarget.growthUnits) || normalizedTarget.growthUnits <= 0) return;
    const forecastDate = startOfLocalDay(forecast.date);
    const currentEndDate = forecastDate.getTime() < today.getTime() ? forecastDate : today;
    const currentUnits = getDashboardGrowthUnits(weatherIndex, plantingDate, currentEndDate, building);
    const projectedUnits = getDashboardGrowthUnits(weatherIndex, plantingDate, forecastDate, building);
    if(!projectedUnits) return;
    if(currentUnits) currentGrowthUnitValues.push(currentUnits.total);
    projectedGrowthUnitValues.push(projectedUnits.total);
    estimatedDayValues.push(projectedUnits.estimatedDays);
    ratios.push(projectedUnits.total / normalizedTarget.growthUnits);
  });
  const ratio = getDashboardGrowthMedian(ratios);
  const currentGrowthUnits = getDashboardGrowthMedian(currentGrowthUnitValues);
  const projectedGrowthUnits = getDashboardGrowthMedian(projectedGrowthUnitValues);
  const estimatedDays = Math.round(getDashboardGrowthMedian(estimatedDayValues) || 0);
  const hasPartial = hasDashboardGrowthCurrentPartialHarvest(building, bed, earliestPlantingDate);
  let status = "unknown";
  let statusLabel = "判定材料不足";
  if(Number.isFinite(ratio)){
    if(ratio < DASHBOARD_GROWTH_NORMAL_RATIO_MIN){
      status = "small";
      statusLabel = hasPartial ? "一部は収穫可能" : "やや小さめの可能性";
    }else if(ratio > DASHBOARD_GROWTH_NORMAL_RATIO_MAX){
      status = "large";
      statusLabel = "大きめの可能性";
    }else{
      status = "normal";
      statusLabel = "ちょうど良い見込み";
    }
  }
  const forecastDate = range.end.date;
  const risk = getDashboardGrowthRisk(weatherIndex, forecastDate, building, samples);
  const adjustment = getDashboardGrowthBuildingAdjustment(building);
  const reasons = [];
  if(status === "small") reasons.push("過去の適期収穫時より積算生育値が低い見込み");
  if(status === "normal") reasons.push("過去の適期収穫時に近い積算生育値");
  if(status === "large") reasons.push("過去の適期収穫時より積算生育値が高い見込み");
  if(hasPartial) reasons.push("この作で部分収穫の記録あり");
  if(adjustment.temperatureOffsetC > 0) reasons.push(`温度が高め（+${adjustment.temperatureOffsetC}℃）の環境傾向を反映`);
  if(adjustment.temperatureOffsetC < 0) reasons.push(`温度が低め（${adjustment.temperatureOffsetC}℃）の環境傾向を反映`);
  if(adjustment.lightMultiplier < 1) reasons.push(`日光が低め（${Math.round((1 - adjustment.lightMultiplier) * 100)}%減）の環境傾向を反映`);
  if(adjustment.lightMultiplier > 1) reasons.push(`日光が高め（${Math.round((adjustment.lightMultiplier - 1) * 100)}%増）の環境傾向を反映`);
  if(normalizedTarget.unevenRate >= 0.3) reasons.push("ばらつきの記録が多いため予測幅あり");
  if(estimatedDays) reasons.push("気象庁の予報期間外は平年値を使用");
  return {
    building,
    bed,
    range,
    status,
    statusLabel,
    risk,
    basis:{
      currentGrowthUnits,
      projectedGrowthUnits,
      targetGrowthUnits:Number.isFinite(normalizedTarget.growthUnits) ? normalizedTarget.growthUnits : null,
      achievementRate:Number.isFinite(ratio) ? ratio * 100 : null,
      palletCount:ratios.length
    },
    reason:reasons.join("。") || "評価記録が増えると判定できます",
    confidence:normalizedTarget.confidence,
    provisional:normalizedTarget.provisional,
    ratedCount:normalizedTarget.ratedCount
  };
}

function buildDashboardGrowthPredictionModel(weather, timing = {}){
  const computeStartedAt = performance.now();
  const baseModel = dashboardHarvestForecastModelCache || buildDashboardHarvestForecastModel();
  dashboardHarvestForecastModelCache = baseModel;
  const weatherIndex = buildDashboardGrowthWeatherIndex(weather);
  const samples = refreshDashboardGrowthSampleUnits(buildDashboardGrowthTrainingSamples(), weatherIndex);
  const targets = new Map(BUILDINGS.map(building => [
    building,
    getDashboardGrowthTarget(samples, building)
  ]));
  const predictions = new Map();
  BUILDINGS.forEach(building => {
    bedOrder.forEach(bed => {
      predictions.set(`${building}-${bed}`, getDashboardGrowthBedPrediction(
        baseModel,
        weatherIndex,
        samples,
        building,
        bed,
        targets.get(building)
      ));
    });
  });
  return {
    baseModel,
    weather,
    weatherIndex,
    samples,
    targets,
    predictions,
    startBuilding:baseModel.startBuilding,
    performance:{
      fetchMs:Number(timing.fetchMs || 0),
      computeMs:performance.now() - computeStartedAt,
      weatherDays:weather.daily.length
    }
  };
}

function rebuildDashboardGrowthPredictionBuilding(model, building){
  const normalized = Number(building);
  if(!model || !BUILDINGS.includes(normalized)) return model;
  model.samples = refreshDashboardGrowthSampleUnits(model.samples, model.weatherIndex, normalized);
  const target = getDashboardGrowthTarget(model.samples, normalized);
  model.targets.set(normalized, target);
  bedOrder.forEach(bed => {
    model.predictions.set(`${normalized}-${bed}`, getDashboardGrowthBedPrediction(
      model.baseModel,
      model.weatherIndex,
      model.samples,
      normalized,
      bed,
      target
    ));
  });
  return model;
}

function getDashboardGrowthRiskHtml(label, risk, shortLabel = label){
  const level = risk?.level || "unknown";
  if(!["watch", "alert"].includes(level)) return "";
  const className = level === "alert" ? " is-alert" : (level === "watch" ? " is-watch" : "");
  const riskLabel = risk?.label || "判定待ち";
  return `<span class="dashboardGrowthRisk${className}" aria-label="${escapeHtml(`${label} ${riskLabel}`)}"><span>${escapeHtml(shortLabel)}</span><strong>${escapeHtml(riskLabel)}</strong></span>`;
}

function getDashboardGrowthStatusDisplayLabel(item){
  if(item?.status === "normal") return "並";
  if(item?.status === "small") return "小さめ";
  if(item?.status === "large") return "大きめ";
  return item?.statusLabel || "判定材料不足";
}

function getDashboardGrowthPredictionBasisHtml(item){
  const basis = item?.basis || {};
  const hasValues = [
    basis.currentGrowthUnits,
    basis.projectedGrowthUnits,
    basis.targetGrowthUnits,
    basis.achievementRate
  ].every(Number.isFinite);
  if(!hasValues){
    return `
      <section class="dashboardGrowthBasis is-unavailable" aria-label="判定の根拠">
        <strong class="dashboardGrowthBasisTitle">判定の根拠</strong>
        <p class="dashboardGrowthBasisUnavailable">苗植え日、過去の収穫評価、または対象期間の気象庁データが不足しているため、数値で比較できません。</p>
      </section>
    `;
  }
  const achievementRate = Math.round(Number(basis.achievementRate));
  const minPercent = Math.round(DASHBOARD_GROWTH_NORMAL_RATIO_MIN * 100);
  const maxPercent = Math.round(DASHBOARD_GROWTH_NORMAL_RATIO_MAX * 100);
  const statusLabel = getDashboardGrowthStatusDisplayLabel(item);
  const projectedText = formatDashboardMetricNumber(basis.projectedGrowthUnits, "点");
  const targetText = formatDashboardMetricNumber(basis.targetGrowthUnits, "点");
  let conclusion = `積算生育値が目標${targetText}に対して${projectedText}（${achievementRate}%）`;
  if(item.status === "small"){
    conclusion += `で、基準範囲の下限${minPercent}%未満のため「${statusLabel}」と判定しました。`;
  }else if(item.status === "large"){
    conclusion += `で、基準範囲の上限${maxPercent}%を超えるため「${statusLabel}」と判定しました。`;
  }else{
    conclusion += `で、基準範囲（${minPercent}〜${maxPercent}%）内のため「${statusLabel}」と判定しました。`;
  }
  const palletNote = Number(basis.palletCount) > 1
    ? `対象${Number(basis.palletCount)}パレットの中央値です。`
    : "";
  return `
    <section class="dashboardGrowthBasis" aria-label="判定の根拠">
      <strong class="dashboardGrowthBasisTitle">判定の根拠</strong>
      <div class="dashboardGrowthBasisValues">
        <span class="dashboardGrowthBasisValue"><span>現在まで</span><strong>${escapeHtml(formatDashboardMetricNumber(basis.currentGrowthUnits, "点"))}</strong></span>
        <span class="dashboardGrowthBasisValue"><span>予定日時点</span><strong>${escapeHtml(formatDashboardMetricNumber(basis.projectedGrowthUnits, "点"))}</strong></span>
        <span class="dashboardGrowthBasisValue"><span>収穫目標</span><strong>${escapeHtml(formatDashboardMetricNumber(basis.targetGrowthUnits, "点"))}</strong></span>
      </div>
      <p class="dashboardGrowthBasisConclusion">${escapeHtml(conclusion)}</p>
      <p class="dashboardGrowthBasisMethod">積算生育値は、苗植え日からの毎日の平均気温と日照条件を生育分へ換算して合計しています。過去期間は気象庁の観測値、今後は予報、予報期間外は同じ地点・同じ時期の平均を使用します。${escapeHtml(palletNote)}</p>
    </section>
  `;
}

function getDashboardGrowthBuildingTrend(model, building){
  return {
    predictions:bedMap.map(bed => model.predictions.get(`${building}-${bed}`))
  };
}

function renderDashboardGrowthBuildingTraits(){
  const container = document.getElementById("dashboardGrowthBuildingTabs");
  if(!container) return;
  const building = dashboardGrowthPredictionBuilding;
  const adjustment = getDashboardGrowthBuildingAdjustment(building);
  const warm = adjustment.temperatureOffsetC > 0;
  const cool = adjustment.temperatureOffsetC < 0;
  const lowLight = adjustment.lightMultiplier < 1;
  const highLight = adjustment.lightMultiplier > 1;
  const temperatureLabel = warm
    ? `高め +${adjustment.temperatureOffsetC}℃`
    : (cool ? `低め ${adjustment.temperatureOffsetC}℃` : "基準");
  const lightDifference = Math.round(Math.abs(1 - adjustment.lightMultiplier) * 100);
  const lightLabel = lowLight
    ? `低め ${lightDifference}%減`
    : (highLight ? `高め ${lightDifference}%増` : "基準");
  container.innerHTML = `
    <div class="dashboardGrowthBuildingPager" role="group" aria-label="表示する号棟">
      ${BUILDINGS.map(item => {
        const selected = item === building;
        return `
          <button type="button" class="dashboardGrowthBuildingBtn${selected ? " active" : ""}"
            data-dashboard-growth-building="${item}" data-ui-click="setDashboardGrowthPredictionBuilding" data-ui-number="${item}"
            aria-pressed="${selected ? "true" : "false"}" aria-label="${item}号棟を表示">${item}号棟</button>
        `;
      }).join("")}
    </div>
    <div class="dashboardGrowthActiveTraits" aria-label="${building}号棟の環境傾向">
      <strong class="dashboardGrowthActiveTraitsTitle">${building}号棟の環境傾向</strong>
      <div class="dashboardGrowthActiveTraitValues">
        <span class="dashboardGrowthActiveTrait"><span>温度</span><strong class="${warm ? "is-warm" : (cool ? "is-cool" : "is-base")}">${temperatureLabel}</strong></span>
        <span class="dashboardGrowthActiveTrait"><span>日光</span><strong class="${lowLight ? "is-low-light" : (highLight ? "is-high-light" : "is-base")}">${lightLabel}</strong></span>
      </div>
    </div>
  `;
}

function renderDashboardGrowthPredictionBuilding(model, building){
  const container = document.getElementById("dashboardGrowthBeds");
  if(!container) return;
  const trend = getDashboardGrowthBuildingTrend(model, building);
  container.innerHTML = trend.predictions.map(item => {
    if(!item?.range){
      return `<article class="dashboardGrowthBedCard is-no-forecast" aria-label="${escapeHtml(item?.bed || "-")}ベッド。収穫予定なし"><div class="dashboardGrowthBedHead"><span class="dashboardGrowthBedName">${escapeHtml(item?.bed || "-")}ベッド</span><span class="dashboardGrowthBedDate">収穫予定なし</span></div></article>`;
    }
    const dateText = formatDashboardForecastRange(item.range).dateText;
    const statusClass = ["small", "large", "unknown"].includes(item.status) ? ` is-${item.status}` : "";
    const riskItems = [
      getDashboardGrowthRiskHtml("チップバーン", item.risk?.tipburn, "チップ"),
      getDashboardGrowthRiskHtml("徒長", item.risk?.elongated)
    ].filter(Boolean);
    return `
      <details class="dashboardGrowthBedCard">
        <summary class="dashboardGrowthBedSummary">
          <span class="dashboardGrowthBedHead">
            <span class="dashboardGrowthBedName">${escapeHtml(item.bed)}ベッド</span>
            <span class="dashboardGrowthBedDate">${escapeHtml(dateText)}</span>
          </span>
          <span class="dashboardGrowthStatus${statusClass}">
            <span class="dashboardGrowthStatusLabel">予定日時点</span>
            <strong class="dashboardGrowthStatusValue">${escapeHtml(getDashboardGrowthStatusDisplayLabel(item))}</strong>
          </span>
          ${riskItems.length ? `<span class="dashboardGrowthRiskRow${riskItems.length === 1 ? " has-one" : ""}">${riskItems.join("")}</span>` : ""}
          <span class="dashboardGrowthBedMeta">
            <span class="dashboardGrowthConfidence">信頼度：${escapeHtml(item.confidence)}</span>
            <span class="dashboardGrowthBedMore">詳細</span>
          </span>
        </summary>
        <div class="dashboardGrowthBedDetails">
          ${getDashboardGrowthPredictionBasisHtml(item)}
          <div class="dashboardGrowthReason">${escapeHtml(item.reason)}</div>
          ${item.provisional ? '<div class="dashboardGrowthConfidenceHint">育ち具合の評価を記録すると信頼度が上がります</div>' : ""}
        </div>
      </details>
    `;
  }).join("");
  container.setAttribute("aria-label", `${building}号棟のAからFベッドの生育予測`);
}

function renderDashboardGrowthPredictionModel(model, location){
  const content = document.getElementById("dashboardGrowthContent");
  const missing = document.getElementById("dashboardGrowthLocationMissing");
  const refreshButton = document.getElementById("dashboardGrowthRefreshBtn");
  const locationName = document.getElementById("dashboardGrowthLocationName");
  const updatedAt = document.getElementById("dashboardGrowthUpdatedAt");
  if(missing) missing.hidden = true;
  if(content) content.hidden = false;
  if(refreshButton){
    refreshButton.hidden = false;
    refreshButton.disabled = false;
  }
  if(locationName) locationName.textContent = getDashboardGrowthLocationDisplayName(location);
  if(updatedAt){
    const fetchedAt = new Date(Number(model.weather.fetchedAt || 0));
    updatedAt.textContent = Number.isFinite(fetchedAt.getTime())
      ? `${fetchedAt.getMonth() + 1}/${fetchedAt.getDate()} ${String(fetchedAt.getHours()).padStart(2, "0")}:${String(fetchedAt.getMinutes()).padStart(2, "0")}更新${model.weather.stale ? "・保存済みデータ" : ""}`
      : "";
  }
  if(!BUILDINGS.includes(dashboardGrowthPredictionBuilding)){
    dashboardGrowthPredictionBuilding = model.startBuilding;
  }
  renderDashboardGrowthBuildingTraits();
  renderDashboardGrowthPredictionBuilding(model, dashboardGrowthPredictionBuilding);
}

async function renderDashboardGrowthPrediction(options = {}){
  const location = getDashboardGrowthLocation();
  const missing = document.getElementById("dashboardGrowthLocationMissing");
  const content = document.getElementById("dashboardGrowthContent");
  const refreshButton = document.getElementById("dashboardGrowthRefreshBtn");
  if(!location){
    if(missing) missing.hidden = false;
    if(content) content.hidden = true;
    if(refreshButton) refreshButton.hidden = true;
    setDashboardGrowthLoading(false);
    return;
  }
  if(missing) missing.hidden = true;
  if(!options.force && dashboardGrowthPredictionModelCache){
    renderDashboardGrowthPredictionModel(dashboardGrowthPredictionModelCache, location);
    return;
  }
  if(dashboardGrowthWeatherLoading) return dashboardGrowthWeatherLoading;
  setDashboardGrowthLoading(true);
  const startedAt = performance.now();
  dashboardGrowthWeatherLoading = loadDashboardGrowthWeather(location, options)
    .then(weather => {
      const model = buildDashboardGrowthPredictionModel(weather, {
        fetchMs:performance.now() - startedAt
      });
      dashboardGrowthPredictionModelCache = model;
      renderDashboardGrowthPredictionModel(model, location);
      return model;
    })
    .catch(error => {
      console.error("生育予測を読み込めませんでした", error);
      if(missing) missing.hidden = true;
      if(content) content.hidden = false;
      const beds = document.getElementById("dashboardGrowthBeds");
      const tabs = document.getElementById("dashboardGrowthBuildingTabs");
      if(beds) beds.innerHTML = `<div class="dashboardEmpty" style="grid-column:1/-1;">${escapeHtml(error?.message || "気象データを取得できませんでした。通信状態を確認して「更新」を押してください。")}</div>`;
      if(tabs) tabs.innerHTML = "";
      if(refreshButton) refreshButton.hidden = false;
    })
    .finally(() => {
      dashboardGrowthWeatherLoading = null;
      setDashboardGrowthLoading(false);
    });
  return dashboardGrowthWeatherLoading;
}

function setDashboardGrowthPredictionBuilding(building){
  const normalized = Number(building);
  if(!BUILDINGS.includes(normalized) || !dashboardGrowthPredictionModelCache) return;
  dashboardGrowthPredictionBuilding = normalized;
  renderDashboardGrowthBuildingTraits();
  renderDashboardGrowthPredictionBuilding(dashboardGrowthPredictionModelCache, normalized);
}

function refreshDashboardGrowthPrediction(){
  dashboardGrowthPredictionModelCache = null;
  renderDashboardGrowthPrediction({ force:true });
}

function renderDashboardGrowthBuildingAdjustmentMenu(){
  const container = document.getElementById("dashboardGrowthBuildingAdjustmentRows");
  if(!container) return;
  const adjustments = getDashboardGrowthBuildingAdjustments();
  const choiceHtml = (building, dimension, value, label, selected) => `
    <button type="button" class="dashboardGrowthAdjustmentChoice${selected ? " active" : ""}"
      data-dashboard-growth-adjustment-building="${building}"
      data-dashboard-growth-adjustment-dimension="${dimension}"
      data-dashboard-growth-adjustment-value="${value}"
      data-ui-click="setDashboardGrowthBuildingAdjustment" data-ui-number="${building}" data-ui-number-first="true"
      data-ui-arg="${dimension}" data-ui-arg2="${value}" aria-pressed="${selected ? "true" : "false"}">${label}</button>
  `;
  container.innerHTML = BUILDINGS.map(building => {
    const adjustment = adjustments[String(building)];
    return `
      <div class="dashboardGrowthBuildingAdjustmentRow">
        <strong class="dashboardGrowthBuildingAdjustmentName">${building}号棟</strong>
        <div class="dashboardGrowthAdjustmentGroup" role="group" aria-label="${building}号棟の温度">
          <span class="dashboardGrowthAdjustmentLabel">温度</span>
          <div class="dashboardGrowthAdjustmentChoices">
            ${choiceHtml(building, "temperature", "low", "低め", adjustment.temperature === "low")}
            ${choiceHtml(building, "temperature", "base", "基準", adjustment.temperature === "base")}
            ${choiceHtml(building, "temperature", "high", "高め", adjustment.temperature === "high")}
          </div>
        </div>
        <div class="dashboardGrowthAdjustmentGroup" role="group" aria-label="${building}号棟の日光">
          <span class="dashboardGrowthAdjustmentLabel">日光</span>
          <div class="dashboardGrowthAdjustmentChoices">
            ${choiceHtml(building, "light", "low", "低め", adjustment.light === "low")}
            ${choiceHtml(building, "light", "base", "基準", adjustment.light === "base")}
            ${choiceHtml(building, "light", "high", "高め", adjustment.light === "high")}
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function setDashboardGrowthBuildingAdjustment(building, dimension, value){
  const normalizedBuilding = Number(building);
  const allowedValues = dimension === "temperature"
    ? ["low", "base", "high"]
    : (dimension === "light" ? ["low", "base", "high"] : []);
  if(!BUILDINGS.includes(normalizedBuilding) || !allowedValues.includes(value)) return false;
  const current = getDashboardGrowthBuildingAdjustments();
  const buildingKey = String(normalizedBuilding);
  if(current[buildingKey]?.[dimension] === value) return false;
  saveDashboardGrowthBuildingAdjustments({
    ...current,
    [buildingKey]:{
      ...current[buildingKey],
      [dimension]:value
    }
  });
  renderDashboardGrowthBuildingAdjustmentMenu();
  if(dashboardGrowthPredictionModelCache){
    rebuildDashboardGrowthPredictionBuilding(dashboardGrowthPredictionModelCache, normalizedBuilding);
    if(dashboardGrowthPredictionBuilding === normalizedBuilding){
      renderDashboardGrowthBuildingTraits();
      renderDashboardGrowthPredictionBuilding(dashboardGrowthPredictionModelCache, normalizedBuilding);
    }
  }
  return true;
}

function syncDashboardGrowthLocationMenu(){
  renderDashboardGrowthBuildingAdjustmentMenu();
  const location = getDashboardGrowthLocation();
  const current = document.getElementById("dashboardGrowthMenuCurrent");
  const status = document.getElementById("dashboardGrowthLocationStatus");
  const results = document.getElementById("dashboardGrowthLocationResults");
  if(current){
    current.textContent = location
      ? `現在：${getDashboardGrowthLocationDisplayName(location)}`
      : "現在：未設定";
    current.classList.toggle("is-set", !!location);
  }
  if(status) status.textContent = "";
  if(results) results.innerHTML = "";
  dashboardGrowthWeatherLocationResults = [];
}

function openDashboardGrowthLocationMenu(){
  openAppMenuWindow({ page:"weather", focusTargetId:"dashboardGrowthLocationInput" });
  requestAnimationFrame(() => document.getElementById("dashboardGrowthLocationInput")?.focus());
}

function handleDashboardGrowthLocationKeydown(event){
  if(event.key !== "Enter") return;
  event.preventDefault();
  searchDashboardGrowthLocation();
}

async function searchDashboardGrowthLocation(){
  const input = document.getElementById("dashboardGrowthLocationInput");
  const status = document.getElementById("dashboardGrowthLocationStatus");
  const results = document.getElementById("dashboardGrowthLocationResults");
  const query = String(input?.value || "").trim();
  if(!query){
    if(status) status.textContent = "市区町村を入力してください。";
    input?.focus();
    return;
  }
  if(status) status.textContent = "地点を検索しています…";
  if(results) results.innerHTML = "";
  try{
    const payload = await loadDashboardGrowthAreaCatalog();
    dashboardGrowthWeatherLocationResults = findDashboardGrowthLocations(payload, query);
    if(!dashboardGrowthWeatherLocationResults.length){
      if(status) status.textContent = "該当する地点が見つかりませんでした。";
      return;
    }
    if(status) status.textContent = "使用する地点を選んでください。";
    if(results){
      results.innerHTML = dashboardGrowthWeatherLocationResults.map((item, index) => `
        <button type="button" class="dashboardGrowthLocationResult" data-ui-click="selectDashboardGrowthLocation" data-ui-number="${index}">
          ${escapeHtml(item.name)}
          <small>${escapeHtml([item.forecastAreaName, item.admin1].filter(Boolean).join("・"))}</small>
        </button>
      `).join("");
    }
  }catch(error){
    console.error("気象地点を検索できませんでした", error);
    if(status) status.textContent = "地点を検索できませんでした。通信状態を確認してください。";
  }
}

async function loadDashboardGrowthAreaCatalog(){
  if(dashboardGrowthAreaCatalogCache) return dashboardGrowthAreaCatalogCache;
  if(dashboardGrowthAreaCatalogLoading) return dashboardGrowthAreaCatalogLoading;
  dashboardGrowthAreaCatalogLoading = fetchDashboardGrowthJson(
    "https://www.jma.go.jp/bosai/common/const/area.json",
    12000,
    "default"
  ).then(payload => {
    if(!payload?.offices || !payload?.class10s || !payload?.class15s || !payload?.class20s){
      throw new Error("気象庁の地域データ形式が正しくありません");
    }
    dashboardGrowthAreaCatalogCache = payload;
    return payload;
  }).finally(() => {
    dashboardGrowthAreaCatalogLoading = null;
  });
  return dashboardGrowthAreaCatalogLoading;
}

function normalizeDashboardGrowthSearchText(value){
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[\s　]+/g, "");
}

function findDashboardGrowthLocations(payload, query){
  const normalizedQuery = normalizeDashboardGrowthSearchText(query);
  const simpleQuery = normalizedQuery.replace(/[市区町村]/g, "");
  if(!normalizedQuery) return [];
  const candidates = Object.entries(payload.class20s || {}).flatMap(([class20Code, area]) => {
    const class15 = payload.class15s?.[area?.parent];
    const class10 = payload.class10s?.[class15?.parent];
    const office = payload.offices?.[class10?.parent];
    if(!class15 || !class10 || !office) return [];
    const fields = [area.name, area.kana, area.enName].map(normalizeDashboardGrowthSearchText);
    const simpleName = normalizeDashboardGrowthSearchText(area.name).replace(/[市区町村]/g, "");
    let score = 99;
    if(fields.includes(normalizedQuery)) score = 0;
    else if(fields.some(field => field.startsWith(normalizedQuery))) score = 1;
    else if(fields.some(field => field.includes(normalizedQuery))) score = 2;
    else if(simpleQuery && simpleName.includes(simpleQuery)) score = 3;
    if(score === 99) return [];
    const location = normalizeDashboardGrowthLocation({
      officeCode:class10.parent,
      forecastAreaCode:class15.parent,
      class20Code,
      name:area.name,
      admin1:office.name,
      forecastAreaName:class10.name
    });
    return location ? [{ score, location }] : [];
  });
  return candidates
    .sort((left, right) => left.score - right.score || left.location.name.localeCompare(right.location.name, "ja"))
    .slice(0, 8)
    .map(item => item.location);
}

function selectDashboardGrowthLocation(index){
  const location = dashboardGrowthWeatherLocationResults[Number(index)];
  if(!saveDashboardGrowthLocation(location)) return;
  dashboardGrowthWeatherLocationResults = [];
  const results = document.getElementById("dashboardGrowthLocationResults");
  const status = document.getElementById("dashboardGrowthLocationStatus");
  if(results) results.innerHTML = "";
  if(status) status.textContent = `${getDashboardGrowthLocationDisplayName(location)}を設定しました。`;
  syncDashboardGrowthLocationMenu();
  if(typeof syncAppMenuSummaries === "function") syncAppMenuSummaries();
  if(status) status.textContent = `${getDashboardGrowthLocationDisplayName(location)}を設定しました。`;
  if(activeAppTab === "dashboard" && dashboardFilter.dashboardSubtab === "growth"){
    renderDashboardGrowthPrediction({ force:true });
  }
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

function renderDashboardResults(){
  syncDashboardResultsViewUi();
  const activeView = normalizeDashboardResultsView(dashboardFilter.resultsView);
  if(activeView === "harvestStart"){
    renderDashboardHarvestStartTimeline();
  }else if(activeView === "graphs"){
    renderDashboardGraphs();
  }else{
    renderDashboardRecordResults();
  }
}

function renderDashboardSubtab(subtab = dashboardFilter.dashboardSubtab, options = {}){
  const normalizedSubtab = normalizeDashboardSubtab(subtab);
  if(!options.force && dashboardRenderedSubtabs.has(normalizedSubtab)){
    scheduleDashboardSelectedBuildingButtonReveal(normalizedSubtab);
    return;
  }

  if(normalizedSubtab === "guide"){
    renderDashboardHarvestForecast();
  }else if(normalizedSubtab === "seedlings"){
    renderDashboardSeedlingStatus();
  }else if(normalizedSubtab === "growth"){
    renderDashboardGrowthPrediction();
  }else{
    renderDashboardResults();
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
