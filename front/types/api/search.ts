import type { ContentNodeWithParent } from "@app/types/connectors/connectors_api";
import type { SearchWarningCode } from "@app/types/core/core_api";
import type { DataSourceType } from "@app/types/data_source";
import type { DataSourceViewType } from "@app/types/data_source_view";
import { z } from "zod";

export type DataSourceContentNode = ContentNodeWithParent & {
  dataSource: DataSourceType;
  dataSourceViews: DataSourceViewType[];
};

export type PostWorkspaceSearchResponseBody = {
  nodes: DataSourceContentNode[];
  warningCode: SearchWarningCode | null;
  nextPageCursor: string | null;
  resultsCount: number | null;
};

const SearchSort = z.array(
  z.object({
    field: z.enum(["title", "timestamp"]),
    direction: z.enum(["asc", "desc"]),
  })
);
const BaseSearchBody = z
  .object({
    viewType: z.enum(["table", "document", "all"]),
    spaceIds: z.array(z.string()).optional(),
    includeDataSources: z.boolean(),
    limit: z.number(),
    // Search can be narrowed to specific data source view ids for each space.
    dataSourceViewIdsBySpaceId: z
      .record(z.string(), z.array(z.string()))
      .optional(),
    /**
     * Search uses the "read" permission by default so admins can't search
     * spaces they aren't in as users. If allowAdminSpaces is true, the search
     * will use the "admin" permission instead, allowing admins to search all
     * spaces they can administrate.
     *
     * Used to allow admins to useSpaces on global
     */
    allowAdminSearch: z.boolean().optional(),
    excludeNonRemoteDatabaseTables: z.boolean().optional(),
    parentId: z.string().optional(),
    searchSort: SearchSort.optional(),
    /**
     * When true, returns only the highest priority data source view per node
     * based on space access priority (global > non-restricted > restricted).
     * When false or undefined, returns all matching data source views (default behavior).
     */
    prioritizeSpaceAccess: z.boolean().optional(),
  })
  .refine(({ spaceIds, dataSourceViewIdsBySpaceId }) => {
    if (!spaceIds || !dataSourceViewIdsBySpaceId) {
      return true;
    }
    const dsvSpaceIds = Object.keys(dataSourceViewIdsBySpaceId);
    const spaceIdsSet = new Set(spaceIds);

    return dsvSpaceIds.every((sId) => spaceIdsSet.has(sId));
  });

const TextSearchBody = BaseSearchBody.and(
  z.object({
    query: z.string(),
    nodeIds: z.undefined().optional(),
    searchSourceUrls: z.boolean().optional(),
  })
);

const NodeIdSearchBody = BaseSearchBody.and(
  z.object({
    nodeIds: z.array(z.string()),
    query: z.undefined().optional(),
    searchSourceUrls: z.boolean().optional(),
  })
);

export const SearchRequestBody = z.union([TextSearchBody, NodeIdSearchBody]);

export type SearchRequestBodyType = z.infer<typeof SearchRequestBody>;
