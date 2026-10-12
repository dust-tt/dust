import type { LLMErrorType } from "@app/lib/api/llm/types/errors";
import type { FormatErrorOptions } from "@app/lib/api_error_messages";
import { API_ERROR_MESSAGES } from "@app/lib/api_error_messages";
import type { UserBlockedReason } from "@app/lib/metronome/user_block";
import type {
  AgentErrorCategory,
  GenericErrorContent,
} from "@app/types/assistant/agent";
import { isAgentErrorCategory } from "@app/types/assistant/agent";
import type { MessageDescriptor } from "@lingui/core";
import { msg, t } from "@lingui/core/macro";

type AgentErrorMessages = {
  title: MessageDescriptor;
  description: MessageDescriptor;
};

const DEFAULT_TITLE = msg`Something went wrong`;
const DEFAULT_DESCRIPTION = msg`An unexpected error occurred.`;

const CONTEXT_LENGTH_EXCEEDED_DESCRIPTION = msg`Your message or retrieved data is too large. Break it into smaller parts or reduce the input size.`;
const STREAM_INTERRUPTED_DESCRIPTION = msg`The connection was interrupted while receiving the response. Try again.`;
const EMPTY_CONTENT_DESCRIPTION = msg`The agent stopped without producing an answer. You can retry.`;
const RESOURCE_CAP_DESCRIPTION = msg`This message used too many resources to continue. Start a new message with a narrower request.`;

const LLM_ERROR_DESCRIPTIONS: Record<
  LLMErrorType,
  (provider: string) => MessageDescriptor
> = {
  stop_error: (provider) =>
    msg`${provider} stopped the request unexpectedly. Try again.`,
  refusal_error: (provider) =>
    msg`${provider} refused to complete your request. Rephrase your message and try again.`,
  maximum_length: () =>
    msg`The response exceeded the maximum length. Try reducing the scope of your request.`,
  terminated_error: (provider) =>
    msg`${provider} ended the request before it was complete. Try again.`,
  llm_timeout_error: (provider) =>
    msg`${provider} is taking longer than expected. Try again.`,
  rate_limit_error: () =>
    msg`Too many requests were sent. Wait a moment and try again.`,
  overloaded_error: (provider) =>
    msg`${provider} is currently overloaded. Try again in a moment.`,
  context_length_exceeded: () => CONTEXT_LENGTH_EXCEEDED_DESCRIPTION,
  invalid_request_error: () =>
    msg`The request was invalid. Check your input and try again.`,
  invalid_response_error: (provider) =>
    msg`${provider} returned an invalid response. Try again.`,
  authentication_error: (provider) =>
    msg`${provider} authentication failed. Check your API credentials.`,
  permission_error: (provider) =>
    msg`${provider} blocked your request. Check your access rights.`,
  not_found_error: () =>
    msg`The requested resource wasn't found. Check your request and try again.`,
  network_error: (provider) =>
    msg`Connection to ${provider} failed. Check your network and try again.`,
  timeout_error: () => msg`The request timed out. Try again.`,
  server_error: (provider) =>
    msg`The AI provider (${provider}) ran into an issue. Try again in a moment.`,
  stream_error: () => STREAM_INTERRUPTED_DESCRIPTION,
  unknown_error: () =>
    msg`An unexpected error occurred. Try again or contact support if the issue persists.`,
};

const BYOK_LLM_ERROR_DESCRIPTIONS: Partial<
  Record<LLMErrorType, (provider: string) => MessageDescriptor>
> = {
  authentication_error: (provider) =>
    msg`Your workspace's ${provider} credentials are invalid. Contact your workspace administrator to update them.`,
  permission_error: (provider) =>
    msg`Your workspace's ${provider} credentials don't have access to the requested model. Contact your workspace administrator.`,
  rate_limit_error: (provider) =>
    msg`Your workspace's ${provider} usage limits have been exceeded. Contact your workspace administrator.`,
};

const CATEGORY_DESCRIPTIONS: Partial<
  Record<AgentErrorCategory, MessageDescriptor>
> = {
  retryable_model_error: msg`The model couldn't complete the request. Try again.`,
  context_window_exceeded: CONTEXT_LENGTH_EXCEEDED_DESCRIPTION,
  empty_content: EMPTY_CONTENT_DESCRIPTION,
  provider_internal_error: msg`The model provider ran into an issue. Try again in a moment.`,
  stream_error: STREAM_INTERRUPTED_DESCRIPTION,
  invalid_response_format_configuration: msg`The model returned an invalid response. Try again.`,
  credits_exhausted: API_ERROR_MESSAGES.credits_exhausted,
};

