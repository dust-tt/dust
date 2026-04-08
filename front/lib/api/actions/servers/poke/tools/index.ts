import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  GET_WORKSPACE_METADATA_TOOL_NAME,
  POKE_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/poke/metadata";
import { connectorHandlers } from "@app/lib/api/actions/servers/poke/tools/connectors";
import { conversationHandlers } from "@app/lib/api/actions/servers/poke/tools/conversations";
import { userHandlers } from "@app/lib/api/actions/servers/poke/tools/users";
import {
  enforcePokeSecurityGates,
  getTargetAuth,
  jsonResponse,
} from "@app/lib/api/actions/servers/poke/tools/utils";
import { workspaceHandlers } from "@app/lib/api/actions/servers/poke/tools/workspace";
import config from "@app/lib/api/config";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { isDevelopment } from "@app/types/shared/env";

const handlers: ToolHandlers<typeof POKE_TOOLS_METADATA> = {
  [GET_WORKSPACE_METADATA_TOOL_NAME]: async ({ workspace_id }, extra) => {
    const gateResult = await enforcePokeSecurityGates(
      extra,
      GET_WORKSPACE_METADATA_TOOL_NAME,
      workspace_id
    );
    if (gateResult.isErr()) {
      return gateResult;
    }

    const targetAuthResult = await getTargetAuth(workspace_id);
    if (targetAuthResult.isErr()) {
      return targetAuthResult;
    }
    const targetAuth = targetAuthResult.value;

    const targetWorkspace = targetAuth.getNonNullableWorkspace();
    const plan = targetAuth.plan();

    const workspaceResource = await WorkspaceResource.fetchById(workspace_id);
    const workosEnvironmentId = config.getWorkOSEnvironmentId();

    return jsonResponse({
      sId: targetWorkspace.sId,
      name: targetWorkspace.name,
      segmentation: targetWorkspace.segmentation,
      ssoEnforced:
        "ssoEnforced" in targetWorkspace
          ? targetWorkspace.ssoEnforced
          : undefined,
      plan: plan
        ? {
            code: plan.code,
            name: plan.name,
          }
        : null,
      links: {
        poke: `${config.getPokeAppUrl()}/${targetWorkspace.sId}`,
        workos: workspaceResource?.workOSOrganizationId
          ? `https://dashboard.workos.com/${workosEnvironmentId}/organizations/${workspaceResource.workOSOrganizationId}`
          : null,
        metronome: workspaceResource?.metronomeCustomerId
          ? `https://app.metronome.com/${isDevelopment() ? "sandbox/" : ""}customers/${workspaceResource.metronomeCustomerId}`
          : null,
        health: `https://metabase.dust.tt/dashboard/34-snowflake-workspace-health?end_date=2030-12-31&start_date=2024-01-01&tab=30-executive-summary&workspace_size_difference_margin=0.2&workspacesid=${targetWorkspace.sId}`,
      },
    });
  },

  ...workspaceHandlers,
  ...connectorHandlers,
  ...conversationHandlers,
  ...userHandlers,
};

export const TOOLS = buildTools(POKE_TOOLS_METADATA, handlers);
