import { getSkillAvatarIcon, isDustProvidedSkill } from "@app/lib/skill";
import { useUnifiedAgentConfigurations } from "@app/lib/swr/assistants";
import { useSkillsWithRelations } from "@app/lib/swr/skill_configurations";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import {
  compareForFuzzySort,
  getAgentSearchString,
  subFilter,
  tagsSorter,
} from "@app/lib/utils";
import type { GetSkillsWithRelationsResponseBody } from "@app/types/api/skills";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
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
  MessageCircle01,
  NavigationList,
  NavigationListItem,
  Pin02,
  SearchInput,
  Spinner,
  Users01,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

export type DiscoverSkill =
  GetSkillsWithRelationsResponseBody["skills"][number];

export type CatalogItem =
  | { kind: "agent"; agent: LightAgentConfigurationType }
  | { kind: "skill"; skill: DiscoverSkill };

type CatalogView = "favorites" | "popular" | "all" | "mine";

const CATALOG_VIEWS: { id: CatalogView; label: string }[] = [
  { id: "favorites", label: "Favorites" },
  { id: "popular", label: "Most Popular" },
  { id: "all", label: "All" },
  { id: "mine", label: "Mine" },
];

type CatalogKind = "all" | CatalogItem["kind"];

interface CatalogFilters {
  view: CatalogView;
  kind: CatalogKind;
  tagId: string | null;
}

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

export function getItemId(item: CatalogItem): string {
  return item.kind === "agent" ? item.agent.sId : item.skill.sId;
}

export function getItemName(item: CatalogItem): string {
  return item.kind === "agent" ? item.agent.name : item.skill.name;
}

export function getItemDescription(item: CatalogItem): string {
  return item.kind === "agent"
    ? item.agent.description
    : item.skill.userFacingDescription;
}

function getItemSearchString(item: CatalogItem): string {
  if (item.kind === "agent") {
    return getAgentSearchString(item.agent);
  }
  return [item.skill.name, ...getItemAuthors(item)].join(" ").toLowerCase();
}

