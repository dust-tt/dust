import { TOOL_NAME_SEPARATOR } from "@app/lib/actions/constants";
import type { MCPToolConfigurationType } from "@app/lib/actions/mcp";
import { buildToolSpecification } from "@app/lib/actions/mcp";
import { tryListMCPTools } from "@app/lib/actions/mcp_actions";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { isJITMCPServerView } from "@app/lib/actions/mcp_internal_actions/utils";
import type { StepContext } from "@app/lib/actions/types";
import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import {
  isServerSideMCPServerConfiguration,
  isServerSideMCPServerConfigurationWithName,
  isServerSideMCPToolConfiguration,
} from "@app/lib/actions/types/guards";
import { computeStepContexts } from "@app/lib/actions/utils";
import { createClientSideMCPServerConfigurations } from "@app/lib/api/actions/mcp_client_side";
import { categorizeConversationRenderErrorMessage } from "@app/lib/api/assistant/errors";
import {
  constructPromptMultiActions,
  renderToolUseDisabledUserMessage,
} from "@app/lib/api/assistant/generation";
import { buildToolsetsContext } from "@app/lib/api/assistant/global_agents/configurations/dust/dust";
import {
  globalAgentInjectsToolsets,
  globalAgentInjectsUserContext,
  globalAgentInjectsWorkspaceContext,
} from "@app/lib/api/assistant/global_agents/prompt_context";
import {
  buildUserContext,
  buildWorkspaceContext,
} from "@app/lib/api/assistant/global_agents/sidekick_context";
import { getJITServers } from "@app/lib/api/assistant/jit_actions";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";
import { getCompletionDuration } from "@app/lib/api/assistant/messages";
import { getSkillServers } from "@app/lib/api/assistant/skill_actions";
import {
  renderEquippedSkillsUserMessage,
  renderFavoriteSkillsUserMessage,
} from "@app/lib/api/assistant/skills_rendering";
import {
  buildAuditLogTarget,
  emitAuditLogEventDirect,
} from "@app/lib/api/audit/workos_audit";
import { getStreamLLM } from "@app/lib/api/llm";
import { isFreeUsageBlocked } from "@app/lib/api/llm/free_usage";
import type { LLMTraceContext } from "@app/lib/api/llm/traces/types";
import {
  getByokUserFacingLLMErrorMessage,
  getUserFacingLLMErrorMessage,
  LLM_ERROR_TYPE_TO_CATEGORY,
} from "@app/lib/api/llm/types/errors";
import { systemPromptToText } from "@app/lib/api/llm/types/options";
import { DEFAULT_MCP_TOOL_RETRY_POLICY } from "@app/lib/api/mcp";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { DurationRecorder } from "@app/lib/duration_recorder";
import {
  AgentMessageContentParser,
  getDelimitersConfiguration,
} from "@app/lib/llms/agent_message_content_parser";
import { TOOL_SEARCH_TOOL } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/tool_search";
import {
  parseAnthropicToolSearchBlock,
  TOOL_SEARCH_SERVER_TOOL_NAMES,
} from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/tool_search_passthrough";
import {
  isToolDeferred,
  isToolSearchEnabledForModel,
} from "@app/lib/model_constructors/types/tool_search";
import { getModelTierAccessErrorForAgentConfiguration } from "@app/lib/model_tiers/access";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { ProviderCredentialResource } from "@app/lib/resources/provider_credential_resource";
import { constructProjectContext } from "@app/lib/resources/skill/code_defined/global/projects";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import logger from "@app/logger/logger";
import tracer from "@app/logger/tracer";
import {
  updateAgentMessageDBAndMemory,
  updateResourceAndPublishEvent,
} from "@app/temporal/agent_loop/activities/common";
import { METRICS } from "@app/temporal/agent_loop/activities/instrumentation";
import { RUN_MODEL_MAX_RETRIES } from "@app/temporal/agent_loop/config";
import type { AgentLoopContextProvider } from "@app/temporal/agent_loop/lib/agent_loop_context_provider/types";
import { getOutputFromLLMStream } from "@app/temporal/agent_loop/lib/get_output_from_llm";
import { makeRunModelLLMError } from "@app/temporal/agent_loop/lib/run_model_errors";
import type {
  AgentActionsEvent,
  AgentConfigurationType,
} from "@app/types/assistant/agent";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
import type {
  AgentMessageType,
  UserMessageOrigin,
} from "@app/types/assistant/conversation";
import type { ModelConversationTypeMultiActions } from "@app/types/assistant/generation";
import { isTextContent } from "@app/types/assistant/generation";
import { isByokProviderId } from "@app/types/assistant/models/providers";
import { isComputerFeatureEnabled } from "@app/types/shared/feature_flags";
import type { ModelId } from "@app/types/shared/model_id";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";
import { startActiveObservation } from "@langfuse/tracing";
import { Context, heartbeat } from "@temporalio/activity";
import assert from "assert";

