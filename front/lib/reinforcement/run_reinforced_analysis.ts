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
  hasSuggestionSelfConflict,
  pruneConflictingSkillEditSuggestions,
} from "@app/lib/reinforcement/skill_suggestion_pruning";
import {
  ALL_TOOLS,
  DESCRIBE_MCP_TOOL_NAME,
  type ExploratoryToolCallInfo,
  getReinforcedSkillsMetadata,
  isExploratoryToolName,
  isTerminalToolName,
  type ProcessReinforcedSkillsEventsResult,
  type ReinforcedSkillsOperationType,
  type TerminalToolCallEvent,
  type TerminalToolCallFailure,
  type TerminalToolCallInfo,
  type TerminalToolCallSuccess,
  TOOL_SCHEMAS,
} from "@app/lib/reinforcement/types";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import logger from "@app/logger/logger";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";
import type { SkillSuggestionSource } from "@app/types/suggestions/skill_suggestion";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const REINFORCEMENT_SKILLS_AGENT_ID = "reinforcement";

// Tool schemas for reinforced skills (exploration + terminal).
const REINFORCED_SKILLS_TOOL_DEFINITIONS: Record<
  string,
  { description: string; schema: z.ZodRawShape }
> = {
  get_available_tools: {
    description:
      "Get the list of available tools (MCP servers) that can be added to skills.",
    schema: {},
  },
  [DESCRIBE_MCP_TOOL_NAME]: {
    description:
      "Get detailed information about a specific MCP server: its description, and each tool's name, description, and input parameters. Use this to understand what a tool can do before suggesting instruction changes that reference it.",
    schema: {
      mcpId: z.string().describe("The sId of the MCP server to describe"),
    },
  },
  search_knowledge: {
    description:
      "Search workspace knowledge sources to discover relevant data nodes.",
    schema: {
      query: z
        .string()
        .describe("Natural language query describing the knowledge needed."),
      topK: z
        .number()
        .int()
        .positive()
        .max(10)
        .optional()
        .describe(
          "Maximum number of document hits to retrieve per data source (default: 5, only applies when query is provided)"
        ),
    },
  },
  edit_skill: {
    description:
      "Suggest edits to a skill's instructions and/or configured tools.",
    schema: {
      skillId: z.string().describe("The sId of the skill to modify"),
      instructionEdits: z
        .array(
          z.object({
            targetBlockId: z
              .string()
              .describe(
                'The data-block-id of the block to replace. Use "instructions-root" to replace all instructions.'
              ),
            content: z
              .string()
              .describe(
                "Full HTML replacement content for the block, including its wrapping tag. Must be a single-line string with no literal newlines."
              ),
            type: z.literal("replace"),
          })
        )
        .optional()
        .describe(
          "Block-targeted edits to the skill instructions. Each item targets one block by its data-block-id."
        ),
      toolEdits: z
        .array(
          z.object({
            action: z
              .enum(["add", "remove"])
              .describe("Whether to add or remove the tool"),
            toolId: z
              .string()
              .describe("The identifier of the tool to add or remove"),
          })
        )
        .optional()
        .describe("Tools to add or remove from the skill."),
      analysis: z
        .string()
        .optional()
        .describe("Why this change improves the skill"),
      title: z
        .string()
        .max(25)
        .optional()
        .describe(
          "A short, action-oriented user-facing title for this suggestion (MUST be at most 25 characters). " +
            "Only set this when producing final aggregated suggestions; leave unset for synthetic suggestions."
        ),
    },
  },
  reject_suggestion: {
    description:
      "Reject source suggestions that are very bad quality, not actionable, or too similar to already declined suggestions. " +
      "Use this tool in parallel with edit_skill calls — both are terminal and no further calls will be made after." +
      "Do not use to ingore minor suggestions.",
    schema: {
      sourceSuggestionIds: z
        .array(z.string())
        .min(1)
        .describe(
          "The sIds of the source suggestions to reject. Must include at least one suggestion sId."
        ),
    },
  },
};

