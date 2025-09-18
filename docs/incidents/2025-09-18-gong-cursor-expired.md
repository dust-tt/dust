# [Gong] 400 on /calls/transcript: "cursor has expired"

## Summary
- Connectors worker for Gong fails on `POST /v2/calls/transcript` with HTTP 400 and error "cursor has expired".
- Temporal keeps retrying the same activity with the same stale `cursor`, leading to repeated failures (e.g., attempt 1190).

Example log (redacted):
```
Error: Gong API responded with status: 400 on /calls/transcript
  at GongClient.getTranscripts (connectors/src/connectors/gong/lib/gong_api.ts:271)
  ...
  error: { type: "GongAPIError", status: 400, errors: ["cursor has expired"], endpoint: "/calls/transcript" }
  activityName: gongSyncTranscriptsActivity
  workflowId: gong-sync-<id>-transcripts
```

## Impact
- Transcript sync stalls for the affected connector; workflow hot-loops retries.
- Noise in logs and wasted resources; no forward progress until manual intervention.

## Findings
- Request path:
  - `connectors/src/connectors/gong/temporal/activities.ts:94` calls `gongClient.getTranscripts({ startTimestamp: configuration.getSyncStartTimestamp(), pageCursor })`.
  - `connectors/src/connectors/gong/lib/gong_api.ts:262` posts to `/v2/calls/transcript` with body `{ cursor, filter: { fromDateTime } }`.
  - On non-OK responses, `handleResponse` throws `GongAPIError` with parsed `errors` and `requestId` (`errors.ts`).
- Error classification:
  - `connectors/src/connectors/gong/temporal/cast_known_errors.ts` exists but currently passes errors through (no casting for expired cursors).
- Workflow behavior:
  - `connectors/src/connectors/gong/temporal/workflows.ts` loops until `nextPageCursor === null`.
  - When `GongAPIError` is thrown, Temporal retries the same activity with the same `pageCursor` (stale), reproducing the failure.

## Root Cause
- Gong’s pagination `cursor` is short‑lived. When it expires, the API returns 400 with `errors: ["cursor has expired"]`.
- Our sync does not handle this case: we neither reset the `pageCursor` nor cast the error to let the workflow recover. The activity is retried with the same expired cursor, causing an endless failure loop.

## Proposed Fix
- Minimal, robust recovery at the activity or client level.

Option A (activity-level, recommended):
- In `gongSyncTranscriptsActivity`, wrap the `getTranscripts` call with try/catch.
- If the error is a `GongAPIError` with `status === 400` and `errors` includes `"cursor has expired"`, log a warning and retry once with `pageCursor = null`.
- Proceed with processing and return the fresh `nextPageCursor`.

Pros: Localized change; avoids workflow changes; immediate recovery.
Cons: If forceResync is true, restarting from page 1 may re-upsert already-processed items in the same run (idempotent, but progress counters may overcount).

Option B (client-level):
- In `GongClient.getTranscripts`, detect the same condition and transparently retry once with `pageCursor = null` (guard to avoid loops).

Pros: Centralized handling; all callers benefit.
Cons: Less explicit at the call site.

Complementary:
- Update `GongCastKnownErrorsInterceptor` to cast this API error into a `DustConnectorWorkflowError` for better observability (does not by itself fix the loop, but improves monitoring consistency with Zendesk).

## Notes on Safety/Idempotency
- Upserts for transcripts are keyed by `callId` (see internal ID generation and upsert flow), so reprocessing is safe.
- When `forceResync` is false, we already filter out transcripts present in DB, further limiting duplicates.
- Progress reporting may briefly overcount if we restart from page 1 mid-run; acceptable tradeoff.

## Next Steps
- Implement Option A or B.
- Add a unit test (or a minimal integration harness) that simulates a 400 with `"cursor has expired"` and verifies a single fallback retry with `cursor = null`.
- Optionally, add metric/log: count of expired-cursor recoveries and associated `requestId`.

## Code References
- connectors/src/connectors/gong/lib/gong_api.ts:262
- connectors/src/connectors/gong/temporal/activities.ts:94
- connectors/src/connectors/gong/temporal/workflows.ts:87
- connectors/src/connectors/gong/temporal/cast_known_errors.ts:1
- connectors/src/connectors/gong/lib/errors.ts:1

