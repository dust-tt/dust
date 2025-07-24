import type {
  DataSourceBuilderTree,
  NavigationHistoryEntryType,
} from "@app/components/data_source_view/context/types";

function pathToString(path: string[]): string {
  return path.join(".");
}

function getPathPrefix(pathStr: string): string {
  return pathStr + ".";
}

function isParentOrSamePath(parentPath: string, childPath: string): boolean {
  return childPath === parentPath || childPath.startsWith(getPathPrefix(parentPath));
}

/**
 * Adds a path to the tree by adding it to the 'in' array and removing it from 'notIn' if present.
 * If a parent path is already included, don't add child paths to avoid redundancy.
 *
 * @returns New tree with the node added
 */
export function addNodeToTree(
  tree: DataSourceBuilderTree,
  path: string[]
): DataSourceBuilderTree {
  const pathStr = pathToString(path);
  const pathPrefix = getPathPrefix(pathStr);

  const hasParentInclusion = tree.in.some((inPath) =>
    isParentOrSamePath(inPath, pathStr)
  );

  const newNotIn = tree.notIn.filter(
    (notInPath) => notInPath !== pathStr && !notInPath.startsWith(pathPrefix)
  );

  if (hasParentInclusion) {
    return {
      in: tree.in,
      notIn: newNotIn,
    };
  }

  if (tree.notIn.includes(pathStr)) {
    return {
      in: tree.in,
      notIn: newNotIn,
    };
  }

  if (tree.in.includes(pathStr)) {
    return {
      in: tree.in,
      notIn: newNotIn,
    };
  }

  const newIn = [...tree.in, pathStr];

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
  tree: DataSourceBuilderTree,
  path: string[]
): DataSourceBuilderTree {
  const pathStr = pathToString(path);
  const pathPrefix = getPathPrefix(pathStr);

  let hasParentExclusion = false;
  let hasChildExclusions = false;
  const newNotIn: string[] = [];

  for (const notInPath of tree.notIn) {
    if (isParentOrSamePath(notInPath, pathStr)) {
      hasParentExclusion = true;
    }

    if (!notInPath.startsWith(pathPrefix)) {
      newNotIn.push(notInPath);
    } else {
      hasChildExclusions = true;
    }
  }

  const newIn = tree.in.filter(
    (inPath) => inPath !== pathStr && !inPath.startsWith(pathPrefix)
  );

  const hasChildInclusions = tree.in.some((inPath) =>
    inPath.startsWith(pathPrefix)
  );

  const removedExactPath = tree.in.includes(pathStr);

  const hasParentInclusion = tree.in.some((inPath) =>
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
    hasChildExclusions ||
    (hasParentInclusion && !hasChildInclusions && !removedExactPath)
  ) {
    newNotIn.push(pathStr);
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
  tree: DataSourceBuilderTree,
  path: string[]
): boolean | "partial" {
  const pathStr = pathToString(path);
  const pathPrefix = getPathPrefix(pathStr);

  let hasChildExclusions = false;

  for (const notInPath of tree.notIn) {
    if (isParentOrSamePath(notInPath, pathStr)) {
      return false;
    }

    if (notInPath.startsWith(pathPrefix)) {
      hasChildExclusions = true;
    }
  }

  let isIncluded = false;
  let hasChildInclusions = false;

  for (const inPath of tree.in) {
    if (isParentOrSamePath(inPath, pathStr)) {
      isIncluded = true;
    }

    if (inPath.startsWith(pathPrefix)) {
      hasChildInclusions = true;
    }
  }

  if (isIncluded) {
    return hasChildExclusions ? "partial" : true;
  }

  return hasChildInclusions ? "partial" : false;
}

export function computeNavigationPath(
  navigationHistory: NavigationHistoryEntryType[]
): string[] {
  return navigationHistory.map((entry) => {
    switch (entry.type) {
      case "root":
        return "root";
      case "space":
        return entry.space.sId;
      case "category":
        return entry.category;
      case "node":
        return entry.node.internalId;
    }
  });
}
