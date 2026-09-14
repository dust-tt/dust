import {
  canRequestSandboxKill,
  requestSandboxKill,
} from "@app/lib/api/poke/sandboxes";
import { createPlugin } from "@app/lib/api/poke/types";
import type { Authenticator } from "@app/lib/auth";
import { ConversationSandboxAdapter } from "@app/lib/resources/conversation_sandbox_adapter";
import type { ConversationType } from "@app/types/assistant/conversation";
import { Err } from "@app/types/shared/result";

function sandboxTarget(auth: Authenticator, conversation: ConversationType) {
  return {
    fetchSandbox: () =>
      ConversationSandboxAdapter.fetchSandbox(auth, conversation),
  };
}

export const requestConversationSandboxKillPlugin = createPlugin({
  manifest: {
    id: "request-conversation-sandbox-kill",
    name: "Request Sandbox Kill",
    description:
      "Mark this conversation's sandbox for destruction and recreation on its next access.",
    warning:
      "The sandbox will be destroyed. Files stored only inside it will be lost.",
    resourceTypes: ["conversations"],
    args: {},
    requiredRoles: ["support"],
  },
  isApplicableTo: async (auth, conversation) =>
    conversation
      ? canRequestSandboxKill(sandboxTarget(auth, conversation))
      : false,
  execute: async (auth, conversation) => {
    if (!conversation) {
      return new Err(new Error("Conversation not found."));
    }

    return requestSandboxKill(sandboxTarget(auth, conversation));
  },
});
