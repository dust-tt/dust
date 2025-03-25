import { MIME_TYPES } from "@dust-tt/client";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import AssistantBuilderDataSourceModal from "@app/components/assistant_builder/AssistantBuilderDataSourceModal";
import DataSourceSelectionSection from "@app/components/assistant_builder/DataSourceSelectionSection";
import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderMCPServerConfiguration,
} from "@app/components/assistant_builder/types";
import { AVAILABLE_INTERNAL_MCPSERVER_IDS } from "@app/lib/actions/constants";
import type { InternalMCPServerIdType } from "@app/lib/actions/mcp";
import { useInternalMcpServerTools } from "@app/lib/swr/mcp";
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
  const [showDataSourcesModal, setShowDataSourcesModal] = useState(false);

  const { tools } = useInternalMcpServerTools({
    owner,
    serverId: actionConfiguration.internalMCPServerId,
  });

  useEffect(() => {
    updateAction((previousAction) => ({
      ...previousAction,
      resources: {
        dataSourceConfigurations: tools?.some(
          (r) => r.inputSchema.mimeType === MIME_TYPES.DATA_SOURCE_VIEW
        )
          ? previousAction.resources?.dataSourceConfigurations || {}
          : undefined,
      },
    }));
  }, [tools, setEdited, updateAction]);

  const handleServerSelection = (serverId: InternalMCPServerIdType) => {
    setEdited(true);
    updateAction((previousAction) => ({
      ...previousAction,
      serverType: "internal",
      internalMCPServerId: serverId,
    }));
  };

  const handleDataSourceConfigUpdate = (
    dsConfigs: DataSourceViewSelectionConfigurations
  ) => {
    setEdited(true);
    updateAction((previousAction) => ({
      ...previousAction,
      resources: {
        ...previousAction.resources,
        dataSourceConfigurations: dsConfigs,
      },
    }));
  };

  return (
    <>
      {actionConfiguration.resources.dataSourceConfigurations && (
        <AssistantBuilderDataSourceModal
          isOpen={showDataSourcesModal}
          setOpen={setShowDataSourcesModal}
          owner={owner}
          onSave={handleDataSourceConfigUpdate}
          initialDataSourceConfigurations={
            actionConfiguration.resources.dataSourceConfigurations
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
              actionConfiguration.internalMCPServerId ??
              "Select a internal server"
            }
            className="w-48"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="mt-1" align="start">
          {AVAILABLE_INTERNAL_MCPSERVER_IDS.map((id) => (
            <DropdownMenuItem
              key={id}
              label={id}
              onClick={() => handleServerSelection(id)}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {actionConfiguration.resources.dataSourceConfigurations && (
        <DataSourceSelectionSection
          owner={owner}
          dataSourceConfigurations={
            actionConfiguration.resources.dataSourceConfigurations
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
