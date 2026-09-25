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
import type { PendingSkill } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { useDebounce } from "@app/hooks/useDebounce";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { useUnifiedAgentConfigurations } from "@app/lib/swr/assistants";
import { useCatalogSearch } from "@app/lib/swr/catalog_search";
import { useSkillsWithRelations } from "@app/lib/swr/skill_configurations";
import { useTagsUsage } from "@app/lib/swr/tags";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
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
  Chip,
  cn,
  EmptyCTA,
  Icon,
  NavigationList,
  NavigationListItem,
  Pin02,
  SearchInput,
  Spinner,
  Users01,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";

const CATALOG_VIEWS: { id: CatalogView; label: string }[] = [
  { id: "favorites", label: "Favorites" },
  { id: "popular", label: "Most Popular" },
  { id: "all", label: "All" },
  { id: "mine", label: "Mine" },
];

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
  onAgentClick: (agent: RichAgentMentionCandidate) => void;
  onSkillClick: (skill: PendingSkill) => void;
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
          a.sortName.localeCompare(b.sortName)
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
  const { tags: tagsWithUsage, isTagsLoading } = useTagsUsage({ owner });
  const tags = useMemo(
    () => tagsWithUsage.filter((tag) => tag.usage > 0).sort(tagsSorter),
    [tagsWithUsage]
  );

  return (
    <CatalogLayout
      filters={query}
      tags={tags}
      search={search}
      onSearchChange={onSearchChange}
      onUpdateFilters={onUpdateFilters}
    >
      <CatalogResults
        items={catalogSearch.items}
        isLoading={
          isDebouncing ||
          isTagsLoading ||
          catalogSearch.isLoading ||
          catalogSearch.isLoadingMore
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

  const { hasFeature } = useFeatureFlags();
  // Skill search 403s without its flag. Favorites stay hydrated because search
  // results have no favorite flag.
  const skillsSearchEnabled = hasFeature("skills_search");
  const useSearch =
    filters.view !== "favorites" &&
    (filters.kind !== "skill" || skillsSearchEnabled);
  const query = useMemo(() => {
    const built = buildCatalogQuery(
      filters,
      useSearch ? debouncedSearchTerm : searchTerm
    );
    // Skill search 403s without the flag. Favorites and the skill-only view stay
    // on the hydrated lists, which still include skills.
    if (!useSearch || skillsSearchEnabled) {
      return built;
    }
    return { ...built, showSkills: false };
  }, [
    debouncedSearchTerm,
    filters,
    searchTerm,
    skillsSearchEnabled,
    useSearch,
  ]);
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
  const actions = { onAgentClick, onSkillClick, onPin, onDetails };

  return useSearch ? (
    <SearchCatalog
      key={query.key}
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
  search: string;
  onSearchChange: (value: string) => void;
  onUpdateFilters: (update: Partial<CatalogFilters>) => void;
  children: React.ReactNode;
}

function CatalogLayout({
  filters,
  tags,
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
  onUpdateFilters: (update: Partial<CatalogFilters>) => void;
}

function CatalogFiltersNav({
  filters: { view, kind, tagId },
  tags,
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
      {tags.length > 0 && kind !== "skill" && (
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
      )}
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
  onAgentClick,
  onSkillClick,
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
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
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
              onUse={() =>
                item.kind === "agent"
                  ? onAgentClick(item.agent)
                  : onSkillClick(item.skill)
              }
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
  const isMobile = useIsMobile();
  const avatar =
    item.kind === "agent" ? (
      <Avatar size={isMobile ? "md" : "lg"} visual={item.agent.pictureUrl} />
    ) : (
      <SkillCatalogAvatar
        icon={item.skill.icon}
        isDustProvided={item.isDustProvided}
        size={isMobile ? "md" : "lg"}
      />
    );
  return (
    <div
      className={cn(
        "group relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2",
        "border-b border-separator py-4 last:border-b-0 md:gap-y-1"
      )}
    >
      <div className="col-start-1 row-start-1 shrink-0 md:row-span-2">
        {avatar}
      </div>
      <div className="col-start-2 col-end-4 row-start-1 flex min-w-0 items-center gap-2 self-center md:col-end-3 md:self-end">
        {isMobile ? (
          <span className="heading-base notranslate truncate text-foreground">
            {name}
          </span>
        ) : (
          <button
            type="button"
            aria-label={`Show ${name} details`}
            onClick={onDetails}
            className="heading-base notranslate cursor-pointer truncate text-left text-foreground after:absolute after:inset-0"
          >
            {name}
          </button>
        )}
        <Chip
          size="xs"
          label={item.kind === "agent" ? `@${name}` : `/${name}`}
          className="shrink-0 font-mono"
        />
      </div>
      <div className="col-start-1 col-end-3 row-start-2 flex min-w-0 flex-col gap-1 self-start md:col-start-2">
        <div className="flex h-5 items-center gap-4 copy-sm">
          <ItemAuthor item={item} />
          {item.activeUsersCount !== null && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Icon visual={Users01} size="xs" />
              {item.activeUsersCount.toLocaleString()}
              <span className="sr-only">active users</span>
            </span>
          )}
        </div>
        <p className="copy-sm line-clamp-2 text-muted-foreground">
          {getItemDescription(item)}
        </p>
      </div>
      <div className="relative col-start-3 row-start-2 flex shrink-0 items-center gap-1 self-end md:row-span-2 md:row-start-1 md:self-center">
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
          label={item.kind === "agent" ? "Chat" : "Use"}
          onClick={onUse}
        />
      </div>
    </div>
  );
}

interface SkillCatalogAvatarProps {
  icon: string | null;
  isDustProvided: boolean;
  size?: "md" | "lg";
}

export function SkillCatalogAvatar({
  icon,
  isDustProvided,
  size = "lg",
}: SkillCatalogAvatarProps) {
  const SkillAvatar = useMemo(
    () =>
      getSkillAvatarIcon({
        icon,
        // Null editedBy is how the avatar marks a Dust-provided skill.
        editedBy: isDustProvided ? null : "custom",
      }),
    [icon, isDustProvided]
  );
  return <SkillAvatar size={size} className="shrink-0" />;
}
