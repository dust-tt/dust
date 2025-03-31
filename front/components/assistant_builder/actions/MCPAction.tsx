import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useState } from "react";

import AssistantBuilderDataSourceModal from "@app/components/assistant_builder/AssistantBuilderDataSourceModal";
import DataSourceSelectionSection from "@app/components/assistant_builder/DataSourceSelectionSection";
import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderMCPServerConfiguration,
} from "@app/components/assistant_builder/types";
import type { MCPServerMetadata } from "@app/lib/actions/mcp_actions";
import { serverRequiresInternalConfiguration } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { useMCPServerViews } from "@app/lib/swr/mcp_servers";
import { useSpacesAsAdmin } from "@app/lib/swr/spaces";
import type {
  DataSourceViewSelectionConfigurations,
  LightWorkspaceType,
  SpaceType,
} from "@app/types";

interface ActionMCPProps {
  owner: LightWorkspaceType;
  allowedSpaces: SpaceType[];
  actionConfiguration: AssistantBuilderMCPServerConfiguration;
  updateAction: (
    setNewAction: (
      previousAction: AssistantBuilderMCPServerConfiguration
    ) => AssistantBuilderMCPServerConfiguration
  ) => void;
  setEdited: (edited: boolean) => void;
}

export function ActionMCP({
  owner,
  allowedSpaces,
  actionConfiguration,
  updateAction,
  setEdited,
}: ActionMCPProps) {
  // Hack for now, we'll use the space based on the allowedSpaces once we have the object representing the join
  const { spaces } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: false,
  });
  const { mcpServers } = useMCPServerViews({
    owner,
    space: (spaces ?? []).find((space) => space.kind === "system"),
    filter: "all",
  });

  const defaultMCPServer = useMemo(
    () =>
      mcpServers.find(
        (mcpServer) => mcpServer.id === actionConfiguration.mcpServerId
      ),
    [mcpServers, actionConfiguration.mcpServerId]
  );

  const [selectedMCPServer, setSelectedMCPServer] =
    useState<MCPServerMetadata | null>(defaultMCPServer ?? null);
  const [showDataSourcesModal, setShowDataSourcesModal] = useState(false);

  useEffect(() => {
    updateAction((previousAction) => ({
      ...previousAction,
      dataSourceConfigurations:
        selectedMCPServer &&
        serverRequiresInternalConfiguration({
          serverMetadata: selectedMCPServer,
          mimeType: INTERNAL_MIME_TYPES.CONFIGURATION.DATA_SOURCE,
        })
          ? previousAction.dataSourceConfigurations || {}
          : null,
    }));
  }, [selectedMCPServer, updateAction]);

  const handleServerSelection = useCallback(
    (mcpServer: MCPServerMetadata) => {
      setEdited(true);
      setSelectedMCPServer(mcpServer);
      updateAction((previousAction) => ({
        ...previousAction,
        mcpServerId: mcpServer.id,
      }));
    },
    [setEdited, updateAction]
  );

  const handleDataSourceConfigUpdate = useCallback(
    (dsConfigs: DataSourceViewSelectionConfigurations) => {
      setEdited(true);
      updateAction((previousAction) => ({
        ...previousAction,
        dataSourceConfigurations: dsConfigs,
      }));
    },
    [setEdited, updateAction]
  );

  return (
    <>
      {actionConfiguration.dataSourceConfigurations && (
        <AssistantBuilderDataSourceModal
          isOpen={showDataSourcesModal}
          setOpen={setShowDataSourcesModal}
          owner={owner}
          onSave={handleDataSourceConfigUpdate}
          initialDataSourceConfigurations={
            actionConfiguration.dataSourceConfigurations
          }
          allowedSpaces={allowedSpaces}
          viewType="document"
        />
      )}

      <div>Will expose all the tools available via an MCP Server.</div>
      <div>For testing purposes, pick an internal server</div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            isSelect
            label={
              selectedMCPServer
                ? selectedMCPServer.name
                : "Select an MCP server"
            }
            className="w-48"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="mt-1" align="start">
          {mcpServers.map((mcpServer) => (
            <DropdownMenuItem
              key={mcpServer.id}
              label={mcpServer.name}
              onClick={() => handleServerSelection(mcpServer)}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {actionConfiguration.dataSourceConfigurations && (
        <DataSourceSelectionSection
          owner={owner}
          dataSourceConfigurations={
            actionConfiguration.dataSourceConfigurations
          }
          openDataSourceModal={() => setShowDataSourcesModal(true)}
          onSave={handleDataSourceConfigUpdate}
          viewType="document"
        />
      )}
    </>
  );
}

export function hasErrorActionMCP(
  action: AssistantBuilderActionConfiguration
): string | null {
  return action.type === "MCP" ? null : "Please select a MCP configuration.";
}
