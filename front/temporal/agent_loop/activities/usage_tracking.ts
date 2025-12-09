import {
  isProgrammaticUsage,
  trackProgrammaticCost,
} from "@app/lib/api/programmatic_usage_tracking";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import type { AgentMessageStatus } from "@app/types";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

const AGENT_MESSAGE_STATUSES_TO_TRACK: AgentMessageStatus[] = [
  "succeeded",
  "cancelled",
];

export async function trackProgrammaticUsageActivity(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  const auth = await Authenticator.fromJSON(authType);
  const workspace = auth.getNonNullableWorkspace();

  const { agentMessageId, userMessageId } = agentLoopArgs;

  // Query the Message/AgentMessage/Conversation rows.
  const agentMessageRow = await MessageModel.findOne({
    where: {
      sId: agentMessageId,
      workspaceId: workspace.id,
    },
    include: [
      {
        model: AgentMessageModel,
        as: "agentMessage",
        required: true,
      },
    ],
  });

  const agentMessage = agentMessageRow?.agentMessage;

  // Query the UserMessage row to get user.
  const userMessageRow = await MessageModel.findOne({
    where: {
      sId: userMessageId,
      workspaceId: workspace.id,
    },
    include: [
      {
        model: UserMessageModel,
        as: "userMessage",
        required: true,
      },
    ],
  });

  const userMessage = userMessageRow?.userMessage;

  if (!agentMessage || !userMessage) {
    throw new Error("Agent message or user message not found");
  }

  if (
    AGENT_MESSAGE_STATUSES_TO_TRACK.includes(agentMessage.status) &&
    agentMessage.runIds &&
    isProgrammaticUsage(auth, {
      userMessageOrigin: userMessage.userContextOrigin,
    })
  ) {
    await trackProgrammaticCost(auth, {
      dustRunIds: agentMessage.runIds,
      userMessageOrigin: userMessage.userContextOrigin ?? null,
    });
  }
}
