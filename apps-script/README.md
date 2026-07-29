# Apps Script workspace

This directory is reserved for the Harvestnavi Apps Script project.

- `clasp pull` and status checks are manual.
- `clasp push`, version creation, and deployment are run only after an explicit request.
- `.clasp.json` and Google authentication credentials must never be committed.
- The source is temporarily excluded from Git until fixed resource IDs are moved to Script Properties.

## Current deployment note

- Version 69 combines harvest-record and planting-event reads into one sync request.
- Version 68 fixes stored JSON-array parsing so the pallet-numbering migration can read existing harvest records.
- Version 67 introduced the one-time migration of stored pallet numbers to the left-origin layout after normal API authentication.
- Before migration, it creates hidden backup sheets prefixed with `番号移行前_`.
- Completion is stored in the Script Property `PALLET_NUMBERING_MIGRATED_LEFT_ORIGIN_V2_20260729`; later requests only check this marker.
