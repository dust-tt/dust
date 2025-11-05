import type { NextApiRequest, NextApiResponse } from "next";
import { Op } from "sequelize";

import { BroadcastModel } from "@app/lib/models/broadcast";
import type { BroadcastType } from "@app/pages/api/poke/broadcasts/index";
import { apiError, withLogging } from "@app/logger/withlogging";

export type GetChangelogResponseBody = {
  entries: BroadcastType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetChangelogResponseBody>
) {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported",
        message: "Only GET method is supported.",
      },
    });
  }

  try {
    // Fetch published changelog entries
    const broadcasts = await BroadcastModel.findAll({
      where: {
        status: "published",
        publishToChangelog: true,
        publishedAt: {
          [Op.not]: null,
        },
      },
      order: [["publishedAt", "DESC"]],
      limit: 50, // Limit to last 50 entries
    });

    const entries: BroadcastType[] = broadcasts.map((b) => ({
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

    res.setHeader("Cache-Control", "public, max-age=300"); // Cache for 5 minutes
    return res.status(200).json({ entries });
  } catch (error) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to fetch changelog entries.",
      },
    });
  }
}

export default withLogging(handler);