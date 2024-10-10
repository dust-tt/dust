import type {
  LightWorkspaceType,
  MaxMessagesTimeframeType,
} from "@dust-tt/types";
import { expireRateLimiterKey } from "@dust-tt/types";

import type { Authenticator } from "@app/lib/auth";

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
