import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { agentBuilderFormSchema } from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentYAMLConverter } from "@app/lib/agent_yaml_converter";
import { saveYAMLFile } from "@app/lib/agent_yaml_converter/file_operations";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export const saveYAMLAPIRequestSchema = z.object({
  formData: agentBuilderFormSchema,
  agentSId: z.string().min(1, "Agent ID is required"),
  workspaceId: z.string().min(1, "Workspace ID is required"),
  isDraft: z.boolean(),
});

export type SaveYAMLAPIRequest = z.infer<typeof saveYAMLAPIRequestSchema>;

export type SaveYAMLAPIResponse = {
  success: boolean;
  filePath?: string;
  error?: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<SaveYAMLAPIResponse>>,
  auth: Authenticator
): Promise<void> {
  const { wId, aId } = req.query;

  if (typeof wId !== "string" || typeof aId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid workspace ID or agent ID",
      },
    });
  }

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
    const owner = auth.getNonNullableWorkspace();

    // Validate request body with Zod
    const { formData, agentSId, workspaceId, isDraft } =
      saveYAMLAPIRequestSchema.parse(req.body);

    // Validate that agentSId matches URL parameter
    if (agentSId !== aId) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Agent ID in request body must match URL parameter",
        },
      });
    }

    // Validate that workspaceId matches URL parameter
    if (workspaceId !== wId) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Workspace ID in request body must match URL parameter",
        },
      });
    }

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

    // Convert form data to YAML with real user ID and version
    const yamlConfig = AgentYAMLConverter.fromBuilderFormData(formData, {
      agentSId,
      createdBy: user.sId, // Use real user ID
      lastModified: new Date(),
      version: agentConfiguration.version.toString(), // Use real version
    });

    const yamlString = AgentYAMLConverter.toYAMLString(yamlConfig);

    // Save YAML file
    const filePath = await saveYAMLFile(
      yamlString,
      agentSId,
      owner.sId,
      isDraft,
      user.sId
    );

    return res.status(200).json({
      success: true,
      filePath,
    });
  } catch (error) {
    console.error("Failed to save YAML file:", error);
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
