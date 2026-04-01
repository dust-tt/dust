# Proposal: `user_steering` Agent Step Content Type

## Context

@conversation_structure.md

## Overview

Add a new `AgentContentItemType` subtype `user_steering` that injects user-provided steering
instructions into the agent's step content. The value is a simple string containing the steering
text.

This content type is unique: it is **visible to the model** (rendered in the conversation context)
but **invisible in the UI** (not shown to users as activity steps or in the side panel). It behaves
like an injected instruction at a specific step boundary.

**Key design constraint**: Steering must NOT be rendered as assistant content. It must be rendered
as **user-role content** across all providers. Tool outputs are treated as untrusted data by models,
so steering must go through the proper instructional channel for each provider.

## Type Definition

```typescript
export type AgentUserSteeringContentType = {
  type: "user_steering";
  value: {
    content: string; // The steering instruction text
    user: string; // User's display name (fullName || username), used as the `name`
                  // field on the emitted UserMessageTypeModel so that the model sees
                  // steering coherently with other user messages.
  };
};
```

The value is a struct (stored as JSONB) rather than a plain string, so that the emitted user
message can carry the real user name. This matches how `renderUserMessage()` sets
`name: m.context.fullName || m.context.username` (helpers.ts:345).

## Changes Required

### 1. Type System (`front/types/`)

**`front/types/assistant/agent_message_content.ts`**
- Add `AgentUserSteeringContentType` definition (after line 34)
- Add to `AgentContentItemType` union (line 36-40)
- Add `isAgentUserSteeringContent()` type guard (after line 64)

**`front/types/assistant/generation.ts`** (lines 63-78)
- `user_steering` must be **excluded** from assistant message `contents`, alongside
  `AgentErrorContentType`. The contents union in `AssistantFunctionCallMessageTypeModel` and
  `AssistantContentMessageTypeModel` should become:
  ```typescript
  contents: Array<Exclude<AgentContentItemType, AgentErrorContentType | AgentUserSteeringContentType>>;
  ```
  This ensures steering never leaks into assistant messages at the type level — it's handled
  separately at the step rendering layer.

**`front/types/assistant/conversation.ts`**
- `AgentMessageType.contents` uses `AgentContentItemType` — automatic inclusion (stored in DB,
  just not rendered as assistant content).

### 2. Database

**`front/lib/models/agent/agent_step_content.ts`** (line 61)
- Add `"user_steering"` to the `isIn` validation array:
  ```
  isIn: [["text_content", "reasoning", "function_call", "error", "user_steering"]]
  ```

**New migration** (e.g., `migration_NNN.sql`)
- Update the CHECK constraint on the `type` column:
  ```sql
  ALTER TABLE agent_step_contents
    DROP CONSTRAINT IF EXISTS agent_step_contents_type_check;
  ALTER TABLE agent_step_contents
    ADD CONSTRAINT agent_step_contents_type_check
    CHECK ("type" IN ('text_content', 'reasoning', 'function_call', 'error', 'user_steering'));
  ```

### 3. Conversation Rendering for Model — Step Layer

This is the most significant architectural change. Steering content is stored as step content but
must be rendered as a **separate user-role message** after the tool results for that step — NOT as
part of the assistant message.

#### Current step rendering pattern

For a step with actions, `renderAgentSteps()` currently produces:
```
assistant: { contents: [reasoning, function_call, text], function_calls: [...] }
function:  { tool result 1 }
function:  { tool result 2 }
```

#### New pattern with steering

```
assistant: { contents: [reasoning, function_call, text], function_calls: [...] }
function:  { tool result 1 }
function:  { tool result 2 }
user:      { steering text }    ← NEW
```

The steering message is emitted as a `UserMessageTypeModel` with the real user's name (from
`value.user`) after all tool results for the step. This makes the model see steering as
coming from the same person who initiated the conversation.

#### Files to change

**`front/lib/api/assistant/conversation_rendering/helpers.ts`** — `getSteps()` (line 109-244)

The `Step` type (line 38-44) needs a new field for steering content:
```typescript
export type Step = {
  contents: Exclude<AgentContentItemType, AgentErrorContentType | AgentUserSteeringContentType>[];
  actions: {
    call: FunctionCallType;
    result: FunctionMessageTypeModel;
  }[];
  steering: { content: string; user: string }[];  // ← NEW: extracted user_steering values
};
```

In the content processing loop (line 156-183), add handling before the default push:
```typescript
if (content.content.type === "user_steering") {
  stepByStepIndex[content.step].steering.push(content.content.value);
  continue;
}
```

Since `value` is now `{ content, user }`, the push captures both the text and the user name.

**`front/lib/api/assistant/conversation_rendering/message_rendering.ts`** — `renderAgentSteps()`
(line 36-125)

After emitting function results for each step (line 118-120), emit a user message for steering.
The message uses the real user name so the model sees steering as coming from the conversation
user (matching the `name` field of regular user messages):

