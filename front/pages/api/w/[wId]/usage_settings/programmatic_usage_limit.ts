// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */

import { getAuditLogContext } from "@app/lib/api/audit/workos_audit";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import {
  getProgrammaticUsageLimit,
  syncProgrammaticUsageLimit,
} from "@app/lib/api/credits/programmatic_usage_limit";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const UpdateProgrammaticUsageLimitBodySchema = z.object({
  monthlyCapCredits: z.number().int().nonnegative().nullable(),
});

export type GetProgrammaticUsageLimitResponseBody = {
  monthlyCapCredits: number | null;
};

export type PutProgrammaticUsageLimitResponseBody = {
  monthlyCapCredits: number | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | GetProgrammaticUsageLimitResponseBody
      | PutProgrammaticUsageLimitResponseBody
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
          "Only users that are `admins` for the current workspace can manage the programmatic usage limit.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const result = await getProgrammaticUsageLimit(auth);
      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: result.error.message,
          },
        });
      }
      return res.status(200).json({ monthlyCapCredits: result.value });
    }

    case "PUT": {
      const bodyValidation = UpdateProgrammaticUsageLimitBodySchema.safeParse(
        req.body
      );
      if (!bodyValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${fromError(bodyValidation.error).toString()}`,
          },
        });
      }

      const { monthlyCapCredits } = bodyValidation.data;

      const auditContext = getAuditLogContext(auth, req);
      const result = await syncProgrammaticUsageLimit({
        auth,
        monthlyCapCredits,
        auditContext,
      });
      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: result.error.message,
          },
        });
      }
      return res.status(200).json({ monthlyCapCredits });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or PUT is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
