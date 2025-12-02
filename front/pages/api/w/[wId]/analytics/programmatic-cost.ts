import type { NextApiRequest, NextApiResponse } from "next";

import {
  handleProgrammaticCostRequest,
  type AvailableGroup,
  type GetWorkspaceProgrammaticCostResponse,
  type GroupByType,
  type WorkspaceProgrammaticCostPoint,
} from "@app/lib/api/analytics/programmatic_cost";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { WithAPIErrorResponse } from "@app/types";

// Re-export types for consumers
export type {
  AvailableGroup,
  GetWorkspaceProgrammaticCostResponse,
  GroupByType,
  WorkspaceProgrammaticCostPoint,
};

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
