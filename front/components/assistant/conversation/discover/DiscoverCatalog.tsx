import type {
  CatalogFilters,
  CatalogItem,
  CatalogKind,
  CatalogQuery,
  CatalogView,
  DiscoverSkill,
} from "@app/components/assistant/conversation/discover/catalog";
import {
  buildCatalogQuery,
  getItemDescription,
  getItemId,
  getItemName,
  toHydratedAgentCatalogItem,
  toHydratedSkillCatalogItem,
} from "@app/components/assistant/conversation/discover/catalog";
import {
  trackDiscoverItemDetailsOpen,
  trackDiscoverItemSelect,
} from "@app/components/assistant/conversation/discover/discoveryTracking";
import type { PendingSkill } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { useDebounce } from "@app/hooks/useDebounce";
import { useSearchAgents } from "@app/hooks/useSearchAgents";
import { compareStrings, formatNumber } from "@app/lib/i18n/format";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { useUnifiedAgentConfigurations } from "@app/lib/swr/assistants";
import { useCatalogSearch } from "@app/lib/swr/catalog_search";
import { useSkillsWithRelations } from "@app/lib/swr/skill_configurations";
import {
  compareForFuzzySort,
  getAgentSearchString,
  subFilter,
  tagsSorter,
} from "@app/lib/utils";
import type { RichAgentMentionCandidate } from "@app/types/assistant/mentions";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { WorkspaceType } from "@app/types/user";
import {
  Avatar,
  Button,
  CheckVerified01,
  cn,
  EmptyCTA,
  Icon,
  LoadingBlock,
  NavigationList,
  NavigationListItem,
  Pin02,
  SearchInput,
  Spinner,
  Users01,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";

const CATALOG_VIEWS: { id: CatalogView; label: string }[] = [
  { id: "all", label: "All" },
  { id: "popular", label: "Most Popular" },
  { id: "favorites", label: "Favorites" },
  { id: "mine", label: "Mine" },
];

const CATALOG_SKELETON_ROW_COUNT = 6;
const TAGS_SKELETON_WIDTHS = ["w-20", "w-28", "w-16", "w-24"];

const DEFAULT_FILTERS: CatalogFilters = {
  view: "all",
  kind: "all",
  tagId: null,
};

const CATALOG_KINDS: { id: CatalogKind; label: string }[] = [
  { id: "all", label: "Agents & Skills" },
  { id: "agent", label: "Agents" },
  { id: "skill", label: "Skills" },
];

function skillSearchString(skill: DiscoverSkill): string {
  return [
    skill.name,
    ...(skill.relations.editors ?? []).map((editor) => editor.fullName),
  ]
    .join(" ")
    .toLowerCase();
}

function capitalizeWords(text: string): string {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ItemAuthorProps {
  item: CatalogItem;
}

export function ItemAuthor({ item }: ItemAuthorProps) {
  if (item.isDustProvided) {
    return (
      <span className="flex shrink-0 items-center gap-1 text-highlight">
        <Icon visual={CheckVerified01} size="xs" />
        Dust
      </span>
    );
  }
  if (item.authors.length === 0) {
    return null;
  }
  return (
    <span className="truncate text-foreground">
      {formatAuthors(item.authors)}
    </span>
  );
}

function formatAuthors(authors: readonly string[]): string {
  if (authors.length === 1) {
    return authors[0];
  }
  const others = authors.length - 1;
  return `${authors[0]} and ${others} other${pluralize(others)}`;
}

interface DiscoverCatalogProps {
  owner: WorkspaceType;
  onAgentClick: (agent: RichAgentMentionCandidate) => void;
  onSkillClick: (skill: PendingSkill) => void;
  onPin?: (item: CatalogItem) => void;
  onDetails: (item: CatalogItem) => void;
  onFiltersChange: () => void;
}

interface CatalogActions {
  onUse: (item: CatalogItem) => void;
  onPin?: (item: CatalogItem) => void;
  onDetails: (item: CatalogItem) => void;
}

interface CatalogSourceProps extends CatalogActions {
  owner: WorkspaceType;
  query: CatalogQuery;
  search: string;
  onSearchChange: (value: string) => void;
  onUpdateFilters: (update: Partial<CatalogFilters>) => void;
  canClearFilters: boolean;
  onClearFilters: () => void;
}

function HydratedCatalog({
  owner,
  query,
  search,
  onSearchChange,
  onUpdateFilters,
  canClearFilters,
  onClearFilters,
  ...actions
}: CatalogSourceProps) {
  const { agentConfigurations, isLoading: isAgentsLoading } =
    useUnifiedAgentConfigurations({ workspaceId: owner.sId });
  const { skillsWithRelations, isSkillsWithRelationsLoading } =
    useSkillsWithRelations({
      owner,
      status: "active",
      withUsage: true,
    });

  const activeAgents = useMemo(
    () => agentConfigurations.filter((a) => a.status === "active"),
    [agentConfigurations]
  );
  const tags = useMemo(
    () =>
      Array.from(
        new Map(
          activeAgents.flatMap((agent) =>
            agent.tags.map((tag) => [tag.sId, tag])
          )
        ).values()
      ).sort(tagsSorter),
    [activeAgents]
  );

  const items = useMemo(() => {
    const agents = query.showAgents
      ? activeAgents
          .filter(
            (agent) =>
              (query.view !== "favorites" || agent.userFavorite) &&
              (query.view !== "mine" || agent.canEdit) &&
              (query.tagId === null ||
                agent.tags.some((tag) => tag.sId === query.tagId)) &&
              (!query.searchTerm ||
                subFilter(query.searchTerm, getAgentSearchString(agent)))
          )
          .map((agent) => ({
            item: toHydratedAgentCatalogItem(agent),
            searchString: getAgentSearchString(agent),
            sortName: agent.name.toLowerCase(),
            usage: agent.usage?.messageCount ?? 0,
          }))
      : [];
    const skills = query.showSkills
      ? skillsWithRelations
          .filter(
            (skill) =>
              (query.view !== "favorites" || !!skill.isFavorite) &&
              (query.view !== "mine" || skill.canWrite) &&
              (!query.searchTerm ||
                subFilter(query.searchTerm, skillSearchString(skill)))
          )
          .map((skill) => ({
            item: toHydratedSkillCatalogItem(skill),
            searchString: skillSearchString(skill),
            sortName: skill.name.toLowerCase(),
            usage: skill.usage ?? 0,
          }))
      : [];
    return [...agents, ...skills]
      .sort(
        (a, b) =>
          (query.searchTerm
            ? compareForFuzzySort(
                query.searchTerm,
                a.searchString,
                b.searchString
              )
            : 0) ||
          (query.view === "popular" ? b.usage - a.usage : 0) ||
          compareStrings(a.sortName, b.sortName)
      )
      .map(({ item }) => item);
  }, [activeAgents, query, skillsWithRelations]);

  return (
    <CatalogLayout
      filters={query}
      tags={tags}
      search={search}
      onSearchChange={onSearchChange}
      onUpdateFilters={onUpdateFilters}
    >
      <CatalogResults
        items={items}
        isLoading={isAgentsLoading || isSkillsWithRelationsLoading}
        hasError={false}
        hasNextPage={false}
        canClearFilters={canClearFilters}
        onClearFilters={onClearFilters}
        {...actions}
      />
    </CatalogLayout>
  );
}

interface SearchCatalogProps extends CatalogSourceProps {
  isDebouncing: boolean;
}

/**
 * @cc [owner:frankaloia,label:product] catalog-tags-follow-visible-agents
 * The tag filter MUST list tags on agents the caller can see, from an unfiltered agent-search
 * tags facet. It MUST NOT call the admin-only tags usage endpoint. Selecting a tag, changing
 * the view, or typing a search MUST NOT drop the other tags from that list.
 */
function SearchCatalog({
  owner,
  query,
  search,
  onSearchChange,
  onUpdateFilters,
  canClearFilters,
  onClearFilters,
  isDebouncing,
  ...actions
}: SearchCatalogProps) {
  const catalogSearch = useCatalogSearch({ owner, query });
  // Facets follow every filter on the query, so this request stays unfiltered. Otherwise
  // choosing a tag would collapse the list to that tag.
  const { facets, isAgentsLoading: isTagsLoading } = useSearchAgents({
    owner,
    searchTerm: "",
    limit: 0,
    facets: ["tags"],
  });
  const tags = useMemo(
    () => [...(facets?.tags ?? [])].sort(tagsSorter),
    [facets?.tags]
  );

  return (
    <CatalogLayout
      filters={query}
      tags={tags}
      isTagsLoading={isTagsLoading}
      search={search}
      onSearchChange={onSearchChange}
      onUpdateFilters={onUpdateFilters}
    >
      <CatalogResults
        items={catalogSearch.items}
        isLoading={
          isDebouncing || catalogSearch.isLoading || catalogSearch.isLoadingMore
        }
        hasError={catalogSearch.hasError}
        hasNextPage={catalogSearch.hasMore}
        onLoadMore={catalogSearch.loadMore}
        canClearFilters={canClearFilters}
        onClearFilters={onClearFilters}
        {...actions}
      />
    </CatalogLayout>
  );
}

export function DiscoverCatalog({
  owner,
  onAgentClick,
  onSkillClick,
  onPin,
  onDetails,
  onFiltersChange,
}: DiscoverCatalogProps) {
  const [filters, setFilters] = useState<CatalogFilters>(DEFAULT_FILTERS);
  const [search, setSearch] = useState("");
  const searchTerm = search.trim().toLowerCase().replace(/^@/, "");
  const {
    debouncedValue: debouncedSearchTerm,
    isDebouncing,
    setValue: setSearchTerm,
  } = useDebounce(searchTerm, { delay: 250 });

  useEffect(() => {
    setSearchTerm(searchTerm);
  }, [searchTerm, setSearchTerm]);

  // Favorites stay hydrated because search results have no favorite flag.
  const useSearch = filters.view !== "favorites";
  const query = useMemo(
    () =>
      buildCatalogQuery(filters, useSearch ? debouncedSearchTerm : searchTerm),
    [debouncedSearchTerm, filters, searchTerm, useSearch]
  );
  const updateFilters = (update: Partial<CatalogFilters>) => {
    setFilters((current) => ({ ...current, ...update }));
    onFiltersChange();
  };
  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setSearch("");
    onFiltersChange();
  };
  const onSearchChange = (value: string) => {
    setSearch(value);
    onFiltersChange();
  };
  const canClearFilters =
    filters.view !== "all" ||
    filters.kind !== "all" ||
    filters.tagId !== null ||
    searchTerm !== "";
  const trackingContext = { ...filters, hasSearchTerm: searchTerm !== "" };
  const actions: CatalogActions = {
    onUse: (item) => {
      trackDiscoverItemSelect({
        source: "catalog",
        item,
        catalog: trackingContext,
      });
      if (item.kind === "agent") {
        onAgentClick(item.agent);
      } else {
        onSkillClick(item.skill);
      }
    },
    onPin,
    onDetails: (item) => {
      trackDiscoverItemDetailsOpen({
        source: "catalog",
        item,
        catalog: trackingContext,
      });
      onDetails(item);
    },
  };

  return useSearch ? (
    <SearchCatalog
      owner={owner}
      query={query}
      search={search}
      onSearchChange={onSearchChange}
      onUpdateFilters={updateFilters}
      canClearFilters={canClearFilters}
      onClearFilters={clearFilters}
      isDebouncing={isDebouncing}
      {...actions}
    />
  ) : (
    <HydratedCatalog
      owner={owner}
      query={query}
      search={search}
      onSearchChange={onSearchChange}
      onUpdateFilters={updateFilters}
      canClearFilters={canClearFilters}
      onClearFilters={clearFilters}
      {...actions}
    />
  );
}

interface CatalogLayoutProps {
  filters: CatalogFilters;
  tags: { sId: string; name: string }[];
  isTagsLoading?: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  onUpdateFilters: (update: Partial<CatalogFilters>) => void;
  children: React.ReactNode;
}

function CatalogLayout({
  filters,
  tags,
  isTagsLoading = false,
  search,
  onSearchChange,
  onUpdateFilters,
  children,
}: CatalogLayoutProps) {
  return (
    <div className="flex flex-col gap-8">
      <SearchInput
        name="discover-search"
        placeholder="Search for agents or skills"
        value={search}
        onChange={onSearchChange}
      />
      <div className="grid grid-cols-1 gap-10 md:grid-cols-[12rem_1fr]">
        <CatalogFiltersNav
          filters={filters}
          tags={tags}
          isTagsLoading={isTagsLoading}
          onUpdateFilters={onUpdateFilters}
        />
        {children}
      </div>
    </div>
  );
}

interface CatalogFiltersNavProps {
  filters: CatalogFilters;
  tags: { sId: string; name: string }[];
  isTagsLoading: boolean;
  onUpdateFilters: (update: Partial<CatalogFilters>) => void;
}

function CatalogFiltersNav({
  filters: { view, kind, tagId },
  tags,
  isTagsLoading,
  onUpdateFilters,
}: CatalogFiltersNavProps) {
  return (
    <nav aria-label="Filter" className="flex flex-col gap-6 self-start">
      <NavigationList>
        {CATALOG_VIEWS.map((v) => (
          <NavigationListItem
            key={v.id}
            label={v.label}
            selected={view === v.id}
            onClick={() => onUpdateFilters({ view: v.id })}
          />
        ))}
      </NavigationList>
      <NavigationList>
        {CATALOG_KINDS.map((k) => (
          <NavigationListItem
            key={k.id}
            label={k.label}
            selected={kind === k.id}
            onClick={() =>
              onUpdateFilters(
                k.id === "skill" ? { kind: k.id, tagId: null } : { kind: k.id }
              )
            }
          />
        ))}
      </NavigationList>
      {kind !== "skill" &&
        (tags.length > 0 ? (
          <NavigationList>
            {tags.map((t) => (
              <NavigationListItem
                key={t.sId}
                label={capitalizeWords(t.name)}
                selected={tagId === t.sId}
                onClick={() =>
                  onUpdateFilters({ tagId: tagId === t.sId ? null : t.sId })
                }
              />
            ))}
          </NavigationList>
        ) : (
          isTagsLoading && (
            <div aria-hidden className="flex flex-col gap-0.5">
              {TAGS_SKELETON_WIDTHS.map((width) => (
                <div key={width} className="flex h-9 items-center px-2">
                  <LoadingBlock className={cn("h-3", width)} />
                </div>
              ))}
            </div>
          )
        ))}
    </nav>
  );
}

interface CatalogResultsProps extends CatalogActions {
  items: CatalogItem[];
  isLoading: boolean;
  hasError: boolean;
  hasNextPage: boolean;
  onLoadMore?: () => void;
  canClearFilters: boolean;
  onClearFilters: () => void;
}

function CatalogResults({
  items,
  isLoading,
  hasError,
  hasNextPage,
  onLoadMore,
  canClearFilters,
  onClearFilters,
  onUse,
  onPin,
  onDetails,
}: CatalogResultsProps) {
  const isInitialLoading = isLoading && items.length === 0;

  return (
    <section className="relative flex min-w-0 flex-col">
      {isLoading && !isInitialLoading && (
        <div className="absolute right-0 top-0">
          <Spinner size="xs" />
        </div>
      )}
      {isInitialLoading ? (
        <CatalogRowsSkeleton count={CATALOG_SKELETON_ROW_COUNT} />
      ) : items.length === 0 ? (
        hasError ? (
          <EmptyCTA
            title="Unable to load agents and skills"
            message="Try again in a moment."
            action={null}
          />
        ) : (
          <EmptyCTA
            title="No agents or skills found"
            message="Try another search or different filters."
            action={
              canClearFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  label="Clear filters"
                  onClick={onClearFilters}
                />
              )
            }
          />
        )
      ) : (
        <>
          {items.map((item) => (
            <CatalogRow
              key={`${item.kind}-${getItemId(item)}`}
              item={item}
              onUse={() => onUse(item)}
              onPin={onPin && (() => onPin(item))}
              onDetails={() => onDetails(item)}
            />
          ))}
          {hasError && (
            <p className="py-4 text-center copy-sm text-warning-500">
              Couldn't load more. Try again in a moment.
            </p>
          )}
          {hasNextPage && onLoadMore && (
            <div className="flex justify-center pt-6">
              <Button
                variant="outline"
                size="sm"
                label="Load more"
                isLoading={isLoading}
                onClick={onLoadMore}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}

interface CatalogRowProps {
  item: CatalogItem;
  onUse: () => void;
  onPin?: () => void;
  onDetails: () => void;
}

export function CatalogRow({ item, onUse, onPin, onDetails }: CatalogRowProps) {
  const name = getItemName(item);
  const avatar =
    item.kind === "agent" ? (
      <Avatar size="md" visual={item.agent.pictureUrl} />
    ) : (
      <SkillCatalogAvatar icon={item.skill.icon} size="md" />
    );
  const useLabel = item.kind === "agent" ? `Chat with ${name}` : `Use ${name}`;
  return (
    <div className="group relative flex items-center gap-4 border-b border-separator py-4 last:border-b-0">
      <div className="shrink-0 self-start">{avatar}</div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            aria-label={useLabel}
            onClick={onUse}
            className="heading-base notranslate cursor-pointer truncate text-left text-foreground after:absolute after:inset-0"
          >
            {name}
          </button>
        </div>
        <div className="flex h-5 items-center gap-4 copy-sm">
          <ItemAuthor item={item} />
          {item.activeUsersCount !== null && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Icon visual={Users01} size="xs" />
              {formatNumber(item.activeUsersCount)}
              <span className="sr-only">active users</span>
            </span>
          )}
        </div>
        <p className="copy-sm mt-1 line-clamp-2 text-muted-foreground">
          {getItemDescription(item)}
        </p>
      </div>
      <div className="relative flex shrink-0 items-center gap-1 self-start">
        {onPin && (
          <Button
            variant="ghost"
            size="sm"
            icon={Pin02}
            tooltip="Pin to Featured"
            aria-label={`Pin ${name} to Featured`}
            onClick={onPin}
            className={cn(
              "transition-opacity duration-150 motion-reduce:transition-none",
              "[@media(hover:hover)_and_(pointer:fine)]:opacity-0",
              "focus-visible:opacity-100 group-hover:opacity-100"
            )}
          />
        )}
        <Button
          variant="outline"
          size="sm"
          label="Details"
          aria-label={`Show ${name} details`}
          onClick={onDetails}
        />
      </div>
    </div>
  );
}

interface CatalogRowsSkeletonProps {
  count: number;
}

export function CatalogRowsSkeleton({ count }: CatalogRowsSkeletonProps) {
  return (
    <div aria-hidden className="flex flex-col">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-4 border-b border-separator py-4 last:border-b-0"
        >
          <LoadingBlock className="h-12 w-12 shrink-0 self-start rounded-xl" />
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-6 items-center">
              <LoadingBlock className="h-4 w-40 max-w-full" />
            </div>
            <div className="flex h-5 items-center">
              <LoadingBlock className="h-3 w-24" />
            </div>
            <div className="mt-1 flex flex-col">
              <div className="flex h-5 items-center">
                <LoadingBlock className="h-3 w-full max-w-md" />
              </div>
              <div className="flex h-5 items-center">
                <LoadingBlock className="h-3 w-2/3 max-w-xs" />
              </div>
            </div>
          </div>
          <LoadingBlock className="h-8 w-20 shrink-0 self-start rounded-xl" />
        </div>
      ))}
    </div>
  );
}

interface SkillCatalogAvatarProps {
  icon: string | null;
  size?: "md" | "lg";
}

export function SkillCatalogAvatar({
  icon,
  size = "lg",
}: SkillCatalogAvatarProps) {
  const SkillAvatar = useMemo(() => getSkillAvatarIcon(icon), [icon]);
  return <SkillAvatar size={size} className="shrink-0" />;
}
