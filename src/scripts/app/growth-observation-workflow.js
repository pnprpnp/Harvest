// Field observations are entered from the Record tab without changing harvest drafts.
let recordGrowthReadyEditingId = "";
let recordGrowthReadyScope = "";
let recordGrowthReadyHistoryLimit = 20;
let recordGrowthReadySyncing = false;
let recordGrowthUnratedMode = false;

function invalidateDashboardGrowthEvidence(){
  dashboardGrowthDataRevision++;
  dashboardGrowthSourceCache = null;
  dashboardGrowthPredictionModelCache = null;
  dashboardRenderedSubtabs.delete("growth");
}

function getRecordGrowthReadyGroups(){
  const groups = new Map();
  getDashboardGrowthSourceState().currentPlanting.forEach((planting, key) => {
    const pallet = parsePalletKey(key);
    if(!pallet || !planting.eventId) return;
    const plantingDate = formatDateOnlyString(planting.date);
    const id = `${planting.eventId}:${plantingDate}:${pallet.building}:${pallet.bed}`;
    if(!groups.has(id)) groups.set(id, { id, plantingEventId:planting.eventId, plantingDate,
      building:pallet.building, bed:pallet.bed, palletKeys:[] });
    groups.get(id).palletKeys.push(key);
  });
  return [...groups.values()];
}

function openRecordGrowthReady(){
  const dialog = document.getElementById("recordGrowthReadyDialog");
  if(!dialog) return;
  recordGrowthReadyEditingId = "";
  recordGrowthUnratedMode = false;
  recordGrowthReadyScope = getActiveRecordsStorageKey();
  resetRecordGrowthObservationDraft();
  recordGrowthReadyHistoryLimit = 20;
  const building = document.getElementById("recordGrowthReadyBuilding");
  const bed = document.getElementById("recordGrowthReadyBed");
  const priorBuilding = Number(building.value) || Number(currentBuilding) || 2;
  building.innerHTML = BUILDINGS.map(value => `<option value="${value}">${value}号棟</option>`).join("");
  building.value = String(BUILDINGS.includes(priorBuilding) ? priorBuilding : 2);
  bed.innerHTML = bedOrder.map(value => `<option value="${value}">${value}ベッド</option>`).join("");
  changeRecordGrowthReadyPlace();
  if(!dialog.open) dialog.showModal();
  syncRecordGrowthReady(false);
}

function closeRecordGrowthReady(){
  document.getElementById("recordGrowthReadyDialog")?.close();
  recordGrowthReadyEditingId = "";
  recordGrowthUnratedMode = false;
}

function setRecordGrowthReadyNotice(message){
  const element = document.getElementById("recordGrowthReadyNotice");
  if(element) element.textContent = message;
}

function changeRecordGrowthReadyPlace(){
  recordGrowthReadyEditingId = "";
  const building = Number(document.getElementById("recordGrowthReadyBuilding").value);
  const bed = document.getElementById("recordGrowthReadyBed").value;
  const select = document.getElementById("recordGrowthReadyCrop");
  const groups = getRecordGrowthReadyGroups().filter(group => group.building === building && group.bed === bed);
  select.disabled = false;
  select.innerHTML = groups.length ? groups.map(group => `<option value="${escapeHtml(group.id)}">${escapeHtml(group.plantingDate)} 苗植え・${group.palletKeys.length}パレット</option>`).join("") : '<option value="">栽培中の苗植え記録がありません</option>';
  selectRecordGrowthReadyCrop();
  renderRecordGrowthReadyHistory();
}

function selectRecordGrowthReadyCrop(){
  recordGrowthReadyEditingId = "";
  const id = document.getElementById("recordGrowthReadyCrop").value;
  const group = getRecordGrowthReadyGroups().find(item => item.id === id);
  renderRecordGrowthReadyForm(group);
  changeRecordGrowthObservationKind();
  setRecordGrowthReadyNotice(group ? "" : "先に対象パレットの苗植え記録を登録してください。");
}

