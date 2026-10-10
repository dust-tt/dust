import {
  Avatar,
  BarChart12,
  Button,
  Calendar,
  CheckVerified01,
  ChevronLeft,
  ChevronRight,
  Chip,
  cn,
  EmptyCTA,
  File02,
  Folder,
  Globe01,
  Icon,
  Mail01,
  MessageChatCircle,
  MessageCircle01,
  NavigationList,
  NavigationListItem,
  Pin02,
  SearchInput,
  Stars02,
  Table,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Users01,
  XClose,
} from "@dust-tt/sparkle";
import { type ComponentType, useRef, useState } from "react";

import type { Agent } from "../data/types";
import { mockAgents, mockSkills, mockUsers, type Skill } from "../data";
import type { InputBarAttachment } from "./InputBar";
import { InputBar } from "./InputBar";

// Mirrors front's new-conversation screen behind `discovery_homepage`: a home
// band with the composer and a few use cases, and a Discover page below it,
// reached from the button at the bottom of the band.

type CatalogItem = ({ kind: "agent" } & Agent) | ({ kind: "skill" } & Skill);

const ALL_ITEMS: CatalogItem[] = [
  ...mockAgents.map((agent) => ({ kind: "agent" as const, ...agent })),
  ...mockSkills.map((skill) => ({ kind: "skill" as const, ...skill })),
];

// ── Fake catalog facts ──────────────────────────────────────────────────────
// Everything below is derived from the item id, so a card reads the same on
// every render.

function hashId(id: string): number {
  return id
    .split("")
    .reduce((acc, char, i) => acc + char.charCodeAt(0) * (i + 1), 0);
}

const isDustProvided = (item: CatalogItem) => hashId(item.id) % 3 === 0;
const isFavorite = (item: CatalogItem) => hashId(item.id) % 4 === 1;
const isMine = (item: CatalogItem) => hashId(item.id) % 5 === 2;
const getMessageCount = (item: CatalogItem) => (hashId(item.id) % 4800) + 48;
const getUserCount = (item: CatalogItem) => (hashId(item.id) % 420) + 12;

function getAuthors(item: CatalogItem): string {
  const hash = hashId(item.id);
  const author = mockUsers[hash % mockUsers.length].fullName;
  const others = hash % 3;
  return others === 0
    ? author
    : `${author} and ${others} other${others > 1 ? "s" : ""}`;
}

const byUsage = (a: CatalogItem, b: CatalogItem) =>
  getMessageCount(b) - getMessageCount(a);

// A pod only sees a slice of the catalog, the same slice on every render but a
// different one per pod.
const isInPod = (item: CatalogItem, podName: string) =>
  (hashId(item.id) + hashId(podName)) % 3 === 0;

function getPodItems(podName: string): CatalogItem[] {
  const inPod = ALL_ITEMS.filter((item) => isInPod(item, podName));
  return inPod.length >= 4 ? inPod : ALL_ITEMS.slice(0, 8);
}

// Usage inside the pod, which ranks differently from usage across the
// workspace, so the two Discover sections don't line up.
const getPodMessageCount = (item: CatalogItem, podName: string) =>
  ((hashId(item.id) * 7 + hashId(podName)) % 940) + 12;

const byPodUsage = (podName: string) => (a: CatalogItem, b: CatalogItem) =>
  getPodMessageCount(b, podName) - getPodMessageCount(a, podName);

const FEATURED = ALL_ITEMS.filter((item) => hashId(item.id) % 7 === 0).slice(
  0,
  5
);
const FOR_YOU = [...ALL_ITEMS]
  .sort((a, b) => (hashId(a.id) % 31) - (hashId(b.id) % 31))
  .slice(0, 4);
const TRENDING = [...ALL_ITEMS].sort(byUsage).slice(0, 4);

// ── Use cases ───────────────────────────────────────────────────────────────

type UseCase = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

