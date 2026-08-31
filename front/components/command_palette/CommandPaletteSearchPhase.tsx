import type { CommandPaletteItem } from "@app/components/command_palette/CommandPaletteItems";
import {
  ItemEmptyState,
  KeyboardHints,
} from "@app/components/command_palette/CommandPaletteItems";
import type { CommandGroupSection } from "@app/components/command_palette/CommandPaletteSections";
import {
  AgentSection,
  CommandSections,
  PodSection,
  SkillSection,
} from "@app/components/command_palette/CommandPaletteSections";
import type {
  CommandGroup,
  CommandPaletteCommand,
} from "@app/components/command_palette/commandPaletteCommands";
import {
  COMMAND_GROUP_ORDER,
  TRAILING_COMMAND_GROUP_ORDER,
} from "@app/components/command_palette/commandPaletteCommands";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
import type { PodType } from "@app/types/space";
import { cn, LoadingBlock, SearchInput } from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useRef } from "react";

export type { CommandPaletteItem };

interface CommandPaletteSearchPhaseProps {
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  commands: CommandPaletteCommand[];
  agents: LightAgentConfigurationType[];
  pods: PodType[];
  skills: SkillWithoutInstructionsAndToolsType[];
  hasMoreAgents: boolean;
  hasMorePods: boolean;
  hasMoreSkills: boolean;
  isLoading: boolean;
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
  onItemSelect: (item: CommandPaletteItem) => void;
  onClose: () => void;
}

// Commands are shown grouped, in a fixed group order. Grouping here keeps the
// render order and the flat keyboard-navigation order in sync: `startIndex` is
// the position of a group's first row in that flat order.
function groupCommands(
  commands: CommandPaletteCommand[],
  groupOrder: CommandGroup[],
  firstIndex: number
): CommandGroupSection[] {
  const groups: CommandGroupSection[] = [];

  let startIndex = firstIndex;
  for (const group of groupOrder) {
    const groupItems = commands.filter((command) => command.group === group);
    if (groupItems.length === 0) {
      continue;
    }
    groups.push({ group, commands: groupItems, startIndex });
    startIndex += groupItems.length;
  }

  return groups;
}

function getFlatItems(
  leadingCommands: CommandPaletteCommand[],
  agents: LightAgentConfigurationType[],
  pods: PodType[],
  skills: SkillWithoutInstructionsAndToolsType[],
  trailingCommands: CommandPaletteCommand[]
): CommandPaletteItem[] {
  return [
    ...leadingCommands.map(
      (command): CommandPaletteItem => ({ kind: "command", command })
    ),
    ...agents.map((agent): CommandPaletteItem => ({ kind: "agent", agent })),
    ...pods.map((pod): CommandPaletteItem => ({ kind: "pod", pod })),
    ...skills.map((skill): CommandPaletteItem => ({ kind: "skill", skill })),
    ...trailingCommands.map(
      (command): CommandPaletteItem => ({ kind: "command", command })
    ),
  ];
}

