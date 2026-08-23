function formatInstructionLineHtml(text){
  return escapeHtml(String(text || ""))
    .replace(/(苗:\s*)(\d+枚)（自動:\s*(\d+枚)）/g, '$1<span class="instructionManualEmphasis">$2</span><span class="instructionAutoNote">（自動: $3）</span>')
    .replace(/(苗:\s*)(\d+枚)/g, '$1<span class="instructionEmphasis">$2</span>')
    .replace(/(収穫ケース数:\s*)(\d+)(?:\s*ケース)?/g, '$1<span class="instructionEmphasis">$2ケース</span>')
    .replace(/([A-F])\s*((前|後ろ)(\d+ピン)(とる|残す))/g, '<span class="instructionEmphasis">$1 $2</span>')
    .replace(/(^|[^A-Z])((前|後ろ)(\d+ピン)(とる|残す))/g, '$1<span class="instructionEmphasis">$2</span>');
}

function formatInstructionDisplayHtml(text){
  const lines = String(text || "").split("\n");
  const html = [];
  let index = 0;

  while(index < lines.length){
    const line = lines[index] || "";
    if(/^表示レイアウト\s*[:：]/.test(line)){
      index++;
      continue;
    }
    if(line.startsWith("収穫場所: ") || line.startsWith("残すケース: ")){
      const label = line.startsWith("収穫場所: ") ? "収穫場所: " : "残すケース: ";
      const detailLines = [line.slice(label.length)];
      const isRemainingCaseLine = label === "残すケース: ";
      index++;
      while(index < lines.length && lines[index] && (
        isRemainingCaseLine
          ? !/^(苗:|収穫ケース数:|収穫場所:|残すケース:|表示レイアウト:)\s*/.test(lines[index] || "")
          : !/^[^:\n]+:\s/.test(lines[index] || "")
      )){
        detailLines.push(lines[index] || "");
        index++;
      }
      const detailHtml = detailLines.map(formatInstructionLineHtml).join("<br>");
      const valueClass = isRemainingCaseLine ? "instructionRowValue remainingCaseValue" : "instructionRowValue";
      html.push(`<div class="monitorLine instructionRow"><div class="instructionRowLabel">${label}</div><div class="${valueClass}">${detailHtml}</div></div>`);
      continue;
    }
    html.push(`<div class="monitorLine">${formatInstructionLineHtml(line || " ")}</div>`);
    index++;
  }

  return html.join("");
}

function buildInstructionSummaryText(){
  return buildCurrentMonitorRemoteContent().instructionText;
}

function renderMonitorTabControls(){
  const badge = document.getElementById("monitorSendStatusBadge");
  const lastSent = document.getElementById("monitorLastSentAt");
  const planStatus = getWorkflowPlanStatus();
  const currentSignature = planStatus.ready ? getWorkflowPlanFingerprint() : "";
  const isSent = !!currentSignature
    && workflowHarvestRecordingActive
    && workflowMonitorCheckpointSignature === currentSignature;

  if(badge){
    badge.classList.remove("is-unready", "is-waiting", "is-sent");
    if(isSent){
      badge.textContent = "送信済み";
      badge.classList.add("is-sent");
    }else if(planStatus.ready){
      badge.textContent = "送信待ち";
      badge.classList.add("is-waiting");
    }else{
      badge.textContent = "計算前";
      badge.classList.add("is-unready");
    }
  }

  if(lastSent){
    const remote = monitorRemoteContent || monitorRemoteFetchedContent;
    const display = getMonitorUpdatedAtDisplay(remote?.updatedAt);
    lastSent.textContent = `最終送信 ${display || "--"}`;
  }
}

function setMonitorMemoPanelOpen(isOpen){
  const panel = document.getElementById("monitorMemoInputPanel");
  const toggle = document.getElementById("monitorMemoToggleBtn");
  if(panel) panel.hidden = !isOpen;
  if(toggle) toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  scheduleMainTabViewportScrollLock();
}

function toggleMonitorMemoPanel(){
  const panel = document.getElementById("monitorMemoInputPanel");
  setMonitorMemoPanelOpen(!!panel?.hidden);
}

function refreshMonitorMemoPanelSummary(){
  const count = getMonitorMemoInputValues()
    .filter(value => String(value || "").trim() !== "")
    .length;
  const countElement = document.getElementById("monitorMemoCount");
  if(countElement) countElement.textContent = `${count}件`;
}

function getMonitorMemoInputValues(){
  const inputs = Array.from(document.querySelectorAll(".monitorMemoItemInput"));
  return inputs.map(input => String(input.value || ""));
}

function getMonitorRemoteMemoInputValues(){
  const inputs = Array.from(document.querySelectorAll(".monitorRemoteMemoItemInput"));
  return inputs.map(input => String(input.value || ""));
}

function resizeMonitorMemoInput(textarea){
  if(!textarea) return;
  const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 25;
  const verticalPadding = 8;
  const oneLineHeight = Math.ceil(lineHeight + verticalPadding);
  if(String(textarea.value || "") === ""){
    textarea.style.height = oneLineHeight + "px";
    return;
  }
  textarea.style.height = "0px";
  textarea.style.height = Math.max(oneLineHeight, textarea.scrollHeight) + "px";
}

function resizeAllMonitorMemoInputs(){
  document.querySelectorAll(".monitorMemoInput").forEach(resizeMonitorMemoInput);
}

function renderMemoInputsToList(listId, items = [], options = {}){
  const list = document.getElementById(listId);
  if(!list) return;
  const memoItems = normalizeMonitorMemoItems(items);
  const values = memoItems.length || options.allowEmpty ? memoItems : [""];
  list.innerHTML = "";
  values.forEach(value => {
    list.appendChild(createMonitorMemoInputItem(value, options));
  });
  updateMonitorMemoRemoveButtons(list);
  resizeAllMonitorMemoInputs();
  refreshEmptyInputHighlights();
}

function renderMonitorMemoInputs(items = []){
  renderMemoInputsToList("monitorMemoInputList", items, {
    inputClass: "monitorMemoItemInput",
    kind: "main",
    allowEmpty: true,
    onInput: handleMonitorMemoInput
  });
  refreshMonitorMemoPanelSummary();
  setMonitorMemoPanelOpen(false);
  renderMonitorMemoReadOnly();
}

