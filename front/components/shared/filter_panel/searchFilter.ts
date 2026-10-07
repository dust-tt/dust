import {
  getModelTier,
  getTierIdForMetaModelId,
} from "@app/components/model_picker/modelPickerUtils";
import type { FilterHashSelection } from "@app/components/shared/filter_panel/filterHash";
import type {
  CategoryFilter,
  FilterOptionBase,
} from "@app/components/shared/filter_panel/filterState";
import { SKILL_AVAILABILITY_DISPLAY } from "@app/components/skills/skillAvailabilityDisplay";
import { DEFAULT_MCP_SERVER_ICON } from "@app/lib/actions/constants";
import type { MCPServerType } from "@app/lib/api/mcp";
import { compareStrings } from "@app/lib/i18n/format";
import { getSupportedModelConfigs } from "@app/lib/llms/model_configurations";
import type { AgentConfigurationScope } from "@app/types/assistant/agent";
import type { SkillAvailability } from "@app/types/assistant/skill_configuration_constants";
import { SKILL_AVAILABILITIES } from "@app/types/assistant/skill_configuration_constants";
import { GLOBAL_SPACE_NAME } from "@app/types/groups";
import { removeNulls } from "@app/types/shared/utils/general";
import type { SpaceType } from "@app/types/space";
import type { TagType } from "@app/types/tag";
import type { UserType } from "@app/types/user";
import type { MessageDescriptor } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import mapValues from "lodash/mapValues";

type Translate = (descriptor: MessageDescriptor) => string;

// Every category a search-backed listing (Manage Agents, Manage Skills) can filter on. Each listing
// picks its own categories and turns their selections into its search filters.
const SEARCH_FILTER_CATEGORY_LABEL = {
  access: msg({ message: "Access", context: "filter category" }),
  availability: msg({ message: "Availability", context: "filter category" }),
  editor: msg({ message: "Editors", context: "filter category" }),
  model: msg({ message: "Models", context: "filter category" }),
  skill: msg({ message: "Skills", context: "filter category" }),
  space: msg({ message: "Spaces", context: "filter category" }),
  tag: msg({ message: "Tags", context: "filter category" }),
  tool: msg({ message: "Tools", context: "filter category" }),
  usage: msg({ message: "Usage", context: "filter category" }),
};

export type SearchFilterCategory = keyof typeof SEARCH_FILTER_CATEGORY_LABEL;

const SEARCH_FILTER_CATEGORY_SINGULAR_LABEL: Record<
  SearchFilterCategory,
  MessageDescriptor
> = {
  access: msg({ message: "Access", context: "filter category" }),
  availability: msg({ message: "Availability", context: "filter category" }),
  editor: msg({ message: "Editor", context: "filter category" }),
  model: msg({ message: "Model", context: "filter category" }),
  skill: msg({ message: "Skill", context: "filter category" }),
  space: msg({ message: "Space", context: "filter category" }),
  tag: msg({ message: "Tag", context: "filter category" }),
  tool: msg({ message: "Tool", context: "filter category" }),
  usage: msg({ message: "Usage", context: "filter category" }),
};

export function getSearchFilterCategoryLabels(
  t: Translate
): Record<SearchFilterCategory, string> {
  return mapValues(SEARCH_FILTER_CATEGORY_LABEL, (label) => t(label));
}

export function getSearchFilterCategorySingularLabels(
  t: Translate
): Record<SearchFilterCategory, string> {
  return mapValues(SEARCH_FILTER_CATEGORY_SINGULAR_LABEL, (label) => t(label));
}

export type SearchFilterOption = FilterOptionBase &
  (
    | { category: "access"; id: Exclude<AgentConfigurationScope, "global"> }
    | { category: "availability"; id: SkillAvailability }
    | { category: "editor"; image: string | null }
    | { category: "model" }
    | { category: "skill"; icon: string | null }
    | { category: "space" }
    | { category: "tag" }
    | {
        category: "tool";
        icon: MCPServerType["icon"];
        mcpServerViewIds: string[];
      }
    | { category: "usage"; min: number; max: number }
  );

export type SearchFilter<Category extends SearchFilterCategory> =
  CategoryFilter<Category, SearchFilterOption>;

interface SearchFilterSkillFacetValue {
  sId: string;
  name: string;
  icon: string | null;
}

interface SearchFilterToolFacetValue {
  sId: string;
  mcpServerId: string;
  name: string;
  icon: MCPServerType["icon"];
}

// The facet values the options are built from; agent and skill search responses both fit.
export interface SearchFilterFacets {
  availability?: { availability: SkillAvailability }[];
  editors?: Pick<UserType, "sId" | "fullName" | "image">[];
  models?: { modelId: string }[];
  skills?: SearchFilterSkillFacetValue[];
  spaces?: Pick<SpaceType, "sId" | "name" | "kind">[];
  tags?: Pick<TagType, "sId" | "name">[];
  mcpServerViews?: SearchFilterToolFacetValue[];
  // Bounds of the active users count; null when no matching resource has usage.
  usage?: { min: number | null; max: number | null };
}

