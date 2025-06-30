import {
  Button,
  Card,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  InformationCircleIcon,
} from "@dust-tt/sparkle";
import { useMemo } from "react";

import type { RemoteMCPToolStakeLevelType } from "@app/lib/actions/constants";
import {
  FALLBACK_MCP_TOOL_STAKE_LEVEL,
  REMOTE_MCP_TOOL_STAKE_LEVELS,
} from "@app/lib/actions/constants";
import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import {
  useMCPServerToolsPermissions,
  useUpdateMCPServerToolsPermissions,
} from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType } from "@app/types";
import { asDisplayName, isAdmin } from "@app/types";

interface ToolsListProps {
  owner: LightWorkspaceType;
  mcpServerView: MCPServerViewType;
  forcedCanUpdate?: boolean;
}

// We disable buttons for Assistant Builder view because it would feel like
// you can configure per agent
export function ToolsList({
  owner,
  mcpServerView,
  forcedCanUpdate,
}: ToolsListProps) {
  const canUpdate = useMemo(
    () => (forcedCanUpdate !== undefined ? forcedCanUpdate : isAdmin(owner)),
    [owner, forcedCanUpdate]
  );
  const serverType = useMemo(
    () => getServerTypeAndIdFromSId(mcpServerView.server.sId).serverType,
    [mcpServerView.server.sId]
  );
  const tools = useMemo(
    () => mcpServerView.server.tools,
    [mcpServerView.server.tools]
  );
  const { toolsPermissions } = useMCPServerToolsPermissions({
    owner,
    serverId: mcpServerView.server.sId,
  });

  const { updateToolPermission } = useUpdateMCPServerToolsPermissions({
    owner,
    serverId: mcpServerView.server.sId,
  });

  const handleClick = (
    name: string,
    permission: RemoteMCPToolStakeLevelType
  ) => {
    void updateToolPermission({
      toolName: name,
      permission,
    });
  };

  const toolPermissionLabel: Record<RemoteMCPToolStakeLevelType, string> = {
    high: "High (update data or send information)",
    low: "Low (retrieve data or generate content)",
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
          <div className="flex flex-col gap-2">
            {tools.map(
              (tool: { name: string; description: string }, index: number) => {
                const toolPermission = toolsPermissions[tool.name]
                  ? toolsPermissions[tool.name]
                  : FALLBACK_MCP_TOOL_STAKE_LEVEL;
                return (
                  <div key={index} className="flex flex-col gap-1 pb-2">
                    <h4 className="heading-base flex-grow text-foreground dark:text-foreground-night">
                      {asDisplayName(tool.name)}
                    </h4>
                    {tool.description && (
                      <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                        {tool.description}
                      </p>
                    )}
                    {serverType === "remote" && (
                      <>
                        <Card variant="primary" className="flex-col">
                          <div className="heading-sm text-muted-foreground dark:text-muted-foreground-night">
                            Tool stake setting
                          </div>
                          <div className="flex justify-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                asChild
                                disabled={!canUpdate}
                              >
                                <Button
                                  variant="outline"
                                  label={toolPermissionLabel[toolPermission]}
                                />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                {REMOTE_MCP_TOOL_STAKE_LEVELS.map(
                                  (permission) => (
                                    <DropdownMenuItem
                                      key={permission}
                                      onClick={() => {
                                        handleClick(tool.name, permission);
                                      }}
                                      label={toolPermissionLabel[permission]}
                                    />
                                  )
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </Card>
                      </>
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
