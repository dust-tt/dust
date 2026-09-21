import type {
  MCPServerFormValues,
  ToolSettings,
} from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import {
  canToolUseMediumStakeLevel,
  encodeMCPToolNameForForm,
  getEffectiveToolSettings,
} from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import { BulkSelectionBar } from "@app/components/shared/BulkSelectionBar";
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
  SearchInput,
  SliderToggle,
  XClose,
} from "@dust-tt/sparkle";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFormContext } from "react-hook-form";

type ToolDefinition = MCPServerViewType["server"]["tools"][number];

/**
 * Selection and search state for the Tools & Stakes tab.
 *
 * It lives here rather than in the tab because the bulk bar has to render
 * outside `SheetContainer`: the container scrolls inside a ScrollArea, where a
 * sticky element cannot pin itself to the bottom of the sheet.
 */
export interface ToolsAndStakesController {
  search: string;
  setSearch: (search: string) => void;
  tools: ToolDefinition[];
  visibleTools: ToolDefinition[];
  selectedToolNames: string[];
  isSelected: (toolName: string) => boolean;
  toggleSelected: (toolName: string) => void;
  areAllVisibleSelected: boolean;
  toggleSelectAllVisible: () => void;
  clearSelection: () => void;
  getSettings: (toolName: string) => ToolSettings;
  updateTool: (toolName: string, patch: Partial<ToolSettings>) => void;
  /** Stake levels offerable to the whole selection (medium needs a supporting tool). */
  selectionStakeLevels: MCPToolStakeLevelType[];
  applyToSelection: (patch: Partial<ToolSettings>) => void;
}

export function useToolsAndStakesController(
  mcpServerView: MCPServerViewType | null
): ToolsAndStakesController {
  const form = useFormContext<MCPServerFormValues>();
  const [search, setSearch] = useState("");
  const [selectedToolNames, setSelectedToolNames] = useState<string[]>([]);

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

  // A tool that drops out of view drops out of the selection with it, so the
  // bulk bar never acts on something nobody can see. Adjusting during render
  // (rather than in an effect) keeps the bar and the list in the same frame.
  const selectionScopeKey = `${mcpServerView?.sId ?? ""}|${search}`;
  const [prevSelectionScopeKey, setPrevSelectionScopeKey] =
    useState(selectionScopeKey);
  if (selectionScopeKey !== prevSelectionScopeKey) {
    setPrevSelectionScopeKey(selectionScopeKey);
    setSelectedToolNames([]);
  }

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
    setSelectedToolNames([]);
  };

  return {
    search,
    setSearch,
    tools,
    visibleTools,
    selectedToolNames,
    isSelected: (toolName: string) => selectedSet.has(toolName),
    toggleSelected: (toolName: string) =>
      setSelectedToolNames((previous) =>
        previous.includes(toolName)
          ? previous.filter((name) => name !== toolName)
          : [...previous, toolName]
      ),
    areAllVisibleSelected,
    toggleSelectAllVisible: () =>
      setSelectedToolNames(
        areAllVisibleSelected ? [] : visibleTools.map((tool) => tool.name)
      ),
    clearSelection: () => setSelectedToolNames([]),
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
 * apply to the selection only, and the selection is scoped to the search.
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
    isSelected,
    toggleSelected,
    areAllVisibleSelected,
    toggleSelectAllVisible,
    getSettings,
    updateTool,
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
  tool: ToolDefinition;
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
function ClampedDescription({
  description,
  className,
}: {
  description: string;
  className?: string;
}) {
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

/**
 * Batch actions for the tool list, in the same bar the Agents and Skills tables
 * raise once rows are ticked. Rendered by the sheet outside `SheetContainer`, so
 * it floats over the footer rather than scrolling away with the list.
 */
export function MCPServerDetailsToolsBulkBar({
  controller,
}: {
  controller: ToolsAndStakesController;
}) {
  const {
    selectedToolNames,
    visibleTools,
    clearSelection,
    selectionStakeLevels,
    applyToSelection,
  } = controller;

  return (
    <BulkSelectionBar
      selectedCount={selectedToolNames.length}
      totalCount={visibleTools.length}
      itemLabel="tool"
      // The list carries its own "Select all" next to the search, so the bar
      // does not offer a second one.
      canSelectAll={false}
      onSelectAll={() => {}}
      onClear={clearSelection}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="primary" isSelect label="Set stake" />
        </DropdownMenuTrigger>
        {/* The bar is pinned to the bottom of the sheet, so these menus open
            upwards; dropping down would run them off the viewport. */}
        <DropdownMenuContent align="end" side="top">
          <DropdownMenuLabel label="Set stake" />
          {selectionStakeLevels.map((stakeLevel) => (
            <DropdownMenuItem
              key={stakeLevel}
              label={MCP_TOOL_STAKE_LABELS[stakeLevel]}
              onClick={() => applyToSelection({ permission: stakeLevel })}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="primary" isSelect label="State" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top">
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
    </BulkSelectionBar>
  );
}
