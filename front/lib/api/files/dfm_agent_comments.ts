import { randomUUID } from "node:crypto";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { signDfmAgentCommentMessage } from "@app/lib/api/files/dfm_comment_signatures";
import {
  readCanonicalFileContent,
  writeCanonicalFileContent,
} from "@app/lib/api/files/file_system_ops";
import { decodeBuffer } from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import { anchorComment, parseDfm, serializeDfm } from "@app/lib/markdown/dfm";
import { streamToBuffer } from "@app/lib/utils/streams";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const MAX_WRITE_ATTEMPTS = 3;

export type DfmAgentCommentErrorCode =
  | "not_available"
  | "not_markdown"
  | "not_found"
  | "invalid_document"
  | "invalid_quote"
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
 * text or the other threads. The write MUST be conditional on the revision read, and a file
 * whose storage returns no revision MUST be refused; on a conflict it MUST start over from a
 * fresh read, and give up with `conflict` after `MAX_WRITE_ATTEMPTS`, never overwriting a
 * concurrent write. Only `.md` files are commented.
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
  if (!scopedPath.toLowerCase().endsWith(".md")) {
    return new Err(
      new DfmAgentCommentError(
        "not_markdown",
        "Only Markdown documents (`.md`) can be commented."
      )
    );
  }

  const resolvedPath = DustFileSystem.resolveScopedPath(scopedPath);
  if (resolvedPath.isErr()) {
    return new Err(fileSystemError(resolvedPath.error));
  }

  const commentId = randomUUID();
  const signed = await signDfmAgentCommentMessage(auth, {
    agent,
    filePath: resolvedPath.value,
    commentId,
    body: comment.replaceAll("\r\n", "\n").trim(),
  });
  if (signed.isErr()) {
    return new Err(
      new DfmAgentCommentError(
        signed.error.code === "not_available"
          ? "not_available"
          : "invalid_comment",
        signed.error.code === "not_available"
          ? signed.error.message
          : "The comment cannot be written: it must be non-empty Markdown with no line starting with `::`."
      )
    );
  }

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const read = await readCanonicalFileContent(dustFs, scopedPath);
    if (read.isErr()) {
      return new Err(fileSystemError(read.error));
    }
    if (read.value === null) {
      return new Err(
        new DfmAgentCommentError("not_found", `File not found: ${scopedPath}`)
      );
    }
    // Without a revision the write cannot be conditional, and could replace a concurrent edit.
    if (read.value.revision === undefined) {
      return new Err(
        new DfmAgentCommentError(
          "refused",
          "Comments cannot be added to this document's storage yet."
        )
      );
    }
    const buffer = await streamToBuffer(read.value.stream);
    if (buffer.isErr()) {
      return new Err(new DfmAgentCommentError("storage_failed", buffer.error));
    }

    const document = parseDfm(decodeBuffer(buffer.value));
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
        new DfmAgentCommentError("invalid_quote", anchored.error.message)
      );
    }
    const serialized = serializeDfm({
      ...document.value,
      body: anchored.value,
      comments: [
        ...document.value.comments,
        { id: commentId, status: "open", messages: [signed.value] },
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
      read.value.revision
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
