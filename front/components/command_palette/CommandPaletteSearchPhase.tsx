import {
  ItemEmptyState,
  ItemRow,
  ItemTitle,
  KeyboardHints,
} from "@app/components/command_palette/CommandPaletteItems";
import type { AdminSectionId } from "@app/lib/admin/adminSectionIds";
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
import { useLingui } from "@lingui/react/macro";
import type React from "react";
import { useEffect, useMemo, useRef } from "react";

export type CommandPaletteCategory =
  | "Conversations"
  | "Pods"
  | "Agents"
  | "Members"
  | "Skills"
  | "Settings";
export type CommandPaletteFilter = "All" | CommandPaletteCategory;

const ACCESSIBLE_CATEGORY_ORDER: CommandPaletteCategory[] = [
  "Conversations",
  "Pods",
  "Agents",
  "Members",
  "Skills",
  "Settings",
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

export type CommandPaletteSetting = {
  label: string;
  pageLabel: string;
  pageHref: string;
  sectionId: AdminSectionId;
  tab?: string;
  icon: React.ComponentType<{ className?: string }>;
};

export type CommandPaletteItem =
  | { kind: "agent"; agent: CommandPaletteAgent }
  | { kind: "conversation"; conversation: CommandPaletteConversation }
  | { kind: "member"; member: CommandPaletteMember }
  | { kind: "pod"; pod: CommandPalettePod }
  | { kind: "setting"; setting: CommandPaletteSetting }
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
    case "setting":
      return `setting:${item.setting.pageHref}#${item.setting.sectionId}:${item.setting.label}`;
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
  settings: CommandPaletteSetting[];
  /** Top frecency-ranked items to show when the query is empty and All is selected. */
  frequentItems: CommandPaletteItem[];
  hasMoreAgents: boolean;
  hasMoreConversations: boolean;
  hasMoreMembers: boolean;
  hasMorePods: boolean;
  hasMoreSkills: boolean;
  hasMoreSettings: boolean;
  canSearchSettings: boolean;
  selectedCategory: CommandPaletteFilter;
  onSelectedCategoryChange: (category: CommandPaletteFilter) => void;
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
    case "setting":
      return (
        <>
          <Icon visual={item.setting.icon} size="xs" />
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 font-medium">{item.setting.label}</span>
            <span className="shrink-0 text-muted-foreground">-</span>
            <span className="min-w-0 truncate text-muted-foreground">
              {item.setting.pageLabel}
            </span>
          </div>
        </>
      );
  }
}

function getFlatItems(
  conversations: CommandPaletteConversation[],
  pods: CommandPalettePod[],
  agents: CommandPaletteAgent[],
  members: CommandPaletteMember[],
  skills: CommandPaletteSkill[],
  settings: CommandPaletteSetting[]
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
    ...settings.map(
      (setting): CommandPaletteItem => ({ kind: "setting", setting })
    ),
  ];
}

