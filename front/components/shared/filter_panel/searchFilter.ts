import {
  getModelTier,
  getTierIdForMetaModelId,
} from "@app/components/model_picker/modelPickerUtils";
import type {
  CategoryFilter,
  FilterOptionBase,
} from "@app/components/shared/filter_panel/filterState";
import type { MCPServerType } from "@app/lib/api/mcp";
import { getSupportedModelConfigs } from "@app/lib/llms/model_configurations";
import { SKILL_AVAILABILITY_DISPLAY } from "@app/lib/skills/labels";
import type { AgentConfigurationScope } from "@app/types/assistant/agent";
import type { SkillAvailability } from "@app/types/assistant/skill_configuration_constants";
import { SKILL_AVAILABILITIES } from "@app/types/assistant/skill_configuration_constants";
import { GLOBAL_SPACE_NAME } from "@app/types/groups";
import type { SpaceType } from "@app/types/space";
import type { TagType } from "@app/types/tag";
import type { UserType } from "@app/types/user";

// Every category a search-backed listing (Manage Agents, Manage Skills) can filter on. Each listing
// picks its own categories and turns their selections into its search filters.
export const SEARCH_FILTER_CATEGORY_LABEL = {
  access: "Access",
  availability: "Availability",
  editor: "Editors",
  model: "Models",
  space: "Spaces",
  tag: "Tags",
  tool: "Tools",
} as const;

export type SearchFilterCategory = keyof typeof SEARCH_FILTER_CATEGORY_LABEL;

export const SEARCH_FILTER_CATEGORY_SINGULAR_LABEL: Record<
  SearchFilterCategory,
  string
> = {
  access: "Access",
  availability: "Availability",
  editor: "Editor",
  model: "Model",
  space: "Space",
  tag: "Tag",
  tool: "Tool",
};

export type SearchFilterOption = FilterOptionBase &
  (
    | { category: "access"; id: Exclude<AgentConfigurationScope, "global"> }
    | { category: "availability"; id: SkillAvailability }
    | { category: "editor"; image: string | null }
    | { category: "model" }
    | { category: "space" }
    | { category: "tag" }
    | {
        category: "tool";
        icon: MCPServerType["icon"];
        mcpServerViewIds: string[];
      }
  );

export type SearchFilter<Category extends SearchFilterCategory> =
  CategoryFilter<Category, SearchFilterOption>;

// The facet values the options are built from; agent and skill search responses both fit.
export interface SearchFilterFacets {
  availability?: { availability: SkillAvailability }[];
  editors?: Pick<UserType, "sId" | "fullName" | "image">[];
  models?: { modelId: string }[];
  spaces?: Pick<SpaceType, "sId" | "name" | "kind">[];
  tags?: Pick<TagType, "sId" | "name">[];
  mcpServerViews?: {
    sId: string;
    mcpServerId: string;
    name: string;
    icon: MCPServerType["icon"];
  }[];
}

const ACCESS_FILTER_OPTIONS: SearchFilterOption[] = [
  { category: "access", id: "visible", name: "Published", disabled: false },
  { category: "access", id: "hidden", name: "Not published", disabled: false },
];

export function getModelFilterDisplayName(modelId: string): string {
  const tierId = getTierIdForMetaModelId(modelId);
  if (tierId) {
    return getModelTier(tierId).name;
  }
  return (
    getSupportedModelConfigs().find((model) => model.modelId === modelId)
      ?.displayName ?? modelId
  );
}

// One option per MCP server, filtering on every view of it that matching resources use.
function toToolFilterOptions(
  views: NonNullable<SearchFilterFacets["mcpServerViews"]>
): SearchFilterOption[] {
  const optionsByServerId = new Map<
    string,
    Extract<SearchFilterOption, { category: "tool" }>
  >();
  for (const view of views) {
    const option = optionsByServerId.get(view.mcpServerId);
    if (option) {
      option.mcpServerViewIds.push(view.sId);
    } else {
      optionsByServerId.set(view.mcpServerId, {
        category: "tool",
        id: view.mcpServerId,
        name: view.name,
        icon: view.icon,
        mcpServerViewIds: [view.sId],
        disabled: false,
      });
    }
  }
  return [...optionsByServerId.values()].toSorted((a, b) =>
    a.name.localeCompare(b.name)
  );
}

// Access options are static; the others are the values held by the matching resources.
export function getSearchFilterOptions(
  category: SearchFilterCategory,
  facets: SearchFilterFacets | undefined,
  currentUserId: string
): SearchFilterOption[] {
  switch (category) {
    case "access":
      return ACCESS_FILTER_OPTIONS;
    case "availability": {
      const availabilities = new Set(
        (facets?.availability ?? []).map(({ availability }) => availability)
      );
      return SKILL_AVAILABILITIES.filter((availability) =>
        availabilities.has(availability)
      ).map((availability) => ({
        category: "availability",
        id: availability,
        name: SKILL_AVAILABILITY_DISPLAY[availability].label,
        disabled: false,
      }));
    }
    case "editor":
      // The current user is listed first, as "Me".
      return (facets?.editors ?? [])
        .map(
          (editor): SearchFilterOption => ({
            category: "editor",
            id: editor.sId,
            name: editor.sId === currentUserId ? "Me" : editor.fullName,
            image: editor.image,
            disabled: false,
          })
        )
        .toSorted(
          (a, b) =>
            Number(b.id === currentUserId) - Number(a.id === currentUserId)
        );
    case "model":
      return (facets?.models ?? [])
        .map(
          ({ modelId }): SearchFilterOption => ({
            category: "model",
            id: modelId,
            name: getModelFilterDisplayName(modelId),
            disabled: false,
          })
        )
        .toSorted((a, b) => a.name.localeCompare(b.name));
    case "space":
      return (facets?.spaces ?? []).map((space) => ({
        category: "space",
        id: space.sId,
        name: space.kind === "global" ? GLOBAL_SPACE_NAME : space.name,
        disabled: false,
      }));
    case "tag":
      return (facets?.tags ?? []).map((tag) => ({
        category: "tag",
        id: tag.sId,
        name: tag.name,
        disabled: false,
      }));
    case "tool":
      return toToolFilterOptions(facets?.mcpServerViews ?? []);
  }
}

export function getSearchFilterIds<Category extends SearchFilterCategory>(
  filter: SearchFilter<Category>,
  category: Category
): string[] {
  return (filter[category] ?? []).map((option) => option.id);
}

export function getSearchFilterMcpServerViewIds<
  Category extends SearchFilterCategory,
>(filter: SearchFilter<Category>): string[] {
  return Object.values<SearchFilterOption[] | undefined>(filter)
    .flat()
    .flatMap((option) =>
      option?.category === "tool" ? option.mcpServerViewIds : []
    );
}
