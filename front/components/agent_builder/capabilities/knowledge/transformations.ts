import uniqBy from "lodash/uniqBy";

import type {
  DataSourceBuilderTreeItemType,
  DataSourceBuilderTreeType,
} from "@app/components/data_source_view/context/types";
import { isNodeSelected } from "@app/components/data_source_view/context/utils";
import type {
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
} from "@app/types";

/**
 * Transforms DataSourceBuilderTreeType to DataSourceViewSelectionConfigurations
 *
 * This creates a simplified transformation that works with the path structure
 * used in the tree. For paths that represent full data source selections,
 * we set isSelectAll=true. For specific node selections, we create minimal
 * resource entries that will be expanded on the backend.
 */
export function transformTreeToSelectionConfigurations(
  tree: DataSourceBuilderTreeType,
  dataSourceViews: DataSourceViewType[]
): DataSourceViewSelectionConfigurations {
  const configurations: DataSourceViewSelectionConfigurations = {};

  const dataSourceViewMap = new Map(
    dataSourceViews.map((dsv) => [dsv.sId, dsv])
  );

  // Parse the tree paths to extract data source configurations from included items
  for (const item of tree.in) {
    // We can skip for item that aren't data_source or node. As we only allow those
    // to be selected, it safe to skip, and make our life easier type wise after that checks
    if (item.type !== "node" && item.type !== "data_source") {
      continue;
    }

    const parts = item.path.split("/");
    // Find the data source view ID in the path - optimize with early break
    const dsvIdIndex = parts.findIndex((part) => isDataSourceViewId(part));
    const dsvId = parts[dsvIdIndex];

    if (dsvId == null) {
      continue;
    }

    const dataSourceView = dataSourceViewMap.get(dsvId);
    if (!dataSourceView || dataSourceView.spaceId !== parts[1]) {
      continue;
    }

    // Check if this is a full data source selection or specific nodes
    const isFullDataSource =
      item.type === "data_source" &&
      (isNodeSelected(tree, item.path.split("/")) === true ||
        isNodeSelected(tree, item.path.split("/")) === "partial");

    // Initialize configuration if not exists
    if (!configurations[dataSourceView.sId]) {
      configurations[dataSourceView.sId] = {
        dataSourceView,
        selectedResources: [],
        excludedResources: [],
        isSelectAll: isFullDataSource,
        tagsFilter: item.tagsFilter,
      };
    }

    // If it's not a full data source selection, extract the selected nodes
    if (item.type === "node") {
      configurations[dataSourceView.sId].selectedResources.push(item.node);
    }
  }

  // Parse the tree paths to extract excluded resources from notIn items
  for (const item of tree.notIn) {
    // We can skip for item that aren't data_source or node. As we only allow those
    // to be excluded, it safe to skip, and make our life easier type wise after that checks
    if (item.type !== "node" && item.type !== "data_source") {
      continue;
    }

    const parts = item.path.split("/");
    // Find the data source view ID in the path - optimize with early break
    const dsvIdIndex = parts.findIndex((part) => isDataSourceViewId(part));
    const dsvId = parts[dsvIdIndex];

    if (dsvId == null) {
      continue;
    }

    const dataSourceView = dataSourceViewMap.get(dsvId);
    if (!dataSourceView || dataSourceView.spaceId !== parts[1]) {
      continue;
    }

    // Initialize configuration if not exists
    if (!configurations[dataSourceView.sId]) {
      configurations[dataSourceView.sId] = {
        dataSourceView,
        selectedResources: [],
        excludedResources: [],
        // By default, we consider the data source to be selected when we start by excluding nodes.
        isSelectAll: true,
        tagsFilter: null,
      };
    }

    // Extract the excluded nodes
    if (item.type === "node") {
      configurations[dataSourceView.sId].excludedResources.push(item.node);
    }
  }

  return configurations;
}

/**
 * Transforms DataSourceViewSelectionConfigurations to DataSourceBuilderTreeType
 *
 * This function converts node-based selection configurations back to
 * path-based selection (in/notIn arrays).
 *
 * The path structure is: root.spaceId.category.dataSourceId.nodeId1.nodeId2...
 */
