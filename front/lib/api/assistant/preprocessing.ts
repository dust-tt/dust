import { renderConversationForModel as renderConversationForModelImpl } from "@app/lib/api/assistant/conversation_rendering/legacy";
import type { Authenticator } from "@app/lib/auth";
import type {
  ConversationType,
  ModelConfigurationType,
  ModelConversationTypeMultiActions,
  Result,
} from "@app/types";

/**
 * Model conversation rendering
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
  return renderConversationForModelImpl(auth, {
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