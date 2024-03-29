import type { WithAPIErrorReponse, WorkspaceDomain } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getWorkspaceVerifiedDomain } from "@app/lib/api/workspace";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";

export type ListMemberEmailsResponseBody = {
  verified_domains: WorkspaceDomain[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorReponse<ListMemberEmailsResponseBody>>
): Promise<void> {
  const keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }
  const { auth } = await Authenticator.fromKey(
    keyRes.value,
    req.query.wId as string
  );

  const owner = auth.workspace();
  const isSystemKey = keyRes.value.isSystem;
  if (!owner || !isSystemKey || !auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const verifiedDomain = await getWorkspaceVerifiedDomain(owner);

      return res
        .status(200)
        .json({ verified_domains: verifiedDomain ? [verifiedDomain] : [] });

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

export default withLogging(handler);
