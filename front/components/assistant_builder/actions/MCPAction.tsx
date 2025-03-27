import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useState } from "react";

import AssistantBuilderDataSourceModal from "@app/components/assistant_builder/AssistantBuilderDataSourceModal";
import DataSourceSelectionSection from "@app/components/assistant_builder/DataSourceSelectionSection";
import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderMCPServerConfiguration,
} from "@app/components/assistant_builder/types";
import { AVAILABLE_INTERNAL_MCPSERVER_IDS } from "@app/lib/actions/constants";
import type { InternalMCPServerIdType } from "@app/lib/actions/mcp";
import { useInternalMcpServerMetadata } from "@app/lib/swr/mcp";
import type {
  DataSourceViewSelectionConfigurations,
  LightWorkspaceType,
  SpaceType,
} from "@app/types";
import { serverRequiresInternalConfiguration } from "@app/lib/actions/mcp_internal_actions/input_schemas";

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

  const { metadata } = useInternalMcpServerMetadata({
    owner,
    serverId: actionConfiguration.internalMCPServerId,
  });

  useEffect(() => {
    updateAction((previousAction) => ({
      ...previousAction,
      dataSourceConfigurations:
        metadata &&
        serverRequiresInternalConfiguration({
          serverMetadata: metadata,
          mimeType: INTERNAL_MIME_TYPES.CONFIGURATION.DATA_SOURCE,
        })
          ? previousAction.dataSourceConfigurations || {}
          : null,
    }));
  }, [metadata, setEdited, updateAction]);

  const handleServerSelection = useCallback(
    (serverId: InternalMCPServerIdType) => {
      setEdited(true);
      updateAction((previousAction) => ({
        ...previousAction,
        serverType: "internal",
        internalMCPServerId: serverId,
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
