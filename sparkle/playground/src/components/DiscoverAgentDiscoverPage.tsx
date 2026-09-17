import {
  Avatar,
  Button,
  ChevronRight,
  Chip,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Icon,
  MessageCircle01,
  NavigationList,
  NavigationListItem,
  Pin02,
  PuzzlePiece01,
  Robot,
  SearchInput,
  Users01,
  Tabs,
  TabsList,
  TabsTrigger,
  useSendNotification,
} from "@dust-tt/sparkle";
import { forwardRef, useEffect, useMemo, useState } from "react";

import type { Agent, Skill, User } from "../data";
import {
  asAvatarBackgroundColor,
  ALL_CATALOG_ITEMS,
  CATALOG_CATEGORIES,
  CATALOG_KINDS,
  CATALOG_VIEWS,
  type CatalogCategory,
  type CatalogKind,
  type CatalogView,
  DISCOVER_FEATURED,
  filterCatalog,
  DISCOVER_FOR_YOU,
  DISCOVER_TABS,
  DISCOVER_TRENDING,
  type DiscoverFeatured,
  type DiscoverItem,
  type DiscoverTab,
  formatAuthors,
  formatCompactCount,
  formatCount,
  getAgentAvatarProps,
  getAgentImageUrl,
  getFeaturedId,
  getFeaturedName,
  getDiscoverItemDescription,
  getDiscoverItemHandle,
  getDiscoverItemId,
  getDiscoverItemName,
  SKILL_TILE_BACKGROUND,
  SKILL_TILE_ICON_COLOR,
} from "./discoverAgentData";
import {
  EXIT_DURATION_MS,
  usePrefersReducedMotion,
} from "./discoverAgentMotion";

interface DiscoverAgentDiscoverPageProps {
  onUseAgent: (agent: Agent) => void;
  onUseSkill: (skill: Skill) => void;
}

/**
 * The "page below" the new-conversation home: a catalogue of agents and
 * skills with a featured carousel, a "Trending in the workspace" list and an
 * "Agent & Skill for you" list. Reached by filling the Discover button at the
 * bottom of the home page (or clicking it).
 */
export const DiscoverAgentDiscoverPage = forwardRef<
  HTMLDivElement,
  DiscoverAgentDiscoverPageProps
