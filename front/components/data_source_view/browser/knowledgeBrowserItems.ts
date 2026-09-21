import { CONNECTOR_UI_CONFIGURATIONS } from "@app/lib/connector_providers_ui";
import { getVisualForDataSourceViewContentNode } from "@app/lib/content_nodes";
import {
  getDataSourceNameFromView,
  isRemoteDatabase,
} from "@app/lib/data_sources";
import { getDisplayTitleForDataSourceViewContentNode } from "@app/lib/providers/content_nodes_display";
import { CATEGORY_DETAILS, getSpaceIcon } from "@app/lib/spaces";
import type { DataSourceViewCategoryWithoutApps } from "@app/types/api/public/spaces";
import {
  DATA_SOURCE_VIEW_CATEGORIES,
  isDataSourceViewCategoryWithoutApps,
} from "@app/types/api/public/spaces";
import type { RichSpaceType } from "@app/types/api/spaces";
import type { ContentNodesViewType } from "@app/types/connectors/content_nodes";
import type {
  DataSourceViewContentNode,
  DataSourceViewType,
} from "@app/types/data_source_view";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { removeNulls } from "@app/types/shared/utils/general";
import type { EnrichedSpaceType } from "@app/types/space";
import { SPACE_KINDS } from "@app/types/space";
import { Folder } from "@dust-tt/sparkle";
import type { ComponentType } from "react";

interface KnowledgeBrowserItemBase {
  id: string;
  title: string;
  icon: ComponentType;
}

// One row of the knowledge browser: what the row stands for and what it displays. Rows are
// selection-agnostic; consumers decide whether a row navigates, attaches, or both.
export type KnowledgeBrowserItem =
  | (KnowledgeBrowserItemBase & {
      kind: "space";
      group: "spaces" | "pods";
      space: EnrichedSpaceType;
    })
  | (KnowledgeBrowserItemBase & {
      kind: "category";
      category: DataSourceViewCategoryWithoutApps;
    })
  | (KnowledgeBrowserItemBase & {
      kind: "data_source";
      dataSourceView: DataSourceViewType;
    })
  | (KnowledgeBrowserItemBase & {
      kind: "node";
      node: DataSourceViewContentNode;
      expandable: boolean;
    });

/**
 * @cc [owner:smb2268,label:product] spaces-grouped-and-ordered
 * Spaces of kind `project` MUST be returned with `group: "pods"` and every other kind with
 * `group: "spaces"`. Within the result, spaces are ordered by `SPACE_KINDS` order, then
 * unrestricted before restricted, then by name.
 */
export function buildSpaceItems(
  spaces: EnrichedSpaceType[]
): Extract<KnowledgeBrowserItem, { kind: "space" }>[] {
  return spaces
    .toSorted((a, b) => {
      const kindOrder =
        SPACE_KINDS.indexOf(a.kind) - SPACE_KINDS.indexOf(b.kind);
      if (kindOrder !== 0) {
        return kindOrder;
      }
      if (a.isRestricted !== b.isRestricted) {
        return a.isRestricted ? 1 : -1;
      }
      return a.name.localeCompare(b.name);
    })
    .map((space) => ({
      kind: "space",
      group: space.kind === "project" ? "pods" : "spaces",
      id: space.sId,
      title: space.name,
      icon: getSpaceIcon(space),
      space,
    }));
}

// Categories with no items, a disabled feature flag, or outside
// `DataSourceViewCategoryWithoutApps` are omitted; the rest keep `DATA_SOURCE_VIEW_CATEGORIES` order.
export function buildCategoryItems(
  spaceCategories: RichSpaceType["categories"],
  hasFeature: (flag: WhitelistableFeature | null | undefined) => boolean
): Extract<KnowledgeBrowserItem, { kind: "category" }>[] {
  return removeNulls(
    DATA_SOURCE_VIEW_CATEGORIES.map((category) => {
      const info = spaceCategories[category];
      if (
        !info ||
        info.count === 0 ||
        !hasFeature(CATEGORY_DETAILS[category].flag) ||
        !isDataSourceViewCategoryWithoutApps(category)
      ) {
        return null;
      }
      return {
        kind: "category" as const,
        id: category,
        title: CATEGORY_DETAILS[category].label,
        icon: CATEGORY_DETAILS[category].icon,
        category,
      };
    })
  );
}

// Hidden connectors are omitted; `data_warehouse` keeps remote databases only, `table` keeps
// everything else, other view types keep every view. Results are ordered by display name.
export function buildDataSourceViewItems(
  dataSourceViews: DataSourceViewType[],
  { viewType, isDark }: { viewType: ContentNodesViewType; isDark: boolean }
): Extract<KnowledgeBrowserItem, { kind: "data_source" }>[] {
  return dataSourceViews
    .filter((dsv) => {
      const provider = dsv.dataSource.connectorProvider;
      if (
        provider &&
        CONNECTOR_UI_CONFIGURATIONS[provider].isHiddenAsDataSource
      ) {
        return false;
      }
      switch (viewType) {
        case "data_warehouse":
          return isRemoteDatabase(dsv.dataSource);
        case "table":
          return !isRemoteDatabase(dsv.dataSource);
        default:
          return true;
      }
    })
    .map((dsv) => {
      const provider = dsv.dataSource.connectorProvider;
      const icon = provider
        ? (CONNECTOR_UI_CONFIGURATIONS[provider].getLogoComponent(isDark) ??
          CATEGORY_DETAILS[dsv.category].icon)
        : Folder;
      return {
        kind: "data_source" as const,
        id: dsv.sId,
        title: getDataSourceNameFromView(dsv),
        icon,
        dataSourceView: dsv,
      };
    })
    .toSorted((a, b) => a.title.localeCompare(b.title));
}

export function buildNodeItems(
  nodes: DataSourceViewContentNode[],
  { isTopLevelInView }: { isTopLevelInView: boolean }
): Extract<KnowledgeBrowserItem, { kind: "node" }>[] {
  return nodes.map((node) => ({
    kind: "node" as const,
    id: node.internalId,
    title: getDisplayTitleForDataSourceViewContentNode(node, {
      disambiguate: isTopLevelInView,
    }),
    icon: getVisualForDataSourceViewContentNode(node),
    node,
    expandable: node.expandable,
  }));
}
