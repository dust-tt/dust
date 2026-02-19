import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

const COPILOT_SCENARIOS = [
  "shrink-wrap",
  "template",
  "existing",
  "from-scratch",
] as const;

type CopilotScenario = (typeof COPILOT_SCENARIOS)[number];

function isCopilotScenario(value: string): value is CopilotScenario {
  return (COPILOT_SCENARIOS as readonly string[]).includes(value);
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<string>>,
  auth: Authenticator
): Promise<void> {
  const { scenario } = req.query;

  if (!isString(scenario) || !isCopilotScenario(scenario)) {
    return apiError(req, res, {
      status_code: 422,
      api_error: {
        type: "unprocessable_entity",
        message: `The scenario query parameter is invalid or missing. Expected one of: ${COPILOT_SCENARIOS.join(
          ", "
        )}.`,
      },
    });
  }

  switch (req.method) {
    case "GET":
      switch (scenario) {
        case "shrink-wrap":
          return res.status(200).json("shrink-wrap scenario prompt");
        case "template":
          return res.status(200).json("template scenario prompt");
        case "existing":
          return res.status(200).json("existing scenario prompt");
        case "from-scratch":
          return res.status(200).json("from-scratch scenario prompt");
        default:
          assertNever(scenario);
      }

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

export default withSessionAuthenticationForWorkspace(handler);