function renderRecordGrowthReadyForm(group, observation = null){
  const form = document.getElementById("recordGrowthReadyForm");
  form.hidden = !group;
  document.getElementById("recordGrowthReadyCancelEdit").hidden = !observation;
  if(!group) return;
  const today = formatDateOnlyString(new Date());
  const input = document.getElementById("recordGrowthReadyDate");
  input.value = observation?.readyDate || today;
  input.min = group.plantingDate || ""; input.max = today;
  document.getElementById("recordGrowthReadyTarget").textContent = `${group.building}号棟 ${group.bed}ベッド・${group.plantingDate}苗植え`;
  document.getElementById("recordGrowthReadyPallets").innerHTML = group.palletKeys.map(key => {
    const number = parsePalletKey(key).number;
    return `<label><input type="checkbox" data-ready-pallet="${escapeHtml(key)}" checked${observation ? " disabled" : ""}>${number}</label>`;
  }).join("");
  bindRecordGrowthRangeSelection();
}

function saveRecordGrowthReadyToday(){
  document.getElementById("recordGrowthReadyDate").value = formatDateOnlyString(new Date());
  saveRecordGrowthReady();
}

function saveRecordGrowthReady(){
  if(recordGrowthReadyScope !== getActiveRecordsStorageKey()){
    closeRecordGrowthReady(); showToast("利用者が切り替わりました。もう一度開いてください"); return;
  }
  if(!ensureGoogleSheetLocalMutationAllowed("適期確認を記録する操作を")) return;
  try{
    ensureDashboardGrowthSafetySnapshot();
    const existing = recordGrowthReadyEditingId
      ? HarvestGrowthObservations.list().find(row => row.observationId === recordGrowthReadyEditingId) : null;
    if(recordGrowthReadyEditingId && !existing) throw new Error("対象の確認記録が変更されました。開き直してください");
    const group = existing || getRecordGrowthReadyGroups().find(item => item.id === document.getElementById("recordGrowthReadyCrop").value);
    if(!group) throw new Error("栽培中の作を選択してください");
    const palletKeys = existing ? existing.palletKeys : [...document.querySelectorAll("#recordGrowthReadyPallets input:checked")].map(input => input.dataset.readyPallet);
    if(!palletKeys.length) throw new Error("対象パレットを選択してください");
    const readyDate = document.getElementById("recordGrowthReadyDate").value;
    if(!isStrictDateOnlyString(readyDate) || readyDate < group.plantingDate || readyDate > formatDateOnlyString(new Date())){
      throw new Error("適期確認日は苗植え日から今日までで指定してください");
    }
    HarvestGrowthObservations.save({ ...(existing || {}), plantingEventId:group.plantingEventId,
      plantingDate:group.plantingDate, palletKeys, readyDate });
    invalidateDashboardGrowthEvidence();
    cancelRecordGrowthReadyEdit();
    setRecordGrowthReadyNotice("適期確認を端末に保存しました。収穫時に同じ作へ引き継ぎます。");
    syncRecordGrowthReady(false);
  }catch(error){ setRecordGrowthReadyNotice(error.message || "端末に保存できませんでした"); }
}

function editRecordGrowthReady(id){
  const row = HarvestGrowthObservations.list().find(item => item.observationId === id);
  if(!row) return;
  recordGrowthReadyEditingId = id;
  const pallet = row.palletKeys.length ? parsePalletKey(row.palletKeys[0]) : {building:row.building,bed:row.bed || "A"};
  const select = document.getElementById("recordGrowthReadyCrop");
  select.innerHTML = `<option>${escapeHtml(row.plantingDate)} 苗植え・保存済み記録の修正</option>`;
  select.disabled = true;
  renderRecordGrowthReadyForm({...row, building:pallet.building, bed:pallet.bed}, row);
  document.getElementById("recordGrowthObservationKind").value = row.kind;
  changeRecordGrowthObservationKind();
  document.getElementById("recordGrowthObservationKind").disabled = true;
  document.getElementById("recordGrowthReadyDate").value = row.readyDate || row.date || row.startDate;
  document.getElementById("recordGrowthObservationEndDate").value = row.endDate || "";
  document.getElementById("recordGrowthAllHouse").checked = !row.bed && ["ec","condition","environment"].includes(row.kind);
  if(row.kind === "ec"){
    document.getElementById("recordGrowthEcValue").value = row.payload.value;
    document.getElementById("recordGrowthEcAbnormal").checked = row.payload.isAbnormal === true;
  }
  if(row.kind === "manualOffset") document.getElementById("recordGrowthManualDays").value = row.payload.days;
  if(row.kind === "condition"){
    document.getElementById("recordGrowthConditionType").value = row.payload.type;
    document.getElementById("recordGrowthConditionNote").value = row.payload.note || "";
  }
  if(row.kind === "environment"){
    ["temperature","light","humidity"].forEach(key=>document.getElementById(`recordGrowthEnvironment-${key}`).value = row.payload[key]);
    document.getElementById("recordGrowthEnvironmentPolicy").value = row.payload.dataPolicy;
  }
  if(row.kind === "fieldAssessment"){
    document.getElementById("recordGrowthFieldSize").value = row.payload.size;
    ["elongated","uneven","tipburn"].forEach(key=>document.getElementById(`recordGrowthField-${key}`).value = ({low:"slight",high:"many"})[row.payload.quality[key]] || row.payload.quality[key]);
  }
  setRecordGrowthReadyNotice("確認日を修正できます。対象の作・パレットは元の記録を保持します。");
}

