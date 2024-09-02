import type { WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getProviderStatusMemoized } from "@app/lib/api/status";
import { withSessionAuthentication } from "@app/lib/api/wrappers";
import { getSession } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

export interface GetAppStatusResponseBody {
  providerStatus: {
    description: string;
    link: string;
    name: string;
  } | null;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetAppStatusResponseBody>>
): Promise<void> {
  const session = await getSession(req, res);
  if (!session) {
    res.status(401).end();
    return;
  }

  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const providerStatus = await getProviderStatusMemoized();

  res.status(200).json({ providerStatus });
}

export default withSessionAuthentication(handler);
