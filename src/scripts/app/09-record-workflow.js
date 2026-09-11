function scrollToRecordActiveStage(options = {}){
  const targetId = recordSelectionMode === "planting" ? "recordPlantingStageSection" : "recordSaveCard";
  const target = document.getElementById(targetId);
  if(!target) return;
  const headerOffset = getAppTopChromeOffset();
  const top = target.getBoundingClientRect().top + window.pageYOffset - headerOffset;
  window.scrollTo({ top: Math.max(0, top), behavior: getWorkflowScrollBehavior(options.behavior || "auto") });
}

function shouldUseRecordHarvestViewportLayout(){
  return activeAppTab === "record"
    && window.innerWidth <= 759
    && window.innerHeight >= 760
    && recordSelectionMode === "harvest"
    && recordViewMode === "entry"
    && normalizeRecordHarvestStage(recordHarvestStage) === "location"
    && !recordHarvestPrimaryInputsExpanded
    && document.getElementById("recordBuildingAddChooser")?.hidden !== false;
}

function applyRecordHarvestViewportLayout(){
  const card = document.getElementById("recordSaveCard");
  const actionBar = document.getElementById("recordHarvestFixedNav");
  if(!card) return false;
  const shouldFit = shouldUseRecordHarvestViewportLayout()
    && !!actionBar
    && !actionBar.hidden
    && card.getClientRects().length > 0;
  card.classList.toggle("recordHarvestViewportLayout", shouldFit);
  if(!shouldFit){
    card.style.removeProperty("--record-harvest-viewport-height");
    scheduleMainTabViewportScrollLock();
    return false;
  }

  const scrollTop = window.pageYOffset || 0;
  const cardTopAtPageStart = card.getBoundingClientRect().top + scrollTop;
  const availableHeight = Math.floor(actionBar.getBoundingClientRect().top - cardTopAtPageStart);
  if(availableHeight > 0){
    card.style.setProperty("--record-harvest-viewport-height", `${availableHeight}px`);
  }
  scheduleMainTabViewportScrollLock();
  return availableHeight > 0;
}

function scheduleRecordHarvestViewportLayout(){
  if(scheduleRecordHarvestViewportLayout.frameId){
    cancelAnimationFrame(scheduleRecordHarvestViewportLayout.frameId);
  }
  scheduleRecordHarvestViewportLayout.frameId = requestAnimationFrame(() => {
    scheduleRecordHarvestViewportLayout.frameId = requestAnimationFrame(() => {
      scheduleRecordHarvestViewportLayout.frameId = 0;
      applyRecordHarvestViewportLayout();
    });
  });
}

function jumpToRecordPlantingFlowPanel(){
  const panel = document.getElementById("recordPlantingFlowPanel");
  if(!panel || panel.hidden) return;
  const top = panel.getBoundingClientRect().top + window.pageYOffset - getAppTopChromeOffset();
  window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
}

function switchToRecordSaveCard(options = {}){
  if(switchTab("record") === false) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrollToRecordSaveCard();
      if(options.focus) focusWorkflowTarget("recordSaveCard");
    });
  });
}




function getPlantingCountForPallet(bed, number){
  const normalizedSettings = getNormalizedBedCalculationSettings();
  const profile = normalizedSettings.beds[bed]?.planting;
  if(!profile) return normalizedSettings.defaultPlantingCount;
  return Number(number) <= profile.frontCount ? profile.front : profile.back;
}

function normalizePlantingCountPreset(value, fallback = 20){
  const fallbackNumber = ALLOWED_YIELDS.includes(Number(fallback)) ? Number(fallback) : 20;
  const number = Number(value);
  return ALLOWED_YIELDS.includes(number) ? number : fallbackNumber;
}

