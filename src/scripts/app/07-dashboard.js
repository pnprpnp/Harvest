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
  dashboardGrowthDataRevision++;
  dashboardGrowthSourceCache = null;
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
  if(activeSubtab !== "guide") closeDashboardHarvestForecastControls({ restoreFocus: false });
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
  if(typeof renderDashboardGrowthChangeBadge === "function") renderDashboardGrowthChangeBadge();
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
  dashboardRenderedSubtabs.delete("graphs");
  if(normalizeDashboardSubtab(dashboardFilter.dashboardSubtab) === "graphs"){
    scheduleDashboardRenderAfterTabSelection();
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
  scheduleDashboardRenderAfterTabSelection({
    onRendered: () => {
      if(nextSubtab === "growth" && dashboardGrowthPredictionModelCache) markDashboardGrowthChangesRead();
    }
  });
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

function getDashboardHarvestForecastLossCondition(value, settingsLossRates){
  const mode = value === null ? "settings" : typeof value === "object" ? "plantingCount" : "common";
  const forecastLoss = mode === "common" ? parseDashboardHarvestForecastLossValue(value) : null;
  const lossRates = settingsLossRates.map(item => ({
    plantingCount: item.plantingCount,
    lossRate: mode === "settings" ? item.lossRate : mode === "plantingCount"
      ? parseDashboardHarvestForecastLossValue(value[item.plantingCount]) : forecastLoss
  }));
  return {
    mode, forecastLoss, lossRates,
    invalid: lossRates.some(item => item.lossRate === null)
      || !lossRates.some(item => item.lossRate < 100)
  };
}

function syncDashboardHarvestForecastBar(model){
  const text = document.getElementById("dashboardForecastBarText");
  if(!text) return;
  const cases = formatDashboardHarvestForecastInputValue(model.forecastCases) || "--";
  const rates = [...model.settingsLossRates].sort((left, right) => left.plantingCount - right.plantingCount).map(item => {
    const loss = model.lossUsesSettings ? item.lossRate : model.lossUsesPlantingCounts
      ? model.lossRates.find(rate => rate.plantingCount === item.plantingCount)?.lossRate : model.forecastLoss;
    return {plantingCount:item.plantingCount, loss:formatDashboardHarvestForecastInputValue(loss) || "--"};
  });
  const fullSummary = `${cases}ケース/日　${rates.map(item => `${item.plantingCount}:${item.loss}%`).join(" / ")}`;
  // まず区切りの余白を詰め、さらに長い条件だけ数字の強調サイズを抑える。
  const tightSpacing = fullSummary.length >= 37;
  const gap = tightSpacing ? " " : "　";
  const separator = tightSpacing ? "/" : " / ";
  const summary = `${cases}ケース/日${gap}${rates.map(item => `${item.plantingCount}:${item.loss}%`).join(separator)}`;
  if(text.textContent !== summary || !text.querySelector(".dashboardForecastBarValue")){
    const emphasize = value => `<strong class="dashboardForecastBarValue">${escapeHtml(String(value))}</strong>`;
    text.innerHTML = `${emphasize(cases)}ケース/日${gap}${rates.map(item => `${item.plantingCount}:${emphasize(item.loss)}%`).join(separator)}`;
  }
  document.getElementById("dashboardForecastBarSummary")?.classList.toggle("is-compact", fullSummary.length >= 39);
}

function handleDashboardHarvestForecastControlsToggle(event){
  const details = event.target;
  const summary = document.getElementById("dashboardForecastBarSummary");
  summary?.setAttribute("aria-expanded", details.open ? "true" : "false");
  const backdrop = document.getElementById("dashboardForecastControlsBackdrop");
  if(backdrop) backdrop.hidden = !details.open;
  if(!details.open){
    // 閉じたときは未反映の入力だけを破棄し、実際の予測条件へ戻す。
    dashboardHarvestForecastCasesDraftValue = dashboardHarvestForecastCasesValue;
    dashboardHarvestForecastLossDraftValue = dashboardHarvestForecastLossValue && typeof dashboardHarvestForecastLossValue === "object"
      ? {...dashboardHarvestForecastLossValue} : dashboardHarvestForecastLossValue;
  }
  const model = dashboardHarvestForecastModelCache || buildDashboardHarvestForecastModel();
  dashboardHarvestForecastModelCache = model;
  syncDashboardHarvestForecastInputs(model);
}

function closeDashboardHarvestForecastControls(options = {}){
  const details = document.getElementById("dashboardForecastControlsDetails");
  if(!details?.open) return;
  details.open = false;
  handleDashboardHarvestForecastControlsToggle({ target: details });
  if(options.restoreFocus !== false){
    document.getElementById("dashboardForecastBarSummary")?.focus({ preventScroll: true });
  }
}

function handleDashboardHarvestForecastControlsOutsideClick(event){
  const details = document.getElementById("dashboardForecastControlsDetails");
  if(!details?.open || details.contains(event.target)) return;
  // 共通の選択メニューはbody直下に開くため、入力欄の内側として扱う。
  if(event.target.closest?.(".appSelectMenu")) return;
  closeDashboardHarvestForecastControls({ restoreFocus: false });
}

function handleDashboardHarvestForecastInput(kind){
  const model = dashboardHarvestForecastModelCache || buildDashboardHarvestForecastModel();
  if(kind === "cases"){
    dashboardHarvestForecastCasesDraftValue = document.getElementById("dashboardForecastCasesInput")?.value ?? "";
  }else if(kind === "loss"){
    dashboardHarvestForecastLossDraftValue = document.getElementById("dashboardForecastLossInput")?.value ?? "";
  }else if(kind.startsWith("loss:")){
    const plantingCount = Number(kind.split(":")[1]);
    if(!ALLOWED_YIELDS.includes(plantingCount) || !dashboardHarvestForecastLossDraftValue
      || typeof dashboardHarvestForecastLossDraftValue !== "object") return;
    dashboardHarvestForecastLossDraftValue = {...dashboardHarvestForecastLossDraftValue,
      [plantingCount]: document.getElementById(`dashboardForecastLoss${plantingCount}Input`)?.value ?? ""};
  }else if(kind === "lossMode"){
    const mode = document.getElementById("dashboardForecastLossMode")?.value;
    if(mode === "plantingCount"){
      dashboardHarvestForecastLossDraftValue = dashboardHarvestForecastLossValue && typeof dashboardHarvestForecastLossValue === "object"
        ? {...dashboardHarvestForecastLossValue}
        : Object.fromEntries(model.settingsLossRates.map(item => [item.plantingCount, String(item.lossRate)]));
    }else if(mode === "common"){
      const initialLoss = model.averageLoss !== null && model.averageLoss < 100
        ? model.averageLoss
        : getNormalizedBedCalculationSettings().defaultLossRate;
      dashboardHarvestForecastLossDraftValue = typeof dashboardHarvestForecastLossValue === "string"
        ? dashboardHarvestForecastLossValue : formatDashboardHarvestForecastInputValue(initialLoss < 100 ? initialLoss : 0);
    }else{
      dashboardHarvestForecastLossDraftValue = null;
    }
  }else{
    return;
  }
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
  const lossCondition = getDashboardHarvestForecastLossCondition(dashboardHarvestForecastLossDraftValue, currentModel.settingsLossRates);
  if(forecastCases === null || lossCondition.invalid){
    syncDashboardHarvestForecastInputs(currentModel);
    return;
  }

  dashboardHarvestForecastCasesValue = dashboardHarvestForecastCasesDraftValue;
  dashboardHarvestForecastLossValue = lossCondition.mode === "plantingCount"
    ? {...dashboardHarvestForecastLossDraftValue} : dashboardHarvestForecastLossDraftValue;
  dashboardHarvestForecastInputsDirty = false;
  dashboardHarvestForecastModelCache = null;
  dashboardGrowthPredictionModelCache = null;
  dashboardRenderedSubtabs.delete("growth");
  renderDashboardHarvestForecast();
  closeDashboardHarvestForecastControls();
}

function syncDashboardHarvestForecastInputs(model){
  const casesInput = document.getElementById("dashboardForecastCasesInput");
  const lossInput = document.getElementById("dashboardForecastLossInput");
  const lossMode = document.getElementById("dashboardForecastLossMode");
  const casesWrap = document.getElementById("dashboardForecastCasesInputWrap");
  const lossWrap = document.getElementById("dashboardForecastLossInputWrap");
  const averageButton = document.getElementById("dashboardForecastAverageBtn");
  const applyButton = document.getElementById("dashboardForecastApplyBtn");
  const casesText = dashboardHarvestForecastCasesDraftValue === null
    ? formatDashboardHarvestForecastInputValue(model.averageCases)
    : dashboardHarvestForecastCasesDraftValue;
  const lossCondition = getDashboardHarvestForecastLossCondition(dashboardHarvestForecastLossDraftValue, model.settingsLossRates);
  const lossUsesPlantingCounts = lossCondition.mode === "plantingCount";
  const lossText = lossCondition.mode === "common" ? dashboardHarvestForecastLossDraftValue : "";

  if(casesInput && casesInput.value !== casesText) casesInput.value = casesText;
  if(lossInput && lossInput.value !== lossText) lossInput.value = lossText;
  if(lossMode) lossMode.value = lossCondition.mode;
  if(lossInput) lossInput.disabled = lossCondition.mode !== "common";
  if(lossWrap) lossWrap.hidden = lossCondition.mode !== "common";
  const plantingLossInputs = document.getElementById("dashboardForecastPlantingLossInputs");
  if(plantingLossInputs) plantingLossInputs.hidden = !lossUsesPlantingCounts;
  lossCondition.lossRates.forEach(item => {
    const input = document.getElementById(`dashboardForecastLoss${item.plantingCount}Input`);
    if(!input) return;
    const value = lossUsesPlantingCounts ? String(dashboardHarvestForecastLossDraftValue[item.plantingCount] ?? "") : "";
    if(input.value !== value) input.value = value;
    input.disabled = !lossUsesPlantingCounts;
    const invalid = lossUsesPlantingCounts && item.lossRate === null;
    input.setAttribute("aria-invalid", invalid ? "true" : "false");
    input.closest(".dashboardForecastValueInput")?.classList.toggle("invalid", invalid);
  });
  const averageNote = document.getElementById("dashboardForecastLossAverageNote");
  if(averageNote){
    averageNote.textContent = model.averageLoss === null
      ? "参考：直近1ヶ月の平均ロス率は記録不足で算出できません"
      : `参考：直近1ヶ月の平均ロス率 ${formatDashboardHarvestForecastInputValue(model.averageLoss)}%`;
  }
  const draftForecastCases = dashboardHarvestForecastCasesDraftValue === null
    ? model.averageCases
    : parseDashboardHarvestForecastCasesValue(dashboardHarvestForecastCasesDraftValue);
  const casesInvalid = draftForecastCases === null;
  const lossInvalid = lossCondition.invalid;
  const modelLossMode = model.lossUsesSettings ? "settings" : model.lossUsesPlantingCounts ? "plantingCount" : "common";
  const lossMatchesCurrentForecast = lossCondition.mode === modelLossMode && !lossInvalid
    && lossCondition.lossRates.every(item => {
      const applied = model.lossRates.find(rate => rate.plantingCount === item.plantingCount)?.lossRate;
      return applied !== null && Math.abs(item.lossRate - applied) < 0.000001;
    });
  const casesMatchCurrentForecast = draftForecastCases === null
    ? model.forecastCases === null
    : Number.isFinite(model.forecastCases)
      && Math.abs(draftForecastCases - model.forecastCases) < 0.000001;
  const valuesMatchCurrentForecast = casesMatchCurrentForecast && lossMatchesCurrentForecast;
  dashboardHarvestForecastInputsDirty = !valuesMatchCurrentForecast;
  const pendingNote = document.getElementById("dashboardForecastPendingNote");
  if(pendingNote) pendingNote.hidden = !dashboardHarvestForecastInputsDirty;
  casesWrap?.classList.toggle("autoValue", dashboardHarvestForecastCasesDraftValue === null);
  casesWrap?.classList.toggle("invalid", casesInvalid);
  lossWrap?.classList.toggle("invalid", lossCondition.mode === "common" && lossInvalid);
  casesInput?.setAttribute("aria-invalid", casesInvalid ? "true" : "false");
  lossInput?.setAttribute("aria-invalid", lossCondition.mode === "common" && lossInvalid ? "true" : "false");
  lossMode?.setAttribute("aria-invalid", lossInvalid ? "true" : "false");
  if(averageButton){
    averageButton.disabled = dashboardHarvestForecastCasesDraftValue === null
      && dashboardHarvestForecastLossDraftValue === null;
  }
  if(applyButton){
    applyButton.disabled = !dashboardHarvestForecastInputsDirty || casesInvalid || lossInvalid;
  }
  syncDashboardHarvestForecastBar(model);
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
  const lossUsesSettings = dashboardHarvestForecastLossValue === null;
  const forecastCases = casesUsesAverage
    ? normalizedAverageCases
    : parseDashboardHarvestForecastCasesValue(dashboardHarvestForecastCasesValue);
  const settingsLossRates = ALLOWED_YIELDS.map(plantingCount => ({
    plantingCount,
    lossRate: getAppliedLossRateForPlantingCount(bedOrder[0], plantingCount)
  }));
  const lossCondition = getDashboardHarvestForecastLossCondition(dashboardHarvestForecastLossValue, settingsLossRates);

  const model = {
    averageCases: normalizedAverageCases,
    averageLoss: normalizedAverageLoss,
    forecastCases,
    forecastLoss: lossCondition.forecastLoss,
    casesUsesAverage,
    lossUsesSettings,
    lossUsesPlantingCounts: lossCondition.mode === "plantingCount",
    lossRates: lossCondition.lossRates,
    settingsLossRates,
    canForecast: forecastCases !== null && !lossCondition.invalid,
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

  // 各予測日に同じ試算条件を再構築せず、一度だけ用意する。
  const lossOptions = model.lossUsesSettings ? {} : model.lossUsesPlantingCounts
    ? {harvestLossRatesByPlantingCount: Object.fromEntries(model.lossRates.map(item => [item.plantingCount, item.lossRate]))}
    : {harvestRate: (100 - model.forecastLoss) / 100};
  const virtualRecords = [...records].sort(compareRecordsByDateDesc);
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
      // 目安専用の試算値を選択処理へ渡し、共通のシミュ設定には書き戻さない。
      ...lossOptions,
      additionalExcludedPalletKeys: model.palletForecasts.keys(),
      releaseOldestIfBlocked: true
    });
    if(!selection.palletKeys.length) break;

    let newForecastCount = 0;
    selection.palletKeys.forEach(key => {
      if(model.palletForecasts.has(key)) return;
      const pallet = parsePalletKey(key);
      const plantCount = getHarvestPlantCountForPallet(pallet.building, pallet.bed, pallet.number, forecastDate);
      const lossRate = model.lossUsesSettings
        ? getAppliedLossRateForPlantingCount(pallet.bed, plantCount)
        : model.lossUsesPlantingCounts
        ? lossOptions.harvestLossRatesByPlantingCount[plantCount]
        : model.forecastLoss;
      model.palletForecasts.set(key, {
        date: new Date(forecastDate),
        daysAfter: getLocalDayDiff(referenceDate, forecastDate),
        harvestDateIndex: iteration,
        lossRate,
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
  if(model.lossUsesSettings && !model.settingsLossRates.some(item => item.lossRate < 100)){
    reasons.push("設定の収穫ロス率がすべて100%のため見込み収穫数を計算できません");
  }else if(model.lossUsesPlantingCounts && (model.lossRates.some(item => item.lossRate === null)
    || !model.lossRates.some(item => item.lossRate < 100))){
    reasons.push(model.lossRates.some(item => item.lossRate === null)
      ? "植え付け数ごとの収穫ロス率を0〜100%で入力してください"
      : "収穫ロス率がすべて100%のため見込み収穫数を計算できません");
  }else if(!model.lossUsesSettings && !model.lossUsesPlantingCounts && model.forecastLoss === null){
    reasons.push("共通の収穫ロス率を0〜100%で入力してください");
  }else if(!model.lossUsesSettings && !model.lossUsesPlantingCounts && model.forecastLoss >= 100){
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
    showToast("移動する記録の日付を確認できませんでした", { error:true });
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
let dashboardGrowthDataRevision = 0;
let dashboardGrowthSourceCache = null;
let dashboardGrowthArchiveStatus = "";
let dashboardGrowthArchivePending = null;
let dashboardGrowthForecastHistoryCache = null;
let dashboardGrowthEvaluationWorker = null;
let dashboardGrowthPlanningShowsQuantity = false;
const DASHBOARD_GROWTH_CULTIVAR = "マルチリーフエアリ";
const DASHBOARD_GROWTH_CHANGE_STATE_PREFIX = "harvestnaviGrowthChangeState_v1:";

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
    dashboardGrowthDataRevision++;
    dashboardGrowthPredictionModelCache = null;
    dashboardGrowthForecastHistoryCache = null;
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
  const hours = getDashboardGrowthForecastNumber(sunshineHours);
  if(hours === null || hours < 0 || hours > 24) return null;
  return Math.max(0.3, Math.min(1.2, hours / 8));
}

function getDashboardGrowthForecastNumber(value){
  if((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") return null;
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
  const fallbackMin = normalMin;
  const fallbackMax = normalMax;
  const daily = [...dailyByDate.values()].map(day => {
    const hasMin = getDashboardGrowthForecastNumber(day.minTemp) !== null;
    const hasMax = getDashboardGrowthForecastNumber(day.maxTemp) !== null;
    const minTemp = hasMin ? Number(day.minTemp) : null;
    const maxTemp = hasMax ? Number(day.maxTemp) : null;
    return {
      ...day,
      minTemp,
      maxTemp,
      meanTemp:hasMin && hasMax ? (minTemp + maxTemp) / 2 : null,
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
      meanTemp:fallbackMin !== null && fallbackMax !== null ? (fallbackMin + fallbackMax) / 2 : null,
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
  const cacheAge = cached ? Date.now() - Number(cached.successfulAt || cached.fetchedAt || 0) : Infinity;
  if(!options.force && cached && cached.weatherPolicy === "provider-fallback-v1" && !cached.stale && cacheAge >= 0 && cacheAge < 24 * 60 * 60 * 1000){
    return { ...cached, usedCache:true };
  }
  let relayWeather = null;
  try{
    relayWeather = await fetchDashboardGrowthWeatherFromRelay(location);
  }catch(error){
    if(cached) return { ...cached, usedCache:true, stale:true,
      fetchError:error?.name === "AbortError" ? "気象データの取得が時間切れになりました" : String(error?.message || "気象データを取得できませんでした") };
    throw error;
  }
  const cache = {
    schemaVersion:3,
    locationKey:getDashboardGrowthLocationKey(location),
    fetchedAt:Number(relayWeather.fetchedAt || Date.now()),
    successfulAt:relayWeather.stale === true ? Number(cached?.successfulAt || cached?.fetchedAt || 0) : Date.now(),
    provider:"jma",
    timezone:"Asia/Tokyo",
    forecastEndDate:String(relayWeather.forecastEndDate || ""),
    historyStartDate:String(relayWeather.historyStartDate || ""),
    historyThrough:String(relayWeather.historyThrough || ""),
    refreshStatus:String(relayWeather.refreshStatus || ""),
    lastError:String(relayWeather.lastError || ""),
    nextAttemptAt:String(relayWeather.nextAttemptAt || ""),
    lastAttemptAt:String(relayWeather.lastAttemptAt || ""),
    forecastIssuedAt:String(relayWeather.forecastIssuedAt || ""),
    retrievedAt:String(relayWeather.retrievedAt || ""),
    historyCoverage:relayWeather.historyCoverage || null,
    weatherPolicy:relayWeather.weatherPolicy || null,
    fallbackErrors:relayWeather.fallbackErrors || [],
    station:relayWeather.station || null,
    normal:relayWeather.normal || {},
    daily:relayWeather.daily,
    stale:relayWeather.stale === true,
    receivedAt:new Date().toISOString()
  };
  try{
    harvestnaviLocalStorage.writeJson(DASHBOARD_GROWTH_WEATHER_CACHE_KEY, cache);
  }catch(error){
    cache.storageWarning = "気象キャッシュを端末に保存できませんでした";
  }
  return { ...cache, usedCache:false };
}

function getDashboardGrowthMedian(values){
  const sorted = (Array.isArray(values) ? values : [])
    .filter(value => value !== null && value !== undefined && String(value).trim() !== "")
    .map(Number)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if(!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function buildDashboardGrowthWeatherIndex(weather, asOf = new Date()){
  const dailyByDate = new Map();
  const observationDays = [];
  const asOfKey = formatDateOnlyString(asOf);
  (weather?.daily || []).forEach(day => {
    if(!parseDateOnlyString(day?.date)) return;
    if(day.source === "observation" && day.date < asOfKey){
      dailyByDate.set(day.date, day);
      if(getDashboardGrowthForecastNumber(day.meanTemp) !== null
        && getDashboardGrowthForecastNumber(day.lightIndex) !== null) observationDays.push(day);
    }else if(day.source === "forecast" && day.date >= asOfKey){
      const issuedAt = new Date(day.issuedAt || weather.forecastIssuedAt || "").getTime();
      if(Number.isFinite(issuedAt) && issuedAt <= new Date(asOf).getTime()
        && (!weather.forecastEndDate || day.date <= weather.forecastEndDate)) dailyByDate.set(day.date, day);
    }
  });
  return { dailyByDate, observationDays, climateByMonthDay:new Map(), asOf:asOfKey,
    baseline:{ meanTemp:null, maxTemp:null, minTemp:null, lightIndex:null, source:"missing" } };
}

function getDashboardGrowthWeatherDay(weatherIndex, date, options = {}){
  const dateKey = formatDateOnlyString(date);
  const direct = weatherIndex.dailyByDate.get(dateKey);
  if(direct) return { ...direct, estimated:direct.estimatedTemperature === true || direct.estimatedLight === true };
  // Past gaps may use historical evidence. Future gaps must stay unpredicted,
  // including the retained legacy path and offline operation.
  if(dateKey >= (weatherIndex.asOf || formatDateOnlyString(new Date()))) return null;
  if(options.allowClimate === false) return null;
  const monthDay = dateKey.slice(5);
  if(!weatherIndex.climateByMonthDay.has(monthDay)){
    const seasonDay = key => new Date(`2000-${key.slice(5)}T12:00:00Z`).getTime() / 86400000;
    const target = seasonDay(dateKey);
    const nearby = (weatherIndex.observationDays || []).filter(day => {
      const distance = Math.abs(seasonDay(day.date) - target);
      return Math.min(distance, 366 - distance) <= 21;
    });
    const median = key => getDashboardGrowthMedian(nearby.map(day => getDashboardGrowthForecastNumber(day[key])));
    weatherIndex.climateByMonthDay.set(monthDay, nearby.length ? {
      meanTemp:median("meanTemp"), maxTemp:median("maxTemp"), minTemp:median("minTemp"),
      lightIndex:median("lightIndex"), source:"climate", climateSampleDays:nearby.length
    } : null);
  }
  const climate = weatherIndex.climateByMonthDay.get(monthDay);
  return climate ? { ...climate, date:dateKey, estimated:true } : null;
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
  const meanTemp = getDashboardGrowthForecastNumber(day.meanTemp);
  const maxTemp = getDashboardGrowthForecastNumber(day.maxTemp);
  const light = getDashboardGrowthForecastNumber(day.lightIndex);
  return { ...day,
    meanTemp:meanTemp === null ? null : meanTemp + adjustment.temperatureOffsetC,
    maxTemp:maxTemp === null ? null : maxTemp + adjustment.temperatureOffsetC,
    lightIndex:light === null ? null : light * adjustment.lightMultiplier
  };
}

function getDashboardGrowthDailyUnit(day, building){
  const adjusted = getDashboardGrowthAdjustedWeather(day, building);
  const temperature = getDashboardGrowthForecastNumber(adjusted?.meanTemp);
  const lightIndex = getDashboardGrowthForecastNumber(adjusted?.lightIndex);
  if(temperature === null || lightIndex === null || temperature < -60 || temperature > 60 || lightIndex < 0) return null;
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
      index.get(key).push({ date, eventId:Number(event?.eventId || 0), event });
    });
  });
  index.forEach(items => items.sort((left, right) => left.date - right.date || left.eventId - right.eventId));
  return index;
}

function getDashboardGrowthPriorPlantingDate(plantingIndex, palletKey, targetDate){
  return getDashboardGrowthPriorPlanting(plantingIndex, palletKey, targetDate)?.date || null;
}

function getDashboardGrowthPriorPlanting(plantingIndex, palletKey, targetDate){
  const items = plantingIndex.get(palletKey) || [];
  const targetTime = startOfLocalDay(targetDate).getTime();
  let low = 0, high = items.length;
  while(low < high){
    const middle = Math.floor((low + high) / 2);
    if(items[middle].date.getTime() < targetTime) low = middle + 1;
    else high = middle;
  }
  return low ? items[low - 1] : null;
}

function buildDashboardGrowthTrainingSamples(asOf = new Date()){
  return getDashboardGrowthSourceState(asOf).samples;
}

function getDashboardGrowthSourceState(asOf = new Date()){
  const asOfKey = formatDateOnlyString(asOf);
  const observationRevision = typeof HarvestGrowthObservations !== "undefined" ? HarvestGrowthObservations.revision() : 0;
  const role = typeof getActiveRecordsStorageKey === "function" ? getActiveRecordsStorageKey() : "";
  if(dashboardGrowthSourceCache?.revision === dashboardGrowthDataRevision
    && dashboardGrowthSourceCache.observationRevision === observationRevision && dashboardGrowthSourceCache.role === role
    && dashboardGrowthSourceCache.asOf === asOfKey
    && dashboardGrowthSourceCache.records === records
    && dashboardGrowthSourceCache.plantingEvents === plantingEvents) return dashboardGrowthSourceCache;
  const plantingIndex = buildDashboardGrowthPlantingIndex();
  const cutoff = formatDateOnlyString(addDays(startOfLocalDay(asOf), -730));
  const lastHarvest = new Map();
  const partialDates = new Map();
  const partialAvailableAtByPallet = new Map();
  const samples = [];
  const observations = typeof HarvestGrowthObservations !== "undefined" ? HarvestGrowthObservations.list() : [];
  const observationsByCrop = new Map();
  observations.forEach(row=>{
    const id=`${row.plantingEventId}:${row.plantingDate}`;
    if(!observationsByCrop.has(id)) observationsByCrop.set(id,[]);
    observationsByCrop.get(id).push(row);
  });
  const diagnostics = { missingPlanting:0, invalidCycle:0, excludedAge:0, mixedDates:0 };
  const ordered = records.filter(record => parseDateOnlyString(record?.date) && record.date <= asOfKey)
    .slice().sort((a, b) => a.date.localeCompare(b.date)
      // 日付単位の記録では、同日の先取りを収穫結果より先に反映する。
      // 保存・同期時のIDの大小で、この作の部分収穫を見落とさない。
      || Number(a.type !== "partialHarvest") - Number(b.type !== "partialHarvest")
      || Number(a.id || 0) - Number(b.id || 0));
  ordered.forEach(record => {
    if(record.type === "partialHarvest"){
      const timestamps = [record.createdAt, record.updatedAt]
        .filter(value => value && Number.isFinite(new Date(value).getTime())).sort((a,b) => new Date(a) - new Date(b));
      const availableAt = timestamps[timestamps.length - 1] || "";
      normalizePartialHarvestTargets(record.targets).forEach(target => {
        const partialGroups = new Map();
        const positionKnown = target.start !== 1 || target.end !== PALLETS_PER_BED;
        for(let number = target.start; number <= target.end; number++){
          const key = getPalletKey(target.building, target.bed, number);
          partialDates.set(key, record.date);
          partialAvailableAtByPallet.set(key, availableAt);
          const planting = getDashboardGrowthPriorPlanting(plantingIndex,key,parseDateOnlyString(record.date));
          if(!planting || (lastHarvest.get(key) && formatDateOnlyString(planting.date) < lastHarvest.get(key))) continue;
          const cropId = `${planting.eventId}:${target.building}-${target.bed}`;
          if(!partialGroups.has(cropId)) partialGroups.set(cropId,{planting,keys:[]});
          partialGroups.get(cropId).keys.push(key);
        }
        partialGroups.forEach(({planting,keys},cropId)=>{
          const plantingDate = formatDateOnlyString(planting.date);
          const age = getLocalDayDiff(planting.date,parseDateOnlyString(record.date));
          if(record.date < cutoff || age < 1 || age > 180) return;
          const timestamps = [availableAt,planting.event?.updatedAt,planting.event?.createdAt].filter(Boolean).sort((a,b)=>new Date(a)-new Date(b));
          samples.push({id:`partial:${record.recordUuid || record.id}:${cropId}`,groupId:String(record.recordUuid || record.id),cropId,
            plantingEventId:planting.eventId,building:target.building,bed:target.bed,bedKey:`${target.building}-${target.bed}`,
            plantingDate:new Date(planting.date),date:parseDateOnlyString(record.date),ageDays:age,
            sizeRating:"large",signalKind:positionKnown ? "partial-position" : "partial-bed",
            // A whole-bed old partial record says that some large plants existed;
            // it does not identify which pallet held them.
            palletKeys:positionKnown ? keys : [],palletCount:positionKnown ? keys.length : 0,
            availableAt:timestamps[timestamps.length-1] || "",plantingAvailableAt:planting.event?.updatedAt || planting.event?.createdAt || "",
            symptoms:{tipburn:"unknown",elongated:"unknown",uneven:"unknown"},qualityObserved:false,
            qualityWeight:positionKnown ? 1 : .2,readyDate:"",cultivar:""});
        });
      });
      return;
    }
    const keys = getPalletKeysFromRecord(record);
    const groups = new Map();
    keys.forEach(key => {
      const planting = getDashboardGrowthPriorPlanting(plantingIndex, key, parseDateOnlyString(record.date));
      const previousHarvest = lastHarvest.get(key);
      lastHarvest.set(key, record.date);
      if(record.date < cutoff) return;
      if(!planting){ diagnostics.missingPlanting++; return; }
      const plantingKey = formatDateOnlyString(planting.date);
      if(previousHarvest && plantingKey < previousHarvest){ diagnostics.invalidCycle++; return; }
      const age = getLocalDayDiff(planting.date, parseDateOnlyString(record.date));
      if(age < 1 || age > 180){ diagnostics.excludedAge++; return; }
      const bedKey = getHarvestBedKeyFromPalletKey(key);
      if(!bedKey) return;
      const groupKey = `${bedKey}:${planting.eventId}:${plantingKey}`;
      if(!groups.has(groupKey)) groups.set(groupKey, { planting, bedKey, keys:[], partial:false, partialAvailableAt:new Set() });
      const group = groups.get(groupKey);
      group.keys.push(key);
      if(partialDates.get(key) >= plantingKey){
        group.partial = true;
        group.partialAvailableAt.add(partialAvailableAtByPallet.get(key));
      }
    });
    groups.forEach(group => {
      const { planting, bedKey } = group;
      const state = getHarvestGrowthStateForBed(record, bedKey);
      const evidence = getHarvestGrowthEvidenceForBed(record, bedKey);
      const [buildingText, bed] = bedKey.split("-");
      const id = String(record.recordUuid || record.id);
      const readyDate = parseDateOnlyString(state.readyDate || "");
      const validReady = readyDate && readyDate >= planting.date && state.readyDate <= record.date ? state.readyDate : "";
      // 部分収穫を使って学習の重みを下げる場合、その記録が利用可能になった
      // 時点より前の検証へ、後日登録・修正された情報を持ち込まない。
      const timestamps = [record.updatedAt, record.createdAt, planting.event?.updatedAt, planting.event?.createdAt,
        ...group.partialAvailableAt]
        .filter(value => value && Number.isFinite(new Date(value).getTime())).sort((a,b) => new Date(a) - new Date(b));
      const plantingTimestamps = [planting.event?.updatedAt, planting.event?.createdAt]
        .filter(value => value && Number.isFinite(new Date(value).getTime())).sort((a,b) => new Date(a) - new Date(b));
      const readiness = typeof HarvestGrowthReadiness !== "undefined" ? HarvestGrowthReadiness.resolve({
        plantingEventId:planting.eventId,plantingDate:formatDateOnlyString(planting.date),palletKeys:group.keys,
        harvestDate:record.date,manual:{mode:state.readyDateMode || (validReady ? "manual" : "auto"),
          date:validReady,availableAt:record.updatedAt || record.createdAt || ""},
        observations:observationsByCrop.get(`${planting.eventId}:${formatDateOnlyString(planting.date)}`) || [],asOf:asOf.toISOString()
      }) : [{palletKeys:group.keys,readyDate:validReady,availableAt:"",observationIds:[]}];
      readiness.forEach((ready,index)=>samples.push({
        id:`${id}:${bedKey}:${planting.eventId}:${index}`, groupId:id, cropId:`${planting.eventId}:${bedKey}`,
        plantingEventId:planting.eventId,
        building:Number(buildingText), bed, bedKey, plantingDate:new Date(planting.date), date:parseDateOnlyString(record.date),
        ageDays:getLocalDayDiff(planting.date, parseDateOnlyString(record.date)),
        sizeRating:evidence.confirmed.sizeRating,
        possibleSizeRating:evidence.possible.sizeRating,
        uneven:isHarvestSymptomPresent(evidence.confirmed.unevenStatus),
        tipburn:isHarvestSymptomPresent(evidence.confirmed.tipburnStatus),
        elongated:isHarvestSymptomPresent(evidence.confirmed.elongatedStatus),
        cultivar:state.cultivar || "",
        readyDate:ready.readyDate,readyObservationIds:ready.observationIds,
        availableAt:[...timestamps,ready.availableAt].filter(Boolean).sort((a,b)=>new Date(a)-new Date(b)).pop() || "",
        plantingAvailableAt:plantingTimestamps[plantingTimestamps.length - 1] || "",
        symptoms:{ tipburn:evidence.confirmed.tipburnStatus,
          elongated:evidence.confirmed.elongatedStatus,
          uneven:evidence.confirmed.unevenStatus },
        possibleSymptoms:{ tipburn:evidence.possible.tipburnStatus,
          elongated:evidence.possible.elongatedStatus,
          uneven:evidence.possible.unevenStatus },
        qualityObserved:["tipburnStatus","elongatedStatus","unevenStatus"].some(field => evidence.confirmed[field] !== "unknown"),
        palletCount:ready.palletKeys.length, palletKeys:ready.palletKeys, partial:group.partial,
        qualityWeight:(group.partial ? 0.5 : 1) * (isHarvestSymptomPresent(evidence.confirmed.unevenStatus) ? 0.6 : 1) * (planting.event?.detailsUnknown ? 0.7 : 1)
      }));
    });
  });
  const currentPlanting = new Map();
  plantingIndex.forEach((items, key) => {
    const item = [...items].reverse().find(value => formatDateOnlyString(value.date) <= asOfKey);
    if(item && (!lastHarvest.has(key) || formatDateOnlyString(item.date) >= lastHarvest.get(key))){
      currentPlanting.set(key, item);
    }
  });
  dashboardGrowthSourceCache = { revision:dashboardGrowthDataRevision, asOf:asOfKey,
    observationRevision,role,records, plantingEvents, samples, currentPlanting, partialDates, diagnostics };
  return dashboardGrowthSourceCache;
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
  const state = getDashboardGrowthSourceState();
  const start = formatDateOnlyString(plantingDate);
  for(let number = 1; number <= PALLETS_PER_BED; number++){
    if(state.partialDates.get(getPalletKey(building, bed, number)) >= start) return true;
  }
  return false;
}

function getDashboardGrowthRisk(weatherIndex, forecastDate, building, samples){
  if(weatherIndex.riskFit){
    return HarvestGrowthRisk.predict(weatherIndex.riskFit, {
      building, forecastDate:formatDateOnlyString(forecastDate), asOf:weatherIndex.riskAsOf,
      manualAdjustment:getDashboardGrowthBuildingAdjustment(building), weatherDaily:weatherIndex.riskWeather
    });
  }
  const today = startOfLocalDay(new Date());
  const end = new Date(Math.min(forecastDate.getTime(), addDays(today, 6).getTime()));
  const days = [];
  for(let cursor = today; cursor <= end; cursor = addDays(cursor, 1)){
    const day = getDashboardGrowthWeatherDay(weatherIndex, cursor, { allowClimate:false });
    if(day?.source === "forecast") days.push(getDashboardGrowthAdjustedWeather(day, building));
  }
  const hotDays = days.filter(day => day.maxTemp !== null && day.maxTemp >= 28).length;
  const lowLightDays = days.filter(day => day.meanTemp !== null && day.meanTemp >= 21
    && day.lightIndex !== null && day.lightIndex < 0.8).length;
  const result = {};
  ["tipburn", "elongated"].forEach(symptom => {
    const confirmed = new Map();
    samples.filter(sample => sample.building === building).forEach(sample => {
      const status = sample.symptoms?.[symptom];
      if(!["present", "none"].includes(status)) return;
      const key = sample.groupId || sample.id;
      if(status === "present" || !confirmed.has(key)) confirmed.set(key, status);
    });
    const count = confirmed.size;
    const present = [...confirmed.values()].filter(value => value === "present").length;
    const weatherDays = symptom === "tipburn" ? hotDays : lowLightDays;
    result[symptom] = {
      level:weatherDays ? "watch" : "unknown", label:weatherDays ? "参考注意" : "判断材料不足",
      reference:true, confirmedCount:count, presentCount:present, weatherDays,
      reason:`${symptom === "tipburn" ? "最高気温28℃以上" : "平均気温21℃以上かつ日照係数0.8未満"}の予報が${weatherDays}日。` +
        (count ? `同じ号棟の確認済み${count}件中、症状あり${present}件。` : "確認済みの症状記録がありません。") +
        "症状の発生確率は未検証です。"
    };
  });
  return result;
}

function getDashboardGrowthTemperatureTotal(context,start,end){
  const engine=HarvestGrowthModel;
  if(!context?.observations || !context?.forecasts || !engine.dateKey(start) || !engine.dateKey(end) || start>end) return null;
  const days=engine.daysBetween(start,end)+1;
  if(days>731) return null;
  let cache=context.temperatureTotalCache;
  if(!cache){
    // Use the model's normalized, time-checked inputs, independently of sunshine.
    // Prefix sums allow all beds to share one weather index without range scans.
    const rows=[...context.observations.values(),...context.forecasts.values()]
      .filter(day=>Number.isFinite(day.meanTemp)
        && (!day.estimatedTemperature || day.weatherPolicy==="provider-fallback-v1"))
      .sort((a,b)=>a.date.localeCompare(b.date));
    const prefixes=[{total:0,observed:0,forecast:0,fallback:0}];
    rows.forEach(day=>{
      const value={...prefixes[prefixes.length-1]};
      value.total+=day.meanTemp;
      const kind=day.fallbackFields?.includes("meanTemp") ? "fallback" : day.source==="forecast" ? "forecast" : "observed";
      value[kind]++;
      prefixes.push(value);
    });
    cache={dates:rows.map(day=>day.date),prefixes,ranges:new Map()};
    context.temperatureTotalCache=cache;
  }
  const key=`${start}|${end}`;
  if(cache.ranges.has(key)) return cache.ranges.get(key);
  const lowerBound=date=>{
    let low=0,high=cache.dates.length;
    while(low<high){
      const middle=Math.floor((low+high)/2);
      if(cache.dates[middle]<date) low=middle+1;
      else high=middle;
    }
    return low;
  };
  const first=lowerBound(start),last=lowerBound(engine.addDays(end,1));
  const missingDays=days-(last-first),before=cache.prefixes[first],after=cache.prefixes[last];
  const result={start,end,total:missingDays ? null : after.total-before.total,missingDays,
    dayCounts:{observed:after.observed-before.observed,forecast:after.forecast-before.forecast,
      fallback:after.fallback-before.fallback,total:days}};
  cache.ranges.set(key,result);
  return result;
}

function getDashboardGrowthBedPrediction(baseModel, weatherIndex, samples, building, bed, target = null){
  // A model-less call is retained for legacy previews/tests; production supplies the fitted engine.
  if(!baseModel.growthFit) return getDashboardGrowthLegacyBedPrediction(baseModel, weatherIndex, samples, building, bed, target);
  const range = baseModel.bedRanges.get(`${building}-${bed}`) || null;
  const cohorts = new Map();
  const today = parseDateOnlyString(baseModel.growthAsOf.slice(0, 10));
  for(let number = 1; number <= PALLETS_PER_BED; number++){
    const key = getPalletKey(building, bed, number);
    const plantingDate = baseModel.plantingDateByPallet.get(key);
    if(!plantingDate || baseModel.estimatedPlantingPalletKeys.has(key)) continue;
    const forecastDate = baseModel.palletForecasts.get(key)?.date || today;
    const plantingEventId = baseModel.growthPlantingByPallet?.get(key)?.eventId || 0;
    const positionKey = baseModel.growthFit.candidate?.byPosition?.get(key)?.learned
      || baseModel.growthShadowFit?.candidate?.byPosition?.get(key)?.learned ? key : "";
    const observationScope = baseModel.growthObservationScopeByPallet?.get(key) || "";
    const cohortKey = `${plantingEventId}:${formatDateOnlyString(plantingDate)}:${formatDateOnlyString(forecastDate)}:${positionKey}:${observationScope}`;
    if(!cohorts.has(cohortKey)) cohorts.set(cohortKey, { plantingEventId,plantingDate, forecastDate,positionKey,palletKeys:[] });
    cohorts.get(cohortKey).palletKeys.push(key);
  }
  const items = [...cohorts.values()].map(cohort => {
    let input = {
      plantingEventId:cohort.plantingEventId,
      plantingDate:formatDateOnlyString(cohort.plantingDate), targetDate:formatDateOnlyString(cohort.forecastDate),
      building, bed,palletKeys:cohort.palletKeys,positionKey:cohort.positionKey,
      asOf:baseModel.growthAsOf, manualAdjustment:getDashboardGrowthBuildingAdjustment(building)
    };
    if(typeof HarvestGrowthEvidence !== "undefined") input=HarvestGrowthEvidence.annotate([input],
      baseModel.growthObservationsByBuilding?.get(building) || [],{asOf:baseModel.growthAsOf})[0];
    const prediction=HarvestGrowthModel.predict(baseModel.growthFit,input);
    const currentPrediction=HarvestGrowthModel.predict(baseModel.growthFit,{...input,targetDate:baseModel.growthAsOf.slice(0,10)});
    if(input.growthEvidence?.reasons?.length) prediction.reasons=[...prediction.reasons,...input.growthEvidence.reasons.map(reason=>reason.text)];
    if(input.growthEvidence?.confidenceReduced && prediction.confidence?.level !== "insufficient"){
      prediction.confidence={level:"reference",label:"参考値",reason:input.growthEvidence.reasons.map(reason=>reason.text).join("。")};
    }
    const riskInput={asOf:baseModel.growthAsOf,building,forecastDate:input.targetDate,
      manualAdjustment:input.manualAdjustment,environmentRegimes:input.environmentRegimes,weatherDaily:weatherIndex.riskWeather};
    return {...cohort,input,prediction,currentPrediction,
      temperatureTotals:{
        current:getDashboardGrowthTemperatureTotal(baseModel.growthFit.weatherContext,input.plantingDate,baseModel.growthAsOf.slice(0,10)),
        scheduled:getDashboardGrowthTemperatureTotal(baseModel.growthFit.weatherContext,input.plantingDate,input.targetDate)
      },
      risk:baseModel.growthRiskFit ? HarvestGrowthRisk.predict(baseModel.growthRiskFit,riskInput) : null,
      shadowRisk:baseModel.growthShadowRiskFit ? HarvestGrowthRisk.predict(baseModel.growthShadowRiskFit,riskInput) : null,
      shadowPrediction:baseModel.growthShadowFit ? HarvestGrowthModel.predict(baseModel.growthShadowFit,input) : null};
  });
  const weightedMedian = getter => {
    const values = items.flatMap(item => {
      const value = getter(item.prediction);
      return Number.isFinite(value) ? Array(item.palletKeys.length).fill(value) : [];
    });
    return getDashboardGrowthMedian(values);
  };
  const ratio = weightedMedian(value => value.ratio);
  const progress = weightedMedian(value => value.progress);
  const valid = items.filter(item => item.prediction.status !== "unknown");
  const representative = valid.slice().sort((a,b) => Math.abs(a.prediction.ratio - ratio) - Math.abs(b.prediction.ratio - ratio))[0] || items[0];
  const prediction = representative?.prediction;
  // Classification belongs to the engine's learned interval; do not reapply
  // the old fixed 88/112% bounds after predicting.
  const status = valid.length === items.length && items.length ? prediction.status : "unknown";
  const currentStatuses=items.map(item=>item.currentPrediction?.status).filter(value=>["small","normal","large"].includes(value));
  const currentStatus=currentStatuses.length===items.length && new Set(currentStatuses).size===1 ? currentStatuses[0] : "unknown";
  const confidenceOrder = { insufficient:0, reference:1, moderate:2 };
  const leastCertain = items.slice().sort((a,b) => (confidenceOrder[a.prediction.confidence?.level] || 0)
    - (confidenceOrder[b.prediction.confidence?.level] || 0))[0]?.prediction.confidence;
  const readyDates = items.map(item => item.prediction.readyDate).filter(Boolean).sort();
  const reasons = [...new Set(items.flatMap(item => item.prediction.reasons || []))];
  const manual = getDashboardGrowthBuildingAdjustment(building);
  if(prediction?.basis?.units !== "days" && (manual.temperatureOffsetC || manual.lightMultiplier !== 1)){
    reasons.push(`環境傾向を反映：気温${manual.temperatureOffsetC > 0 ? "+" : ""}${manual.temperatureOffsetC}℃、日光${Math.round(manual.lightMultiplier * 100)}%`);
  }
  if(prediction?.basis?.buildingFactor && prediction.basis.buildingFactor !== 1){
    reasons.push(`実績から求めた号棟の目標補正${Math.round(prediction.basis.buildingFactor * 100)}%を反映`);
  }
  if(items.length > 1) reasons.push(`苗植え日・予定日・位置ごとの条件で分けた${items.length}組を個別に計算しています`);
  const partial = items.some(item => item.palletKeys.some(key => (
    getDashboardGrowthSourceState().partialDates.get(key) >= formatDateOnlyString(item.plantingDate)
  )));
  if(partial) reasons.push("一部収穫後の残り株の大きさには偏りがある可能性があります");
  if(!range && items.length) reasons.push("収穫予定が未設定のため現在の進捗を表示しています");
  return {
    building, bed, range, hasCurrentCrop:items.length > 0, status,currentStatus,
    statusLabel:!range && items.length ? "予定未設定" : (status === "unknown" ? (items.some(item=>item.prediction.outOfForecast) ? "気象予報範囲外のため未予測" : "判定材料不足") : (status === "small" ? "小さめ" : status === "large" ? "大きめ" : "並")),
    confidence:leastCertain?.label || "データ不足",
    confidenceReason:leastCertain?.reason || "",
    provisional:leastCertain?.level !== "high", ratedCount:baseModel.growthFit.sampleCount || samples.length,
    basis:{ ...(prediction?.basis || {}), achievementRate:Number.isFinite(ratio) ? ratio * 100 : null,
      currentGrowthUnits:weightedMedian(value => value.basis?.currentGrowthUnits),
      projectedGrowthUnits:weightedMedian(value => value.basis?.projectedGrowthUnits),
      targetGrowthUnits:weightedMedian(value => value.basis?.targetGrowthUnits),
      currentProgress:Number.isFinite(progress) ? progress * 100 : null,
      palletCount:items.reduce((sum,item) => sum + item.palletKeys.length, 0) },
    dayCounts:prediction?.dayCounts || {}, cohorts:items,
    readyDate:readyDates.length ? readyDates[Math.floor(readyDates.length / 2)] : null,
    readyStart:readyDates.length ? readyDates[0] : null,
    readyEnd:items.length === 1 ? prediction?.readyEnd || null : null,
    outOfForecast:items.some(item=>item.prediction.outOfForecast),
    readyRange:readyDates.length ? { start:readyDates[0], end:readyDates[readyDates.length - 1] } : null,
    interval:items.length === 1 ? (prediction?.interval || null) : null,
    risk:representative?.risk || getDashboardGrowthRisk(weatherIndex, range?.end?.date || addDays(today, 6), building, samples),
    reason:reasons.join("。") || "苗植え日と収穫評価が増えると比較できます"
  };
}

function getDashboardGrowthLegacyBedPrediction(baseModel, weatherIndex, samples, building, bed, target = null){
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
    if(!projectedUnits || projectedUnits.missingDays > 0) return;
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
  if(estimatedDays) reasons.push("過去の気象欠測を過去の観測値で補完");
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
  const asOf = getDashboardGrowthAsOf();
  const source = getDashboardGrowthSourceState();
  const existingBase = dashboardHarvestForecastModelCache || buildDashboardHarvestForecastModel();
  dashboardHarvestForecastModelCache = existingBase;
  const baseModel = { ...existingBase,
    growthPlantingByPallet:source.currentPlanting,
    growthObservationsByBuilding:typeof getDashboardGrowthObservationsByBuilding === "function" ? getDashboardGrowthObservationsByBuilding() : new Map(),
    plantingDateByPallet:new Map([...source.currentPlanting].map(([key,value]) => [key, new Date(value.date)])),
    estimatedPlantingPalletKeys:new Set([...existingBase.estimatedPlantingPalletKeys]
      .filter(key => !source.currentPlanting.has(key))), growthAsOf:asOf };
  const weatherIndex = buildDashboardGrowthWeatherIndex(weather);
  baseModel.growthObservationScopeByPallet=typeof getDashboardGrowthObservationScopes === "function"
    ? getDashboardGrowthObservationScopes(baseModel.growthObservationsByBuilding) : new Map();
  const samples = source.samples;
  const engineSamples = typeof getDashboardGrowthEngineSamples === "function" ? getDashboardGrowthEngineSamples(source,asOf) : samples.map(sample => ({ ...sample,
    plantingDate:formatDateOnlyString(sample.plantingDate), date:formatDateOnlyString(sample.date),
    manualAdjustment:getDashboardGrowthBuildingAdjustment(sample.building)
  }));
  const scope = getDashboardGrowthHistoryScope();
  const forecastHistory = dashboardGrowthForecastHistoryCache?.scope === scope
    ? dashboardGrowthForecastHistoryCache.days : [];
  baseModel.growthFit = timing.learning?.fit || (typeof getDashboardGrowthFrozenFit === "function"
    ? getDashboardGrowthFrozenFit({asOf,weatherDaily:weather.daily,forecastHistory})
    : HarvestGrowthModel.fit(engineSamples, { asOf, weatherDaily:weather.daily, forecastHistory, validation:timing.validation,selectedMethod:"legacy" }));
  const weatherDiagnostics = buildDashboardGrowthWeatherDiagnostics(weather, baseModel.growthFit.weatherContext);
  baseModel.growthShadowFit = timing.learning?.shadowFit || null;
  weatherIndex.riskFit = timing.learning?.riskFit || (typeof getDashboardGrowthFrozenRiskFit === "function"
    ? getDashboardGrowthFrozenRiskFit({asOf,weatherDaily:weather.daily},baseModel.growthFit.modelVersion || "legacy-prior-fallback")
    : HarvestGrowthRisk.fit(engineSamples, { asOf, weatherDaily:weather.daily }));
  baseModel.growthRiskFit = weatherIndex.riskFit;
  baseModel.growthShadowRiskFit = timing.learning?.shadowRiskFit || null;
  weatherIndex.riskAsOf = asOf;
  weatherIndex.riskWeather = weather.daily;
  const predictions = new Map();
  BUILDINGS.forEach(building => bedOrder.forEach(bed => {
    predictions.set(`${building}-${bed}`, getDashboardGrowthBedPrediction(baseModel, weatherIndex, samples, building, bed));
  }));
  return { baseModel, weather, weatherDiagnostics, weatherIndex, samples, engineSamples, predictions, targets:new Map(),
    fit:baseModel.growthFit, validation:timing.learning?.validation || baseModel.growthFit.validation, diagnostics:source.diagnostics,
    learning:timing.learning || null, modelVersion:timing.learning?.modelVersion || baseModel.growthFit.modelVersion || "legacy-fallback",
    shadowModelVersion:timing.learning?.shadowModelVersion || null,
    asOf, scope, revision:dashboardGrowthDataRevision, createdAt:Date.now(),
    startBuilding:baseModel.startBuilding,
    performance:{ fetchMs:Number(timing.fetchMs || 0), computeMs:performance.now() - computeStartedAt, weatherDays:weather.daily.length }
  };
}

function rebuildDashboardGrowthPredictionBuilding(model, building){
  if(!model || !BUILDINGS.includes(Number(building))) return model;
  if(!model.fit){
    model.samples = refreshDashboardGrowthSampleUnits(model.samples, model.weatherIndex, Number(building));
    const target = getDashboardGrowthTarget(model.samples, Number(building));
    model.targets.set(Number(building), target);
    bedOrder.forEach(bed => model.predictions.set(`${building}-${bed}`, getDashboardGrowthLegacyBedPrediction(
      model.baseModel, model.weatherIndex, model.samples, Number(building), bed, target
    )));
    return model;
  }
  // Manual environment changes only rerun inference on the frozen generation.
  const rebuilt = buildDashboardGrowthPredictionModel(model.weather);
  Object.assign(model, rebuilt);
  return model;
}

function getDashboardGrowthRiskHtml(label, risk, shortLabel = label){
  const level = risk?.level || "unknown";
  if(!["watch", "alert", "medium", "high"].includes(level)) return "";
  const className = ["alert","high"].includes(level) ? " is-alert" : " is-watch";
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
  if(item?.cohorts) return getDashboardGrowthLearningBasisHtml(item);
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
      <p class="dashboardGrowthBasisMethod">積算生育値は、苗植え日からの毎日の平均気温と日照条件を生育分へ換算して合計しています。過去期間は気象庁の観測値、今後は実際に取得した予報だけを使い、予報範囲外は未予測です。${escapeHtml(palletNote)}</p>
    </section>
  `;
}

async function runDashboardGrowthEvaluation(samples, options){
  if(typeof Worker === "undefined" || typeof HarvestGrowthModel.getBacktestWorkerSource !== "function"){
    await new Promise(resolve => setTimeout(resolve, 0));
    return HarvestGrowthModel.backtest(samples, options);
  }
  const url = URL.createObjectURL(new Blob([HarvestGrowthModel.getBacktestWorkerSource()], { type:"text/javascript" }));
  let worker;
  try{ worker = new Worker(url); }
  catch(error){
    URL.revokeObjectURL(url);
    await new Promise(resolve => setTimeout(resolve, 0));
    return HarvestGrowthModel.backtest(samples, options);
  }
  dashboardGrowthEvaluationWorker = worker;
  try{
    return await new Promise((resolve, reject) => {
      worker.onmessage = event => event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.result);
      worker.onerror = () => reject(new Error("精度比較を実行できませんでした。もう一度更新してください"));
      worker.postMessage({ samples, options });
    });
  }finally{
    worker.terminate(); URL.revokeObjectURL(url);
    if(dashboardGrowthEvaluationWorker === worker) dashboardGrowthEvaluationWorker = null;
  }
}

function getDashboardGrowthAsOf(){
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace("Z", "+09:00");
}

function getDashboardGrowthHistoryScope(location = getDashboardGrowthLocation()){
  return `${getActiveRecordsStorageKey()}:${getDashboardGrowthLocationKey(location)}`;
}

async function loadDashboardGrowthForecastHistory(scope){
  if(dashboardGrowthForecastHistoryCache?.scope === scope) return dashboardGrowthForecastHistoryCache.days;
  const from = formatDateOnlyString(addDays(new Date(), -730));
  const snapshots = await HarvestGrowthHistory.list(scope, "weather", from);
  const days = snapshots.flatMap(entry => (entry.payload.daily || []).map(day => ({ ...day,
    availableAt:entry.capturedAt, issuedAt:day.issuedAt || entry.payload.issuedAt || ""
  })));
  dashboardGrowthForecastHistoryCache = { scope, days };
  return days;
}

function setDashboardGrowthArchiveStatus(message, pending = false){
  dashboardGrowthArchiveStatus = message;
  const status = document.getElementById("dashboardGrowthArchiveStatus");
  if(status) status.textContent = message;
  const retry = document.getElementById("dashboardGrowthArchiveRetry");
  if(retry) retry.hidden = !pending;
}

async function saveDashboardGrowthHistory(model){
  if(!model?.fit) return;
  try{
    const captured = new Date().toISOString();
    const daily = model.weather.daily.filter(day => day.source === "forecast").map(day => ({ ...day,
      issuedAt:day.issuedAt || model.weather.forecastIssuedAt || ""
    }));
    const weatherId = await HarvestGrowthHistory.save(model.scope, "weather", model.asOf.slice(0, 10), {
      provider:"jma", station:model.weather.station, fetchedAt:model.weather.fetchedAt,
      issuedAt:model.weather.forecastIssuedAt || "", stale:model.weather.stale === true, daily
    });
    // Archive the exact inputs separately from the compact forecast catalogue.
    // Diagnoses load this object by ID; normal startup never scans its history.
    const weatherInputId = await HarvestGrowthHistory.save(model.scope,"weather-input",model.asOf.slice(0,10),{
      provider:"jma",fetchedAt:model.weather.fetchedAt,forecastEndDate:model.weather.forecastEndDate,
      daily:model.weather.daily
    });
    const registry = getDashboardGrowthLearningRegistry();
    const snapshot = registry.getGeneration(model.modelVersion)?.modelSnapshot
      || HarvestGrowthModel.exportModel(model.fit,{modelVersion:model.modelVersion});
    const modelId = await HarvestGrowthHistory.save(model.scope,"model",snapshot.createdAt.slice(0,10),snapshot);
    const shadowSnapshot = model.shadowModelVersion ? registry.getGeneration(model.shadowModelVersion)?.modelSnapshot : null;
    const shadowModelId = shadowSnapshot ? await HarvestGrowthHistory.save(model.scope,"model",shadowSnapshot.createdAt.slice(0,10),shadowSnapshot) : null;
    const quantity=(cohort,version)=>{
      if(!version) return null;
      try{return getDashboardGrowthYieldPrediction(cohort.palletKeys,cohort.plantingEventId,version,model.asOf);}
      catch(error){return {available:false,modelVersion:version,reason:"quantityUnavailable"};}
    };
    const predictions = [...model.predictions.values()].flatMap(item => (item.cohorts || []).map(cohort => ({
      building:item.building, bed:item.bed, plantingDate:formatDateOnlyString(cohort.plantingDate),
      plantingEventId:cohort.plantingEventId,
      targetDate:formatDateOnlyString(cohort.forecastDate), palletKeys:cohort.palletKeys,
      scheduled:item.range !== null, prediction:cohort.prediction,shadowPrediction:cohort.shadowPrediction,
      quantity:quantity(cohort,model.modelVersion),shadowQuantity:quantity(cohort,model.shadowModelVersion),
      risk:cohort.risk || item.risk,shadowRisk:cohort.shadowRisk,reason:item.reason,input:cohort.input
    })));
    model.predictionId = await HarvestGrowthHistory.save(model.scope, "prediction", model.asOf.slice(0, 10), {
      asOf:model.asOf, weatherId,weatherInputId, cultivar:DASHBOARD_GROWTH_CULTIVAR,
      modelId,modelVersion:model.modelVersion,modelTrainedAsOf:snapshot.trainedAsOf,
      shadowModelId,shadowModelVersion:model.shadowModelVersion,shadowTrainedAsOf:shadowSnapshot?.trainedAsOf || null,
      appVersion:document.querySelector('meta[name="harvestnavi-version"]')?.content || "",
      model:typeof HarvestGrowthModel.summarize === "function" ? HarvestGrowthModel.summarize(model.fit)
        : { schemaVersion:HarvestGrowthModel.schemaVersion, selectedMethod:model.fit.selectedMethod },
      adjustments:getDashboardGrowthBuildingAdjustments(), predictions
    });
    if(dashboardGrowthArchivePending === model) dashboardGrowthArchivePending = null;
    if(dashboardGrowthForecastHistoryCache?.scope === model.scope){
      const known = new Set(dashboardGrowthForecastHistoryCache.days.map(day => `${day.date}:${day.issuedAt}`));
      daily.forEach(day => {
        if(!known.has(`${day.date}:${day.issuedAt}`)) dashboardGrowthForecastHistoryCache.days.push({ ...day, availableAt:captured });
      });
    }
    if(model.scope === getDashboardGrowthHistoryScope()) setDashboardGrowthArchiveStatus("この表示時点の予報・予測を端末に保存しました。履歴は自動削除しません。" + (model.weather.storageWarning ? ` ${model.weather.storageWarning}` : ""));
  }catch(error){
    dashboardGrowthArchivePending = model;
    if(model.scope === getDashboardGrowthHistoryScope()) setDashboardGrowthArchiveStatus("予測は表示できましたが、履歴を端末に保存できませんでした。空き容量などを確認し「履歴を再保存」を押してください。", true);
    console.warn("生育予測履歴の保存失敗", error);
  }
}

async function retryDashboardGrowthHistory(){
  const model = dashboardGrowthArchivePending || dashboardGrowthPredictionModelCache;
  if(model?.scope === getDashboardGrowthHistoryScope()) await saveDashboardGrowthHistory(model);
}

function buildDashboardGrowthWeatherDiagnostics(weather, context){
  if(!context?.getGap) return null;
  const gaps = [], fallbacks = [];
  const start = weather.historyStartDate || weather.historyCoverage?.requestedStartDate;
  const through = weather.normal?.historyCheckedThrough || weather.historyCoverage?.requestedThrough
    || HarvestGrowthModel.addDays(context.asOf, -1);
  // Scan only once per weather/model refresh, with the relay's five-year bound.
  if(HarvestGrowthModel.dateKey(start) === start && HarvestGrowthModel.dateKey(through) === through && start <= through){
    const boundedStart = [start, HarvestGrowthModel.addDays(context.asOf, -1825)].sort().pop();
    const end = [through, HarvestGrowthModel.addDays(context.asOf, -1)].sort()[0];
    for(let date = boundedStart; date <= end; date = HarvestGrowthModel.addDays(date, 1)){
      const gap = context.getGap(date);
      if(gap) gaps.push(gap);
      const day = context.observations.get(date);
      if(day?.fallbackUsed) fallbacks.push({date,provider:day.fallbackProvider,fields:day.fallbackFields,fieldSources:day.fieldSources});
    }
  }
  const forecastEnd = context.forecastEndDate || context.asOf;
  for(let date = context.asOf, i = 0; date <= forecastEnd && i < 14; date = HarvestGrowthModel.addDays(date, 1), i++){
    const gap = context.getGap(date);
    if(gap) gaps.push(gap);
    const day = context.forecasts.get(date);
    if(day?.fallbackUsed) fallbacks.push({date,provider:day.fallbackProvider,fields:day.fallbackFields,fieldSources:day.fieldSources});
  }
  return { gaps, fallbacks, observationDays:gaps.filter(gap => gap.kind === "observation").length,
    forecastDays:gaps.filter(gap => gap.kind === "forecast").length };
}

function getDashboardGrowthWeatherGapReason(gap){
  if(gap.code === "missingFields"){
    const fields = gap.fields.map(field => ({temperature:"気温",meanTemp:"平均気温",minTemp:"最低気温",maxTemp:"最高気温"})[field]
      || (gap.kind === "observation" ? "光・日照時間のデータ" : "天気・日照の予報"));
    return `${fields.join("・")}が欠けているか、代わりの値が入っています`;
  }
  return ({ noObservation:"保存データに観測値がありません。取得漏れ・未公開・観測地点の欠測のどれかは、保存データだけでは特定できません",
    noForecast:"予報期間内ですが、この日の予報が保存されていません",
    outsideForecast:"取得済みの予報期間の範囲外です",
    missingIssueTime:"予報の発表日時がないため、計算に使えません",
    notAvailableAtCutoff:"予測時点より後に発表・取得されたデータのため、計算に使えません" })[gap.code] || "計算に必要な気象データが不足しています";
}

function getDashboardGrowthWeatherGapsHtml(gaps){
  if(!gaps?.length) return "";
  const groups = [];
  const unique = new Map(gaps.map(gap => [gap.date, gap]));
  [...unique.values()].sort((a,b) => a.date.localeCompare(b.date)).forEach(gap => {
    const key = `${gap.kind}:${gap.code}:${gap.fields.join(",")}`;
    const previous = groups[groups.length - 1];
    if(previous?.key === key && HarvestGrowthModel.addDays(previous.end, 1) === gap.date){
      previous.end = gap.date; previous.count++;
    }else groups.push({ key, start:gap.date, end:gap.date, count:1, gap });
  });
  const dateLabel = value => value.replace(/-(0?)(\d+)/g, "/$2");
  return `<ul class="dashboardGrowthWeatherGapList">${groups.map(group => {
    const range = group.start === group.end ? dateLabel(group.start) : `${dateLabel(group.start)}〜${dateLabel(group.end)}（${group.count}日）`;
    const handling = group.gap.unavailable ? "この日を含む期間は未予測です。" : group.gap.estimated
      ? "過去の不足分は推定で補います。" : "補助項目のみの不足のため、生育計算は継続します。";
    return `<li><strong>${escapeHtml(range)}</strong><span>${escapeHtml(getDashboardGrowthWeatherGapReason(group.gap))}。${handling}</span></li>`;
  }).join("")}</ul>`;
}

function getDashboardGrowthWeatherFallbacksHtml(fallbacks){
  if(!fallbacks?.length) return "";
  const unique = [...new Map(fallbacks.map(day => [day.date,day])).values()].sort((a,b) => a.date.localeCompare(b.date));
  const fieldName = field => ({meanTemp:"平均気温", minTemp:"最低気温", maxTemp:"最高気温", lightIndex:"光の参考指標"})[field] || field;
  const providers = new Set(unique.map(day => day.provider));
  const attribution = providers.has("nasa-power") ? '<a href="https://power.larc.nasa.gov/" target="_blank" rel="noopener noreferrer">NASA POWER</a>（格子データを加工）' : "";
  const metAttribution = providers.has("met-no") ? '<a href="https://www.met.no/" target="_blank" rel="noopener noreferrer">MET Norway</a>（予報を加工、<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>）' : "";
  return `<div class="dashboardGrowthWeatherShortage"><strong>代替による補完</strong><ul class="dashboardGrowthWeatherGapList">${unique.map(day => {
    const provider = day.provider === "nasa-power" ? "NASA POWER" : "MET Norway（予報による補完）";
    const details = day.fields.map(field => {
      const evidence = day.fieldSources?.[field] || {};
      const joined = evidence.jmaObservationHours > 0 ? `。気象庁の当日観測${Math.round(evidence.jmaObservationHours * 10) / 10}時間と予報を接続` : "";
      return `<span>${escapeHtml(fieldName(field))} → ${escapeHtml(provider + joined)}<small>${escapeHtml([evidence.parameter, evidence.unit,
        evidence.formula, evidence.retrievedAt ? `取得：${new Date(evidence.retrievedAt).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"})}` : ""].filter(Boolean).join(" / "))}</small></span>`;
    }).join("");
    return `<li><strong>${escapeHtml(day.date.replace(/-(0?)(\d+)/g,"/$2"))}</strong>${details}</li>`;
  }).join("")}</ul><p class="dashboardGrowthBasisMethod">${[attribution,metAttribution].filter(Boolean).join("・")}。実測と区別し、信頼度を下げて表示します。日射量・雲量からの指標は日照時間ではありません。</p></div>`;
}

function renderDashboardGrowthWeatherDiagnostics(model){
  const container = document.getElementById("dashboardGrowthWeatherDiagnostics");
  if(!container) return;
  const diagnostics = model.weatherDiagnostics;
  if(!diagnostics){ container.innerHTML = ""; return; }
  const weather = model.weather;
  const status = [];
  if(weather.fetchError) status.push(`今回の取得失敗：${weather.fetchError}`);
  if(weather.lastError) status.push(`サーバーの取得失敗：${weather.lastError}`);
  (weather.fallbackErrors || []).forEach(error => status.push(`代替データの取得：${error}`));
  if(weather.refreshStatus === "refreshing") status.push("サーバーで気象データを更新中です");
  if(weather.nextAttemptAt){
    const retry = new Date(weather.nextAttemptAt);
    if(Number.isFinite(retry.getTime())) status.push(`サーバーの次回取得予定：${retry.toLocaleString("ja-JP", {timeZone:"Asia/Tokyo"})}`);
  }
  if(weather.stale) status.push("更新が完了していないため、保存済みの気象データを使用しています。「更新」で再取得できます");
  const summary = diagnostics.gaps.length
    ? `気象データの不足：観測${diagnostics.observationDays}日・予報${diagnostics.forecastDays}日`
    : `気象データ：不足なし${diagnostics.fallbacks?.length ? `・代替${diagnostics.fallbacks.length}日` : ""}`;
  container.innerHTML = `<details class="dashboardGrowthWeatherDiagnostics"><summary>${escapeHtml(summary)}</summary>
    <p>取得済みの観測期間と予報期間を確認しています。予定日までの不足日は各ベッドの「詳細」に表示します。</p>
    ${status.map(text => `<p>${escapeHtml(text)}</p>`).join("")}
    ${getDashboardGrowthWeatherGapsHtml(diagnostics.gaps)}
    ${getDashboardGrowthWeatherFallbacksHtml(diagnostics.fallbacks)}</details>`;
}

function getDashboardGrowthTemperatureHtml(item){
  const cohorts=(item.cohorts || []).filter(cohort=>cohort.temperatureTotals);
  if(!cohorts.length) return "";
  const shortDate=value=>{
    const date=parseDateOnlyString(value);
    return date ? `${date.getMonth()+1}/${date.getDate()}` : "不明";
  };
  const valueHtml=(label,value)=>{
    const amount=Number.isFinite(value?.total) ? `${Math.round(value.total*10)/10}℃・日` : "未算出";
    const counts=value?.dayCounts;
    const detail=value?.missingDays ? `平均気温が${value.missingDays}日不足` : counts
      ? `観測${counts.observed}日・予報${counts.forecast}日${counts.fallback ? `・代替${counts.fallback}日` : ""}` : "平均気温のデータ不足";
    return `<div class="dashboardGrowthTemperatureValue"><span>${label}</span>${value ? `<span class="dashboardGrowthTemperaturePeriod" title="${escapeHtml(`${value.start}〜${value.end}`)}">${shortDate(value.start)}〜${shortDate(value.end)}</span>` : ""}<strong>${escapeHtml(amount)}</strong><span class="dashboardGrowthTemperatureSource">${escapeHtml(detail)}</span></div>`;
  };
  return `<section class="dashboardGrowthTemperature" aria-label="定植からの積算温度"><strong class="dashboardGrowthBasisTitle">積算温度</strong><p class="dashboardGrowthBasisMethod">定植日と対象日を含む日平均気温の合計です（℃・日）。日照係数や号棟の気温補正は加えません。現在までの値にも当日の予報を含む場合があります。</p>${cohorts.map(cohort=>`<div class="dashboardGrowthTemperatureGroup"><strong>${shortDate(cohort.input?.plantingDate)}定植・${cohort.palletKeys.length}パレット</strong><div class="dashboardGrowthTemperatureValues">${valueHtml("現在まで",cohort.temperatureTotals.current)}${item.range ? valueHtml("予定日まで",cohort.temperatureTotals.scheduled) : ""}</div></div>`).join("")}</section>`;
}

function getDashboardGrowthLearningBasisHtml(item){
  const basis = item.basis || {};
  const gapsHtml = getDashboardGrowthWeatherGapsHtml((item.cohorts || []).flatMap(cohort => cohort.prediction.weatherGaps || []));
  const fallbackHtml = getDashboardGrowthWeatherFallbacksHtml((item.cohorts || []).flatMap(cohort => cohort.prediction.weatherFallbacks || []));
  const checked = (item.cohorts || []).some(cohort => cohort.prediction.dayCounts);
  const temperatureHtml=getDashboardGrowthTemperatureHtml(item);
  const weatherHtml = gapsHtml || fallbackHtml || checked ? `<div class="dashboardGrowthWeatherShortage"><strong>対象期間の気象データ${gapsHtml ? "不足" : "：不足なし"}</strong>${gapsHtml}</div>${fallbackHtml}` : "";
  if(!Number.isFinite(basis.currentGrowthUnits) || !Number.isFinite(basis.targetGrowthUnits)){
    return `<section class="dashboardGrowthBasis is-unavailable" aria-label="判定の根拠"><strong class="dashboardGrowthBasisTitle">判定の根拠</strong><p class="dashboardGrowthBasisUnavailable">苗植え日または比較に必要なデータが不足しています。</p>${temperatureHtml}${weatherHtml}</section>`;
  }
  const percent = value => Number.isFinite(value) ? `${Math.round(value)}%` : "不明";
  const formatDate = value => parseDateOnlyString(value || "") ? formatDashboardForecastDate(parseDateOnlyString(value)) : "不明";
  const unit = basis.units === "days" ? "日相当" : "点";
  const metric = value => Number.isFinite(value) ? formatDashboardMetricNumber(value, unit) : "不明";
  const ready = item.readyStart && item.readyEnd
    ? `${formatDate(item.readyStart)}〜${formatDate(item.readyEnd)}`
    : item.readyStart ? `${formatDate(item.readyStart)}〜終了未算出` : "未算出";
  const interval = item.interval ? `過去の適期日誤差による参考範囲：${formatDate(item.interval.start)}〜${formatDate(item.interval.end)}`
    : (item.cohorts.length > 1 && item.cohorts.some(cohort => cohort.prediction.interval)
      ? "適期日の予測幅は、苗植え日・予定日ごとの参考範囲を確認してください。"
      : "適期日の予測幅は、任意入力された日付の検証結果が不足しているため未算出です。");
  const countsText = counts => basis.units === "days" ? "栽培日数方式のため、生育計算に気象は使用していません"
    : counts ? `実測${counts.observed || 0}日・予報${counts.forecast || 0}日・代替${counts.fallback || 0}日・推定${Math.max(0,(counts.estimated || 0)-(counts.fallback || 0))}日` : "気象日数不明";
  const cohortHtml = (item.cohorts || []).map(cohort => {
    const start=formatDate(cohort.prediction.readyStart || cohort.prediction.readyDate),end=cohort.prediction.readyEnd ? formatDate(cohort.prediction.readyEnd) : "終了未算出";
    const manual=cohort.input?.growthEvidence?.manualOffset;
    let manualText="";
    if(manual){
      const adjusted=HarvestGrowthPlanner.adjusted({readyStart:cohort.prediction.readyStart || cohort.prediction.readyDate,
        readyEnd:cohort.prediction.readyEnd},manual.days,cohort.prediction.forecastEndDate);
      const adjustedRange=adjusted.readyStart ? `${formatDate(adjusted.readyStart)}〜${adjusted.readyEnd ? formatDate(adjusted.readyEnd) : "終了未算出"}` : "気象予報範囲外のため未予測";
      manualText=`<br>手動補正後：${escapeHtml(adjustedRange)}（${manual.days>0 ? "+" : ""}${manual.days}日）<br><small>AI予測と学習係数は変更していません</small>`;
    }
    return `<div class="dashboardGrowthCohort">${escapeHtml(formatDate(formatDateOnlyString(cohort.plantingDate)))}定植・${cohort.palletKeys.length}パレット<br>${escapeHtml(countsText(cohort.prediction.dayCounts))}${basis.units !== "days" && cohort.prediction.dayCounts?.default ? `<br>うち${cohort.prediction.dayCounts.default}日は過去気象も不足し、経験的な初期値を使用` : ""}<br>AI予測：${escapeHtml(start)}〜${escapeHtml(end)}${manualText}${cohort.prediction.interval ? `<br>日付誤差の参考範囲：${escapeHtml(formatDate(cohort.prediction.interval.start))}〜${escapeHtml(formatDate(cohort.prediction.interval.end))}` : ""}</div>`;
  }).join("");
  return `<section class="dashboardGrowthBasis" aria-label="判定の根拠">
    <strong class="dashboardGrowthBasisTitle">判定の根拠</strong>
    <div class="dashboardGrowthBasisValues">
      <span class="dashboardGrowthBasisValue"><span>現在の進捗目安</span><strong>${percent(basis.currentProgress)}</strong></span>
      <span class="dashboardGrowthBasisValue"><span>${item.range ? "予定日時点" : "現在まで"}</span><strong>${metric(basis.projectedGrowthUnits)}</strong></span>
      <span class="dashboardGrowthBasisValue"><span>基準目標</span><strong>${metric(basis.targetGrowthUnits)}</strong></span>
    </div>
    <p class="dashboardGrowthBasisConclusion">${item.range ? `予定日の目標比：${percent(basis.achievementRate)}。` : "収穫予定は未設定です。"}対象${basis.palletCount || 0}パレットの中央値。${basis.units === "days" ? "検証で選ばれた栽培日数モデルを使用しています。" : "重量の測定値ではなく、温度と日照からの生育目安です。"}</p>
    <p class="dashboardGrowthReadyDate">AIの適期期間：${escapeHtml(ready)}（参考）</p>
    <p class="dashboardGrowthBasisMethod">${escapeHtml(interval)} 当日はまだ確定していないため、現在の進捗にも取得済みの当日予報を含む場合があります。適期日は予定日を変更しません。</p>
    ${temperatureHtml}${weatherHtml}
    ${cohortHtml}
    ${getDashboardGrowthQualityDetailsHtml(item.risk)}
  </section>`;
}

function getDashboardGrowthQualityDetailsHtml(risk){
  const labels={elongated:"徒長",uneven:"ばらつき",tipburn:"チップバーン"};
  const rows=Object.entries(labels).map(([key,label])=>{
    const value=risk?.[key],level=value?.level || "unknown";
    const status=value?.outOfForecast ? "予報範囲外・未予測" : value?.label || ({low:"低",medium:"中",high:"高",unknown:"判断材料不足"})[level] || "判断材料不足";
    return `<li class="dashboardGrowthQualityItem"><strong>${escapeHtml(label)}：${escapeHtml(status)}</strong><span>${escapeHtml(value?.reason || "確認済みの記録または気象が不足しています。")}</span></li>`;
  }).join("");
  return `<ul class="dashboardGrowthQualityList" aria-label="品質リスクの根拠">${rows}</ul>`;
}

function getDashboardGrowthPositionItems(item){
  const reference=item?.readyDate;
  const positions=(item?.cohorts || []).flatMap(cohort=>{
    if(!cohort.positionKey || cohort.prediction?.positionFallback!==false) return [];
    const pallet=parsePalletKey(cohort.positionKey);
    if(!pallet || pallet.building!==item.building || pallet.bed!==item.bed) return [];
    const ready=cohort.prediction.readyStart || cohort.prediction.readyDate;
    let label="";
    if(reference && ready){
      const delta=HarvestGrowthModel.daysBetween(reference,ready);
      if(delta<=-1) label="少し早い";
      else if(delta>=1) label="少し遅い";
    }
    if(!label){
      const status=cohort.currentPrediction?.status || cohort.prediction?.status;
      if(status==="large") label="大きめ傾向";
      else if(status==="small") label="小さめ傾向";
      else if(status==="normal") label="基準に近い";
    }
    return label ? [{number:pallet.number,label,readyDate:ready || null}] : [];
  }).sort((a,b)=>a.number-b.number);
  const groups=[];
  positions.forEach(position=>{
    const previous=groups.at(-1);
    if(previous && previous.label===position.label && previous.end+1===position.number){previous.end=position.number;return;}
    groups.push({start:position.number,end:position.number,label:position.label});
  });
  return groups;
}

function getDashboardGrowthPositionHtml(item){
  const groups=getDashboardGrowthPositionItems(item);
  if(!groups.length) return "";
  return `<section class="dashboardGrowthBasis" aria-label="学習済みの位置別傾向"><strong class="dashboardGrowthBasisTitle">位置別の傾向</strong><p class="dashboardGrowthBasisMethod">この位置で十分な過去実績がある場合だけ表示しています。</p><div class="dashboardGrowthPositionGrid">${groups.map(group=>`<span class="dashboardGrowthPositionItem"><strong>${group.start===group.end ? group.start : `${group.start}〜${group.end}`}番</strong><span>${escapeHtml(group.label)}</span></span>`).join("")}</div></section>`;
}

function getDashboardGrowthGateText(gate){
  if(!gate) return "未評価";
  if(gate.accepted) return "改善を確認";
  const labels={insufficientReadinessValidation:"評価データ不足",reducedPredictionCoverage:"未予測が増えるため不採用",
    readinessRegression:"適期が悪化",readyDateRegression:"適期日が悪化",qualityRegression:"品質予測が悪化",
    subgroupRegression:"一部の季節・号棟で悪化",unstableImprovement:"改善が安定しない",noDemonstratedImprovement:"意味のある改善なし",
    frozenGenerationEvaluationError:"世代比較を再現できない",missingFrozenEvaluation:"世代比較なし"};
  return labels[gate.reason] || "採用条件未達";
}

function renderDashboardGrowthModelManagement(model){
  const container=document.getElementById("dashboardGrowthModelManagement");
  if(!container) return;
  let registry,state;
  try{registry=getDashboardGrowthLearningRegistry();state=registry.getState();}
  catch(error){container.textContent="モデル世代の保存状態を読み込めません。";return;}
  const names={legacy:"旧目標式",safe:"修正した基本方式",calendar:"栽培日数方式",adaptive:"農場の学習方式"};
  const generation=id=>state.generations.find(item=>item.id===id),active=generation(state.activeId),candidate=generation(state.candidateId);
  const summary=state.evaluation?.summary || {},methodGate=summary.validation?.selection?.gates?.[candidate?.modelSnapshot?.method];
  const candidateHtml=candidate ? `<div class="dashboardGrowthModelRow"><div class="dashboardGrowthModelMeta"><strong>候補：${escapeHtml(names[candidate.modelSnapshot.method] || candidate.modelSnapshot.method)}</strong><br>${candidate.count || 0}件・${candidate.eligible ? "採用条件を確認済み" : "shadowで検証中"}</div>${candidate.eligible ? `<button type="button" class="dashboardInlineBtn" data-ui-click="confirmDashboardGrowthCandidate" data-ui-arg="${escapeHtml(candidate.id)}">この候補を採用</button>` : ""}</div>
    <div class="dashboardGrowthModelGate"><span>方式比較：${escapeHtml(getDashboardGrowthGateText(methodGate))}</span><span>凍結した世代比較：${escapeHtml(getDashboardGrowthGateText(summary.generations?.gate))}</span><span>保存した新旧予測：${escapeHtml(getDashboardGrowthGateText(summary.prospective?.gate))}</span></div>` : '<div class="dashboardGrowthModelMeta">現在、検証中の候補はありません。</div>';
  const rollback=state.generations.filter(item=>item.adoptedAt && item.id!==state.activeId).sort((a,b)=>String(b.adoptedAt).localeCompare(String(a.adoptedAt))).map(item=>`<button type="button" class="dashboardInlineBtn" data-ui-click="confirmDashboardGrowthRollback" data-ui-arg="${escapeHtml(item.id)}">${escapeHtml(names[item.modelSnapshot.method] || item.modelSnapshot.method)}へ戻す</button>`).join("");
  const conflicts=(state.conflicts || []).map((item,index)=>({item,index})).filter(({item})=>item.type==="activeChoice" && !item.resolvedAt).map(({index})=>`<div class="dashboardGrowthModelConflict"><strong>復元元と使用モデルが異なります</strong><div class="dashboardGrowthHistoryActions"><button type="button" class="dashboardInlineBtn" data-ui-click="resolveDashboardGrowthActiveConflict" data-ui-number="${index}" data-ui-number-first="true" data-ui-arg="local">現在のモデルを維持</button><button type="button" class="dashboardInlineBtn" data-ui-click="resolveDashboardGrowthActiveConflict" data-ui-number="${index}" data-ui-number-first="true" data-ui-arg="incoming">復元元を選ぶ</button></div></div>`).join("");
  container.innerHTML=`<div class="dashboardGrowthModelRow"><div class="dashboardGrowthModelMeta"><strong>使用中：${escapeHtml(names[active?.modelSnapshot?.method] || model.fit.selectedMethod)}</strong><br>版 ${escapeHtml(state.activeId || model.modelVersion || "基本方式")}</div></div>${candidateHtml}${rollback ? `<div class="dashboardGrowthHistoryActions">${rollback}</div>` : ""}${conflicts}`;
}

function getDashboardGrowthChangeStateKey(scope=getDashboardGrowthHistoryScope()){
  return `${DASHBOARD_GROWTH_CHANGE_STATE_PREFIX}${scope}`;
}

function normalizeDashboardGrowthChangeState(value){
  const source=value && typeof value==="object" && !Array.isArray(value) ? value : {};
  const previous=Array.isArray(source.previous) ? source.previous.filter(item=>item && typeof item.id==="string").slice(0,BUILDINGS.length*bedOrder.length) : [];
  const notifications=Array.isArray(source.notifications) ? source.notifications.filter(item=>item && typeof item.id==="string"
    && ["ready","risk"].includes(item.type)).slice(0,12) : [];
  return {schemaVersion:1,previous,notifications,updatedAt:String(source.updatedAt || "")};
}

function readDashboardGrowthChangeState(scope=getDashboardGrowthHistoryScope()){
  try{return normalizeDashboardGrowthChangeState(harvestnaviLocalStorage.readJson(getDashboardGrowthChangeStateKey(scope),null));}
  catch(error){return normalizeDashboardGrowthChangeState(null);}
}

function getDashboardGrowthChangeSnapshot(items){
  return (items || []).map(item=>({id:String(item.id),building:Number(item.building),bed:String(item.bed || ""),
    cropSignature:item.cropSignature || null,
    aiReadyStart:item.aiReadyStart || item.readyStart || item.readyDate || null,
    risk:Object.fromEntries(["elongated","uneven","tipburn"].map(key=>[key,{level:item.risk?.[key]?.level || "unknown"}]))}));
}

function updateDashboardGrowthChangeState(value,current,at=new Date().toISOString()){
  const state=normalizeDashboardGrowthChangeState(value),snapshot=getDashboardGrowthChangeSnapshot(current);
  const sameCrop=state.previous.filter(previous=>snapshot.some(item=>item.id===previous.id
    && (item.cropSignature || null)===(previous.cropSignature || null)));
  const changes=sameCrop.length ? HarvestGrowthPlanner.changes(sameCrop,snapshot) : [];
  const notifications=changes.map((change,index)=>({...change,predictionKey:change.id,
    id:`${at}:${index}:${change.id}:${change.type}:${change.kind || ""}`,createdAt:at,readAt:null}));
  return {state:{schemaVersion:1,previous:snapshot,notifications:[...notifications,...state.notifications].slice(0,12),updatedAt:at},changes:notifications};
}

function formatDashboardGrowthChange(change){
  const location=`${change.building}号棟${change.bed}ベッド`;
  if(change.type==="ready"){
    const short=value=>{const date=parseDateOnlyString(value);return date ? `${date.getMonth()+1}/${date.getDate()}` : value;};
    return `${location}　${short(change.before)} → ${short(change.after)}（${change.days>0 ? "+" : ""}${change.days}日）`;
  }
  const labels={elongated:"徒長",uneven:"ばらつき",tipburn:"チップバーン"};
  return `${location}　${labels[change.kind] || change.kind}：低 → 高`;
}

function processDashboardGrowthChanges(model){
  if(!model || model.growthChangesProcessed) return [];
  model.growthChangesProcessed=true;
  const scope=model.scope,state=readDashboardGrowthChangeState(scope);
  const updated=updateDashboardGrowthChangeState(state,getDashboardGrowthPlanningItems(model,{includeQuantity:false}));
  try{harvestnaviLocalStorage.writeJson(getDashboardGrowthChangeStateKey(scope),updated.state);}
  catch(error){return [];}
  model.growthChanges=updated.changes;
  renderDashboardGrowthChangeBadge();
  if(updated.changes.length){
    const first=formatDashboardGrowthChange(updated.changes[0]);
    showToast(updated.changes.length===1 ? `生育予測が変わりました：${first}` : `生育予測が${updated.changes.length}件変わりました：${first}`);
  }
  return updated.changes;
}

function renderDashboardGrowthChangeBadge(){
  const badge=document.getElementById("dashboardGrowthChangeBadge");
  if(!badge) return;
  const state=getDashboardGrowthLocation() ? readDashboardGrowthChangeState() : normalizeDashboardGrowthChangeState(null);
  const unread=state.notifications.filter(item=>!item.readAt).length;
  badge.hidden=unread===0;
  badge.setAttribute("aria-label",`未確認の予測変化${unread}件`);
}

function markDashboardGrowthChangesRead(){
  if(!getDashboardGrowthLocation()) return;
  const scope=getDashboardGrowthHistoryScope(),state=readDashboardGrowthChangeState(scope),at=new Date().toISOString();
  if(!state.notifications.some(item=>!item.readAt)){renderDashboardGrowthChangeBadge();return;}
  state.notifications=state.notifications.map(item=>item.readAt ? item : {...item,readAt:at});state.updatedAt=at;
  try{harvestnaviLocalStorage.writeJson(getDashboardGrowthChangeStateKey(scope),state);}catch(error){return;}
  renderDashboardGrowthChangeBadge();
  if(dashboardGrowthPredictionModelCache) renderDashboardGrowthPlanning(dashboardGrowthPredictionModelCache);
}

function getDashboardGrowthPlanningItems(model,options={}){
  return [...model.predictions.values()].filter(item=>item?.hasCurrentCrop).map(item=>{
    const adjustedCohorts=(item.cohorts || []).map(cohort=>{
      const manual=cohort.input?.growthEvidence?.manualOffset;
      return manual ? HarvestGrowthPlanner.adjusted({readyStart:cohort.prediction.readyStart || cohort.prediction.readyDate,
        readyEnd:cohort.prediction.readyEnd},manual.days,model.weather.forecastEndDate)
        : {readyStart:cohort.prediction.readyStart || cohort.prediction.readyDate,readyEnd:cohort.prediction.readyEnd,manualOffsetDays:0};
    });
    const starts=adjustedCohorts.map(cohort=>cohort.readyStart).filter(Boolean).sort();
    const ends=adjustedCohorts.map(cohort=>cohort.readyEnd).filter(Boolean).sort();
    let quantity=null;
    if(options.includeQuantity!==false && dashboardGrowthPlanningShowsQuantity && item.cohorts?.length){
      const values=item.cohorts.map(cohort=>{
        try{return getDashboardGrowthYieldPrediction(cohort.palletKeys,cohort.plantingEventId,model.modelVersion,model.asOf);}
        catch(error){return null;}
      });
      if(values.length && values.every(value=>value?.available && Number.isFinite(value.center))){
        quantity={center:values.reduce((sum,value)=>sum+value.center,0),
          low:values.reduce((sum,value)=>sum+value.low,0),high:values.reduce((sum,value)=>sum+value.high,0),
          reference:values.some(value=>value.reference),sampleCount:Math.min(...values.map(value=>value.sampleCount || 0))};
      }
    }
    return {id:`${item.building}-${item.bed}`,building:item.building,bed:item.bed,
      cropSignature:(item.cohorts || []).flatMap(cohort=>cohort.palletKeys.map(key=>
        `${key}:${cohort.plantingEventId}:${formatDateOnlyString(cohort.plantingDate)}`)).sort().join("|"),
      aiReadyStart:item.readyStart || item.readyDate || null,aiReadyEnd:item.readyEnd || null,
      readyStart:adjustedCohorts.length && starts.length===adjustedCohorts.length ? starts[0] : null,
      readyEnd:adjustedCohorts.length && ends.length===adjustedCohorts.length ? ends[ends.length-1] : null,
      readyDate:adjustedCohorts.length && starts.length===adjustedCohorts.length ? starts[0] : null,currentStatus:item.currentStatus,
      manualAdjusted:adjustedCohorts.some(cohort=>cohort.manualOffsetDays),risk:item.risk,confidence:item.confidence,quantity};
  });
}

function getDashboardGrowthScheduledPlanningItems(model,options={}){
  let cache=model.scheduledPlanningItemsCache;
  if(!cache || cache.baseModel!==model.baseModel || cache.predictions!==model.predictions){
    const today=model.asOf.slice(0,10),end=formatDateOnlyString(addDays(parseDateOnlyString(today),6));
    const byPallet=new Map(),groups=new Map();
    model.predictions.forEach(item=>(item.cohorts || []).forEach(cohort=>
      cohort.palletKeys.forEach(key=>byPallet.set(key,{item,cohort}))));
    model.baseModel.palletForecasts.forEach((forecast,key)=>{
      const date=formatDateOnlyString(forecast.date);
      if(date<today || date>end) return;
      const source=byPallet.get(key),cohort=source?.cohort;
      const status=cohort?.input?.targetDate===date && ["small","normal","large"].includes(cohort.prediction?.status)
        ? cohort.prediction.status : "unknown";
      // Join matching scopes before subtracting partial totals. Never allocate a
      // partial record across different harvest dates or predicted sizes.
      const id=`${date}:${cohort ? cohort.plantingEventId : key}:${status}`;
      if(!groups.has(id)) groups.set(id,{id,date,status,plantingEventId:cohort?.plantingEventId,
        palletKeys:[],lossRates:new Map(),locations:new Map(),heads:null,quantity:null});
      const group=groups.get(id);
      group.palletKeys.push(key);
      group.lossRates.set(key,forecast.lossRate);
      if(cohort) group.locations.set(cohort,{building:source.item.building,bed:source.item.bed,
        risk:cohort.risk || source.item.risk,confidence:cohort.prediction?.confidence?.label});
    });
    let dataset=null;
    if(groups.size){
      try{dataset=getDashboardGrowthYieldAnalysis(model.asOf).dataset;}catch(error){/* Keep unknown counts visible. */}
    }
    const items=[...groups.values()].map(group=>{
      const input=HarvestGrowthYield.currentInput(dataset,{palletKeys:group.palletKeys,plantingEventId:group.plantingEventId,includePalletCounts:true});
      const rates=[...group.lossRates.values()];
      const ratesKnown=rates.every(rate=>Number.isFinite(rate) && rate>=0 && rate<=100);
      let harvestHeads=null;
      if(input.valid && ratesKnown){
        if(rates.every(rate=>rate===rates[0])){
          harvestHeads=input.plantedHeads*(100-rates[0])/100;
        }else if(input.plantedHeadsByPallet){
          harvestHeads=group.palletKeys.reduce((sum,key)=>
            sum+input.plantedHeadsByPallet[key]*(100-group.lossRates.get(key))/100,0);
        }
      }
      // Apply loss to planted heads first, then subtract the harvested total once.
      group.heads=Number.isFinite(harvestHeads) && Number.isFinite(input.partialHeads)
        ? Math.max(0,harvestHeads-input.partialHeads) : null;
      group.locations=[...group.locations.values()];
      return group;
    });
    cache={baseModel:model.baseModel,predictions:model.predictions,items,hasQuantities:false};
    model.scheduledPlanningItemsCache=cache;
  }
  if(options.includeQuantity && !cache.hasQuantities){
    cache.items.forEach(item=>{
      try{
        const value=getDashboardGrowthYieldPrediction(item.palletKeys,item.plantingEventId,model.modelVersion,model.asOf);
        if(value?.available && Number.isFinite(value.center)) item.quantity=value;
      }catch(error){/* Keep unavailable quantities separate from zero. */}
    });
    cache.hasQuantities=true;
  }
  return cache.items;
}

function getDashboardGrowthScheduledDayMap(model,date){
  const items=getDashboardGrowthScheduledPlanningItems(model,{includeQuantity:false});
  let cache=model.scheduledDayMapCache;
  if(!cache || cache.items!==items){
    const days=new Map();
    items.forEach(item=>item.palletKeys.forEach(key=>{
      const pallet=parsePalletKey(key);
      if(!BUILDINGS.includes(pallet.building) || !bedOrder.includes(pallet.bed)
        || !Number.isInteger(pallet.number) || pallet.number<1 || pallet.number>PALLETS_PER_BED) return;
      if(!days.has(item.date)) days.set(item.date,new Map());
      const beds=days.get(item.date),id=`${pallet.building}-${pallet.bed}`;
      if(!beds.has(id)) beds.set(id,{building:pallet.building,bed:pallet.bed,palletStatuses:new Map()});
      beds.get(id).palletStatuses.set(pallet.number,item.status);
    }));
    cache={items,days};
    model.scheduledDayMapCache=cache;
  }
  return cache.days.get(date) || new Map();
}

function getDashboardGrowthScheduledDayMapHtml(model,date,selectedBuilding=null){
  const beds=getDashboardGrowthScheduledDayMap(model,date);
  if(!beds.size) return '<p class="dashboardEmpty">この日の収穫予定はありません。</p>';
  const predicted=!!model.weather.forecastEndDate && date<=model.weather.forecastEndDate
    && model.weather.daily.some(day=>day.source==="forecast" && day.date===date);
  const labels={large:"大きめ",normal:"ちょうど良い",small:"小さめ",unknown:"大きさ不明"};
  const statusOf=value=>predicted && ["large","normal","small"].includes(value) ? value : "unknown";
  const buildings=BUILDINGS.filter(building=>[...beds.values()].some(bed=>bed.building===building));
  const building=buildings.includes(Number(selectedBuilding)) ? Number(selectedBuilding) : buildings[0];
  const pager=buildings.length>1 ? `<div class="dashboardGrowthDayMapPager dashboardForecastBuildingTabs" role="group" aria-label="表示する号棟">${buildings.map(value=>`<button type="button" class="dashboardForecastBuildingBtn${value===building ? " active" : ""}" data-ui-click="setDashboardGrowthDayMapBuilding" data-ui-number="${value}" aria-pressed="${value===building}">${value}号棟</button>`).join("")}</div>` : `<h3 class="dashboardGrowthDayMapBuildingTitle">${building}号棟</h3>`;
  return `<p class="dashboardGrowthDayMapGuide">色付きが収穫予定（上：奥／下：手前）。${!predicted ? "大きさは予報範囲外のため未予測です。" : ""}</p>
    <div class="dashboardGrowthDayMapLegend" aria-label="予定日の大きさの色分け">${Object.entries(labels).map(([status,label])=>`<span class="dashboardGrowthCalendarSize is-${status}">${status==="normal" ? "並（ちょうど良い）" : label}</span>`).join("")}<span class="dashboardGrowthCalendarSize">予定なし</span></div>${pager}
    <section class="dashboardGrowthDayMapBuilding" data-growth-day-building="${building}" aria-label="${building}号棟の収穫予定場所"><div class="bedWrap dashboardGrowthDayMapBeds">${bedMap.map(bed=>{
      const planned=beds.get(`${building}-${bed}`)?.palletStatuses || new Map();
      const ranges=[];
      [...planned.keys()].sort((a,b)=>a-b).forEach(number=>{
        const status=statusOf(planned.get(number)),last=ranges[ranges.length-1];
        if(last && last.end===number-1 && last.status===status) last.end=number;
        else ranges.push({start:number,end:number,status});
      });
      const statuses=[...new Set(ranges.map(range=>range.status))];
      const mapHtml=getBedOverviewMapHtml(building,bed,{renderCell:(number,sectionStart)=>{
        const status=planned.has(number) ? statusOf(planned.get(number)) : "none";
        return `<span class="dashboardSeedlingBedMapCell simulationBedMapCell dashboardGrowthDayMapCell${sectionStart ? " is-section-start" : ""} is-${status}" data-growth-day-pallet="${building}-${bed}-${number}" title="${number}番 ${status==="none" ? "予定なし" : labels[status]}"></span>`;
      }});
      return `<article class="bed bedCollapsed simulationBedOverview dashboardGrowthDayMapBed${planned.size ? " is-planned" : ""}" data-growth-day-bed="${building}-${bed}"><div class="bedTitle"><span class="bedTitleMain">${bed}ベッド</span></div><div class="dashboardGrowthDayMapBedSizes">${statuses.length ? statuses.map(status=>`<span class="dashboardGrowthCalendarSize is-${status}" aria-label="${labels[status]}">${statuses.length>1 && status==="normal" ? "並" : statuses.length>1 && status==="unknown" ? "不明" : labels[status]}</span>`).join("") : '<span class="dashboardGrowthDayMapNoPlan">予定なし</span>'}</div>${mapHtml}${ranges.length ? `<ul class="dashboardGrowthDayMapRanges">${ranges.map(range=>`<li><strong>${range.start===range.end ? range.start : `${range.start}〜${range.end}`}番</strong><span>${labels[range.status]}</span></li>`).join("")}</ul>` : ""}</article>`;
    }).join("")}</div></section>`;
}

let dashboardGrowthDayMapReturnFocus=null;
let dashboardGrowthDayMapDate="";

function setDashboardGrowthDayMapBuilding(building){
  const modal=document.getElementById("dashboardGrowthDayMapModal"),model=dashboardGrowthPredictionModelCache;
  if(!modal?.classList.contains("show") || !model || !dashboardGrowthDayMapDate) return;
  const body=document.getElementById("dashboardGrowthDayMapBody");
  if(Number(body.querySelector("[data-growth-day-building]")?.dataset.growthDayBuilding)===Number(building)) return;
  body.innerHTML=getDashboardGrowthScheduledDayMapHtml(model,dashboardGrowthDayMapDate,building);
  body.querySelector('[aria-pressed="true"]')?.focus();
}

function openDashboardGrowthDayMap(date){
  const model=dashboardGrowthPredictionModelCache,day=parseDateOnlyString(date);
  const modal=document.getElementById("dashboardGrowthDayMapModal");
  if(!model || !day || !modal) return;
  dashboardGrowthDayMapReturnFocus=document.activeElement;
  dashboardGrowthDayMapDate=date;
  document.getElementById("dashboardGrowthDayMapTitle").textContent=`${day.getMonth()+1}/${day.getDate()}（${"日月火水木金土"[day.getDay()]}）の収穫予定場所`;
  const body=document.getElementById("dashboardGrowthDayMapBody");
  body.innerHTML=getDashboardGrowthScheduledDayMapHtml(model,date);
  body.scrollTop=0;
  showPageBlockingUi(modal);
  requestAnimationFrame(()=>document.getElementById("dashboardGrowthDayMapClose")?.focus());
}

function closeDashboardGrowthDayMap(){
  hidePageBlockingUi(document.getElementById("dashboardGrowthDayMapModal"));
  const returnFocus=dashboardGrowthDayMapReturnFocus;
  dashboardGrowthDayMapReturnFocus=null;
  dashboardGrowthDayMapDate="";
  requestAnimationFrame(()=>returnFocus?.isConnected && returnFocus.focus());
}

function renderDashboardGrowthPlanning(model){
  const container=document.getElementById("dashboardGrowthPlanning");
  if(!container) return;
  const detailsOpen=container.querySelector?.("#dashboardGrowthPlanningDetails")?.open===true;
  const items=getDashboardGrowthPlanningItems(model,{includeQuantity:false}),today=model.asOf.slice(0,10);
  const scheduledItems=getDashboardGrowthScheduledPlanningItems(model,{includeQuantity:dashboardGrowthPlanningShowsQuantity});
  const forecastDates=model.weather.daily.filter(day=>day.source==="forecast").map(day=>day.date);
  const calendar=HarvestGrowthPlanner.scheduledCalendar(scheduledItems,{today,forecastEndDate:model.weather.forecastEndDate,forecastDates});
  const warnings=HarvestGrowthPlanner.warnings(items,today),riskNames={elongated:"徒長",uneven:"ばらつき",tipburn:"チップバーン"};
  const changeState=readDashboardGrowthChangeState(model.scope),recentChanges=changeState.notifications.slice(0,3);
  const unreadChanges=changeState.notifications.filter(item=>!item.readAt).length;
  const changesHtml=recentChanges.length ? `<section class="dashboardGrowthPlanningBlock"><h3 class="dashboardGrowthPlanningTitle">前回予測からの変化</h3><ul class="dashboardGrowthChangeList">${recentChanges.map(change=>`<li class="dashboardGrowthChangeItem">${escapeHtml(formatDashboardGrowthChange(change))}</li>`).join("")}</ul>${unreadChanges ? '<button type="button" class="dashboardInlineBtn" data-ui-click="markDashboardGrowthChangesRead">確認済みにする</button>' : ""}</section>` : "";
  const warningHtml=warnings.length ? `<section class="dashboardGrowthPlanningBlock"><h3 class="dashboardGrowthPlanningTitle">品質の注意（最大3件）</h3><ul class="dashboardGrowthWarningList">${warnings.map(item=>`<li class="dashboardGrowthWarningItem"><strong>${escapeHtml(`${item.building}号棟 ${item.bed}ベッド`)}</strong><span>${escapeHtml(riskNames[item.kind] || item.kind)}：${escapeHtml(item.risk?.label || "注意")}。${escapeHtml(item.risk?.reason || "計算根拠が不足しています。")}</span></li>`).join("")}</ul></section>` : "";
  const dateLabel=value=>{const date=parseDateOnlyString(value);return date ? `${date.getMonth()+1}/${date.getDate()}（${"日月火水木金土"[date.getDay()]}）` : value;};
  const shortDate=value=>{const date=parseDateOnlyString(value);return date ? `${date.getMonth()+1}/${date.getDate()}` : value;};
  const caseNumber=value=>String(Math.round(value*10)/10);
  const dayDetails=[];
  const calendarRows=calendar.map(day=>{
    const head=(state="",metadata="")=>`<div class="dashboardGrowthCalendarHead"><button type="button" class="dashboardGrowthCalendarDate" data-ui-click="openDashboardGrowthDayMap" data-ui-arg="${day.date}" aria-label="${escapeHtml(`${dateLabel(day.date)}の収穫予定場所を配置図で表示`)}" aria-haspopup="dialog" aria-controls="dashboardGrowthDayMapModal"><time datetime="${day.date}">${escapeHtml(dateLabel(day.date))}</time></button>${day.date===today ? '<span class="dashboardGrowthCalendarToday">今日</span>' : ""}${metadata ? `<div class="dashboardGrowthCalendarMeta">${metadata}</div>` : ""}${state}</div>`;
    const rowClass=`dashboardGrowthCalendarRow${day.date===today ? " is-today" : ""}`;
    if(!day.entries.length) return `<li class="${rowClass} is-empty">${head('<span class="dashboardGrowthCalendarState">収穫予定なし</span>')}</li>`;
    if(!day.predicted) return `<li class="${rowClass} is-unpredicted">${head('<span class="dashboardGrowthCalendarState">未予測</span>')}<span class="dashboardGrowthCalendarUnavailable">気象予報範囲外</span></li>`;
    const statuses=[["large","大きめ"],["normal","ちょうど良い"],["small","小さめ"]];
    if(day.sizes.unknown.heads>0 || day.sizes.unknown.unknownPallets) statuses.push(["unknown","大きさ不明"]);
    const knownHeads=Object.values(day.sizes).reduce((sum,size)=>sum+size.heads,0);
    const missingCounts=Object.values(day.sizes).some(size=>size.unknownPallets>0);
    const sizeHtml=statuses.map(([status,label])=>{
      const size=day.sizes[status];
      const value=size.unknownPallets ? (size.heads>0 ? `${caseNumber(size.heads/HarvestGrowthPlanner.CASE_SIZE)}＋不明` : "不明") : caseNumber(size.heads/HarvestGrowthPlanner.CASE_SIZE);
      const shortLabel=statuses.length===4 ? (status==="normal" ? "並" : status==="unknown" ? "不明" : label) : label;
      return `<span class="dashboardGrowthCalendarSize is-${status}" aria-label="${escapeHtml(`${label}${value}ケース`)}"><span>${shortLabel}</span><strong>${escapeHtml(size.unknownPallets ? "不明" : value)}</strong></span>`;
    }).join("");
    const affected=day.entries.flatMap(item=>item.locations);
    const riskOrder={high:2,medium:1,unknown:0,low:0};
    const mainRisk=affected.flatMap(item=>["elongated","uneven","tipburn"].map(kind=>({item,kind,level:HarvestGrowthPlanner.riskLevel(item.risk?.[kind])})))
      .filter(value=>riskOrder[value.level]>0).sort((a,b)=>riskOrder[b.level]-riskOrder[a.level] || ["elongated","uneven","tipburn"].indexOf(a.kind)-["elongated","uneven","tipburn"].indexOf(b.kind))[0];
    const confidence=[...new Set(affected.map(item=>item.confidence || "データ不足"))].join("・") || "データ不足";
    const confidenceHtml=`<span class="dashboardGrowthCalendarConfidence" title="${escapeHtml(`信頼度：${confidence}`)}" aria-label="${escapeHtml(`信頼度：${confidence}`)}"><span>信頼度</span><strong>${escapeHtml(confidence)}</strong></span>`;
    const attention=mainRisk ? `<button type="button" class="dashboardGrowthCalendarAttention" data-ui-click="openDashboardGrowthPlanningDetails" data-ui-arg="${day.date}" aria-label="${escapeHtml(`${dateLabel(day.date)}の注意：${riskNames[mainRisk.kind]}`)}" aria-controls="dashboardGrowthPlanningDetails">△ 注意</button>` : "";
    const meta=[mainRisk ? `注意：${riskNames[mainRisk.kind]}（${mainRisk.item.building}号棟${mainRisk.item.bed}）${mainRisk.item.risk?.[mainRisk.kind]?.reason ? `：${mainRisk.item.risk[mainRisk.kind].reason}` : ""}` : "",confidence ? `信頼度：${confidence}` : ""].filter(Boolean);
    if(missingCounts && knownHeads>0) meta.push(`不明な分を除く合計：${caseNumber(knownHeads/HarvestGrowthPlanner.CASE_SIZE)}ケース`);
    if(dashboardGrowthPlanningShowsQuantity){
      meta.push(day.missingQuantities ? "残存ケース数：不明" : `残存ケース数：${caseNumber(day.cases)}ケース（${caseNumber(day.low)}〜${caseNumber(day.high)}）`);
    }
    if(meta.length) dayDetails.push(`<li id="dashboardGrowthCalendarDetail-${day.date}" tabindex="-1"><strong>${escapeHtml(dateLabel(day.date))}</strong><span>${escapeHtml(meta.join("・"))}</span></li>`);
    return `<li class="${rowClass}">${head("",attention+confidenceHtml)}<div class="dashboardGrowthCalendarSizes${statuses.length===4 ? " is-four-sizes" : ""}">${sizeHtml}</div></li>`;
  }).join("");
  const calendarHtml=`<section class="dashboardGrowthCalendarBlock" aria-label="今後7日の収穫予定と大きさ"><h3 class="dashboardGrowthCalendarTitle">7日の収穫予定</h3><p class="dashboardGrowthCalendarPeriod"><span>${shortDate(today)}〜${calendar.length ? shortDate(calendar[calendar.length-1].date) : shortDate(today)}</span><span>${model.baseModel.canForecast===false ? "条件未設定" : "ロス率反映済み"}</span></p>${model.baseModel.canForecast===false ? '<p class="dashboardEmpty">「目安」で収穫予定を計算すると、予定日の大きさを表示できます。</p>' : `<ul class="dashboardGrowthCalendar">${calendarRows}</ul>`}</section>`;
  const detailsHtml=`<details id="dashboardGrowthPlanningDetails" class="dashboardGrowthPlanningDetails"${detailsOpen ? " open" : ""}><summary>注意・詳しい内容<span aria-hidden="true">›</span></summary><div class="dashboardGrowthPlanningDetailsBody">${warningHtml}${changesHtml}${dayDetails.length ? `<section class="dashboardGrowthPlanningBlock"><h3 class="dashboardGrowthPlanningTitle">日別の注意・信頼度</h3><ul class="dashboardGrowthCalendarDetails">${dayDetails.join("")}</ul></section>` : '<p class="dashboardEmpty">表示できる注意・信頼度はありません。</p>'}${dashboardGrowthPlanningShowsQuantity ? '<p class="dashboardGrowthBasisMethod">残存ケース数は指定範囲に残る参考値です。予定日に収穫できる数量を保証する値ではありません。</p>' : '<button type="button" class="dashboardInlineBtn" data-ui-click="showDashboardGrowthPlanningQuantity">残存ケース数も確認</button>'}</div></details>`;
  container.innerHTML=calendarHtml+detailsHtml;
}

function renderDashboardGrowthValidation(model){
  const container = document.getElementById("dashboardGrowthValidationResult");
  if(!container || !model?.validation) return;
  const validation = model.validation;
  const methodNames = { legacy:"旧目標式", safe:"修正した基本方式", calendar:"栽培日数方式", adaptive:"農場の学習方式" };
  const selected = model.fit.selectedMethod;
  const number = (value, suffix) => Number.isFinite(value) ? `${Math.round(value * 10) / 10}${suffix}` : "未評価";
  const methods = validation.methods || {};
  const rows = Object.entries(methodNames).map(([key, name]) => {
    const data = methods[key] || {};
    return `<tr><td>${name}${selected === key ? (key === "legacy" ? "（旧方式を継続）" : "（使用中）") : ""}</td><td>${number(data.accuracy === null || data.accuracy === undefined ? null : data.accuracy * 100, "%")}<br>${data.labelledCount || 0}件</td><td>${number(data.readyDateMAE, "日")}<br>${data.readyDateCount || 0}件</td></tr>`;
  }).join("");
  const independent = model.fit.candidate?.independentCrops || 0;
  const excluded = Object.values(model.diagnostics || {}).reduce((a,b) => a + b, 0);
  container.innerHTML = `<p>使用中：${escapeHtml(methodNames[selected] || selected)}。独立した評価${independent}組。${excluded ? `苗植えの紐付け・日数が不確かな${excluded}パレットを除外。` : ""}</p>
    <table><thead><tr><th>比較方式</th><th>大きさ的中率</th><th>適期日の平均誤差</th></tr></thead><tbody>${rows}</tbody></table>
    <p>過去の収穫日の${validation.leadDays || 3}日前から順に予測した結果です。実際の適期日は任意入力分だけで採点します。「並」の収穫日は適期期間内という条件として扱い、適期開始日の正解にはしません。実績が少ない間は精度未確認です。</p>
    <p>当時の予報が保存されていない将来日は未予測・採点対象外です。平年値や後日の観測値から未来予報を補いません。観測値は現在保存している版を使うため、後日の気象訂正までは再現できません。記録の入力・更新時刻が不明な旧データには、当時の日付を再構成する限界があります。候補は時系列検証と保存した新旧予測の比較を経て、利用者が承認した場合だけ採用します。</p>`;
  const status = document.getElementById("dashboardGrowthArchiveStatus");
  if(status) status.textContent = dashboardGrowthArchiveStatus || "予報・予測はこの画面を表示した時に端末へ保存します。閉じている間の予報は記録しません。";
}

function evaluateDashboardGrowthSavedPredictions(entries, samples, options = {}){
  const engine = HarvestGrowthModel, rows = [], seen = new Set();
  const leadDays = options.leadDays === undefined ? 3 : options.leadDays;
  if(!Number.isInteger(leadDays) || leadDays < 1 || leadDays > 180) throw new Error("保存予測の評価日数が正しくありません");
  const instant = value => {
    if(typeof value === "number") return Number.isFinite(value) ? value : null;
    if(value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
    if(typeof value !== "string" || !value) return null;
    if(/^\d{4}-\d{2}-\d{2}$/.test(value)) return engine.dateKey(value) ? Date.parse(value + "T00:00:00+09:00") : null;
    const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);
    const time = Date.parse(value);
    return match && engine.dateKey(match[1]) && Number(match[2]) < 24 && Number(match[3]) < 60
      && Number(match[4]) < 60 && Number.isFinite(time) ? time : null;
  };
  const asOf = options.asOf || new Date().toISOString(), cutoff = instant(asOf), asOfDay = engine.dateKey(asOf);
  if(cutoff === null || !asOfDay) throw new Error("保存予測の評価時点が正しくありません");
  const excluded = {invalidEntry:0,invalidSample:0,futureOutcome:0,unavailableOutcome:0,weakPosition:0,
    unavailablePlanting:0,incompleteCoverage:0,noMatchingSnapshot:0};
  const ordered = [];
  (entries || []).forEach(entry => {
    const origin = engine.dateKey(entry?.asOf), captured = instant(entry?.capturedAt), payload = entry?.payload;
    if(!origin || captured === null || captured > cutoff || engine.dateKey(entry.capturedAt) !== origin
      || entry.kind && entry.kind !== "prediction" || !payload || !Array.isArray(payload.predictions)){
      excluded.invalidEntry++; return;
    }
    const declared = payload.asOf === undefined ? captured : instant(payload.asOf);
    if(declared === null || declared > captured || payload.asOf !== undefined && engine.dateKey(payload.asOf) !== origin){
      excluded.invalidEntry++; return;
    }
    const trained = [payload.modelTrainedAsOf,payload.modelTrainedAt,payload.trainedAt,payload.model?.trainedAsOf,payload.model?.trainedAt]
      .filter(value => value !== undefined && value !== null && value !== "");
    if(trained.some(value => instant(value) === null || instant(value) > declared)){
      excluded.invalidEntry++; return;
    }
    ordered.push({entry,origin,captured,declared});
  });
  ordered.sort((a,b) => b.captured - a.captured || String(a.entry.id || "").localeCompare(String(b.entry.id || "")));
  (samples || []).forEach(sample => {
    const date = engine.dateKey(sample.date), plantingDate = engine.dateKey(sample.plantingDate);
    if(!date || !plantingDate || plantingDate > date || !Array.isArray(sample.palletKeys) || !sample.palletKeys.length){ excluded.invalidSample++; return; }
    if(seen.has(sample.id)) return;
    seen.add(sample.id);
    if(date >= asOfDay){ excluded.futureOutcome++; return; }
    const available = sample.availableAt || sample.recordedAt;
    if(available && (instant(available) === null || instant(available) >= cutoff)){ excluded.unavailableOutcome++; return; }
    if(sample.signalKind === "partial-bed" || (sample.partialHarvest || sample.type === "partialHarvest")
      && sample.signalKind !== "partial-position" && sample.positionKnown !== true){ excluded.weakPosition++; return; }
    const origin = engine.addDays(date,-leadDays), group = sample.groupId || sample.id;
    let selected = false;
    for(const saved of ordered){
      if(saved.origin !== origin) continue;
      const forecasts = saved.entry.payload.predictions.filter(item => item.building === sample.building
        && item.bed === sample.bed && engine.dateKey(item.plantingDate) === plantingDate
        && (sample.plantingEventId === undefined || item.plantingEventId === undefined || item.plantingEventId === sample.plantingEventId)
        && Array.isArray(item.palletKeys) && item.palletKeys.some(key => sample.palletKeys.includes(key)));
      if(!forecasts.length) continue;
      // Select the latest matching snapshot at exactly this lead, before looking
      // at prediction values. Missing results never fall back to a luckier one.
      selected = true;
      if(sample.plantingAvailableAt && (instant(sample.plantingAvailableAt) === null || instant(sample.plantingAvailableAt) >= saved.declared)){
        excluded.unavailablePlanting++; break;
      }
      const covered = new Set(forecasts.flatMap(item => item.palletKeys));
      if(sample.palletKeys.some(key => !covered.has(key))){ excluded.incompleteCoverage++; break; }
      const used = new Set(), labels = {small:0,normal:1,large:2};
      forecasts.forEach(forecast => {
        const keys = [...new Set(forecast.palletKeys.filter(key => sample.palletKeys.includes(key) && !used.has(key)))].sort();
        if(!keys.length) return;
        keys.forEach(key => used.add(key));
        const prediction = forecast.prediction || {}, readyDate = engine.dateKey(sample.readyDate);
        const predictedReady = engine.dateKey(prediction.readyDate || prediction.readyStart);
        const canScoreSize = forecast.scheduled && engine.dateKey(forecast.targetDate) === date
          && labels[sample.sizeRating] !== undefined && labels[prediction.status] !== undefined;
        const canScoreDate = readyDate && predictedReady && readyDate <= date && origin < readyDate;
        const grades={none:0,slight:1,many:2};
        const qualityErrors=Object.fromEntries(["elongated","uneven","tipburn"].map(key=>{
          const actual=sample.symptoms?.[key],risk=forecast.risk?.[key];
          return [key,engine.dateKey(forecast.targetDate)===date && grades[actual]!==undefined
            && grades[risk?.severity]!==undefined && !risk.outOfForecast ? Math.abs(grades[actual]-grades[risk.severity]) : null];
        }));
        if(!canScoreSize && !canScoreDate && !Object.values(qualityErrors).some(Number.isFinite)) return;
        const interval = prediction.interval, start = engine.dateKey(interval?.start), end = engine.dateKey(interval?.end);
        const trained=instant(saved.entry.payload.modelTrainedAsOf),plantingKnown=instant(sample.plantingAvailableAt);
        rows.push({id:forecasts.length === 1 ? sample.id : `${sample.id}@${keys.join(",")}`,
          groupId:group,cropId:sample.cropId,asOf:origin,outcomeDate:date,availableAt:sample.availableAt,
          modelVersion:saved.entry.payload.modelVersion || "unknown",qualityErrors,
          provenanceVerified:trained!==null && trained<=saved.declared && plantingKnown!==null && plantingKnown<saved.declared
            && instant(sample.availableAt)!==null && !!saved.entry.payload.modelId,
          plantingEventId:sample.plantingEventId,palletKeys:keys,building:sample.building,bed:sample.bed,
          actual:sample.sizeRating,predicted:prediction.status || "unknown",
          ordinalError:canScoreSize ? Math.abs(labels[sample.sizeRating]-labels[prediction.status]) : null,
          readyError:canScoreDate ? engine.daysBetween(readyDate,predictedReady) : null,
          normalHarvestProxyError:null,
          intervalHit:canScoreDate && start && end && start <= end ? Number(readyDate >= start && readyDate <= end) : null,
          confidence:prediction.confidence?.level || "reference",dayCounts:prediction.dayCounts,
          predictionId:saved.entry.id || null,capturedAt:saved.entry.capturedAt});
      });
      break;
    }
    if(!selected) excluded.noMatchingSnapshot++;
  });
  return {schemaVersion:1,kind:"saved-predictions",asOf,leadDays,selection:"latest-on-exact-lead-day",
    metrics:engine.metrics(rows),rows,excluded,
    limitations:[`収穫の${leadDays}日前と同日に保存した最新の対象予測を使用。それ以前の日の予測は混在させません。`,
      "保存日と元の予測日が一致し、対象パレットを全て含む履歴だけを評価。位置別予測は全て集計し、同じ収穫の評価を独立した作として水増ししません。",
      "大きさは当時の予定日と実際の収穫日が一致するものだけ採点。未来の結果、位置不明の部分収穫、未入力の適期日は採点しません。",
      "学習日時・記録の入力日時がない旧履歴は当時の入力・学習状態を完全には検証できません。"]};
}

async function inspectDashboardGrowthHistory(){
  const model = dashboardGrowthPredictionModelCache;
  if(!model) return;
  const container = document.getElementById("dashboardGrowthSavedEvaluation");
  if(container) container.textContent = "保存した予測を確認しています…";
  try{
    const entries = await HarvestGrowthHistory.list(model.scope, "prediction");
    const result = evaluateDashboardGrowthSavedPredictions(entries, model.samples, {asOf:model.asOf});
    model.savedEvaluation = result;
    const m = result.metrics;
    if(container) container.textContent = `保存履歴${entries.length}回。収穫${result.leadDays}日前の最新予測で、大きさの採点対象${m.labelledCount}件${m.accuracy === null ? "" : `・的中率${Math.round(m.accuracy * 100)}%`}、適期日の採点対象${m.readyDateCount}件${m.readyDateMAE === null ? "" : `・平均誤差${Math.round(m.readyDateMAE * 10) / 10}日`}。未入力や当時の予定日と収穫日が異なる大きさ評価は採点しません。`;
  }catch(error){ if(container) container.textContent = "予測履歴を読み込めませんでした。もう一度お試しください。"; }
}

function findDashboardGrowthDiagnosticCase(entries,samples,analysisAsOf){
  const day=HarvestGrowthModel.dateKey(analysisAsOf),instant=value=>{
    const time=Date.parse(value || "");return Number.isFinite(time) ? time : null;
  };
  const ordered=(entries || []).slice().sort((a,b)=>String(b.capturedAt).localeCompare(String(a.capturedAt)));
  for(const entry of ordered){
    const origin=HarvestGrowthModel.dateKey(entry.payload?.asOf || entry.asOf);
    if(!origin || !entry.payload?.modelId || !entry.payload?.weatherInputId) continue;
    for(const forecast of entry.payload.predictions || []){
      if(!forecast?.prediction?.readyDate && !forecast?.prediction?.readyStart) continue;
      const sample=(samples || []).find(item=>{
        const ready=HarvestGrowthModel.dateKey(item.readyDate),available=instant(item.availableAt || item.recordedAt);
        return ready && ready<=day && origin<ready && (available===null || available<=instant(analysisAsOf))
          && Number(item.building)===Number(forecast.building) && item.bed===forecast.bed
          && HarvestGrowthModel.dateKey(item.plantingDate)===HarvestGrowthModel.dateKey(forecast.plantingDate)
          && (item.plantingEventId===undefined || forecast.plantingEventId===undefined || String(item.plantingEventId)===String(forecast.plantingEventId))
          && Array.isArray(item.palletKeys) && Array.isArray(forecast.palletKeys)
          && item.palletKeys.some(key=>forecast.palletKeys.includes(key));
      });
      if(sample) return {entry,forecast,sample};
    }
  }
  return null;
}

async function inspectDashboardGrowthLatestFailure(){
  const model=dashboardGrowthPredictionModelCache,container=document.getElementById("dashboardGrowthSavedEvaluation");
  if(!model || !container) return;
  container.textContent="保存時のモデルと気象入力を確認しています…";
  try{
    const entries=await HarvestGrowthHistory.list(model.scope,"prediction"),found=findDashboardGrowthDiagnosticCase(entries,model.engineSamples,model.asOf);
    if(!found){container.textContent="保存予測と、入力済みの実際の適期日を照合できる作がまだありません。";return;}
    const [modelEntry,weatherEntry]=await Promise.all([
      HarvestGrowthHistory.get(found.entry.payload.modelId),HarvestGrowthHistory.get(found.entry.payload.weatherInputId)
    ]);
    if(!modelEntry?.payload || !weatherEntry?.payload?.daily){container.textContent="保存時のモデルまたは気象入力がないため、原因分析できません。";return;}
    const result=HarvestGrowthAnalysis.analyzeFailure({engine:HarvestGrowthModel,
      modelSnapshot:modelEntry.payload,modelVersion:found.entry.payload.modelVersion,
      savedPrediction:found.forecast.prediction,input:found.forecast.input,
      asOf:found.entry.payload.asOf || found.entry.asOf,analysisAsOf:model.asOf,
      weatherDaily:weatherEntry.payload.daily,observedDaily:model.weather.daily,
      actual:{readyDate:found.sample.readyDate,availableAt:found.sample.availableAt || found.sample.recordedAt},
      conditions:HarvestGrowthObservations.list().filter(row=>row.kind==="condition")});
    const location=`${found.forecast.building}号棟 ${found.forecast.bed}ベッド`;
    const parts=[`${location}の保存予測を、保存時のモデル版と気象入力で分析しました。`];
    if(Number.isFinite(result.readyErrorDays)) parts.push(`適期開始日の誤差は${Math.abs(result.readyErrorDays)}日（${result.readyErrorDays>0 ? "予測が遅い" : result.readyErrorDays<0 ? "予測が早い" : "一致"}）です。`);
    if(result.decomposition) parts.push(`同じモデル・栽培入力で予報だけを後日の実測へ差し替えた影響は${result.decomposition.weatherEffectDays}日、残る差は${result.decomposition.remainingErrorDays}日です。`);
    parts.push(...result.reasons,...result.context.map(item=>item.reason));
    parts.push("この結果は事後の参考診断で、当時の精度評価や学習データには加えません。");
    container.textContent=parts.join(" ");
  }catch(error){container.textContent="保存時の条件を固定した原因分析を実行できませんでした。履歴が欠けていないか確認してください。";}
}

async function exportDashboardGrowthHistory(){
  if(!ensureProtectedOperationAccess("予報・予測履歴の書き出し")) return;
  const model = dashboardGrowthPredictionModelCache;
  if(!model) return;
  const safetyScope=getActiveRecordsStorageKey();
  try{
    const [weatherHistory, predictionHistory,historyBackup] = await Promise.all([
      HarvestGrowthHistory.list(model.scope, "weather"), HarvestGrowthHistory.list(model.scope, "prediction"),
      HarvestGrowthHistory.backupScope(model.scope)
    ]);
    const payload = { app:"Harvestnavi", type:"growth-evaluation-backup", schemaVersion:1,
      exportedAt:new Date().toISOString(), asOf:model.asOf, cultivar:DASHBOARD_GROWTH_CULTIVAR,
      modelVersion:HarvestGrowthModel.schemaVersion, scope:model.scope,
      samples:model.engineSamples, weather:model.weather, weatherHistory, predictionHistory,
      restoration:{schemaVersion:1,history:historyBackup,observations:HarvestGrowthObservations.backup(),
        models:getDashboardGrowthLearningRegistry().exportBackup(),
        safetySnapshot:await getDashboardGrowthSafetyArchive().readSnapshot(safetyScope),
        adjustments:getDashboardGrowthBuildingAdjustments(),location:getDashboardGrowthLocation()},
      backtest:model.validation, savedEvaluation:evaluateDashboardGrowthSavedPredictions(predictionHistory, model.samples, {asOf:model.asOf}) };
    if(safetyScope!==getActiveRecordsStorageKey()) throw new Error("利用者が切り替わったため書き出しを中止しました");
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload)], { type:"application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = `Harvestnavi-growth-${formatDateOnlyString(new Date())}.json`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("予報・予測履歴と精度比較を書き出しました");
  }catch(error){ showToast("履歴を書き出せませんでした。空き容量などを確認してください", { error:true }); }
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
    if(!item?.range && !item?.hasCurrentCrop){
      return `<article class="dashboardGrowthBedCard is-no-forecast" aria-label="${escapeHtml(item?.bed || "-")}ベッド。収穫予定なし"><div class="dashboardGrowthBedHead"><span class="dashboardGrowthBedName">${escapeHtml(item?.bed || "-")}ベッド</span><span class="dashboardGrowthBedDate">収穫予定なし</span></div></article>`;
    }
    const dateText = item.range ? formatDashboardForecastRange(item.range).dateText : "予定未設定";
    const statusClass = ["small", "large", "unknown"].includes(item.status) ? ` is-${item.status}` : "";
    const riskItems = [
      getDashboardGrowthRiskHtml("徒長", item.risk?.elongated),
      getDashboardGrowthRiskHtml("ばらつき", item.risk?.uneven, "ばらつき"),
      getDashboardGrowthRiskHtml("チップバーン", item.risk?.tipburn, "チップ")
    ].filter(Boolean);
    return `
      <details class="dashboardGrowthBedCard">
        <summary class="dashboardGrowthBedSummary">
          <span class="dashboardGrowthBedHead">
            <span class="dashboardGrowthBedName">${escapeHtml(item.bed)}ベッド</span>
            <span class="dashboardGrowthBedDate">${escapeHtml(dateText)}</span>
          </span>
          <span class="dashboardGrowthStatus${statusClass}">
            <span class="dashboardGrowthStatusLabel">${item.range ? "予定日時点" : "現在の予測"}</span>
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
          ${getDashboardGrowthPositionHtml(item)}
          <button type="button" class="dashboardInlineBtn" data-ui-click="showDashboardGrowthSimilar" data-ui-number="${building}" data-ui-number-first="true" data-ui-arg="${escapeHtml(item.bed)}">類似した過去作を確認</button>
          <div id="dashboardGrowthSimilar-${building}-${escapeHtml(item.bed)}"></div>
          <div class="dashboardGrowthReason">${escapeHtml(item.reason)}</div>
          ${item.provisional ? '<div class="dashboardGrowthConfidenceHint">評価が増えても、検証で精度を確認できるまでは参考値です</div>' : ""}
        </div>
      </details>
    `;
  }).join("");
  container.setAttribute("aria-label", `${building}号棟のAからFベッドの生育予測`);
}

function renderDashboardGrowthPredictionModel(model, location){
  processDashboardGrowthChanges(model);
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
    if(model.learning?.runtime?.fallback) updatedAt.textContent += `・${model.learning.runtime.label}`;
  }
  if(!BUILDINGS.includes(dashboardGrowthPredictionBuilding)){
    dashboardGrowthPredictionBuilding = model.startBuilding;
  }
  renderDashboardGrowthBuildingTraits();
  renderDashboardGrowthWeatherDiagnostics(model);
  renderDashboardGrowthPredictionBuilding(model, dashboardGrowthPredictionBuilding);
  renderDashboardGrowthValidation(model);
  renderDashboardGrowthModelManagement(model);
  renderDashboardGrowthPlanning(model);
  if(typeof refreshDashboardGrowthReview==="function") refreshDashboardGrowthReview(model);
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
  if(!options.force && dashboardGrowthPredictionModelCache
    && !dashboardGrowthPredictionModelCache.weather?.stale
    && dashboardGrowthPredictionModelCache.asOf?.slice(0, 10) === formatDateOnlyString(new Date())
    && Date.now() - dashboardGrowthPredictionModelCache.createdAt < 24 * 60 * 60 * 1000){
    renderDashboardGrowthPredictionModel(dashboardGrowthPredictionModelCache, location);
    return;
  }
  if(dashboardGrowthWeatherLoading) return dashboardGrowthWeatherLoading;
  setDashboardGrowthLoading(true);
  const startedAt = performance.now();
  const revision = dashboardGrowthDataRevision;
  const scope = getDashboardGrowthHistoryScope(location);
  dashboardGrowthWeatherLoading = loadDashboardGrowthWeather(location, options)
    .then(async weather => {
      try{ await loadDashboardGrowthForecastHistory(scope); }
      catch(error){ dashboardGrowthArchiveStatus = "保存済みの予報履歴を読み込めません。履歴なしで比較します"; }
      await new Promise(resolve => setTimeout(resolve, 0));
      if(revision !== dashboardGrowthDataRevision || scope !== getDashboardGrowthHistoryScope()) return null;
      const asOf = getDashboardGrowthAsOf();
      const engineSamples = getDashboardGrowthEngineSamples(getDashboardGrowthSourceState(),asOf);
      const dataSignature = await getDashboardGrowthEvidenceSignature(engineSamples,asOf);
      const learning = await prepareDashboardGrowthLearning(engineSamples, {
        asOf, weatherDaily:weather.daily,
        forecastHistory:dashboardGrowthForecastHistoryCache?.scope === scope ? dashboardGrowthForecastHistoryCache.days : [],
        dataSignature
      },()=>revision === dashboardGrowthDataRevision && scope === getDashboardGrowthHistoryScope());
      if(revision !== dashboardGrowthDataRevision || scope !== getDashboardGrowthHistoryScope()) return null;
      const model = buildDashboardGrowthPredictionModel(weather, {
        fetchMs:performance.now() - startedAt, learning,dataSignature
      });
      dashboardGrowthPredictionModelCache = model;
      renderDashboardGrowthPredictionModel(model, location);
      await saveDashboardGrowthHistory(model);
      return model;
    })
    .catch(error => {
      if(revision !== dashboardGrowthDataRevision || scope !== getDashboardGrowthHistoryScope()) return;
      console.error("生育予測を読み込めませんでした", error);
      if(missing) missing.hidden = true;
      if(content) content.hidden = false;
      const beds = document.getElementById("dashboardGrowthBeds");
      const tabs = document.getElementById("dashboardGrowthBuildingTabs");
      const weatherDetails = document.getElementById("dashboardGrowthWeatherDiagnostics");
      if(weatherDetails) weatherDetails.innerHTML = "";
      if(beds) beds.innerHTML = `<div class="dashboardEmpty" style="grid-column:1/-1;">${escapeHtml(error?.message || "気象データを取得できませんでした。通信状態を確認して「更新」を押してください。")}</div>`;
      if(tabs) tabs.innerHTML = "";
      if(refreshButton) refreshButton.hidden = false;
    })
    .finally(() => {
      dashboardGrowthWeatherLoading = null;
      setDashboardGrowthLoading(false);
      if(revision !== dashboardGrowthDataRevision || scope !== getDashboardGrowthHistoryScope()){
        if(normalizeDashboardSubtab(dashboardFilter.dashboardSubtab) === "growth") renderDashboardGrowthPrediction();
      }
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
  if(dashboardGrowthPredictionModelCache?.fit || dashboardGrowthWeatherLoading){
    dashboardGrowthDataRevision++;
    dashboardGrowthPredictionModelCache = null;
    dashboardRenderedSubtabs.delete("growth");
    renderDashboardGrowthPrediction();
  }else if(dashboardGrowthPredictionModelCache){
    rebuildDashboardGrowthPredictionBuilding(dashboardGrowthPredictionModelCache, normalizedBuilding);
    renderDashboardGrowthValidation(dashboardGrowthPredictionModelCache);
    saveDashboardGrowthHistory(dashboardGrowthPredictionModelCache);
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
