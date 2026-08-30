// ===== 記録一覧：編集・履歴・削除 =====
function deleteRecord(id, options = {}){
  if(!options.accessChecked && !ensureProtectedOperationAccess("記録の削除")) return;
  const deletedRecord = getRecordById(id);
  if(!deletedRecord){
    showToast("削除する記録が見つかりません");
    return;
  }
  if(deletedRecord.type === "fullHarvest" && getRemotePlantingEventDependenciesForHarvest(deletedRecord.id).length){
    showToast("この収穫記録を使った苗植え履歴があります。先に苗植え履歴を削除してください");
    return;
  }
  const deletingActivePlantingRecord = Number(activePlantingRecordId) === Number(id);
  const deletingEditedRecord = Number(editingHarvestRecordId) === Number(id);
  const deletingEditedPartialRecord = Number(editingPartialHarvestRecordId) === Number(id);
  const deletingSplitRecord = Number(splittingHarvestRecordId) === Number(id);
  const recordForTrash = normalizeStoredRecord(options.deletedRecordOverride) || deletedRecord;
  addRecordToTrash(recordForTrash, { sheetDeleted: !!options.sheetDeleted });
  records = records.filter(r => Number(r.id) !== Number(id));
  const syncStatus = loadGoogleSheetSyncStatus();
  clearGoogleSheetRecordSyncStatus(syncStatus, deletedRecord);
  clearGoogleSheetRecordSyncStatus(syncStatus, recordForTrash);
  saveGoogleSheetSyncStatus(syncStatus);
  saveRecordsToStorage();
  if(deletingActivePlantingRecord && deletedRecord?.type === "fullHarvest"){
    harvestFillKeys = Array.isArray(deletedRecord.palletKeys) ? [...deletedRecord.palletKeys] : [];
    if(harvestFillKeys.length){
      recalcHarvestSummary();
    }else{
      harvestSummary = null;
    }
    enterHarvestRecordMode();
    captureRecordBaseSelection();
    clearRecordForm();
  }else if(deletingEditedRecord){
    clearRecordForm();
  }else if(deletingEditedPartialRecord){
    closePartialHarvestEditWindow();
  }else if(deletingSplitRecord){
    closeHarvestPartialSplitWindow();
  }
  refreshRecordDataUi();
  showToast(options.sheetDeleted ? "アプリとスプレッドシートから削除しました" : "アプリから削除しました");
}

async function confirmDeleteRecord(id){
  if(!ensureProtectedOperationAccess("記録の削除")) return;
  if(!ensureGoogleSheetLocalMutationAllowed("記録を削除")) return;
  const record = getRecordById(id);
  if(!record){
    showToast("削除する記録が見つかりません");
    return;
  }
  if(!ensureSyncConflictResolvedBeforeChange("record", record, "記録を削除")) return;
  if(record.type === "fullHarvest" && getRemotePlantingEventDependenciesForHarvest(record.id).length){
    showToast("この収穫記録を使った苗植え履歴があります。先に苗植え履歴を削除してください");
    return;
  }
  if(!window.confirm("この記録をアプリから削除しますか？\n\n削除後30日以内なら、削除済みの記録から復元できます。")) return;

  const configValidation = validateGoogleSheetConfig(loadGoogleSheetConfig());
  const syncStatus = loadGoogleSheetSyncStatus();
  const hasBeenSentToSheet = !isGoogleSheetRecordUnsent(record, syncStatus);
  if(hasBeenSentToSheet && !configValidation.ok){
    showRecordImportError(configValidation.message + "。スプレッドシート連携済みの記録を削除するには、連携設定が必要です。", "削除前に設定してください");
    return;
  }
  const shouldDeleteFromSheet = configValidation.ok && hasBeenSentToSheet && window.confirm(
    "スプレッドシート側の記録も削除しますか？\n\n「OK」: アプリとスプレッドシートから削除\n「キャンセル」: アプリからのみ削除"
  );
  let sheetDeleted = false;
  let deletedRecordOverride = null;
  const operationOwner = beginGoogleSheetOperation("sending");
  if(!operationOwner){
    showToast(getGoogleSheetOperationBusyMessage("記録を削除"));
    return;
  }

  try{
    if(shouldDeleteFromSheet){
      showToast("スプレッドシート側の記録を削除中です...");
      try{
        const result = await deleteRecordFromGoogleSheet(record, { operationOwner });
        sheetDeleted = !!(result.deleted || result.alreadyDeleted || result.notFound);
        deletedRecordOverride = normalizeImportedRecord(
          normalizeGoogleSheetRowRecord(result.record),
          0
        );
        if(result.notFound){
          showToast("スプレッドシート側へ削除情報を登録しました");
        }
      }catch(e){
        showRecordImportError(
          "スプレッドシート側の削除に失敗したため、アプリ側の記録も残しています。\n\n詳細: " + String(e?.message || e),
          "削除失敗"
        );
        return;
      }
    }

    deleteRecord(id, { accessChecked: true, sheetDeleted, deletedRecordOverride });
  }finally{
    endGoogleSheetOperation(operationOwner);
  }
}

function editHarvestRecord(id, options = {}){
  if(!options.accessChecked && !ensureProtectedOperationAccess("収穫記録の編集")) return;
  if(!ensureGoogleSheetLocalMutationAllowed("収穫記録を編集")) return;
  const record = getRecordById(id);
  if(!record || record.type !== "fullHarvest"){
    showToast("編集する収穫記録が見つかりません");
    return;
  }
  if(!ensureSyncConflictResolvedBeforeChange("record", record, "収穫記録を編集")) return;

  const wasAlreadyEditingHarvestRecord = !!editingHarvestRecordId;
  if(switchTab("record") === false) return;
  if(!wasAlreadyEditingHarvestRecord && !options.skipForecastCapture) captureForecastSelectionState();
  enterHarvestRecordMode();
  editingHarvestRecordId = Number(record.id);
  recordSelectionMode = "harvest";
  activePlantingRecordId = null;
  plantingRecordDraft = null;
  recordPlantingSummaryEdited = false;

  const dateInput = document.getElementById("recordDateInput");
  if(dateInput){
    dateInput.value = record.date || "";
    updateRecordWeekdayDisplay();
  }

  const casesInput = document.getElementById("recordCasesInput");
  if(casesInput){
    const partialCaseDeduction = getPartialHarvestCaseDeductionForDate(record.date, records, {
      excludeRecordId: record.id
    });
    const totalCasesForInput = clampNumber(record.cases, 0, 999999, 0) + partialCaseDeduction;
    casesInput.value = totalCasesForInput > 0 ? String(totalCasesForInput) : "";
  }
  recordCasesEdited = true;

  harvestFillKeys = Array.isArray(record.palletKeys) && record.palletKeys.length
    ? [...record.palletKeys]
    : getPalletKeysFromRecord(record);
  editingHarvestSelectionKeys = [...harvestFillKeys];
  captureRecordBaseSelection();
  recalcHarvestSummary();

  const palletSummaryInput = document.getElementById("recordPalletSummaryInput");
  if(palletSummaryInput){
    palletSummaryInput.value = formatPalletSummary(harvestFillKeys);
  }

  const memoInput = document.getElementById("recordMemoInput");
  if(memoInput) memoInput.value = record.memo || "";

  const seedlingInput = document.getElementById("recordActualSeedlingTrayCountInput");
  if(seedlingInput){
    seedlingInput.value = clampNumber(record.actualSeedlingTrayCount, 0, 999999, 0) || "";
    delete seedlingInput.dataset.userEdited;
  }
  setRecordSeedlingCarryoverMode(record.actualSeedlingCarryoverMode || "loss", { silent: true });

  setSelectedQualityMemo(record.qualityMemo);
  refreshRecordModeUi();
  refreshHarvestMapViews();
  updateRecordActualLoss();
  updateRecordActualSeedlingDisplays();
  saveHarvestStateToStorage();
  requestAnimationFrame(() => requestAnimationFrame(scrollToRecordSaveCard));
  showToast(options.returnFromPlantingClear
    ? "苗植え入力を破棄して収穫記録に戻りました"
    : "収穫記録を編集できます");
}

function getRecordConsistencyIssueKey(kind, id){
  return `${kind}:${String(id || "")}`;
}

function getHarvestRecordConsistencySignature(record){
  if(!record) return "";
  const common = [
    record.type === "partialHarvest" ? "partialHarvest" : "fullHarvest",
    String(record.date || ""),
    clampNumber(record.cases, 0, 999999, 0)
  ];
  if(record.type === "partialHarvest"){
    const targets = normalizePartialHarvestTargets(record.targets)
      .map(target => [
        target.building,
        target.bed,
        target.start,
        target.end,
        target.plantsPerPallet
      ].join(":"))
      .sort();
    return JSON.stringify([...common, targets]);
  }
  const palletKeys = [...new Set(getPalletKeysFromRecord(record))].sort();
  return JSON.stringify([...common, palletKeys]);
}

function formatConsistencyPalletKeys(keys, limit = 4){
  const safeKeys = [...new Set(Array.isArray(keys) ? keys : [])];
  const labels = safeKeys.slice(0, limit).map(key => {
    const pallet = parsePalletKey(String(key || ""));
    if(!BUILDINGS.includes(pallet.building) || !bedOrder.includes(pallet.bed)) return String(key || "");
    return `${pallet.building}号棟${pallet.bed}ベッド${pallet.number}番`;
  }).filter(Boolean);
  const remaining = Math.max(0, safeKeys.length - labels.length);
  return labels.join("、") + (remaining ? `、ほか${remaining}枚` : "");
}

function buildRecordConsistencyAudit(){
  const issueByKey = new Map();
  const addIssue = (kind, entity, reason) => {
    const id = kind === "planting" ? Number(entity?.eventId) : Number(entity?.id);
    if(!Number.isFinite(id) || !reason) return;
    const key = getRecordConsistencyIssueKey(kind, id);
    if(!issueByKey.has(key)){
      issueByKey.set(key, {
        key,
        kind,
        id,
        date: String(kind === "planting" ? entity?.plantingDate : entity?.date || ""),
        recordType: entity?.type || "",
        reasons: []
      });
    }
    const issue = issueByKey.get(key);
    if(!issue.reasons.includes(reason)) issue.reasons.push(reason);
  };

  const chronologicalRecords = [...records].sort((a, b) => compareRecordsByDateDesc(b, a));
  const firstRecordBySignature = new Map();
  chronologicalRecords.forEach(record => {
    const signature = getHarvestRecordConsistencySignature(record);
    if(signature && firstRecordBySignature.has(signature)){
      addIssue("harvest", record, "同じ内容の収穫記録がすでにあります。重複していないか確認してください。");
    }else if(signature){
      firstRecordBySignature.set(signature, record);
    }
  });

  const recentFullRecords = [];
  const harvestedPalletCounts = new Map();
  chronologicalRecords.forEach(record => {
    if(record?.type !== "fullHarvest") return;
    const palletKeys = [...new Set(getPalletKeysFromRecord(record))];
    const duplicatedPalletKeys = palletKeys.filter(key => (harvestedPalletCounts.get(key) || 0) > 0);
    if(duplicatedPalletKeys.length){
      addIssue(
        "harvest",
        record,
        `収穫済みの場所と重複しています: ${formatConsistencyPalletKeys(duplicatedPalletKeys)}`
      );
    }

    recentFullRecords.push(palletKeys);
    palletKeys.forEach(key => harvestedPalletCounts.set(key, (harvestedPalletCounts.get(key) || 0) + 1));
    if(recentFullRecords.length > RECORDED_LOOKBACK_COUNT){
      const expiredKeys = recentFullRecords.shift() || [];
      expiredKeys.forEach(key => {
        const nextCount = (harvestedPalletCounts.get(key) || 0) - 1;
        if(nextCount > 0) harvestedPalletCounts.set(key, nextCount);
        else harvestedPalletCounts.delete(key);
      });
    }
  });

  const occupiedPlantingLots = new Map();
  const latestOpeningBoundary = getLatestPlantingOpeningBoundary();
  const harvestRecordById = new Map(records.map(record => [Number(record.id), record]));
  const harvestPalletKeysById = new Map();
  [...plantingEvents].sort(comparePlantingEventsAsc).forEach(event => {
    const canEditEvent = !latestOpeningBoundary
      || comparePlantingEventsAsc(event, latestOpeningBoundary) >= 0;
    event.sourceAllocations.forEach(allocation => {
      const sourceRecord = harvestRecordById.get(Number(allocation.harvestRecordId));
      if(!sourceRecord || sourceRecord.type !== "fullHarvest") return;
      const sourceDate = parseDateOnlyString(sourceRecord.date);
      const plantingDate = parseDateOnlyString(event.plantingDate);
      if(canEditEvent && sourceDate && plantingDate && sourceDate.getTime() > plantingDate.getTime()){
        addIssue("planting", event, "苗植え日が収穫元の収穫日より前になっています。");
      }

      if(!harvestPalletKeysById.has(Number(sourceRecord.id))){
        harvestPalletKeysById.set(Number(sourceRecord.id), new Set(getPalletKeysFromRecord(sourceRecord)));
      }
      const sourcePalletKeys = harvestPalletKeysById.get(Number(sourceRecord.id));
      const invalidPalletKeys = allocation.palletKeys.filter(key => !sourcePalletKeys.has(key));
      if(canEditEvent && invalidPalletKeys.length){
        addIssue(
          "planting",
          event,
          `収穫元にない場所が含まれています: ${formatConsistencyPalletKeys(invalidPalletKeys)}`
        );
      }

      allocation.palletKeys.forEach(key => {
        const lotKey = getPlantingLotKey(allocation.harvestRecordId, key);
        if(canEditEvent && occupiedPlantingLots.has(lotKey)){
          addIssue(
            "planting",
            event,
            `同じ収穫パレットを別の苗植え記録でも使用しています: ${formatConsistencyPalletKeys([key])}`
          );
        }
        occupiedPlantingLots.set(lotKey, Number(event.eventId));
      });
    });
  });

  const orderedIssues = [...issueByKey.values()].sort((a, b) => {
    const timeA = parseDateOnlyString(a.date)?.getTime() ?? Infinity;
    const timeB = parseDateOnlyString(b.date)?.getTime() ?? Infinity;
    if(timeA !== timeB) return timeA - timeB;
    if(a.kind !== b.kind) return a.kind === "harvest" ? -1 : 1;
    return a.id - b.id;
  });
  return { issueByKey, orderedIssues };
}

