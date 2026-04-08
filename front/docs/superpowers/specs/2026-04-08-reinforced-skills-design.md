# Reinforced Skills Design

## Overview

Reinforced Skills is a Temporal-based feature that analyzes recent conversations where skills were
used, scores and filters them for quality, generates improvement suggestions via LLM analysis, and
aggregates suggestions per-skill. It follows structural patterns from Reinforced Agents but differs
in key ways: no per-skill child workflow, conversation-centric discovery (not agent-centric), and
per-skill aggregation at the end.

## Architecture

### Workflow Structure

**Single workspace-level workflow** (`reinforcedSkillsWorkspaceWorkflow`):

1. Check if workspace has reinforcement enabled (reuse existing `reinforced_agents` flag)
2. Discover recent conversations that used at least one custom skill
3. Score and filter conversations using skill-specific signals
4. Analyze conversations in batches (each conversation analyzed once, covering all skills used)
5. Group resulting synthetic suggestions by skill
6. Run per-skill aggregation to consolidate suggestions into final pending suggestions
7. Finalize (notify editors, mark synthetic as approved)

**No per-skill child workflow.** Unlike Reinforced Agents (which spawns a child workflow per
agent), the workspace workflow handles everything directly. Per-skill aggregation is done as
concurrent activity calls within the workspace workflow.

**Optional skill scoping.** The workspace workflow accepts an optional `skillId` parameter. When
provided, only conversations that used that specific skill are fetched, and only suggestions for
that skill are aggregated. This enables running the process scoped to a single skill (from Poke or
CLI).

### Key Differences from Reinforced Agents

| Aspect | Reinforced Agents | Reinforced Skills |
|--------|------------------|-------------------|
| Discovery | Per-agent: find conversations for each agent | Per-workspace: find conversations that used any skill |
| Child workflows | One per agent | None |
| Analysis unit | One conversation, one agent | One conversation, all skills used in it |
| Aggregation | Per-agent (inside agent workflow) | Per-skill (in workspace workflow, after all analysis) |
| Scoring | Agent-level (feedback, staleness, etc.) | Conversation-level with skill-specific signals |
| Scoping | Run for one agent via agent workflow | Optional `skillId` param on workspace workflow |

## Conversation Discovery

Find recent conversations that used at least one custom skill by querying
`AgentMessageSkillModel` (which tracks skills actually used in agent messages, not just
available in conversation).

- Join with `ConversationModel` to filter by workspace and date range (lookback window)
- Filter to custom skills only (`customSkillId IS NOT NULL`) -- global skills are not
  user-editable and don't need reinforcement
- When `skillId` is provided, additionally filter to only conversations using that skill
- Return distinct conversation sIds along with the set of custom skill sIds used in each

## Conversation Scoring and Filtering

Score conversations using skill-specific signals to eliminate low-value ones from analysis.
Signals to consider:

- **User feedback**: Thumbs up/down on messages that used skills (from
  `AgentMessageFeedbackResource`, correlated via agent message IDs that have skill usage)
- **Skill usage frequency**: Number of times skills were invoked in the conversation
- **Distinct users**: Number of distinct users in conversations using skills (from Elasticsearch)
- **Tool errors**: Tool execution failures in messages where skills were active (indirect, since
  skills include tools that can fail)

Conversations below a minimum score threshold are excluded. The remaining are capped at a
configurable maximum (e.g., 300 total conversations per workspace run).

## Analysis Phase

Each conversation is analyzed once by the LLM. The analysis covers all skills used in that
conversation.

### Analysis Prompt

The LLM receives:
- System prompt explaining it should review skill usage and suggest improvements
- For each skill used: name, description, instructions, configured tools
- The shrink-wrapped conversation text (with feedback annotations)

### Terminal Tools (create suggestions)

- `suggest_skill_instruction_edits`: Suggests changes to a skill's instructions (maps to
  `edit_instructions` kind in `SkillSuggestionModel`)
- `suggest_skill_tools`: Suggests adding/removing tools from a skill (maps to `tools` kind --
  new, see below)

### Exploratory Tools (gather info, then retry)

