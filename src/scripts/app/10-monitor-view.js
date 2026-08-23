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
    if(line.startsWith("収穫場所: ") || line.startsWith("残すケース: ")){
      const label = line.startsWith("収穫場所: ") ? "収穫場所: " : "残すケース: ";
      const detailLines = [line.slice(label.length)];
      const isRemainingCaseLine = label === "残すケース: ";
      index++;
      while(index < lines.length && lines[index] && (
        isRemainingCaseLine
          ? !/^(苗:|収穫ケース数:|収穫場所:|残すケース:)\s*/.test(lines[index] || "")
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

function getMonitorSelectionMapHtml(keysOverride){
  const sourceKeys = Array.isArray(keysOverride) ? keysOverride : harvestFillKeys;
  if(!sourceKeys.length){
    return `<div class="monitorEmpty">収穫場所が未選択です。</div>`;
  }
  const recordedSet = getRecordedPalletSet();

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
      return `
        <div class="monitorBuildingBlock" role="img" aria-label="${building}号棟の収穫場所">
          <div class="monitorBuildingTitle">${building}号棟</div>
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

function getMonitorMetricCardHtml(label, rawValue, unit){
  const parts = getMonitorMetricParts(rawValue, unit);
  let labelIcon = "";
  if(label === "苗枚数"){
    labelIcon = `
    <svg class="monitorMetricLabelIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 21v-9"></path>
      <path d="M12 13C7.8 13 5 10.6 5 6.5c4.2 0 7 2.4 7 6.5Z"></path>
      <path d="M12 16c0-4.5 2.9-7.5 7.5-7.5 0 4.5-2.9 7.5-7.5 7.5Z"></path>
      <path d="M8.5 21h7"></path>
    </svg>
    `;
  }else if(label === "収穫ケース数"){
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
      <div class="monitorMetricLabel">${labelIcon}<span>${escapeHtml(label)}</span></div>
      <div class="monitorMetricLine">
        <strong class="monitorMetricValue">${escapeHtml(parts.value)}</strong>
        ${parts.unit ? `<span class="monitorMetricUnit">${escapeHtml(parts.unit)}</span>` : ""}
      </div>
      ${parts.note ? `<div class="monitorMetricNote" title="${escapeHtml(parts.note)}">${escapeHtml(parts.note)}</div>` : ""}
    </section>
  `;
}

function getMonitorRemainingCasesHtml(value){
  const lines = String(value || "")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
  const safeLines = lines.length ? lines : ["なし"];
  return safeLines.map(line => {
    const shortageClass = line.includes("不足") ? " is-shortage" : "";
    return `<div class="monitorRemainingLine${shortageClass}">${escapeHtml(line)}</div>`;
  }).join("");
}

function getMonitorHarvestLocationInlineHtml(value){
  const text = String(value || "").trim();
  if(!text || text === "-") return "未選択";
  return escapeHtml(text)
    .replace(/\n+/g, " / ")
    .replace(/(後ろ|前|\d+\s*ピン|とる|取る|残す)/g, '<span class="monitorLocationHighlight">$1</span>');
}

function fitMonitorRemainingCasesText(root = document){
  const lists = Array.from(root.querySelectorAll?.(".monitorRemainingList") || []);
  lists.forEach(list => {
    if(list.clientWidth <= 0 || list.clientHeight <= 0) return;
    const minimumSize = 5;
    const maximumSize = 30;
    const fitsAtSize = size => {
      list.style.fontSize = size + "px";
      return list.scrollHeight <= list.clientHeight + 1 && list.scrollWidth <= list.clientWidth + 1;
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
    list.style.fontSize = lower.toFixed(2) + "px";
  });
}

function fitMonitorHarvestLocationText(root = document){
  const locations = Array.from(root.querySelectorAll?.(".monitorHarvestLocationText") || []);
  locations.forEach(location => {
    if(location.clientWidth <= 0) return;
    location.style.transform = "none";
    const minimumSize = 12;
    const maximumSize = 28;
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

function buildMonitorDashboardHtml(content){
  const normalized = normalizeRemoteMonitorContent(content || {}) || content || {};
  const fields = parseMonitorInstructionFields(normalized.instructionText || "");
  const today = getMonitorTodayDisplay();
  const updatedAt = getMonitorUpdatedAtDisplay(normalized.updatedAt);
  const memoSource = Array.isArray(normalized.memoItems)
    ? normalized.memoItems
    : String(normalized.memoText || "");

  return `
    <main class="monitorDashboardMain">
      <div class="monitorTodayBar">
        <div>
          <time class="monitorTodayDate" data-monitor-today datetime="${escapeHtml(today.dateTime)}">${escapeHtml(today.text)}</time>
        </div>
        ${updatedAt ? `<div class="monitorUpdatedAt"><span>最終更新</span><span class="monitorUpdatedAtValue">${escapeHtml(updatedAt)}</span></div>` : ""}
      </div>
      <div class="monitorSummaryGrid">
        ${getMonitorMetricCardHtml("苗枚数", fields.seedling, "枚")}
        ${getMonitorMetricCardHtml("収穫ケース数", fields.cases, "ケース")}
        <section class="monitorPanel monitorMetricCard monitorRemainingCard">
          <div class="monitorMetricLabel">
            <svg class="monitorMetricLabelIcon is-remaining-case" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3.5 10h24l-1.6 16H5.1L3.5 10Z" fill="currentColor" fill-opacity=".12"></path>
              <path d="M2.5 10h26M8 14v8M13 14v8M18 14v8M5 18h21M5 22h21"></path>
              <path d="M20.5 3h8v10.5l-4-2.4-4 2.4V3Z" fill="currentColor" stroke="currentColor"></path>
            </svg>
            <span>残すケース</span>
          </div>
          <div class="monitorRemainingList">${getMonitorRemainingCasesHtml(fields.remainingCases)}</div>
        </section>
      </div>
      <section class="monitorPanel monitorHarvestPanel">
        <div class="monitorPanelHeader">
          <div class="monitorHarvestTitleGroup">
            <div class="monitorSectionTitle">収穫場所</div>
            <div class="monitorHarvestLocationText">${getMonitorHarvestLocationInlineHtml(fields.harvestLocation)}</div>
          </div>
          <div class="monitorMapLegend" aria-label="収穫場所の凡例">
            <span class="monitorMapLegendItem"><span class="monitorMapLegendChip selected"></span>今回収穫</span>
            <span class="monitorMapLegendItem"><span class="monitorMapLegendChip recorded"></span>収穫済み</span>
          </div>
        </div>
        <div class="monitorHarvestMap">${getMonitorSelectionMapHtml(normalized.harvestFillKeys || [])}</div>
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
    fitMonitorRemainingCasesText(body);
    fitMonitorHarvestLocationText(body);
  });
}
