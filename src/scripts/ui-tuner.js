const HARVESTNAVI_UI_TUNER_STORAGE_KEY = "harvestnaviUiTunerDraft_v1";
const HARVESTNAVI_UI_TUNER_CONTROLS = Object.freeze([
  { key:"width", label:"横幅", properties:["width"], min:20, max:1200, step:1, unit:"px" },
  { key:"minHeight", label:"最小の高さ", properties:["min-height"], min:0, max:180, step:1, unit:"px" },
  { key:"fontSize", label:"文字サイズ", properties:["font-size"], min:8, max:40, step:1, unit:"px" },
  { key:"paddingVertical", label:"上下の内側余白", properties:["padding-top", "padding-bottom"], min:0, max:48, step:1, unit:"px" },
  { key:"paddingHorizontal", label:"左右の内側余白", properties:["padding-left", "padding-right"], min:0, max:72, step:1, unit:"px" },
  { key:"gap", label:"項目間の間隔", properties:["gap"], min:0, max:64, step:1, unit:"px" },
  { key:"borderRadius", label:"角丸", properties:["border-radius"], min:0, max:60, step:1, unit:"px" },
  { key:"opacity", label:"不透明度", properties:["opacity"], min:20, max:100, step:1, unit:"%" }
]);

function isHarvestnaviUiTunerRequested(){
  try{
    return new URL(window.location.href).searchParams.get("ui-tuner") === "1";
  }catch(_error){
    return false;
  }
}

function escapeHarvestnaviUiTunerCssIdentifier(value){
  const text = String(value || "");
  if(window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(text);
  return text.replace(/[^a-zA-Z0-9_-]/g, character => `\\${character}`);
}

function getHarvestnaviUiTunerUniqueSelector(candidate){
  try{
    return document.querySelectorAll(candidate).length === 1 ? candidate : "";
  }catch(_error){
    return "";
  }
}

function getHarvestnaviUiTunerElementSegment(element){
  const tagName = element.localName || "div";
  const classNames = [...element.classList]
    .filter(className => !className.startsWith("uiTuner") && !/^(show|active|selected|is-)/.test(className))
    .slice(0, 3)
    .map(className => `.${escapeHarvestnaviUiTunerCssIdentifier(className)}`)
    .join("");
  let segment = tagName + classNames;
  const parent = element.parentElement;
  if(parent){
    const peers = [...parent.children].filter(peer => peer.localName === tagName);
    if(peers.length > 1) segment += `:nth-of-type(${peers.indexOf(element) + 1})`;
  }
  return segment;
}

function getHarvestnaviUiTunerSelector(element){
  if(!(element instanceof Element)) return "";
  if(element.id){
    const idSelector = `#${escapeHarvestnaviUiTunerCssIdentifier(element.id)}`;
    if(getHarvestnaviUiTunerUniqueSelector(idSelector)) return idSelector;
  }
  for(const attributeName of ["data-ui-click", "name", "aria-label"]){
    const attributeValue = element.getAttribute(attributeName);
    if(!attributeValue) continue;
    const escapedValue = String(attributeValue).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const attributeSelector = `${element.localName}[${attributeName}="${escapedValue}"]`;
    if(getHarvestnaviUiTunerUniqueSelector(attributeSelector)) return attributeSelector;
  }
  const segments = [];
  let current = element;
  while(current && current !== document.body && segments.length < 6){
    if(current.id){
      segments.unshift(`#${escapeHarvestnaviUiTunerCssIdentifier(current.id)}`);
      break;
    }
    segments.unshift(getHarvestnaviUiTunerElementSegment(current));
    const selector = segments.join(" > ");
    if(getHarvestnaviUiTunerUniqueSelector(selector)) return selector;
    current = current.parentElement;
  }
  return segments.join(" > ");
}

function getHarvestnaviUiTunerTargetName(element){
  const ariaLabel = String(element.getAttribute("aria-label") || "").trim();
  if(ariaLabel) return ariaLabel;
  const text = String(element.textContent || "").replace(/\s+/g, " ").trim();
  if(text) return text.slice(0, 60);
  if(element.id) return element.id;
  return element.localName || "選択要素";
}

function isHarvestnaviUiTunerSelectableElement(element){
  if(!(element instanceof Element)) return false;
  if(element.closest("[data-ui-tuner-root]")) return false;
  return !["html", "body", "script", "style", "link", "meta"].includes(element.localName);
}

function getHarvestnaviUiTunerSelectionCandidate(element){
  if(!isHarvestnaviUiTunerSelectableElement(element)) return null;
  const interactive = element.closest("button, input, select, textarea, summary, a, [role=button]");
  return isHarvestnaviUiTunerSelectableElement(interactive) ? interactive : element;
}

function getHarvestnaviUiTunerControlConfig(key){
  return HARVESTNAVI_UI_TUNER_CONTROLS.find(config => config.key === key) || null;
}

function getHarvestnaviUiTunerComputedValue(element, config){
  const computed = window.getComputedStyle(element);
  if(config.key === "width") return Math.round(element.getBoundingClientRect().width || parseFloat(computed.width) || 0);
  if(config.key === "opacity") return Math.round((parseFloat(computed.opacity) || 0) * 100);
  const values = config.properties.map(property => parseFloat(computed.getPropertyValue(property)) || 0);
  return Math.round(values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1));
}

