# Reinforced Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Temporal-based Reinforced Skills feature that analyzes conversations using skills and generates improvement suggestions per-skill, following Reinforced Agents patterns.

**Architecture:** Workspace-level Temporal workflow discovers recent conversations that used custom skills, scores/filters them, analyzes each via LLM (covering all skills used), groups suggestions by skill, runs per-skill aggregation, and finalizes. No per-skill child workflows. Optional `skillId` param scopes to one skill.

**Tech Stack:** TypeScript, Temporal, Sequelize, Zod, Next.js API routes

---

### Task 1: Add `tools` suggestion kind to skill suggestion types

**Files:**
- Modify: `front/types/suggestions/skill_suggestion.ts`

- [ ] **Step 1: Add the tools kind and schema**

In `front/types/suggestions/skill_suggestion.ts`, add `"tools"` to `SKILL_SUGGESTION_KINDS`, add the schema, typeguard, and update the discriminated union:

```typescript
export const SKILL_SUGGESTION_KINDS = [
  "create",
  "edit_instructions",
  "tools",
] as const;

// After SkillEditInstructionsSuggestionSchema, add:
export const SkillToolsSuggestionSchema = z.object({
  action: z.enum(["add", "remove"]),
  toolId: z.string(),
});

export type SkillToolsSuggestionType = z.infer<
  typeof SkillToolsSuggestionSchema
>;

export function isSkillToolsSuggestion(
  data: unknown
): data is SkillToolsSuggestionType {
  return SkillToolsSuggestionSchema.safeParse(data).success;
}
```

Update `SkillSuggestionPayload` to include the new type:

```typescript
export type SkillSuggestionPayload =
  | SkillCreateSuggestionType
  | SkillEditInstructionsSuggestionType
  | SkillToolsSuggestionType;
```

Update `SkillSuggestionDataSchema` to include the new variant:

```typescript
export const SkillSuggestionDataSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("create"),
    suggestion: SkillCreateSuggestionSchema,
  }),
  z.object({
    kind: z.literal("edit_instructions"),
    suggestion: SkillEditInstructionsSuggestionSchema,
  }),
  z.object({
    kind: z.literal("tools"),
    suggestion: SkillToolsSuggestionSchema,
  }),
]);
```

- [ ] **Step 2: Verify types compile**

Run: `cd /Users/davidebbo/repos/dust/front && npx tsgo --noEmit 2>&1 | head -30`
Expected: No errors related to skill_suggestion types.

- [ ] **Step 3: Commit**

```bash
git add front/types/suggestions/skill_suggestion.ts
git commit -m "feat: add tools suggestion kind to skill suggestions"
```

---

### Task 2: Rename existing Poke agent plugins

**Files:**
- Modify: `front/lib/api/poke/plugins/workspaces/reinforced_agent_workflow.ts`
- Modify: `front/lib/api/poke/plugins/workspaces/run_reinforced_agent_workflow.ts`

- [ ] **Step 1: Update reinforced_agent_workflow.ts name**

In `front/lib/api/poke/plugins/workspaces/reinforced_agent_workflow.ts`, change the `name` field:

```typescript
// OLD
name: "Start/Stop Reinforced Workflow",
// NEW
name: "Start/Stop Reinforced Agents Workflow",
```

- [ ] **Step 2: Update run_reinforced_agent_workflow.ts name**

In `front/lib/api/poke/plugins/workspaces/run_reinforced_agent_workflow.ts`, change the `name` field:

```typescript
// OLD
name: "Run Reinforced Workflow",
// NEW
name: "Run Reinforced Agents Workflow",
```

- [ ] **Step 3: Verify types compile**

Run: `cd /Users/davidebbo/repos/dust/front && npx tsgo --noEmit 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add front/lib/api/poke/plugins/workspaces/reinforced_agent_workflow.ts front/lib/api/poke/plugins/workspaces/run_reinforced_agent_workflow.ts
git commit -m "refactor: rename Poke agent reinforcement plugins to include 'Agents'"
```

---

### Task 3: Create reinforced_skills constants, types, and config

**Files:**
- Create: `front/lib/reinforced_skills/constants.ts`
- Create: `front/lib/reinforced_skills/types.ts`
- Create: `front/temporal/reinforced_skills/config.ts`

- [ ] **Step 1: Create constants.ts**

Create `front/lib/reinforced_skills/constants.ts`:

```typescript
/**
 * Shared defaults for reinforced skills workflow.
 */

// Max conversations to analyze per workspace run.
export const DEFAULT_MAX_CONVERSATIONS_PER_RUN = 300;

// Default lookback window (days) for conversation discovery.
export const DEFAULT_REINFORCEMENT_LOOKBACK_WINDOW_DAYS = 1;

// Max number of steps in a multi-step analysis or aggregation loop.
export const MAX_REINFORCED_ANALYSIS_STEPS = 4;

// Maximum concurrent conversation analyses (streaming mode).
export const CONVERSATION_ANALYSIS_CONCURRENCY = 4;

// Maximum concurrent per-skill aggregations.
export const SKILL_AGGREGATION_CONCURRENCY = 8;
```

- [ ] **Step 2: Create types.ts**

Create `front/lib/reinforced_skills/types.ts`:

```typescript
import type { ToolCallEvent } from "@app/lib/api/llm/types/events";
import { z } from "zod";

// Terminal tools create skill suggestions.
export type SkillTerminalToolName =
  | "suggest_skill_instruction_edits"
  | "suggest_skill_tools";

// Exploratory tools gather info before suggesting.
export type SkillExploratoryToolName = "get_available_tools";

export const SKILL_TERMINAL_TOOLS: SkillTerminalToolName[] = [
  "suggest_skill_instruction_edits",
  "suggest_skill_tools",
];

export const SKILL_EXPLORATORY_TOOLS: SkillExploratoryToolName[] = [
  "get_available_tools",
];

export const ALL_SKILL_TOOLS = [
  ...SKILL_TERMINAL_TOOLS,
  ...SKILL_EXPLORATORY_TOOLS,
];

const TERMINAL_TOOL_SET: ReadonlySet<string> = new Set(SKILL_TERMINAL_TOOLS);
const EXPLORATORY_TOOL_SET: ReadonlySet<string> = new Set(
  SKILL_EXPLORATORY_TOOLS
);

export function isSkillTerminalToolName(
  name: string
): name is SkillTerminalToolName {
  return TERMINAL_TOOL_SET.has(name);
}

export function isSkillExploratoryToolName(
  name: string
): name is SkillExploratoryToolName {
  return EXPLORATORY_TOOL_SET.has(name);
}

export const SKILL_TOOL_SCHEMAS: Record<
  SkillTerminalToolName,
  z.ZodObject<z.ZodRawShape>
> = {
  suggest_skill_instruction_edits: z.object({
    suggestions: z.array(
      z.object({
        skillId: z.string().describe("The sId of the skill to edit."),
        instructions: z
          .string()
          .describe("Full replacement text for the skill instructions."),
        analysis: z
          .string()
          .describe("Explanation of why this change improves the skill."),
      })
    ),
  }),
  suggest_skill_tools: z.object({
    suggestions: z.array(
      z.object({
        skillId: z.string().describe("The sId of the skill to edit."),
        action: z.enum(["add", "remove"]),
        toolId: z.string().describe("The sId of the tool to add or remove."),
        analysis: z
          .string()
          .describe("Explanation of why this tool change improves the skill."),
      })
    ),
  }),
};

export interface SkillTerminalToolCallEvent extends ToolCallEvent {
  content: ToolCallEvent["content"] & { name: SkillTerminalToolName };
}

export interface SkillExploratoryToolCallInfo {
  id: string;
  name: SkillExploratoryToolName;
  arguments: Record<string, unknown>;
}

export interface SkillTerminalToolCallInfo {
  id: string;
  name: SkillTerminalToolName;
  arguments: Record<string, unknown>;
}

export type SkillReinforcedToolCallInfo =
  | SkillExploratoryToolCallInfo
  | SkillTerminalToolCallInfo;

export interface SkillTerminalToolCallSuccess {
  toolCall: SkillTerminalToolCallInfo;
  message: string;
}

export interface SkillTerminalToolCallFailure {
  toolCall: SkillTerminalToolCallInfo;
  errorMessage: string;
}

export interface ProcessSkillReinforcedEventsResult {
  suggestionsCreated: number;
  successfulToolCalls: SkillTerminalToolCallSuccess[];
  failedToolCalls: SkillTerminalToolCallFailure[];
}

export type ReinforcedSkillsOperationType =
  | "reinforced_skills_analyze_conversation"
  | "reinforced_skills_aggregate_suggestions";

export const REINFORCEMENT_SKILLS_METADATA_KEYS = {
  reinforcedSkills: "reinforcedSkills",
  reinforcedOperationType: "reinforcedOperationType",
  reinforcedSkillId: "reinforcedSkillId",
} as const;

export function getReinforcedSkillsMetadata(
  reinforcedOperationType: ReinforcedSkillsOperationType,
  contextId: string
) {
  return {
    [REINFORCEMENT_SKILLS_METADATA_KEYS.reinforcedSkills]: true,
    [REINFORCEMENT_SKILLS_METADATA_KEYS.reinforcedOperationType]:
      reinforcedOperationType,
    [REINFORCEMENT_SKILLS_METADATA_KEYS.reinforcedSkillId]: contextId,
  };
}
```

- [ ] **Step 3: Create temporal config**

Create `front/temporal/reinforced_skills/config.ts`:

```typescript
const QUEUE_VERSION = 1;
export const QUEUE_NAME = `reinforced-skills-queue-v${QUEUE_VERSION}`;
```

- [ ] **Step 4: Verify types compile**

Run: `cd /Users/davidebbo/repos/dust/front && npx tsgo --noEmit 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add front/lib/reinforced_skills/constants.ts front/lib/reinforced_skills/types.ts front/temporal/reinforced_skills/config.ts
git commit -m "feat: add reinforced skills constants, types, and temporal config"
```

---

### Task 4: Create conversation discovery and scoring

**Files:**
- Create: `front/lib/reinforced_skills/selection.ts`
- Create: `front/lib/reinforced_skills/utils.ts`

- [ ] **Step 1: Create utils.ts**

Create `front/lib/reinforced_skills/utils.ts`:

```typescript
import { Authenticator } from "@app/lib/auth";

/**
 * Get an admin authenticator for the given workspace.
 */
export async function getAuthForWorkspace(
  workspaceId: string
): Promise<Authenticator> {
  return Authenticator.internalAdminForWorkspace(workspaceId);
}
```

- [ ] **Step 2: Create selection.ts**

Create `front/lib/reinforced_skills/selection.ts`. This module discovers recent conversations that used custom skills, scored by feedback and usage signals.

