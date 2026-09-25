# Durable evals: internal pilot draft

Run Henry's agent/judge evals on hosted Temporal workers, then monitor the same
results from any authorized client. This draft adds a native backend, not a Frame.
A collaborative Frame is authored and published separately from the Computer into
a Pod, and calls these endpoints through server functions. Closing the browser,
ending the Computer session, or closing a laptop does not own the run's lifetime.

**Not ready for enablement.** Keep `durable_evals` off until the review/rollout
checklist below is complete. No infrastructure is provisioned by this change.

## Execution and storage

- `evalRunWorkflow` starts a fixed pool of child case workflows on `evals-v1`.
- A case is `(rowIndex, variantIndex, repetition)`. Its evaluated agent runs first,
  followed by independently checkpointed judge votes.
- Activities launch or poll a stage. Workflow timers wait between reads; there is
  no long-lived SSE connection or local checkpoint file.
- PostgreSQL `eval_runs` stores validated input and its SHA-256 hash. `eval_steps`
  stores each stage's status, conversation/message IDs, answer, score and error.
  These records outlive Temporal history retention.
- Temporal history carries orchestration state and small IDs/statuses, not the
  dataset and generated answer bodies. Child histories bound per-case growth.
- The dependency-free grading core was extracted from `x/henry/dust-evals/src` to
  `front/lib/evals`. The CLI re-exports that same implementation, retaining its
  discrete mode / continuous median, agreement, and rubric semantics.

This is a bounded JSON/text-only pilot: at most 100 expanded cases, 5 concurrent
cases per run, 5 judge votes per case, and 20 minutes per stage. Local file uploads,
CSV ingestion, HTML reports, per-case rerun controls and human annotations are not
implemented here. A Frame may parse CSV into the JSON contract below.

## Authentication and collaboration boundary

All endpoints inherit `publicApiAuth` and require workspace admin plus the
`durable_evals` flag. Launch additionally requires a plain, unscoped workspace
admin API key (not user-delegated auth). Store that key in server-side secrets,
never browser code or Frame input. The API derives attribution and authorization
from the request; no caller IDs or credentials are accepted in the run config.
Activities re-fetch the key and its live role/grants before each launch/read, so
revoking the key or flag stops further execution. Cleanup still records failures.

All enabled-workspace admins can inspect runs, answers, and judge output. This is
workspace-admin collaboration, not Pod-scoped result ACLs. Sharing a Frame does
not authorize access to this API. Add Pod membership checks and viewer-specific
permissions before opening the UI to non-admins. Do not use a privileged shared
key to serve results to unauthorized viewers.

Evaluated conversations are unlisted and outside the collaboration Pod, keeping
review discussions out of the evaluated context. Tool approvals are NOT skipped;
agents waiting on user input/approval can reach the stage deadline. Start with
read-only eval agents and explicit tool approval policies.

## HTTP contract

Prefix: `/api/v1/w/{workspaceId}/evals`.

| Method | Path | Behavior |
| --- | --- | --- |
| POST | `/runs` | Validate and persist config, then start a workflow; returns 202 with run/workflow IDs. |
| GET | `/runs` | Latest 50 runs, metadata only. |
| GET | `/runs/{runId}` | Config, run state, stage progress, conversation links as IDs and majority scores. |
| GET | `/runs/{runId}/steps?offset=0&limit=5` | Ordered, paginated answer/judge bodies, maximum 5 stages per response. |
| POST | `/runs/{runId}/cancel` | Request a cooperative stop of new stages. |

The caller generates a UUID `runId` and retains it across retries. Example body
(the agent IDs must be replaced with actual accessible agent IDs):

```json
{
  "runId": "4ad27f2a-8e1a-4bdd-bc76-4a96ca831e03",
  "config": {
    "rows": [
      { "prompt": "Explain the supplied policy", "judgePrompt": "Is the answer grounded and complete?" }
    ],
    "variants": [{ "agentId": "EVALUATED_AGENT_ID" }],
    "judge": { "agentId": "JUDGE_AGENT_ID" },
    "repetitions": 2,
    "judgeRuns": 3,
    "concurrency": 2,
    "timeoutSeconds": 600,
    "scale": "0-3",
    "globalJudgePrompt": "Assess the answer using the stated criteria."
  }
}
```

