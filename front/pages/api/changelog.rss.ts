import type { NextApiRequest, NextApiResponse } from "next";
import { Op } from "sequelize";
import RSS from "rss";

import { BroadcastModel } from "@app/lib/models/broadcast";
import { apiError } from "@app/logger/withlogging";

async function handler(req: NextApiRequest, res: NextApiResponse) {
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

    // Create RSS feed
    const feed = new RSS({
      title: "Dust Changelog",
      description: "Stay up to date with the latest features and improvements to Dust.",
      feed_url: `${process.env.NEXT_PUBLIC_BASE_URL || "https://dust.tt"}/api/changelog.rss`,
      site_url: `${process.env.NEXT_PUBLIC_BASE_URL || "https://dust.tt"}/changelog`,
      image_url: `${process.env.NEXT_PUBLIC_BASE_URL || "https://dust.tt"}/static/logo-dust.png`,
      managingEditor: "team@dust.tt",
      webMaster: "team@dust.tt",
      copyright: `© ${new Date().getFullYear()} Dust`,
      language: "en",
      ttl: 60, // Cache for 60 minutes
    });

    // Add items to RSS feed
    broadcasts.forEach((broadcast) => {
      const itemUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "https://dust.tt"}/changelog#${broadcast.sId}`;

      let description = broadcast.shortDescription;
      if (broadcast.longDescription) {
        description = `${broadcast.shortDescription}\n\n${broadcast.longDescription}`;
      }

      feed.item({
        title: broadcast.title,
        description: description,
        url: itemUrl,
        guid: broadcast.sId,
        date: broadcast.publishedAt || broadcast.createdAt,
        enclosure: broadcast.mediaUrl
          ? {
              url: broadcast.mediaUrl,
              type:
                broadcast.mediaType === "video"
                  ? "video/mp4"
                  : broadcast.mediaType === "gif"
                  ? "image/gif"
                  : "image/jpeg",
            }
          : undefined,
      });
    });

    // Generate RSS XML
    const xml = feed.xml({ indent: true });

    // Set response headers
    res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300"); // Cache for 5 minutes

    return res.status(200).send(xml);
  } catch (error) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to generate RSS feed.",
      },
    });
  }
}

export default handler;