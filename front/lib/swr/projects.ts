import { useDebounce } from "@app/hooks/useDebounce";
import { useSendNotification } from "@app/hooks/useNotification";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  FileWithCreatorType,
  GetProjectFilesResponseBody,
} from "@app/pages/api/w/[wId]/spaces/[spaceId]/project_files";
import type { CheckNameResponseBody } from "@app/pages/api/w/[wId]/spaces/check-name";
import { isAPIErrorResponse } from "@app/types/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { useMemo } from "react";
import type { Fetcher } from "swr";

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
  const { fetcher } = useFetcher();
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
  const { fetcher } = useFetcher();
  const sendNotification = useSendNotification();

  return async (fileId: string): Promise<Result<void, Error>> => {
    try {
      await fetcher(`/api/w/${owner.sId}/files/${fileId}`, {
        method: "DELETE",
      });

      sendNotification({
        type: "success",
        title: "File deleted",
      });

      return new Ok(undefined);
    } catch (e) {
      if (isAPIErrorResponse(e)) {
        sendNotification({
          type: "error",
          title: "Failed to delete file",
          description: e.error.message,
        });
        return new Err(new Error(e.error.message));
      }
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
  const { fetcherWithBody } = useFetcher();
  const sendNotification = useSendNotification();

  return async (
    fileId: string,
    fileName: string
  ): Promise<Result<void, Error>> => {
    try {
      await fetcherWithBody([
        `/api/w/${owner.sId}/files/${fileId}/rename`,
        { fileName },
        "PATCH",
      ]);

      sendNotification({
        type: "success",
        title: `File renamed to "${fileName}"`,
      });

      return new Ok(undefined);
    } catch (e) {
      if (isAPIErrorResponse(e)) {
        sendNotification({
          type: "error",
          title: "Failed to rename file",
          description: e.error.message,
        });
        return new Err(new Error(e.error.message));
      }
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

export function useCheckProjectName({
  owner,
  initialName = "",
}: {
  owner: LightWorkspaceType;
  initialName?: string;
}) {
  const { fetcher } = useFetcher();
  const {
    debouncedValue: debouncedName,
    isDebouncing,
    setValue,
  } = useDebounce(initialName, {
    delay: 300,
    minLength: 1,
  });

  const shouldFetch = useMemo(() => {
    return debouncedName.trim().length > 0;
  }, [debouncedName]);

  const checkKey = shouldFetch
    ? `/api/w/${owner.sId}/spaces/check-name?name=${encodeURIComponent(debouncedName)}`
    : null;

  const checkFetcher: Fetcher<CheckNameResponseBody> = fetcher;

  const { data, isLoading } = useSWRWithDefaults(checkKey, checkFetcher);

  return {
    isNameAvailable: data?.available ?? true,
    isChecking: isLoading || isDebouncing,
    setValue,
  };
}