function cancelRecordGrowthReadyEdit(){
  recordGrowthReadyEditingId = "";
  resetRecordGrowthObservationDraft();
  document.getElementById("recordGrowthObservationKind").disabled = false;
  changeRecordGrowthReadyPlace();
}

function removeRecordGrowthReady(id){
  if(!ensureGoogleSheetLocalMutationAllowed("適期確認を取り消す操作を")) return;
  try{
    HarvestGrowthObservations.remove(id);
    invalidateDashboardGrowthEvidence();
    cancelRecordGrowthReadyEdit();
    setRecordGrowthReadyNotice("適期確認を取り消しました。取消履歴は保持します。");
    syncRecordGrowthReady(false);
  }catch(error){ setRecordGrowthReadyNotice(error.message || "取消を保存できませんでした"); }
}

function renderRecordGrowthReadyHistory(){
  const container = document.getElementById("recordGrowthReadyHistory");
  if(!container) return;
  const building = Number(document.getElementById("recordGrowthReadyBuilding").value);
  const bed = document.getElementById("recordGrowthReadyBed").value;
  const rows = HarvestGrowthObservations.list({includeDeleted:true})
    .filter(row => row.palletKeys.some(key => key.startsWith(`${building}-${bed}-`)) || row.building === building && (!row.bed || row.bed === bed))
    .sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  const pending = new Set(HarvestGrowthObservations.pendingIds());
  container.innerHTML = rows.slice(0,recordGrowthReadyHistoryLimit).map(row => `<div class="recordGrowthReadyHistoryItem">
    <strong>${escapeHtml(row.readyDate || row.date || row.startDate)} ${row.deletedAt ? "（取消済み）" : escapeHtml(getRecordGrowthObservationLabel(row))}</strong>
    <div>${row.plantingDate ? `${escapeHtml(row.plantingDate)}苗植え・` : ""}${row.palletKeys.length ? `${row.palletKeys.length}パレット` : "指定の号棟・ベッド"} ${pending.has(row.observationId) ? "未送信" : "共有済み"}</div>
    ${row.deletedAt ? "" : `<div class="recordGrowthReadyHistoryActions"><button type="button" class="dashboardInlineBtn" data-ui-click="editRecordGrowthReady" data-ui-arg="${escapeHtml(row.observationId)}">修正</button><button type="button" class="dashboardInlineBtn" data-ui-click="removeRecordGrowthReady" data-ui-arg="${escapeHtml(row.observationId)}">取り消す</button></div>`}
  </div>`).join("") || '<p>このベッドの適期確認はありません。</p>';
  document.getElementById("recordGrowthReadyMore").hidden = rows.length <= recordGrowthReadyHistoryLimit;
  renderRecordGrowthObservationConflicts();
}

function showMoreRecordGrowthReady(){ recordGrowthReadyHistoryLimit += 20; renderRecordGrowthReadyHistory(); }

