import type { NextApiRequest, NextApiResponse } from "next";

import { BroadcastModel } from "@app/lib/models/broadcast";
import { BroadcastDismissalModel } from "@app/lib/models/broadcast_dismissal";
import { apiError, withLogging } from "@app/logger/withlogging";
import { getAuthenticator } from "@app/lib/auth";

export type DismissBroadcastResponseBody = {
  success: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DismissBroadcastResponseBody>
) {
  const auth = await getAuthenticator(req);

  if (!auth.isAuthenticated()) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "not_authenticated",
        message: "You must be authenticated to access this resource.",
      },
    });
  }

  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported",
        message: "Only POST method is supported.",
      },
    });
  }

  const owner = auth.workspace();
  const user = auth.user();

  if (!owner || !user) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request",
        message: "User and workspace are required.",
      },
    });
  }

  const { broadcastId } = req.query;

  if (!broadcastId || typeof broadcastId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request",
        message: "Invalid broadcast ID.",
      },
    });
  }

  try {
    // Find the broadcast
    const broadcast = await BroadcastModel.findOne({
      where: { sId: broadcastId },
    });

    if (!broadcast) {
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "not_found",
          message: "Broadcast not found.",
        },
      });
    }

    // Create or update dismissal record
    await BroadcastDismissalModel.upsert({
      broadcastId: broadcast.id,
      userId: user.id,
      workspaceId: owner.id,
      dismissedAt: new Date(),
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to dismiss broadcast.",
      },
    });
  }
}

export default withLogging(handler);