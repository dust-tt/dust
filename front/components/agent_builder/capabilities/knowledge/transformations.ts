import uniqBy from "lodash/uniqBy";

import type {
  DataSourceBuilderTreeItemType,
  DataSourceBuilderTreeType,
} from "@app/components/data_source_view/context/types";
import type {
  DataSourceViewContentNode,
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
} from "@app/types";

/**
 * Creates a placeholder DataSourceViewContentNode with minimal information.
 * The actual content node data will be resolved on the backend when this
 * configuration is used.
 */
function getPlaceholderResource(
  nodeId: string,
  parentId: string | null,
  dataSourceView: DataSourceViewType
): DataSourceViewContentNode {
  return {
    internalId: nodeId,
    parentInternalId: parentId,
    parentInternalIds: parentId ? [parentId] : null,
    parentTitle: null,
    title: nodeId,
    type: "document",
    mimeType: "application/octet-stream",
    lastUpdatedAt: null,
    expandable: false,
    permission: "read",
    providerVisibility: null,
    sourceUrl: null,
    preventSelection: false,
    dataSourceView,
  };
}

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

  const existingResourcesMap = new Map<string, Set<string>>();

  // Parse the tree paths to extract data source configurations
  for (const path of tree.in) {
    const parts = path.path.split(".");
    if (parts.length < 2 || parts[0] !== "root") {
      continue;
    }

    // Find the data source view ID in the path - optimize with early break
    let dsvIdIndex = -1;
    let dsvId = "";
    for (let i = 1; i < parts.length; i++) {
      if (isDataSourceViewId(parts[i])) {
        dsvIdIndex = i;
        dsvId = parts[i];
        break;
      }
    }

    if (dsvIdIndex === -1) {
      continue;
    }

    const dataSourceView = dataSourceViewMap.get(dsvId);
    if (!dataSourceView || dataSourceView.spaceId !== parts[1]) {
      continue;
    }

    // Check if this is a full data source selection or specific nodes
    const isFullDataSource = dsvIdIndex === parts.length - 1;

    // Initialize configuration if not exists
    if (!configurations[dataSourceView.sId]) {
      configurations[dataSourceView.sId] = {
        dataSourceView,
        selectedResources: [],
        isSelectAll: isFullDataSource,
        tagsFilter: null,
      };
      existingResourcesMap.set(dataSourceView.sId, new Set<string>());
    }

    // If it's not a full data source selection, extract the selected nodes
    if (!isFullDataSource) {
      configurations[dataSourceView.sId].isSelectAll = false;

      // Extract node information from the path
      const nodeIds = parts.slice(dsvIdIndex + 1);
      if (nodeIds.length > 0) {
        const nodeId = nodeIds[nodeIds.length - 1]; // Last part is the selected node
        const parentId =
          nodeIds.length > 1 ? nodeIds[nodeIds.length - 2] : null;

        const existingResources = existingResourcesMap.get(dataSourceView.sId)!;
        if (!existingResources.has(nodeId)) {
          existingResources.add(nodeId);
          configurations[dataSourceView.sId].selectedResources.push(
            getPlaceholderResource(nodeId, parentId, dataSourceView)
          );
        }
      }
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
      inPaths.push(baseParts);
    } else if (config.selectedResources.length > 0) {
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
          const pathParts = parentId
            ? [...baseParts.path, parentId, node.internalId]
            : [...baseParts.path, node.internalId];

          inPaths.push({
            path: pathParts.join("."),
            name: node.title,
            readablePath: "",
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
        otherPath !== path && path.path.startsWith(otherPath.path + ".")
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
function buildDataSourcePath(
  dataSourceView: DataSourceViewType
): DataSourceBuilderTreeItemType {
  const parts = ["root", dataSourceView.spaceId];

  if (dataSourceView.category) {
    parts.push(dataSourceView.category);
  }

  parts.push(dataSourceView.sId);
  return {
    path: parts.join("."),
    name: dataSourceView.dataSource.name,
    readablePath: "",
  };
}
