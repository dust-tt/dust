import { createPlugin } from "@app/lib/api/poke/types";
import type { Authenticator } from "@app/lib/auth";
import { WakeUpResource } from "@app/lib/resources/wakeup_resource";
import type { ConversationType } from "@app/types/assistant/conversation";
import { ACTIVE_WAKE_UP_STATUSES } from "@app/types/assistant/wakeups";
import { Err, Ok } from "@app/types/shared/result";

async function activeWakeUps(
  auth: Authenticator,
  conversation: ConversationType
) {
  return WakeUpResource.listByConversation(auth, conversation, {
    status: ACTIVE_WAKE_UP_STATUSES,
  });
}

export const cancelConversationWakeUpPlugin = createPlugin({
  manifest: {
    id: "cancel-conversation-wakeup",
    name: "Cancel Wake-up",
    description: "Cancel this conversation's active wake-up.",
    warning: "The wake-up will be cancelled and will not fire.",
    resourceTypes: ["conversations"],
    args: {},
    requiredRoles: ["support"],
  },
  isApplicableTo: async (auth, conversation) => {
    if (!conversation) {
      return false;
    }

    return (await activeWakeUps(auth, conversation)).length > 0;
  },
  execute: async (auth, conversation) => {
    if (!conversation) {
      return new Err(new Error("Conversation not found."));
    }

    const wakeUp = (await activeWakeUps(auth, conversation))[0];
    if (!wakeUp) {
      return new Err(new Error("No active wake-up found."));
    }

    const cancelResult = await wakeUp.cancel(auth);
    if (cancelResult.isErr()) {
      return new Err(cancelResult.error);
    }

    return new Ok({
      display: "text",
      value: `Cancelled wake-up ${wakeUp.sId}.`,
    });
  },
});