```typescript
for (const { result } of step.actions) {
  messages.push(result);
}

// Emit steering as user message after tool results.
// Uses the real user name so the model sees it as coming from the same person.
if (step.steering.length > 0) {
  const steeringText = step.steering.map((s) => s.content).join("\n");
  const user = step.steering[0].user; // All steering in a step comes from the same user.
  messages.push({
    role: "user",
    name: user,
    content: [{ type: "text", text: steeringText }],
  } satisfies UserMessageTypeModel);
}
```

In the `excludeActions` branch (line 44-68), steering should still be emitted. Even when actions
are excluded (e.g. rendering other agents' past messages), the steering instructions remain
relevant context for the model to understand the conversation flow.

**`front/lib/api/assistant/conversation_rendering/index.ts`** — `countTokensForMessages()`
(line 290-368)

Since `user_steering` is excluded from assistant message `contents` via the type system, it won't
appear in the assistant content switch. The steering text is counted as part of the synthetic
`UserMessageTypeModel` via the `role === "user"` branch (line 303-314). **No change needed here.**

### 4. LLM Provider Conversions

Since steering is rendered as a `UserMessageTypeModel` at the step rendering layer, the provider
conversion functions already handle it correctly through their existing user message paths. However,
there are **provider-specific constraints** around message ordering that must be addressed.

#### Provider-by-provider analysis

**Anthropic** (`conversation_to_anthropic.ts`)
- `toMessage()` dispatches `role === "user"` → `userMessage()` (line 165-180)
- Produces `{ role: "user", content: [{ type: "text", text: "..." }] }`
- **Constraint**: Anthropic requires strictly alternating user/assistant turns. Function messages
  are already `role: "user"` (line 158-163), so adding another user message for steering creates
  consecutive user messages.
- **Solution**: Merge the steering text block into the same user message that contains the tool
  results:
  ```
  { role: "user", content: [tool_result_1, tool_result_2, { type: "text", text: "steering..." }] }
  ```

**Google** (`conversation_to_google.ts`)
- `toContent()` dispatches `role === "user"` (line 181-187)
- Function responses are also `role: "user"` (line 189-196). Same merging constraint as Anthropic.
- **Solution**: Merge steering `parts` into the preceding user Content that contains
  `functionResponse` parts.

**OpenAI — Responses API** (`openai_like/responses/conversation_to_openai.ts`)
- Used by: OpenAI models (o1, o3, gpt-4o, gpt-4-1, etc.) and XAI (grok)
- `toInput()` builds a flat `ResponseInput` array (line 130-160)
- Tool results are `function_call_output` items — NOT user messages. A user message can be freely
  interleaved anywhere in the input array.
- **No constraint**: Steering user message can appear directly after `function_call_output` items
  without any merging.
- **No change needed** — the existing `toUserInputMessage()` (line 107-114) handles it.

**OpenAI — Chat Completions API** (`openai_like/chat/conversation_to_openai.ts`)
- Used by: Fireworks models (deepseek-v3.2, kimi-k2, etc.)
- `toMessages()` builds a `ChatCompletionMessageParam[]` (line 114-141)
- Tool results are `role: "tool"` messages (line 101-112). A `role: "user"` message can appear
  after all tool messages for a step, but NOT interleaved between the assistant `tool_calls`
  message and its tool responses.
- **Constraint**: The Chat Completions API requires: `assistant(tool_calls) → tool → tool → ...`
  with no interruptions. Steering must go AFTER all tool messages for that step.
- **No change needed** — the step rendering layer already emits steering after all tool results,
  which is the correct position. `toUserMessage()` (line 41-48) handles the conversion.

**Mistral** (`conversation_to_mistral.ts`)
- `toMessage()` dispatches `role === "user"` (line 131-135)
- Tool results are `role: "tool"` (line 137-171). No consecutive-message issue.
- **No change needed**.

### 5. Consecutive User Message Merging (Anthropic & Google)

Both Anthropic and Google send tool results as `role: "user"` messages. Adding a steering user
message after tool results creates consecutive user messages, which these APIs don't allow.

**Recommended approach**: Handle merging at the **provider conversion call site**, since the
constraint is provider-specific. Two options:

**Option A — Merge in the conversion layer** (recommended):
- In the Anthropic message assembly, when a `user` message follows another `user` message,
  merge their content arrays into one `MessageParam`.
- In the Google message assembly, merge `parts` arrays of consecutive `user` Content objects.
- This is a general-purpose fix that handles any future cases of consecutive same-role messages.

**Option B — Merge at the step rendering layer**:
- Instead of emitting a separate `UserMessageTypeModel` for steering, emit a new model message
  type like `SteeringMessageTypeModel` with `role: "steering"`.
- Each provider conversion explicitly handles `role: "steering"` by merging into the preceding
  user/tool message (Anthropic/Google) or emitting standalone (OpenAI/Mistral).
- More explicit but requires a new model message type and changes to all provider conversions.

### 6. Frontend Rendering (what the user sees) — SKIP/IGNORE

The `user_steering` type should be **invisible** in the UI.

**`front/lib/api/assistant/activity_steps.ts`** — `contentsToActivitySteps()` (lines 49-94)
- Uses `isAgentReasoningContent`, `isAgentTextContent`, `isAgentFunctionCallContent` guards with
  `continue` — unmatched types are silently ignored.
- **No change needed** — `user_steering` will fall through without producing any activity step.

**`front/components/assistant/conversation/actions/AgentActionsPanel.tsx`** (lines 144-194)
- Same pattern: uses type guards — unmatched types are ignored.
- **No change needed**.

**`front/components/assistant/conversation/actions/PanelAgentStep.tsx`**
- Renders `ParsedContentItem` objects (kind: "reasoning" | "action"). Since `user_steering` never
  produces a `ParsedContentItem`, nothing to change.

**`front/components/assistant/conversation/actions/inline/InlineActivitySteps.tsx`**
- Renders `InlineActivityStep` objects (type: "thinking" | "action"). Since `user_steering` never
  produces an `InlineActivityStep`, nothing to change.

### 7. Resource Layer

**`front/lib/resources/agent_step_content_resource.ts`**
- `toJSON()` (lines 362-388): No special handling needed (default serialization works).
- `listFunctionCallsForAgent()`: Only filters for `function_call` — no change needed.

### 8. Backward Compatibility

**`front/lib/api/v1/backward_compatibility.ts`** — `getRawContents()` (line 136-154)
- Only extracts `text_content` — `user_steering` will be silently skipped. **No change needed.**

### 9. Event System & Streaming

**`front/types/assistant/agent.ts`** — `AgentStepContentEvent` (lines 410-420)
- Legacy/deprecated. No change needed — steering doesn't stream.

**`front/hooks/useAgentMessageStream.ts`**
- `user_steering` is stored via `createNewVersion()` in the temporal worker, then shows up in
  the completed message's `contents` array. No streaming hook changes needed.

## Summary of Files to Modify

| # | File | Change |
|---|------|--------|
| 1 | `front/types/assistant/agent_message_content.ts` | Add type + type guard |
| 2 | `front/types/assistant/generation.ts` | Exclude `AgentUserSteeringContentType` from assistant `contents` |
| 3 | `front/lib/models/agent/agent_step_content.ts` | Add to `isIn` validation |
| 4 | New migration SQL | Update CHECK constraint |
| 5 | `front/lib/api/assistant/conversation_rendering/helpers.ts` | Add `steering` field to `Step`, extract in `getSteps()` |
| 6 | `front/lib/api/assistant/conversation_rendering/message_rendering.ts` | Emit steering as `UserMessageTypeModel` after tool results |
| 7 | Anthropic conversion call site | Merge consecutive user messages (tool results + steering) |
| 8 | Google conversion call site | Merge consecutive user Content objects |

Files that need **no changes**:
- `front/lib/api/llm/utils/openai_like/responses/conversation_to_openai.ts` — user messages can be freely interleaved in the flat `ResponseInput` array
- `front/lib/api/llm/utils/openai_like/chat/conversation_to_openai.ts` — steering emitted after all tool messages, which is the correct position for Chat Completions API
- `front/lib/api/llm/clients/mistral/utils/conversation_to_mistral.ts` — tool results are `role: "tool"`, no conflict
- `front/lib/api/assistant/conversation_rendering/index.ts` — steering counted as user message tokens
- `front/lib/api/assistant/activity_steps.ts` — silently ignored
- `front/components/assistant/conversation/actions/AgentActionsPanel.tsx` — silently ignored
- `front/lib/api/v1/backward_compatibility.ts` — silently skipped
- `front/lib/resources/agent_step_content_resource.ts` — default serialization works

## Provider Constraint Summary

| Provider | API | Tool result role | Steering injection | Merging needed? |
|----------|-----|-----------------|-------------------|-----------------|
| Anthropic | Messages API | `user` (with `tool_result` block) | Text block in same user message | **Yes** — merge into tool result user message |
| Google | Gemini API | `user` (with `functionResponse` part) | Text part in same user Content | **Yes** — merge into tool result user Content |
| OpenAI | Responses API | `function_call_output` (standalone item) | Standalone `user` message | No — flat item list, freely interleaved |
| OpenAI (chat) | Chat Completions | `tool` | `user` message after all `tool` messages | No — but must be after entire tool block |
| Mistral | Chat Completions | `tool` | `user` message after `tool` messages | No |

## Open Questions

1. ~~**OpenAI role**~~ — **Resolved**: Steering uses `role: "user"` for all providers including
   OpenAI. This keeps the implementation simple (no special casing in conversion layers) and
   consistent across providers. If stronger authority is needed later, this can be revisited.

2. **Merging implementation**: Should consecutive user message merging be a general-purpose
   utility in the Anthropic/Google conversion layers (merge any consecutive same-role messages)?
   Or should it be specific to the steering case? The general-purpose approach is more robust
   but may have unintended side effects.

3. **Creation point**: Out of scope for this document. The creation logic (where/when
   `user_steering` content is injected in the agent loop) will be covered in a separate design
   doc.

4. ~~**Steering in `excludeActions` mode**~~ — **Resolved**: Steering messages are kept even in
   `excludeActions` mode. They remain relevant context for the model regardless of whether the
   full agentic loop is rendered.
