import type { AnalyticsVisibleOrigin } from "@app/components/agent_builder/observability/constants";
import { USER_MESSAGE_ORIGIN_LABELS } from "@app/components/agent_builder/observability/constants";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

const SOURCE_ORIGIN_MESSAGES: Partial<
  Record<AnalyticsVisibleOrigin, MessageDescriptor>
> = {
  web: msg`Conversation`,
  extension: msg`Chrome extension`,
  email: msg`Email`,
  reinforcement: msg`Self-improving skills`,
  transcript: msg`Transcript`,
  triggered: msg`Trigger`,
  triggered_programmatic: msg`Trigger`,
  wakeup: msg`Wake-up`,
  onboarding_conversation: msg`Onboarding`,
  analytics_panel: msg`Analytics panel`,
  project_kickoff: msg`Pod Kickoff`,
};

export function getSourceOriginLabel(
  origin: AnalyticsVisibleOrigin,
  t: (descriptor: MessageDescriptor) => string
): string {
  const message = SOURCE_ORIGIN_MESSAGES[origin];
  return message ? t(message) : USER_MESSAGE_ORIGIN_LABELS[origin].label;
}