function renderMonitorMemoReadOnly(contentOverride){
  const valueElement = document.getElementById("monitorMemoReadOnlyValue");
  if(!valueElement) return;
  const content = contentOverride || buildCurrentMonitorRemoteContent();
  const items = normalizeMonitorMemoItems(content?.memoItems, content?.memoText)
    .map(item => String(item || "").trim())
    .filter(Boolean);
  valueElement.classList.toggle("is-empty", items.length === 0);
  valueElement.innerHTML = items.length
    ? items.map(item => `<div class="monitorMemoReadOnlyItem">${escapeHtml(item).replace(/\n/g, "<br>")}</div>`).join("")
    : "なし";
}

function renderMonitorRemoteMemoInputs(items = []){
  renderMemoInputsToList("monitorRemoteMemoInputList", items, {
    inputClass: "monitorRemoteMemoItemInput",
    kind: "remote",
    onInput: handleMonitorRemoteMemoInput
  });
}

function addMemoInputToList(listId, value = "", options = {}){
  const list = document.getElementById(listId);
  if(!list) return;
  const item = createMonitorMemoInputItem(value, options);
  list.appendChild(item);
  updateMonitorMemoRemoveButtons(list);
  resizeMonitorMemoInput(item.querySelector(".monitorMemoInput"));
  refreshEmptyInputHighlights();
  item.querySelector(".monitorMemoInput")?.focus();
}

function addMonitorMemoInput(value = ""){
  setMonitorMemoPanelOpen(true);
  addMemoInputToList("monitorMemoInputList", value, {
    inputClass: "monitorMemoItemInput",
    kind: "main",
    onInput: handleMonitorMemoInput
  });
  refreshMonitorMemoPanelSummary();
  handleMonitorMemoInput();
}

function addMonitorRemoteMemoInput(value = ""){
  addMemoInputToList("monitorRemoteMemoInputList", value, {
    inputClass: "monitorRemoteMemoItemInput",
    kind: "remote",
    onInput: handleMonitorRemoteMemoInput
  });
}

function createMonitorMemoInputItem(value = "", options = {}){
  const item = document.createElement("div");
  item.className = "monitorMemoInputItem";
  item.dataset.memoInputKind = options.kind || "main";
  const textarea = document.createElement("textarea");
  const inputClass = options.inputClass || "monitorMemoItemInput";
  textarea.className = "monitorMemoInput " + inputClass;
  textarea.rows = 1;
  textarea.placeholder = "モニター右側に表示したいメモを入力";
  textarea.value = String(value || "");
  const handleInputResize = () => {
    resizeMonitorMemoInput(textarea);
    if(typeof options.onInput === "function") options.onInput();
  };
  textarea.addEventListener("input", handleInputResize);
  textarea.addEventListener("change", handleInputResize);
  textarea.addEventListener("compositionend", handleInputResize);

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "monitorMemoRemoveBtn";
  removeButton.textContent = "×";
  removeButton.setAttribute("aria-label", "このメモ入力欄を削除");
  removeButton.onclick = () => removeMonitorMemoInput(item);

  item.appendChild(removeButton);
  item.appendChild(textarea);
  return item;
}

function updateMonitorMemoRemoveButtons(list = document.getElementById("monitorMemoInputList")){
  if(!list) return;
  const items = Array.from(list.querySelectorAll(".monitorMemoInputItem"));
  items.forEach(item => {
    const button = item.querySelector(".monitorMemoRemoveBtn");
    item.classList.add("hasRemoveButton");
    if(button) button.style.display = "";
  });
}

function removeMonitorMemoInput(item){
  const list = item?.parentElement;
  const kind = item.dataset.memoInputKind || "main";
  item.remove();
  updateMonitorMemoRemoveButtons(list);
  refreshEmptyInputHighlights();
  if(kind === "remote"){
    handleMonitorRemoteMemoInput();
  }else{
    handleMonitorMemoInput();
    if(!list?.children.length) setMonitorMemoPanelOpen(false);
  }
}

function handleMonitorMemoInput(){
  monitorMemoInputsDirty = true;
  invalidateWorkflowMonitorCheckpoint();
  refreshMonitorMemoPanelSummary();
  renderMonitorTabControls();
  scheduleHarvestStateSave();
  if(isMonitorModeOpen){
    renderMonitorMode();
  }
  scheduleWorkflowGuideUpdate();
}

function handleMonitorRemoteMemoInput(){
  setMonitorRemoteEditorStatus("");
}

function getMonitorMemoHtml(memoItemsOverride){
  const sourceItems = Array.isArray(memoItemsOverride)
    ? memoItemsOverride
    : (typeof memoItemsOverride === "string" ? normalizeMonitorMemoItems(null, memoItemsOverride) : getMonitorMemoInputValues());
  const memoItems = normalizeMonitorMemoItems(sourceItems)
    .map(item => String(item || "").trim())
    .filter(Boolean);
  if(!memoItems.length){
    return `<div class="monitorEmpty">メモはありません。</div>`;
  }
  return `<div class="monitorMemoDisplayList">${memoItems.map(item => {
    return `<div class="monitorMemoDisplayItem">${escapeHtml(item).replace(/\n/g, "<br>")}</div>`;
  }).join("")}</div>`;
}

function getMonitorSegmentLocationClass(index, segmentCount){
  const ratio = (index + 0.5) / Math.max(1, segmentCount);
  if(ratio <= 1 / 3) return "front";
  if(ratio <= 2 / 3) return "middle";
  return "back";
}

function buildMonitorBedSegments(numbers, building, bed, recordedSet, segmentCount = 6){
  const selected = new Set(Array.isArray(numbers) ? numbers : []);
  return Array.from({ length: segmentCount }, (_, index) => {
    const start = Math.floor(index * PALLETS_PER_BED / segmentCount) + 1;
    const end = Math.floor((index + 1) * PALLETS_PER_BED / segmentCount);
    const bucketLength = Math.max(1, end - start + 1);
    let selectedCount = 0;
    let recordedCount = 0;
    for(let number = start; number <= end; number++){
      if(selected.has(number)) selectedCount++;
      if(recordedSet?.has(getPalletKey(building, bed, number))) recordedCount++;
    }
    const selectedRatio = selectedCount / bucketLength;
    const recordedRatio = recordedCount / bucketLength;
    return {
      location: getMonitorSegmentLocationClass(index, segmentCount),
      start,
      end,
      selectedCount,
      recordedCount,
      selectedActive: selectedRatio >= 0.68,
      selectedPartial: selectedCount > 0 && selectedRatio < 0.68,
      recordedActive: selectedCount === 0 && recordedRatio >= 0.68,
      recordedPartial: selectedCount === 0 && recordedCount > 0 && recordedRatio < 0.68
    };
  });
}

