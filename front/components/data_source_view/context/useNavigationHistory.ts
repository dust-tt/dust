import type { NavigationHistoryEntryType } from "@app/components/data_source_view/context/types";
import type { DataSourceViewCategoryWithoutApps } from "@app/types/api/public/spaces";
import type {
  DataSourceViewContentNode,
  DataSourceViewType,
} from "@app/types/data_source_view";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { EnrichedSpaceType } from "@app/types/space";
import { useCallback, useMemo, useReducer } from "react";

type NavigationHistoryAction =
  | {
      type: "NAVIGATION_SET_SPACE";
      payload: { space: EnrichedSpaceType };
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
    };

const ROOT_NAVIGATION_HISTORY: NavigationHistoryEntryType[] = [
  { type: "root" },
];

/**
 * @cc [owner:smb2268,label:react] navigation-history-shape
 * The returned history MUST keep the shape `[root, space, category, data_source, ...nodes]`:
 * setting a space keeps only the root, setting a category keeps the first two entries, setting a
 * data source keeps the first three, adding a node appends, and navigating to `index` keeps the
 * entries up to and including `index`. The reducer does not guard the call order: callers MUST
 * set a category only from a space level, a data source only from a category level, and add a
 * node only from a data source or node level, since helpers in `utils.ts` read entries by
 * position.
 */
function navigationHistoryReducer(
  navigationHistory: NavigationHistoryEntryType[],
  { type, payload }: NavigationHistoryAction
): NavigationHistoryEntryType[] {
  switch (type) {
    case "NAVIGATION_SET_SPACE":
      return [
        ...navigationHistory.slice(0, 1),
        { type: "space", space: payload.space },
      ];
    case "NAVIGATION_SET_CATEGORY":
      return [
        ...navigationHistory.slice(0, 2),
        { type: "category", category: payload.category },
      ];
    case "NAVIGATION_SET_DATA_SOURCE":
      return [
        ...navigationHistory.slice(0, 3),
        {
          type: "data_source",
          dataSourceView: payload.dataSourceView,
          tagsFilter: null,
        },
      ];
    case "NAVIGATION_ADD_NODE":
      return [
        ...navigationHistory,
        { type: "node", node: payload.node, tagsFilter: null },
      ];
    case "NAVIGATION_NAVIGATE_TO":
      return navigationHistory.slice(0, payload.index + 1);
    default:
      assertNeverAndIgnore(type);
      return navigationHistory;
  }
}

export interface NavigationHistoryState {
  navigationHistory: NavigationHistoryEntryType[];
  setSpaceEntry: (space: EnrichedSpaceType) => void;
  setCategoryEntry: (category: DataSourceViewCategoryWithoutApps) => void;
  setDataSourceViewEntry: (dataSourceView: DataSourceViewType) => void;
  addNodeEntry: (node: DataSourceViewContentNode) => void;
  navigateTo: (index: number) => void;
}

// Browsing state over spaces, categories, data source views and folders, independent of any
// selection model.
export function useNavigationHistory(): NavigationHistoryState {
  const [navigationHistory, dispatch] = useReducer(
    navigationHistoryReducer,
    ROOT_NAVIGATION_HISTORY
  );

  const setSpaceEntry = useCallback((space: EnrichedSpaceType) => {
    dispatch({ type: "NAVIGATION_SET_SPACE", payload: { space } });
  }, []);

  const setCategoryEntry = useCallback(
    (category: DataSourceViewCategoryWithoutApps) => {
      dispatch({ type: "NAVIGATION_SET_CATEGORY", payload: { category } });
    },
    []
  );

  const setDataSourceViewEntry = useCallback(
    (dataSourceView: DataSourceViewType) => {
      dispatch({
        type: "NAVIGATION_SET_DATA_SOURCE",
        payload: { dataSourceView },
      });
    },
    []
  );

  const addNodeEntry = useCallback((node: DataSourceViewContentNode) => {
    dispatch({ type: "NAVIGATION_ADD_NODE", payload: { node } });
  }, []);

  const navigateTo = useCallback((index: number) => {
    dispatch({ type: "NAVIGATION_NAVIGATE_TO", payload: { index } });
  }, []);

  return useMemo(
    () => ({
      navigationHistory,
      setSpaceEntry,
      setCategoryEntry,
      setDataSourceViewEntry,
      addNodeEntry,
      navigateTo,
    }),
    [
      navigationHistory,
      setSpaceEntry,
      setCategoryEntry,
      setDataSourceViewEntry,
      addNodeEntry,
      navigateTo,
    ]
  );
}