function renderRecordGrowthObservationConflicts(){
  const container = document.getElementById("recordGrowthReadyConflicts");
  if(!container) return;
  const localById = new Map(HarvestGrowthObservations.list({includeDeleted:true}).map(row=>[row.observationId,row]));
  container.innerHTML = HarvestGrowthObservations.conflicts().map(item => `<div class="recordGrowthReadyConflict">
    <strong>同じ確認記録が別の端末でも変更されています</strong>
    <p>端末：${escapeHtml(localById.get(item.observationId)?.readyDate || "取消・その他の記録")}／共有先：${escapeHtml(item.server?.readyDate || "取消・その他の記録")}</p>
    <div class="recordGrowthReadyHistoryActions"><button type="button" class="dashboardInlineBtn" data-ui-click="resolveRecordGrowthObservationConflict" data-ui-arg="${escapeHtml(item.observationId)}" data-ui-arg2="local">端末の内容を使用</button><button type="button" class="dashboardInlineBtn" data-ui-click="resolveRecordGrowthObservationConflict" data-ui-arg="${escapeHtml(item.observationId)}" data-ui-arg2="server">共有先の内容を使用</button></div>
  </div>`).join("");
}

function resolveRecordGrowthObservationConflict(id, choice){
  if(!ensureGoogleSheetLocalMutationAllowed("生育確認の競合を解決する操作を")) return;
  try{
    HarvestGrowthObservations.resolveConflict(id,choice);
    invalidateDashboardGrowthEvidence(); renderRecordGrowthReadyHistory(); syncRecordGrowthReady(false);
  }catch(error){ setRecordGrowthReadyNotice(error.message); }
}

async function syncRecordGrowthReady(showResult = false){
  if(recordGrowthReadySyncing) return;
  const config = loadGoogleSheetConfig();
  const status = document.getElementById("recordGrowthReadySyncStatus");
  const pendingText = () => `端末に保存済み・未送信${HarvestGrowthObservations.pendingCount()}件`;
  if(!config?.url || !config?.token){ if(status) status.textContent = `${pendingText()}。Google連携を設定すると共有できます。`; return; }
  const scope = getActiveRecordsStorageKey();
  const revision = HarvestGrowthObservations.revision();
  recordGrowthReadySyncing = true;
  if(status) status.textContent = "確認記録を共有しています…";
  try{
    const result = await HarvestGrowthObservations.sync({config});
    if(scope !== getActiveRecordsStorageKey()) return;
    if(HarvestGrowthObservations.revision() !== revision) invalidateDashboardGrowthEvidence();
    if(status) status.textContent = result.pending ? pendingText() : "確認記録は共有済みです";
    if(showResult) showToast(result.pending ? "未送信・競合の確認記録があります" : "確認記録を共有しました");
  }catch(error){
    if(scope === getActiveRecordsStorageKey() && status) status.textContent = `${pendingText()}。${error.message || "通信できません。後で再送できます。"}`;
  }finally{
    recordGrowthReadySyncing = false;
    if(scope === getActiveRecordsStorageKey() && document.getElementById("recordGrowthReadyDialog")?.open){
      if(recordGrowthUnratedMode) renderRecordGrowthUnrated();
      else renderRecordGrowthReadyHistory();
    }
  }
}

function getRecordGrowthObservationLabel(row){
  const labels = {ready:"適期確認",fieldAssessment:"途中評価",ec:"EC測定",condition:"特殊条件",environment:"環境特性",manualOffset:"手動補正"};
  let text = labels[row.kind] || "適期確認";
  if(row.kind === "ec") text += ` ${row.payload.value} mS/cm`;
  if(row.kind === "manualOffset") text += ` ${row.payload.days > 0 ? "+" : ""}${row.payload.days}日`;
  if(row.endDate) text += ` 〜${row.endDate}`;
  return text;
}

