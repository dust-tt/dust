import type { MCPServerViewTypeWithLabel } from "@app/components/agent_builder/MCPServerViewsContext";
import type { ActionSpecification } from "@app/components/agent_builder/types";

export const createSearchMatcher = (searchTerm: string) => {
  const searchTermLower = searchTerm.toLowerCase();

  return (text: string | undefined): boolean =>
    text?.toLowerCase().includes(searchTermLower) ?? false;
};

export const filterSearchableViews = (
  items: MCPServerViewTypeWithLabel[],
  searchTerm: string
): MCPServerViewTypeWithLabel[] => {
  if (!searchTerm.trim()) {
    return items;
  }

  const matchesSearchTerm = createSearchMatcher(searchTerm);

  return items.filter(
    (item) =>
      (item.description && matchesSearchTerm(item.description)) ||
      (item.name && matchesSearchTerm(item.name))
  );
};

export const doesDataVisualizationMatch = (
  dataVisualization: ActionSpecification | null,
  searchTerm: string
): boolean => {
  if (!searchTerm.trim() || !dataVisualization) {
    return !!dataVisualization;
  }

  const matchesSearchTerm = createSearchMatcher(searchTerm);

  return (
    matchesSearchTerm(dataVisualization.label) ||
    matchesSearchTerm(dataVisualization.description)
  );
};
