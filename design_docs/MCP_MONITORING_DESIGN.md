# MCP data monitoring

## Summary

Add a `monitor` trigger that polls a read-only MCP tool on a fixed cadence,
compares its normalized JSON result with the last accepted result, and runs its
agent only when the watched data changed.

An example monitor is: every hour, call Monday's `get_board_items` for board
123; watch each item's status and owner; when either changes, ask the agent to
summarize the change and take the configured follow-up action.

This is a trigger type, not a new source type. A monitor belongs to one agent
configuration, just as a schedule or webhook trigger does. That keeps the
first version easy to explain: the user configures what the agent should watch
and what it should do when it changes in one place.

## Goals

- Monitor a fixed, read-only MCP tool call using a workspace connection.
- Let users inspect the exact result that will be watched before enabling it.
- Establish the first successful result as a baseline without running the
  agent.
- Send the agent a compact, structured change event containing the before,
  after, and JSON diff.
- Make each check, change, failure, and resulting agent execution observable.
- Prevent duplicate agent runs when Temporal retries or a worker crashes.

## Non-goals

- Monitoring arbitrary remote MCP servers or personal MCP connections in v1.
- Running tools that can change external state.
- Semantic or LLM-generated diffs. The initial diff is deterministic JSON.
- Complex conditions such as thresholds, joins across tools, or a multi-step
  data pipeline.
- Reusing one monitor across several agents. A user can create equivalent
  monitors independently; shared monitors can follow if that proves useful.

## UX

### Entry point

The agent builder's **Add triggers** sheet gains a third choice:

| Choice | User-facing description |
| --- | --- |
| Schedule | Run this agent on a timetable. |
| Data monitor | Check connected data on a timetable and run this agent only when it changes. |
| Webhook | Run this agent when an external service pushes an event. |

`Data monitor` opens a dedicated multi-step sheet. It should not start with a
blank JSON editor. Most users know the data they care about, but they do not
know MCP tool names or result shapes before selecting a connection.

### Create-monitor flow

#### 1. Choose data

The first page lists workspace MCP connections that expose at least one
monitorable tool. A row shows the connection name, provider icon, and a short
example such as "Monday boards and items". Personal connections are omitted in
v1 because a monitor must keep working after its editor leaves the workspace.

After choosing a connection, show its allowed tools with their normal MCP
name, plain-language description, and a short result description. The picker
only includes tools explicitly marked monitorable by Dust. A `get_*` name is
not enough evidence that a tool has no side effects.

The tool form uses the tool's input schema. Required arguments are regular
controls, not a JSON textarea. For an ID field, offer a search selector when
the provider integration already has one; otherwise accept a stable ID and
show where it came from. Arguments are fixed after creation. Dynamic values
such as "today" make a poll non-repeatable and are out of scope for v1.

The primary button is **Preview data**. It calls the tool once and never
creates a monitor or starts the agent.

#### 2. Select what counts as a change

The preview page shows the fetched result in a collapsible JSON tree. The user
selects the fields to watch; the root is selected by default. A compact summary
above the tree states the choice in ordinary language, for example:

> Watch `items[*].name`, `items[*].status`, and `items[*].owner`.

The user can remove noisy fields such as `updated_at`, pagination cursors, or
request metadata. The UI must not silently discard fields. If Dust recognizes
a common volatile field, it can suggest excluding it and explain why.

Arrays need a separate decision because positional JSON diffs turn a newly
inserted item into a misleading rewrite of every later item. For an array of
objects, the page asks how to identify an item:

- **Use `id`** when the preview contains a unique scalar `id` field. This is
  preselected when valid.
- **Choose another field** from unique scalar fields in the sample.
- **Compare positions** for arrays where ordering is itself meaningful.

The preview renders a small example diff using the selected rules. It makes
the consequence of choosing `id` versus position visible before the monitor
exists. If no stable key is available, the warning should say that reordering
will count as a change; it should not guess.

The initial version supports a structural change rule only: run when the
selected projection differs. It deliberately does not offer a natural-language
condition field. A condition editor without an explainable preview would make
silent missed events and surprise runs too easy.