const AGGREGATION_EXTRA_FIELDS: z.ZodRawShape = {
  sourceSuggestionIds: z
    .array(z.string())
    .min(1)
    .describe(
      "The sIds of the source suggestions this suggestion is based on. " +
        "Must include at least one suggestion sId."
    ),
};

export function buildReinforcedSkillsSpecifications(
  operationType: ReinforcedSkillsOperationType
): AgentActionSpecification[] {
  const isAggregation = operationType === "reinforcement_aggregate_suggestions";

  return ALL_TOOLS.filter((toolName) => {
    // reject_suggestion is only available during aggregation.
    if (toolName === "reject_suggestion") {
      return isAggregation;
    }
    return true;
  }).map((toolName) => {
    const meta = REINFORCED_SKILLS_TOOL_DEFINITIONS[toolName];
    const schema =
      toolName === "edit_skill" && isAggregation
        ? z.object({ ...meta.schema, ...AGGREGATION_EXTRA_FIELDS })
        : z.object(meta.schema);
    return {
      name: toolName,
      description: meta.description,
      inputSchema: zodToJsonSchema(schema) as JSONSchema,
    };
  });
}

interface CategorizedSkillToolCalls {
  exploratoryToolCalls: ExploratoryToolCallInfo[];
  terminalToolCalls: TerminalToolCallInfo[];
}

