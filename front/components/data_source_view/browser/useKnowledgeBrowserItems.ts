import type { KnowledgeBrowserItem } from "@app/components/data_source_view/browser/knowledgeBrowserItems";
import {
  buildCategoryItems,
  buildDataSourceViewItems,
  buildNodeItems,
  buildSpaceItems,
} from "@app/components/data_source_view/browser/knowledgeBrowserItems";
import type { NavigationHistoryEntryType } from "@app/components/data_source_view/context/types";
import {
  findCategoryFromNavigationHistory,
  findDataSourceViewFromNavigationHistory,
  findSpaceFromNavigationHistory,
  getLatestNodeFromNavigationHistory,
} from "@app/components/data_source_view/context/utils";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useInfiniteDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import { useSpaceDataSourceViews, useSpaceInfo } from "@app/lib/swr/spaces";
import { emptyArray } from "@app/lib/swr/swr";
import type { RichSpaceType } from "@app/types/api/spaces";
import type { ContentNodesViewType } from "@app/types/connectors/content_nodes";
import type {
  DataSourceViewContentNode,
  DataSourceViewType,
} from "@app/types/data_source_view";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { EnrichedSpaceType, SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useMemo } from "react";

const PAGE_SIZE = 50;

type BrowserLevel = "root" | "space" | "category" | "nodes";

function getBrowserLevel(entry: NavigationHistoryEntryType): BrowserLevel {
  switch (entry.type) {
    case "root":
      return "root";
    case "space":
      return "space";
    case "category":
      return "category";
    case "data_source":
    case "node":
      return "nodes";
    default:
      assertNeverAndIgnore(entry);
      return "root";
  }
}

interface LevelData {
  spaces: EnrichedSpaceType[];
  spaceName: string | undefined;
  spaceCategories: RichSpaceType["categories"] | undefined;
  hasFeature: (flag: WhitelistableFeature | null | undefined) => boolean;
  dataSourceViews: DataSourceViewType[];
  viewType: ContentNodesViewType;
  isDark: boolean;
  nodes: DataSourceViewContentNode[];
  isTopLevelInView: boolean;
  excludeNonRemoteDatabaseTables: boolean;
}

function buildLevelItems(
  level: BrowserLevel,
  data: LevelData
): KnowledgeBrowserItem[] {
  switch (level) {
    case "root":
      return buildSpaceItems(data.spaces);
    case "space":
      return data.spaceCategories
        ? buildCategoryItems(data.spaceCategories, data.hasFeature)
        : emptyArray();
    case "category":
      return buildDataSourceViewItems(data.dataSourceViews, {
        viewType: data.viewType,
        isDark: data.isDark,
      });
    case "nodes":
      return buildNodeItems(data.nodes, {
        isTopLevelInView: data.isTopLevelInView,
        excludeNonRemoteDatabaseTables: data.excludeNonRemoteDatabaseTables,
        spaceName: data.spaceName,
      });
    default:
      assertNeverAndIgnore(level);
      return emptyArray();
  }
}

// Fetches the browsed space's categories while the browser sits at the space level.
function useSpaceCategories({
  owner,
  space,
  enabled,
}: {
  owner: LightWorkspaceType;
  space: SpaceType | null;
  enabled: boolean;
}) {
  const { spaceInfo, isSpaceInfoLoading } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: enabled && space ? space.sId : null,
  });
  return {
    spaceCategories: spaceInfo?.categories,
    isLoading: enabled && isSpaceInfoLoading,
  };
}

// Fetches the browsed category's data source views while the browser sits at the category level.
function useCategoryDataSourceViews({
  owner,
  navigationHistory,
  enabled,
}: {
  owner: LightWorkspaceType;
  navigationHistory: NavigationHistoryEntryType[];
  enabled: boolean;
}) {
  const space = findSpaceFromNavigationHistory(navigationHistory);
  const category = findCategoryFromNavigationHistory(navigationHistory);
  const { spaceDataSourceViews, isSpaceDataSourceViewsLoading } =
    useSpaceDataSourceViews({
      workspaceId: owner.sId,
      spaceId: space?.sId ?? "",
      category: category ?? undefined,
      disabled: !enabled || !space,
    });
  return {
    dataSourceViews: spaceDataSourceViews,
    isLoading: enabled && isSpaceDataSourceViewsLoading,
  };
}