function changeRecordGrowthObservationKind(){
  const kind = document.getElementById("recordGrowthObservationKind").value;
  const independent = ["ec","condition","environment"].includes(kind);
  document.getElementById("recordGrowthReadyActions").hidden = kind !== "ready";
  document.getElementById("recordGrowthObservationFields").hidden = kind === "ready";
  document.getElementById("recordGrowthAllHouseLabel").hidden = !independent;
  document.querySelectorAll("[data-growth-kind]").forEach(element=>element.hidden = !element.dataset.growthKind.split(" ").includes(kind));
  if(independent && !recordGrowthReadyEditingId){
    const building = Number(document.getElementById("recordGrowthReadyBuilding").value),bed = document.getElementById("recordGrowthReadyBed").value;
    renderRecordGrowthReadyForm({building,bed,plantingDate:"",palletKeys:Array.from({length:PALLETS_PER_BED},(_,n)=>getPalletKey(building,bed,n+1))});
  }else if(!independent && !recordGrowthReadyEditingId){
    const group=getRecordGrowthReadyGroups().find(item=>item.id === document.getElementById("recordGrowthReadyCrop").value);
    renderRecordGrowthReadyForm(group);
  }
  const quality = document.getElementById("recordGrowthFieldQuality");
  if(!quality.childElementCount) quality.innerHTML = [["elongated","徒長"],["uneven","ばらつき"],["tipburn","チップバーン"]].map(([key,label])=>`<label>${label}<select id="recordGrowthField-${key}">${["unknown","none","slight","many"].map(value=>`<option value="${value}">${getHarvestSymptomStatusLabel(value)}</option>`).join("")}</select></label>`).join("");
  const environment = document.getElementById("recordGrowthEnvironmentFields");
  if(!environment.childElementCount) environment.innerHTML = [["temperature","温度"],["light","日光"],["humidity","湿度"]].map(([key,label])=>`<label>${label}<select id="recordGrowthEnvironment-${key}"><option value="base">基準と同じ</option><option value="high">高め・多め</option><option value="low">低め・少なめ</option></select></label>`).join("");
}

function saveRecordGrowthObservation(){
  if(recordGrowthReadyScope !== getActiveRecordsStorageKey()){ closeRecordGrowthReady(); return; }
  if(!ensureGoogleSheetLocalMutationAllowed("生育記録を保存する操作を")) return;
  try{
    ensureDashboardGrowthSafetySnapshot();
    const kind = document.getElementById("recordGrowthObservationKind").value;
    if(kind === "ready"){ saveRecordGrowthReady(); return; }
    const existing = recordGrowthReadyEditingId ? HarvestGrowthObservations.list().find(row=>row.observationId === recordGrowthReadyEditingId) : null;
    if(recordGrowthReadyEditingId && !existing) throw new Error("保存済みの記録を開き直してください");
    const crop = existing || getRecordGrowthReadyGroups().find(item=>item.id === document.getElementById("recordGrowthReadyCrop").value);
    const independent = ["ec","condition","environment"].includes(kind);
    if(!independent && !crop) throw new Error("対象の苗植え記録が必要です");
    const allHouse = independent && document.getElementById("recordGrowthAllHouse").checked;
    const selected = [...document.querySelectorAll("#recordGrowthReadyPallets input:checked")].map(input=>input.dataset.readyPallet);
    const row = existing ? {...existing} : {kind,palletKeys:allHouse ? [] : selected};
    if(!existing){
      if(independent) Object.assign(row,{building:Number(document.getElementById("recordGrowthReadyBuilding").value),bed:allHouse ? "" : document.getElementById("recordGrowthReadyBed").value});
      else Object.assign(row,{plantingEventId:crop.plantingEventId,plantingDate:crop.plantingDate});
    }
    const date = document.getElementById("recordGrowthReadyDate").value;
    if(["condition","environment"].includes(kind)) Object.assign(row,{startDate:date,endDate:document.getElementById("recordGrowthObservationEndDate").value});
    else row.date = date;
    if(kind === "ec"){
      const value = document.getElementById("recordGrowthEcValue").value;
      if(value.trim() === "") throw new Error("測定したECを入力してください");
      row.payload = {value:Number(value),unit:"mS/cm"};
      if(document.getElementById("recordGrowthEcAbnormal").checked) row.payload.isAbnormal = true;
    }
    if(kind === "condition") row.payload = {type:document.getElementById("recordGrowthConditionType").value,dataPolicy:"exclude",note:document.getElementById("recordGrowthConditionNote").value};
    if(kind === "environment") row.payload = {dataPolicy:document.getElementById("recordGrowthEnvironmentPolicy").value,
      ...Object.fromEntries(["temperature","light","humidity"].map(key=>[key,document.getElementById(`recordGrowthEnvironment-${key}`).value]))};
    if(kind === "manualOffset"){
      const days = document.getElementById("recordGrowthManualDays").value;
      if(days.trim() === "") throw new Error("補正日数を入力してください");
      row.payload = {days:Number(days),sourcePredictionId:existing?.payload?.sourcePredictionId || dashboardGrowthPredictionModelCache?.predictionId || ""};
      if(!row.payload.sourcePredictionId) throw new Error("先に生育予測を一度開き、元の予測を保存してください");
    }
    if(kind === "fieldAssessment") row.payload = {size:document.getElementById("recordGrowthFieldSize").value,
      quality:Object.fromEntries(["elongated","uneven","tipburn"].map(key=>{const value=document.getElementById(`recordGrowthField-${key}`).value;return [key,({slight:"low",many:"high"})[value] || value];}))};
    HarvestGrowthObservations.save(row);
    invalidateDashboardGrowthEvidence(); cancelRecordGrowthReadyEdit();
    setRecordGrowthReadyNotice("端末に保存しました。通信できるときに共有します。");
    syncRecordGrowthReady(false);
  }catch(error){ setRecordGrowthReadyNotice(error.message || "保存できませんでした"); }
}

