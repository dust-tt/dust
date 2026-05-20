import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

function sourcePathToUrlPath(sourcePath: string): string {
  return sourcePath.split("/").map(encodeURIComponent).join("/");
}

/**
 * Move a file within a GCS mount listing API.
 *
 * @param filesApiBasePath e.g. `/api/w/{wId}/spaces/{spaceId}/files` or
 *   `/api/w/{wId}/assistant/conversations/{cId}/files` (no trailing slash).
 */
export function useMoveMountFile({
  filesApiBasePath,
}: {
  filesApiBasePath: string;
}) {
  const sendNotification = useSendNotification();

  return async ({
    relativeFilePath,
    destRelativeFilePath,
  }: {
    /** Source path relative to the mount root (no scope prefix). */
    relativeFilePath: string;
    destRelativeFilePath: string;
  }): Promise<Result<void, Error>> => {
    try {
      const res = await clientFetch(
        `${filesApiBasePath}/${sourcePathToUrlPath(relativeFilePath)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ destRelativeFilePath }),
        }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendNotification({
          type: "error",
          title: "Failed to move file",
          description: errorData.message,
        });
        return new Err(new Error(errorData.message));
      }

      sendNotification({
        type: "success",
        title: "File moved",
      });

      return new Ok(undefined);
    } catch (e) {
      const errorMessage = normalizeError(e).message;
      sendNotification({
        type: "error",
        title: "Failed to move file",
        description: errorMessage,
      });
      return new Err(new Error(errorMessage));
    }
  };
}