```typescript
import type { Authenticator } from "@app/lib/auth";
import { AgentMessageSkillModel } from "@app/lib/models/skill/conversation_skill";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import { AgentMessageFeedbackModel } from "@app/lib/models/agent/agent_message_feedback";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { DEFAULT_MAX_CONVERSATIONS_PER_RUN } from "@app/lib/reinforced_skills/constants";
import logger from "@app/logger/logger";
import { Op } from "sequelize";

export interface ConversationWithSkills {
  conversationSId: string;
  skillSIds: string[];
}

/**
 * Discover recent conversations that used custom skills.
 * Returns conversation sIds with their associated skill sIds.
 *
 * When `skillId` is provided, only returns conversations that used that specific skill.
 */
export async function getRecentConversationsWithSkills(
  auth: Authenticator,
  {
    lookbackDays,
    maxConversations = DEFAULT_MAX_CONVERSATIONS_PER_RUN,
    skillId,
  }: {
    lookbackDays: number;
    maxConversations?: number;
    skillId?: string;
  }
): Promise<ConversationWithSkills[]> {
  const owner = auth.getNonNullableWorkspace();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

  // Find agent messages that used custom skills, with conversation and skill info.
  const whereClause: Record<string, unknown> = {
    workspaceId: owner.id,
    customSkillId: { [Op.ne]: null },
  };

  const messageSkills = await AgentMessageSkillModel.findAll({
    where: whereClause,
    include: [
      {
        model: ConversationModel,
        as: "conversation",
        required: true,
        where: {
          workspaceId: owner.id,
          createdAt: { [Op.gte]: cutoffDate },
          visibility: { [Op.ne]: "test" },
        },
        attributes: ["id", "sId"],
      },
    ],
    attributes: ["conversationId", "customSkillId"],
  });

  if (messageSkills.length === 0) {
    return [];
  }

  // Get skill sIds from the skill configuration model.
  const customSkillIds = [
    ...new Set(
      messageSkills
        .map((ms) => ms.customSkillId)
        .filter((id): id is number => id !== null)
    ),
  ];

  const { SkillConfigurationModel } = await import(
    "@app/lib/models/skill"
  );
  const skills = await SkillConfigurationModel.findAll({
    where: {
      id: customSkillIds,
      status: "active",
    },
    attributes: ["id", "sId"],
  });
  const skillSIdByModelId = new Map(skills.map((s) => [s.id, s.sId]));

  // If filtering by skillId, find the model ID and restrict.
  let targetSkillModelId: number | null = null;
  if (skillId) {
    const matchingSkill = skills.find((s) => s.sId === skillId);
    if (!matchingSkill) {
      logger.warn(
        { skillId, workspaceId: owner.sId },
        "ReinforcedSkills: target skill not found or not active"
      );
      return [];
    }
    targetSkillModelId = matchingSkill.id;
  }

  // Group by conversation, collecting skill sIds.
  const conversationMap = new Map<
    string,
    { conversationSId: string; skillSIds: Set<string> }
  >();

  for (const ms of messageSkills) {
    const conv = ms.conversation;
    if (!conv || !ms.customSkillId) {
      continue;
    }
    const skillSId = skillSIdByModelId.get(ms.customSkillId);
    if (!skillSId) {
      continue;
    }
    if (targetSkillModelId !== null && ms.customSkillId !== targetSkillModelId) {
      continue;
    }

    const key = conv.sId;
    if (!conversationMap.has(key)) {
      conversationMap.set(key, {
        conversationSId: conv.sId,
        skillSIds: new Set(),
      });
    }
    conversationMap.get(key)!.skillSIds.add(skillSId);
  }

  // Convert to array, capped at maxConversations.
  // TODO: Add scoring/ranking logic here to prioritize conversations with feedback.
  const results: ConversationWithSkills[] = [];
  for (const entry of conversationMap.values()) {
    results.push({
      conversationSId: entry.conversationSId,
      skillSIds: [...entry.skillSIds],
    });
    if (results.length >= maxConversations) {
      break;
    }
  }

  logger.info(
    {
      workspaceId: owner.sId,
      conversationCount: results.length,
      totalSkillUsages: messageSkills.length,
      skillId: skillId ?? "all",
    },
    "ReinforcedSkills: discovered conversations with skill usage"
  );

  return results;
}
```

- [ ] **Step 3: Verify types compile**

Run: `cd /Users/davidebbo/repos/dust/front && npx tsgo --noEmit 2>&1 | head -30`
Expected: No errors. (May need to adjust imports based on actual model exports.)

- [ ] **Step 4: Commit**

```bash
git add front/lib/reinforced_skills/selection.ts front/lib/reinforced_skills/utils.ts
git commit -m "feat: add conversation discovery and selection for reinforced skills"
```

---

### Task 5: Create skill context formatting and analysis prompts

**Files:**
- Create: `front/lib/reinforced_skills/format_skill_context.ts`
- Create: `front/lib/reinforced_skills/analyze_conversation.ts`

- [ ] **Step 1: Create format_skill_context.ts**

Create `front/lib/reinforced_skills/format_skill_context.ts`:

```typescript
import type { SkillType } from "@app/types/assistant/skill_configuration";

/**
 * Format skill configuration details for the LLM analysis prompt.
 */
export function formatSkillContext(skill: SkillType): string {
  const sections: string[] = [];

  sections.push(`### Skill: ${skill.name} (ID: ${skill.sId})`);

  if (skill.agentFacingDescription) {
    sections.push(`Description: ${skill.agentFacingDescription}`);
  }

  if (skill.instructions) {
    sections.push(`#### Current instructions\n${skill.instructions}`);
  }

  if (skill.tools.length > 0) {
    const toolLines = skill.tools
      .map((t) => `- ${t.name} (ID: ${t.sId})`)
      .join("\n");
    sections.push(
      `#### Configured tools\n${skill.tools.length} tools configured.\n\n${toolLines}`
    );
  }

  return sections.join("\n");
}

/**
 * Format multiple skills for the LLM analysis prompt.
 */
export function formatSkillsContext(skills: SkillType[]): string {
  return skills.map(formatSkillContext).join("\n\n");
}
```

- [ ] **Step 2: Create analyze_conversation.ts**

Create `front/lib/reinforced_skills/analyze_conversation.ts`:

```typescript
import { getShrinkWrappedConversation } from "@app/lib/api/assistant/conversation/shrink_wrap";
import type { LLMStreamParameters } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { formatSkillsContext } from "@app/lib/reinforced_skills/format_skill_context";
import { buildReinforcedSkillsLLMParams } from "@app/lib/reinforced_skills/run_reinforced_analysis";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import logger from "@app/logger/logger";
import type { SkillType } from "@app/types/assistant/skill_configuration";

const ANALYSIS_ASSEMBLY_ORDER = [
  "primary",
  "analysis_workflow",
  "conversation_analysis",
  "instructions_guidance",
  "tools_guidance",
] as const;

type SectionKey = (typeof ANALYSIS_ASSEMBLY_ORDER)[number];

export const REINFORCED_SKILLS_ANALYSIS_SECTIONS: Record<SectionKey, string> = {
  primary: `You are an AI skill improvement analyst. Your job is to analyze a conversation where skills were used and suggest concrete improvements to those skills' configurations.

You have access to tools to suggest instruction edits and tool changes for skills.

You MUST follow <analysis_workflow>. These steps are entirely focused on identifying potential skill improvements and calling the suggestion tools as an end result.
In most conversations, the correct outcome is no configuration change: the thread does not surface a clear, high-value gap in how the skills are set up.
Propose configuration changes only when <conversation_analysis> yields concrete evidence. If you are unsure, return an empty suggestions array.`,

  analysis_workflow: `Follow this process for every conversation you analyze:

Step 1: Review the <skill_context> from the user message to understand the intent of each skill configuration.

Step 2: Analyze the conversation and identify improvement areas for the skill configurations.
The conversation is in <conversation>. See <conversation_analysis> for guidance on how to analyze the conversation.

Step 3: Build a plan. Based on the identified areas of improvement, determine specific suggestions to modify the skill configurations. Dimensions you MUST consider:
- Review instructions to determine if the skill is meeting its purpose and properly guiding the agent: <instructions_guidance>.
- If the skill references or requires external actions or knowledge, then tools may need to be added or removed. See <tools_guidance>.

You can NOT suggest other types of skill configuration changes. Only suggest instructions and tools.

Step 4: For each suggestion, you MUST include an "analysis" field explaining why this change would improve the skill.
This MUST include the signal that was discovered in <conversation_analysis> that led to the suggestion.
Subsequently, an aggregation workflow will use this analysis to determine which suggestions are most impactful.

Step 5: Make suggestions using the suggest_skill_instruction_edits and suggest_skill_tools tools.
ONLY make suggestions that will affect agent behavior. NEVER suggest cosmetic-only fixes.`,

  conversation_analysis: `ALWAYS inspect the full conversation, which is a chronological timeline of messages. Each message has an index, sId, sender (user or agent name), actions, and content. Here are key signals for potential skill improvements in order of importance:

1. If the user provided feedback, it will be included with each message in the form of thumbs up/down and comments.
This is the MOST important signal as it is directly provided by the user and an explicit signal.

2. User response to an agent message. Any user indication of confusion, disagreement, or correction related to skill-driven behavior is a signal that the skill needs improvement.

3. Look for tool calls within skill execution that indicate the agent is unsure how to perform an action or receiving unexpected results. Skills include tools, and those tools can fail or produce suboptimal results due to skill instruction gaps.

4. Missing capabilities the skill should have. Call get_available_tools to discover what tools are available in the workspace. Determine if adding or removing tools from the skill would improve outcomes.

A key consideration is that conversations can be user-specific, but skills are usually shared across agents. You MUST ensure that the suggestions are useful for all users of agents that use these skills.`,

  instructions_guidance: `When suggesting instruction changes:
- The instructions should be clear, specific, and actionable.
- Provide the FULL replacement text for the skill instructions, not just a diff.
- Preserve the existing goal and scope of the skill while addressing the identified gaps.
- Do not fundamentally change the purpose of the skill.
- Focus on gaps that caused tool failures, user confusion, or suboptimal outcomes in the conversation.`,

  tools_guidance: `When suggesting tool changes:
- Only suggest adding tools that exist in the workspace (use get_available_tools to discover them).
- Only suggest removing tools that are currently configured on the skill.
- Ensure the tool change is clearly aligned with the skill's purpose.
- Adding a tool should address a clear capability gap observed in the conversation.
- Removing a tool should address confusion or misuse observed in the conversation.`,
};

export function buildSkillAnalysisSystemPrompt(): string {
  return ANALYSIS_ASSEMBLY_ORDER.map((key) => {
    const body = REINFORCED_SKILLS_ANALYSIS_SECTIONS[key].trim();
    return `<${key}>\n${body}\n</${key}>`;
  }).join("\n\n");
}