function resetRecordGrowthObservationDraft(){
  ["recordGrowthEcValue","recordGrowthObservationEndDate","recordGrowthConditionNote"].forEach(id=>{const input=document.getElementById(id);if(input) input.value="";});
  ["recordGrowthAllHouse","recordGrowthEcAbnormal"].forEach(id=>{const input=document.getElementById(id);if(input) input.checked=false;});
  const kind=document.getElementById("recordGrowthObservationKind");if(kind) kind.disabled=false;
  const days=document.getElementById("recordGrowthManualDays");if(days) days.value="0";
  const size=document.getElementById("recordGrowthFieldSize");if(size) size.value="unknown";
  ["elongated","uneven","tipburn"].forEach(key=>{const input=document.getElementById(`recordGrowthField-${key}`);if(input) input.value="unknown";});
  ["temperature","light","humidity"].forEach(key=>{const input=document.getElementById(`recordGrowthEnvironment-${key}`);if(input) input.value="base";});
  const policy=document.getElementById("recordGrowthEnvironmentPolicy");if(policy) policy.value="normal";
}

function bindRecordGrowthRangeSelection(){
  const container = document.getElementById("recordGrowthReadyPallets");
  if(!container) return;
  const inputs = [...container.querySelectorAll("input[data-ready-pallet]")];
  // Same orientation as appendBedOverviewMap: far end (77/78) to near end (1/2).
  const sections = Array.from({length:6},(_,index)=>inputs.filter(input=>{
    const number = parsePalletKey(input.dataset.readyPallet).number;
    return Math.min(5,Math.floor((PALLETS_PER_BED-number)*6/PALLETS_PER_BED)) === index;
  }));
  const map = document.createElement("div"); map.className = "recordGrowthRangeMap";
  map.innerHTML = sections.map((section,index)=>`<button type="button" data-growth-range="${index}" aria-pressed="true"${!section.length || section.every(input=>input.disabled) ? " disabled" : ""}>${section.length ? `${Math.min(...section.map(input=>parsePalletKey(input.dataset.readyPallet).number))}〜${Math.max(...section.map(input=>parsePalletKey(input.dataset.readyPallet).number))}` : "対象外"}</button>`).join("");
  container.prepend(map);
  const refresh = ()=>map.querySelectorAll("button").forEach((button,index)=>button.setAttribute("aria-pressed",String(sections[index].length > 0 && sections[index].every(input=>input.checked))));
  let drawing = false, selected = true, touched = new Set();
  const apply = button=>{
    if(!button || button.disabled || touched.has(button)) return;
    touched.add(button); sections[Number(button.dataset.growthRange)].forEach(input=>{if(!input.disabled) input.checked = selected;}); refresh();
  };
  map.addEventListener("pointerdown",event=>{
    const button=event.target.closest("button"); if(!button || button.disabled) return;
    event.preventDefault(); drawing=true; touched=new Set(); selected=button.getAttribute("aria-pressed") !== "true";
    map.setPointerCapture(event.pointerId); apply(button);
  });
  map.addEventListener("pointermove",event=>{if(drawing) apply(document.elementFromPoint(event.clientX,event.clientY)?.closest(".recordGrowthRangeMap button"));});
  ["pointerup","pointercancel"].forEach(type=>map.addEventListener(type,()=>{drawing=false;}));
  map.addEventListener("click",event=>{if(event.detail === 0){const button=event.target.closest("button"); if(button){touched=new Set();selected=button.getAttribute("aria-pressed") !== "true";apply(button);}}});
  container.addEventListener("change",refresh); refresh();
}

