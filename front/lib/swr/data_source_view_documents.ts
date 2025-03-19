import { useSendNotification } from "@dust-tt/sparkle";
import type { Fetcher } from "swr";

import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import {
  fetcher,
  getErrorFromResponse,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { GetDataSourceViewDocumentResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_source_views/[dsvId]/documents/[documentId]";
import type { PostDocumentResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_sources/[dsId]/documents";
import type { PatchDocumentResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_sources/[dsId]/documents/[documentId]";
import type {
  DataSourceViewType,
  LightWorkspaceType,
  PatchDataSourceDocumentRequestBody,
  PostDataSourceDocumentRequestBody,
} from "@app/types";

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
      ? `/api/w/${owner.sId}/spaces/${dataSourceView.spaceId}/data_source_views/` +
        `${dataSourceView.sId}/documents/${encodeURIComponent(documentId)}`
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
  documentId: string
) {
  const { mutateRegardlessOfQueryParams: mutateContentNodes } =
    useDataSourceViewContentNodes({
      owner,
      dataSourceView,
      disabled: true, // Needed just to create
    });

  // Used only for cache invalidation
  const { mutateDocument } = useDataSourceViewDocument({
    owner,
    dataSourceView,
    documentId,
    disabled: true, // Needed just to create
  });

  const sendNotification = useSendNotification();

  const doUpdate = async (body: PatchDataSourceDocumentRequestBody) => {
    const patchUrl =
      `/api/w/${owner.sId}/spaces/${dataSourceView.spaceId}/` +
      `data_sources/${dataSourceView.dataSource.sId}/documents/${encodeURIComponent(documentId)}`;
    const res = await fetch(patchUrl, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errorData = await getErrorFromResponse(res);
      sendNotification({
        type: "error",
        title: "Failed to update document",
        description: `Error: ${errorData.message}`,
      });
      return null;
    } else {
      void mutateContentNodes();
      void mutateDocument();

      sendNotification({
        type: "success",
        title: "Document updated",
        description: "Document has been updated",
      });

      const response: PatchDocumentResponseBody = await res.json();
      return response.document;
    }
  };
  return doUpdate;
}

export function useCreateDataSourceViewDocument(
  owner: LightWorkspaceType,
  dataSourceView: DataSourceViewType
) {
  // Used only for cache invalidation
  const { mutateRegardlessOfQueryParams: mutateContentNodes } =
    useDataSourceViewContentNodes({
      owner,
      dataSourceView,
      disabled: true,
    });

  const sendNotification = useSendNotification();

  const doCreate = async (body: PostDataSourceDocumentRequestBody) => {
    const createUrl =
      `/api/w/${owner.sId}/spaces/${dataSourceView.spaceId}/` +
      `data_sources/${dataSourceView.dataSource.sId}/documents`;
    const res = await fetch(createUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errorData = await getErrorFromResponse(res);
      sendNotification({
        type: "error",
        title: "Failed to create document",
        description: `Error: ${errorData.message}`,
      });
      return null;
    } else {
      void mutateContentNodes();

      sendNotification({
        type: "success",
        title: "Document processing",
        description: "Your document will appear shortly",
      });

      const response: PostDocumentResponseBody = await res.json();
      return response.document;
    }
  };

  return doCreate;
}
