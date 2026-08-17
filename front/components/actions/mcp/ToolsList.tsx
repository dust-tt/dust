import type {
  MCPServerFormValues,
  ToolSettings,
} from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import {
  canToolUseMediumStakeLevel,
  encodeMCPToolNameForForm,
  getDefaultInternalToolStakeLevel,
} from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import { MCP_TOOL_STAKE_LEVELS } from "@app/lib/actions/constants";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
import {
  Button,
  Card,
  Checkbox,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  InfoCircle,
} from "@dust-tt/sparkle";
import { memo } from "react";
import { Controller, useFormContext } from "react-hook-form";

interface ToolsListProps {
  owner: LightWorkspaceType;
  mcpServerView: MCPServerViewType;
  disableUpdates?: boolean;
}

type ToolDefinition = MCPServerViewType["server"]["tools"][number];

interface ToolItemProps {
  tool: ToolDefinition;
  mayUpdate: boolean;
  availableStakeLevels: ReadonlyArray<MCPToolStakeLevelType>;
  settings: ToolSettings;
  onChange: (settings: ToolSettings) => void;
}

function ToolItem({
  tool,
  mayUpdate,
  availableStakeLevels,
  settings,
  onChange,
}: ToolItemProps) {
  const toolPermission = settings.permission;
  const toolEnabled = settings.enabled;

  const handleToggle = () => {
    onChange({
      ...settings,
      enabled: !toolEnabled,
    });
  };

  const handlePermissionChange = (permission: MCPToolStakeLevelType) => {
    onChange({
      ...settings,
      permission,
    });
  };

  const toolPermissionLabel: Record<MCPToolStakeLevelType, string> = {
    high: "High (always ask for confirmation)",
    medium: "Medium (allows input-scoped confirmation save)",
    low: "Low (allows user-global confirmation save)",
    never_ask: "Never ask (automatic execution)",
  };

  return (
    <div className="flex flex-col gap-1 pb-2">
      <div className="flex items-center gap-2">
        {mayUpdate && <Checkbox checked={toolEnabled} onClick={handleToggle} />}
        <h4 className="heading-base flex-grow text-foreground">
          {asDisplayName(tool.name)}
        </h4>
      </div>
      {tool.description && (
        <Collapsible>
          <CollapsibleTrigger label="Description" variant="secondary" />
          <CollapsibleContent>
            <p className="whitespace-pre-wrap break-words pt-1 text-sm text-muted-foreground">
              {tool.description}
            </p>
          </CollapsibleContent>
        </Collapsible>
      )}
      {toolEnabled && (
        <Card variant="primary" className="flex-col">
          <div className="heading-sm text-muted-foreground">
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
                {availableStakeLevels.map((permission) => (
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

function getDefaultToolSettings({
  tool,
  toolMetadataByName,
  mcpServerView,
}: {
  tool: ToolDefinition;
  toolMetadataByName: Record<string, ToolSettings>;
  mcpServerView: MCPServerViewType;
}): ToolSettings {
  const metadata = toolMetadataByName[tool.name];
  const defaultPermission = getDefaultInternalToolStakeLevel(
    mcpServerView.server,
    tool
  );

  return {
    enabled: metadata?.enabled ?? true,
    permission: metadata?.permission ?? defaultPermission,
  };
}

const noop = () => {};

// We disable buttons for agent builder view because it would feel like
// you can configure per agent
export const ToolsList = memo(
  ({ owner, mcpServerView, disableUpdates }: ToolsListProps) => {
    const formContext = useFormContext<MCPServerFormValues>();
    const mayUpdate = !disableUpdates && isAdmin(owner);
    const { tools } = mcpServerView.server;
    const toolMetadataByName = Object.fromEntries(
      (mcpServerView.toolsMetadata ?? []).map(
        (metadata): [string, ToolSettings] => [
          metadata.toolName,
          {
            enabled: metadata.enabled,
            permission: metadata.permission,
          },
        ]
      )
    );

    if (!tools || tools.length === 0) {
      return null;
    }

    return (
      <Collapsible defaultOpen={tools.length <= 5}>
        <CollapsibleTrigger>
          <div className="heading-lg">Available Tools ({tools.length})</div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <>
            <ContentMessage
              className="mb-4 mt-2 w-full"
              variant="blue"
              size="lg"
              icon={InfoCircle}
              title="User Approval Settings"
            >
              <ul>
                <li>
                  <b>High stake</b> tools need explicit user approval.
                </li>
                <li>
                  <b>Medium stake</b> tools allow users to save confirmations
                  for specific tool inputs.
                </li>
                <li>
                  Users can completely disable confirmations for{" "}
                  <b>low stake</b> tools.
                </li>
                <li>
                  <b>Never ask</b> tools run automatically.
                </li>
              </ul>
            </ContentMessage>

            <div className="flex flex-col gap-4">
              {tools.map((tool) => {
                const availableStakeLevels = MCP_TOOL_STAKE_LEVELS.filter(
                  (stakeLevel) =>
                    stakeLevel !== "medium" ||
                    canToolUseMediumStakeLevel(mcpServerView.server, tool.name)
                );
                const defaultSettings = getDefaultToolSettings({
                  tool,
                  toolMetadataByName,
                  mcpServerView,
                });

                if (disableUpdates) {
                  return (
                    <ToolItem
                      key={tool.name}
                      tool={tool}
                      settings={defaultSettings}
                      mayUpdate={mayUpdate}
                      availableStakeLevels={availableStakeLevels}
                      onChange={noop}
                    />
                  );
                }

                return (
                  <Controller
                    key={tool.name}
                    control={formContext.control}
                    name={`toolSettings.${encodeMCPToolNameForForm(tool.name)}`}
                    defaultValue={defaultSettings}
                    render={({ field }) => (
                      <ToolItem
                        tool={tool}
                        mayUpdate={mayUpdate}
                        availableStakeLevels={availableStakeLevels}
                        settings={field.value ?? defaultSettings}
                        onChange={field.onChange}
                      />
                    )}
                  />
                );
              })}
            </div>
          </>
        </CollapsibleContent>
      </Collapsible>
    );
  }
);
