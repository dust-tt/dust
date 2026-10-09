import type {
  CatalogFilters,
  CatalogItem,
  CatalogKind,
  CatalogQuery,
  CatalogView,
} from "@app/components/assistant/conversation/discover/catalog";
import {
  buildCatalogQuery,
  getItemDescription,
  getItemId,
  getItemName,
} from "@app/components/assistant/conversation/discover/catalog";
import {
  trackDiscoverItemDetailsOpen,
  trackDiscoverItemSelect,
} from "@app/components/assistant/conversation/discover/discoveryTracking";
import type { PendingSkill } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { useDebounce } from "@app/hooks/useDebounce";
import { useSearchAgents } from "@app/hooks/useSearchAgents";
import { formatNumber } from "@app/lib/i18n/format";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { useCatalogSearch } from "@app/lib/swr/catalog_search";
import { tagsSorter } from "@app/lib/utils";
import type { RichAgentMentionCandidate } from "@app/types/assistant/mentions";
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
import type { MessageDescriptor } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useMemo, useState } from "react";

const CATALOG_VIEWS: { id: CatalogView; label: MessageDescriptor }[] = [
  { id: "all", label: msg({ message: "All", context: "catalog filter" }) },
  { id: "popular", label: msg`Most popular` },
  { id: "favorites", label: msg`Favorites` },
  { id: "mine", label: msg({ message: "Mine", context: "catalog filter" }) },
];

const CATALOG_SKELETON_ROW_COUNT = 6;
const TAGS_SKELETON_WIDTHS = ["w-20", "w-28", "w-16", "w-24"];

const DEFAULT_FILTERS: CatalogFilters = {
  view: "all",
  kind: "all",
  tagId: null,
};

const CATALOG_KINDS: { id: CatalogKind; label: MessageDescriptor }[] = [
  { id: "all", label: msg`Agents & skills` },
  { id: "agent", label: msg`Agents` },
  { id: "skill", label: msg`Skills` },
];