export function buildSkillAnalysisPrompt(
  conversationText: string,
  skills: SkillType[]
): { systemPrompt: string; userMessage: string } {
  const systemPrompt = buildSkillAnalysisSystemPrompt();

  const userMessage = `<skill_context>
## Skills used in this conversation

${formatSkillsContext(skills)}
</skill_context>

<conversation>
${conversationText}
</conversation>
`;

  return { systemPrompt, userMessage };
}

/**
 * Build the batch map for conversation analysis.
 * Returns null if no valid conversations could be prepared.
 */
export async function buildSkillConversationAnalysisBatchMap(
  auth: Authenticator,
  conversationsWithSkills: Array<{
    conversationSId: string;
    skillSIds: string[];
  }>
): Promise<Map<string, LLMStreamParameters> | null> {
  const batchMap = new Map<string, LLMStreamParameters>();

  for (const { conversationSId, skillSIds } of conversationsWithSkills) {
    const conversationRes = await getShrinkWrappedConversation(auth, {
      conversationId: conversationSId,
      includeFeedback: true,
      includeActionDetails: true,
    });
    if (conversationRes.isErr()) {
      logger.warn(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          conversationId: conversationSId,
          error: conversationRes.error,
        },
        "ReinforcedSkills: conversation not found, skipping in batch"
      );
      continue;
    }

    // Fetch skill details for all skills used in this conversation.
    const skills = await SkillResource.fetchByIds(auth, skillSIds);
    const skillTypes = skills.map((s) => s.toJSON(auth));

    if (skillTypes.length === 0) {
      continue;
    }

    const prompt = buildSkillAnalysisPrompt(
      conversationRes.value.text,
      skillTypes
    );
    batchMap.set(conversationSId, buildReinforcedSkillsLLMParams(prompt));
  }

  if (batchMap.size === 0) {
    logger.warn(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        conversationCount: conversationsWithSkills.length,
      },
      "ReinforcedSkills: no conversations could be prepared for analysis batch"
    );
    return null;
  }

  return batchMap;
}
```

- [ ] **Step 3: Verify types compile**

Run: `cd /Users/davidebbo/repos/dust/front && npx tsgo --noEmit 2>&1 | head -30`
Expected: No errors (will depend on run_reinforced_analysis.ts existing, may need to stub).

- [ ] **Step 4: Commit**

```bash
git add front/lib/reinforced_skills/format_skill_context.ts front/lib/reinforced_skills/analyze_conversation.ts
git commit -m "feat: add skill context formatting and analysis prompts"
```

---

### Task 6: Create LLM interaction and suggestion creation logic

**Files:**
- Create: `front/lib/reinforced_skills/run_reinforced_analysis.ts`

- [ ] **Step 1: Create run_reinforced_analysis.ts**

Create `front/lib/reinforced_skills/run_reinforced_analysis.ts`. This module handles LLM interaction, tool classification, and skill suggestion creation:

```typescript
import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { getLLM } from "@app/lib/api/llm";
import { writeBatchUserMessages } from "@app/lib/api/llm/batch_llm";
import type { LLM } from "@app/lib/api/llm/llm";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type { LLMStreamParameters } from "@app/lib/api/llm/types/options";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import { getLargeWhitelistedModel } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import {
  ALL_SKILL_TOOLS,
  getReinforcedSkillsMetadata,
  isSkillExploratoryToolName,
  isSkillTerminalToolName,
  type ProcessSkillReinforcedEventsResult,
  type ReinforcedSkillsOperationType,
  SKILL_TOOL_SCHEMAS,
  type SkillExploratoryToolCallInfo,
  type SkillTerminalToolCallEvent,
  type SkillTerminalToolCallFailure,
  type SkillTerminalToolCallInfo,
  type SkillTerminalToolCallSuccess,
} from "@app/lib/reinforced_skills/types";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { SkillSuggestionSource } from "@app/types/suggestions/skill_suggestion";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const REINFORCEMENT_SKILLS_AGENT_ID = "reinforcement_skills";

export function buildReinforcedSkillsSpecifications(): AgentActionSpecification[] {
  return ALL_SKILL_TOOLS.map((toolName) => {
    switch (toolName) {
      case "suggest_skill_instruction_edits":
        return {
          name: toolName,
          description:
            "Suggest edits to a skill's instructions. Provide the full replacement text.",
          inputSchema: zodToJsonSchema(
            z.object(SKILL_TOOL_SCHEMAS.suggest_skill_instruction_edits.shape)
          ) as JSONSchema,
        };
      case "suggest_skill_tools":
        return {
          name: toolName,
          description:
            "Suggest adding or removing tools from a skill's configuration.",
          inputSchema: zodToJsonSchema(
            z.object(SKILL_TOOL_SCHEMAS.suggest_skill_tools.shape)
          ) as JSONSchema,
        };
      case "get_available_tools":
        return {
          name: toolName,
          description:
            "List available tools in the workspace that can be added to skills.",
          inputSchema: zodToJsonSchema(z.object({})) as JSONSchema,
        };
      default:
        assertNever(toolName);
    }
  });
}

interface CategorizedSkillToolCalls {
  exploratoryToolCalls: SkillExploratoryToolCallInfo[];
  terminalToolCalls: SkillTerminalToolCallInfo[];
}

export function classifySkillToolCalls(
  events: LLMEvent[]
): CategorizedSkillToolCalls {
  const exploratoryToolCalls: SkillExploratoryToolCallInfo[] = [];
  const terminalToolCalls: SkillTerminalToolCallInfo[] = [];

  for (const e of events) {
    if (e.type !== "tool_call") {
      continue;
    }
    const { id, name, arguments: args } = e.content;
    if (isSkillExploratoryToolName(name)) {
      exploratoryToolCalls.push({ id, name, arguments: args });
    } else if (isSkillTerminalToolName(name)) {
      terminalToolCalls.push({ id, name, arguments: args });
    } else {
      logger.warn(
        { toolCallId: id, toolName: name },
        "ReinforcedSkills: received tool call with unrecognized name"
      );
    }
  }

  return { exploratoryToolCalls, terminalToolCalls };
}

export function getReinforcedSkillsDefaultOptions(
  operationType: ReinforcedSkillsOperationType,
  contextId: string
) {
  return {
    visibility: "test" as const,
    metadata: getReinforcedSkillsMetadata(operationType, contextId),
    userContextUsername: "reinforced_skills",
    userContextOrigin: "reinforcement" as const,
    agentConfigurationId: REINFORCEMENT_SKILLS_AGENT_ID,
  };
}

export function reinforcedSkillsConversationTitle(
  operationType: ReinforcedSkillsOperationType,
  contextId: string
): string {
  switch (operationType) {
    case "reinforced_skills_analyze_conversation":
      return `Reinforced skills analysis of ${contextId}`;
    case "reinforced_skills_aggregate_suggestions":
      return `Reinforced skills aggregation for ${contextId}`;
    default:
      assertNever(operationType);
  }
}

export function buildReinforcedSkillsLLMParams({
  systemPrompt,
  userMessage,
}: {
  systemPrompt: string;
  userMessage: string;
}): LLMStreamParameters {
  return {
    conversation: {
      messages: [
        {
          role: "user",
          name: "user",
          content: [{ type: "text", text: userMessage }],
        },
      ],
    },
    prompt: systemPrompt,
    specifications: buildReinforcedSkillsSpecifications(),
  };
}

export async function createReinforcedSkillsConversation(
  auth: Authenticator,
  {
    prompt,
    operationType,
    contextId,
  }: {
    prompt: { systemPrompt: string; userMessage: string };
    operationType: ReinforcedSkillsOperationType;
    contextId: string;
  }
): Promise<string> {
  const llmParams = buildReinforcedSkillsLLMParams(prompt);
  const { conversation: llmConversation, ...llmParamsWithoutConversation } =
    llmParams;
  const writeResult = await writeBatchUserMessages(auth, {
    newMessages: llmConversation.messages,
    title: reinforcedSkillsConversationTitle(operationType, contextId),
    ...llmParamsWithoutConversation,
    ...getReinforcedSkillsDefaultOptions(operationType, contextId),
  });
  if (writeResult.isErr()) {
    throw writeResult.error;
  }
  return writeResult.value.sId;
}

export async function getReinforcedSkillsLLM(
  auth: Authenticator,
  operationType: ReinforcedSkillsOperationType
): Promise<LLM | null> {
  const owner = auth.workspace();
  if (!owner) {
    return null;
  }
  const model = getLargeWhitelistedModel(auth);
  if (!model) {
    return null;
  }
  const credentials = await getLlmCredentials(auth, {
    skipEmbeddingApiKeyRequirement: true,
  });
  return getLLM(auth, {
    modelId: model.modelId,
    credentials,
    context: {
      operationType,
      workspaceId: owner.sId,
      userId: auth.user()?.sId,
    },
  });
}

/**
 * Parse terminal tool calls from LLM events and create skill suggestion records.
 */
export async function processSkillReinforcedEvents({
  auth,
  events,
  source,
  operationType,
  contextId,
  conversation,
}: {
  auth: Authenticator;
  events: LLMEvent[];
  source: SkillSuggestionSource;
  operationType: ReinforcedSkillsOperationType;
  contextId: string;
  conversation?: ConversationResource;
}): Promise<ProcessSkillReinforcedEventsResult> {
  const errorEvents = events.filter((e) => e.type === "error");
  if (errorEvents.length > 0) {
    logger.error(
      {
        contextId,
        errorCount: errorEvents.length,
        errors: errorEvents.map((e) => normalizeError(e)),
      },
      `ReinforcedSkills: batch LLM errors for ${operationType}`
    );
    return {
      suggestionsCreated: 0,
      successfulToolCalls: [],
      failedToolCalls: [],
    };
  }

  const toolCallEvents = events.filter(
    (e): e is SkillTerminalToolCallEvent =>
      e.type === "tool_call" && isSkillTerminalToolName(e.content.name)
  );
  if (toolCallEvents.length === 0) {
    logger.warn(
      { contextId },
      `ReinforcedSkills: no tool call in batch result for ${operationType}`
    );
    return {
      suggestionsCreated: 0,
      successfulToolCalls: [],
      failedToolCalls: [],
    };
  }

  let totalCreated = 0;
  const successfulToolCalls: SkillTerminalToolCallSuccess[] = [];
  const failedToolCalls: SkillTerminalToolCallFailure[] = [];

  for (const event of toolCallEvents) {
    const { id, name, arguments: args } = event.content;
    const toolCall: SkillTerminalToolCallInfo = { id, name, arguments: args };
    const result = await createSkillSuggestionsFromToolCall({
      auth,
      toolName: event.content.name,
      actionArguments: event.content.arguments,
      source,
      operationType,
      contextId,
      conversation,
    });
    totalCreated += result.suggestionsCreated;
    if (result.error) {
      failedToolCalls.push({ toolCall, errorMessage: result.error });
    } else {
      successfulToolCalls.push({
        toolCall,
        message: `Successfully created ${result.suggestionsCreated} suggestion(s).`,
      });
    }
  }

  return {
    suggestionsCreated: totalCreated,
    successfulToolCalls,
    failedToolCalls,
  };
}

