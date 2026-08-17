import { getUserFromSession } from "@app/lib/iam/session";
import { getNovuClient } from "@app/lib/notifications/novu-client";
import type { MobileNotificationTokenResponseBody } from "@app/types/api/user";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { sessionApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { ChatOrPushProviderEnum } from "@novu/api/models/components";
import { z } from "zod";

const MobileNotificationTokenBodySchema = z.object({
  token: z.string().trim().min(1).max(4096),
});

// Mounted under /api/user/mobile_notification_tokens and inherits sessionAuth.
const app = sessionApp();

/**
 * @swagger
 * /api/user/mobile_notification_tokens:
 *   post:
 *     summary: Register a mobile notification token
 *     description: Associates an Android FCM token with the authenticated user's notification subscriber.
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
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 maxLength: 4096
 *     responses:
 *       200:
 *         description: Token registered
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
 *       500:
 *         description: Notification provider unavailable
 *   delete:
 *     summary: Unregister a mobile notification token
 *     description: Removes one Android FCM token while preserving the user's other registered devices.
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
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 maxLength: 4096
 *     responses:
 *       200:
 *         description: Token unregistered
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
 *       500:
 *         description: Notification provider unavailable
 */

app.post(
  "/",
  validate("json", MobileNotificationTokenBodySchema),
  async (ctx): HandlerResult<MobileNotificationTokenResponseBody> => {
    const user = await getUserFromSession(ctx.get("session"));
    if (!user) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "user_not_found",
          message: "The user was not found.",
        },
      });
    }

    try {
      const novu = await getNovuClient();
      const token = ctx.req.valid("json").token;
      await novu.subscribers.create({
        subscriberId: user.sId,
        email: user.email,
        firstName: user.firstName ?? undefined,
        lastName: user.lastName ?? undefined,
        avatar: user.image ?? undefined,
      });
      const subscriber = await novu.subscribers.retrieve(user.sId);
      const isAlreadyRegistered = subscriber.result.channels?.some(
        (channel) =>
          channel.providerId === ChatOrPushProviderEnum.Fcm &&
          channel.credentials.deviceTokens?.includes(token)
      );
      if (isAlreadyRegistered) {
        return ctx.json({ success: true as const });
      }
      await novu.subscribers.credentials.append(
        {
          providerId: ChatOrPushProviderEnum.Fcm,
          credentials: { deviceTokens: [token] },
        },
        user.sId
      );
      return ctx.json({ success: true as const });
    } catch (error) {
      return apiError(
        ctx,
        {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to register the mobile notification token.",
          },
        },
        normalizeError(error)
      );
    }
  }
);

app.delete(
  "/",
  validate("json", MobileNotificationTokenBodySchema),
  async (ctx): HandlerResult<MobileNotificationTokenResponseBody> => {
    const user = await getUserFromSession(ctx.get("session"));
    if (!user) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "user_not_found",
          message: "The user was not found.",
        },
      });
    }

    try {
      const novu = await getNovuClient();
      const subscriber = await novu.subscribers.retrieve(user.sId);
      const token = ctx.req.valid("json").token;
      const fcmChannels =
        subscriber.result.channels?.filter(
          (channel) => channel.providerId === ChatOrPushProviderEnum.Fcm
        ) ?? [];

      await Promise.all(
        fcmChannels.map(async (channel) => {
          const currentTokens = channel.credentials.deviceTokens ?? [];
          if (!currentTokens.includes(token)) {
            return;
          }
          await novu.subscribers.credentials.update(
            {
              providerId: ChatOrPushProviderEnum.Fcm,
              ...(channel.integrationIdentifier
                ? { integrationIdentifier: channel.integrationIdentifier }
                : {}),
              credentials: {
                deviceTokens: currentTokens.filter(
                  (currentToken) => currentToken !== token
                ),
              },
            },
            user.sId
          );
        })
      );
      return ctx.json({ success: true as const });
    } catch (error) {
      return apiError(
        ctx,
        {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to unregister the mobile notification token.",
          },
        },
        normalizeError(error)
      );
    }
  }
);

export default app;
