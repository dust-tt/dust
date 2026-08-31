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
  TRAILING_COMMAND_GROUP_ORDER,
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
// render order and the flat keyboard-navigation order in sync: `startIndex` is
// the position of a group's first row in that flat order.
function groupCommands(
  commands: CommandPaletteCommand[],
  groupOrder: CommandGroup[],
  firstIndex: number
) {
  const groups: Array<{
    group: CommandGroup;
    commands: CommandPaletteCommand[];
    startIndex: number;
  }> = [];

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
  const trailingFirstIndex =
    leadingCommands.length + agents.length + pods.length + skills.length;
  const trailingGroups = useMemo(
    () =>
      groupCommands(commands, TRAILING_COMMAND_GROUP_ORDER, trailingFirstIndex),
    [commands, trailingFirstIndex]
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
    leadingCommands.length,
    trailingCommands.length,
    agents.length,
    pods.length,
    skills.length,
    onSelectedIndexChange,
  ]);

  function renderCommandGroups(
    groups: ReturnType<typeof groupCommands>
  ): React.ReactNode {
    return groups.map(({ group, commands: groupItems, startIndex }) => (
      <div key={group}>
        <ItemTitle>{COMMAND_GROUP_LABELS[group]}</ItemTitle>
        {groupItems.map((command, i) => {
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
              <Icon
                visual={command.icon}
                size="xs"
                className="text-muted-foreground"
              />
              <span className="min-w-0 truncate font-medium">
                {command.label}
              </span>
            </ItemRow>
          );
        })}
      </div>
    ));
  }

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

        {renderCommandGroups(leadingGroups)}

        {agents.length > 0 && (
          <div>
            <ItemTitle>Agents</ItemTitle>
            {agents.map((agent, i) => {
              const globalIndex = leadingCommands.length + i;
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
              const globalIndex = leadingCommands.length + agents.length + i;
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
                leadingCommands.length + agents.length + pods.length + i;
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

        {renderCommandGroups(trailingGroups)}
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
