function getRecordSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  return sheet;
}

function getExistingRecordSheet() {
  return getSpreadsheet().getSheetByName(SHEET_NAME);
}

function getRecordTrashSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(RECORD_TRASH_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(RECORD_TRASH_SHEET_NAME);
  }

  return sheet;
}

function getExistingRecordTrashSheet() {
  return getSpreadsheet().getSheetByName(RECORD_TRASH_SHEET_NAME);
}

function getRecordTombstoneSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(RECORD_TOMBSTONE_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(RECORD_TOMBSTONE_SHEET_NAME);
  ensureRecordTombstoneSheet(sheet);
  return sheet;
}

function getExistingRecordTombstoneSheet() {
  return getSpreadsheet().getSheetByName(RECORD_TOMBSTONE_SHEET_NAME);
}

function ensureRecordTombstoneSheet(sheet) {
  if (!sheet) throw new Error("記録削除IDシートがありません");
  if (sheet.getLastRow() < 1) {
    if (sheet.getMaxColumns() < RECORD_TOMBSTONE_HEADERS.length) {
      sheet.insertColumnsAfter(
        sheet.getMaxColumns(),
        RECORD_TOMBSTONE_HEADERS.length - sheet.getMaxColumns()
      );
    }
    sheet.getRange(1, 1, 1, RECORD_TOMBSTONE_HEADERS.length)
      .setValues([RECORD_TOMBSTONE_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, RECORD_TOMBSTONE_HEADERS.length).setFontWeight("bold");
    sheet.getRange(2, 3, Math.max(sheet.getMaxRows() - 1, 1), 1)
      .setNumberFormat("yyyy-mm-dd hh:mm:ss");
    sheet.hideColumns(1, 2);
    return;
  }
  const headers = sheet.getRange(1, 1, 1, RECORD_TOMBSTONE_HEADERS.length).getValues()[0];
  if (!RECORD_TOMBSTONE_HEADERS.every(
    (header, index) => String(headers[index] || "").trim() === header
  )) {
    throw new Error("記録削除IDシートの見出しが正しくありません");
  }
}

function validateRecordTombstoneSheetForRead(sheet) {
  if (!sheet || sheet.getLastRow() < 1) return;
  if (sheet.getLastColumn() < RECORD_TOMBSTONE_HEADERS.length) {
    throw new Error("記録削除IDシートの見出しが正しくありません");
  }
  const headers = sheet
    .getRange(1, 1, 1, RECORD_TOMBSTONE_HEADERS.length)
    .getValues()[0];
  if (!RECORD_TOMBSTONE_HEADERS.every(
    (header, index) => String(headers[index] || "").trim() === header
  )) {
    throw new Error("記録削除IDシートの見出しが正しくありません");
  }
}

function getHarvestRecordTombstoneItems() {
  const sheet = getExistingRecordTombstoneSheet();
  if (!sheet || sheet.getLastRow() < 2) return [];
  validateRecordTombstoneSheetForRead(sheet);
  return sheet
    .getRange(2, 1, sheet.getLastRow() - 1, RECORD_TOMBSTONE_HEADERS.length)
    .getValues()
    .map((row, index) => {
      let recordUuid = "";
      try {
        recordUuid = normalizeOptionalRecordUuid(row[0]);
      } catch (err) {
        throw new Error("記録削除IDシートに不正な記録UUIDがあります");
      }
      const id = normalizeOptionalInteger(row[1], "削除済み記録ID", 1, Number.MAX_SAFE_INTEGER, null);
      if (!recordUuid && id === null) return null;
      const deletedAt = formatHarvestRecordTimestamp(row[2]);
      return {
        recordUuid,
        id,
        deletedAt,
        deletedTime: new Date(deletedAt || "").getTime() || 0,
        rowNumber: index + 2,
        rowOrder: index
      };
    })
    .filter(Boolean);
}

function rememberDeletedHarvestRecord(record, deletedAt) {
  const recordUuid = normalizeOptionalRecordUuid(record && record.recordUuid);
  const id = normalizeOptionalInteger(
    record && record.id,
    "削除済み記録ID",
    1,
    Number.MAX_SAFE_INTEGER,
    null
  );
  if (!recordUuid && id === null) throw new Error("削除済み記録の識別情報がありません");
  const deletedTime = new Date(deletedAt || "").getTime();
  const deletedDate = Number.isFinite(deletedTime) ? new Date(deletedTime) : new Date();
  const matches = getHarvestRecordTombstoneItems().filter(item => (
    recordUuid
      ? item.recordUuid === recordUuid
      : (id !== null && !item.recordUuid && item.id !== null && String(item.id) === String(id))
  ));
  const sheet = getRecordTombstoneSheet();
  if (matches.length) {
    const keeper = matches[0];
    const existingTime = new Date(sheet.getRange(keeper.rowNumber, 3).getValue()).getTime();
    sheet.getRange(keeper.rowNumber, 1, 1, 3).setValues([[
      recordUuid || keeper.recordUuid,
      id === null ? keeper.id : id,
      !Number.isFinite(existingTime) || deletedDate.getTime() > existingTime
        ? deletedDate
        : new Date(existingTime)
    ]]);
    matches.slice(1).map(item => item.rowNumber).sort((a, b) => b - a)
      .forEach(rowNumber => sheet.deleteRow(rowNumber));
    return false;
  }
  sheet.appendRow([recordUuid, id === null ? "" : id, deletedDate]);
  return true;
}

function forgetDeletedHarvestRecord(record) {
  const recordUuid = String(record && record.recordUuid || "").trim().toLowerCase();
  const id = String(record && record.id == null ? "" : record.id).trim();
  const rowNumbers = getHarvestRecordTombstoneItems()
    .filter(item => (
      recordUuid
        ? (item.recordUuid === recordUuid ||
          (id && !item.recordUuid && item.id !== null && String(item.id) === id))
        : (id && !item.recordUuid && item.id !== null && String(item.id) === id)
    ))
    .map(item => item.rowNumber)
    .sort((a, b) => b - a);
  if (!rowNumbers.length) return false;
  const sheet = getRecordTombstoneSheet();
  rowNumbers.forEach(rowNumber => sheet.deleteRow(rowNumber));
  return true;
}

function rememberHarvestRecordTombstonesFromTrash(trashSheet) {
  if (!trashSheet) {
    return { changed: 0, identities: new Set(), rows: [] };
  }
  ensureRecordTrashSheet(trashSheet);
  const tombstoneItems = getHarvestRecordTombstoneItems();
  const rowCount = Math.max(trashSheet.getLastRow() - 1, 0);
  const rows = rowCount
    ? trashSheet.getRange(2, 1, rowCount, RECORD_TRASH_HEADERS.length).getValues()
    : [];
  backfillHarvestRecordTrashSyncMetadata(trashSheet, {
    rows,
    tombstoneItems
  });
  const byUuid = new Map();
  const byId = new Map();
  tombstoneItems.forEach(item => {
    if (item.recordUuid) byUuid.set(item.recordUuid, item);
    if (!item.recordUuid && item.id !== null) byId.set(String(item.id), item);
  });
  const newRows = [];
  const updates = new Map();
  rows.forEach(row => {
    const record = rowToRecord(HEADERS, row.slice(0, HEADERS.length));
    const deletedTime = new Date(row[HEADERS.length] || "").getTime();
    const deletedDate = Number.isFinite(deletedTime) ? new Date(deletedTime) : new Date();
    const recordUuid = String(record.recordUuid || "").trim().toLowerCase();
    const id = String(record.id == null ? "" : record.id).trim();
    let item = recordUuid ? byUuid.get(recordUuid) : (id && byId.get(id));
    if (item) {
      if (!Number.isFinite(item.deletedTime) || deletedDate.getTime() > item.deletedTime ||
        (!item.recordUuid && recordUuid) || (item.id === null && id)) {
        const updatedItem = {
          ...item,
          recordUuid: recordUuid || item.recordUuid,
          id: id ? Number(id) : item.id,
          deletedTime: Math.max(item.deletedTime || 0, deletedDate.getTime()),
          deletedAt: new Date(Math.max(item.deletedTime || 0, deletedDate.getTime())).toISOString()
        };
        if (item.rowNumber > 0) {
          updates.set(item.rowNumber, updatedItem);
        } else if (Number.isSafeInteger(item.newRowIndex)) {
          newRows[item.newRowIndex] = [
            updatedItem.recordUuid || "",
            updatedItem.id === null ? "" : updatedItem.id,
            new Date(updatedItem.deletedTime)
          ];
          updatedItem.newRowIndex = item.newRowIndex;
        }
        item = updatedItem;
      }
    } else {
      const newRowIndex = newRows.length;
      item = {
        recordUuid,
        id: id ? Number(id) : null,
        deletedTime: deletedDate.getTime(),
        deletedAt: deletedDate.toISOString(),
        rowNumber: 0,
        newRowIndex
      };
      newRows.push([recordUuid, id ? Number(id) : "", deletedDate]);
    }
    if (recordUuid) byUuid.set(recordUuid, item);
    if (!recordUuid && id) byId.set(id, item);
  });
  if (updates.size || newRows.length) {
    const sheet = getRecordTombstoneSheet();
    updates.forEach((item, rowNumber) => {
      sheet.getRange(rowNumber, 1, 1, 3).setValues([[
        item.recordUuid || "",
        item.id === null ? "" : item.id,
        new Date(item.deletedTime)
      ]]);
    });
    if (newRows.length) {
      const startRow = sheet.getLastRow() + 1;
      const requiredLastRow = startRow + newRows.length - 1;
      if (requiredLastRow > sheet.getMaxRows()) {
        sheet.insertRowsAfter(sheet.getMaxRows(), requiredLastRow - sheet.getMaxRows());
      }
      sheet.getRange(startRow, 1, newRows.length, 3).setValues(newRows);
    }
  }
  const identities = new Set();
  const addIdentity = item => {
    if (!item) return;
    if (item.recordUuid) identities.add("u:" + item.recordUuid);
    if (item.id !== null && typeof item.id !== "undefined" && String(item.id).trim()) {
      identities.add("i:" + String(item.id));
    }
  };
  byUuid.forEach(addIdentity);
  byId.forEach(addIdentity);
  rows.forEach(row => {
    const record = rowToRecord(HEADERS, row.slice(0, HEADERS.length));
    if (record.recordUuid) identities.add("u:" + record.recordUuid);
    if (record.id !== null && String(record.id).trim()) {
      identities.add("i:" + String(record.id));
    }
  });
  return {
    changed: updates.size + newRows.length,
    identities,
    rows
  };
}

function validateRecordTrashSheetHeaders(sheet) {
  if (!sheet || sheet.getLastRow() === 0) return;
  const currentHeaders = sheet
    .getRange(1, 1, 1, Math.max(sheet.getLastColumn(), RECORD_TRASH_HEADERS.length))
    .getValues()[0];
  const headersMatch = RECORD_TRASH_HEADERS.every(
    (header, index) => String(currentHeaders[index] || "").trim() === header
  );
  if (!headersMatch) {
    throw new Error(
      "削除済み記録シートの見出しが現在の形式と異なります。データ保護のため自動変換を中止しました。"
    );
  }
}

function migrateLegacyRecordTrashSheetHeaders(sheet) {
  if (!sheet || sheet.getLastRow() === 0) return false;
  let changed = false;
  for (let index = 0; index < HEADERS.length; index++) {
    const currentHeader = String(sheet.getRange(1, index + 1).getValue() || "").trim();
    const expectedHeader = HEADERS[index];
    if (currentHeader === expectedHeader) continue;

    const remainingHeaders = sheet
      .getRange(1, index + 1, 1, Math.max(sheet.getLastColumn() - index, 1))
      .getValues()[0]
      .map(value => String(value || "").trim());
    if (remainingHeaders.includes(expectedHeader)) {
      throw new Error(
        "削除済み記録シートの見出し順が正しくありません。データ保護のため自動変換を中止しました。"
      );
    }
    const currentKey = getHeaderKey(currentHeader);
    if (!currentKey && currentHeader !== "削除日時" && currentHeader !== "復元期限") {
      throw new Error(
        "削除済み記録シートの見出しが現在の形式と異なります。データ保護のため自動変換を中止しました。"
      );
    }
    sheet.insertColumnsBefore(index + 1, 1);
    sheet.getRange(1, index + 1).setValue(expectedHeader);
    changed = true;
  }
  return changed;
}

function getDeletedHarvestRecordIdentitySet() {
  const identities = new Set();
  getHarvestRecordTombstoneItems().forEach(item => {
    if (item.recordUuid) identities.add("u:" + item.recordUuid);
    if (item.id !== null) identities.add("i:" + String(item.id));
  });
  const sheet = getExistingRecordTrashSheet();
  if (!sheet || sheet.getLastRow() < 2) return identities;
  ensureRecordTrashSheet(sheet);
  backfillHarvestRecordTrashSyncMetadata(sheet);
  const rows = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, RECORD_TRASH_HEADERS.length)
    .getValues();
  rows.forEach(row => {
    const record = rowToRecord(HEADERS, row.slice(0, HEADERS.length));
    if (record.recordUuid) identities.add("u:" + record.recordUuid);
    if (record.id !== null && String(record.id).trim()) identities.add("i:" + String(record.id));
  });
  return identities;
}

