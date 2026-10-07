import { randomUUID } from "node:crypto";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import {
  readStoredText,
  signDfmAgentCommentMessage,
} from "@app/lib/api/files/dfm_comment_signatures";
import { writeCanonicalFileContent } from "@app/lib/api/files/file_system_ops";
import type { Authenticator } from "@app/lib/auth";
import type { DfmDocument, DfmMessage } from "@app/lib/markdown/dfm";
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
  | "comment_not_found"
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

type DfmAgent = Pick<LightAgentConfigurationType, "sId" | "name">;

function fileSystemError(error: {
  code: string;
  message: string;
}): DfmAgentCommentError {
  return new DfmAgentCommentError(
    error.code === "internal" ? "storage_failed" : "refused",
    error.message
  );
}

async function signAgentMessage(
  auth: Authenticator,
  {
    agent,
    filePath,
    commentId,
    earlierMessages,
    body,
  }: {
    agent: DfmAgent;
    filePath: string;
    commentId: string;
    earlierMessages: DfmMessage[];
    body: string;
  }
): Promise<Result<DfmMessage, DfmAgentCommentError>> {
  const signed = await signDfmAgentCommentMessage(auth, {
    agent,
    filePath,
    commentId,
    position: earlierMessages.length,
    previous: earlierMessages.at(-1) ?? null,
    body: body.replaceAll("\r\n", "\n").trim(),
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
  return signed;
}

/**
 * @cc [owner:tdraier,label:concurrency] dfm-agent-comment-write
 * Only files whose name maps to `text/markdown` are changed. `change` MUST receive the document
 * as read, and its result MUST be written conditional on the revision read; a file whose storage
 * returns no revision MUST be refused. On a conflict it MUST start over from a fresh read, and
 * give up with `conflict` after `MAX_WRITE_ATTEMPTS`, never overwriting a concurrent write.
 */
async function writeDocumentChange<T>(
  auth: Authenticator,
  dustFs: DustFileSystem,
  scopedPath: string,
  change: (
    document: DfmDocument,
    filePath: string
  ) => Promise<
    Result<{ document: DfmDocument; value: T }, DfmAgentCommentError>
  >
): Promise<Result<T, DfmAgentCommentError>> {
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

    const changed = await change(document.value, resolvedPath.value);
    if (changed.isErr()) {
      return changed;
    }

    const serialized = serializeDfm(changed.value.document);
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
      return new Ok(changed.value.value);
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

/**
 * @cc [owner:tdraier,label:product;concurrency] dfm-agent-comment
 * Adding a comment MUST add exactly one open thread whose only message is the one
 * `signDfmAgentCommentMessage` writes for `agent` (signed when a signing key is configured), with
 * anchors around the nth occurrence of `quote`, and MUST NOT change the front matter, the body
 * text or the other threads, beyond the codec normalising line endings and dropping a leading
 * byte order mark. It MUST be written through `writeDocumentChange`.
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
    agent: DfmAgent;
    scopedPath: string;
    quote: string;
    occurrence: number;
    comment: string;
  }
): Promise<Result<{ commentId: string }, DfmAgentCommentError>> {
  const commentId = randomUUID();
  let signedMessage: DfmMessage | null = null;
  return writeDocumentChange(
    auth,
    dustFs,
    scopedPath,
    async (document, filePath) => {
      const anchored = anchorComment({
        body: document.body,
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
        const signed = await signAgentMessage(auth, {
          agent,
          filePath,
          commentId,
          earlierMessages: [],
          body: comment,
        });
        if (signed.isErr()) {
          return signed;
        }
        signedMessage = signed.value;
      }

      return new Ok({
        document: {
          ...document,
          body: anchored.value,
          comments: [
            ...document.comments,
            { id: commentId, status: "open", messages: [signedMessage] },
          ],
        },
        value: { commentId },
      });
    }
  );
}

/**
 * @cc [owner:tdraier,label:product;concurrency] dfm-agent-comment-reply
 * Replying MUST append to the thread `commentId` exactly one message, the one
 * `signDfmAgentCommentMessage` writes for `agent` after the thread's last message as read, and
 * MUST leave the thread open, reopening a resolved one so the reply is not buried in the
 * collapsed resolved threads. It MUST NOT change the thread's other messages, the front matter,
 * the body or the other threads, beyond the codec normalising line endings and dropping a
 * leading byte order mark. A missing thread MUST fail with `comment_not_found`. It MUST be written through
 * `writeDocumentChange`, signing again when a retry finds the thread changed.
 */
export async function replyToAgentComment(
  auth: Authenticator,
  dustFs: DustFileSystem,
  {
    agent,
    scopedPath,
    commentId,
    reply,
  }: {
    agent: DfmAgent;
    scopedPath: string;
    commentId: string;
    reply: string;
  }
): Promise<Result<undefined, DfmAgentCommentError>> {
  return writeDocumentChange(
    auth,
    dustFs,
    scopedPath,
    async (document, filePath) => {
      const thread = document.comments.find(({ id }) => id === commentId);
      if (!thread) {
        return new Err(
          new DfmAgentCommentError(
            "comment_not_found",
            `No comment \`${commentId}\` in ${scopedPath}.`
          )
        );
      }

      const signed = await signAgentMessage(auth, {
        agent,
        filePath,
        commentId,
        earlierMessages: thread.messages,
        body: reply,
      });
      if (signed.isErr()) {
        return signed;
      }

      return new Ok({
        document: {
          ...document,
          comments: document.comments.map((comment) =>
            comment.id === commentId
              ? {
                  ...comment,
                  status: "open",
                  messages: [...comment.messages, signed.value],
                }
              : comment
          ),
        },
        value: undefined,
      });
    }
  );
}
