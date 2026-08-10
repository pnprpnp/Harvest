# Apps Script workspace

This directory is reserved for the Harvestnavi Apps Script project.

- `clasp pull` and status checks are manual.
- `clasp push`, version creation, and deployment are run only after an explicit request.
- `.clasp.json` and Google authentication credentials must never be committed.
- `コード.js` is generated from the feature-oriented files under `src`; edit those sources instead.
- `.claspignore` excludes `src` so only the generated `コード.js` and manifest are uploaded.
- `コード.js` and `appsscript.json` are tracked in Git. `.clasp.json` remains local-only.

Before checking or pushing the Apps Script project, generate `コード.js` from the split sources:

```sh
python3 tools/build_apps_script.py
```

Use `python3 tools/build_apps_script.py --check` to verify the generated file without changing it. The source-file responsibilities and order are documented in [`src/README.md`](src/README.md).

## Spreadsheet connection

The spreadsheet ID is stored in the Apps Script Script Property
`HARVEST_SPREADSHEET_ID`; it is not written in the source code.

Before deploying this source to a standalone Apps Script project:

1. Open **Project Settings** in the Apps Script editor.
2. Under **Script Properties**, add `HARVEST_SPREADSHEET_ID`.
3. Set its value to the target spreadsheet URL or spreadsheet ID.

A container-bound Apps Script can use its bound spreadsheet when this property
is absent. The helper `setupHarvestSpreadsheetId(urlOrId)` can also set and
validate the property when invoked with `clasp run`; when the project is
container-bound, it can be run without an argument from the Apps Script editor.

## Current deployment note

- The current source accepts only pallet-numbering version 2 and no longer runs
  the retired pallet-numbering, planting-event, conflict, or record-metadata
  migrations during normal requests. Deploy it only after every device has
  completed its final update and sync.
- Version 78 returns the latest `syncRevision` after planting-event mutations,
  allowing the client to acknowledge its own planting-event writes without
  immediately showing the record update notification again.
- Version 77 authenticates and compares `syncRevision` from
  one Script Properties snapshot before reading sheets.
- Version 76 keeps a monotonically increasing `syncRevision` number
  in Script Properties and stores changed record identities in the hidden
  `同期変更履歴` sheet. A matching revision returns immediately; an older
  supported revision reads only the changed harvest and planting rows.
- Run `installHarvestSyncRevisionTrigger` once
  from the Apps Script editor. Direct spreadsheet edits then invalidate the
  incremental history and make the next client perform one safe full sync.
- Clients without a saved revision or outside the retained history use the
  full/cursor sync path.
- Version 75 detects directly added, uncommitted record rows during sync and saves
  and tells the operator to run `repairHarvestRecordSyncMetadata`, including the
  affected sheet row numbers.
- Version 73 reuses one trash/tombstone snapshot while preparing deleted-record
  protection and skips planting-allocation scans for partial-harvest-only saves.
- Version 72 reuses one record-sheet snapshot for batch-save validation and reuses
  the opened Spreadsheet object throughout each API request.
- Version 71 avoids reapplying existing sheet formats during normal saves, writes
  monitor settings in one range without rewriting explanation labels, and applies
  monitor-history layout only when that sheet is initialized or repaired.
- Version 70 makes normal record sync read-only: it no longer reformats columns, repairs
  headers, backfills sync metadata, creates sheets, or purges trash during a read.
- Version 69 combines harvest-record and planting-event reads into one sync request.
