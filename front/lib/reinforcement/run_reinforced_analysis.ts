import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { getLLM } from "@app/lib/api/llm";
import { writeBatchUserMessages } from "@app/lib/api/llm/batch_llm";
import type { LLM } from "@app/lib/api/llm/llm";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type { LLMStreamParameters } from "@app/lib/api/llm/types/options";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import { getSkillInstructionEditsValidationError } from "@app/lib/api/skills/apply_skill_instruction_edits";
import { getLargeWhitelistedModel } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import {
  ALL_TOOLS,
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
import type { SkillSuggestionSource } from "@app/types/suggestions/skill_suggestion";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const REINFORCEMENT_SKILLS_AGENT_ID = "reinforcement_skills";

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
  edit_skill: {
    description:
      "Suggest edits to a skill's instructions and/or configured tools.",
    schema: {
      skillId: z.string().describe("The sId of the skill to modify"),
      instructionEdits: z
        .array(
          z.object({
            old_string: z
              .string()
              .min(1)
              .describe(
                "Exact text to find in the current skill instructions."
              ),
            new_string: z
              .string()
              .describe(
                "Replacement text. Empty string deletes the matched span."
              ),
            expected_occurrences: z
              .number()
              .int()
              .min(1)
              .default(1)
              .describe(
                "How many times old_string is expected to appear. Used to validate the edit is still applicable."
              ),
          })
        )
        .optional()
        .describe(
          "Sequential search-and-replace operations applied to the skill instructions."
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
    },
  },
};

export function buildReinforcedSkillsSpecifications(): AgentActionSpecification[] {
  return ALL_TOOLS.map((toolName) => {
    const meta = REINFORCED_SKILLS_TOOL_DEFINITIONS[toolName];
    const schema = z.object(meta.schema);
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
  contextId: string
) {
  return {
    visibility: "test" as const,
    metadata: getReinforcedSkillsMetadata(operationType, contextId),
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

/**
 * Create a reinforcement conversation with the initial user message.
 */
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
      successfulToolCalls: [],
      failedToolCalls: [],
    };
  }

  let totalCreated = 0;
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
    case "edit_skill": {
      const parsed = TOOL_SCHEMAS.edit_skill.safeParse(actionArguments);
      if (!parsed.success) {
        const errorMessage = `Invalid arguments for ${toolName}: ${parsed.error.message}`;
        logger.warn(
          { contextId, toolName, error: parsed.error },
          `ReinforcedSkills: invalid LLM response shape for ${operationType}`
        );
        return { suggestionsCreated: 0, error: errorMessage };
      }

      const skill = await SkillResource.fetchById(auth, parsed.data.skillId);
      if (!skill) {
        logger.warn(
          { skillId: parsed.data.skillId, contextId },
          "ReinforcedSkills: skill not found for edit_skill"
        );
        return { suggestionsCreated: 0, error: "Skill not found" };
      }

      const hasInstructionEdits =
        (parsed.data.instructionEdits?.length ?? 0) > 0;
      const hasToolEdits = (parsed.data.toolEdits?.length ?? 0) > 0;
      if (!hasInstructionEdits && !hasToolEdits) {
        return {
          suggestionsCreated: 0,
          error:
            "edit_skill requires at least one instruction edit or tool edit.",
        };
      }

      if (
        parsed.data.instructionEdits &&
        parsed.data.instructionEdits.length > 0
      ) {
        const currentInstructions = skill.instructions ?? "";
        const validationError = getSkillInstructionEditsValidationError(
          currentInstructions,
          parsed.data.instructionEdits
        );
        if (validationError) {
          logger.warn(
            { skillId: parsed.data.skillId, contextId, validationError },
            "ReinforcedSkills: invalid instruction edits"
          );
          return { suggestionsCreated: 0, error: validationError };
        }
      }

      // Mark any existing pending edit suggestions for this skill as outdated.
      // This is not strictly necessary, but it is unclear if we want to allow multiple pending edit suggestions for the same skill.
      const existingPending =
        await SkillSuggestionResource.listBySkillConfigurationId(
          auth,
          skill.sId,
          {
            states: ["pending"],
            kind: "edit",
            sources: ["reinforcement", "synthetic"],
          }
        );
      if (existingPending.length > 0) {
        await SkillSuggestionResource.bulkUpdateState(
          auth,
          existingPending,
          "outdated"
        );
      }

      await SkillSuggestionResource.createSuggestionForSkill(auth, skill, {
        kind: "edit",
        suggestion: {
          instructionEdits: parsed.data.instructionEdits,
          toolEdits: parsed.data.toolEdits,
        },
        analysis: parsed.data.analysis ?? null,
        state: "pending",
        source,
        sourceConversationId: conversation?.id ?? null,
        groupId: null,
      });

      return { suggestionsCreated: 1 };
    }

    default:
      logger.warn(
        { contextId, toolName },
        `ReinforcedSkills: unexpected tool name for ${operationType}`
      );
      return { suggestionsCreated: 0 };
  }
}
