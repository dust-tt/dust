import { get, set, unset } from "lodash";
import { createContext, useCallback, useContext, useReducer } from "react";

import type {
  DataSourceViewCategoryWithoutApps,
  DataSourceViewContentNode,
  SpaceType,
} from "@app/types";

type DataSourceBuilderNode = {
  excludes?: string[];
  childs?: DataSourceBuilderTree;
};

type DataSourceBuilderTree = Record<string, DataSourceBuilderNode>;

export type NavigationHistoryEntryType =
  | { type: "root" }
  | { type: "space"; space: SpaceType }
  | { type: "category"; category: DataSourceViewCategoryWithoutApps }
  | { type: "node"; node: DataSourceViewContentNode };

type State = {
  nodes: DataSourceBuilderTree;
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
        nodes: addNodeToTree(state.nodes, nodePath),
      };
    }
    case "REMOVE_DATA_SOURCE_NODE": {
      const nodePath = computeNavigationPath(state.navigationHistory);
      nodePath.push(payload.rowId);
      return {
        ...state,
        nodes: removeNodeFromTree(state.nodes, nodePath),
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
    nodes: {},
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
      return isNodeSelected(state.nodes, nodePath);
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
 * Interpolate a given input with `.childs.`
 * This is a helper to allow us to only manage known path
 * in the component which add or remove node, and keep the
 * real tree structure hidden (not useful).
 *
 * i.e:
 * `root.vlt_732fda` => `root.childs.vlt_732fda`
 */
export function replaceDotsWithChilds(input: string): string {
  return input.replace(/\./g, ".childs.");
}

/**
 * Adds a path to the tree by either:
 * 1. Removing it from parent's excludes list if present
 * 2. Creating a new empty node at the path location
 *
 * @returns New tree with the node added
 */
export function addNodeToTree(
  tree: DataSourceBuilderTree,
  path: string[]
): DataSourceBuilderTree {
  const newTree = { ...tree };
  const nodeName = path[path.length - 1];
  const parentPath = replaceDotsWithChilds(path.slice(0, -1).join("."));
  const parentNode = get(newTree, parentPath);

  if (parentNode?.excludes?.includes(nodeName)) {
    // Remove from excludes if present
    const exludesPath = `${parentPath}.excludes`;
    const newExcludes = parentNode.excludes.filter((n) => n !== nodeName);

    if (newExcludes.length <= 0) {
      unset(newTree, exludesPath);
    } else {
      set(newTree, exludesPath, newExcludes);
    }
  } else {
    // Create new empty node
    set(newTree, replaceDotsWithChilds(path.join(".")), {});
  }

  return newTree;
}

/**
 * Removes a node from the tree by either:
 * 1. Removing it from parent's childs if present
 * 2. Adding it to parent's excludes list
 * 3. Cleaning up empty parent nodes
 * 4. Creating new parent with node in excludes if parent doesn't exist
 *
 * @returns New tree with the node removed
 */
export function removeNodeFromTree(
  tree: DataSourceBuilderTree,
  path: string[]
): DataSourceBuilderTree {
  const newTree = { ...tree };
  const nodeName = path[path.length - 1];
  const parentPath = replaceDotsWithChilds(path.slice(0, -1).join("."));
  const parentNode = get(newTree, parentPath);

  if (!parentNode) {
    // Create new parent with node in excludes
    set(newTree, parentPath, { excludes: [nodeName] });
    return newTree;
  }

  // Remove from childs or add to excludes
  if (parentNode.childs?.[nodeName]) {
    unset(newTree, `${parentPath}.childs.${nodeName}`);
    if (Object.keys(parentNode.childs).length === 0) {
      delete parentNode.childs;
    }
  } else {
    parentNode.excludes = [...(parentNode.excludes || []), nodeName];
  }

  // Clean up empty parent
  if (
    !parentNode.childs &&
    (!parentNode.excludes || parentNode.excludes.length === 0)
  ) {
    unset(newTree, parentPath);
  }

  return newTree;
}

/**
 * Determines if a path should be selected based on tree configuration.
 * A path is selected if:
 * 1. Any ancestor node is fully selected (no excludes, no childs)
 * 2. The specific node is included in its parent's childs
 * 3. The node is not in its parent's excludes list
 */
export function isNodeSelected(
  tree: DataSourceBuilderTree,
  path: string[]
): boolean {
  for (let i = path.length - 1; i >= 0; i--) {
    const currentNodeName = path[i];
    const ancestorPath = replaceDotsWithChilds(path.slice(0, i).join("."));
    const ancestorNode = get(tree, ancestorPath);

    if (!ancestorNode) {
      continue;
    }

    // Case 1: Ancestor is fully selected (no excludes/childs)
    if (
      !ancestorNode.excludes?.length &&
      !Object.keys(ancestorNode.childs ?? {}).length
    ) {
      return true;
    }

    // Case 2: Node is explicitly excluded
    if (ancestorNode.excludes?.includes(currentNodeName)) {
      return false;
    }

    // Case 3: Node is explicitly included in childs
    if (ancestorNode.childs) {
      return !!ancestorNode.childs[currentNodeName];
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
