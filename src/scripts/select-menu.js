// Native selects remain the source of values; this draws only their opened choices.
(() => {
  let panel = null;
  let activeSelect = null;
  let closeTimer = 0;
  let suppressedClickSelect = null;
  let suppressedClickUntil = 0;
  let menuPointerType = null;

  function getPanel(){
    if(panel) return panel;
    panel = document.createElement("div");
    panel.className = "appSelectMenu";
    panel.id = "appSelectMenu";
    panel.setAttribute("popover", "manual");
    panel.setAttribute("role", "listbox");
    panel.hidden = true;
    document.body.append(panel);
    return panel;
  }

  function closeMenu(restoreFocus = false){
    if(!activeSelect) return;
    const select = activeSelect;
    activeSelect = null;
    select.setAttribute("aria-expanded", "false");
    panel.classList.remove("is-open");
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      if(activeSelect) return;
      if(panel.hidePopover && panel.matches(":popover-open")) panel.hidePopover();
      panel.hidden = true;
    }, 200);
    if(restoreFocus && select.isConnected) select.focus({preventScroll:true});
  }

  function placeMenu(select){
    const rect = select.getBoundingClientRect();
    const margin = 8;
    const width = Math.min(Math.max(rect.width, 180), window.innerWidth - margin * 2);
    const desiredHeight = Math.min(panel.scrollHeight, 300);
    const below = window.innerHeight - rect.bottom - margin;
    const above = rect.top - margin;
    const openAbove = below < Math.min(desiredHeight, 160) && above > below;
    const room = Math.max(42, openAbove ? above : below);
    const height = Math.min(desiredHeight, room);
    panel.style.width = `${width}px`;
    panel.style.maxHeight = `${height}px`;
    panel.style.left = `${Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin))}px`;
    panel.style.top = `${openAbove ? Math.max(margin, rect.top - height) : Math.min(window.innerHeight - height - margin, rect.bottom)}px`;
  }

  function chooseOption(index, restoreFocus = true){
    const select = activeSelect;
    if(!select || !select.options[index] || select.options[index].disabled) return;
    const changed = select.selectedIndex !== index;
    select.selectedIndex = index;
    closeMenu(restoreFocus);
    if(changed){
      select.dispatchEvent(new Event("input", {bubbles:true}));
      select.dispatchEvent(new Event("change", {bubbles:true}));
    }
  }

  function openMenu(select, focusOption = false){
    if(select.disabled || !select.options.length || select.multiple || select.size > 1) return;
    if(activeSelect === select){ closeMenu(); return; }
    closeMenu();
    const menu = getPanel();
    clearTimeout(closeTimer);
    menuPointerType = null;
    const host = select.closest("dialog[open]") || document.body;
    if(menu.parentElement !== host) host.append(menu);
    menu.replaceChildren();
    let selectedButton = null;
    Array.from(select.options).forEach((option, index) => {
      if(option.hidden) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "appSelectMenuOption";
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(option.selected));
      button.textContent = option.textContent;
      button.disabled = option.disabled || !!option.closest("optgroup[disabled]");
      button.dataset.optionIndex = String(index);
      button.addEventListener("click", event => chooseOption(index, event.detail === 0 || menuPointerType !== "touch"));
      menu.append(button);
      if(option.selected) selectedButton = button;
    });
    if(!menu.childElementCount) return;
    activeSelect = select;
    select.setAttribute("aria-controls", menu.id);
    select.setAttribute("aria-expanded", "true");
    menu.setAttribute("aria-label", select.getAttribute("aria-label") || select.labels?.[0]?.textContent?.trim() || "選択肢");
    menu.hidden = false;
    if(menu.showPopover && !menu.matches(":popover-open")){
      try{ menu.showPopover(); }catch(_error){ /* The dialog host still displays the menu. */ }
    }
    placeMenu(select);
    menu.scrollTop = selectedButton ? Math.max(0, selectedButton.offsetTop - menu.clientHeight / 2) : 0;
    requestAnimationFrame(() => { if(activeSelect === select) menu.classList.add("is-open"); });
    if(focusOption) (selectedButton || menu.querySelector("button:not(:disabled)"))?.focus({preventScroll:true});
  }

  function selectAtPoint(event){
    if(event.target instanceof HTMLSelectElement) return event.target;
    if(!(event.target instanceof Element)) return null;
    if(panel?.contains(event.target)) return null;
    // The select is visible but does not receive pointer events, so its parent is hit instead.
    for(let parent = event.target; parent; parent = parent.parentElement){
      for(const child of parent.children){
        if(!(child instanceof HTMLSelectElement)) continue;
        const rect = child.getBoundingClientRect();
        if(event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) return child;
      }
    }
    return null;
  }

  document.addEventListener("pointerdown", event => {
    if(panel?.contains(event.target)) menuPointerType = event.pointerType;
    const select = selectAtPoint(event);
    if(select && !select.disabled && !select.multiple && select.size <= 1 && (event.pointerType !== "mouse" || event.button === 0)){
      event.preventDefault();
      suppressedClickSelect = select;
      suppressedClickUntil = performance.now() + 600;
      if(event.pointerType === "mouse") select.focus({preventScroll:true});
      openMenu(select);
      return;
    }
    if(activeSelect && !panel.contains(event.target)) closeMenu();
  }, true);

  document.addEventListener("click", event => {
    const label = event.target instanceof Element ? event.target.closest("label") : null;
    const select = selectAtPoint(event) || (label?.control instanceof HTMLSelectElement ? label.control : null);
    if(!select || select.disabled || select.multiple || select.size > 1) return;
    event.preventDefault();
    if(select === suppressedClickSelect && performance.now() < suppressedClickUntil){
      suppressedClickSelect = null;
      return;
    }
    openMenu(select);
  }, true);

  document.addEventListener("keydown", event => {
    if(!activeSelect){
      const select = event.target instanceof HTMLSelectElement ? event.target : null;
      if(select && !select.disabled && !select.multiple && select.size <= 1 && ["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)){
        event.preventDefault();
        openMenu(select, true);
      }
      return;
    }
    if(event.key === "Escape"){
      event.preventDefault();
      closeMenu(true);
    }else if(event.key === "Tab"){
      const select = activeSelect;
      closeMenu();
      select.focus({preventScroll:true});
    }else if(["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)){
      event.preventDefault();
      const buttons = Array.from(panel.querySelectorAll("button:not(:disabled)"));
      if(!buttons.length) return;
      const current = buttons.indexOf(document.activeElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
        : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus({preventScroll:true});
    }else if((event.key === "Enter" || event.key === " ") && panel.contains(document.activeElement)){
      event.preventDefault();
      chooseOption(Number(document.activeElement.dataset.optionIndex));
    }
  }, true);

  window.addEventListener("resize", () => { if(activeSelect) placeMenu(activeSelect); });
  document.addEventListener("scroll", event => {
    if(activeSelect && event.target !== panel && !panel.contains(event.target)) closeMenu();
  }, true);
  document.documentElement.classList.add("appSelectMenuEnabled");
})();
