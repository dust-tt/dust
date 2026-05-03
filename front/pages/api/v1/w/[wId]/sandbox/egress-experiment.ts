// =============================================================================
// TEMPORARY FILE — DELETE WHEN PHASE 0 OF THE MITM EGRESS EXPERIMENT IS DONE.
//
// This is throwaway instrumentation. It exists only to verify the dsbx-side
// secret-substitution path end to end: the agent inside the sandbox calls
// this endpoint with `X-Dust-Experiment: __DUST_EXPERIMENT_PLACEHOLDER__`,
// dsbx (when enabled) rewrites the header value mid-flight, and this
// endpoint logs what it actually received to Datadog so we can confirm the
// substitution happened.
//
// Off by default: returns 404 unless both EGRESS_MITM_EXPERIMENT_HOST and
// EGRESS_MITM_EXPERIMENT_TOKEN are set on front.
//
// When the experiment concludes, delete this file along with the rest of
// the PHASE0(remove with the experiment) markers tracked in the design doc
// (CLAUDE_SECRET_SWAP_DESIGN.md, Phase 0 section).
// =============================================================================

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
 * PHASE0(remove with the experiment) — see file header for the full context
 * and removal instructions.
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
