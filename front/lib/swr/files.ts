import type { FileType } from "@dust-tt/client";
import type { Fetcher, SWRConfiguration } from "swr";

import { useSendNotification } from "@app/hooks/useNotification";
import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import {
  fetcher,
  getErrorFromResponse,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { PublicFileResponseBody } from "@app/pages/api/v1/public/files/[shortToken]";
import type {
  UpsertFileToDataSourceRequestBody,
  UpsertFileToDataSourceResponseBody,
} from "@app/pages/api/w/[wId]/data_sources/[dsId]/files";
import type { ShareFileResponseBody } from "@app/pages/api/w/[wId]/files/[fileId]/share";
import type { DataSourceViewType, LightWorkspaceType } from "@app/types";

export const getFileProcessedUrl = (
  owner: LightWorkspaceType,
  fileId: string
) => `/api/w/${owner.sId}/files/${fileId}?action=view&version=processed`;

export const getProcessedFileDownloadUrl = (
  owner: LightWorkspaceType,
  fileId: string
) => `/api/w/${owner.sId}/files/${fileId}?action=download&version=processed`;

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
    // Stream fetcher -> don't try to parse the stream.
    // Wait for initial response to trigger swr error handling.
    async (...args) => {
      const response = await fetch(...args, { redirect: "manual" });

      // File is not safe to display -> opaque redirect response. Return null.
      if (response.type === "opaqueredirect") {
        return null;
      }

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

export function useFileMetadata({
  fileId,
  owner,
  cacheKey,
}: {
  fileId: string | null;
  owner: LightWorkspaceType;
  cacheKey?: string | null;
}) {
  const fileMetadataFetcher: Fetcher<FileType> = fetcher;

  // Include cacheKey in the SWR key if provided to force cache invalidation.
  const swrKey = fileId
    ? cacheKey
      ? `/api/w/${owner.sId}/files/${fileId}/metadata?v=${cacheKey}`
      : `/api/w/${owner.sId}/files/${fileId}/metadata`
    : null;

  const { data, error, mutate } = useSWRWithDefaults(
    swrKey,
    fileMetadataFetcher
  );

  return {
    fileMetadata: data,
    isFileMetadataLoading: !error && !data,
    isFileMetadataError: error,
    mutateFileMetadata: mutate,
  };
}

export function useFileContent({
  fileId,
  owner,
}: {
  fileId: string;
  owner: LightWorkspaceType;
}) {
  const { data, error, mutate } = useSWRWithDefaults<string, string>(
    `/api/w/${owner.sId}/files/${fileId}?action=view`,
    async (url: string) => {
      // Use custom fetcher to parse as text.
      const response = await fetch(url);

      return response.text();
    }
  );

  return {
    error,
    fileContent: data,
    isFileContentLoading: !error && !data,
    mutateFileContent: mutate,
  };
}

export function useShareInteractiveFile({
  fileId,
  owner,
}: {
  fileId: string;
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();

  const fileShareFetcher: Fetcher<ShareFileResponseBody> = fetcher;

  const swrKey = `/api/w/${owner.sId}/files/${fileId}/share`;

  const { data, error, mutate } = useSWRWithDefaults(swrKey, fileShareFetcher);

  const doShare = async (isShared: boolean) => {
    const res = await fetch(`/api/w/${owner.sId}/files/${fileId}/share`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ isShared }),
    });

    if (!res.ok) {
      const errorData = await getErrorFromResponse(res);
      sendNotification({
        type: "error",
        title: "Failed to share the interactive file.",
        description: `Error: ${errorData.message}`,
      });
      return null;
    } else {
      await mutate();

      const response: ShareFileResponseBody = await res.json();

      return response;
    }
  };

  return {
    doShare,
    fileShare: data,
    isFileShareLoading: !error && !data,
    isFileShareError: error,
    mutateFileShare: mutate,
  };
}

/**
 * Public file access hook (no authentication required). We exceptionaly use the v1 API here.
 */

export function usePublicFile({
  includeContent,
  shareToken,
}: {
  includeContent?: boolean;
  shareToken: string | null;
}) {
  const fileMetadataFetcher: Fetcher<PublicFileResponseBody> = fetcher;

  const swrKey = shareToken
    ? `/api/v1/public/files/${shareToken}?includeContent=${includeContent}`
    : null;

  const { data, error, mutate } = useSWRWithDefaults(
    swrKey,
    fileMetadataFetcher
  );

  return {
    fileMetadata: data?.file,
    fileContent: data?.content,
    isFileLoading: !error && !data,
    isFileError: error,
    mutateFile: mutate,
  };
}
