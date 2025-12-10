import type { NextApiRequest, NextApiResponse } from "next";

import type { AgentBuilderMCPConfiguration } from "@app/components/agent_builder/types";
import { getAccessibleSourcesAndAppsForActions } from "@app/lib/agent_builder/server_side_props_helpers";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { SkillConfigurationResource } from "@app/lib/resources/skill/skill_configuration_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

function nameToStorageFormat(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export type GetSkillActionsResponseBody = {
  actions: AgentBuilderMCPConfiguration[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetSkillActionsResponseBody>>,
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

  const owner = auth.getNonNullableWorkspace();

  const featureFlags = await getFeatureFlags(owner);
  if (!featureFlags.includes("skills")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "Skill builder is not enabled for this workspace.",
      },
    });
  }

  const { sId } = req.query;
  if (typeof sId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid skill ID.",
      },
    });
  }

  const skillResource = await SkillConfigurationResource.fetchById(auth, sId);

  if (!skillResource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "skill_not_found",
        message: "Skill configuration not found.",
      },
    });
  }

  if (!skillResource.canEdit && !auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "Only editors can view skill actions.",
      },
    });
  }

  const { mcpServerViews } = await getAccessibleSourcesAndAppsForActions(auth);
  const mcpServerViewsJSON = mcpServerViews.map((v) => v.toJSON());

  // Build actions from skill's MCP server configurations
  const actions: AgentBuilderMCPConfiguration[] = [];
  for (const mcpConfig of skillResource.mcpServerConfigurations) {
    /**/
    const mcpServerView = mcpServerViewsJSON.find(
      (view) => view.id === mcpConfig.mcpServerViewId
    );
    if (!mcpServerView) {
      continue;
    }

    // Generate name using same logic as agent builder
    const rawName = mcpServerView.name ?? mcpServerView.server.name ?? "";
    const sanitizedName = rawName ? nameToStorageFormat(rawName) : "";

    actions.push({
      type: "MCP",
      name: sanitizedName,
      description: mcpServerView.server.description,
      configuration: {
        mcpServerViewId: mcpServerView.sId,
        dataSourceConfigurations: null,
        tablesConfigurations: null,
        childAgentId: null,
        timeFrame: null,
        additionalConfiguration: {},
        dustAppConfiguration: null,
        secretName: null,
        jsonSchema: null,
        reasoningModel: null,
        _jsonSchemaString: null,
      },
    });
  }

  return res.status(200).json({ actions });
}

export default withSessionAuthenticationForWorkspace(handler);
