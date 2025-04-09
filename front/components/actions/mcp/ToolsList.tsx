import {
  BookOpenIcon,
  Button,
  CheckCircleIcon,
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
import type { LightWorkspaceType } from "@app/types";

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

  return (
    <div className="mb-2 flex w-full flex-col gap-y-2 pt-2">
      <Page.SectionHeader title="Available Tools" />
      {serverType === "remote" && (
        <ContentMessage icon={BookOpenIcon} title="Tools">
          <p className="text-sm">
            Please set the tool permissions for this action.
          </p>
          <p>
            A Low stake operation will allow the model to use the tool directly,
            while a High stake operation needs particular attention, and asks
            the user for confirmation before letting the model use the tool.
          </p>
        </ContentMessage>
      )}
      <div className="space-y-4 rounded-md border p-4">
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
                  <div className="flex items-center">
                    <h4 className="flex-grow text-sm font-medium">
                      {tool.name}
                    </h4>
                    {serverType === "remote" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            className="capitalize"
                            variant="outline"
                            label={`${toolPermission} stake`}
                            icon={
                              toolPermission === DEFAULT_MCP_TOOL_STAKE_LEVEL
                                ? ExclamationCircleIcon
                                : CheckCircleIcon
                            }
                            isSelect
                          />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {MCP_TOOL_STAKE_LEVELS.map((permission) => (
                            <DropdownMenuItem
                              key={permission}
                              className="capitalize"
                              label={`${permission} stake`}
                              icon={
                                permission === DEFAULT_MCP_TOOL_STAKE_LEVEL
                                  ? ExclamationCircleIcon
                                  : CheckCircleIcon
                              }
                              onClick={() => {
                                handleClick(tool.name, permission);
                              }}
                            />
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  {tool.description && (
                    <p className="mt-1 text-xs text-gray-500">
                      {tool.description}
                    </p>
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
