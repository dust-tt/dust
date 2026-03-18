import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { POKE_TOOLS_METADATA } from "@app/lib/api/actions/servers/poke/metadata";
import {
  BLOCK_WORKSPACE_TOOL_NAME,
  PAUSE_CONNECTOR_TOOL_NAME,
  TOGGLE_FEATURE_FLAG_TOOL_NAME,
  UNBLOCK_WORKSPACE_TOOL_NAME,
  UNPAUSE_CONNECTOR_TOOL_NAME,
} from "@app/lib/api/actions/servers/poke/metadata";
import {
  enforcePokeSecurityGates,
  getTargetAuth,
  jsonResponse,
} from "@app/lib/api/actions/servers/poke/tools/utils";
import config from "@app/lib/api/config";
import { invalidateFeatureFlagsCache } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { isWhitelistableFeature } from "@app/types/shared/feature_flags";
import { Err } from "@app/types/shared/result";

type WriteHandlers = Pick<
  ToolHandlers<typeof POKE_TOOLS_METADATA>,
  | typeof PAUSE_CONNECTOR_TOOL_NAME
  | typeof UNPAUSE_CONNECTOR_TOOL_NAME
  | typeof TOGGLE_FEATURE_FLAG_TOOL_NAME
  | typeof BLOCK_WORKSPACE_TOOL_NAME
  | typeof UNBLOCK_WORKSPACE_TOOL_NAME
>;

async function getConnectorIdForDataSource(
  workspaceSId: string,
  dataSourceSId: string
): Promise<string | null> {
  const targetAuthResult = await getTargetAuth(workspaceSId);
  if (targetAuthResult.isErr()) {
    return null;
  }
  const ds = await DataSourceResource.fetchById(
    targetAuthResult.value,
    dataSourceSId
  );
  return ds?.connectorId ?? null;
}

