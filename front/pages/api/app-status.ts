import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthentication } from "@app/lib/api/auth_wrappers";
import {
  getDustStatusMemoized,
  getProviderStatusMemoized,
} from "@app/lib/api/status";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

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
  res: NextApiResponse<WithAPIErrorResponse<GetAppStatusResponseBody>>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- session is passed by the auth wrapper
  session: SessionWithUser
): Promise<void> {
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