function normalizeHarvestnaviUiTunerValue(config, value){
  const numeric = Number(value);
  if(!Number.isFinite(numeric)) return config.min;
  return Math.min(config.max, Math.max(config.min, Math.round(numeric / config.step) * config.step));
}

function getHarvestnaviUiTunerCssValue(config, value){
  if(config.key === "opacity") return String(Math.round(value) / 100);
  return `${value}${config.unit}`;
}

function loadHarvestnaviUiTunerDraft(){
  try{
    const stored = harvestnaviLocalStorage.readJson(HARVESTNAVI_UI_TUNER_STORAGE_KEY, null);
    if(!stored || stored.version !== 1 || !stored.changes || typeof stored.changes !== "object") return {};
    const changes = {};
    Object.entries(stored.changes).forEach(([selector, entry]) => {
      if(!selector || !entry || typeof entry !== "object" || !entry.properties) return;
      const properties = {};
      HARVESTNAVI_UI_TUNER_CONTROLS.forEach(config => {
        if(!Object.prototype.hasOwnProperty.call(entry.properties, config.key)) return;
        properties[config.key] = normalizeHarvestnaviUiTunerValue(config, entry.properties[config.key]);
      });
      if(Object.keys(properties).length){
        changes[selector] = {
          label:String(entry.label || selector).slice(0, 80),
          properties
        };
      }
    });
    return changes;
  }catch(_error){
    return {};
  }
}

function rememberHarvestnaviUiTunerInlineStyle(state, element, property){
  let elementSnapshot = state.originalStyles.get(element);
  if(!elementSnapshot){
    elementSnapshot = new Map();
    state.originalStyles.set(element, elementSnapshot);
    state.touchedElements.add(element);
  }
  if(elementSnapshot.has(property)) return;
  elementSnapshot.set(property, {
    value:element.style.getPropertyValue(property),
    priority:element.style.getPropertyPriority(property)
  });
}

function applyHarvestnaviUiTunerProperty(state, element, config, value){
  const cssValue = getHarvestnaviUiTunerCssValue(config, value);
  config.properties.forEach(property => {
    rememberHarvestnaviUiTunerInlineStyle(state, element, property);
    element.style.setProperty(property, cssValue);
  });
}

function applyHarvestnaviUiTunerEntry(state, selector, entry){
  let elements = [];
  try{
    elements = [...document.querySelectorAll(selector)].filter(isHarvestnaviUiTunerSelectableElement);
  }catch(_error){
    return;
  }
  elements.forEach(element => {
    Object.entries(entry.properties || {}).forEach(([key, value]) => {
      const config = getHarvestnaviUiTunerControlConfig(key);
      if(config) applyHarvestnaviUiTunerProperty(state, element, config, value);
    });
  });
}

