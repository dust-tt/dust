import { getSkillAvatarIcon } from "@app/lib/skill";
import { useUnifiedAgentConfigurations } from "@app/lib/swr/assistants";
import { useSkillsWithRelations } from "@app/lib/swr/skill_configurations";
import {
  compareForFuzzySort,
  getAgentSearchString,
  subFilter,
  tagsSorter,
} from "@app/lib/utils";
import type { GetSkillsWithRelationsResponseBody } from "@app/types/api/skills";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { WorkspaceType } from "@app/types/user";
import {
  Avatar,
  Button,
  Chip,
  EmptyCTA,
  Icon,
  MessageCircle01,
  NavigationList,
  NavigationListItem,
  Spinner,
  Users01,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

type DiscoverSkill = GetSkillsWithRelationsResponseBody["skills"][number];

type CatalogItem =
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

const CATALOG_KINDS: { id: CatalogKind; label: string }[] = [
  { id: "all", label: "Agents & Skills" },
  { id: "agent", label: "Agents" },
  { id: "skill", label: "Skills" },
];

function getItemId(item: CatalogItem): string {
  return item.kind === "agent" ? item.agent.sId : item.skill.sId;
}

function getItemName(item: CatalogItem): string {
  return item.kind === "agent" ? item.agent.name : item.skill.name;
}

function getItemDescription(item: CatalogItem): string {
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

function getItemAuthors(item: CatalogItem): readonly string[] {
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

function formatAuthors(authors: readonly string[]): string {
  if (authors.length === 1) {
    return authors[0];
  }
  const others = authors.length - 1;
  return `${authors[0]} and ${others} other${others > 1 ? "s" : ""}`;
}

interface DiscoverCatalogProps {
  owner: WorkspaceType;
  search: string;
  onAgentClick: (agent: LightAgentConfigurationType) => void;
  onSkillClick: (skill: DiscoverSkill) => void;
}

export function DiscoverCatalog({
  owner,
  search,
  onAgentClick,
  onSkillClick,
}: DiscoverCatalogProps) {
  const [view, setView] = useState<CatalogView>("all");
  const [kind, setKind] = useState<CatalogKind>("all");
  const [tagId, setTagId] = useState<string | null>(null);

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

  const items = useMemo(() => {
    const needle = search.trim().toLowerCase().replace(/^@/, "");
    const all: CatalogItem[] = [
      ...activeAgents.map((agent) => ({ kind: "agent" as const, agent })),
      ...skillsWithRelations.map((skill) => ({
        kind: "skill" as const,
        skill,
      })),
    ];

    const filtered = all.filter(
      (item) =>
        (kind === "all" || item.kind === kind) &&
        (tagId === null ||
          (item.kind === "agent" &&
            item.agent.tags.some((t) => t.sId === tagId))) &&
        (view !== "favorites" || isFavorite(item)) &&
        (view !== "mine" || isMine(item)) &&
        (!needle || subFilter(needle, getItemSearchString(item)))
    );

    return filtered.sort(
      (a, b) =>
        (needle
          ? compareForFuzzySort(
              needle,
              getItemSearchString(a),
              getItemSearchString(b)
            )
          : 0) ||
        (view === "popular"
          ? getItemUsageCount(b) - getItemUsageCount(a)
          : 0) ||
        getItemName(a).toLowerCase().localeCompare(getItemName(b).toLowerCase())
    );
  }, [activeAgents, skillsWithRelations, kind, tagId, view, search]);

  const hasActiveFilters = view !== "all" || kind !== "all" || tagId !== null;

  const clearFilters = () => {
    setView("all");
    setKind("all");
    setTagId(null);
  };

  const isLoading =
    (isAgentsLoading && activeAgents.length === 0) ||
    isSkillsWithRelationsLoading;

  return (
    <div className="grid grid-cols-1 gap-10 md:grid-cols-[12rem_1fr]">
      <nav
        aria-label="Filter"
        className="flex flex-col gap-6 self-start md:sticky md:top-6"
      >
        <NavigationList>
          {CATALOG_VIEWS.map((v) => (
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
              onClick={() => {
                setKind(k.id);
                if (k.id === "skill") {
                  setTagId(null);
                }
              }}
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
                onClick={() => setTagId(tagId === t.sId ? null : t.sId)}
              />
            ))}
          </NavigationList>
        )}
      </nav>
      <section className="flex min-w-0 flex-col">
        {isLoading ? (
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
            />
          ))
        )}
      </section>
    </div>
  );
}

interface CatalogRowProps {
  item: CatalogItem;
  onUse: () => void;
}

function CatalogRow({ item, onUse }: CatalogRowProps) {
  const authors = getItemAuthors(item);

  return (
    <div className="flex items-center gap-4 border-b border-separator py-4 last:border-b-0">
      {item.kind === "agent" ? (
        <Avatar size="lg" visual={item.agent.pictureUrl} className="shrink-0" />
      ) : (
        <SkillCatalogAvatar skill={item.skill} />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="heading-base notranslate text-foreground">
            {getItemName(item)}
          </span>
          {item.kind === "agent" && (
            <Chip
              size="xs"
              label={`@${item.agent.name}`}
              className="font-mono"
            />
          )}
        </div>
        <div className="flex h-5 items-center gap-4 copy-sm">
          {authors.length > 0 && (
            <span className="truncate text-foreground">
              {formatAuthors(authors)}
            </span>
          )}
          <span className="flex items-center gap-1 text-muted-foreground">
            <Icon visual={MessageCircle01} size="xs" />
            {getItemUsageCount(item).toLocaleString()}
            <span className="sr-only">
              {item.kind === "agent" ? "messages" : "uses"}
            </span>
          </span>
          {item.kind === "agent" && item.agent.usage && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Icon visual={Users01} size="xs" />
              {item.agent.usage.userCount.toLocaleString()}
              <span className="sr-only">members</span>
            </span>
          )}
        </div>
        <p className="copy-sm text-muted-foreground">
          {getItemDescription(item)}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        label={item.kind === "agent" ? "Chat" : "Use"}
        onClick={onUse}
        className="shrink-0"
      />
    </div>
  );
}

interface SkillCatalogAvatarProps {
  skill: DiscoverSkill;
}

function SkillCatalogAvatar({ skill }: SkillCatalogAvatarProps) {
  const SkillAvatar = useMemo(() => getSkillAvatarIcon(skill), [skill]);
  return <SkillAvatar size="lg" className="shrink-0" />;
}
