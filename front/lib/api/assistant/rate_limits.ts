import type { Authenticator } from "@app/lib/auth";
import {
  expireRateLimiterKey,
  getRateLimiterCount,
  getTimeframeSecondsFromLiteral,
} from "@app/lib/utils/rate_limiter";
import type { LightWorkspaceType, MaxMessagesTimeframeType } from "@app/types";

export const makeMessageRateLimitKeyForWorkspace = (
  owner: LightWorkspaceType
) => {
  return `postUserMessage:${owner.sId}`;
};

export const makeAgentMentionsRateLimitKeyForWorkspace = (
  owner: LightWorkspaceType,
  maxMessagesTimeframe: MaxMessagesTimeframeType
) => {
  return `workspace:${owner.id}:agent_message_count:${maxMessagesTimeframe}`;
};

export const makeProgrammaticUsageRateLimitKeyForWorkspace = (
  owner: LightWorkspaceType
) => {
  return `workspace:${owner.id}:programmatic_usage_rate_limit`;
};

export async function resetMessageRateLimitForWorkspace(auth: Authenticator) {
  const workspace = auth.getNonNullableWorkspace();
  const plan = auth.getNonNullablePlan();

  await expireRateLimiterKey({
    key: makeMessageRateLimitKeyForWorkspace(workspace),
  });

  await expireRateLimiterKey({
    key: makeAgentMentionsRateLimitKeyForWorkspace(
      workspace,
      plan.limits.assistant.maxMessagesTimeframe
    ),
  });
}

export async function getMessageUsageCount(auth: Authenticator): Promise<{
  count: number;
  limit: number;
}> {
  const workspace = auth.getNonNullableWorkspace();
  const plan = auth.getNonNullablePlan();
  const { maxMessages, maxMessagesTimeframe } = plan.limits.assistant;

  if (maxMessages === -1) {
    // Unlimited messages
    return { count: 0, limit: -1 };
  }

  const result = await getRateLimiterCount({
    key: makeAgentMentionsRateLimitKeyForWorkspace(
      workspace,
      maxMessagesTimeframe
    ),
    timeframeSeconds: getTimeframeSecondsFromLiteral(maxMessagesTimeframe),
  });

  if (result.isErr()) {
    // Return 0 on error to avoid blocking the UI
    return { count: 0, limit: maxMessages };
  }

  return { count: result.value, limit: maxMessages };
}