function getMonitorBedPalletMapHtml(building, bed, selectedSet, recordedSet){
  const cells = [];
  for(let row = ROWS; row >= 1; row--){
    const displayRowIndex = ROWS - row;
    const sectionStart = displayRowIndex > 0
      && Math.floor(displayRowIndex * 6 / ROWS) > Math.floor((displayRowIndex - 1) * 6 / ROWS);
    [row * 2 - 1, row * 2].forEach(number => {
      const key = getPalletKey(building, bed, number);
      const selected = selectedSet.has(key);
      const recorded = recordedSet.has(key);
      const classes = ["dashboardSeedlingBedMapCell", "simulationBedMapCell", "monitorBedMapCell"];
      if(selected) classes.push("is-selected");
      if(recorded) classes.push("is-recorded");
      if(sectionStart) classes.push("is-section-start");
      const state = selected ? "今回収穫" : (recorded ? "収穫済み" : "未選択");
      cells.push(`<span class="${classes.join(" ")}" title="${number}番 ${state}"></span>`);
    });
  }
  return `
    <div class="dashboardSeedlingBedMap simulationBedMap monitorBedPalletMap" aria-hidden="true">
      <div class="dashboardSeedlingBedMapGrid monitorBedPalletMapGrid">${cells.join("")}</div>
    </div>
  `;
}

function getMonitorBuildingDisplayOrder(grouped){
  const available = BUILDINGS.filter(building => grouped[String(building)]);
  const availableSet = new Set(available);
  const firstBuilding = BUILDINGS[0];
  const lastBuilding = BUILDINGS[BUILDINGS.length - 1];
  if(!availableSet.has(firstBuilding) || !availableSet.has(lastBuilding)) return available;

  let startIndex = BUILDINGS.length - 1;
  if(available.length < BUILDINGS.length){
    while(startIndex > 0 && availableSet.has(BUILDINGS[startIndex - 1])){
      startIndex--;
    }
  }
  return Array.from(
    { length: BUILDINGS.length },
    (_, offset) => BUILDINGS[(startIndex + offset) % BUILDINGS.length]
  ).filter(building => availableSet.has(building));
}

function getMonitorCasePlacementCounts(value){
  const counts = {};
  String(value || "").split("\n").forEach(line => {
    const match = line.trim().match(/^(\d+)号棟\s*配置\s*[:：]\s*([\d,.]+)\s*ケース$/);
    const building = Number(match?.[1]);
    if(BUILDINGS.includes(building)) counts[String(building)] = match[2];
  });
  return counts;
}

function getMonitorSelectionBuildingCount(keysOverride){
  const sourceKeys = Array.isArray(keysOverride) ? keysOverride : harvestFillKeys;
  const buildings = new Set();
  sourceKeys.forEach(key => {
    const parsed = parsePalletKey(String(key || ""));
    if(BUILDINGS.includes(parsed.building)) buildings.add(parsed.building);
  });
  return buildings.size;
}

function getMonitorSelectionMapHtml(keysOverride, casePlacementValue = ""){
  const sourceKeys = Array.isArray(keysOverride) ? keysOverride : harvestFillKeys;
  if(!sourceKeys.length){
    return `<div class="monitorEmpty">収穫場所が未選択です。</div>`;
  }
  const recordedSet = getRecordedPalletSet();
  const casePlacementCounts = getMonitorCasePlacementCounts(casePlacementValue);

  const grouped = {};
  const validKeys = [];
  sourceKeys.forEach(key => {
    const parsed = parsePalletKey(String(key || ""));
    if(!BUILDINGS.includes(parsed.building) || !bedOrder.includes(parsed.bed) || !Number.isFinite(parsed.number)) return;
    const normalizedKey = getPalletKey(parsed.building, parsed.bed, parsed.number);
    validKeys.push(normalizedKey);
    const buildingKey = String(parsed.building);
    if(!grouped[buildingKey]){
      grouped[buildingKey] = {};
      bedMap.forEach(bed => {
        grouped[buildingKey][bed] = [];
      });
    }
    grouped[buildingKey][parsed.bed].push(parsed.number);
  });
  const selectedSet = new Set(validKeys);

  return getMonitorBuildingDisplayOrder(grouped)
    .map(building => {
      const beds = grouped[String(building)];
      const casePlacementCount = casePlacementCounts[String(building)] || "";
      return `
        <div class="monitorBuildingBlock" role="img" aria-label="${building}号棟の収穫場所">
          <div class="monitorBuildingTitle">
            <span class="monitorBuildingName">${building}号棟</span>
            ${casePlacementCount ? `
              <span class="monitorBuildingCasePlacement">
                <span class="monitorBuildingCaseCount">${escapeHtml(casePlacementCount)}</span><span class="monitorBuildingCaseUnit">ケース</span>
              </span>
            ` : ""}
          </div>
          <div class="monitorBedGrid">
            ${bedMap.map(bed => {
              const numbers = (beds[bed] || []).slice().sort((a, b) => a - b);
              const selectedCount = new Set(numbers).size;
              let recordedCount = 0;
              for(let number = 1; number <= PALLETS_PER_BED; number++){
                if(recordedSet.has(getPalletKey(building, bed, number))) recordedCount++;
              }
              const cardClass = numbers.length || recordedCount
                ? "monitorBedCard"
                : "monitorBedCard inactive";
              return `
                <div class="${cardClass}">
                  <div class="monitorBedHead">
                    <div class="monitorBedName">${bed}</div>
                    <div class="monitorBedCount">${selectedCount ? `${selectedCount}枚` : ""}</div>
                  </div>
                  ${getMonitorBedPalletMapHtml(building, bed, selectedSet, recordedSet)}
                </div>
              `;
            }).join("")}
          </div>
        </div>
      `;
    }).join("");
}

