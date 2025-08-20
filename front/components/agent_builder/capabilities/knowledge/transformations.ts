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
      isNodeSelected(tree, item.path.split("/")) === true;

    // Initialize configuration if not exists
    if (!configurations[dataSourceView.sId]) {
      configurations[dataSourceView.sId] = {
        dataSourceView,
        selectedResources: [],
        excludedResources: [],
        isSelectAll: isFullDataSource,
        tagsFilter: null,
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

    if (config.isSelectAll) {
      // If all nodes are selected, just add the data source path
      inPaths.push({
        path: baseParts,
        name: dataSourceView.dataSource.name,
        type: "data_source",
        dataSourceView,
      });
      continue;
    }

    if (config.selectedResources.length > 0) {
      // Group selected resources by parent for efficient processing
      const resourcesByParent = new Map<
        string | null,
        typeof config.selectedResources
      >();

      for (const node of config.selectedResources) {
        const parentId = node.parentInternalId || null;
        const nodes = resourcesByParent.get(parentId) || [];
        nodes.push(node);
        resourcesByParent.set(parentId, nodes);
      }

      // Add paths for selected resources
      for (const [parentId, nodes] of resourcesByParent) {
        for (const node of nodes) {
          if (parentId) {
            const pathParts = [
              baseParts,
              ...(
                node.parentInternalIds?.filter(
                  (id) => id !== node.internalId
                ) ?? []
              ).toReversed(),
              node.internalId,
            ];
            inPaths.push({
              path: pathParts.join("/"),
              name: node.title,
              type: "node",
              node,
            });
          } else {
            const pathParts = [baseParts, node.internalId];
            inPaths.push({
              path: pathParts.join("/"),
              name: node.title,
              type: "data_source",
              dataSourceView: node.dataSourceView,
            });
          }
        }
      }
    }

    // Process excluded resources and add them to notInPaths
    if (config.excludedResources.length > 0) {
      // Group excluded resources by parent for efficient processing
      const excludedResourcesByParent = new Map<
        string | null,
        typeof config.excludedResources
      >();

      for (const node of config.excludedResources) {
        const parentId = node.parentInternalId || null;
        const nodes = excludedResourcesByParent.get(parentId) || [];
        nodes.push(node);
        excludedResourcesByParent.set(parentId, nodes);
      }

      // Add paths for excluded resources
      for (const [parentId, nodes] of excludedResourcesByParent) {
        for (const node of nodes) {
          if (parentId) {
            const pathParts = [
              baseParts,
              ...(
                node.parentInternalIds?.filter(
                  (id) => id !== node.internalId
                ) ?? []
              ).toReversed(),
              node.internalId,
            ];
            notInPaths.push({
              path: pathParts.join("/"),
              name: node.title,
              type: "node",
              node,
            });
          } else {
            const pathParts = [baseParts, node.internalId];
            notInPaths.push({
              path: pathParts.join("/"),
              name: node.title,
              type: "data_source",
              dataSourceView: node.dataSourceView,
            });
          }
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
