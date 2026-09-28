import {
  isSandboxRunning,
  sleepRunningSandbox,
} from "@app/lib/api/poke/sandboxes";
import { createPlugin } from "@app/lib/api/poke/types";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ConversationSandboxAdapter } from "@app/lib/resources/conversation_sandbox_adapter";
import type { ConversationType } from "@app/types/assistant/conversation";
import { Err } from "@app/types/shared/result";

function sandboxTarget(auth: Authenticator, conversation: ConversationType) {
  return {
    fetchSandbox: () =>
      ConversationSandboxAdapter.fetchSandbox(auth, conversation),
    sleepIfRunning: async () => {
      // The adapter's sleep path needs the conversation's workspace model id, which the
      // plugin's `ConversationType` does not carry.
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId,
        { includeDeleted: true }
      );
      if (!conversationResource) {
        return new Err(new Error("Conversation not found."));
      }

      return ConversationSandboxAdapter.dangerouslySleepSandboxIfRunning(
        auth,
        conversationResource
      );
    },
  };
}

export const sleepConversationSandboxPlugin = createPlugin({
  manifest: {
    id: "sleep-conversation-sandbox",
    name: "Sleep Sandbox",
    description:
      "Pause this conversation's running sandbox, as the reaper does once it goes idle.",
    resourceTypes: ["conversations"],
    args: {},
    requiredRoles: ["support"],
  },
  isApplicableTo: async (auth, conversation) =>
    conversation ? isSandboxRunning(sandboxTarget(auth, conversation)) : false,
  execute: async (auth, conversation) => {
    if (!conversation) {
      return new Err(new Error("Conversation not found."));
    }

    return sleepRunningSandbox(sandboxTarget(auth, conversation));
  },
});
