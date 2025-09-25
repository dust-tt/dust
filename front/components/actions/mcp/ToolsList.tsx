import {
  Button,
  Card,
  Checkbox,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  InformationCircleIcon,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";

import type {
  CustomRemoteMCPToolStakeLevelType,
  MCPToolStakeLevelType,
} from "@app/lib/actions/constants";
import {
  CUSTOM_REMOTE_MCP_TOOL_STAKE_LEVELS,
  FALLBACK_MCP_TOOL_STAKE_LEVEL,
} from "@app/lib/actions/constants";
import {
  getServerTypeAndIdFromSId,
  isRemoteMCPServerType,
} from "@app/lib/actions/mcp_helper";
import { getDefaultRemoteMCPServerByURL } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { LightWorkspaceType } from "@app/types";
import { asDisplayName, isAdmin } from "@app/types";

export type ToolChange = {
  toolName: string;
  permission: MCPToolStakeLevelType;
  enabled: boolean;
};

interface ToolsListProps {
  owner: LightWorkspaceType;
  mcpServerView: MCPServerViewType;
  disableUpdates?: boolean;
  pendingToolChanges?: ToolChange[];
  onPendingToolChangesUpdate?: (changes: ToolChange[]) => void;
}

// We disable buttons for agent builder view because it would feel like
// you can configure per agent
export function ToolsList({
  owner,
  mcpServerView,
  disableUpdates,
  pendingToolChanges = [],
  onPendingToolChangesUpdate,
}: ToolsListProps) {
  const mayUpdate = useMemo(
    () => (disableUpdates ? false : isAdmin(owner)),
    [owner, disableUpdates]
  );
  const serverType = useMemo(
    () => getServerTypeAndIdFromSId(mcpServerView.server.sId).serverType,
    [mcpServerView.server.sId]
  );
  const tools = useMemo(
    () => mcpServerView.server.tools,
    [mcpServerView.server.tools]
  );
  const toolsMetadata = useMemo(() => {
    const map: Record<
      string,
      { permission: MCPToolStakeLevelType; enabled: boolean }
    > = {};
    for (const tool of mcpServerView.toolsMetadata ?? []) {
      map[tool.toolName] = tool;
    }
    return map;
  }, [mcpServerView.toolsMetadata]);

  // Local state to track current tool settings.
  const [localToolSettings, setLocalToolSettings] = useState<
    Record<string, { permission: MCPToolStakeLevelType; enabled: boolean }>
  >({});

  // Initialize local state when toolsMetadata changes.
  useEffect(() => {
    const initialSettings: Record<
      string,
      { permission: MCPToolStakeLevelType; enabled: boolean }
    > = {};
    for (const tool of mcpServerView.server.tools ?? []) {
      initialSettings[tool.name] = {
        permission: toolsMetadata[tool.name]?.permission ?? FALLBACK_MCP_TOOL_STAKE_LEVEL,
        enabled: toolsMetadata[tool.name]?.enabled ?? true,
      };
    }
    // Apply any pending changes on top of the initial settings.
    for (const change of pendingToolChanges) {
      initialSettings[change.toolName] = {
        permission: change.permission,
        enabled: change.enabled,
      };
    }
    setLocalToolSettings(initialSettings);
  }, [mcpServerView.server.tools, toolsMetadata, pendingToolChanges]);

  const getAvailableStakeLevelsForTool = (toolName: string) => {
    if (isRemoteMCPServerType(mcpServerView.server)) {
      const defaultRemoteServer = getDefaultRemoteMCPServerByURL(
        mcpServerView.server.url
      );
      // We only allow users to set the "never_ask" stake level for tools that are configured with it in the default server.
      if (defaultRemoteServer?.toolStakes?.[toolName] === "never_ask") {
        return [...CUSTOM_REMOTE_MCP_TOOL_STAKE_LEVELS, "never_ask"] as const;
      }
    }
    return CUSTOM_REMOTE_MCP_TOOL_STAKE_LEVELS;
  };

  const handleClick = (
    name: string,
    permission: CustomRemoteMCPToolStakeLevelType | "never_ask",
    enabled: boolean
  ) => {
    // Update local state.
    setLocalToolSettings((prev) => ({
      ...prev,
      [name]: { permission, enabled },
    }));

    // Update pending changes if callback is provided.
    if (onPendingToolChangesUpdate) {
      const originalSetting = {
        permission: toolsMetadata[name]?.permission ?? FALLBACK_MCP_TOOL_STAKE_LEVEL,
        enabled: toolsMetadata[name]?.enabled ?? true,
      };

      const existingChangeIndex = pendingToolChanges.findIndex(
        (c) => c.toolName === name
      );

      const newChanges = [...pendingToolChanges];

      // Check if this is different from original.
      if (
        permission !== originalSetting.permission ||
        enabled !== originalSetting.enabled
      ) {
        // Add or update the change.
        const change: ToolChange = {
          toolName: name,
          permission,
          enabled,
        };
        if (existingChangeIndex >= 0) {
          newChanges[existingChangeIndex] = change;
        } else {
          newChanges.push(change);
        }
      } else if (existingChangeIndex >= 0) {
        // Remove the change if it's back to original.
        newChanges.splice(existingChangeIndex, 1);
      }

      onPendingToolChangesUpdate(newChanges);
    }
  };

  const getToolPermission = (toolName: string) => {
    return localToolSettings[toolName]?.permission ?? toolsMetadata[toolName]?.permission ?? FALLBACK_MCP_TOOL_STAKE_LEVEL;
  };

  const getToolEnabled = (toolName: string) => {
    // Use local state if available, otherwise fall back to metadata.
    return localToolSettings[toolName]?.enabled ?? toolsMetadata[toolName]?.enabled ?? true;
  };

  const toolPermissionLabel: Record<string, string> = {
    high: "High (update data or send information)",
    low: "Low (retrieve data or generate content)",
    never_ask: "Never ask (automatic execution)",
  };

  return (
    <>
      {serverType === "remote" && (
        <ContentMessage
          className="mb-4 w-fit"
          variant="blue"
          icon={InformationCircleIcon}
          title="User Approval Settings"
        >
          <p className="text-sm">
            <b>High stake</b> tools needs explicit user approval.
          </p>
          <p>
            Users can disable confirmations for <b>low stake</b> tools.
          </p>
        </ContentMessage>
      )}
      <div>
        {tools && tools.length > 0 ? (
          <div className="flex flex-col gap-4">
            {tools.map(
              (tool: { name: string; description: string }, index: number) => {
                const toolPermission = getToolPermission(tool.name);
                const toolEnabled = getToolEnabled(tool.name);
                return (
                  <div
                    key={index}
                    className={`flex flex-col gap-1 pb-2 ${
                      !toolEnabled ? "opacity-50" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {mayUpdate && (
                        <Checkbox
                          checked={toolEnabled}
                          onClick={() =>
                            handleClick(
                              tool.name,
                              getToolPermission(tool.name),
                              !toolEnabled
                            )
                          }
                        />
                      )}
                      <h4 className="heading-base flex-grow text-foreground dark:text-foreground-night">
                        {asDisplayName(tool.name)}
                      </h4>
                    </div>
                    {tool.description && (
                      <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                        {tool.description}
                      </p>
                    )}
                    {/* We only show the tool stake for remote servers */}
                    {serverType === "remote" && toolEnabled && (
                      <Card variant="primary" className="flex-col">
                        <div className="heading-sm text-muted-foreground dark:text-muted-foreground-night">
                          Tool stake setting
                        </div>
                        <div className="flex justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              asChild
                              disabled={!mayUpdate || !toolEnabled}
                            >
                              <Button
                                variant="outline"
                                label={toolPermissionLabel[toolPermission]}
                              />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              {getAvailableStakeLevelsForTool(tool.name).map(
                                (permission) => (
                                  <DropdownMenuItem
                                    key={permission}
                                    onClick={() => {
                                      handleClick(
                                        tool.name,
                                        permission,
                                        getToolEnabled(tool.name)
                                      );
                                    }}
                                    label={toolPermissionLabel[permission]}
                                    disabled={!toolEnabled}
                                  />
                                )
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </Card>
                    )}
                  </div>
                );
              }
            )}
          </div>
        ) : (
          <p className="text-sm text-faint">No tools available</p>
        )}
      </div>
    </>
  );
}
