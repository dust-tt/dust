import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { Button } from "@dust-tt/sparkle";
import { useState } from "react";

import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderMCPServerConfiguration,
} from "@app/components/assistant_builder/types";
import { AVAILABLE_INTERNAL_MCPSERVER_IDS } from "@app/lib/actions/constants";
import type { LightWorkspaceType, SpaceType } from "@app/types";

type ActionMCPProps = {
  owner: LightWorkspaceType;
  allowedSpaces: SpaceType[];
  actionConfiguration: AssistantBuilderMCPServerConfiguration;
  updateAction: (
    setNewAction: (
      previousAction: AssistantBuilderMCPServerConfiguration
    ) => AssistantBuilderMCPServerConfiguration
  ) => void;
  setEdited: (edited: boolean) => void;
};

export function ActionMCP({
  actionConfiguration,
  updateAction,
  setEdited,
}: ActionMCPProps) {
  const [selectedInternalMCPServerId, setSelectedInternalMCPServerId] =
    useState<(typeof AVAILABLE_INTERNAL_MCPSERVER_IDS)[number] | null>(
      actionConfiguration.internalMCPServerId
    );

  return (
    <>
      <div>Will expose all the tools available via an MCP Server.</div>
      <div>For testing purposes, pick an internal server</div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            isSelect
            label={selectedInternalMCPServerId ?? "Select a internal server"}
            className="w-48"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="mt-1" align="start">
          {AVAILABLE_INTERNAL_MCPSERVER_IDS.map((id) => (
            <DropdownMenuItem
              key={id}
              label={id}
              onClick={() => {
                setSelectedInternalMCPServerId(id);
                updateAction((previousAction) => ({
                  ...previousAction,
                  serverType: "internal",
                  internalMCPServerId: id,
                }));
                setEdited(true);
              }}
            />
          ))}
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