function getMonitorTodayDisplay(date = new Date()){
  const safeDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return {
    dateTime: formatDateOnlyString(safeDate),
    text: new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short"
    }).format(safeDate)
  };
}

function getMonitorUpdatedAtDisplay(value){
  const text = String(value || "").trim();
  if(!text) return "";

  const parts = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::\d{2})?/);
  if(parts){
    return `${Number(parts[1])}/${Number(parts[2])}/${Number(parts[3])} ${String(parts[4]).padStart(2, "0")}:${parts[5]}`;
  }

  const date = new Date(text);
  if(Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat("ja-JP", {
    year:"numeric",
    month:"numeric",
    day:"numeric",
    hour:"2-digit",
    minute:"2-digit",
    hour12:false
  }).format(date);
}

function updateMonitorTodayDisplays(){
  const today = getMonitorTodayDisplay();
  document.querySelectorAll("[data-monitor-today]").forEach(element => {
    element.textContent = today.text;
    element.setAttribute("datetime", today.dateTime);
  });
}

function startMonitorTodayRefreshTimer(){
  stopMonitorTodayRefreshTimer();
  updateMonitorTodayDisplays();
  monitorTodayRefreshTimer = setInterval(updateMonitorTodayDisplays, 60000);
}

function stopMonitorTodayRefreshTimer(){
  if(!monitorTodayRefreshTimer) return;
  clearInterval(monitorTodayRefreshTimer);
  monitorTodayRefreshTimer = null;
}

function getMonitorMetricParts(rawValue, fallbackUnit){
  const lines = String(rawValue || "")
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean);
  const mainLine = lines.shift() || "--";
  const match = mainLine.match(/^([\d,.]+)\s*(ケース|枚)?\s*(.*)$/);
  if(!match){
    return { value: mainLine, unit: "", note: lines.join(" / ") };
  }
  const notes = [String(match[3] || "").trim(), ...lines].filter(Boolean);
  return {
    value: match[1],
    unit: match[2] || fallbackUnit,
    note: notes.join(" / ")
  };
}

function removeMonitorUnplantedSeedlingNote(value){
  return String(value || "")
    .replace(/（未定植分\s*\+?\d+枚）/g, "")
    .replace(/\(未定植分\s*\+?\d+枚\)/g, "")
    .trim();
}

function getMonitorMetricCardHtml(label, rawValue, unit){
  const displayValue = label === "苗" ? removeMonitorUnplantedSeedlingNote(rawValue) : rawValue;
  const parts = getMonitorMetricParts(displayValue, unit);
  let labelIcon = "";
  if(label === "苗"){
    labelIcon = `
    <svg class="monitorMetricLabelIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 21v-9"></path>
      <path d="M12 13C7.8 13 5 10.6 5 6.5c4.2 0 7 2.4 7 6.5Z"></path>
      <path d="M12 16c0-4.5 2.9-7.5 7.5-7.5 0 4.5-2.9 7.5-7.5 7.5Z"></path>
      <path d="M8.5 21h7"></path>
    </svg>
    `;
  }else if(label === "収穫"){
    labelIcon = `
    <svg class="monitorMetricLabelIcon is-harvest-case" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 9.5 11 3.5l18 4.2-8.2 6.8L3 9.5Z" fill="currentColor" fill-opacity=".14"></path>
      <path d="m8 9.6 4.1-3 12 2.8-4.3 3.5L8 9.6Z"></path>
      <path d="M3 9.5v11.8l17.8 6.2v-13M29 7.7v11.8l-8.2 8"></path>
      <path d="M7.3 10.8v11.9M12 12.2v12.2M16.6 13.5v12.4"></path>
      <path d="m3.4 15 17.4 5.5M3.4 19.2l17.4 5.6M21 19l7.7-6.7M21 23.4l7.7-6.7"></path>
    </svg>
    `;
  }
  return `
    <section class="monitorPanel monitorMetricCard">
      <div class="monitorMetricLine">
        <div class="monitorMetricLabel">${labelIcon}<span class="monitorMetricLabelText">${escapeHtml(label)}： </span></div>
        <div class="monitorMetricValueGroup">
          <strong class="monitorMetricValue">${escapeHtml(parts.value)}</strong>
          ${parts.unit ? `<span class="monitorMetricUnit">${escapeHtml(parts.unit)}</span>` : ""}
        </div>
      </div>
      ${parts.note ? `<div class="monitorMetricNote" title="${escapeHtml(parts.note)}">${escapeHtml(parts.note)}</div>` : ""}
    </section>
  `;
}

