import {
  activateCreditPricedFreePlan,
  isMetronomeBillingEnabled,
} from "@app/lib/api/subscription";
import { resolveCountryCode } from "@app/lib/geo/country-detection";
import {
  activatePhoneTrial,
  isWorkspaceEligibleForTrial,
} from "@app/lib/plans/trial";
import { WorkspaceVerificationAttemptResource } from "@app/lib/resources/workspace_verification_attempt_resource";
import { getClientIpFromContext } from "@front-api/lib/request";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

export type PostTrialVerifyResponseBody = {
  success: boolean;
};

// Mounted at /api/w/:wId/trial/start.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<PostTrialVerifyResponseBody> => {
    const auth = ctx.get("auth");

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
      const ip = getClientIpFromContext(ctx);
      let countryCode: string | undefined;
      try {
        countryCode = await resolveCountryCode(ip);
      } catch {
        // Fall back to USD if geo-IP lookup fails.
      }
      await activateCreditPricedFreePlan(auth, countryCode);
    } else {
      await activatePhoneTrial(auth);
    }

    return ctx.json({ success: true });
  }
);

export default app;
