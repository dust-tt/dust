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
import { useMemo } from "react";
import { useController, useFormContext } from "react-hook-form";

import type { MCPServerFormValues } from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import type { CustomRemoteMCPToolStakeLevelType } from "@app/lib/actions/constants";
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

interface ToolsListProps {
  owner: LightWorkspaceType;
  mcpServerView: MCPServerViewType;
  disableUpdates?: boolean;
}

interface ToolItemProps {
  tool: { name: string; description: string };
  mayUpdate: boolean;
  serverType: string;
  availableStakeLevels: readonly (CustomRemoteMCPToolStakeLevelType | "never_ask")[];
}

function ToolItem({ tool, mayUpdate, serverType, availableStakeLevels }: ToolItemProps) {
  const { control } = useFormContext<MCPServerFormValues>();
  const { field } = useController({
    control,
    name: `toolSettings.${tool.name}`,
    defaultValue: {
      enabled: true,
      permission: FALLBACK_MCP_TOOL_STAKE_LEVEL,
    },
  });

  const toolPermission = field.value.permission;
  const toolEnabled = field.value.enabled;

  const handleToggle = () => {
    field.onChange({
      ...field.value,
      enabled: !toolEnabled,
    });
  };

  const handlePermissionChange = (permission: CustomRemoteMCPToolStakeLevelType | "never_ask") => {
    field.onChange({
      ...field.value,
      permission,
    });
  };

  const toolPermissionLabel: Record<string, string> = {
    high: "High (update data or send information)",
    low: "Low (retrieve data or generate content)",
    never_ask: "Never ask (automatic execution)",
  };

  return (
    <div
      className={`flex flex-col gap-1 pb-2 ${
        !toolEnabled ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        {mayUpdate && (
          <Checkbox
            checked={toolEnabled}
            onClick={handleToggle}
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
                {availableStakeLevels.map(
                  (permission) => (
                    <DropdownMenuItem
                      key={permission}
                      onClick={() => handlePermissionChange(permission)}
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

// We disable buttons for agent builder view because it would feel like
// you can configure per agent
export function ToolsList({
  owner,
  mcpServerView,
  disableUpdates,
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
              (tool: { name: string; description: string }, index: number) => (
                <ToolItem
                  key={index}
                  tool={tool}
                  mayUpdate={mayUpdate}
                  serverType={serverType}
                  availableStakeLevels={getAvailableStakeLevelsForTool(tool.name)}
                />
              )
            )}
          </div>
        ) : (
          <p className="text-sm text-faint">No tools available</p>
        )}
      </div>
    </>
  );
}