// Pages the children of the browsed data source or folder while the browser sits inside one.
function useNodeChildren({
  owner,
  navigationHistory,
  viewType,
  enabled,
}: {
  owner: LightWorkspaceType;
  navigationHistory: NavigationHistoryEntryType[];
  viewType: ContentNodesViewType;
  enabled: boolean;
}) {
  const traversedNode = getLatestNodeFromNavigationHistory(navigationHistory);
  const dataSourceView =
    traversedNode?.dataSourceView ??
    findDataSourceViewFromNavigationHistory(navigationHistory);
  // A node with no known parents is the view's root, whose children are listed without a parent.
  const parentId = traversedNode?.parentInternalIds
    ? traversedNode.internalId
    : undefined;

  const { nodes, isNodesLoading, hasNextPage, isLoadingMore, loadMore } =
    useInfiniteDataSourceViewContentNodes({
      owner,
      dataSourceView: enabled ? (dataSourceView ?? undefined) : undefined,
      parentId,
      viewType,
      pagination: { limit: PAGE_SIZE, cursor: null },
      sorting: [{ field: "title", direction: "asc" }],
    });

  const loadMoreIfNeeded = useCallback(async () => {
    if (hasNextPage && !isLoadingMore) {
      await loadMore();
    }
  }, [hasNextPage, isLoadingMore, loadMore]);

  return {
    nodes,
    isTopLevelInView: parentId === undefined,
    isLoading: enabled && isNodesLoading,
    hasMore: enabled && hasNextPage,
    isLoadingMore: enabled && isLoadingMore === true,
    loadMore: loadMoreIfNeeded,
  };
}

interface UseKnowledgeBrowserItemsParams {
  owner: LightWorkspaceType;
  // Spaces offered at the root level; the caller scopes them (e.g. to a pod and the global space).
  spaces: EnrichedSpaceType[];
  navigationHistory: NavigationHistoryEntryType[];
  viewType: ContentNodesViewType;
  excludeNonRemoteDatabaseTables?: boolean;
}

interface UseKnowledgeBrowserItemsResult {
  items: KnowledgeBrowserItem[];
  isLoading: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => Promise<void>;
}

/**
 * @cc [owner:smb2268,label:react] items-follow-last-navigation-entry
 * `items` MUST describe the children of the last `navigationHistory` entry: spaces at `root`,
 * categories at `space`, data source views at `category`, and content nodes at `data_source` or
 * `node`. Only the fetch for that level runs; the others stay disabled.
 */
export function useKnowledgeBrowserItems({
  owner,
  spaces,
  navigationHistory,
  viewType,
  excludeNonRemoteDatabaseTables = false,
}: UseKnowledgeBrowserItemsParams): UseKnowledgeBrowserItemsResult {
  const { hasFeature } = useFeatureFlags();
  const { isDark } = useTheme();

  const level = getBrowserLevel(
    navigationHistory[navigationHistory.length - 1]
  );
  const space = findSpaceFromNavigationHistory(navigationHistory);

  const categories = useSpaceCategories({
    owner,
    space,
    enabled: level === "space",
  });
  const views = useCategoryDataSourceViews({
    owner,
    navigationHistory,
    enabled: level === "category",
  });
  const children = useNodeChildren({
    owner,
    navigationHistory,
    viewType,
    enabled: level === "nodes",
  });

  const items = useMemo(
    () =>
      buildLevelItems(level, {
        spaces,
        spaceName: space?.name,
        spaceCategories: categories.spaceCategories,
        hasFeature,
        dataSourceViews: views.dataSourceViews,
        viewType,
        isDark,
        nodes: children.nodes,
        isTopLevelInView: children.isTopLevelInView,
        excludeNonRemoteDatabaseTables,
      }),
    [
      categories.spaceCategories,
      children.isTopLevelInView,
      children.nodes,
      excludeNonRemoteDatabaseTables,
      hasFeature,
      isDark,
      level,
      space?.name,
      spaces,
      views.dataSourceViews,
      viewType,
    ]
  );

  return {
    items,
    isLoading: categories.isLoading || views.isLoading || children.isLoading,
    hasMore: children.hasMore,
    isLoadingMore: children.isLoadingMore,
    loadMore: children.loadMore,
  };
}
