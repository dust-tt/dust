/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import {
  listProjectKnowledgeFromConnectors,
  type ProjectKnowledgeFromConnectorItem,
} from "@app/lib/api/projects/context";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export type PokeProjectKnowledgeFromConnectorItem =
  ProjectKnowledgeFromConnectorItem;

export type PokeListProjectKnowledgeFromConnectors = {
  items: PokeProjectKnowledgeFromConnectorItem[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PokeListProjectKnowledgeFromConnectors>
  >,
  session: SessionWithUser
): Promise<void> {
  const { wId, projectId } = req.query;
  if (!isString(wId) || !isString(projectId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid workspace or project ID.",
      },
    });
  }

  const auth = await Authenticator.fromSuperUserSession(session, wId);
  const owner = auth.workspace();

  if (!owner || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Workspace not found.",
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

  const space = await SpaceResource.fetchById(auth, projectId);
  if (!space || !space.isProject()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "Project not found.",
      },
    });
  }

  const items = await listProjectKnowledgeFromConnectors(auth, space);

  return res.status(200).json({ items });
}

export default withSessionAuthenticationForPoke(handler);