function getMonitorRemainingCasesHtml(value, keys = [], mode = "combined", displayVariant = "default"){
  const lines = String(value || "")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
  const safeLines = lines.length ? lines : ["なし"];
  const summaries = {};
  const freeLines = [];
  safeLines.forEach(line => {
    const placementMatch = line.match(/^(\d+)号棟\s*配置\s*[:：]\s*([\d,.]+)\s*ケース$/);
    if(placementMatch){
      const building = Number(placementMatch[1]);
      if(!summaries[String(building)]) summaries[String(building)] = { placement:"", locations:[] };
      summaries[String(building)].placement = placementMatch[2];
      return;
    }
    const locationMatch = line.match(/^(\d+)号棟\s*(手前|前側|前|中央|中側|中|後ろ|後側|奥側|奥)\s*[:：]\s*([\d,.]+)\s*ケース\s*(残す|不足)?$/);
    if(locationMatch){
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
      const suffix = locationMatch[4] === "不足" ? "不足" : "残す";
      const building = Number(locationMatch[1]);
      if(!summaries[String(building)]) summaries[String(building)] = { placement:"", locations:[] };
      summaries[String(building)].locations.push({
        label:locationLabels[locationMatch[2]],
        count:locationMatch[3],
        suffix
      });
      return;
    }
    freeLines.push(line);
  });

  const grouped = {};
  Object.keys(summaries).forEach(building => {
    grouped[building] = true;
  });
  (Array.isArray(keys) ? keys : []).forEach(key => {
    const parsed = parsePalletKey(String(key || ""));
    if(BUILDINGS.includes(parsed.building) && summaries[String(parsed.building)]){
      grouped[String(parsed.building)] = true;
    }
  });
  const buildingOrder = getMonitorBuildingDisplayOrder(grouped);
  if(mode === "remaining"){
    const remainingHtml = buildingOrder.map(building => {
      const summary = summaries[String(building)];
      if(!summary.locations.length) return "";
      return `
        <div class="monitorCaseBuildingSummary is-remaining">
          <div class="monitorCaseRemainingLine">
            <span class="monitorCaseRemainingBuilding"><span class="monitorCaseBuildingNumber">${building}</span>-</span>
            ${summary.locations.map(location => `
              <span class="monitorCaseRemainingLocation${location.suffix === "不足" ? " is-shortage" : ""}">
                <span class="monitorRemainingLocation">${location.label}</span><span class="monitorRemainingCount">${escapeHtml(location.count)}</span>
              </span>
            `).join("")}
            ${displayVariant === "preview2" ? "" : `<span class="monitorRemainingSuffixInline">ケース残す</span>`}
          </div>
        </div>
      `;
    }).join("");
    const freeHtml = freeLines.map(line => {
      const shortageClass = line.includes("不足") ? " is-shortage" : "";
      const lineHtml = escapeHtml(line).replace(/([\d,.]+)\s*ケース/g, '$1<span class="monitorMetricSmallUnit">ケース</span>');
      return `<div class="monitorRemainingLine is-freeform${shortageClass}">${lineHtml}</div>`;
    }).join("");
    if(!remainingHtml && !freeHtml) return `<div class="monitorRemainingLine is-freeform">なし</div>`;
    return remainingHtml + freeHtml;
  }
  const summaryHtml = buildingOrder.map(building => {
    const summary = summaries[String(building)];
    const buildingSuffix = "号棟";
    const showPlacement = mode !== "remaining" && !!summary.placement;
    const showRemaining = mode !== "placement" && summary.locations.length > 0;
    if(!showPlacement && !showRemaining) return "";
    const locationSuffixes = new Set(summary.locations.map(location => location.suffix));
    const hasSharedLocationSuffix = locationSuffixes.size === 1;
    const sharedLocationSuffix = hasSharedLocationSuffix ? summary.locations[0]?.suffix : "";
    const locationsHtml = summary.locations.map((location, index) => {
      const shortageClass = location.suffix === "不足" ? " is-shortage" : "";
      return `
        ${index ? `<span class="monitorCaseLocationSeparator">・</span>` : ""}
        <span class="monitorCaseLocation${shortageClass}">
          <span class="monitorRemainingLocation">${location.label}</span><span class="monitorRemainingCount">${escapeHtml(location.count)}</span>${hasSharedLocationSuffix ? "" : `<span class="monitorMetricSmallUnit">ケース</span><span class="monitorRemainingSuffix">${location.suffix}</span>`}
        </span>
      `;
    }).join("");
    return `
      <div class="monitorCaseBuildingSummary is-${escapeHtml(mode)}">
        <div class="monitorCaseBuildingLine">
          <span class="monitorCaseBuildingName"><span class="monitorCaseBuildingNumber">${building}</span><span class="monitorCaseBuildingSuffix">${buildingSuffix}</span></span>
          ${showPlacement ? `
            <span class="monitorCasePlacement">
              <span class="monitorCasePlacementCount">${escapeHtml(summary.placement)}</span><span class="monitorMetricSmallUnit">ケース</span><span class="monitorCasePlacementSuffix">配置</span>
            </span>
          ` : ""}
          ${showPlacement && showRemaining ? `<span class="monitorCaseDivider" aria-hidden="true">｜</span>` : ""}
          ${showRemaining ? `
            <span class="monitorRemainingLine is-compact${sharedLocationSuffix === "不足" ? " is-shortage" : ""}">
              ${locationsHtml}${hasSharedLocationSuffix ? `<span class="monitorMetricSmallUnit">ケース</span><span class="monitorRemainingSuffix">${sharedLocationSuffix}</span>` : ""}
            </span>
          ` : ""}
        </div>
      </div>
    `;
  }).join("");
  const freeHtml = (mode === "placement" ? [] : freeLines).map(line => {
    const shortageClass = line.includes("不足") ? " is-shortage" : "";
    const lineHtml = escapeHtml(line).replace(/([\d,.]+)\s*ケース/g, '$1<span class="monitorMetricSmallUnit">ケース</span>');
    return `<div class="monitorRemainingLine is-freeform${shortageClass}">${lineHtml}</div>`;
  }).join("");
  const html = summaryHtml + freeHtml;
  return html || `<div class="monitorRemainingLine is-freeform">なし</div>`;
}

function getMonitorHarvestLocationDisplayText(value, keys = []){
  const lines = String(value || "")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
  if(lines.length < 2) return lines.join("\n");

  const grouped = {};
  (Array.isArray(keys) ? keys : []).forEach(key => {
    const parsed = parsePalletKey(String(key || ""));
    if(BUILDINGS.includes(parsed.building)) grouped[String(parsed.building)] = true;
  });
  lines.forEach(line => {
    const match = line.match(/^(\d+)号棟/);
    const building = Number(match?.[1]);
    if(BUILDINGS.includes(building)) grouped[String(building)] = true;
  });

  const order = getMonitorBuildingDisplayOrder(grouped);
  const orderIndexes = new Map(order.map((building, index) => [building, index]));
  return lines
    .map((line, index) => {
      const building = Number(line.match(/^(\d+)号棟/)?.[1]);
      return {
        line,
        index,
        order:orderIndexes.has(building) ? orderIndexes.get(building) : Number.MAX_SAFE_INTEGER
      };
    })
    .sort((left, right) => left.order - right.order || left.index - right.index)
    .map(item => item.line)
    .join("\n");
}

function getMonitorHarvestLocationAbbreviatedText(value, keys = []){
  const orderedLines = getMonitorHarvestLocationDisplayText(value, keys)
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
  let omitted = false;
  const abbreviatedLines = orderedLines.map(line => {
    const match = line.match(/^(\d+号棟)\s*(.*)$/);
    if(!match) return line;
    const buildingLabel = match[1];
    const details = String(match[2] || "").trim();
    if(details === "全部"){
      omitted = true;
      return "";
    }
    if(!details) return line;
    const detailParts = details
      .split("、")
      .map(detail => detail.trim())
      .filter(Boolean);
    const remainingDetails = details
      .split("、")
      .map(detail => detail.trim())
      .filter(detail => detail && !/全部$/.test(detail));
    if(remainingDetails.length !== detailParts.length) omitted = true;
    return remainingDetails.length
      ? `${buildingLabel} ${remainingDetails.join("、")}`
      : "";
  }).filter(Boolean);
  if(!omitted) return orderedLines.join("\n");
  return "（略）" + abbreviatedLines.join("\n");
}

