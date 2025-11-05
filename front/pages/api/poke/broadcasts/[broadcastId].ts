import type { NextApiRequest, NextApiResponse } from "next";

import { BroadcastModel } from "@app/lib/models/broadcast";
import type { BroadcastType } from "@app/pages/api/poke/broadcasts/index";
import { apiError, withLogging } from "@app/logger/withlogging";
import { getAuthenticator } from "@app/lib/auth";

export type GetBroadcastResponseBody = {
  broadcast: BroadcastType;
};

export type UpdateBroadcastResponseBody = {
  broadcast: BroadcastType;
};

export type DeleteBroadcastResponseBody = {
  success: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    GetBroadcastResponseBody | UpdateBroadcastResponseBody | DeleteBroadcastResponseBody
  >
) {
  const auth = await getAuthenticator(req);

  if (!auth.isAuthenticated() || !auth.isSuperUser()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "forbidden",
        message: "Only super users can access this resource.",
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

  switch (req.method) {
    case "GET":
      return handleGet(req, res, broadcastId);
    case "PUT":
      return handlePut(req, res, broadcastId);
    case "DELETE":
      return handleDelete(req, res, broadcastId);
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported",
          message: "Method not supported.",
        },
      });
  }
}

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse<GetBroadcastResponseBody>,
  broadcastId: string
) {
  try {
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

    const broadcastData: BroadcastType = {
      sId: broadcast.sId,
      title: broadcast.title,
      shortDescription: broadcast.shortDescription,
      longDescription: broadcast.longDescription,
      mediaUrl: broadcast.mediaUrl,
      mediaType: broadcast.mediaType,
      publishToChangelog: broadcast.publishToChangelog,
      shouldBroadcast: broadcast.shouldBroadcast,
      targetingType: broadcast.targetingType,
      targetingData: broadcast.targetingData,
      startDate: broadcast.startDate.toISOString(),
      endDate: broadcast.endDate ? broadcast.endDate.toISOString() : null,
      priority: broadcast.priority,
      status: broadcast.status,
      publishedAt: broadcast.publishedAt ? broadcast.publishedAt.toISOString() : null,
      createdAt: broadcast.createdAt.toISOString(),
      updatedAt: broadcast.updatedAt.toISOString(),
    };

    return res.status(200).json({ broadcast: broadcastData });
  } catch (error) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to fetch broadcast.",
      },
    });
  }
}

async function handlePut(
  req: NextApiRequest,
  res: NextApiResponse<UpdateBroadcastResponseBody>,
  broadcastId: string
) {
  try {
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

    const {
      title,
      shortDescription,
      longDescription,
      mediaUrl,
      mediaType,
      publishToChangelog,
      shouldBroadcast,
      targetingType,
      targetingData,
      startDate,
      endDate,
      priority,
      status,
    } = req.body;

    // Update fields if provided
    if (title !== undefined) broadcast.title = title;
    if (shortDescription !== undefined) broadcast.shortDescription = shortDescription;
    if (longDescription !== undefined) broadcast.longDescription = longDescription;
    if (mediaUrl !== undefined) broadcast.mediaUrl = mediaUrl;
    if (mediaType !== undefined) broadcast.mediaType = mediaType;
    if (publishToChangelog !== undefined) broadcast.publishToChangelog = publishToChangelog;
    if (shouldBroadcast !== undefined) broadcast.shouldBroadcast = shouldBroadcast;
    if (targetingType !== undefined) broadcast.targetingType = targetingType;
    if (targetingData !== undefined) broadcast.targetingData = targetingData;
    if (startDate !== undefined) broadcast.startDate = new Date(startDate);
    if (endDate !== undefined) broadcast.endDate = endDate ? new Date(endDate) : null;
    if (priority !== undefined) broadcast.priority = priority;
    if (status !== undefined) {
      broadcast.status = status;
      if (status === "published" && !broadcast.publishedAt) {
        broadcast.publishedAt = new Date();
      }
    }

    await broadcast.save();

    const broadcastData: BroadcastType = {
      sId: broadcast.sId,
      title: broadcast.title,
      shortDescription: broadcast.shortDescription,
      longDescription: broadcast.longDescription,
      mediaUrl: broadcast.mediaUrl,
      mediaType: broadcast.mediaType,
      publishToChangelog: broadcast.publishToChangelog,
      shouldBroadcast: broadcast.shouldBroadcast,
      targetingType: broadcast.targetingType,
      targetingData: broadcast.targetingData,
      startDate: broadcast.startDate.toISOString(),
      endDate: broadcast.endDate ? broadcast.endDate.toISOString() : null,
      priority: broadcast.priority,
      status: broadcast.status,
      publishedAt: broadcast.publishedAt ? broadcast.publishedAt.toISOString() : null,
      createdAt: broadcast.createdAt.toISOString(),
      updatedAt: broadcast.updatedAt.toISOString(),
    };

    return res.status(200).json({ broadcast: broadcastData });
  } catch (error) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to update broadcast.",
      },
    });
  }
}

async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse<DeleteBroadcastResponseBody>,
  broadcastId: string
) {
  try {
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

    await broadcast.destroy();

    return res.status(200).json({ success: true });
  } catch (error) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to delete broadcast.",
      },
    });
  }
}

export default withLogging(handler);