#### 3. Decide cadence and agent behavior

The cadence control offers **Every 15 minutes**, **Hourly** (default),
**Every 6 hours**, and **Daily**. Advanced cadence and values below 15 minutes
are deferred. The page shows an estimate of checks per day and a link to the
tool's rate-limit guidance when available.

The agent instruction is prefilled with:

> Review the monitored data change. Explain what changed, why it may matter,
> and take the actions you have been asked to take. Do not claim an external
> cause unless the current data shows it.

Users edit this instruction for the real task: alert a channel, update a
report, open a ticket, or simply summarize the difference. The run receives a
typed event payload in addition to this instruction, so users do not need to
teach the agent how to parse a raw tool response.

The final confirmation is explicit:

> The first check saves a baseline and does not run the agent. Later checks
> run the agent only when the selected data changes.

The button reads **Start monitoring**.

### Monitor details and history

The trigger card displays the provider, tool, cadence, watched field summary,
last checked time, and next check time. Its status is one of `Setting
baseline`, `Monitoring`, `Paused`, or `Needs attention`.

The details sheet has two tabs:

- **Configuration** contains the connection, fixed parameters, watched fields,
  cadence, and agent instruction. Editing tool parameters or watched fields
  requires confirmation that the next successful check will replace the
  baseline without running the agent. This prevents a configuration edit from
  generating a false change event.
- **Activity** lists baseline creation, unchanged checks, detected changes,
  failures, and agent-run outcomes. Unchanged checks are collapsed by day and
  expand on demand. A detected change opens a diff view, then links to the
  associated agent run.

Two manual actions are needed:

- **Check now** performs a normal check. If the data changed, it follows the
  same agent-run path as a scheduled check.
- **Refresh baseline** fetches data and replaces the baseline without running
  the agent. This is the recovery action after an expected bulk change.

After three consecutive failures, the monitor changes to `Needs attention` and
pauses further automatic checks. The details view preserves the provider error,
the last successful check, and a **Retry now** action. We should not keep
calling an expired credential or a broken tool indefinitely.

## Data model

Extend `TriggerKind` with `monitor`. Its configuration is immutable enough to
describe the monitor, but does not carry mutable execution state:

```ts
type MonitorConfig = {
  mcpServerViewId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  intervalMinutes: 15 | 60 | 360 | 1440;
  watch: {
    paths: string[];
    arrays: Array<{
      path: string;
      mode: "keyed" | "positional";
      keyPath?: string;
    }>;
  };
};
```

`MCPMonitorState` has one row per trigger: current baseline hash, current
baseline GCS key, latest check time, next check time, consecutive failure
count, and status. Baselines are stored in workspace-scoped GCS, following the
same access and retention controls as webhook request payloads.

`MCPMonitorRun` records every attempt: trigger ID, start and completion time,
status, normalized result hash and GCS key when available, error details, and
whether it produced a change. `MCPMonitorChange` records only changed results:
the old and new hashes, a GCS key for the structural diff, and the durable
agent-run identifier. These records power the Activity UI and make retries
safe.

Store a canonical normalized result, not only a hash. The agent needs the
before/after values for a useful explanation, and a user needs to inspect the
baseline when debugging a surprise change.

## Execution design

Each monitor owns a Temporal Schedule with a deterministic ID derived from its
trigger ID. The schedule uses overlap `SKIP`; one slow tool call must not pile
up concurrent checks. Creation enables the schedule only after the preview has
succeeded and the trigger transaction has committed. Pausing, resuming,
editing cadence, and deleting the trigger update or remove that schedule.

The scheduled workflow does this:

1. Load the trigger, state, workspace, and MCP server view. Exit if disabled
   or paused.
2. Execute the configured tool through a monitor-specific MCP executor.
3. Accept only structured JSON output. Normalize object key order, project the
   selected paths, and apply configured keyed-array ordering.
4. In one database transaction, lock the state row and compare the result hash
   with the baseline.
