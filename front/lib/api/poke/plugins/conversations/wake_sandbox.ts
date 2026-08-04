import {
  isSandboxSleeping,
  wakeSleepingSandbox,
} from "@app/lib/api/poke/sandboxes";
import { createPlugin } from "@app/lib/api/poke/types";
import { ensureConversationSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import type { Authenticator } from "@app/lib/auth";
import { ConversationSandboxAdapter } from "@app/lib/resources/conversation_sandbox_adapter";
import type { ConversationType } from "@app/types/assistant/conversation";
import { Err } from "@app/types/shared/result";

function sandboxTarget(auth: Authenticator, conversation: ConversationType) {
  return {
    ensureReady: () => ensureConversationSandboxReady(auth, conversation),
    fetchSandbox: () =>
      ConversationSandboxAdapter.fetchSandbox(auth, conversation),
  };
}

export const wakeConversationSandboxPlugin = createPlugin({
  manifest: {
    id: "wake-conversation-sandbox",
    name: "Wake Sandbox",
    description: "Resume this conversation's sleeping sandbox.",
    resourceTypes: ["conversations"],
    args: {},
    requiredRoles: ["support"],
  },
  isApplicableTo: async (auth, conversation) =>
    conversation ? isSandboxSleeping(sandboxTarget(auth, conversation)) : false,
  execute: async (auth, conversation) => {
    if (!conversation) {
      return new Err(new Error("Conversation not found."));
    }

    return wakeSleepingSandbox(sandboxTarget(auth, conversation));
  },
});
