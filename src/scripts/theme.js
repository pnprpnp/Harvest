const THEME_PREFERENCE_KEY = "harvestnaviThemePreference_v1";
const THEME_PREFERENCES = Object.freeze(["system", "light", "dark"]);
const themeColorMedia = window.matchMedia("(prefers-color-scheme: dark)");
let themePreference = readThemePreference();

function normalizeThemePreference(value){
  const normalized = String(value || "").trim().toLowerCase();
  return THEME_PREFERENCES.includes(normalized) ? normalized : "system";
}

function readThemePreference(){
  try{
    return normalizeThemePreference(harvestnaviLocalStorage.getItem(THEME_PREFERENCE_KEY));
  }catch(e){
    return "system";
  }
}

function getResolvedTheme(preference = themePreference){
  const normalized = normalizeThemePreference(preference);
  if(normalized === "system") return themeColorMedia.matches ? "dark" : "light";
  return normalized;
}

function updateBrowserThemeColor(resolvedTheme){
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute("content", resolvedTheme === "dark" ? "#0d1117" : "#f5f5f7");
  const statusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if(statusBar) statusBar.setAttribute("content", resolvedTheme === "dark" ? "black-translucent" : "default");
}

function syncThemePreferenceControls(){
  document.querySelectorAll('input[name="themePreference"]').forEach(input => {
    input.checked = input.value === themePreference;
  });
  const resolvedTheme = getResolvedTheme();
  const hint = document.getElementById("themePreferenceHint");
  if(hint){
    const resolvedLabel = resolvedTheme === "dark" ? "ダーク" : "ライト";
    hint.textContent = themePreference === "system"
      ? `端末の設定に合わせています（現在：${resolvedLabel}）`
      : `${resolvedLabel}表示に固定しています`;
  }
}

function applyThemePreference(preference = themePreference, options = {}){
  themePreference = normalizeThemePreference(preference);
  const resolvedTheme = getResolvedTheme(themePreference);
  document.documentElement.dataset.themePreference = themePreference;
  document.documentElement.dataset.theme = resolvedTheme;
  updateBrowserThemeColor(resolvedTheme);
  syncThemePreferenceControls();
  if(options.persist){
    try{
      harvestnaviLocalStorage.setItem(THEME_PREFERENCE_KEY, themePreference);
    }catch(e){
      console.error("Theme preference save failed", e);
    }
  }
  return resolvedTheme;
}

function setThemePreference(preference){
  return applyThemePreference(preference, { persist: true });
}

function handleSystemThemeChange(){
  if(themePreference === "system") applyThemePreference("system");
}

if(typeof themeColorMedia.addEventListener === "function"){
  themeColorMedia.addEventListener("change", handleSystemThemeChange);
}else if(typeof themeColorMedia.addListener === "function"){
  themeColorMedia.addListener(handleSystemThemeChange);
}

applyThemePreference(themePreference);
document.addEventListener("DOMContentLoaded", syncThemePreferenceControls, { once:true });