const ACCESS_FILTER_OPTIONS: {
  id: Exclude<AgentConfigurationScope, "global">;
  name: MessageDescriptor;
}[] = [
  { id: "visible", name: msg`Published` },
  { id: "hidden", name: msg`Not published` },
];

export function getModelFilterDisplayName(
  modelId: string,
  t: Translate
): string {
  const tierId = getTierIdForMetaModelId(modelId);
  if (tierId) {
    return t(getModelTier(tierId).name);
  }
  return (
    getSupportedModelConfigs().find((model) => model.modelId === modelId)
      ?.displayName ?? modelId
  );
}

// One option per MCP server, filtering on every view of it that matching resources use.
function toToolFilterOptions(
  views: SearchFilterToolFacetValue[]
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
    compareStrings(a.name, b.name)
  );
}

// Access options are static; the others are the values held by the matching resources.
/**
 * @cc [owner:aubin-tchoi,label:product] current-editor-name
 * Editor options MUST use the editor's full name, with ` (You)` (translated) appended for the
 * current user. The current user's option MUST be listed first when present.
 */
export function getSearchFilterOptions(
  category: SearchFilterCategory,
  facets: SearchFilterFacets | undefined,
  currentUserId: string,
  t: Translate
): SearchFilterOption[] {
  switch (category) {
    case "access":
      return ACCESS_FILTER_OPTIONS.map(({ id, name }) => ({
        category: "access",
        id,
        name: t(name),
        disabled: false,
      }));
    case "availability": {
      const availabilities = new Set(
        (facets?.availability ?? []).map(({ availability }) => availability)
      );
      return SKILL_AVAILABILITIES.filter((availability) =>
        availabilities.has(availability)
      ).map((availability) => ({
        category: "availability",
        id: availability,
        name: t(SKILL_AVAILABILITY_DISPLAY[availability].label),
        disabled: false,
      }));
    }
    case "editor":
      return (facets?.editors ?? [])
        .map((editor): SearchFilterOption => {
          const { fullName } = editor;
          return {
            category: "editor",
            id: editor.sId,
            name:
              editor.sId === currentUserId
                ? t(msg`${fullName} (You)`)
                : fullName,
            image: editor.image,
            disabled: false,
          };
        })
        .toSorted(
          (a, b) =>
            Number(b.id === currentUserId) - Number(a.id === currentUserId)
        );
    case "model":
      return (facets?.models ?? [])
        .map(({ modelId }): SearchFilterOption => ({
          category: "model",
          id: modelId,
          name: getModelFilterDisplayName(modelId, t),
          disabled: false,
        }))
        .toSorted((a, b) => compareStrings(a.name, b.name));
    case "skill":
      return (facets?.skills ?? [])
        .map((skill): SearchFilterOption => ({
          category: "skill",
          id: skill.sId,
          name: skill.name,
          icon: skill.icon,
          disabled: false,
        }))
        .toSorted((a, b) => compareStrings(a.name, b.name));
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
    // The usage range is picked on a slider, not among options.
    case "usage":
      return [];
  }
}

export interface SearchFilterPreset<Category extends SearchFilterCategory> {
  category: Category;
  categoryLabel: string;
  options: SearchFilterOption[];
}

/**
 * @cc [owner:aubin-tchoi,label:product] search-filter-presets
 * Presets MUST be offered for every listed category they apply to, whatever the current selection:
 * `FilterSummaryChips` hides a preset while all its options are selected. The "Editor is Me"
 * preset MUST select the current user's editor option, named as `getSearchFilterOptions` names it.
 */
