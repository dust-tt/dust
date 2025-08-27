import { FolderIcon } from "@dust-tt/sparkle";

import type {
  DataSourceBuilderTreeItemType,
  DataSourceBuilderTreeType,
  NavigationHistoryEntryType,
  NodeSelectionState,
} from "@app/components/data_source_view/context/types";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { getVisualForDataSourceViewContentNode } from "@app/lib/content_nodes";
import { getDataSourceNameFromView } from "@app/lib/data_sources";
import { CATEGORY_DETAILS, getSpaceIcon } from "@app/lib/spaces";
import type {
  DataSourceViewCategoryWithoutApps,
  DataSourceViewContentNode,
  DataSourceViewType,
  SpaceType,
} from "@app/types";
import { assertNever } from "@app/types";

export function pathToString(path: string[]): string {
  return path.join("/");
}

function getPathPrefix(pathStr: string): string {
  return pathStr + "/";
}

function isParentOrSamePath(parentPath: string, childPath: string): boolean {
  return (
    childPath === parentPath || childPath.startsWith(getPathPrefix(parentPath))
  );
}

/**
 * Adds a path to the tree by adding it to the 'in' array and removing it from 'notIn' if present.
 * If a parent path is already included, don't add child paths to avoid redundancy.
 * When adding a parent path, removes any child paths from 'in' to avoid redundancy.
 *
 * @returns New tree with the node added
 */
export function addNodeToTree(
  tree: DataSourceBuilderTreeType,
  item: DataSourceBuilderTreeItemType
): DataSourceBuilderTreeType {
  const { path } = item;
  const pathPrefix = getPathPrefix(path);

  const hasParentInclusion = tree.in.some(({ path: inPath }) =>
    isParentOrSamePath(inPath, path)
  );

  const newNotIn = tree.notIn.filter(
    ({ path: notInPath }) =>
      notInPath !== path && !notInPath.startsWith(pathPrefix)
  );

  if (hasParentInclusion) {
    return {
      in: tree.in,
      notIn: newNotIn,
    };
  }

  if (tree.notIn.map((el) => el.path).includes(path)) {
    return {
      in: tree.in,
      notIn: newNotIn,
    };
  }

  if (tree.in.map((el) => el.path).includes(path)) {
    return {
      in: tree.in,
      notIn: newNotIn,
    };
  }

  const newIn = tree.in.filter(
    ({ path: inPath }) => !inPath.startsWith(pathPrefix)
  );

  newIn.push(item);

  return {
    in: newIn,
    notIn: newNotIn,
  };
}

/**
 * Removes a node from the tree by adding it to the 'notIn' array and removing it from 'in' if present.
 * Also removes any child paths from 'in' that would be blocked by the exclusion.
 * If a parent path is already excluded, don't add redundant child exclusions.
 *
 * @returns New tree with the node removed
 */
export function removeNodeFromTree(
  tree: DataSourceBuilderTreeType,
  { path: pathStr, ...opts }: DataSourceBuilderTreeItemType
): DataSourceBuilderTreeType {
  const pathPrefix = getPathPrefix(pathStr);

  let hasParentExclusion = false;
  let hasChildExclusions = false;
  const newNotIn: DataSourceBuilderTreeItemType[] = [];

  for (const notInPath of tree.notIn) {
    if (isParentOrSamePath(notInPath.path, pathStr)) {
      hasParentExclusion = true;
    }

    if (!notInPath.path.startsWith(pathPrefix)) {
      newNotIn.push(notInPath);
    } else {
      hasChildExclusions = true;
    }
  }

  const newIn = tree.in.filter(
    ({ path: inPath }) => inPath !== pathStr && !inPath.startsWith(pathPrefix)
  );

  const hasChildInclusions = tree.in.some(({ path: inPath }) =>
    inPath.startsWith(pathPrefix)
  );

  const removedExactPath = tree.in.map((el) => el.path).includes(pathStr);

  const hasParentInclusion = tree.in.some(({ path: inPath }) =>
    isParentOrSamePath(inPath, pathStr)
  );

  if (hasParentExclusion) {
    return {
      in: newIn,
      notIn: newNotIn,
    };
  }

  // Add to notIn if:
  // 1. We removed children from notIn (hasChildExclusions) - replace them with parent exclusion
  // 2. OR the path would be included by a parent and we're not removing child inclusions
  //    AND we didn't remove the exact path from in (if we removed exact path, just removing it is enough)
  if (
    (hasChildExclusions && !hasParentInclusion) ||
    (hasParentInclusion && !hasChildInclusions && !removedExactPath)
  ) {
    newNotIn.push({
      path: pathStr,
      ...opts,
    });
  }

  return {
    in: newIn,
    notIn: newNotIn,
  };
}

