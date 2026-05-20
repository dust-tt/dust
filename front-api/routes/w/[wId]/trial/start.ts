import {
  activatePhoneTrial,
  isWorkspaceEligibleForTrial,
} from "@app/lib/plans/trial";
import { WorkspaceVerificationAttemptResource } from "@app/lib/resources/workspace_verification_attempt_resource";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

export type PostTrialVerifyResponseBody = {
  success: boolean;
};

// Mounted at /api/w/:wId/trial/start.
const app = new Hono();

app.post("/", async (c) => {
  const auth = c.get("auth");

  if (!auth.isAdmin()) {
    return apiError(c, {
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
    return apiError(c, {
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
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "This workspace does not have a verified phone number.",
      },
    });
  }

  await activatePhoneTrial(auth);

  const body: PostTrialVerifyResponseBody = { success: true };
  return c.json(body);
});

export default app;
