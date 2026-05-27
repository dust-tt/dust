// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import {
  type GetBillingInvoicesResponseBody,
  listWorkspaceBillingInvoices,
} from "@app/lib/api/billing/invoices";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const GetBillingInvoicesQuerySchema = z.object({
  cursor: z.string().optional(),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetBillingInvoicesResponseBody>>,
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

  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const queryValidation = GetBillingInvoicesQuerySchema.safeParse(req.query);
  if (!queryValidation.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid query parameters: ${fromError(queryValidation.error).toString()}`,
      },
    });
  }

  const result = await listWorkspaceBillingInvoices({
    auth,
    cursor: queryValidation.data.cursor,
  });
  if (result.isErr()) {
    return apiError(req, res, {
      status_code: 502,
      api_error: {
        type: "internal_server_error",
        message: `Failed to fetch Stripe billing invoices: ${result.error.message}`,
      },
    });
  }

  return res.status(200).json({ billingInvoices: result.value });
}

export default withSessionAuthenticationForWorkspace(handler);
