import type { Fetcher } from "swr";

import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  fetcher,
  getErrorFromResponse,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type {
  FileWithCreatorType,
  GetProjectFilesResponseBody,
} from "@app/pages/api/w/[wId]/spaces/[spaceId]/project_files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";

export type { FileWithCreatorType };

export function useProjectFiles({
  owner,
  projectId,
  disabled,
}: {
  owner: LightWorkspaceType;
  projectId: string;
  disabled?: boolean;
}) {
  const projectFilesFetcher: Fetcher<GetProjectFilesResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    disabled ? null : `/api/w/${owner.sId}/spaces/${projectId}/project_files`,
    projectFilesFetcher
  );

  return {
    projectFiles: data?.files ?? [],
    isProjectFilesLoading: !disabled && !error && !data,
    isProjectFilesError: !!error,
    mutateProjectFiles: mutate,
  };
}

export function useDeleteProjectFile({ owner }: { owner: LightWorkspaceType }) {
  const sendNotification = useSendNotification();

  return async (fileId: string): Promise<Result<void, Error>> => {
    try {
      const res = await clientFetch(`/api/w/${owner.sId}/files/${fileId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendNotification({
          type: "error",
          title: "Failed to delete file",
          description: errorData.message,
        });
        return new Err(new Error(errorData.message));
      }

      sendNotification({
        type: "success",
        title: "File deleted",
      });

      return new Ok(undefined);
    } catch (e) {
      const errorMessage = normalizeError(e).message;
      sendNotification({
        type: "error",
        title: "Failed to delete file",
        description: errorMessage,
      });
      return new Err(new Error(errorMessage));
    }
  };
}

export function useRenameProjectFile({ owner }: { owner: LightWorkspaceType }) {
  const sendNotification = useSendNotification();

  return async (
    fileId: string,
    fileName: string
  ): Promise<Result<void, Error>> => {
    try {
      const res = await clientFetch(
        `/api/w/${owner.sId}/files/${fileId}/rename`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ fileName }),
        }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendNotification({
          type: "error",
          title: "Failed to rename file",
          description: errorData.message,
        });
        return new Err(new Error(errorData.message));
      }

      sendNotification({
        type: "success",
        title: `File renamed to "${fileName}"`,
      });

      return new Ok(undefined);
    } catch (e) {
      const errorMessage = normalizeError(e).message;
      sendNotification({
        type: "error",
        title: "Failed to rename file",
        description: errorMessage,
      });
      return new Err(new Error(errorMessage));
    }
  };
}
