import type { WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthentication } from "@app/lib/api/auth_wrappers";
import {
  getDustStatusMemoized,
  getProviderStatusMemoized,
} from "@app/lib/api/status";
import { getSession } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

export interface GetAppStatusResponseBody {
  dustStatus: {
    description: string;
    link: string;
    name: string;
  } | null;
  providersStatus: {
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

  const [providersStatus, dustStatus] = await Promise.all([
    getProviderStatusMemoized(),
    getDustStatusMemoized(),
  ]);

  res.status(200).json({ providersStatus, dustStatus });
}

export default withSessionAuthentication(handler);