function getMonitorHarvestLocationInlineHtmlFromText(value){
  const text = String(value || "").trim();
  if(!text || text === "-") return "未選択";
  return escapeHtml(text)
    .replace(/\n+/g, " / ")
    .replace(/(後ろ|前|\d+\s*ピン|とる|取る|残す)/g, '<span class="monitorLocationHighlight">$1</span>');
}

function getMonitorHarvestLocationInlineHtml(value, keys = []){
  return getMonitorHarvestLocationInlineHtmlFromText(
    getMonitorHarvestLocationDisplayText(value, keys)
  );
}

function fitMonitorSummaryMetricText(root = document){
  const lines = Array.from(root.querySelectorAll?.(
    ".monitorSummaryGrid .monitorMetricCard .monitorMetricLine"
  ) || []);
  const visibleLines = lines.filter(line => line.clientWidth > 0 && line.clientHeight > 0);
  if(!visibleLines.length) return;
  const cards = visibleLines.map(line => line.closest(".monitorMetricCard"));
  const equalCardWidth = cards.reduce((total, card) => total + card.clientWidth, 0) / cards.length;
  const originalWidths = visibleLines.map(line => line.style.width);
  visibleLines.forEach((line, index) => {
    const card = cards[index];
    const horizontalInset = Math.max(0, card.clientWidth - line.clientWidth);
    line.style.width = Math.max(1, equalCardWidth - horizontalInset) + "px";
  });
  const minimumSize = 18;
  const maximumSize = 42;
  const fitsAtSize = size => {
    visibleLines.forEach(line => {
      line.style.fontSize = size + "px";
    });
    return visibleLines.every(line => {
      return line.scrollWidth <= line.clientWidth + 1 && line.scrollHeight <= line.clientHeight + 1;
    });
  };
  let finalSize = maximumSize;
  if(!fitsAtSize(maximumSize)){
    let lower = minimumSize;
    let upper = maximumSize;
    fitsAtSize(lower);
    for(let index = 0; index < 8; index++){
      const middle = (lower + upper) / 2;
      if(fitsAtSize(middle)){
        lower = middle;
      }else{
        upper = middle;
      }
    }
    finalSize = lower;
  }
  visibleLines.forEach((line, index) => {
    line.style.width = originalWidths[index];
    line.style.fontSize = finalSize.toFixed(2) + "px";
  });
}

function fitMonitorHarvestLocationText(root = document){
  const locations = Array.from(root.querySelectorAll?.(".monitorHarvestLocationText") || []);
  locations.forEach(location => {
    if(location.clientWidth <= 0) return;
    const fullText = String(location.dataset.fullLocation || "");
    const abbreviatedText = String(location.dataset.abbreviatedLocation || fullText);
    const panel = location.closest(".monitorHarvestPanel");
    location.style.transform = "none";
    const isPreview2Location = location.classList.contains("monitorV2LocationValue");
    const minimumSize = isPreview2Location ? 10 : 12;
    const maximumSize = isPreview2Location ? 36 : 28;
    location.innerHTML = getMonitorHarvestLocationInlineHtmlFromText(fullText);
    location.style.fontSize = maximumSize + "px";
    if(isPreview2Location){
      location.style.whiteSpace = "nowrap";
      if(location.scrollWidth <= location.clientWidth + 1) return;
      location.style.whiteSpace = "normal";
      const fitsPreview2AtSize = size => {
        location.style.fontSize = size + "px";
        return location.scrollWidth <= location.clientWidth + 1
          && location.scrollHeight <= location.clientHeight + 1;
      };
      if(fitsPreview2AtSize(maximumSize)) return;
      let lower = minimumSize;
      let upper = maximumSize;
      fitsPreview2AtSize(lower);
      for(let index = 0; index < 8; index++){
        const middle = (lower + upper) / 2;
        if(fitsPreview2AtSize(middle)) lower = middle;
        else upper = middle;
      }
      location.style.fontSize = Math.max(minimumSize, lower - .25).toFixed(2) + "px";
      return;
    }
    const fullTextFitsOneLine = location.scrollWidth <= location.clientWidth + 1;
    const useAbbreviatedText = !fullTextFitsOneLine && abbreviatedText !== fullText;
    if(useAbbreviatedText){
      location.innerHTML = getMonitorHarvestLocationInlineHtmlFromText(abbreviatedText);
    }
    panel?.classList.toggle("has-single-location-line", fullTextFitsOneLine);
    const fitsAtSize = size => {
      location.style.fontSize = size + "px";
      return location.scrollWidth <= location.clientWidth + 1;
    };

    if(fitsAtSize(maximumSize)) return;

    let lower = minimumSize;
    let upper = maximumSize;
    fitsAtSize(lower);
    for(let index = 0; index < 8; index++){
      const middle = (lower + upper) / 2;
      if(fitsAtSize(middle)){
        lower = middle;
      }else{
        upper = middle;
      }
    }
    location.style.fontSize = lower.toFixed(2) + "px";
    if(location.scrollWidth > location.clientWidth + 1){
      const scale = Math.max(0.001, (location.clientWidth - 1) / location.scrollWidth);
      location.style.transform = `scaleX(${scale})`;
    }
  });
}

function fitMonitorPreview2CaseText(root = document){
  const values = Array.from(root.querySelectorAll?.(".monitorV2CaseValue") || []);
  values.forEach(value => {
    if(value.clientWidth <= 0 || value.clientHeight <= 0) return;
    const minimumSize = 16;
    const maximumSize = 60;
    const fitsAtSize = size => {
      value.style.fontSize = size + "px";
      return value.scrollWidth <= value.clientWidth + 1 && value.scrollHeight <= value.clientHeight + 1;
    };
    if(fitsAtSize(maximumSize)) return;
    let lower = minimumSize;
    let upper = maximumSize;
    fitsAtSize(lower);
    for(let index = 0; index < 8; index++){
      const middle = (lower + upper) / 2;
      if(fitsAtSize(middle)) lower = middle;
      else upper = middle;
    }
    value.style.fontSize = Math.max(minimumSize, lower - .5).toFixed(2) + "px";
  });
}

