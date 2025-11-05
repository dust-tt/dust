import type { NextApiRequest, NextApiResponse } from "next";
import { v4 as uuidv4 } from "uuid";

import { BroadcastModel } from "@app/lib/models/broadcast";
import { apiError, withLogging } from "@app/logger/withlogging";
import { getAuthenticator } from "@app/lib/auth";

export type BroadcastType = {
  sId: string;
  title: string;
  shortDescription: string;
  longDescription: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  publishToChangelog: boolean;
  shouldBroadcast: boolean;
  targetingType: string;
  targetingData: any;
  startDate: string;
  endDate: string | null;
  priority: number;
  status: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ListBroadcastsResponseBody = {
  broadcasts: BroadcastType[];
};

export type CreateBroadcastResponseBody = {
  broadcast: BroadcastType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListBroadcastsResponseBody | CreateBroadcastResponseBody>
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

  switch (req.method) {
    case "GET":
      return handleGet(req, res);
    case "POST":
      return handlePost(req, res);
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
  res: NextApiResponse<ListBroadcastsResponseBody>
) {
  try {
    const broadcasts = await BroadcastModel.findAll({
      order: [["createdAt", "DESC"]],
    });

    const broadcastsData: BroadcastType[] = broadcasts.map((b) => ({
      sId: b.sId,
      title: b.title,
      shortDescription: b.shortDescription,
      longDescription: b.longDescription,
      mediaUrl: b.mediaUrl,
      mediaType: b.mediaType,
      publishToChangelog: b.publishToChangelog,
      shouldBroadcast: b.shouldBroadcast,
      targetingType: b.targetingType,
      targetingData: b.targetingData,
      startDate: b.startDate.toISOString(),
      endDate: b.endDate ? b.endDate.toISOString() : null,
      priority: b.priority,
      status: b.status,
      publishedAt: b.publishedAt ? b.publishedAt.toISOString() : null,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
    }));

    return res.status(200).json({ broadcasts: broadcastsData });
  } catch (error) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to fetch broadcasts.",
      },
    });
  }
}

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse<CreateBroadcastResponseBody>
) {
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

  // Validate required fields
  if (!title || !shortDescription || !startDate) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request",
        message: "Title, shortDescription, and startDate are required.",
      },
    });
  }

  try {
    const broadcast = await BroadcastModel.create({
      sId: `broadcast_${uuidv4()}`,
      title,
      shortDescription,
      longDescription,
      mediaUrl,
      mediaType,
      publishToChangelog: publishToChangelog ?? true,
      shouldBroadcast: shouldBroadcast ?? true,
      targetingType: targetingType || "all",
      targetingData,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      priority: priority || 0,
      status: status || "draft",
      publishedAt: status === "published" ? new Date() : null,
    });

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

    return res.status(201).json({ broadcast: broadcastData });
  } catch (error) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to create broadcast.",
      },
    });
  }
}

export default withLogging(handler);