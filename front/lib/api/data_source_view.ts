import type { ContentNodeWithParentIds } from "@dust-tt/types";
import { removeNulls } from "@dust-tt/types";

import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";

export function filterAndCropContentNodesByView(
  dataSourceView: DataSourceViewResource,
  contentNodes: ContentNodeWithParentIds[]
): ContentNodeWithParentIds[] {
  const viewHasParents = dataSourceView.parentsIn !== null;

  // Filter out content nodes that are not in the view.
  // Update the parentInternalIds of the content nodes to only include the parentInternalIds that are in the view.
  const contentNodesInView = contentNodes.map((node) => {
    const { parentInternalIds } = node;

    if (!parentInternalIds) {
      return null;
    }

    // At the first parent that is in the view, we know the content node is in the view
    const indexToSplit = parentInternalIds.findIndex((p) =>
      dataSourceView.parentsIn?.includes(p)
    );
    const isInView = !viewHasParents || indexToSplit !== -1;

    if (isInView) {
      // for parents, we include all those up to the last one in the view
      // (or all of them if the view has no parents)
      const lastParentInViewIndex = parentInternalIds.findLastIndex((p) =>
        dataSourceView.parentsIn?.includes(p)
      );

      const parentIdsInView = !viewHasParents
        ? parentInternalIds
        : parentInternalIds.slice(0, lastParentInViewIndex + 1);

      return {
        ...node,
        parentInternalIds: parentIdsInView,
      };
    } else {
      return null;
    }
  });

  return removeNulls(contentNodesInView);
}
