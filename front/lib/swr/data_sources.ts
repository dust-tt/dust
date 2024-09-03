import type { LightContentNode, LightWorkspaceType } from "@dust-tt/types";
import { useMemo } from "react";
import type { Fetcher, SWRConfiguration } from "swr";

import { fetcher, postFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetDataSourcesResponseBody } from "@app/pages/api/w/[wId]/data_sources";
import type { GetDocumentsResponseBody } from "@app/pages/api/w/[wId]/data_sources/[name]/documents";
import type { GetDocumentResponseBody } from "@app/pages/api/w/[wId]/data_sources/[name]/documents/[documentId]";
import type { GetContentNodesResponseBody } from "@app/pages/api/w/[wId]/data_sources/[name]/managed/content-nodes";
import type { GetContentNodeParentsResponseBody } from "@app/pages/api/w/[wId]/data_sources/[name]/managed/parents";

export function useDataSources(
  owner: LightWorkspaceType,
  options = { disabled: false }
) {
  const { disabled } = options;
  const dataSourcesFetcher: Fetcher<GetDataSourcesResponseBody> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    disabled ? null : `/api/w/${owner.sId}/data_sources`,
    dataSourcesFetcher
  );

  return {
    dataSources: useMemo(() => (data ? data.dataSources : []), [data]),
    isDataSourcesLoading: disabled ? false : !error && !data,
    isDataSourcesError: disabled ? false : error,
    mutateDataSources: mutate,
  };
}

interface UseDataSourceKey {
  workspaceId: string;
  dataSourceName: string;
  internalIds: string[];
}

interface UseDataSourceResult {
  contentNodes: LightContentNode[];
  parentsById: Record<string, Set<string>>;
}

export function useDataSourceNodes(
  key: UseDataSourceKey,
  options?: SWRConfiguration<{
    contentNodes: LightContentNode[];
    parentsById: Record<string, Set<string>>;
  }>
) {
  const contentNodesFetcher: Fetcher<UseDataSourceResult, string> = async (
    key: string
  ) => {
    const { workspaceId, dataSourceName, internalIds } = JSON.parse(key);
    if (internalIds.length === 0) {
      return { contentNodes: [], parentsById: {} };
    }

    const nodesUrl = `/api/w/${workspaceId}/data_sources/${encodeURIComponent(
      dataSourceName
    )}/managed/content-nodes`;

    const parentsUrl = `/api/w/${workspaceId}/data_sources/${encodeURIComponent(
      dataSourceName
    )}/managed/parents`;

    const [nodesData, parentsData]: [
      GetContentNodesResponseBody,
      GetContentNodeParentsResponseBody,
    ] = await Promise.all([
      postFetcher([nodesUrl, { internalIds }]),
      postFetcher([parentsUrl, { internalIds }]),
    ]);

    const { contentNodes } = nodesData;
    if (contentNodes.length !== internalIds.length) {
      throw new Error(
        `Failed to fetch content nodes for all tables. Expected ${internalIds.length}, got ${contentNodes.length}.`
      );
    }

    const parentsById = parentsData.nodes.reduce(
      (acc, r) => {
        acc[r.internalId] = new Set(r.parents);
        return acc;
      },
      {} as Record<string, Set<string>>
    );

    return { contentNodes, parentsById };
  };

  const serializeKey = (k: UseDataSourceKey) => JSON.stringify(k);

  const { data, error } = useSWRWithDefaults(
    serializeKey(key),
    contentNodesFetcher,
    options
  );

  return {
    isNodesLoading: !error && !data,
    isNodesError: error,
    nodes: {
      contentNodes: data?.contentNodes,
      parentsById: data?.parentsById,
    },
    serializeKey,
  };
}

export function useDocument({
  workspaceId,
  dataSourceName,
  documentId,
}: {
  workspaceId: string;
  dataSourceName: string;
  documentId: string | null;
}) {
  const documentFetcher: Fetcher<GetDocumentResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    documentId
      ? `/api/w/${workspaceId}/data_sources/${dataSourceName}/documents/${documentId}`
      : null,
    documentFetcher
  );

  return {
    document: useMemo(() => (data ? data.document : null), [data]),
    isDocumentLoading: !error && !data,
    isDocumentError: error,
    mutateDocument: mutate,
  };
}

export function useDocuments(
  owner: LightWorkspaceType,
  dataSource: { name: string },
  limit: number,
  offset: number
) {
  const documentsFetcher: Fetcher<GetDocumentsResponseBody> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/data_sources/${
      dataSource.name
    }/documents?limit=${limit}&offset=${offset}`,
    documentsFetcher
  );

  return {
    documents: useMemo(() => (data ? data.documents : []), [data]),
    total: data ? data.total : 0,
    isDocumentsLoading: !error && !data,
    isDocumentsError: error,
    mutateDocuments: mutate,
  };
}