function getDeletedRecordIdSet() {
  return getDeletedHarvestRecordIdentitySet();
}

function listDeletedHarvestRecordTombstones() {
  return withRecordReadLock(() => listDeletedHarvestRecordTombstonesUnlocked());
}

function listDeletedHarvestRecordTombstonesUnlocked() {
  const itemsByIdentity = new Map();
  getHarvestRecordTombstoneItems().forEach(item => {
    const key = item.recordUuid ? "u:" + item.recordUuid : "i:" + String(item.id);
    const existing = itemsByIdentity.get(key);
    if (!existing || item.deletedTime > existing.deletedTime) itemsByIdentity.set(key, item);
  });
  return [...itemsByIdentity.values()]
    .sort((a, b) => (
      b.deletedTime - a.deletedTime ||
      String(a.recordUuid || a.id).localeCompare(String(b.recordUuid || b.id))
    ))
    .slice(0, RECORD_TOMBSTONE_LIST_LIMIT)
    .map(item => ({
      recordUuid: item.recordUuid || "",
      id: item.id === null ? null : item.id,
      deletedAt: item.deletedAt || ""
    }));
}

function assertRecordIsNotDeleted(record, deletedRecordIdentities) {
  const recordUuid = String(record && record.recordUuid || "").trim().toLowerCase();
  const id = String(record && record.id != null ? record.id : "").trim();
  const isDeleted = recordUuid
    ? deletedRecordIdentities.has("u:" + recordUuid)
    : (id && deletedRecordIdentities.has("i:" + id));
  if (isDeleted) {
    throw new Error("この記録は削除済みです。復元してから保存してください。");
  }
}