const LIMIT_TITLES = {
  credits_exhausted: msg`Workspace out of credits`,
  user_cap_reached: msg`Personal usage cap reached`,
  group_shared_usage_limit_reached: msg`Shared usage limit reached`,
  no_seat: msg`No seat assigned`,
  plan_message_limit_exceeded: msg`Plan message limit exceeded`,
  rate_limit_error: msg`Rate limit exceeded`,
} satisfies Record<
  UserBlockedReason | "plan_message_limit_exceeded" | "rate_limit_error",
  MessageDescriptor
>;

type LimitReason = keyof typeof LIMIT_TITLES;

const BLOCKED_REASON_DESCRIPTIONS: Record<
  UserBlockedReason,
  { admin: MessageDescriptor; member: MessageDescriptor }
> = {
  credits_exhausted: {
    admin: msg`Your workspace has run out of credits. Purchase more credits to continue using Dust.`,
    member: msg`Your workspace has run out of credits. Contact your administrator to purchase more credits.`,
  },
  user_cap_reached: {
    admin: msg`You've reached your personal usage cap. You can adjust user caps on the usage page.`,
    member: msg`You've reached your personal usage cap. Contact your administrator to increase it.`,
  },
  group_shared_usage_limit_reached: {
    admin: msg`Your group has reached its shared usage limit. You can adjust shared usage limits on the usage page.`,
    member: msg`Your group has reached its shared usage limit. Contact your group managers or administrator to increase it.`,
  },
  no_seat: {
    admin: msg`You don't have a seat assigned in this workspace. Go to the usage page to assign yourself one.`,
    member: msg`You don't have a seat assigned in this workspace. Contact your administrator to assign you one.`,
  },
};

const CODE_MESSAGES: Record<string, AgentErrorMessages> = {
  max_step_reached: {
    title: msg`Too many steps`,
    description: msg`This agent took too many steps to answer your query. Try narrowing down your question or breaking it into smaller parts.`,
  },
  empty_content: {
    title: msg`No answer generated`,
    description: EMPTY_CONTENT_DESCRIPTION,
  },
  workflow_error: {
    title: msg`Agent response generation failed`,
    description: msg`An unexpected error occurred while generating the agent response. Try again.`,
  },
  model_tier_not_enabled: {
    title: msg`Model tier not enabled`,
    description: msg`This agent uses a model tier that isn't enabled for you. Contact your workspace administrator or use another agent.`,
  },
  early_exit: {
    title: msg`Early exit`,
    description: msg`A tool stopped before it finished. Check whether it completed, then retry.`,
  },
  agent_not_available: {
    title: msg`Agent not available`,
    description: msg`This agent is no longer available to you. Contact your workspace administrator or use another agent.`,
  },
  model_not_available: {
    title: DEFAULT_TITLE,
    description: msg`The model this agent uses isn't available. Edit the agent to use another model (advanced settings in the Instructions panel).`,
  },
  duplicate_specification_name: {
    title: DEFAULT_TITLE,
    description: msg`Several tools have the same name. Each tool needs a unique name so the agent can pick the right one.`,
  },
  free_usage_limit_reached: {
    title: DEFAULT_TITLE,
    description: msg`You've reached the free usage cap for this 24-hour period. Try again later.`,
  },
  action_not_found: {
    title: DEFAULT_TITLE,
    description: msg`The agent tried to run an action that doesn't exist. You can retry.`,
  },
  tool_error: {
    title: DEFAULT_TITLE,
    description: msg`The agent sent invalid inputs to a tool.`,
  },
  tool_test_run_parse_error: {
    title: DEFAULT_TITLE,
    description: msg`The tool call couldn't be parsed.`,
  },
  tool_test_run_tool_not_found: {
    title: DEFAULT_TITLE,
    description: msg`This tool isn't available to the agent.`,
  },
  agent_loop_cost_cap_exceeded: {
    title: DEFAULT_TITLE,
    description: RESOURCE_CAP_DESCRIPTION,
  },
  agent_loop_subagent_cap_exceeded: {
    title: DEFAULT_TITLE,
    description: RESOURCE_CAP_DESCRIPTION,
  },
  unstuck_by_admin: {
    title: DEFAULT_TITLE,
    description: msg`This answer was marked as failed because it stopped responding.`,
  },
  stream_error: {
    title: msg`Connection lost`,
    description: msg`Connection lost while generating message. Reconnect to check its progress.`,
  },
};

function isLLMErrorType(value: unknown): value is LLMErrorType {
  return (
    typeof value === "string" && Object.hasOwn(LLM_ERROR_DESCRIPTIONS, value)
  );
}

function isLimitReason(value: unknown): value is LimitReason {
  return typeof value === "string" && Object.hasOwn(LIMIT_TITLES, value);
}

function isUserBlockedReason(value: LimitReason): value is UserBlockedReason {
  return Object.hasOwn(BLOCKED_REASON_DESCRIPTIONS, value);
}

