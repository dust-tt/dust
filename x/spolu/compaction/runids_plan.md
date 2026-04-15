# Plan: Store `runIds` on `CompactionMessage` like `AgentMessage`

## Context

`AgentMessageModel` stores `runIds` as backend-only metadata that links a message to one or more
Dust runs / LLM traces. These ids are then used to resolve run usage, analytics, and debugging
information.

`CompactionMessageModel` currently does not store any run ids, even though compaction is produced by
an LLM call and should be traceable in the same way.

## How `runIds` work on `AgentMessage`

### Storage model

`runIds` are stored on the subtype row, not on the generic `MessageModel` envelope.

- File: `front/lib/models/agent/conversation.ts`
- Field: `AgentMessageModel.runIds: string[] | null`
- DB type: `DataTypes.ARRAY(DataTypes.STRING)`
- Initial value: `null`

This is the right pattern for compaction too: store `runIds` on `CompactionMessageModel`, not on
`MessageModel`.

### Update semantics

`runIds` are persisted incrementally while the agent message is still running.

- The Temporal workflow accumulates in-memory `runIds`.
- Published events may carry `runIds`.
- `processEventForDatabase()` persists them as they arrive.
- The DB update atomically merges and deduplicates the array.

Current merge logic for agent messages:

```ts
await AgentMessageModel.update(
  {
    runIds: fn(
      "ARRAY",
      literal(
        `SELECT DISTINCT unnest(COALESCE("runIds", '{}') || ARRAY['${update.runIds.join("','")}']::text[])`
      )
    ),
  },
  { where }
);
```

### Ordering semantics

The array order is not trusted to be chronological.

When callers need the latest run, they resolve all runs by `dustRunId` and pick the newest one by
`createdAt`.

So if we mirror this design for compaction, we should preserve the same invariant: `runIds` are a
set-like bag of linked run ids, not an ordered timeline.

### API surface

`runIds` are not part of the normal serialized `AgentMessageType`. They are backend/debug metadata.
They are only fetched directly in special debugging paths such as poke.

We should follow the same approach for compaction initially.

## Current gap for `CompactionMessage`

`CompactionMessageModel` currently stores only:

- `status`
- `content`

The compaction workflow calls `runMultiActionsAgent(...)`, but the resulting LLM trace id is not
persisted on the compaction row.

## Proposed design

Mirror the `AgentMessage` pattern closely:

- Add `runIds: string[] | null` to `CompactionMessageModel`.
- Initialize it to `null` when the compaction message is created.
- Persist run ids while compaction is still in `status: "created"`.
- Use an atomic merge + dedupe update, matching agent messages.
- Keep `runIds` out of normal `CompactionMessageType` serialization for now.

This keeps the design consistent with existing message subtype behavior and avoids introducing a
special one-off compaction-specific pattern.

## Implementation plan

### - [x] 1. Add `runIds` to `CompactionMessageModel`

File:
- `front/lib/models/agent/conversation.ts`

Changes:
- Add `declare runIds: string[] | null;` to `CompactionMessageModel`.
- Add model field:

```ts
runIds: {
  type: DataTypes.ARRAY(DataTypes.STRING),
  allowNull: true,
},
```

Migration:
- Add nullable `runIds TEXT[]` column to `compaction_messages`.

Notes:
- No index is needed on `runIds`, matching `AgentMessageModel`.
- Lookup pattern remains: load message row, read `runIds`, resolve runs from `runs.dustRunId`.

### - [x] 2. Initialize compaction rows with `runIds: null`

File:
- `front/lib/api/assistant/conversation/messages.ts`

In `createCompactionMessage(...)`, create the subtype row with:

```ts
{
  status: "created",
  content: null,
  runIds: null,
  workspaceId: workspace.id,
}
```

This mirrors agent message initialization.

### - [ ] 3. Add a compaction metadata updater for `runIds`

Introduce a focused helper for non-terminal compaction metadata updates, similar in spirit to the
non-terminal branch of `updateAgentMessageDBAndMemory(...)`.

Suggested shape:

```ts
async function updateCompactionMessageRunIds(
  auth: Authenticator,
  {
    compactionMessage,
    runIds,
  }: {
    compactionMessage: CompactionMessageType;
    runIds: string[];
  }
): Promise<void>
```

Behavior:
- Update `CompactionMessageModel` directly.
- Use an atomic merge + dedupe SQL expression.
- No advisory lock required for this non-terminal metadata update.

Suggested merge logic:

