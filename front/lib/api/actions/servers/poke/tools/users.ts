import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { POKE_TOOLS_METADATA } from "@app/lib/api/actions/servers/poke/metadata";
import {
  FIND_WORKSPACE_BY_CONNECTOR_ID_TOOL_NAME,
  LIST_WORKSPACE_GROUPS_TOOL_NAME,
} from "@app/lib/api/actions/servers/poke/metadata";
import {
  enforcePokeSecurityGates,
  getTargetAuth,
  jsonResponse,
} from "@app/lib/api/actions/servers/poke/tools/utils";
import config from "@app/lib/api/config";
import { GroupResource } from "@app/lib/resources/group_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { Err } from "@app/types/shared/result";

type UserHandlers = Pick<
  ToolHandlers<typeof POKE_TOOLS_METADATA>,
  | typeof LIST_WORKSPACE_GROUPS_TOOL_NAME
  | typeof FIND_WORKSPACE_BY_CONNECTOR_ID_TOOL_NAME
>;

export const userHandlers: UserHandlers = {
  [LIST_WORKSPACE_GROUPS_TOOL_NAME]: async ({ workspace_id }, extra) => {
    const gateResult = await enforcePokeSecurityGates(
      extra,
      LIST_WORKSPACE_GROUPS_TOOL_NAME,
      workspace_id
    );
    if (gateResult.isErr()) {
      return gateResult;
    }

    const targetAuthResult = await getTargetAuth(workspace_id);
    if (targetAuthResult.isErr()) {
      return targetAuthResult;
    }

    const groups = await GroupResource.listAllWorkspaceGroups(
      targetAuthResult.value,
      {
        groupKinds: ["global", "regular", "space_editors", "provisioned"],
      }
    );

    return jsonResponse({
      workspace_id,
      count: groups.length,
      groups: groups.map((g) => g.toJSON()),
      poke_url: `${config.getPokeAppUrl()}/${workspace_id}/groups`,
    });
  },

  [FIND_WORKSPACE_BY_CONNECTOR_ID_TOOL_NAME]: async (
    { connector_id, workspace_id },
    extra
  ) => {
    const gateResult = await enforcePokeSecurityGates(
      extra,
      FIND_WORKSPACE_BY_CONNECTOR_ID_TOOL_NAME,
      workspace_id
    );
    if (gateResult.isErr()) {
      return gateResult;
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );
    const connectorRes = await connectorsAPI.getConnector(connector_id);

    if (connectorRes.isErr()) {
      return new Err(
        new MCPError(
          `Connector "${connector_id}" not found: ${connectorRes.error.message}`,
          { tracked: false }
        )
      );
    }

    const connector = connectorRes.value;
    const workspace = await WorkspaceResource.fetchById(connector.workspaceId);

    return jsonResponse({
      connector_id,
      connectorType: connector.type,
      workspace: workspace
        ? {
            sId: workspace.sId,
            name: workspace.name,
            poke_url: `${config.getPokeAppUrl()}/${workspace.sId}`,
          }
        : null,
    });
  },
};