function getMonitorPreview2IconHtml(kind){
  const paths = {
    seedling:'<path d="M16 27V13"></path><path d="M16 16C9.5 16 6 12.5 6 6c6.5 0 10 3.5 10 10Z"></path><path d="M16 20c6 0 9.5-3.2 10-9.2-6-.3-9.5 2.9-10 9.2Z"></path><path d="M9 27h14"></path>',
    harvest:'<path d="M5 12h22l-2 14H7L5 12Z"></path><path d="M3 12h26M10 12l2-6h8l2 6M11 16v6M16 16v6M21 16v6"></path>',
    placement:'<path d="M5 12h22l-2 14H7L5 12Z"></path><path d="M3 12h26M9 17h14M10 22h12M11 12V8h10v4"></path>',
    remaining:'<path d="M5 12h22l-2 14H7L5 12Z"></path><path d="M3 12h26M10 12l2-6h8l2 6"></path><path d="M16 16v6"></path>',
    location:'<path d="M24 13c0 6-8 14-8 14S8 19 8 13a8 8 0 1 1 16 0Z"></path><circle cx="16" cy="13" r="2.5"></circle>',
    map:'<path d="m4 7 7-3 10 4 7-3v20l-7 3-10-4-7 3Z"></path><path d="M11 4v20M21 8v20"></path>',
    memo:'<path d="M7 25 9 18 21 6a3.5 3.5 0 0 1 5 5L14 23l-7 2Z"></path><path d="m18.5 8.5 5 5M9 18l5 5"></path>'
  };
  return `<svg viewBox="0 0 32 32" aria-hidden="true">${paths[kind] || paths.harvest}</svg>`;
}

function getMonitorPreview2MetricCardHtml(label, value, fallbackUnit, kind){
  const displayValue = kind === "seedling" ? removeMonitorUnplantedSeedlingNote(value) : value;
  const parts = getMonitorMetricParts(displayValue, fallbackUnit);
  return `
    <section class="monitorPanel monitorV2MetricCard monitorV2MetricCard-${escapeHtml(kind)}">
      <div class="monitorV2MetricHeader">
        <div class="monitorV2MetricIcon">${getMonitorPreview2IconHtml(kind)}</div>
        <div class="monitorV2MetricLabel">${escapeHtml(label)}</div>
      </div>
      <div class="monitorV2MetricContent">
        <div class="monitorV2MetricValueLine">
          <strong class="monitorV2MetricValue">${escapeHtml(parts.value)}</strong>
          ${parts.unit ? `<span class="monitorV2MetricUnit">${escapeHtml(parts.unit)}</span>` : ""}
        </div>
        ${parts.note ? `<div class="monitorV2MetricNote">${escapeHtml(parts.note)}</div>` : ""}
      </div>
    </section>
  `;
}

function getMonitorPreview2CaseCardHtml(label, value, mode, kind){
  return `
    <section class="monitorPanel monitorV2MetricCard monitorV2CaseCard monitorV2MetricCard-${escapeHtml(kind)}">
      <div class="monitorV2MetricHeader">
        <div class="monitorV2MetricIcon">${getMonitorPreview2IconHtml(kind)}</div>
        <div class="monitorV2MetricLabel">${escapeHtml(label)}</div>
      </div>
      <div class="monitorV2MetricContent">
        <div class="monitorV2CaseValue">${getMonitorRemainingCasesHtml(value, [], mode, "preview2")}</div>
      </div>
    </section>
  `;
}

function buildMonitorPreview2DashboardHtml(normalized, fields){
  const today = getMonitorTodayDisplay();
  const updatedAt = getMonitorUpdatedAtDisplay(normalized.updatedAt);
  const memoSource = Array.isArray(normalized.memoItems)
    ? normalized.memoItems
    : String(normalized.memoText || "");
  const monitorHarvestKeys = normalized.harvestFillKeys || [];
  const fullHarvestLocationText = getMonitorHarvestLocationDisplayText(fields.harvestLocation, monitorHarvestKeys);
  const abbreviatedHarvestLocationText = getMonitorHarvestLocationAbbreviatedText(fields.harvestLocation, monitorHarvestKeys);
  const harvestMapClass = getMonitorSelectionBuildingCount(monitorHarvestKeys) === 3
    ? " has-three-buildings"
    : "";

  return `
    <div class="monitorV2Dashboard">
      <header class="monitorV2Header">
        <div class="monitorV2HeaderMeta">
          <time data-monitor-today datetime="${escapeHtml(today.dateTime)}">${escapeHtml(today.text)}</time>
          <span class="monitorV2HeaderDivider" aria-hidden="true"></span>
          <span class="monitorV2UpdatedAt">最終更新 ${escapeHtml(updatedAt || "--")}</span>
        </div>
      </header>
      <div class="monitorV2Content">
        <div class="monitorV2LeftColumn">
          <div class="monitorV2MetricGrid">
            ${getMonitorPreview2MetricCardHtml("苗数", fields.seedling, "枚", "seedling")}
            ${getMonitorPreview2MetricCardHtml("収穫数", fields.cases, "ケース", "harvest")}
            ${getMonitorPreview2CaseCardHtml("ケース配置", fields.remainingCases, "placement", "placement")}
            ${getMonitorPreview2CaseCardHtml("残すケース", fields.remainingCases, "remaining", "remaining")}
          </div>
          <section class="monitorPanel monitorV2LocationCard">
            <div class="monitorV2LocationIcon">${getMonitorPreview2IconHtml("location")}</div>
            <div class="monitorV2LocationContent">
              <div class="monitorV2LocationLabel">収穫場所</div>
              <div class="monitorV2LocationValue monitorHarvestLocationText" data-full-location="${escapeHtml(fullHarvestLocationText)}" data-abbreviated-location="${escapeHtml(abbreviatedHarvestLocationText)}">${getMonitorHarvestLocationInlineHtmlFromText(fullHarvestLocationText)}</div>
            </div>
          </section>
        </div>
        <div class="monitorV2RightColumn">
          <section class="monitorPanel monitorV2MapPanel">
            <div class="monitorV2PanelHeader">
              <div class="monitorV2PanelTitle"><span class="monitorV2PanelIcon">${getMonitorPreview2IconHtml("map")}</span><span>収穫場所（配置図）</span></div>
              <div class="monitorMapLegend" aria-label="収穫場所の凡例">
                <span class="monitorMapLegendItem"><span class="monitorMapLegendChip selected"></span>今回収穫</span>
                <span class="monitorMapLegendItem"><span class="monitorMapLegendChip recorded"></span>収穫済み</span>
              </div>
            </div>
            <div class="monitorHarvestMap${harvestMapClass}">${getMonitorSelectionMapHtml(monitorHarvestKeys, fields.remainingCases)}</div>
          </section>
          <section class="monitorPanel monitorV2MemoPanel">
            <div class="monitorV2PanelHeader">
              <div class="monitorV2PanelTitle"><span class="monitorV2PanelIcon">${getMonitorPreview2IconHtml("memo")}</span><span>メモ</span></div>
            </div>
            <div class="monitorV2MemoText">${getMonitorMemoHtml(memoSource)}</div>
          </section>
        </div>
      </div>
    </div>
  `;
}

