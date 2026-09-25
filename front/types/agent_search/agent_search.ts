import type { ElasticsearchBaseDocument } from "@app/lib/api/elasticsearch";
import type {
  AgentConfigurationScope,
  AgentConfigurationStatus,
} from "@app/types/assistant/agent";
import type {
  ModelIdType,
  ModelProviderIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import type { SpaceKind } from "@app/types/space";
import type { TagType } from "@app/types/tag";
import type { UserType } from "@app/types/user";

export interface AgentSearchDocumentModel {
  provider_id: ModelProviderIdType;
  model_id: ModelIdType;
  reasoning_effort: ReasoningEffort;
}

export interface AgentSearchDocument extends ElasticsearchBaseDocument {
  agent_id: string;
  status: AgentConfigurationStatus;
  scope: AgentConfigurationScope;
  model: AgentSearchDocumentModel | null;
  name: string;
  picture_url: string;
  last_edited_by_user_id: string | null;
  requested_space_ids: string[];
  created_at: string | null;
  updated_at: string | null;
  description: string;
  skill_ids: string[];
  mcp_server_view_ids: string[];
  tag_ids: string[];
  feedback_positive_count: number;
  feedback_negative_count: number;
  active_users_count: number | null;
  favorite_count: number;
  editor_ids: string[];
}

// OR within a dimension, AND across dimensions. Selection never replaces ACLs.
export interface AgentSearchFilters {
  // Omitted means active only. Draft and pending agents are never indexed.
  status?: Extract<AgentConfigurationStatus, "active" | "archived">[];
  scope?: AgentConfigurationScope[];
  tagIds?: string[];
  skillIds?: string[];
  mcpServerViewIds?: string[];
  editorIds?: string[];
  modelIds?: string[];
  spaceIds?: string[];
  // Inclusive bounds; agents without usage (default agents) never match.
  activeUsersCount?: { min?: number; max?: number };
  // Supports "edited by me", but not "not edited by me".
  editedByMe?: true;
}

export const AGENT_SEARCH_TERMS_FACETS = [
  "editors",
  "models",
  "tags",
  "skills",
  "spaces",
] as const;
export type AgentSearchTermsFacet = (typeof AGENT_SEARCH_TERMS_FACETS)[number];

export const AGENT_SEARCH_FACETS = [
  ...AGENT_SEARCH_TERMS_FACETS,
  "usage",
] as const;
export type AgentSearchFacet = (typeof AGENT_SEARCH_FACETS)[number];

// Bounds of a numeric facet; null when no matching agent holds a value.
export interface AgentSearchRangeFacetValue {
  min: number | null;
  max: number | null;
}

export interface AgentSearchFacetValue {
  value: string;
  count: number;
}

// Distinct indexed values of each requested facet, with the number of matching agents holding each.
export type AgentSearchFacetValues = Partial<
  Record<AgentSearchTermsFacet, AgentSearchFacetValue[]>
> & { usage?: AgentSearchRangeFacetValue };

export const AGENT_SEARCH_PERMISSION_FILTERINGS = [
  "strict",
  "unrestricted",
] as const;
export type AgentSearchPermissionFiltering =
  (typeof AGENT_SEARCH_PERMISSION_FILTERINGS)[number];

export const AGENT_SEARCH_SORTS = [
  "relevance",
  "usage",
  "name",
  "updatedAt",
] as const;
export type AgentSearchSort = (typeof AGENT_SEARCH_SORTS)[number];

export const AGENT_SEARCH_SORT_ORDERS = ["asc", "desc"] as const;
export type AgentSearchSortOrder = (typeof AGENT_SEARCH_SORT_ORDERS)[number];

export interface AgentSearchListItemType {
  sId: string;
  status: AgentConfigurationStatus;
  scope: AgentConfigurationScope;
  name: string;
  description: string;
  pictureUrl: string;
  // Default agents report the model they resolve to for the workspace; null only if unknown.
  model: {
    providerId: ModelProviderIdType;
    modelId: ModelIdType;
    reasoningEffort: ReasoningEffort;
  } | null;
  feedbacks: { up: number; down: number };
  requestedSpaceIds: string[];
  tagIds: string[];
  editorIds: string[];
  editedBy: string | null;
  activeUsersCount: number | null;
  updatedAt: number | null;
}

export type SearchAgentsResponseBody = {
  agents: (AgentSearchListItemType & {
    editors: Pick<UserType, "sId" | "fullName" | "image">[];
    tags: Pick<TagType, "sId" | "name" | "kind">[];
  })[];
  total: number;
  hasMore: boolean;
  facets: {
    editors?: (Pick<UserType, "sId" | "fullName" | "image"> & {
      count: number;
    })[];
    models?: { modelId: string; count: number }[];
    tags?: (Pick<TagType, "sId" | "name" | "kind"> & { count: number })[];
    skills?: {
      sId: string;
      name: string;
      icon: string | null;
      count: number;
    }[];
    spaces?: { sId: string; name: string; kind: SpaceKind; count: number }[];
    usage?: AgentSearchRangeFacetValue;
  };
};
