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
 * Add a path to the given tree.
 *
 * @returns - A new tree with the node added
 */
export function addNodeToTree(
  tree: DataSourceBuilderTree,
  path: string[]
): DataSourceBuilderTree {
  const newTree = { ...tree };
  const leaf = path[path.length - 1];

  const parentPath = replaceDotsWithChilds(
    path.slice(0, path.length - 1).join(".")
  );
  const parent = get(newTree, parentPath);

  // If node is only in excludes, we remove it from it
  if (parent?.excludes?.includes(leaf)) {
    set(
      newTree,
      parentPath + ".excludes",
      (parent.excludes ?? []).filter((path) => path !== leaf)
    );
  } else {
    // Otherwise we can add it a new node
    set(newTree, replaceDotsWithChilds(path.join(".")), {});
  }

  return newTree;
}

export function removeNodeFromTree(
  tree: DataSourceBuilderTree,
  path: string[]
): DataSourceBuilderTree {
  const leaf = path[path.length - 1];
  const newTree = { ...tree };

  const parentPath = replaceDotsWithChilds(
    path.slice(0, path.length - 1).join(".")
  );
  const parentNode = get(newTree, parentPath);

  if (parentNode) {
    if (parentNode.childs && leaf in parentNode.childs) {
      unset(newTree, parentPath + ".childs." + leaf);
    } else {
      if (!parentNode.excludes) {
        parentNode.excludes = [];
      }
      parentNode.excludes.push(leaf);
    }

    if (parentNode.childs && Object.keys(parentNode.childs).length <= 0) {
      delete parentNode.childs;
    }

    // If everything is empty for the parent node, we remove it
    if (
      (!parentNode.childs || Object.keys(parentNode.childs).length <= 0) &&
      (!parentNode.excludes || parentNode.excludes.length <= 0)
    ) {
      unset(newTree, parentPath);
    }
  } else {
    set(newTree, parentPath, { excludes: [path[path.length - 1]] });
  }

  return newTree;
}

/**
 * Check wether or not a given path should be selected.
 * Selected mean it's specifically selected or a parents is selected
 * and it's not ignored.
 */
export function isNodeSelected(
  tree: DataSourceBuilderTree,
  path: string[]
): boolean {
  for (let i = path.length - 1; i >= 0; i--) {
    const leaf = path[i];
    const sections = path.slice(0, i); // Ignore the leaf
    const currentPath = replaceDotsWithChilds(sections.join("."));
    const node = get(tree, currentPath);

    // The current node doesn't exist, we can continue going up in the tree
    if (node == null) {
      continue;
    }

    // It's selected if the parent has no childs and no excludes
    if (
      node.excludes &&
      node.excludes.length <= 0 &&
      Object.keys(node.childs ?? {}).length <= 0
    ) {
      return true;
    } else if (node.excludes?.includes(leaf)) {
      // OR
      // it's not in the excludes or in the childs
      return false;
    }

    // If the parent has some childs
    if (node.childs != null) {
      // we can check if it includes the given node
      return node.childs[leaf] != null;
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