const USE_CASES: UseCase[] = [
  {
    id: "emails",
    label: "Find important emails I haven't replied to",
    icon: Mail01,
  },
  {
    id: "dms",
    label: "Find important DMs I haven't replied to",
    icon: MessageChatCircle,
  },
  {
    id: "news",
    label: "Catch me up on the most important news in my industry",
    icon: Globe01,
  },
  { id: "usage", label: "Show me how my team is using Dust", icon: BarChart12 },
  {
    id: "meeting",
    label: "Get me ready for my next customer meeting",
    icon: Calendar,
  },
  { id: "pod", label: "Create a Pod for my team project", icon: Folder },
  {
    id: "spreadsheet",
    label: "Turn a spreadsheet into an analysis",
    icon: Table,
  },
  {
    id: "document",
    label: "Draft a document from our own knowledge",
    icon: File02,
  },
];

const podUseCases = (podName: string): UseCase[] => [
  {
    id: "pod-catch-up",
    label: `Catch me up on what happened in ${podName} this week`,
    icon: Calendar,
  },
  {
    id: "pod-decisions",
    label: `Summarize the latest decisions in ${podName}`,
    icon: File02,
  },
  {
    id: "pod-update",
    label: `Draft an update for the ${podName} team`,
    icon: Mail01,
  },
  {
    id: "pod-work",
    label: `Show me what the ${podName} team is working on`,
    icon: BarChart12,
  },
  {
    id: "pod-files",
    label: `Find the documents shared in ${podName}`,
    icon: Folder,
  },
];

const VISIBLE_USE_CASES = 4;

function HomepageUseCases({ podName }: { podName?: string }) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const useCases = podName ? podUseCases(podName) : USE_CASES;
  const visible = useCases
    .filter(({ id }) => !dismissedIds.has(id))
    .slice(0, VISIBLE_USE_CASES);

  return (
    <ul className="mt-4 flex w-full max-w-4xl flex-col gap-1">
      {visible.map((useCase) => (
        <li
          key={useCase.id}
          className="group flex h-12 items-center gap-1 rounded-xl pr-2 transition-colors duration-150 hover:bg-hover"
        >
          <button
            type="button"
            className="flex h-full min-w-0 flex-1 items-center gap-3 px-2 text-left"
          >
            <Avatar
              size="sm"
              icon={useCase.icon}
              backgroundColor="bg-muted-background"
              iconColor="text-foreground"
            />
            <span className="copy-base truncate text-foreground">
              {useCase.label}
            </span>
          </button>
          <Button
            variant="ghost-secondary"
            size="xs"
            icon={XClose}
            tooltip="Hide this suggestion"
            aria-label="Hide this suggestion"
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            onClick={() =>
              setDismissedIds((current) => new Set(current).add(useCase.id))
            }
          />
        </li>
      ))}
    </ul>
  );
}

function DiscoverButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group inline-flex h-9 items-center gap-2 rounded-full pl-3 pr-4",
        "border border-border bg-background text-foreground",
        "shadow-[0px_1px_1px_-0.5px_rgba(0,0,0,0.05),0px_2px_4px_-2px_rgba(0,0,0,0.06)]",
        "transition-[box-shadow,translate] duration-150 ease-emphasized hover:-translate-y-px"
      )}
    >
      <span className="text-muted-foreground transition-colors group-hover:text-highlight-500">
        <Icon visual={Stars02} size="xs" />
      </span>
      <span className="heading-sm">{label}</span>
    </button>
  );
}

// ── Catalog pieces ──────────────────────────────────────────────────────────

function ItemAvatar({ item, size }: { item: CatalogItem; size: "md" | "lg" }) {
  return item.kind === "agent" ? (
    <Avatar
      size={size}
      emoji={item.emoji}
      backgroundColor={item.backgroundColor}
    />
  ) : (
    <Avatar
      size={size}
      icon={item.icon}
      backgroundColor="bg-highlight-50"
      iconColor="text-highlight-700"
    />
  );
}

