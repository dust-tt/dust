import { useSendNotification } from "@app/hooks/useNotification";
import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetDataSourceViewDocumentResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_source_views/[dsvId]/documents/[documentId]";
import type { PostDocumentResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_sources/[dsId]/documents";
import type { PatchDocumentResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_sources/[dsId]/documents/[documentId]";
import type {
  PatchDataSourceDocumentRequestBody,
  PostDataSourceDocumentRequestBody,
} from "@app/types/api/public/data_sources";
import type { DataSourceViewType } from "@app/types/data_source_view";
import { isAPIErrorResponse } from "@app/types/error";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

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
  const { fetcher } = useFetcher();
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
  const { fetcherWithBody } = useFetcher();

  const doUpdate = async (body: PatchDataSourceDocumentRequestBody) => {
    const patchUrl =
      `/api/w/${owner.sId}/spaces/${dataSourceView.spaceId}/` +
      `data_sources/${dataSourceView.dataSource.sId}/documents/${encodeURIComponent(documentId)}`;
    try {
      const response: PatchDocumentResponseBody = await fetcherWithBody([
        patchUrl,
        body,
        "PATCH",
      ]);

      void mutateContentNodes();
      void mutateDocument();

      sendNotification({
        type: "success",
        title: "Document updated",
        description: "Document has been updated",
      });

      return response.document;
    } catch (e) {
      if (isAPIErrorResponse(e)) {
        sendNotification({
          type: "error",
          title: "Failed to update document",
          description: `Error: ${e.error.message}`,
        });
      } else {
        sendNotification({
          type: "error",
          title: "Failed to update document",
          description: "An error occurred",
        });
      }
      return null;
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
  const { fetcherWithBody } = useFetcher();

  const doCreate = async (body: PostDataSourceDocumentRequestBody) => {
    const createUrl =
      `/api/w/${owner.sId}/spaces/${dataSourceView.spaceId}/` +
      `data_sources/${dataSourceView.dataSource.sId}/documents`;
    try {
      const response: PostDocumentResponseBody = await fetcherWithBody([
        createUrl,
        body,
        "POST",
      ]);

      void mutateContentNodes();

      sendNotification({
        type: "success",
        title: "Document processing",
        description: "Your document is processing and will appear shortly",
      });

      return response.document;
    } catch (e) {
      if (isAPIErrorResponse(e)) {
        sendNotification({
          type: "error",
          title: "Failed to create document",
          description: `Error: ${e.error.message}`,
        });
      } else {
        sendNotification({
          type: "error",
          title: "Failed to create document",
          description: "An error occurred",
        });
      }
      return null;
    }
  };

  return doCreate;
}