function renderRecordConsistencyAlert(audit){
  const alert = document.getElementById("recordConsistencyAlert");
  const title = document.getElementById("recordConsistencyAlertTitle");
  const text = document.getElementById("recordConsistencyAlertText");
  const issues = Array.isArray(audit?.orderedIssues) ? audit.orderedIssues : [];
  if(!alert) return;
  alert.hidden = issues.length === 0;
  if(!issues.length) return;
  if(title) title.textContent = `確認が必要な記録があります（${issues.length}件）`;
  if(text){
    const firstIssue = issues[0];
    text.textContent = `${firstIssue.date || "日付不明"}の記録から、古い順に編集してください。${firstIssue.reasons[0] || ""}`;
  }
}

function editFirstRecordConsistencyIssue(){
  const issue = getRecordHistoryCache().consistencyAudit?.orderedIssues?.[0];
  if(!issue){
    showToast("確認が必要な記録はありません");
    renderRecordList();
    return;
  }
  if(issue.kind === "planting"){
    editPlantingEvent(issue.id);
    return;
  }
  const record = getRecordById(issue.id);
  if(record?.type === "partialHarvest") editPartialHarvestRecord(issue.id);
  else editHarvestRecord(issue.id);
}

function invalidateRecordHistoryCache(){
  recordHistoryCache = null;
}

function getRecordHistoryCache(){
  if(recordHistoryCache) return recordHistoryCache;
  const harvestCaseTotalsByDate = getHarvestCaseTotalsByDate(records);
  const historyItems = [
    ...records.map(record => ({ kind: "harvest", id: Number(record.id), date: record.date, value: record })),
    ...plantingEvents.map(event => ({ kind: "planting", id: Number(event.eventId), date: event.plantingDate, value: event }))
  ].sort((a, b) => {
    const timeA = parseDateOnlyString(String(a.date || ""))?.getTime() ?? -Infinity;
    const timeB = parseDateOnlyString(String(b.date || ""))?.getTime() ?? -Infinity;
    if(timeA !== timeB) return timeB - timeA;
    if(a.kind !== b.kind) return a.kind === "harvest" ? -1 : 1;
    return b.id - a.id;
  });
  const itemsByDate = new Map();
  historyItems.forEach(item => {
    const dateKey = String(item.date || "");
    if(!itemsByDate.has(dateKey)) itemsByDate.set(dateKey, []);
    itemsByDate.get(dateKey).push(item);
  });
  const consistencyAudit = buildRecordConsistencyAudit();
  recordHistoryCache = { historyItems, itemsByDate, harvestCaseTotalsByDate, consistencyAudit };
  return recordHistoryCache;
}

function formatRecordHistoryDateLabel(value){
  const date = parseDateOnlyString(String(value || "").trim());
  if(!date) return "日付なしの記録";
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
  return `${date.getMonth() + 1}/${date.getDate()}（${weekday}）の記録`;
}

function renderRecordList(){
  const box = document.getElementById("recordList");
  updateTodayHarvestRecordedStatus();
  renderDeletedRecordList();
  const { historyItems, itemsByDate, harvestCaseTotalsByDate, consistencyAudit } = getRecordHistoryCache();
  renderRecordConsistencyAlert(consistencyAudit);
  if(!historyItems.length){
    box.textContent = "まだ記録がありません。";
    return;
  }

  const selectedDate = document.getElementById("recordDateInput")?.value || "";
  let visibleItems = [];

  if(selectedDate){
    visibleItems = (itemsByDate.get(selectedDate) || []).slice(0, RECORD_LIST_DISPLAY_LIMIT);
  }

  if(!visibleItems.length){
    const latestDate = historyItems[0].date;
    visibleItems = (itemsByDate.get(String(latestDate || "")) || []).slice(0, RECORD_LIST_DISPLAY_LIMIT);
  }

  const getItemKey = item => item.kind + ":" + item.id;
  const visibleIds = new Set(visibleItems.map(getItemKey));
  const hiddenLimit = Math.max(0, RECORD_LIST_DISPLAY_LIMIT - visibleItems.length);
  const hiddenItems = [];
  let hiddenTotal = 0;
  historyItems.forEach(item => {
    if(visibleIds.has(getItemKey(item))) return;
    hiddenTotal++;
    if(hiddenItems.length < hiddenLimit) hiddenItems.push(item);
  });

  const renderHistoryItem = item => {
    const issue = consistencyAudit.issueByKey.get(getRecordConsistencyIssueKey(item.kind, item.id)) || null;
    return item.kind === "planting"
      ? renderPlantingEventItemHtml(item.value, issue)
      : renderRecordItemHtml(item.value, harvestCaseTotalsByDate, issue);
  };
  const renderHistoryGroups = items => {
    const groups = new Map();
    items.forEach(item => {
      const dateKey = String(item.date || "");
      if(!groups.has(dateKey)){
        groups.set(dateKey, { dateKey, harvest: [], planting: [], partial: [] });
      }
      const group = groups.get(dateKey);
      if(item.kind === "planting") group.planting.push(item);
      else if(item.value?.type === "partialHarvest") group.partial.push(item);
      else group.harvest.push(item);
    });
    return [...groups.values()].map(group => {
      const harvestHtml = group.harvest.map(renderHistoryItem).join("");
      const plantingHtml = group.planting.map(renderHistoryItem).join("");
      const partialHtml = group.partial.length
        ? renderPartialHarvestDaySummaryHtml(group.partial, consistencyAudit)
        : "";
      const typeBadges = [
        harvestHtml ? '<span class="recordDateGroupType is-harvest">収穫</span>' : "",
        plantingHtml ? '<span class="recordDateGroupType is-planting">苗植え</span>' : "",
        partialHtml ? '<span class="recordDateGroupType is-partial">部分</span>' : ""
      ].join("");
      const primaryHtml = harvestHtml || plantingHtml
        ? `<div class="recordDateGroupPrimary">
            ${harvestHtml ? `<div class="recordDateColumn recordDateHarvestColumn">${harvestHtml}</div>` : ""}
            ${plantingHtml ? `<div class="recordDateColumn recordDatePlantingColumn">${plantingHtml}</div>` : ""}
          </div>`
        : "";
      return `<section class="recordDateGroup" data-record-history-date="${escapeHtml(group.dateKey)}">
        <div class="recordDateGroupHeader">
          <div class="recordDateGroupTitle">${escapeHtml(formatRecordHistoryDateLabel(group.dateKey))}</div>
          <div class="recordDateGroupTypes" aria-label="この日の記録">${typeBadges}</div>
        </div>
        <div class="recordDateGroupItems">
          ${primaryHtml}
          ${partialHtml ? `<div class="recordDateColumn recordDatePartialColumn">${partialHtml}</div>` : ""}
        </div>
      </section>`;
    }).join("");
  };
  const visibleHtml = renderHistoryGroups(visibleItems);
  const hiddenHtml = renderHistoryGroups(hiddenItems);

  box.innerHTML = visibleHtml + (hiddenItems.length ? `
    <details class="recordToggleWrap">
      <summary class="recordToggleSummary">一覧を見る（最近 ${hiddenItems.length} 件 / 全 ${hiddenTotal} 件）</summary>
      <div class="recordToggleBody">
        ${hiddenHtml}
      </div>
    </details>
  ` : "");
}

function renderDeletedRecordList(){
  const now = Date.now();
  if(pruneExpiredDeletedRecords(now)) saveDeletedRecordsToStorage();
  if(pruneExpiredDeletedPlantingEvents(now)) saveDeletedPlantingEventsToStorage();
  const summary = document.getElementById("recordTrashSummary");
  const count = document.getElementById("recordTrashCount");
  const box = document.getElementById("recordTrashList");
  const deletedTotal = deletedRecords.length + deletedPlantingEvents.length;
  if(count) count.textContent = String(deletedTotal);
  else if(summary) summary.textContent = "削除済みの記録（" + deletedTotal + "）";
  if(!box) return;
  if(!deletedTotal){
    box.textContent = "削除済みの記録はありません。";
    return;
  }

  const recordTrashHtml = deletedRecords.map(entry => {
    const record = entry.record;
    const safeRecordId = getSafePositiveRecordId(record.id) ?? 0;
    const safeRecordUuid = escapeHtml(normalizeRecordUuid(record.recordUuid));
    const remainingDays = Math.max(1, Math.ceil((new Date(entry.expiresAt).getTime() - now) / (24 * 60 * 60 * 1000)));
    const typeText = record.type === "partialHarvest" ? "各パレット部分収穫" : "収穫記録";
    const sheetText = entry.sheetDeleted ? "スプレッドシートも削除済み" : "アプリのみ削除";
    return `
      <div class="recordItem">
        <div class="recordTitle">${escapeHtml(record.date || "日付なし")} ${typeText}</div>
        <div class="recordMeta">収穫ケース数: ${escapeHtml(String(record.cases || 0))}\n${sheetText}\n復元可能: あと${remainingDays}日</div>
        <div class="recordActions">
          <button class="thirdBtn" data-ui-click="restoreDeletedRecord" data-ui-number="${safeRecordId}" data-ui-number-first="true" data-ui-arg="${safeRecordUuid}">復元する</button>
        </div>
      </div>
    `;
  }).join("");
  const plantingTrashHtml = deletedPlantingEvents.map(entry => {
    const event = entry.event;
    const safeEventId = getSafePositiveRecordId(event.eventId) ?? 0;
    const remainingDays = Math.max(1, Math.ceil((new Date(entry.expiresAt).getTime() - now) / (24 * 60 * 60 * 1000)));
    const sheetText = entry.sheetDeleted ? "スプレッドシートも削除済み" : "アプリのみ削除";
    return `
      <div class="recordItem">
        <div class="recordTitle">${escapeHtml(event.plantingDate || "日付なし")} 苗植え記録</div>
        <div class="recordMeta">${escapeHtml(String(event.plantingPalletKeys.length))}パレット\n${sheetText}\n復元可能: あと${remainingDays}日</div>
        <div class="recordActions">
          <button class="thirdBtn" data-ui-click="restoreDeletedPlantingEvent" data-ui-number="${safeEventId}">復元する</button>
        </div>
      </div>
    `;
  }).join("");
  box.innerHTML = recordTrashHtml + plantingTrashHtml;
}