export function transformSelectionConfigurationsToTree(
  configurations: DataSourceViewSelectionConfigurations
): DataSourceBuilderTreeType {
  const inPaths: DataSourceBuilderTreeItemType[] = [];
  const notInPaths: DataSourceBuilderTreeItemType[] = [];

  for (const config of Object.values(configurations)) {
    const { dataSourceView } = config;
    const baseParts = buildDataSourcePath(dataSourceView);

    // If all nodes are selected, just add the data source path
    if (config.isSelectAll) {
      inPaths.push({
        path: baseParts,
        name: dataSourceView.dataSource.name,
        type: "data_source",
        dataSourceView,
        tagsFilter: config.tagsFilter,
      });
      continue;
    }

    // UI reconstruction guard:
    // When a configuration only contains exclusions (selectedResources empty
    // and excludedResources non-empty), it represents "select all in the
    // data source except the excluded ones". Historically some payloads may
    // serialize this with `isSelectAll: false`. To faithfully reconstruct the
    // UI selection state, we still need to include the parent data source in
    // the `in` paths so the list shows a selected source with partial state
    // and the footer appears.
    if (
      !config.isSelectAll &&
      config.selectedResources.length === 0 &&
      config.excludedResources.length > 0
    ) {
      inPaths.push({
        path: baseParts,
        name: dataSourceView.dataSource.name,
        type: "data_source",
        dataSourceView,
        tagsFilter: config.tagsFilter,
      });
    }

    if (config.selectedResources.length > 0) {
      for (const node of config.selectedResources) {
        if (node.parentInternalId) {
          const pathParts = [
            baseParts,
            ...(
              node.parentInternalIds?.filter((id) => id !== node.internalId) ??
              []
            ).toReversed(),
            node.internalId,
          ];
          inPaths.push({
            path: pathParts.join("/"),
            name: node.title,
            type: "node",
            node,
            tagsFilter: config.tagsFilter,
          });
        } else {
          const pathParts = [baseParts, node.internalId];
          // All selected resources should be treated as "node" type
          // to ensure they're not incorrectly marked as full data source selections
          inPaths.push({
            path: pathParts.join("/"),
            name: node.title,
            type: "node",
            node,
            tagsFilter: config.tagsFilter,
          });
        }
      }
    }

    // Process excluded resources and add them to notInPaths
    if (config.excludedResources.length > 0) {
      // Add paths for excluded resources
      for (const node of config.excludedResources) {
        if (node.parentInternalId) {
          const pathParts = [
            baseParts,
            ...(
              node.parentInternalIds?.filter((id) => id !== node.internalId) ??
              []
            ).toReversed(),
            node.internalId,
          ];
          notInPaths.push({
            path: pathParts.join("/"),
            name: node.title,
            type: "node",
            node,
            tagsFilter: null,
          });
        } else {
          const pathParts = [baseParts, node.internalId];
          notInPaths.push({
            path: pathParts.join("/"),
            name: node.title,
            type: "node",
            node,
            tagsFilter: null,
          });
        }
      }
    }
  }

  const res = {
    in: deduplicatePaths(inPaths),
    notIn: deduplicatePaths(notInPaths),
  };

  return res;
}

/**
 * Removes duplicate paths and paths that are already covered by parent paths
 */
function deduplicatePaths(
  paths: DataSourceBuilderTreeItemType[]
): DataSourceBuilderTreeItemType[] {
  const uniquePaths = uniqBy(paths, (el) => el.path);

  // Remove paths that are covered by parent paths
  return uniquePaths.filter((path) => {
    return !uniquePaths.some(
      (otherPath) =>
        otherPath !== path && path.path.startsWith(otherPath.path + "/")
    );
  });
}

/**
 * Type guard to check if a path segment is a valid data source view ID
 */
function isDataSourceViewId(segment: string): boolean {
  return segment.startsWith("dsv_");
}

/**
 * Builds a navigation path for a data source view
 */
function buildDataSourcePath(dataSourceView: DataSourceViewType): string {
  const parts = ["root", dataSourceView.spaceId];

  if (dataSourceView.category) {
    parts.push(dataSourceView.category);
  }

  parts.push(dataSourceView.sId);
  return parts.join("/");
}
