import type { NextApiRequest, NextApiResponse } from "next";

import type { GetWorkspaceProgrammaticCostResponse } from "@app/lib/api/analytics/programmatic_cost";
import { handleProgrammaticCostRequest } from "@app/lib/api/analytics/programmatic_cost";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { WithAPIErrorResponse } from "@app/types";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetWorkspaceProgrammaticCostResponse>
  >,
  auth: Authenticator
): Promise<void> {
  return handleProgrammaticCostRequest(req, res, auth);
}

export default withSessionAuthenticationForWorkspace(handler);
