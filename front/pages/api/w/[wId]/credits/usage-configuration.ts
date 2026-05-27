// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export type CreditUsageConfigurationBody = {
  disableCreditCapWarning: boolean;
};

export type GetCreditUsageConfigurationResponseBody = {
  configuration: CreditUsageConfigurationBody;
};

export type PatchCreditUsageConfigurationResponseBody = {
  configuration: CreditUsageConfigurationBody;
};

export const PatchCreditUsageConfigurationRequestBody = z
  .object({
    disableCreditCapWarning: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

// Defaults returned when no row exists for the workspace.
const DEFAULT_CONFIGURATION: CreditUsageConfigurationBody = {
  disableCreditCapWarning: false,
};

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
  const existing =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);

  return res.status(200).json({
    configuration: existing
      ? { disableCreditCapWarning: existing.disableCreditCapWarning }
      : DEFAULT_CONFIGURATION,
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

  const patch = bodyValidation.data;

  const existing =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);

  let configuration: CreditUsageConfigurationResource;
  if (existing) {
    const updateResult = await existing.updateConfiguration(auth, patch);
    if (updateResult.isErr()) {
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: updateResult.error.message,
        },
      });
    }
    configuration = existing;
  } else {
    const createResult = await CreditUsageConfigurationResource.makeNew(auth, {
      defaultDiscountPercent: 0,
      paygCapCredits: null,
      disableCreditCapWarning: false,
      ...patch,
    });
    if (createResult.isErr()) {
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: createResult.error.message,
        },
      });
    }
    configuration = createResult.value;
  }

  return res.status(200).json({
    configuration: {
      disableCreditCapWarning: configuration.disableCreditCapWarning,
    },
  });
}

export default withSessionAuthenticationForWorkspace(handler);