function capitalizeWords(text: string): string {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

function getItemUsageCount(item: CatalogItem): number {
  return item.kind === "agent"
    ? (item.agent.usage?.messageCount ?? 0)
    : (item.skill.usage ?? 0);
}

export function getItemAuthors(item: CatalogItem): readonly string[] {
  return item.kind === "agent"
    ? (item.agent.lastAuthors ?? [])
    : (item.skill.relations.editors ?? []).map((e) => e.fullName);
}

function isFavorite(item: CatalogItem): boolean {
  return item.kind === "agent"
    ? item.agent.userFavorite
    : !!item.skill.isFavorite;
}

function isMine(item: CatalogItem): boolean {
  return item.kind === "agent" ? item.agent.canEdit : item.skill.canWrite;
}

function isDustProvided(item: CatalogItem): boolean {
  return item.kind === "agent"
    ? item.agent.scope === "global"
    : isDustProvidedSkill(item.skill);
}

interface ItemAuthorProps {
  item: CatalogItem;
}

export function ItemAuthor({ item }: ItemAuthorProps) {
  if (isDustProvided(item)) {
    return (
      <span className="flex shrink-0 items-center gap-1 text-highlight">
        <Icon visual={CheckVerified01} size="xs" />
        Dust
      </span>
    );
  }
  const authors = getItemAuthors(item);
  if (authors.length === 0) {
    return null;
  }
  return (
    <span className="truncate text-foreground">{formatAuthors(authors)}</span>
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
  onAgentClick: (agent: LightAgentConfigurationType) => void;
  onSkillClick: (skill: DiscoverSkill) => void;
  onPin?: (item: CatalogItem) => void;
  onDetails: (item: CatalogItem) => void;
  onFiltersChange: () => void;
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
  const { view, kind, tagId } = filters;

  const updateFilters = (update: Partial<CatalogFilters>) => {
    setFilters((current) => ({ ...current, ...update }));
    onFiltersChange();
  };

  const { agentConfigurations, isLoading: isAgentsLoading } =
    useUnifiedAgentConfigurations({ workspaceId: owner.sId });
  // Only skills list exposing editors, favorites and usage together; shares the Manage Skills cache.
  const { skillsWithRelations, isSkillsWithRelationsLoading } =
    useSkillsWithRelations({ owner, status: "active", withUsage: true });

  const activeAgents = useMemo(
    () => agentConfigurations.filter((a) => a.status === "active"),
    [agentConfigurations]
  );

  const tags = useMemo(
    () =>
      Array.from(
        new Map(
          activeAgents.flatMap((a) => a.tags).map((t) => [t.sId, t])
        ).values()
      ).sort(tagsSorter),
    [activeAgents]
  );

  const entries = useMemo(
    () =>
      [
        ...activeAgents.map((agent) => ({ kind: "agent" as const, agent })),
        ...skillsWithRelations.map((skill) => ({
          kind: "skill" as const,
          skill,
        })),
      ].map((item: CatalogItem) => ({
        item,
        searchString: getItemSearchString(item),
        sortName: getItemName(item).toLowerCase(),
      })),
    [activeAgents, skillsWithRelations]
  );

  const needle = search.trim().toLowerCase().replace(/^@/, "");

  const items = useMemo(
    () =>
      entries
        .filter(
          ({ item, searchString }) =>
            (kind === "all" || item.kind === kind) &&
            (tagId === null ||
              (item.kind === "agent" &&
                item.agent.tags.some((t) => t.sId === tagId))) &&
            (view !== "favorites" || isFavorite(item)) &&
            (view !== "mine" || isMine(item)) &&
            (!needle || subFilter(needle, searchString))
        )
        .sort(
          (a, b) =>
            (needle
              ? compareForFuzzySort(needle, a.searchString, b.searchString)
              : 0) ||
            (view === "popular"
              ? getItemUsageCount(b.item) - getItemUsageCount(a.item)
              : 0) ||
            a.sortName.localeCompare(b.sortName)
        )
        .map(({ item }) => item),
    [entries, kind, tagId, view, needle]
  );

  const hasActiveFilters =
    view !== "all" || kind !== "all" || tagId !== null || needle !== "";

  const clearFilters = () => {
    updateFilters(DEFAULT_FILTERS);
    setSearch("");
  };

  const isInitialLoading =
    (isAgentsLoading && activeAgents.length === 0) ||
    isSkillsWithRelationsLoading;
  const isRefreshing = isAgentsLoading && !isInitialLoading;

  return (
    <div className="flex flex-col gap-8">
      <SearchInput
        name="discover-search"
        placeholder="Search for agents or skills"
        value={search}
        onChange={(value) => {
          setSearch(value);
          onFiltersChange();
        }}
      />
      <div className="grid grid-cols-1 gap-10 md:grid-cols-[12rem_1fr]">
        <nav aria-label="Filter" className="flex flex-col gap-6 self-start">
          <NavigationList>
            {CATALOG_VIEWS.map((v) => (
              <NavigationListItem
                key={v.id}
                label={v.label}
                selected={view === v.id}
                onClick={() => updateFilters({ view: v.id })}
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
                  updateFilters(
                    k.id === "skill"
                      ? { kind: k.id, tagId: null }
                      : { kind: k.id }
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
                    updateFilters({ tagId: tagId === t.sId ? null : t.sId })
                  }
                />
              ))}
            </NavigationList>
          )}
        </nav>
        <section className="relative flex min-w-0 flex-col">
          {isRefreshing && (
            <div className="absolute right-0 top-0">
              <Spinner size="xs" />
            </div>
          )}
          {isInitialLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : items.length === 0 ? (
            <EmptyCTA
              title="No agents or skills found"
              message="Try another search or different filters."
              action={
                hasActiveFilters && (
                  <Button
                    variant="outline"
                    size="sm"
                    label="Clear filters"
                    onClick={clearFilters}
                  />
                )
              }
            />
          ) : (
            items.map((item) => (
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
            ))
          )}
        </section>
      </div>
    </div>
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
  const avatarSize = useIsMobile() ? "md" : "lg";
  return (
    <div
      onClick={onDetails}
      className={cn(
        "group grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2",
        "border-b border-separator py-4 last:border-b-0 md:gap-y-1"
      )}
    >
      <button
        type="button"
        aria-label={`Show ${name} details`}
        onClick={(event) => {
          event.stopPropagation();
          onDetails();
        }}
        className="col-start-1 row-start-1 shrink-0 rounded-2xl transition duration-200 ease-out hover:brightness-110 active:brightness-90 md:row-span-2"
      >
        {item.kind === "agent" ? (
          <Avatar size={avatarSize} visual={item.agent.pictureUrl} />
        ) : (
          <SkillCatalogAvatar skill={item.skill} size={avatarSize} />
        )}
      </button>
      <div className="col-start-2 col-end-4 row-start-1 flex min-w-0 items-center gap-2 self-center md:col-end-3 md:self-end">
        <span className="heading-base notranslate truncate text-foreground">
          {name}
        </span>
        <Chip
          size="xs"
          label={
            item.kind === "agent"
              ? `@${item.agent.name}`
              : `/${item.skill.name}`
          }
          className="shrink-0 font-mono"
        />
      </div>
      <div className="col-start-1 col-end-3 row-start-2 flex min-w-0 flex-col gap-1 self-start md:col-start-2">
        <div className="flex h-5 items-center gap-4 copy-sm">
          <ItemAuthor item={item} />
          <span className="flex items-center gap-1 text-muted-foreground">
            <Icon visual={MessageCircle01} size="xs" />
            {getItemUsageCount(item).toLocaleString()}
            <span className="sr-only">
              {item.kind === "agent" ? "messages" : "uses"}
            </span>
          </span>
          {item.kind === "agent" && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Icon visual={Users01} size="xs" />
              {(item.agent.usage?.userCount ?? 0).toLocaleString()}
              <span className="sr-only">members</span>
            </span>
          )}
        </div>
        <p className="copy-sm line-clamp-2 text-muted-foreground">
          {getItemDescription(item)}
        </p>
      </div>
      <div
        onClick={(event) => event.stopPropagation()}
        className="col-start-3 row-start-2 flex shrink-0 items-center gap-1 self-end md:row-span-2 md:row-start-1 md:self-center"
      >
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
  skill: DiscoverSkill;
  size?: "md" | "lg";
}

export function SkillCatalogAvatar({
  skill,
  size = "lg",
}: SkillCatalogAvatarProps) {
  const SkillAvatar = useMemo(
    () => getSkillAvatarIcon(skill.icon),
    [skill.icon]
  );
  return <SkillAvatar size={size} className="shrink-0" />;
}
