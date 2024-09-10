import type { WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getMembers } from "@app/lib/api/workspace";
import { withPublicApiAuthentication } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

export type ListMemberEmailsResponseBody = {
  emails: string[];
};

/**
 * @ignoreswagger
 * System API key only endpoint. Undocumented.
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ListMemberEmailsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (!auth.isSystemKey()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  const { activeOnly } = req.query;

  switch (req.method) {
    case "GET":
      const { members: allMembers } = await getMembers(auth, {
        activeOnly: !!activeOnly,
      });

      return res.status(200).json({ emails: allMembers.map((m) => m.email) });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withPublicApiAuthentication(handler);