async function restoreDeletedRecord(id, recordUuid = ""){
  if(!ensureProtectedOperationAccess("削除した記録の復元")) return;
  if(!ensureGoogleSheetLocalMutationAllowed("削除した記録を復元")) return;
  const requestedUuid = normalizeRecordUuid(recordUuid);
  const entry = deletedRecords.find(item => {
    const itemUuid = normalizeRecordUuid(item.record?.recordUuid);
    return requestedUuid
      ? itemUuid === requestedUuid
      : (!itemUuid && Number(item.record?.id) === Number(id));
  });
  if(!entry){
    showRecordImportError([
      `検索した収穫記録ID: ${String(id || "不明")}`,
      requestedUuid ? `検索した記録UUID: ${requestedUuid}` : "記録UUID: 指定なし",
      `現在の削除済み収穫記録: ${deletedRecords.length}件`,
      "",
      "考えられる原因:",
      "・すでに復元または完全削除されている",
      "・削除から30日を過ぎて自動的に消去された",
      "・別端末との同期で削除済み一覧が更新された"
    ].join("\n"), "復元対象が見つかりません");
    renderDeletedRecordList();
    return;
  }

  const entryUuid = normalizeRecordUuid(entry.record?.recordUuid);
  const currentIdOwner = getRecordById(entry.record?.id);
  const currentIdOwnerUuid = normalizeRecordUuid(currentIdOwner?.recordUuid);
  const idOwnerIsSameRecord = !!currentIdOwner && (entryUuid
    ? (!currentIdOwnerUuid || currentIdOwnerUuid === entryUuid)
    : !currentIdOwnerUuid);
  if(currentIdOwner && !idOwnerIsSameRecord){
    showRecordImportError([
      "復元対象:",
      formatRestoreHarvestRecordDetails(entry.record),
      "",
      `原因: 記録ID ${entry.record.id} が別の記録で使用されています。`,
      "競合している現在の記録:",
      formatRestoreHarvestRecordDetails(currentIdOwner),
      "",
      "内容が同じなら復元は不要です。別の記録なら、現在の記録を削除してから復元してください。"
    ].join("\n"), "収穫記録を復元できません");
    return;
  }

  const restoreConfigValidation = entry.sheetDeleted
    ? validateGoogleSheetConfig(loadGoogleSheetConfig())
    : null;
  if(entry.sheetDeleted && !restoreConfigValidation?.ok){
    showRecordImportError([
      "復元対象:",
      formatRestoreHarvestRecordDetails(entry.record),
      "",
      "処理箇所: アプリメニュー内のGoogle連携設定",
      `原因: ${restoreConfigValidation?.message || "Google連携設定を確認できません"}`,
      "設定を修正してから、もう一度復元してください。"
    ].join("\n"), "復元前にGoogle連携設定を確認してください");
    return;
  }
  const restoreConfig = restoreConfigValidation?.config || null;
  const operationOwner = beginGoogleSheetOperation("sending");
  if(!operationOwner){
    showRecordImportError([
      "復元対象:",
      formatRestoreHarvestRecordDetails(entry.record),
      "",
      "処理箇所: スプレッドシート同期処理",
      `原因: ${getGoogleSheetOperationBusyMessage("復元")}`
    ].join("\n"), "現在は復元できません");
    return;
  }

  try{
    let serverCanonical = null;
    if(entry.sheetDeleted){
      showToast("スプレッドシート側の記録を復元中です...");
      try{
        const result = await restoreRecordToGoogleSheet(entry.record, { operationOwner });
        serverCanonical = normalizeImportedRecord(
          normalizeGoogleSheetRowRecord(result.record),
          0
        );
        if(!serverCanonical){
          const responseRecord = normalizeGoogleSheetRowRecord(result?.record);
          const validation = responseRecord && typeof responseRecord === "object"
            ? validateRecordForGoogleTransfer(responseRecord, { enforceDuplicateKey: false })
            : { ok: false, message: "復元応答に記録データがありません" };
          showRecordImportError([
            "復元対象:",
            formatRestoreHarvestRecordDetails(entry.record),
            "",
            "処理箇所: Apps Scriptから返された収穫記録",
            `原因: ${validation.message || "日付・ケース数・収穫場所などの形式を確認できません"}`,
            "Apps Scriptのデプロイ版とスプレッドシートの該当行を確認してください。"
          ].join("\n"), "復元応答を読み込めません");
          return;
        }
      }catch(e){
        showRecordImportError(
          [
            "復元対象:",
            formatRestoreHarvestRecordDetails(entry.record),
            "",
            "処理箇所: スプレッドシート / Apps Script",
            `原因: ${String(e?.message || e)}`,
            "アプリ側では削除済みのまま保持しています。"
          ].join("\n"),
          "収穫記録の復元に失敗しました"
        );
        return;
      }
    }

    const entryRecordUuid = normalizeRecordUuid(entry.record?.recordUuid);
    const activeByUuid = getRecordByUuid(entryRecordUuid);
    const activeIdCandidate = getRecordById(entry.record?.id);
    const activeIdCandidateUuid = normalizeRecordUuid(activeIdCandidate?.recordUuid);
    // UUIDが異なる記録は、数値IDが同じでも別物として扱う。
    const activeById = activeIdCandidate && (
      entryRecordUuid
        ? (!activeIdCandidateUuid || activeIdCandidateUuid === entryRecordUuid)
        : !activeIdCandidateUuid
    ) ? activeIdCandidate : null;
    const activeRecord = activeByUuid || activeById;
    const restoredSource = serverCanonical || entry.record;
    const restoredState = entry.sheetDeleted ? "confirmed" : "edited";
    const restoredRecord = normalizeRecordSnapshot(restoredSource);
    if(!restoredRecord){
      const validation = validateRecordForGoogleTransfer(restoredSource, { enforceDuplicateKey: false });
      showRecordImportError([
        "復元対象:",
        formatRestoreHarvestRecordDetails(restoredSource),
        "",
        "処理箇所: 端末内の削除済み記録",
        `原因: ${validation.message || "記録の形式を読み込めません"}`,
        "日付・ケース数・収穫場所の内容を確認してください。"
      ].join("\n"), "収穫記録を復元できません");
      return;
    }
    if(activeRecord){
      const activeIndex = records.indexOf(activeRecord);
      if(activeIndex >= 0) records[activeIndex] = restoredRecord;
    }else{
      const idConflict = records.some(record => Number(record.id) === Number(restoredRecord.id));
      if(idConflict){
        const conflictingRecord = records.find(record => Number(record.id) === Number(restoredRecord.id));
        showRecordImportError([
          "復元対象:",
          formatRestoreHarvestRecordDetails(restoredRecord),
          "",
          `原因: 記録ID ${restoredRecord.id} が別の記録で使用されています。`,
          "競合している現在の記録:",
          formatRestoreHarvestRecordDetails(conflictingRecord),
          "",
          "内容が同じなら復元は不要です。別の記録なら、現在の記録を削除してから復元してください。"
        ].join("\n"), "収穫記録を復元できません");
        return;
      }
      records.push(restoredRecord);
    }
    saveRecordsToStorage();
    deletedRecords = deletedRecords.filter(item => item !== entry);
    saveDeletedRecordsToStorage();
    setGoogleSheetSyncStatus(restoredRecord, restoredState);
    if(!entry.sheetDeleted){
      // アプリだけで隠していた間のremote更新を取りこぼさないよう、次回は全差分を確認する。
      harvestnaviLocalStorage.removeItem(getActiveGoogleSheetSyncRevisionStorageKey());
    }
    refreshRecordDataUi();
    showToast(entry.sheetDeleted ? "アプリとスプレッドシートに復元しました" : "記録を復元しました");
  }finally{
    endGoogleSheetOperation(operationOwner);
  }
}

function getRecordDetailInfoHtml(rows){
  return `<div class="recordDetailInfoList">${rows.map(row => `
    <div class="recordDetailInfoRow">
      <span class="recordDetailInfoLabel">${escapeHtml(row.label)}</span>
      <span class="recordDetailInfoValue">${escapeHtml(row.value || "-")}</span>
    </div>
  `).join("")}</div>`;
}

function getRecordDetailWindowBodyHtml(infoRows, locationTitle, kind = ""){
  const locationFirst = kind === "planting" || kind === "harvest";
  const infoHtml = getRecordDetailInfoHtml(infoRows);
  const locationHtml = `
    <section class="recordDetailLocationSection${locationFirst ? " is-first" : ""}" aria-labelledby="recordDetailLocationTitle">
      <div id="recordDetailLocationTitle" class="recordDetailLocationTitle">${escapeHtml(locationTitle)}</div>
      <div id="recordDetailLocationMount">
        <div class="recordDetailLocationLoading" role="status">${escapeHtml(locationTitle)}を読み込んでいます...</div>
      </div>
    </section>
  `;
  return locationFirst
    ? `${locationHtml}${infoHtml}`
    : `${infoHtml}${locationHtml}`;
}

function getDashboardDayRecordDetailBodyHtml(infoRows){
  return `
    <section class="recordDetailLocationSection is-first" aria-label="場所の表示切り替え">
      <div class="recordDetailLocationViewTabs" role="tablist" aria-label="表示する場所">
        <button id="recordDetailHarvestLocationViewBtn" type="button" class="recordDetailLocationViewBtn"
          role="tab" aria-controls="recordDetailLocationMount" aria-selected="false"
          data-ui-click="setRecordDetailDayLocationView" data-ui-arg="harvest">収穫場所</button>
        <button id="recordDetailPlantingLocationViewBtn" type="button" class="recordDetailLocationViewBtn"
          role="tab" aria-controls="recordDetailLocationMount" aria-selected="false"
          data-ui-click="setRecordDetailDayLocationView" data-ui-arg="planting">二次定植場所</button>
      </div>
      <div id="recordDetailLocationMount"></div>
    </section>
    ${getRecordDetailInfoHtml(infoRows)}
  `;
}

function getRecordDetailHarvestPalletKeys(record){
  if(record?.type !== "partialHarvest") return getPalletKeysFromRecord(record);
  return normalizePartialHarvestTargets(record?.targets).flatMap(target => {
    const keys = [];
    for(let number = target.start; number <= target.end; number++){
      keys.push(getPalletKey(target.building, target.bed, number));
    }
    return keys;
  });
}

function formatPlantingCountsByPalletSummary(event){
  const palletKeys = [...new Set(
    (Array.isArray(event?.plantingPalletKeys) ? event.plantingPalletKeys : [])
      .filter(isValidPalletKeyString)
  )].sort((a, b) => getOrderIndexFromKey(a) - getOrderIndexFromKey(b));
  const counts = normalizePlantingCountsByPallet(
    event?.plantingCountsByPallet,
    palletKeys
  );
  const parts = [12, 16, 20].map(count => {
    const keys = palletKeys.filter(key => counts[key] === count);
    if(!keys.length) return "";
    return `${count}植え: ${compressPalletKeysToRanges(keys).join("、")}`;
  }).filter(Boolean);
  const unrecordedKeys = palletKeys.filter(key => !ALLOWED_YIELDS.includes(Number(counts[key])));
  if(unrecordedKeys.length){
    parts.push(`株数未記録: ${compressPalletKeysToRanges(unrecordedKeys).join("、")}`);
  }
  return parts.join("\n") || "株数未記録（収穫予測では収穫設定を使用）";
}

