import { isBlockedActionEvent } from "@app/lib/actions/mcp";
import { getMessageChannelId } from "@app/lib/api/assistant/streaming/helpers";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import type { Authenticator } from "@app/lib/auth";
import type { DustErrorCode } from "@app/lib/error";
import { DustError } from "@app/lib/error";
// TODO(2026-07-31 QOS): move these message fetches behind a resource method instead of using
// models directly in lib/api.
import {
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import type {
  ConversationWithoutContentType,
  UserMessageOrigin,
} from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

// Outcomes that mean the message has nothing left to resume, rather than a resume that failed:
// the blocked actions were already consumed, or the agent message reached a terminal state.
export const NOTHING_TO_RESUME_ERROR_CODES: DustErrorCode[] = [
  "agent_message_not_resumable",
  "no_blocked_actions",
];

// Clients replay the whole message stream on load, so any blocked-action event left behind keeps
// re-prompting the user forever. Purge them:
// - remove tool_approve_execution events (watch out as those events are not republished).
// - remove tool_personal_auth_required events.
async function purgeBlockedActionEvents(messageId: string): Promise<void> {
  await getRedisHybridManager().removeEvent((event) => {
    const payload = JSON.parse(event.message["payload"]);

    return isBlockedActionEvent(payload);
  }, getMessageChannelId(messageId));
}

async function findUserMessageForRetry(
  auth: Authenticator,
  conversation: ConversationWithoutContentType,
  { messageId }: { messageId: string }
): Promise<
  Result<
    {
      agentMessageId: string;
      agentMessageVersion: number;
      lastStep: number;
      userMessageId: string;
      userMessageVersion: number;
      userMessageOrigin: UserMessageOrigin;
    },
    Error
  >
> {
  const workspaceId = auth.getNonNullableWorkspace().id;

  // Query 1: Get the message and its parentId.
  const agentMessage = await MessageModel.findOne({
    where: {
      conversationId: conversation.id,
      sId: messageId,
      workspaceId,
    },
    attributes: ["agentMessageId", "parentId", "version", "sId", "workspaceId"],
  });

  if (!agentMessage || !agentMessage.parentId || !agentMessage.agentMessageId) {
    return new Err(new Error("Agent message not found"));
  }

  // Query 2: Get the parent message's sId (which is the user message).
  const parentMessage = await MessageModel.findOne({
    where: {
      id: agentMessage.parentId,
      conversationId: conversation.id,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
    attributes: ["sId", "version"],
    include: [
      {
        model: UserMessageModel,
        as: "userMessage",
        attributes: ["userContextOrigin"],
        required: true,
      },
    ],
  });

  if (!parentMessage) {
    return new Err(new Error("User message not found"));
  }

  const blockedActions =
    await AgentMCPActionResource.listBlockedActionsForAgentMessage(auth, {
      agentMessageId: agentMessage.agentMessageId,
    });

  // Purge before the early returns below: a message with nothing left to resume is exactly the
  // case where stale events would otherwise keep the prompt on screen with no way to clear it.
  await purgeBlockedActionEvents(messageId);

  if (blockedActions.length === 0) {
    // Not a failure: the message simply has nothing waiting on user input (already resumed, or
    // reached here through a handover whose caller was never blocked).
    return new Err(
      new DustError("no_blocked_actions", "No blocked actions found")
    );
  }

  // Blocked actions of a message that can no longer resume are stale leftovers: retrying them
  // would relaunch an agent loop that was already terminated. All blocked actions belong to the
  // same agent message, so checking the first one is enough.
  if (!(await blockedActions[0].canAgentMessageResume(auth))) {
    return new Err(
      new DustError(
        "agent_message_not_resumable",
        "Agent message can no longer resume"
      )
    );
  }

  return new Ok({
    agentMessageId: agentMessage.sId,
    agentMessageVersion: agentMessage.version,
    lastStep: blockedActions[blockedActions.length - 1].stepContent.step,
    userMessageId: parentMessage.sId,
    userMessageVersion: parentMessage.version,
    // The `required: true` include guarantees userMessage is set.
    userMessageOrigin: parentMessage.userMessage!.userContextOrigin,
  });
}

export async function retryBlockedActions(
  auth: Authenticator,
  conversation: ConversationWithoutContentType,
  {
    messageId,
    waitForCompletion,
  }: {
    messageId: string;
    waitForCompletion?: boolean;
  }
): Promise<Result<void, Error | DustError<"agent_loop_already_running">>> {
  const { sId: conversationId, title: conversationTitle } = conversation;

  const getUserMessageIdRes = await findUserMessageForRetry(
    auth,
    conversation,
    {
      messageId,
    }
  );

  if (getUserMessageIdRes.isErr()) {
    return getUserMessageIdRes;
  }

  const {
    agentMessageId,
    agentMessageVersion,
    lastStep,
    userMessageId,
    userMessageVersion,
    userMessageOrigin,
  } = getUserMessageIdRes.value;

  return launchAgentLoopWorkflow({
    auth,
    agentLoopArgs: {
      agentMessageId,
      agentMessageVersion,
      conversationId,
      conversationTitle,
      userMessageId,
      userMessageVersion,
      userMessageOrigin,
    },
    startStep: lastStep,
    waitForCompletion,
  });
}
