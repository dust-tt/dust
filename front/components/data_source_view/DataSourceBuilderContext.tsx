import { createContext, useCallback, useContext, useReducer } from "react";

import type {
  DataSourceViewCategoryWithoutApps,
  DataSourceViewContentNode,
  SpaceType,
} from "@app/types";

type DataSourceBuilderTree = {
  /**
   * List of path that are included
   */
  in: string[];

  /**
   * List of path that are excluded
   */
  notIn: string[];
};

export type NavigationHistoryEntryType =
  | { type: "root" }
  | { type: "space"; space: SpaceType }
  | { type: "category"; category: DataSourceViewCategoryWithoutApps }
  | { type: "node"; node: DataSourceViewContentNode };

type State = {
  sources: {
    /**
     * List of path that are included
     */
    in: string[];

    /**
     * List of path that are excluded
     */
    notIn: string[];
  };
  /**
   * Shape is `[root, space, category, ...node]`
   * so in this case we can use index to update specific values
   */
  navigationHistory: NavigationHistoryEntryType[];
};

type DataSourceBuilderState = State & {
  // TREE HELPERS
  /**
   * Select a specific row.
   * Total path is deduced from the current navigationHistory state.
   * You just have to put the row id of the source you want to select.
   */
  selectNode: (rowId: string) => void;

  /**
   * Remove a specific row.
   * Total path is deduced from the current navigationHistory state.
   * You just have to put the row id of the source you want to select.
   */
  removeNode: (rowId: string) => void;

  /**
   * Check selection status for the specific row.
   * Total path is deduced from the current navigationHistory state.
   */
  isRowSelected: (rowId: string) => boolean;

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

type Action =
  | {
      type: "SELECT_DATA_SOURCE_NODE";
      payload: { rowId: string };
    }
  | {
      type: "REMOVE_DATA_SOURCE_NODE";
      payload: { rowId: string };
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
  state: State,
  { type, payload }: Action
): State {
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
      nodePath.push(payload.rowId);
      return {
        ...state,
        sources: addNodeToTree(state.sources, nodePath),
      };
    }
    case "REMOVE_DATA_SOURCE_NODE": {
      const nodePath = computeNavigationPath(state.navigationHistory);
      nodePath.push(payload.rowId);
      return {
        ...state,
        sources: removeNodeFromTree(state.sources, nodePath),
      };
    }
    default:
      console.error(`action ${type} not handled`);
      return state;
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

  const removeNode: DataSourceBuilderState["removeNode"] = useCallback(
    (rowId) => {
      dispatch({ type: "REMOVE_DATA_SOURCE_NODE", payload: { rowId } });
    },
    []
  );

  const isRowSelected: DataSourceBuilderState["isRowSelected"] = useCallback(
    (rowId) => {
      const nodePath = computeNavigationPath(state.navigationHistory);
      nodePath.push(rowId);
      return isNodeSelected(state.sources, nodePath);
    },
    [state]
  );

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
        removeNode,
        isRowSelected,
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
 *
 * @returns New tree with the node added
 */
export function addNodeToTree(
  tree: DataSourceBuilderTree,
  path: string[]
): DataSourceBuilderTree {
  const pathStr = path.join(".");
  const newIn = [...tree.in];
  const newNotIn = tree.notIn.filter((notInPath) => notInPath !== pathStr);

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
 *
 * @returns New tree with the node removed
 */
export function removeNodeFromTree(
  tree: DataSourceBuilderTree,
  path: string[]
): DataSourceBuilderTree {
  const pathStr = path.join(".");
  const newIn = tree.in.filter((inPath) => inPath !== pathStr);
  const newNotIn = [...tree.notIn];

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
 * A path is selected if:
 * 1. The path or any parent path is in the 'in' array
 * 2. The path is not explicitly excluded in the 'notIn' array
 * 3. notIn takes priority over in for exact matches
 */
export function isNodeSelected(
  tree: DataSourceBuilderTree,
  path: string[]
): boolean {
  const pathStr = path.join(".");

  // Check if explicitly excluded (notIn takes priority)
  for (const notInPath of tree.notIn) {
    if (pathStr === notInPath || pathStr.startsWith(notInPath + ".")) {
      return false;
    }
  }

  // Check if included (exact match or parent path)
  for (const inPath of tree.in) {
    if (pathStr === inPath || pathStr.startsWith(inPath + ".")) {
      return true;
    }
  }

  return false;
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
