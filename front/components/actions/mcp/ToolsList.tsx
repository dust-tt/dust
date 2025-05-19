import {
  Button,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  InformationCircleIcon,
  Label,
} from "@dust-tt/sparkle";

import type { RemoteMCPToolStakeLevelType } from "@app/lib/actions/constants";
import {
  FALLBACK_MCP_TOOL_STAKE_LEVEL,
  REMOTE_MCP_TOOL_STAKE_LEVELS,
} from "@app/lib/actions/constants";
import {
  useMCPServerToolsPermissions,
  useUpdateMCPServerToolsPermissions,
} from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType } from "@app/types";
import { asDisplayName } from "@app/types";

interface ToolsListProps {
  owner: LightWorkspaceType;
  tools: { name: string; description: string }[];
  serverType: "remote" | "internal";
  serverId: string;
  canUpdate: boolean;
}

// We disable buttons for Assistant Builder view because it would feel like
// you can configure per agent
export function ToolsList({
  owner,
  tools,
  serverType,
  serverId,
  canUpdate,
}: ToolsListProps) {
  const { toolsPermissions } = useMCPServerToolsPermissions({
    owner,
    serverId,
  });

  const { updateToolPermission } = useUpdateMCPServerToolsPermissions({
    owner,
    serverId,
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
                  <div
                    key={index}
                    className="flex flex-col gap-1 border-b border-border pb-2 last:border-b-0 last:pb-0"
                  >
                    <h4 className="heading-base flex-grow text-foreground dark:text-foreground-night">
                      {asDisplayName(tool.name)}
                    </h4>
                    {tool.description && (
                      <p className="text-base text-muted-foreground dark:text-muted-foreground-night">
                        {tool.description}
                      </p>
                    )}
                    {serverType === "remote" && (
                      <div className="flex w-full flex-row items-center justify-end gap-2 pt-2">
                        <Label className="w-full text-muted-foreground dark:text-muted-foreground-night">
                          Tool stake setting
                        </Label>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild disabled={!canUpdate}>
                            <Button
                              variant="outline"
                              label={toolPermissionLabel[toolPermission]}
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            {REMOTE_MCP_TOOL_STAKE_LEVELS.map((permission) => (
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
            )}
          </div>
        ) : (
          <p className="text-sm text-faint">No tools available</p>
        )}
      </div>
    </>
  );
}