function ensureRecordTrashSheet(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    if (RECORD_TRASH_HEADERS.length > sheet.getMaxColumns()) {
      sheet.insertColumnsAfter(
        sheet.getMaxColumns(),
        RECORD_TRASH_HEADERS.length - sheet.getMaxColumns()
      );
    }
    sheet.getRange(1, 1, 1, RECORD_TRASH_HEADERS.length).setValues([RECORD_TRASH_HEADERS]);
    applyRecordTrashSheetLayout(sheet);
    return;
  }

  const currentHeaders = sheet
    .getRange(1, 1, 1, Math.max(sheet.getLastColumn(), RECORD_TRASH_HEADERS.length))
    .getValues()[0];
  const headersMatch = RECORD_TRASH_HEADERS.every(
    (header, index) => String(currentHeaders[index] || "").trim() === header
  );
  if (headersMatch) return;

  const migrated = migrateLegacyRecordTrashSheetHeaders(sheet);
  validateRecordTrashSheetHeaders(sheet);
  if (migrated) applyRecordTrashSheetLayout(sheet);
}

function backfillHarvestRecordTrashSyncMetadata(sheet, options) {
  if (!sheet) return 0;
  const normalizedOptions = options && typeof options === "object" ? options : {};
  const suppliedRows = Array.isArray(normalizedOptions.rows)
    ? normalizedOptions.rows
    : null;
  if (!suppliedRows && sheet.getLastRow() < 2) return 0;
  if (suppliedRows && !suppliedRows.length) return 0;
  validateRecordTrashSheetHeaders(sheet);
  const uuidColumn = HEADERS.indexOf(HEADER_LABELS.recordUuid) + 1;
  const createdAtColumn = HEADERS.indexOf(HEADER_LABELS.createdAt) + 1;
  const updatedAtColumn = HEADERS.indexOf(HEADER_LABELS.updatedAt) + 1;
  const receivedAtColumn = HEADERS.indexOf(HEADER_LABELS.receivedAt) + 1;
  const deletedAtColumn = HEADERS.length + 1;
  const rows = suppliedRows || sheet
    .getRange(2, 1, sheet.getLastRow() - 1, RECORD_TRASH_HEADERS.length)
    .getValues();
  const rowCount = rows.length;
  const suppliedTombstoneItems = Array.isArray(normalizedOptions.tombstoneItems)
    ? normalizedOptions.tombstoneItems
    : null;
  rememberLegacyDeletedHarvestRecordIds(rows
    .filter(row => !String(row[uuidColumn - 1] || "").trim())
    .map(row => ({
      id: row[HEADERS.indexOf(HEADER_LABELS.id)],
      deletedAt: row[deletedAtColumn - 1]
    })), suppliedTombstoneItems);
  const seenUuids = new Set(
    (suppliedTombstoneItems || getHarvestRecordTombstoneItems())
      .map(item => item.recordUuid)
      .filter(Boolean)
  );
  let changed = 0;
  rows.forEach(row => {
    let uuid = String(row[uuidColumn - 1] || "").trim().toLowerCase();
    if (uuid) {
      uuid = normalizeOptionalRecordUuid(uuid);
    } else {
      do {
        uuid = Utilities.getUuid().toLowerCase();
      } while (seenUuids.has(uuid));
      row[uuidColumn - 1] = uuid;
      changed++;
    }
    seenUuids.add(uuid);
    const candidates = [row[receivedAtColumn - 1], row[deletedAtColumn - 1]];
    const fallbackTime = candidates
      .map(value => new Date(value || "").getTime())
      .find(Number.isFinite);
    const fallbackDate = Number.isFinite(fallbackTime) ? new Date(fallbackTime) : new Date();
    if (!Number.isFinite(new Date(row[createdAtColumn - 1] || "").getTime())) {
      row[createdAtColumn - 1] = fallbackDate;
      changed++;
    }
    if (!Number.isFinite(new Date(row[updatedAtColumn - 1] || "").getTime())) {
      row[updatedAtColumn - 1] = fallbackDate;
      changed++;
    }
  });
  if (!changed) return 0;
  sheet.getRange(2, uuidColumn, rowCount, 1).setValues(rows.map(row => [row[uuidColumn - 1]]));
  sheet.getRange(2, createdAtColumn, rowCount, 1).setValues(rows.map(row => [row[createdAtColumn - 1]]));
  sheet.getRange(2, updatedAtColumn, rowCount, 1).setValues(rows.map(row => [row[updatedAtColumn - 1]]));
  return changed;
}