function getAvailableCategories({
  conversations,
  pods,
  agents,
  members,
  skills,
  settings,
}: {
  conversations: CommandPaletteConversation[];
  pods: CommandPalettePod[];
  agents: CommandPaletteAgent[];
  members: CommandPaletteMember[];
  skills: CommandPaletteSkill[];
  settings: CommandPaletteSetting[];
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
  if (settings.length > 0) {
    categories.push("Settings");
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
  settings,
  frequentItems,
  hasMoreAgents,
  hasMoreConversations,
  hasMoreMembers,
  hasMorePods,
  hasMoreSkills,
  hasMoreSettings,
  canSearchSettings,
  selectedCategory,
  onSelectedCategoryChange,
  isLoading,
  selectedIndex,
  onSelectedIndexChange,
  onItemSelect,
}: CommandPaletteSearchPhaseProps) {
  const { t } = useLingui();
  const isEmptyQuery = searchQuery.trim().length === 0;

  const accessibleCategories = useMemo((): CommandPaletteCategory[] => {
    return ACCESSIBLE_CATEGORY_ORDER.filter(
      (category) => category !== "Settings" || canSearchSettings
    );
  }, [canSearchSettings]);

  const filters = useMemo(
    (): CommandPaletteFilter[] => ["All", ...accessibleCategories],
    [accessibleCategories]
  );

  // If Settings was preselected but the user isn't an admin, fall back to All.
  const effectiveSelectedCategory: CommandPaletteFilter = filters.includes(
    selectedCategory
  )
    ? selectedCategory
    : "All";

  const categoriesWithResults = useMemo(
    () =>
      getAvailableCategories({
        conversations,
        pods,
        agents,
        members,
        skills,
        settings,
      }),
    [conversations, pods, agents, members, skills, settings]
  );

  const hasSearchResults = categoriesWithResults.length > 0;

  // While typing, keep every accessible chip visible but disable those with no
  // hits (except the selected chip, which stays clickable).
  const disabledFilters = useMemo((): CommandPaletteFilter[] => {
    if (isEmptyQuery) {
      return [];
    }
    return filters.filter((filter) => {
      if (filter === effectiveSelectedCategory) {
        return false;
      }
      if (filter === "All") {
        return !hasSearchResults;
      }
      return !categoriesWithResults.includes(filter);
    });
  }, [
    isEmptyQuery,
    filters,
    effectiveSelectedCategory,
    hasSearchResults,
    categoriesWithResults,
  ]);

  const filteredConversations =
    effectiveSelectedCategory === "All" ||
    effectiveSelectedCategory === "Conversations"
      ? conversations
      : [];
  const filteredPods =
    effectiveSelectedCategory === "All" || effectiveSelectedCategory === "Pods"
      ? pods
      : [];
  const filteredAgents =
    effectiveSelectedCategory === "All" ||
    effectiveSelectedCategory === "Agents"
      ? agents
      : [];
  const filteredMembers =
    effectiveSelectedCategory === "All" ||
    effectiveSelectedCategory === "Members"
      ? members
      : [];
  const filteredSkills =
    effectiveSelectedCategory === "All" ||
    effectiveSelectedCategory === "Skills"
      ? skills
      : [];
  const filteredSettings =
    effectiveSelectedCategory === "All" ||
    effectiveSelectedCategory === "Settings"
      ? settings
      : [];

  const searchFlatItems = useMemo(
    () =>
      getFlatItems(
        filteredConversations,
        filteredPods,
        filteredAgents,
        filteredMembers,
        filteredSkills,
        filteredSettings
      ),
    [
      filteredConversations,
      filteredPods,
      filteredAgents,
      filteredMembers,
      filteredSkills,
      filteredSettings,
    ]
  );
  // Empty query + a specific category: no recent list, only a CTA.
  const flatItems =
    isEmptyQuery && effectiveSelectedCategory === "All"
      ? frequentItems
      : searchFlatItems;
  const showCategoryCta = isEmptyQuery && effectiveSelectedCategory !== "All";
  const showFrequentItems =
    isEmptyQuery &&
    effectiveSelectedCategory === "All" &&
    frequentItems.length > 0;
  const showDefaultEmptyHint =
    isEmptyQuery &&
    effectiveSelectedCategory === "All" &&
    frequentItems.length === 0;

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
  const settingsOffset = skillsOffset + filteredSkills.length;

  const defaultEmptyHint = canSearchSettings
    ? t`Type to search conversations, pods, agents, members, skills, and settings. Items you open will show up here for quick access.`
    : t`Type to search conversations, pods, agents, members, and skills. Items you open will show up here for quick access.`;

  const categoryCtaHint = (() => {
    switch (effectiveSelectedCategory) {
      case "Conversations":
        return t`Type to search conversations.`;
      case "Pods":
        return t`Type to search pods.`;
      case "Agents":
        return t`Type to search agents.`;
      case "Members":
        return t`Type to search members.`;
      case "Skills":
        return t`Type to search skills.`;
      case "Settings":
        return t`Type to search settings.`;
      case "All":
        return defaultEmptyHint;
    }
  })();

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
        <div className="pt-2">
          <FilterChips
            filters={filters}
            selectedFilter={effectiveSelectedCategory}
            disabledFilters={disabledFilters}
            variant="secondary"
            onFilterClick={(filter) => {
              onSelectedCategoryChange(filter);
              onSelectedIndexChange(0);
            }}
          />
        </div>
      </div>
      <div className="flex max-h-125 flex-col gap-2 overflow-y-auto p-1.5">
        {showDefaultEmptyHint && (
          <ItemEmptyState>{defaultEmptyHint}</ItemEmptyState>
        )}

        {showCategoryCta && <ItemEmptyState>{categoryCtaHint}</ItemEmptyState>}

        {showFrequentItems && (
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

        {!isEmptyQuery && filteredSettings.length > 0 && (
          <div>
            <ItemTitle>Settings</ItemTitle>
            {filteredSettings.map((setting, i) => {
              const globalIndex = settingsOffset + i;
              return (
                <ItemRow
                  key={`${setting.pageHref}#${setting.sectionId}:${setting.label}`}
                  ref={(el) => {
                    itemRefs.current[globalIndex] = el;
                  }}
                  isSelected={selectedIndex === globalIndex}
                  onClick={() => onItemSelect({ kind: "setting", setting })}
                  onMouseMove={() => onSelectedIndexChange(globalIndex)}
                >
                  <CommandPaletteItemContent
                    item={{ kind: "setting", setting }}
                  />
                </ItemRow>
              );
            })}
            {hasMoreSettings && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                More settings available. Type to filter.
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
