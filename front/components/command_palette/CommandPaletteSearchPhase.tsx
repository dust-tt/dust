import {
  ItemEmptyState,
  ItemRow,
  ItemTitle,
  KeyboardHints,
} from "@app/components/command_palette/CommandPaletteItems";
import type {
  CommandGroup,
  CommandPaletteCommand,
} from "@app/components/command_palette/commandPaletteCommands";
import {
  COMMAND_GROUP_LABELS,
  COMMAND_GROUP_ORDER,
} from "@app/components/command_palette/commandPaletteCommands";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { getSpaceIcon } from "@app/lib/spaces";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
import type { PodType } from "@app/types/space";
import { Avatar, cn, Icon, LoadingBlock, SearchInput } from "@dust-tt/sparkle";
import { useEffect, useMemo, useRef } from "react";

export type CommandPaletteItem =
  | { kind: "agent"; agent: LightAgentConfigurationType }
  | { kind: "pod"; pod: PodType }
  | { kind: "skill"; skill: SkillWithoutInstructionsAndToolsType }
  | { kind: "command"; command: CommandPaletteCommand };

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
// render order and the flat keyboard-navigation order in sync.
function groupCommands(commands: CommandPaletteCommand[]) {
  const groups: Array<{
    group: CommandGroup;
    commands: CommandPaletteCommand[];
    startIndex: number;
  }> = [];

  let startIndex = 0;
  for (const group of COMMAND_GROUP_ORDER) {
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
  orderedCommands: CommandPaletteCommand[],
  agents: LightAgentConfigurationType[],
  pods: PodType[],
  skills: SkillWithoutInstructionsAndToolsType[]
): CommandPaletteItem[] {
  return [
    ...orderedCommands.map(
      (command): CommandPaletteItem => ({ kind: "command", command })
    ),
    ...agents.map((agent): CommandPaletteItem => ({ kind: "agent", agent })),
    ...pods.map((pod): CommandPaletteItem => ({ kind: "pod", pod })),
    ...skills.map((skill): CommandPaletteItem => ({ kind: "skill", skill })),
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
  const commandGroups = useMemo(() => groupCommands(commands), [commands]);
  const orderedCommands = useMemo(
    () => commandGroups.flatMap(({ commands: groupCommands }) => groupCommands),
    [commandGroups]
  );
  const flatItems = useMemo(
    () => getFlatItems(orderedCommands, agents, pods, skills),
    [orderedCommands, agents, pods, skills]
  );
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  // Reset selection and trim stale refs when the number of results changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the result counts are intentional triggers
  useEffect(() => {
    itemRefs.current.length = flatItems.length;
    onSelectedIndexChange(0);
  }, [
    orderedCommands.length,
    agents.length,
    pods.length,
    skills.length,
    onSelectedIndexChange,
  ]);

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

  return (
    <div className="flex flex-col">
      <div className="px-1.5 py-3">
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

        {commandGroups.map(({ group, commands: groupCommands, startIndex }) => (
          <div key={group}>
            <ItemTitle>{COMMAND_GROUP_LABELS[group]}</ItemTitle>
            {groupCommands.map((command, i) => {
              const globalIndex = startIndex + i;
              return (
                <ItemRow
                  key={command.id}
                  ref={(el) => {
                    itemRefs.current[globalIndex] = el;
                  }}
                  isSelected={selectedIndex === globalIndex}
                  onClick={() => onItemSelect({ kind: "command", command })}
                  onMouseMove={() => onSelectedIndexChange(globalIndex)}
                >
                  <Icon visual={command.icon} size="xs" />
                  <span className="font-medium">{command.label}</span>
                </ItemRow>
              );
            })}
          </div>
        ))}

        {agents.length > 0 && (
          <div>
            <ItemTitle>Agents</ItemTitle>
            {agents.map((agent, i) => {
              const globalIndex = orderedCommands.length + i;
              return (
                <ItemRow
                  key={agent.sId}
                  ref={(el) => {
                    itemRefs.current[globalIndex] = el;
                  }}
                  isSelected={selectedIndex === globalIndex}
                  onClick={() => onItemSelect({ kind: "agent", agent })}
                  onMouseMove={() => onSelectedIndexChange(globalIndex)}
                >
                  <Avatar visual={agent.pictureUrl} size="xs" />
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="shrink-0 font-medium">{agent.name}</span>
                    <span className="shrink-0 text-muted-foreground">-</span>
                    <span className="min-w-0 truncate text-muted-foreground">
                      {agent.description}
                    </span>
                  </div>
                </ItemRow>
              );
            })}
            {hasMoreAgents && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                More agents available. Type to filter.
              </div>
            )}
          </div>
        )}

        {pods.length > 0 && (
          <div>
            <ItemTitle>Pods</ItemTitle>
            {pods.map((pod, i) => {
              const globalIndex = orderedCommands.length + agents.length + i;
              return (
                <ItemRow
                  key={pod.sId}
                  ref={(el) => {
                    itemRefs.current[globalIndex] = el;
                  }}
                  isSelected={selectedIndex === globalIndex}
                  onClick={() => onItemSelect({ kind: "pod", pod })}
                  onMouseMove={() => onSelectedIndexChange(globalIndex)}
                >
                  <Icon visual={getSpaceIcon(pod)} size="xs" />
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="shrink-0 font-medium">{pod.name}</span>
                    {pod.description && (
                      <>
                        <span className="shrink-0 text-muted-foreground">
                          -
                        </span>
                        <span className="min-w-0 truncate text-muted-foreground">
                          {pod.description}
                        </span>
                      </>
                    )}
                  </div>
                </ItemRow>
              );
            })}
            {hasMorePods && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                More pods available. Type to filter.
              </div>
            )}
          </div>
        )}

        {skills.length > 0 && (
          <div>
            <ItemTitle>Skills</ItemTitle>
            {skills.map((skill, i) => {
              const globalIndex =
                orderedCommands.length + agents.length + pods.length + i;
              const SkillAvatar = getSkillAvatarIcon(skill);
              return (
                <ItemRow
                  key={skill.sId}
                  ref={(el) => {
                    itemRefs.current[globalIndex] = el;
                  }}
                  isSelected={selectedIndex === globalIndex}
                  onClick={() => onItemSelect({ kind: "skill", skill })}
                  onMouseMove={() => onSelectedIndexChange(globalIndex)}
                >
                  <SkillAvatar size="xs" />
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="shrink-0 font-medium">{skill.name}</span>
                    <span className="shrink-0 text-muted-foreground">-</span>
                    <span className="min-w-0 truncate text-muted-foreground">
                      {skill.userFacingDescription}
                    </span>
                  </div>
                </ItemRow>
              );
            })}
            {hasMoreSkills && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                More skills available. Type to filter.
              </div>
            )}
          </div>
        )}
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