export const writeHandlers: WriteHandlers = {
  [PAUSE_CONNECTOR_TOOL_NAME]: async (
    { workspace_id, data_source_id },
    extra
  ) => {
    const gateResult = await enforcePokeSecurityGates(
      extra,
      PAUSE_CONNECTOR_TOOL_NAME,
      workspace_id
    );
    if (gateResult.isErr()) {
      return gateResult;
    }

    const connectorId = await getConnectorIdForDataSource(
      workspace_id,
      data_source_id
    );
    if (!connectorId) {
      return new Err(
        new MCPError(
          `No connector found for data source "${data_source_id}" in workspace "${workspace_id}".`,
          { tracked: false }
        )
      );
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );
    const result = await connectorsAPI.pauseConnector(connectorId);

    if (result.isErr()) {
      return new Err(
        new MCPError(`Failed to pause connector: ${result.error.message}`, {
          tracked: false,
        })
      );
    }

    logger.info(
      {
        action: "poke_mcp_write",
        tool: PAUSE_CONNECTOR_TOOL_NAME,
        workspace_id,
        data_source_id,
        connectorId,
        callerEmail: extra.auth.user()?.email,
      },
      "Poke MCP: connector paused"
    );

    return jsonResponse({
      success: true,
      action: "paused",
      workspace_id,
      data_source_id,
      connectorId,
    });
  },

  [UNPAUSE_CONNECTOR_TOOL_NAME]: async (
    { workspace_id, data_source_id },
    extra
  ) => {
    const gateResult = await enforcePokeSecurityGates(
      extra,
      UNPAUSE_CONNECTOR_TOOL_NAME,
      workspace_id
    );
    if (gateResult.isErr()) {
      return gateResult;
    }

    const connectorId = await getConnectorIdForDataSource(
      workspace_id,
      data_source_id
    );
    if (!connectorId) {
      return new Err(
        new MCPError(
          `No connector found for data source "${data_source_id}" in workspace "${workspace_id}".`,
          { tracked: false }
        )
      );
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );
    const result = await connectorsAPI.unpauseConnector(connectorId);

    if (result.isErr()) {
      return new Err(
        new MCPError(`Failed to unpause connector: ${result.error.message}`, {
          tracked: false,
        })
      );
    }

    logger.info(
      {
        action: "poke_mcp_write",
        tool: UNPAUSE_CONNECTOR_TOOL_NAME,
        workspace_id,
        data_source_id,
        connectorId,
        callerEmail: extra.auth.user()?.email,
      },
      "Poke MCP: connector unpaused"
    );

    return jsonResponse({
      success: true,
      action: "unpaused",
      workspace_id,
      data_source_id,
      connectorId,
    });
  },

  [TOGGLE_FEATURE_FLAG_TOOL_NAME]: async (
    { workspace_id, flag_name, enable },
    extra
  ) => {
    const gateResult = await enforcePokeSecurityGates(
      extra,
      TOGGLE_FEATURE_FLAG_TOOL_NAME,
      workspace_id
    );
    if (gateResult.isErr()) {
      return gateResult;
    }

    if (!isWhitelistableFeature(flag_name)) {
      return new Err(
        new MCPError(`"${flag_name}" is not a valid feature flag name.`, {
          tracked: false,
        })
      );
    }

    const targetAuthResult = await getTargetAuth(workspace_id);
    if (targetAuthResult.isErr()) {
      return targetAuthResult;
    }
    const workspace = targetAuthResult.value.getNonNullableWorkspace();

    if (enable) {
      await FeatureFlagResource.enableMany(workspace, [flag_name]);
    } else {
      await FeatureFlagResource.disableMany(workspace, [flag_name]);
    }

    await invalidateFeatureFlagsCache(workspace);

    logger.info(
      {
        action: "poke_mcp_write",
        tool: TOGGLE_FEATURE_FLAG_TOOL_NAME,
        workspace_id,
        flag_name,
        enable,
        callerEmail: extra.auth.user()?.email,
      },
      `Poke MCP: feature flag ${enable ? "enabled" : "disabled"}`
    );

    return jsonResponse({
      success: true,
      action: enable ? "enabled" : "disabled",
      workspace_id,
      flag_name,
    });
  },

  [BLOCK_WORKSPACE_TOOL_NAME]: async ({ workspace_id }, extra) => {
    const gateResult = await enforcePokeSecurityGates(
      extra,
      BLOCK_WORKSPACE_TOOL_NAME,
      workspace_id
    );
    if (gateResult.isErr()) {
      return gateResult;
    }

    const workspaceResource = await WorkspaceResource.fetchById(workspace_id);
    if (!workspaceResource) {
      return new Err(
        new MCPError(`Workspace "${workspace_id}" not found.`, {
          tracked: false,
        })
      );
    }

    const result = await workspaceResource.updateWorkspaceKillSwitch({
      operation: "block",
    });

    if (result.isErr()) {
      return new Err(
        new MCPError(`Failed to block workspace: ${result.error.message}`, {
          tracked: false,
        })
      );
    }

    logger.info(
      {
        action: "poke_mcp_write",
        tool: BLOCK_WORKSPACE_TOOL_NAME,
        workspace_id,
        callerEmail: extra.auth.user()?.email,
      },
      "Poke MCP: workspace blocked"
    );

    return jsonResponse({
      success: true,
      action: "blocked",
      workspace_id,
      wasUpdated: result.value.wasUpdated,
    });
  },

  [UNBLOCK_WORKSPACE_TOOL_NAME]: async ({ workspace_id }, extra) => {
    const gateResult = await enforcePokeSecurityGates(
      extra,
      UNBLOCK_WORKSPACE_TOOL_NAME,
      workspace_id
    );
    if (gateResult.isErr()) {
      return gateResult;
    }

    const workspaceResource = await WorkspaceResource.fetchById(workspace_id);
    if (!workspaceResource) {
      return new Err(
        new MCPError(`Workspace "${workspace_id}" not found.`, {
          tracked: false,
        })
      );
    }

    const result = await workspaceResource.updateWorkspaceKillSwitch({
      operation: "unblock",
    });

    if (result.isErr()) {
      return new Err(
        new MCPError(`Failed to unblock workspace: ${result.error.message}`, {
          tracked: false,
        })
      );
    }

    logger.info(
      {
        action: "poke_mcp_write",
        tool: UNBLOCK_WORKSPACE_TOOL_NAME,
        workspace_id,
        callerEmail: extra.auth.user()?.email,
      },
      "Poke MCP: workspace unblocked"
    );

    return jsonResponse({
      success: true,
      action: "unblocked",
      workspace_id,
      wasUpdated: result.value.wasUpdated,
    });
  },
};
