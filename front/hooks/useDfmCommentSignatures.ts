import { useFormatErrorDescription } from "@app/hooks/useFormatErrorDescription";
import type { DfmMessageVerifier } from "@app/lib/client/dfm_signatures";
import { createDfmMessageVerifier } from "@app/lib/client/dfm_signatures";
import { clientFetch } from "@app/lib/egress/client";
import type { DfmMessage } from "@app/lib/markdown/dfm";
import {
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type {
  GetDfmCommentSigningKeyResponseBody,
  PostDfmCommentSignatureRequestBody,
  PostDfmCommentSignatureResponseBody,
} from "@app/types/api/file_system/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";

/**
 * Checks DFM comment signatures with the server's public key. Null while the key loads, or
 * when the server has none, so callers do not mark messages they cannot check.
 */
export function useDfmMessageVerifier({
  owner,
  filePath,
  disabled,
}: {
  owner: LightWorkspaceType | undefined;
  /** Scoped path of the file whose messages are checked. */
  filePath: string;
  disabled?: boolean;
}): DfmMessageVerifier | null {
  const { fetcher } = useFetcher();
  const swrKey =
    disabled || !owner
      ? null
      : ([`/api/w/${owner.sId}/files/comment-signatures`, filePath] as const);
  const { data } = useSWRWithDefaults(
    swrKey,
    async ([url, path]: readonly [
      string,
      string,
    ]): Promise<DfmMessageVerifier | null> => {
      const { publicKey }: GetDfmCommentSigningKeyResponseBody =
        await fetcher(url);
      return owner && publicKey
        ? createDfmMessageVerifier({
            publicKey,
            workspaceId: owner.sId,
            filePath: path,
          })
        : null;
    },
    { disabled: swrKey === null }
  );

  return data ?? null;
}

/**
 * Has the server write and sign a new DFM comment message as the current user, after the
 * messages already in `thread` (none for a new thread).
 */
export function useSignDfmCommentMessage({
  owner,
  filePath,
}: {
  owner: LightWorkspaceType | undefined;
  /** Scoped path of the file the messages are written in. */
  filePath: string;
}) {
  const { t } = useLingui();
  const formatErrorDescription = useFormatErrorDescription();

  return async (
    commentId: string,
    thread: DfmMessage[],
    body: string
  ): Promise<Result<DfmMessage, string>> => {
    const previous = thread.at(-1) ?? null;
    if (!owner) {
      return new Err(t`Commenting is unavailable.`);
    }
    try {
      const response = await clientFetch(
        `/api/w/${owner.sId}/files/comment-signatures`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filePath,
            commentId,
            position: thread.length,
            previous: previous && {
              author: previous.author,
              createdAt: previous.createdAt,
              body: previous.body,
            },
            body,
          } satisfies PostDfmCommentSignatureRequestBody),
        }
      );
      if (!response.ok) {
        const errorData = await getErrorFromResponse(response);
        return new Err(formatErrorDescription(errorData));
      }
      const { message }: PostDfmCommentSignatureResponseBody =
        await response.json();
      return new Ok(message);
    } catch (error) {
      return new Err(formatErrorDescription(error));
    }
  };
}
