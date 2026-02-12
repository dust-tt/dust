import type { NextApiRequest, NextApiResponse } from "next";

import { handleProgrammaticCostExportRequest } from "@app/lib/api/analytics/programmatic_cost_export";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { WithAPIErrorResponse } from "@app/types/error";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<string>>,
  auth: Authenticator
): Promise<void> {
  return handleProgrammaticCostExportRequest(req, res, auth);
}

export default withSessionAuthenticationForWorkspace(handler);