function renderRecordHarvestReadyCarrySummary(){
  const element = document.getElementById("recordGrowthReadyCarrySummary");
  if(!element || typeof HarvestGrowthReadiness === "undefined") return;
  const recordDate = document.getElementById("recordDateInput")?.value;
  if(!isStrictDateOnlyString(recordDate)){ element.textContent=""; return; }
  const index = buildDashboardGrowthPlantingIndex(), groups = new Map();
  harvestFillKeys.forEach(key=>{
    const planting=getDashboardGrowthPriorPlanting(index,key,parseDateOnlyString(recordDate));
    if(!planting) return;
    const id=`${planting.eventId}:${formatDateOnlyString(planting.date)}`;
    if(!groups.has(id)) groups.set(id,{planting,keys:[]}); groups.get(id).keys.push(key);
  });
  const observations=HarvestGrowthObservations.list({kind:"ready"}), dates=new Map();
  groups.forEach(({planting,keys})=>HarvestGrowthReadiness.resolve({plantingEventId:planting.eventId,
    plantingDate:formatDateOnlyString(planting.date),palletKeys:keys,harvestDate:recordDate,manual:{mode:"auto"},observations})
    .forEach(group=>{if(group.readyDate) dates.set(group.readyDate,(dates.get(group.readyDate)||0)+group.palletKeys.length);}));
  element.textContent=dates.size ? `保存済みの適期確認：${[...dates].map(([date,count])=>`${date}・${count}パレット`).join("、")}。引継ぎを選んだ作だけに反映します。` : "対応する適期確認は未入力です。空欄を収穫日や正常扱いで補いません。";
}

function openRecordGrowthUnrated(){
  openRecordGrowthReady();
  recordGrowthUnratedMode=true;
  renderRecordGrowthUnrated();
}

function renderRecordGrowthUnrated(){
  const rows=records.filter(record=>record.type !== "partialHarvest" && getHarvestGrowthOverallState(record).sizeRating === "unknown").slice(0,100);
  document.getElementById("recordGrowthReadyForm").hidden=true;
  const controls=rows.length ? `<section class="recordGrowthBulkEditor" aria-label="選択した収穫のまとめ評価">
    <label>育ち具合<select id="recordGrowthBulkSize"><option value="">選択してください</option><option value="small">小さめ</option><option value="normal">並</option><option value="large">大きめ</option></select></label>
    ${[["uneven","ばらつき"],["elongated","徒長"],["tipburn","チップバーン"]].map(([key,label])=>`<label>${label}<select id="recordGrowthBulk-${key}"><option value="keep">変更しない</option><option value="unknown">不明</option><option value="none">確認してなし</option><option value="slight">少し</option><option value="many">多い</option></select></label>`).join("")}
    <button type="button" class="actionBtn" data-ui-click="saveGrowthUnratedRecords">選択した記録へ保存</button>
  </section>` : "";
  document.getElementById("recordGrowthReadyHistory").innerHTML=controls+(rows.map(record=>`<div class="recordGrowthReadyHistoryItem"><label><input type="checkbox" data-growth-unrated="${record.id}">${escapeHtml(record.date)} ${escapeHtml(record.palletSummary || "")}・${record.cases}ケース</label><button type="button" class="dashboardInlineBtn" data-ui-click="editGrowthUnratedRecord" data-ui-number="${record.id}">個別に評価</button></div>`).join("") || "未評価の収穫はありません");
  setRecordGrowthReadyNotice("選択した収穫へ同じ評価をまとめて保存できます。品質は「変更しない」のままなら既存値を保ち、「確認してなし」を選んだ場合だけ症状なしになります。");
}

function editGrowthUnratedRecord(id){ closeRecordGrowthReady(); editHarvestRecord(Number(id)); openRecordHarvestStage("quality"); }

