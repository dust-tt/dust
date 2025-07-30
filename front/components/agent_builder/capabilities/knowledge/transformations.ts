import type { DataSourceBuilderTreeType } from "@app/components/data_source_view/context/types";
import type {
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

  // Create a map for efficient lookup
  const dataSourceViewMap = new Map(
    dataSourceViews.map((dsv) => [dsv.sId, dsv])
  );

  // Parse the tree paths to extract data source configurations
  for (const path of tree.in) {
    const parts = path.split(".");
    if (parts.length < 2 || parts[0] !== "root") {
      continue;
    }

    // Find the data source view ID in the path
    const dsvIdIndex = parts.findIndex(isDataSourceViewId);
    if (dsvIdIndex === -1) {
      continue;
    }

    const dsvId = parts[dsvIdIndex];
    const dataSourceView = dataSourceViewMap.get(dsvId);

    if (!dataSourceView || dataSourceView.spaceId !== parts[1]) {
      continue;
    }

    // Check if this is a full data source selection or specific nodes
    const isFullDataSource = dsvIdIndex === parts.length - 1;

    if (!configurations[dataSourceView.sId]) {
      configurations[dataSourceView.sId] = {
        dataSourceView,
        selectedResources: [],
        isSelectAll: isFullDataSource,
        tagsFilter: null,
      };
    }

    // If it's not a full data source selection, mark as partial
    if (!isFullDataSource && !configurations[dataSourceView.sId].isSelectAll) {
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

  for (const config of Object.values(configurations)) {
    const { dataSourceView } = config;
    const baseParts = buildDataSourcePath(dataSourceView);

    if (config.isSelectAll) {
      // If all nodes are selected, just add the data source path
      inPaths.push(baseParts.join("."));
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
            ? [...baseParts, parentId, node.internalId]
            : [...baseParts, node.internalId];
          inPaths.push(pathParts.join("."));
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
function deduplicatePaths(paths: string[]): string[] {
  const uniquePaths = [...new Set(paths)];

  // Remove paths that are covered by parent paths
  return uniquePaths.filter((path) => {
    return !uniquePaths.some(
      (otherPath) => otherPath !== path && path.startsWith(otherPath + ".")
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
function buildDataSourcePath(dataSourceView: DataSourceViewType): string[] {
  const parts = ["root", dataSourceView.spaceId];

  if (dataSourceView.category) {
    parts.push(dataSourceView.category);
  }

  parts.push(dataSourceView.sId);
  return parts;
}