const ASK_USER_QUESTION_BLOCKED_ORIGINS: readonly UserMessageOrigin[] = [
  "api",
  "cli",
  "cli_programmatic",
  "email",
  "excel",
  "gsheet",
  "make",
  "n8n",
  "powerpoint",
  "raycast",
  "slack_workflow",
  "teams",
  "transcript",
  "zapier",
  "zendesk",
  "onboarding_conversation",
  "reinforced_skill_notification",
  "reinforcement",
];

// Retryable model errors stop retrying at RUN_MODEL_MAX_RETRIES even though the activity retry
// policy allows more attempts: the extra attempts only serve non-model failures (worker-shutdown
// interruptions, timeouts, internal errors). Exported for tests.
export function shouldSurfaceModelError({
  isRetryable,
  attempt,
}: {
  isRetryable: boolean;
  attempt: number;
}): boolean {
  return !isRetryable || attempt >= RUN_MODEL_MAX_RETRIES;
}

// Builds the JSON blob whose token count estimates how many tokens the tool
// definitions actually cost in context, for the model's token budget. When
// tool search is active, deferred (non-eager) tool schemas are excluded from
// the model's context until discovered, so they must not count toward the
// budget the same way eager specs do: only eager specs, plus the tool-search
// tool itself, are actually in context up front.
export function buildToolDefinitionsForTokenCount(
  specifications: AgentActionSpecification[],
  toolSearchEnabled: boolean
): string {
  const specsInContext = toolSearchEnabled
    ? specifications.filter(
        (specification) => !isToolDeferred(specification, toolSearchEnabled)
      )
    : specifications;
  return JSON.stringify([
    ...(toolSearchEnabled ? [TOOL_SEARCH_TOOL] : []),
    ...specsInContext.map((s) => ({
      name: s.name,
      description: s.description,
      inputSchema: s.inputSchema,
    })),
  ]);
}

// Concatenate two content strings, ensuring at least one whitespace character
// between them when both are non-empty. This prevents words from being glued
// together across successive LLM calls.
function concatWithNewlineBoundary(
  previous: string | null,
  current: string | null
): string {
  if (!previous?.length || !current?.length) {
    return (previous ?? "") + (current ?? "");
  }
  const prevEndsWs = /\s$/.test(previous);
  const currStartsWs = /^\s/.test(current);
  if (!prevEndsWs && !currStartsWs) {
    return previous + "\n" + current;
  }
  return previous + current;
}

// TODO(2026-07-06 flav): Avoid leaking provider specifics in the agent loop. The Anthropic
// passthrough parsing below (block shapes, server tool names) belongs behind a
// provider-agnostic dispatch keyed on the passthrough provider id.
function getReplayedToolNames(
  modelConversation: ModelConversationTypeMultiActions,
  missingActionCatcherFunctionCallIds: Set<string>
): string[] {
  const toolNames = new Set<string>();

  for (const message of modelConversation.messages) {
    switch (message.role) {
      case "assistant":
        for (const content of message.contents) {
          if (
            content.type === "function_call" &&
            !missingActionCatcherFunctionCallIds.has(content.value.id)
          ) {
            // Missing-action catcher calls remain in the replay so the model
            // sees their error, but their attempted names were never tools.
            toolNames.add(content.value.name);
          }
          if (
            content.type === "provider_passthrough" &&
            content.value.provider === "anthropic"
          ) {
            // OpenAI keeps loaded definitions in the replayed tool_search_output
            // item. Anthropic requires referenced tools in the current request.
            const block = parseAnthropicToolSearchBlock(content.value.block);

            if (
              block?.type === "tool_search_tool_result" &&
              block.content.type === "tool_search_tool_search_result"
            ) {
              for (const ref of block.content.tool_references) {
                // The search can match the tool search tool itself. Never
                // synthesize a replay placeholder for it: the Anthropic client
                // prepends the real server tool, and a placeholder would
                // duplicate its name in the request.
                if (
                  TOOL_SEARCH_SERVER_TOOL_NAMES.some(
                    (name) => name === ref.tool_name
                  )
                ) {
                  continue;
                }
                toolNames.add(ref.tool_name);
              }
            }
          }
        }
        break;
      case "function":
      case "compaction":
      case "user":
        break;
      default:
        assertNever(message);
    }
  }

  return [...toolNames];
}

function buildReplayOnlyToolSpecification(
  name: string
): AgentActionSpecification {
  return {
    name,
    description:
      "Replay-only placeholder for a historical tool call. " +
      "This tool is not available for new calls.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: true,
    },
  };
}

