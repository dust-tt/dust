import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { ContentNode } from "@app/types/connectors/connectors_api";

export type FetchChildResources = (parentId: string) => Promise<ContentNode[]>;

export type SelectableNodeWithParents = {
  node: ContentNode;
  parents: string[];
};

/**
 * @cc [owner:frankaloia,label:product] skip-prevented-nodes
 * Select All MUST NOT mark a node with `preventSelection === true` as selected.
 */
/**
 * @cc [owner:frankaloia,label:product] expand-prevented-containers
 * When Select All encounters an expandable node with `preventSelection === true` and
 * `fetchChildResources` is provided, it MUST fetch that node's children and select
 * the selectable descendants instead of the container. If `fetchChildResources` is
 * omitted, prevented nodes MUST be skipped and MUST NOT be selected.
 */
export async function collectSelectableNodesForSelectAll({
  nodes,
  parentIds,
  fetchChildResources,
  visitedInternalIds = new Set<string>(),
}: {
  nodes: ContentNode[];
  parentIds: string[];
  fetchChildResources?: FetchChildResources;
  visitedInternalIds?: Set<string>;
}): Promise<SelectableNodeWithParents[]> {
  const selected: SelectableNodeWithParents[] = [];
  const containersToExpand: ContentNode[] = [];

  for (const node of nodes) {
    if (visitedInternalIds.has(node.internalId)) {
      continue;
    }
    if (node.preventSelection !== true) {
      selected.push({ node, parents: parentIds });
      continue;
    }
    if (node.expandable && fetchChildResources) {
      containersToExpand.push(node);
    }
  }

  const fetchChildren = fetchChildResources;
  if (containersToExpand.length === 0 || !fetchChildren) {
    return selected;
  }

  const nested = await concurrentExecutor(
    containersToExpand,
    async (node) => {
      const nextVisited = new Set(visitedInternalIds);
      nextVisited.add(node.internalId);
      const children = await fetchChildren(node.internalId);
      return collectSelectableNodesForSelectAll({
        nodes: children,
        parentIds: [node.internalId, ...parentIds],
        fetchChildResources: fetchChildren,
        visitedInternalIds: nextVisited,
      });
    },
    { concurrency: 8 }
  );

  return [...selected, ...nested.flat()];
}

/**
 * @cc [owner:frankaloia,label:product] unselect-descendants
 * Unselect All at a tree level MUST unselect the currently visible nodes and any
 * already selected descendants of those nodes, including previously persisted
 * selections on non-selectable containers.
 */
type SelectionStatus = {
  isSelected: boolean;
  node: ContentNode;
  parents: string[];
};

export function unselectVisibleNodesAndDescendants(
  prev: Record<string, SelectionStatus>,
  filteredNodes: ContentNode[]
): Record<string, SelectionStatus> {
  const filteredIds = new Set(filteredNodes.map((n) => n.internalId));
  const newState: Record<string, SelectionStatus> = { ...prev };

  for (const [id, status] of Object.entries(prev)) {
    const isVisible = filteredIds.has(id);
    const isDescendant = (status.parents ?? []).some((parentId) =>
      filteredIds.has(parentId)
    );
    if (isVisible || isDescendant) {
      newState[id] = {
        ...status,
        isSelected: false,
        parents: [],
      };
    }
  }

  for (const node of filteredNodes) {
    newState[node.internalId] = {
      isSelected: false,
      node,
      parents: [],
    };
  }

  return newState;
}
