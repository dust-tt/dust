import { renderConversationEnhanced } from "@app/lib/api/assistant/conversation_rendering/enhanced";
import { renderConversationForModel as renderConversationLegacy } from "@app/lib/api/assistant/conversation_rendering/legacy";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type {
  ConversationType,
  ModelConfigurationType,
  ModelConversationTypeMultiActions,
  Result,
} from "@app/types";

/**
 * Model conversation rendering with feature flag routing.
 *
 * This function routes to either the legacy or enhanced renderer based on feature flags.
 * - Legacy: The original implementation using shared functions
 * - Enhanced: New implementation with tool result pruning capabilities
 */
export async function renderConversationForModel(
  auth: Authenticator,
  {
    conversation,
    model,
    prompt,
    tools,
    allowedTokenCount,
    excludeActions,
    excludeImages,
    onMissingAction = "inject-placeholder",
  }: {
    conversation: ConversationType;
    model: ModelConfigurationType;
    prompt: string;
    tools: string;
    allowedTokenCount: number;
    excludeActions?: boolean;
    excludeImages?: boolean;
    onMissingAction?: "inject-placeholder" | "skip";
  }
): Promise<
  Result<
    {
      modelConversation: ModelConversationTypeMultiActions;
      tokensUsed: number;
    },
    Error
  >
> {
  const flags = await getFeatureFlags(auth.getNonNullableWorkspace());

  const useEnhancedRenderer = flags.includes("conversation_rendering_v2");
  const enablePreviousInteractionsPruning = flags.includes(
    "prune_previous_interactions"
  );

  if (useEnhancedRenderer) {
    return renderConversationEnhanced(auth, {
      conversation,
      model,
      prompt,
      tools,
      allowedTokenCount,
      excludeActions,
      excludeImages,
      onMissingAction,
      enablePreviousInteractionsPruning,
    });
  } else {
    return renderConversationLegacy(auth, {
      conversation,
      model,
      prompt,
      tools,
      allowedTokenCount,
      excludeActions,
      excludeImages,
      onMissingAction,
    });
  }
}