function applyAllHarvestnaviUiTunerChanges(state){
  Object.entries(state.changes).forEach(([selector, entry]) => {
    applyHarvestnaviUiTunerEntry(state, selector, entry);
  });
}

function restoreAllHarvestnaviUiTunerStyles(state){
  state.touchedElements.forEach(element => {
    const snapshot = state.originalStyles.get(element);
    if(!snapshot) return;
    snapshot.forEach((original, property) => {
      if(original.value) element.style.setProperty(property, original.value, original.priority);
      else element.style.removeProperty(property);
    });
  });
  state.originalStyles = new WeakMap();
  state.touchedElements = new Set();
}

function buildHarvestnaviUiTunerCss(changes){
  const blocks = [];
  Object.entries(changes).forEach(([selector, entry]) => {
    const declarations = [];
    HARVESTNAVI_UI_TUNER_CONTROLS.forEach(config => {
      if(!Object.prototype.hasOwnProperty.call(entry.properties || {}, config.key)) return;
      const cssValue = getHarvestnaviUiTunerCssValue(config, entry.properties[config.key]);
      config.properties.forEach(property => declarations.push(`  ${property}: ${cssValue};`));
    });
    if(!declarations.length) return;
    const label = String(entry.label || selector).replace(/\*\//g, "").slice(0, 80);
    blocks.push(`/* ${label} */\n${selector} {\n${declarations.join("\n")}\n}`);
  });
  return blocks.join("\n\n");
}

function createHarvestnaviUiTunerPanel(){
  const panel = document.createElement("aside");
  panel.id = "uiTunerPanel";
  panel.className = "uiTunerPanel";
  panel.dataset.uiTunerRoot = "true";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "UI調整モード");
  panel.innerHTML = `
    <div class="uiTunerPanelHeader">
      <div class="uiTunerPanelTitle">UI調整</div>
      <span class="uiTunerModeLabel">調整モード</span>
      <button id="uiTunerCollapseBtn" type="button" class="uiTunerHeaderButton" aria-expanded="true">たたむ</button>
    </div>
    <div class="uiTunerPanelBody">
      <p class="uiTunerLead">対象を選んでスライダーを動かすと、実際の画面にすぐ反映します。</p>
      <div class="uiTunerSelectionActions">
        <button id="uiTunerSelectBtn" type="button" class="uiTunerButton uiTunerButtonPrimary">画面から対象を選ぶ</button>
        <button id="uiTunerParentBtn" type="button" class="uiTunerButton" disabled>親要素へ</button>
      </div>
      <div class="uiTunerTargetBox">
        <div class="uiTunerTargetLabel">選択中の対象</div>
        <div id="uiTunerTargetName" class="uiTunerTargetName">まだ選択していません</div>
        <div id="uiTunerTargetSelector" class="uiTunerTargetSelector"></div>
      </div>
      <div id="uiTunerControls" class="uiTunerControls"></div>
      <div class="uiTunerActions">
        <button id="uiTunerSaveBtn" type="button" class="uiTunerButton uiTunerButtonPrimary">調整値を保存</button>
        <button id="uiTunerCopyBtn" type="button" class="uiTunerButton">CSSをコピー</button>
        <button id="uiTunerResetBtn" type="button" class="uiTunerButton uiTunerButtonDanger">すべて元に戻す</button>
        <button id="uiTunerExitBtn" type="button" class="uiTunerButton">調整モードを終了</button>
      </div>
      <textarea id="uiTunerCssOutput" class="uiTunerCssOutput" readonly aria-label="調整結果のCSS" placeholder="調整した値がCSSで表示されます"></textarea>
      <div id="uiTunerStatus" class="uiTunerStatus" role="status" aria-live="polite"></div>
    </div>`;

  const controls = panel.querySelector("#uiTunerControls");
  HARVESTNAVI_UI_TUNER_CONTROLS.forEach(config => {
    const field = document.createElement("label");
    field.className = "uiTunerControl";
    field.innerHTML = `
      <span class="uiTunerControlLabel">${config.label}</span>
      <output class="uiTunerControlValue" data-ui-tuner-output="${config.key}">--</output>
      <input class="uiTunerRange" type="range" min="${config.min}" max="${config.max}" step="${config.step}" value="${config.min}" data-ui-tuner-control="${config.key}" disabled>`;
    controls.appendChild(field);
  });
  return panel;
}