function buildGrowthUnratedRecordUpdate(record,size,quality){
  if(record?.type!=="fullHarvest" || !["small","normal","large"].includes(size)) throw new Error("まとめ評価の対象または育ち具合が正しくありません");
  const overall=getHarvestGrowthOverallState(record),detail=normalizeHarvestGrowthDetail(record.growthDetail,getHarvestBedKeysFromPalletKeys(record.palletKeys));
  const chosen=quality && typeof quality==="object" ? quality : {};
  const nextDetail={...detail,schemaVersion:3,readyDate:overall.readyDate,
    readyDateMode:overall.readyDateMode,cultivar:overall.cultivar || DASHBOARD_GROWTH_CULTIVAR,
    unevenStatus:chosen.uneven==="keep" || !chosen.uneven ? overall.unevenStatus : normalizeHarvestSymptomStatus(chosen.uneven),
    elongatedStatus:chosen.elongated==="keep" || !chosen.elongated ? overall.elongatedStatus : normalizeHarvestSymptomStatus(chosen.elongated),
    tipburnStatus:chosen.tipburn==="keep" || !chosen.tipburn ? overall.tipburnStatus : normalizeHarvestSymptomStatus(chosen.tipburn)};
  nextDetail.uneven=isHarvestSymptomPresent(nextDetail.unevenStatus);
  nextDetail.elongated=isHarvestSymptomPresent(nextDetail.elongatedStatus);
  nextDetail.tipburn=isHarvestSymptomPresent(nextDetail.tipburnStatus);
  return {...record,sizeRating:size,growthDetail:nextDetail,syncSchemaVersion:RECORD_SYNC_SCHEMA_VERSION,
    syncProvidedFields:[...RECORD_SYNC_FIELD_KEYS]};
}

function saveGrowthUnratedRecords(){
  if(recordGrowthReadyScope !== getActiveRecordsStorageKey()){closeRecordGrowthReady();showToast("利用者が切り替わりました。もう一度開いてください");return;}
  if(!ensureProtectedOperationAccess("未評価の収穫をまとめて評価",{workerAllowed:true})) return;
  if(!ensureGoogleSheetLocalMutationAllowed("未評価の収穫をまとめて評価",{allowBackgroundSend:true})) return;
  const ids=new Set([...document.querySelectorAll("input[data-growth-unrated]:checked")].map(input=>Number(input.dataset.growthUnrated)).filter(Number.isFinite));
  const size=document.getElementById("recordGrowthBulkSize")?.value || "";
  const quality=Object.fromEntries(["uneven","elongated","tipburn"].map(key=>[key,document.getElementById(`recordGrowthBulk-${key}`)?.value || "keep"]));
  if(!ids.size){setRecordGrowthReadyNotice("評価する収穫を選択してください。");return;}
  if(!["small","normal","large"].includes(size)){setRecordGrowthReadyNotice("育ち具合を選択してください。");return;}
  const selected=records.filter(record=>ids.has(Number(record.id)) && record.type==="fullHarvest");
  if(selected.length!==ids.size || selected.some(record=>!ensureSyncConflictResolvedBeforeChange("record",record,"未評価の収穫をまとめて評価"))) return;
  if(!window.confirm(`${selected.length}件の収穫記録へ同じ育ち具合・品質評価を保存しますか？`)) return;
  const originalRecords=records;
  let committed=false;
  try{
    ensureDashboardGrowthSafetySnapshot();
    const selectedIds=new Set(selected.map(record=>Number(record.id))),updated=[];
    records=records.map(record=>{
      if(!selectedIds.has(Number(record.id))) return record;
      const next=buildGrowthUnratedRecordUpdate(record,size,quality);
      updated.push(next);return next;
    });
    saveRecordsToStorage({deferLifecycle:true});
    committed=true;
    const queued=queueGoogleSheetRecordBatchSend(updated,{failureMessage:"まとめ評価は端末内に保存済みです。スプレッドシートは未送信です"});
    invalidateDashboardGrowthEvidence();openRecordGrowthUnrated();
    setRecordGrowthReadyNotice(`${updated.length}件を端末に保存しました。${queued===updated.length ? "共有を予約しました。" : "未送信の記録は後で再送できます。"}`);
  }catch(error){
    if(!committed){records=originalRecords;invalidateRecordDerivedCaches({harvestRecords:true});}
    setRecordGrowthReadyNotice(committed ? "まとめ評価は端末内に保存済みです。画面更新または共有予約に失敗したため、後で再送してください。"
      : (error?.message || "まとめ評価を保存できませんでした。記録は変更していません。"));
  }
}