function buildRecordDetailLocationModel(kind, entity){
  const palletKeys = [...new Set(
    (kind === "planting"
      ? (Array.isArray(entity?.plantingPalletKeys) ? entity.plantingPalletKeys : [])
      : getRecordDetailHarvestPalletKeys(entity))
      .filter(isValidPalletKeyString)
  )].sort((a, b) => getOrderIndexFromKey(a) - getOrderIndexFromKey(b));
  const keySet = new Set(palletKeys);
  const palletNumbersByBed = new Map();
  palletKeys.forEach(key => {
    const pallet = parsePalletKey(key);
    const bedKey = `${pallet.building}-${pallet.bed}`;
    if(!palletNumbersByBed.has(bedKey)) palletNumbersByBed.set(bedKey, []);
    palletNumbersByBed.get(bedKey).push(pallet.number);
  });
  const buildings = BUILDINGS.filter(building => (
    palletKeys.some(key => parsePalletKey(key).building === building)
  ));
  const qualityText = kind === "planting"
    ? formatPlantingQualityMemo(getPlantingQualityMemoSummary(entity))
    : (kind === "partialHarvest" ? "部分収穫" : (formatQualityMemo(entity?.qualityMemo) || "記録なし"));
  const qualityClass = kind === "partialHarvest"
    ? "is-mixed"
    : getDashboardSeedlingQualityClass(getPlantingQualityMemoSummary(entity));
  const plantingCountsByPallet = kind === "planting"
    ? normalizePlantingCountsByPallet(entity?.plantingCountsByPallet, palletKeys)
    : {};
  const qualityByPallet = kind === "planting"
    ? Object.fromEntries(palletKeys.map(key => [key, getPlantingQualityMemoForPallet(entity, key)]))
    : {};
  const countGroups = kind === "planting"
    ? [
        ...[12, 16, 20].map(count => ({
          label: `${count}植え`,
          className: `is-planting-count-${count}`,
          keys: palletKeys.filter(key => Number(plantingCountsByPallet[key]) === count)
        })),
        {
          label: "株数未記録",
          className: "is-planting-count-unknown",
          keys: palletKeys.filter(key => !ALLOWED_YIELDS.includes(Number(plantingCountsByPallet[key])))
        }
      ].filter(group => group.keys.length > 0)
    : [{ label: qualityText, className: qualityClass, keys: palletKeys }];
  const canEditPlanting = kind === "planting" && getSafePositiveRecordId(entity?.eventId) !== null;
  const locationGroups = kind === "planting" && canEditPlanting
    ? [{
        label: "すべて",
        className: "is-planting-count-all",
        keys: palletKeys,
        isAll: true
      }, ...countGroups]
    : countGroups;
  locationGroups.forEach(group => {
    group.keySet = new Set(group.keys);
  });
  return {
    kind,
    keySet,
    palletNumbersByBed,
    buildings,
    qualityText,
    qualityClass,
    qualityByPallet,
    plantingCountsByPallet,
    countGroups,
    eventId: canEditPlanting ? Number(entity.eventId) : null,
    canEditPlanting,
    locationGroups,
    actionLabel: kind === "planting" ? "苗植え" : (kind === "partialHarvest" ? "部分収穫" : "収穫"),
    emptyText: String(entity?.locationEmptyText || "").trim()
  };
}

function getRecordDetailLocationSelectedGroup(model){
  if(model?.kind !== "planting") return null;
  return model.locationGroups.find(group => (
    group.className === recordDetailLocationSelectedGroupClass
  )) || model.locationGroups[0] || null;
}

function getRecordDetailLocationVisibleBuildings(model, group){
  if(model?.kind !== "planting" || !group) return model?.buildings || [];
  return BUILDINGS.filter(building => (
    group.keys.some(key => parsePalletKey(key).building === building)
  ));
}

function getRecordDetailLocationPalletNumbersForBed(model, building, bed, group){
  if(model?.kind !== "planting" || !group){
    return model?.palletNumbersByBed.get(`${building}-${bed}`) || [];
  }
  return group.keys
    .map(key => parsePalletKey(key))
    .filter(pallet => pallet.building === building && pallet.bed === bed)
    .map(pallet => pallet.number)
    .sort((a, b) => a - b);
}

function getRecordDetailLocationDefaultBed(model, building, group = null){
  return bedMap.find(bed => (
    getRecordDetailLocationPalletNumbersForBed(model, building, bed, group).length > 0
  )) || bedMap[0];
}

function getRecordDetailLocationMapCellHtml(model, building, bed, number, sectionStart, selectedGroup){
  const key = getPalletKey(building, bed, number);
  const isIncluded = selectedGroup ? selectedGroup.keySet.has(key) : model.keySet.has(key);
  const group = isIncluded
    ? (selectedGroup?.isAll
      ? (model.countGroups?.find(item => item.keySet.has(key)) || selectedGroup)
      : (selectedGroup || model.locationGroups.find(item => item.keySet.has(key))))
    : null;
  const stateClass = isIncluded
    ? (model.kind === "planting"
      ? getDashboardSeedlingQualityClass(model.qualityByPallet?.[key])
      : (group?.className || model.qualityClass))
    : "is-unplanted";
  const stateText = isIncluded
    ? `今回の${model.actionLabel}${group?.label ? `、${group.label}` : ""}${model.kind === "planting" ? `、${formatPlantingQualityMemo(model.qualityByPallet?.[key])}` : ""}`
    : "対象外";
  const isSelectedForEdit = model.kind === "planting"
    && model.canEditPlanting
    && recordDetailLocationSelectedPalletKeys.has(key);
  const editAttributes = model.kind === "planting" && model.canEditPlanting
    ? ` data-ui-click="toggleRecordDetailLocationPallet" data-ui-arg="${escapeHtml(key)}" role="button" tabindex="0" aria-pressed="${isSelectedForEdit ? "true" : "false"}"`
    : "";
  return `<span class="dashboardSeedlingBedMapCell ${stateClass}${sectionStart ? " is-section-start" : ""}${isSelectedForEdit ? " is-record-detail-edit-selected" : ""}" data-record-detail-pallet-number="${number}" title="${number}番 ${escapeHtml(stateText)}"${editAttributes}></span>`;
}

function getRecordDetailLocationGroupsForBed(model, building, bed, selectedGroup = null){
  const groups = selectedGroup?.isAll
    ? (Array.isArray(model?.countGroups) ? model.countGroups : [])
    : selectedGroup
    ? [selectedGroup]
    : (Array.isArray(model?.locationGroups) ? model.locationGroups : []);
  return groups.map(group => ({
    label: group.label,
    className: group.className,
    keys: group.keys.filter(key => {
      const pallet = parsePalletKey(key);
      return pallet.building === building && pallet.bed === bed;
    }),
    palletNumbers: group.keys
      .map(key => parsePalletKey(key))
      .filter(pallet => pallet.building === building && pallet.bed === bed)
      .map(pallet => pallet.number)
      .sort((a, b) => a - b)
  })).filter(group => group.palletNumbers.length > 0).map(group => ({
    ...group,
    qualitySummary: model.kind === "planting"
      ? formatPlantingQualityDistribution(group.keys, model.qualityByPallet)
      : ""
  }));
}

function getRecordDetailLocationBedMapHtml(model, building, bed, selectedGroup){
  const cells = [];
  for(let row = ROWS; row >= 1; row--){
    const displayRowIndex = ROWS - row;
    const sectionStart = displayRowIndex > 0
      && Math.floor(displayRowIndex * 6 / ROWS) > Math.floor((displayRowIndex - 1) * 6 / ROWS);
    cells.push(getRecordDetailLocationMapCellHtml(model, building, bed, row * 2 - 1, sectionStart, selectedGroup));
    cells.push(getRecordDetailLocationMapCellHtml(model, building, bed, row * 2, sectionStart, selectedGroup));
  }
  return `
    <div class="dashboardSeedlingBedMap"${model.kind === "planting" && model.canEditPlanting ? "" : " aria-hidden=\"true\""}>
      <div class="dashboardSeedlingBedMapGrid">${cells.join("")}</div>
    </div>
  `;
}

function renderRecordDetailLocationDisplay(){
  const mount = document.getElementById("recordDetailLocationMount");
  const model = recordDetailLocationModel;
  if(!mount || !model) return;
  if(!model.buildings.length){
    mount.innerHTML = `<div class="recordDetailLocationEmpty">${escapeHtml(model.emptyText || "この記録には表示できる場所情報がありません。")}</div>`;
    return;
  }
  const selectedGroup = getRecordDetailLocationSelectedGroup(model);
  if(model.kind === "planting"){
    recordDetailLocationSelectedGroupClass = selectedGroup?.className || null;
  }
  const visibleBuildings = getRecordDetailLocationVisibleBuildings(model, selectedGroup);
  if(!visibleBuildings.includes(recordDetailLocationBuilding)){
    recordDetailLocationBuilding = visibleBuildings[0];
  }
  if(!bedMap.includes(recordDetailLocationSelectedBed)){
    recordDetailLocationSelectedBed = getRecordDetailLocationDefaultBed(model, recordDetailLocationBuilding, selectedGroup);
  }

  const building = recordDetailLocationBuilding;
  const selectedBed = recordDetailLocationSelectedBed;
  const selectedNumbers = getRecordDetailLocationPalletNumbersForBed(model, building, selectedBed, selectedGroup);
  const selectedLocationGroups = getRecordDetailLocationGroupsForBed(model, building, selectedBed, selectedGroup);
  mount.innerHTML = `
    ${model.kind === "planting" ? `
      <div class="dashboardForecastBuildingTabs recordDetailLocationCountTabs" aria-label="表示する植え付け数">
        ${model.locationGroups.map(group => {
          const isSelected = group.className === selectedGroup?.className;
          return `
            <button type="button" class="dashboardForecastBuildingBtn recordDetailLocationCountBtn ${group.className}${isSelected ? " active" : ""}"
              data-ui-click="setRecordDetailLocationGroup" data-ui-arg="${group.className}"
              aria-pressed="${isSelected ? "true" : "false"}">
              ${escapeHtml(group.label)}
            </button>
          `;
        }).join("")}
      </div>
      ${model.canEditPlanting ? `
        <div class="recordDetailPlantingEditTools" aria-label="苗植え記録の編集">
          <div class="recordDetailPlantingEditHint">配置図のパレットをタップして選択し、植え付け数や品質を変更できます</div>
          <div class="recordDetailPlantingEditSummary">選択中 ${recordDetailLocationSelectedPalletKeys.size}枚</div>
          <div class="recordDetailPlantingEditActions">
            ${[12, 16, 20].map(count => `
              <button type="button" class="recordDetailPlantingEditBtn" data-ui-click="applyRecordDetailLocationPlantingCount" data-ui-number="${count}">${count}植え</button>
            `).join("")}
            ${[
              ["large", "大きい"],
              ["medium", "中"],
              ["small", "小さい"],
              ["elongated", "徒長"],
              ["other", "その他"],
              ["none", "品質不明"]
            ].map(([tag, label]) => `
              <button type="button" class="recordDetailPlantingEditBtn recordDetailPlantingQualityBtn" data-ui-click="applyRecordDetailLocationQuality" data-ui-arg="${tag}">${label}</button>
            `).join("")}
          </div>
        </div>
      ` : ""}
    ` : ""}
    <div class="dashboardForecastBuildingTabs recordDetailLocationBuildingTabs" aria-label="場所を表示する号棟">
      ${visibleBuildings.map(item => `
        <button type="button" class="dashboardForecastBuildingBtn${item === building ? " active" : ""}"
          data-record-detail-building="${item}" data-ui-click="setRecordDetailLocationBuilding" data-ui-number="${item}">
          ${item}号棟
        </button>
      `).join("")}
    </div>
    <div class="dashboardForecastBeds dashboardSeedlingStatusBeds recordDetailLocationBeds">
      ${bedMap.map(bed => {
        const numbers = getRecordDetailLocationPalletNumbersForBed(model, building, bed, selectedGroup);
        const locationGroups = getRecordDetailLocationGroupsForBed(model, building, bed, selectedGroup);
        const hasLocation = numbers.length > 0;
        const isSelected = bed === selectedBed;
        const summaryText = model.kind === "planting"
          ? locationGroups.map(group => `${group.label}×${group.palletNumbers.length}`).join(" / ")
          : `${numbers.length}パレット`;
        return `
          <button type="button"
            class="bed bedCollapsed dashboardForecastBed dashboardSeedlingStatusBed recordDetailLocationBed${hasLocation ? "" : " is-unplanted"}${isSelected ? " is-selected" : ""}"
            data-record-detail-bed="${bed}" data-ui-click="setRecordDetailLocationBed" data-ui-arg="${bed}"
            aria-pressed="${isSelected ? "true" : "false"}"
            aria-label="${bed}ベッド 今回の${model.actionLabel} ${numbers.length}パレット。詳細を表示">
            <div class="bedTitle"><span class="dashboardForecastBedName">${bed}</span></div>
            ${getRecordDetailLocationBedMapHtml(model, building, bed, selectedGroup)}
            <span class="dashboardSeedlingStatusAgeBlock">
              ${hasLocation ? `<span class="dashboardSeedlingStatusAgeLabel">今回の${model.actionLabel}</span>` : ""}
              <span class="dashboardSeedlingStatusAgeSummary">${hasLocation ? escapeHtml(summaryText) : "対象なし"}</span>
            </span>
          </button>
        `;
      }).join("")}
    </div>
    <div class="dashboardSeedlingStatusMapGuide" aria-label="配置図の色分け">
      ${model.kind === "planting" ? `
        ${(model.qualityByPallet && model.keySet.size
          ? [...new Map([...model.keySet].map(key => {
              const memo = model.qualityByPallet[key];
              return [JSON.stringify({ memo: memo || null, className: getDashboardSeedlingQualityClass(memo) }), {
                text: formatPlantingQualityMemo(memo),
                className: getDashboardSeedlingQualityClass(memo)
              }];
            })).values()]
          : [{ text: model.qualityText, className: model.qualityClass }]
        ).map(item => `
          <span class="dashboardSeedlingStatusMapGuideItem"><span class="dashboardSeedlingStatusMapGuideSwatch ${item.className}"></span>苗の品質（${escapeHtml(item.text)}）</span>
        `).join("")}
      ` : model.locationGroups.map(group => `
        <span class="dashboardSeedlingStatusMapGuideItem"><span class="dashboardSeedlingStatusMapGuideSwatch ${group.className}"></span>今回の${model.actionLabel}（${escapeHtml(group.label)}）</span>
      `).join("")}
      <span class="dashboardSeedlingStatusMapGuideItem"><span class="dashboardSeedlingStatusMapGuideSwatch is-unplanted"></span>対象外</span>
    </div>
    <div class="dashboardSeedlingStatusDetail recordDetailLocationDetail" aria-live="polite">
      <div class="dashboardSeedlingStatusDetailHeader">
        <span class="dashboardSeedlingStatusDetailTitle">${selectedBed}ベッドの詳細</span>
        <span class="dashboardSeedlingStatusDetailSummary">${selectedNumbers.length}パレット</span>
      </div>
      ${selectedNumbers.length ? `
        <div class="dashboardSeedlingStatusLots dashboardSeedlingStatusDetailLots">
          ${selectedLocationGroups.map(group => `
            <div class="dashboardSeedlingStatusLot recordDetailLocationLot">
              <span class="dashboardSeedlingStatusLotHeader">
              <span class="dashboardSeedlingStatusQuality recordDetailLocationGroupLabel ${group.className}${model.kind === "planting" ? ` ${model.qualityClass}` : ""}">${escapeHtml(group.label)}</span>
              ${group.qualitySummary ? `<span class="recordDetailLocationQualitySummary">${escapeHtml(group.qualitySummary)}</span>` : ""}
              </span>
              <span class="dashboardSeedlingStatusCount">
                <span>番号 ${escapeHtml(formatPalletNumberSideRanges(group.palletNumbers))}</span>
                <span>${group.palletNumbers.length}パレット</span>
              </span>
            </div>
          `).join("")}
        </div>
      ` : '<div class="recordDetailLocationEmpty">このベッドは今回の対象に含まれていません。</div>'}
    </div>
  `;
}

