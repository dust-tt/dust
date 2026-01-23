import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { fetchLLMTrace, isLLMTraceId } from "@app/lib/api/llm/traces/buffer";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";

interface GetLLMTraceResponseBody {
  trace: unknown | null;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetLLMTraceResponseBody>>,
  session: SessionWithUser
): Promise<void> {
  const { runId, wId } = req.query;
  if (!isString(wId) || !isString(runId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "The request query is invalid, expects { wId: string, runId: string }.",
      },
    });
  }

  const auth = await Authenticator.fromSuperUserSession(session, wId);

  // Validate that this is actually an LLM runId.
  if (!isLLMTraceId(runId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "RunId does not have the expected LLM prefix.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const trace = await fetchLLMTrace(auth, { runId });

      return res.status(200).json({ trace });

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

export default withSessionAuthenticationForPoke(handler);