export function classifySkillToolCalls(
  events: LLMEvent[]
): CategorizedSkillToolCalls {
  const exploratoryToolCalls: ExploratoryToolCallInfo[] = [];
  const terminalToolCalls: TerminalToolCallInfo[] = [];

  for (const e of events) {
    if (e.type !== "tool_call") {
      continue;
    }
    const { id, name, arguments: args } = e.content;
    if (isExploratoryToolName(name)) {
      exploratoryToolCalls.push({ id, name, arguments: args });
    } else if (isTerminalToolName(name)) {
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
  skillIds: string[]
) {
  return {
    visibility: "test" as const,
    metadata: getReinforcedSkillsMetadata(operationType, skillIds),
    userContextUsername: "reinforcement",
    userContextOrigin: "reinforcement" as const,
    agentConfigurationId: REINFORCEMENT_SKILLS_AGENT_ID,
  };
}

/**
 * Generate a human-readable title for a reinforcement conversation based on
 * the operation type and context (e.g. the analysed conversation sId).
 */
export function reinforcedSkillsConversationTitle(
  operationType: ReinforcedSkillsOperationType,
  contextId: string
): string {
  switch (operationType) {
    case "reinforcement_analyze_conversation":
      return `Reinforced skills analysis of ${contextId}`;
    case "reinforcement_aggregate_suggestions":
      return `Reinforced skills aggregation for ${contextId}`;
    default:
      assertNever(operationType);
  }
}

/**
 * Build LLMStreamParameters for a reinforced skills prompt.
 */
export function buildReinforcedSkillsLLMParams(
  {
    systemPrompt,
    userMessage,
  }: {
    systemPrompt: string;
    userMessage: string;
  },
  operationType: ReinforcedSkillsOperationType
): LLMStreamParameters {
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
    specifications: buildReinforcedSkillsSpecifications(operationType),
  };
}

/**
 * Create a reinforcement conversation with the initial user message.
 */
export async function createReinforcedSkillsConversation(
  auth: Authenticator,
  {
    prompt,
    operationType,
    contextId,
    skillIds,
  }: {
    prompt: { systemPrompt: string; userMessage: string };
    operationType: ReinforcedSkillsOperationType;
    contextId: string;
    skillIds: string[];
  }
): Promise<string> {
  const llmParams = buildReinforcedSkillsLLMParams(prompt, operationType);
  const { conversation: llmConversation, ...llmParamsWithoutConversation } =
    llmParams;
  const writeResult = await writeBatchUserMessages(auth, {
    newMessages: llmConversation.messages,
    title: reinforcedSkillsConversationTitle(operationType, contextId),
    ...llmParamsWithoutConversation,
    ...getReinforcedSkillsDefaultOptions(operationType, skillIds),
  });
  if (writeResult.isErr()) {
    throw writeResult.error;
  }
  return writeResult.value.sId;
}

/**
 * Get the LLM instance configured for reinforced skills analysis.
 */
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
 * Parse tool calls from LLM events and create skill suggestion records.
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
}): Promise<ProcessReinforcedSkillsEventsResult> {
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
      suggestionsRejected: 0,
      approvedSourceSuggestionIds: [],
      successfulToolCalls: [],
      failedToolCalls: [],
    };
  }

  const toolCallEvents = events.filter(
    (e): e is TerminalToolCallEvent =>
      e.type === "tool_call" && isTerminalToolName(e.content.name)
  );
  if (toolCallEvents.length === 0) {
    logger.warn(
      { contextId },
      `ReinforcedSkills: no tool call in batch result for ${operationType}`
    );
    return {
      suggestionsCreated: 0,
      suggestionsRejected: 0,
      approvedSourceSuggestionIds: [],
      successfulToolCalls: [],
      failedToolCalls: [],
    };
  }

  let totalCreated = 0;
  let totalRejected = 0;
  const approvedSourceSuggestionIds: string[] = [];
  const successfulToolCalls: TerminalToolCallSuccess[] = [];
  const failedToolCalls: TerminalToolCallFailure[] = [];

  for (const event of toolCallEvents) {
    const { id, name, arguments: args } = event.content;
    const toolCall: TerminalToolCallInfo = { id, name, arguments: args };
    const result = await createSkillSuggestionsFromToolCall({
      auth,
      toolName: name,
      actionArguments: args,
      source,
      operationType,
      contextId,
      conversation,
    });
    switch (result.type) {
      case "created": {
        totalCreated += result.suggestionsCreated;
        // Collect sourceSuggestionIds from successful edit_skill calls.
        const sourceIds = args.sourceSuggestionIds;
        if (Array.isArray(sourceIds)) {
          approvedSourceSuggestionIds.push(...sourceIds.filter(isString));
        }
        successfulToolCalls.push({
          toolCall,
          message: `Successfully created ${result.suggestionsCreated} suggestion(s).`,
        });
        break;
      }
      case "rejected":
        totalRejected += result.suggestionsRejected;
        successfulToolCalls.push({
          toolCall,
          message: `Successfully rejected ${result.suggestionsRejected} suggestion(s).`,
        });
        break;
      case "error":
        failedToolCalls.push({
          toolCall,
          errorMessage: result.errorMessage,
        });
        break;
      default:
        assertNever(result);
    }
  }

  return {
    suggestionsCreated: totalCreated,
    suggestionsRejected: totalRejected,
    approvedSourceSuggestionIds,
    successfulToolCalls,
    failedToolCalls,
  };
}