export function getSearchFilterPresets<Category extends SearchFilterCategory>({
  categories,
  currentUser,
  t,
}: {
  categories: readonly Category[];
  currentUser: UserType;
  t: Translate;
}): SearchFilterPreset<Category>[] {
  return removeNulls(
    categories.map((category) =>
      category === "editor"
        ? {
            category,
            categoryLabel: getSearchFilterCategorySingularLabels(t).editor,
            options: getSearchFilterOptions(
              "editor",
              { editors: [currentUser] },
              currentUser.sId,
              t
            ),
          }
        : null
    )
  );
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

// Tool selections hold MCP server view IDs; the other categories hold option IDs.
export type SearchFilterSelection<Category extends SearchFilterCategory> =
  FilterHashSelection<Category>;

export function toSearchFilterSelection<Category extends SearchFilterCategory>(
  filter: SearchFilter<Category>,
  categories: readonly Category[]
): SearchFilterSelection<Category> {
  const selection: SearchFilterSelection<Category> = {};
  for (const category of categories) {
    const labels = Object.fromEntries(
      (filter[category] ?? []).flatMap((option) =>
        option.category === "tool"
          ? option.mcpServerViewIds.map((viewId) => [viewId, option.name])
          : [[option.id, option.name]]
      )
    );
    if (Object.keys(labels).length > 0) {
      selection[category] = labels;
    }
  }
  return selection;
}

export function getSearchFilterOptionKeys(
  option: SearchFilterOption
): string[] {
  return option.category === "tool"
    ? option.mcpServerViewIds.map((viewId) => `tool:${viewId}`)
    : [`${option.category}:${option.id}`];
}

// Stands for a selected ID that no facet names; null for IDs that cannot be valid.
function toUnresolvedOption(
  category: SearchFilterCategory,
  id: string,
  name: string
): SearchFilterOption | null {
  switch (category) {
    case "access":
    case "availability":
    case "usage":
      return null;
    case "editor":
      return { category, id, name, image: null, disabled: false };
    case "skill":
      return { category, id, name, icon: null, disabled: false };
    case "model":
    case "space":
    case "tag":
      return { category, id, name, disabled: false };
    case "tool":
      return {
        category,
        id,
        name,
        icon: DEFAULT_MCP_SERVER_ICON,
        mcpServerViewIds: [],
        disabled: false,
      };
  }
}

/**
 * @cc [owner:tdraier,label:product] resolve-every-selected-id
 * Every selected ID that can be valid MUST be kept in the resolved filter, named from `facets`,
 * then `knownOptions`, and otherwise by an unresolved placeholder carrying its selected label and
 * listed in `unresolvedKeys`.
 * Usage IDs MUST be named from the range they encode. Access, availability and usage IDs that
 * match no option MUST be dropped. Tool options MUST carry only the selected view IDs, grouped by
 * MCP server.
 */
export function resolveSearchFilterSelection<
  Category extends SearchFilterCategory,
>({
  selection,
  categories,
  knownOptions,
  facets,
  currentUserId,
  t,
}: {
  selection: SearchFilterSelection<Category>;
  categories: readonly Category[];
  knownOptions: ReadonlyMap<string, SearchFilterOption>;
  facets: SearchFilterFacets | undefined;
  currentUserId: string;
  t: Translate;
}): {
  filter: SearchFilter<Category>;
  unresolvedCategories: Category[];
  unresolvedKeys: ReadonlySet<string>;
} {
  // Availability names derive from their IDs alone.
  const allFacets: SearchFilterFacets = {
    ...facets,
    availability: SKILL_AVAILABILITIES.map((availability) => ({
      availability,
    })),
  };
  const filter: SearchFilter<Category> = {};
  const unresolvedCategories: Category[] = [];
  const unresolvedKeys = new Set<string>();

  for (const category of categories) {
    const optionsByKey = new Map(
      getSearchFilterOptions(category, allFacets, currentUserId, t).flatMap(
        (option) =>
          getSearchFilterOptionKeys(option).map((key) => [key, option])
      )
    );
    const optionsById = new Map<string, SearchFilterOption>();
    const toolViewIdsById = new Map<string, string[]>();
    let isCategoryResolved = true;
    for (const [id, label] of Object.entries(selection[category] ?? {})) {
      const key = `${category}:${id}`;
      const resolved =
        optionsByKey.get(key) ??
        knownOptions.get(key) ??
        (category === "usage" ? parseUsageFilterOption(id, t) : undefined);
      const option = resolved ?? toUnresolvedOption(category, id, label);
      if (!option) {
        continue;
      }
      if (!resolved) {
        unresolvedKeys.add(key);
        isCategoryResolved = false;
      }
      if (!optionsById.has(option.id)) {
        optionsById.set(option.id, option);
      }
      if (option.category === "tool") {
        const viewIds = toolViewIdsById.get(option.id) ?? [];
        viewIds.push(id);
        toolViewIdsById.set(option.id, viewIds);
      }
    }
    if (optionsById.size > 0) {
      filter[category] = [...optionsById.values()].map((option) =>
        option.category === "tool"
          ? {
              ...option,
              mcpServerViewIds: toolViewIdsById.get(option.id) ?? [],
            }
          : option
      );
    }
    if (!isCategoryResolved) {
      unresolvedCategories.push(category);
    }
  }

  return { filter, unresolvedCategories, unresolvedKeys };
}

export function toUsageFilterOption(
  {
    min,
    max,
  }: {
    min: number;
    max: number;
  },
  t: Translate
): SearchFilterOption {
  const usageRange = min === max ? `${min}` : `${min}–${max}`;
  return {
    category: "usage",
    id: `${min}-${max}`,
    name: t(
      msg`${plural(max, {
        one: `${usageRange} active user`,
        other: `${usageRange} active users`,
      })}`
    ),
    min,
    max,
    disabled: false,
  };
}

function parseUsageFilterOption(
  id: string,
  t: Translate
): SearchFilterOption | undefined {
  const match = /^(\d+)-(\d+)$/.exec(id);
  if (!match) {
    return undefined;
  }
  const min = Number(match[1]);
  const max = Number(match[2]);
  return Number.isSafeInteger(min) && Number.isSafeInteger(max) && min <= max
    ? toUsageFilterOption({ min, max }, t)
    : undefined;
}

export function getSearchFilterActiveUsersCount<
  Category extends SearchFilterCategory,
>(filter: SearchFilter<Category>): { min: number; max: number } | undefined {
  const option = Object.values<SearchFilterOption[] | undefined>(filter)
    .flat()
    .find((candidate) => candidate?.category === "usage");
  return option?.category === "usage"
    ? { min: option.min, max: option.max }
    : undefined;
}
