import {
  ItemEmptyState,
  ItemRow,
  ItemTitle,
  KeyboardHints,
} from "@app/components/command_palette/CommandPaletteItems";
import type { Theme } from "@app/components/sparkle/ThemeContext";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { getSpaceIcon } from "@app/lib/spaces";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
import type { PodType } from "@app/types/space";
import type { Sun } from "@dust-tt/sparkle";
import {
  Avatar,
  ChevronRight,
  cn,
  Icon,
  LoadingBlock,
  SearchInput,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useRef } from "react";

export const CHANGE_THEME_COMMAND_PREFIX = "Change interface theme";

export interface CommandPaletteCommand {
  theme: Theme;
  label: string;
  icon: typeof Sun;
}

export type CommandPaletteItem =
  | { kind: "command"; command: CommandPaletteCommand }
  | { kind: "agent"; agent: LightAgentConfigurationType }
  | { kind: "pod"; pod: PodType }
  | { kind: "skill"; skill: SkillWithoutInstructionsAndToolsType };

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

function getFlatItems(
  agents: LightAgentConfigurationType[],
  pods: PodType[],
  skills: SkillWithoutInstructionsAndToolsType[],
  commands: CommandPaletteCommand[],
  commandsFirst: boolean
): CommandPaletteItem[] {
  const commandItems = commands.map(
    (command): CommandPaletteItem => ({ kind: "command", command })
  );
  const entityItems = [
    ...agents.map((agent): CommandPaletteItem => ({ kind: "agent", agent })),
    ...pods.map((pod): CommandPaletteItem => ({ kind: "pod", pod })),
    ...skills.map((skill): CommandPaletteItem => ({ kind: "skill", skill })),
  ];
  return commandsFirst
    ? [...commandItems, ...entityItems]
    : [...entityItems, ...commandItems];
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
  const commandsFirst = searchQuery.trim().length > 0 && commands.length > 0;

  const flatItems = useMemo(
    () => getFlatItems(agents, pods, skills, commands, commandsFirst),
    [agents, pods, skills, commands, commandsFirst]
  );

  const offsets = commandsFirst
    ? {
        commands: 0,
        agents: commands.length,
        pods: commands.length + agents.length,
        skills: commands.length + agents.length + pods.length,
      }
    : {
        agents: 0,
        pods: agents.length,
        skills: agents.length + pods.length,
        commands: agents.length + pods.length + skills.length,
      };
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: commandsFirst isn't read in the body, but a reorder (counts unchanged) must still reset the selection
  useEffect(() => {
    itemRefs.current.length =
      commands.length + agents.length + pods.length + skills.length;
    onSelectedIndexChange(0);
  }, [
    commands.length,
    agents.length,
    pods.length,
    skills.length,
    commandsFirst,
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

  const settingsSection = commands.length > 0 && (
    <div>
      <ItemTitle>Settings</ItemTitle>
      {commands.map((command, i) => {
        const globalIndex = offsets.commands + i;
        return (
          <ItemRow
            key={command.theme}
            ref={(el) => {
              itemRefs.current[globalIndex] = el;
            }}
            isSelected={selectedIndex === globalIndex}
            onClick={() => onItemSelect({ kind: "command", command })}
            onMouseMove={() => onSelectedIndexChange(globalIndex)}
          >
            <Icon visual={command.icon} size="xs" />
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">
                {CHANGE_THEME_COMMAND_PREFIX}
              </span>
              <Icon visual={ChevronRight} size="xs" />
              <span className="font-medium">{command.label}</span>
            </div>
          </ItemRow>
        );
      })}
    </div>
  );

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
          placeholder="Search agents, pods and skills…"
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
            Type to search agents, pods and skills.
          </ItemEmptyState>
        )}

        {commandsFirst && settingsSection}

        {agents.length > 0 && (
          <div>
            <ItemTitle>Agents</ItemTitle>
            {agents.map((agent, i) => {
              const globalIndex = offsets.agents + i;
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
              const globalIndex = offsets.pods + i;
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
              const globalIndex = offsets.skills + i;
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

        {!commandsFirst && settingsSection}
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
