import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

interface EgressExperimentResponse {
  received: string | null;
}

const EXPERIMENT_HEADER = "x-dust-experiment";

/**
 * @ignoreswagger
 * Phase 0 PoC instrumentation endpoint for the dsbx MITM substitution test.
 * Logs the inbound `X-Dust-Experiment` header so it shows up in Datadog and
 * echoes the value back to the caller. No auth, no DB, no secrets.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<EgressExperimentResponse>>
): Promise<void> {
  if (req.method !== "POST" && req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST or GET is expected.",
      },
    });
  }

  const headerValue = req.headers[EXPERIMENT_HEADER];
  const received = Array.isArray(headerValue)
    ? (headerValue[0] ?? null)
    : (headerValue ?? null);

  logger.info(
    {
      event: "sandbox.egress_experiment.hit",
      method: req.method,
      received,
      authorization: req.headers.authorization ?? null,
      userAgent: req.headers["user-agent"] ?? null,
      remoteAddress: req.socket.remoteAddress ?? null,
    },
    "egress experiment hit"
  );

  res.status(200).json({ received });
}

export default withLogging(handler);