function capitalizeWords(text: string): string {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ItemAuthorProps {
  item: CatalogItem;
}

export function ItemAuthor({ item }: ItemAuthorProps) {
  const { t } = useLingui();
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
  const [author] = item.authors;
  const others = item.authors.length - 1;
  return (
    <span className="truncate text-foreground">
      {others === 0
        ? author
        : t`${plural(others, {
            one: `${author} and # other`,
            other: `${author} and # others`,
          })}`}
    </span>
  );
}

interface DiscoverCatalogProps {
  owner: WorkspaceType;
  onAgentClick: (agent: RichAgentMentionCandidate) => void;
  onSkillClick: (skill: PendingSkill) => void;
  onPin?: (item: CatalogItem) => void;
  onDetails: (item: CatalogItem, onClose?: () => void) => void;
  onFiltersChange: () => void;
}

interface CatalogActions {
  onUse: (item: CatalogItem) => void;
  onPin?: (item: CatalogItem) => void;
  onDetails: (item: CatalogItem, onClose?: () => void) => void;
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
  onDetails,
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
        itemsQuery={catalogSearch.itemsQuery}
        isLoading={
          isDebouncing || catalogSearch.isLoading || catalogSearch.isLoadingMore
        }
        hasError={catalogSearch.hasError}
        hasNextPage={catalogSearch.hasMore}
        onLoadMore={catalogSearch.loadMore}
        canClearFilters={canClearFilters}
        onClearFilters={onClearFilters}
        onDetails={(item) =>
          onDetails(item, () => {
            void catalogSearch.mutate();
          })
        }
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

  const query = useMemo(
    () => buildCatalogQuery(filters, debouncedSearchTerm),
    [debouncedSearchTerm, filters]
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
  const actions: CatalogActions = {
    onUse: (item) =>
      item.kind === "agent"
        ? onAgentClick(item.agent)
        : onSkillClick(item.skill),
    onPin,
    onDetails,
  };

  return (
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
  const { t } = useLingui();
  return (
    <div className="flex flex-col">
      {/* The search sticks below the Discover header. The negative margin stretches its
          background over the gap above it so scrolled results never show through. */}
      <div className="sticky top-(--discover-header-height) z-20 -mt-8 bg-(--color-panel-background) pb-8 pt-8">
        <SearchInput
          name="discover-search"
          placeholder={t`Search for agents or skills`}
          value={search}
          onChange={onSearchChange}
        />
      </div>
      {/* Isolated so z-indexed descendants (Sparkle scroll areas) stay below the sticky search. */}
      <div className="isolate grid grid-cols-1 gap-10 md:grid-cols-[12rem_1fr]">
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
  const { t } = useLingui();
  return (
    <nav
      aria-label={t({ message: "Filter", context: "noun, navigation label" })}
      className="flex flex-col gap-6 self-start"
    >
      <NavigationList>
        {CATALOG_VIEWS.map((v) => (
          <NavigationListItem
            key={v.id}
            label={t(v.label)}
            selected={view === v.id}
            onClick={() => onUpdateFilters({ view: v.id })}
          />
        ))}
      </NavigationList>
      <NavigationList>
        {CATALOG_KINDS.map((k) => (
          <NavigationListItem
            key={k.id}
            label={t(k.label)}
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
            {tags.map((tag) => (
              <NavigationListItem
                key={tag.sId}
                label={capitalizeWords(tag.name)}
                selected={tagId === tag.sId}
                onClick={() =>
                  onUpdateFilters({ tagId: tagId === tag.sId ? null : tag.sId })
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
  itemsQuery: CatalogQuery;
  isLoading: boolean;
  hasError: boolean;
  hasNextPage: boolean;
  onLoadMore?: () => void;
  canClearFilters: boolean;
  onClearFilters: () => void;
}

function CatalogResults({
  items,
  itemsQuery,
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
  const { t } = useLingui();
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
            title={t`Unable to load agents and skills`}
            message={t`Try again in a moment.`}
            action={null}
          />
        ) : (
          <EmptyCTA
            title={t`No agents or skills found`}
            message={t`Try another search or different filters.`}
            action={
              canClearFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  label={t`Clear filters`}
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
              onUse={() => {
                trackDiscoverItemSelect({
                  source: "catalog",
                  item,
                  catalogQuery: itemsQuery,
                });
                onUse(item);
              }}
              onPin={onPin && (() => onPin(item))}
              onDetails={() => {
                trackDiscoverItemDetailsOpen({
                  source: "catalog",
                  item,
                  catalogQuery: itemsQuery,
                });
                onDetails(item);
              }}
            />
          ))}
          {hasError && (
            <p className="py-4 text-center copy-sm text-warning-500">
              <Trans>Couldn't load more. Try again in a moment.</Trans>
            </p>
          )}
          {hasNextPage && onLoadMore && (
            <div className="flex justify-center pt-6">
              <Button
                variant="outline"
                size="sm"
                label={t`Load more`}
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
  const { t } = useLingui();
  const name = getItemName(item);
  const avatar =
    item.kind === "agent" ? (
      <Avatar size="md" visual={item.agent.pictureUrl} />
    ) : (
      <SkillCatalogAvatar icon={item.skill.icon} size="md" />
    );
  const useLabel =
    item.kind === "agent" ? t`Chat with ${name}` : t`Use ${name}`;
  const activeUsersCount = item.activeUsersCount;
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
          {activeUsersCount !== null && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Icon visual={Users01} size="xs" />
              <span aria-hidden>{formatNumber(activeUsersCount)}</span>
              <span className="sr-only">
                {t`${plural(activeUsersCount, {
                  one: "# active user",
                  other: "# active users",
                })}`}
              </span>
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
            tooltip={t`Pin to Featured`}
            aria-label={t`Pin ${name} to Featured`}
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
          label={t`Details`}
          aria-label={t`Show ${name} details`}
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