function buildMonitorDashboardHtml(content, options = {}){
  const normalized = normalizeRemoteMonitorContent(content || {}) || content || {};
  const fields = parseMonitorInstructionFields(normalized.instructionText || "");
  const previewLayout = normalizeMonitorPreviewLayout(
    options.previewLayout || normalized.previewLayout || fields.previewLayout
  );
  if(previewLayout === "preview2"){
    return buildMonitorPreview2DashboardHtml(normalized, fields);
  }
  const today = getMonitorTodayDisplay();
  const updatedAt = getMonitorUpdatedAtDisplay(normalized.updatedAt);
  const memoSource = Array.isArray(normalized.memoItems)
    ? normalized.memoItems
    : String(normalized.memoText || "");
  const monitorHarvestKeys = normalized.harvestFillKeys || [];
  const fullHarvestLocationText = getMonitorHarvestLocationDisplayText(fields.harvestLocation, monitorHarvestKeys);
  const abbreviatedHarvestLocationText = getMonitorHarvestLocationAbbreviatedText(fields.harvestLocation, monitorHarvestKeys);
  const harvestMapClass = getMonitorSelectionBuildingCount(monitorHarvestKeys) === 3
    ? " has-three-buildings"
    : "";

  return `
    <main class="monitorDashboardMain">
      <div class="monitorTodayBar">
        <div>
          <time class="monitorTodayDate" data-monitor-today datetime="${escapeHtml(today.dateTime)}">${escapeHtml(today.text)}</time>
        </div>
        <div class="monitorUpdatedAt"><span>最終更新</span><span class="monitorUpdatedAtValue">${escapeHtml(updatedAt || "--")}</span></div>
      </div>
      <div class="monitorSummaryGrid">
        ${getMonitorMetricCardHtml("苗", fields.seedling, "枚")}
        ${getMonitorMetricCardHtml("収穫", fields.cases, "ケース")}
        <section class="monitorPanel monitorMetricCard monitorRemainingCard">
          <div class="monitorMetricLine monitorCaseSummaryLine">
            <div class="monitorMetricLabel monitorCaseSummaryIcon" aria-label="残すケース">
              <svg class="monitorMetricLabelIcon is-remaining-case" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3.5 10h24l-1.6 16H5.1L3.5 10Z" fill="currentColor" fill-opacity=".12"></path>
                <path d="M2.5 10h26M8 14v8M13 14v8M18 14v8M5 18h21M5 22h21"></path>
                <path d="M20.5 3h8v10.5l-4-2.4-4 2.4V3Z" fill="currentColor" stroke="currentColor"></path>
              </svg>
            </div>
            <div class="monitorRemainingList">${getMonitorRemainingCasesHtml(fields.remainingCases, normalized.harvestFillKeys || [], "remaining")}</div>
          </div>
        </section>
      </div>
      <section class="monitorPanel monitorHarvestPanel">
        <div class="monitorPanelHeader">
          <div class="monitorHarvestTitleGroup">
            <div class="monitorSectionTitle">収穫場所と配置コンテナ数</div>
            <div class="monitorHarvestLocationText" data-full-location="${escapeHtml(fullHarvestLocationText)}" data-abbreviated-location="${escapeHtml(abbreviatedHarvestLocationText)}">${getMonitorHarvestLocationInlineHtmlFromText(fullHarvestLocationText)}</div>
          </div>
          <div class="monitorMapLegend" aria-label="収穫場所の凡例">
            <span class="monitorMapLegendItem"><span class="monitorMapLegendChip selected"></span>今回収穫</span>
            <span class="monitorMapLegendItem"><span class="monitorMapLegendChip recorded"></span>収穫済み</span>
          </div>
        </div>
        <div class="monitorHarvestMap${harvestMapClass}">${getMonitorSelectionMapHtml(monitorHarvestKeys, fields.remainingCases)}</div>
      </section>
    </main>
    <aside class="monitorPanel monitorMemoPanel">
      <div class="monitorPanelHeader">
        <div class="monitorSectionTitle">メモ</div>
      </div>
      <div class="monitorMemoText">${getMonitorMemoHtml(memoSource)}</div>
    </aside>
  `;
}

function renderMonitorMode(){
  const body = document.getElementById("monitorModeBody");
  if(!body) return;
  const remote = monitorRemoteContent && monitorRemoteContent.enabled ? monitorRemoteContent : null;
  if(monitorModeLoading){
    body.innerHTML = `<div class="monitorDashboardLoading">モニター内容を読み込み中です</div>`;
    return;
  }
  const content = remote || {
    ...buildCurrentMonitorRemoteContent(),
    enabled:true
  };
  body.innerHTML = buildMonitorDashboardHtml(content);
  updateMonitorTodayDisplays();
  requestAnimationFrame(() => {
    fitMonitorSummaryMetricText(body);
    fitMonitorHarvestLocationText(body);
    fitMonitorPreview2CaseText(body);
  });
}