type ToolCallResult =
  | { type: "created"; suggestionsCreated: number }
  | { type: "rejected"; suggestionsRejected: number }
  | { type: "error"; errorMessage: string };

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
    case "edit_skill": {
      const parsed = TOOL_SCHEMAS.edit_skill.safeParse(actionArguments);
      if (!parsed.success) {
        logger.warn(
          { contextId, toolName, error: parsed.error },
          `ReinforcedSkills: invalid LLM response shape for ${operationType}`
        );
        return {
          type: "error",
          errorMessage: `Invalid arguments for ${toolName}: ${parsed.error.message}`,
        };
      }

      const skill = await SkillResource.fetchById(auth, parsed.data.skillId);
      if (!skill) {
        logger.warn(
          { skillId: parsed.data.skillId, contextId },
          "ReinforcedSkills: skill not found for edit_skill"
        );
        return { type: "error", errorMessage: "Skill not found" };
      }

      const hasInstructionEdits =
        (parsed.data.instructionEdits?.length ?? 0) > 0;
      const hasToolEdits = (parsed.data.toolEdits?.length ?? 0) > 0;
      if (!hasInstructionEdits && !hasToolEdits) {
        return {
          type: "error",
          errorMessage:
            "edit_skill requires at least one instruction edit or tool edit.",
        };
      }

      if (hasInstructionEdits && !skill.instructionsHtml) {
        return {
          type: "error",
          errorMessage:
            "edit_skill with instructionEdits requires the skill to have instructionsHtml.",
        };
      }

      if (
        hasSuggestionSelfConflict(
          {
            instructionEdits: parsed.data.instructionEdits,
            toolEdits: parsed.data.toolEdits,
          },
          skill.instructionsHtml
        )
      ) {
        return {
          type: "error",
          errorMessage:
            "Suggestion has conflicting edits (overlapping block targets or duplicate tool IDs).",
        };
      }

      // Build sourceConversationIds:
      // - For synthetic suggestions: use the current conversation's model ID.
      // - For reinforcement suggestions: resolve sourceSuggestionIds to conversation model IDs.
      let sourceConversationIds: number[] | null = null;
      if (
        source === "reinforcement" &&
        parsed.data.sourceSuggestionIds &&
        parsed.data.sourceSuggestionIds.length > 0
      ) {
        const sourceSuggestions = await SkillSuggestionResource.fetchByIds(
          auth,
          parsed.data.sourceSuggestionIds
        );
        const ids = sourceSuggestions.flatMap(
          (s) => s.sourceConversationIds ?? []
        );
        sourceConversationIds = ids.length > 0 ? [...new Set(ids)] : null;
      } else if (conversation) {
        sourceConversationIds = [conversation.id];
      }

      const newSuggestion =
        await SkillSuggestionResource.createSuggestionForSkill(auth, skill, {
          kind: "edit",
          suggestion: {
            instructionEdits: parsed.data.instructionEdits,
            toolEdits: parsed.data.toolEdits,
          },
          analysis: parsed.data.analysis ?? null,
          title: parsed.data.title ?? null,
          state: "pending",
          source,
          sourceConversationIds,
        });

      await pruneConflictingSkillEditSuggestions(auth, skill, newSuggestion);

      return { type: "created", suggestionsCreated: 1 };
    }

    case "reject_suggestion": {
      const parsed = TOOL_SCHEMAS.reject_suggestion.safeParse(actionArguments);
      if (!parsed.success) {
        logger.warn(
          { contextId, toolName, error: parsed.error },
          `ReinforcedSkills: invalid LLM response shape for ${operationType}`
        );
        return {
          type: "error",
          errorMessage: `Invalid arguments for ${toolName}: ${parsed.error.message}`,
        };
      }

      const suggestions = await SkillSuggestionResource.fetchByIds(
        auth,
        parsed.data.sourceSuggestionIds
      );

      if (suggestions.length === 0) {
        return {
          type: "error",
          errorMessage: `No suggestions found for sourceSuggestionIds: ${parsed.data.sourceSuggestionIds.join(", ")}`,
        };
      }

      await SkillSuggestionResource.bulkUpdateState(
        auth,
        suggestions,
        "rejected"
      );

      logger.info(
        {
          contextId,
          rejectedCount: suggestions.length,
        },
        `ReinforcedSkills: rejected ${suggestions.length} suggestion(s) via reject_suggestion`
      );

      return { type: "rejected", suggestionsRejected: suggestions.length };
    }

    default:
      logger.warn(
        { contextId, toolName },
        `ReinforcedSkills: unexpected tool name for ${operationType}`
      );
      return {
        type: "error",
        errorMessage: `Unexpected tool name: ${toolName}`,
      };
  }
}
