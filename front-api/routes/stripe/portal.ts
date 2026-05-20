import { Authenticator } from "@app/lib/auth";
import { createCustomerPortalSession } from "@app/lib/plans/stripe";
import { sessionAuth } from "@front-api/middleware/session_auth";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

const PostStripePortalRequestBody = z.object({
  workspaceId: z.string(),
});

// Mounted at /api/stripe/portal.
const app = new Hono();

app.use("*", sessionAuth);

app.post("/", validate("json", PostStripePortalRequestBody), async (ctx) => {
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

  const portalUrl = await createCustomerPortalSession({ owner, subscription });
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
});

export default app;
