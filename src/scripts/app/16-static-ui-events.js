let staticUiEventsInstalled = false;

function getStaticUiAction(name){
  const actionName = String(name || "").trim();
  const action = actionName ? window[actionName] : null;
  if(typeof action !== "function"){
    throw new Error(`画面操作「${actionName || "不明"}」が登録されていません`);
  }
  return action;
}

function getStaticUiActionArguments(element, event){
  const args = [];
  if(element.dataset.uiElementFirst === "true") args.push(element);
  if(Object.prototype.hasOwnProperty.call(element.dataset, "uiArg")) args.push(element.dataset.uiArg);
  if(Object.prototype.hasOwnProperty.call(element.dataset, "uiArg2")) args.push(element.dataset.uiArg2);
  if(Object.prototype.hasOwnProperty.call(element.dataset, "uiNumber")){
    const value = Number(element.dataset.uiNumber);
    if(element.dataset.uiNumberFirst === "true") args.unshift(value);
    else args.push(value);
  }
  if(Object.prototype.hasOwnProperty.call(element.dataset, "uiBoolean")){
    args.push(element.dataset.uiBoolean === "true");
  }
  if(element.dataset.uiValueArgument === "true") args.push(element.value);
  if(element.dataset.uiEventFirst === "true") args.unshift(event);
  return args;
}

function runStaticUiAction(element, event, attributeName){
  const actionName = element.getAttribute(attributeName);
  if(!actionName) return;
  const beforeActionName = element.dataset.uiBefore;
  if(beforeActionName) getStaticUiAction(beforeActionName)();
  return getStaticUiAction(actionName)(...getStaticUiActionArguments(element, event));
}

function getStaticUiEventElement(event, attributeName){
  const target = event.target;
  if(!target || typeof target.closest !== "function") return null;
  return target.closest(`[${attributeName}]`);
}

function handleStaticUiClick(event){
  const backdrop = getStaticUiEventElement(event, "data-ui-backdrop-click");
  if(backdrop && event.target === backdrop){
    runStaticUiAction(backdrop, event, "data-ui-backdrop-click");
    return;
  }
  const actionElement = getStaticUiEventElement(event, "data-ui-click");
  if(actionElement) runStaticUiAction(actionElement, event, "data-ui-click");
}

function handleStaticUiInput(event){
  const actionElement = getStaticUiEventElement(event, "data-ui-input");
  if(actionElement) runStaticUiAction(actionElement, event, "data-ui-input");
}

function handleStaticUiChange(event){
  const actionElement = getStaticUiEventElement(event, "data-ui-change");
  if(actionElement) runStaticUiAction(actionElement, event, "data-ui-change");
}

function handleStaticUiKeydown(event){
  const actionElement = getStaticUiEventElement(event, "data-ui-keydown");
  if(actionElement) runStaticUiAction(actionElement, event, "data-ui-keydown");
}

function installStaticUiEventHandlers(){
  if(staticUiEventsInstalled) return;
  staticUiEventsInstalled = true;
  document.addEventListener("click", handleStaticUiClick);
  document.querySelectorAll("[data-ui-input]").forEach(element => {
    element.addEventListener("input", handleStaticUiInput);
  });
  document.querySelectorAll("[data-ui-change]").forEach(element => {
    element.addEventListener("change", handleStaticUiChange);
  });
  document.querySelectorAll("[data-ui-keydown]").forEach(element => {
    element.addEventListener("keydown", handleStaticUiKeydown);
  });
  document.querySelectorAll("[data-ui-toggle]").forEach(element => {
    element.addEventListener("toggle", event => {
      runStaticUiAction(element, event, "data-ui-toggle");
    });
  });
}