>(function DiscoverAgentDiscoverPage({ onUseAgent, onUseSkill }, ref) {
  const sendNotification = useSendNotification();
  const [tab, setTab] = useState<DiscoverTab>("Discover");
  const [search, setSearch] = useState("");
  // Side filter of the Agents / Skills catalogue.
  const [catalogView, setCatalogView] = useState<CatalogView>("all");
  const [catalogKind, setCatalogKind] = useState<CatalogKind>("all");
  const [catalogCategory, setCatalogCategory] =
    useState<CatalogCategory | null>(null);
  // Featured is editable: rows can be pinned to the front or the back of it
  // from their context menu.
  const [featuredItems, setFeaturedItems] =
    useState<DiscoverFeatured[]>(DISCOVER_FEATURED);
  const [featuredStart, setFeaturedStart] = useState(0);
  // Right-click target and pointer position for the row context menu.
  const [contextMenu, setContextMenu] = useState<{
    item: DiscoverItem;
    x: number;
    y: number;
  } | null>(null);
  // The pair being replaced, kept for one exit window so it can fade under
  // the incoming pair instead of vanishing.
  const [leavingFeatured, setLeavingFeatured] = useState<
    DiscoverFeatured[] | null
  >(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (!leavingFeatured) {
      return;
    }
    const timer = window.setTimeout(
      () => setLeavingFeatured(null),
      EXIT_DURATION_MS
    );
    return () => window.clearTimeout(timer);
  }, [leavingFeatured]);

  // Pages of two; an odd count leaves a single card on the last page rather
  // than wrapping around to repeat the first.
  const featured = useMemo(
    () => featuredItems.slice(featuredStart, featuredStart + 2),
    [featuredItems, featuredStart]
  );

  const showNextFeatured = () => {
    setLeavingFeatured(featured);
    setFeaturedStart((s) => (s + 2 >= featuredItems.length ? 0 : s + 2));
  };

  const pinFeatured = (item: DiscoverItem, position: "first" | "last") => {
    const entry: DiscoverFeatured =
      item.kind === "agent"
        ? {
            kind: "agent",
            agent: item.agent,
            author: item.authors[0],
            messageCount: item.messageCount,
            userCount: item.userCount,
          }
        : {
            kind: "skill",
            skill: item.skill,
            author: item.authors[0],
            messageCount: item.messageCount,
            userCount: item.userCount,
          };
    const id = getDiscoverItemId(item);
    const rest = featuredItems.filter((f) => getFeaturedId(f) !== id);
    const next = position === "first" ? [entry, ...rest] : [...rest, entry];
    // Land on the page that shows the pinned card.
    const lastPageStart = Math.floor((next.length - 1) / 2) * 2;
    setLeavingFeatured(featured);
    setFeaturedItems(next);
    setFeaturedStart(position === "first" ? 0 : lastPageStart);
    setContextMenu(null);
    sendNotification({
      type: "success",
      title: position === "first" ? "Pinned first" : "Pinned last",
      description: `${getDiscoverItemName(item)} is now featured.`,
    });
  };

  const filterItems = (items: DiscoverItem[]) => {
    const needle = search.trim().toLowerCase();
    return items.filter((item) => {
      if (!needle) {
        return true;
      }
      return (
        getDiscoverItemName(item).toLowerCase().includes(needle) ||
        getDiscoverItemDescription(item).toLowerCase().includes(needle)
      );
    });
  };

  const trending = filterItems(DISCOVER_TRENDING);
  const forYou = filterItems(DISCOVER_FOR_YOU);
  const catalog = filterItems(
    filterCatalog(ALL_CATALOG_ITEMS, catalogView, catalogKind, catalogCategory)
  );

  // "Find more" on a Discover section opens the Agents catalogue with the
  // matching view, scrolled back to the top of the page.
  const openCatalog = (view: CatalogView) => {
    setTab("Agents & Skills");
    setCatalogView(view);
    setCatalogKind("all");
    setCatalogCategory(null);
    document
      .getElementById("discover-page")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleUse = (item: DiscoverItem) => {
    if (item.kind === "agent") {
      onUseAgent(item.agent);
    } else {
      onUseSkill(item.skill);
    }
  };

  return (
    <div
      ref={ref}
      id="discover-page"
      className="flex w-full min-h-panel flex-col items-center px-4 pb-16 pt-10 md:px-8"
    >
      <div className="flex w-full max-w-4xl flex-col gap-12">
        {/* Header: title with search, then the section tabs */}
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="heading-2xl text-foreground">Discover</h1>
            <div className="w-full sm:w-80">
              <SearchInput
                name="discover-search"
                placeholder="Search for agents or skills"
                value={search}
                onChange={setSearch}
              />
            </div>
          </div>
          <Tabs
            value={tab}
            onValueChange={(value) => {
              setTab(value as DiscoverTab);
              setCatalogKind("all");
              setCatalogCategory(null);
            }}
          >
            <TabsList>
              {DISCOVER_TABS.map((t) => (
                <TabsTrigger key={t} value={t} label={t} />
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Featured */}
        {tab === "Discover" && !search && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="heading-lg text-foreground">Featured</h2>
              <Button
                variant="ghost"
                size="xs"
                icon={ChevronRight}
                isRounded
                aria-label="Next featured agents"
                disabled={featuredItems.length <= 2}
                onClick={showNextFeatured}
              />
            </div>
            <div className="relative">
              {/* Keyed on the page so both cards remount and replay their
                  entrance: a short slide from the right, 40ms apart. */}
              <div
                key={featuredStart}
                className="grid grid-cols-1 gap-4 md:grid-cols-2"
              >
                {featured.map((f, index) => (
                  <div
                    key={getFeaturedId(f)}
                    className={cn(
                      "transition-[opacity,translate] duration-(--transition-duration-enter) ease-emphasized",
                      "starting:translate-x-3 starting:opacity-0 motion-reduce:starting:translate-x-0"
                    )}
                    style={{
                      transitionDelay: reducedMotion
                        ? undefined
                        : `${index * 40}ms`,
                    }}
                  >
                    <FeaturedCard
                      featured={f}
                      onClick={() =>
                        f.kind === "agent"
                          ? onUseAgent(f.agent)
                          : onUseSkill(f.skill)
                      }
                    />
                  </div>
                ))}
              </div>
              {leavingFeatured && (
                <div
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute inset-0 grid grid-cols-1 gap-4 md:grid-cols-2",
                    "opacity-0 transition-opacity duration-(--transition-duration-exit) ease-enter starting:opacity-100"
                  )}
                >
                  {leavingFeatured.map((f) => (
                    <FeaturedCard
                      key={getFeaturedId(f)}
                      featured={f}
                      onClick={() => {}}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {tab === "Discover" && (
          <>
            <DiscoverSection
              title="Agent & Skill for you"
              action={
                <Button
                  variant="ghost"
                  size="xs"
                  label="Find more"
                  onClick={() => openCatalog("favorites")}
                />
              }
              items={forYou}
              onUse={handleUse}
              onContextMenu={(item, x, y) => setContextMenu({ item, x, y })}
            />
            <DiscoverSection
              title="Trending in the workspace"
              action={
                <Button
                  variant="ghost"
                  size="xs"
                  label="Find more"
                  onClick={() => openCatalog("popular")}
                />
              }
              items={trending}
              onUse={handleUse}
              onContextMenu={(item, x, y) => setContextMenu({ item, x, y })}
            />
          </>
        )}

        {tab === "Agents & Skills" && (
          <div className="grid grid-cols-1 gap-10 md:grid-cols-[12rem_1fr]">
            <CatalogFilter
              view={catalogView}
              onViewChange={setCatalogView}
              kind={catalogKind}
              onKindChange={setCatalogKind}
              category={catalogCategory}
              onCategoryChange={setCatalogCategory}
            />
            <DiscoverSection
              items={catalog}
              onUse={handleUse}
              onContextMenu={(item, x, y) => setContextMenu({ item, x, y })}
            />
          </div>
        )}
      </div>

      {/* Row context menu, anchored to the pointer through a zero-size fixed
          trigger (the same approach as the product's agent details menu). */}
      {contextMenu && (
        <DropdownMenu
          open
          onOpenChange={(open) => !open && setContextMenu(null)}
          modal={false}
        >
          <DropdownMenuTrigger asChild>
            <div
              style={{
                position: "fixed",
                left: contextMenu.x,
                top: contextMenu.y,
                width: 0,
                height: 0,
                pointerEvents: "none",
              }}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel label="Featured" />
            <DropdownMenuItem
              icon={Pin02}
              label="Pin first"
              onClick={() => pinFeatured(contextMenu.item, "first")}
            />
            <DropdownMenuItem
              icon={Pin02}
              label="Pin last"
              onClick={() => pinFeatured(contextMenu.item, "last")}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
});

// ── Featured card ───────────────────────────────────────────────────────────

function FeaturedCard({
  featured,
  onClick,
}: {
  featured: DiscoverFeatured;
  onClick: () => void;
}) {
  const { author, messageCount, userCount } = featured;
  return (
    // Buttons shrink-wrap even as flex containers, so the card claims its
    // grid column explicitly.
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-background text-left",
        "transition-transform duration-200 ease-emphasized hover:-translate-y-0.5"
      )}
    >
      {/* Cover: the agent's color with its emoji, or a neutral field with
          the skill's icon, as the artwork. */}
      {featured.kind === "agent" ? (
        getAgentImageUrl(featured.agent) ? (
          // The picture sits centered at the emoji's size; a blurred,
          // faded copy fills the cover behind it so the card keeps a tint.
          <div className="relative flex h-40 w-full items-center justify-center overflow-hidden bg-muted-background">
            <img
              src={getAgentImageUrl(featured.agent)}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-xl"
            />
            <img
              src={getAgentImageUrl(featured.agent)}
              alt=""
              className="relative h-12 w-12 rounded-xl object-cover"
            />
          </div>
        ) : (
          <div
            className={cn(
              "flex h-40 w-full items-center justify-center",
              asAvatarBackgroundColor(featured.agent.backgroundColor),
              "dark:brightness-[0.35] dark:saturate-[0.6]"
            )}
          >
            <span aria-hidden className="text-5xl leading-none">
              {featured.agent.emoji}
            </span>
          </div>
        )
      ) : (
        <div
          className={cn(
            "flex h-40 w-full items-center justify-center",
            SKILL_TILE_BACKGROUND
          )}
        >
          <Icon
            visual={featured.skill.icon}
            size="2xl"
            className={SKILL_TILE_ICON_COLOR}
          />
        </div>
      )}
      {/* Footer: type tile, name, then "by author · stats". */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          role="img"
          aria-label={featured.kind === "agent" ? "Agent" : "Skill"}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            featured.kind === "agent"
              ? "bg-muted-background text-foreground"
              : cn(SKILL_TILE_BACKGROUND, SKILL_TILE_ICON_COLOR)
          )}
        >
          <Icon
            visual={featured.kind === "agent" ? Robot : PuzzlePiece01}
            size="sm"
          />
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="heading-base notranslate truncate text-foreground">
            {capitalize(getFeaturedName(featured))}
          </span>
          <span className="flex items-center gap-2 copy-sm text-muted-foreground">
            <span className="truncate">by {author.firstName}</span>
            <span aria-hidden>·</span>
            <span className="flex items-center gap-1">
              <Icon visual={MessageCircle01} size="xs" />
              {formatCompactCount(messageCount)}
              <span className="sr-only">messages</span>
            </span>
            <span className="flex items-center gap-1">
              <Icon visual={Users01} size="xs" />
              {formatCompactCount(userCount)}
              <span className="sr-only">members</span>
            </span>
          </span>
        </div>
      </div>
    </button>
  );
}

// ── List sections ───────────────────────────────────────────────────────────

// ── Catalogue side filter ───────────────────────────────────────────────────
// Three groups: how to slice the list (favourites, popularity, all, mine),
// the type (agents, skills, both), then the workspace categories. One choice
// per group; a category can be cleared.

function CatalogFilter({
  view,
  onViewChange,
  kind,
  onKindChange,
  category,
  onCategoryChange,
}: {
  view: CatalogView;
  onViewChange: (view: CatalogView) => void;
  kind: CatalogKind;
  onKindChange: (kind: CatalogKind) => void;
  category: CatalogCategory | null;
  onCategoryChange: (category: CatalogCategory | null) => void;
}) {
  return (
    // Sticks to the top of the panel scroller while the list scrolls past.
    <nav
      aria-label="Filter"
      className="sticky top-6 flex flex-col gap-6 self-start"
    >
      <NavigationList>
        {CATALOG_VIEWS.map((v) => (
          <NavigationListItem
            key={v.id}
            label={v.label}
            selected={view === v.id}
            onClick={() => onViewChange(v.id)}
          />
        ))}
      </NavigationList>
      <NavigationList>
        {CATALOG_KINDS.map((k) => (
          <NavigationListItem
            key={k.id}
            label={k.label}
            selected={kind === k.id}
            onClick={() => onKindChange(k.id)}
          />
        ))}
      </NavigationList>
      <NavigationList>
        {CATALOG_CATEGORIES.map((c) => (
          <NavigationListItem
            key={c}
            label={c}
            selected={category === c}
            onClick={() => onCategoryChange(category === c ? null : c)}
          />
        ))}
      </NavigationList>
    </nav>
  );
}

function DiscoverSection({
  title,
  action,
  items,
  onUse,
  onContextMenu,
}: {
  title?: string;
  // Right-aligned control in the header row, e.g. "Find more".
  action?: React.ReactNode;
  items: DiscoverItem[];
  onUse: (item: DiscoverItem) => void;
  onContextMenu: (item: DiscoverItem, x: number, y: number) => void;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      {title && (
        <div className="flex items-center justify-between">
          <h2 className="heading-lg text-foreground">{title}</h2>
          {action}
        </div>
      )}
      {items.length === 0 ? (
        <p className="copy-sm py-6 text-muted-foreground">
          Nothing here matches your filters.
        </p>
      ) : (
        <div className="flex flex-col">
          {items.map((item) => (
            <DiscoverRow
              key={getDiscoverItemId(item)}
              item={item}
              onUse={() => onUse(item)}
              onContextMenu={(x, y) => onContextMenu(item, x, y)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function DiscoverRow({
  item,
  onUse,
  onContextMenu,
}: {
  item: DiscoverItem;
  onUse: () => void;
  onContextMenu: (x: number, y: number) => void;
}) {
  const name = getDiscoverItemName(item);
  return (
    <div
      className="flex items-center gap-4 border-b border-separator py-4 last:border-b-0"
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e.clientX, e.clientY);
      }}
    >
      {item.kind === "agent" ? (
        <Avatar
          size="lg"
          {...getAgentAvatarProps(item.agent)}
          className="shrink-0 rounded-2xl border-0"
        />
      ) : (
        <Avatar
          size="lg"
          icon={item.skill.icon}
          backgroundColor={SKILL_TILE_BACKGROUND}
          iconColor={SKILL_TILE_ICON_COLOR}
          className="shrink-0 rounded-2xl border-0"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="heading-base notranslate text-foreground">
            {capitalize(name)}
          </span>
          <Chip
            size="xs"
            label={getDiscoverItemHandle(item)}
            className="font-mono"
          />
        </div>
        <AuthorsLine
          authors={item.authors}
          messageCount={item.messageCount}
          userCount={item.userCount}
        />
        <p className="copy-sm text-muted-foreground">
          {getDiscoverItemDescription(item)}
        </p>
      </div>
      <div className="flex shrink-0 items-center">
        <Button
          variant="outline"
          size="sm"
          label={item.kind === "agent" ? "Chat" : "Use"}
          onClick={onUse}
        />
      </div>
    </div>
  );
}

// Author, then usage stats as icon + number pairs. Fixed at 20px tall so a
// row with one author and a row with several keep the same rhythm, and the
// 48px tile beside them spans exactly the name line plus this one.
const MAX_STACKED_AUTHORS = 3;

function AuthorsLine({
  authors,
  messageCount,
  userCount,
  className,
}: {
  authors: User[];
  messageCount: number;
  userCount?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex h-5 items-center gap-4 copy-sm", className)}>
      <div className="flex items-center gap-2">
        <div className="flex -space-x-1.5">
          {authors.slice(0, MAX_STACKED_AUTHORS).map((a) => (
            <Avatar
              key={a.id}
              size="xxs"
              name={a.fullName}
              visual={a.portrait}
              isRounded
              className="ring-2 ring-background"
            />
          ))}
        </div>
        <span className="truncate text-foreground">
          {formatAuthors(authors)}
        </span>
      </div>
      <span className="flex items-center gap-1 text-muted-foreground">
        <Icon visual={MessageCircle01} size="xs" />
        {formatCount(messageCount)}
        <span className="sr-only">messages</span>
      </span>
      {userCount !== undefined && (
        <span className="flex items-center gap-1 text-muted-foreground">
          <Icon visual={Users01} size="xs" />
          {formatCount(userCount)}
          <span className="sr-only">members</span>
        </span>
      )}
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
