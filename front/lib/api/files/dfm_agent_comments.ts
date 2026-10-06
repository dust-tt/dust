import { randomUUID } from "node:crypto";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import {
  readStoredText,
  signDfmAgentCommentMessage,
} from "@app/lib/api/files/dfm_comment_signatures";
import { writeCanonicalFileContent } from "@app/lib/api/files/file_system_ops";
import type { Authenticator } from "@app/lib/auth";
import type { DfmMessage } from "@app/lib/markdown/dfm";
import { anchorComment, parseDfm, serializeDfm } from "@app/lib/markdown/dfm";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { contentTypeFromFileName } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const MAX_WRITE_ATTEMPTS = 3;

export type DfmAgentCommentErrorCode =
  | "not_available"
  | "not_markdown"
  | "not_found"
  | "invalid_document"
  | "cannot_anchor"
  | "invalid_comment"
  | "conflict"
  | "refused"
  | "storage_failed";

export class DfmAgentCommentError extends Error {
  constructor(
    readonly code: DfmAgentCommentErrorCode,
    message: string
  ) {
    super(message);
  }
}

function fileSystemError(error: {
  code: string;
  message: string;
}): DfmAgentCommentError {
  return new DfmAgentCommentError(
    error.code === "internal" ? "storage_failed" : "refused",
    error.message
  );
}

/**
 * @cc [owner:tdraier,label:product;concurrency] dfm-agent-comment
 * Adding a comment MUST add exactly one open thread whose only message is the one
 * `signDfmAgentCommentMessage` writes for `agent` (signed when a signing key is configured), with
 * anchors around the nth occurrence of `quote`, and MUST NOT change the front matter, the body
 * text or the other threads, beyond the codec normalising line endings and dropping a leading
 * byte order mark. The write MUST be conditional on the revision read, and a file whose storage
 * returns no revision MUST be refused; on a conflict it MUST start over from a fresh read, and
 * give up with `conflict` after `MAX_WRITE_ATTEMPTS`, never overwriting a concurrent write. Only
 * files whose name maps to `text/markdown` are commented.
 */
export async function addAgentComment(
  auth: Authenticator,
  dustFs: DustFileSystem,
  {
    agent,
    scopedPath,
    quote,
    occurrence,
    comment,
  }: {
    agent: Pick<LightAgentConfigurationType, "sId" | "name">;
    scopedPath: string;
    quote: string;
    occurrence: number;
    comment: string;
  }
): Promise<Result<{ commentId: string }, DfmAgentCommentError>> {
  const resolvedPath = DustFileSystem.resolveScopedPath(scopedPath);
  if (resolvedPath.isErr()) {
    return new Err(fileSystemError(resolvedPath.error));
  }
  if (contentTypeFromFileName(resolvedPath.value) !== "text/markdown") {
    return new Err(
      new DfmAgentCommentError(
        "not_markdown",
        "Only Markdown documents can be commented."
      )
    );
  }

  const commentId = randomUUID();
  let signedMessage: DfmMessage | null = null;
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const read = await readStoredText(dustFs, scopedPath);
    if (read.isErr()) {
      return new Err(fileSystemError(read.error));
    }
    if (read.value === null) {
      return new Err(
        new DfmAgentCommentError("not_found", `File not found: ${scopedPath}`)
      );
    }
    const { text, revision } = read.value;
    // Without a revision the write cannot be conditional, and could replace a concurrent edit.
    if (revision === undefined) {
      return new Err(
        new DfmAgentCommentError(
          "refused",
          "Comments cannot be added to this document's storage yet."
        )
      );
    }

    const document = parseDfm(text);
    if (document.isErr()) {
      const { message, line } = document.error;
      return new Err(
        new DfmAgentCommentError(
          "invalid_document",
          line === undefined ? message : `Line ${line}: ${message}`
        )
      );
    }
    const anchored = anchorComment({
      body: document.value.body,
      id: commentId,
      quote,
      nth: occurrence,
    });
    if (anchored.isErr()) {
      return new Err(
        new DfmAgentCommentError(
          "cannot_anchor",
          `The comment cannot be anchored: ${anchored.error.message}`
        )
      );
    }

    if (signedMessage === null) {
      const signed = await signDfmAgentCommentMessage(auth, {
        agent,
        filePath: resolvedPath.value,
        commentId,
        body: comment.replaceAll("\r\n", "\n").trim(),
      });
      if (signed.isErr()) {
        return new Err(
          signed.error.code === "not_available"
            ? new DfmAgentCommentError("not_available", signed.error.message)
            : new DfmAgentCommentError(
                "invalid_comment",
                `The comment cannot be written: ${signed.error.codecErrorMessage ?? signed.error.message}`
              )
        );
      }
      signedMessage = signed.value;
    }

    const serialized = serializeDfm({
      ...document.value,
      body: anchored.value,
      comments: [
        ...document.value.comments,
        { id: commentId, status: "open", messages: [signedMessage] },
      ],
    });
    if (serialized.isErr()) {
      return new Err(
        new DfmAgentCommentError("invalid_document", serialized.error.message)
      );
    }

    const written = await writeCanonicalFileContent(
      auth,
      dustFs,
      scopedPath,
      Buffer.from(serialized.value, "utf8"),
      undefined,
      revision
    );
    if (written.isOk()) {
      return new Ok({ commentId });
    }
    if (written.error.code !== "revision_conflict") {
      return new Err(fileSystemError(written.error));
    }
  }

  return new Err(
    new DfmAgentCommentError(
      "conflict",
      "The document kept changing while the comment was being added. Try again."
    )
  );
}