function ItemAuthor({ item }: { item: CatalogItem }) {
  if (isDustProvided(item)) {
    return (
      <span className="flex shrink-0 items-center gap-1 text-highlight">
        <Icon visual={CheckVerified01} size="xs" />
        Dust
      </span>
    );
  }
  return <span className="truncate text-foreground">{getAuthors(item)}</span>;
}

function CatalogRow({
  item,
  podName,
}: {
  item: CatalogItem;
  /** When set, the message count is the one for that pod. */
  podName?: string;
}) {
  return (
    <div className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-separator py-4 last:border-b-0">
      <div className="row-span-2 shrink-0">
        <ItemAvatar item={item} size="lg" />
      </div>
      <div className="flex min-w-0 items-center gap-2 self-end">
        <span className="heading-base truncate text-foreground">
          {item.name}
        </span>
        <Chip
          size="xs"
          label={item.kind === "agent" ? `@${item.name}` : `/${item.name}`}
          className="shrink-0 font-mono"
        />
      </div>
      <div className="row-span-2 flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          icon={Pin02}
          tooltip="Pin to Featured"
          aria-label={`Pin ${item.name} to Featured`}
          className="opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-hover:opacity-100"
        />
        <Button
          variant="outline"
          size="sm"
          label={item.kind === "agent" ? "Chat" : "Use"}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1 self-start">
        <div className="copy-sm flex h-5 items-center gap-4">
          <ItemAuthor item={item} />
          <span className="flex items-center gap-1 text-muted-foreground">
            <Icon visual={MessageCircle01} size="xs" />
            {(podName
              ? getPodMessageCount(item, podName)
              : getMessageCount(item)
            ).toLocaleString()}
          </span>
          {item.kind === "agent" && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Icon visual={Users01} size="xs" />
              {getUserCount(item).toLocaleString()}
            </span>
          )}
        </div>
        <p className="copy-sm line-clamp-2 text-muted-foreground">
          {item.description}
        </p>
      </div>
    </div>
  );
}

function FeaturedCard({ item }: { item: CatalogItem }) {
  return (
    <button
      type="button"
      className="flex h-56 w-full flex-col overflow-hidden rounded-2xl border border-border bg-background text-left transition-transform duration-200 ease-emphasized hover:-translate-y-0.5"
    >
      <div className="relative flex h-32 w-full shrink-0 items-center justify-center overflow-hidden bg-muted-background">
        {item.kind === "agent" ? (
          <span
            aria-hidden
            className={cn(
              "absolute inset-0 scale-110 opacity-40 blur-xl",
              item.backgroundColor
            )}
          />
        ) : (
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center text-highlight-300"
          >
            <item.icon className="h-full w-full scale-150 opacity-30 blur-xl" />
          </span>
        )}
        <span className="relative">
          <ItemAvatar item={item} size="md" />
        </span>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 px-4 py-3">
        <span className="copy-sm flex min-w-0 items-center gap-2">
          <span className="heading-base truncate text-foreground">
            {item.name}
          </span>
          <ItemAuthor item={item} />
        </span>
        <span className="copy-sm line-clamp-2 text-muted-foreground">
          {item.description}
        </span>
      </div>
    </button>
  );
}

function FeaturedCarousel({
  title,
  items,
}: {
  title: string;
  items: CatalogItem[];
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const scrollByPage = (direction: -1 | 1) => {
    const scroller = scrollerRef.current;
    scroller?.scrollBy({
      left: direction * scroller.clientWidth,
      behavior: "smooth",
    });
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="heading-lg text-foreground">{title}</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="xs"
            icon={ChevronLeft}
            aria-label="Previous featured"
            onClick={() => scrollByPage(-1)}
          />
          <Button
            variant="ghost"
            size="xs"
            icon={ChevronRight}
            aria-label="Next featured"
            onClick={() => scrollByPage(1)}
          />
        </div>
      </div>
      <div
        ref={scrollerRef}
        className="scrollbar-hide flex snap-x snap-mandatory gap-4 overflow-x-auto"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="w-full shrink-0 snap-start md:w-[calc((100%-2rem)/3)]"
          >
            <FeaturedCard item={item} />
          </div>
        ))}
      </div>
    </section>
  );
}

