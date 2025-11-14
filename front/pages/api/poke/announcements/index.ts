import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import { getPublicUploadBucket } from "@app/lib/file_storage";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { AnnouncementResource } from "@app/lib/resources/announcement_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";
import type { AnnouncementContentType } from "@app/types/announcement";
import {
  announcementTypeSchema,
  CHANGELOG_CATEGORIES,
} from "@app/types/announcement";

export type GetPokeAnnouncementsResponseBody = {
  announcements: AnnouncementContentType[];
  total: number;
};

const PostPokeAnnouncementRequestBodySchema = z.object({
  type: announcementTypeSchema,
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  content: z.string(),
  isPublished: z.boolean(),
  publishedAt: z.string().nullable().optional(),
  showInAppBanner: z.boolean(),
  eventDate: z.string().nullable().optional(),
  eventTimezone: z.string().nullable().optional(),
  eventLocation: z.string().nullable().optional(),
  eventUrl: z.string().nullable().optional(),
  categories: z.array(z.enum(CHANGELOG_CATEGORIES)).nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  imageFileId: z.string().nullable().optional(),
});

export type PostPokeAnnouncementRequestBody = z.infer<
  typeof PostPokeAnnouncementRequestBodySchema
>;

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
      const typeResult = announcementTypeSchema.safeParse(req.query.type);
      const type = typeResult.success ? typeResult.data : undefined;

      const isPublished =
        req.query.isPublished === "true"
          ? true
          : req.query.isPublished === "false"
            ? false
            : undefined;

      const { limit: limitParam, offset: offsetParam } = req.query;
      const limit = isString(limitParam) ? parseInt(limitParam, 10) : 50;
      const offset = isString(offsetParam) ? parseInt(offsetParam, 10) : 0;

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
            const publicBucket = getPublicUploadBucket();
            const storagePath = `announcements/images/${announcement.imageFileId}`;
            const gcsFile = publicBucket.file(storagePath);
            announcement.imageUrl = gcsFile.publicUrl();
          }
          return announcement;
        }),
        total: announcements.length,
      });
    }

    case "POST": {
      const parseResult = PostPokeAnnouncementRequestBodySchema.safeParse(
        req.body
      );
      if (!parseResult.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: fromError(parseResult.error).toString(),
          },
        });
      }

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
      } = parseResult.data;

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
        categories: categories || null,
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
