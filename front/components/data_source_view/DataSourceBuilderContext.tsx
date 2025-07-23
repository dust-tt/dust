import { createContext, useCallback, useContext, useReducer } from "react";

import type {
  DataSourceViewCategoryWithoutApps,
  DataSourceViewContentNode,
  SpaceType,
} from "@app/types";
import { assertNever } from "@app/types";

type DataSourceBuilderTree = {
  in: string[];
  notIn: string[];
};

export type NavigationHistoryEntryType =
  | { type: "root" }
  | { type: "space"; space: SpaceType }
  | { type: "category"; category: DataSourceViewCategoryWithoutApps }
  | { type: "node"; node: DataSourceViewContentNode };

type StateType = {
  sources: DataSourceBuilderTree;
  /**
   * Shape is `[root, space, category, ...node]`
   * so in this case we can use index to update specific values
   */
  navigationHistory: NavigationHistoryEntryType[];
};

type DataSourceBuilderState = StateType & {
  // TREE HELPERS
  /**
   * Select a specific row.
   * Total path is deduced from the current navigationHistory state.
   * You just have to put the row id of the source you want to select.
   */
  selectNode: (rowId: string) => void;

  /*
   * Select current navigationHistory entry.
   * Used for the select all of the current page in the table
   */
  selectCurrentNavigationEntry: () => void;

  /**
   * Remove a specific row.
   * Total path is deduced from the current navigationHistory state.
   * You just have to put the row id of the source you want to select.
   */
  removeNode: (rowId: string) => void;

  /**
   * Remove the current navigationHistory entry
   * Used for the select all of the current page in the table
   */
  removeCurrentNavigationEntry: () => void;

  /**
   * Check selection status for the specific row.
   * Total path is deduced from the current navigationHistory state.
   */
  isRowSelected: (rowId: string) => boolean | "partial";

  /**
   * Use the current navigationHistory entry and check its selection status
   */
  isCurrentNavigationEntrySelected: () => boolean | "partial";

  // NAVIGATION HELPERS

  /// Add the current selected space
  setSpaceEntry: (space: SpaceType) => void;

  /// Set the current selected category in the navigation
  setCategoryEntry: (category: DataSourceViewCategoryWithoutApps) => void;

  /// Add a new node to the navigation
  addNodeEntry: (node: DataSourceViewContentNode) => void;

  /// Navigate to a specific node
  navigateTo: (index: number) => void;
};

type ActionType =
  | {
      type: "SELECT_DATA_SOURCE_NODE";
      payload: { rowId?: string };
    }
  | {
      type: "REMOVE_DATA_SOURCE_NODE";
      payload: { rowId?: string };
    }
  | {
      type: "NAVIGATION_SET_SPACE";
      payload: { space: SpaceType };
    }
  | {
      type: "NAVIGATION_SET_CATEGORY";
      payload: { category: DataSourceViewCategoryWithoutApps };
    }
  | {
      type: "NAVIGATION_ADD_NODE";
      payload: { node: DataSourceViewContentNode };
    }
  | {
      type: "NAVIGATION_NAVIGATE_TO";
      payload: { index: number };
    };

const DataSourceBuilderContext = createContext<
  DataSourceBuilderState | undefined
>(undefined);

function dataSourceBuilderReducer(
  state: StateType,
  { type, payload }: ActionType
): StateType {
  switch (type) {
    case "NAVIGATION_SET_SPACE": {
      return {
        ...state,
        navigationHistory: [
          ...state.navigationHistory.slice(0, 1),
          { type: "space", space: payload.space },
        ],
      };
    }
    case "NAVIGATION_SET_CATEGORY": {
      return {
        ...state,
        navigationHistory: [
          ...state.navigationHistory.slice(0, 2),
          { type: "category", category: payload.category },
        ],
      };
    }
    case "NAVIGATION_ADD_NODE": {
      return {
        ...state,
        navigationHistory: [
          ...state.navigationHistory,
          { type: "node", node: payload.node },
        ],
      };
    }
    case "NAVIGATION_NAVIGATE_TO": {
      return {
        ...state,
        navigationHistory: state.navigationHistory.slice(0, payload.index + 1),
      };
    }
    case "SELECT_DATA_SOURCE_NODE": {
      const nodePath = computeNavigationPath(state.navigationHistory);
      if (payload.rowId) {
        nodePath.push(payload.rowId);
      }
      return {
        ...state,
        sources: addNodeToTree(state.sources, nodePath),
      };
    }
    case "REMOVE_DATA_SOURCE_NODE": {
      const nodePath = computeNavigationPath(state.navigationHistory);
      if (payload.rowId) {
        nodePath.push(payload.rowId);
      }
      const sources = removeNodeFromTree(state.sources, nodePath);
      return {
        ...state,
        sources,
      };
    }
    default:
      assertNever(type);
  }
}

