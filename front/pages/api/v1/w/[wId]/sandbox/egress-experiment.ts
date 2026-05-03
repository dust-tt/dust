import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

interface EgressExperimentResponse {
  received: string | null;
}

const EXPERIMENT_HEADER = "x-dust-experiment";
const EXPERIMENT_TOKEN_HEADER = "x-dust-experiment-token";

/**
 * @ignoreswagger
 * PHASE0(remove with the experiment): instrumentation endpoint for the dsbx
 * MITM substitution test. Logs the inbound `X-Dust-Experiment` header so it
 * shows up in Datadog and echoes the value back to the caller.
 *
 * Returns 404 unless BOTH `EGRESS_MITM_EXPERIMENT_HOST` and
 * `EGRESS_MITM_EXPERIMENT_TOKEN` are set on front. When enabled, callers must
 * present a matching `X-Dust-Experiment-Token` header or get a 401.
 *
 * This entire file should be deleted once Phase 0 is concluded.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<EgressExperimentResponse>>
): Promise<void> {
  const expectedToken = config.getEgressMitmExperimentToken();
  if (!config.getEgressMitmExperimentHost() || !expectedToken) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "invalid_request_error",
        message: "Not found.",
      },
    });
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST or GET is expected.",
      },
    });
  }

  const presentedToken = req.headers[EXPERIMENT_TOKEN_HEADER];
  const presented = Array.isArray(presentedToken)
    ? presentedToken[0]
    : presentedToken;
  if (presented !== expectedToken) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "not_authenticated",
        message: "Missing or invalid experiment token.",
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
      userAgent: req.headers["user-agent"] ?? null,
      remoteAddress: req.socket.remoteAddress ?? null,
    },
    "egress experiment hit"
  );

  res.status(200).json({ received });
}

export default withLogging(handler);
