import { isMetronomeBillingEnabled } from "@app/lib/api/subscription";
import {
  activateCreditPricedFreePlan,
  activatePhoneTrial,
  isWorkspaceEligibleForTrial,
} from "@app/lib/plans/trial";
import { WorkspaceVerificationAttemptResource } from "@app/lib/resources/workspace_verification_attempt_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

export type PostTrialVerifyResponseBody = {
  success: boolean;
};

// Mounted at /api/w/:wId/trial/start.
const app = workspaceApp();

app.post("/", async (ctx): HandlerResult<PostTrialVerifyResponseBody> => {
  const auth = ctx.get("auth");

  if (!auth.isAdmin()) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can access this endpoint.",
      },
    });
  }

  const isValidForTrial = await isWorkspaceEligibleForTrial(auth);
  if (!isValidForTrial) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "This workspace is not eligible for the phone trial.",
      },
    });
  }

  const hasVerifiedPhone =
    await WorkspaceVerificationAttemptResource.hasVerifiedPhone(auth);
  if (!hasVerifiedPhone) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "This workspace does not have a verified phone number.",
      },
    });
  }

  if (await isMetronomeBillingEnabled(auth)) {
    await activateCreditPricedFreePlan(auth);
  } else {
    await activatePhoneTrial(auth);
  }

  return ctx.json({ success: true });
});

export default app;
