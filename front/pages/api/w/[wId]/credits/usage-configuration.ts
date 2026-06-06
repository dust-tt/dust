// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type {
  GetCreditUsageConfigurationResponseBody,
  PatchCreditUsageConfigurationResponseBody,
} from "@app/lib/api/credits/balance_threshold_alert";
import {
  getWorkspaceBalanceThreshold,
  PatchCreditUsageConfigurationRequestBody,
  syncMetronomeBalanceThresholdAlert,
} from "@app/lib/api/credits/balance_threshold_alert";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | GetCreditUsageConfigurationResponseBody
      | PatchCreditUsageConfigurationResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can access the credit usage configuration.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      return handleGet(req, res, auth);
    case "PATCH":
      return handlePatch(req, res, auth);
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or PATCH is expected.",
        },
      });
  }
}

async function handleGet(
  _req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetCreditUsageConfigurationResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const balanceThresholdCredits = await getWorkspaceBalanceThreshold(auth);

  return res.status(200).json({
    configuration: { balanceThresholdCredits },
  });
}

async function handlePatch(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PatchCreditUsageConfigurationResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const bodyValidation = PatchCreditUsageConfigurationRequestBody.safeParse(
    req.body
  );
  if (!bodyValidation.success) {
    const pathError = fromError(bodyValidation.error).toString();
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${pathError}`,
      },
    });
  }

  const { balanceThresholdCredits } = bodyValidation.data;
  // Normalize 0 to null — both mean "no threshold / warning off".
  const threshold =
    balanceThresholdCredits && balanceThresholdCredits > 0
      ? balanceThresholdCredits
      : null;

  const syncResult = await syncMetronomeBalanceThresholdAlert({
    auth,
    balanceThresholdCredits: threshold,
  });
  if (syncResult.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: syncResult.error.message,
      },
    });
  }

  return res.status(200).json({
    configuration: { balanceThresholdCredits: threshold },
  });
}

export default withSessionAuthenticationForWorkspace(handler);
