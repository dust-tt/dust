import config from "@app/lib/api/config";
import { sendEmailWithTemplate } from "@app/lib/api/email";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { escape } from "html-escaper";
import { z } from "zod";

const PostRequestAccessBodySchema = z.object({
  emailMessage: z.string(),
  dataSourceId: z.string(),
});

const MAX_ACCESS_REQUESTS_PER_DAY = 30;

// Mounted at /api/w/:wId/data_sources/request_access.
const app = workspaceApp();

app.post("/", validate("json", PostRequestAccessBodySchema), async (ctx) => {
  const auth = ctx.get("auth");
  const user = auth.getNonNullableUser();
  const emailRequester = user.email;
  const { emailMessage, dataSourceId } = ctx.req.valid("json");

  const dataSource = await DataSourceResource.fetchById(auth, dataSourceId, {
    includeEditedBy: true,
  });
  if (!dataSource) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source was not found.",
      },
    });
  }

  // Prevent users from requesting access to data sources outside their workspace (e.g., public).
  if (dataSource.workspaceId !== auth.getNonNullableWorkspace().id) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source was not found.",
      },
    });
  }

  if (!dataSource.editedByUser?.sId) {
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
          `You have reached the limit of ${MAX_ACCESS_REQUESTS_PER_DAY} access ` +
          "requests per day. Please try again tomorrow.",
      },
    });
  }

  const body =
    `${emailRequester} has sent you a request regarding access to connection ` +
    `${escape(dataSource.name)}: ${escape(emailMessage)}`;

  const result = await sendEmailWithTemplate({
    to: dataSource.editedByUser.email,
    from: config.getSupportEmailAddress(),
    replyTo: emailRequester,
    subject: `[Dust] Request Data source from ${emailRequester}`,
    body,
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
});

export default app;