```ts
await CompactionMessageModel.update(
  {
    runIds: fn(
      "ARRAY",
      literal(
        `SELECT DISTINCT unnest(COALESCE("runIds", '{}') || ARRAY['${runIds.join("','")}']::text[])`
      )
    ),
  },
  {
    where: {
      id: compactionMessage.compactionMessageId,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
  }
);
```

This preserves the same semantics as agent messages.

### - [ ] 4. Expose the LLM trace id from `runMultiActionsAgent`

File:
- `front/lib/api/assistant/call_llm.ts`

Today `runMultiActionsAgent(...)` has access to the `LLM` instance and therefore to
`llm.getTraceId()`, but it only returns `{ actions, generation }`.

Add an optional callback to `LLMOptions`:

```ts
export interface LLMOptions {
  tracingRecords?: Record<string, string>;
  context?: LLMTraceContext;
  onRunId?: (runId: string) => Promise<void> | void;
}
```

Then call it immediately after the `LLM` instance is created:

```ts
await options.onRunId?.(llm.getTraceId());
```

Why this shape:
- It exposes the run id early.
- It allows persistence even if the LLM call later fails.
- It matches the agent-message behavior where run ids are persisted while the message is still in a
  running state.

An alternative would be to change the return type to include `runId`, but that only exposes the id
at the end of the call and is therefore less aligned with the current agent pattern.

### - [ ] 5. Persist compaction run ids as soon as compaction starts the LLM call

File:
- `front/temporal/agent_loop/lib/compaction.ts`

Thread the current `compactionMessage` through to the code that performs the LLM call.

In `generateCompactionSummary(...)`, call `runMultiActionsAgent(...)` with `onRunId`, and in that
callback invoke `updateCompactionMessageRunIds(...)`.

Desired lifecycle:

1. `CompactionMessage` row is created with `status: "created"`, `content: null`, `runIds: null`.
2. Compaction workflow starts.
3. The LLM instance is created.
4. `onRunId(runId)` fires and persists the run id on the compaction row.
5. The summary succeeds or fails.
6. `updateCompactionMessageWithContentAndFinalStatus(...)` stores terminal status and content.

This gives us traceability even for failed compactions.

### - [ ] 6. Keep terminal status updates separate

File:
- `front/lib/api/assistant/conversation.ts`

`updateCompactionMessageWithContentAndFinalStatus(...)` should remain focused on terminal fields:

- `status`
- `content`

It does not need to own `runIds` updates if those were already persisted when the LLM call started.

This separation is good because it allows future retries or fallback attempts to append more run ids
without entangling terminal state logic.

### - [ ] 7. Do not expose `runIds` in `CompactionMessageType` yet

File:
- `front/types/assistant/conversation.ts`

Recommendation:
- Keep `CompactionMessageType` unchanged for now.
- Do not add `runIds` to the normal serialized conversation payload.

Rationale:
- `AgentMessageType` does not expose `runIds` either.
- `runIds` are operational metadata, not primary user-facing message content.
- Avoid API churn until there is a concrete client/debug consumer.

If needed later, expose `runIds` only through poke/debug tooling, mirroring the current agent
message approach.

## Tests

### - [ ] Model / DB tests

Add tests covering:
- [ ] compaction message starts with `runIds = null`
- [ ] merge from null: `null + [run1, run2] => [run1, run2]`
- [ ] dedupe: `[run1, run2] + [run2, run3] => [run1, run2, run3]`

### - [ ] Workflow / compaction tests

Add tests covering:
- [ ] successful compaction stores run id before terminal update
- [ ] failed compaction still preserves the run id
- [ ] repeated attempts append run ids without duplicates

## Optional follow-up

- [ ] Add `ConversationResource.getLatestCompactionMessageRun()` if we later need direct
  compaction run lookup.


If we later need to query compaction usage directly, add a helper similar to:

- `ConversationResource.getLatestAgentMessageRun()`

It should follow the same rule as agent messages:
- do not trust array ordering,
- resolve all runs by `dustRunId`,
- pick the latest by `createdAt`.

## Summary

The simplest and most consistent approach is to copy the existing `AgentMessage` pattern:

1. Store `runIds` on `CompactionMessageModel`.
2. Initialize them as `null`.
3. Merge + dedupe them atomically on updates.
4. Capture the LLM trace id early through `runMultiActionsAgent`.
5. Persist the run id while compaction is still running.
6. Keep `runIds` backend-only for now.

This gives compaction the same observability and run-tracking semantics as agent messages without
changing the user-facing conversation model.