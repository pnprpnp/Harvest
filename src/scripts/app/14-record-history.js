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
    palletSummaryInput.value = String(record.date || "") < PALLET_SUMMARY_CANONICAL_START_DATE
      ? String(record.palletSummary || "")
      : formatPalletSummary(harvestFillKeys);
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
      if(!groups.has(dateKey)) groups.set(dateKey, { harvest: [], planting: [] });
      groups.get(dateKey)[item.kind].push(item);
    });
    return [...groups.values()].map(group => {
      const harvestHtml = group.harvest.map(renderHistoryItem).join("");
      const plantingHtml = group.planting.map(renderHistoryItem).join("");
      return `<div class="recordDateGroup">
        ${harvestHtml ? `<div class="recordDateColumn recordDateHarvestColumn">${harvestHtml}</div>` : ""}
        ${plantingHtml ? `<div class="recordDateColumn recordDatePlantingColumn">${plantingHtml}</div>` : ""}
      </div>`;
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
    const safeRecordUuidArgument = JSON.stringify(normalizeRecordUuid(record.recordUuid));
    const remainingDays = Math.max(1, Math.ceil((new Date(entry.expiresAt).getTime() - now) / (24 * 60 * 60 * 1000)));
    const typeText = record.type === "partialHarvest" ? "各パレット部分収穫" : "収穫記録";
    const sheetText = entry.syncConflict
      ? (entry.remoteDeleted ? "別端末の削除と競合した未送信内容を退避" : "別端末の更新と競合した未送信内容を退避")
      : (entry.sheetDeleted ? "スプレッドシートも削除済み" : "アプリのみ削除");
    return `
      <div class="recordItem">
        <div class="recordTitle">${escapeHtml(record.date || "日付なし")} ${typeText}</div>
        <div class="recordMeta">収穫ケース数: ${escapeHtml(String(record.cases || 0))}\n${sheetText}\n復元可能: あと${remainingDays}日</div>
        <div class="recordActions">
          <button class="thirdBtn" onclick='restoreDeletedRecord(${safeRecordId}, ${safeRecordUuidArgument})'>${entry.syncConflict ? "この内容を戻す" : "復元する"}</button>
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
          <button class="thirdBtn" onclick="restoreDeletedPlantingEvent(${safeEventId})">復元する</button>
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
    let restoredSource = serverCanonical || entry.record;
    let restoredState = entry.sheetDeleted ? "confirmed" : "edited";
    if(entry.syncConflict){
      const versionSource = activeRecord || serverCanonical;
      restoredSource = {
        ...entry.record,
        id: versionSource?.id ?? entry.record.id,
        recordUuid: normalizeRecordUuid(versionSource?.recordUuid)
          || normalizeRecordUuid(entry.record.recordUuid),
        createdAt: versionSource?.createdAt || entry.record.createdAt || "",
        updatedAt: versionSource?.updatedAt || entry.record.updatedAt || "",
        plantingPending: versionSource?.plantingPending ?? entry.record.plantingPending
      };
      restoredState = "edited";
    }
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
    if(!entry.sheetDeleted && !entry.syncConflict){
      // アプリだけで隠していた間のremote更新を取りこぼさないよう、次回は全差分を確認する。
      localStorage.removeItem(GOOGLE_SHEET_SYNC_REVISION_KEY);
    }
    refreshRecordDataUi();
    showToast(entry.syncConflict
      ? "退避していた内容を戻しました。確認後に再送信してください"
      : (entry.sheetDeleted ? "アプリとスプレッドシートに復元しました" : "記録を復元しました"));
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

function buildRecordDetailLocationModel(kind, entity){
  const partialHarvestPalletKeys = kind === "partialHarvest"
    ? normalizePartialHarvestTargets(entity?.targets).flatMap(target => {
        const keys = [];
        for(let number = target.start; number <= target.end; number++){
          keys.push(getPalletKey(target.building, target.bed, number));
        }
        return keys;
      })
    : [];
  const palletKeys = [...new Set(
    (kind === "planting"
      ? (Array.isArray(entity?.plantingPalletKeys) ? entity.plantingPalletKeys : [])
      : (kind === "partialHarvest" ? partialHarvestPalletKeys : getPalletKeysFromRecord(entity)))
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
    ? formatPlantingQualityMemo(entity?.qualityMemo)
    : (kind === "partialHarvest" ? "部分収穫" : (formatQualityMemo(entity?.qualityMemo) || "記録なし"));
  return {
    kind,
    keySet,
    palletNumbersByBed,
    buildings,
    qualityText,
    qualityClass: kind === "partialHarvest" ? "is-mixed" : getDashboardSeedlingQualityClass(entity?.qualityMemo),
    actionLabel: kind === "planting" ? "苗植え" : (kind === "partialHarvest" ? "部分収穫" : "収穫")
  };
}

function getRecordDetailLocationDefaultBed(model, building){
  return bedMap.find(bed => (
    (model?.palletNumbersByBed.get(`${building}-${bed}`) || []).length > 0
  )) || bedMap[0];
}

function getRecordDetailLocationMapCellHtml(model, building, bed, number, sectionStart){
  const isIncluded = model.keySet.has(getPalletKey(building, bed, number));
  const stateClass = isIncluded ? model.qualityClass : "is-unplanted";
  const stateText = isIncluded ? `今回の${model.actionLabel}` : "対象外";
  return `<span class="dashboardSeedlingBedMapCell ${stateClass}${sectionStart ? " is-section-start" : ""}" data-record-detail-pallet-number="${number}" title="${number}番 ${escapeHtml(stateText)}"></span>`;
}

function getRecordDetailLocationBedMapHtml(model, building, bed){
  const cells = [];
  for(let row = ROWS; row >= 1; row--){
    const displayRowIndex = ROWS - row;
    const sectionStart = displayRowIndex > 0
      && Math.floor(displayRowIndex * 6 / ROWS) > Math.floor((displayRowIndex - 1) * 6 / ROWS);
    cells.push(getRecordDetailLocationMapCellHtml(model, building, bed, row * 2 - 1, sectionStart));
    cells.push(getRecordDetailLocationMapCellHtml(model, building, bed, row * 2, sectionStart));
  }
  return `
    <div class="dashboardSeedlingBedMap" aria-hidden="true">
      <div class="dashboardSeedlingBedMapGrid">${cells.join("")}</div>
    </div>
  `;
}

function renderRecordDetailLocationDisplay(){
  const mount = document.getElementById("recordDetailLocationMount");
  const model = recordDetailLocationModel;
  if(!mount || !model) return;
  if(!model.buildings.length){
    mount.innerHTML = '<div class="recordDetailLocationEmpty">この記録には表示できる場所情報がありません。</div>';
    return;
  }
  if(!model.buildings.includes(recordDetailLocationBuilding)){
    recordDetailLocationBuilding = model.buildings[0];
  }
  if(!bedMap.includes(recordDetailLocationSelectedBed)){
    recordDetailLocationSelectedBed = getRecordDetailLocationDefaultBed(model, recordDetailLocationBuilding);
  }

  const building = recordDetailLocationBuilding;
  const selectedBed = recordDetailLocationSelectedBed;
  const selectedNumbers = model.palletNumbersByBed.get(`${building}-${selectedBed}`) || [];
  const selectedNumberText = formatPalletNumberSideRanges(selectedNumbers) || "対象なし";
  mount.innerHTML = `
    <div class="dashboardForecastBuildingTabs recordDetailLocationBuildingTabs" aria-label="場所を表示する号棟">
      ${model.buildings.map(item => `
        <button type="button" class="dashboardForecastBuildingBtn${item === building ? " active" : ""}"
          data-record-detail-building="${item}" onclick="setRecordDetailLocationBuilding(${item})">
          ${item}号棟
        </button>
      `).join("")}
    </div>
    <div class="dashboardForecastBeds dashboardSeedlingStatusBeds recordDetailLocationBeds">
      ${bedMap.map(bed => {
        const numbers = model.palletNumbersByBed.get(`${building}-${bed}`) || [];
        const hasLocation = numbers.length > 0;
        const isSelected = bed === selectedBed;
        return `
          <button type="button"
            class="bed bedCollapsed dashboardForecastBed dashboardSeedlingStatusBed recordDetailLocationBed${hasLocation ? "" : " is-unplanted"}${isSelected ? " is-selected" : ""}"
            data-record-detail-bed="${bed}" onclick="setRecordDetailLocationBed('${bed}')"
            aria-pressed="${isSelected ? "true" : "false"}"
            aria-label="${bed}ベッド 今回の${model.actionLabel} ${numbers.length}パレット。詳細を表示">
            <div class="bedTitle"><span class="dashboardForecastBedName">${bed}</span></div>
            ${getRecordDetailLocationBedMapHtml(model, building, bed)}
            <span class="dashboardSeedlingStatusAgeBlock">
              ${hasLocation ? `<span class="dashboardSeedlingStatusAgeLabel">今回の${model.actionLabel}</span>` : ""}
              <span class="dashboardSeedlingStatusAgeSummary">${hasLocation ? `${numbers.length}パレット` : "対象なし"}</span>
            </span>
          </button>
        `;
      }).join("")}
    </div>
    <div class="dashboardSeedlingStatusMapGuide" aria-label="配置図の色分け">
      <span class="dashboardSeedlingStatusMapGuideItem"><span class="dashboardSeedlingStatusMapGuideSwatch ${model.qualityClass}"></span>今回の${model.actionLabel}（${escapeHtml(model.qualityText)}）</span>
      <span class="dashboardSeedlingStatusMapGuideItem"><span class="dashboardSeedlingStatusMapGuideSwatch is-unplanted"></span>対象外</span>
    </div>
    <div class="dashboardSeedlingStatusDetail recordDetailLocationDetail" aria-live="polite">
      <div class="dashboardSeedlingStatusDetailHeader">
        <span class="dashboardSeedlingStatusDetailTitle">${selectedBed}ベッドの詳細</span>
        <span class="dashboardSeedlingStatusDetailSummary">${selectedNumbers.length}パレット</span>
      </div>
      ${selectedNumbers.length ? `
        <div class="dashboardSeedlingStatusLots dashboardSeedlingStatusDetailLots">
          <div class="dashboardSeedlingStatusLot recordDetailLocationLot">
            <span class="dashboardSeedlingStatusLotHeader">
              <span class="dashboardSeedlingStatusQuality ${model.qualityClass}">${escapeHtml(model.qualityText)}</span>
            </span>
            <span class="dashboardSeedlingStatusCount">
              <span>番号 ${escapeHtml(selectedNumberText)}</span>
              <span>${selectedNumbers.length}パレット</span>
            </span>
          </div>
        </div>
      ` : '<div class="recordDetailLocationEmpty">このベッドは今回の対象に含まれていません。</div>'}
    </div>
  `;
}

function setRecordDetailLocationBuilding(building){
  const normalized = Number(building);
  if(!recordDetailLocationModel?.buildings.includes(normalized)) return;
  recordDetailLocationBuilding = normalized;
  recordDetailLocationSelectedBed = getRecordDetailLocationDefaultBed(recordDetailLocationModel, normalized);
  renderRecordDetailLocationDisplay();
}

function setRecordDetailLocationBed(bed){
  if(!bedMap.includes(bed) || !recordDetailLocationModel) return;
  recordDetailLocationSelectedBed = bed;
  renderRecordDetailLocationDisplay();
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
    recordDetailLocationBuilding = recordDetailLocationModel.buildings[0] ?? null;
    recordDetailLocationSelectedBed = recordDetailLocationBuilding === null
      ? null
      : getRecordDetailLocationDefaultBed(recordDetailLocationModel, recordDetailLocationBuilding);
    renderRecordDetailLocationDisplay();
  }catch(error){
    console.error("記録詳細の場所表示を読み込めませんでした", error);
    mount.innerHTML = '<div class="recordDetailLocationEmpty">場所表示を読み込めませんでした。記録の場所情報を確認してください。</div>';
  }
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
      { label: "収穫ロス率", value: String(record.actualLoss ?? "").trim() === "" ? "-" : record.actualLoss + "%" },
      { label: "収穫場所", value: harvestLocationText },
      { label: "品質メモ", value: formatQualityMemo(record.qualityMemo) || "-" },
      { label: "苗植え", value: getHarvestRecordPlantingDetailText(record) },
      { label: "予定苗枚数", value: `${record.plannedSeedlingTrayCount || 0}枚` },
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
    locationTitle = "苗植え場所";
    infoRows = [
      { label: "実際に取った苗", value: detailsUnknown ? "不明" : event.actualTakenSeedlingCount + "株" },
      { label: "苗植えした株数", value: detailsUnknown ? "不明" : event.actualPlantedSeedlingCount + "株" },
      { label: "苗の品質メモ", value: formatPlantingQualityMemo(event.qualityMemo) },
      { label: "今回余った苗", value: detailsUnknown ? "不明" : carryoverText },
      { label: "作業後の繰越苗", value: detailsUnknown ? "不明" : (usage?.carryoverAfter ?? 0) + "株" },
      ...(isPlantingEventUnsent(event) ? [{ label: "Google", value: "未送信" }] : []),
      { label: "収穫元", value: sourceText || "-" }
    ];
  }else{
    return;
  }

  const loadToken = ++recordDetailLoadToken;
  recordDetailLocationModel = null;
  recordDetailLocationBuilding = null;
  recordDetailLocationSelectedBed = null;
  recordDetailReturnFocus = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  title.textContent = titleText;
  body.classList.add("hasLocationDisplay");
  body.innerHTML = `
    ${getRecordDetailInfoHtml(infoRows)}
    <section class="recordDetailLocationSection" aria-labelledby="recordDetailLocationTitle">
      <div id="recordDetailLocationTitle" class="recordDetailLocationTitle">${escapeHtml(locationTitle)}</div>
      <div id="recordDetailLocationMount">
        <div class="recordDetailLocationLoading" role="status">${escapeHtml(locationTitle)}を読み込んでいます...</div>
      </div>
    </section>
  `;
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
  const conflictIdArgument = JSON.stringify(conflict.conflictId);
  return `
    <div class="recordConflictInline">
      <span class="recordConflictBadge">競合あり</span>
      <span>${escapeHtml(getSyncConflictReasonText(conflict))}</span>
      <button type="button" class="recordConflictOpenBtn" onclick='openSyncConflictPanel(${conflictIdArgument})'>比較して選択</button>
    </div>
  `;
}

function renderRecordItemConsistencyHtml(kind, entity, issue){
  if(!issue) return "";
  const safeId = getSafePositiveRecordId(kind === "planting" ? entity?.eventId : entity?.id) ?? 0;
  const editHandler = kind === "planting"
    ? `editPlantingEvent(${safeId})`
    : (entity?.type === "partialHarvest"
      ? `editPartialHarvestRecord(${safeId})`
      : `editHarvestRecord(${safeId})`);
  return `
    <div class="recordConsistencyInline">
      <span class="recordConsistencyBadge">要確認</span>
      <span>${escapeHtml(issue.reasons.join(" "))}</span>
      <button type="button" class="recordConsistencyEditBtn" onclick="${editHandler}">この記録を編集</button>
    </div>
  `;
}

function renderRecordItemHtml(r, harvestCaseTotalsByDate = null, consistencyIssue = null){
  const safeRecordId = getSafePositiveRecordId(r?.id) ?? 0;
  const safeDate = escapeHtml(String(r?.date || "日付なし"));
  const safeCases = escapeHtml(getHarvestRecordCaseDisplayText(r, harvestCaseTotalsByDate));
  const syncConflict = getSyncConflictForEntity("record", r);
  const conflictHtml = renderRecordItemSyncConflictHtml("record", r);
  const consistencyHtml = renderRecordItemConsistencyHtml("harvest", r, consistencyIssue);
  const syncState = getGoogleSheetRecordSyncState(r);
  const syncWarningText = syncConflict
    ? ""
    : (syncState === "remoteDeleted"
      ? "\n同期注意: 別端末で削除されています。使用中の苗植え履歴を確認してください"
      : (syncState === "dependencyConflict"
        ? "\n同期注意: 苗植え履歴を保護するため別端末の更新を保留しています"
        : (syncState === "conflict"
          ? "\n同期注意: 別端末の更新を保留しています"
          : "")));
  if(r.type === "partialHarvest"){
    return `
    <div class="recordItem${syncConflict ? " hasSyncConflict" : ""}${consistencyIssue ? " hasConsistencyIssue" : ""}">
      <div class="recordTitle">${safeDate} <span class="recordTitleHarvest">部分収穫</span></div>
      <div class="recordMeta">収穫ケース数: ${safeCases}${escapeHtml(syncWarningText)}</div>
      <span class="summaryCode">${escapeHtml(formatPartialHarvestSummary(r.targets))}</span>
      ${conflictHtml}
      ${consistencyHtml}
      ${r.memo ? `<div class="smallText" style="margin-top:8px; white-space:pre-wrap;">メモ: ${escapeHtml(r.memo)}</div>` : ""}
      <div class="recordActions">
        <button class="thirdBtn" onclick="editPartialHarvestRecord(${safeRecordId})">編集</button>
        <button class="secondaryBtn recordListDeleteBtn" onclick="confirmDeleteRecord(${safeRecordId})">削除</button>
      </div>
    </div>
    `;
  }

  const actualLossNumber = getFiniteNumberInRange(r?.actualLoss, -999999, 100);
  const safeActualLoss = actualLossNumber === null ? "-" : escapeHtml(String(actualLossNumber));
  const harvestBuildingText = [...new Set(
    getPalletKeysFromRecord(r)
      .map(key => parsePalletKey(String(key || "")).building)
      .filter(building => BUILDINGS.includes(building))
  )]
    .sort((a, b) => BUILDINGS.indexOf(a) - BUILDINGS.indexOf(b))
    .join("・") || "-";

  return `
    <div class="recordItem${syncConflict ? " hasSyncConflict" : ""}${consistencyIssue ? " hasConsistencyIssue" : ""}">
      <div class="recordTitle">${safeDate} <span class="recordTitleHarvest">収穫</span></div>
      <div class="recordMeta">収穫ケース数: ${safeCases}
ロス率: ${safeActualLoss}${actualLossNumber === null ? "" : "%"}
収穫場所: ${escapeHtml(harvestBuildingText)}
品質メモ: ${escapeHtml(formatQualityMemo(r.qualityMemo) || "-")}</div>
${syncWarningText ? `<div class="smallText" style="margin-top:6px; color:#b45309;">${escapeHtml(syncWarningText.trim())}</div>` : ""}
      ${conflictHtml}
      ${consistencyHtml}
      ${r.memo ? `<div class="smallText" style="margin-top:8px; white-space:pre-wrap;">メモ: ${escapeHtml(r.memo)}</div>` : ""}
      <button type="button" class="recordDetailSummary" aria-haspopup="dialog" aria-controls="recordDetailModal" onclick="openRecordDetailWindow('harvest', ${safeRecordId})">詳細</button>
      <div class="recordActions">
        <button class="thirdBtn" onclick="editHarvestRecord(${safeRecordId})">編集</button>
        <button class="secondaryBtn recordListDeleteBtn" onclick="confirmDeleteRecord(${safeRecordId})">削除</button>
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
      <div class="recordTitle">${escapeHtml(event.plantingDate || "日付なし")} <span class="recordTitlePlanting">苗植え</span></div>
      <div class="recordMeta">苗枚数: ${escapeHtml(metrics.seedlingTrayText)}
苗ロス率: ${escapeHtml(metrics.lossRateText)}
未定植枚数: ${escapeHtml(String(pendingPalletCount))}枚</div>
      ${conflictHtml}
      ${consistencyHtml}
      <button type="button" class="recordDetailSummary" aria-haspopup="dialog" aria-controls="recordDetailModal" onclick="openRecordDetailWindow('planting', ${safeEventId})">詳細</button>
      <div class="recordActions">
        <button class="thirdBtn" onclick="editPlantingEvent(${safeEventId})">編集</button>
        <button class="secondaryBtn recordListDeleteBtn" onclick="confirmDeletePlantingEvent(${safeEventId})">削除</button>
      </div>
    </div>
  `;
}

function formatActualSeedlingTrayText(record){
  const trayCount = clampNumber(record?.actualSeedlingTrayCount, 0, 999999, clampNumber(record?.actualSeedling60TrayCount, 0, 999999, 0) + clampNumber(record?.actualSeedling120TrayCount, 0, 999999, 0));
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
  const actualSeedlingTrayCount = clampNumber(record.actualSeedlingTrayCount, 0, 999999, clampNumber(record.actualSeedling60TrayCount, 0, 999999, 0) + clampNumber(record.actualSeedling120TrayCount, 0, 999999, 0));
  const actualSeedlingCarryoverMode = normalizeSeedlingCarryoverMode(record.actualSeedlingCarryoverMode);
  const actualSeedlingLossRate = String(record.actualSeedlingLossRate ?? "").trim();
  const actualLoss = String(record.actualLoss ?? "").trim();
  const qualityMemo = record.qualityMemo || record.qualityTags || record.qualityText
    ? normalizeQualityMemo(record.qualityMemo || {
        qualityTags: parseMaybeJsonList(record.qualityTags),
        qualityOther: record.qualityOther || record.qualityText || ""
      })
    : qualityMemoFromLegacySizeRating(record.sizeRating);
  const plantingAge = normalizePlantingAgeSnapshot(record.plantingAge);
  const palletKeys = getPalletKeysFromRecord(record);
  const explicitLegacyCompletion = Object.prototype.hasOwnProperty.call(record, "plantingPending")
    && record.plantingPending === false;
  const plantingPalletKeys = [...new Set([
    ...expandPalletKeyItemsToKeys(record.plantingPalletKeys),
    ...expandPalletRangesToKeys(record.plantingRanges),
    ...(explicitLegacyCompletion ? parsePalletSummaryToKeys(plantingSummary) : [])
  ])]
    .filter(key => palletKeys.includes(key))
    .sort((a, b) => getOrderIndexFromKey(a) - getOrderIndexFromKey(b));
  // 読み込んだ日付や苗ロス率だけで、未完了の苗植えを完了扱いにしない。
  // 旧形式は実際の苗植えパレットが明示されている場合だけ移行対象にする。
  const hasExplicitLegacyPlantingSelection = plantingPalletKeys.length > 0;

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
    plantingPending: !hasExplicitLegacyPlantingSelection,
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
    const raw = localStorage.getItem(RECORD_EXPORT_STATUS_KEY);
    if(!raw) return { lastExportRecordCount: 0, lastPromptRecordCount: 0 };
    const parsed = JSON.parse(raw);
    return {
      lastExportRecordCount: clampNumber(parsed.lastExportRecordCount, 0, 99999999, 0),
      lastPromptRecordCount: clampNumber(parsed.lastPromptRecordCount, 0, 99999999, 0)
    };
  }catch(e){
    return { lastExportRecordCount: 0, lastPromptRecordCount: 0 };
  }
}

function saveRecordExportStatus(status){
  localStorage.setItem(RECORD_EXPORT_STATUS_KEY, JSON.stringify(status || {}));
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
    syncConflicts: syncConflicts.map(serializeSyncConflictEntry).filter(Boolean),
    migratedPlantingRecordIds: [...loadMigratedPlantingRecordIds()]
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
