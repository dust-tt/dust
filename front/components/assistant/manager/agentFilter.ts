import {
  getModelTier,
  getTierIdForMetaModelId,
} from "@app/components/model_picker/modelPickerUtils";
import type {
  CategoryFilter,
  FilterOptionBase,
} from "@app/components/shared/filter_panel/filterState";
import { getSupportedModelConfigs } from "@app/lib/llms/model_configurations";
import type { AgentSearchFilters } from "@app/types/agent_search/agent_search";
import type { AgentConfigurationScope } from "@app/types/assistant/agent";

export const AGENT_FILTER_CATEGORIES = [
  "access",
  "editor",
  "model",
  "tag",
] as const;

export type AgentFilterCategory = (typeof AGENT_FILTER_CATEGORIES)[number];

export const AGENT_FILTER_CATEGORY_LABEL: Record<AgentFilterCategory, string> =
  {
    access: "Access",
    editor: "Editors",
    model: "Models",
    tag: "Tags",
  };

export const AGENT_FILTER_CATEGORY_SINGULAR_LABEL: Record<
  AgentFilterCategory,
  string
> = {
  access: "Access",
  editor: "Editor",
  model: "Model",
  tag: "Tag",
};

export type AgentFilterOption = FilterOptionBase &
  (
    | { category: "access"; id: Exclude<AgentConfigurationScope, "global"> }
    | { category: "editor"; image: string | null }
    | { category: "model" }
    | { category: "tag" }
  );

export type AgentFilter = CategoryFilter<
  AgentFilterCategory,
  AgentFilterOption
>;

const AGENT_ACCESS_SCOPES: AgentConfigurationScope[] = ["visible", "hidden"];

export const AGENT_ACCESS_FILTER_OPTIONS: AgentFilterOption[] = [
  { category: "access", id: "visible", name: "Published", disabled: false },
  { category: "access", id: "hidden", name: "Not published", disabled: false },
];

export function getAgentModelDisplayName(modelId: string): string {
  const tierId = getTierIdForMetaModelId(modelId);
  if (tierId) {
    return getModelTier(tierId).name;
  }
  return (
    getSupportedModelConfigs().find((model) => model.modelId === modelId)
      ?.displayName ?? modelId
  );
}

// Access narrows the tab's scope and is ignored where it cannot apply (the Default tab); the other
// categories add their own filter.
export function toAgentSearchFilters(
  filter: AgentFilter,
  tabFilters: AgentSearchFilters
): AgentSearchFilters {
  const ids = (category: AgentFilterCategory) =>
    (filter[category] ?? []).map((option) => option.id);
  const access = ids("access");
  const scope =
    access.length > 0
      ? (tabFilters.scope ?? AGENT_ACCESS_SCOPES).filter((tabScope) =>
          access.some((selected) => selected === tabScope)
        )
      : [];
  const editorIds = ids("editor");
  const modelIds = ids("model");
  const tagIds = ids("tag");

  return {
    ...tabFilters,
    ...(scope.length > 0 ? { scope } : {}),
    ...(editorIds.length > 0 ? { editorIds } : {}),
    ...(modelIds.length > 0 ? { modelIds } : {}),
    ...(tagIds.length > 0 ? { tagIds } : {}),
  };
}
