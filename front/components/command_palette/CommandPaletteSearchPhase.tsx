import {
  ItemEmptyState,
  ItemRow,
  ItemTitle,
  KeyboardHints,
} from "@app/components/command_palette/CommandPaletteItems";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { getSpaceIcon } from "@app/lib/spaces";
import type { AgentSearchListItemType } from "@app/types/agent_search/agent_search";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { ConversationListItemType } from "@app/types/assistant/conversation";
import { getConversationDisplayTitle } from "@app/types/assistant/conversation";
import type {
  SkillListItemType,
  SkillWithoutInstructionsAndToolsType,
} from "@app/types/assistant/skill_configuration";
import type { PodType } from "@app/types/space";
import type { LightUserTypeWithWorkspace } from "@app/types/user";
import {
  Avatar,
  cn,
  FilterChips,
  Icon,
  LoadingBlock,
  MessageCircle01,
  SearchInput,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useRef, useState } from "react";

type CommandPaletteCategory =
  | "Conversations"
  | "Pods"
  | "Agents"
  | "Members"
  | "Skills";
type CommandPaletteFilter = "All" | CommandPaletteCategory;

const CATEGORY_ORDER: CommandPaletteCategory[] = [
  "Conversations",
  "Pods",
  "Agents",
  "Members",
  "Skills",
];

type CommandPaletteSkill =
  | SkillListItemType
  | SkillWithoutInstructionsAndToolsType;

type CommandPaletteAgent =
  | LightAgentConfigurationType
  | AgentSearchListItemType;

type CommandPalettePod = PodType & { isMember: boolean };

type CommandPaletteConversation = ConversationListItemType & {
  spaceName: string | null;
};

export type CommandPaletteMember = LightUserTypeWithWorkspace;

export type CommandPaletteItem =
  | { kind: "agent"; agent: CommandPaletteAgent }
  | { kind: "conversation"; conversation: CommandPaletteConversation }
  | { kind: "member"; member: CommandPaletteMember }
  | { kind: "pod"; pod: CommandPalettePod }
  | { kind: "skill"; skill: CommandPaletteSkill };

export function getCommandPaletteItemKey(item: CommandPaletteItem): string {
  switch (item.kind) {
    case "agent":
      return `agent:${item.agent.sId}`;
    case "conversation":
      return `conversation:${item.conversation.sId}`;
    case "member":
      return `member:${item.member.sId}`;
    case "pod":
      return `pod:${item.pod.sId}`;
    case "skill":
      return `skill:${item.skill.sId}`;
  }
}

interface CommandPaletteSearchPhaseProps {
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  agents: CommandPaletteAgent[];
  conversations: CommandPaletteConversation[];
  members: CommandPaletteMember[];
  pods: CommandPalettePod[];
  skills: CommandPaletteSkill[];
  /** Top frecency-ranked items to show when the query is empty. */
  frequentItems: CommandPaletteItem[];
  hasMoreAgents: boolean;
  hasMoreConversations: boolean;
  hasMoreMembers: boolean;
  hasMorePods: boolean;
  hasMoreSkills: boolean;
  isLoading: boolean;
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
  onItemSelect: (item: CommandPaletteItem) => void;
}

function CommandPaletteItemContent({ item }: { item: CommandPaletteItem }) {
  switch (item.kind) {
    case "conversation": {
      const title = getConversationDisplayTitle(item.conversation);
      return (
        <>
          <Icon visual={MessageCircle01} size="xs" />
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate font-medium">{title}</span>
            {item.conversation.spaceName && (
              <>
                <span className="shrink-0 text-muted-foreground">-</span>
                <span className="min-w-0 truncate text-muted-foreground">
                  {item.conversation.spaceName}
                </span>
              </>
            )}
          </div>
        </>
      );
    }
    case "pod":
      return (
        <>
          <Icon visual={getSpaceIcon(item.pod)} size="xs" />
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className={cn(
                "shrink-0 font-medium",
                !item.pod.isMember && "italic"
              )}
            >
              {item.pod.name}
            </span>
            {item.pod.description && (
              <>
                <span className="shrink-0 text-muted-foreground">-</span>
                <span className="min-w-0 truncate text-muted-foreground">
                  {item.pod.description}
                </span>
              </>
            )}
          </div>
        </>
      );
    case "agent":
      return (
        <>
          <Avatar visual={item.agent.pictureUrl} size="3xs" />
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 font-medium">{item.agent.name}</span>
            <span className="shrink-0 text-muted-foreground">-</span>
            <span className="min-w-0 truncate text-muted-foreground">
              {item.agent.description}
            </span>
          </div>
        </>
      );
    case "member":
      return (
        <>
          <Avatar
            name={item.member.fullName}
            visual={item.member.image ?? undefined}
            size="3xs"
            isRounded
          />
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 font-medium">{item.member.fullName}</span>
            {item.member.email && (
              <>
                <span className="shrink-0 text-muted-foreground">-</span>
                <span className="min-w-0 truncate text-muted-foreground">
                  {item.member.email}
                </span>
              </>
            )}
          </div>
        </>
      );
    case "skill": {
      const SkillAvatar = getSkillAvatarIcon(item.skill);
      return (
        <>
          <SkillAvatar size="3xs" />
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 font-medium">{item.skill.name}</span>
            <span className="shrink-0 text-muted-foreground">-</span>
            <span className="min-w-0 truncate text-muted-foreground">
              {item.skill.userFacingDescription}
            </span>
          </div>
        </>
      );
    }
  }
}