function positionHarvestnaviUiTunerHighlight(state, element = state.selectedElement){
  const highlight = state.highlight;
  if(!highlight || !element || !element.isConnected){
    highlight?.classList.remove("show");
    return;
  }
  const rect = element.getBoundingClientRect();
  if(rect.width <= 0 || rect.height <= 0){
    highlight.classList.remove("show");
    return;
  }
  highlight.style.left = `${Math.max(0, rect.left - 2)}px`;
  highlight.style.top = `${Math.max(0, rect.top - 2)}px`;
  highlight.style.width = `${rect.width + 4}px`;
  highlight.style.height = `${rect.height + 4}px`;
  highlight.classList.add("show");
}

function setHarvestnaviUiTunerStatus(state, message){
  state.panel.querySelector("#uiTunerStatus").textContent = String(message || "");
}

function updateHarvestnaviUiTunerCssOutput(state){
  state.panel.querySelector("#uiTunerCssOutput").value = buildHarvestnaviUiTunerCss(state.changes);
}

function refreshHarvestnaviUiTunerControls(state){
  const target = state.selectedElement;
  const entry = target ? state.changes[state.selectedSelector] : null;
  state.panel.querySelectorAll("[data-ui-tuner-control]").forEach(input => {
    const config = getHarvestnaviUiTunerControlConfig(input.dataset.uiTunerControl);
    const output = state.panel.querySelector(`[data-ui-tuner-output="${config.key}"]`);
    input.disabled = !target;
    if(!target){
      output.textContent = "--";
      return;
    }
    const changedValue = entry?.properties?.[config.key];
    const value = Object.prototype.hasOwnProperty.call(entry?.properties || {}, config.key)
      ? changedValue
      : normalizeHarvestnaviUiTunerValue(config, getHarvestnaviUiTunerComputedValue(target, config));
    input.value = String(value);
    output.textContent = `${value}${config.unit}`;
  });
}

function selectHarvestnaviUiTunerElement(state, element){
  if(!isHarvestnaviUiTunerSelectableElement(element)) return false;
  const selector = getHarvestnaviUiTunerSelector(element);
  if(!selector) return false;
  state.selectedElement = element;
  state.selectedSelector = selector;
  state.selecting = false;
  document.body.classList.remove("uiTunerSelecting");
  state.selectionHint.classList.remove("show");
  state.panel.classList.remove("is-collapsed");
  state.panel.querySelector("#uiTunerCollapseBtn").textContent = "たたむ";
  state.panel.querySelector("#uiTunerCollapseBtn").setAttribute("aria-expanded", "true");
  state.panel.querySelector("#uiTunerTargetName").textContent = getHarvestnaviUiTunerTargetName(element);
  state.panel.querySelector("#uiTunerTargetSelector").textContent = selector;
  state.panel.querySelector("#uiTunerParentBtn").disabled = !isHarvestnaviUiTunerSelectableElement(element.parentElement);
  refreshHarvestnaviUiTunerControls(state);
  positionHarvestnaviUiTunerHighlight(state);
  setHarvestnaviUiTunerStatus(state, "対象を選択しました。スライダーで調整できます。");
  return true;
}

function startHarvestnaviUiTunerSelection(state){
  state.selecting = true;
  state.panel.classList.add("is-collapsed");
  state.panel.querySelector("#uiTunerCollapseBtn").textContent = "開く";
  state.panel.querySelector("#uiTunerCollapseBtn").setAttribute("aria-expanded", "false");
  state.highlight.classList.remove("show");
  state.selectionHint.classList.add("show");
  document.body.classList.add("uiTunerSelecting");
}

function cancelHarvestnaviUiTunerSelection(state){
  if(!state.selecting) return;
  state.selecting = false;
  document.body.classList.remove("uiTunerSelecting");
  state.selectionHint.classList.remove("show");
  state.panel.classList.remove("is-collapsed");
  state.panel.querySelector("#uiTunerCollapseBtn").textContent = "たたむ";
  state.panel.querySelector("#uiTunerCollapseBtn").setAttribute("aria-expanded", "true");
  positionHarvestnaviUiTunerHighlight(state);
  setHarvestnaviUiTunerStatus(state, "対象選択をキャンセルしました。");
}

