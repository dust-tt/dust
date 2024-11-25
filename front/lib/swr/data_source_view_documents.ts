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
import { fetcher, fetcherWithBody, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetDataSourceViewDocumentResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_source_views/[dsvId]/documents/[documentId]";
import type { PostDocumentResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_sources/[dsId]/documents";
import type { PatchDocumentResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_sources/[dsId]/documents/[documentId]";

// Centralized way to get urls -> reduces key-related inconcistencies
function getUrlHasValidParameters(
  method: "POST" | "GET" | "PATCH",
  documentId?: string
): documentId is string {
  // Only require documentId for GET and PATCH methods
  return method === "POST" || !!documentId;
}
const getUrl = ({
  method,
  owner,
  dataSourceView,
  documentId,
}: {
  method: "POST" | "GET" | "PATCH";
  owner: LightWorkspaceType;
  dataSourceView: DataSourceViewType;
  documentId?: string;
}) => {
  assert(
    getUrlHasValidParameters(method, documentId),
    "Cannot get or patch a document without a documentId"
  );

  const baseUrl = `/api/w/${owner.sId}/spaces/${dataSourceView.spaceId}`;
  switch (method) {
    case "POST":
      return `${baseUrl}/data_sources/${dataSourceView.dataSource.sId}/documents`;
    case "PATCH":
      return `${baseUrl}/data_sources/${dataSourceView.dataSource.sId}/documents/${encodeURIComponent(documentId)}`;
    case "GET":
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
          method: "GET",
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

async function sendPatchRequest(
  url: string,
  {
    arg,
  }: {
    arg: {
      documentBody: PatchDataSourceWithNameDocumentRequestBody;
    };
  }
) {
  const res = await fetcherWithBody([url, arg.documentBody, "PATCH"]);
  return res;
}

function decorateWithInvalidation<T>(
  options: SWRMutationConfiguration<T, Error, string> | undefined,
  invalidateCacheEntries: () => Promise<void>
): SWRMutationConfiguration<T, Error, string> {
  return options
    ? {
        ...options,
        onSuccess: async (data, key, config) => {
          await options.onSuccess?.(data, key, config);
          await invalidateCacheEntries();
        },
      }
    : {
        onSuccess: invalidateCacheEntries,
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
        method: "PATCH",
        owner,
        dataSourceView,
        documentId: documentName,
      })
    : null;
  return useSWRMutation(patchUrl, sendPatchRequest, decoratedOptions);
}

async function sendPostRequest(
  url: string,
  {
    arg,
  }: {
    arg: {
      documentBody: PostDataSourceWithNameDocumentRequestBody;
    };
  }
) {
  const res = await fetcherWithBody([url, arg.documentBody, "POST"]);
  return res;
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
    method: "POST",
    owner,
    dataSourceView,
  });
  return useSWRMutation(createUrl, sendPostRequest, decoratedOptions);
}