export function CommandPaletteSearchPhase({
  searchQuery,
  onSearchQueryChange,
  commands,
  agents,
  pods,
  skills,
  hasMoreAgents,
  hasMorePods,
  hasMoreSkills,
  isLoading,
  selectedIndex,
  onSelectedIndexChange,
  onItemSelect,
  onClose,
}: CommandPaletteSearchPhaseProps) {
  const leadingGroups = useMemo(
    () => groupCommands(commands, COMMAND_GROUP_ORDER, 0),
    [commands]
  );
  const leadingCommands = useMemo(
    () => leadingGroups.flatMap(({ commands: groupItems }) => groupItems),
    [leadingGroups]
  );

  // Trailing groups render below the results, so their flat indices start after
  // every leading command and every entity row.
  const agentsStartIndex = leadingCommands.length;
  const podsStartIndex = agentsStartIndex + agents.length;
  const skillsStartIndex = podsStartIndex + pods.length;
  const trailingStartIndex = skillsStartIndex + skills.length;

  const trailingGroups = useMemo(
    () =>
      groupCommands(commands, TRAILING_COMMAND_GROUP_ORDER, trailingStartIndex),
    [commands, trailingStartIndex]
  );
  const trailingCommands = useMemo(
    () => trailingGroups.flatMap(({ commands: groupItems }) => groupItems),
    [trailingGroups]
  );

  const flatItems = useMemo(
    () => getFlatItems(leadingCommands, agents, pods, skills, trailingCommands),
    [leadingCommands, agents, pods, skills, trailingCommands]
  );
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const registerRef = useCallback(
    (index: number, el: HTMLDivElement | null) => {
      itemRefs.current[index] = el;
    },
    []
  );

  // Auto-focus the search input on mount. Deferred with requestAnimationFrame
  // to run after Radix FocusScope has finished trapping focus.
  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frameId);
  }, []);

  // Scroll selected item into view. Guard against selectedIndex being
  // transiently out-of-bounds on the render cycle before the reset effect fires.
  useEffect(() => {
    if (selectedIndex < flatItems.length) {
      itemRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, flatItems.length]);

  // Reset selection and trim stale refs whenever the results change. flatItems
  // is memoized on every result list, so its identity is exactly that signal.
  useEffect(() => {
    itemRefs.current.length = flatItems.length;
    onSelectedIndexChange(0);
  }, [flatItems, onSelectedIndexChange]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const totalItems = flatItems.length;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (totalItems > 0) {
          onSelectedIndexChange((selectedIndex + 1) % totalItems);
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (totalItems > 0) {
          onSelectedIndexChange((selectedIndex - 1 + totalItems) % totalItems);
        }
        break;
      case "Enter":
        e.preventDefault();
        if (flatItems[selectedIndex]) {
          onItemSelect(flatItems[selectedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
    }
  }

  const sectionProps = {
    selectedIndex,
    registerRef,
    onItemSelect,
    onSelectedIndexChange,
  };

  return (
    <div className="flex flex-col">
      <div className="px-1.5 py-1.5">
        <SearchInput
          ref={searchInputRef}
          className={cn(
            // Command palette: the dialog is the container, so the search input
            // drops its border, background and focus ring. border-0 (not just
            // transparent) removes the 1px offset so the input text lines up
            // with the items below, which share the px-1.5 + px-3 inset.
            "[&_input]:border-0 [&_input]:bg-transparent",
            "[&_input]:focus-visible:ring-0"
          )}
          name="command-palette-search"
          placeholder="Search agents, pods, skills or run a command…"
          value={searchQuery}
          onChange={onSearchQueryChange}
          onKeyDown={handleKeyDown}
          isLoading={isLoading}
        />
      </div>
      <div className="flex max-h-125 flex-col gap-2 overflow-y-auto p-1.5">
        {isLoading && flatItems.length === 0 && (
          <div className="flex flex-col gap-1 p-1">
            {Array.from({ length: 9 }, (_, i) => (
              <div key={i} className="flex items-center gap-2.5 px-3 py-2.5">
                <LoadingBlock className="h-6 w-6 shrink-0 rounded-full" />
                <LoadingBlock
                  className="h-4"
                  style={{ width: `${30 + (i % 3) * 20}%` }}
                />
              </div>
            ))}
          </div>
        )}
        {!isLoading && flatItems.length === 0 && searchQuery.length > 0 && (
          <ItemEmptyState>No results found.</ItemEmptyState>
        )}
        {!isLoading && flatItems.length === 0 && searchQuery.length === 0 && (
          <ItemEmptyState>
            Type to search agents, pods and skills, or run a command.
          </ItemEmptyState>
        )}

        <CommandSections groups={leadingGroups} {...sectionProps} />

        <AgentSection
          agents={agents}
          hasMore={hasMoreAgents}
          startIndex={agentsStartIndex}
          {...sectionProps}
        />

        <PodSection
          pods={pods}
          hasMore={hasMorePods}
          startIndex={podsStartIndex}
          {...sectionProps}
        />

        <SkillSection
          skills={skills}
          hasMore={hasMoreSkills}
          startIndex={skillsStartIndex}
          {...sectionProps}
        />

        <CommandSections groups={trailingGroups} {...sectionProps} />
      </div>
      <KeyboardHints
        hints={[
          { keys: ["↑", "↓"], label: "Navigate" },
          { keys: ["↵"], label: "Select" },
          { keys: ["Esc"], label: "Close" },
        ]}
      />
    </div>
  );
}
