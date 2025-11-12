import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { AnnouncementResource } from "@app/lib/resources/announcement_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { apiError } from "@app/logger/withlogging";
import type {
  AnnouncementContentType,
  AnnouncementType,
} from "@app/types/announcement";
import type { WithAPIErrorResponse } from "@app/types";

export type GetPokeAnnouncementsResponseBody = {
  announcements: AnnouncementContentType[];
  total: number;
};

export type PostPokeAnnouncementRequestBody = {
  type: AnnouncementType;
  slug: string;
  title: string;
  description: string;
  content: string;
  isPublished: boolean;
  publishedAt?: string | null;
  showInAppBanner: boolean;
  eventDate?: string | null;
  eventTimezone?: string | null;
  eventLocation?: string | null;
  eventUrl?: string | null;
  categories?: string[] | null;
  tags?: string[] | null;
  imageFileId?: string | null;
};

export type PostPokeAnnouncementResponseBody = {
  announcement: AnnouncementContentType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetPokeAnnouncementsResponseBody | PostPokeAnnouncementResponseBody
    >
  >,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(session, null);

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const type = req.query.type as AnnouncementType | undefined;
      const isPublished =
        req.query.isPublished === "true"
          ? true
          : req.query.isPublished === "false"
            ? false
            : undefined;
      const limit = req.query.limit
        ? parseInt(req.query.limit as string, 10)
        : 50;
      const offset = req.query.offset
        ? parseInt(req.query.offset as string, 10)
        : 0;

      const announcements = await AnnouncementResource.listAll({
        type,
        isPublished,
        limit,
        offset,
      });

      return res.status(200).json({
        announcements: announcements.map((a) => {
          const announcement = a.toJSON();
          // Generate image URL from imageFileId
          if (announcement.imageFileId) {
            announcement.imageUrl = `https://storage.googleapis.com/dust-public-uploads-test/announcements/images/${announcement.imageFileId}`;
          }
          return announcement;
        }),
        total: announcements.length,
      });
    }

    case "POST": {
      const {
        type,
        slug,
        title,
        description,
        content,
        isPublished,
        publishedAt,
        showInAppBanner,
        eventDate,
        eventTimezone,
        eventLocation,
        eventUrl,
        categories,
        tags,
        imageFileId,
      } = req.body as PostPokeAnnouncementRequestBody;

      // Validate required fields
      if (!type || !slug || !title || !description || !content) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Missing required fields",
          },
        });
      }

      // Validate slug uniqueness
      const existingAnnouncement = await AnnouncementResource.fetchBySlug(slug);
      if (existingAnnouncement) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Slug already exists",
          },
        });
      }

      // Create announcement
      const announcement = await AnnouncementResource.makeNew({
        sId: generateRandomModelSId(),
        type,
        slug,
        title,
        description,
        content,
        isPublished: isPublished || false,
        publishedAt: publishedAt ? new Date(publishedAt) : null,
        showInAppBanner: showInAppBanner || false,
        eventDate: eventDate ? new Date(eventDate) : null,
        eventTimezone: eventTimezone || null,
        eventLocation: eventLocation || null,
        eventUrl: eventUrl || null,
        categories: (categories as any) || null,
        tags: tags || null,
        imageFileId: imageFileId || null,
      });

      return res.status(201).json({
        announcement: announcement.toJSON(),
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported.",
        },
      });
  }
}

export default withSessionAuthenticationForPoke(handler);
