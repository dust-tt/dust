import { isDustProvidedSkill } from "@app/lib/skill";
import type {
  AgentSearchFilters,
  SearchAgentsResponseBody,
} from "@app/types/agent_search/agent_search";
import type {
  SearchSkillsResponseBody,
  SkillSearchFilters,
} from "@app/types/api/skills";
import type { RichAgentMentionCandidate } from "@app/types/assistant/mentions";
import type { SkillListItemType } from "@app/types/assistant/skill_configuration";

type DiscoverAgentSearchResult = SearchAgentsResponseBody["agents"][number];
type DiscoverSkillSearchResult = SearchSkillsResponseBody["skills"][number];

type CatalogSkill = Pick<
  SkillListItemType,
  "sId" | "name" | "icon" | "userFacingDescription"
>;

interface CatalogMetadata {
  authors: readonly string[];
  isDustProvided: boolean;
  activeUsersCount: number | null;
}

export type CatalogItem = CatalogMetadata &
  (
    | { kind: "agent"; agent: RichAgentMentionCandidate }
    | { kind: "skill"; skill: CatalogSkill }
  );

export type SearchCatalogItem = CatalogItem & { isFavorite: boolean };

export type CatalogView = "favorites" | "popular" | "all" | "mine";
export type CatalogKind = "all" | CatalogItem["kind"];

export interface CatalogFilters {
  view: CatalogView;
  kind: CatalogKind;
  tagId: string | null;
}

export interface CatalogQuery extends CatalogFilters {
  key: string;
  searchTerm: string;
  showAgents: boolean;
  showSkills: boolean;
  sortBy: "usage" | "relevance" | "name";
  sortOrder: "asc" | "desc";
  limit: number;
  agentFilters: AgentSearchFilters;
  skillFilters: SkillSearchFilters;
}

const CATALOG_PAGE_SIZE = 50;
const CATALOG_SEARCH_MAX_LENGTH = 200;

export function buildCatalogQuery(
  filters: CatalogFilters,
  searchTerm: string
): CatalogQuery {
  const { view, kind, tagId } = filters;
  const normalizedSearchTerm = searchTerm.slice(0, CATALOG_SEARCH_MAX_LENGTH);
  const sortBy =
    view === "popular"
      ? "usage"
      : normalizedSearchTerm || view === "favorites"
        ? "relevance"
        : "name";
  const showAgents = kind !== "skill";
  // Tags are an agent-only concept, so filtering by one excludes skills.
  const showSkills = kind !== "agent" && tagId === null;

  return {
    ...filters,
    key: JSON.stringify({
      searchTerm: normalizedSearchTerm,
      view,
      kind,
      tagId,
    }),
    searchTerm: normalizedSearchTerm,
    showAgents,
    showSkills,
    sortBy,
    sortOrder: sortBy === "name" ? "asc" : "desc",
    limit: showAgents && showSkills ? CATALOG_PAGE_SIZE / 2 : CATALOG_PAGE_SIZE,
    agentFilters: {
      ...(tagId ? { tagIds: [tagId] } : {}),
      ...(view === "mine" ? { editedByMe: true } : {}),
    },
    skillFilters: {
      ...(view === "mine" ? { editedByMe: true } : {}),
    },
  };
}

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

export function toSearchAgentCatalogItem(
  agent: DiscoverAgentSearchResult
): SearchCatalogItem {
  return {
    kind: "agent",
    agent,
    authors: agent.editors.map((editor) => editor.fullName),
    isDustProvided: agent.scope === "global",
    activeUsersCount: agent.activeUsersCount,
    isFavorite: agent.userFavorite,
  };
}

export function toSearchSkillCatalogItem(
  skill: DiscoverSkillSearchResult
): SearchCatalogItem {
  return {
    kind: "skill",
    skill,
    authors: skill.editors.map((editor) => editor.fullName),
    isDustProvided: isDustProvidedSkill(skill),
    activeUsersCount: skill.activeUsersCount,
    isFavorite: skill.isFavorite,
  };
}

/**
 * @cc [owner:frankaloia,label:product] preserve-independent-search-ranks
 * Combined catalog results MUST alternate agents then skills by rank while preserving each
 * endpoint's internal order; exhausting one source MUST NOT reorder the remaining source.
 */
export function interleaveCatalogItems<T>(agents: T[], skills: T[]): T[] {
  const items: T[] = [];
  const maxLength = Math.max(agents.length, skills.length);
  for (let index = 0; index < maxLength; index++) {
    const agent = agents[index];
    const skill = skills[index];
    if (agent) {
      items.push(agent);
    }
    if (skill) {
      items.push(skill);
    }
  }
  return items;
}

export function deduplicateCatalogItems<T extends CatalogItem>(
  items: T[]
): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind}-${getItemId(item)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
