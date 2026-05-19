import { escape } from "html-escaper";
import { Hono } from "hono";
import { z } from "zod";

import config from "@app/lib/api/config";
import { sendEmailWithTemplate } from "@app/lib/api/email";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";

import { validate } from "@front-api/middleware/validator";

const PostRequestAccessBodySchema = z.object({
  emailMessage: z.string(),
  dataSourceId: z.string(),
});

const MAX_ACCESS_REQUESTS_PER_DAY = 30;

// Mounted at /api/w/:wId/data_sources/request_access.
const app = new Hono();

app.post("/", validate("json", PostRequestAccessBodySchema), async (c) => {
  const auth = c.get("auth");
  const user = auth.getNonNullableUser();
  const emailRequester = user.email;
  const { emailMessage, dataSourceId } = c.req.valid("json");

  const dataSource = await DataSourceResource.fetchById(auth, dataSourceId, {
    includeEditedBy: true,
  });
  if (!dataSource) {
    return c.json(
      {
        error: {
          type: "data_source_not_found",
          message: "The data source was not found.",
        },
      },
      404
    );
  }

  // Prevent users from requesting access to data sources outside their workspace (e.g., public).
  if (dataSource.workspaceId !== auth.getNonNullableWorkspace().id) {
    return c.json(
      {
        error: {
          type: "data_source_not_found",
          message: "The data source was not found.",
        },
      },
      404
    );
  }

  if (!dataSource.editedByUser?.sId) {
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
            `You have reached the limit of ${MAX_ACCESS_REQUESTS_PER_DAY} access ` +
            "requests per day. Please try again tomorrow.",
        },
      },
      429
    );
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
});

export default app;