function updateHarvestnaviUiTunerProperty(state, key, rawValue){
  const target = state.selectedElement;
  const selector = state.selectedSelector;
  const config = getHarvestnaviUiTunerControlConfig(key);
  if(!target || !selector || !config) return;
  const value = normalizeHarvestnaviUiTunerValue(config, rawValue);
  const entry = state.changes[selector] || {
    label:getHarvestnaviUiTunerTargetName(target),
    properties:{}
  };
  entry.properties[key] = value;
  state.changes[selector] = entry;
  applyHarvestnaviUiTunerProperty(state, target, config, value);
  state.panel.querySelector(`[data-ui-tuner-output="${key}"]`).textContent = `${value}${config.unit}`;
  updateHarvestnaviUiTunerCssOutput(state);
  positionHarvestnaviUiTunerHighlight(state);
  setHarvestnaviUiTunerStatus(state, "調整中です。決まったら「調整値を保存」を押してください。");
}

function saveHarvestnaviUiTunerChanges(state){
  harvestnaviLocalStorage.writeJson(HARVESTNAVI_UI_TUNER_STORAGE_KEY, {
    version:1,
    savedAt:new Date().toISOString(),
    changes:state.changes
  });
  setHarvestnaviUiTunerStatus(state, "調整値をこの端末に保存しました。通常モードには表示されません。");
}

async function copyHarvestnaviUiTunerCss(state){
  const css = buildHarvestnaviUiTunerCss(state.changes);
  if(!css){
    setHarvestnaviUiTunerStatus(state, "まだ調整されている項目がありません。");
    return false;
  }
  let copied = false;
  try{
    if(navigator.clipboard && typeof navigator.clipboard.writeText === "function"){
      await navigator.clipboard.writeText(css);
      copied = true;
    }
  }catch(_error){}
  if(!copied){
    const output = state.panel.querySelector("#uiTunerCssOutput");
    output.focus();
    output.select();
    try{
      copied = document.execCommand("copy");
    }catch(_error){}
  }
  setHarvestnaviUiTunerStatus(state, copied
    ? "CSSをコピーしました。そのまま依頼時に貼り付けられます。"
    : "CSSを選択しました。端末のコピー操作を使ってください。");
  return copied;
}

function resetHarvestnaviUiTunerChanges(state){
  restoreAllHarvestnaviUiTunerStyles(state);
  state.changes = {};
  harvestnaviLocalStorage.removeItem(HARVESTNAVI_UI_TUNER_STORAGE_KEY);
  updateHarvestnaviUiTunerCssOutput(state);
  refreshHarvestnaviUiTunerControls(state);
  positionHarvestnaviUiTunerHighlight(state);
  setHarvestnaviUiTunerStatus(state, "調整内容をすべて元に戻し、保存値も削除しました。");
}

function exitHarvestnaviUiTuner(){
  const url = new URL(window.location.href);
  url.searchParams.delete("ui-tuner");
  window.location.replace(url.toString());
}

