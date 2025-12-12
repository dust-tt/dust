import type { NextApiRequest, NextApiResponse } from "next";

import { getUserForWorkspace } from "@app/lib/api/user";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { updateInvitationPromptContentFragment } from "@app/lib/api/assistant/conversation/invitation_prompts";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import {
  MentionModel,
  PendingMentionModel,
} from "@app/lib/models/agent/conversation";
import { triggerConversationAddedAsParticipantNotification } from "@app/lib/notifications/workflows/conversation-added-as-participant";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type PendingMentionActionResponseBody = {
  status: "confirmed" | "declined";
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PendingMentionActionResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only POST method is supported.",
      },
    });
  }

  const { cId, mentionId, action } = req.query;

  if (!cId || typeof cId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid conversation ID.",
      },
    });
  }

  if (!mentionId || typeof mentionId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid mention ID.",
      },
    });
  }

  if (action !== "confirm" && action !== "decline") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Action must be 'confirm' or 'decline'.",
      },
    });
  }

  const user = auth.user();
  if (!user) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "not_authenticated",
        message: "User must be authenticated.",
      },
    });
  }

  const workspace = auth.getNonNullableWorkspace();
  const featureFlags = await getFeatureFlags(workspace);

  if (!featureFlags.includes("mentions_v2")) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Mention confirmation feature is not enabled.",
      },
    });
  }

  // Fetch the pending mention
  const mentionIdNum = parseInt(mentionId, 10);
  if (isNaN(mentionIdNum)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid mention ID format.",
      },
    });
  }

  const pendingMention = await PendingMentionModel.findOne({
    where: {
      id: mentionIdNum,
      workspaceId: workspace.id,
      mentionerUserId: user.id, // Only the mentioner can confirm/decline
      status: "pending",
    },
  });

  if (!pendingMention) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "message_not_found",
        message:
          "Pending mention not found or you don't have permission to modify it.",
      },
    });
  }

  // Fetch the conversation
  const conversation = await ConversationResource.fetchById(auth, cId);
  if (!conversation) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found.",
      },
    });
  }

  // Fetch the mentioned user
  const mentionedUser = await getUserForWorkspace(auth, {
    userId: pendingMention.mentionedUserId.toString(),
  });
  if (!mentionedUser) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Mentioned user not found.",
      },
    });
  }

  if (action === "confirm") {
    // Check if user is already a participant (edge case: added via another route)
    const existingParticipant =
      await ConversationResource.getParticipantForUser(auth, {
        conversationId: conversation.sId,
        userId: mentionedUser.sId,
      });

    if (existingParticipant) {
      // User is already a participant - just update status and create mention
      await pendingMention.update({ status: "accepted" });

      await MentionModel.create({
        messageId: pendingMention.messageId,
        userId: mentionedUser.id,
        workspaceId: workspace.id,
      });

      // Update content fragment
      await updateInvitationPromptContentFragment(auth, {
        pendingMentionId: pendingMention.id,
        status: "accepted",
        mentionedUser: mentionedUser.toJSON(),
      });

      return res.status(200).json({ status: "confirmed" });
    }

    // Add mentioned user as participant
    const status = await ConversationResource.upsertParticipation(auth, {
      conversation: conversation.toJSON(),
      action: "subscribed",
      user: mentionedUser.toJSON(),
    });

    // Create mention record
    await MentionModel.create({
      messageId: pendingMention.messageId,
      userId: mentionedUser.id,
      workspaceId: workspace.id,
    });

    // Update pending mention status
    await pendingMention.update({ status: "accepted" });

    // Update content fragment
    await updateInvitationPromptContentFragment(auth, {
      pendingMentionId: pendingMention.id,
      status: "accepted",
      mentionedUser: mentionedUser.toJSON(),
    });

    // Send notification to mentioned user
    if (status === "added" && featureFlags.includes("notifications")) {
      await triggerConversationAddedAsParticipantNotification(auth, {
        conversation: conversation.toJSON(),
        addedUserId: mentionedUser.sId,
      });
    }

    return res.status(200).json({ status: "confirmed" });
  } else {
    // Decline action
    await pendingMention.update({ status: "declined" });

    // Update content fragment
    await updateInvitationPromptContentFragment(auth, {
      pendingMentionId: pendingMention.id,
      status: "declined",
    });

    return res.status(200).json({ status: "declined" });
  }
}

export default withPublicAPIAuthentication(handler, { isStreaming: false });
