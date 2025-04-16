import {
  Button,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  InformationCircleIcon,
} from "@dust-tt/sparkle";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import {
  DEFAULT_MCP_TOOL_STAKE_LEVEL,
  MCP_TOOL_STAKE_LEVELS,
} from "@app/lib/actions/constants";
import {
  useMCPServerToolsPermissions,
  useUpdateMCPServerToolsPermissions,
} from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType } from "@app/types";
import { asDisplayName } from "@app/types";

export function ToolsList({
  owner,
  tools,
  serverType,
  serverId,
}: {
  owner: LightWorkspaceType;
  tools: { name: string; description: string }[];
  serverType: "remote" | "internal";
  serverId: string;
}) {
  const { toolsPermissions } = useMCPServerToolsPermissions({
    owner,
    serverId,
  });

  const { updateToolPermission } = useUpdateMCPServerToolsPermissions({
    owner,
    serverId,
  });

  const handleClick = (name: string, permission: MCPToolStakeLevelType) => {
    void updateToolPermission({
      toolName: name,
      permission,
    });
  };

  const toolPermissionLabel: Record<MCPToolStakeLevelType, string> = {
    high: "High (Update data, or sends information)",
    low: "Low (Retrieve data, or generates content)",
  };

  return (
    <div className="mb-2 flex w-full flex-col gap-y-2 pt-2 text-foreground dark:text-foreground-night">
      <div className="heading-lg">Available Tools</div>
      {serverType === "remote" && (
        <ContentMessage
          className="w-fit"
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
      <div className="space-y-0">
        {tools && tools.length > 0 ? (
          tools.map(
            (tool: { name: string; description: string }, index: number) => {
              const toolPermission = toolsPermissions[tool.name]
                ? toolsPermissions[tool.name]
                : DEFAULT_MCP_TOOL_STAKE_LEVEL;
              return (
                <div
                  key={index}
                  className="flex flex-col gap-3 border-b border-border py-5 last:border-b-0 last:pb-0"
                >
                  <h4 className="heading-base flex-grow text-foreground dark:text-foreground-night">
                    {asDisplayName(tool.name)}
                  </h4>
                  {tool.description && (
                    <p className="copy-xs text-muted-foreground dark:text-muted-foreground-night">
                      {tool.description}
                    </p>
                  )}
                  {serverType === "remote" && (
                    <div className="flex w-full flex-row items-center justify-end gap-2">
                      <p className="heading-sm">Tool stake setting</p>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            label={toolPermissionLabel[toolPermission]}
                            isSelect
                          />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {MCP_TOOL_STAKE_LEVELS.map((permission) => (
                            <DropdownMenuItem
                              key={permission}
                              onClick={() => {
                                handleClick(tool.name, permission);
                              }}
                              label={toolPermissionLabel[permission]}
                            />
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
              );
            }
          )
        ) : (
          <p className="text-sm text-faint">No tools available</p>
        )}
      </div>
    </div>
  );
}
