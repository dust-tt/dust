import { useSendNotification } from "@dust-tt/sparkle";
import type { SWRConfiguration } from "swr";

import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import { getErrorFromResponse, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  UpsertFileToDataSourceRequestBody,
  UpsertFileToDataSourceResponseBody,
} from "@app/pages/api/w/[wId]/data_sources/[dsId]/files";
import type { DataSourceViewType, LightWorkspaceType } from "@app/types";

export const getFileProcessedUrl = (
  owner: LightWorkspaceType,
  fileId: string
) => `/api/w/${owner.sId}/files/${fileId}?action=view&version=processed`;

export function useFileProcessedContent(
  owner: LightWorkspaceType,
  fileId: string | null,
  config?: SWRConfiguration & {
    disabled?: boolean;
  }
) {
  const isDisabled = config?.disabled || fileId === null;

  const {
    data: response,
    error,
    mutate,
  } = useSWRWithDefaults(
    isDisabled ? null : getFileProcessedUrl(owner, fileId),
    // Stream fetcher -> don't try to parse the stream
    // Wait for initial response to trigger swr error handling
    async (...args) => {
      const response = await fetch(...args);
      if (!response.ok) {
        throw new Error(`Error reading the file content: ${response.status}`);
      }
      return response;
    },
    config
  );

  return {
    // Do not extract text from the response -> Allows streaming on client side
    content: () => response ?? null,
    isContentLoading: isDisabled ? false : !error && !response,
    isContentError: isDisabled ? false : error,
    mutateFileProcessedContent: mutate,
  };
}

export function useUpsertFileAsDatasourceEntry(
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

  const doCreate = async (body: UpsertFileToDataSourceRequestBody) => {
    const upsertUrl = `/api/w/${owner.sId}/data_sources/${dataSourceView.dataSource.sId}/files`;
    const res = await fetch(upsertUrl, {
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
        title: "Failed to upload the file.",
        description: `Error: ${errorData.message}`,
      });
      return null;
    } else {
      void mutateContentNodes();

      sendNotification({
        type: "success",
        title: "File processing",
        description: "Your file is processing and will appear shortly.",
      });

      const response: UpsertFileToDataSourceResponseBody = await res.json();
      return response.file;
    }
  };

  return doCreate;
}