function DiscoverSection({
  title,
  items,
  podName,
  onFindMore,
}: {
  title: string;
  items: CatalogItem[];
  podName?: string;
  onFindMore: () => void;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="heading-lg text-foreground">{title}</h2>
        <Button
          variant="ghost"
          size="xs"
          label="Find more"
          onClick={onFindMore}
        />
      </div>
      <div className="flex flex-col">
        {items.map((item) => (
          <CatalogRow key={item.id} item={item} podName={podName} />
        ))}
      </div>
    </section>
  );
}

// ── Agents & Skills tab ─────────────────────────────────────────────────────

type CatalogView = "pod" | "favorites" | "popular" | "all" | "mine";
type CatalogKind = "all" | CatalogItem["kind"];

const CATALOG_VIEWS: { id: CatalogView; label: string }[] = [
  { id: "favorites", label: "Favorites" },
  { id: "popular", label: "Most Popular" },
  { id: "all", label: "All" },
  { id: "mine", label: "Mine" },
];

const CATALOG_KINDS: { id: CatalogKind; label: string }[] = [
  { id: "all", label: "Agents & Skills" },
  { id: "agent", label: "Agents" },
  { id: "skill", label: "Skills" },
];

function DiscoverCatalog({ podName }: { podName?: string }) {
  // In a pod, the pod's own agents and skills come first and lead the list.
  const defaultView: CatalogView = podName ? "pod" : "all";
  const [view, setView] = useState<CatalogView>(defaultView);
  const [kind, setKind] = useState<CatalogKind>("all");
  const [search, setSearch] = useState("");

  const views = podName
    ? [{ id: "pod" as const, label: `In ${podName}` }, ...CATALOG_VIEWS]
    : CATALOG_VIEWS;

  const needle = search.trim().toLowerCase().replace(/^[@/]/, "");
  const items = ALL_ITEMS.filter(
    (item) =>
      (kind === "all" || item.kind === kind) &&
      (view !== "favorites" || isFavorite(item)) &&
      (view !== "mine" || isMine(item)) &&
      (view !== "pod" || !podName || isInPod(item, podName)) &&
      (!needle || item.name.toLowerCase().includes(needle))
  ).sort((a, b) =>
    view === "popular" ? byUsage(a, b) : a.name.localeCompare(b.name)
  );

  const hasActiveFilters =
    view !== defaultView || kind !== "all" || needle !== "";

  return (
    <div className="flex flex-col gap-8">
      <SearchInput
        name="discover-search"
        placeholder="Search for agents or skills"
        value={search}
        onChange={setSearch}
      />
      <div className="grid grid-cols-1 gap-10 md:grid-cols-[12rem_1fr]">
        <nav aria-label="Filter" className="flex flex-col gap-6 self-start">
          <NavigationList>
            {views.map((v) => (
              <NavigationListItem
                key={v.id}
                label={v.label}
                selected={view === v.id}
                onClick={() => setView(v.id)}
              />
            ))}
          </NavigationList>
          <NavigationList>
            {CATALOG_KINDS.map((k) => (
              <NavigationListItem
                key={k.id}
                label={k.label}
                selected={kind === k.id}
                onClick={() => setKind(k.id)}
              />
            ))}
          </NavigationList>
        </nav>
        <section className="flex min-w-0 flex-col">
          {items.length === 0 ? (
            <EmptyCTA
              title="No agents or skills found"
              message="Try another search or different filters."
              action={
                hasActiveFilters && (
                  <Button
                    variant="outline"
                    size="sm"
                    label="Clear filters"
                    onClick={() => {
                      setView(defaultView);
                      setKind("all");
                      setSearch("");
                    }}
                  />
                )
              }
            />
          ) : (
            items.map((item) => (
              <CatalogRow
                key={item.id}
                item={item}
                podName={view === "pod" ? podName : undefined}
              />
            ))
          )}
        </section>
      </div>
    </div>
  );
}

