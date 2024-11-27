import type { DataSourceViewType, LightWorkspaceType } from "@dust-tt/types";
import type {
  PatchDataSourceWithNameDocumentRequestBody,
  PostDataSourceWithNameDocumentRequestBody,
} from "@dust-tt/types";
import assert from "assert";
import type { Fetcher } from "swr";
import type { SWRMutationConfiguration } from "swr/mutation";
import useSWRMutation from "swr/mutation";

import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { decorateWithInvalidation, mutationFn } from "@app/lib/swr/utils";
import type { GetDataSourceViewDocumentResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_source_views/[dsvId]/documents/[documentId]";
import type { PostDocumentResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_sources/[dsId]/documents";
import type { PatchDocumentResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_sources/[dsId]/documents/[documentId]";

// Centralized way to get urls -> reduces key-related inconcistencies
type CrudUseCases = "CREATE" | "READ" | "UPDATE";
function getUrlHasValidParameters(
  useCase: CrudUseCases,
  documentId?: string
): documentId is string {
  // Only require documentId for GET and PATCH methods
  return useCase === "CREATE" || !!documentId;
}
const getUrl = ({
  useCase,
  owner,
  dataSourceView,
  documentId,
}: {
  useCase: CrudUseCases;
  owner: LightWorkspaceType;
  dataSourceView: DataSourceViewType;
  documentId?: string;
}) => {
  assert(
    getUrlHasValidParameters(useCase, documentId),
    "Cannot get or patch a document without a documentId"
  );

  const baseUrl = `/api/w/${owner.sId}/spaces/${dataSourceView.spaceId}`;
  switch (useCase) {
    case "CREATE":
      return `${baseUrl}/data_sources/${dataSourceView.dataSource.sId}/documents`;
    case "UPDATE":
      return `${baseUrl}/data_sources/${dataSourceView.dataSource.sId}/documents/${encodeURIComponent(documentId)}`;
    case "READ":
      return `${baseUrl}/data_source_views/${dataSourceView.sId}/documents/${encodeURIComponent(documentId)}`;
  }
};

export function useDataSourceViewDocument({
  dataSourceView,
  documentId,
  owner,
  disabled,
}: {
  dataSourceView: DataSourceViewType | null;
  documentId: string | null;
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const dataSourceViewDocumentFetcher: Fetcher<GetDataSourceViewDocumentResponseBody> =
    fetcher;
  const url =
    dataSourceView && documentId
      ? getUrl({
          useCase: "READ",
          owner,
          dataSourceView,
          documentId,
        })
      : null;

  const { data, error, mutate } = useSWRWithDefaults(
    url,
    dataSourceViewDocumentFetcher,
    {
      disabled,
    }
  );

  return {
    document: data?.document,
    isDocumentLoading: !disabled && !error && !data,
    isDocumentError: error,
    mutateDocument: mutate,
  };
}

export function useUpdateDataSourceViewDocument(
  owner: LightWorkspaceType,
  dataSourceView: DataSourceViewType,
  documentName: string,
  options?: SWRMutationConfiguration<PatchDocumentResponseBody, Error, string>
) {
  // Used only for cache invalidation
  const { mutate: mutateContentNodes } = useDataSourceViewContentNodes({
    owner,
    dataSourceView,
    disabled: true,
  });

  // Used only for cache invalidation
  const { mutateDocument } = useDataSourceViewDocument({
    owner,
    dataSourceView,
    documentId: documentName,
    disabled: true,
  });

  // Decorate options's onSuccess with cache invalidation
  const invalidateCacheEntries = async () => {
    await Promise.all([mutateContentNodes, mutateDocument]);
  };
  const decoratedOptions = decorateWithInvalidation(
    options,
    invalidateCacheEntries
  );

  const patchUrl = documentName
    ? getUrl({
        useCase: "UPDATE",
        owner,
        dataSourceView,
        documentId: documentName,
      })
    : null;
  const sendPatchRequest =
    mutationFn<PatchDataSourceWithNameDocumentRequestBody>("PATCH");
  return useSWRMutation(patchUrl, sendPatchRequest, decoratedOptions);
}

export function useCreateDataSourceViewDocument(
  owner: LightWorkspaceType,
  dataSourceView: DataSourceViewType,
  options?: SWRMutationConfiguration<PostDocumentResponseBody, Error, string>
) {
  // Used only for cache invalidation
  const { mutate: mutateContentNodes } = useDataSourceViewContentNodes({
    owner,
    dataSourceView,
    disabled: true,
  });

  // Decorate options's onSuccess with cache invalidation
  const invalidateCacheEntries = async () => {
    await mutateContentNodes();
  };
  const decoratedOptions = decorateWithInvalidation(
    options,
    invalidateCacheEntries
  );

  // Note that this url is not used for fetch -> There is no need to invalidate it on practice.
  const createUrl = getUrl({
    useCase: "CREATE",
    owner,
    dataSourceView,
  });
  const sendPostRequest =
    mutationFn<PostDataSourceWithNameDocumentRequestBody>("POST");
  return useSWRMutation(createUrl, sendPostRequest, decoratedOptions);
}
