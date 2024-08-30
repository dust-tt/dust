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

    // Ensure that the node, or at least one of its ancestors, is within the
    // view. For parentInternalIds, include all of them  up to the highest one
    // in the hierarchy that is in the view, (which is last index, since parents
    // are ordered from leaf to root), or all of them  if the view is "full",
    // that is,  parentsIn is null.
    const indexToSplit = parentInternalIds.findLastIndex((p) =>
      dataSourceView.parentsIn?.includes(p)
    );
    const isInView = !viewHasParents || indexToSplit !== -1;

    if (isInView) {
      const parentIdsInView = !viewHasParents
        ? parentInternalIds
        : parentInternalIds.slice(0, indexToSplit + 1);

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
