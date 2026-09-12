import type {
  MCPServerFormValues,
  ToolSettings,
} from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import {
  canToolUseMediumStakeLevel,
  encodeMCPToolNameForForm,
  getDefaultToolStakeLevel,
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
import { memo, useCallback } from "react";
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
                  label={STAKE_LEVEL_LABELS[toolPermission]}
                  isSelect
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {availableStakeLevels.map((permission) => (
                  <DropdownMenuItem
                    key={permission}
                    onClick={() => handlePermissionChange(permission)}
                    label={STAKE_LEVEL_LABELS[permission]}
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
  const defaultPermission = getDefaultToolStakeLevel(
    mcpServerView.server,
    tool.name
  );

  return {
    enabled: metadata?.enabled ?? true,
    permission: metadata?.permission ?? defaultPermission,
  };
}

const noop = () => {};

const STAKE_LEVEL_LABELS: Record<MCPToolStakeLevelType, string> = {
  high: "High (always ask for confirmation)",
  medium: "Medium (allows input-scoped confirmation save)",
  low: "Low (allows user-global confirmation save)",
  never_ask: "Never ask (automatic execution)",
};

const STAKE_LEVEL_SHORT_LABELS: Record<MCPToolStakeLevelType, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  never_ask: "Never ask",
};

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

    // Handler to set all tools to a specific stake level.
    const handleSetAllStakeLevel = useCallback(
      (permission: MCPToolStakeLevelType) => {
        if (!tools || disableUpdates) {
          return;
        }
        for (const tool of tools) {
          const fieldName =
            `toolSettings.${encodeMCPToolNameForForm(tool.name)}` as const;
          const currentSettings = formContext.getValues(fieldName);
          const defaultSettings = getDefaultToolSettings({
            tool,
            toolMetadataByName,
            mcpServerView,
          });
          const settings = currentSettings ?? defaultSettings;
          // Only update if the tool supports this stake level.
          const supportsLevel =
            permission !== "medium" ||
            canToolUseMediumStakeLevel(mcpServerView.server, tool.name);
          if (supportsLevel) {
            formContext.setValue(
              fieldName,
              { ...settings, permission },
              { shouldDirty: true }
            );
          }
        }
      },
      [tools, disableUpdates, formContext, toolMetadataByName, mcpServerView]
    );

    // Handler to enable/disable all tools at once.
    const handleSetAllEnabled = useCallback(
      (enabled: boolean) => {
        if (!tools || disableUpdates) {
          return;
        }
        for (const tool of tools) {
          const fieldName =
            `toolSettings.${encodeMCPToolNameForForm(tool.name)}` as const;
          const currentSettings = formContext.getValues(fieldName);
          const defaultSettings = getDefaultToolSettings({
            tool,
            toolMetadataByName,
            mcpServerView,
          });
          const settings = currentSettings ?? defaultSettings;
          formContext.setValue(
            fieldName,
            { ...settings, enabled },
            { shouldDirty: true }
          );
        }
      },
      [tools, disableUpdates, formContext, toolMetadataByName, mcpServerView]
    );

    if (!tools || tools.length === 0) {
      return null;
    }

    // Only show batch controls when there are multiple tools.
    const showBatchControls = mayUpdate && tools.length > 1;

    // Available stake levels for batch update (exclude medium if no tool supports it).
    const batchStakeLevels = MCP_TOOL_STAKE_LEVELS.filter(
      (stakeLevel) =>
        stakeLevel !== "medium" ||
        tools.some((tool) =>
          canToolUseMediumStakeLevel(mcpServerView.server, tool.name)
        )
    );

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

            {showBatchControls && (
              <div className="mb-4 flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Batch actions:
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      label="Set all stakes to..."
                      isSelect
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {batchStakeLevels.map((level) => (
                      <DropdownMenuItem
                        key={level}
                        onClick={() => handleSetAllStakeLevel(level)}
                        label={STAKE_LEVEL_SHORT_LABELS[level]}
                      />
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      label="Toggle all..."
                      isSelect
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem
                      onClick={() => handleSetAllEnabled(true)}
                      label="Enable all"
                    />
                    <DropdownMenuItem
                      onClick={() => handleSetAllEnabled(false)}
                      label="Disable all"
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

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
