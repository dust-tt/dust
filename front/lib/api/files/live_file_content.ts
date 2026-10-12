import {
  fetchLiveSource,
  pushLiveSource,
} from "@app/lib/api/collab/live_source";
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
import { assertNever } from "@app/types/shared/utils/assert_never";

const MAX_LIVE_WRITE_ATTEMPTS = 3;

export type LiveFileContentWriteErrorCode =
  | "read_only"
  | "refused"
  | "conflict"
  | "unavailable";

export class LiveFileContentWriteError extends Error {
  constructor(
    readonly code: LiveFileContentWriteErrorCode,
    message: string
  ) {
    super(message);
  }
}

export function isLiveFileContentWriteError(
  error: unknown
): error is LiveFileContentWriteError {
  return error instanceof LiveFileContentWriteError;
}

export type LiveFileContentWrite =
  | { kind: "no_session" }
  | { kind: "written"; newMessages: NewCommentMessage[] };

/**
 * @cc [owner:tdraier,label:product;concurrency;security] live-file-content-write
 * In a workspace with `co_edition`, for a file whose name or request content type is
 * `text/markdown`, while a live session holds the file, `content` MUST be written through the
 * session and the file MUST NOT be written. The session MUST be looked up under the file's
 * normalized path without a trailing slash, the only one a live document is named after
 * (`live-file-access`). `dustFs` MUST be able to write the file, else `read_only`; the comments
 * MUST be validated with `validateCommentSignaturesForUser` against the session's source, and the
 * content MUST be pushed conditional on that source, starting over from a fresh read when the
 * session changed or was busy, and failing with `conflict` after `MAX_LIVE_WRITE_ATTEMPTS`. A write
 * conditional on a file revision MUST fail with `conflict`, since the file lags the session.
 * Otherwise, or once the session closed, it MUST write nothing and answer `no_session`, so the
 * caller writes the file. Failing to learn whether a session is open MUST be an error, never
 * `no_session`, since the caller would then write the file under an open session.
 *
 * Known gap, as for `writeDocumentChange`: a session opening between the check and the caller's
 * file write misses the write, and its checkpoints conflict with it.
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
    LiveFileContentWrite,
    LiveFileContentWriteError | DfmCommentSignatureError
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
  for (let attempt = 0; attempt < MAX_LIVE_WRITE_ATTEMPTS; attempt++) {
    const live = await fetchLiveSource(auth, filePath);
    if (live.isErr()) {
      return new Err(
        new LiveFileContentWriteError(live.error.code, live.error.message)
      );
    }
    if (!live.value.open) {
      return new Ok({ kind: "no_session" });
    }
    if (ifRevisionMatch !== undefined) {
      return new Err(
        new LiveFileContentWriteError(
          "conflict",
          "This file is being edited live; its revision cannot be matched."
        )
      );
    }
    const writable = dustFs.checkWriteAccess(filePath);
    if (writable.isErr()) {
      return new Err(
        new LiveFileContentWriteError("read_only", writable.error.message)
      );
    }
    const newMessages = validateCommentSignaturesForUser(auth, {
      filePath,
      previous: live.value.source,
      next,
    });
    if (newMessages.isErr()) {
      return newMessages;
    }

    const pushed = await pushLiveSource(auth, {
      canonicalPath: filePath,
      base: live.value.source,
      source: next,
    });
    if (pushed.isErr()) {
      return new Err(
        new LiveFileContentWriteError(pushed.error.code, pushed.error.message)
      );
    }
    switch (pushed.value) {
      case "written":
        return new Ok({ kind: "written", newMessages: newMessages.value });
      case "closed":
        return new Ok({ kind: "no_session" });
      case "changed":
      case "busy":
        continue;
      default:
        assertNever(pushed.value);
    }
  }

  return new Err(
    new LiveFileContentWriteError(
      "conflict",
      "The file kept changing in its live session. Reload it and retry."
    )
  );
}