function setRecordDetailLocationGroup(groupClass){
  const model = recordDetailLocationModel;
  if(model?.kind !== "planting") return;
  const group = model.locationGroups.find(item => item.className === groupClass);
  if(!group) return;
  recordDetailLocationSelectedGroupClass = group.className;
  const visibleBuildings = getRecordDetailLocationVisibleBuildings(model, group);
  if(!visibleBuildings.includes(recordDetailLocationBuilding)){
    recordDetailLocationBuilding = visibleBuildings[0];
  }
  recordDetailLocationSelectedBed = getRecordDetailLocationDefaultBed(
    model,
    recordDetailLocationBuilding,
    group
  );
  renderRecordDetailLocationDisplay();
}

function setRecordDetailLocationBuilding(building){
  const normalized = Number(building);
  const selectedGroup = getRecordDetailLocationSelectedGroup(recordDetailLocationModel);
  const visibleBuildings = getRecordDetailLocationVisibleBuildings(recordDetailLocationModel, selectedGroup);
  if(!visibleBuildings.includes(normalized)) return;
  recordDetailLocationBuilding = normalized;
  recordDetailLocationSelectedBed = getRecordDetailLocationDefaultBed(
    recordDetailLocationModel,
    normalized,
    selectedGroup
  );
  renderRecordDetailLocationDisplay();
}

function setRecordDetailLocationBed(bed){
  if(!bedMap.includes(bed) || !recordDetailLocationModel) return;
  recordDetailLocationSelectedBed = bed;
  renderRecordDetailLocationDisplay();
}

function getRecordDetailEditablePlantingEvent(){
  const model = recordDetailLocationModel;
  if(model?.kind !== "planting" || !model.canEditPlanting || !model.eventId) return null;
  const event = getPlantingEventById(model.eventId);
  if(!event) return null;
  if(isPlantingEventBeforeLatestOpeningBoundary(event)){
    showToast("この履歴は新しい繰越基準より前にあるため編集できません");
    return null;
  }
  if(!ensureProtectedOperationAccess("苗植え記録の編集")) return null;
  if(!ensureGoogleSheetLocalMutationAllowed("苗植え記録を編集")) return null;
  if(!ensureSyncConflictResolvedBeforeChange("planting", event, "苗植え記録を編集")) return null;
  return event;
}

function refreshRecordDetailPlantingInfo(event){
  const rows = Array.from(document.querySelectorAll("#recordDetailWindowBody .recordDetailInfoRow"));
  const values = new Map([
    ["苗植えした株数", event?.detailsUnknown ? "不明" : `${event?.actualPlantedSeedlingCount ?? 0}株`],
    ["苗の品質メモ", formatPlantingQualityMemo(getPlantingQualityMemoSummary(event))]
  ]);
  rows.forEach(row => {
    const label = String(row.querySelector(".recordDetailInfoLabel")?.textContent || "").trim();
    if(!values.has(label)) return;
    const value = row.querySelector(".recordDetailInfoValue");
    if(value) value.textContent = values.get(label);
  });
}

function saveRecordDetailPlantingEvent(nextEvent, successMessage){
  if(!nextEvent) return false;
  const normalized = normalizePlantingEvent(nextEvent);
  if(!normalized) return false;
  const index = plantingEvents.findIndex(item => Number(item.eventId) === Number(normalized.eventId));
  if(index < 0) return false;
  plantingEvents[index] = normalized;
  savePlantingEventsToStorage();
  setPlantingEventSyncStatus(normalized, "edited");
  syncHarvestPlantingPendingFlags();
  refreshRecordDataUi({ maps: false });
  recordDetailLocationModel = buildRecordDetailLocationModel("planting", normalized);
  recordDetailLocationSelectedPalletKeys = new Set();
  refreshRecordDetailPlantingInfo(normalized);
  renderRecordDetailLocationDisplay();
  const sendQueued = queueGoogleSheetPlantingEventSend(normalized, {
    successMessage: `${successMessage}。スプレッドシートへ送信しました`,
    failureMessage: `${successMessage}。スプレッドシートは未送信です`
  });
  showToast(sendQueued ? `${successMessage}。スプレッドシートへ送信中です` : `${successMessage}。スプレッドシートは未送信です`);
  return true;
}

function toggleRecordDetailLocationPallet(palletKey){
  const model = recordDetailLocationModel;
  if(model?.kind !== "planting" || !model.canEditPlanting || !model.keySet.has(palletKey)) return;
  if(recordDetailLocationSelectedPalletKeys.has(palletKey)){
    recordDetailLocationSelectedPalletKeys.delete(palletKey);
  }else{
    recordDetailLocationSelectedPalletKeys.add(palletKey);
  }
  renderRecordDetailLocationDisplay();
}

function applyRecordDetailLocationPlantingCount(count){
  const event = getRecordDetailEditablePlantingEvent();
  const normalizedCount = normalizePlantingCountPreset(count);
  const selectedKeys = [...recordDetailLocationSelectedPalletKeys]
    .filter(key => event?.plantingPalletKeys?.includes(key));
  if(!event || !selectedKeys.length){
    showToast("変更するパレットを配置図から選択してください");
    return;
  }
  const nextCounts = {
    ...normalizePlantingCountsByPallet(event.plantingCountsByPallet, event.plantingPalletKeys)
  };
  selectedKeys.forEach(key => {
    nextCounts[key] = normalizedCount;
  });
  const actualPlantedSeedlingCount = getActualPlantedSeedlingTotal(
    event.plantingPalletKeys,
    nextCounts
  );
  if(!event.detailsUnknown
    && Number.isFinite(Number(event.actualTakenSeedlingCount))
    && actualPlantedSeedlingCount > Number(event.actualTakenSeedlingCount)){
    showToast("変更後の苗株数が、実際に取った苗株数を超えています");
    return;
  }
  saveRecordDetailPlantingEvent({
    ...event,
    plantingCountsByPallet: nextCounts,
    actualPlantedSeedlingCount
  }, `${selectedKeys.length}枚を${normalizedCount}植えに変更しました`);
}

function applyRecordDetailLocationQuality(tag){
  const event = getRecordDetailEditablePlantingEvent();
  const selectedKeys = [...recordDetailLocationSelectedPalletKeys]
    .filter(key => event?.plantingPalletKeys?.includes(key));
  if(!event || !selectedKeys.length){
    showToast("品質を変更するパレットを配置図から選択してください");
    return;
  }
  const normalizedTag = normalizeQualityTag(tag);
  let memo = normalizedTag
    ? { tags: [normalizedTag], other: "" }
    : { tags: [], other: "" };
  if(tag === "other"){
    const other = window.prompt("場所別の苗品質を入力してください", "");
    if(other === null) return;
    memo = { tags: [], other: String(other || "").trim() };
  }
  const qualityMemoByPallet = normalizeQualityMemoByPallet(
    event.qualityMemoByPallet,
    event.plantingPalletKeys
  );
  selectedKeys.forEach(key => {
    qualityMemoByPallet[key] = memo;
  });
  saveRecordDetailPlantingEvent({
    ...event,
    qualityMemo: getPlantingQualityMemoSummary({
      ...event,
      qualityMemoByPallet
    }),
    qualityMemoByPallet
  }, `${selectedKeys.length}枚の品質を${normalizedTag ? getQualityTagLabel(normalizedTag) : (tag === "other" ? (memo.other || "その他") : "不明")}に変更しました`);
}

function loadRecordDetailLocation(kind, id, loadToken){
  if(loadToken !== recordDetailLoadToken
    || !document.getElementById("recordDetailModal")?.classList.contains("show")) return;
  const entity = kind === "planting" ? getPlantingEventById(id) : getRecordById(id);
  const mount = document.getElementById("recordDetailLocationMount");
  if(!entity || !mount){
    if(mount) mount.innerHTML = '<div class="recordDetailLocationEmpty">場所情報を読み込めませんでした。</div>';
    return;
  }
  try{
    recordDetailLocationModel = buildRecordDetailLocationModel(kind, entity);
    recordDetailLocationSelectedPalletKeys = new Set();
    recordDetailLocationSelectedGroupClass = recordDetailLocationModel.kind === "planting"
      ? (recordDetailLocationModel.locationGroups[0]?.className || null)
      : null;
    const selectedGroup = getRecordDetailLocationSelectedGroup(recordDetailLocationModel);
    const visibleBuildings = getRecordDetailLocationVisibleBuildings(recordDetailLocationModel, selectedGroup);
    recordDetailLocationBuilding = visibleBuildings[0] ?? null;
    recordDetailLocationSelectedBed = recordDetailLocationBuilding === null
      ? null
      : getRecordDetailLocationDefaultBed(recordDetailLocationModel, recordDetailLocationBuilding, selectedGroup);
    renderRecordDetailLocationDisplay();
  }catch(error){
    console.error("記録詳細の場所表示を読み込めませんでした", error);
    mount.innerHTML = '<div class="recordDetailLocationEmpty">場所表示を読み込めませんでした。記録の場所情報を確認してください。</div>';
  }
}

function getDashboardDayRecordDetailContext(dateString){
  const date = String(dateString || "").trim();
  if(!isStrictDateOnlyString(date)) return null;
  const items = [...(getRecordHistoryCache().itemsByDate.get(date) || [])];
  if(!items.length) return null;
  return {
    date,
    items,
    harvestRecords: items.filter(item => item.kind === "harvest").map(item => item.value),
    plantingEvents: items.filter(item => item.kind === "planting").map(item => item.value)
  };
}