interface ToolCallResult {
  suggestionsCreated: number;
  error?: string;
}

async function createSkillSuggestionsFromToolCall({
  auth,
  toolName,
  actionArguments,
  source,
  operationType,
  contextId,
  conversation,
}: {
  auth: Authenticator;
  toolName: string;
  actionArguments: Record<string, unknown>;
  source: SkillSuggestionSource;
  operationType: ReinforcedSkillsOperationType;
  contextId: string;
  conversation?: ConversationResource;
}): Promise<ToolCallResult> {
  switch (toolName) {
    case "suggest_skill_instruction_edits": {
      const parsed =
        SKILL_TOOL_SCHEMAS.suggest_skill_instruction_edits.safeParse(
          actionArguments
        );
      if (!parsed.success) {
        const errorMessage = `Invalid arguments for ${toolName}: ${parsed.error.message}`;
        logger.warn(
          { contextId, toolName, error: parsed.error },
          `ReinforcedSkills: invalid LLM response shape for ${operationType}`
        );
        return { suggestionsCreated: 0, error: errorMessage };
      }

      let created = 0;
      for (const suggestion of parsed.data.suggestions) {
        const skill = await SkillResource.fetchById(auth, suggestion.skillId);
        if (!skill || !skill.canWrite(auth)) {
          logger.warn(
            { skillId: suggestion.skillId, contextId },
            "ReinforcedSkills: skill not found or not writable"
          );
          continue;
        }

        await SkillSuggestionResource.createSuggestionForSkill(auth, skill, {
          skillVersionId: skill.currentVersionId,
          kind: "edit_instructions",
          suggestion: { instructions: suggestion.instructions },
          analysis: suggestion.analysis,
          state: "pending",
          source,
          sourceConversationId: conversation?.id ?? null,
          groupId: null,
        });
        created++;
      }
      return { suggestionsCreated: created };
    }

    case "suggest_skill_tools": {
      const parsed =
        SKILL_TOOL_SCHEMAS.suggest_skill_tools.safeParse(actionArguments);
      if (!parsed.success) {
        const errorMessage = `Invalid arguments for ${toolName}: ${parsed.error.message}`;
        logger.warn(
          { contextId, toolName, error: parsed.error },
          `ReinforcedSkills: invalid LLM response shape for ${operationType}`
        );
        return { suggestionsCreated: 0, error: errorMessage };
      }

      let created = 0;
      for (const suggestion of parsed.data.suggestions) {
        const skill = await SkillResource.fetchById(auth, suggestion.skillId);
        if (!skill || !skill.canWrite(auth)) {
          logger.warn(
            { skillId: suggestion.skillId, contextId },
            "ReinforcedSkills: skill not found or not writable"
          );
          continue;
        }

        await SkillSuggestionResource.createSuggestionForSkill(auth, skill, {
          skillVersionId: skill.currentVersionId,
          kind: "tools",
          suggestion: { action: suggestion.action, toolId: suggestion.toolId },
          analysis: suggestion.analysis,
          state: "pending",
          source,
          sourceConversationId: conversation?.id ?? null,
          groupId: null,
        });
        created++;
      }
      return { suggestionsCreated: created };
    }

    default:
      logger.warn(
        { contextId, toolName },
        `ReinforcedSkills: unexpected tool name for ${operationType}`
      );
      return { suggestionsCreated: 0 };
  }
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd /Users/davidebbo/repos/dust/front && npx tsgo --noEmit 2>&1 | head -30`
Expected: No errors. (May need to check `skill.currentVersionId` exists on SkillResource — adjust if the property name differs.)

- [ ] **Step 3: Commit**

```bash
git add front/lib/reinforced_skills/run_reinforced_analysis.ts
git commit -m "feat: add LLM interaction and skill suggestion creation for reinforced skills"
```

---

### Task 7: Create aggregation logic

**Files:**
- Create: `front/lib/reinforced_skills/aggregate_suggestions.ts`

- [ ] **Step 1: Create aggregate_suggestions.ts**

Create `front/lib/reinforced_skills/aggregate_suggestions.ts`:

```typescript
import type { LLMStreamParameters } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { formatSkillContext } from "@app/lib/reinforced_skills/format_skill_context";
import { buildReinforcedSkillsLLMParams } from "@app/lib/reinforced_skills/run_reinforced_analysis";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import logger from "@app/logger/logger";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";

const AGGREGATION_ASSEMBLY_ORDER = [
  "primary",
  "aggregation_rules",
  "suggestion_tool_calls",
] as const;

type AggregationSectionKey = (typeof AGGREGATION_ASSEMBLY_ORDER)[number];

const REINFORCED_SKILLS_AGGREGATION_SECTIONS: Record<
  AggregationSectionKey,
  string
> = {
  primary: `You improve a skill's configuration by consolidating many draft suggestions. Each draft was produced from a single conversation where the skill was used.
Your job is to produce a subset of the highest quality suggestions for the skill builder to review.

You have access to tools to suggest instruction edits and tool changes for skills.

Your goal is to keep the most impactful suggestions. NEVER create more than 5 suggestions.
You MUST follow <aggregation_rules> to determine the final set of suggestions.
You will call suggestion tools to create each of the final suggestions. You MUST follow <suggestion_tool_calls> for each suggestion.`,

  aggregation_rules: `Start by grouping suggestions by type (instruction edits vs tool changes).
For instruction edits, merge overlapping suggestions that modify the same aspect of the instructions into a single comprehensive edit.
For tool changes, group by toolId and action.

Rank the groups based on impact to the skill's effectiveness. Use these heuristics in priority order to determine highest impact:
- The number of conversations that exhibited the issue
- Suggestions that were directly generated based on user feedback
- Suggestions that were directly generated based on a user response to an agent message
- Suggestions that change or enhance the core skill capabilities

Use your discretion on what suggestions will most improve the skill's ability to guide agent behavior.

You SHOULD drop suggestions that only have minor impact and are only supported by a single conversation.`,

  suggestion_tool_calls: `You are provided all of the attributes associated with a conversation suggestion. You MUST use these EXACT attributes to create the final suggestion.
The only exception is the "analysis" attribute. You MUST provide a new analysis based on why you picked the suggestion. The end user does NOT care about the technical considerations behind your thought process.
The analysis MUST be a user-facing explanation of why the suggestion is impactful and how many conversations support the suggestion.`,
};

export function buildSkillAggregationSystemPrompt(): string {
  return AGGREGATION_ASSEMBLY_ORDER.map((key) => {
    const body = REINFORCED_SKILLS_AGGREGATION_SECTIONS[key].trim();
    return `<${key}>\n${body}\n</${key}>`;
  }).join("\n\n");
}

type ReinforcedSkillSuggestionType = SkillSuggestionType;

interface SkillAggregationContext {
  skill: SkillType;
  syntheticSuggestions: SkillSuggestionResource[];
  prompt: { systemPrompt: string; userMessage: string };
}

function formatSkillSuggestion(s: ReinforcedSkillSuggestionType): string {
  switch (s.kind) {
    case "edit_instructions":
      return `kind: edit_instructions
skillId: ${s.skillConfigurationId}
analysis: ${s.analysis ?? "N/A"}
instructions: ${s.suggestion.instructions}`;
    case "tools":
      return `kind: tools
skillId: ${s.skillConfigurationId}
action: ${s.suggestion.action}
toolId: ${s.suggestion.toolId}
analysis: ${s.analysis ?? "N/A"}`;
    case "create":
      return `kind: create
analysis: ${s.analysis ?? "N/A"}`;
  }
}

function formatSkillSuggestions(
  suggestions: ReinforcedSkillSuggestionType[]
): string {
  return suggestions
    .map((s, i) => `### Suggestion ${i + 1}\n${formatSkillSuggestion(s)}`)
    .join("\n\n");
}

export function buildSkillAggregationPrompt(
  skill: SkillType,
  syntheticSuggestions: ReinforcedSkillSuggestionType[],
  existingSuggestions: {
    pending: ReinforcedSkillSuggestionType[];
    rejected: ReinforcedSkillSuggestionType[];
  }
): { systemPrompt: string; userMessage: string } {
  const systemPrompt = buildSkillAggregationSystemPrompt();

  let userMessage = `${formatSkillContext(skill)}

## Synthetic suggestions from conversation analyses

${formatSkillSuggestions(syntheticSuggestions)}`;

  if (existingSuggestions.pending.length > 0) {
    userMessage += `

## Existing pending suggestions (do NOT duplicate these)

${formatSkillSuggestions(existingSuggestions.pending)}`;
  }

  if (existingSuggestions.rejected.length > 0) {
    userMessage += `

## Previously rejected suggestions (do NOT recreate similar ones)

${formatSkillSuggestions(existingSuggestions.rejected)}`;
  }

  return { systemPrompt, userMessage };
}

export async function loadSkillAggregationContext(
  auth: Authenticator,
  skillId: string
): Promise<SkillAggregationContext | null> {
  const syntheticSuggestions =
    await SkillSuggestionResource.listBySkillConfigurationId(auth, skillId, {
      sources: ["synthetic"],
      states: ["pending"],
    });

  if (syntheticSuggestions.length === 0) {
    return null;
  }

  const skill = await SkillResource.fetchById(auth, skillId);
  if (!skill) {
    logger.warn(
      { skillId },
      "ReinforcedSkills: skill not found for aggregation"
    );
    return null;
  }

  const REJECTED_SUGGESTIONS_MAX_COUNT = 20;
  const REJECTED_SUGGESTIONS_MAX_AGE_MONTHS = 3;

  const [pendingSuggestions, rejectedSuggestions] = await Promise.all([
    SkillSuggestionResource.listBySkillConfigurationId(auth, skillId, {
      sources: ["reinforcement"],
      states: ["pending"],
    }),
    SkillSuggestionResource.listBySkillConfigurationId(auth, skillId, {
      sources: ["reinforcement"],
      states: ["rejected"],
      limit: REJECTED_SUGGESTIONS_MAX_COUNT,
    }),
  ]);

  const rejectedCutoff = new Date();
  rejectedCutoff.setMonth(
    rejectedCutoff.getMonth() - REJECTED_SUGGESTIONS_MAX_AGE_MONTHS
  );
  const recentRejectedSuggestions = rejectedSuggestions.filter(
    (s) => s.createdAt >= rejectedCutoff
  );

  const skillType = skill.toJSON(auth);

  const prompt = buildSkillAggregationPrompt(
    skillType,
    syntheticSuggestions.map((s) => s.toJSON()),
    {
      pending: pendingSuggestions.map((s) => s.toJSON()),
      rejected: recentRejectedSuggestions.map((s) => s.toJSON()),
    }
  );

  return { skill: skillType, syntheticSuggestions, prompt };
}

export async function buildSkillAggregationBatchMap(
  auth: Authenticator,
  skillId: string
): Promise<Map<string, LLMStreamParameters> | null> {
  const ctx = await loadSkillAggregationContext(auth, skillId);
  if (!ctx) {
    return null;
  }

  return new Map([["aggregation", buildReinforcedSkillsLLMParams(ctx.prompt)]]);
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd /Users/davidebbo/repos/dust/front && npx tsgo --noEmit 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add front/lib/reinforced_skills/aggregate_suggestions.ts
git commit -m "feat: add skill suggestion aggregation logic"
```

---

### Task 8: Create Temporal activities

**Files:**
- Create: `front/temporal/reinforced_skills/activities.ts`

- [ ] **Step 1: Create activities.ts**

Create `front/temporal/reinforced_skills/activities.ts`. This is the largest file — it contains all Temporal activity functions. Follow the same patterns as `front/temporal/reinforced_agent/activities.ts`.

```typescript
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { getShrinkWrappedConversation } from "@app/lib/api/assistant/conversation/shrink_wrap";
import { renderConversationForModel } from "@app/lib/api/assistant/conversation_rendering";
import type { LlmConversationOptions } from "@app/lib/api/llm/batch_llm";
import {
  downloadBatchResultFromLlm,
  sendBatchCallToLlm,
  storeLlmResult,
} from "@app/lib/api/llm/batch_llm";
import type { BatchStatus } from "@app/lib/api/llm/types/batch";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type { LLMStreamParameters } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import {
  buildSkillAggregationSystemPrompt,
  buildSkillAggregationBatchMap,
  loadSkillAggregationContext,
} from "@app/lib/reinforced_skills/aggregate_suggestions";
import {
  buildSkillAnalysisPrompt,
  buildSkillAnalysisSystemPrompt,
  buildSkillConversationAnalysisBatchMap,
} from "@app/lib/reinforced_skills/analyze_conversation";
import {
  DEFAULT_MAX_CONVERSATIONS_PER_RUN,
  DEFAULT_REINFORCEMENT_LOOKBACK_WINDOW_DAYS,
} from "@app/lib/reinforced_skills/constants";
import {
  buildReinforcedSkillsLLMParams,
  buildReinforcedSkillsSpecifications,
  classifySkillToolCalls,
  createReinforcedSkillsConversation,
  getReinforcedSkillsDefaultOptions,
  getReinforcedSkillsLLM,
  processSkillReinforcedEvents,
  REINFORCEMENT_SKILLS_AGENT_ID,
  reinforcedSkillsConversationTitle,
} from "@app/lib/reinforced_skills/run_reinforced_analysis";
import {
  type ConversationWithSkills,
  getRecentConversationsWithSkills,
} from "@app/lib/reinforced_skills/selection";
import type {
  ReinforcedSkillsOperationType,
  SkillExploratoryToolCallInfo,
  SkillTerminalToolCallFailure,
  SkillTerminalToolCallSuccess,
} from "@app/lib/reinforced_skills/types";
import { getAuthForWorkspace } from "@app/lib/reinforced_skills/utils";
import { hasReinforcementEnabled } from "@app/lib/reinforced_agent/workspace_check";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import {
  prepareReinforcedToolActions,
  type ReinforcedToolActionInfo,
  storeTerminalToolCallResults,
} from "@app/lib/reinforced_agent/tool_execution";
import logger from "@app/logger/logger";
import { ApplicationFailure } from "@temporalio/common";

// Re-export runToolActivity so the reinforced skills worker registers it.
export { runToolActivity } from "@app/temporal/agent_loop/activities/run_tool";

// ---------------------------------------------------------------------------
// Shared step logic
// ---------------------------------------------------------------------------

async function runReinforcedSkillsStep({
  auth,
  reinforcementConversationId,
  operationType,
  systemPrompt,
  contextId,
  source,
  conversationId,
}: {
  auth: Authenticator;
  reinforcementConversationId: string;
  operationType: ReinforcedSkillsOperationType;
  systemPrompt: string;
  contextId: string;
  source: "synthetic" | "reinforcement";
  conversationId?: string;
}): Promise<{
  isTerminal: boolean;
  suggestionsCreated: number;
  reinforcementConversationId?: string;
  toolActionInfo?: ReinforcedToolActionInfo;
}> {
  const llm = await getReinforcedSkillsLLM(auth, operationType);
  if (!llm) {
    logger.error(
      { contextId },
      "ReinforcedSkills: no LLM available for step activity"
    );
    return { isTerminal: true, suggestionsCreated: 0 };
  }

  const conversationRes = await getConversation(
    auth,
    reinforcementConversationId
  );
  if (conversationRes.isErr()) {
    throw conversationRes.error;
  }

  const specifications = buildReinforcedSkillsSpecifications();
  const modelConfig = llm.getModelConfig();
  const toolsJson = JSON.stringify(
    specifications.map((s) => ({
      name: s.name,
      description: s.description,
      inputSchema: s.inputSchema,
    }))
  );

  const renderResult = await renderConversationForModel(auth, {
    conversation: conversationRes.value,
    model: modelConfig,
    prompt: systemPrompt,
    tools: toolsJson,
    allowedTokenCount:
      modelConfig.contextSize - modelConfig.generationTokensCount,
  });
  if (renderResult.isErr()) {
    throw renderResult.error;
  }

  const llmParams: LLMStreamParameters = {
    conversation: renderResult.value.modelConversation,
    prompt: systemPrompt,
    specifications,
  };

  const events: LLMEvent[] = [];
  for await (const event of llm.stream(llmParams)) {
    events.push(event);
  }

  const reinforcementConv = await ConversationResource.fetchById(
    auth,
    reinforcementConversationId
  );
  if (!reinforcementConv) {
    throw new Error(
      `Reinforcement conversation not found: ${reinforcementConversationId}`
    );
  }

  const storedResult = await storeLlmResult(
    auth,
    reinforcementConv,
    events,
    REINFORCEMENT_SKILLS_AGENT_ID,
    { runIds: [llm.getTraceId()] }
  );

  const { exploratoryToolCalls, terminalToolCalls } =
    classifySkillToolCalls(events);

  if (terminalToolCalls.length > 0 || exploratoryToolCalls.length === 0) {
    let conversation: ConversationResource | undefined;
    if (conversationId) {
      conversation =
        (await ConversationResource.fetchById(auth, conversationId)) ??
        undefined;
    }

    const result = await processSkillReinforcedEvents({
      auth,
      events,
      source,
      operationType,
      contextId,
      conversation,
    });

    await storeTerminalToolCallResults(auth, {
      successfulToolCalls: result.successfulToolCalls.map((s) => ({
        toolCall: { ...s.toolCall, name: s.toolCall.name as any },
        message: s.message,
      })),
      failedToolCalls: result.failedToolCalls.map((f) => ({
        toolCall: { ...f.toolCall, name: f.toolCall.name as any },
        errorMessage: f.errorMessage,
      })),
      agentMessageModelId: storedResult.agentMessageModelId,
    });

    if (result.failedToolCalls.length > 0) {
      return {
        isTerminal: false,
        suggestionsCreated: result.suggestionsCreated,
        reinforcementConversationId,
      };
    }

    return {
      isTerminal: true,
      suggestionsCreated: result.suggestionsCreated,
      reinforcementConversationId,
    };
  }

  const toolActionInfo = await prepareReinforcedToolActions(auth, {
    exploratoryToolCalls: exploratoryToolCalls as any,
    agentMessageModelId: storedResult.agentMessageModelId,
    agentMessageId: storedResult.agentMessageSId,
    userMessageId: storedResult.userMessageSId,
    conversationId: reinforcementConversationId,
  });

  return {
    isTerminal: false,
    suggestionsCreated: 0,
    reinforcementConversationId,
    toolActionInfo,
  };
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

export async function isSkillReinforcementAllowedActivity({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<boolean> {
  const auth = await getAuthForWorkspace(workspaceId);
  return hasReinforcementEnabled(auth);
}

export async function getRecentConversationsWithSkillsActivity({
  workspaceId,
  lookbackDays = DEFAULT_REINFORCEMENT_LOOKBACK_WINDOW_DAYS,
  maxConversations = DEFAULT_MAX_CONVERSATIONS_PER_RUN,
  skillId,
}: {
  workspaceId: string;
  lookbackDays?: number;
  maxConversations?: number;
  skillId?: string;
}): Promise<ConversationWithSkills[]> {
  const auth = await getAuthForWorkspace(workspaceId);
  return getRecentConversationsWithSkills(auth, {
    lookbackDays,
    maxConversations,
    skillId,
  });
}

export async function analyzeConversationStepActivity({
  workspaceId,
  conversationId,
  skillSIds,
  reinforcementConversationId,
}: {
  workspaceId: string;
  conversationId: string;
  skillSIds: string[];
  reinforcementConversationId?: string;
}): Promise<{
  isTerminal: boolean;
  suggestionsCreated: number;
  reinforcementConversationId?: string;
  toolActionInfo?: ReinforcedToolActionInfo;
}> {
  const auth = await getAuthForWorkspace(workspaceId);

  if (!reinforcementConversationId) {
    const conversationRes = await getShrinkWrappedConversation(auth, {
      conversationId,
      includeFeedback: true,
    });
    if (conversationRes.isErr()) {
      logger.warn(
        { conversationId },
        "ReinforcedSkills: conversation not found for step activity"
      );
      return { isTerminal: true, suggestionsCreated: 0 };
    }

    const skills = await SkillResource.fetchByIds(auth, skillSIds);
    const skillTypes = skills.map((s) => s.toJSON(auth));

    const prompt = buildSkillAnalysisPrompt(
      conversationRes.value.text,
      skillTypes
    );
    reinforcementConversationId = await createReinforcedSkillsConversation(
      auth,
      {
        prompt,
        operationType: "reinforced_skills_analyze_conversation",
        contextId: conversationId,
      }
    );
  }

  return runReinforcedSkillsStep({
    auth,
    reinforcementConversationId,
    operationType: "reinforced_skills_analyze_conversation",
    systemPrompt: buildSkillAnalysisSystemPrompt(),
    contextId: conversationId,
    source: "synthetic",
    conversationId,
  });
}

export async function getSkillsWithSyntheticSuggestionsActivity({
  workspaceId,
  skillId,
}: {
  workspaceId: string;
  skillId?: string;
}): Promise<string[]> {
  const auth = await getAuthForWorkspace(workspaceId);

  // If scoped to a specific skill, just check if it has synthetic suggestions.
  if (skillId) {
    const suggestions =
      await SkillSuggestionResource.listBySkillConfigurationId(auth, skillId, {
        sources: ["synthetic"],
        states: ["pending"],
        limit: 1,
      });
    return suggestions.length > 0 ? [skillId] : [];
  }

  // Otherwise, find all skills with pending synthetic suggestions.
  // We query the model directly since the resource doesn't have a bulk method for this.
  const { SkillSuggestionModel } = await import(
    "@app/lib/models/skill/skill_suggestion"
  );
  const { SkillConfigurationModel } = await import("@app/lib/models/skill");

  const owner = auth.getNonNullableWorkspace();
  const suggestions = await SkillSuggestionModel.findAll({
    where: {
      workspaceId: owner.id,
      source: "synthetic",
      state: "pending",
    },
    include: [
      {
        model: SkillConfigurationModel,
        as: "skillConfiguration",
        required: true,
        attributes: ["sId"],
      },
    ],
    attributes: ["skillConfigurationId"],
    group: ["skillConfigurationId", "skillConfiguration.id"],
  });

  return [
    ...new Set(suggestions.map((s) => s.skillConfiguration.sId)),
  ];
}

export async function aggregateSuggestionsForSkillStepActivity({
  workspaceId,
  skillId,
  reinforcementConversationId,
}: {
  workspaceId: string;
  skillId: string;
  reinforcementConversationId?: string;
}): Promise<{
  isTerminal: boolean;
  suggestionsCreated: number;
  reinforcementConversationId?: string;
  toolActionInfo?: ReinforcedToolActionInfo;
}> {
  const auth = await getAuthForWorkspace(workspaceId);

  if (!reinforcementConversationId) {
    const ctx = await loadSkillAggregationContext(auth, skillId);
    if (!ctx) {
      return { isTerminal: true, suggestionsCreated: 0 };
    }

    reinforcementConversationId = await createReinforcedSkillsConversation(
      auth,
      {
        prompt: ctx.prompt,
        operationType: "reinforced_skills_aggregate_suggestions",
        contextId: skillId,
      }
    );
  }

  return runReinforcedSkillsStep({
    auth,
    reinforcementConversationId,
    operationType: "reinforced_skills_aggregate_suggestions",
    systemPrompt: buildSkillAggregationSystemPrompt(),
    contextId: skillId,
    source: "reinforcement",
  });
}

export async function finalizeSkillAggregationActivity({
  workspaceId,
  skillId,
  suggestionsCreated,
  disableNotifications,
}: {
  workspaceId: string;
  skillId: string;
  suggestionsCreated: number;
  disableNotifications: boolean;
}): Promise<void> {
  const auth = await getAuthForWorkspace(workspaceId);

  // TODO: Add notification logic for skill editors when ready.

  // Mark all synthetic suggestions for this skill as approved.
  const syntheticSuggestions =
    await SkillSuggestionResource.listBySkillConfigurationId(auth, skillId, {
      sources: ["synthetic"],
      states: ["pending"],
    });

  // Delete synthetic suggestions (they've been consolidated).
  for (const suggestion of syntheticSuggestions) {
    await suggestion.delete(auth);
  }

  logger.info(
    {
      skillId,
      syntheticCount: syntheticSuggestions.length,
      pendingCreated: suggestionsCreated,
      disableNotifications,
    },
    "ReinforcedSkills: finalized aggregation for skill"
  );
}

export async function checkBatchStatusActivity({
  workspaceId,
  batchId,
}: {
  workspaceId: string;
  batchId: string;
}): Promise<BatchStatus> {
  const auth = await getAuthForWorkspace(workspaceId);

  const llm = await getReinforcedSkillsLLM(
    auth,
    "reinforced_skills_analyze_conversation"
  );
  if (!llm) {
    throw ApplicationFailure.nonRetryable(
      "ReinforcedSkills: no LLM available for batch status check"
    );
  }

  return llm.getBatchStatus(batchId);
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd /Users/davidebbo/repos/dust/front && npx tsgo --noEmit 2>&1 | head -30`
Expected: May need adjustments (e.g., `storeTerminalToolCallResults` type compatibility). Fix any compile errors.

- [ ] **Step 3: Commit**

```bash
git add front/temporal/reinforced_skills/activities.ts
git commit -m "feat: add Temporal activities for reinforced skills"
```

---

### Task 9: Create Temporal workflows

**Files:**
- Create: `front/temporal/reinforced_skills/workflows.ts`

- [ ] **Step 1: Create workflows.ts**

Create `front/temporal/reinforced_skills/workflows.ts`:

```typescript
import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/reinforced_skills/activities";
import type { AgentLoopArgsWithTiming } from "@app/types/assistant/agent_run";
import type { ModelId } from "@app/types/shared/model_id";
import {
  OpenTelemetryInboundInterceptor,
  OpenTelemetryInternalsInterceptor,
  OpenTelemetryOutboundInterceptor,
} from "@temporalio/interceptors-opentelemetry/lib/workflow";
import type { WorkflowInterceptorsFactory } from "@temporalio/workflow";
import { ApplicationFailure, proxyActivities, sleep } from "@temporalio/workflow";
import { concurrentExecutor } from "../utils";

export const interceptors: WorkflowInterceptorsFactory = () => ({
  inbound: [new OpenTelemetryInboundInterceptor()],
  outbound: [new OpenTelemetryOutboundInterceptor()],
  internals: [new OpenTelemetryInternalsInterceptor()],
});

const { isSkillReinforcementAllowedActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "5 minutes",
});

const { getRecentConversationsWithSkillsActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "5 minutes",
});

const { analyzeConversationStepActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

const { getSkillsWithSyntheticSuggestionsActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "5 minutes",
});

const { aggregateSuggestionsForSkillStepActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "10 minutes",
});

const { finalizeSkillAggregationActivity } = proxyActivities<typeof activities>(
  {
    startToCloseTimeout: "5 minutes",
  }
);

const { checkBatchStatusActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

const { runToolActivity: runRetryableToolActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "10 minutes",
  retry: { maximumAttempts: 3 },
});

// Duplicated here because Temporal workflow sandbox can't resolve @app/lib imports.
const MAX_REINFORCED_ANALYSIS_STEPS = 4;
const CONVERSATION_ANALYSIS_CONCURRENCY = 4;
const SKILL_AGGREGATION_CONCURRENCY = 8;

const BATCH_POLL_INTERVAL_MIN_MS = 30_000;
const BATCH_POLL_INTERVAL_MAX_MS = 5 * 60_000;
const BATCH_POLL_INTERVAL_STEP_MS = 10_000;
const BATCH_TIMEOUT_MS = 6 * 60 * 60_000;

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function computeWorkspaceDelayMs(workspaceId: string): number {
  let hash = 0;
  for (const ch of workspaceId) {
    hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  }
  return Math.abs(hash) % TWO_HOURS_MS;
}

interface ReinforcedToolActionInfo {
  authType: AuthenticatorType;
  agentLoopArgs: AgentLoopArgsWithTiming;
  actionIds: ModelId[];
}

interface ReinforcedStepResult {
  isTerminal: boolean;
  suggestionsCreated: number;
  reinforcementConversationId?: string;
  toolActionInfo?: ReinforcedToolActionInfo;
}

async function executeReinforcedToolActions(
  toolActionInfo: ReinforcedToolActionInfo
): Promise<void> {
  const { authType, agentLoopArgs, actionIds } = toolActionInfo;
  for (const actionId of actionIds) {
    try {
      await runRetryableToolActivity(authType, {
        actionId,
        runAgentArgs: agentLoopArgs,
        step: 0,
      });
    } catch {
      // Tool execution failed after all retries.
    }
  }
}

async function runMultiStepStreamingLoop(
  stepFn: (
    reinforcementConversationId: string | undefined
  ) => Promise<ReinforcedStepResult>
): Promise<{ suggestionsCreated: number }> {
  let reinforcementConversationId: string | undefined;
  let totalSuggestionsCreated = 0;

  for (let step = 0; step < MAX_REINFORCED_ANALYSIS_STEPS; step++) {
    const result = await stepFn(reinforcementConversationId);

    reinforcementConversationId = result.reinforcementConversationId;
    totalSuggestionsCreated += result.suggestionsCreated;

    if (result.isTerminal) {
      break;
    }

    if (result.toolActionInfo) {
      await executeReinforcedToolActions(result.toolActionInfo);
    }
  }

  return { suggestionsCreated: totalSuggestionsCreated };
}

async function waitForBatch({
  workspaceId,
  batchId,
}: {
  workspaceId: string;
  batchId: string;
}): Promise<void> {
  let elapsedMs = 0;
  let intervalMs = BATCH_POLL_INTERVAL_MIN_MS;

  while (elapsedMs < BATCH_TIMEOUT_MS) {
    await sleep(intervalMs);
    elapsedMs += intervalMs;
    intervalMs = Math.min(
      intervalMs + BATCH_POLL_INTERVAL_STEP_MS,
      BATCH_POLL_INTERVAL_MAX_MS
    );

    const status = await checkBatchStatusActivity({ workspaceId, batchId });
    if (status === "ready") {
      return;
    }
  }

  throw new ApplicationFailure(
    `Batch ${batchId} in workspace ${workspaceId} timed out after 6 hours.`,
    "BATCH_TIMEOUT",
    true
  );
}

/**
 * Workspace-level workflow for reinforced skills.
 */
export async function reinforcedSkillsWorkspaceWorkflow({
  workspaceId,
  useBatchMode,
  skipDelay = false,
  skillId,
  conversationLookbackDays,
  disableNotifications = false,
}: {
  workspaceId: string;
  useBatchMode: boolean;
  skipDelay?: boolean;
  skillId?: string;
  conversationLookbackDays?: number;
  disableNotifications?: boolean;
}): Promise<void> {
  const isAllowed = await isSkillReinforcementAllowedActivity({ workspaceId });
  if (!isAllowed) {
    return;
  }

  if (!skipDelay) {
    const delayMs = computeWorkspaceDelayMs(workspaceId);
    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  // Phase 1: Discover conversations with skill usage.
  const conversationsWithSkills =
    await getRecentConversationsWithSkillsActivity({
      workspaceId,
      lookbackDays: conversationLookbackDays,
      skillId,
    });

  if (conversationsWithSkills.length === 0) {
    return;
  }

  // Phase 2: Analyze conversations (streaming mode).
  await concurrentExecutor(
    conversationsWithSkills,
    ({ conversationSId, skillSIds }) =>
      runMultiStepStreamingLoop((reinforcementConversationId) =>
        analyzeConversationStepActivity({
          workspaceId,
          conversationId: conversationSId,
          skillSIds,
          reinforcementConversationId,
        })
      ),
    { concurrency: CONVERSATION_ANALYSIS_CONCURRENCY }
  );

  // Phase 3: Find skills with synthetic suggestions and aggregate.
  const skillIdsWithSuggestions =
    await getSkillsWithSyntheticSuggestionsActivity({
      workspaceId,
      skillId,
    });

  if (skillIdsWithSuggestions.length === 0) {
    return;
  }

  // Phase 4: Per-skill aggregation.
  await concurrentExecutor(
    skillIdsWithSuggestions,
    async (sid) => {
      const { suggestionsCreated } = await runMultiStepStreamingLoop(
        (reinforcementConversationId) =>
          aggregateSuggestionsForSkillStepActivity({
            workspaceId,
            skillId: sid,
            reinforcementConversationId,
          })
      );

      await finalizeSkillAggregationActivity({
        workspaceId,
        skillId: sid,
        suggestionsCreated,
        disableNotifications,
      });
    },
    { concurrency: SKILL_AGGREGATION_CONCURRENCY }
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd /Users/davidebbo/repos/dust/front && npx tsgo --noEmit 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add front/temporal/reinforced_skills/workflows.ts
git commit -m "feat: add Temporal workflows for reinforced skills"
```

---

### Task 10: Create Temporal client

**Files:**
- Create: `front/temporal/reinforced_skills/client.ts`

- [ ] **Step 1: Create client.ts**

Create `front/temporal/reinforced_skills/client.ts`:

```typescript
import { config, REGION_TIMEZONES } from "@app/lib/api/regions/config";
import { Authenticator } from "@app/lib/auth";
import { hasReinforcementEnabled } from "@app/lib/reinforced_agent/workspace_check";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { WorkflowHandle } from "@temporalio/client";
import {
  WorkflowExecutionAlreadyStartedError,
  WorkflowNotFoundError,
} from "@temporalio/client";
import moment from "moment-timezone";
import { QUEUE_NAME } from "./config";
import { reinforcedSkillsWorkspaceWorkflow } from "./workflows";

function getMidnightUtcHour(timezone: string): number {
  const midnightInTz = moment.tz("00:00", "HH:mm", timezone);
  return midnightInTz.utc().hour();
}

function makeWorkspaceCronWorkflowId(workspaceId: string): string {
  return `reinforced-skills-workspace-${workspaceId}`;
}

async function getFlaggedWorkspaceIds(): Promise<string[]> {
  const allWorkspaces = await WorkspaceResource.listAll();
  const flaggedIds: string[] = [];

  for (const workspace of allWorkspaces) {
    try {
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
      if (await hasReinforcementEnabled(auth)) {
        flaggedIds.push(workspace.sId);
      }
    } catch (e) {
      logger.error(
        { error: e, workspaceId: workspace.sId },
        "[ReinforcedSkills] Error checking feature flags for workspace."
      );
    }
  }

  return flaggedIds;
}

// ---------------------------------------------------------------------------
// Per-workspace cron lifecycle
// ---------------------------------------------------------------------------

export async function launchReinforcedSkillsWorkspaceCron({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<Result<undefined, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const region = config.getCurrentRegion();
  const timezone = REGION_TIMEZONES[region];
  const utcHour = getMidnightUtcHour(timezone);
  const workflowId = makeWorkspaceCronWorkflowId(workspaceId);

  try {
    await client.workflow.start(reinforcedSkillsWorkspaceWorkflow, {
      args: [{ workspaceId, useBatchMode: true, skipDelay: false }],
      taskQueue: QUEUE_NAME,
      workflowId,
      cronSchedule: `0 ${utcHour} * * *`,
    });

    logger.info(
      { region, timezone, utcHour, workflowId, workspaceId },
      "[ReinforcedSkills] Launched workspace cron workflow."
    );
  } catch (e) {
    if (e instanceof WorkflowExecutionAlreadyStartedError) {
      logger.info(
        { workflowId, workspaceId },
        "[ReinforcedSkills] Workspace cron workflow already running, skipping."
      );
    } else {
      throw e;
    }
  }

  return new Ok(undefined);
}

export async function stopReinforcedSkillsWorkspaceCron({
  workspaceId,
  stopReason,
}: {
  workspaceId: string;
  stopReason: string;
}) {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = makeWorkspaceCronWorkflowId(workspaceId);

  try {
    const handle: WorkflowHandle<typeof reinforcedSkillsWorkspaceWorkflow> =
      client.workflow.getHandle(workflowId);
    await handle.terminate(stopReason);
  } catch (e) {
    if (e instanceof WorkflowNotFoundError) {
      logger.info(
        { workflowId, workspaceId },
        "[ReinforcedSkills] Workspace cron workflow not running, skipping."
      );
    } else {
      logger.error(
        { error: e, workflowId, workspaceId },
        "[ReinforcedSkills] Failed stopping workspace cron workflow."
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

export async function launchAllReinforcedSkillsWorkspaceCrons(): Promise<
  Result<undefined, Error>
> {
  const workspaceIds = await getFlaggedWorkspaceIds();

  await concurrentExecutor(
    workspaceIds,
    (workspaceId) => launchReinforcedSkillsWorkspaceCron({ workspaceId }),
    { concurrency: 8 }
  );

  logger.info(
    { workspaceCount: workspaceIds.length },
    "[ReinforcedSkills] Launched cron workflows for all flagged workspaces."
  );

  return new Ok(undefined);
}

export async function stopAllReinforcedSkillsWorkspaceCrons(): Promise<void> {
  const workspaceIds = await getFlaggedWorkspaceIds();

  await concurrentExecutor(
    workspaceIds,
    (workspaceId) =>
      stopReinforcedSkillsWorkspaceCron({
        workspaceId,
        stopReason: "Stopped all via CLI",
      }),
    { concurrency: 8 }
  );

  logger.info(
    { workspaceCount: workspaceIds.length },
    "[ReinforcedSkills] Stopped cron workflows for all flagged workspaces."
  );
}

// ---------------------------------------------------------------------------
// Manual one-off runs
// ---------------------------------------------------------------------------

export async function startReinforcedSkillsWorkspaceWorkflow({
  workspaceId,
  useBatchMode,
  skillId,
  conversationLookbackDays,
  disableNotifications,
}: {
  workspaceId: string;
  useBatchMode: boolean;
  skillId?: string;
  conversationLookbackDays?: number;
  disableNotifications?: boolean;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = `reinforced-skills-workspace-${workspaceId}-manual-${Date.now()}`;

  await client.workflow.start(reinforcedSkillsWorkspaceWorkflow, {
    args: [
      {
        workspaceId,
        useBatchMode,
        skipDelay: true,
        skillId,
        conversationLookbackDays,
        disableNotifications,
      },
    ],
    taskQueue: QUEUE_NAME,
    workflowId,
  });

  logger.info(
    { workflowId, workspaceId, skillId },
    "[ReinforcedSkills] Started workspace workflow."
  );
  return new Ok(workflowId);
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd /Users/davidebbo/repos/dust/front && npx tsgo --noEmit 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add front/temporal/reinforced_skills/client.ts
git commit -m "feat: add Temporal client for reinforced skills"
```

---

### Task 11: Create Temporal worker

**Files:**
- Create: `front/temporal/reinforced_skills/worker.ts`

- [ ] **Step 1: Create worker.ts**

Create `front/temporal/reinforced_skills/worker.ts`:

```typescript
import {
  initializeOpenTelemetryInstrumentation,
  resource,
} from "@app/lib/api/instrumentation/init";
import { NoopSpanExporter } from "@app/lib/api/instrumentation/noop_span_exporter";
import {
  getTemporalWorkerConnection,
  TEMPORAL_MAXED_CACHED_WORKFLOWS,
} from "@app/lib/temporal";
import { ActivityInboundLogInterceptor } from "@app/lib/temporal_monitoring";
import logger from "@app/logger/logger";
import { getWorkflowConfig } from "@app/temporal/bundle_helper";
import * as activities from "@app/temporal/reinforced_skills/activities";
import { isDevelopment } from "@app/types/shared/env";
import { removeNulls } from "@app/types/shared/utils/general";
import type { Context } from "@temporalio/activity";
import {
  makeWorkflowExporter,
  OpenTelemetryActivityInboundInterceptor,
  OpenTelemetryActivityOutboundInterceptor,
} from "@temporalio/interceptors-opentelemetry/lib/worker";
import { Worker } from "@temporalio/worker";

import { QUEUE_NAME } from "./config";

export async function runReinforcedSkillsWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();

  initializeOpenTelemetryInstrumentation({
    serviceName: "dust-reinforced-skills",
  });

  const spanExporter = new NoopSpanExporter();

  const worker = await Worker.create({
    ...getWorkflowConfig({
      workerName: "reinforced_skills",
      getWorkflowsPath: () => require.resolve("./workflows"),
    }),
    activities,
    taskQueue: QUEUE_NAME,
    maxCachedWorkflows: TEMPORAL_MAXED_CACHED_WORKFLOWS,
    maxConcurrentActivityTaskExecutions: 8,
    connection,
    namespace,
    interceptors: {
      workflowModules: removeNulls([
        !isDevelopment() || process.env.USE_TEMPORAL_BUNDLES === "true"
          ? null
          : require.resolve("./workflows"),
      ]),
      activity: [
        (ctx: Context) => {
          return {
            inbound: new ActivityInboundLogInterceptor(ctx, logger),
          };
        },
        (ctx) => ({
          inbound: new OpenTelemetryActivityInboundInterceptor(ctx),
          outbound: new OpenTelemetryActivityOutboundInterceptor(ctx),
        }),
      ],
    },
    sinks: {
      // @ts-expect-error InMemorySpanExporter type mismatch.
      exporter: makeWorkflowExporter(spanExporter, resource),
    },
  });

  await worker.run();
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd /Users/davidebbo/repos/dust/front && npx tsgo --noEmit 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add front/temporal/reinforced_skills/worker.ts
git commit -m "feat: add Temporal worker for reinforced skills"
```

---

### Task 12: Create CLI

**Files:**
- Create: `front/temporal/reinforced_skills/admin/cli.ts`

- [ ] **Step 1: Create cli.ts**

Create `front/temporal/reinforced_skills/admin/cli.ts`:

```typescript
import {
  launchAllReinforcedSkillsWorkspaceCrons,
  launchReinforcedSkillsWorkspaceCron,
  startReinforcedSkillsWorkspaceWorkflow,
  stopAllReinforcedSkillsWorkspaceCrons,
  stopReinforcedSkillsWorkspaceCron,
} from "@app/temporal/reinforced_skills/client";
import parseArgs from "minimist";

function usage() {
  console.error(`Usage:
  start                                                                          Start cron workflows for all flagged workspaces
  stop                                                                           Stop cron workflows for all flagged workspaces
  start-workspace --workspace-id <sId>                                          Start the cron workflow for a specific workspace
  stop-workspace --workspace-id <sId>                                           Stop the cron workflow for a specific workspace
  run-workspace --workspace-id <sId> [--batch] [--skill-id <sId>] [--days <n>] Run once for a workspace (optional skill scoping)
  run-skill --workspace-id <sId> --skill-id <sId> [--batch] [--days <n>]       Run for a specific skill`);
}

const main = async () => {
  const argv = parseArgs(process.argv.slice(2), {
    string: ["workspace-id", "skill-id"],
    boolean: ["batch"],
    default: { batch: false },
  });

  const [command] = argv._;

  switch (command) {
    case "start":
      await launchAllReinforcedSkillsWorkspaceCrons();
      return;
    case "stop":
      await stopAllReinforcedSkillsWorkspaceCrons();
      return;
    case "start-workspace": {
      const workspaceId = argv["workspace-id"];
      if (!workspaceId) {
        console.error("Error: --workspace-id is required");
        usage();
        process.exit(1);
      }
      await launchReinforcedSkillsWorkspaceCron({ workspaceId });
      return;
    }
    case "stop-workspace": {
      const workspaceId = argv["workspace-id"];
      if (!workspaceId) {
        console.error("Error: --workspace-id is required");
        usage();
        process.exit(1);
      }
      await stopReinforcedSkillsWorkspaceCron({
        workspaceId,
        stopReason: "Stopped via CLI",
      });
      return;
    }
    case "run-workspace": {
      const workspaceId = argv["workspace-id"];
      if (!workspaceId) {
        console.error("Error: --workspace-id is required");
        usage();
        process.exit(1);
      }
      const conversationLookbackDays =
        argv["days"] !== undefined ? Number(argv["days"]) : undefined;
      await startReinforcedSkillsWorkspaceWorkflow({
        workspaceId,
        useBatchMode: argv["batch"],
        skillId: argv["skill-id"] || undefined,
        conversationLookbackDays,
      });
      return;
    }
    case "run-skill": {
      const workspaceId = argv["workspace-id"];
      const skillId = argv["skill-id"];
      if (!workspaceId || !skillId) {
        console.error("Error: --workspace-id and --skill-id are required");
        usage();
        process.exit(1);
      }
      const conversationLookbackDays =
        argv["days"] !== undefined ? Number(argv["days"]) : undefined;
      await startReinforcedSkillsWorkspaceWorkflow({
        workspaceId,
        useBatchMode: argv["batch"],
        skillId,
        conversationLookbackDays,
      });
      return;
    }
    default:
      console.error(`Error: Unknown command "${command}"`);
      usage();
      process.exit(1);
  }
};

main()
  .then(() => {
    console.error("\x1b[32m%s\x1b[0m", `Done`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("\x1b[31m%s\x1b[0m", `Error: ${err.message}`);
    console.log(err);
    process.exit(1);
  });
```

- [ ] **Step 2: Verify types compile**

Run: `cd /Users/davidebbo/repos/dust/front && npx tsgo --noEmit 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add front/temporal/reinforced_skills/admin/cli.ts
git commit -m "feat: add CLI for reinforced skills"
```

---

### Task 13: Create Poke plugins for skills reinforcement

**Files:**
- Create: `front/lib/api/poke/plugins/workspaces/reinforced_skills_workflow.ts`
- Create: `front/lib/api/poke/plugins/workspaces/run_reinforced_skills_workflow.ts`
- Create: `front/lib/api/poke/plugins/skills/run_reinforced_skill.ts`
- Modify: `front/lib/api/poke/plugins/workspaces/index.ts`
- Modify: `front/lib/api/poke/plugins/skills/index.ts`

- [ ] **Step 1: Create reinforced_skills_workflow.ts (workspace level)**

Create `front/lib/api/poke/plugins/workspaces/reinforced_skills_workflow.ts`:

```typescript
import { createPlugin } from "@app/lib/api/poke/types";
import {
  launchReinforcedSkillsWorkspaceCron,
  stopReinforcedSkillsWorkspaceCron,
} from "@app/temporal/reinforced_skills/client";
import { Err, Ok } from "@app/types/shared/result";

export const reinforcedSkillsWorkflowPlugin = createPlugin({
  manifest: {
    id: "reinforced-skills-workflow",
    name: "Start/Stop Reinforced Skills Workflow",
    description:
      "Start or stop the reinforced skills cron workflow for this workspace.",
    resourceTypes: ["workspaces"],
    args: {
      action: {
        type: "enum",
        label: "Action",
        description: "Start cron (nightly schedule) or Stop cron.",
        values: [
          { label: "Start cron", value: "start-cron" },
          { label: "Stop cron", value: "stop-cron" },
        ],
        multiple: false,
      },
    },
  },
  execute: async (auth, _, args) => {
    const workspace = auth.getNonNullableWorkspace();
    const action = args.action[0];

    switch (action) {
      case "start-cron": {
        const result = await launchReinforcedSkillsWorkspaceCron({
          workspaceId: workspace.sId,
        });
        if (result.isErr()) {
          return new Err(result.error);
        }
        return new Ok({
          display: "text",
          value: `Reinforced skills cron workflow started for workspace ${workspace.sId}.`,
        });
      }
      case "stop-cron": {
        await stopReinforcedSkillsWorkspaceCron({
          workspaceId: workspace.sId,
          stopReason: "Stopped via poke plugin",
        });
        return new Ok({
          display: "text",
          value: `Reinforced skills cron workflow stopped for workspace ${workspace.sId}.`,
        });
      }
      default:
        return new Err(new Error(`Unknown action: ${action}`));
    }
  },
});
```

- [ ] **Step 2: Create run_reinforced_skills_workflow.ts (workspace level)**

Create `front/lib/api/poke/plugins/workspaces/run_reinforced_skills_workflow.ts`:

```typescript
import { createPlugin } from "@app/lib/api/poke/types";
import { startReinforcedSkillsWorkspaceWorkflow } from "@app/temporal/reinforced_skills/client";
import { Err, Ok } from "@app/types/shared/result";

export const runReinforcedSkillsWorkflowPlugin = createPlugin({
  manifest: {
    id: "run-reinforced-skills-workflow",
    name: "Run Reinforced Skills Workflow",
    description:
      "Kick off a one-off reinforced skills workflow run for this workspace.",
    resourceTypes: ["workspaces"],
    args: {
      useBatchMode: {
        type: "boolean",
        label: "Batch mode",
        description: "Use batch LLM API (cheaper but slower).",
        variant: "checkbox",
        default: false,
      },
    },
  },
  execute: async (auth, _, args) => {
    const workspace = auth.getNonNullableWorkspace();
    const result = await startReinforcedSkillsWorkspaceWorkflow({
      workspaceId: workspace.sId,
      useBatchMode: args.useBatchMode,
    });
    if (result.isErr()) {
      return new Err(result.error);
    }
    const modeDesc = args.useBatchMode ? "batch" : "no batching";
    return new Ok({
      display: "text",
      value: `Reinforced skills workflow started in ${modeDesc} mode (workflowId: ${result.value}).`,
    });
  },
});
```

- [ ] **Step 3: Create run_reinforced_skill.ts (skill level)**

Create `front/lib/api/poke/plugins/skills/run_reinforced_skill.ts`:

```typescript
import { createPlugin } from "@app/lib/api/poke/types";
import { DEFAULT_REINFORCEMENT_LOOKBACK_WINDOW_DAYS } from "@app/lib/reinforced_skills/constants";
import { startReinforcedSkillsWorkspaceWorkflow } from "@app/temporal/reinforced_skills/client";
import { Err, Ok } from "@app/types/shared/result";

export const runReinforcedSkillPlugin = createPlugin({
  manifest: {
    id: "run-reinforced-skill",
    name: "Run Reinforced Skill",
    description:
      "Analyze recent conversations for this skill and suggest improvements to its configuration",
    resourceTypes: ["skills"],
    args: {
      useBatchMode: {
        type: "boolean",
        label: "Use batch mode",
        description:
          "Process conversations via batch LLM API (slower but cheaper). Uncheck to use streaming (faster but more expensive).",
      },
      conversationLookbackDays: {
        type: "number",
        variant: "text",
        label: "Days of conversations to analyze",
        description: "Number of past days of conversations to analyze.",
        default: DEFAULT_REINFORCEMENT_LOOKBACK_WINDOW_DAYS,
      },
      disableNotifications: {
        type: "boolean",
        label: "Disable notifications",
        description:
          "Disable sending notifications to skill editors when new suggestions are created.",
        default: true,
      },
    },
  },
  execute: async (auth, resource, args) => {
    if (!resource) {
      return new Err(new Error("Skill configuration not found"));
    }

    const workspace = auth.getNonNullableWorkspace();

    const result = await startReinforcedSkillsWorkspaceWorkflow({
      workspaceId: workspace.sId,
      useBatchMode: args.useBatchMode,
      skillId: resource.sId,
      conversationLookbackDays: args.conversationLookbackDays,
      disableNotifications: args.disableNotifications,
    });

    if (result.isErr()) {
      return result;
    }

    return new Ok({
      display: "text",
      value: `Reinforced skill workflow started (workflowId: ${result.value}).`,
    });
  },
  isApplicableTo: (auth, resource) => {
    if (!resource) {
      return false;
    }

    return resource.status === "active";
  },
});
```

- [ ] **Step 4: Update workspace plugins index**

In `front/lib/api/poke/plugins/workspaces/index.ts`, add after the existing reinforced agent exports:

```typescript
export * from "./reinforced_skills_workflow";
export * from "./run_reinforced_skills_workflow";
```

- [ ] **Step 5: Update skills plugins index**

In `front/lib/api/poke/plugins/skills/index.ts`, add:

```typescript
export * from "./run_reinforced_skill";
```

- [ ] **Step 6: Verify types compile**

Run: `cd /Users/davidebbo/repos/dust/front && npx tsgo --noEmit 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add front/lib/api/poke/plugins/workspaces/reinforced_skills_workflow.ts front/lib/api/poke/plugins/workspaces/run_reinforced_skills_workflow.ts front/lib/api/poke/plugins/skills/run_reinforced_skill.ts front/lib/api/poke/plugins/workspaces/index.ts front/lib/api/poke/plugins/skills/index.ts
git commit -m "feat: add Poke plugins for reinforced skills"
```

---

### Task 14: Final compilation check and lint

**Files:**
- All files created/modified above

- [ ] **Step 1: Run full type check**

Run: `cd /Users/davidebbo/repos/dust/front && npx tsgo --noEmit`
Expected: No errors. Fix any issues found.

- [ ] **Step 2: Run lint**

Run: `cd /Users/davidebbo/repos/dust/front && npm run lint 2>&1 | tail -30`
Expected: No new lint errors from our files. Fix any issues.

- [ ] **Step 3: Final commit if needed**

If any fixes were applied:
```bash
git add -u
git commit -m "fix: resolve compilation and lint issues for reinforced skills"
```
