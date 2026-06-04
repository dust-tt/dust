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
import { FreeButtonSwitch } from "./FreeButtonSwitch";
import { InputBar } from "./InputBar";

// "browse" is only the id of the dropdown option in the switch; it is never an
// active tab value.
export type WelcomeAgentTab =
  | "favorites"
  | "discover"
  | "my_agents"
  | "browse"
  | `cat:${string}`;

export type AgentSort = "popularity" | "usage" | "alphabetical";

const AGENT_SORT_LABELS: Record<AgentSort, string> = {
  popularity: "By popularity",
  usage: "By usage",
  alphabetical: "Alphabetical",
};

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

function getActiveCategoryId(value: WelcomeAgentTab): string | null {
  return value.startsWith("cat:") ? value.slice("cat:".length) : null;
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
}: {
  value: WelcomeAgentTab;
  onValueChange: (v: WelcomeAgentTab) => void;
  agentSort: AgentSort;
  onAgentSortChange: (sort: AgentSort) => void;
}) {
  return (
    <div className="s-flex s-w-full s-items-center s-gap-2">
      <FreeButtonSwitch<WelcomeAgentTab>
        value={value}
        onValueChange={onValueChange}
        options={[
          { value: "favorites", label: "Favorites" },
          { value: "discover", label: "Discover" },
          { value: "my_agents", label: "Mine" },
          {
            value: "browse",
            pinned: "end",
            icon: FilterLines,
            defaultLabel: "Sort & filter",
            tooltip: "Order and categories",
            dropdownSections: [
              {
                label: "Order",
                kind: "radio",
                value: agentSort,
                onValueChange: (v) => onAgentSortChange(v as AgentSort),
                items: [
                  { value: "popularity", label: AGENT_SORT_LABELS.popularity },
                  { value: "usage", label: AGENT_SORT_LABELS.usage },
                  {
                    value: "alphabetical",
                    label: AGENT_SORT_LABELS.alphabetical,
                  },
                ],
              },
              {
                label: "Category",
                kind: "tab",
                items: [
                  { value: "discover", label: "All" },
                  ...CATEGORIES.map((c) => ({
                    value: `cat:${c.id}`,
                    label: c.title,
                  })),
                ],
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
  onToolbarPinnedChange: (pinned: boolean) => void;
}

export function NewConversation({
  greeting,
  spaces,
  agentTab,
  onAgentTabChange,
  agentSort,
  onAgentSortChange,
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

  const usageMessages = (id: string) => (itemHash(id) % 4800) + 48;

  const compareItems = (a: BrowserItem, b: BrowserItem) => {
    if (agentSort === "alphabetical") {
      return a.name.localeCompare(b.name);
    }
    if (agentSort === "usage") {
      return usageMessages(b.id) - usageMessages(a.id);
    }
    return itemHash(b.id) - itemHash(a.id);
  };

  // Flat, sorted list for the Favorites / Mine tabs.
  const displayedItems =
    displayTab === "favorites" || displayTab === "my_agents"
      ? [...itemsByTab[displayTab]].sort(compareItems)
      : [];

  // Active category tab (cat:<id>): a flat, filtered, ordered list.
  const activeCategoryId = getActiveCategoryId(displayTab);
  const categoryItems = activeCategoryId
    ? allItems
        .filter((i) => itemMatchesCategory(i.id, activeCategoryId))
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
      items: category.items.filter(matchesQuery).sort(compareItems),
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
      {/* Top portion: 30% of the height, content vertically centered. */}
      <div className="s-flex s-h-[30%] s-min-h-60 s-flex-none s-items-center s-justify-center s-px-4">
        <div className="s-flex s-w-full s-max-w-4xl s-flex-col s-gap-4">
          <div className="s-heading-2xl s-text-foreground dark:s-text-foreground-night">
            {greeting}
          </div>
          <div className="s-flex s-items-center s-gap-3">
            <div className="s-min-w-0 s-flex-1 s-heading-lg s-text-foreground dark:s-text-foreground-night">
              New conversation
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  isSelect
                  icon={newPodIcon}
                  label={newPodLabel}
                  tooltip="Choose a pod"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuRadioGroup
                  value={newConversationPodId ?? "my-pod"}
                  onValueChange={(v) =>
                    setNewConversationPodId(v === "my-pod" ? null : v)
                  }
                >
                  <DropdownMenuRadioItem
                    value="my-pod"
                    label="My Pod"
                    icon={User03}
                  />
                  {spaces.map((space) => {
                    const isRestricted =
                      space.id.charCodeAt(space.id.length - 1) % 2 === 0;
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
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <InputBar placeholder="Ask a question" />
        </div>
      </div>
      {/* Bottom portion: grows with its content; the page scrolls as a whole. */}
      <div className="s-flex s-flex-none s-justify-center s-px-4 s-pb-8">
        <div className="s-flex s-w-full s-max-w-4xl s-flex-col s-gap-3">
          <div className="s-heading-base s-text-foreground dark:s-text-foreground-night">
            Agents & Skills
          </div>
          <div ref={sentinelRef} />
          <NewConversationActionBar
            value={agentTab}
            onValueChange={onAgentTabChange}
            agentSort={agentSort}
            onAgentSortChange={onAgentSortChange}
          />
          {displayTab === "discover" ? (
            <div className="s-flex s-flex-col s-gap-6 s-pt-1">
              <SearchInput
                name="new-conversation-agent-search"
                value={agentSearch}
                onChange={setAgentSearch}
                placeholder="Search skills and agents"
                className="s-w-full"
              />
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
            <div className="s-flex s-flex-col s-gap-3 s-pt-1">
              <SearchInput
                name="new-conversation-agent-search"
                value={agentSearch}
                onChange={setAgentSearch}
                placeholder="Search skills and agents"
                className="s-w-full"
              />
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
