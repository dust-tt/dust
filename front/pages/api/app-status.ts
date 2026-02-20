import type { AppStatus } from "@app/lib/api/status";
import {
  getDustStatusMemoized,
  getProviderStatusMemoized,
} from "@app/lib/api/status";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<AppStatus>>
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const [providersStatus, dustStatus] = await Promise.all([
    getProviderStatusMemoized(),
    getDustStatusMemoized(),
  ]);

  res.setHeader(
    "Cache-Control",
    "public, max-age=120, stale-while-revalidate=300"
  );
  res.status(200).json({ providersStatus, dustStatus });
}

export default withLogging(handler);
