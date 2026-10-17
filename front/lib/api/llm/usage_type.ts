import { isFreeUsageContext } from "@app/lib/api/llm/free_usage";
import type { LLMTraceContext } from "@app/lib/api/llm/traces/types";
import { isProgrammaticUsageFromContext } from "@app/lib/api/programmatic_usage/common";
import type { Authenticator } from "@app/lib/auth";
import { USAGE_TYPE_FREE } from "@app/lib/metronome/constants";
import { getUsageType } from "@app/lib/metronome/events";
import type { UsageType } from "@app/lib/metronome/types";

export function getLLMUsageType(
  auth: Authenticator,
  context: LLMTraceContext | undefined
): UsageType {
  // Calls without tracing context and non-agent utility calls are free.
  if (!context || isFreeUsageContext(context)) {
    return USAGE_TYPE_FREE;
  }

  const userMessageOrigin = context.userMessageOrigin;
  if (!userMessageOrigin) {
    throw new Error(
      "Agent conversation LLM context is missing userMessageOrigin"
    );
  }

  return getUsageType(
    isProgrammaticUsageFromContext({
      authMethod: auth.authMethod(),
      userMessageOrigin,
      userId: context.userId,
      messageAuthMethod: context.userMessageAuthMethod,
    }),
    userMessageOrigin
  );
}