5. For the first success, write the baseline and a `baseline_created` run.
6. For an equal hash, record an unchanged run and clear consecutive failures.
7. For a new hash, write the new baseline, run record, and change record.
8. Start the existing agent-trigger workflow with a workflow ID derived from
   the change ID. A retry reaches the same ID and cannot create a second agent
   execution.

The transaction records the change before attempting to launch the agent. If
launching fails, the workflow retries the launch from the persisted change
record; it never re-polls or re-diffs to decide whether to fire again.

The agent payload has this shape:

```json
{
  "type": "mcp_monitor_change",
  "monitor": {
    "name": "Open Monday items",
    "provider": "monday",
    "tool": "get_board_items",
    "checkedAt": "2026-08-14T10:00:00.000Z"
  },
  "previous": { "items": [] },
  "current": { "items": [] },
  "changes": [
    { "op": "replace", "path": "/items/42/status", "before": "Working on it", "after": "Done" }
  ]
}
```

The UI uses the same diff representation. The agent therefore sees exactly
what the user inspected in Activity rather than an LLM-generated summary.

## MCP execution and authorization

v1 supports Dust internal MCP servers and workspace-scoped connection-backed
servers only. The executor receives the trigger's workspace authentication and
the selected server view, then invokes the registered tool through the same
authorization path used for an agent action. It does not reuse a human
session.

Tool authors must opt in with monitor metadata, initially an explicit
allowlist in server metadata. Eligibility requires all of the following:

- The tool is read-only by contract.
- Its inputs can be persisted as JSON.
- Its successful result can be converted to bounded JSON.
- It has a stable workspace connection and does not require an interactive
  approval step.

MCP's `readOnlyHint` is useful input, but Dust's allowlist is the enforcement
point. A misleading annotation must not give a scheduled process permission to
mutate a customer system.

Remote MCP monitoring, personal connections, and tools returning unbounded
text, files, or images remain disabled until we have a separate authorization,
output-size, and retention design.

## Limits and failure handling

- Tool result after normalization: 1 MB maximum. A larger result fails before
  a baseline is written and directs the user to watch a narrower field.
- Diff payload delivered to the agent: 100 KB maximum. If a change exceeds it,
  the agent receives the summary and a signed internal reference to inspect
  the full diff. The Activity view always retains the full allowed diff.
- Monitor runs use the provider's normal rate-limit path. v1 enforces one
  in-flight run per monitor and the selected minimum cadence.
- OAuth refresh failures, revoked connections, and missing MCP views count as
  failures. Three consecutive failures pause the monitor.
- A provider timeout is a failed check, never evidence that data changed.

## API and UI changes

- Add `monitor` to trigger types, validation, agent-builder serialization, and
  trigger cards.
- Add the monitor selection and three-step creation sheet to
  `TriggerViewsSheet`.
- Add APIs to preview a monitor tool call, create/update/pause/resume a
  monitor, refresh its baseline, and list runs and changes.
- Add a server-side monitor tool registry and executor. Do not expose it to
  the browser.
- Add Temporal monitor queue, workflow, activities, worker registration, and
  schedule client.
- Add state, run, and change persistence through a database migration.
- Extend the existing agent trigger launcher to accept a monitor change event.

## Rollout

1. Ship the data model, executor, and Temporal workflow behind a feature flag.
2. Enable one small set of internal tools, beginning with Monday board reads.
3. Dogfood with hourly monitors and inspect run volume, diff size, and false
   positives caused by volatile fields.
4. Add the agent-builder UI for flagged workspaces.
5. Expand the allowed-tool registry provider by provider after each tool has a
   useful preview, bounded JSON output, and stable workspace authorization.

## Open questions

- Which existing agent-trigger payload interface should carry monitor events,
  and can it retain a reference to a full diff without inflating the message?
- Do workspace connections remain usable when the original OAuth author leaves
  the workspace, or should monitor creation require an admin-owned connection?
- What retention period is appropriate for baselines and run payloads? The
  webhook request policy is the starting point, but monitor snapshots may be
  more sensitive and larger.
- Does Monday's existing tool output contain stable item IDs and bounded board
  pagination for the first monitorable tool? If not, add a monitoring-specific
  read tool rather than polling a broad export.
