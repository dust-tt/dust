/**
 * DataSourceBuilderContext manages data source selection using a flat array approach
 * with 'in' and 'notIn' arrays instead of a traditional tree structure.
 *
 * Why this approach?
 *
 * 1. **Hierarchical Selection Efficiency**: When selecting a parent node (e.g., a folder),
 *    we want all its children to be automatically included without having to store every
 *    child path explicitly. With arrays, we store "documents/folder1" once instead of
 *    storing every file path within that folder.
 *
 * 2. **Granular Exclusions**: Users can select a parent but exclude specific children.
 *    For example: include "documents/" but exclude "documents/sensitive.pdf".
 *    The 'notIn' array allows us to handle these exceptions efficiently.
 *
 * 3. **Memory Efficiency**: A tree structure would require storing every possible node,
 *    even unselected ones. Arrays only store what's explicitly selected or excluded,
 *    making it much more memory efficient for large hierarchies.
 *
 * 4. **Simple State Management**: Arrays are easier to serialize, compare, and debug
 *    than complex nested tree structures. State updates are straightforward array
 *    operations rather than complex tree traversals.
 *
 * 5. **Path-based Logic**: Since data sources are naturally hierarchical with path-like
 *    identifiers (e.g., "space.category.document"), array-based path matching using
 *    string prefixes is both intuitive and performant.
 *
 * The helper functions (isNodeSelected, addNodeToTree, removeNodeFromTree) handle
 * the complexity of parent-child relationships, allowing the rest of the application
 * to work with simple boolean selection states.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
} from "react";

import type { ConfigurationPagePageId } from "@app/components/agent_builder/types";
import { useSourcesFormController } from "@app/components/agent_builder/utils";
import type {
  DataSourceBuilderTreeItemType,
  NavigationHistoryEntryType,
  NodeSelectionState,
} from "@app/components/data_source_view/context/types";
import {
  addNodeToTree,
  computeNavigationPath,
  getLastNavigationHistoryEntryId,
  isNodeSelected,
  navigationHistoryEntryTitle,
  pathToString,
  removeNodeFromTree,
} from "@app/components/data_source_view/context/utils";
import type {
  DataSourceViewCategoryWithoutApps,
  DataSourceViewContentNode,
  DataSourceViewType,
  SpaceType,
  TagsFilter,
} from "@app/types";
import { assertNever } from "@app/types";

type StateType = {
  /**
   * Shape is `[root, space, category, ...node]`
   * so in this case we can use index to update specific values
   */
  navigationHistory: NavigationHistoryEntryType[];
  currentPageId: ConfigurationPagePageId;
};

type DataSourceBuilderState = StateType & {
  /**
   * Select a specific row.
   * Total path is deduced from the current navigationHistory state.
   * You just have to put the row id of the source you want to select.
   */
  selectNode: (entry: NavigationHistoryEntryType) => void;

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
  removeNode: (entry: NavigationHistoryEntryType) => void;

  /**
   * Remove a specific row, but need to include its full path.
   */
  removeNodeWithPath: (item: DataSourceBuilderTreeItemType) => void;

  /**
   * Remove the current navigationHistory entry
   * Used for the select all of the current page in the table
   */
  removeCurrentNavigationEntry: () => void;

  /**
   * Check selection status for the specific row.
   * Total path is deduced from the current navigationHistory state.
   */
  isRowSelected: (rowId: string) => NodeSelectionState;

  /**
   * Check if the row is selectable.
   * For now it's to check if the space it's in is selectable.
   * We can select the Company Space + 1 other space.
   * Use the current navigationHistory to deduced the full row path.
   */
  isRowSelectable: (rowId?: string) => boolean;

  /**
   * Use the current navigationHistory entry and check its selection status
   */
  isCurrentNavigationEntrySelected: () => NodeSelectionState;

  /**
   * Add the current selected space
   */
  setSpaceEntry: (space: SpaceType) => void;

  /**
   * Set the current selected category in the navigation
   */
  setCategoryEntry: (category: DataSourceViewCategoryWithoutApps) => void;

  /**
   * Set the current selected dataSourceView in the navigation
   */
  setDataSourceViewEntry: (dataSourceView: DataSourceViewType) => void;

  /**
   * Add a new node to the navigation
   */
  addNodeEntry: (node: DataSourceViewContentNode) => void;

  /**
   * Navigate to a specific node
   */
  navigateTo: (index: number) => void;

  /**
   * Update the `tagsFilter` of the given `sources` index
   */
  updateSourcesTags: (index: number, tagsFilter: TagsFilter) => void;

  toggleTagsMode: (dataSourceView: DataSourceViewType) => void;

  setSheetPageId: (pageId: ConfigurationPagePageId) => void;
};

