import type { LiveSessionWrite } from "@app/lib/api/collab/live_session_write";
import {
  LiveSessionWriteError,
  writeThroughLiveSession,
} from "@app/lib/api/collab/live_session_write";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import type {
  DfmCommentSignatureError,
  NewCommentMessage,
} from "@app/lib/api/files/dfm_comment_signatures";
import { validateCommentSignaturesForUser } from "@app/lib/api/files/dfm_comment_signatures";
import { decodeBuffer } from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import {
  contentTypeFromFileName,
  isMarkdownContentType,
  stripMimeParameters,
} from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * @cc [owner:tdraier,label:product;concurrency;security] live-file-content-write
 * In a workspace with `co_edition`, for a file whose name or request content type is
 * `text/markdown`, `content` MUST be written through `writeThroughLiveSession`, under the file's
 * normalized path without a trailing slash. The comments MUST be validated with
 * `validateCommentSignaturesForUser` against the session's source. A write conditional on a file
 * revision MUST fail with `conflict` while a session is open, since the file lags the session.
 * Any other write MUST answer `no_session` without asking the collab server.
 */
export async function writeFileContentThroughLiveSession(
  auth: Authenticator,
  dustFs: DustFileSystem,
  scopedPath: string,
  {
    content,
    requestContentType,
    ifRevisionMatch,
  }: {
    content: Uint8Array;
    requestContentType: string | undefined;
    ifRevisionMatch: string | undefined;
  }
): Promise<
  Result<
    LiveSessionWrite<NewCommentMessage[]>,
    LiveSessionWriteError | DfmCommentSignatureError
  >
> {
  const resolved = DustFileSystem.resolveScopedPath(scopedPath);
  if (resolved.isErr()) {
    return new Ok({ kind: "no_session" });
  }
  // A trailing slash survives normalization but names the same file.
  const filePath = resolved.value.replace(/\/+$/, "");
  const isMarkdown =
    contentTypeFromFileName(filePath) === "text/markdown" ||
    isMarkdownContentType(stripMimeParameters(requestContentType ?? ""));
  // Only Markdown opens live, and only in a co_edition workspace: other writes never wait on the
  // collab server.
  if (!isMarkdown || !(await hasFeatureFlag(auth, "co_edition"))) {
    return new Ok({ kind: "no_session" });
  }

  const next = decodeBuffer(content);
  return writeThroughLiveSession(auth, dustFs, {
    filePath,
    change: async (
      source
    ): Promise<
      Result<
        { source: string; value: NewCommentMessage[] },
        LiveSessionWriteError | DfmCommentSignatureError
      >
    > => {
      if (ifRevisionMatch !== undefined) {
        return new Err(
          new LiveSessionWriteError(
            "conflict",
            "This file is being edited live; its revision cannot be matched."
          )
        );
      }
      const newMessages = validateCommentSignaturesForUser(auth, {
        filePath,
        previous: source,
        next,
      });
      if (newMessages.isErr()) {
        return newMessages;
      }
      return new Ok({ source: next, value: newMessages.value });
    },
  });
}
