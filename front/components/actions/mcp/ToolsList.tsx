import {
  Button,
  Card,
  Checkbox,
  CollapsibleComponent,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  InformationCircleIcon,
} from "@dust-tt/sparkle";
import { memo, useMemo } from "react";
import { useController, useFormContext } from "react-hook-form";

import type { MCPServerFormValues } from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import { getDefaultInternalToolStakeLevel } from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import { MCP_TOOL_STAKE_LEVELS } from "@app/lib/actions/constants";
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
  availableStakeLevels: MCPToolStakeLevelType[];
  metadata?: {
    enabled: boolean;
    permission: MCPToolStakeLevelType;
  };
  defaultPermission: MCPToolStakeLevelType;
}

const ToolItem = memo(
  ({
    tool,
    mayUpdate,
    availableStakeLevels,
    metadata,
    defaultPermission,
  }: ToolItemProps) => {
    const { control } = useFormContext<MCPServerFormValues>();
    const { field } = useController({
      control,
      name: `toolSettings.${tool.name}`,
      defaultValue: {
        enabled: metadata?.enabled ?? true,
        permission: metadata?.permission ?? defaultPermission,
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

    const handlePermissionChange = (permission: MCPToolStakeLevelType) => {
      field.onChange({
        ...field.value,
        permission,
      });
    };

    const toolPermissionLabel: Record<MCPToolStakeLevelType, string> = {
      high: "High (always ask for confirmation)",
      medium: "Medium (per-agent per-argument confirmation saves)",
      low: "Low (per-tool confirmation saves)",
      never_ask: "Never ask (automatic execution)",
    };

    return (
      <div
        className={`flex flex-col gap-1 pb-2 ${!toolEnabled ? "opacity-50" : ""}`}
      >
        <div className="flex items-center gap-2">
          {mayUpdate && (
            <Checkbox checked={toolEnabled} onClick={handleToggle} />
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
        {toolEnabled && (
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
                    isSelect
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {availableStakeLevels
                    .filter((v) => v !== "medium")
                    .map((permission) => (
                      <DropdownMenuItem
                        key={permission}
                        onClick={() => handlePermissionChange(permission)}
                        label={toolPermissionLabel[permission]}
                        disabled={!toolEnabled}
                      />
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </Card>
        )}
      </div>
    );
  }
);

// We disable buttons for agent builder view because it would feel like
// you can configure per agent
export const ToolsList = memo(
  ({ owner, mcpServerView, disableUpdates }: ToolsListProps) => {
    const mayUpdate = useMemo(
      () => (disableUpdates ? false : isAdmin(owner)),
      [owner, disableUpdates]
    );
    const tools = useMemo(
      () => mcpServerView.server.tools,
      [mcpServerView.server.tools]
    );

    const getAvailableStakeLevels = (): MCPToolStakeLevelType[] => {
      return [...MCP_TOOL_STAKE_LEVELS];
    };

    return (
      <>
        {tools && tools.length > 0 && (
          <CollapsibleComponent
            rootProps={{ defaultOpen: tools.length <= 5 }}
            triggerChildren={
              <div className="heading-lg">Available Tools ({tools.length})</div>
            }
            contentChildren={
              <>
                <ContentMessage
                  className="mb-4 w-full"
                  variant="blue"
                  size="lg"
                  icon={InformationCircleIcon}
                  title="User Approval Settings"
                >
                  <ul>
                    <li>
                      <b>High stake</b> tools need explicit user approval.
                    </li>
                    <li>
                      Users can disable confirmations for <b>low stake</b>{" "}
                      tools.
                    </li>
                    <li>
                      <b>Never ask</b> tools run automatically.
                    </li>
                  </ul>
                </ContentMessage>

                <div>
                  {tools && tools.length > 0 ? (
                    <div className="flex flex-col gap-4">
                      {tools.map(
                        (
                          tool: { name: string; description: string },
                          index: number
                        ) => {
                          const availableStakeLevels =
                            getAvailableStakeLevels();
                          const metadata = mcpServerView.toolsMetadata?.find(
                            (m) => m.toolName === tool.name
                          );

                          const defaultPermission =
                            getDefaultInternalToolStakeLevel(
                              mcpServerView.server,
                              tool.name
                            );

                          return (
                            <ToolItem
                              key={index}
                              tool={tool}
                              mayUpdate={mayUpdate}
                              availableStakeLevels={availableStakeLevels}
                              metadata={metadata}
                              defaultPermission={defaultPermission}
                            />
                          );
                        }
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-faint">No tools available</p>
                  )}
                </div>
              </>
            }
          />
        )}
      </>
    );
  }
);