function normalizePlantingCountsByPallet(value, allowedKeys = null){
  if(!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowedSet = Array.isArray(allowedKeys)
    ? new Set(allowedKeys.map(key => String(key || "")))
    : null;
  const normalized = {};
  Object.entries(value).forEach(([rawKey, rawCount]) => {
    const key = String(rawKey || "");
    if(!isValidPalletKeyString(key) || (allowedSet && !allowedSet.has(key))) return;
    const count = Number(rawCount);
    if(!ALLOWED_YIELDS.includes(count)) return;
    normalized[key] = count;
  });
  return normalized;
}

function applyHistoricalPlantingCountBackfill(plantingDate, keys, countsByPallet){
  const normalized = normalizePlantingCountsByPallet(countsByPallet, keys);
  const dateText = String(plantingDate || "").trim();
  if(dateText < PLANTING_COUNT_BACKFILL_START_DATE || dateText > PLANTING_COUNT_BACKFILL_END_DATE){
    return normalized;
  }
  (Array.isArray(keys) ? keys : []).forEach(key => {
    if(!isValidPalletKeyString(key)) return;
    if(ALLOWED_YIELDS.includes(Number(normalized[key]))) return;
    normalized[key] = PLANTING_COUNT_BACKFILL_VALUE;
  });
  return normalized;
}

function getConfiguredPlantingCountForKey(key){
  const pallet = parsePalletKey(String(key || ""));
  if(!bedOrder.includes(pallet.bed) || !Number.isFinite(pallet.number)){
    return normalizePlantingCountPreset(settings?.defaultPlantingCount);
  }
  return normalizePlantingCountPreset(getPlantingCountForPallet(pallet.bed, pallet.number));
}

function getConfiguredPlantingCountForFirstKey(keys){
  const firstKey = Array.isArray(keys) ? keys.find(isValidPalletKeyString) : null;
  return firstKey ? getConfiguredPlantingCountForKey(firstKey) : normalizePlantingCountPreset(settings?.defaultPlantingCount);
}

function getPlantingCountForSelectedKey(key, countsByPallet = recordPlantingCountsByPallet){
  const explicit = Number(countsByPallet?.[key]);
  return ALLOWED_YIELDS.includes(explicit) ? explicit : getConfiguredPlantingCountForKey(key);
}

function getRecordPlantingInitialCountForKey(key){
  return isRecordPlantingFlowActive() && recordPlantingFlowStage === "location"
    ? getConfiguredPlantingCountForKey(key)
    : recordPlantingCountPreset;
}

function buildPlantingCountsByPalletForKeys(keys, countsByPallet = recordPlantingCountsByPallet){
  const result = {};
  [...new Set(Array.isArray(keys) ? keys : [])]
    .filter(isValidPalletKeyString)
    .sort((a, b) => getOrderIndexFromKey(a) - getOrderIndexFromKey(b))
    .forEach(key => {
      result[key] = getPlantingCountForSelectedKey(key, countsByPallet);
    });
  return result;
}

function ensureRecordPlantingCountsForKeys(keys, options = {}){
  const selectedKeys = Array.isArray(keys) ? keys : [];
  selectedKeys.forEach(key => {
    if(ALLOWED_YIELDS.includes(Number(recordPlantingCountsByPallet[key]))) return;
    recordPlantingCountsByPallet[key] = options.useConfiguredCount
      ? getConfiguredPlantingCountForKey(key)
      : recordPlantingCountPreset;
  });
  recordPlantingCountsByPallet = normalizePlantingCountsByPallet(recordPlantingCountsByPallet, selectedKeys);
}

function setRecordPlantingCountForKey(key, count = recordPlantingCountPreset){
  if(!isValidPalletKeyString(key)) return;
  recordPlantingCountsByPallet[key] = normalizePlantingCountPreset(count, recordPlantingCountPreset);
}

function removeRecordPlantingCountForKey(key){
  if(Object.prototype.hasOwnProperty.call(recordPlantingCountsByPallet, key)){
    delete recordPlantingCountsByPallet[key];
  }
}

function getRecordPlantingCountDistribution(keys = harvestFillKeys){
  const distribution = { 12: 0, 16: 0, 20: 0 };
  (Array.isArray(keys) ? keys : []).forEach(key => {
    const count = getPlantingCountForSelectedKey(key);
    if(Object.prototype.hasOwnProperty.call(distribution, count)) distribution[count]++;
  });
  return distribution;
}

const RECORD_PLANTING_FLOW_STAGES = ["building", "location", "count", "quality"];
const RECORD_PLANTING_FLOW_QUALITY_TAGS = ["large", "medium", "small", "elongated"];

function isRecordPlantingFlowActive(){
  return recordSelectionMode === "planting" && recordPlantingFlowEnabled;
}

function initializeRecordPlantingFlow(){
  recordPlantingFlowEnabled = true;
  recordPlantingFlowStage = "building";
  recordPlantingFlowBuilding = null;
  recordPlantingCompletedBuildings = [];
  recordPlantingQualityPreset = "medium";
}

function resetRecordPlantingFlow(){
  recordPlantingFlowEnabled = false;
  recordPlantingFlowStage = "building";
  recordPlantingFlowBuilding = null;
  recordPlantingCompletedBuildings = [];
  recordPlantingQualityPreset = "medium";
}

function getRecordPlantingFlowKeys(building = recordPlantingFlowBuilding){
  const normalizedBuilding = Number(building);
  if(!BUILDINGS.includes(normalizedBuilding)) return [];
  return harvestFillKeys.filter(key => parsePalletKey(key).building === normalizedBuilding);
}

function getRecordPlantingFlowCandidateBuildings(){
  const allowedSet = getPlantingAllowedPalletSet({ fast: true });
  return getRecordMapBuildings(allowedSet);
}

function getRecordPlantingFlowQualityByPallet(){
  return normalizeQualityMemoByPallet(plantingRecordDraft?.qualityMemoByPallet, harvestFillKeys);
}

function getRecordPlantingQualityTagForKey(key){
  const memo = normalizeOptionalQualityMemo(getRecordPlantingFlowQualityByPallet()[key]);
  return memo?.tags?.find(tag => RECORD_PLANTING_FLOW_QUALITY_TAGS.includes(tag)) || "";
}

function getRecordPlantingDefaultQualityTag(){
  const memo = normalizeOptionalQualityMemo(plantingRecordDraft?.qualityMemo);
  return memo?.tags?.find(tag => RECORD_PLANTING_FLOW_QUALITY_TAGS.includes(tag)) || "medium";
}

function ensurePlantingDraftForFlow(){
  if(getPlantingRecordDraftForRecord(getActivePlantingRecord())) return true;
  capturePlantingRecordDraft();
  return !!getPlantingRecordDraftForRecord(getActivePlantingRecord());
}

function setRecordPlantingQualityForKey(key, tag = recordPlantingQualityPreset){
  const normalizedTag = normalizeQualityTag(tag);
  if(!isValidPalletKeyString(key) || !RECORD_PLANTING_FLOW_QUALITY_TAGS.includes(normalizedTag)) return false;
  if(!ensurePlantingDraftForFlow()) return false;
  const qualityByPallet = getRecordPlantingFlowQualityByPallet();
  qualityByPallet[key] = { tags: [normalizedTag], other: "" };
  plantingRecordDraft.qualityMemoByPallet = qualityByPallet;
  return true;
}

function removeRecordPlantingQualityForKey(key){
  if(!plantingRecordDraft?.qualityMemoByPallet) return;
  delete plantingRecordDraft.qualityMemoByPallet[key];
}

function markRecordPlantingFlowBuildingDirty(building){
  const normalizedBuilding = Number(building);
  recordPlantingCompletedBuildings = recordPlantingCompletedBuildings
    .filter(item => Number(item) !== normalizedBuilding);
}

function selectRecordPlantingFlowBuilding(building){
  if(!isRecordPlantingFlowActive()) return;
  const normalizedBuilding = Number(building);
  if(!getRecordPlantingFlowCandidateBuildings().includes(normalizedBuilding)) return;
  recordPlantingFlowBuilding = normalizedBuilding;
  recordPlantingFlowStage = "location";
  currentBuilding = normalizedBuilding;
  updateBuildingLabel();
  drawBeds();
  drawRecordBeds();
  jumpToRecordPlantingFlowPanel();
  scheduleHarvestStateSave();
}

function moveRecordPlantingFlowToStage(stage){
  if(!isRecordPlantingFlowActive()) return;
  const normalizedStage = String(stage || "");
  if(!RECORD_PLANTING_FLOW_STAGES.includes(normalizedStage)) return;
  const previousStage = recordPlantingFlowStage;
  if(normalizedStage === "building"){
    recordPlantingFlowStage = "building";
    recordPlantingFlowBuilding = null;
  }else{
    if(!BUILDINGS.includes(Number(recordPlantingFlowBuilding))){
      showToast("先に棟を選択してください");
      return;
    }
    if(normalizedStage !== "location" && !getRecordPlantingFlowKeys().length){
      showToast("先に苗植えした場所を選択してください");
      return;
    }
    recordPlantingFlowStage = normalizedStage;
    if(previousStage === "location" && normalizedStage === "count" && !editingPlantingEventId){
      recordPlantingCountPreset = getConfiguredPlantingCountForFirstKey(
        getRecordPlantingFlowKeys()
      );
    }
  }
  drawRecordBeds();
  refreshBedDetailWindow();
  jumpToRecordPlantingFlowPanel();
  scheduleHarvestStateSave();
}

function setRecordPlantingQualityPreset(tag){
  const normalizedTag = normalizeQualityTag(tag);
  if(!isRecordPlantingFlowActive() || recordPlantingFlowStage !== "quality"
    || !RECORD_PLANTING_FLOW_QUALITY_TAGS.includes(normalizedTag)) return;
  recordPlantingQualityPreset = normalizedTag;
  renderRecordPlantingFlow();
  scheduleHarvestStateSave();
}

function applyRecordPlantingQualityPresetToBuilding(){
  if(!isRecordPlantingFlowActive() || recordPlantingFlowStage !== "quality") return;
  const keys = getRecordPlantingFlowKeys();
  if(!keys.length){
    showToast("品質を設定する場所がありません");
    return;
  }
  if(!ensurePlantingDraftForFlow()) return;
  const qualityByPallet = getRecordPlantingFlowQualityByPallet();
  keys.forEach(key => {
    qualityByPallet[key] = { tags: [recordPlantingQualityPreset], other: "" };
  });
  plantingRecordDraft.qualityMemoByPallet = qualityByPallet;
  markRecordPlantingFlowBuildingDirty(recordPlantingFlowBuilding);
  drawRecordBeds();
  refreshBedDetailWindow();
  scheduleHarvestStateSave();
  showToast(`${recordPlantingFlowBuilding}号棟を${getQualityTagLabel(recordPlantingQualityPreset)}に設定しました`);
}

function finishRecordPlantingFlowBuilding(){
  if(!isRecordPlantingFlowActive() || recordPlantingFlowStage !== "quality") return;
  const building = Number(recordPlantingFlowBuilding);
  if(!getRecordPlantingFlowKeys(building).length){
    showToast("苗植えした場所を選択してください");
    return;
  }
  if(!ensurePlantingDraftForFlow()) return;
  const qualityByPallet = getRecordPlantingFlowQualityByPallet();
  const defaultQualityTag = getRecordPlantingDefaultQualityTag();
  getRecordPlantingFlowKeys(building).forEach(key => {
    if(!Object.prototype.hasOwnProperty.call(qualityByPallet, key)){
      qualityByPallet[key] = { tags: [defaultQualityTag], other: "" };
    }
  });
  plantingRecordDraft.qualityMemoByPallet = qualityByPallet;
  recordPlantingCompletedBuildings = [...new Set([...recordPlantingCompletedBuildings, building])];
  recordPlantingFlowStage = "building";
  recordPlantingFlowBuilding = null;
  closeBedDetailWindow();
  drawRecordBeds();
  jumpToRecordPlantingFlowPanel();
  scheduleHarvestStateSave();
  showToast(`${building}号棟の設定を完了しました`);
}

function applyRecordPlantingFlowAssignment(key, options = {}){
  if(!isRecordPlantingFlowActive() || !["count", "quality"].includes(recordPlantingFlowStage)) return null;
  const pallet = parsePalletKey(key);
  const notify = message => {
    if(options.silent) return;
    if(options.drag) showPalletDragToast(message);
    else showToast(message);
  };
  if(pallet.building !== Number(recordPlantingFlowBuilding) || !harvestFillKeys.includes(key)){
    notify("場所選択で選んだ場所だけ設定できます");
    return false;
  }
  if(recordPlantingFlowStage === "count"){
    if(getPlantingCountForSelectedKey(key) === recordPlantingCountPreset) return false;
    const nextCounts = { ...recordPlantingCountsByPallet, [key]: recordPlantingCountPreset };
    if(!canPlantSeedlingKeysWithinCapacity(harvestFillKeys, getActivePlantingRecord(), nextCounts)){
      notify(getPlantingCapacityExceededMessage());
      return false;
    }
    setRecordPlantingCountForKey(key);
  }else{
    if(getRecordPlantingQualityTagForKey(key) === recordPlantingQualityPreset) return false;
    if(!setRecordPlantingQualityForKey(key)) return false;
  }
  markRecordPlantingFlowBuildingDirty(pallet.building);
  return true;
}

function getIncompleteRecordPlantingFlowBuildings(){
  if(!isRecordPlantingFlowActive()) return [];
  const selectedBuildings = [...new Set(harvestFillKeys.map(key => parsePalletKey(key).building))]
    .filter(building => BUILDINGS.includes(building));
  const completedSet = new Set(recordPlantingCompletedBuildings.map(Number));
  return selectedBuildings.filter(building => !completedSet.has(building));
}

function renderRecordPlantingFlow(){
  const panel = document.getElementById("recordPlantingFlowPanel");
  const footer = document.getElementById("recordPlantingFlowFooter");
  const legend = document.getElementById("recordPlantingLegend");
  const adjustBox = document.querySelector(".recordHarvestAdjustBox");
  if(!panel || !footer) return;
  const active = isRecordPlantingFlowActive();
  updateRecordPlantingCountPresetUi();
  panel.hidden = !active;
  footer.hidden = !active || recordPlantingFlowStage === "building";
  if(legend){
    legend.hidden = active
      ? recordPlantingFlowStage === "building"
      : recordSelectionMode !== "planting";
    if(active && recordPlantingFlowStage !== "building"){
      legend.innerHTML = recordPlantingFlowStage === "quality"
        ? `
          <span class="recordLegendItem"><span class="recordLegendSwatch qualityLarge"></span>大きい</span>
          <span class="recordLegendItem"><span class="recordLegendSwatch qualityMedium"></span>中</span>
          <span class="recordLegendItem"><span class="recordLegendSwatch qualitySmall"></span>小さい</span>
          <span class="recordLegendItem"><span class="recordLegendSwatch qualityElongated"></span>徒長</span>
          <span class="recordLegendItem"><span class="recordLegendSwatch unavailable"></span>選択不可</span>
        `
        : (recordPlantingFlowStage === "count"
          ? `
            <span class="recordLegendItem"><span class="recordLegendSwatch count12"></span>12植え</span>
            <span class="recordLegendItem"><span class="recordLegendSwatch count16"></span>16植え</span>
            <span class="recordLegendItem"><span class="recordLegendSwatch count20"></span>20植え</span>
            <span class="recordLegendItem"><span class="recordLegendSwatch unavailable"></span>選択不可</span>
          `
          : `
            <span class="recordLegendItem"><span class="recordLegendSwatch selectable"></span>選択可能</span>
            <span class="recordLegendItem"><span class="recordLegendSwatch selected"></span>苗植え場所</span>
            <span class="recordLegendItem"><span class="recordLegendSwatch unavailable"></span>選択不可</span>
          `);
    }
  }
  RECORD_PLANTING_FLOW_STAGES.forEach(stage => adjustBox?.classList.toggle(`recordPlantingFlowStage-${stage}`, active && recordPlantingFlowStage === stage));
  if(!active){
    panel.innerHTML = "";
    footer.innerHTML = "";
    return;
  }

  const currentIndex = RECORD_PLANTING_FLOW_STAGES.indexOf(recordPlantingFlowStage);
  const currentStep = currentIndex + 1;
  const stageInstructions = {
    building: "苗植えする棟を選択してください",
    location: "実際に苗植えした場所を選択してください",
    count: "植え付け数を選び、設定する場所を選択してください",
    quality: "品質を選び、設定する場所を選択してください"
  };
  const currentInstruction = stageInstructions[recordPlantingFlowStage];
  const progressPercent = Math.round(currentStep / RECORD_PLANTING_FLOW_STAGES.length * 100);
  const navigationHtml = `
    <div class="recordPlantingFlowNavigation" aria-label="苗植え記録の現在の作業">
      <div class="recordPlantingFlowProgressMeta">
        <span>苗植え記録</span>
        <span>工程 ${currentStep} / ${RECORD_PLANTING_FLOW_STAGES.length}</span>
      </div>
      <div class="recordPlantingFlowGauge" role="progressbar" aria-valuemin="1" aria-valuemax="${RECORD_PLANTING_FLOW_STAGES.length}"
        aria-valuenow="${currentStep}" aria-valuetext="${escapeHtml(currentInstruction)}">
        <span class="recordPlantingFlowGaugeValue" style="width:${progressPercent}%"></span>
      </div>
      <div class="recordPlantingFlowInstruction">${escapeHtml(currentInstruction)}</div>
    </div>
  `;

  let bodyHtml = "";
  if(recordPlantingFlowStage === "building"){
    const candidates = getRecordPlantingFlowCandidateBuildings();
    const completedSet = new Set(recordPlantingCompletedBuildings.map(Number));
    const buttons = candidates.map(building => {
      const selectedCount = getRecordPlantingFlowKeys(building).length;
      const completed = completedSet.has(building);
      return `<button type="button" class="recordPlantingFlowBuildingBtn${completed ? " is-complete" : ""}"
        data-ui-click="selectRecordPlantingFlowBuilding" data-ui-number="${building}">
        <strong>${building}号棟</strong><span>${selectedCount}枚${completed ? " ・ 完了" : ""}</span>
      </button>`;
    }).join("");
    bodyHtml = `
      <div class="recordPlantingFlowHint">棟ごとに、場所・植え付け数・品質を設定します</div>
      <div class="recordPlantingFlowBuildings">${buttons || `<div class="recordPlantingFlowEmpty">苗植えできる棟がありません</div>`}</div>
    `;
  }else{
    const building = Number(recordPlantingFlowBuilding);
    const selectedCount = getRecordPlantingFlowKeys(building).length;
    const hints = {
      location: "ベッドをタップし、実際に苗植えしたパレットを選びます",
      count: "12植え・16植え・20植えを選び、変更する場所をタップします",
      quality: `品質を選び、その品質の場所をタップします。未設定は「${getQualityTagLabel(getRecordPlantingDefaultQualityTag())}」で保存します`
    };
    const qualityHtml = recordPlantingFlowStage === "quality" ? `
      <div class="recordPlantingFlowQualityButtons" role="group" aria-label="苗の品質">
        ${RECORD_PLANTING_FLOW_QUALITY_TAGS.map(tag => `<button type="button" class="recordPlantingFlowQualityBtn quality-${tag}${recordPlantingQualityPreset === tag ? " is-active" : ""}"
          data-ui-click="setRecordPlantingQualityPreset" data-ui-arg="${tag}" aria-pressed="${recordPlantingQualityPreset === tag}">${getQualityTagLabel(tag)}</button>`).join("")}
      </div>
      <button type="button" class="recordPlantingFlowApplyAllBtn" data-ui-click="applyRecordPlantingQualityPresetToBuilding">
        ${building}号棟の選択場所すべてに適用
      </button>
    ` : "";
    bodyHtml = `
      <div class="recordPlantingFlowStageHeader"><strong>${building}号棟</strong><span>${selectedCount}枚選択</span></div>
      <div class="recordPlantingFlowHint">${hints[recordPlantingFlowStage]}</div>
      ${qualityHtml}
    `;
  }
  panel.innerHTML = `${navigationHtml}<div class="recordPlantingFlowBody">${bodyHtml}</div>`;

  const footerActions = {
    location: ["building", "棟選択に戻る", "count", "植え付け数へ"],
    count: ["location", "場所選択に戻る", "quality", "品質へ"],
    quality: ["count", "植え付け数に戻る", "finish", "この棟を終了"]
  }[recordPlantingFlowStage];
  footer.innerHTML = footerActions ? `
    <button type="button" class="recordPlantingFlowBackBtn" data-ui-click="moveRecordPlantingFlowToStage" data-ui-arg="${footerActions[0]}">${footerActions[1]}</button>
    <button type="button" class="recordPlantingFlowNextBtn" data-ui-click="${footerActions[2] === "finish" ? "finishRecordPlantingFlowBuilding" : "moveRecordPlantingFlowToStage"}"
      ${footerActions[2] === "finish" ? "" : `data-ui-arg="${footerActions[2]}"`}>${footerActions[3]}</button>
  ` : "";
}

function updateRecordPlantingCountPresetUi(){
  const toolbar = document.getElementById("recordPlantingCountPreset");
  const isPlantingMode = recordSelectionMode === "planting";
  const showToolbar = isPlantingMode && (!isRecordPlantingFlowActive() || recordPlantingFlowStage === "count");
  if(toolbar) toolbar.hidden = !showToolbar;
  const applyButton = toolbar?.querySelector(".recordPlantingCountApplyBtn");
  if(applyButton) applyButton.hidden = isRecordPlantingFlowActive();
  const title = toolbar?.querySelector(".recordPlantingCountPresetTitle");
  const hint = toolbar?.querySelector(".recordPlantingCountPresetHint");
  if(title) title.textContent = isRecordPlantingFlowActive()
    ? "植え付け数を選択"
    : "選ぶパレットの植え付け数";
  if(hint) hint.textContent = isRecordPlantingFlowActive()
    ? "株数を選び、配置図で変更する場所をタップ"
    : "選択済みでも、別の株数でタップすると上書きできます";
  document.querySelectorAll("[data-record-planting-count]").forEach(button => {
    const active = Number(button.dataset.recordPlantingCount) === recordPlantingCountPreset;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  const summary = document.getElementById("recordPlantingCountSummary");
  if(summary){
    const distribution = getRecordPlantingCountDistribution(
      isRecordPlantingFlowActive() ? getRecordPlantingFlowKeys() : harvestFillKeys
    );
    const parts = [12, 16, 20]
      .filter(count => distribution[count] > 0)
      .map(count => `${count}植え×${distribution[count]}`);
    summary.textContent = parts.length ? parts.join("・") : "パレットを選択してください";
  }
}

function setRecordPlantingCountPreset(count){
  if(recordSelectionMode !== "planting") return;
  recordPlantingCountPreset = normalizePlantingCountPreset(count, recordPlantingCountPreset);
  updateRecordPlantingCountPresetUi();
  scheduleHarvestStateSave();
}

function applyRecordPlantingCountPresetToSelection(){
  if(recordSelectionMode !== "planting") return;
  if(!harvestFillKeys.length){
    showToast("株数を設定するパレットを選択してください");
    return;
  }
  const nextCounts = { ...recordPlantingCountsByPallet };
  harvestFillKeys.forEach(key => {
    nextCounts[key] = recordPlantingCountPreset;
  });
  if(!canPlantSeedlingKeysWithinCapacity(harvestFillKeys, getActivePlantingRecord(), nextCounts)){
    showToast(getPlantingCapacityExceededMessage());
    return;
  }
  recordPlantingCountsByPallet = normalizePlantingCountsByPallet(nextCounts, harvestFillKeys);
  refreshAfterHarvestSelectionChanged();
  refreshBedDetailWindow();
  showToast(`選択中のパレットを${recordPlantingCountPreset}植えに変更しました`);
}

function getSelectedSeedlingNeed(){
  let total = 0;
  harvestFillKeys.forEach(key => {
    const p = parsePalletKey(key);
    total += getPlantingCountForPallet(p.bed, p.number);
  });
  return total;
}

function getRequiredSeedlingsWithLoss(){
  const totalPlanting = getSelectedSeedlingNeed();
  return getRequiredSeedlingsWithLossFromPlantingTotal(totalPlanting);
}

function getRecordSeedlingCarryoverMode(){
  const checked = document.querySelector('input[name="recordSeedlingCarryoverMode"]:checked');
  return normalizeSeedlingCarryoverMode(checked?.value || "loss");
}

function getSeedlingCarryoverHintText(mode, averageInfo = null){
  if(normalizeSeedlingCarryoverMode(mode) === "carryover"){
    if(averageInfo && Number.isFinite(averageInfo.averageLossRate) && averageInfo.recordCount > 0){
      return `余りあり: 直近${averageInfo.recordCount}件の平均苗ロス率 ${formatDashboardMetricNumber(averageInfo.averageLossRate, "%")} を使って繰越分を計算します。`;
    }
    return `余りあり: 直近の記録に苗ロス率がないため、設定の苗ロス率 ${formatDashboardMetricNumber(settings.seedlingLossRate || 0, "%")} を使って繰越分を計算します。`;
  }
  return "";
}

function formatSeedlingCarryoverLossSourceText(usage){
  if(!usage || normalizeSeedlingCarryoverMode(usage.mode) !== "carryover") return "";
  const hasAverage = Number.isFinite(usage.averageInfo?.averageLossRate) && usage.averageInfo?.recordCount > 0;
  return hasAverage
    ? `直近${usage.averageInfo.recordCount}件平均 ${formatDashboardMetricNumber(usage.effectiveLossRate, "%")}`
    : `設定値 ${formatDashboardMetricNumber(usage.effectiveLossRate, "%")}`;
}

function setRecordSeedlingCarryoverMode(mode, options = {}){
  const normalizedMode = normalizeSeedlingCarryoverMode(mode);
  const input = document.getElementById("recordSeedlingCarryoverCheckbox") || document.querySelector('input[name="recordSeedlingCarryoverMode"][value="carryover"]');
  if(input) input.checked = normalizedMode === "carryover";
  updateRecordSeedlingCarryoverHint();
  if(!options.silent){
    updateRecordSeedlingDiffDisplay();
    updateRecordActualSeedlingDisplays();
    saveHarvestStateToStorage();
  }
}

function bindRecordSeedlingCarryoverModeInputs(){
  document.querySelectorAll('input[name="recordSeedlingCarryoverMode"]').forEach(input => {
    if(input.dataset.bound === "1") return;
    input.addEventListener("change", () => {
      updateRecordSeedlingCarryoverHint();
      updateRecordSeedlingDiffDisplay();
      updateRecordActualSeedlingDisplays();
      saveHarvestStateToStorage();
    });
    input.dataset.bound = "1";
  });
}

function getAverageRecentSeedlingLossRate(referenceDateValue = "", options = {}){
  const excludeEventId = getSafePositiveRecordId(options.excludeEventId);
  const targetEvent = excludeEventId === null ? null : getPlantingEventById(excludeEventId);
  const targetDate = parseDateOnlyString(String(referenceDateValue || targetEvent?.plantingDate || "").trim()) || new Date();
  const targetTime = targetDate ? startOfLocalDay(targetDate).getTime() : Infinity;
  const previousEvents = plantingEvents
    .filter(event => {
      if(excludeEventId !== null && Number(event.eventId) === excludeEventId) return false;
      const eventDate = parseDateOnlyString(String(event.plantingDate || ""));
      if(!eventDate) return false;
      const eventTime = startOfLocalDay(eventDate).getTime();
      if(eventTime < targetTime) return true;
      return eventTime === targetTime
        && (excludeEventId === null || Number(event.eventId) < excludeEventId);
    })
    .sort(comparePlantingEventsAsc);

  const lossRates = previousEvents
    .slice(-10)
    .map(event => {
      const rawValue = String(event?.actualSeedlingLossRate ?? "").trim();
      if(rawValue === "") return null;
      const value = Number(rawValue);
      return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
    })
    .filter(value => Number.isFinite(value));
  const averageLossRate = lossRates.length
    ? lossRates.reduce((sum, value) => sum + value, 0) / lossRates.length
    : null;

  return {
    averageLossRate,
    recordCount: lossRates.length
  };
}

function getCurrentSeedlingLossRateAverageInfo(recordId = null){
  const referenceDateValue = document.getElementById("recordDateInput")?.value || getHarvestTargetDateString();
  return getAverageRecentSeedlingLossRate(referenceDateValue, { excludeEventId: editingPlantingEventId });
}

function updateRecordSeedlingCarryoverHint(){
  const hint = document.getElementById("recordSeedlingCarryoverHint");
  if(!hint) return;
  const activeRecord = getActivePlantingRecord();
  const mode = getRecordSeedlingCarryoverMode();
  const averageInfo = getCurrentSeedlingLossRateAverageInfo(activeRecord?.id);
  hint.textContent = getSeedlingCarryoverHintText(mode, averageInfo);
}

function getCompletedFullHarvestRecordsInPlantingOrder(){
  return records
    .filter(record => record?.type === "fullHarvest" && !record.plantingPending)
    .sort((a, b) => {
      const timeA = parseDateOnlyString(a?.plantingDate || a?.date)?.getTime() ?? -Infinity;
      const timeB = parseDateOnlyString(b?.plantingDate || b?.date)?.getTime() ?? -Infinity;
      if(timeA !== timeB) return timeA - timeB;
      return Number(a?.id || 0) - Number(b?.id || 0);
    });
}

function getPlantingOrderDateForRecord(record){
  return getEffectivePlantingDateForRecord(record) || parseDateOnlyString(String(record?.plantingDate || record?.date || "").trim());
}

function getPreviousCompletedFullHarvestRecord(options = {}){
  const targetId = Number(options.recordId ?? options.excludeRecordId);
  const targetRecord = Number.isFinite(targetId) ? getRecordById(targetId) : null;
  const targetDate = targetRecord
    ? getPlantingOrderDateForRecord(targetRecord)
    : (parseDateOnlyString(String(options.referenceDateValue || "").trim()) || new Date());
  const targetTime = targetDate ? startOfLocalDay(targetDate).getTime() : Infinity;
  const orderedRecords = getCompletedFullHarvestRecordsInPlantingOrder();
  let previousRecord = null;

  for(const record of orderedRecords){
    if(Number.isFinite(targetId) && Number(record.id) === targetId) break;
    const recordDate = getPlantingOrderDateForRecord(record);
    if(!recordDate) continue;
    const recordTime = startOfLocalDay(recordDate).getTime();
    const recordId = Number(record.id);

    if(recordTime > targetTime) break;
    if(recordTime === targetTime && Number.isFinite(targetId) && Number.isFinite(recordId) && recordId >= targetId) break;

    previousRecord = record;
  }

  return previousRecord;
}

function getActualTakenSeedlingTotalForTrayCount(trayCount){
  return getSeedlingCountFromTrayCount(trayCount);
}

function getActualPlantedSeedlingTotalForRecord(record){
  if(!record || record.type !== "fullHarvest") return 0;
  const plantingKeys = getPlantingPalletKeysFromRecord(record);
  return getActualPlantedSeedlingTotal(plantingKeys);
}

function getSeedlingLossCountFromRate(totalSeedlings, lossRate){
  const safeTotal = clampNumber(totalSeedlings, 0, 999999, 0);
  const safeRate = clampNumber(lossRate, 0, 100, 0);
  return Math.round(safeTotal * safeRate / 100);
}

function getSeedlingUsageContext(options = {}){
  const recordId = Number(options.recordId);
  const mode = normalizeSeedlingCarryoverMode(options.mode ?? getRecordSeedlingCarryoverMode());
  const hasCarryoverBeforeOverride = typeof options.carryoverBeforeSeedlings !== "undefined";
  const carryoverBefore = clampNumber(
    options.carryoverBeforeSeedlings,
    0,
    999999,
    Number.isFinite(recordId) ? getCarryoverSeedlingStockBeforeRecord(recordId) : getCurrentCarryoverSeedlingStock()
  );
  const takenTotal = clampNumber(options.takenTotalSeedlings, 0, 999999, getActualTakenSeedlingTotal());
  const plantedTotal = clampNumber(options.plantedTotalSeedlings, 0, 999999, getActualPlantedSeedlingTotal());
  const usedFromCarryover = Math.min(carryoverBefore, plantedTotal);
  const remainingNeed = Math.max(0, plantedTotal - usedFromCarryover);
  const usedFromCurrent = Math.min(takenTotal, remainingNeed);
  const fallbackLossRate = takenTotal > 0
    ? Math.max(0, ((takenTotal - usedFromCurrent) / takenTotal) * 100)
    : 0;
  const averageInfo = options.averageInfo || (
    hasCarryoverBeforeOverride
      ? { averageLossRate: null, recordCount: 0 }
      : getCurrentSeedlingLossRateAverageInfo(recordId)
  );
  const effectiveLossRate = normalizeSeedlingCarryoverMode(mode) === "carryover"
    ? clampNumber(
        options.lossRateOverride,
        0,
        100,
        Number.isFinite(averageInfo?.averageLossRate) ? averageInfo.averageLossRate : settings.seedlingLossRate
      )
    : clampNumber(options.lossRateOverride, 0, 100, fallbackLossRate);
  const actualLossSeedlings = normalizeSeedlingCarryoverMode(mode) === "carryover"
    ? getSeedlingLossCountFromRate(takenTotal, effectiveLossRate)
    : Math.max(0, takenTotal - usedFromCurrent);
  const currentCarryoverAfter = normalizeSeedlingCarryoverMode(mode) === "carryover"
    ? Math.max(0, takenTotal - usedFromCurrent - actualLossSeedlings)
    : 0;
  const carryoverAfter = normalizeSeedlingCarryoverMode(mode) === "carryover"
    ? Math.max(0, carryoverBefore - usedFromCarryover + currentCarryoverAfter)
    : 0;

  return {
    mode,
    carryoverBefore,
    takenTotal,
    plantedTotal,
    usedFromCarryover,
    usedFromCurrent,
    actualLossSeedlings,
    effectiveLossRate,
    averageInfo,
    carryoverAfter,
    currentCarryoverAfter
  };
}

function getCarryoverSeedlingStockBeforeRecord(recordId = null){
  const plantingDateValue = document.getElementById("recordDateInput")?.value || formatDateOnlyString(new Date());
  return getPlantingCarryoverBeforePosition(plantingDateValue, editingPlantingEventId);
}

function getCurrentCarryoverSeedlingStock(){
  return getPlantingEventStateIndex().currentCarryover;
}

function getRequiredSeedlingsWithLossFromPlantingTotal(totalPlanting, options = {}){
  const lossRate = clampNumber(settings.seedlingLossRate, 0, 100, 0);
  const surviveRate = (100 - lossRate) / 100;
  if(totalPlanting <= 0) return 0;
  if(surviveRate <= 0) return 0;
  const carryoverSeedlings = clampNumber(options.carryoverSeedlings, 0, 999999, getCurrentCarryoverSeedlingStock());
  const remainingPlanting = Math.max(0, totalPlanting - carryoverSeedlings);
  return Math.floor(remainingPlanting / surviveRate);
}

function getSeedlingNeedForKeys(keys){
  if(!Array.isArray(keys) || !keys.length) return 0;
  let total = 0;
  keys.forEach(key => {
    const p = parsePalletKey(String(key || ""));
    if(!BUILDINGS.includes(p.building) || !bedOrder.includes(p.bed) || !Number.isFinite(p.number)) return;
    total += getPlantingCountForPallet(p.bed, p.number);
  });
  return total;
}

function getRemainingHarvestableCasesForBuilding(building, options = {}){
  const normalizedBuilding = Number(building);
  if(!BUILDINGS.includes(normalizedBuilding)) return 0;
  const referenceDate = options.referenceDate instanceof Date
    ? options.referenceDate
    : getHarvestTargetDate();
  const sourceRecords = Array.isArray(options.sourceRecords) ? options.sourceRecords : records;
  const recordedSet = options.recordedSet instanceof Set
    ? options.recordedSet
    : getHarvestedPalletSet(referenceDate);
  const excludedSet = new Set(Array.isArray(options.excludedPalletKeys) ? options.excludedPalletKeys : []);
  const hasPartialHarvestRecords = sourceRecords.some(record => record.type === "partialHarvest");
  const harvestableHeadsByPallet = options.harvestableHeadsByPallet instanceof Map
    ? options.harvestableHeadsByPallet
    : null;
  const predictionOptions = {
    plantingStateByPallet:getLatestPlantingStateByPallet(referenceDate),
    lookup:hasPartialHarvestRecords ? getHarvestRecordLookup(referenceDate, sourceRecords) : null
  };
  let remainingHeads = 0;

  for(const bed of bedOrder){
    for(let number = 1; number <= PALLETS_PER_BED; number++){
      const key = getPalletKey(normalizedBuilding, bed, number);
      if(recordedSet.has(key)) continue;
      if(excludedSet.has(key)) continue;
      let palletHarvestableHeads = harvestableHeadsByPallet?.get(key);
      if(!Number.isFinite(palletHarvestableHeads)){
        palletHarvestableHeads = hasPartialHarvestRecords
          ? getPredictedHarvestForPallet(
              normalizedBuilding,
              bed,
              number,
              referenceDate,
              sourceRecords,
              predictionOptions
            )
          : getPredictedHarvestForBed(
              normalizedBuilding,
              bed,
              number,
              referenceDate,
              predictionOptions
            );
        harvestableHeadsByPallet?.set(key, palletHarvestableHeads);
      }
      remainingHeads += palletHarvestableHeads;
    }
  }

  return Math.floor((remainingHeads / CASE_SIZE) * 10) / 10;
}

function getRemainingCasesForCurrentBuilding(options = {}){
  return getRemainingHarvestableCasesForBuilding(currentBuilding, {
    recordedSet: getHarvestedPalletSet(getHarvestTargetDate()),
    excludedPalletKeys: harvestFillKeys,
    harvestableHeadsByPallet:options.harvestableHeadsByPallet
  });
}

function getSpecialPalletPattern(n){
  const safeN = clampNumber(n, 0, 3, 0);
  const pattern = [];
  const count120 = 3 - safeN;

  for(let i = 0; i < count120; i++) pattern.push(120);
  for(let i = 0; i < safeN; i++) pattern.push(60);

  return pattern;
}

function getRequiredSpecialPalletCount(){
  return getSeedlingInstructionCounts().totalCount;
}

function getSpecialPalletCountForRequiredSeedlings(requiredSeedlings){
  if(requiredSeedlings <= 0) return 0;

  const pattern = getSpecialPalletPattern(settings.specialPallet60CountPer3);
  if(!pattern.length) return 0;

  let total = 0;
  let count = 0;
  let index = 0;

  while(total < requiredSeedlings){
    const nextCount = pattern[index % pattern.length];
    total += nextCount;
    count++;
    index++;
  }

  return count;
}

function getSeedlingHouseOrder(){
  const keys = [];
  SEEDLING_HOUSE_BED_SEQUENCE.forEach(item => {
    if(item.direction < 0){
      for(let number = PALLETS_PER_BED; number >= 1; number--){
        keys.push(getPalletKey(SEEDLING_HOUSE_BUILDING, item.bed, number));
      }
      return;
    }
    for(let number = 1; number <= PALLETS_PER_BED; number++){
      keys.push(getPalletKey(SEEDLING_HOUSE_BUILDING, item.bed, number));
    }
  });
  return keys;
}

function isValidSeedlingHousePalletKey(key){
  const match = String(key || "").trim().match(/^1-([A-F])-(\d+)$/);
  if(!match) return false;
  const number = Number(match[2]);
  return Number.isInteger(number) && number >= 1 && number <= PALLETS_PER_BED;
}

function normalizeSeedlingHousePalletKeys(keys){
  if(!Array.isArray(keys)) return [];
  const orderIndex = new Map(getSeedlingHouseOrder().map((key, index) => [key, index]));
  return [...new Set(keys.map(key => String(key || "").trim()).filter(isValidSeedlingHousePalletKey))]
    .sort((left, right) => orderIndex.get(left) - orderIndex.get(right));
}

function formatSeedlingHousePosition(key){
  if(!isValidSeedlingHousePalletKey(key)) return "-";
  const pallet = parsePalletKey(key);
  return `${pallet.bed}-${pallet.number}`;
}

function formatSeedlingHouseSelectionRange(keys){
  const normalizedKeys = normalizeSeedlingHousePalletKeys(keys);
  if(!normalizedKeys.length) return "-";
  const orderIndex = new Map(getSeedlingHouseOrder().map((key, index) => [key, index]));
  const ranges = [];
  let rangeStart = normalizedKeys[0];
  let rangeEnd = normalizedKeys[0];

  normalizedKeys.slice(1).forEach(key => {
    const previous = parsePalletKey(rangeEnd);
    const current = parsePalletKey(key);
    const isContinuous = previous.bed === current.bed
      && orderIndex.get(key) === orderIndex.get(rangeEnd) + 1;
    if(isContinuous){
      rangeEnd = key;
      return;
    }
    ranges.push([rangeStart, rangeEnd]);
    rangeStart = key;
    rangeEnd = key;
  });
  ranges.push([rangeStart, rangeEnd]);

  return ranges.map(([startKey, endKey]) => {
    const start = formatSeedlingHousePosition(startKey);
    const end = formatSeedlingHousePosition(endKey);
    return start === end ? start : `${start}〜${end}`;
  }).join("、");
}

function getSeedlingHouseEventKeys(event, usedSet, order){
  const trayCount = clampNumber(event?.actualSeedlingTrayCount, 0, SEEDLING_HOUSE_POSITION_COUNT, 0);
  if(trayCount <= 0 || event?.detailsUnknown) return [];
  const storedKeys = normalizeSeedlingHousePalletKeys(event?.seedlingHousePalletKeys);
  if(storedKeys.length){
    const storedSet = new Set(storedKeys);
    return storedKeys.slice(0, trayCount).concat(
      order
        .filter(key => !usedSet.has(key) && !storedSet.has(key))
        .slice(0, Math.max(0, trayCount - storedKeys.length))
    );
  }

  return order.filter(key => !usedSet.has(key)).slice(0, trayCount);
}

function getSeedlingHouseUsageState(sourceEvents = plantingEvents, options = {}){
  const excludeEventId = Number(options.excludeEventId || 0);
  const order = getSeedlingHouseOrder();
  const usedSet = new Set();
  const applyStartKey = key => {
    const normalizedKey = String(key || "").trim();
    const startIndex = order.indexOf(normalizedKey);
    if(startIndex < 0) return;
    usedSet.clear();
    order.slice(0, startIndex).forEach(item => usedSet.add(item));
  };
  applyStartKey(options.initialStartKey);
  const events = (Array.isArray(sourceEvents) ? sourceEvents : [])
    .filter(event => !excludeEventId || Number(event?.eventId) !== excludeEventId)
    .sort(comparePlantingEventsAsc);

  events.forEach(event => {
    const trayCount = clampNumber(event?.actualSeedlingTrayCount, 0, SEEDLING_HOUSE_POSITION_COUNT, 0);
    if(trayCount <= 0 || event?.detailsUnknown){
      applyStartKey(event.seedlingHouseNextStartKey);
      return;
    }
    const eventKeys = getSeedlingHouseEventKeys(event, usedSet, order);
    const repeatedKeys = eventKeys.filter(key => usedSet.has(key));

    if(repeatedKeys.length){
      // 一つの記録が周回末尾と次の周回先頭をまたぐ場合、次の周回で
      // 取り始めた場所だけを残す。前周回の末尾を「苗取り済み」として
      // 新しい周回へ持ち越すと、その場所が次周回で選ばれなくなる。
      usedSet.clear();
      repeatedKeys.forEach(key => usedSet.add(key));
      applyStartKey(event.seedlingHouseNextStartKey);
      return;
    }

    const availableCount = order.length - usedSet.size;
    if(!normalizeSeedlingHousePalletKeys(event?.seedlingHousePalletKeys).length
      && trayCount > availableCount){
      const nextCycleCount = Math.min(order.length, trayCount - availableCount);
      usedSet.clear();
      order.slice(0, nextCycleCount).forEach(key => usedSet.add(key));
      applyStartKey(event.seedlingHouseNextStartKey);
      return;
    }

    eventKeys.forEach(key => usedSet.add(key));
    applyStartKey(event.seedlingHouseNextStartKey);
  });

  if(usedSet.size >= order.length) usedSet.clear();
  const availableKeys = order.filter(key => !usedSet.has(key));
  return {
    order,
    usedSet,
    availableKeys,
    nextKey: availableKeys[0] || order[0] || ""
  };
}

function distributeSeedlingHouseTakeCounts(segments, takeCount){
  const safeTakeCount = clampNumber(takeCount, 0, SEEDLING_HOUSE_POSITION_COUNT, 0);
  const selectedSegments = segments.filter(segment => segment.type === "selected");
  if(!selectedSegments.length) return new Map();
  if(selectedSegments.length === 1) return new Map([[selectedSegments[0], safeTakeCount]]);

  const totalWeight = selectedSegments.reduce((sum, segment) => (
    sum + Math.max(0, Number(segment.seedlingTrayCount) || 0)
  ), 0);
  if(totalWeight <= 0){
    return new Map(selectedSegments.map((segment, index) => [
      segment,
      index === selectedSegments.length - 1 ? safeTakeCount : 0
    ]));
  }

  const allocations = selectedSegments.map(segment => {
    const exactCount = safeTakeCount * Math.max(0, Number(segment.seedlingTrayCount) || 0) / totalWeight;
    return {
      segment,
      count: Math.floor(exactCount),
      remainder: exactCount - Math.floor(exactCount)
    };
  });
  let remaining = safeTakeCount - allocations.reduce((sum, item) => sum + item.count, 0);
  [...allocations]
    .sort((left, right) => right.remainder - left.remainder)
    .forEach(item => {
      if(remaining <= 0) return;
      item.count++;
      remaining--;
    });
  return new Map(allocations.map(item => [item.segment, item.count]));
}

function getSeedlingHouseAllocationSegments(skipInfo, takeCount){
  const harvestSegments = Array.isArray(skipInfo?.harvestOrderSegments)
    ? skipInfo.harvestOrderSegments
    : [];
  if(!skipInfo?.shouldShow || !harvestSegments.length){
    return [{ type: "selected", count: takeCount }];
  }

  const selectedCounts = distributeSeedlingHouseTakeCounts(harvestSegments, takeCount);
  return harvestSegments.map(segment => ({
    type: segment.type,
    count: segment.type === "skipped"
      ? segment.seedlingTrayCount
      : (selectedCounts.get(segment) || 0)
  })).filter(segment => segment.count > 0);
}

function getEmptyHarvestOrderSkipSeedlingInfo(){
  return {
    shouldShow: false,
    normalStartKey: "",
    selectedStartKey: "",
    skippedPalletKeys: [],
    skippedPalletCount: 0,
    skippedSeedlingTrayCount: 0,
    harvestOrderSegments: []
  };
}

function allocateSeedlingHousePlan(usageState, skipCount, takeCount, allocationSegments = null){
  const order = usageState?.order || getSeedlingHouseOrder();
  const availableKeys = usageState?.availableKeys?.length
    ? [...usageState.availableKeys]
    : [...order];
  const safeSkipCount = clampNumber(skipCount, 0, SEEDLING_HOUSE_POSITION_COUNT, 0);
  const safeTakeCount = clampNumber(takeCount, 0, SEEDLING_HOUSE_POSITION_COUNT, 0);
  const segments = Array.isArray(allocationSegments) && allocationSegments.length
    ? allocationSegments
    : [
        { type: "skipped", count: safeSkipCount },
        { type: "selected", count: safeTakeCount }
      ];
  const candidateKeys = [...availableKeys, ...order];
  const reservedSet = new Set();
  const skippedKeys = [];
  const selectedKeys = [];
  const allocatedSegments = [];
  let candidateIndex = 0;

  segments.forEach(segment => {
    const target = segment.type === "skipped" ? skippedKeys : selectedKeys;
    const segmentKeys = [];
    const count = clampNumber(segment.count, 0, SEEDLING_HOUSE_POSITION_COUNT, 0);
    for(let added = 0; added < count && candidateIndex < candidateKeys.length;){
      const key = candidateKeys[candidateIndex++];
      if(reservedSet.has(key)) continue;
      reservedSet.add(key);
      target.push(key);
      segmentKeys.push(key);
      added++;
    }
    if(segmentKeys.length) allocatedSegments.push({ type: segment.type, keys: segmentKeys });
  });

  return {
    skippedKeys,
    selectedKeys,
    allocatedSegments,
    skippedCount: skippedKeys.length,
    selectedCount: selectedKeys.length
  };
}

function getSeedlingHousePlanForHarvestKeys(keys, options = {}){
  const takeCount = clampNumber(options.takeCount, 0, SEEDLING_HOUSE_POSITION_COUNT, 0);
  const allocationMode = normalizeSeedlingHouseAllocationMode(options.allocationMode);
  const hasCustomSourceEvents = Array.isArray(options.sourceEvents);
  const usageState = getSeedlingHouseUsageState(
    hasCustomSourceEvents ? options.sourceEvents : plantingEvents,
    {
      excludeEventId: options.excludeEventId,
      initialStartKey: options.initialStartKey
        || (hasCustomSourceEvents ? "" : settings.seedlingHouseInitialStartKey)
    }
  );
  const skipInfo = allocationMode === "harvest"
    ? getHarvestOrderSkipSeedlingInfo(keys, {
        selectionMode: options.selectionMode ?? "manual",
        referenceDate: options.referenceDate,
        sourceRecords: Array.isArray(options.sourceRecords) ? options.sourceRecords : records
      })
    : getEmptyHarvestOrderSkipSeedlingInfo();
  const skipCount = skipInfo.shouldShow ? skipInfo.skippedSeedlingTrayCount : 0;
  const allocationSegments = getSeedlingHouseAllocationSegments(skipInfo, takeCount);
  const allocation = allocateSeedlingHousePlan(usageState, skipCount, takeCount, allocationSegments);
  return {
    ...usageState,
    ...allocation,
    skipInfo,
    allocationMode,
    takeCount,
    shouldShowSelection: options.shouldShowSelection !== false && takeCount > 0
  };
}

function getCurrentSeedlingHousePlan(){
  const activeRecord = recordSelectionMode === "planting" ? getActivePlantingRecord() : null;
  const harvestKeys = activeRecord?.palletKeys?.length ? activeRecord.palletKeys : harvestFillKeys;
  const seedlingCounts = getSeedlingInstructionCounts(harvestKeys);
  const displayedTakeCount = activeRecord
    ? (clampNumber(activeRecord.actualSeedlingTrayCount, 0, SEEDLING_HOUSE_POSITION_COUNT, 0)
      || clampNumber(activeRecord.plannedSeedlingTrayCount, 0, SEEDLING_HOUSE_POSITION_COUNT, seedlingCounts.totalCount))
    : getDisplayedSeedlingCount(seedlingCounts.totalCount);
  const shouldShowSelection = !!harvestSummary && harvestKeys.length > 0;
  const referenceDate = activeRecord?.date
    ? (parseDateOnlyString(activeRecord.date) || new Date())
    : new Date();
  const sourceRecords = activeRecord
    ? records.filter(record => Number(record?.id) !== Number(activeRecord.id))
    : records;
  return getSeedlingHousePlanForHarvestKeys(harvestKeys, {
    takeCount: displayedTakeCount,
    selectionMode: activeRecord ? "manual" : harvestSelectionMode,
    referenceDate,
    sourceRecords,
    allocationMode: seedlingHouseAllocationMode,
    shouldShowSelection
  });
}

function getSeedlingTrayCountNeededForKeys(keys, options = {}){
  const totalPlanting = getSeedlingNeedForKeys(keys);
  const requiredSeedlings = getRequiredSeedlingsWithLossFromPlantingTotal(totalPlanting, options);
  return getSpecialPalletCountForRequiredSeedlings(requiredSeedlings);
}

function getSeedlingKeysWithUnplanted(keys = harvestFillKeys, options = {}){
  const combined = new Set(Array.isArray(keys) ? keys : []);
  getUnplantedPalletSet({
    excludeEventId: options.excludeEventId ?? editingPlantingEventId
  }).forEach(key => combined.add(key));
  return [...combined];
}

function getSeedlingInstructionCounts(keys = harvestFillKeys, options = {}){
  const baseKeys = Array.isArray(keys) ? keys : [];
  const carryoverSeedlings = clampNumber(options.carryoverSeedlings, 0, 999999, getCurrentCarryoverSeedlingStock());
  const baseCount = getSeedlingTrayCountNeededForKeys(baseKeys, { carryoverSeedlings });
  const totalCount = getSeedlingTrayCountNeededForKeys(
    getSeedlingKeysWithUnplanted(baseKeys, { recordId: options.recordId }),
    { carryoverSeedlings }
  );
  return {
    baseCount,
    totalCount,
    additionalCount: Math.max(0, totalCount - baseCount),
    carryoverSeedlings
  };
}

function getHarvestOrderSkipSeedlingInfo(keys = harvestFillKeys, options = {}){
  const emptyResult = getEmptyHarvestOrderSkipSeedlingInfo();
  const selectionMode = options.selectionMode ?? harvestSelectionMode;
  const selectedKeys = [...new Set(Array.isArray(keys) ? keys : [])]
    .filter(isValidPalletKeyString);
  if(selectionMode !== "manual" || !selectedKeys.length || hasAppliedHarvestProgress()){
    return emptyResult;
  }

  const referenceDate = startOfLocalDay(options.referenceDate || new Date());
  const sourceRecords = Array.isArray(options.sourceRecords) ? options.sourceRecords : records;
  const recentRecords = getRecentHarvestRecordsByCount(referenceDate, RECORDED_LOOKBACK_COUNT, sourceRecords);
  const recordedSet = getRecordedPalletSetFromRecords(recentRecords);
  const startBuilding = getStartupHarvestBuildingFromRecentRecords(recentRecords);
  const normalStartKey = findFirstAvailableInHarvestOrder(startBuilding, recordedSet);
  if(!normalStartKey) return emptyResult;

  const selectedSet = new Set(selectedKeys);
  const orderedPallets = [];
  let selectedStartKey = "";
  let lastSelectedIndex = -1;
  let current = parsePalletKey(normalStartKey);
  const maxLoop = BUILDINGS.length * bedOrder.length * PALLETS_PER_BED;

  for(let index = 0; index < maxLoop; index++){
    const key = getPalletKey(current.building, current.bed, current.number);
    const isSelected = selectedSet.has(key);
    if(isSelected || !recordedSet.has(key)){
      orderedPallets.push({ key, type: isSelected ? "selected" : "skipped" });
    }
    if(isSelected){
      if(!selectedStartKey) selectedStartKey = key;
      lastSelectedIndex = orderedPallets.length - 1;
    }
    current = getNextPallet(current.building, current.bed, current.number);
  }

  const relevantPallets = lastSelectedIndex >= 0
    ? orderedPallets.slice(0, lastSelectedIndex + 1)
    : [];
  const harvestOrderSegments = [];
  relevantPallets.forEach(item => {
    const lastSegment = harvestOrderSegments[harvestOrderSegments.length - 1];
    if(lastSegment?.type === item.type){
      lastSegment.palletKeys.push(item.key);
      return;
    }
    harvestOrderSegments.push({ type: item.type, palletKeys: [item.key] });
  });
  harvestOrderSegments.forEach(segment => {
    segment.seedlingTrayCount = getSeedlingTrayCountNeededForKeys(segment.palletKeys, {
      carryoverSeedlings: 0
    });
  });
  const skippedPalletKeys = harvestOrderSegments
    .filter(segment => segment.type === "skipped")
    .flatMap(segment => segment.palletKeys);

  if(!selectedStartKey || !skippedPalletKeys.length){
    return {
      ...emptyResult,
      normalStartKey,
      selectedStartKey
    };
  }

  return {
    shouldShow: true,
    normalStartKey,
    selectedStartKey,
    skippedPalletKeys,
    skippedPalletCount: skippedPalletKeys.length,
    skippedSeedlingTrayCount: harvestOrderSegments
      .filter(segment => segment.type === "skipped")
      .reduce((sum, segment) => sum + segment.seedlingTrayCount, 0),
    harvestOrderSegments
  };
}

function getHarvestOrderSkipSeedlingText(info = getHarvestOrderSkipSeedlingInfo()){
  return info?.shouldShow
    ? `先取り収穫: 苗を${info.skippedSeedlingTrayCount}枚飛ばす`
    : "";
}

function normalizeManualSeedlingCount(value){
  if(value === null || value === "" || typeof value === "undefined") return null;
  if(!Number.isFinite(Number(value))) return null;
  return clampNumber(value, 0, 999999, 0);
}

function hasManualSeedlingCount(){
  return manualSeedlingCount !== null
    && manualSeedlingCount !== ""
    && typeof manualSeedlingCount !== "undefined"
    && Number.isFinite(Number(manualSeedlingCount));
}

function getDisplayedSeedlingCount(autoCount){
  return hasManualSeedlingCount()
    ? clampNumber(manualSeedlingCount, 0, 999999, autoCount)
    : autoCount;
}

function getSeedlingAdditionalNote(additionalCount){
  const safeCount = clampNumber(additionalCount, 0, 999999, 0);
  return safeCount > 0 ? `（未定植分 +${safeCount}枚）` : "";
}

function getSeedlingCarryoverNote(carryoverSeedlings){
  const safeCount = clampNumber(carryoverSeedlings, 0, 999999, 0);
  return safeCount > 0 ? `（前回余った苗 ${safeCount}株反映）` : "";
}

function getSeedlingInstructionText(autoCount, additionalCount = 0, carryoverSeedlings = 0){
  const additionalNote = getSeedlingAdditionalNote(additionalCount);
  const carryoverNote = getSeedlingCarryoverNote(carryoverSeedlings);
  if(!hasManualSeedlingCount()){
    return "苗: " + autoCount + "枚" + additionalNote + carryoverNote;
  }
  const manualCount = getDisplayedSeedlingCount(autoCount);
  return "苗: " + manualCount + "枚（自動: " + autoCount + "枚）" + additionalNote + carryoverNote;
}

function getSeedlingInstructionTextForMonitor(autoCount, carryoverSeedlings = 0){
  return "苗: " + getDisplayedSeedlingCount(autoCount) + "枚" + getSeedlingCarryoverNote(carryoverSeedlings);
}

function getSeedlingInstructionValueEditorHtml(autoCount, additionalCount = 0, carryoverSeedlings = 0){
  const displayedCount = getDisplayedSeedlingCount(autoCount);
  const autoNote = hasManualSeedlingCount()
    ? `<span class="instructionAutoNote">（自動: ${autoCount}枚）</span>`
    : "";
  const additionalNote = getSeedlingAdditionalNote(additionalCount);
  const carryoverNote = getSeedlingCarryoverNote(carryoverSeedlings);
  const additionalHtml = additionalNote
    ? `<span class="instructionAutoNote">${escapeHtml(additionalNote)}</span>`
    : "";
  const carryoverHtml = carryoverNote
    ? `<span class="instructionAutoNote">${escapeHtml(carryoverNote)}</span>`
    : "";
  return `<span class="seedlingInlineWrap"><input id="seedlingInlineInput" class="seedlingInlineInput" type="number" min="0" inputmode="numeric" value="${escapeHtml(String(displayedCount))}" placeholder="${escapeHtml(String(autoCount))}" aria-label="苗枚数"><span class="seedlingInlineSuffix">枚</span></span>${autoNote}${additionalHtml}${carryoverHtml}`;
}

function getSeedlingInstructionEditorHtml(autoCount, additionalCount = 0, carryoverSeedlings = 0){
  return `苗: ${getSeedlingInstructionValueEditorHtml(autoCount, additionalCount, carryoverSeedlings)}`;
}

function handleSeedlingInlineCommit(rawValue){
  const value = String(rawValue || "").trim();
  if(value === ""){
    if(hasManualSeedlingCount()){
      invalidateWorkflowMonitorCheckpoint();
      manualSeedlingCount = null;
      renderForecastSummary();
      saveHarvestStateToStorage();
      showToast("苗枚数を自動計算に戻しました");
    }else{
      renderForecastSummary();
    }
    return;
  }

  invalidateWorkflowMonitorCheckpoint();
  manualSeedlingCount = clampNumber(value, 0, 999999, 0);
  renderForecastSummary();
  saveHarvestStateToStorage();
  showToast("苗枚数を手動変更しました");
}

function bindSeedlingInlineInput(){
  const input = document.getElementById("seedlingInlineInput");
  if(!input || input.dataset.bound === "1") return;

  input.addEventListener("focus", () => {
    if(input.dataset.clearedOnFocus === "1") return;
    input.dataset.previousValue = input.value;
    input.dataset.clearedOnFocus = "1";
    input.dataset.enteredSinceFocus = "0";
    input.value = "";
  });
  input.addEventListener("input", () => {
    if(input.dataset.clearedOnFocus === "1"){
      input.dataset.enteredSinceFocus = "1";
    }
  });
  input.addEventListener("keydown", (event) => {
    if(event.key === "Enter"){
      event.preventDefault();
      input.blur();
    }
  });
  input.addEventListener("blur", () => {
    const value = input.value;
    const restorePrevious = input.dataset.clearedOnFocus === "1"
      && input.dataset.enteredSinceFocus !== "1"
      && String(value || "").trim() === "";
    if(restorePrevious){
      input.value = input.dataset.previousValue || "";
    }else{
      handleSeedlingInlineCommit(value);
    }
    delete input.dataset.previousValue;
    delete input.dataset.clearedOnFocus;
    delete input.dataset.enteredSinceFocus;
  });
  input.dataset.bound = "1";
}

function applyManualSeedlingCount(){
  const input = document.getElementById("seedlingInlineInput");
  handleSeedlingInlineCommit(input?.value || "");
}

function clearManualSeedlingCount(){
  manualSeedlingCount = null;
  renderForecastSummary();
  saveHarvestStateToStorage();
  showToast("苗枚数を自動計算に戻しました");
}

function isContinuousFromFront(numbers){
  return numbers.every((number, index) => number === index + 1);
}

function isContinuousFromBack(numbers){
  const start = PALLETS_PER_BED - numbers.length + 1;
  return numbers.every((number, index) => number === start + index);
}

function formatPinDirectionForPartialBed(numbers){
  const selectedCount = numbers.length;
  if(selectedCount <= 0) return "";

  if(isContinuousFromFront(numbers)){
    const remainingCount = PALLETS_PER_BED - selectedCount;
    const takePins = Math.floor(selectedCount / PALLETS_PER_PIN);
    const leavePins = Math.ceil(remainingCount / PALLETS_PER_PIN);

    if(remainingCount > 0 && leavePins > 0 && (takePins <= 0 || leavePins < takePins)){
      return "後ろ" + leavePins + "ピン残す";
    }
    if(takePins > 0) return "前" + takePins + "ピンとる";
    return "前" + selectedCount + "枚とる";
  }

  if(isContinuousFromBack(numbers)){
    const selectedCount = numbers.length;
    const remainingCount = PALLETS_PER_BED - selectedCount;
    const takePins = Math.floor(selectedCount / PALLETS_PER_PIN);
    const leavePins = Math.ceil(remainingCount / PALLETS_PER_PIN);

    if(remainingCount > 0 && leavePins > 0 && (takePins <= 0 || leavePins < takePins)){
      return "前" + leavePins + "ピン残す";
    }
    if(takePins > 0) return "後ろ" + takePins + "ピンとる";
    return "後ろ" + selectedCount + "枚とる";
  }

  return "個別選択";
}

function formatHarvestLocationInstruction(keys = harvestFillKeys, referenceDate = new Date()){
  const selectedKeys = Array.isArray(keys) ? keys : [];
  if(!selectedKeys.length) return "収穫場所: -";

  const groups = {};
  const recordedSet = getHarvestedPalletSet(referenceDate);
  const selectedKeySet = new Set(selectedKeys);
  selectedKeys.forEach(key => {
    const p = parsePalletKey(key);
    if(!BUILDINGS.includes(p.building) || !bedOrder.includes(p.bed) || !Number.isFinite(p.number)) return;
    const groupKey = p.building + "-" + p.bed;
    if(!groups[groupKey]){
      groups[groupKey] = { building: p.building, bed: p.bed, numbers: [] };
    }
    groups[groupKey].numbers.push(p.number);
  });

  const parts = [];
  BUILDINGS.forEach(building => {
    let buildingHasAvailable = false;
    let buildingAllAvailableSelected = true;

    for(const bed of bedOrder){
      for(let number = 1; number <= PALLETS_PER_BED; number++){
        const key = getPalletKey(building, bed, number);
        if(recordedSet.has(key)) continue;
        buildingHasAvailable = true;
        if(!selectedKeySet.has(key)){
          buildingAllAvailableSelected = false;
          break;
        }
      }
      if(!buildingAllAvailableSelected) break;
    }

    if(buildingHasAvailable && buildingAllAvailableSelected){
      parts.push(building + "号棟全部");
      return;
    }

    const fullBeds = [];
    const partialParts = [];

    bedOrder.forEach(bed => {
      const group = groups[building + "-" + bed];
      if(!group) return;

      const numbers = [...new Set(group.numbers)].sort((a, b) => a - b);
      const selectedSet = new Set(numbers);
      let allAvailableSelected = false;
      let hasAvailable = false;

      for(let number = 1; number <= PALLETS_PER_BED; number++){
        const key = getPalletKey(building, bed, number);
        if(recordedSet.has(key)) continue;
        hasAvailable = true;
        if(!selectedSet.has(number)){
          allAvailableSelected = false;
          break;
        }
        allAvailableSelected = true;
      }

      if(numbers.length >= PALLETS_PER_BED || (hasAvailable && allAvailableSelected)){
        fullBeds.push(bed);
        return;
      }

      const direction = formatPinDirectionForPartialBed(numbers);
      partialParts.push(bed + " " + direction);
    });

    const buildingParts = [];
    if(fullBeds.length){
      buildingParts.push(fullBeds.join(",") + "全部");
    }
    partialParts.forEach(part => buildingParts.push(part));
    if(buildingParts.length){
      parts.push(building + "号棟 " + buildingParts.join("、"));
    }
  });

  if(!parts.length) return "収穫場所: -";
  if(parts.length === 1) return "収穫場所: " + parts[0];
  return "収穫場所: " + parts.join("\n");
}

function getPlantingSummaryFromSelection(){
  return formatPalletSummary(harvestFillKeys);
}

function formatPlantingSummaryForKeys(keys){
  return formatPalletSummary(Array.isArray(keys) ? keys : []);
}

function syncRecordPlantingSummaryFromSelection(options = {}){
  const input = document.getElementById("recordPlantingSummaryInput");
  if(!input) return;
  if(recordSelectionMode !== "planting" && !options.force){
    return;
  }
  if(recordPlantingSummaryEdited && !options.force) return;
  input.value = recordSelectionMode === "planting" ? getPlantingSummaryFromSelection() : "";
}

function getPlannedSeedlingTrayCountForRecord(){
  const plannedKeys = Array.isArray(recordBaseFillKeys) && recordBaseFillKeys.length
    ? recordBaseFillKeys
    : harvestFillKeys;
  const seedlingCounts = getSeedlingInstructionCounts(plannedKeys);
  if(hasManualSeedlingCount()){
    return getDisplayedSeedlingCount(seedlingCounts.totalCount);
  }
  return seedlingCounts.totalCount;
}

function syncRecordActualSeedlingTrayCountInput(record = getActivePlantingRecord(), options = {}){
  const input = document.getElementById("recordActualSeedlingTrayCountInput");
  if(!input) return;
  if(!record || record.type !== "fullHarvest"){
    if(options.force) input.value = "";
    updateRecordAutoValueNotes();
    return;
  }
  if(input.dataset.userEdited === "1" && !options.force){
    updateRecordAutoValueNotes();
    return;
  }
  const value = clampNumber(record.actualSeedlingTrayCount, 0, 999999, 0) || clampNumber(record.plannedSeedlingTrayCount, 0, 999999, 0);
  input.value = value > 0 ? String(value) : "";
  updateRecordAutoValueNotes();
}

function getRecordById(id){
  return findHarvestRecordByIdentity({ id });
}

function getRecordByUuid(recordUuid){
  return findHarvestRecordByIdentity({ recordUuid }, records);
}

function getActivePlantingRecord(){
  return getRecordById(activePlantingRecordId);
}

function getPlantingResumeCandidateRecordIdSet(options = {}){
  const editingEvent = editingPlantingEventId ? getPlantingEventById(editingPlantingEventId) : null;
  const referenceDate = parseDateOnlyString(String(
    options.referenceDate || editingEvent?.plantingDate || ""
  ).trim());
  const candidateIds = new Set(
    [...records]
      .filter(record => record?.type === "fullHarvest")
      .filter(record => {
        if(!referenceDate) return true;
        const recordDate = parseDateOnlyString(String(record?.date || "").trim());
        return !!recordDate && recordDate.getTime() <= referenceDate.getTime();
      })
      .sort(compareRecordsByDateDesc)
      .slice(0, PLANTING_RESUME_RECORD_LIMIT)
      .map(record => Number(record.id))
      .filter(Number.isFinite)
  );

  // 自動再開は直近3件に絞るが、選択可能な未定植場所にはこの上限を使わない。
  (editingEvent?.sourceAllocations || []).forEach(allocation => {
    const recordId = Number(allocation.harvestRecordId);
    if(Number.isFinite(recordId)) candidateIds.add(recordId);
  });
  return candidateIds;
}

function getLatestPendingPlantingRecord(){
  const candidateIds = getPlantingResumeCandidateRecordIdSet();
  const state = getPlantingEventStateIndex();
  return [...records]
    .filter(record => record?.type === "fullHarvest" && candidateIds.has(Number(record.id)))
    .sort(compareRecordsByDateDesc)
    .find(record => (
      !state.noPlantingCompletedHarvestIds.has(Number(record.id))
      && getUnplantedPalletKeysForHarvest(record.id).length > 0
    )) || null;
}

function shouldOfferPlantingRecordResume(record){
  if(!record || record.type !== "fullHarvest") return false;
  const state = getPlantingEventStateIndex();
  return getPlantingResumeCandidateRecordIdSet().has(Number(record.id))
    && !state.noPlantingCompletedHarvestIds.has(Number(record.id))
    && getUnplantedPalletKeysForHarvest(record.id).length > 0;
}

function getStartupPlantingRecordToResume(savedHarvestState = null){
  if(savedHarvestState?.recordSelectionMode === "planting" && editingPlantingEventId){
    const editingEvent = getPlantingEventById(editingPlantingEventId);
    const sourceRecord = getRecordById(editingEvent?.sourceAllocations?.[0]?.harvestRecordId);
    if(sourceRecord?.type === "fullHarvest") return sourceRecord;
  }
  if(savedHarvestState?.recordSelectionMode === "planting" && savedHarvestState.workflowPlantingSessionActive){
    const savedRecord = getRecordById(savedHarvestState.activePlantingRecordId);
    if(savedRecord?.type === "fullHarvest" && shouldOfferPlantingRecordResume(savedRecord)){
      return savedRecord;
    }
  }
  return null;
}

function getPreviousFullHarvestRecord(options = {}){
  const excludeId = Number(options.excludeRecordId);
  const orderedRecords = [...records]
    .filter(record => record?.type === "fullHarvest")
    .sort(compareRecordsByDateDesc);

  if(Number.isFinite(excludeId)){
    const activeIndex = orderedRecords.findIndex(record => Number(record.id) === excludeId);
    if(activeIndex >= 0){
      return orderedRecords[activeIndex + 1] || null;
    }
    return orderedRecords.find(record => Number(record.id) !== excludeId) || null;
  }

  return orderedRecords[0] || null;
}

function getUnplantedPalletSet(options = {}){
  const state = options.excludeEventId
    ? buildPlantingEventStateIndex({ excludeEventId: options.excludeEventId })
    : getPlantingEventStateIndex();
  return new Set(state.allowedPalletSet);
}

function getUnselectedPreviousUnplantedPalletLots(sourceAllocations, activeRecord, options = {}){
  if(!activeRecord || activeRecord.type !== "fullHarvest") return [];
  const plantingDate = parseDateOnlyString(String(options.plantingDate || "").trim());
  if(!plantingDate) return [];
  const state = options.excludeEventId
    ? buildPlantingEventStateIndex({ excludeEventId: options.excludeEventId })
    : getPlantingEventStateIndex();
  const noPlantingCompletedHarvestIds = new Set(state.noPlantingCompletedHarvestIds);
  const excludedEvent = options.excludeEventId
    ? getPlantingEventById(options.excludeEventId)
    : null;
  if(isNoPlantingEvent(excludedEvent)){
    excludedEvent.sourceAllocations.forEach(allocation => {
      noPlantingCompletedHarvestIds.add(Number(allocation.harvestRecordId));
    });
  }
  const selectedLotKeys = new Set(
    (Array.isArray(sourceAllocations) ? sourceAllocations : []).flatMap(allocation => (
      (Array.isArray(allocation?.palletKeys) ? allocation.palletKeys : []).map(palletKey => (
        getPlantingLotKey(allocation.harvestRecordId, palletKey)
      ))
    ))
  );
  const missingLots = [];

  state.pendingByHarvestId.forEach((pendingKeys, harvestRecordId) => {
    const safeHarvestRecordId = Number(harvestRecordId);
    if(!Number.isFinite(safeHarvestRecordId)
      || noPlantingCompletedHarvestIds.has(safeHarvestRecordId)) return;
    const harvestRecord = state.harvestById.get(safeHarvestRecordId)?.record;
    const harvestDate = parseDateOnlyString(String(harvestRecord?.date || "").trim());
    // 「以前」は収穫元の並び順ではなく日付で判定する。
    // 苗植え日と同じ日に収穫した未定植場所は警告対象にしない。
    if(!harvestDate || harvestDate.getTime() >= plantingDate.getTime()) return;
    pendingKeys.forEach(palletKey => {
      if(selectedLotKeys.has(getPlantingLotKey(safeHarvestRecordId, palletKey))) return;
      missingLots.push({ harvestRecordId: safeHarvestRecordId, palletKey });
    });
  });

  return missingLots.sort((a, b) => {
    const recordOrder = compareRecordsByDateDesc(
      state.harvestById.get(a.harvestRecordId)?.record,
      state.harvestById.get(b.harvestRecordId)?.record
    );
    return recordOrder || getOrderIndexFromKey(a.palletKey) - getOrderIndexFromKey(b.palletKey);
  });
}

function formatUnselectedPreviousUnplantedPalletLots(lots){
  const groupedByHarvestRecord = new Map();
  (Array.isArray(lots) ? lots : []).forEach(lot => {
    const harvestRecordId = Number(lot?.harvestRecordId);
    const palletKey = String(lot?.palletKey || "").trim();
    if(!Number.isFinite(harvestRecordId) || !isValidPalletKeyString(palletKey)) return;
    if(!groupedByHarvestRecord.has(harvestRecordId)){
      groupedByHarvestRecord.set(harvestRecordId, []);
    }
    groupedByHarvestRecord.get(harvestRecordId).push(palletKey);
  });

  return [...groupedByHarvestRecord.entries()].map(([harvestRecordId, palletKeys]) => {
    const sourceRecord = getRecordById(harvestRecordId);
    const dateLabel = String(sourceRecord?.date || "").trim() || "日付不明";
    const uniqueKeys = [...new Set(palletKeys)]
      .sort((a, b) => getOrderIndexFromKey(a) - getOrderIndexFromKey(b));
    return `${dateLabel}の収穫\n${formatPlantingSummaryForKeys(uniqueKeys)}`;
  }).join("\n\n");
}

function invalidatePlantingAllowedPalletSetCache(){
  plantingAllowedPalletSetCache = null;
  plantingAllowedPalletSetCacheRecordId = null;
  plantingAllowedPalletSetCacheRecordCount = 0;
  plantingAllowedPalletSetCacheEventId = null;
}

function getFastPlantingAllowedPalletSet(){
  const activeRecord = getActivePlantingRecord();
  if(plantingAllowedPalletSetCache
    && Number(plantingAllowedPalletSetCacheRecordId) === Number(activeRecord?.id)
    && plantingAllowedPalletSetCacheRecordCount === records.length
    && Number(plantingAllowedPalletSetCacheEventId) === Number(editingPlantingEventId)){
    return plantingAllowedPalletSetCache;
  }
  return getPlantingAllowedPalletSet();
}

function getPlantingAllowedPalletSet(options = {}){
  const activeRecord = getActivePlantingRecord();
  if(options.fast){
    return getFastPlantingAllowedPalletSet();
  }

  const activeRecordId = Number(activeRecord?.id);
  if(
    plantingAllowedPalletSetCache &&
    Number(plantingAllowedPalletSetCacheRecordId) === activeRecordId &&
    plantingAllowedPalletSetCacheRecordCount === records.length &&
    Number(plantingAllowedPalletSetCacheEventId) === Number(editingPlantingEventId)
  ){
    return plantingAllowedPalletSetCache;
  }

  const allowed = getUnplantedPalletSet({ excludeEventId: editingPlantingEventId });
  harvestFillKeys.forEach(key => allowed.add(key));

  plantingAllowedPalletSetCache = new Set(allowed);
  plantingAllowedPalletSetCacheRecordId = activeRecordId;
  plantingAllowedPalletSetCacheRecordCount = records.length;
  plantingAllowedPalletSetCacheEventId = editingPlantingEventId;
  return plantingAllowedPalletSetCache;
}

function isPlantingSelectionAllowed(key, options = {}){
  return getPlantingAllowedPalletSet(options).has(key);
}

function enterHarvestRecordMode(){
  recordSelectionMode = "harvest";
  recordAdditionalBuildings = [];
  activePlantingRecordId = null;
  workflowPlantingSessionActive = false;
  editingPlantingEventId = null;
  plantingRecordDraft = null;
  recordPlantingCountPreset = 20;
  recordPlantingCountsByPallet = {};
  resetRecordPlantingFlow();
  recordPlantingSummaryEdited = false;
  const input = document.getElementById("recordActualSeedlingTrayCountInput");
  if(input) delete input.dataset.userEdited;
  updateTodayHarvestRecordedStatus();
  refreshRecordModeUi();
}

function enterPlantingRecordMode(record, options = {}){
  if(!record) return;
  closeRecordFloatingUi();
  harvestEditReturnPlantingRecordId = null;
  recordViewMode = "entry";
  recordSelectionMode = "planting";
  activePlantingRecordId = Number(record.id);
  workflowPlantingSessionActive = true;
  recordPlantingSummaryEdited = false;
  editingHarvestRecordId = null;
  applyPlantingRecordDraft(record);
  if(!options.resumeFlow || !recordPlantingFlowEnabled) initializeRecordPlantingFlow();
  if(harvestFillKeys.length){
    recalcHarvestSummary();
  }else{
    harvestSummary = null;
  }
  updateTodayHarvestRecordedStatus();
  refreshRecordModeUi();
  if(options.save !== false) saveHarvestStateToStorage();
  drawRecordBeds();
  runAfterUiSettles(() => {
    drawBeds();
    renderForecastSummary();
  });
  requestAnimationFrame(() => requestAnimationFrame(scrollToRecordActiveStage));
}

function isRecordEditMode(){
  return !!editingHarvestRecordId || !!editingPlantingEventId;
}

function normalizeRecordHarvestStage(value){
  return RECORD_HARVEST_STAGES.includes(value) ? value : "location";
}

function parseRecordPartialHarvestBedKey(value){
  const match = /^(\d+)-([A-F])$/.exec(String(value || "").trim());
  if(!match) return null;
  const building = Number(match[1]);
  const bed = match[2];
  return BUILDINGS.includes(building) && bedOrder.includes(bed) ? { building, bed } : null;
}

function getRecordPartialHarvestBedKey(building, bed){
  const normalizedBuilding = Number(building);
  const normalizedBed = String(bed || "").trim().toUpperCase();
  return BUILDINGS.includes(normalizedBuilding) && bedOrder.includes(normalizedBed)
    ? `${normalizedBuilding}-${normalizedBed}`
    : "";
}

function normalizeRecordPartialHarvestBedKeys(values){
  const unique = new Map();
  (Array.isArray(values) ? values : []).forEach(value => {
    const parsed = parseRecordPartialHarvestBedKey(value);
    if(parsed) unique.set(`${parsed.building}-${parsed.bed}`, parsed);
  });
  return [...unique.values()]
    .sort((left, right) => (
      left.building - right.building
      || bedOrder.indexOf(left.bed) - bedOrder.indexOf(right.bed)
    ))
    .map(item => `${item.building}-${item.bed}`);
}

function normalizeRecordPartialHarvestEntries(values){
  const usedBedKeys = new Set();
  const entries = [];
  (Array.isArray(values) ? values : []).forEach(value => {
    const source = value && typeof value === "object" ? value : {};
    const cases = getStrictIntegerInRange(source.cases, 1, RECORD_MAX_CASES);
    const bedKeys = normalizeRecordPartialHarvestBedKeys(source.bedKeys)
      .filter(key => !usedBedKeys.has(key));
    if(cases === null || !bedKeys.length) return;
    bedKeys.forEach(key => usedBedKeys.add(key));
    entries.push({ bedKeys, cases:String(cases) });
  });
  return entries;
}

function normalizeRecordPartialHarvestDraft(value){
  const source = value && typeof value === "object" ? value : {};
  let bedKeys = normalizeRecordPartialHarvestBedKeys(source.bedKeys);
  let cases = source.cases === null || source.cases === undefined
    ? ""
    : String(source.cases).trim().slice(0, 12);
  let entries = normalizeRecordPartialHarvestEntries(source.entries);
  if(!Array.isArray(source.entries)){
    const legacyCases = getStrictIntegerInRange(cases, 1, RECORD_MAX_CASES);
    if(bedKeys.length && legacyCases !== null){
      entries = [{ bedKeys:[...bedKeys], cases:String(legacyCases) }];
      bedKeys = [];
      cases = "";
    }
  }
  const requestedEditingIndex = Number(source.editingEntryIndex);
  const editingEntryIndex = Number.isInteger(requestedEditingIndex)
    && requestedEditingIndex >= 0
    && requestedEditingIndex < entries.length
      ? requestedEditingIndex
      : -1;
  return {
    entries,
    bedKeys,
    cases,
    editingEntryIndex
  };
}

function getRecordPartialHarvestDraftModel(value){
  const usesCurrentDraft = arguments.length === 0;
  const normalized = normalizeRecordPartialHarvestDraft(
    usesCurrentDraft ? recordPartialHarvestDraft : value
  );
  if(usesCurrentDraft) recordPartialHarvestDraft = normalized;
  const activeCases = getStrictIntegerInRange(normalized.cases, 1, RECORD_MAX_CASES);
  const hasActiveBeds = normalized.bedKeys.length > 0;
  const hasActiveCases = String(normalized.cases || "").trim() !== "";
  const activeIsEmpty = !hasActiveBeds && !hasActiveCases;
  const activeIsValid = hasActiveBeds && activeCases !== null;
  const committedEntries = normalized.entries.map(entry => ({
    bedKeys:[...entry.bedKeys],
    cases:entry.cases
  }));
  const entries = committedEntries.map(entry => ({ ...entry, bedKeys:[...entry.bedKeys] }));
  if(activeIsValid){
    const activeEntry = { bedKeys:[...normalized.bedKeys], cases:String(activeCases) };
    if(normalized.editingEntryIndex >= 0) entries[normalized.editingEntryIndex] = activeEntry;
    else entries.push(activeEntry);
  }
  const allBedKeys = normalizeRecordPartialHarvestBedKeys([
    ...entries.flatMap(entry => entry.bedKeys),
    ...normalized.bedKeys
  ]);
  const totalCases = entries.reduce((total, entry) => total + Number(entry.cases || 0), 0);
  return {
    ...normalized,
    entries,
    committedEntries,
    allBedKeys,
    activeCasesValue:activeCases === null ? 0 : activeCases,
    activeIsEmpty,
    activeIsValid,
    casesValue:totalCases,
    entryCount:entries.length,
    bedCount:allBedKeys.length,
    isEmpty:committedEntries.length === 0 && activeIsEmpty,
    isValid:entries.length > 0 && (activeIsEmpty || activeIsValid)
  };
}

function getRecordPartialHarvestDraftCases(){
  const draft = getRecordPartialHarvestDraftModel();
  return draft.casesValue;
}

function getRecordPartialHarvestDraftTimelineRecords(
  dateStr = getHarvestTargetDateString(),
  draft = recordPartialHarvestDraft
){
  const date = String(dateStr || "").trim();
  if(!parseDateOnlyString(date)) return [];
  const sourceRecords = getActiveHarvestTimelineRecords(records);
  const targetContext = getRecordPartialHarvestTargetContext(date, sourceRecords, harvestFillKeys);
  return getRecordPartialHarvestDraftModel(draft).entries.map((entry, index) => ({
    id:-(index + 1),
    type:"partialHarvest",
    date,
    cases:Number(entry.cases),
    targets:buildPartialHarvestTargetsForRecordBeds(entry.bedKeys, entry.cases, targetContext),
    palletKeys:[]
  })).filter(record => record.targets.length > 0);
}

function invalidateForecastHarvestTimelineCache(){
  forecastHarvestTimelineCache = null;
  forecastHarvestTimelineCacheRecords = records;
  forecastHarvestTimelineCacheSignature = "";
}

function getForecastHarvestTimelineRecords(sourceRecords = records){
  if(sourceRecords !== records) return sourceRecords;
  const draftRecords = getRecordPartialHarvestDraftTimelineRecords();
  if(!draftRecords.length){
    invalidateForecastHarvestTimelineCache();
    return sourceRecords;
  }
  const signature = JSON.stringify(draftRecords.map(record => [
    record.date,
    record.cases,
    record.targets.map(target => [
      target.building,
      target.bed,
      target.start,
      target.end,
      target.plantsPerPallet
    ])
  ]));
  if(forecastHarvestTimelineCache
    && forecastHarvestTimelineCacheRecords === sourceRecords
    && forecastHarvestTimelineCacheSignature === signature){
    return forecastHarvestTimelineCache;
  }
  forecastHarvestTimelineCache = [...draftRecords, ...sourceRecords];
  forecastHarvestTimelineCacheRecords = sourceRecords;
  forecastHarvestTimelineCacheSignature = signature;
  return forecastHarvestTimelineCache;
}

function getRecordRegularHarvestCases(totalCases, dateStr, options = {}){
  return getRegularHarvestCases(totalCases, dateStr, {
    ...options,
    additionalPartialCases:getRecordPartialHarvestDraftCases()
  });
}

function formatRecordPartialHarvestBedLocations(bedKeys){
  const targetBedKeys = arguments.length > 0
    ? bedKeys
    : getRecordPartialHarvestDraftModel().allBedKeys;
  const grouped = new Map();
  normalizeRecordPartialHarvestBedKeys(targetBedKeys).forEach(key => {
    const parsed = parseRecordPartialHarvestBedKey(key);
    if(!parsed) return;
    if(!grouped.has(parsed.building)) grouped.set(parsed.building, []);
    grouped.get(parsed.building).push(parsed.bed);
  });
  return [...grouped.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([building, beds]) => `${building}号棟${beds.join("・")}ベッド`)
    .join("、");
}

function formatRecordPartialHarvestEntry(entry){
  const normalized = normalizeRecordPartialHarvestEntries([entry])[0];
  if(!normalized) return "";
  return `${normalized.cases}ケース / ${formatRecordPartialHarvestBedLocations(normalized.bedKeys)}`;
}

function renderRecordPartialHarvestControl(){
  const button = document.getElementById("recordPartialHarvestModeBtn");
  const value = document.getElementById("recordPartialHarvestStatusValue");
  const saveCard = document.getElementById("recordSaveCard");
  const hint = document.querySelector("#recordHarvestLocationSection .bedDetailOpenHint");
  const notice = document.getElementById("recordEditNotice");
  const draft = getRecordPartialHarvestDraftModel();
  if(button){
    button.disabled = recordSelectionMode === "planting" || !!editingHarvestRecordId;
    button.classList.toggle("is-selecting", recordPartialHarvestSelectionMode);
    button.classList.toggle("has-draft", !recordPartialHarvestSelectionMode && draft.isValid);
    button.setAttribute("aria-pressed", String(recordPartialHarvestSelectionMode));
    button.setAttribute(
      "aria-label",
      recordPartialHarvestSelectionMode
        ? (draft.activeIsEmpty
            ? `部分収穫場所を選択中。${draft.entryCount}件追加済み`
            : `部分収穫 ${draft.bedKeys.length}ベッドのケース数を入力中`)
        : (draft.isValid
            ? `部分収穫 ${draft.entryCount}件、${draft.bedCount}ベッド、合計${draft.casesValue}ケース。追加または変更する`
            : "部分収穫を追加")
    );
  }
  if(value){
    value.textContent = recordPartialHarvestSelectionMode
      ? (draft.activeIsEmpty ? `${draft.entryCount}件追加済み` : `${draft.bedKeys.length}ベッド選択中`)
      : (draft.isValid ? `${draft.entryCount}件・${draft.casesValue}ケース` : "追加");
  }
  if(saveCard) saveCard.classList.toggle("recordPartialHarvestSelectionMode", recordPartialHarvestSelectionMode);
  if(hint){
    hint.textContent = recordPartialHarvestSelectionMode
      ? "ベッドをタップして部分収穫場所を選択してください"
      : "ベッドをタップすると拡大し、パレットを選択できます";
  }
  if(notice && recordSelectionMode === "harvest" && recordHarvestStage === "location"){
    notice.textContent = recordPartialHarvestSelectionMode
      ? (draft.activeIsValid
          ? "別のベッドを選ぶと、現在の内容を追加して次の入力へ進みます"
          : draft.bedKeys.length > 1
          ? `選択した${draft.bedKeys.length}ベッド合計のケース数を入力して下さい`
          : (draft.bedKeys.length === 1
              ? "選択したベッドのケース数を入力して下さい"
              : "部分収穫したベッドを選択して下さい"))
      : "実際に収穫した場所を選択して下さい";
  }
}

function startRecordPartialHarvestSelection(){
  if(recordSelectionMode !== "harvest") return;
  if(editingHarvestRecordId){
    showToast("保存済みの収穫記録を編集中は、部分収穫を追加できません");
    return;
  }
  if(recordPartialHarvestSelectionMode) return;
  recordPartialHarvestDraft = normalizeRecordPartialHarvestDraft(recordPartialHarvestDraft);
  recordPartialHarvestDraftSnapshot = {
    draft:normalizeRecordPartialHarvestDraft(recordPartialHarvestDraft),
    additionalBuildings:[...recordAdditionalBuildings],
    activeBuilding:recordHarvestActiveBuilding,
    visitedBuildings:[...recordHarvestVisitedBuildings],
    returnStage:normalizeRecordHarvestStage(recordHarvestStage),
    primaryInputsExpanded:recordHarvestPrimaryInputsExpanded
  };
  recordPartialHarvestSelectionMode = true;
  recordHarvestStage = "location";
  recordHarvestPrimaryInputsExpanded = false;
  const draftBuildings = getRecordPartialHarvestDraftModel().allBedKeys
    .map(key => parseRecordPartialHarvestBedKey(key)?.building)
    .filter(building => BUILDINGS.includes(building));
  const displayedBuildings = getRecordMapBuildings();
  const fallbackBuilding = BUILDINGS.includes(Number(recordHarvestActiveBuilding))
    ? Number(recordHarvestActiveBuilding)
    : (BUILDINGS.includes(Number(currentBuilding)) ? Number(currentBuilding) : BUILDINGS[0]);
  if(!displayedBuildings.length && !draftBuildings.length && !recordAdditionalBuildings.includes(fallbackBuilding)){
    recordAdditionalBuildings.push(fallbackBuilding);
  }
  const nextBuildings = getRecordMapBuildings();
  if(!nextBuildings.includes(Number(recordHarvestActiveBuilding))){
    recordHarvestActiveBuilding = nextBuildings[0] || fallbackBuilding;
  }
  const chooser = document.getElementById("recordBuildingAddChooser");
  if(chooser) chooser.hidden = true;
  renderRecordHarvestWorkflowUi();
  drawRecordBeds();
  updateRecordActualLoss();
  scheduleHarvestStateSave();
}

function commitRecordPartialHarvestActiveEntry(draft, nextBedKeys = []){
  if(!draft?.activeIsValid) return false;
  const previousPartialCases = draft.committedEntries.reduce((total, entry) => (
    total + Number(entry.cases || 0)
  ), 0);
  recordPartialHarvestDraft = normalizeRecordPartialHarvestDraft({
    entries:draft.entries,
    bedKeys:nextBedKeys,
    cases:"",
    editingEntryIndex:-1
  });
  const fixedCasesInput = document.getElementById("recordPartialHarvestCasesInput");
  if(fixedCasesInput) fixedCasesInput.value = "";
  const nextPartialCases = getRecordPartialHarvestDraftCases();
  const totalInput = document.getElementById("recordCasesInput");
  const totalText = String(totalInput?.value || "").trim();
  if(totalInput && !harvestFillKeys.length && (!totalText || Number(totalText) <= previousPartialCases)){
    totalInput.value = String(nextPartialCases);
    recordCasesEdited = true;
  }
  return true;
}

function toggleSharedPartialHarvestDraftBed(building, bed){
  const key = getRecordPartialHarvestBedKey(building, bed);
  if(!key) return { changed:false, message:"" };
  const normalizedDraft = normalizeRecordPartialHarvestDraft(recordPartialHarvestDraft);
  const selected = new Set(normalizedDraft.bedKeys || []);
  if(selected.has(key)){
    selected.delete(key);
  }else{
    const assignedEntryIndex = normalizedDraft.entries.findIndex((entry, index) => (
      index !== normalizedDraft.editingEntryIndex && entry.bedKeys.includes(key)
    ));
    if(assignedEntryIndex >= 0){
      if(selected.size || normalizedDraft.cases || normalizedDraft.editingEntryIndex >= 0){
        return { changed:false, message:"このベッドは別の部分収穫として追加済みです" };
      }
      const assignedEntry = normalizedDraft.entries[assignedEntryIndex];
      recordPartialHarvestDraft = {
        ...normalizedDraft,
        bedKeys:[...assignedEntry.bedKeys],
        cases:assignedEntry.cases,
        editingEntryIndex:assignedEntryIndex
      };
      return { changed:true, loadedEntry:true };
    }
    const draftModel = getRecordPartialHarvestDraftModel(normalizedDraft);
    if(draftModel.activeIsValid){
      commitRecordPartialHarvestActiveEntry(draftModel, [key]);
      return { changed:true, committedPrevious:true };
    }
    selected.add(key);
  }
  recordPartialHarvestDraft = {
    ...normalizedDraft,
    bedKeys:normalizeRecordPartialHarvestBedKeys([...selected])
  };
  return { changed:true };
}

function setSharedPartialHarvestDraftCases(value){
  recordPartialHarvestDraft = {
    ...normalizeRecordPartialHarvestDraft(recordPartialHarvestDraft),
    cases:String(value ?? "").trim().slice(0, 12)
  };
  return getRecordPartialHarvestDraftModel();
}

function toggleRecordPartialHarvestBed(building, bed){
  if(!recordPartialHarvestSelectionMode) return;
  const result = toggleSharedPartialHarvestDraftBed(building, bed);
  if(result.message){
    showToast(result.message);
    return;
  }
  if(!result.changed) return;
  if(result.committedPrevious) syncHarvestProgressPartialEntriesFromRecordDraft();
  const fixedCasesInput = document.getElementById("recordPartialHarvestCasesInput");
  if(fixedCasesInput) fixedCasesInput.value = getRecordPartialHarvestDraftModel().cases;
  drawRecordBeds();
  updateRecordActualLoss();
  scheduleHarvestStateSave();
}

function handleRecordPartialHarvestCasesInput(value){
  if(!recordPartialHarvestSelectionMode) return;
  setSharedPartialHarvestDraftCases(value);
  renderRecordPartialHarvestControl();
  updateRecordActualLoss();
  scheduleHarvestStateSave();
}

function finishRecordPartialHarvestSelection(options = {}){
  const snapshot = recordPartialHarvestDraftSnapshot;
  if(options.cancel && snapshot){
    recordPartialHarvestDraft = normalizeRecordPartialHarvestDraft(snapshot.draft);
    recordAdditionalBuildings = [...snapshot.additionalBuildings];
    recordHarvestActiveBuilding = snapshot.activeBuilding;
    recordHarvestVisitedBuildings = [...snapshot.visitedBuildings];
  }else if(options.cancel){
    const draft = normalizeRecordPartialHarvestDraft(recordPartialHarvestDraft);
    recordPartialHarvestDraft = normalizeRecordPartialHarvestDraft({
      entries:draft.entries,
      bedKeys:[],
      cases:"",
      editingEntryIndex:-1
    });
  }
  recordPartialHarvestSelectionMode = false;
  recordHarvestStage = snapshot?.returnStage === "confirm" ? "confirm" : "location";
  recordHarvestPrimaryInputsExpanded = options.cancel
    ? !!snapshot?.primaryInputsExpanded
    : false;
  recordPartialHarvestDraftSnapshot = null;
  syncHarvestProgressPartialEntriesFromRecordDraft();
  renderRecordHarvestWorkflowUi();
  if(recordHarvestStage === "location") drawRecordBeds();
  updateRecordActualLoss();
  scheduleHarvestStateSave();
}

function completeRecordPartialHarvestSelection(){
  const draft = getRecordPartialHarvestDraftModel();
  if(!draft.bedKeys.length){
    showToast("部分収穫したベッドを選択してください");
    return;
  }
  if(!draft.activeIsValid){
    showToast("部分収穫のケース数を1以上の整数で入力してください");
    document.getElementById("recordPartialHarvestCasesInput")?.focus();
    return;
  }
  commitRecordPartialHarvestActiveEntry(draft);
  syncHarvestProgressPartialEntriesFromRecordDraft();
  renderRecordHarvestWorkflowUi();
  drawRecordBeds();
  updateRecordActualLoss();
  scheduleHarvestStateSave();
}

function cancelRecordPartialHarvestSelection(){
  finishRecordPartialHarvestSelection({ cancel:true });
}

function resetRecordPartialHarvestDraft(){
  recordPartialHarvestSelectionMode = false;
  recordPartialHarvestDraft = { entries:[], bedKeys:[], cases:"", editingEntryIndex:-1 };
  recordPartialHarvestDraftSnapshot = null;
  syncHarvestProgressPartialEntriesFromRecordDraft();
  renderRecordPartialHarvestControl();
}

function getRecordHarvestStageIndex(){
  return RECORD_HARVEST_STAGES.indexOf(normalizeRecordHarvestStage(recordHarvestStage));
}

function getRecordHarvestTargetBuildings(){
  return [...new Set((harvestFillKeys || []).map(key => parsePalletKey(key).building))]
    .filter(building => BUILDINGS.includes(building))
    .sort((a, b) => a - b);
}

function getRecordHarvestUnvisitedTargetBuildings(){
  const visited = new Set((recordHarvestVisitedBuildings || []).map(Number));
  return getRecordHarvestTargetBuildings().filter(building => !visited.has(building));
}

function updateRecordPastDateNotice(){
  const notice = document.getElementById("recordPastDateNotice");
  if(!notice) return;
  const selectedDate = document.getElementById("recordDateInput")?.value || "";
  const today = formatDateOnlyString(new Date());
  notice.hidden = !selectedDate || selectedDate >= today;
}

function appendRecordHarvestConfirmItem(container, label, value, stage){
  const button = document.createElement("button");
  button.type = "button";
  button.className = "recordHarvestConfirmItem";
  if(stage === "cases"){
    button.dataset.uiClick = "openRecordHarvestPrimaryInputs";
  }else if(stage === "partial"){
    button.dataset.uiClick = "startRecordPartialHarvestSelection";
  }else{
    button.dataset.uiClick = "openRecordHarvestStage";
    button.dataset.uiArg = stage;
  }
  const labelElement = document.createElement("span");
  labelElement.textContent = label;
  const valueElement = document.createElement("strong");
  valueElement.textContent = value || "未入力";
  const editElement = document.createElement("span");
  editElement.className = "recordHarvestConfirmEdit";
  editElement.textContent = "変更";
  button.append(labelElement, valueElement, editElement);
  container.appendChild(button);
}

function renderRecordHarvestConfirmation(){
  const container = document.getElementById("recordHarvestConfirmSummary");
  if(!container) return;
  container.innerHTML = "";
  const date = document.getElementById("recordDateInput")?.value || "";
  const cases = clampNumber(document.getElementById("recordCasesInput")?.value || 0, 0, 999999, 0);
  const regularCases = getRecordRegularHarvestCases(cases, date);
  const partialDraft = getRecordPartialHarvestDraftModel();
  const location = document.getElementById("recordPalletSummaryInput")?.value.trim() || "";
  const lossDisplay = document.getElementById("recordActualLossInput");
  const lossLabel = lossDisplay?.classList.contains("estimated") ? "推定ロス率" : "実際のロス率";
  const quality = formatQualityMemo(getSelectedQualityMemo()) || "選択なし";
  appendRecordHarvestConfirmItem(container, "日付", date || "未入力", "cases");
  appendRecordHarvestConfirmItem(container, "ケース数", cases > 0 ? `${cases}ケース` : "未入力", "cases");
  if(partialDraft.isValid){
    appendRecordHarvestConfirmItem(
      container,
      "部分収穫",
      partialDraft.entries.map(formatRecordPartialHarvestEntry).filter(Boolean).join("、"),
      "partial"
    );
  }
  if(regularCases > 0){
    appendRecordHarvestConfirmItem(container, "通常収穫場所", location || "未選択", "location");
    appendRecordHarvestConfirmItem(container, lossLabel, lossDisplay?.textContent || "--", "location");
    appendRecordHarvestConfirmItem(container, "品質", quality, "quality");
  }else{
    appendRecordHarvestConfirmItem(container, "通常収穫", "なし", "location");
  }
}

function renderRecordHarvestFixedNavigation(){
  const nav = document.getElementById("recordHarvestFixedNav");
  const backButton = document.getElementById("recordHarvestBackBtn");
  const summaryButton = document.getElementById("recordHarvestSummaryBtn");
  const summaryDate = document.getElementById("recordHarvestSummaryDate");
  const summaryCases = document.getElementById("recordHarvestSummaryCases");
  const partialEditor = document.getElementById("recordPartialHarvestFixedEditor");
  const partialEditorLabel = partialEditor?.querySelector("span:first-child");
  const partialCasesInput = document.getElementById("recordPartialHarvestCasesInput");
  const nextButton = document.getElementById("recordHarvestNextBtn");
  const isVisible = recordSelectionMode === "harvest" && recordViewMode === "entry";
  if(nav) nav.hidden = !isVisible;
  if(!isVisible || !backButton || !nextButton) return;

  if(recordPartialHarvestSelectionMode){
    const draft = getRecordPartialHarvestDraftModel();
    if(summaryButton) summaryButton.hidden = true;
    if(partialEditor) partialEditor.hidden = false;
    if(partialEditorLabel){
      if(draft.bedKeys.length === 1){
        const target = parseRecordPartialHarvestBedKey(draft.bedKeys[0]);
        partialEditorLabel.textContent = target ? `${target.building}号棟${target.bed}` : "部分収穫";
      }else{
        partialEditorLabel.textContent = draft.bedKeys.length > 1
          ? `${draft.bedKeys.length}ベッド合計`
          : "部分収穫";
      }
    }
    if(partialCasesInput){
      if(document.activeElement !== partialCasesInput) partialCasesInput.value = draft.cases;
      partialCasesInput.setAttribute(
        "aria-label",
        draft.bedKeys.length > 1
          ? `選択した${draft.bedKeys.length}ベッド合計の部分収穫ケース数`
          : (draft.bedKeys.length === 1
              ? `${formatRecordPartialHarvestBedLocations(draft.bedKeys)}の部分収穫ケース数`
              : "部分収穫のケース数")
      );
    }
    backButton.textContent = draft.committedEntries.length ? "完了" : "キャンセル";
    nextButton.textContent = "決定";
    nextButton.disabled = !draft.activeIsValid;
    nextButton.title = !draft.bedKeys.length
      ? "部分収穫したベッドを選択してください"
      : (!draft.activeIsValid ? "部分収穫のケース数を入力してください" : "");
    return;
  }
  if(summaryButton) summaryButton.hidden = false;
  if(partialEditor) partialEditor.hidden = true;

  const stage = normalizeRecordHarvestStage(recordHarvestStage);
  const isEditing = !!editingHarvestRecordId;
  const dateValue = document.getElementById("recordDateInput")?.value || "";
  const caseValue = String(document.getElementById("recordCasesInput")?.value || "").trim();
  const formattedDate = formatRecordHarvestFixedNavDate(dateValue);
  const formattedCases = caseValue === "" ? "--ケース" : `${caseValue}ケース`;
  if(summaryDate) summaryDate.textContent = formattedDate;
  if(summaryCases) summaryCases.textContent = formattedCases;
  if(summaryButton){
    const todayValue = formatDateOnlyString(new Date());
    summaryButton.classList.toggle("is-past-date", !!dateValue && dateValue < todayValue);
    summaryButton.classList.toggle("is-expanded", recordHarvestPrimaryInputsExpanded);
    summaryButton.setAttribute("aria-pressed", String(recordHarvestPrimaryInputsExpanded));
    summaryButton.setAttribute(
      "aria-label",
      recordHarvestPrimaryInputsExpanded
        ? `日付と実際の収穫ケース数の入力を閉じる。${formattedDate}、${formattedCases}`
        : `日付と実際の収穫ケース数を確認。${formattedDate}、${formattedCases}`
    );
  }
  backButton.textContent = stage === "location"
    ? (isEditing ? "確認へ戻る" : "クリア")
    : (isEditing && stage === "confirm" ? "編集を破棄" : "戻る");
  nextButton.textContent = stage === "confirm" ? (isEditing ? "更新" : "保存") : "次へ";
  const unvisited = getRecordHarvestUnvisitedTargetBuildings();
  const totalCases = clampNumber(caseValue || 0, 0, 999999, 0);
  const partialDraft = getRecordPartialHarvestDraftModel();
  const partialCases = partialDraft.isValid ? partialDraft.casesValue : 0;
  const regularCases = getRecordRegularHarvestCases(totalCases, dateValue);
  const invalidPartialDraft = !partialDraft.isEmpty && !partialDraft.isValid;
  const locationBlocked = invalidPartialDraft
    || partialCases > totalCases
    || (regularCases > 0 && (!harvestFillKeys.length || unvisited.length > 0))
    || (regularCases <= 0 && (!partialDraft.isValid || harvestFillKeys.length > 0));
  nextButton.disabled = stage === "location" && locationBlocked;
  nextButton.title = stage === "location" && unvisited.length && regularCases > 0
    ? `${unvisited.map(building => `${building}号棟`).join("・")}の配置図を確認してください`
    : (stage === "location" && invalidPartialDraft ? "部分収穫の入力を完了してください" : "");
}

function formatRecordHarvestFixedNavDate(value){
  const date = parseDateOnlyString(value);
  if(!date) return "--/--（--）";
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return `${date.getMonth() + 1}/${date.getDate()}（${weekdays[date.getDay()]}）`;
}

function renderRecordHarvestWorkflowUi(){
  recordHarvestStage = normalizeRecordHarvestStage(recordHarvestStage);
  const isHarvestMode = recordSelectionMode === "harvest";
  const stage = recordHarvestStage;
  const dateInputSection = document.getElementById("recordDateInputSection");
  const casesSection = document.getElementById("recordHarvestStageSection");
  const casesInputSection = document.getElementById("recordHarvestCasesInputSection");
  const locationSection = document.getElementById("recordHarvestLocationSection");
  const actualLossField = document.querySelector(".recordActualLossField");
  const qualitySection = document.getElementById("recordQualityMemoSection");
  const confirmSection = document.getElementById("recordHarvestConfirmSection");
  const plantingActionRow = document.getElementById("recordFormActionRow");
  const modeStatus = document.getElementById("recordModeStatus");
  const todayRecordedStatus = document.getElementById("recordTodayRecordedStatus");
  const isRecordedToday = !!todayRecordedStatus && !todayRecordedStatus.hidden;

  if(modeStatus){
    modeStatus.hidden = isHarvestMode && !isRecordedToday;
    modeStatus.classList.toggle("has-today-record", isRecordedToday);
    modeStatus.setAttribute(
      "aria-label",
      isRecordedToday
        ? "本日は記録済みです"
        : `全2段階。現在は${isHarvestMode ? "収穫記録中" : "苗植え記録中"}`
    );
  }
  const showHarvestPrimaryInputs = isHarvestMode
    && stage === "location"
    && recordHarvestPrimaryInputsExpanded;
  if(dateInputSection) dateInputSection.hidden = isHarvestMode && !showHarvestPrimaryInputs;
  if(casesSection) casesSection.hidden = !showHarvestPrimaryInputs;
  if(casesInputSection) casesInputSection.hidden = !showHarvestPrimaryInputs;
  if(locationSection) locationSection.hidden = isHarvestMode && (stage !== "location" || showHarvestPrimaryInputs);
  if(actualLossField) actualLossField.hidden = !isHarvestMode || stage !== "location" || showHarvestPrimaryInputs;
  if(qualitySection) qualitySection.hidden = isHarvestMode ? stage !== "quality" : qualitySection.hidden;
  if(confirmSection) confirmSection.hidden = !isHarvestMode || stage !== "confirm";
  if(plantingActionRow) plantingActionRow.hidden = isHarvestMode;
  if(stage === "confirm") renderRecordHarvestConfirmation();
  updateRecordPastDateNotice();
  renderRecordPartialHarvestControl();
  renderRecordHarvestFixedNavigation();
  scheduleRecordHarvestViewportLayout();
}

function openRecordHarvestStage(stage, options = {}){
  if(recordSelectionMode !== "harvest") return;
  const normalizedStage = normalizeRecordHarvestStage(stage);
  recordHarvestPrimaryInputsExpanded = options.showPrimaryInputs === true;
  if(!recordHarvestPrimaryInputsExpanded){
    document.getElementById("recordHarvestSummaryBtn")?.removeAttribute("data-return-stage");
  }
  recordHarvestStage = normalizedStage;
  if(normalizedStage === "location"){
    drawRecordBeds();
  }
  renderRecordHarvestWorkflowUi();
  scheduleHarvestStateSave();
  document.getElementById(normalizedStage === "location" ? "recordHarvestLocationSection" : "recordSaveCard")
    ?.scrollIntoView({ block:"start", behavior:getWorkflowScrollBehavior("smooth") });
}

function openRecordHarvestPrimaryInputs(){
  if(recordSelectionMode !== "harvest") return;
  const summaryButton = document.getElementById("recordHarvestSummaryBtn");
  if(recordHarvestPrimaryInputsExpanded){
    const returnStage = normalizeRecordHarvestStage(summaryButton?.dataset.returnStage || "location");
    recordHarvestPrimaryInputsExpanded = false;
    recordHarvestStage = returnStage;
    summaryButton?.removeAttribute("data-return-stage");
    if(returnStage === "location") applyRecordHarvestViewportLayout();
    renderRecordHarvestWorkflowUi();
    if(returnStage === "location") applyMainTabViewportScrollLock();
    scheduleHarvestStateSave();
    return;
  }
  if(summaryButton) summaryButton.dataset.returnStage = normalizeRecordHarvestStage(recordHarvestStage);
  recordHarvestPrimaryInputsExpanded = true;
  recordHarvestStage = "location";
  renderRecordHarvestWorkflowUi();
  scheduleHarvestStateSave();
  document.getElementById("recordSaveCard")
    ?.scrollIntoView({ block:"start", behavior:getWorkflowScrollBehavior("smooth") });
}

function validateRecordHarvestCasesStep(){
  const date = document.getElementById("recordDateInput")?.value || "";
  const totalCases = clampNumber(document.getElementById("recordCasesInput")?.value || 0, 0, 999999, 0);
  if(!date){
    showToast("日付を入力してください");
    return false;
  }
  if(totalCases <= 0){
    showToast("収穫ケース数を入力してください");
    document.getElementById("recordCasesInput")?.focus();
    return false;
  }
  const partialDraft = getRecordPartialHarvestDraftModel();
  if(!partialDraft.isEmpty && !partialDraft.isValid){
    showToast("部分収穫の場所とケース数を入力してください");
    return false;
  }
  if(partialDraft.casesValue > totalCases){
    showToast("部分収穫のケース数が、実際の収穫ケース数を超えています");
    return false;
  }
  const regularCases = getRecordRegularHarvestCases(totalCases, date);
  if(regularCases <= 0 && !partialDraft.isValid){
    showToast("記録する通常収穫または部分収穫がありません");
    return false;
  }
  if(regularCases <= 0 && harvestFillKeys.length){
    showToast("通常収穫場所が選択されています。実際の収穫ケース数を確認してください");
    return false;
  }
  return true;
}

function validateRecordHarvestLocationStep(){
  const date = document.getElementById("recordDateInput")?.value || "";
  const totalCases = clampNumber(document.getElementById("recordCasesInput")?.value || 0, 0, 999999, 0);
  if(getRecordRegularHarvestCases(totalCases, date) <= 0 && getRecordPartialHarvestDraftModel().isValid){
    return true;
  }
  if(!harvestFillKeys.length){
    showToast("収穫した場所を選択してください");
    return false;
  }
  const unvisited = getRecordHarvestUnvisitedTargetBuildings();
  if(unvisited.length){
    showToast(`${unvisited.map(building => `${building}号棟`).join("・")}の配置図を確認してください`);
    return false;
  }
  if(getRecordActualLossValue() === ""){
    showToast("実際のロス率を計算できません");
    return false;
  }
  return true;
}

function handleRecordHarvestNext(){
  if(recordPartialHarvestSelectionMode){
    completeRecordPartialHarvestSelection();
    return;
  }
  const stage = normalizeRecordHarvestStage(recordHarvestStage);
  if(stage === "confirm"){
    handleRecordPrimaryAction();
    return;
  }
  if(stage === "location" && !validateRecordHarvestCasesStep()) return;
  if(stage === "location" && !validateRecordHarvestLocationStep()) return;
  if(editingHarvestRecordId){
    openRecordHarvestStage("confirm");
    return;
  }
  if(stage === "location"){
    const date = document.getElementById("recordDateInput")?.value || "";
    const totalCases = clampNumber(document.getElementById("recordCasesInput")?.value || 0, 0, 999999, 0);
    if(getRecordRegularHarvestCases(totalCases, date) <= 0){
      openRecordHarvestStage("confirm");
      return;
    }
  }
  openRecordHarvestStage(RECORD_HARVEST_STAGES[getRecordHarvestStageIndex() + 1]);
}

function handleRecordHarvestBack(){
  if(recordPartialHarvestSelectionMode){
    const draft = getRecordPartialHarvestDraftModel();
    if(draft.committedEntries.length){
      recordPartialHarvestDraft = normalizeRecordPartialHarvestDraft({
        entries:draft.committedEntries,
        bedKeys:[],
        cases:"",
        editingEntryIndex:-1
      });
      finishRecordPartialHarvestSelection();
    }else{
      cancelRecordPartialHarvestSelection();
    }
    return;
  }
  const stage = normalizeRecordHarvestStage(recordHarvestStage);
  if(editingHarvestRecordId){
    if(stage === "confirm") discardRecordEditChanges();
    else openRecordHarvestStage("confirm");
    return;
  }
  if(stage === "location"){
    handleRecordClearAction();
    return;
  }
  openRecordHarvestStage(RECORD_HARVEST_STAGES[getRecordHarvestStageIndex() - 1]);
}

function renderRecordHistoryToggle(){
  const button = document.getElementById("recordHistoryOpenBtn");
  const label = document.getElementById("recordHistoryToggleLabel");
  if(!button || !label) return;
  const isHistoryOpen = recordViewMode === "history";
  const returnsToDashboard = isHistoryOpen
    && recordHistoryReturnContext === "dashboard-seedlings";
  label.textContent = isHistoryOpen
    ? (returnsToDashboard ? "集計へ戻る" : "入力へ戻る")
    : "記録一覧";
  button.classList.toggle("is-history-open", isHistoryOpen);
  button.setAttribute(
    "aria-label",
    isHistoryOpen
      ? (returnsToDashboard ? "集計の二次定植へ戻る" : "記録入力へ戻る")
      : "記録一覧を開く"
  );
  button.setAttribute("aria-pressed", String(isHistoryOpen));
}

function closeRecordHistoryForMainTabSwitch(){
  if(recordViewMode !== "history" && recordHistoryReturnContext === null) return false;
  recordHistoryRenderScheduleId++;
  recordHistoryRenderPending = false;
  const historyCard = document.getElementById("recordHistoryCard");
  historyCard?.removeAttribute("aria-busy");
  historyCard?.querySelectorAll("[data-record-history-date][aria-busy]").forEach(group => (
    group.removeAttribute("aria-busy")
  ));
  recordViewMode = "entry";
  recordHistoryReturnContext = null;
  const saveCard = document.getElementById("recordSaveCard");
  if(saveCard) saveCard.hidden = false;
  if(historyCard) historyCard.hidden = true;
  renderRecordHistoryToggle();
  const loadingState = document.getElementById("mainTabLoadingState");
  if(loadingState?.dataset.loadingTab === "record") setMainTabLoadingState("record", false);
  return true;
}

function finishRecordHistoryListRender(scheduleId){
  if(scheduleId !== recordHistoryRenderScheduleId) return;
  recordHistoryRenderPending = false;
  const historyCard = document.getElementById("recordHistoryCard");
  historyCard?.removeAttribute("aria-busy");
  historyCard?.querySelectorAll("[data-record-history-date][aria-busy]").forEach(group => (
    group.removeAttribute("aria-busy")
  ));
  const loadingState = document.getElementById("mainTabLoadingState");
  if(loadingState?.dataset.loadingTab === "record"){
    setMainTabLoadingState("record", false);
  }
}

function scheduleRecordHistoryListRender(options = {}){
  const historyCard = document.getElementById("recordHistoryCard");
  if(!historyCard) return;
  const scheduleId = ++recordHistoryRenderScheduleId;
  recordHistoryRenderPending = true;
  historyCard.setAttribute("aria-busy", "true");
  setMainTabLoadingState("record", true, {
    immediate: true,
    label: "記録一覧"
  });

  runAfterUiSettles(() => {
    if(scheduleId !== recordHistoryRenderScheduleId) return;
    if(recordViewMode !== "history" || activeAppTab !== "record"){
      finishRecordHistoryListRender(scheduleId);
      return;
    }
    try{
      const targetDate = String(options.targetDate || "");
      renderRecordList({ preferredDate:targetDate });
      scheduleRecordHarvestViewportLayout();
      if(options.scroll !== false){
        requestAnimationFrame(() => {
          const target = targetDate
            ? [...document.querySelectorAll("#recordList [data-record-history-date]")]
                .find(element => element.dataset.recordHistoryDate === targetDate)
            : historyCard;
          target?.scrollIntoView({ block:"start", behavior:getWorkflowScrollBehavior("smooth") });
        });
      }
    }catch(error){
      console.error("記録一覧を読み込めませんでした", error);
      showToast("記録一覧を読み込めませんでした。もう一度お試しください");
    }finally{
      finishRecordHistoryListRender(scheduleId);
    }
  });
}

function toggleRecordHistoryView(){
  if(recordViewMode !== "history"){
    showRecordHistoryView();
    return;
  }
  if(recordHistoryReturnContext === "dashboard-seedlings"){
    switchTab("dashboard");
    return;
  }
  showRecordEntryView();
}

function showRecordHistoryView(options = {}){
  if(options && typeof options === "object" && options.returnTo === "dashboard-seedlings"){
    recordHistoryReturnContext = "dashboard-seedlings";
  }
  recordViewMode = "history";
  const saveCard = document.getElementById("recordSaveCard");
  const historyCard = document.getElementById("recordHistoryCard");
  if(saveCard) saveCard.hidden = true;
  if(historyCard) historyCard.hidden = false;
  renderRecordHistoryToggle();
  renderRecordHarvestFixedNavigation();
  const targetDate = typeof options === "object" ? options.date : "";
  const shouldScroll = typeof options !== "object" || options.scroll !== false;
  const canReuseRenderedList = !targetDate
    && !!recordHistoryCache
    && recordHistoryRenderedCache === recordHistoryCache;
  if(canReuseRenderedList){
    setMainTabLoadingState("record", false);
    scheduleRecordHarvestViewportLayout();
    if(shouldScroll){
      requestAnimationFrame(() => historyCard?.scrollIntoView({
        block:"start",
        behavior:getWorkflowScrollBehavior("smooth")
      }));
    }
  }else{
    scheduleRecordHistoryListRender({ targetDate, scroll:shouldScroll });
  }
  scheduleHarvestStateSave();
}

function showRecordEntryView(){
  recordHistoryRenderScheduleId++;
  recordHistoryRenderPending = false;
  const historyCard = document.getElementById("recordHistoryCard");
  historyCard?.removeAttribute("aria-busy");
  historyCard?.querySelectorAll("[data-record-history-date][aria-busy]").forEach(group => (
    group.removeAttribute("aria-busy")
  ));
  const loadingState = document.getElementById("mainTabLoadingState");
  if(loadingState?.dataset.loadingTab === "record") setMainTabLoadingState("record", false);
  recordViewMode = "entry";
  const saveCard = document.getElementById("recordSaveCard");
  if(saveCard) saveCard.hidden = false;
  if(historyCard) historyCard.hidden = true;
  refreshRecordModeUi();
  applyRecordHarvestViewportLayout();
  const viewportLocked = applyMainTabViewportScrollLock();
  if(!viewportLocked) scrollToRecordActiveStage({ behavior:"auto" });
  scheduleHarvestStateSave();
}

function refreshRecordModeUi(){
  const actionRow = document.getElementById("recordFormActionRow");
  const discardEditButton = document.getElementById("recordDiscardEditBtn");
  const notice = document.getElementById("recordEditNotice");
  const button = document.getElementById("recordPrimaryActionBtn");
  const plantingInput = document.getElementById("recordPlantingSummaryInput");
  const harvestStageSection = document.getElementById("recordHarvestStageSection");
  const plantingStageSection = document.getElementById("recordPlantingStageSection");
  const plantingActionCard = document.querySelector("#recordPlantingStageSection .plantingActionCard");
  const harvestMemoSection = document.getElementById("recordHarvestMemoSection");
  const qualityMemoSection = document.getElementById("recordQualityMemoSection");
  const qualityMemoLabel = document.getElementById("recordQualityMemoLabel");
  const qualityMemoMediumChoice = document.getElementById("qualityMemoMediumChoice");
  const qualityMemoChipChoice = document.getElementById("qualityMemoChipChoice");
  const actualLossField = document.querySelector(".recordActualLossField");
  const harvestStep = document.getElementById("recordStepHarvest");
  const plantingStep = document.getElementById("recordStepPlanting");
  const harvestStatusCard = document.getElementById("recordHarvestStatusCard");
  const plantingLegend = document.getElementById("recordPlantingLegend");
  const modeStatus = document.getElementById("recordModeStatus");
  const todayRecordedStatus = document.getElementById("recordTodayRecordedStatus");
  const harvestModeStep = document.getElementById("recordModeHarvestStep");
  const plantingModeStep = document.getElementById("recordModePlantingStep");
  const harvestModeStepText = document.getElementById("recordModeHarvestStepText");
  const plantingModeStepText = document.getElementById("recordModePlantingStepText");
  const isPlantingMode = recordSelectionMode === "planting";
  const isEditing = isRecordEditMode();
  const isRecordedToday = !!todayRecordedStatus && !todayRecordedStatus.hidden;
  const saveCard = document.getElementById("recordSaveCard");
  const historyCard = document.getElementById("recordHistoryCard");
  const editingEvent = editingPlantingEventId ? getPlantingEventById(editingPlantingEventId) : null;
  const lockPlantingDate = isPlantingMode
    && editingEvent?.openingCarryoverBefore !== null
    && editingEvent?.openingCarryoverBefore !== undefined;
  const recordDateInput = document.getElementById("recordDateInput");
  renderRecordHistoryToggle();
  if(qualityMemoMediumChoice){
    qualityMemoMediumChoice.hidden = !isPlantingMode;
    const input = qualityMemoMediumChoice.querySelector("input");
    if(input){
      input.disabled = !isPlantingMode;
      if(!isPlantingMode) input.checked = false;
    }
  }
  if(qualityMemoChipChoice){
    qualityMemoChipChoice.hidden = isPlantingMode;
    const input = qualityMemoChipChoice.querySelector("input");
    if(input){
      input.disabled = isPlantingMode;
      if(isPlantingMode) input.checked = false;
    }
  }
  if(recordDateInput){
    recordDateInput.readOnly = !!lockPlantingDate;
    recordDateInput.title = lockPlantingDate
      ? "1,000件以前の繰越基準になっているため、この履歴の日付は変更できません"
      : "";
  }

  if(harvestStep) harvestStep.classList.toggle("active", !isPlantingMode);
  if(plantingStep) plantingStep.classList.toggle("active", isPlantingMode);
  if(modeStatus){
    modeStatus.hidden = !isPlantingMode && !isRecordedToday;
    modeStatus.classList.toggle("is-harvest", !isPlantingMode);
    modeStatus.classList.toggle("is-planting", isPlantingMode);
    modeStatus.classList.toggle("has-today-record", isRecordedToday);
    modeStatus.setAttribute(
      "aria-label",
      isRecordedToday
        ? "本日は記録済みです"
        : `全2段階。現在は${isPlantingMode ? "苗植え記録中" : "収穫記録中"}`
    );
  }
  if(harvestModeStep){
    harvestModeStep.classList.toggle("is-active", !isPlantingMode);
    harvestModeStep.classList.toggle("is-completed", isPlantingMode);
    harvestModeStep.classList.remove("is-upcoming");
    if(isPlantingMode) harvestModeStep.removeAttribute("aria-current");
    else harvestModeStep.setAttribute("aria-current", "step");
  }
  if(plantingModeStep){
    plantingModeStep.classList.toggle("is-active", isPlantingMode);
    plantingModeStep.classList.toggle("is-upcoming", !isPlantingMode);
    plantingModeStep.classList.remove("is-completed");
    if(isPlantingMode) plantingModeStep.setAttribute("aria-current", "step");
    else plantingModeStep.removeAttribute("aria-current");
  }
  if(harvestModeStepText) harvestModeStepText.textContent = isPlantingMode ? "収穫記録" : "収穫記録中";
  if(plantingModeStepText) plantingModeStepText.textContent = isPlantingMode ? "苗植え記録中" : "苗植え記録";
  if(harvestStatusCard) harvestStatusCard.hidden = isPlantingMode;
  if(notice) notice.hidden = !isPlantingMode;
  if(!isPlantingMode){
    const displayedBuildings = getRecordMapBuildings();
    const displayedBuilding = displayedBuildings.includes(Number(recordHarvestActiveBuilding))
      ? Number(recordHarvestActiveBuilding)
      : displayedBuildings[0];
    renderRecordHarvestStatusBuilding(displayedBuilding);
  }
  if(plantingLegend) plantingLegend.hidden = !isPlantingMode;
  updateRecordPlantingCountPresetUi();
  renderRecordPlantingFlow();
  renderRecordBuildingDisplayControls();
  if(discardEditButton) discardEditButton.hidden = !isEditing;
  if(actionRow){
    actionRow.hidden = !isPlantingMode;
    actionRow.classList.toggle("isEditing", isEditing);
  }
  if(button) button.textContent = editingPlantingEventId
    ? "苗植え記録を更新して送信する"
    : "苗植え場所を記録して送信する";
  if(plantingActionCard) plantingActionCard.hidden = !!editingPlantingEventId;

  if(isPlantingMode){
    if(notice) notice.textContent = editingPlantingEventId
      ? (lockPlantingDate
          ? "長期履歴の繰越基準を保つため、日付以外を編集できます。"
          : "保存済みの苗植え記録を編集中です。")
      : "棟を選び、場所・植え付け数・品質の順に設定してください。";
    if(plantingInput) plantingInput.placeholder = "表で実際に苗植えした場所を選ぶと入ります";
    if(harvestStageSection) harvestStageSection.hidden = true;
    if(plantingStageSection) plantingStageSection.hidden = false;
    if(harvestMemoSection) harvestMemoSection.hidden = true;
    if(qualityMemoSection) qualityMemoSection.hidden = isRecordPlantingFlowActive();
    if(qualityMemoLabel) qualityMemoLabel.textContent = "苗の品質メモ（任意）";
    if(actualLossField) actualLossField.hidden = true;
    updateRecordSeedlingDiffDisplay();
  }else{
    if(notice) notice.textContent = "実際に収穫した場所を選択して下さい";
    if(plantingInput) plantingInput.placeholder = "収穫を記録した後、表で苗植え場所を選ぶと入ります";
    if(harvestStageSection) harvestStageSection.hidden = false;
    if(plantingStageSection) plantingStageSection.hidden = true;
    if(harvestMemoSection) harvestMemoSection.hidden = false;
    if(qualityMemoSection) qualityMemoSection.hidden = false;
    if(qualityMemoLabel) qualityMemoLabel.textContent = "品質メモ";
    if(actualLossField) actualLossField.hidden = false;
  }
  if(saveCard) saveCard.hidden = recordViewMode === "history";
  if(historyCard) historyCard.hidden = recordViewMode !== "history";
  renderRecordHarvestWorkflowUi();
  renderRecordPartialHarvestControl();
  updateRecordAutoValueNotes();
  scheduleWorkflowGuideUpdate();
}

function handleRecordClearAction(){
  if(recordSelectionMode === "planting"){
    resetPlantingRecordChanges();
    return;
  }
  clearRecordForm();
}

function discardRecordEditChanges(){
  if(!isRecordEditMode()) return;
  const editingDate = editingHarvestRecordId ? getRecordById(editingHarvestRecordId)?.date || "" : "";
  const pendingReturnPlantingRecordId = getSafePositiveRecordId(harvestEditReturnPlantingRecordId);
  const returnPlantingRecordId = pendingReturnPlantingRecordId !== null
    && pendingReturnPlantingRecordId === getSafePositiveRecordId(editingHarvestRecordId)
    ? pendingReturnPlantingRecordId
    : null;
  closeRecordFloatingUi();
  clearRecordForm({ save:returnPlantingRecordId === null });
  if(returnPlantingRecordId !== null && getRecordById(returnPlantingRecordId)){
    resumePlantingRecord(returnPlantingRecordId, { auto:true });
    showToast("編集内容を破棄して苗植え記録へ戻りました");
    return;
  }
  if(editingDate){
    const dateInput = document.getElementById("recordDateInput");
    if(dateInput) dateInput.value = editingDate;
    refreshRecordDateDependentUi();
    showRecordHistoryView({ date:editingDate });
  }
  showToast("編集内容を破棄して戻りました");
}

async function handleRecordPrimaryAction(){
  try{
    closeRecordFloatingUi();
    if(recordSelectionMode === "planting"){
      await savePlantingRecord();
      return;
    }
    saveRecord();
  }catch(e){
    console.error("Record action failed", e);
    closeRecordFloatingUi();
    showToast("記録処理中にエラーが発生しました。再読み込みしてもう一度試してください");
  }
}

function getCaseLocationForPallet(bed, number){
  const isFrontSide = Number(number) <= Math.ceil(PALLETS_PER_BED / 2);
  if(["A","C","E"].includes(bed)){
    return isFrontSide ? "front" : "middle";
  }
  return Number(number) > PALLETS_PER_BED - 20 ? "back" : "middle";
}

function getCaseLocationLabel(location){
  if(location === "front") return "前側";
  if(location === "middle") return "中央";
  return "後ろ";
}

function distributeCaseDemandByHarvestLocation(totalCases){
  const buckets = [];

  harvestFillKeys.forEach(key => {
    const p = parsePalletKey(key);
    const location = getCaseLocationForPallet(p.bed, p.number);
    let bucket = buckets.find(item => item.building === p.building && item.location === location);
    if(!bucket){
      bucket = { building: p.building, location, heads: 0 };
      buckets.push(bucket);
    }
    bucket.heads += getPredictedHarvestForPallet(p.building, p.bed, p.number);
  });

  const demandByBuilding = {};
  const totalHeads = buckets.reduce((sum, bucket) => sum + bucket.heads, 0);
  if(totalCases <= 0 || totalHeads <= 0) return demandByBuilding;

  const remainders = buckets.map(bucket => {
    const raw = (bucket.heads / totalHeads) * totalCases;
    const buildingKey = String(bucket.building);
    if(!demandByBuilding[buildingKey]){
      demandByBuilding[buildingKey] = { front: 0, middle: 0, back: 0 };
    }
    demandByBuilding[buildingKey][bucket.location] = Math.floor(raw);
    return {
      building: bucket.building,
      location: bucket.location,
      remainder: raw - Math.floor(raw)
    };
  }).sort((a, b) => b.remainder - a.remainder);

  let assigned = Object.values(demandByBuilding).reduce((total, demand) => {
    return total + demand.front + demand.middle + demand.back;
  }, 0);
  let index = 0;
  while(assigned < totalCases){
    const target = remainders[index % remainders.length];
    demandByBuilding[String(target.building)][target.location]++;
    assigned++;
    index++;
  }

  return demandByBuilding;
}

function consumeCasesFromPlacement(available, demand){
  const remaining = { ...available };
  let shortage = 0;
  const fallbackOrder = {
    front: ["front", "middle", "back"],
    middle: ["middle", "front", "back"],
    back: ["back", "middle", "front"]
  };

  ["front", "middle", "back"].forEach(primary => {
    let need = demand[primary];
    fallbackOrder[primary].forEach(location => {
      if(need <= 0) return;
      const used = Math.min(remaining[location], need);
      remaining[location] -= used;
      need -= used;
    });
    shortage += need;
  });

  return { remaining, shortage };
}

function getBorrowableFrontCasesFromNextBuilding(building, demandByBuilding, carriedCasesByBuilding, borrowedFrontCasesByBuilding){
  const nextBuilding = getNextBuilding(building);
  if(!nextBuilding) return 0;

  const nextPlacement = getCasePlacementForBuilding(nextBuilding);
  const nextAvailable = {
    ...nextPlacement,
    front: Math.max(
      0,
      nextPlacement.front +
      clampNumber(carriedCasesByBuilding[String(nextBuilding)], 0, 999999, 0) -
      clampNumber(borrowedFrontCasesByBuilding[String(nextBuilding)], 0, 999999, 0)
    )
  };
  const nextDemand = demandByBuilding[String(nextBuilding)] || { front: 0, middle: 0, back: 0 };
  const preview = consumeCasesFromPlacement(nextAvailable, nextDemand);
  return Math.max(0, preview.remaining.front);
}

function getNextBuilding(building){
  const index = BUILDINGS.indexOf(building);
  if(index < 0) return null;
  return BUILDINGS[(index + 1) % BUILDINGS.length];
}

function hasSelectedPalletInBuilding(building){
  return harvestFillKeys.some(key => {
    const p = parsePalletKey(String(key || ""));
    return p.building === building;
  });
}

function isBuildingCompletedByCurrentSelection(building){
  return hasSelectedPalletInBuilding(building) && getUnharvestedCountForBuilding(building) === 0;
}

function getCasePlacementProcessingOrder(){
  const startPallet = harvestSummary?.start || (harvestFillKeys.length ? harvestFillKeys[0] : "");
  const firstSelected = startPallet ? parsePalletKey(startPallet) : null;
  const startBuilding = BUILDINGS.includes(firstSelected?.building) ? firstSelected.building : currentBuilding;
  const startIndex = Math.max(0, BUILDINGS.indexOf(startBuilding));
  return [...BUILDINGS.slice(startIndex), ...BUILDINGS.slice(0, startIndex)];
}

function getTotalCasePlacementCount(){
  return BUILDINGS.reduce((sum, building) => {
    const placement = getCasePlacementForBuilding(building);
    return sum + placement.front + placement.middle + placement.back;
  }, 0);
}

function getRemainingCaseTotal(remainingByBuilding){
  return Object.values(remainingByBuilding).reduce((sum, remaining) => {
    return sum + remaining.front + remaining.middle + remaining.back;
  }, 0);
}

function ensureRemainingCaseEntry(remainingByBuilding, building){
  const key = String(building);
  if(!remainingByBuilding[key]){
    remainingByBuilding[key] = { front: 0, middle: 0, back: 0 };
  }
  return remainingByBuilding[key];
}

function adjustRemainingCasesToTarget(remainingByBuilding, targetTotal, options = {}){
  let diff = targetTotal - getRemainingCaseTotal(remainingByBuilding);
  if(diff === 0) return;

  const processingOrder = getCasePlacementProcessingOrder();
  if(diff > 0){
    const addOrder = processingOrder.filter(building => !isBuildingCompletedByCurrentSelection(building));
    if(!addOrder.length) addOrder.push(...processingOrder);
    for(const building of addOrder){
      const placement = getCasePlacementForBuilding(building);
      const remaining = ensureRemainingCaseEntry(remainingByBuilding, building);
      const carriedFrontCases = clampNumber(options.carriedCasesByBuilding?.[String(building)], 0, 999999, 0);
      const borrowedFrontCases = clampNumber(options.borrowedFrontCasesByBuilding?.[String(building)], 0, 999999, 0);
      for(const location of ["front", "middle", "back"]){
        if(diff <= 0) return;
        const capacityBase = location === "front"
          ? placement.front + carriedFrontCases - borrowedFrontCases
          : placement[location];
        const capacity = Math.max(0, capacityBase - remaining[location]);
        const add = Math.min(capacity, diff);
        remaining[location] += add;
        diff -= add;
      }
    }
    return;
  }

  diff = Math.abs(diff);
  for(const building of processingOrder){
    const remaining = ensureRemainingCaseEntry(remainingByBuilding, building);
    for(const location of ["front", "middle", "back"]){
      if(diff <= 0) return;
      const remove = Math.min(remaining[location], diff);
      remaining[location] -= remove;
      diff -= remove;
    }
  }
}

function getCasePlacementSummaryText(){
  const totalCases = getHarvestCasePlan().totalCases;
  syncCurrentCasePlacementFromInputs();
  const totalPlacementCases = getTotalCasePlacementCount();
  const targetRemainingTotal = Math.max(0, totalPlacementCases - totalCases);
  const targetShortage = Math.max(0, totalCases - totalPlacementCases);
  const demandByBuilding = distributeCaseDemandByHarvestLocation(totalCases);
  const carriedCasesByBuilding = {};
  const borrowedFrontCasesByBuilding = {};
  const remainingByBuilding = {};

  getCasePlacementProcessingOrder().forEach(building => {
    const demand = demandByBuilding[String(building)] || { front: 0, middle: 0, back: 0 };
    const placement = getCasePlacementForBuilding(building);
    const available = {
      ...placement,
      front: Math.max(
        0,
        placement.front +
        clampNumber(carriedCasesByBuilding[String(building)], 0, 999999, 0) -
        clampNumber(borrowedFrontCasesByBuilding[String(building)], 0, 999999, 0)
      )
    };
    const hasDemand = demand.front > 0 || demand.middle > 0 || demand.back > 0;
    const hasPlacement = available.front > 0 || available.middle > 0 || available.back > 0;
    if(!hasDemand && !hasPlacement) return;

    const result = consumeCasesFromPlacement(available, demand);
    let remaining = result.remaining;
    let shortage = result.shortage;

    if(shortage > 0){
      const nextBuilding = getNextBuilding(building);
      const borrowableFrontCases = getBorrowableFrontCasesFromNextBuilding(
        building,
        demandByBuilding,
        carriedCasesByBuilding,
        borrowedFrontCasesByBuilding
      );
      const borrowedCases = Math.min(shortage, borrowableFrontCases);
      if(nextBuilding && borrowedCases > 0){
        borrowedFrontCasesByBuilding[String(nextBuilding)] =
          clampNumber(borrowedFrontCasesByBuilding[String(nextBuilding)], 0, 999999, 0) + borrowedCases;
        shortage -= borrowedCases;
      }
    }

    if(isBuildingCompletedByCurrentSelection(building)){
      const carryCases = remaining.front + remaining.middle + remaining.back;
      const nextBuilding = getNextBuilding(building);
      if(carryCases > 0 && nextBuilding){
        carriedCasesByBuilding[String(nextBuilding)] = clampNumber(carriedCasesByBuilding[String(nextBuilding)], 0, 999999, 0) + carryCases;
        remaining = { front: 0, middle: 0, back: 0 };
      }
    }

    remainingByBuilding[String(building)] = remaining;
  });

  adjustRemainingCasesToTarget(remainingByBuilding, targetRemainingTotal, {
    carriedCasesByBuilding,
    borrowedFrontCasesByBuilding
  });

  const remainingLines = [];
  BUILDINGS.forEach(building => {
    const remaining = remainingByBuilding[String(building)];
    if(!remaining) return;
    const rawCounts = {
      front: clampNumber(remaining.front, 0, 999999, 0),
      middle: clampNumber(remaining.middle, 0, 999999, 0),
      back: clampNumber(remaining.back, 0, 999999, 0)
    };
    const originalTotal = rawCounts.front + rawCounts.middle + rawCounts.back;
    const displayCounts = {
      front: 0,
      middle: Math.round(rawCounts.middle / 10) * 10,
      back: Math.round(rawCounts.back / 10) * 10
    };
    displayCounts.front = originalTotal - displayCounts.middle - displayCounts.back;

    while(displayCounts.front < 0){
      const adjustableLocation = ["middle", "back"]
        .filter(location => displayCounts[location] >= 10)
        .sort((a, b) => (displayCounts[b] - rawCounts[b]) - (displayCounts[a] - rawCounts[a]))[0];
      if(!adjustableLocation) break;
      displayCounts[adjustableLocation] -= 10;
      displayCounts.front = originalTotal - displayCounts.middle - displayCounts.back;
    }

    ["front", "middle", "back"].forEach(location => {
      const displayCount = Math.max(0, displayCounts[location]);
      if(displayCount > 0){
        remainingLines.push(building + "号棟 " + getCaseLocationLabel(location) + ": " + displayCount + "ケース");
      }
    });
  });

  let text = remainingLines.length ? remainingLines.join("\n") : "なし";

  if(targetShortage > 0){
    text = remainingLines.length
      ? text + "\n" + targetShortage + "ケース不足"
      : targetShortage + "ケース不足";
  }

  return text;
}

function renderCasePlacementSummary(){
  const box = document.getElementById("casePlacementSummary");
  if(!box) return;
  const text = getCasePlacementSummaryText();
  box.textContent = text;
}

function setDefaultCasePlacement(){
  invalidateWorkflowMonitorCheckpoint();
  const front = document.getElementById("frontCaseInput");
  const middle = document.getElementById("middleCaseInput");
  const back = document.getElementById("backCaseInput");
  if(front) front.value = STANDARD_CASE_PLACEMENT.front;
  if(middle) middle.value = STANDARD_CASE_PLACEMENT.middle;
  if(back) back.value = STANDARD_CASE_PLACEMENT.back;
  updateCasePlacementTotal();
  refreshEmptyInputHighlights();
  syncCurrentCasePlacementFromInputs();
  renderForecastSummary();
  saveHarvestStateToStorage();
}

function resetAllCasePlacements(){
  casePlacementByBuilding = {};
  BUILDINGS.forEach(building => {
    casePlacementByBuilding[String(building)] = { ...DEFAULT_CASE_PLACEMENT };
  });
  populateCasePlacementInputs();
  renderForecastSummary();
}

function resetForecastCasesInput(){
  invalidateWorkflowMonitorCheckpoint();
  const casesInput = document.getElementById("casesInput");
  if(casesInput) casesInput.value = "";
  harvestProgressAvailable = false;
  harvestCasesAutoEstimated = false;
  updateHarvestCasesAutoEstimatedAppearance();
  refreshEmptyInputHighlights();
  renderForecastSummary();
}

function clearCasePlacement(){
  invalidateWorkflowMonitorCheckpoint();
  const front = document.getElementById("frontCaseInput");
  const middle = document.getElementById("middleCaseInput");
  const back = document.getElementById("backCaseInput");
  if(front) front.value = "";
  if(middle) middle.value = "";
  if(back) back.value = "";
  updateCasePlacementTotal();
  refreshEmptyInputHighlights();
  syncCurrentCasePlacementFromInputs();
  renderForecastSummary();
  saveHarvestStateToStorage();
}

function handleCasePlacementInput(){
  invalidateWorkflowMonitorCheckpoint();
  updateCasePlacementTotal();
  syncCurrentCasePlacementFromInputs();
  renderForecastSummary();
  scheduleHarvestStateSave();
}