function getDashboardDayRecordDetailInfoRows(context){
  const harvestRecords = context?.harvestRecords || [];
  const plantingEventsForDay = context?.plantingEvents || [];
  const fullRecords = harvestRecords.filter(record => record?.type !== "partialHarvest");
  const partialRecords = harvestRecords.filter(record => record?.type === "partialHarvest");
  const totalCases = harvestRecords.reduce((sum, record) => (
    sum + clampNumber(record?.cases, 0, 999999, 0)
  ), 0);
  const fullCases = fullRecords.reduce((sum, record) => sum + clampNumber(record?.cases, 0, 999999, 0), 0);
  const partialCases = partialRecords.reduce((sum, record) => sum + clampNumber(record?.cases, 0, 999999, 0), 0);
  const harvestBreakdown = [
    fullRecords.length ? `通常収穫 ${fullCases}ケース（${fullRecords.length}件）` : "",
    partialRecords.length ? `部分収穫 ${partialCases}ケース（${partialRecords.length}件）` : ""
  ].filter(Boolean).join(" / ") || "-";
  const harvestQualityText = [...new Set(fullRecords
    .map(record => formatQualityMemo(record?.qualityMemo))
    .filter(Boolean))].join(" / ") || "-";
  const plantingMetrics = getPlantingEventGroupListMetrics(plantingEventsForDay);
  const plantingQualityText = [...new Set(plantingEventsForDay
    .map(event => formatPlantingQualityMemo(getPlantingQualityMemoSummary(event)))
    .filter(Boolean))].join(" / ") || "-";
  const plantingCountText = plantingEventsForDay.some(event => event?.detailsUnknown)
    ? "不明"
    : `${plantingEventsForDay.reduce((sum, event) => (
        sum + clampNumber(event?.actualPlantedSeedlingCount, 0, 999999999, 0)
      ), 0)}株`;
  const plantingAgeText = fullRecords.map((record, index) => {
    const text = formatPlantingAgeForRecordDetailDisplay(record);
    return text ? `${fullRecords.length > 1 ? `${index + 1}件目: ` : ""}${text}` : "";
  }).filter(Boolean).join("\n") || "-";
  const hasEstimatedHarvestLoss = fullRecords.some(record => isHarvestLossEstimatedForRecord(record));
  const memoText = harvestRecords.map(record => {
    const memo = String(record?.memo || "").trim();
    return memo ? `${getDashboardRecordTypeLabel(record)}: ${memo}` : "";
  }).filter(Boolean).join("\n") || "-";
  const attentionReasons = [...new Set((context?.items || []).flatMap(item => (
    getDashboardRecordItemAttentionInfo(item).reasons
  )))];
  return [
    { label: "収穫ケース数", value: `${totalCases}ケース` },
    { label: hasEstimatedHarvestLoss ? "推定収穫ロス率" : "収穫ロス率", value: getDashboardDayHarvestLossText(harvestRecords) },
    { label: "収穫内訳", value: harvestBreakdown },
    { label: "収穫品質メモ", value: harvestQualityText },
    { label: "定植日数の詳細", value: plantingAgeText },
    ...(plantingEventsForDay.length ? [
      { label: "苗植え記録", value: `${plantingEventsForDay.length}件` },
      { label: "苗枚数", value: plantingMetrics.seedlingTrayText },
      { label: "苗ロス率", value: plantingMetrics.lossRateText },
      { label: "苗植えした株数", value: plantingCountText },
      { label: "苗の品質メモ", value: plantingQualityText }
    ] : []),
    ...(attentionReasons.length ? [{ label: "要確認", value: attentionReasons.join("\n") }] : []),
    ...(memoText !== "-" ? [{ label: "メモ", value: memoText }] : [])
  ];
}

function buildDashboardDayRecordLocationEntity(context, view){
  if(view === "planting"){
    const events = context?.plantingEvents || [];
    const plantingPalletKeys = [...new Set(events.flatMap(event => (
      Array.isArray(event?.plantingPalletKeys) ? event.plantingPalletKeys : []
    )))].sort((a, b) => getOrderIndexFromKey(a) - getOrderIndexFromKey(b));
    const plantingCountsByPallet = {};
    const qualityMemoByPallet = {};
    events.forEach(event => {
      const counts = normalizePlantingCountsByPallet(event?.plantingCountsByPallet, event?.plantingPalletKeys || []);
      Object.entries(counts).forEach(([key, value]) => {
        plantingCountsByPallet[key] = value;
      });
      (Array.isArray(event?.plantingPalletKeys) ? event.plantingPalletKeys : []).forEach(key => {
        qualityMemoByPallet[key] = getPlantingQualityMemoForPallet(event, key) || { tags: [], other: "" };
      });
    });
    return {
      plantingPalletKeys,
      plantingCountsByPallet,
      qualityMemo: events.length === 1 ? getPlantingQualityMemoSummary(events[0]) : { other: "複数記録" },
      qualityMemoByPallet,
      eventId: events.length === 1 ? events[0]?.eventId : null,
      locationEmptyText: "この日の二次定植場所はありません。"
    };
  }

  const harvestRecords = context?.harvestRecords || [];
  return {
    palletKeys: [...new Set(harvestRecords.flatMap(getRecordDetailHarvestPalletKeys))]
      .sort((a, b) => getOrderIndexFromKey(a) - getOrderIndexFromKey(b)),
    qualityMemo: harvestRecords.length === 1 ? harvestRecords[0]?.qualityMemo : { other: "複数記録" },
    locationEmptyText: "この日の収穫場所はありません。"
  };
}

function setRecordDetailDayLocationView(view){
  if(!recordDetailDayContext) return;
  recordDetailDayLocationView = view === "planting" ? "planting" : "harvest";
  document.querySelectorAll(".recordDetailLocationViewBtn").forEach(button => {
    const active = button.dataset.uiArg === recordDetailDayLocationView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
    button.tabIndex = active ? 0 : -1;
  });
  const entity = buildDashboardDayRecordLocationEntity(recordDetailDayContext, recordDetailDayLocationView);
  recordDetailLocationModel = buildRecordDetailLocationModel(recordDetailDayLocationView, entity);
  recordDetailLocationSelectedPalletKeys = new Set();
  recordDetailLocationSelectedGroupClass = recordDetailLocationModel.kind === "planting"
    ? (recordDetailLocationModel.locationGroups[0]?.className || null)
    : null;
  const selectedGroup = getRecordDetailLocationSelectedGroup(recordDetailLocationModel);
  const visibleBuildings = getRecordDetailLocationVisibleBuildings(recordDetailLocationModel, selectedGroup);
  recordDetailLocationBuilding = visibleBuildings[0] ?? null;
  recordDetailLocationSelectedBed = recordDetailLocationBuilding === null
    ? null
    : getRecordDetailLocationDefaultBed(recordDetailLocationModel, recordDetailLocationBuilding, selectedGroup);
  renderRecordDetailLocationDisplay();
}

function openDashboardDayRecordDetail(dateString){
  const modal = document.getElementById("recordDetailModal");
  const title = document.getElementById("recordDetailWindowTitle");
  const body = document.getElementById("recordDetailWindowBody");
  const closeButton = document.getElementById("recordDetailWindowCloseBtn");
  if(!modal || !title || !body) return;
  const context = getDashboardDayRecordDetailContext(dateString);
  if(!context){
    showToast("詳細を表示する日の記録が見つかりません");
    return;
  }

  recordDetailLoadToken++;
  recordDetailDayContext = context;
  recordDetailDayLocationView = context.harvestRecords.length ? "harvest" : "planting";
  recordDetailLocationModel = null;
  recordDetailLocationBuilding = null;
  recordDetailLocationSelectedBed = null;
  recordDetailLocationSelectedGroupClass = null;
  recordDetailLocationSelectedPalletKeys = new Set();
  recordDetailReturnFocus = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  title.textContent = `${context.date} 記録の詳細`;
  body.classList.add("hasLocationDisplay");
  body.innerHTML = getDashboardDayRecordDetailBodyHtml(getDashboardDayRecordDetailInfoRows(context));
  setRecordDetailDayLocationView(recordDetailDayLocationView);
  body.scrollTop = 0;
  showPageBlockingUi(modal);
  requestAnimationFrame(() => closeButton?.focus({ preventScroll: true }));
}

function openRecordDetailWindow(kind, id){
  const modal = document.getElementById("recordDetailModal");
  const title = document.getElementById("recordDetailWindowTitle");
  const body = document.getElementById("recordDetailWindowBody");
  const closeButton = document.getElementById("recordDetailWindowCloseBtn");
  if(!modal || !title || !body) return;

  const safeId = getSafePositiveRecordId(id);
  if(!safeId){
    showToast("詳細を表示する記録が見つかりません");
    return;
  }

  let titleText = "記録の詳細";
  let infoRows = [];
  let locationTitle = "場所";
  if(kind === "harvest"){
    const record = getRecordById(safeId);
    if(!record || record.type !== "fullHarvest"){
      showToast("詳細を表示する収穫記録が見つかりません");
      return;
    }
    const attention = getDashboardRecordAttentionInfo(record);
    const harvestLocationText = record.palletSummary
      || formatPalletSummary(getPalletKeysFromRecord(record))
      || "-";
    titleText = `${record.date || "日付なし"} 収穫の詳細`;
    locationTitle = "収穫場所";
    infoRows = [
      { label: "収穫ケース数", value: `${getHarvestRecordCaseDisplayText(record)}ケース` },
      { label: isHarvestLossEstimatedForRecord(record) ? "推定ロス率" : "収穫ロス率", value: String(record.actualLoss ?? "").trim() === "" ? "-" : record.actualLoss + "%" },
      { label: "収穫場所", value: harvestLocationText },
      { label: "品質メモ", value: formatQualityMemo(record.qualityMemo) || "-" },
      { label: "定植日数の詳細", value: formatPlantingAgeForRecordDetailDisplay(record) || "-" },
      ...(attention.hasAttention ? [{ label: attention.label, value: attention.reasons.join("\n") || "内容を確認してください" }] : []),
      ...(record.memo ? [{ label: "メモ", value: record.memo }] : [])
    ];
  }else if(kind === "partialHarvest"){
    const record = getRecordById(safeId);
    if(!record || record.type !== "partialHarvest"){
      showToast("詳細を表示する部分収穫記録が見つかりません");
      return;
    }
    const attention = getDashboardRecordAttentionInfo(record);
    titleText = `${record.date || "日付なし"} 部分収穫の詳細`;
    locationTitle = "部分収穫場所";
    infoRows = [
      { label: "収穫ケース数", value: `${getHarvestRecordCaseDisplayText(record)}ケース` },
      { label: "収穫場所・株数", value: formatPartialHarvestSummary(record.targets) || "-" },
      ...(attention.hasAttention ? [{ label: attention.label, value: attention.reasons.join("\n") || "内容を確認してください" }] : []),
      ...(record.memo ? [{ label: "メモ", value: record.memo }] : [])
    ];
  }else if(kind === "planting"){
    const event = getPlantingEventById(safeId);
    if(!event){
      showToast("詳細を表示する苗植え記録が見つかりません");
      return;
    }
    const usage = getPlantingEventUsage(event.eventId);
    const sourceText = event.sourceAllocations.map(allocation => {
      const source = getRecordById(allocation.harvestRecordId);
      return `${source?.date || "日付不明"}の収穫 ${allocation.palletKeys.length}パレット`;
    }).join(" / ");
    const detailsUnknown = !!event.detailsUnknown;
    const carryoverText = event.actualSeedlingCarryoverMode === "carryover" ? "余った" : "余っていない";
    titleText = `${event.plantingDate || "日付なし"} 苗植えの詳細`;
    locationTitle = "二次定植した場所";
    infoRows = [
      { label: "実際に取った苗", value: detailsUnknown ? "不明" : event.actualTakenSeedlingCount + "株" },
      { label: "苗植えした株数", value: detailsUnknown ? "不明" : event.actualPlantedSeedlingCount + "株" },
      { label: "苗の品質メモ", value: formatPlantingQualityMemo(getPlantingQualityMemoSummary(event)) },
      { label: "今回余った苗", value: detailsUnknown ? "不明" : carryoverText },
      { label: "作業後の繰越苗", value: detailsUnknown ? "不明" : (usage?.carryoverAfter ?? 0) + "株" },
      ...(isPlantingEventUnsent(event) ? [{ label: "Google", value: "未送信" }] : []),
      { label: "収穫元", value: sourceText || "-" }
    ];
  }else{
    return;
  }

  const loadToken = ++recordDetailLoadToken;
  recordDetailDayContext = null;
  recordDetailLocationModel = null;
  recordDetailLocationBuilding = null;
  recordDetailLocationSelectedBed = null;
  recordDetailLocationSelectedGroupClass = null;
  recordDetailLocationSelectedPalletKeys = new Set();
  recordDetailReturnFocus = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  title.textContent = titleText;
  body.classList.add("hasLocationDisplay");
  body.innerHTML = getRecordDetailWindowBodyHtml(infoRows, locationTitle, kind);
  body.scrollTop = 0;
  showPageBlockingUi(modal);
  requestAnimationFrame(() => {
    closeButton?.focus({ preventScroll: true });
    requestAnimationFrame(() => loadRecordDetailLocation(kind, safeId, loadToken));
  });
}

