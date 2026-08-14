import {
  ANTHROPIC_PROVIDER_ID,
  OPENAI_PROVIDER_ID,
} from "@app/types/assistant/models/providers";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";

// Shared guidance for providers that can defer tool definitions behind a
// server-side search tool.
export const TOOL_SEARCH_INSTRUCTION =
  "You can search for and load far more tools than are visible to you now, " +
  "including ones that fetch live or account-specific data and act in external " +
  "systems. When a request needs current state, the user's own systems, or an " +
  "action your visible tools cannot take, search for a tool before making " +
  "something up, answering from stale memory, or telling the user it is not " +
  "possible.";

/** Whether this model actually uses the provider-side deferred-tool path. */
export function isToolSearchEnabledForModel(
  model: ModelConfigurationType
): boolean {
  return (
    (model.providerId === ANTHROPIC_PROVIDER_ID ||
      model.providerId === OPENAI_PROVIDER_ID) &&
    model.supportsToolSearch === true
  );
}

/** The single deferral rule shared by provider serialization and token attribution. */
export function isToolDeferred(
  tool: { eager?: boolean },
  toolSearchEnabled: boolean
): boolean {
  return toolSearchEnabled && tool.eager !== true;
}
