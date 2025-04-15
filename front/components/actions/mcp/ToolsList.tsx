import {
  Button,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ExclamationCircleIcon,
  Page,
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
import type {LightWorkspaceType} from "@app/types";
import { asDisplayName  } from "@app/types";

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
    <div className="mb-2 flex w-full flex-col gap-y-2 pt-2">
      <Page.SectionHeader title="Available Tools" />
      {serverType === "remote" && (
        <ContentMessage
          className="mb-8"
          icon={ExclamationCircleIcon}
          title="User Approval Settings"
        >
          <p className="text-sm">
            <b>High stake</b> tools needs explicit user approval.
          </p>
          <p>
            Users can disable confirmations for <b>low</b> stake tools.
          </p>
        </ContentMessage>
      )}
      <div className="space-y-4">
        {tools && tools.length > 0 ? (
          tools.map(
            (tool: { name: string; description: string }, index: number) => {
              const toolPermission = toolsPermissions[tool.name]
                ? toolsPermissions[tool.name]
                : DEFAULT_MCP_TOOL_STAKE_LEVEL;
              return (
                <div
                  key={index}
                  className="border-b pb-4 last:border-b-0 last:pb-0"
                >
                  <h4 className="flex-grow text-sm font-semibold">
                    {asDisplayName(tool.name)}
                  </h4>
                  {tool.description && (
                    <p className="mt-1 text-xs text-gray-500">
                      {tool.description}
                    </p>
                  )}
                  {serverType === "remote" && (
                    <div className="mt-2">
                      <h5 className="pb-2 font-semibold">Tool stake setting</h5>
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
                              className="font-medium"
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
          <p className="text-sm text-gray-500">No tools available</p>
        )}
      </div>
    </div>
  );
}
