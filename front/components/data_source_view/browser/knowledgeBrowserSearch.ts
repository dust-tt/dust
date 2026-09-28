import type { NavigationHistoryEntryType } from "@app/components/data_source_view/context/types";
import { findSpaceFromNavigationHistory } from "@app/components/data_source_view/context/utils";
import type { DataSourceContentNode } from "@app/types/api/search";
import type {
  DataSourceViewContentNode,
  DataSourceViewType,
} from "@app/types/data_source_view";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";

export const ALL_KNOWLEDGE_SECTION_LABEL = "All knowledge";

export function getScopedSearchSectionLabel(scopeLabel: string): string {
  return `In "${scopeLabel}"`;
}

// Where a search typed inside the browser looks: a space, some of its data source views, or a
// folder subtree within one view.
export interface KnowledgeBrowserSearchScope {
  spaceId: string;
  // Undefined searches the whole space.
  dataSourceViewIds?: string[];
  parentId?: string;
}

/**
 * @cc [owner:smb2268,label:product] search-scope-follows-navigation
 * The scope MUST be `null` at the root, the whole space at the space level, the views of the
 * browsed category at the category level, the browsed view at the data source level, and the
 * browsed node as `parentId` within its view at the node level, so a scoped search covers the
 * subtree the user is looking at and nothing else.
 */
export function getKnowledgeBrowserSearchScope(
  navigationHistory: NavigationHistoryEntryType[],
  categoryDataSourceViews: DataSourceViewType[]
): KnowledgeBrowserSearchScope | null {
  const space = findSpaceFromNavigationHistory(navigationHistory);
  const entry = navigationHistory[navigationHistory.length - 1];
  if (!space) {
    return null;
  }
  switch (entry.type) {
    case "root":
      return null;
    case "space":
      return { spaceId: space.sId };
    case "category":
      return {
        spaceId: space.sId,
        dataSourceViewIds: categoryDataSourceViews.map((dsv) => dsv.sId),
      };
    case "data_source":
      return {
        spaceId: space.sId,
        dataSourceViewIds: [entry.dataSourceView.sId],
      };
    case "node":
      return {
        spaceId: space.sId,
        dataSourceViewIds: [entry.node.dataSourceView.sId],
        parentId: entry.node.internalId,
      };
    default:
      assertNeverAndIgnore(entry);
      return null;
  }
}

// Search results carry every view a node is visible through; the browser keeps the one in the
// searched space so the node attaches through that view.
export function toDataSourceViewContentNodes(
  nodes: DataSourceContentNode[],
  spaceId: string
): DataSourceViewContentNode[] {
  return removeNulls(
    nodes.map((node) => {
      const { dataSourceViews, ...rest } = node;
      const dataSourceView = dataSourceViews.find(
        (view) => view.spaceId === spaceId
      );
      return dataSourceView ? { ...rest, dataSourceView } : null;
    })
  );
}

// String form of the node identity `isEqualNode` compares, for use as a `Set` key.
export function getSearchResultKey(node: DataSourceViewContentNode): string {
  return `${node.dataSourceView.dataSource.sId}:${node.internalId}`;
}
