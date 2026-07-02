import { Authenticator } from "@app/lib/auth";
import { createCustomerPortalSession } from "@app/lib/plans/stripe";
import { sessionApp } from "@front-api/middlewares/ctx";
import { sessionAuth } from "@front-api/middlewares/session_auth";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const PostStripePortalRequestBody = z.object({
  workspaceId: z.string(),
});

export type PostStripePortalResponseBody = {
  portalUrl: string;
};

// Mounted at /api/stripe/portal.
const app = sessionApp();

app.use("*", sessionAuth);

/** @ignoreswagger */
app.post(
  "/",
  validate("json", PostStripePortalRequestBody),
  async (ctx): HandlerResult<PostStripePortalResponseBody> => {
    const session = ctx.get("session");
    const { workspaceId } = ctx.req.valid("json");

    const auth = await Authenticator.fromSession(session, workspaceId);
    const owner = auth.workspace();
    const subscription = auth.subscription();

    if (!owner || !subscription) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "workspace_not_found",
          message: "The workspace was not found.",
        },
      });
    }

    // biome-ignore lint/plugin/noDirectRoleCheck: custom auth flow — auth created inline, not via workspaceAuth middleware
    if (!auth.isAdmin()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message:
            "Only users that are `admins` for the current workspace can see the subscription or modify it.",
        },
      });
    }

    const portalUrl = await createCustomerPortalSession({
      owner,
      subscription,
    });
    if (portalUrl) {
      return ctx.json({ portalUrl });
    }

    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message:
          "Stripe API: An error occurred while fetching the customer portal url.",
      },
    });
  }
);

export default app;
