import {
  Avatar,
  Button,
  Card,
  Chip,
  Cube01,
  CubeOutline,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  File01,
  FilterLines,
  Globe01,
  Image01,
  MessageChatSquare,
  Plus,
  SearchInput,
  Settings01,
  Table,
  Terminal,
  Tooltip,
  Translate01,
  User03,
} from "@dust-tt/sparkle";
import { type ComponentType, useEffect, useRef, useState } from "react";

import { mockAgents, mockUsers } from "../data";
import type { Agent, Space } from "../data/types";
import { ConversationTopSection } from "./ConversationTopSection";
import type { FreeButtonSwitchOption } from "./FreeButtonSwitch";
import { FreeButtonSwitch } from "./FreeButtonSwitch";
import { InputBar } from "./InputBar";

// "browse" and "category" are only ids of dropdown options in the switch; they
// are never active tab values.
export type WelcomeAgentTab =
  | "favorites"
  | "discover"
  | "my_agents"
  | "browse"
  | "category";

export type AgentSort =
  | "popularity"
  | "usage"
  | "alpha_asc"
  | "alpha_desc"
  | "custom";

const AGENT_SORT_LABELS: Record<AgentSort, string> = {
  popularity: "By popularity",
  usage: "By usage",
  alpha_asc: "Alphabetical (A→Z)",
  alpha_desc: "Alphabetical (Z→A)",
  custom: "Custom",
};

export type AgentType = "all" | "agents" | "skills";

const AGENT_TYPE_LABELS: Record<AgentType, string> = {
  all: "All",
  agents: "Agents",
  skills: "Skills",
};

// Order options available per tab. Favorites supports a manual "custom" order
// (and no popularity/usage); the other tabs expose popularity/usage instead.
const ORDER_OPTIONS_BY_TAB: Record<
  "favorites" | "discover" | "my_agents",
  AgentSort[]
> = {
  favorites: ["alpha_asc", "alpha_desc", "custom"],
  discover: ["alpha_asc", "alpha_desc", "popularity", "usage"],
  my_agents: ["alpha_asc", "alpha_desc", "popularity", "usage"],
};

const DEFAULT_SORT_BY_TAB: Record<
  "favorites" | "discover" | "my_agents",
  AgentSort
> = {
  favorites: "custom",
  discover: "popularity",
  my_agents: "popularity",
};

function getOrderOptionsForTab(tab: WelcomeAgentTab): AgentSort[] {
  if (tab === "favorites" || tab === "discover" || tab === "my_agents") {
    return ORDER_OPTIONS_BY_TAB[tab];
  }
  return ORDER_OPTIONS_BY_TAB.discover;
}

function getDefaultSortForTab(tab: WelcomeAgentTab): AgentSort {
  if (tab === "favorites" || tab === "discover" || tab === "my_agents") {
    return DEFAULT_SORT_BY_TAB[tab];
  }
  return DEFAULT_SORT_BY_TAB.discover;
}

// Skills live alongside agents in the browser. A skill is rendered with a
// highlight-tinted avatar (highlight-50 background, highlight-700 icon).
type Skill = {
  id: string;
  name: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
};

const mockSkills: Skill[] = [
  {
    id: "skill-web-search",
    name: "Web search",
    description: "Search the web for up-to-date information.",
    icon: Globe01,
  },
  {
    id: "skill-summarize",
    name: "Summarize",
    description: "Condense long documents into key takeaways.",
    icon: File01,
  },
  {
    id: "skill-image",
    name: "Image generation",
    description: "Create images from a text prompt.",
    icon: Image01,
  },
  {
    id: "skill-code",
    name: "Code interpreter",
    description: "Run code to analyze data and files.",
    icon: Terminal,
  },
  {
    id: "skill-tables",
    name: "Query tables",
    description: "Ask questions over structured tables.",
    icon: Table,
  },
  {
    id: "skill-translate",
    name: "Translate",
    description: "Translate text across languages.",
    icon: Translate01,
  },
];

type BrowserItem = ({ kind: "agent" } & Agent) | ({ kind: "skill" } & Skill);

