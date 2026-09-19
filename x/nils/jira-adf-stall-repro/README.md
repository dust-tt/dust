# Jira ADF validation stall — reproduction harness

Reproduces, end to end in a real Temporal worker, the failure where a Jira
`get_issues_using_jql` call blocks the worker's event loop for minutes, misses its
heartbeat, and fails the workflow — plus every other activity sharing that worker
process.

The cause is `ADFContentNodeSchema` in
`front/lib/api/actions/servers/jira/types.ts`: a 13-branch `z.union` in which three
branches declare `content: z.array(ADFContentNodeSchema)`. Zod object validation does
not stop at the first failing key, so a node whose `type` matches no early branch is
re-walked in full by every one of them — exactly `3^n` in the number of nested nodes.

Two properties are easy to get wrong:

- **No malformed data is required.** The document parses *successfully*. The trigger is
  only that a node's `type` is outside the explicit enums — `taskList`/`taskItem` are.
  Node types that *are* in the enums (`bulletList`/`listItem`) stay flat at ~5ms at any
  depth.
- **The Jira response is tiny and fast.** The fixture is ~2KB and served in under 10ms.
  Network and Jira latency are not involved.

## What it does

Nothing on the parse path is mocked. `searchJiraIssuesUsingJql` already takes `baseUrl`
as a parameter, so only the HTTP endpoint is redirected — no Jira OAuth, no interception,
no stubbing of `safeParse` or of the search function itself. The exercised path is the
real one:

```
stallWorkflow
  -> jiraSearchStallActivity
    -> searchJiraIssuesUsingJql        (real)
      -> jiraApiCall                   (real)
        -> JSON.parse(responseText)
        -> JiraSearchResultSchema.safeParse(rawData)   <- blocks here
```

| File | Role |
| --- | --- |
| `fixture.ts` | Builds the synthetic search response. Single-node-per-level nesting, so cost grows exactly 3x per level; `ISSUES` is a linear multiplier. 11 levels x 4 issues lands around 70-120s, clearing the 60s heartbeat with margin. |
| `fixture_server.ts` | Stands in for Jira on `127.0.0.1:7799`. Separate process, so you can see it answer instantly while the worker is wedged. |
| `activities.ts` | `jiraSearchStallActivity` calls the real search. `canaryHeartbeatActivity` is a harmless neighbour that heartbeats every 2s — its beat gaps are the cross-conversation evidence. |
| `workflows.ts` | Mirrors production tool-activity config: `heartbeatTimeout` 60s (`TOOL_ACTIVITY_HEARTBEAT_TIMEOUT_MS`), `maximumAttempts: 1`. |
| `worker.ts` | Dedicated worker on the isolated `adf-stall-repro` task queue, plus an event-loop lag probe independent of Temporal. |
| `run.ts` | Starts the canary, then the stall workflow, and reports both outcomes. |
| `history.ts` | Dumps Temporal history for the two workflows. **This is the authority for timeout timing** — see below. |

## Running it

Needs a local Temporal on `7233`. Run each in its own shell, from this directory:

```sh
../../../node_modules/.bin/tsx fixture_server.ts
../../../node_modules/.bin/tsx worker.ts
../../../node_modules/.bin/tsx run.ts
```

Then, with the workflow ids `run.ts` prints:

```sh
../../../node_modules/.bin/tsx history.ts adf-stall-<id> adf-canary-<id>
```

`worker.ts` logs an ENOENT for a prebuilt workflow bundle on startup and falls back to
runtime bundling. That is expected here and harmless.

Use a dedicated worker. This deliberately blocks a Node process for minutes and will
fail unrelated activities scheduled on the same one.

## Observed on `main` (before the fix)

```
[stall]     searchJiraIssuesUsingJql returned after 94020ms, isOk=true
[eventloop] LAG 93144ms
[canary]    beat #3 at +97977ms          <- previous beat was at +2002ms
[run]       stall workflow -> FAILED: WorkflowFailedError
```

Temporal history for the stall workflow:

```
#6  18:05:32  ACTIVITY_TASK_STARTED
#7  18:06:33  ACTIVITY_TASK_TIMED_OUT  timeoutType=4  "activity Heartbeat timeout"
#17 18:07:32  WORKFLOW_EXECUTION_FAILED "Activity task timed out"
```

Note `isOk=true`: the parse succeeds. And it returned at 18:07:32, **59 seconds after
the server had already timed the activity out** — so application-level error handling
only logs once the process unblocks, and reports misleading timing. Read timeouts out of
Temporal history, not out of app logs.

The canary is *always* blocked for the full duration — that is what the beat gap shows.
Whether Temporal also kills it varies between runs, depending on where the block falls
relative to its last recorded heartbeat: it failed with a heartbeat timeout in one run
and survived with a 95,975ms gap in another. Treat the gap, not the workflow outcome, as
the reliable signal.

## After the fix

With type-based dispatch (`z.discriminatedUnion` on `type` plus a non-recursive
catch-all), the same fixture and the same workflow:

```
[stall] searchJiraIssuesUsingJql returned after 31ms, isOk=true
[run]   stall workflow  -> RESOLVED: elapsed=31ms isOk=true
[run]   canary workflow -> RESOLVED: beats=90 maxGapMs=2004
```

No event-loop lag. To re-verify, check this directory out against a branch carrying the
fix and run the same three commands.

## What this does not establish

That any particular production incident's Jira response contained this structure.
Confirming that needs the original response captured and replayed through this same
setup.
