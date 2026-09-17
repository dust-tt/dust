import type {
  MCPServerFormValues,
  ToolSettings,
} from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import {
  canToolUseMediumStakeLevel,
  encodeMCPToolNameForForm,
  getEffectiveToolSettings,
} from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import { MCP_TOOL_STAKE_LEVELS } from "@app/lib/actions/constants";
import {
  MCP_TOOL_STAKE_DESCRIPTIONS,
  MCP_TOOL_STAKE_LABELS,
  MCP_TOOL_STAKE_SHORT_LABELS,
} from "@app/lib/actions/tool_stakes_descriptions";
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
                  label={MCP_TOOL_STAKE_LABELS[toolPermission]}
                  isSelect
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {availableStakeLevels.map((permission) => (
                  <DropdownMenuItem
                    key={permission}
                    onClick={() => handlePermissionChange(permission)}
                    label={MCP_TOOL_STAKE_LABELS[permission]}
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

const noop = () => {};

// We disable buttons for agent builder view because it would feel like
// you can configure per agent
export const ToolsList = memo(
  ({ owner, mcpServerView, disableUpdates }: ToolsListProps) => {
    const formContext = useFormContext<MCPServerFormValues>();
    const mayUpdate = !disableUpdates && isAdmin(owner);
    const { tools } = mcpServerView.server;

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
                {MCP_TOOL_STAKE_LEVELS.map((stakeLevel) => (
                  <li key={stakeLevel}>
                    <b>{MCP_TOOL_STAKE_SHORT_LABELS[stakeLevel]}</b>:{" "}
                    {MCP_TOOL_STAKE_DESCRIPTIONS[stakeLevel]}
                  </li>
                ))}
              </ul>
            </ContentMessage>

            <div className="flex flex-col gap-4">
              {tools.map((tool) => {
                const availableStakeLevels = MCP_TOOL_STAKE_LEVELS.filter(
                  (stakeLevel) =>
                    stakeLevel !== "medium" ||
                    canToolUseMediumStakeLevel(mcpServerView.server, tool.name)
                );
                const defaultSettings = getEffectiveToolSettings(
                  mcpServerView,
                  tool.name
                );

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
