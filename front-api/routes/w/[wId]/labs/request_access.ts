import config from "@app/lib/api/config";
import { sendEmailWithTemplate } from "@app/lib/api/email";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { escape } from "html-escaper";
import { z } from "zod";

export const PostRequestFeatureAccessBodySchema = z.object({
  emailMessage: z.string(),
  featureName: z.string(),
});

export type PostRequestFeatureAccessBody = z.infer<
  typeof PostRequestFeatureAccessBodySchema
>;

type PostRequestFeatureAccessResponseBody = { success: true };

const MAX_ACCESS_REQUESTS_PER_DAY = 30;

// Mounted at /api/w/:wId/labs/request_access.
const app = workspaceApp();

app.post(
  "/",
  validate("json", PostRequestFeatureAccessBodySchema),
  async (ctx): HandlerResult<PostRequestFeatureAccessResponseBody> => {
    const auth = ctx.get("auth");
    const user = auth.getNonNullableUser();

    if (!auth.isUser()) {
      return apiError(ctx, {
        status_code: 401,
        api_error: {
          type: "data_source_auth_error",
          message: "You are not authorized to submit connections requests.",
        },
      });
    }

    const emailRequester = user.email;
    const { emailMessage, featureName } = ctx.req.valid("json");

    const rateLimitKey = `labs_access_requests:${auth.getNonNullableWorkspace().sId}`;
    const remaining = await rateLimiter({
      key: rateLimitKey,
      maxPerTimeframe: MAX_ACCESS_REQUESTS_PER_DAY,
      timeframeSeconds: 24 * 60 * 60, // 1 day
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
      `${emailRequester} requests access to the ${escape(featureName)} labs feature for ` +
      `workspace <em>${auth.getNonNullableWorkspace().sId}</em>:
  <br />
  <br />
  ${escape(emailMessage)}`;

    const result = await sendEmailWithTemplate({
      to: "support@dust.tt",
      from: config.getSupportEmailAddress(),
      subject: `[Dust] Labs Feature Request: ${featureName} from ${emailRequester}`,
      replyTo: emailRequester,
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
    return ctx.json({ success: true as const });
  }
);

export default app;
