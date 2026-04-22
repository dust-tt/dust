import { updateAgentMessageWithFinalStatus } from "@app/lib/api/assistant/conversation";
import { createPlugin } from "@app/lib/api/poke/types";
import type {
  AgentMessageType,
  ConversationType,
} from "@app/types/assistant/conversation";
import { Err, Ok } from "@app/types/shared/result";

function findStuckAgentMessages(
  conversation: ConversationType
): AgentMessageType[] {
  return conversation.content
    .map((versions) => versions[versions.length - 1])
    .filter(
      (m): m is AgentMessageType =>
        m.type === "agent_message" && m.status === "created"
    );
}

function isLatestMessageAStreamingAgent(
  conversation: ConversationType
): boolean {
  const lastRank = conversation.content[conversation.content.length - 1];
  if (!lastRank) {
    return false;
  }
  const lastMessage = lastRank[lastRank.length - 1];
  return (
    lastMessage.type === "agent_message" && lastMessage.status === "created"
  );
}

export const unstickConversationPlugin = createPlugin({
  manifest: {
    id: "unstick-conversation",
    name: "Unstick Conversation",
    description:
      "Resume a frozen conversation by marking the hung agent answer as failed and " +
      "promoting any user messages queued behind it.",
    resourceTypes: ["conversations"],
    warning:
      "Use this when a conversation appears frozen: the agent's answer is hanging " +
      "indefinitely and any follow-up user messages aren't being processed. Running " +
      "it will finalize the stuck answer as failed and resume the conversation.",
    args: {},
  },
  isApplicableTo: (_auth, conversation) => {
    if (!conversation) {
      return false;
    }
    // If the last message is an agent in "created", it could be a live stream rather than a
    // zombie. We hide the plugin; support can ask the user to send any follow-up message first,
    // which queues behind the agent and makes the stuck state unambiguous.
    if (isLatestMessageAStreamingAgent(conversation)) {
      return false;
    }
    return findStuckAgentMessages(conversation).length > 0;
  },
  execute: async (auth, conversation) => {
    if (!conversation) {
      return new Err(new Error("Conversation not found."));
    }

    if (isLatestMessageAStreamingAgent(conversation)) {
      return new Err(
        new Error(
          "The latest message is an agent answer still in progress. Ask the user to " +
            "send any follow-up message (for example 'ok') and retry, so we can be sure " +
            "the answer is truly frozen and not actively streaming."
        )
      );
    }

    const stuckAgents = findStuckAgentMessages(conversation);
    if (stuckAgents.length === 0) {
      return new Err(
        new Error("Nothing to unstick: no hung agent answer found.")
      );
    }

    // Only finalize the latest hung answer: it's the one blocking the queue. Earlier zombies
    // (if any) are orphaned history and don't block processing; leave them alone so we do the
    // minimum needed to resume the conversation.
    const stuck = stuckAgents[stuckAgents.length - 1];

    await updateAgentMessageWithFinalStatus(auth, {
      conversation,
      agentMessage: stuck,
      status: "failed",
      error: {
        code: "unstuck_by_admin",
        message:
          "This generation was manually marked as failed via the unstick-conversation " +
          "poke plugin because the underlying Temporal workflow was no longer running.",
        metadata: null,
      },
    });

    const extras =
      stuckAgents.length > 1
        ? ` ${stuckAgents.length - 1} earlier hung answer(s) were left alone ` +
          `(sIds: ${stuckAgents
            .slice(0, -1)
            .map((a) => a.sId)
            .join(", ")}).`
        : "";

    return new Ok({
      display: "text",
      value:
        `Marked agent message ${stuck.sId} as failed. ` +
        `Any queued user messages have been promoted and a fresh agent answer has been ` +
        `kicked off for the last one.${extras}`,
    });
  },
});
