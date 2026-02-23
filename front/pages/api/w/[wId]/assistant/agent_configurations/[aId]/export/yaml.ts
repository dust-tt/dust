import { exportAgentConfigurationAsYAML } from "@app/lib/api/assistant/configuration/yaml_export";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetAgentConfigurationYAMLExportResponseBody = {
  yamlContent: string;
  filename: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetAgentConfigurationYAMLExportResponseBody>
  >,
  auth: Authenticator
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

  const { aId } = req.query;
  if (!isString(aId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const result = await exportAgentConfigurationAsYAML(auth, aId);

  if (result.isErr()) {
    return apiError(req, res, result.error);
  }

  return res.status(200).json(result.value);
}

export default withSessionAuthenticationForWorkspace(handler);
