import type {
  GetUserResponseBody,
  PostUserMetadataResponseBody,
} from "@app/lib/api/user";
import { getUserFromSession } from "@app/lib/iam/session";
import { getSubscriberHash } from "@app/lib/notifications";
import { UserResource } from "@app/lib/resources/user_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { isFavoritePlatform } from "@app/types/favorite_platforms";
import { isJobType } from "@app/types/job_type";
import { sendUserOperationMessage } from "@app/types/shared/user_operation";
import { sessionApp } from "@front-api/middlewares/ctx";
import { sessionAuth } from "@front-api/middlewares/session_auth";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import metadata from "./metadata";

const PatchUserBodySchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  jobType: z.string().optional(),
  imageUrl: z.string().nullish(),
  favoritePlatforms: z.array(z.string()).optional(),
  emailProvider: z.string().optional(),
  workspaceId: z.string().optional(),
});

// Mounted under /api/user. Every route below inherits sessionAuth.
const app = sessionApp();

/**
 * @swagger
 * /api/user:
 *   get:
 *     summary: Get current user
 *     description: Returns the authenticated user with their workspaces and subscriber hash.
 *     tags:
 *       - Private User
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: The authenticated user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/PrivateUser'
 *       404:
 *         description: User not found
 *   patch:
 *     summary: Update current user
 *     description: Update the authenticated user's profile (name, job type, favorite platforms, image).
 *     tags:
 *       - Private User
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               jobType:
 *                 type: string
 *               imageUrl:
 *                 type: string
 *                 nullable: true
 *               favoritePlatforms:
 *                 type: array
 *                 items:
 *                   type: string
 *               emailProvider:
 *                 type: string
 *               workspaceId:
 *                 type: string
 *     responses:
 *       200:
 *         description: User updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: Invalid request body
 *       404:
 *         description: User not found
 */

app.use("*", sessionAuth);

app.get("/", async (ctx): HandlerResult<GetUserResponseBody> => {
  const session = ctx.get("session");

  const user = await getUserFromSession(session);
  if (!user) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "The user was not found.",
      },
    });
  }

  // Set selectedWorkspace from the organization ID.
  if (session.organizationId) {
    const workspace = user.workspaces.find(
      (w) => w.workOSOrganizationId === session.organizationId
    );
    if (workspace) {
      user.selectedWorkspace = workspace.sId;
    }
  }

  ServerSideTracking.trackGetUser({ user }).catch((err) => {
    logger.error({ err, userId: user.sId }, "Failed to track user memberships");
  });

  const subscriberHash = await getSubscriberHash(user);
  return ctx.json({ user: { ...user, subscriberHash } });
});

app.patch(
  "/",
  validate("json", PatchUserBodySchema),
  async (ctx): HandlerResult<PostUserMetadataResponseBody> => {
    const session = ctx.get("session");
    const body = ctx.req.valid("json");

    const user = await getUserFromSession(session);
    if (!user) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "user_not_found",
          message: "The user was not found.",
        },
      });
    }

    // Set selectedWorkspace from the organization ID.
    if (session.organizationId) {
      const ws = user.workspaces.find(
        (w) => w.workOSOrganizationId === session.organizationId
      );
      if (ws) {
        user.selectedWorkspace = ws.sId;
      }
    }

    const u = await UserResource.fetchByModelId(user.id);
    if (!u) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "user_not_found",
          message: "The user was not found.",
        },
      });
    }

    const workspace = user.workspaces[0];
    if (workspace?.role === "admin") {
      sendUserOperationMessage({
        message:
          `workspace_sid: ${workspace?.sId}; email: [${user.email}]; ` +
          `User Name [${user.firstName} ${user.lastName}].`,
        logger,
        channel: "C075LJ6PUFQ",
      }).catch((err) => {
        logger.error(
          { error: err },
          "Failed to send user operation message to Slack."
        );
      });
    }

    const firstName = body.firstName.trim();
    const lastName = body.lastName.trim();
    const jobType = body.jobType?.trim();
    const { imageUrl, favoritePlatforms, emailProvider, workspaceId } = body;

    if (firstName.length === 0 || lastName.length === 0) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "First name and last name cannot be empty.",
        },
      });
    }

    if (firstName !== user.firstName || lastName !== user.lastName) {
      // Provisioned users cannot update their name.
      if (user.origin === "provisioned") {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Cannot update name for provisioned users.",
          },
        });
      }
      await u.updateName(firstName, lastName);
    }

    if (imageUrl && imageUrl !== user.image) {
      await u.updateImage(imageUrl);
    }

    if (jobType !== undefined && !isJobType(jobType)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Job type is invalid.",
        },
      });
    }

    if (favoritePlatforms !== undefined) {
      for (const platform of favoritePlatforms) {
        if (!isFavoritePlatform(platform)) {
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: `Invalid favorite platform: ${platform}`,
            },
          });
        }
      }
    }

    const userMetadata: Record<string, string | undefined> = {
      job_type: jobType,
      "onboarding:email_provider": emailProvider,
    };
    for (const [key, value] of Object.entries(userMetadata)) {
      if (value !== undefined) {
        await u.setMetadata(key, String(value));
      }
    }

    // Workspace-scoped metadata (requires workspaceId).
    if (workspaceId && favoritePlatforms !== undefined) {
      const ws = user.workspaces.find((w) => w.sId === workspaceId);
      if (ws) {
        await u.setMetadata(
          "favorite_platforms",
          JSON.stringify(favoritePlatforms),
          ws.id
        );
      }
    }

    await ServerSideTracking.trackUpdateUser({
      user,
      workspace: renderLightWorkspaceType({ workspace }),
      role: workspace.role !== "none" ? workspace.role : "user",
      jobType,
    });

    return ctx.json({ success: true });
  }
);

app.route("/metadata", metadata);

export default app;