/**
 * Determines if a path should be selected based on tree configuration.
 * Returns:
 * - true: The path is fully selected (explicitly or through parent selection)
 * - false: The path is fully unselected (explicitly excluded or not included)
 * - 'partial': The path has mixed selection state (some children selected, some not)
 *
 * Optimized to use maximum 2 passes over the arrays.
 */
export function isNodeSelected(
  tree: DataSourceBuilderTreeType,
  path: string[]
): NodeSelectionState {
  const pathStr = pathToString(path);
  const pathPrefix = getPathPrefix(pathStr);

  let hasChildExclusions = false;

  for (const notInPath of tree.notIn) {
    if (isParentOrSamePath(notInPath.path, pathStr)) {
      return false;
    }

    if (notInPath.path.startsWith(pathPrefix)) {
      hasChildExclusions = true;
    }
  }

  let isIncluded = false;
  let hasChildInclusions = false;

  for (const inPath of tree.in) {
    if (isParentOrSamePath(inPath.path, pathStr)) {
      isIncluded = true;
    }

    if (inPath.path.startsWith(pathPrefix)) {
      hasChildInclusions = true;
    }
  }

  return isIncluded
    ? hasChildExclusions
      ? "partial"
      : true
    : hasChildInclusions
      ? "partial"
      : false;
}

export function getLastNavigationHistoryEntryId(
  entry: NavigationHistoryEntryType
): string {
  switch (entry.type) {
    case "root":
      return "root";
    case "space":
      return entry.space.sId;
    case "category":
      return entry.category;
    case "data_source":
      return entry.dataSourceView.sId;
    case "node":
      return entry.node.internalId;
    default:
      assertNever(entry);
  }
}

export function computeNavigationPath(
  navigationHistory: NavigationHistoryEntryType[]
): string[] {
  return navigationHistory.map(getLastNavigationHistoryEntryId);
}

export function navigationHistoryEntryTitle(
  entry: NavigationHistoryEntryType
): string {
  switch (entry.type) {
    case "root":
      return "root";
    case "space":
      return entry.space.name;
    case "category":
      return CATEGORY_DETAILS[entry.category].label;
    case "data_source":
      return getDataSourceNameFromView(entry.dataSourceView);
    case "node":
      return entry.node.title;
    default:
      assertNever(entry);
  }
}

export function findSpaceFromNavigationHistory(
  navigationHistory: NavigationHistoryEntryType[]
): SpaceType | null {
  const entry = navigationHistory[1]; // Index 1 is where we store the space
  if (entry != null && entry.type === "space") {
    return entry.space;
  }

  return null;
}

export function findCategoryFromNavigationHistory(
  navigationHistory: NavigationHistoryEntryType[]
): DataSourceViewCategoryWithoutApps | null {
  const entry = navigationHistory[2]; // Index 2 is where we store the category
  if (entry != null && entry.type === "category") {
    return entry.category;
  }

  return null;
}

export function findDataSourceViewFromNavigationHistory(
  navigationHistory: NavigationHistoryEntryType[]
): DataSourceViewType | null {
  const entry = navigationHistory[3]; // Index 3 is where we store the data source
  if (entry != null && entry.type === "data_source") {
    return entry.dataSourceView;
  }

  return null;
}

export function getLatestNodeFromNavigationHistory(
  navigationHistory: NavigationHistoryEntryType[]
): DataSourceViewContentNode | null {
  const latestEntry = navigationHistory[navigationHistory.length - 1];

  if (latestEntry.type === "node") {
    return latestEntry.node;
  }

  return null;
}

export function getSpaceNameFromTreeItem(
  item: DataSourceBuilderTreeItemType,
  spaces: SpaceType[]
): string | null {
  // Direct space access if the item is a space type
  if (item.type === "space") {
    return item.space.name;
  }

  // For other types, extract space ID from path structure
  const pathParts = item.path.split("/");
  if (pathParts.length > 1) {
    const spaceId = pathParts[1];
    const space = spaces.find((s) => s.sId === spaceId);
    return space?.name ?? null;
  }

  return null;
}

export function getVisualForTreeItem(
  item: DataSourceBuilderTreeItemType,
  isDark = false
) {
  switch (item.type) {
    case "root":
      // Root doesn't have a specific visual, use a default folder icon
      return FolderIcon;

    case "space":
      return getSpaceIcon(item.space);

    case "category":
      return CATEGORY_DETAILS[item.category].icon;

    case "data_source":
      // For data sources, we can use the connector provider logo or fall back to a generic icon
      if (item.dataSourceView.dataSource.connectorProvider) {
        const connectorProvider =
          CONNECTOR_CONFIGURATIONS[
            item.dataSourceView.dataSource.connectorProvider
          ];

        return connectorProvider.getLogoComponent(isDark);
      }
      return FolderIcon;

    case "node":
      return getVisualForDataSourceViewContentNode(item.node);

    default:
      return FolderIcon;
  }
}