// ── Screen ──────────────────────────────────────────────────────────────────

const DISCOVER_TABS = ["Discover", "Agents & Skills"] as const;
type DiscoverTab = (typeof DISCOVER_TABS)[number];

interface NewConversationProps {
  greeting: string;
  /** Inside a pod, Discover leads with what that pod uses. */
  podName?: string;
  /** What the conversation starts with in hand, e.g. a file it was started on
   *  from the Hub. */
  attachments?: InputBarAttachment[];
}

export function NewConversation({
  greeting,
  podName,
  attachments,
}: NewConversationProps) {
  const [tab, setTab] = useState<DiscoverTab>("Discover");
  const discoverRef = useRef<HTMLDivElement>(null);

  const podItems = podName ? getPodItems(podName) : [];
  const featured = podName ? podItems.slice(0, 5) : FEATURED;
  const podTrending = podName
    ? [...podItems].sort(byPodUsage(podName)).slice(0, 4)
    : [];
  const sections: {
    title: string;
    items: CatalogItem[];
    podName?: string;
  }[] = podName
    ? [
        { title: `Trending in ${podName}`, items: podTrending, podName },
        {
          // What the rest of the workspace uses, minus what the pod already has.
          title: "Popular in the workspace",
          items: [...ALL_ITEMS]
            .filter((item) => !podTrending.includes(item))
            .sort(byUsage)
            .slice(0, 4),
        },
      ]
    : [
        { title: "Agent & Skill for you", items: FOR_YOU },
        { title: "Trending in the workspace", items: TRENDING },
      ];

  const goToDiscover = () =>
    discoverRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const findMore = () => setTab("Agents & Skills");

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-background">
      <div className="flex h-full min-h-[560px] w-full shrink-0 flex-col items-center px-4">
        <div className="flex w-full max-w-4xl basis-[36%] flex-col items-center justify-end gap-4 pb-8 pt-4">
          <h3 className="heading-3xl font-medium text-foreground">
            {greeting}
          </h3>
        </div>
        <InputBar
          placeholder="What are we working on?"
          className="w-full max-w-4xl"
          isFloating={false}
          attachments={attachments}
        />
        <HomepageUseCases podName={podName} />
        <div className="flex flex-1 items-end justify-center pb-6 pt-4">
          <DiscoverButton
            label={
              podName
                ? `Discover Skills and agents in ${podName}`
                : "Discover Skills and agents"
            }
            onClick={goToDiscover}
          />
        </div>
      </div>

      <div
        ref={discoverRef}
        className="flex min-h-full w-full shrink-0 flex-col items-center px-4 pb-16"
      >
        <Tabs value={tab} className="flex w-full max-w-4xl flex-col gap-8">
          <div className="sticky top-0 z-30 flex flex-col gap-6 bg-background pt-10">
            <h1 className="heading-2xl text-foreground">
              {podName ? `Discover in ${podName}` : "Discover"}
            </h1>
            <TabsList>
              {DISCOVER_TABS.map((t) => (
                <TabsTrigger
                  key={t}
                  value={t}
                  label={t}
                  onClick={() => setTab(t)}
                />
              ))}
            </TabsList>
          </div>
          <TabsContent value="Discover" className="flex flex-col gap-12">
            <FeaturedCarousel
              title={podName ? `Featured in ${podName}` : "Featured"}
              items={featured}
            />
            {sections.map((section) => (
              <DiscoverSection
                key={section.title}
                title={section.title}
                items={section.items}
                podName={section.podName}
                onFindMore={findMore}
              />
            ))}
          </TabsContent>
          <TabsContent value="Agents & Skills">
            <DiscoverCatalog podName={podName} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
