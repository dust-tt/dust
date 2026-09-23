import type {
  MCPServerFormValues,
  ToolSettings,
} from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import {
  canToolUseMediumStakeLevel,
  encodeMCPToolNameForForm,
  getEffectiveToolSettings,
} from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import type {
  MCPServerToolDefinition,
  ToolsAndStakesController,
  ToolsAndStakesState,
} from "@app/components/actions/mcp/types";
import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import { MCP_TOOL_STAKE_LEVELS } from "@app/lib/actions/constants";
import {
  MCP_TOOL_STAKE_DESCRIPTIONS,
  MCP_TOOL_STAKE_LABELS,
  MCP_TOOL_STAKE_SHORT_LABELS,
} from "@app/lib/actions/tool_stakes_descriptions";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import {
  Button,
  Check,
  Checkbox,
  Chip,
  ContentMessage,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  InfoCircle,
  Label,
  ListGroup,
  ListItem,
  Popover,
  ScrollArea,
  SearchInput,
  SliderToggle,
  XClose,
} from "@dust-tt/sparkle";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFormContext } from "react-hook-form";

export function useToolsAndStakesController(
  mcpServerView: MCPServerViewType | null
): ToolsAndStakesController {
  const form = useFormContext<MCPServerFormValues>();
  const serverViewId = mcpServerView?.sId ?? null;
  const [controllerState, setControllerState] = useState<ToolsAndStakesState>({
    serverViewId,
    search: "",
    selectedToolNames: [],
  });
  const isCurrentServer = controllerState.serverViewId === serverViewId;
  const search = isCurrentServer ? controllerState.search : "";
  const selectedToolNames = isCurrentServer
    ? controllerState.selectedToolNames
    : [];

  const tools = useMemo(
    () => mcpServerView?.server.tools ?? [],
    [mcpServerView]
  );

  const visibleTools = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) {
      return tools;
    }
    return tools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(needle) ||
        asDisplayName(tool.name).toLowerCase().includes(needle) ||
        (tool.description ?? "").toLowerCase().includes(needle)
    );
  }, [tools, search]);

  const watchedToolSettings = form.watch("toolSettings");

  const getSettings = (toolName: string): ToolSettings => {
    const fromForm = watchedToolSettings?.[encodeMCPToolNameForForm(toolName)];
    if (fromForm) {
      return fromForm;
    }
    return mcpServerView
      ? getEffectiveToolSettings(mcpServerView, toolName)
      : { enabled: true, permission: "low" };
  };

  const setSettings = (toolName: string, next: ToolSettings) => {
    form.setValue(`toolSettings.${encodeMCPToolNameForForm(toolName)}`, next, {
      shouldDirty: true,
      shouldTouch: true,
    });
  };

  const updateTool = (toolName: string, patch: Partial<ToolSettings>) => {
    setSettings(toolName, { ...getSettings(toolName), ...patch });
  };

  const selectedSet = new Set(selectedToolNames);

  const areAllVisibleSelected =
    visibleTools.length > 0 &&
    visibleTools.every((tool) => selectedSet.has(tool.name));

  const selectionStakeLevels = MCP_TOOL_STAKE_LEVELS.filter(
    (stakeLevel) =>
      stakeLevel !== "medium" ||
      selectedToolNames.some((toolName) =>
        mcpServerView
          ? canToolUseMediumStakeLevel(mcpServerView.server, toolName)
          : false
      )
  );

  const applyToSelection = (patch: Partial<ToolSettings>) => {
    for (const toolName of selectedToolNames) {
      // Medium is only meaningful for tools declaring arguments that require
      // approval; applying it to the rest would persist a stake they cannot run at.
      if (
        patch.permission === "medium" &&
        mcpServerView &&
        !canToolUseMediumStakeLevel(mcpServerView.server, toolName)
      ) {
        continue;
      }
      updateTool(toolName, patch);
    }
  };

  const setSearch = (nextSearch: string) => {
    setControllerState((previous) => ({
      serverViewId,
      search: nextSearch,
      selectedToolNames:
        previous.serverViewId === serverViewId
          ? previous.selectedToolNames
          : [],
    }));
  };

  const updateSelectedToolNames = (
    update: (previous: string[]) => string[]
  ) => {
    setControllerState((previous) => ({
      serverViewId,
      search: previous.serverViewId === serverViewId ? previous.search : "",
      selectedToolNames: update(
        previous.serverViewId === serverViewId ? previous.selectedToolNames : []
      ),
    }));
  };

  return {
    search,
    setSearch,
    tools,
    visibleTools,
    selectedToolNames,
    isSelected: (toolName: string) => selectedSet.has(toolName),
    toggleSelected: (toolName: string) =>
      updateSelectedToolNames((previous) =>
        previous.includes(toolName)
          ? previous.filter((name) => name !== toolName)
          : [...previous, toolName]
      ),
    areAllVisibleSelected,
    toggleSelectAllVisible: () => {
      const visibleToolNames = new Set(visibleTools.map((tool) => tool.name));
      updateSelectedToolNames((previous) => {
        if (areAllVisibleSelected) {
          return previous.filter((name) => !visibleToolNames.has(name));
        }
        const previousNames = new Set(previous);
        return [
          ...previous,
          ...visibleTools
            .map((tool) => tool.name)
            .filter((name) => !previousNames.has(name)),
        ];
      });
    },
    clearSelection: () => updateSelectedToolNames(() => []),
    getSettings,
    updateTool,
    selectionStakeLevels,
    applyToSelection,
  };
}

