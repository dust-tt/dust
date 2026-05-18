import { escape } from "html-escaper";
import { Hono } from "hono";
import { z } from "zod";

import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import config from "@app/lib/api/config";
import { sendEmailWithTemplate } from "@app/lib/api/email";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";

import { validate } from "@front-api/middleware/validator";

export const PostRequestActionsAccessBodySchema = z.object({
  emailMessage: z.string(),
  mcpServerViewId: z.string(),
});

export type PostRequestActionsAccessBody = z.infer<
  typeof PostRequestActionsAccessBodySchema
>;

const MAX_ACCESS_REQUESTS_PER_DAY = 30;

// Mounted at /api/w/:wId/mcp/request_access.
const app = new Hono();

app.post(
  "/",
  validate("json", PostRequestActionsAccessBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const user = auth.getNonNullableUser();
    const { emailMessage, mcpServerViewId } = c.req.valid("json");
    const emailRequester = user.email;

    const mcpServerView = await MCPServerViewResource.fetchById(
      auth,
      mcpServerViewId
    );

    if (!mcpServerView) {
      return c.json(
        {
          error: {
            type: "mcp_server_view_not_found",
            message: "The MCP server view was not found",
          },
        },
        404
      );
    }

    if (!mcpServerView.editedByUser?.sId) {
      return c.json(
        {
          error: {
            type: "user_not_found",
            message: "No admin user found for this data source",
          },
        },
        403
      );
    }

    const rateLimitKey = `access_requests:${user.sId}`;
    const remaining = await rateLimiter({
      key: rateLimitKey,
      maxPerTimeframe: MAX_ACCESS_REQUESTS_PER_DAY,
      timeframeSeconds: 24 * 60 * 60,
      logger,
    });

    if (remaining === 0) {
      return c.json(
        {
          error: {
            type: "rate_limit_error",
            message:
              `You have reached the limit of ${MAX_ACCESS_REQUESTS_PER_DAY} access requests ` +
              "per day. Please try again tomorrow.",
          },
        },
        429
      );
    }

    const body =
      `${emailRequester} has sent you a request regarding access to ` +
      `tools ${getMcpServerViewDisplayName(mcpServerView.toJSON())}: ` +
      escape(emailMessage);

    const result = await sendEmailWithTemplate({
      to: mcpServerView.editedByUser.email,
      from: config.getSupportEmailAddress(),
      replyTo: emailRequester,
      subject: `[Dust] Tools request from ${emailRequester}`,
      body,
    });

    if (result.isErr()) {
      return c.json(
        {
          error: {
            type: "internal_server_error",
            message: "Failed to send email",
          },
        },
        500
      );
    }
    return c.json({ success: true });
  }
);

export default app;
