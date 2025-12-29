import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { DataRetentionConfig } from "@app/lib/data_retention";
import {
  getAgentsDataRetention,
  getConversationsDataRetention,
  getWorkspaceDataRetention,
} from "@app/lib/data_retention";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type PokeGetDataRetentionResponseBody = {
  data: DataRetentionConfig;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeGetDataRetentionResponseBody>>,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();

  if (!owner || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Method not supported. Only GET is allowed.",
      },
    });
  }

  const workspaceRetention = await getWorkspaceDataRetention(auth);
  const convosRetention = await getConversationsDataRetention(auth);
  const agentsRetention = await getAgentsDataRetention(auth);

  const response: PokeGetDataRetentionResponseBody = {
    data: {
      workspace: workspaceRetention,
      conversations: convosRetention,
      agents: agentsRetention,
    },
  };

  res.status(200).json(response);
}

export default withSessionAuthenticationForPoke(handler);
