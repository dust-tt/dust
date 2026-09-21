import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type {
  ContentNode,
  ContentNodeWithParent,
} from "@app/types/connectors/connectors_api";
import type { FetchChildResourcesError } from "@app/types/connectors/content_nodes";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type FetchChildResources = (
  parentId: string
) => Promise<Result<ContentNode[], FetchChildResourcesError>>;

export type SelectableNodeWithParents = {
  node: ContentNode;
  parents: string[];
};

export type SelectAllCollection = {
  nodes: SelectableNodeWithParents[];
  skippedNodes: ContentNode[];
};

type SelectionStatus = {
  isSelected: boolean;
  node: ContentNode;
  parents: string[];
};

type NodeWithParents = {
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
/**
 * @cc [owner:frankaloia,label:product] continue-after-inaccessible-container
 * When loading a container fails with `resource_inaccessible`, Select All MUST
 * continue through other containers and report the inaccessible container in
 * `skippedNodes`. Fatal failures MUST abort the collection.
 */
export async function collectSelectableNodesForSelectAll({
  nodes,
  parentIds,
  fetchChildResources,
}: {
  nodes: ContentNode[];
  parentIds: string[];
  fetchChildResources?: FetchChildResources;
}): Promise<Result<SelectAllCollection, Error>> {
  const selected: SelectableNodeWithParents[] = [];
  const skippedNodes: ContentNode[] = [];
  const visitedInternalIds = new Set<string>();
  let currentLevel: NodeWithParents[] = nodes.map((node) => ({
    node,
    parents: parentIds,
  }));

  while (currentLevel.length > 0) {
    const containersToExpand: NodeWithParents[] = [];

    for (const item of currentLevel) {
      if (visitedInternalIds.has(item.node.internalId)) {
        continue;
      }
      visitedInternalIds.add(item.node.internalId);

      if (item.node.preventSelection !== true) {
        selected.push(item);
        continue;
      }
      if (item.node.expandable && fetchChildResources) {
        containersToExpand.push(item);
      }
    }

    if (containersToExpand.length === 0 || !fetchChildResources) {
      break;
    }

    const childResults = await concurrentExecutor(
      containersToExpand,
      async ({ node }) => fetchChildResources(node.internalId),
      { concurrency: 8 }
    );

    const nextLevel: NodeWithParents[] = [];
    for (const [index, childResult] of childResults.entries()) {
      if (childResult.isErr()) {
        if (childResult.error.type === "resource_inaccessible") {
          skippedNodes.push(containersToExpand[index].node);
          continue;
        }
        return new Err(childResult.error.error);
      }
      const parent = containersToExpand[index];
      nextLevel.push(
        ...childResult.value.map((node) => ({
          node,
          parents: [parent.node.internalId, ...parent.parents],
        }))
      );
    }
    currentLevel = nextLevel;
  }

  return new Ok({ nodes: selected, skippedNodes });
}

/**
 * @cc [owner:frankaloia,label:product] retain-selection-ancestry
 * Previously selected nodes MUST retain their complete known ancestry so bulk
 * unselection can match nested descendants of a visible container.
 */
export function getContentNodeParents(node: ContentNodeWithParent): string[] {
  if (node.parentInternalIds && node.parentInternalIds.length > 0) {
    return node.parentInternalIds;
  }
  return node.parentInternalId ? [node.parentInternalId] : [];
}

/**
 * @cc [owner:frankaloia,label:product] unselect-descendants
 * Unselect All at a tree level MUST unselect the currently visible nodes and any
 * already selected descendants of those nodes, including previously persisted
 * selections on non-selectable containers.
 */
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
