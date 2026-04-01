# Conversation Message & Agent Step Data Model

## High-Level Structure

```
Conversation
  └── Message[]  (ordered by rank, versioned)
        ├── UserMessage       (type: "user_message")
        ├── AgentMessage      (type: "agent_message")
        └── ContentFragment   (type: "content_fragment")
```

`MessageModel` is the central hub — it holds `sId`, `version`, `rank`, `visibility`, `branchId`, and exactly one FK to `UserMessage`, `AgentMessage`, or `ContentFragment`.

## UserMessage

| Field | Type | Notes |
|-------|------|-------|
| content | string | Message text |
| mentions | MentionType[] | Agent/user mentions |
| user | UserType \| null | null for API calls |
| context | UserMessageContext | username, timezone, email, origin, profilePic |
| agenticMessageData | AgenticMessageData? | For agent handover scenarios |
| reactions | MessageReactionType[] | |

**Origin** can be: `web`, `slack`, `api`, `cli`, `email`, `gsheet`, `teams`, `extension`, `zapier`, `zendesk`, etc.

## AgentMessage

| Field | Type | Notes |
|-------|------|-------|
| status | `"created" \| "succeeded" \| "failed" \| "cancelled"` | |
| content | string \| null | Final generated text |
| chainOfThought | string \| null | Reasoning trace |
| configuration | LightAgentConfigurationType | Which agent ran |
| **contents** | `{step, content: AgentContentItemType}[]` | **Step-by-step generation** |
| **actions** | `AgentMCPActionWithOutputType[]` | **All tool calls** |
| error | GenericErrorContent \| null | |
| completedTs | number \| null | |
| completionDurationMs | number \| null | |
| modelInteractionDurationMs | number \| null | |
| parentMessageId | string | User message that triggered it |
| parentAgentMessageId | string \| null | For handovers |
| prunedContext | boolean? | Context was too large |
| skipToolsValidation | boolean | |

## Agent Step Contents (`AgentStepContentModel`)

Each agent message produces step-by-step content, tracked by `(step, index)`:

```typescript
AgentContentItemType =
  | { type: "text_content",    value: string }
  | { type: "reasoning",       value: { reasoning, tokens, provider, metadata } }
  | { type: "function_call",   value: { id, name, arguments (JSON), metadata } }
  | { type: "error",           value: { code, message, metadata } }
```

DB fields: `agentMessageId`, `step`, `index`, `version`, `type`, `value` (JSONB).

## Agent MCP Actions (`AgentMCPActionModel`)

Each tool call made by the agent:

| Field | Type | Notes |
|-------|------|-------|
| functionCallId | string | Unique call ID |
| functionCallName | string | Tool name |
| toolName | string | Tool name in MCP server |
| params | Record\<string, unknown\> | Input parameters |
| internalMCPServerName | string \| null | If built-in MCP server |
| mcpServerId | string \| null | External MCP server |
| step | number | Which generation step |
| status | ToolExecutionStatus | |
| executionDurationMs | number \| null | |
| citationsAllocated | number | |
| displayLabels | {running, done} \| null | UI labels |

**Output** stored in `AgentMCPActionOutputItemModel`:
- `content` (JSONB) — tool result
- `contentGcsPath` — large outputs in GCS
- `fileId` — generated file reference
- `citations` — citation data

## ContentFragment

Two subtypes:

**FileContentFragment** (`contentFragmentType: "file"`):
- `title`, `contentType` (MIME), `fileId`, `snippet`, `textUrl`, `textBytes`
- `generatedTables`, `sourceProvider`, `sourceIcon`

**ContentNodeContentFragment** (`contentFragmentType: "content_node"`):
- `nodeId`, `nodeDataSourceViewId`, `nodeType`, `contentNodeData`

Both share: `sId`, `version` ("latest" | "superseded"), `rank`, `visibility`, `expiredReason`.

## Relationship Diagram

```
Conversation (sId, title, visibility, depth, spaceId, triggerId)
  │
  ├─ 1:N ── Message (sId, rank, version, branchId, visibility)
  │            │
  │            ├─ 0:1 ── UserMessage
  │            │           └─ 0:1 → User
  │            │
  │            ├─ 0:1 ── AgentMessage (status, content, chainOfThought)
  │            │           │
  │            │           ├─ 1:N ── AgentStepContent (step, index, type, value)
  │            │           │           │
  │            │           │           └─ 0:N ── AgentMCPAction (toolName, params, status)
  │            │           │                       │
  │            │           │                       └─ 1:N ── AgentMCPActionOutputItem
  │            │           │                                   └─ 0:1 → FileModel
  │            │           │
  │            │           └─ 1:N ── Feedback
  │            │
  │            ├─ 0:1 ── ContentFragment
  │            │           └─ 0:1 → FileModel
  │            │
  │            ├─ 0:N ── MessageReaction (userId, reaction)
  │            │
  │            └─ 0:N ── Mention (agentConfigurationId | userId, status)
  │
  ├─ 0:1 → Space
  └─ 0:1 → Trigger
```

## Key Design Patterns

1. **Polymorphic messages** — `MessageModel` is a union table; exactly one of `userMessageId`/`agentMessageId`/`contentFragmentId` is non-null
2. **Step-indexed generation** — Agent output is tracked as `(step, index)` pairs in `AgentStepContent`, where each step can contain text, reasoning, function calls, or errors
3. **All tools are MCP actions** — There's a single `AgentMCPAction` model for all tool calls (both internal and external MCP servers)
4. **Versioning** — Messages support retries/edits via `version` field; content fragments have "latest"/"superseded"
5. **Branching** — `branchId` on messages supports conversation branching
6. **2D content array** — `ConversationType.content` is `MessageType[][]` where each inner array holds versions of the same message

## Key Files

| What | Path |
|------|------|
| Message types | `front/types/assistant/conversation.ts` |
| Step content types | `front/types/assistant/agent_message_content.ts` |
| Content fragment types | `front/types/content_fragment.ts` |
| MCP action types | `front/types/actions.ts` |
| DB models | `front/lib/models/agent/conversation.ts` |
| Step content model | `front/lib/models/agent/agent_step_content.ts` |
| MCP action model | `front/lib/models/agent/actions/mcp.ts` |