// Fake themed categories. These act as the tags applied to each skill / agent:
// an item "has" a category when its id is listed here. Used both for the
// Discover groupings and for the Category filter in the FreeButtonSwitch.
const DISCOVER_CATEGORY_DEFS: {
  id: string;
  title: string;
  itemIds: string[];
}[] = [
  {
    id: "eng-data",
    title: "Engineering & Data",
    itemIds: [
      "agent-14",
      "agent-13",
      "skill-code",
      "skill-tables",
      "agent-16",
      "agent-6",
    ],
  },
  {
    id: "marketing",
    title: "Marketing & Content",
    itemIds: ["agent-15", "agent-9", "skill-image", "agent-7", "agent-4"],
  },
  {
    id: "operations",
    title: "Operations",
    itemIds: ["agent-3", "agent-17", "skill-summarize", "agent-12", "agent-11"],
  },
  {
    id: "people",
    title: "People & Support",
    itemIds: [
      "agent-18",
      "skill-translate",
      "agent-1",
      "skill-web-search",
      "agent-2",
    ],
  },
];

// Flat list of categories for the Category filter section.
export const CATEGORIES = DISCOVER_CATEGORY_DEFS.map(({ id, title }) => ({
  id,
  title,
}));

function itemMatchesCategory(itemId: string, categoryId: string): boolean {
  const def = DISCOVER_CATEGORY_DEFS.find((d) => d.id === categoryId);
  return def ? def.itemIds.includes(itemId) : false;
}

function getCategoryTitle(categoryId: string): string {
  return CATEGORIES.find((c) => c.id === categoryId)?.title ?? "Category";
}