function rememberLegacyDeletedHarvestRecordIds(items, tombstoneItems) {
  const sourceItems = Array.isArray(items) ? items : [];
  if (!sourceItems.length) return 0;
  const existingById = new Map();
  const existingItems = Array.isArray(tombstoneItems)
    ? tombstoneItems
    : getHarvestRecordTombstoneItems();
  existingItems.forEach(item => {
    if (!item.recordUuid && item.id !== null) existingById.set(String(item.id), item);
  });
  const updates = new Map();
  const newRows = [];
  sourceItems.forEach(item => {
    const id = normalizeOptionalInteger(
      item && item.id,
      "削除済み記録ID",
      1,
      Number.MAX_SAFE_INTEGER,
      null
    );
    if (id === null) return;
    const parsedTime = new Date(item && item.deletedAt || "").getTime();
    const deletedDate = Number.isFinite(parsedTime) ? new Date(parsedTime) : new Date();
    const existing = existingById.get(String(id));
    if (existing) {
      if (deletedDate.getTime() > existing.deletedTime) {
        if (existing.rowNumber > 0) {
          updates.set(existing.rowNumber, { id, deletedDate });
        } else if (Number.isSafeInteger(existing.newRowIndex)) {
          newRows[existing.newRowIndex] = ["", id, deletedDate];
        }
        existing.deletedTime = deletedDate.getTime();
      }
      return;
    }
    const pending = {
      id,
      deletedDate,
      deletedTime: deletedDate.getTime(),
      rowNumber: 0,
      newRowIndex: newRows.length
    };
    existingById.set(String(id), pending);
    newRows.push(["", id, deletedDate]);
  });
  const tombstoneSheet = getRecordTombstoneSheet();
  updates.forEach((item, rowNumber) => {
    tombstoneSheet.getRange(rowNumber, 3).setValue(item.deletedDate);
  });
  if (newRows.length) {
    const startRow = tombstoneSheet.getLastRow() + 1;
    const requiredLastRow = startRow + newRows.length - 1;
    if (requiredLastRow > tombstoneSheet.getMaxRows()) {
      tombstoneSheet.insertRowsAfter(
        tombstoneSheet.getMaxRows(),
        requiredLastRow - tombstoneSheet.getMaxRows()
      );
    }
    tombstoneSheet.getRange(startRow, 1, newRows.length, 3).setValues(newRows);
  }
  return updates.size + newRows.length;
}

function applyRecordTrashSheetLayout(sheet) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, RECORD_TRASH_HEADERS.length).setFontWeight("bold");
  const deletedAtColumn = RECORD_TRASH_HEADERS.length - 1;
  const expiresAtColumn = RECORD_TRASH_HEADERS.length;
  const rowCount = Math.max(sheet.getMaxRows() - 1, 1);
  sheet.getRange(2, deletedAtColumn, rowCount, 2).setNumberFormat("yyyy-mm-dd hh:mm:ss");
  ["作成日時", "更新日時", "受信日時"].forEach(header => {
    const column = RECORD_TRASH_HEADERS.indexOf(header) + 1;
    if (column > 0) sheet.getRange(2, column, rowCount, 1).setNumberFormat("yyyy-mm-dd hh:mm:ss");
  });
  ["重複判定キー", "記録ID", "記録UUID", "大きさ", "パレット詳細", "苗植え詳細", "先取り詳細"].forEach(header => {
    const column = RECORD_TRASH_HEADERS.indexOf(header) + 1;
    if (column > 0) sheet.hideColumns(column);
  });
}
