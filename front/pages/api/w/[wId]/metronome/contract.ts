// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { MetronomeContractSummary } from "@app/lib/api/credits/metronome_contract";
import {
  applyContractLifecycleAction,
  getMetronomeContractSummary,
} from "@app/lib/api/credits/metronome_contract";
import type { Authenticator } from "@app/lib/auth";
import type { ContractLifecycleError } from "@app/lib/metronome/contract_lifecycle";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export type { MetronomeContractSummary };

export type GetMetronomeContractResponseBody = {
  contract: MetronomeContractSummary | null;
};

type PatchMetronomeContractResponseBody = {
  success: boolean;
};

export const PatchMetronomeContractRequestBody = z.object({
  action: z.enum(["cancel", "reactivate"]),
});

function lifecycleErrorToApi(
  req: NextApiRequest,
  res: NextApiResponse,
  err: ContractLifecycleError
) {
  return apiError(req, res, {
    status_code: err.kind === "invalid_state" ? 400 : 502,
    api_error: {
      type:
        err.kind === "invalid_state"
          ? "subscription_state_invalid"
          : "internal_server_error",
      message: err.message,
    },
  });
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetMetronomeContractResponseBody | PatchMetronomeContractResponseBody
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
          "Only users that are `admins` for the current workspace can access this endpoint.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const result = await getMetronomeContractSummary(auth);
      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 502,
          api_error: {
            type: "internal_server_error",
            message: `Failed to fetch Metronome contract: ${result.error.message}`,
          },
        });
      }
      return res.status(200).json({ contract: result.value });
    }
    case "PATCH": {
      const bodyValidation = PatchMetronomeContractRequestBody.safeParse(
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

      const result = await applyContractLifecycleAction(
        auth,
        bodyValidation.data.action
      );
      if (result.isErr()) {
        return lifecycleErrorToApi(req, res, result.error);
      }
      return res.status(200).json({ success: true });
    }
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

export default withSessionAuthenticationForWorkspace(handler);
