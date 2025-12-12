import type { NextApiRequest, NextApiResponse } from "next";

import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { getUserForWorkspace } from "@app/lib/api/user";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { PendingMentionModel } from "@app/lib/models/agent/conversation";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type PendingMentionType = {
  id: number;
  mentionedUser: {
    sId: string;
    fullName: string;
    username: string;
  };
  mentionerUser: {
    sId: string;
    fullName: string;
    username: string;
  };
  messageId: string;
  status: "pending" | "accepted" | "declined";
  createdAt: number;
};

export type GetPendingMentionsResponseBody = {
  pendingMentions: PendingMentionType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetPendingMentionsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only GET method is supported.",
      },
    });
  }

  const { cId } = req.query;

  if (!cId || typeof cId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid conversation ID.",
      },
    });
  }

  const workspace = auth.getNonNullableWorkspace();
  const featureFlags = await getFeatureFlags(workspace);

  if (!featureFlags.includes("mentions_v2")) {
    // Feature not enabled, return empty list
    return res.status(200).json({ pendingMentions: [] });
  }

  // Fetch all pending mentions for this conversation
  const pendingMentions = await PendingMentionModel.findAll({
    where: {
      workspaceId: workspace.id,
      conversationId: cId,
      status: "pending",
    },
    order: [["createdAt", "ASC"]],
  });

  // Fetch user details for all mentions
  const pendingMentionTypes: PendingMentionType[] = await Promise.all(
    pendingMentions.map(async (pm) => {
      const mentionedUser = await getUserForWorkspace(auth, {
        userId: pm.mentionedUserId,
      });
      const mentionerUser = await getUserForWorkspace(auth, {
        userId: pm.mentionerUserId,
      });

      if (!mentionedUser || !mentionerUser) {
        return null;
      }

      return {
        id: pm.id,
        mentionedUser: {
          sId: mentionedUser.sId,
          fullName: mentionedUser.fullName || mentionedUser.username,
          username: mentionedUser.username,
        },
        mentionerUser: {
          sId: mentionerUser.sId,
          fullName: mentionerUser.fullName || mentionerUser.username,
          username: mentionerUser.username,
        },
        messageId: pm.messageId.toString(),
        status: pm.status,
        createdAt: pm.createdAt.getTime(),
      };
    })
  );

  // Filter out any nulls
  const validPendingMentions = pendingMentionTypes.filter(
    (pm): pm is PendingMentionType => pm !== null
  );

  return res.status(200).json({ pendingMentions: validPendingMentions });
}

export default withPublicAPIAuthentication(handler, { isStreaming: false });
