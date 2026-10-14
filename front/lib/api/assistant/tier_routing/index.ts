import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { renderConversationAsText } from "@app/lib/api/assistant/conversation/render_as_text";
import type { RoutableStreamId } from "@app/lib/api/assistant/tier_routing/decide_tier";
import {
  chooseRoutedStream,
  isRoutableStreamId,
} from "@app/lib/api/assistant/tier_routing/decide_tier";
import {
  buildTierRoutingRequest,
  TIER_QUESTION_NAME,
} from "@app/lib/api/assistant/tier_routing/prompt";
import {
  getAutoTierRoutingState,
  nextAutoTierRoutingState,
  withAutoTierRoutingState,
} from "@app/lib/api/assistant/tier_routing/state";
import { selectPreferredSystemOneEndpointForWorkspace } from "@app/lib/api/llm/selectPreferredEndpointForWorkspace";
import { SystemOneLLM } from "@app/lib/api/llm/system_one_llm";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { GPT_6_LUNA } from "@app/lib/model_constructors/types/models";
import type { DecisionScoreAnswer } from "@app/lib/model_constructors/types/output/decisions";
import { getModelTierAccessErrorForAgentConfiguration } from "@app/lib/model_tiers/access";
import type { AgentResource } from "@app/lib/resources/agent_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import { statsDMetrics } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import type { UserMessageContext } from "@app/types/assistant/conversation";
import type { ModelStreamIdType } from "@app/types/assistant/models/auto";
import {
  AUTO_COMPLEX_MODEL_CONFIG,
  AUTO_MODEL_CONFIG,
} from "@app/types/assistant/models/auto";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";

// Bounds the latency routing adds to posting a message. Measured 2026-10-14: 200-750ms warm,
// about 1.1s on a cold connection.
const TIER_ROUTING_TIMEOUT_MS = 2_000;
const HISTORY_MESSAGES_LIMIT = 20;
const HISTORY_MESSAGE_CHARS = 1_500;
const HISTORY_TOTAL_CHARS = 8_000;

const ROUTABLE_STREAM_CONFIGS: Record<
  RoutableStreamId,
  ModelConfigurationType
> = {
  auto: AUTO_MODEL_CONFIG,
  auto_complex: AUTO_COMPLEX_MODEL_CONFIG,
};

export type RouteAutoTierParams = {
  agent: AgentResource;
  conversation: ConversationResource;
  message: {
    content: string;
    context: UserMessageContext;
    userId: string | null;
  };
};

export type AutoTierRoute = {
  streamId: ModelStreamIdType;
  // The decision's run, billed with the agent message it routes.
  decisionRunId: string;
};

async function renderRecentHistory(
  auth: Authenticator,
  conversation: ConversationResource
): Promise<string | null> {
  // oxlint-disable-next-line dust/noExpensiveConversationFetch -- needs message content, paginated to the latest messages
  const conversationRes = await getConversation(
    auth,
    conversation.sId,
    false,
    null,
    { limit: HISTORY_MESSAGES_LIMIT, lastRank: null }
  );
  if (conversationRes.isErr()) {
    return null;
  }

  return renderConversationAsText(conversationRes.value, {
    includeActions: true,
    skipRunningAgentMessages: true,
    truncateMessageChars: HISTORY_MESSAGE_CHARS,
    truncateTotalChars: HISTORY_TOTAL_CHARS,
  });
}

async function canRunConfiguredStream(
  auth: Authenticator,
  agent: AgentResource,
  configured: RoutableStreamId
): Promise<boolean> {
  const accessError = await getModelTierAccessErrorForAgentConfiguration(auth, {
    agentId: agent.sId,
    agentName: agent.name,
    model: ROUTABLE_STREAM_CONFIGS[configured],
    agentScope: agent.scope,
    modelResolutionMethod: configured,
  });

  return accessError === null;
}

/**
 * Picks the stream an auto agent's message runs on: the cheapest tier up to the agent's configured
 * one that the decision model judges enough. Returns null when routing does not apply, in which
 * case the message resolves its configured stream as before.
 */
/**
 * @cc [owner:pmilliotte,label:product;security] tier-routing-preserves-access
 * Routing MUST NOT apply to a message whose user cannot run the agent's configured stream: such a
 * message keeps resolving the configured stream, so it hits the same tier access error as without
 * routing.
 */
export async function routeAutoTier(
  auth: Authenticator,
  { agent, conversation, message }: RouteAutoTierParams
): Promise<AutoTierRoute | null> {
  const configured = agent.modelConfiguration.modelId;
  if (!isRoutableStreamId(configured)) {
    return null;
  }

  const featureFlags = await getFeatureFlags(auth);
  if (!featureFlags.includes("auto_tier_routing")) {
    return null;
  }

  const state = getAutoTierRoutingState(
    conversation.metadata,
    agent.sId,
    configured
  );
  if (state?.status === "settled") {
    return null;
  }

  const canRun = await canRunConfiguredStream(auth, agent, configured);
  if (!canRun) {
    return null;
  }

  const endpoint = await selectPreferredSystemOneEndpointForWorkspace(auth, {
    model: { eq: GPT_6_LUNA },
  });
  if (!endpoint) {
    return null;
  }

  // Sequential: three single queries of different types, cheaper to read than a typed fan-out.
  const history = state ? await renderRecentHistory(auth, conversation) : null;
  const actions = await agent.listActions(auth);
  const credentials = await getLlmCredentials(auth, {
    skipEmbeddingApiKeyRequirement: true,
  });

  const llm = new SystemOneLLM(auth, {
    credentials,
    endpoint,
    context: {
      operationType: "auto_tier_routing",
      agentConfigurationId: agent.sId,
      conversationId: conversation.sId,
      workspaceId: auth.getNonNullableWorkspace().sId,
      userId: message.userId,
      userMessageOrigin: message.context.origin,
      userMessageAuthMethod: message.context.authMethod ?? null,
    },
  });
  const result = await llm.decide(
    buildTierRoutingRequest({
      configured,
      agentName: agent.name,
      agentDescription: agent.description,
      tools: actions.map(({ name, description }) => ({ name, description })),
      history,
      message: message.content,
    }),
    { signal: AbortSignal.timeout(TIER_ROUTING_TIMEOUT_MS) }
  );

  const answer = result.isOk()
    ? result.value.answers.find(
        (a): a is DecisionScoreAnswer =>
          a.type === "score" && a.name === TIER_QUESTION_NAME
      )
    : undefined;

  // Fail open to the configured stream without settling: a provider hiccup says nothing about
  // whether a lower tier is enough.
  if (!answer) {
    statsDMetrics.increment("tier_routing.decision", 1, [
      `configured:${configured}`,
      `routed:${configured}`,
      "outcome:failed_open",
    ]);
    logger.warn(
      {
        agentConfigurationId: agent.sId,
        conversationId: conversation.sId,
        decisionRunId: llm.getTraceId(),
      },
      "Auto tier routing failed open to the configured stream"
    );
    return { streamId: configured, decisionRunId: llm.getTraceId() };
  }

  const routed = chooseRoutedStream(answer, configured);
  const nextState = nextAutoTierRoutingState(configured, routed);
  await conversation.mergeMetadata(
    auth,
    withAutoTierRoutingState(conversation.metadata, agent.sId, nextState)
  );

  statsDMetrics.increment("tier_routing.decision", 1, [
    `configured:${configured}`,
    `routed:${routed}`,
    `outcome:${nextState.status}`,
  ]);

  return { streamId: routed, decisionRunId: llm.getTraceId() };
}
