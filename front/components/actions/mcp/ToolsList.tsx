import type {
  MCPServerFormValues,
  ToolSettings,
} from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import {
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
  InformationCircleIcon,
} from "@dust-tt/sparkle";
import { memo } from "react";
import { useController, useFormContext } from "react-hook-form";

interface ToolsListProps {
  owner: LightWorkspaceType;
  mcpServerView: MCPServerViewType;
  disableUpdates?: boolean;
}

type ToolDefinition = MCPServerViewType["server"]["tools"][number];

interface ToolItemContentProps {
  tool: ToolDefinition;
  mayUpdate: boolean;
  availableStakeLevels: ReadonlyArray<MCPToolStakeLevelType>;
  settings: ToolSettings;
  onChange: (settings: ToolSettings) => void;
}

interface EditableToolItemProps {
  tool: ToolDefinition;
  mayUpdate: boolean;
  availableStakeLevels: ReadonlyArray<MCPToolStakeLevelType>;
  defaultSettings: ToolSettings;
}

interface ToolsListContentProps {
  mayUpdate: boolean;
  tools: ToolDefinition[];
  renderToolItem: (tool: ToolDefinition) => JSX.Element;
}

function ToolItemContent({
  tool,
  mayUpdate,
  availableStakeLevels,
  settings,
  onChange,
}: ToolItemContentProps) {
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
    medium: "Medium (allows per-agent confirmation save)",
    low: "Low (allows user-global confirmation save)",
    never_ask: "Never ask (automatic execution)",
  };

  return (
    <div className="flex flex-col gap-1 pb-2">
      <div className="flex items-center gap-2">
        {mayUpdate && <Checkbox checked={toolEnabled} onClick={handleToggle} />}
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
    tool.name
  );

  return {
    enabled: metadata?.enabled ?? true,
    permission: metadata?.permission ?? defaultPermission,
  };
}

function EditableToolItem({
  tool,
  mayUpdate,
  availableStakeLevels,
  defaultSettings,
}: EditableToolItemProps) {
  const { control } = useFormContext<MCPServerFormValues>();
  const { field } = useController({
    control,
    name: `toolSettings.${encodeMCPToolNameForForm(tool.name)}`,
    defaultValue: defaultSettings,
  });

  return (
    <ToolItemContent
      tool={tool}
      mayUpdate={mayUpdate}
      availableStakeLevels={availableStakeLevels}
      settings={field.value ?? defaultSettings}
      onChange={field.onChange}
    />
  );
}

function ToolsListContent({
  mayUpdate,
  tools,
  renderToolItem,
}: ToolsListContentProps) {
  return (
    <>
      {tools && tools.length > 0 && (
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
                icon={InformationCircleIcon}
                title="User Approval Settings"
              >
                <ul>
                  <li>
                    <b>High stake</b> tools need explicit user approval.
                  </li>
                  <li>
                    <b>Medium stake</b> tools allow users to save per-agent
                    confirmations.
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

              <div>
                {tools.length > 0 ? (
                  <div className="flex flex-col gap-4">
                    {tools.map((tool) => renderToolItem(tool))}
                  </div>
                ) : (
                  <p className="text-sm text-faint">No tools available</p>
                )}
              </div>
            </>
          </CollapsibleContent>
        </Collapsible>
      )}
    </>
  );
}

interface EditableToolsListProps {
  mayUpdate: boolean;
  tools: ToolDefinition[];
  getDefaultSettings: (tool: ToolDefinition) => ToolSettings;
}

function EditableToolsList({
  mayUpdate,
  tools,
  getDefaultSettings,
}: EditableToolsListProps) {
  return (
    <ToolsListContent
      mayUpdate={mayUpdate}
      tools={tools}
      renderToolItem={(tool) => (
        <EditableToolItem
          key={tool.name}
          tool={tool}
          mayUpdate={mayUpdate}
          availableStakeLevels={MCP_TOOL_STAKE_LEVELS}
          defaultSettings={getDefaultSettings(tool)}
        />
      )}
    />
  );
}

// We disable buttons for agent builder view because it would feel like
// you can configure per agent
export const ToolsList = memo(
  ({ owner, mcpServerView, disableUpdates }: ToolsListProps) => {
    const mayUpdate = disableUpdates ? false : isAdmin(owner);
    const tools = mcpServerView.server.tools;
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
    const getDefaultSettings = (tool: ToolDefinition) =>
      getDefaultToolSettings({ tool, toolMetadataByName, mcpServerView });

    // Read-only path: render directly without binding to the surrounding
    // MCPServerFormValues form, since this component is also rendered in
    // contexts (e.g. agent builder) that have no such FormProvider.
    if (disableUpdates) {
      return (
        <ToolsListContent
          mayUpdate={mayUpdate}
          tools={tools}
          renderToolItem={(tool) => (
            <ToolItemContent
              key={tool.name}
              tool={tool}
              mayUpdate={mayUpdate}
              availableStakeLevels={MCP_TOOL_STAKE_LEVELS}
              settings={getDefaultSettings(tool)}
              onChange={() => {}}
            />
          )}
        />
      );
    }

    return (
      <EditableToolsList
        mayUpdate={mayUpdate}
        tools={tools}
        getDefaultSettings={getDefaultSettings}
      />
    );
  }
);