- `get_available_tools`: Lists workspace tools available for skills
- Other info-gathering tools as needed

### Processing

- Terminal tool calls create `SkillSuggestionResource` records with `source: "synthetic"`
- Each suggestion is associated with its target skill via `skillConfigurationId`
- The `sourceConversationId` links back to the analyzed conversation
- Exploratory tool calls are executed and the LLM continues analysis

### Batch vs Streaming

Same pattern as Reinforced Agents:
- Batch mode: submit conversations to LLM batch API, poll for results, process
- Streaming mode: analyze conversations concurrently (configurable concurrency)
- Multi-step loop (max 4 steps) for tool execution cycles

## Per-Skill Aggregation

After all conversations are analyzed, synthetic suggestions are grouped by
`skillConfigurationId`. For each skill that has synthetic suggestions:

1. Load context: skill config, all synthetic suggestions, recent pending/rejected suggestions
2. Build aggregation prompt asking LLM to consolidate, rank by impact, keep top suggestions
3. Terminal tool calls create final suggestions with `source: "reinforcement"`
4. Finalize: notify skill editors, mark synthetic suggestions as approved

Aggregation runs concurrently across skills (configurable concurrency, e.g., 8).

## Skill Suggestion Types Update

Add a `"tools"` kind to `SKILL_SUGGESTION_KINDS`:

```typescript
// In types/suggestions/skill_suggestion.ts
export const SKILL_SUGGESTION_KINDS = ["create", "edit_instructions", "tools"] as const;

export const SkillToolsSuggestionSchema = z.object({
  action: z.enum(["add", "remove"]),
  toolId: z.string(),
});

export type SkillToolsSuggestionType = z.infer<typeof SkillToolsSuggestionSchema>;
```

Update `SkillSuggestionPayload`, `SkillSuggestionDataSchema`, and add `isSkillToolsSuggestion`
typeguard to match.

## File Structure

```
front/temporal/reinforced_skills/
  config.ts              # QUEUE_NAME = "reinforced-skills-queue-v1"
  workflows.ts           # reinforcedSkillsWorkspaceWorkflow
  activities.ts          # All activities
  client.ts              # Launch/stop cron, manual runs
  worker.ts              # Worker process
  admin/
    cli.ts               # CLI commands

front/lib/reinforced_skills/
  constants.ts           # Default lookback days, max conversations, etc.
  workspace_check.ts     # Reuse reinforced_agent's hasReinforcementEnabled
  selection.ts           # Conversation discovery + scoring
  signals.ts             # Fetch skill-specific signals
  analyze_conversation.ts  # Analysis prompts + batch map building
  aggregate_suggestions.ts # Aggregation prompts + context loading
  run_reinforced_analysis.ts # Shared LLM interaction, tool call processing
  format_skill_context.ts  # Format skill config for LLM prompt
  types.ts               # Type definitions
  utils.ts               # Shared helpers
```

## CLI Support

File: `front/temporal/reinforced_skills/admin/cli.ts`

Commands (mirroring Reinforced Agents):
- `start`: Launch crons for all flagged workspaces
- `stop`: Stop crons for all flagged workspaces
- `start-workspace --workspace-id <sId>`: Start cron for specific workspace
- `stop-workspace --workspace-id <sId>`: Stop cron for specific workspace
- `run-workspace --workspace-id <sId> [--batch] [--skill-id <sId>]`: One-off workspace run
  with optional skill scoping
- `run-skill --workspace-id <sId> --skill-id <sId> [--batch] [--days <n>]`: Shorthand for
  running scoped to a single skill

## Poke Support

### Rename Existing Agent Plugins

Rename the existing plugins to include "Agent" in their display names:

| Current Name | New Name |
|-------------|----------|
| "Start/Stop Reinforced Workflow" | "Start/Stop Reinforced Agents Workflow" |
| "Run Reinforced Workflow" | "Run Reinforced Agents Workflow" |
| "Run Reinforced Agent" | (unchanged, already has "Agent") |

### New Skill Plugins

**Workspace-level: Start/Stop Reinforced Skills Workflow**
- Plugin ID: `"reinforced-skills-workflow"`
- Actions: Start cron / Stop cron
- Calls `launchReinforcedSkillsWorkspaceCron` / `stopReinforcedSkillsWorkspaceCron`