function closeRecordDetailWindow(options = {}){
  const modal = document.getElementById("recordDetailModal");
  const body = document.getElementById("recordDetailWindowBody");
  const shouldRestoreFocus = options.restoreFocus !== false;
  const returnFocus = recordDetailReturnFocus;
  recordDetailLoadToken++;
  recordDetailLocationModel = null;
  recordDetailLocationBuilding = null;
  recordDetailLocationSelectedBed = null;
  recordDetailLocationSelectedGroupClass = null;
  recordDetailLocationSelectedPalletKeys = new Set();
  recordDetailDayContext = null;
  recordDetailDayLocationView = "harvest";
  hidePageBlockingUi(modal);
  if(body){
    body.classList.remove("hasLocationDisplay");
    body.textContent = "";
  }
  recordDetailReturnFocus = null;
  if(shouldRestoreFocus && returnFocus?.isConnected){
    requestAnimationFrame(() => returnFocus.focus({ preventScroll: true }));
  }
}

function getSameDayPlantingEventsForHarvest(record){
  const harvestDate = String(record?.date || "").trim();
  if(!isStrictDateOnlyString(harvestDate)) return [];
  return getPlantingEventsForHarvest(record?.id).filter(event => (
    String(event?.plantingDate || "").trim() === harvestDate
  ));
}

function getHarvestPlantingGroupModel(record){
  const relatedEvents = getSameDayPlantingEventsForHarvest(record);
  return {
    relatedEvents,
    pendingPalletCount: getUnplantedPalletKeysForHarvest(record?.id).length
  };
}

function groupPlantingEventsByDate(events){
  const groups = new Map();
  [...(Array.isArray(events) ? events : [])]
    .sort(comparePlantingEventsDesc)
    .forEach(event => {
      const plantingDate = String(event?.plantingDate || "").trim();
      const key = isStrictDateOnlyString(plantingDate)
        ? plantingDate
        : `event:${String(event?.eventId || "")}`;
      if(!groups.has(key)) groups.set(key, { plantingDate, events: [] });
      groups.get(key).events.push(event);
    });
  return [...groups.values()];
}

function getPlantingEventEffectiveLossRate(event){
  if(!event || event.detailsUnknown) return null;
  const rawLossRateText = String(event.actualSeedlingLossRate || "").trim();
  const rawLossRate = Number(rawLossRateText);
  if(rawLossRateText && Number.isFinite(rawLossRate)) return rawLossRate;
  const usage = getPlantingEventUsage(event.eventId);
  return usage && Number.isFinite(usage.effectiveLossRate)
    ? usage.effectiveLossRate
    : null;
}

function getPlantingEventListMetrics(event){
  if(!event){
    return { seedlingTrayText: "-", lossRateText: "-" };
  }
  const detailsUnknown = !!event?.detailsUnknown;
  const lossRate = getPlantingEventEffectiveLossRate(event);
  return {
    seedlingTrayText: detailsUnknown ? "不明" : String(event?.actualSeedlingTrayCount || 0) + "枚",
    lossRateText: detailsUnknown
      ? "不明"
      : (lossRate === null ? "-" : String(Math.round(lossRate * 10) / 10) + "%")
  };
}

function getPlantingEventGroupListMetrics(events){
  const groupEvents = Array.isArray(events) ? events : [];
  if(!groupEvents.length) return getPlantingEventListMetrics(null);
  if(groupEvents.some(event => event?.detailsUnknown)){
    return { seedlingTrayText: "不明", lossRateText: "不明" };
  }

  const seedlingTrayCount = groupEvents.reduce((sum, event) => (
    sum + clampNumber(event?.actualSeedlingTrayCount, 0, RECORD_MAX_SEEDLING_TRAYS, 0)
  ), 0);
  const lossItems = groupEvents.map(event => ({
    lossRate: getPlantingEventEffectiveLossRate(event),
    weight: clampNumber(
      event?.actualTakenSeedlingCount,
      0,
      999999999,
      getSeedlingCountFromTrayCount(event?.actualSeedlingTrayCount || 0)
    )
  }));
  const hasMissingLossRate = lossItems.some(item => item.lossRate === null);
  const totalWeight = lossItems.reduce((sum, item) => sum + item.weight, 0);
  const averageLossRate = hasMissingLossRate
    ? null
    : (totalWeight > 0
      ? lossItems.reduce((sum, item) => sum + item.lossRate * item.weight, 0) / totalWeight
      : lossItems.reduce((sum, item) => sum + item.lossRate, 0) / lossItems.length);
  return {
    seedlingTrayText: String(seedlingTrayCount) + "枚",
    lossRateText: averageLossRate === null
      ? "-"
      : String(Math.round(averageLossRate * 10) / 10) + "%"
  };
}

function renderRecordItemSyncConflictHtml(entityType, entity){
  const conflict = getSyncConflictForEntity(entityType, entity);
  if(!conflict) return "";
  const safeConflictId = escapeHtml(conflict.conflictId);
  return `
    <div class="recordConflictInline">
      <span class="recordConflictBadge">競合あり</span>
      <span>${escapeHtml(getSyncConflictReasonText(conflict))}</span>
      <button type="button" class="recordConflictOpenBtn" data-ui-click="openSyncConflictPanel" data-ui-arg="${safeConflictId}">比較して選択</button>
    </div>
  `;
}

function renderRecordItemConsistencyHtml(kind, entity, issue){
  if(!issue) return "";
  const safeId = getSafePositiveRecordId(kind === "planting" ? entity?.eventId : entity?.id) ?? 0;
  const editAction = kind === "planting"
    ? "editPlantingEvent"
    : (entity?.type === "partialHarvest"
      ? "editPartialHarvestRecord"
      : "editHarvestRecord");
  return `
    <div class="recordConsistencyInline">
      <span class="recordConsistencyBadge">要確認</span>
      <span>${escapeHtml(issue.reasons.join(" "))}</span>
      <button type="button" class="recordConsistencyEditBtn" data-ui-click="${editAction}" data-ui-number="${safeId}">この記録を編集</button>
    </div>
  `;
}

function formatPartialHarvestCompactLocation(targets){
  const locationGroups = new Map();
  normalizePartialHarvestTargets(targets).forEach(target => {
    if(!locationGroups.has(target.building)) locationGroups.set(target.building, new Set());
    locationGroups.get(target.building).add(target.bed);
  });
  return [...locationGroups.entries()]
    .sort((a, b) => BUILDINGS.indexOf(a[0]) - BUILDINGS.indexOf(b[0]))
    .map(([building, beds]) => (
      `${building}号棟${bedOrder.filter(bed => beds.has(bed)).join("")}`
    ))
    .join("・") || "場所不明";
}

function getHarvestRecordSyncWarningText(record, syncConflict = null){
  if(syncConflict) return "";
  const syncState = getGoogleSheetRecordSyncState(record);
  if(syncState === "remoteDeleted"){
    return "同期注意: 別端末で削除されています。使用中の苗植え履歴を確認してください";
  }
  if(syncState === "dependencyConflict"){
    return "同期注意: 苗植え履歴を保護するため別端末の更新を保留しています";
  }
  if(syncState === "conflict") return "同期注意: 別端末の更新を保留しています";
  return "";
}