function getCategoryDescription(category: unknown): MessageDescriptor {
  return (
    (isAgentErrorCategory(category) && CATEGORY_DESCRIPTIONS[category]) ||
    DEFAULT_DESCRIPTION
  );
}

function getModelErrorDescription(
  metadata: NonNullable<GenericErrorContent["metadata"]>
): MessageDescriptor {
  const { llmErrorType, provider, isByok, category } = metadata;
  if (!isLLMErrorType(llmErrorType) || typeof provider !== "string") {
    return getCategoryDescription(category);
  }
  const getDescription =
    (isByok === true && BYOK_LLM_ERROR_DESCRIPTIONS[llmErrorType]) ||
    LLM_ERROR_DESCRIPTIONS[llmErrorType];
  return getDescription(provider);
}

function getLimitDescription(
  reason: LimitReason,
  viewerIsAdmin: boolean
): MessageDescriptor {
  if (isUserBlockedReason(reason)) {
    const descriptions = BLOCKED_REASON_DESCRIPTIONS[reason];
    return viewerIsAdmin ? descriptions.admin : descriptions.member;
  }
  return API_ERROR_MESSAGES[reason];
}

function getAgentErrorMessages(
  error: GenericErrorContent,
  viewerIsAdmin: boolean
): AgentErrorMessages {
  const metadata = error.metadata ?? {};
  const { category, blockedReason } = metadata;

  if (
    error.code === "conversation_render_error" &&
    category === "context_window_exceeded"
  ) {
    return {
      title: msg`Context window exceeded`,
      description: msg`Your message or retrieved data is too large. Break your request into smaller parts or reduce agent output.`,
    };
  }

  if (error.code === "multi_actions_error") {
    return {
      title: DEFAULT_TITLE,
      description: getModelErrorDescription(metadata),
    };
  }

  const limitReason = isLimitReason(blockedReason)
    ? blockedReason
    : isLimitReason(error.code)
      ? error.code
      : null;
  if (limitReason) {
    return {
      title: LIMIT_TITLES[limitReason],
      description: getLimitDescription(limitReason, viewerIsAdmin),
    };
  }

  if (Object.hasOwn(CODE_MESSAGES, error.code)) {
    return CODE_MESSAGES[error.code];
  }

  return {
    title: DEFAULT_TITLE,
    description: getCategoryDescription(category),
  };
}

export type FormatAgentErrorOptions = FormatErrorOptions & {
  /** Whether the current user is an admin of the current workspace. */
  viewerIsAdmin: boolean;
};

export type FormattedAgentError = {
  title: string;
  description: string;
  /** Raw error code and untranslated message, shown under the collapsed "Details". */
  details?: string;
};

/**
 * @cc [owner:sfriquet,label:error-handling;product] agent-error-translation-behind-localisation-flag
 * When `hasLocalisation` is false, `formatAgentError` MUST return no `details`, the server
 * `metadata.errorTitle` (or the translated default title when there is none) as `title`, and the
 * raw `message` as `description`, so workspaces without the flag keep seeing the messages they saw
 * before. Callers MUST pass the `localisation` feature flag of the current workspace.
 */
/**
 * @cc [owner:sfriquet,label:error-handling;react] agent-error-translated-from-code
 * When `hasLocalisation` is true, `title` and `description` MUST be translated from the error
 * `code`, `metadata.category` and the codes and brand names carried in `metadata` (`llmErrorType`,
 * `provider`, `isByok`, `blockedReason`), falling back to a translated generic message for an
 * unknown code. Wording that depends on a role follows `viewerIsAdmin`, the role of the current
 * user in the current workspace, not the role of the user who triggered the error. The server
 * `message` and `metadata.errorTitle` MUST NOT appear in `title` or `description`: the raw `code`
 * and `message` go to `details`, except for the errors built on the client
 * (`CLIENT_BUILT_ERROR_CODES`), which have no `details`.
 */
const CLIENT_BUILT_ERROR_CODES: ReadonlySet<string> = new Set([
  "stream_error",
  "unexpected_error",
]);

export function formatAgentError(
  error: GenericErrorContent,
  { hasLocalisation, viewerIsAdmin }: FormatAgentErrorOptions
): FormattedAgentError {
  if (!hasLocalisation) {
    const errorTitle = error.metadata?.errorTitle;
    return {
      title: typeof errorTitle === "string" ? errorTitle : t(DEFAULT_TITLE),
      description: error.message,
    };
  }

  const { title, description } = getAgentErrorMessages(error, viewerIsAdmin);
  const { code, message: rawMessage } = error;
  if (CLIENT_BUILT_ERROR_CODES.has(code)) {
    return { title: t(title), description: t(description) };
  }

  return {
    title: t(title),
    description: t(description),
    details: [
      t`Code: ${code}`,
      ...(rawMessage ? [t`Message: ${rawMessage}`] : []),
    ].join("\n"),
  };
}
