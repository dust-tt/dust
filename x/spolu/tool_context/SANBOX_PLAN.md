# Asynchronous sandbox function invocations

Move the outer sandbox function execution out of the HTTP request and into its own Temporal
workflow and activity.

## Current flow

```text
POST invocation
  -> create invocation
  -> await sandbox.exec()
      -> dsbx tool blocks for approval
  -> return invocation ID
```

The visualization cannot subscribe to the invocation event stream until the POST returns. If the
function calls a tool that requires approval, `dsbx` waits for the action while the UI waits for the
invocation ID, creating a deadlock.

## Target flow

```text
POST invocation
  -> create invocation
  -> launch sandbox function invocation workflow
  -> immediately return invocation ID

Invocation workflow/activity
  -> ensure sandbox
  -> run sandbox.exec()
  -> publish terminal result or error events
```

This follows the agent loop ownership model: HTTP creates durable state and launches Temporal,
while an activity owns the long-running execution.

## Interaction with PR #28829

PR #28829 remains responsible for resolving the inner tool approval:

1. The invocation activity waits inside `sandbox.exec()`.
2. `dsbx` creates a tool action and polls it.
3. The action becomes `blocked_validation_required` and emits an approval event.
4. The visualization already has the invocation ID, so its SSE subscription displays the approval
   card.
5. PR #28829 transitions the action to `running` and launches
   `runSandboxFunctionToolWorkflow`.
6. The tool completes, the `dsbx` poll returns, and the outer invocation activity continues.
7. The runner publishes the terminal invocation result.

## Implementation

- Add `runSandboxFunctionInvocationWorkflow`.
- Add `runSandboxFunctionInvocationActivity`.
- Add a deterministic workflow ID based on the workspace and invocation model ID.
- Add a launcher called after the POST endpoint creates the invocation.
- Split creating an invocation from executing an existing invocation.
- Configure the activity with `maximumAttempts: 1`, like other non-idempotent tool execution, to
  avoid duplicating function side effects.
- If workflow launch fails, publish an invocation error and transition the invocation to an error
  state so callers do not wait indefinitely.

## Follow-up

Initially, the invocation activity can remain blocked while the function waits for tool approval or
authentication. A follow-up can add invocation-level `execId` resume state, pause the sandbox, end
the activity when blocked, and relaunch after resolution. That would match the existing agent-loop
sandbox bash pause/resume behavior and avoid holding an activity during potentially long user waits.
