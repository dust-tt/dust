import {
  ItemEmptyState,
  ItemRow,
  ItemTitle,
  KeyboardHints,
} from "@app/components/command_palette/CommandPaletteItems";
import { getSkillAvatarIcon } from "@app/lib/skill";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import {
  Avatar,
  ChatBubbleBottomCenterTextIcon,
  Icon,
  SearchInput,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useRef } from "react";

export type CommandPaletteItem =
  | { kind: "agent"; agent: LightAgentConfigurationType }
  | { kind: "skill"; skill: SkillType }
  | { kind: "conversation"; conversation: ConversationWithoutContentType };

interface CommandPaletteSearchPhaseProps {
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  agents: LightAgentConfigurationType[];
  skills: SkillType[];
  conversations: ConversationWithoutContentType[];
  hasMoreAgents: boolean;
  hasMoreSkills: boolean;
  hasMoreConversations: boolean;
  isLoading: boolean;
  isConversationsSearching: boolean;
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
  onItemSelect: (item: CommandPaletteItem) => void;
  onClose: () => void;
}

function getFlatItems(
  agents: LightAgentConfigurationType[],
  skills: SkillType[],
  conversations: ConversationWithoutContentType[]
): CommandPaletteItem[] {
  return [
    ...agents.map((agent): CommandPaletteItem => ({ kind: "agent", agent })),
    ...skills.map((skill): CommandPaletteItem => ({ kind: "skill", skill })),
    ...conversations.map(
      (conversation): CommandPaletteItem => ({
        kind: "conversation",
        conversation,
      })
    ),
  ];
}

export function CommandPaletteSearchPhase({
  searchQuery,
  onSearchQueryChange,
  agents,
  skills,
  conversations,
  hasMoreAgents,
  hasMoreSkills,
  hasMoreConversations,
  isLoading,
  isConversationsSearching,
  selectedIndex,
  onSelectedIndexChange,
  onItemSelect,
  onClose,
}: CommandPaletteSearchPhaseProps) {
  const flatItems = useMemo(
    () => getFlatItems(agents, skills, conversations),
    [agents, skills, conversations]
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: list lengths are intentional triggers
  useEffect(() => {
    onSelectedIndexChange(0);
  }, [
    agents.length,
    skills.length,
    conversations.length,
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
      <div className="p-3">
        <SearchInput
          ref={searchInputRef}
          name="command-palette-search"
          placeholder="Search agents, skills and conversations…"
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
          <ItemEmptyState>
            Type to search agents, skills and conversations.
          </ItemEmptyState>
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
            {hasMoreAgents && (
              <div className="px-3 py-2 text-xs text-muted-foreground dark:text-muted-foreground-night">
                More agents available. Type to filter.
              </div>
            )}
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
            {hasMoreSkills && (
              <div className="px-3 py-2 text-xs text-muted-foreground dark:text-muted-foreground-night">
                More skills available. Type to filter.
              </div>
            )}
          </div>
        )}

        {conversations.length > 0 && (
          <div>
            <ItemTitle>Conversations</ItemTitle>
            {conversations.map((conversation, i) => {
              const globalIndex = agents.length + skills.length + i;
              return (
                <ItemRow
                  key={conversation.sId}
                  ref={(el) => {
                    itemRefs.current[globalIndex] = el;
                  }}
                  isSelected={selectedIndex === globalIndex}
                  onClick={() =>
                    onItemSelect({ kind: "conversation", conversation })
                  }
                  onMouseEnter={() => onSelectedIndexChange(globalIndex)}
                >
                  <Icon
                    visual={ChatBubbleBottomCenterTextIcon}
                    size="xs"
                    className="shrink-0 text-muted-foreground dark:text-muted-foreground-night"
                  />
                  <span className="min-w-0 truncate font-medium">
                    {conversation.title ?? "Untitled conversation"}
                  </span>
                </ItemRow>
              );
            })}
            {hasMoreConversations && (
              <div className="px-3 py-2 text-xs text-muted-foreground dark:text-muted-foreground-night">
                More conversations available. Refine your search to filter.
              </div>
            )}
          </div>
        )}

        {isConversationsSearching &&
          conversations.length === 0 &&
          searchQuery.length > 0 &&
          !isLoading && (
            <div className="px-3 py-2 text-xs text-muted-foreground dark:text-muted-foreground-night">
              Searching conversations…
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
