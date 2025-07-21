import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { agentBuilderFormSchema } from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentYAMLConverter } from "@app/lib/agent_yaml_converter/converter";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export const yamlAPIRequestSchema = z.object({
  formData: agentBuilderFormSchema,
});

export type YamlAPIResponse = {
  yamlContent: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<YamlAPIResponse>>,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  const { wId, aId } = req.query;

  if (typeof wId !== "string" || wId !== owner.sId || typeof aId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid workspace ID or agent ID",
      },
    });
  }

  const agentSId = aId;

  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Method not allowed",
      },
    });
  }

  try {
    const user = auth.getNonNullableUser();

    const { formData } = yamlAPIRequestSchema.parse(req.body);

    // Get the agent configuration to access the version
    const agentConfiguration = await getAgentConfiguration(
      auth,
      agentSId,
      "light"
    );

    if (!agentConfiguration) {
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "Agent configuration not found",
        },
      });
    }

    const yamlConfig = AgentYAMLConverter.fromBuilderFormData(formData, {
      agentSId,
      createdBy: user.sId,
      lastModified: new Date(),
      version: agentConfiguration.version.toString(),
    });

    const yamlString = AgentYAMLConverter.toYAMLString(yamlConfig);

    return res.status(200).json({
      yamlContent: yamlString,
    });
  } catch (error) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
