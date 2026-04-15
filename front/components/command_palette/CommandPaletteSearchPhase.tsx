import {
  ItemEmptyState,
  ItemRow,
  ItemTitle,
  KeyboardHints,
} from "@app/components/command_palette/CommandPaletteItems";
import { getSkillAvatarIcon } from "@app/lib/skill";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import { Avatar, SearchInput } from "@dust-tt/sparkle";
import { useEffect, useMemo, useRef } from "react";

export type CommandPaletteItem =
  | { kind: "agent"; agent: LightAgentConfigurationType }
  | { kind: "skill"; skill: SkillType };

interface CommandPaletteSearchPhaseProps {
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  agents: LightAgentConfigurationType[];
  skills: SkillType[];
  isLoading: boolean;
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
  onItemSelect: (item: CommandPaletteItem) => void;
  onClose: () => void;
}

function getFlatItems(
  agents: LightAgentConfigurationType[],
  skills: SkillType[]
): CommandPaletteItem[] {
  return [
    ...agents.map((agent): CommandPaletteItem => ({ kind: "agent", agent })),
    ...skills.map((skill): CommandPaletteItem => ({ kind: "skill", skill })),
  ];
}

export function CommandPaletteSearchPhase({
  searchQuery,
  onSearchQueryChange,
  agents,
  skills,
  isLoading,
  selectedIndex,
  onSelectedIndexChange,
  onItemSelect,
  onClose,
}: CommandPaletteSearchPhaseProps) {
  const flatItems = useMemo(
    () => getFlatItems(agents, skills),
    [agents, skills]
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

  // Scroll selected item into view.
  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Reset selection when the number of results changes (e.g., after typing).
  // biome-ignore lint/correctness/useExhaustiveDependencies: agents.length and skills.length are intentional triggers
  useEffect(() => {
    onSelectedIndexChange(0);
  }, [agents.length, skills.length, onSelectedIndexChange]);

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
      <div className="p-3">
        <SearchInput
          ref={searchInputRef}
          name="command-palette-search"
          placeholder="Search agents and skills…"
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
                <div className="h-6 w-6 shrink-0 animate-pulse rounded-full bg-muted-background dark:bg-muted-background-night" />
                <div
                  className="h-4 animate-pulse rounded bg-muted-background dark:bg-muted-background-night"
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
          <ItemEmptyState>Type to search agents and skills.</ItemEmptyState>
        )}

        {agents.length > 0 && (
          <div>
            <ItemTitle>Agents</ItemTitle>
            {agents.map((agent, i) => (
              <ItemRow
                key={agent.sId}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                isSelected={selectedIndex === i}
                onClick={() => onItemSelect({ kind: "agent", agent })}
                onMouseEnter={() => onSelectedIndexChange(i)}
              >
                <Avatar visual={agent.pictureUrl} size="xs" />
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="shrink-0 font-medium">@{agent.name}</span>
                  <span className="shrink-0 text-muted-foreground dark:text-muted-foreground-night">
                    -
                  </span>
                  <span className="min-w-0 truncate text-muted-foreground dark:text-muted-foreground-night">
                    {agent.description}
                  </span>
                </div>
              </ItemRow>
            ))}
          </div>
        )}

        {skills.length > 0 && (
          <div>
            <ItemTitle>Skills</ItemTitle>
            {skills.map((skill, i) => {
              const globalIndex = agents.length + i;
              const SkillAvatar = getSkillAvatarIcon(skill.icon);
              return (
                <ItemRow
                  key={skill.sId}
                  ref={(el) => {
                    itemRefs.current[globalIndex] = el;
                  }}
                  isSelected={selectedIndex === globalIndex}
                  onClick={() => onItemSelect({ kind: "skill", skill })}
                  onMouseEnter={() => onSelectedIndexChange(globalIndex)}
                >
                  <SkillAvatar size="xs" />
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="shrink-0 font-medium">{skill.name}</span>
                    <span className="shrink-0 text-muted-foreground dark:text-muted-foreground-night">
                      -
                    </span>
                    <span className="min-w-0 truncate text-muted-foreground dark:text-muted-foreground-night">
                      {skill.userFacingDescription}
                    </span>
                  </div>
                </ItemRow>
              );
            })}
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