interface MCPServerDetailsToolsProps {
  mcpServerView: MCPServerViewType;
  controller: ToolsAndStakesController;
}

/**
 * Every operation the server exposes, each one switchable and carrying the stake
 * level that decides whether Dust asks before running it. A real MCP server
 * declares dozens, hence the search and the per-row selection: batch actions
 * apply to the selection even when the search hides some selected tools.
 */
export function MCPServerDetailsTools({
  mcpServerView,
  controller,
}: MCPServerDetailsToolsProps) {
  const {
    search,
    setSearch,
    tools,
    visibleTools,
    selectedToolNames,
    isSelected,
    toggleSelected,
    areAllVisibleSelected,
    toggleSelectAllVisible,
    clearSelection,
    getSettings,
    updateTool,
    selectionStakeLevels,
    applyToSelection,
  } = controller;

  if (tools.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This server exposes no tools.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="heading-base text-foreground">
        {visibleTools.length === tools.length
          ? `${tools.length} tools available`
          : `${visibleTools.length} of ${tools.length} tools available`}
      </div>

      <ContentMessage
        className="w-full"
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

      <div className="flex items-center gap-2">
        <SearchInput
          name="tool-filter"
          placeholder="Search tools"
          className="grow"
          value={search}
          onChange={setSearch}
        />
        {selectedToolNames.length > 0 && (
          <Popover
            popoverTriggerAsChild
            trigger={
              <Button
                size="sm"
                variant="outline"
                label={`${selectedToolNames.length} selected`}
                isSelect
              />
            }
            content={
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="heading-sm text-foreground">
                    Selected tools
                  </span>
                  <Button
                    size="xs"
                    variant="ghost-secondary"
                    label="Clear all"
                    onClick={clearSelection}
                  />
                </div>
                <ScrollArea
                  className={selectedToolNames.length > 5 ? "h-48" : undefined}
                >
                  <div className="flex flex-col items-start gap-2 pr-2">
                    {selectedToolNames.map((toolName) => (
                      <Chip
                        key={toolName}
                        className="max-w-full"
                        size="sm"
                        label={asDisplayName(toolName)}
                        onRemove={() => toggleSelected(toolName)}
                      />
                    ))}
                  </div>
                </ScrollArea>
                <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        isSelect
                        label="Set stake"
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel label="Set stake" />
                      {selectionStakeLevels.map((stakeLevel) => (
                        <DropdownMenuItem
                          key={stakeLevel}
                          label={MCP_TOOL_STAKE_LABELS[stakeLevel]}
                          onClick={() =>
                            applyToSelection({ permission: stakeLevel })
                          }
                        />
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        isSelect
                        label="State"
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel label="State" />
                      <DropdownMenuItem
                        icon={Check}
                        label="Enable"
                        onClick={() => applyToSelection({ enabled: true })}
                      />
                      <DropdownMenuItem
                        icon={XClose}
                        label="Disable"
                        onClick={() => applyToSelection({ enabled: false })}
                      />
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            }
          />
        )}
        <Button
          size="sm"
          variant="outline"
          label={areAllVisibleSelected ? "Deselect all" : "Select all"}
          disabled={visibleTools.length === 0}
          onClick={toggleSelectAllVisible}
        />
      </div>

      {visibleTools.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No tool matches that search.
        </p>
      ) : (
        <ListGroup>
          {visibleTools.map((tool) => (
            <ToolRow
              key={tool.name}
              tool={tool}
              settings={getSettings(tool.name)}
              stakeLevels={MCP_TOOL_STAKE_LEVELS.filter(
                (stakeLevel) =>
                  stakeLevel !== "medium" ||
                  canToolUseMediumStakeLevel(mcpServerView.server, tool.name)
              )}
              isSelected={isSelected(tool.name)}
              onSelectedChange={() => toggleSelected(tool.name)}
              onPatch={(patch) => updateTool(tool.name, patch)}
            />
          ))}
        </ListGroup>
      )}
    </div>
  );
}

interface ToolRowProps {
  tool: MCPServerToolDefinition;
  settings: ToolSettings;
  stakeLevels: ReadonlyArray<MCPToolStakeLevelType>;
  isSelected: boolean;
  onSelectedChange: () => void;
  onPatch: (patch: Partial<ToolSettings>) => void;
}

/**
 * One operation: ticked to put it in the batch, switched off to take it away
 * from every agent. Switching it off recedes the row and drops the stake line,
 * since a disabled operation has nothing to ask about.
 */
function ToolRow({
  tool,
  settings,
  stakeLevels,
  isSelected,
  onSelectedChange,
  onPatch,
}: ToolRowProps) {
  const checkboxId = `select-tool-${encodeMCPToolNameForForm(tool.name)}`;

  return (
    <ListItem
      className={cn("flex-col gap-2", !settings.enabled && "bg-app-background")}
    >
      <div className="flex w-full items-center gap-2">
        {/* The label makes the name a hit target for the checkbox too. */}
        <Label
          htmlFor={checkboxId}
          className="flex grow cursor-pointer items-center gap-2"
        >
          <Checkbox
            id={checkboxId}
            checked={isSelected}
            aria-label={
              isSelected
                ? `Deselect ${asDisplayName(tool.name)}`
                : `Select ${asDisplayName(tool.name)}`
            }
            onCheckedChange={onSelectedChange}
          />
          <span
            className={cn(
              "heading-base",
              settings.enabled ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {asDisplayName(tool.name)}
          </span>
        </Label>
        <SliderToggle
          selected={settings.enabled}
          onClick={() => onPatch({ enabled: !settings.enabled })}
        />
      </div>

      {/* pl-6 clears the checkbox and its gap, so everything below the name
          lines up with the name rather than with the tick. */}
      {/* Keyed on the text so a re-synced description is measured afresh
          rather than reusing the previous one's overflow verdict. */}
      {tool.description && (
        <ClampedDescription
          key={tool.description}
          className="pl-6"
          description={tool.description}
        />
      )}

      {settings.enabled && (
        <div className="flex w-full items-center justify-between gap-2 pl-6">
          <Label isMuted>Stake</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                label={MCP_TOOL_STAKE_LABELS[settings.permission]}
                isSelect
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {stakeLevels.map((stakeLevel) => (
                <DropdownMenuItem
                  key={stakeLevel}
                  label={MCP_TOOL_STAKE_LABELS[stakeLevel]}
                  onClick={() => onPatch({ permission: stakeLevel })}
                />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </ListItem>
  );
}

/**
 * The description a server declares for one of its tools, kept to two lines.
 * These run to a paragraph in the wild, and thirty paragraphs would bury the
 * list they are meant to explain.
 */
interface ClampedDescriptionProps {
  description: string;
  className?: string;
}

function ClampedDescription({
  description,
  className,
}: ClampedDescriptionProps) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  // Only measured while clamped: expanding lifts the clamp, so the same
  // measurement would come back equal and retract the "Show less" button.
  useLayoutEffect(() => {
    const element = textRef.current;
    if (element && !isExpanded) {
      setOverflows(element.scrollHeight > element.clientHeight + 1);
    }
  }, [isExpanded]);

  return (
    <div className={cn("flex flex-col items-start gap-1", className)}>
      <p
        ref={textRef}
        className={cn(
          "whitespace-pre-wrap break-words text-sm italic text-muted-foreground",
          !isExpanded && "line-clamp-2"
        )}
      >
        {description}
      </p>
      {overflows && (
        <Button
          size="xs"
          variant="ghost-secondary"
          label={isExpanded ? "Show less" : "Show more"}
          onClick={() => setIsExpanded(!isExpanded)}
        />
      )}
    </div>
  );
}
