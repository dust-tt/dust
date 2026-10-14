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
import type { AutoTierRoutingState } from "@app/lib/api/assistant/tier_routing/state";
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
import type {
  ConversationMetadata,
  ConversationWithoutContentType,
  UserMessageContext,
} from "@app/types/assistant/conversation";
import type { ModelStreamIdType } from "@app/types/assistant/models/auto";
import {
  AUTO_COMPLEX_MODEL_CONFIG,
  AUTO_MODEL_CONFIG,
} from "@app/types/assistant/models/auto";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import { assertNever } from "@app/types/shared/utils/assert_never";

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

// A posted message: ask the decision model which tier it needs.
export type DecideAutoTierRouting = {
  type: "decide";
  conversation: ConversationResource;
  message: {
    content: string;
    context: UserMessageContext;
    userId: string | null;
  };
};

// A steered message, promoted after the running agent message ends: run on the current tier.
export type FollowCurrentAutoTierRouting = {
  type: "follow_current";
  conversation: ConversationWithoutContentType;
};

export type AutoTierRouting =
  | DecideAutoTierRouting
  | FollowCurrentAutoTierRouting;

export type AutoTierRoute = {
  streamId: ModelStreamIdType;
  // The decision's run, billed with the agent message it routes. Absent when no decision was made.
  decisionRunId?: string;
};

type RoutingContext = {
  configured: RoutableStreamId;
  state: AutoTierRoutingState | null;
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
 * @cc [owner:pmilliotte,label:product;security] tier-routing-preserves-access
 * Routing MUST NOT apply to a message whose user cannot run the agent's configured stream: such a
 * message keeps resolving the configured stream, so it hits the same tier access error as without
 * routing.
 */
// Null when routing does not apply to the agent's messages in this conversation.
async function getRoutingContext(
  auth: Authenticator,
  agent: AgentResource,
  metadata: ConversationMetadata
): Promise<RoutingContext | null> {
  const configured = agent.modelConfiguration.modelId;
  if (!isRoutableStreamId(configured)) {
    return null;
  }

  const featureFlags = await getFeatureFlags(auth);
  if (!featureFlags.includes("auto_tier_routing")) {
    return null;
  }

  const state = getAutoTierRoutingState(metadata, agent.sId, configured);
  if (state?.status === "settled") {
    return null;
  }

  const canRun = await canRunConfiguredStream(auth, agent, configured);
  if (!canRun) {
    return null;
  }

  return { configured, state };
}

async function decideAutoTier(
  auth: Authenticator,
  agent: AgentResource,
  { conversation, message }: DecideAutoTierRouting
): Promise<AutoTierRoute | null> {
  const routingContext = await getRoutingContext(
    auth,
    agent,
    conversation.metadata
  );
  if (!routingContext) {
    return null;
  }
  const { configured, state } = routingContext;

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

/**
 * @cc [owner:pmilliotte,label:product] steered-message-follows-current-tier
 * A steered message MUST run on the agent's current routed stream when its routing is still
 * active, without a new decision, and on the configured stream otherwise.
 */
async function followCurrentAutoTier(
  auth: Authenticator,
  agent: AgentResource,
  { conversation }: FollowCurrentAutoTierRouting
): Promise<AutoTierRoute | null> {
  const routingContext = await getRoutingContext(
    auth,
    agent,
    conversation.metadata
  );
  if (!routingContext?.state) {
    return null;
  }

  return { streamId: routingContext.state.currentStreamId };
}

/**
 * Picks the stream an auto agent's message runs on, up to the agent's configured one. Returns null
 * when routing does not apply, in which case the message resolves its configured stream as before.
 */
export async function applyAutoTierRouting(
  auth: Authenticator,
  agent: AgentResource,
  routing: AutoTierRouting
): Promise<AutoTierRoute | null> {
  switch (routing.type) {
    case "decide":
      return decideAutoTier(auth, agent, routing);
    case "follow_current":
      return followCurrentAutoTier(auth, agent, routing);
    default:
      assertNever(routing);
  }
}