// A custom agent's configured tools are its identity: they stay in the eagerly
// loaded set so the model always sees them instead of having to discover them
// through tool search. The set is small and stable per agent version, so the
// cached tool prefix stays byte-stable. Global agents keep the curated per-tool
// metadata flags, and conversation, skill and JIT provided tools stay deferred
// so mid-conversation additions append to the deferred catalog instead of
// rewriting the prefix.
export function buildBaseSpecifications(
  availableActions: MCPToolConfigurationType[],
  agentConfiguration: Pick<AgentConfigurationType, "sId" | "actions">
): AgentActionSpecification[] {
  const isCustomAgent = !isGlobalAgentId(agentConfiguration.sId);
  // Tools are matched to configured actions through the configuration's
  // persisted id, not the server view id: several configurations of the same
  // internal server share one view (e.g. two query_tables actions), and
  // runtime-built JIT and skill servers reuse those views too with a synthetic
  // id of -1. Matching on the view id would wrongly promote JIT tools that
  // appear mid-conversation, rewriting the cached tool prefix.
  const agentActionModelIds = new Set(
    agentConfiguration.actions
      .filter(isServerSideMCPServerConfiguration)
      .map((action) => action.id)
      .filter((id) => id !== -1)
  );

  return availableActions
    .map((action) => {
      const specification = buildToolSpecification(action);
      if (
        isCustomAgent &&
        isServerSideMCPToolConfiguration(action) &&
        agentActionModelIds.has(action.id)
      ) {
        return { ...specification, eager: true };
      }

      return specification;
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

// Replayed tools keep their intrinsic `eager` flag: providers resolve deferred
// tools from the replayed history, and promoting them would invalidate the
// cached tool prefix. We only append placeholders for replayed tools that are
// no longer configured, since every tool referenced in history must have a
// definition.
export function buildSpecificationsWithReplayPlaceholders(
  baseSpecifications: AgentActionSpecification[],
  {
    modelConversation,
    missingActionCatcherFunctionCallIds = new Set(),
  }: {
    modelConversation: ModelConversationTypeMultiActions;
    missingActionCatcherFunctionCallIds?: Set<string>;
  }
): {
  specifications: AgentActionSpecification[];
  missingReplayedToolNames: string[];
} {
  const currentToolNames = new Set(baseSpecifications.map((spec) => spec.name));
  const missingReplayedToolNames = getReplayedToolNames(
    modelConversation,
    missingActionCatcherFunctionCallIds
  )
    .filter((name) => !currentToolNames.has(name))
    .sort();

  return {
    specifications: [
      ...baseSpecifications,
      ...missingReplayedToolNames.map((name) =>
        buildReplayOnlyToolSpecification(name)
      ),
    ].sort((left, right) => left.name.localeCompare(right.name)),
    missingReplayedToolNames,
  };
}

// This method is used by the multi-actions execution loop to pick the next action to execute and
// generate its inputs.
export async function runModel(
  auth: Authenticator,
  {
    contextProvider,
    runIds,
    step,
    functionCallStepContentIds,
    durationRecorder,
    activityTimeoutDeadlineMs,
    forceDisableToolUse = false,
  }: {
    contextProvider: AgentLoopContextProvider;
    runIds: string[];
    step: number;
    functionCallStepContentIds: Record<string, ModelId>;
    durationRecorder: DurationRecorder;
    activityTimeoutDeadlineMs: number;
    // Set when the previous step came back empty: force the final generation.
    forceDisableToolUse?: boolean;
  }
): Promise<{
  actions: AgentActionsEvent["actions"];
  runId: string;
  functionCallStepContentIds: Record<string, ModelId>;
  stepContexts: StepContext[];
  // The step produced nothing at all: the loop should run one more step with
  // tool use disabled to force a final answer.
  retryWithoutTools?: boolean;
} | null> {
  const runAgentData = contextProvider.runtimeData;
  const { agentConfiguration, conversation, userMessage, agentMessage } =
    runAgentData;

  // Compute the citations offset by summing citations allocated to all past actions for this message.
  const citationsRefsOffset = agentMessage.actions.reduce(
    (total, action) => total + (action.citationsAllocated || 0),
    0
  );

  const now = Date.now();

  const localLogger = logger.child({
    workspaceId: conversation.owner.sId,
    conversationId: conversation.sId,
    agentConfigurationId: agentConfiguration.sId,
    multiActionLoopIteration: step,
  });

  localLogger.info("Starting multi-action loop iteration");

  const modelInfo = runAgentData.modelInfo;

  async function publishAgentError(
    error: {
      code: string;
      message: string;
      metadata: Record<string, string | number | boolean> | null;
    },
    dustRunId?: string
  ): Promise<void> {
    // Check if this is a multi_actions_error that hit max retries
    const logMessage = `Agent error: ${error.message}`;

    localLogger.error(
      {
        error,
      },
      logMessage
    );

    await updateResourceAndPublishEvent(auth, {
      event: {
        type: "agent_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error,
        runIds: dustRunId ? [...runIds, dustRunId] : runIds,
      },
      agentMessage,
      conversation,
      step,
    });
  }

  // Helper function to flush all pending tokens from the content parser
  async function flushParserTokens(): Promise<void> {
    for await (const tokenEvent of contentParser.flushTokens()) {
      await updateResourceAndPublishEvent(auth, {
        event: tokenEvent,
        agentMessage,
        conversation,
        step,
      });
    }
  }

  const featureFlags = await getFeatureFlags(auth);

  if (step === 0) {
    const accessError = await getModelTierAccessErrorForAgentConfiguration(
      auth,
      {
        agentSId: agentConfiguration.sId,
        agentName: agentConfiguration.name,
        model: modelInfo.endpoint.modelConfig,
        reasoningEffort: modelInfo.reasoningEffort,
        agentScope: agentConfiguration.scope,
        modelResolutionMethod: agentMessage.modelResolutionMethod,
      }
    );
    if (accessError) {
      await publishAgentError(accessError);
      return null;
    }
  }

  const {
    enabledSkills,
    systemSkills,
    equippedSkills,
    favoriteSkills,
    serverToolsAndInstructions: mcpActions,
    hasSelectedSpacesOutsideAgentScope,
  } = await startActiveObservation("resolve-tools", async () => {
    const attachments = await listAttachments(auth, { conversation });
    const jitServers = await getJITServers(auth, {
      agentConfiguration,
      conversation,
      attachments,
    });

    const clientSideMCPServerIds = [
      ...(userMessage.context.clientSideMCPServerIds ?? []),
    ];

    const clientSideMCPActionConfigurations =
      await createClientSideMCPServerConfigurations(
        auth,
        clientSideMCPServerIds
      );

    const {
      effectiveSpaceIds,
      enabledSkills,
      systemSkills,
      equippedSkills,
      favoriteSkills,
      hasSelectedSpacesOutsideAgentScope,
    } = await SkillResource.listForAgentLoop(auth, runAgentData);

    const { skillServers, systemSkillServers } = await getSkillServers(auth, {
      effectiveSpaceIds,
      enabledSkills,
      systemSkills,
    });

    const serverToolsAndInstructions = await startActiveObservation(
      "list-mcp-tools",
      () =>
        tryListMCPTools(
          auth,
          {
            agentConfiguration,
            conversation,
            agentMessage,
            userMessage,
            clientSideActionConfigurations: clientSideMCPActionConfigurations,
          },
          { jitServers, skillServers, systemSkillServers }
        )
    );

    return {
      hasSelectedSpacesOutsideAgentScope,
      enabledSkills,
      equippedSkills,
      favoriteSkills,
      systemSkills,
      serverToolsAndInstructions,
    };
  });
  durationRecorder.record(METRICS.TIME_TO_TOOLS_RESOLVED);

  // Filter out ask_user_question when no human is available to answer: origins with no
  // interactive reply surface, or sub-agent runs (conversation depth > 0) where the
  // "user" is the parent agent rather than a human.
  const supportsInteractiveQuestions =
    !ASK_USER_QUESTION_BLOCKED_ORIGINS.includes(userMessage.context.origin) &&
    conversation.depth === 0;

  const filteredMcpActions = supportsInteractiveQuestions
    ? mcpActions
    : mcpActions.filter((s) => s.serverName !== "ask_user_question");

  const isLastStep = step === agentConfiguration.maxStepsPerRun;

  // On the last step we force the agent to run the generation: the tools are
  // still sent, so the request keeps the same shape as previous steps (stable
  // tool definitions preserve prompt caching and keep tool references in the
  // replayed history resolvable), but the model is forbidden from calling them
  // (tool choice "none"). Same treatment after an empty step.
  const disableToolUse = isLastStep || forceDisableToolUse;
  const availableActions = filteredMcpActions.flatMap((s) => s.tools);

  let fallbackPrompt = "You are a conversational agent";
  if (agentConfiguration.actions.length || availableActions.length > 0) {
    fallbackPrompt += " with access to tool use.";
  } else {
    fallbackPrompt += ".";
  }

  let toolsetsContext: string | undefined;
  const hasToolsetsAction = agentConfiguration.actions.some((action) =>
    isServerSideMCPServerConfigurationWithName(action, "toolsets")
  );
  if (globalAgentInjectsToolsets(agentConfiguration.sId) && hasToolsetsAction) {
    const allToolsets =
      await MCPServerViewResource.listBySpaceIdsEnsuringAutoViews(auth, [], {
        includeGlobalSpace: true,
        // isJITMCPServerView inspects tool input schemas.
        includeHeavyAttributes: [
          "authorization",
          "cachedTools",
          "customHeaders",
          "lastError",
          "sharedSecret",
        ],
      });
    const filteredToolsets = allToolsets.filter((toolset) => {
      const mcpServerView = toolset.toJSON();
      return (
        isJITMCPServerView(mcpServerView) &&
        mcpServerView.server.availability !== "auto_hidden_builder"
      );
    });
    toolsetsContext = buildToolsetsContext(filteredToolsets);
  }

  let userContext: string | undefined;
  if (globalAgentInjectsUserContext(agentConfiguration.sId) && auth.user()) {
    userContext = (await buildUserContext(auth)) ?? undefined;
  }

  let workspaceContext: string | undefined;
  if (globalAgentInjectsWorkspaceContext(agentConfiguration.sId)) {
    workspaceContext = await buildWorkspaceContext(auth);
  }

  const projectContext = await constructProjectContext(auth, {
    conversation,
  });

  const isNewFileExplorer = conversation.metadata?.useFileSystem === true;
  const hasSandboxTools = isComputerFeatureEnabled(featureFlags);
  const disableFormattingPrompt = featureFlags.includes(
    "disable_formatting_prompt"
  );

  const prompt = constructPromptMultiActions(auth, {
    userMessage,
    agentConfiguration,
    fallbackPrompt,
    modelInfo,
    hasAvailableActions: availableActions.length > 0,
    conversation,
    serverToolsAndInstructions: filteredMcpActions,
    systemSkills,
    toolsetsContext,
    userContext,
    workspaceContext,
    projectContext,
    isNewFileExplorer,
    hasSandboxTools,
    disableFormattingPrompt,
    hasSelectedSpacesOutsideAgentScope,
  });
  // Only the shared skills message receives the leading skills cache breakpoint.
  const leadingMessages = removeNulls([
    renderEquippedSkillsUserMessage(equippedSkills),
    renderFavoriteSkillsUserMessage(favoriteSkills),
  ]);

  const modelConfig = modelInfo.endpoint.modelConfig;

  // Specs carry the intrinsic `eager` property only. Whether a non-eager tool is
  // deferred behind tool search is a provider-specific policy applied downstream.
  const toolSearchEnabled = isToolSearchEnabledForModel(modelConfig);
  const baseSpecifications: AgentActionSpecification[] =
    buildBaseSpecifications(availableActions, agentConfiguration);

  // Count the number of tokens used by the functions presented to the model.
  // This is a rough estimate of the number of tokens.
  const tools = buildToolDefinitionsForTokenCount(
    baseSpecifications,
    toolSearchEnabled
  );

  // Turn the conversation into a digest that can be presented to the model.
  const promptText = systemPromptToText(prompt);
  const modelConversationRes = await startActiveObservation(
    "render-conversation",
    () =>
      tracer.trace("renderConversationForModel", async () =>
        contextProvider.render({
          model: modelConfig,
          prompt: promptText,
          tools,
          allowedTokenCount:
            modelConfig.contextSize - modelConfig.generationTokensCount,
          agentConfiguration,
          leadingMessages,
          enabledSkills,
          metricsCaller: "agent_loop",
        })
      )
  );
  durationRecorder.record(METRICS.TIME_TO_CONVERSATION_RENDERED);

  if (modelConversationRes.isErr()) {
    const categorizedError = categorizeConversationRenderErrorMessage(
      modelConversationRes.error
    );
    if (categorizedError) {
      await publishAgentError({
        code: "conversation_render_error",
        message: categorizedError.publicMessage,
        metadata: {
          category: categorizedError.category,
          errorTitle: categorizedError.errorTitle,
        },
      });
      return null;
    }

    await publishAgentError({
      code: "conversation_render_error",
      message: `Error rendering conversation for model: ${modelConversationRes.error.message}`,
      metadata: null,
    });

    return null;
  }

  if (disableToolUse) {
    // Tool choice "none" alone leaves the model with nothing to do; spell it out
    // so it writes an answer. Its tokens sit outside the render budget.
    modelConversationRes.value.modelConversation.messages.push(
      renderToolUseDisabledUserMessage()
    );
  }

  const { specifications, missingReplayedToolNames } =
    buildSpecificationsWithReplayPlaceholders(baseSpecifications, {
      modelConversation: modelConversationRes.value.modelConversation,
      missingActionCatcherFunctionCallIds: new Set(
        modelConversationRes.value.missingActionCatcherFunctionCallIds
      ),
    });

  if (missingReplayedToolNames.length > 0) {
    localLogger.info(
      { missingReplayedToolNames },
      "Replayed tools missing from current specifications"
    );
  }

  // Temporarily adding this to check if we can consider contents property only in llms
  const unexpectedMessage =
    modelConversationRes.value.modelConversation.messages.find(
      (m) => m.role === "assistant" && !m.contents && m.content
    );
  if (unexpectedMessage) {
    logger.error(
      {
        conversationId: conversation.sId,
        agentMessageId: agentMessage.sId,
        step,
      },
      "Found assistant message with legacy content field instead of contents array"
    );
  }

  // Check that specifications[].name are unique. This can happen if the user overrides two actions
  // names with the same name (advanced settings). We return an actionable error if that's the case
  // as we want to keep that as an invariant when interacting with models.
  const seen = new Set<string>();
  for (const spec of specifications) {
    if (seen.has(spec.name)) {
      await publishAgentError({
        code: "duplicate_specification_name",
        message:
          `Found multiple tools named "${spec.name}". ` +
          "Each tool needs a unique name so the agent can specify which one to use.",
        metadata: null,
      });

      return null;
    }
    seen.add(spec.name);
  }

  const contentParser = new AgentMessageContentParser(
    agentConfiguration,
    agentMessage.sId,
    getDelimitersConfiguration(modelInfo)
  );

  const traceContext: LLMTraceContext = {
    operationType: "agent_conversation",
    agentConfigurationId: agentConfiguration.sId,
    conversationId: conversation.sId,
    userId: auth.user()?.sId,
    workspaceId: conversation.owner.sId,
    // Lets the LLM call site classify free usage (e.g. sidekick) and enforce the
    // per-user free-usage cost cap.
    userMessageOrigin: userMessage.context.origin,
  };

  // Enforce the per-user daily free-usage cost cap before running a free call
  // (e.g. sidekick). Runs per step, so a runaway free loop is stopped mid-run.
  if (await isFreeUsageBlocked(auth, traceContext)) {
    await publishAgentError({
      code: "free_usage_limit_reached",
      message:
        "You have reached the free usage credits cap for this 24h period. Please try again later.",
      metadata: null,
    });
    return null;
  }

  const credentials = await getLlmCredentials(auth, {
    skipEmbeddingApiKeyRequirement: true,
  });

  const llm = await getStreamLLM(auth, {
    credentials,
    modelInfo,
    context: traceContext,
    omittedThinking: agentConfiguration.omittedThinking,
    // Custom trace input: show only the last user message instead of full conversation.
    getTraceInput: (conv) => {
      const lastUserMessage = conv.messages.findLast(
        (msg) => msg.role === "user"
      );
      return lastUserMessage?.content
        .filter(isTextContent)
        .map((item) => item.text)
        .join("\n");
    },
    // Custom trace output: only set on final call (no tool calls, has content).
    getTraceOutput: (output) =>
      !output.toolCalls?.length && output.content ? output.content : undefined,
  });

  // The model is listed as supported but no client (legacy or new router) can
  // serve it. Surface an agent error instead of returning silently, which would
  // leave the message pending and the UI stuck on "Thinking…" indefinitely.
  if (llm === null) {
    await publishAgentError({
      code: "model_not_available",
      message:
        `The model you selected (${modelConfig.modelId}) ` +
        `is not available. Please edit the agent to use another model ` +
        `(advanced settings in the Instructions panel).`,
      metadata: null,
    });

    return null;
  }

  const metadata = llm.getMetadata();

  const modelInteractionStartDate = performance.now();

  // Heartbeat before starting the LLM stream to ensure the activity is still
  // considered alive after potentially long setup operations (MCP tools
  // listing, conversation rendering, etc.).
  heartbeat();

  localLogger.info(
    {
      modelId: modelConfig.modelId,
      messageCount:
        modelConversationRes.value.modelConversation.messages.length,
      toolCount: specifications.length,
    },
    "[LLM stream] Starting (agent loop)"
  );

  if (modelConversationRes.value.prunedContext && !agentMessage.prunedContext) {
    await updateAgentMessageDBAndMemory(auth, {
      agentMessage,
      update: {
        type: "prunedContext",
        prunedContext: true,
      },
    });

    await updateResourceAndPublishEvent(auth, {
      event: {
        type: "agent_context_pruned",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
      },
      agentMessage,
      conversation,
      step,
    });
  }

  durationRecorder.record(METRICS.TIME_TO_PROVIDER_CALL);

  const getOutputFromActionResponse = await getOutputFromLLMStream(auth, {
    modelConversationRes,
    conversation,
    toolSearchEnabled,
    disableToolUse,
    userMessage,
    specifications,
    flushParserTokens,
    contentParser,
    agentMessage,
    step,
    agentConfiguration,
    model: modelConfig,
    activityTimeoutDeadlineMs,
    publishAgentError,
    prompt,
    llm,
    updateResourceAndPublishEvent,
  });

  const modelInteractionEndDate = performance.now();
  durationRecorder.record(METRICS.TIME_TO_STREAM_DONE);

  if (getOutputFromActionResponse.isErr()) {
    const error = getOutputFromActionResponse.error;

    switch (error.type) {
      case "shouldRetryMessage": {
        const { type, isRetryable } = error.content;
        const errorDustRunId = llm?.getTraceId();
        const currentAttempt = Context.current().info.attempt;
        const plan = auth.getNonNullablePlan();

        if (
          plan.isByok &&
          isByokProviderId(modelConfig.providerId) &&
          (type === "authentication_error" || type === "permission_error")
        ) {
          const invalidatedCredential =
            await ProviderCredentialResource.markAsUnhealthy(auth, {
              providerId: modelConfig.providerId,
            });

          if (invalidatedCredential) {
            void emitAuditLogEventDirect({
              workspace: auth.getNonNullableWorkspace(),
              action: "credentials.invalidated",
              actor: {
                type: "system",
                id: "byok_health_check",
                name: "BYOK Health Check",
              },
              targets: [
                buildAuditLogTarget(
                  "workspace",
                  auth.getNonNullableWorkspace()
                ),
                buildAuditLogTarget("credential", {
                  sId: invalidatedCredential.sId,
                  name: modelConfig.providerId,
                }),
              ],
              context: { location: "internal" },
              metadata: {
                provider_id: modelConfig.providerId,
                reason: "authentication_failed",
              },
            });
          }
        }

        const errorMessage =
          plan.isByok && isByokProviderId(modelConfig.providerId)
            ? getByokUserFacingLLMErrorMessage(type, metadata)
            : getUserFacingLLMErrorMessage(type, metadata);

        if (shouldSurfaceModelError({ isRetryable, attempt: currentAttempt })) {
          await publishAgentError(
            {
              code: "multi_actions_error",
              message: errorMessage,
              metadata: {
                category: LLM_ERROR_TYPE_TO_CATEGORY[type],
              },
            },
            errorDustRunId
          );
          return null;
        }

        // Throw to let Temporal handle the retry via its retry policy.
        throw makeRunModelLLMError({
          type,
          message: errorMessage,
        });
      }
      case "shouldReturnNull":
        return null;
      default:
        assertNever(error);
    }
  }

  const { dustRunId, nativeChainOfThought, output, stopReason } =
    getOutputFromActionResponse.value;

  // Create a new object to avoid mutation
  const updatedFunctionCallStepContentIds = { ...functionCallStepContentIds };

  // It is possible that temporal requested activity cancellation but the
  // activity has not yet received the signal. In that case, the agent message
  // row would have status to cancelled (done via finalizeCancellationActivity).
  const messageRes = await ConversationResource.getMessageByIdInConversation(
    auth,
    conversation,
    agentMessage.sId,
    agentMessage.version
  );

  if (messageRes.isErr()) {
    logger.info("Agent message not found, stopping");
    return null;
  }

  const messageRow = messageRes.value;

  if (!messageRow.agentMessage) {
    logger.info("Agent message not found, stopping");
    return null;
  }

  if (messageRow.agentMessage.status === "cancelled") {
    logger.info("Agent message cancelled, stopping");
    return null;
  }

  // Create AgentStepContent for each content item (reasoning, text, function calls)
  // This replaces the original agent_step_content event emission
  const stepContents = await AgentStepContentResource.createNewVersions(
    output.contents.map((content, index) => ({
      workspaceId: conversation.owner.id,
      agentMessageId: agentMessage.agentMessageId,
      step,
      index,
      type: content.type,
      value: content,
      // Same run id appended to AgentMessage.runIds below. Lets consumption attribution join a
      // RunUsage (RunModel.dustRunId) to the contents this run emitted.
      dustRunId,
    }))
  );

  for (const [i, content] of output.contents.entries()) {
    // If this is a function call content, track the step content ID
    if (content.type === "function_call") {
      updatedFunctionCallStepContentIds[content.value.id] = stepContents[i].id;
    }
  }

  // Store the contents for returning to the caller
  // These will be added to agentMessage.contents in the calling function

  if (!output.actions.length) {
    // Successful generation.
    const processedContent = contentParser.getContent() ?? "";

    // The answer may have been streamed in an earlier step (text emitted before
    // a tool call), so an empty step is not an empty message.
    const answerSoFar = concatWithNewlineBoundary(
      agentMessage.content,
      processedContent
    );

    // No tool call and no text at all: the model produced no answer, either
    // because it ran out of iterations or because the turn came back empty.
    // Surface a retryable error, since publishing a success would silently end
    // the run.
    if (!answerSoFar.length) {
      // The provider ended the turn with nothing usable: no tool call, no text
      // here, no text in an earlier step. The stop reason and the block shape
      // are the only way to tell the causes apart (a turn cut mid-thinking, an
      // empty text block, or no content block at all), so log both.
      const emptyTurnLogFields = {
        stopReason: stopReason ?? "unknown",
        contentCount: output.contents.length,
        contentTypes: output.contents.map((c) => c.type),
        reasoningEffort: modelInfo.reasoningEffort,
        chainOfThoughtLength: (
          nativeChainOfThought ||
          contentParser.getChainOfThought() ||
          ""
        ).length,
        prunedContext: modelConversationRes.value.prunedContext,
        inputTokens: modelConversationRes.value.tokensUsed,
        toolSearchEnabled,
        toolCount: specifications.length,
      };

      // Nothing at all came back: no tool call, no text here, no text in an
      // earlier step. Rather than failing the message, run one more step with
      // tool use disabled to force a final answer. The retry is a new step so
      // it gets its own trace and run id.
      if (!disableToolUse) {
        localLogger.warn(
          { modelId: modelConfig.modelId, ...emptyTurnLogFields },
          "Empty model turn, retrying in a new step without tool use."
        );

        return {
          actions: [],
          runId: dustRunId,
          functionCallStepContentIds: updatedFunctionCallStepContentIds,
          stepContexts: [],
          retryWithoutTools: true,
        };
      }

      localLogger.warn(
        {
          modelId: modelConfig.modelId,
          isLastStep,
          ...emptyTurnLogFields,
        },
        "No content generated by the agent."
      );

      await publishAgentError(
        isLastStep
          ? {
              code: "max_step_reached",
              message:
                "This agent took too many steps to answer your query. " +
                "Try narrowing down your question or breaking it into smaller parts.",
              metadata: {
                category: "empty_content",
                errorTitle: "Too many steps",
              },
            }
          : {
              code: "empty_content",
              message:
                "The agent stopped without producing an answer. " +
                "This error can be safely retried.",
              metadata: {
                category: "empty_content",
                errorTitle: "No answer generated",
              },
            },
        dustRunId
      );
      return null;
    }

    const chainOfThought =
      (nativeChainOfThought || contentParser.getChainOfThought()) ?? "";

    const completedTs = Date.now();

    const updatedAgentMessage = {
      ...agentMessage,
      chainOfThought: (agentMessage.chainOfThought ?? "") + chainOfThought,
      content: answerSoFar,
      completedTs,
      status: "succeeded",
      completionDurationMs: getCompletionDuration(
        agentMessage.created,
        completedTs,
        agentMessage.actions
      ),
      prunedContext: agentMessage.prunedContext ?? false,
    } satisfies AgentMessageType;

    await updateResourceAndPublishEvent(auth, {
      event: {
        type: "agent_message_success",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        message: updatedAgentMessage,
        // TODO(OBSERVABILITY 2025-11-04): Create a row in run with the associated usage.
        runIds: [...runIds, dustRunId],
      },
      agentMessage,
      conversation,
      step,
      modelInteractionDurationMs:
        modelInteractionEndDate - modelInteractionStartDate,
    });
    localLogger.info("Agent message generation succeeded");

    return {
      actions: [],
      runId: dustRunId,
      functionCallStepContentIds: updatedFunctionCallStepContentIds,
      stepContexts: [],
    };
  }

  // We have actions.
  localLogger.info(
    {
      elapsedMs: Date.now() - now,
    },
    "[ASSISTANT_TRACE] Action inputs generation"
  );

  // Inject a single newline boundary if we streamed visible content in this iteration
  // before yielding actions. This prevents the next iteration's streamed tokens from
  // being appended without whitespace. Only do this if generation tokens are non-empty
  // and the last character is not already whitespace.
  const streamedContentSoFar = contentParser.getContent() ?? "";
  if (
    streamedContentSoFar.length > 0 &&
    !/\s/.test(streamedContentSoFar[streamedContentSoFar.length - 1])
  ) {
    await updateResourceAndPublishEvent(auth, {
      event: {
        type: "generation_tokens",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        text: "\n",
        classification: "tokens",
      },
      agentMessage,
      conversation,
      step,
    });
  }

  // If we have actions and we are on the last step, we error since returning actions would require
  // doing one more step.
  if (isLastStep) {
    await publishAgentError({
      code: "max_step_reached",
      message:
        "The agent reached the maximum number of steps. This error can be safely retried.",
      metadata: {
        category: "empty_content",
        errorTitle: "Too many steps",
      },
    });
    return null;
  }

  const actions: AgentActionsEvent["actions"] = [];

  for (const a of output.actions) {
    // Sometimes models will return a name with a triple underscore instead of a double underscore, we dynamically handle it.
    const actionNamesFromLLM: string[] = removeNulls([
      a.name,
      a.name?.replace("___", TOOL_NAME_SEPARATOR) ?? null,
    ]);

    let action = availableActions.find((ac) =>
      actionNamesFromLLM.includes(ac.name)
    );

    if (!action) {
      if (!a.name) {
        await publishAgentError({
          code: "action_not_found",
          message:
            `The agent attempted to run an invalid action (no name). ` +
            `This model error can be safely retried.`,
          metadata: null,
        });

        return null;
      }
      const mcpServerView =
        await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
          auth,
          "missing_action_catcher"
        );

      // Could happen if the internal server has not already been added
      if (!mcpServerView) {
        await publishAgentError({
          code: "action_not_found",
          message:
            `The agent attempted to run an invalid action (${a.name}). ` +
            `This model error can be safely retried (no server).`,
          metadata: null,
        });
        return null;
      }

      localLogger.warn(
        {
          actionName: a.name,
          availableActions: availableActions.map((a) => a.name),
        },
        "Model attempted to run an action that is not part of the agent configuration but we'll try to catch it."
      );

      assert(
        mcpServerView.internalMCPServerId,
        "Internal MCP server ID is null"
      );

      // Catch-all action.
      action = {
        id: -1,
        sId: generateRandomModelSId(),
        type: "mcp_configuration" as const,
        name: "missing_action",
        originalName: "missing_action",
        description: null,
        dataSources: null,
        tables: null,
        childAgentId: null,
        timeFrame: null,
        jsonSchema: null,
        secretName: null,
        dustProject: null,
        additionalConfiguration: {},
        mcpServerViewId: mcpServerView.sId,
        dustAppConfiguration: null,
        internalMCPServerId: mcpServerView.internalMCPServerId,
        inputSchema: {},
        availability: "auto_hidden_builder",

        permission: "never_ask",
        toolServerId: mcpServerView.internalMCPServerId,
        mcpServerName: "missing_action_catcher" as InternalMCPServerNameType,
        retryPolicy: DEFAULT_MCP_TOOL_RETRY_POLICY,
      };
    }

    actions.push({
      action,
      functionCallId: a.functionCallId ?? null,
    });
  }

  await flushParserTokens();

  const chainOfThought =
    (nativeChainOfThought || contentParser.getChainOfThought()) ?? "";

  agentMessage.content = concatWithNewlineBoundary(
    agentMessage.content,
    contentParser.getContent()
  );

  if (chainOfThought.length) {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    if (!agentMessage.chainOfThought) {
      agentMessage.chainOfThought = "";
    }
    agentMessage.chainOfThought += chainOfThought;
  }

  const newContents = output.contents.map((content) => ({
    step,
    content,
  }));
  agentMessage.contents.push(...newContents);

  const stepContexts = computeStepContexts({
    model: modelConfig,
    stepActions: actions.map((a) => a.action),
    citationsRefsOffset,
  });

  return {
    actions,
    runId: dustRunId,
    functionCallStepContentIds: updatedFunctionCallStepContentIds,
    stepContexts,
  };
}
