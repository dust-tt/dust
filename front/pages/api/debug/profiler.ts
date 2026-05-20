// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */
import config from "@app/lib/api/config";
import { profileCPU, profileHeap } from "@app/lib/api/debug/profiler";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

export interface GetProfilerResponse {
  cpu: string;
  heap: string;
}

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetProfilerResponse>>
) {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const { secret } = req.query;
  const debugSecret = config.getProfilerSecret();

  if (!debugSecret || typeof secret !== "string" || secret !== debugSecret) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid debug secret.",
      },
    });
  }

  const cpuProfile = await profileCPU();
  const heapProfile = await profileHeap();

  logger.info({ cpuProfile, heapProfile }, "Profiler completed");
  res.status(200).json({
    cpu: cpuProfile,
    heap: heapProfile,
  });
}
