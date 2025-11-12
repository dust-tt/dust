import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { AnnouncementResource } from "@app/lib/resources/announcement_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import type { AnnouncementContentType } from "@app/types/announcement";

export type GetPokeAnnouncementResponseBody = {
  announcement: AnnouncementContentType;
};

const PatchPokeAnnouncementRequestBodySchema = z.object({
  slug: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  content: z.string().optional(),
  isPublished: z.boolean().optional(),
  publishedAt: z.string().nullable().optional(),
  showInAppBanner: z.boolean().optional(),
  eventDate: z.string().nullable().optional(),
  eventTimezone: z.string().nullable().optional(),
  eventLocation: z.string().nullable().optional(),
  eventUrl: z.string().nullable().optional(),
  categories: z.array(z.string()).nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  imageFileId: z.string().nullable().optional(),
});

export type PatchPokeAnnouncementRequestBody = z.infer<
  typeof PatchPokeAnnouncementRequestBodySchema
>;

export type PatchPokeAnnouncementResponseBody = {
  announcement: AnnouncementContentType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetPokeAnnouncementResponseBody | PatchPokeAnnouncementResponseBody
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

  const { aId } = req.query;
  if (typeof aId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid announcement ID",
      },
    });
  }

  const announcement = await AnnouncementResource.fetchBySId(aId);
  if (!announcement) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "Announcement not found",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const announcementJSON = announcement.toJSON();
      // Generate image URL from imageFileId
      if (announcementJSON.imageFileId) {
        announcementJSON.imageUrl = `https://storage.googleapis.com/dust-public-uploads-test/announcements/images/${announcementJSON.imageFileId}`;
      }
      return res.status(200).json({
        announcement: announcementJSON,
      });
    }

    case "PATCH": {
      const parseResult =
        PatchPokeAnnouncementRequestBodySchema.safeParse(req.body);
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

      // If slug is being changed, validate uniqueness
      if (slug && slug !== announcement.slug) {
        const existingAnnouncement =
          await AnnouncementResource.fetchBySlug(slug);
        if (existingAnnouncement) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Slug already exists",
            },
          });
        }
      }

      const updateData: Record<string, unknown> = {};
      if (slug !== undefined) {updateData.slug = slug;}
      if (title !== undefined) {updateData.title = title;}
      if (description !== undefined) {updateData.description = description;}
      if (content !== undefined) {updateData.content = content;}
      if (isPublished !== undefined) {updateData.isPublished = isPublished;}
      if (publishedAt !== undefined) {
        updateData.publishedAt = publishedAt ? new Date(publishedAt) : null;
      }
      if (showInAppBanner !== undefined) {
        updateData.showInAppBanner = showInAppBanner;
      }
      if (eventDate !== undefined) {
        updateData.eventDate = eventDate ? new Date(eventDate) : null;
      }
      if (eventTimezone !== undefined) {updateData.eventTimezone = eventTimezone;}
      if (eventLocation !== undefined) {updateData.eventLocation = eventLocation;}
      if (eventUrl !== undefined) {updateData.eventUrl = eventUrl;}
      if (categories !== undefined) {updateData.categories = categories;}
      if (tags !== undefined) {updateData.tags = tags;}
      if (imageFileId !== undefined) {updateData.imageFileId = imageFileId;}

      const [affectedCount] = await announcement.update(updateData);
      if (affectedCount === 0) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to update announcement",
          },
        });
      }

      // Fetch updated announcement
      const updatedAnnouncement = await AnnouncementResource.fetchBySId(aId);
      if (!updatedAnnouncement) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "data_source_not_found",
            message: "Announcement not found after update",
          },
        });
      }

      const updatedAnnouncementJSON = updatedAnnouncement.toJSON();
      // Generate image URL from imageFileId
      if (updatedAnnouncementJSON.imageFileId) {
        updatedAnnouncementJSON.imageUrl = `https://storage.googleapis.com/dust-public-uploads-test/announcements/images/${updatedAnnouncementJSON.imageFileId}`;
      }

      return res.status(200).json({
        announcement: updatedAnnouncementJSON,
      });
    }

    case "DELETE": {
      const deleteResult = await announcement.delete(auth, {});
      if (deleteResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to delete announcement",
          },
        });
      }

      res.status(204).end();
      return;
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
