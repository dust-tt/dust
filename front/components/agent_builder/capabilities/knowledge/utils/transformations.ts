import type { DataSourceBuilderTreeType } from "@app/components/data_source_view/context/types";
import type { NavigationHistoryEntryType } from "@app/components/data_source_view/context/types";
import { computeNavigationPath } from "@app/components/data_source_view/context/utils";
import type {
  DataSourceViewContentNode,
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
} from "@app/types";

/**
 * Transforms DataSourceBuilderTreeType to DataSourceViewSelectionConfigurations
 *
 * This creates a simplified transformation that works with the path structure
 * used in the tree. Since we don't have access to all nodes at save time,
 * we create placeholder configurations that will be properly resolved on the backend.
 */
export function transformTreeToSelectionConfigurations(
  tree: DataSourceBuilderTreeType,
  dataSourceViews: DataSourceViewType[]
): DataSourceViewSelectionConfigurations {
  const configurations: DataSourceViewSelectionConfigurations = {};

  // Parse the tree paths to extract data source configurations
  for (const path of tree.in) {
    const parts = path.split(".");
    if (parts.length < 2) continue;

    // Expected format: root.spaceId.category.dataSourceId.nodeId...
    // or root.spaceId.dataSourceId.nodeId...
    const spaceId = parts[1];

    // Find the data source view that matches this path
    const dataSourceView = dataSourceViews.find((dsv) => {
      // Check if the path includes this data source
      return path.includes(dsv.sId) && dsv.spaceId === spaceId;
    });

    if (!dataSourceView) continue;

    // Check if this is a full data source selection or specific nodes
    const dsIndex = parts.indexOf(dataSourceView.sId);
    const isFullDataSource = dsIndex === parts.length - 1;

    if (!configurations[dataSourceView.sId]) {
      configurations[dataSourceView.sId] = {
        dataSourceView,
        selectedResources: [],
        isSelectAll: isFullDataSource,
        tagsFilter: null,
      };
    }

    // If it's not a full data source selection, we need to handle individual nodes
    // For now, we'll mark it as having selected resources even though we don't have the full node data
    if (!isFullDataSource && !configurations[dataSourceView.sId].isSelectAll) {
      // We'll need the backend to resolve the actual nodes from paths
      // For now, just ensure it's not marked as select all
      configurations[dataSourceView.sId].isSelectAll = false;
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
  const inPaths: string[] = [];
  const notInPaths: string[] = [];

  for (const [dsId, config] of Object.entries(configurations)) {
    const { dataSourceView } = config;

    // Build the base path components exactly matching navigation structure
    const baseParts = ["root", dataSourceView.spaceId];

    // Add category - this is critical for proper path reconstruction
    if (dataSourceView.category) {
      baseParts.push(dataSourceView.category);
    }

    // Add data source ID (dsv_...)
    baseParts.push(dataSourceView.sId);

    if (config.isSelectAll) {
      // If all nodes are selected, just add the data source path
      inPaths.push(baseParts.join("."));
    } else if (config.selectedResources.length > 0) {
      // Group selected resources by parent to understand folder structure
      const resourcesByParent = new Map<
        string | null,
        typeof config.selectedResources
      >();

      config.selectedResources.forEach((node) => {
        const parentId = node.parentInternalId || null;
        if (!resourcesByParent.has(parentId)) {
          resourcesByParent.set(parentId, []);
        }
        resourcesByParent.get(parentId)!.push(node);
      });

      // For each parent folder that has selected children, we need to:
      // 1. Add paths for the individual files
      // 2. Store metadata about parent folders for partial selection detection
      for (const [parentId, nodes] of resourcesByParent) {
        if (parentId) {
          // There's a parent folder - add it to a special tracking system
          // Add individual file paths
          nodes.forEach((node) => {
            const filePath = [...baseParts, parentId, node.internalId].join(
              "."
            );
            inPaths.push(filePath);
          });
        } else {
          // Files directly under data source
          nodes.forEach((node) => {
            const filePath = [...baseParts, node.internalId].join(".");
            inPaths.push(filePath);
          });
        }
      }
    }
  }

  const result = {
    in: deduplicatePaths(inPaths),
    notIn: deduplicatePaths(notInPaths),
  };

  return result;
}

/**
 * Removes duplicate paths and paths that are already covered by parent paths
 */
function deduplicatePaths(paths: string[]): string[] {
  const uniquePaths = [...new Set(paths)];

  // Remove paths that are covered by parent paths
  return uniquePaths.filter((path) => {
    return !uniquePaths.some(
      (otherPath) => otherPath !== path && path.startsWith(otherPath + ".")
    );
  });
}
