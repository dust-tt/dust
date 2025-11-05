import type { NextApiRequest, NextApiResponse } from "next";
import { Op } from "sequelize";

import { BroadcastModel } from "@app/lib/models/broadcast";
import { BroadcastDismissalModel } from "@app/lib/models/broadcast_dismissal";
import { apiError, withLogging } from "@app/logger/withlogging";
import { Authenticator, getAuthenticator } from "@app/lib/auth";

export type GetActiveBroadcastResponseBody = {
  broadcast: {
    sId: string;
    title: string;
    shortDescription: string;
    longDescription: string | null;
    mediaUrl: string | null;
    mediaType: string | null;
  } | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetActiveBroadcastResponseBody>
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

  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported",
        message: "Only GET method is supported.",
      },
    });
  }

  const owner = auth.workspace();
  const user = auth.user();
  const plan = owner ? auth.plan() : null;

  if (!owner || !user) {
    return res.status(200).json({ broadcast: null });
  }

  try {
    // Find all active broadcasts that haven't been dismissed by this user
    const now = new Date();
    const activeBroadcasts = await BroadcastModel.findAll({
      where: {
        status: "published",
        shouldBroadcast: true,
        startDate: { [Op.lte]: now },
        [Op.or]: [
          { endDate: null },
          { endDate: { [Op.gte]: now } }
        ]
      },
      include: [
        {
          model: BroadcastDismissalModel,
          as: "dismissals",
          required: false,
          where: {
            userId: user.id,
            workspaceId: owner.id,
          },
        },
      ],
      order: [["priority", "DESC"], ["startDate", "DESC"]],
    });

    // Filter broadcasts based on targeting and dismissal
    const eligibleBroadcast = activeBroadcasts.find((broadcast) => {
      // Check if already dismissed
      if (broadcast.dismissals && broadcast.dismissals.length > 0) {
        return false;
      }

      // Check targeting rules
      return broadcast.shouldShowTo(user.sId, owner.sId, plan);
    });

    if (!eligibleBroadcast) {
      return res.status(200).json({ broadcast: null });
    }

    return res.status(200).json({
      broadcast: {
        sId: eligibleBroadcast.sId,
        title: eligibleBroadcast.title,
        shortDescription: eligibleBroadcast.shortDescription,
        longDescription: eligibleBroadcast.longDescription,
        mediaUrl: eligibleBroadcast.mediaUrl,
        mediaType: eligibleBroadcast.mediaType,
      },
    });
  } catch (error) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to fetch active broadcast.",
      },
    });
  }
}

export default withLogging(handler);