function getFlatItems(
  conversations: CommandPaletteConversation[],
  pods: CommandPalettePod[],
  agents: CommandPaletteAgent[],
  members: CommandPaletteMember[],
  skills: CommandPaletteSkill[]
): CommandPaletteItem[] {
  return [
    ...conversations.map(
      (conversation): CommandPaletteItem => ({
        kind: "conversation",
        conversation,
      })
    ),
    ...pods.map((pod): CommandPaletteItem => ({ kind: "pod", pod })),
    ...agents.map((agent): CommandPaletteItem => ({ kind: "agent", agent })),
    ...members.map(
      (member): CommandPaletteItem => ({ kind: "member", member })
    ),
    ...skills.map((skill): CommandPaletteItem => ({ kind: "skill", skill })),
  ];
}

function getAvailableCategories({
  conversations,
  pods,
  agents,
  members,
  skills,
}: {
  conversations: CommandPaletteConversation[];
  pods: CommandPalettePod[];
  agents: CommandPaletteAgent[];
  members: CommandPaletteMember[];
  skills: CommandPaletteSkill[];
}): CommandPaletteCategory[] {
  const categories: CommandPaletteCategory[] = [];
  if (conversations.length > 0) {
    categories.push("Conversations");
  }
  if (pods.length > 0) {
    categories.push("Pods");
  }
  if (agents.length > 0) {
    categories.push("Agents");
  }
  if (members.length > 0) {
    categories.push("Members");
  }
  if (skills.length > 0) {
    categories.push("Skills");
  }
  return categories;
}

