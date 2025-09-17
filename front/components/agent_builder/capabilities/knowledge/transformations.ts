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
 * Handles three selection patterns:
 * 1. Full data source selection: isSelectAll=true, no exclusions
 * 2. Partial selection: specific nodes selected, no exclusions
 * 3. "Select all with exclusions": isSelectAll=true with excluded resources
 *
 * The third pattern is detected when we have exclusions but no explicit inclusions,
 * indicating the user selected the entire data source then excluded specific items.
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
      isNodeSelected(tree, item.path.split("/")) === true;

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
        isSelectAll: false,
        tagsFilter: null,
      };
    }

    // Extract the excluded nodes
    if (item.type === "node") {
      configurations[dataSourceView.sId].excludedResources.push(item.node);
    }
  }

  // Post-process configurations to detect "select all with exclusions" patterns
  // When we have exclusions but no selected resources, this indicates a
  // "select all except..." scenario that should be marked as isSelectAll=true
  for (const config of Object.values(configurations)) {
    const hasExclusions = config.excludedResources.length > 0;
    const hasSelectedResources = config.selectedResources.length > 0;
    const currentIsSelectAll = config.isSelectAll;

    if (hasExclusions && !hasSelectedResources && !currentIsSelectAll) {
      config.isSelectAll = true;
    }
  }

  return configurations;
}

/**
 * Transforms DataSourceViewSelectionConfigurations to DataSourceBuilderTreeType
 *
 * Converts saved configurations back to UI tree structure with in/notIn arrays.
 * Handles the three selection patterns:
 * 1. Full selection: adds data source to 'in', no 'notIn' items
 * 2. Partial selection: adds specific nodes to 'in'
 * 3. "Select all with exclusions": adds data source to 'in' AND excluded nodes to 'notIn'
 *
 * Path structure: root/spaceId/category/dataSourceId/nodeId1/nodeId2/...
 */
export function transformSelectionConfigurationsToTree(
  configurations: DataSourceViewSelectionConfigurations
): DataSourceBuilderTreeType {
  const inPaths: DataSourceBuilderTreeItemType[] = [];
  const notInPaths: DataSourceBuilderTreeItemType[] = [];

  for (const config of Object.values(configurations)) {
    const { dataSourceView } = config;
    const baseParts = buildDataSourcePath(dataSourceView);

    // Handle data source level selections
    const shouldAddDataSource =
      config.isSelectAll || config.excludedResources.length > 0;
    const hasPartialSelection =
      config.selectedResources.length > 0 &&
      config.excludedResources.length > 0;

    if (shouldAddDataSource && !hasPartialSelection) {
      // Add the full data source for "select all" scenarios
      inPaths.push({
        path: baseParts,
        name: dataSourceView.dataSource.name,
        type: "data_source",
        dataSourceView,
        tagsFilter: config.tagsFilter,
      });

      // For "select all" without exclusions, skip individual resource processing
      if (config.isSelectAll && config.excludedResources.length === 0) {
        continue;
      }
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

  return {
    in: deduplicatePaths(inPaths),
    notIn: deduplicatePaths(notInPaths),
  };
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