export function DataSourceBuilderProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(dataSourceBuilderReducer, {
    sources: {
      in: [],
      notIn: [],
    },
    navigationHistory: [{ type: "root" }],
  });

  const selectNode: DataSourceBuilderState["selectNode"] = useCallback(
    (rowId) => {
      dispatch({ type: "SELECT_DATA_SOURCE_NODE", payload: { rowId } });
    },
    []
  );

  const selectCurrentNavigationEntry: DataSourceBuilderState["selectCurrentNavigationEntry"] =
    useCallback(() => {
      dispatch({ type: "SELECT_DATA_SOURCE_NODE", payload: {} });
    }, []);

  const removeNode: DataSourceBuilderState["removeNode"] = useCallback(
    (rowId) => {
      dispatch({ type: "REMOVE_DATA_SOURCE_NODE", payload: { rowId } });
    },
    []
  );

  const removeCurrentNavigationEntry: DataSourceBuilderState["removeCurrentNavigationEntry"] =
    useCallback(() => {
      dispatch({ type: "REMOVE_DATA_SOURCE_NODE", payload: {} });
    }, []);

  const isRowSelected: DataSourceBuilderState["isRowSelected"] = useCallback(
    (rowId) => {
      const nodePath = computeNavigationPath(state.navigationHistory);
      nodePath.push(rowId);
      return isNodeSelected(state.sources, nodePath);
    },
    [state]
  );

  const isCurrentNavigationEntrySelected: DataSourceBuilderState["isCurrentNavigationEntrySelected"] =
    useCallback(() => {
      const nodePath = computeNavigationPath(state.navigationHistory);
      return isNodeSelected(state.sources, nodePath);
    }, [state]);

  const setSpaceEntry: DataSourceBuilderState["setSpaceEntry"] = useCallback(
    (space) => {
      dispatch({ type: "NAVIGATION_SET_SPACE", payload: { space } });
    },
    []
  );

  const setCategoryEntry: DataSourceBuilderState["setCategoryEntry"] =
    useCallback((category) => {
      dispatch({ type: "NAVIGATION_SET_CATEGORY", payload: { category } });
    }, []);

  const addNodeEntry: DataSourceBuilderState["addNodeEntry"] = useCallback(
    (node) => {
      dispatch({ type: "NAVIGATION_ADD_NODE", payload: { node } });
    },
    []
  );

  const navigateTo: DataSourceBuilderState["navigateTo"] = useCallback(
    (index) => {
      dispatch({ type: "NAVIGATION_NAVIGATE_TO", payload: { index } });
    },
    []
  );

  return (
    <DataSourceBuilderContext.Provider
      value={{
        ...state,
        selectNode,
        selectCurrentNavigationEntry,
        removeNode,
        removeCurrentNavigationEntry,
        isRowSelected,
        isCurrentNavigationEntrySelected,
        setSpaceEntry,
        setCategoryEntry,
        addNodeEntry,
        navigateTo,
      }}
    >
      {children}
    </DataSourceBuilderContext.Provider>
  );
}

export function useDataSourceBuilderContext() {
  const context = useContext(DataSourceBuilderContext);
  if (!context) {
    throw new Error(
      `useDataSourceBuilderContext must be used within DataSourceBuilderProvider`
    );
  }
  return context;
}

/**
 * Adds a path to the tree by adding it to the 'in' array and removing it from 'notIn' if present.
 * Optimization: If a parent path is already included, don't add child paths to avoid redundancy.
 *
 * @returns New tree with the node added
 */
export function addNodeToTree(
  tree: DataSourceBuilderTree,
  path: string[]
): DataSourceBuilderTree {
  const pathStr = path.join(".");
  const newNotIn = tree.notIn.filter((notInPath) => notInPath !== pathStr);

  // Check if any parent path is already in the 'in' array
  const hasParentPath = tree.in.some((inPath) => {
    return pathStr.startsWith(inPath + ".") || pathStr === inPath;
  });

  // If a parent path is already selected, don't add this child path
  if (hasParentPath) {
    return {
      in: tree.in,
      notIn: newNotIn,
    };
  }

  const newIn = [...tree.in];

  // Don't add if already present
  if (!newIn.includes(pathStr)) {
    newIn.push(pathStr);
  }

  return {
    in: newIn,
    notIn: newNotIn,
  };
}

/**
 * Removes a node from the tree by adding it to the 'notIn' array and removing it from 'in' if present.
 * Also removes any child paths from 'in' that would be blocked by the exclusion.
 * Optimization: If a parent path is already excluded, don't add redundant child exclusions.
 *
 * @returns New tree with the node removed
 */
export function removeNodeFromTree(
  tree: DataSourceBuilderTree,
  path: string[]
): DataSourceBuilderTree {
  const pathStr = path.join(".");

  // Check if any parent path is already excluded
  const hasParentExclusion = tree.notIn.some((notInPath) => {
    return pathStr.startsWith(notInPath + ".") || pathStr === notInPath;
  });

  // Remove the exact path and any child paths from 'in' array
  // Child paths would be blocked by the exclusion anyway
  const newIn = tree.in.filter((inPath) => {
    // Remove exact match
    if (inPath === pathStr) {
      return false;
    }
    // Remove child paths (paths that start with pathStr + ".")
    if (inPath.startsWith(pathStr + ".")) {
      return false;
    }
    return true;
  });

  // Remove any child paths from 'notIn' array since they'll be redundant after adding parent exclusion
  const newNotIn = tree.notIn.filter((notInPath) => {
    // Keep paths that are not children of the path being excluded
    return !notInPath.startsWith(pathStr + ".");
  });

  // If a parent path is already excluded, don't add this child exclusion
  if (hasParentExclusion) {
    return {
      in: newIn,
      notIn: newNotIn,
    };
  }

  // Don't add if already present
  if (!newNotIn.includes(pathStr)) {
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
  const pathStr = path.join(".");
  const pathPrefix = pathStr + ".";

  let hasChildExclusions = false;

  for (const notInPath of tree.notIn) {
    if (pathStr === notInPath || pathStr.startsWith(notInPath + ".")) {
      return false;
    }
    if (notInPath.startsWith(pathPrefix)) {
      hasChildExclusions = true;
    }
  }

  let isIncluded = false;
  let hasChildInclusions = false;

  for (const inPath of tree.in) {
    if (pathStr === inPath || pathStr.startsWith(inPath + ".")) {
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

function computeNavigationPath(
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
