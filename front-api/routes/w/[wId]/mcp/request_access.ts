import { PostRequestActionsAccessBodySchema } from "@app/lib/api/mcp_schemas";
import { emailRecipientFromUser } from "@app/lib/notifications/transactional_emails";
import { notifyAccessRequest } from "@app/lib/notifications/triggers/access-request";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

const MAX_ACCESS_REQUESTS_PER_DAY = 30;

// Mounted at /api/w/:wId/mcp/request_access.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", PostRequestActionsAccessBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const user = auth.getNonNullableUser();
    const { emailMessage, mcpServerViewId } = ctx.req.valid("json");

    const mcpServerView = await MCPServerViewResource.fetchById(
      auth,
      mcpServerViewId
    );

    if (!mcpServerView) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "mcp_server_view_not_found",
          message: "The MCP server view was not found",
        },
      });
    }

    if (!mcpServerView.editedByUser?.sId) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "user_not_found",
          message: "No admin user found for this data source",
        },
      });
    }

    const rateLimitKey = `access_requests:${user.sId}`;
    const remaining = await rateLimiter({
      key: rateLimitKey,
      maxPerTimeframe: MAX_ACCESS_REQUESTS_PER_DAY,
      timeframeSeconds: 24 * 60 * 60,
      logger,
    });

    if (remaining === 0) {
      return apiError(ctx, {
        status_code: 429,
        api_error: {
          type: "rate_limit_error",
          message:
            `You have reached the limit of ${MAX_ACCESS_REQUESTS_PER_DAY} access requests ` +
            "per day. Please try again tomorrow.",
        },
      });
    }

    const owner = auth.getNonNullableWorkspace();
    const result = await notifyAccessRequest({
      recipient: emailRecipientFromUser(mcpServerView.editedByUser),
      workspaceId: owner.sId,
      workspaceName: owner.name,
      resourceKind: "mcp_server",
      resourceName: mcpServerView.getDisplayName(),
      requesterName: user.fullName(),
      requesterEmail: user.email,
      message: emailMessage,
    });

    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to send email",
        },
      });
    }
    return ctx.json({ success: true });
  }
);

export default app;