**Workspace-level: Run Reinforced Skills Workflow**
- Plugin ID: `"run-reinforced-skills-workflow"`
- Args: `useBatchMode` (boolean)
- Calls `startReinforcedSkillsWorkspaceWorkflow`

**Skill-level: Run Reinforced Skill**
- Plugin ID: `"run-reinforced-skill"`
- Resource type: skills
- Args: `useBatchMode` (boolean), `conversationLookbackDays` (number),
  `disableNotifications` (boolean)
- Calls `startReinforcedSkillsWorkspaceWorkflow` with `skillId` set
- Only applicable to active custom skills

## Workflow Details

### Workspace Workflow Signature

```typescript
reinforcedSkillsWorkspaceWorkflow({
  workspaceId: string;
  useBatchMode: boolean;
  skipDelay?: boolean;       // true for manual runs
  skillId?: string;          // optional: scope to one skill
  conversationLookbackDays?: number;
  disableNotifications?: boolean;
})
```

### Activity List

- `isSkillReinforcementAllowedActivity`: Check feature flag + workspace opt-in
- `getRecentConversationsWithSkillsActivity`: Discover + score + filter conversations
- `analyzeConversationStepActivity`: Multi-step analysis of one conversation
- `startConversationAnalysisBatchActivity`: Batch mode analysis submission
- `checkBatchStatusActivity`: Poll batch status (can reuse from reinforced_agent)
- `processConversationAnalysisBatchResultActivity`: Process batch results
- `getSkillsWithSyntheticSuggestionsActivity`: List skills that have synthetic suggestions
- `aggregateSuggestionsForSkillStepActivity`: Multi-step aggregation for one skill
- `startAggregationBatchActivity`: Batch mode aggregation submission
- `processAggregationBatchResultActivity`: Process aggregation batch results
- `finalizeSkillAggregationActivity`: Notify editors, mark synthetic as approved

### Workflow Flow (Streaming Mode)

```
1. isSkillReinforcementAllowedActivity
2. getRecentConversationsWithSkillsActivity (returns conversation IDs)
3. For each conversation (concurrent, max 4):
     analyzeConversationStepActivity (multi-step loop, max 4 steps)
4. getSkillsWithSyntheticSuggestionsActivity (returns skill IDs)
5. For each skill (concurrent, max 8):
     aggregateSuggestionsForSkillStepActivity (multi-step loop, max 4 steps)
     finalizeSkillAggregationActivity
```

### Workflow Flow (Batch Mode)

```
1. isSkillReinforcementAllowedActivity
2. getRecentConversationsWithSkillsActivity (returns conversation IDs)
3. Multi-step batch loop (max 4 steps):
     startConversationAnalysisBatchActivity
     waitForBatch (poll with linear backoff)
     processConversationAnalysisBatchResultActivity
     Execute exploratory tools for continuations
4. getSkillsWithSyntheticSuggestionsActivity (returns skill IDs)
5. For each skill (concurrent, max 8):
     Multi-step batch loop (max 4 steps):
       startAggregationBatchActivity
       waitForBatch
       processAggregationBatchResultActivity
       Execute exploratory tools for continuations
     finalizeSkillAggregationActivity
```

## Reuse from Reinforced Agents

The following can be reused or shared:
- `hasReinforcementEnabled` (workspace check, same flag)
- `checkBatchStatusActivity` (same batch polling logic)
- `waitForBatch` helper (same pattern)
- `computeWorkspaceDelayMs` (same cron spreading logic)
- `getAuthForWorkspace` utility
- `runToolActivity` (from agent loop, for exploratory tool execution)
- `buildReinforcedSpecifications`, `getReinforcedLLM`, `getReinforcementDefaultOptions`
  (LLM setup)
- Batch LLM utilities (`sendBatchCallToLlm`, `downloadBatchResultFromLlm`, `storeLlmResult`)

## Feature Flag

Reuse the existing `reinforced_agents` feature flag. When this flag is enabled for a workspace,
both Reinforced Agents and Reinforced Skills are available.