// The tab switch + Create / Manage buttons. Rendered both in-content and,
// when scrolled out of view, in the panel topbar.
export function NewConversationActionBar({
  value,
  onValueChange,
  agentSort,
  onAgentSortChange,
  agentType,
  onAgentTypeChange,
  agentCategory,
  onAgentCategoryChange,
}: {
  value: WelcomeAgentTab;
  onValueChange: (v: WelcomeAgentTab) => void;
  agentSort: AgentSort;
  onAgentSortChange: (sort: AgentSort) => void;
  agentType: AgentType;
  onAgentTypeChange: (type: AgentType) => void;
  agentCategory: string | null;
  onAgentCategoryChange: (category: string | null) => void;
}) {
  const categoryLabel =
    agentCategory != null ? getCategoryTitle(agentCategory) : "All categories";

  // Category control, pinned at the end right before the sort/filter button.
  // Only shown while the Discover tab is active; it animates in on mount.
  const categoryOption: FreeButtonSwitchOption<WelcomeAgentTab> = {
    value: "category",
    pinned: "end",
    variant: "ghost-secondary",
    defaultLabel: categoryLabel,
    tooltip: "Filter by category",
    className: "s-animate-in s-fade-in-0 s-slide-in-from-left-2 s-duration-200",
    dropdownSections: [
      {
        label: "Category",
        kind: "radio",
        value: agentCategory ?? "all",
        onValueChange: (v) => onAgentCategoryChange(v === "all" ? null : v),
        items: [
          { value: "all", label: "All categories" },
          ...CATEGORIES.map((c) => ({ value: c.id, label: c.title })),
        ],
      },
    ],
  };

  return (
    <div className="s-flex s-w-full s-items-center s-gap-2">
      <FreeButtonSwitch<WelcomeAgentTab>
        value={value}
        onValueChange={onValueChange}
        options={[
          { value: "favorites", label: "Favorites" },
          { value: "discover", label: "Discover" },
          { value: "my_agents", label: "Mine" },
          ...(value === "discover" ? [categoryOption] : []),
          {
            value: "browse",
            pinned: "end",
            icon: FilterLines,
            tooltip: "Type and order",
            dropdownSections: [
              {
                label: "Type",
                kind: "radio",
                value: agentType,
                onValueChange: (v) => onAgentTypeChange(v as AgentType),
                items: [
                  { value: "all", label: AGENT_TYPE_LABELS.all },
                  { value: "agents", label: AGENT_TYPE_LABELS.agents },
                  { value: "skills", label: AGENT_TYPE_LABELS.skills },
                ],
              },
              {
                label: "Order",
                kind: "radio",
                value: agentSort,
                onValueChange: (v) => onAgentSortChange(v as AgentSort),
                items: getOrderOptionsForTab(value).map((sort) => ({
                  value: sort,
                  label: AGENT_SORT_LABELS[sort],
                })),
              },
            ],
          },
        ]}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="highlight"
            size="sm"
            isSelect
            label="Create and Manage"
            tooltip="Create and manage agents and skills"
            className="s-ml-auto"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel label="Agents" />
          <DropdownMenuItem icon={Plus} label="Create agent" />
          <DropdownMenuItem icon={Settings01} label="Manage agents" />
          <DropdownMenuSeparator />
          <DropdownMenuLabel label="Skills" />
          <DropdownMenuItem icon={Plus} label="Create skill" />
          <DropdownMenuItem icon={Settings01} label="Manage skills" />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

interface NewConversationProps {
  greeting: string;
  spaces: Space[];
  agentTab: WelcomeAgentTab;
  onAgentTabChange: (tab: WelcomeAgentTab) => void;
  agentSort: AgentSort;
  onAgentSortChange: (sort: AgentSort) => void;
  agentType: AgentType;
  onAgentTypeChange: (type: AgentType) => void;
  agentCategory: string | null;
  onAgentCategoryChange: (category: string | null) => void;
  onToolbarPinnedChange: (pinned: boolean) => void;
}

export function NewConversation({
  greeting,
  spaces,
  agentTab,
  onAgentTabChange,
  agentSort,
  onAgentSortChange,
  agentType,
  onAgentTypeChange,
  agentCategory,
  onAgentCategoryChange,
  onToolbarPinnedChange,
}: NewConversationProps) {
  // Pod targeted by the new conversation (null = My Pod).
  const [newConversationPodId, setNewConversationPodId] = useState<
    string | null
  >(null);
  const [agentSearch, setAgentSearch] = useState("");
  // The tab whose content is currently rendered. It lags behind `agentTab`
  // while we smooth-scroll the (taller) current content to the top, so the
  // scroll animation is visible even when switching to a shorter tab.
  const [displayTab, setDisplayTab] = useState<WelcomeAgentTab>(agentTab);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Tell the parent when the in-content action bar scrolls out of the top of
  // the viewport, so it can mirror the bar in the panel topbar.
  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) {
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => onToolbarPinnedChange(!entry.isIntersecting),
      { root, threshold: 0 }
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [onToolbarPinnedChange]);

  // Reset scroll to top when switching tabs (the tab heights differ, so the
  // kept scroll position would otherwise feel disorienting). When scrolled
  // down (and motion isn't reduced), keep the current content mounted, smooth
  // scroll it to the top, then swap in the new tab once we arrive. Otherwise
  // swap instantly.
  useEffect(() => {
    if (agentTab === displayTab) {
      return;
    }
    const root = scrollRef.current;
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (root && !prefersReduced && root.scrollTop > 200) {
      root.scrollTo({ top: 0, behavior: "smooth" });
      const timer = window.setTimeout(() => setDisplayTab(agentTab), 350);
      return () => window.clearTimeout(timer);
    }
    root?.scrollTo({ top: 0, behavior: "auto" });
    setDisplayTab(agentTab);
  }, [agentTab, displayTab]);

  // Keep the active order valid for the current tab (e.g. "custom" is only
  // offered on Favorites, popularity/usage only on the other tabs).
  useEffect(() => {
    if (!getOrderOptionsForTab(agentTab).includes(agentSort)) {
      onAgentSortChange(getDefaultSortForTab(agentTab));
    }
  }, [agentTab, agentSort, onAgentSortChange]);

  const selectedNewPod =
    newConversationPodId != null
      ? spaces.find((s) => s.id === newConversationPodId)
      : undefined;
  const newPodLabel = selectedNewPod ? selectedNewPod.name : "My Pod";
  const newPodIcon = selectedNewPod
    ? selectedNewPod.id.charCodeAt(selectedNewPod.id.length - 1) % 2 === 0
      ? Cube01
      : CubeOutline
    : User03;

  const podRadioGroup = (
    <DropdownMenuRadioGroup
      value={newConversationPodId ?? "my-pod"}
      onValueChange={(v) => setNewConversationPodId(v === "my-pod" ? null : v)}
    >
      <DropdownMenuRadioItem value="my-pod" label="My Pod" icon={User03} />
      {spaces.map((space) => {
        const isRestricted = space.id.charCodeAt(space.id.length - 1) % 2 === 0;
        return (
          <DropdownMenuRadioItem
            key={space.id}
            value={space.id}
            label={space.name}
            icon={isRestricted ? Cube01 : CubeOutline}
          />
        );
      })}
    </DropdownMenuRadioGroup>
  );

  const itemHash = (id: string) =>
    id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const recencyScore = (id: string) =>
    id
      .split("")
      .reduce((acc, char, i) => acc + char.charCodeAt(0) * (i + 1), 0);

  const allItems: BrowserItem[] = [
    ...mockAgents.map((a) => ({ kind: "agent" as const, ...a })),
    ...mockSkills.map((s) => ({ kind: "skill" as const, ...s })),
  ];

  const itemsByTab = {
    favorites: allItems.filter((i) => itemHash(i.id) % 3 === 0),
    discover: allItems,
    my_agents: allItems.filter((i) => itemHash(i.id) % 2 === 0),
  } as const;

  const query = agentSearch.trim().toLowerCase();
  const matchesQuery = (i: BrowserItem) =>
    !query ||
    i.name.toLowerCase().includes(query) ||
    i.description.toLowerCase().includes(query);

  const matchesType = (i: BrowserItem) =>
    agentType === "all" ||
    (agentType === "agents" && i.kind === "agent") ||
    (agentType === "skills" && i.kind === "skill");

  const usageMessages = (id: string) => (itemHash(id) % 4800) + 48;

  const compareItems = (a: BrowserItem, b: BrowserItem) => {
    if (agentSort === "alpha_asc") {
      return a.name.localeCompare(b.name);
    }
    if (agentSort === "alpha_desc") {
      return b.name.localeCompare(a.name);
    }
    if (agentSort === "usage") {
      return usageMessages(b.id) - usageMessages(a.id);
    }
    if (agentSort === "custom") {
      // Keep the underlying insertion order.
      return 0;
    }
    return itemHash(b.id) - itemHash(a.id);
  };

  // Flat, sorted list for the Favorites / Mine tabs.
  const displayedItems =
    displayTab === "favorites" || displayTab === "my_agents"
      ? [...itemsByTab[displayTab]]
          .filter(matchesType)
          .filter(matchesQuery)
          .sort(compareItems)
      : [];

  // Active category on Discover: a flat, filtered, ordered list.
  const activeCategoryId = displayTab === "discover" ? agentCategory : null;
  const categoryItems = activeCategoryId
    ? allItems
        .filter((i) => itemMatchesCategory(i.id, activeCategoryId))
        .filter(matchesType)
        .filter(matchesQuery)
        .sort(compareItems)
    : [];

  // Categorized list for the Discover tab (search filtered).
  const mostPopular = [...allItems]
    .sort((a, b) => itemHash(b.id) - itemHash(a.id))
    .slice(0, 6);
  const newItems = [...allItems]
    .sort((a, b) => recencyScore(b.id) - recencyScore(a.id))
    .slice(0, 6);
  const forYouItems = [...allItems]
    .sort((a, b) => (recencyScore(b.id) % 50) - (recencyScore(a.id) % 50))
    .slice(0, 6);
  const findItem = (id: string) => allItems.find((i) => i.id === id);
  const discoverCategories = [
    { title: "For you", items: forYouItems },
    { title: "Top 9", items: mostPopular },
    { title: "New skills and agents", items: newItems },
    ...DISCOVER_CATEGORY_DEFS.map((def) => ({
      title: def.title,
      items: def.itemIds
        .map(findItem)
        .filter((i): i is BrowserItem => i != null),
    })),
  ]
    .map((category) => ({
      ...category,
      items: category.items
        .filter(matchesType)
        .filter(matchesQuery)
        .sort(compareItems),
    }))
    .filter((category) => category.items.length > 0);

  const getItemUsageStats = (id: string) => {
    const hash = itemHash(id);
    const users = (hash % 420) + 12;
    const messages = (hash % 4800) + 48;
    return { users, messages };
  };

  const getEditorNameForItem = (id: string) =>
    mockUsers[itemHash(id) % mockUsers.length].fullName;

  const renderItemCard = (item: BrowserItem, showDiscoverStats = false) => {
    const usageStats = showDiscoverStats ? getItemUsageStats(item.id) : null;
    return (
      <Card
        key={item.id}
        size="md"
        variant="primary"
        className={
          usageStats
            ? "s-flex s-h-full s-flex-col s-gap-3"
            : "s-flex s-flex-col s-gap-3"
        }
      >
        <div className="s-flex s-gap-3">
          {item.kind === "skill" ? (
            <Avatar
              size="sm"
              icon={item.icon}
              backgroundColor="s-bg-highlight-50"
              iconColor="s-text-highlight-700"
            />
          ) : (
            <Avatar
              size="sm"
              emoji={item.emoji}
              backgroundColor={item.backgroundColor}
            />
          )}
          <div className="s-flex s-min-w-0 s-flex-col s-gap-0.5">
            <span className="s-heading-base s-truncate">{item.name}</span>
            <span className="s-line-clamp-1 s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
              by: {getEditorNameForItem(item.id)}
            </span>
          </div>
        </div>
        <p
          className={
            usageStats
              ? "s-line-clamp-2 s-min-h-0 s-flex-1 s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night"
              : "s-line-clamp-2 s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night"
          }
        >
          {item.description}
        </p>
        {usageStats && (
          <div className="s-flex s-items-center s-gap-2">
            <Tooltip
              tooltipTriggerAsChild
              trigger={
                <span className="s-inline-flex">
                  <Chip
                    size="xs"
                    color="warning"
                    icon={User03}
                    label={String(usageStats.users)}
                  />
                </span>
              }
              label={`Used by ${usageStats.users} members on the last 30 days`}
            />
            <Tooltip
              tooltipTriggerAsChild
              trigger={
                <span className="s-inline-flex">
                  <Chip
                    size="xs"
                    color="warning"
                    icon={MessageChatSquare}
                    label={String(usageStats.messages)}
                  />
                </span>
              }
              label={`Used in ${usageStats.messages} messages on the last 30 days`}
            />
          </div>
        )}
      </Card>
    );
  };

  return (
    <div
      ref={scrollRef}
      className="s-flex s-h-full s-w-full s-flex-col s-overflow-y-auto s-bg-background dark:s-bg-background-night"
    >
      <ConversationTopSection>
        <div className="s-heading-2xl s-text-foreground dark:s-text-foreground-night">
          {greeting}
        </div>
        <InputBar
          placeholder="Ask a question"
          beforeSendButton={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost-secondary"
                  size="xs"
                  icon={newPodIcon}
                  label={`in ${newPodLabel}`}
                  tooltip={`Create conversation in ${newPodLabel}`}
                  className="s-max-w-[180px]"
                  isSelect
                  isRounded
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {podRadioGroup}
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
      </ConversationTopSection>
      {/* Bottom portion: grows with its content; the page scrolls as a whole. */}
      <div className="s-flex s-flex-none s-justify-center s-px-4 s-pb-8">
        <div className="s-flex s-w-full s-max-w-4xl s-flex-col s-gap-3">
          <div className="s-mx-auto s-flex s-w-full s-max-w-3xl s-flex-col s-gap-3 s-px-4 s-text-center s-pb-8">
            <div className="s-heading-2xl s-text-foreground dark:s-text-foreground-night">
              Agents & Skills
            </div>
            <SearchInput
              name="new-conversation-agent-search"
              value={agentSearch}
              onChange={setAgentSearch}
              placeholder="Search skills and agents"
              size="md"
              className="s-w-full"
            />
          </div>
          <div ref={sentinelRef} />
          <NewConversationActionBar
            value={agentTab}
            onValueChange={onAgentTabChange}
            agentSort={agentSort}
            onAgentSortChange={onAgentSortChange}
            agentType={agentType}
            onAgentTypeChange={onAgentTypeChange}
            agentCategory={agentCategory}
            onAgentCategoryChange={onAgentCategoryChange}
          />
          {displayTab === "discover" && !activeCategoryId ? (
            <div className="s-flex s-flex-col s-gap-6">
              {discoverCategories.map((category) => (
                <div key={category.title} className="s-flex s-flex-col s-gap-3">
                  <div className="s-heading-lg s-text-foreground dark:s-text-foreground-night">
                    {category.title}
                  </div>
                  <div className="s-grid s-grid-cols-2 s-gap-3 md:s-grid-cols-3">
                    {category.items.map((item) => renderItemCard(item, true))}
                  </div>
                </div>
              ))}
            </div>
          ) : activeCategoryId ? (
            <div className="s-flex s-flex-col s-gap-3">
              <div className="s-heading-lg s-text-foreground dark:s-text-foreground-night">
                {getCategoryTitle(activeCategoryId)}
              </div>
              <div className="s-grid s-grid-cols-2 s-gap-3 md:s-grid-cols-3">
                {categoryItems.map((item) => renderItemCard(item, true))}
              </div>
            </div>
          ) : (
            <div className="s-grid s-grid-cols-2 s-gap-3 md:s-grid-cols-3">
              {displayedItems.map((item) => renderItemCard(item))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
