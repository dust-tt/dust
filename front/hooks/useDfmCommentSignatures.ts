import type { DfmMessageVerifier } from "@app/lib/client/dfm_signatures";
import { createDfmMessageVerifier } from "@app/lib/client/dfm_signatures";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetDfmCommentSigningKeyResponseBody } from "@app/types/api/file_system/types";
import type { LightWorkspaceType } from "@app/types/user";

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