export function CommandPaletteSearchPhase({
  searchQuery,
  onSearchQueryChange,
  agents,
  conversations,
  members,
  pods,
  skills,
  frequentItems,
  hasMoreAgents,
  hasMoreConversations,
  hasMoreMembers,
  hasMorePods,
  hasMoreSkills,
  isLoading,
  selectedIndex,
  onSelectedIndexChange,
  onItemSelect,
}: CommandPaletteSearchPhaseProps) {
  const isEmptyQuery = searchQuery.trim().length === 0;

  const availableCategories = useMemo(
    () =>
      getAvailableCategories({
        conversations,
        pods,
        agents,
        members,
        skills,
      }),
    [conversations, pods, agents, members, skills]
  );

  const [selectedCategory, setSelectedCategory] =
    useState<CommandPaletteFilter>("All");

  // Keep the active category in the chip row even if it currently has no hits,
  // so selecting a filter is sticky across typing / result changes.
  const filters = useMemo((): CommandPaletteFilter[] => {
    const categories = new Set(availableCategories);
    if (selectedCategory !== "All") {
      categories.add(selectedCategory);
    }
    return [
      "All",
      ...CATEGORY_ORDER.filter((category) => categories.has(category)),
    ];
  }, [availableCategories, selectedCategory]);

  const filteredConversations =
    selectedCategory === "All" || selectedCategory === "Conversations"
      ? conversations
      : [];
  const filteredPods =
    selectedCategory === "All" || selectedCategory === "Pods" ? pods : [];
  const filteredAgents =
    selectedCategory === "All" || selectedCategory === "Agents" ? agents : [];
  const filteredMembers =
    selectedCategory === "All" || selectedCategory === "Members" ? members : [];
  const filteredSkills =
    selectedCategory === "All" || selectedCategory === "Skills" ? skills : [];

  const searchFlatItems = useMemo(
    () =>
      getFlatItems(
        filteredConversations,
        filteredPods,
        filteredAgents,
        filteredMembers,
        filteredSkills
      ),
    [
      filteredConversations,
      filteredPods,
      filteredAgents,
      filteredMembers,
      filteredSkills,
    ]
  );
  const flatItems = isEmptyQuery ? frequentItems : searchFlatItems;
  const hasSearchResults =
    conversations.length > 0 ||
    pods.length > 0 ||
    agents.length > 0 ||
    members.length > 0 ||
    skills.length > 0;
  const showCategoryFilters =
    !isEmptyQuery &&
    (selectedCategory !== "All" || availableCategories.length > 1);

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

  // Keep keyboard selection valid when the result list shrinks (e.g. typing).
  useEffect(() => {
    itemRefs.current.length = flatItems.length;
    onSelectedIndexChange(0);
  }, [flatItems.length, onSelectedIndexChange]);

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
    }
  }

  const podsOffset = filteredConversations.length;
  const agentsOffset = podsOffset + filteredPods.length;
  const membersOffset = agentsOffset + filteredAgents.length;
  const skillsOffset = membersOffset + filteredMembers.length;

  return (
    <div className="flex flex-col">
      <div className="border-b border-separator p-3">
        <SearchInput
          ref={searchInputRef}
          name="command-palette-search"
          placeholder="Search…"
          value={searchQuery}
          onChange={onSearchQueryChange}
          onKeyDown={handleKeyDown}
        />
        {showCategoryFilters && (
          <div className="pt-2">
            <FilterChips
              filters={filters}
              defaultFilter="All"
              variant="secondary"
              onFilterClick={(filter) => {
                setSelectedCategory(filter);
                onSelectedIndexChange(0);
              }}
            />
          </div>
        )}
      </div>
      <div className="flex max-h-125 flex-col gap-2 overflow-y-auto p-1.5">
        {isEmptyQuery && frequentItems.length === 0 && (
          <ItemEmptyState>
            Type to search conversations, pods, agents, members, and skills.
            Items you open will show up here for quick access.
          </ItemEmptyState>
        )}

        {isEmptyQuery && frequentItems.length > 0 && (
          <div>
            {frequentItems.map((item, i) => (
              <ItemRow
                key={getCommandPaletteItemKey(item)}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                isSelected={selectedIndex === i}
                onClick={() => onItemSelect(item)}
                onMouseMove={() => onSelectedIndexChange(i)}
              >
                <CommandPaletteItemContent item={item} />
              </ItemRow>
            ))}
          </div>
        )}

        {!isEmptyQuery && isLoading && !hasSearchResults && (
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
        {!isEmptyQuery && !isLoading && !hasSearchResults && (
          <ItemEmptyState>No results found.</ItemEmptyState>
        )}

        {!isEmptyQuery && filteredConversations.length > 0 && (
          <div>
            <ItemTitle>Conversations</ItemTitle>
            {filteredConversations.map((conversation, i) => (
              <ItemRow
                key={conversation.sId}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                isSelected={selectedIndex === i}
                onClick={() =>
                  onItemSelect({ kind: "conversation", conversation })
                }
                onMouseMove={() => onSelectedIndexChange(i)}
              >
                <CommandPaletteItemContent
                  item={{ kind: "conversation", conversation }}
                />
              </ItemRow>
            ))}
            {hasMoreConversations && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                More conversations available. Type to filter.
              </div>
            )}
          </div>
        )}

        {!isEmptyQuery && filteredPods.length > 0 && (
          <div>
            <ItemTitle>Pods</ItemTitle>
            {filteredPods.map((pod, i) => {
              const globalIndex = podsOffset + i;
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
                  <CommandPaletteItemContent item={{ kind: "pod", pod }} />
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

        {!isEmptyQuery && filteredAgents.length > 0 && (
          <div>
            <ItemTitle>Agents</ItemTitle>
            {filteredAgents.map((agent, i) => {
              const globalIndex = agentsOffset + i;
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
                  <CommandPaletteItemContent item={{ kind: "agent", agent }} />
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

        {!isEmptyQuery && filteredMembers.length > 0 && (
          <div>
            <ItemTitle>Members</ItemTitle>
            {filteredMembers.map((member, i) => {
              const globalIndex = membersOffset + i;
              return (
                <ItemRow
                  key={member.sId}
                  ref={(el) => {
                    itemRefs.current[globalIndex] = el;
                  }}
                  isSelected={selectedIndex === globalIndex}
                  onClick={() => onItemSelect({ kind: "member", member })}
                  onMouseMove={() => onSelectedIndexChange(globalIndex)}
                >
                  <CommandPaletteItemContent
                    item={{ kind: "member", member }}
                  />
                </ItemRow>
              );
            })}
            {hasMoreMembers && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                More members available. Type to filter.
              </div>
            )}
          </div>
        )}

        {!isEmptyQuery && filteredSkills.length > 0 && (
          <div>
            <ItemTitle>Skills</ItemTitle>
            {filteredSkills.map((skill, i) => {
              const globalIndex = skillsOffset + i;
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
                  <CommandPaletteItemContent item={{ kind: "skill", skill }} />
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