function installHarvestnaviUiTunerEvents(state){
  const panel = state.panel;
  panel.querySelector("#uiTunerSelectBtn").addEventListener("click", () => startHarvestnaviUiTunerSelection(state));
  panel.querySelector("#uiTunerParentBtn").addEventListener("click", () => {
    if(state.selectedElement?.parentElement){
      selectHarvestnaviUiTunerElement(state, state.selectedElement.parentElement);
    }
  });
  panel.querySelector("#uiTunerCollapseBtn").addEventListener("click", () => {
    if(state.selecting){
      cancelHarvestnaviUiTunerSelection(state);
      return;
    }
    const collapsed = panel.classList.toggle("is-collapsed");
    panel.querySelector("#uiTunerCollapseBtn").textContent = collapsed ? "開く" : "たたむ";
    panel.querySelector("#uiTunerCollapseBtn").setAttribute("aria-expanded", String(!collapsed));
  });
  panel.querySelector("#uiTunerSaveBtn").addEventListener("click", () => saveHarvestnaviUiTunerChanges(state));
  panel.querySelector("#uiTunerCopyBtn").addEventListener("click", () => copyHarvestnaviUiTunerCss(state));
  panel.querySelector("#uiTunerResetBtn").addEventListener("click", () => resetHarvestnaviUiTunerChanges(state));
  panel.querySelector("#uiTunerExitBtn").addEventListener("click", exitHarvestnaviUiTuner);
  panel.querySelectorAll("[data-ui-tuner-control]").forEach(input => {
    input.addEventListener("input", () => updateHarvestnaviUiTunerProperty(state, input.dataset.uiTunerControl, input.value));
  });

  document.addEventListener("pointermove", event => {
    if(!state.selecting) return;
    const target = event.target instanceof Element ? event.target : null;
    const candidate = getHarvestnaviUiTunerSelectionCandidate(target);
    if(candidate) positionHarvestnaviUiTunerHighlight(state, candidate);
  }, true);
  document.addEventListener("click", event => {
    if(!state.selecting) return;
    const target = event.target instanceof Element ? event.target : null;
    const candidate = getHarvestnaviUiTunerSelectionCandidate(target);
    if(!candidate) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    selectHarvestnaviUiTunerElement(state, candidate);
  }, true);
  document.addEventListener("keydown", event => {
    if(event.key === "Escape" && state.selecting){
      event.preventDefault();
      event.stopImmediatePropagation();
      cancelHarvestnaviUiTunerSelection(state);
    }
  }, true);
  window.addEventListener("resize", () => positionHarvestnaviUiTunerHighlight(state));
  window.addEventListener("scroll", () => positionHarvestnaviUiTunerHighlight(state), { passive:true, capture:true });
}

function initializeHarvestnaviUiTuner(){
  if(!isHarvestnaviUiTunerRequested()){
    window.harvestnaviUiTuner = Object.freeze({ enabled:false });
    return;
  }
  if(document.getElementById("uiTunerPanel")) return;

  const panel = createHarvestnaviUiTunerPanel();
  const highlight = document.createElement("div");
  highlight.id = "uiTunerHighlight";
  highlight.className = "uiTunerHighlight";
  highlight.dataset.uiTunerRoot = "true";
  const selectionHint = document.createElement("div");
  selectionHint.id = "uiTunerSelectionHint";
  selectionHint.className = "uiTunerSelectionHint";
  selectionHint.dataset.uiTunerRoot = "true";
  selectionHint.textContent = "調整したい要素をタップ　・　Escでキャンセル";
  document.body.append(panel, highlight, selectionHint);

  const state = {
    panel,
    highlight,
    selectionHint,
    selecting:false,
    selectedElement:null,
    selectedSelector:"",
    changes:loadHarvestnaviUiTunerDraft(),
    originalStyles:new WeakMap(),
    touchedElements:new Set(),
    mutationTimer:null
  };
  applyAllHarvestnaviUiTunerChanges(state);
  updateHarvestnaviUiTunerCssOutput(state);
  installHarvestnaviUiTunerEvents(state);
  const observer = new MutationObserver(() => {
    clearTimeout(state.mutationTimer);
    state.mutationTimer = setTimeout(() => applyAllHarvestnaviUiTunerChanges(state), 40);
  });
  observer.observe(document.body, { childList:true, subtree:true });

  window.harvestnaviUiTuner = Object.freeze({
    enabled:true,
    selectElement:element => selectHarvestnaviUiTunerElement(state, element),
    getCss:() => buildHarvestnaviUiTunerCss(state.changes),
    reset:() => resetHarvestnaviUiTunerChanges(state)
  });
  setHarvestnaviUiTunerStatus(state, Object.keys(state.changes).length
    ? "この端末に保存した調整値を復元しました。"
    : "「画面から対象を選ぶ」から始めてください。");
}

if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", initializeHarvestnaviUiTuner, { once:true });
}else{
  initializeHarvestnaviUiTuner();
}