type ActionType =
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
      type: "NAVIGATION_SET_DATA_SOURCE";
      payload: { dataSourceView: DataSourceViewType };
    }
  | {
      type: "NAVIGATION_NAVIGATE_TO";
      payload: { index: number };
    }
  | {
      type: "SET_SHEET_CURRENT_PAGE";
      payload: { pageId: ConfigurationPagePageId };
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
          { type: "node", node: payload.node, tagsFilter: null },
        ],
      };
    }
    case "NAVIGATION_NAVIGATE_TO": {
      return {
        ...state,
        navigationHistory: state.navigationHistory.slice(0, payload.index + 1),
      };
    }
    case "NAVIGATION_SET_DATA_SOURCE": {
      return {
        ...state,
        navigationHistory: [
          ...state.navigationHistory.slice(0, 3),
          {
            type: "data_source",
            dataSourceView: payload.dataSourceView,
            tagsFilter: null,
          },
        ],
      };
    }
    case "SET_SHEET_CURRENT_PAGE": {
      return {
        ...state,
        currentPageId: payload.pageId,
      };
    }
    default:
      assertNever(type);
  }
}

export function DataSourceBuilderProvider({
  spaces,
  initialPageId,
  children,
}: {
  spaces: SpaceType[];
  initialPageId: ConfigurationPagePageId;
  children: React.ReactNode;
}) {
  const { field } = useSourcesFormController();
  const [state, dispatch] = useReducer(dataSourceBuilderReducer, {
    navigationHistory: [{ type: "root" }],
    currentPageId: initialPageId,
  });

  const selectNode: DataSourceBuilderState["selectNode"] = useCallback(
    (entry) => {
      const nodePath = computeNavigationPath(state.navigationHistory);
      nodePath.push(getLastNavigationHistoryEntryId(entry));

      field.onChange(
        addNodeToTree(field.value, {
          path: pathToString(nodePath),
          name: navigationHistoryEntryTitle(entry),
          ...entry,
        })
      );
    },
    [field, state.navigationHistory]
  );

  const selectCurrentNavigationEntry: DataSourceBuilderState["selectCurrentNavigationEntry"] =
    useCallback(() => {
      const lastEntry =
        state.navigationHistory[state.navigationHistory.length - 1];
      const nodePath = computeNavigationPath(state.navigationHistory);

      field.onChange(
        addNodeToTree(field.value, {
          path: pathToString(nodePath),
          name: navigationHistoryEntryTitle(lastEntry),
          ...lastEntry,
        })
      );
    }, [field, state.navigationHistory]);

  const removeNode: DataSourceBuilderState["removeNode"] = useCallback(
    (entry) => {
      const nodePath = computeNavigationPath(state.navigationHistory);
      nodePath.push(getLastNavigationHistoryEntryId(entry));

      field.onChange(
        removeNodeFromTree(field.value, {
          path: pathToString(nodePath),
          name: navigationHistoryEntryTitle(entry),
          ...entry,
        })
      );
    },
    [field, state.navigationHistory]
  );

  const removeNodeWithPath: DataSourceBuilderState["removeNodeWithPath"] =
    useCallback(
      (item) => {
        field.onChange(removeNodeFromTree(field.value, item));
      },
      [field]
    );

  const removeCurrentNavigationEntry: DataSourceBuilderState["removeCurrentNavigationEntry"] =
    useCallback(() => {
      const nodePath = computeNavigationPath(state.navigationHistory);
      const lastEntry =
        state.navigationHistory[state.navigationHistory.length - 1];

      field.onChange(
        removeNodeFromTree(field.value, {
          path: pathToString(nodePath),
          name: navigationHistoryEntryTitle(lastEntry),
          ...lastEntry,
        })
      );
    }, [field, state.navigationHistory]);

  const isRowSelected: DataSourceBuilderState["isRowSelected"] = useCallback(
    (rowId) => {
      const nodePath = computeNavigationPath(state.navigationHistory).concat(
        rowId
      );
      return isNodeSelected(field.value, nodePath);
    },
    [field.value, state.navigationHistory]
  );

  const nonCompanySpacesSelected = useMemo(() => {
    return new Set(
      spaces
        .filter(
          (space) =>
            space.kind !== "global" &&
            isNodeSelected(field.value, ["root", space.sId])
        )
        .map((s) => s.sId)
    );
  }, [field.value, spaces]);

  const isRowSelectable: DataSourceBuilderState["isRowSelectable"] =
    useCallback(
      (rowId) => {
        if (nonCompanySpacesSelected.size <= 0) {
          return true;
        }

        const nodePath = computeNavigationPath(state.navigationHistory);
        if (rowId) {
          nodePath.push(rowId);
        }

        const currentSpaceId = nodePath[1];

        if (currentSpaceId == null) {
          return true;
        }

        return nonCompanySpacesSelected.has(currentSpaceId);
      },
      [nonCompanySpacesSelected, state.navigationHistory]
    );

  const isCurrentNavigationEntrySelected: DataSourceBuilderState["isCurrentNavigationEntrySelected"] =
    useCallback(() => {
      const nodePath = computeNavigationPath(state.navigationHistory);
      return isNodeSelected(field.value, nodePath);
    }, [field.value, state.navigationHistory]);

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

  const setDataSourceViewEntry: DataSourceBuilderState["setDataSourceViewEntry"] =
    useCallback((dataSourceView) => {
      dispatch({
        type: "NAVIGATION_SET_DATA_SOURCE",
        payload: { dataSourceView },
      });
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

  const updateSourcesTags: DataSourceBuilderState["updateSourcesTags"] =
    useCallback(
      (index, tagsFilter) => {
        field.onChange({
          ...field.value,
          in: field.value.in.map((source, i) => {
            if (i === index) {
              return {
                ...source,
                tagsFilter,
              };
            }

            return source;
          }),
        });
      },
      [field]
    );

  const toggleTagsMode: DataSourceBuilderState["toggleTagsMode"] = useCallback(
    (dataSourceView) => {
      field.onChange({
        ...field.value,
        in: field.value.in.map((source) => {
          // Check if this source matches the given dataSourceView
          const isMatchingSource =
            (source.type === "data_source" &&
              source.dataSourceView.sId === dataSourceView.sId) ||
            (source.type === "node" &&
              source.node.dataSourceView.sId === dataSourceView.sId);

          if (isMatchingSource && "tagsFilter" in source) {
            // Initialize tagsFilter if null
            const currentTagsFilter = source.tagsFilter || {
              in: [],
              not: [],
              mode: "custom" as const,
            };

            // Toggle between "auto" and "custom" modes
            const newMode =
              currentTagsFilter.mode === "auto" ? "custom" : "auto";

            return {
              ...source,
              tagsFilter: {
                ...currentTagsFilter,
                mode: newMode,
              },
            };
          }

          return source;
        }),
      });
    },
    [field]
  );

  const setSheetPageId: DataSourceBuilderState["setSheetPageId"] = useCallback(
    (pageId) => {
      dispatch({ type: "SET_SHEET_CURRENT_PAGE", payload: { pageId } });
    },
    []
  );

  const value = useMemo(
    () => ({
      ...state,
      selectNode,
      selectCurrentNavigationEntry,
      removeNode,
      removeNodeWithPath,
      removeCurrentNavigationEntry,
      isRowSelected,
      isRowSelectable,
      isCurrentNavigationEntrySelected,
      setSpaceEntry,
      setCategoryEntry,
      setDataSourceViewEntry,
      addNodeEntry,
      navigateTo,
      updateSourcesTags,
      toggleTagsMode,
      setSheetPageId,
    }),
    [
      state,
      addNodeEntry,
      isCurrentNavigationEntrySelected,
      isRowSelected,
      isRowSelectable,
      navigateTo,
      removeCurrentNavigationEntry,
      removeNode,
      removeNodeWithPath,
      selectCurrentNavigationEntry,
      selectNode,
      setCategoryEntry,
      setSpaceEntry,
      setDataSourceViewEntry,
      updateSourcesTags,
      toggleTagsMode,
      setSheetPageId,
    ]
  );

  return (
    <DataSourceBuilderContext.Provider value={value}>
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
