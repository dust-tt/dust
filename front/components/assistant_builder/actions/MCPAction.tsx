import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@dust-tt/sparkle";
import { Button } from "@dust-tt/sparkle";
import { useState } from "react";

import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderMCPServerConfiguration,
} from "@app/components/assistant_builder/types";
import { AVAILABLE_INTERNAL_MCPSERVER_IDS } from "@app/lib/actions/constants";
import { useRemoteMCPServers } from "@app/lib/swr/remote_mcp_servers";
import type { LightWorkspaceType, SpaceType } from "@app/types";

export function ActionMCP({
  owner,
  allowedSpaces,
  actionConfiguration,
  updateAction,
  setEdited,
}: {
  owner: LightWorkspaceType;
  allowedSpaces: SpaceType[];
  actionConfiguration: AssistantBuilderMCPServerConfiguration;
  updateAction: (
    setNewAction: (
      previousAction: AssistantBuilderMCPServerConfiguration
    ) => AssistantBuilderMCPServerConfiguration
  ) => void;
  setEdited: (edited: boolean) => void;
}) {
  const [selectedInternalMCPServerId, setSelectedInternalMCPServerId] =
    useState<(typeof AVAILABLE_INTERNAL_MCPSERVER_IDS)[number] | null>(
      actionConfiguration.internalMCPServerId
    );
  const [selectedRemoteMCPServerId, setSelectedRemoteMCPServerId] =
    useState<string | null>(actionConfiguration.remoteMCPServerId);
  
  const space = allowedSpaces.length > 0 ? allowedSpaces[0] : null;
  const { servers, isServersLoading } = useRemoteMCPServers({
    disabled: !space,
    owner,
    space: space!,
  });

  const getDropdownLabel = () => {
    if (actionConfiguration.serverType === "internal" && selectedInternalMCPServerId) {
      return `${selectedInternalMCPServerId}`;
    } else if (actionConfiguration.serverType === "remote" && selectedRemoteMCPServerId) {
      const server = servers.find(s => s.id === selectedRemoteMCPServerId);
      return server ? `${server.name}` : "Unnamed Server";
    }
    return "Select a server";
  };

  return (
    <>
      <div>Will expose all the tools available via an MCP Server.</div>
      <div>
        You can choose from <b>internal</b>, Dust-developed MCP Servers, or from <b>Remote</b> MCP Servers.
        You can setup Remote servers in your spaces of choice, in the Knowledge tab.
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            isSelect
            label={getDropdownLabel()}
            className="w-48"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="mt-1" align="start">
          <div className="px-2 py-1 text-xs font-medium text-gray-500">Internal Servers</div>
          {AVAILABLE_INTERNAL_MCPSERVER_IDS.map((id) => (
            <DropdownMenuItem
              key={id}
              label={`${id}`}
              onClick={() => {
                setSelectedInternalMCPServerId(id);
                setSelectedRemoteMCPServerId(null);
                updateAction((previousAction) => ({
                  ...previousAction,
                  serverType: "internal",
                  internalMCPServerId: id,
                  remoteMCPServerId: null,
                }));
                setEdited(true);
              }}
            />
          ))}
          
          {servers.length > 0 && <DropdownMenuSeparator />}
          
          {servers.length > 0 && (
            <div className="px-2 py-1 text-xs font-medium text-gray-500">Remote Servers</div>
          )}
          
          {servers.map((server) => (
            <DropdownMenuItem
              key={server.id}
              label={`${server.name}`}
              onClick={() => {
                setSelectedInternalMCPServerId(null);
                setSelectedRemoteMCPServerId(server.id || null);
                updateAction((previousAction) => ({
                  ...previousAction,
                  serverType: "remote",
                  internalMCPServerId: null,
                  remoteMCPServerId: server.id!,
                }));
                setEdited(true);
              }}
            />
          ))}
          
          {isServersLoading && (
            <div className="px-2 py-1 text-sm text-gray-500">Loading remote servers...</div>
          )}
          
          {!isServersLoading && servers.length === 0 && (
            <div className="px-2 py-1 text-sm text-gray-500">No remote servers available</div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

export function hasErrorActionMCP(
  action: AssistantBuilderActionConfiguration
): string | null {
  return action.type === "MCP" ? null : "Please select a MCP configuration.";
}