Each variant, including the judge, optionally accepts the existing API
`modelSelection` object. Each repetition gets its own conversation. Successful
stage responses include the resolved model, separate from the requested override.
A case's aggregate score stays null unless all configured judge votes succeeded.

The API does not wait for evaluation completion. If Temporal is unavailable after
DB creation, the run remains `queued`; repeat the exact POST with the **same ID**.
The DB hash rejects reuse of an ID for a different config, and Temporal rejects
reuse of an existing workflow ID. Terminal runs are never restarted by POST.
There is no background queued-run reconciler in this draft.

## Failure semantics (important)

Reads and status updates are retryable. Conversation creation/posting is not an
idempotent operation in the current API, so `launchEvalStep` has one attempt and
a DB compare-and-set claim. The conversation ID is saved before posting its first
message. If confirmation is lost, the stage fails visibly instead of automatically
creating another paid conversation. Some failures can leave an empty or running
conversation. Inspect the saved ID before deliberately launching a new eval.
This is at-most-once launch **attempt**, not an exactly-once external side-effect
guarantee. Completing that guarantee needs a recoverable/idempotent conversation
creation + initial-message primitive, not a retry flag.

A worker restart during polling resumes from Temporal history and the saved IDs.
A restart during an unconfirmed launch can require manual inspection. Completed
stages are not recreated on activity redelivery. Whole-parent retries are disabled
so a failed parent cannot silently recreate its child executions.

Cancellation is soft: already-started conversations continue to be observed until
completion/deadline, and no subsequent stage is launched after observing the
cancel flag. A launch already in progress may finish. Timeout similarly does not
stop a Dust agent. The status response preserves IDs for investigating in-flight
conversations and their costs. Use the API cancellation endpoint, not manual
Temporal termination, for normal operation. An operator-terminated parent/child
may need status reconciliation.

## Deliberate limitations / review gates

- No hard per-run credit budget or workspace-wide concurrent-run quota yet.
  Existing programmatic credit gates still apply through `postUserMessage`.
  Fan-out limits are not a monetary spend guarantee.
- `ownCostCredits` is only the root agent message cost available at observation.
  It can be null; it excludes sub-agent costs and may precede final accounting.
  Do not label a sum of this field as total billed cost. Add a backfill later.
- Input dataset/rubric/model-selection values are frozen, but agent instructions,
  tools, skills and knowledge are not version-pinned across the run. Capture and
  validate agent/config revisions before claiming reproducible comparisons.
- The pilot stores bounded answer bodies in Postgres. Decide artifact storage and
  retention before increasing these limits. Wire both new tables into workspace
  scrub/deletion and relocation before enablement; the FK prevents silently
  deleting a workspace while orphaning these rows.
- Access currently requires workspace admin. Fine-grained collaboration, comments,
  human ratings and a Frame are separate work, not features of this PR.
- Resolve infrastructure ownership and confirm the proposed flag owner before rollout.

## Rollout / validation checklist

1. Run repository formatting/typechecking, front + front-api test suites, worker
   bundling and migration/schema checks. The Computer did not have the repo's
   installed dependencies or Postgres/Temporal services.
2. Add/run real Temporal fault-injection coverage: kill a worker during polling;
   kill it before/after posting the first message; lose the start response; retry
   the same POST concurrently; cancel a queued and a partially finished run;
   revoke the execution key. Confirm no automatic duplicate paid launch.
3. Complete retention/deletion integration and decide budget/concurrency controls.
4. Apply the pre-deploy migration with the flag disabled.
5. Deploy front API and a dedicated `evals` worker, matching the existing worker
   image/build conventions. Registering the worker here does not provision it.
   Verify it polls `evals-v1` in the same namespace as the front API client.
6. Enable the flag only for an internal test workspace, using a capped dedicated
   admin API key, then run a tiny read-only smoke dataset. No production eval was
   launched while authoring this PR.
7. Build the Frame separately, enforcing viewer authorization in its server
   functions. Poll the progress endpoint, and fetch detailed answers on demand.

Rollback: disable the flag to stop new launches, allow already-created Dust
conversations to finish or cancel them separately, and drain/stop the worker.
Leave the additive tables in place until retention/cleanup is decided.
