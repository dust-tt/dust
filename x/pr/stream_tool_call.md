## Streaming tool call

Today, the conversation UI streams two phases well:

1. the model is thinking
2. the model is answering

But there is a missing middle phase:

3. the model has decided to call a tool and is in the process of generating that
   tool call

That missing phase is exactly why long tool calls, such as frame generation via
`create_interactive_content_file`, look stale. The model is doing work, but the
UI has nothing to show until the tool call is complete enough to become a real
action.

The global change adds one new intermediate event:

- `tool_call_started`

This event means: "the provider stream has revealed enough information to know
that the model is calling a specific tool, even though the tool action does not
exist yet."

After that:

- the agent loop republishes `tool_call_started` into the assistant SSE stream
- the frontend renders a pending state like `Preparing to call Create
Interactive Content File` ()
- later, when `tool_params` arrives, the pending state upgrades into the real
  running tool action
- later still, `agent_action_success` marks that action as done

Important: this does not change tool execution itself. It only exposes an
earlier moment in the same execution chain.

## End-to-End Flow

Changes affect 3 layers.

### 1. Provider Layer

Each provider exposes early tool-call information differently:

- OpenAI Responses / xAI Responses: the function-call item appears before the
  final arguments are complete
- Anthropic: `tool_use` starts before the input JSON is fully streamed
- Fireworks / OpenAI-chat: tool-call chunks can reveal the tool name before the
  full arguments are present

### 2. Normalized LLM Event Layer

All of those provider-specific signals get converted into one internal semantic
event:

- `tool_call_started`

Payload shape:

- tool name
- optional call id
- optional call index

This event is transient. It is not stored as final message content.

### 3. Assistant / UI Layer

The agent loop republishes `tool_call_started` as part of the assistant message
event stream.

The frontend then has three tool-related phases instead of two:

1. thinking
2. preparing to call tool
3. acting / tool running

The visible gap is therefore:

- before: `thinking -> nothing visible -> tool runs`
- after: `thinking -> preparing to call X -> tool runs`

## Implementation plan

### 1: Add Normalized `tool_call_started` Event (no-op everywhere)

Scope:

- add `tool_call_started` to the normalized LLM event union
- update switch consumers to safely ignore it
- keep persistence unchanged
- do not emit it from any provider yet
- do not expose it to assistant SSE or UI yet

Why:

- shared foundation for all later PRs
- deploys with no user-visible behavior change

### 2: OpenAI Responses Family Emits `tool_call_started`

Scope:

- `front/lib/api/llm/utils/openai_like/responses/openai_to_events.ts`
- responses fixtures / tests

Behavior:

- emit `tool_call_started` from `response.output_item.added` for function calls
- keep `tool_call_delta` and final `tool_call` behavior unchanged

Details:

- covers OpenAI Responses and xAI Responses through the shared adapter

### 3: Anthropic Emits `tool_call_started`

Scope:

- `front/lib/api/llm/clients/anthropic/utils/anthropic_to_events.ts`
- Anthropic fixtures / tests

Behavior:

- emit `tool_call_started` from `content_block_start` for `tool_use`
- keep `input_json_delta` as `tool_call_delta`
- keep final `tool_call` behavior unchanged

### 4: Fireworks / OpenAI-Chat Emits `tool_call_started`

Scope:

- `front/lib/api/llm/utils/openai_like/chat/openai_to_events.ts`
- chat adapter tests

Behavior:

- emit `tool_call_started` as soon as the tool name is known
- if the call id arrives later, emit the upgraded start event again so
  downstream can reconcile by index / id
- do not wait for the first arguments chunk
- keep final `tool_call` behavior unchanged

Important:

- the chat adapter should not wait for arguments before emitting the start (name is enough)

### 5: Publish Assistant SSE Event

Scope:

- `front/temporal/agent_loop/lib/get_output_from_llm.ts`
- assistant stream event types
- pubsub typing
- private swagger schema

Behavior:

- convert normalized `tool_call_started` into an assistant message SSE event
- backend starts sending the new event
- frontend accepts the event type but ignores it for rendering

Details:

- this is the backend/public-wire seam
- still deployable without a visible UI change

### 6: Main Conversation Message Shows `Preparing to call ...`

Scope:

- message temporary state
- `useAgentMessageStream`
- main conversation action / thinking card

Behavior:

- store pending tool calls when `tool_call_started` arrives
- remove only the matching pending tool call when `tool_params` or
  `agent_action_success` arrives
- render the pending state in the main message surface
- pending tool calls are removed per action, not by clearing the whole list

### 7: Inline Activity Timeline Shows Pending Tool Calls

Scope:

- inline activity timeline components

Behavior:

- render pending tool-call rows in the inline `Work` timeline
- reuse the reducer state from PR 6
- preserve current CoT flush behavior around the transition

### 8: Side Panel / Breakdown Shows Pending Tool Calls

Scope:

- actions side panel / current streaming step rendering

Behavior:

- show pending tool calls in the current streaming step
- reuse the reducer state from PR 6
- keep completed-step parsing unchanged