function renderPartialHarvestDaySummaryHtml(items, consistencyAudit){
  const partialItems = (Array.isArray(items) ? items : []).filter(item => (
    item?.value?.type === "partialHarvest"
  ));
  if(!partialItems.length) return "";

  const totalCases = partialItems.reduce((sum, item) => (
    sum + clampNumber(item.value?.cases, 0, 999999, 0)
  ), 0);
  const hasSyncConflict = partialItems.some(item => getSyncConflictForEntity("record", item.value));
  const hasConsistencyIssue = partialItems.some(item => (
    consistencyAudit?.issueByKey?.has(getRecordConsistencyIssueKey("harvest", item.id))
  ));
  const detailHtml = partialItems.map(item => {
    const record = item.value;
    const safeRecordId = getSafePositiveRecordId(record?.id) ?? 0;
    const cases = clampNumber(record?.cases, 0, 999999, 0);
    const location = formatPartialHarvestCompactLocation(record?.targets);
    const syncConflict = getSyncConflictForEntity("record", record);
    const consistencyIssue = consistencyAudit?.issueByKey?.get(
      getRecordConsistencyIssueKey("harvest", item.id)
    ) || null;
    const syncWarningText = getHarvestRecordSyncWarningText(record, syncConflict);
    return `
      <div class="partialHarvestDayEntry${syncConflict ? " hasSyncConflict" : ""}${consistencyIssue ? " hasConsistencyIssue" : ""}" data-partial-harvest-record-id="${safeRecordId}">
        <div class="partialHarvestDayEntryMain">
          <span class="partialHarvestDayLocation">${escapeHtml(location)}</span>
          <span class="partialHarvestDayCases">${escapeHtml(String(cases))}ケース</span>
        </div>
        <div class="partialHarvestDayTargetDetail">${escapeHtml(formatPartialHarvestSummary(record?.targets))}</div>
        ${syncWarningText ? `<div class="smallText partialHarvestDayWarning">${escapeHtml(syncWarningText)}</div>` : ""}
        ${renderRecordItemSyncConflictHtml("record", record)}
        ${renderRecordItemConsistencyHtml("harvest", record, consistencyIssue)}
        ${record?.memo ? `<div class="smallText partialHarvestDayMemo">メモ: ${escapeHtml(record.memo)}</div>` : ""}
        <div class="recordActions partialHarvestDayActions">
          <button class="thirdBtn" data-ui-click="editPartialHarvestRecord" data-ui-number="${safeRecordId}">編集</button>
          <button class="secondaryBtn recordListDeleteBtn" data-ui-click="confirmDeleteRecord" data-ui-number="${safeRecordId}">削除</button>
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="recordItem partialHarvestDaySummary${hasSyncConflict ? " hasSyncConflict" : ""}${hasConsistencyIssue ? " hasConsistencyIssue" : ""}">
      <div class="recordTitle partialHarvestDayTitle"><span class="recordTitlePartial">部分収穫まとめ</span><span class="partialHarvestDayCount">${partialItems.length}件</span></div>
      <div class="recordMeta partialHarvestDayTotal">合計: ${escapeHtml(String(totalCases))}ケース</div>
      <div class="partialHarvestDayEntries">${detailHtml}</div>
    </div>
  `;
}

function renderRecordItemHtml(r, harvestCaseTotalsByDate = null, consistencyIssue = null){
  const safeRecordId = getSafePositiveRecordId(r?.id) ?? 0;
  const safeCases = escapeHtml(getHarvestRecordCaseDisplayText(r, harvestCaseTotalsByDate));
  const syncConflict = getSyncConflictForEntity("record", r);
  const conflictHtml = renderRecordItemSyncConflictHtml("record", r);
  const consistencyHtml = renderRecordItemConsistencyHtml("harvest", r, consistencyIssue);
  const syncWarningText = getHarvestRecordSyncWarningText(r, syncConflict);
  if(r.type === "partialHarvest"){
    return `
    <div class="recordItem${syncConflict ? " hasSyncConflict" : ""}${consistencyIssue ? " hasConsistencyIssue" : ""}">
      <div class="recordTitle"><span class="recordTitlePartial">部分</span></div>
      <div class="recordMeta">収穫ケース数: ${safeCases}</div>
      ${syncWarningText ? `<div class="smallText partialHarvestDayWarning">${escapeHtml(syncWarningText)}</div>` : ""}
      <span class="summaryCode">${escapeHtml(formatPartialHarvestSummary(r.targets))}</span>
      ${conflictHtml}
      ${consistencyHtml}
      ${r.memo ? `<div class="smallText" style="margin-top:8px; white-space:pre-wrap;">メモ: ${escapeHtml(r.memo)}</div>` : ""}
      <div class="recordActions">
        <button class="thirdBtn" data-ui-click="editPartialHarvestRecord" data-ui-number="${safeRecordId}">編集</button>
        <button class="secondaryBtn recordListDeleteBtn" data-ui-click="confirmDeleteRecord" data-ui-number="${safeRecordId}">削除</button>
      </div>
    </div>
    `;
  }

  const actualLossNumber = getFiniteNumberInRange(r?.actualLoss, -999999, 100);
  const safeActualLoss = actualLossNumber === null ? "-" : escapeHtml(String(actualLossNumber));
  const harvestLossLabel = isHarvestLossEstimatedForRecord(r) ? "推定ロス率" : "ロス率";
  const harvestBuildingText = [...new Set(
    getPalletKeysFromRecord(r)
      .map(key => parsePalletKey(String(key || "")).building)
      .filter(building => BUILDINGS.includes(building))
  )]
    .sort((a, b) => BUILDINGS.indexOf(a) - BUILDINGS.indexOf(b))
    .join("・") || "-";

  return `
    <div class="recordItem${syncConflict ? " hasSyncConflict" : ""}${consistencyIssue ? " hasConsistencyIssue" : ""}">
      <div class="recordTitle"><span class="recordTitleHarvest">収穫</span></div>
      <div class="recordMeta">収穫ケース数: ${safeCases}
${harvestLossLabel}: ${safeActualLoss}${actualLossNumber === null ? "" : "%"}
収穫場所: ${escapeHtml(harvestBuildingText)}
品質メモ: ${escapeHtml(formatQualityMemo(r.qualityMemo) || "-")}</div>
${syncWarningText ? `<div class="smallText" style="margin-top:6px; color:#b45309;">${escapeHtml(syncWarningText.trim())}</div>` : ""}
      ${conflictHtml}
      ${consistencyHtml}
      ${r.memo ? `<div class="smallText" style="margin-top:8px; white-space:pre-wrap;">メモ: ${escapeHtml(r.memo)}</div>` : ""}
      <button type="button" class="recordDetailSummary" aria-haspopup="dialog" aria-controls="recordDetailModal" data-ui-click="openRecordDetailWindow" data-ui-arg="harvest" data-ui-number="${safeRecordId}">詳細</button>
      <div class="recordActions">
        <button class="thirdBtn" data-ui-click="editHarvestRecord" data-ui-number="${safeRecordId}">編集</button>
        <button class="thirdBtn recordSplitPartialBtn" data-ui-click="openHarvestPartialSplitWindow" data-ui-number="${safeRecordId}">ケース数の一部を部分収穫へ分ける</button>
        <button class="secondaryBtn recordListDeleteBtn" data-ui-click="confirmDeleteRecord" data-ui-number="${safeRecordId}">削除</button>
      </div>
    </div>
  `;
}

function renderPlantingEventItemHtml(event, consistencyIssue = null){
  const safeEventId = getSafePositiveRecordId(event?.eventId) ?? 0;
  const syncConflict = getSyncConflictForEntity("planting", event);
  const conflictHtml = renderRecordItemSyncConflictHtml("planting", event);
  const consistencyHtml = renderRecordItemConsistencyHtml("planting", event, consistencyIssue);
  const metrics = getPlantingEventListMetrics(event);
  const pendingPalletCount = new Set(
    event.sourceAllocations.flatMap(allocation => (
      getUnplantedPalletKeysForHarvest(allocation.harvestRecordId)
        .map(key => `${allocation.harvestRecordId}:${key}`)
    ))
  ).size;
  return `
    <div class="recordItem${syncConflict ? " hasSyncConflict" : ""}${consistencyIssue ? " hasConsistencyIssue" : ""}">
      <div class="recordTitle"><span class="recordTitlePlanting">苗植え</span></div>
      <div class="recordMeta">苗枚数: ${escapeHtml(metrics.seedlingTrayText)}
苗ロス率: ${escapeHtml(metrics.lossRateText)}
苗の品質: ${escapeHtml(formatPlantingQualityMemo(getPlantingQualityMemoSummary(event)))}
未定植枚数: ${escapeHtml(String(pendingPalletCount))}枚</div>
      ${conflictHtml}
      ${consistencyHtml}
      <button type="button" class="recordDetailSummary" aria-haspopup="dialog" aria-controls="recordDetailModal" data-ui-click="openRecordDetailWindow" data-ui-arg="planting" data-ui-number="${safeEventId}">詳細</button>
      <div class="recordActions">
        <button class="thirdBtn" data-ui-click="editPlantingEvent" data-ui-number="${safeEventId}">編集</button>
        <button class="secondaryBtn recordListDeleteBtn" data-ui-click="confirmDeletePlantingEvent" data-ui-number="${safeEventId}">削除</button>
      </div>
    </div>
  `;
}

function formatActualSeedlingTrayText(record){
  const trayCount = clampNumber(record?.actualSeedlingTrayCount, 0, 999999, 0);
  if(trayCount <= 0) return "-";
  const totalSeedlings = getSeedlingCountFromTrayCount(trayCount);
  return `${trayCount}枚（換算 ${totalSeedlings}株）`;
}

function formatActualSeedlingLossRateText(record){
  const value = String(record?.actualSeedlingLossRate || "").trim();
  return value ? value + "%" : "-";
}

function formatActualSeedlingCarryoverModeText(record){
  return normalizeSeedlingCarryoverMode(record?.actualSeedlingCarryoverMode) === "carryover" ? "余った" : "余っていない";
}

function escapeHtml(str){
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}


function makeRecordSignature(record){
  return getRecordDuplicateKey(record);
}

function normalizeImportedRecord(record, index){
  if(!record || typeof record !== "object") return null;
  const validation = validateRecordForGoogleTransfer(record);
  if(!validation.ok) return null;

  const date = String(record.date || "").trim();
  const memo = String(record.memo || "").trim();
  const cases = clampNumber(record.cases, 0, 999999, NaN);
  const isPartial = record.type === "partialHarvest";

  if(isPartial){
    const targets = normalizePartialHarvestTargets(record.targets);
    if(!date || !Number.isFinite(cases) || cases <= 0 || !targets.length){
      return null;
    }

    return {
      ...getNormalizedRecordCommonFields(record, "partialHarvest"),
      id: Number(record.id),
      date,
      cases,
      memo,
      targets,
      palletKeys: []
    };
  }

  const palletSummary = String(record.palletSummary || "").trim();
  const plannedSeedlingTrayCount = clampNumber(record.plannedSeedlingTrayCount, 0, 999999, 0);
  const plantingCaseInstruction = String(record.plantingCaseInstruction || "").trim();
  const plantingSummary = String(record.plantingSummary || "").trim();
  const plantingDate = String(record.plantingDate || "").trim();
  const actualSeedlingTrayCount = clampNumber(record.actualSeedlingTrayCount, 0, 999999, 0);
  const actualSeedlingCarryoverMode = normalizeSeedlingCarryoverMode(record.actualSeedlingCarryoverMode);
  const actualSeedlingLossRate = String(record.actualSeedlingLossRate ?? "").trim();
  const actualLoss = String(record.actualLoss ?? "").trim();
  const qualityMemo = normalizeQualityMemo(record.qualityMemo || record.qualityText || null);
  const plantingAge = normalizePlantingAgeSnapshot(record.plantingAge);
  const palletKeys = getPalletKeysFromRecord(record);
  const plantingPalletKeys = [...new Set([
    ...expandPalletKeyItemsToKeys(record.plantingPalletKeys),
    ...expandPalletRangesToKeys(record.plantingRanges)
  ])]
    .filter(key => palletKeys.includes(key))
    .sort((a, b) => getOrderIndexFromKey(a) - getOrderIndexFromKey(b));
  if(!date || !Number.isFinite(cases) || cases <= 0 || !palletSummary || !actualLoss || !palletKeys.length){
    return null;
  }

  return {
    ...getNormalizedRecordCommonFields(record, "fullHarvest"),
    id: Number(record.id),
    date,
    cases,
    palletSummary,
    plannedSeedlingTrayCount,
    plantingCaseInstruction,
    plantingSummary,
    plantingDate,
    actualSeedlingTrayCount,
    actualSeedlingCarryoverMode,
    actualSeedlingLossRate,
    plantingPending: plantingPalletKeys.length === 0,
    memo,
    actualLoss,
    qualityMemo,
    plantingAge,
    palletKeys,
    plantingPalletKeys
  };
}

function loadRecordExportStatus(){
  try{
    const parsed = harvestnaviLocalStorage.readJson(RECORD_EXPORT_STATUS_KEY, null);
    if(!parsed) return { lastExportRecordCount: 0, lastPromptRecordCount: 0 };
    return {
      lastExportRecordCount: clampNumber(parsed.lastExportRecordCount, 0, 99999999, 0),
      lastPromptRecordCount: clampNumber(parsed.lastPromptRecordCount, 0, 99999999, 0)
    };
  }catch(e){
    return { lastExportRecordCount: 0, lastPromptRecordCount: 0 };
  }
}

function saveRecordExportStatus(status){
  harvestnaviLocalStorage.writeJson(RECORD_EXPORT_STATUS_KEY, status || {});
}

function markRecordsExported(){
  const totalHistoryCount = records.length + plantingEvents.length;
  saveRecordExportStatus({
    lastExportRecordCount: totalHistoryCount,
    lastPromptRecordCount: totalHistoryCount
  });
}

function maybePromptRecordExport(){
  const status = loadRecordExportStatus();
  const totalHistoryCount = records.length + plantingEvents.length;
  const unexportedCount = Math.max(0, totalHistoryCount - status.lastExportRecordCount);
  if(unexportedCount < RECORD_EXPORT_PROMPT_COUNT) return;
  if(totalHistoryCount <= status.lastPromptRecordCount) return;

  setTimeout(() => {
    showToast("記録が増えています。外部保存(JSON)をおすすめします");
  }, 1800);
  status.lastPromptRecordCount = totalHistoryCount;
  saveRecordExportStatus(status);
}

function exportRecordsToFile(){
  if(!ensureProtectedOperationAccess("記録の外部保存")) return;
  const payload = {
    app: "Harvestnavi",
    type: "record-backup",
    version: 4,
    exportedAt: new Date().toISOString(),
    recordCount: records.length,
    plantingEventCount: plantingEvents.length,
    records: records.map(serializeRecordForStorage),
    plantingEvents: plantingEvents.map(serializePlantingEventForStorage).filter(Boolean),
    deletedPlantingEvents: deletedPlantingEvents.map(entry => ({
      ...entry,
      event: serializePlantingEventForStorage(entry.event)
    })),
    syncConflicts: syncConflicts.map(serializeSyncConflictEntry).filter(Boolean)
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {type: "application/json"});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ].join("");
  link.href = url;
  link.download = `収穫記録バックアップ_${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  markRecordsExported();
  showToast("記録を外部保存しました");
}

function triggerImportRecords(){
  if(!ensureGoogleSheetLocalMutationAllowed("記録ファイルを読み込む操作を")) return;
  const input = document.getElementById("recordImportInput");
  if(!input) return;
  input.value = "";
  input.click();
}

function toggleGoogleSheetResendHelp(){
  const panel = document.getElementById("googleSheetResendHelpPanel");
  if(!panel) return;
  hideRecordImportMenu();
  clearTimeout(toggleGoogleSheetResendHelp._timer);
  panel.classList.toggle("show");
}

function hideGoogleSheetResendHelp(){
  const panel = document.getElementById("googleSheetResendHelpPanel");
  if(!panel) return;
  clearTimeout(toggleGoogleSheetResendHelp._timer);
  panel.classList.remove("show");
}

function toggleRecordImportMenu(){
  const menu = document.getElementById("recordImportMenu");
  if(!menu) return;
  hideGoogleSheetResendHelp();
  hideRecordImportError();
  menu.classList.toggle("show");
}

function hideRecordImportMenu(){
  const menu = document.getElementById("recordImportMenu");
  if(!menu) return;
  menu.classList.remove("show");
}
