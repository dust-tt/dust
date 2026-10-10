import type { KeyObject } from "node:crypto";
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import config from "@app/lib/api/config";
import {
  DustFileSystem,
  DustFileSystemError,
} from "@app/lib/api/file_system/dust_file_system";
import {
  isPathWritableContentType,
  readCanonicalFileContent,
  WRITE_CANONICAL_FILE_CONTENT_MAX_BYTES,
} from "@app/lib/api/files/file_system_ops";
import { decodeBuffer } from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import type { DfmMessage } from "@app/lib/markdown/dfm";
import {
  extractAnchors,
  messageSignaturePayload,
  parseDfm,
  serializeDfm,
} from "@app/lib/markdown/dfm";
import { streamToBoundedBuffer, streamToBuffer } from "@app/lib/utils/streams";
import logger from "@app/logger/logger";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { contentTypeFromFileName, stripMimeParameters } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Server-side authorship for DFM comments. The server writes and signs each message a user
 * posts, and a Markdown save through the file API is refused when it brings a new message the
 * server did not sign for the saving user. The documents agent tool signs the messages it writes
 * for the running agent. Messages written around both paths, from a sandbox or a plain file
 * edit, stay unsigned and read as unverified.
 */

export type DfmCommentSignatureErrorCode =
  | "not_available"
  | "unavailable_file"
  | "invalid_position"
  | "unwritable_message"
  | "foreign_message"
  | "unsigned_message"
  | "altered_message"
  | "moved_message"
  | "unreadable_file"
  | "unsupported_content_type"
  | "file_too_large";

export class DfmCommentSignatureError extends Error {
  constructor(
    readonly code: DfmCommentSignatureErrorCode,
    message: string,
    readonly codecErrorMessage?: string
  ) {
    super(message);
  }
}

export type SignedMessageFields = Pick<
  DfmMessage,
  "author" | "createdAt" | "body"
>;

const isValidThreadPlace = (
  position: number,
  previous: SignedMessageFields | null
) =>
  Number.isInteger(position) &&
  position >= 0 &&
  (position === 0) === (previous === null);

const invalidPositionError = () =>
  new DfmCommentSignatureError(
    "invalid_position",
    "This comment's place in its thread is not valid."
  );

let signingKey: { encoded: string; key: KeyObject } | null = null;

function getSigningKey(): KeyObject | null {
  const encoded = config.getDfmCommentSigningKey();
  if (!encoded) {
    return null;
  }
  if (signingKey?.encoded !== encoded) {
    signingKey = {
      encoded,
      key: createPrivateKey({
        key: Buffer.from(encoded, "base64"),
        format: "der",
        type: "pkcs8",
      }),
    };
  }
  return signingKey.key;
}

/** The public key checking message signatures, as base64url SPKI DER, or null when unset. */
export function getDfmCommentPublicKey(): string | null {
  const key = getSigningKey();
  return key
    ? createPublicKey(key)
        .export({ format: "der", type: "spki" })
        .toString("base64url")
    : null;
}

/**
 * @cc [owner:tdraier,label:security] dfm-comment-signing-on-post
 * A signed message MUST take its author, name and timestamp from the server: the requesting
 * user and the current time, never from the request. It MUST be refused when no user is signed
 * in, outside a workspace with `co_edition`, when `filePath` is not a normalized scoped path the
 * user can write, when `position` and `previous` disagree (only a first message has no previous
 * one), or when the codec cannot write it. Without a signing key it MUST be returned unsigned.
 */
export async function signDfmCommentMessage(
  auth: Authenticator,
  {
    filePath,
    commentId,
    position,
    previous,
    body,
  }: {
    filePath: string;
    commentId: string;
    position: number;
    previous: SignedMessageFields | null;
    body: string;
  }
): Promise<Result<DfmMessage, DfmCommentSignatureError>> {
  const user = auth.user();
  if (!user || !(await hasFeatureFlag(auth, "co_edition"))) {
    return new Err(
      new DfmCommentSignatureError(
        "not_available",
        "Commenting is not available here."
      )
    );
  }

  const resolvedPath = DustFileSystem.resolveScopedPath(filePath);
  const fileSystem =
    resolvedPath.isOk() && resolvedPath.value === filePath
      ? await DustFileSystem.fromScopedPath(auth, filePath)
      : null;
  if (
    !fileSystem?.isOk() ||
    fileSystem.value.checkWriteAccess(filePath).isErr()
  ) {
    return new Err(
      new DfmCommentSignatureError(
        "unavailable_file",
        "This file cannot be commented."
      )
    );
  }

  if (!isValidThreadPlace(position, previous)) {
    return new Err(invalidPositionError());
  }

  return signMessage(auth, {
    filePath,
    commentId,
    position,
    previous,
    message: {
      author: { kind: "user", id: user.sId, name: user.fullName() },
      createdAt: new Date().toISOString(),
      body,
    },
  });
}

/**
 * @cc [owner:tdraier,label:security] dfm-comment-signing-by-agent
 * A message signed for an agent MUST be attributed to `agent:<sId>` of the given agent
 * configuration, named `@<agent name>`, at the current time, at `position` in its thread after
 * `previous` (the first message of a new thread at position 0, with no previous), in the file at
 * `filePath`. Callers MUST pass the agent running the tool, never one named by the tool input,
 * and MUST store the message only through a write to `filePath` that passed its own
 * write-access check, never return it otherwise. It MUST be refused outside a workspace with
 * `co_edition`, at a place in the thread that is not valid, or when the codec cannot write it.
 * Without a signing key it MUST be returned unsigned.
 */
export async function signDfmAgentCommentMessage(
  auth: Authenticator,
  {
    agent,
    filePath,
    commentId,
    position,
    previous,
    body,
  }: {
    agent: Pick<LightAgentConfigurationType, "sId" | "name">;
    filePath: string;
    commentId: string;
    position: number;
    previous: SignedMessageFields | null;
    body: string;
  }
): Promise<Result<DfmMessage, DfmCommentSignatureError>> {
  if (!(await hasFeatureFlag(auth, "co_edition"))) {
    return new Err(
      new DfmCommentSignatureError(
        "not_available",
        "Commenting is not available here."
      )
    );
  }
  if (!isValidThreadPlace(position, previous)) {
    return new Err(invalidPositionError());
  }

  return signMessage(auth, {
    filePath,
    commentId,
    position,
    previous,
    message: {
      author: { kind: "agent", id: agent.sId, name: `@${agent.name}` },
      createdAt: new Date().toISOString(),
      body,
    },
  });
}

async function signMessage(
  auth: Authenticator,
  {
    filePath,
    commentId,
    position,
    previous,
    message,
  }: {
    filePath: string;
    commentId: string;
    position: number;
    previous: SignedMessageFields | null;
    message: DfmMessage;
  }
): Promise<Result<DfmMessage, DfmCommentSignatureError>> {
  const writable = serializeDfm({
    frontMatter: null,
    body: "",
    comments: [{ id: commentId, status: "open", messages: [message] }],
  });
  if (writable.isErr()) {
    return new Err(
      new DfmCommentSignatureError(
        "unwritable_message",
        "This comment cannot be saved as written.",
        writable.error.message
      )
    );
  }

  const workspaceId = auth.getNonNullableWorkspace().sId;
  const key = getSigningKey();
  if (!key) {
    logger.warn(
      { workspaceId },
      "DFM comment signing key is not configured; the comment is not signed."
    );
    return new Ok(message);
  }
  return new Ok({
    ...message,
    signature: sign(
      null,
      Buffer.from(
        messageSignaturePayload({
          workspaceId,
          filePath,
          commentId,
          position,
          previous,
          message,
        }),
        "utf8"
      ),
      key
    ).toString("base64url"),
  });
}

export const messageKey = (commentId: string, message: DfmMessage) =>
  JSON.stringify([
    commentId,
    message.author.kind,
    message.author.id,
    message.author.name,
    message.createdAt,
    message.body,
  ]);

/** A message a save brings that the stored file did not have. */
export interface NewCommentMessage {
  commentId: string;
  quote: string | null;
  message: DfmMessage;
}

/** The anchor-free text each comment's anchors cover in `body`. */
function commentQuotes(body: string): Map<string, string> {
  const anchors = extractAnchors(body);
  return anchors.isOk()
    ? new Map(
        anchors.value.anchors.map(({ id, start, end }) => [
          id,
          anchors.value.text.slice(start, end),
        ])
      )
    : new Map();
}

interface ValidationContext {
  workspaceId: string;
  /** The scoped path of the file being written, which signatures bind. */
  filePath: string;
  userId: string | null;
  /** Checks a signature over a payload, or null when no signing key is configured. */
  verify: ((payload: string, signature: string) => boolean) | null;
}

/** Whether the message at `index` of its thread verifies where it sits in this file. */
const verifiesInPlace = (
  context: ValidationContext,
  commentId: string,
  messages: DfmMessage[],
  index: number
) => {
  const message = messages[index];
  return (
    !!context.verify &&
    message.signature !== undefined &&
    context.verify(
      messageSignaturePayload({
        workspaceId: context.workspaceId,
        filePath: context.filePath,
        commentId,
        position: index,
        previous: messages[index - 1] ?? null,
        message,
      }),
      message.signature
    )
  );
};

/**
 * @cc [owner:tdraier,label:security] dfm-comment-authorship-on-save
 * A save MUST be refused when a message matching one in the stored file by author, name,
 * timestamp and body carries a different signature, or no longer verifies at its place in the
 * thread while it verified at its stored place, so verified messages cannot be reordered or
 * repeated. Any other message MUST be attributed to `user:<sId>` of the saving user and, with a
 * signing key, verify at its place for this file. Deleting threads or the last messages of a
 * thread, changing statuses and anchors, and a source the codec cannot read MUST be accepted.
 * Validation MUST NOT change the content, and MUST return the accepted new messages, with their
 * comment and quoted text.
 */
export function validateCommentSignatures(
  { previous, next }: { previous: string | null; next: string },
  context: ValidationContext
): Result<NewCommentMessage[], DfmCommentSignatureError> {
  const parsed = parseDfm(next);
  if (parsed.isErr() || parsed.value.comments.length === 0) {
    return new Ok([]);
  }
  let quotes: Map<string, string> | null = null;
  const newMessages: NewCommentMessage[] = [];

  const stored = new Map<
    string,
    { signature: string | undefined; verified: boolean }
  >();
  const previousDocument = previous === null ? null : parseDfm(previous);
  if (previousDocument?.isOk()) {
    for (const comment of previousDocument.value.comments) {
      comment.messages.forEach((message, index) => {
        stored.set(messageKey(comment.id, message), {
          signature: message.signature,
          verified: verifiesInPlace(
            context,
            comment.id,
            comment.messages,
            index
          ),
        });
      });
    }
  }

  for (const comment of parsed.value.comments) {
    for (const [index, message] of comment.messages.entries()) {
      const storedMessage = stored.get(messageKey(comment.id, message));
      if (storedMessage) {
        if (storedMessage.signature !== message.signature) {
          return new Err(
            new DfmCommentSignatureError(
              "altered_message",
              "A comment's signature was changed. Reload the file before saving."
            )
          );
        }
        if (
          storedMessage.verified &&
          !verifiesInPlace(context, comment.id, comment.messages, index)
        ) {
          return new Err(
            new DfmCommentSignatureError(
              "moved_message",
              "A comment was moved or repeated. Reload the file before saving."
            )
          );
        }
        continue;
      }

      if (
        context.userId === null ||
        message.author.kind !== "user" ||
        message.author.id !== context.userId
      ) {
        return new Err(
          new DfmCommentSignatureError(
            "foreign_message",
            "This file has a new comment that is not yours. Reload the file before saving."
          )
        );
      }
      if (
        context.verify &&
        !verifiesInPlace(context, comment.id, comment.messages, index)
      ) {
        return new Err(
          new DfmCommentSignatureError(
            "unsigned_message",
            "A new comment was not posted through Dust. Reload the file before saving."
          )
        );
      }
      quotes ??= commentQuotes(parsed.value.body);
      newMessages.push({
        commentId: comment.id,
        quote: quotes.get(comment.id) ?? null,
        message,
      });
    }
  }

  return new Ok(newMessages);
}

/** The stored text of a file with its storage revision, or null when the file does not exist. */
export async function readStoredText(
  dustFs: DustFileSystem,
  scopedPath: string
): Promise<
  Result<
    { text: string; revision: string | undefined } | null,
    DustFileSystemError
  >
> {
  const read = await readCanonicalFileContent(dustFs, scopedPath);
  if (read.isErr()) {
    return read;
  }
  if (read.value === null) {
    return new Ok(null);
  }
  const buffer = await streamToBuffer(read.value.stream);
  if (buffer.isErr()) {
    // A file deleted between its lookup and its read does not exist, it is not unreadable.
    const stat = await dustFs.stat(scopedPath);
    return stat.isOk() && stat.value === null
      ? new Ok(null)
      : new Err(new DustFileSystemError("internal", buffer.error));
  }
  return new Ok({
    text: decodeBuffer(buffer.value),
    revision: read.value.revision,
  });
}

const isMarkdownContentType = (contentType: string | undefined) =>
  contentType !== undefined &&
  stripMimeParameters(contentType) === "text/markdown";

// GCS matches generation 0 only while the object does not exist.
const ABSENT_FILE_REVISION = "0";

export interface MarkdownCommentsCheck {
  revision: string | undefined;
  newMessages: NewCommentMessage[] | null;
}

/**
 * @cc [owner:tdraier,label:security] dfm-comment-validation-scope
 * Validation MUST run on every content write through the file API's PUT of a file whose name,
 * request content type or stored content type is `text/markdown`, in a workspace with
 * `co_edition`, against the file as stored right before the write, and MUST NOT run anywhere else
 * until the codec bounds its input before parsing. For a write it validates, it MUST return the
 * revision it validated against, when storage has one, so the write can be conditional on it, and
 * the accepted new messages. For a write it does not validate, `newMessages` MUST be null, and
 * in a workspace with `co_edition` the write MUST be bound to the stored state it was classified
 * against: it MUST return the stored file's revision, or for an absent file the revision that
 * only matches an absent file, and MUST validate the write instead when storage has no revision,
 * refusing it with `file_too_large`, without reading past the limit, when the stored file exceeds
 * the write size limit. A write to a file stored with a content type other than `text/*` or
 * `application/json` MUST be refused with `unsupported_content_type` without reading the file.
 * A stored file that still exists but cannot be read MUST refuse the write with
 * `unreadable_file`, never count as absent; one deleted before it could be read counts as absent.
 * Other writes, such as archive extraction and sandbox or plain agent file writes, are not
 * validated: what they bring can only read as unverified, since signatures bind the file and the
 * thread order. The exceptions are `documents.add_comment` and `documents.reply_to_comment`,
 * which add a message the server itself signs for the running agent
 * (`dfm-comment-signing-by-agent`), and `documents.edit_document`, which only changes the body
 * and leaves every comment thread as stored (`dfm-agent-document-edit`).
 */
export async function validateMarkdownCommentsForWrite(
  auth: Authenticator,
  dustFs: DustFileSystem,
  scopedPath: string,
  content: Uint8Array,
  requestContentType: string | undefined
): Promise<Result<MarkdownCommentsCheck, DfmCommentSignatureError>> {
  const resolvedPath = DustFileSystem.resolveScopedPath(scopedPath);
  if (resolvedPath.isErr() || !(await hasFeatureFlag(auth, "co_edition"))) {
    return new Ok({ revision: undefined, newMessages: null });
  }

  const read = await readCanonicalFileContent(dustFs, scopedPath);
  if (read.isErr()) {
    return new Err(unreadableFileError());
  }
  const stored = read.value;
  if (
    stored &&
    !isPathWritableContentType(stripMimeParameters(stored.contentType))
  ) {
    stored.stream.on("error", () => undefined).destroy();
    return new Err(
      new DfmCommentSignatureError(
        "unsupported_content_type",
        "Only text and JSON files can be updated through this endpoint."
      )
    );
  }

  // The editor opens a file by its stored content type, so a file stored as Markdown is
  // validated whatever its name and the request's content type.
  const isMarkdown =
    contentTypeFromFileName(resolvedPath.value) === "text/markdown" ||
    isMarkdownContentType(requestContentType) ||
    isMarkdownContentType(stored?.contentType);
  if (!isMarkdown) {
    const classifiedRevision = stored ? stored.revision : ABSENT_FILE_REVISION;
    if (classifiedRevision !== undefined) {
      if (stored) {
        // The content of a write that is not validated is never read, nor the errors of its stream.
        stored.stream.on("error", () => undefined).destroy();
      }
      return new Ok({ revision: classifiedRevision, newMessages: null });
    }
  }

  let storedText: string | null = null;
  let storedRevision = stored?.revision;
  if (stored) {
    // Validating a file that is not Markdown is the fallback for storage without revisions, so
    // its read is bounded like the write itself.
    const buffer = isMarkdown
      ? await streamToBuffer(stored.stream)
      : await streamToBoundedBuffer(
          stored.stream,
          WRITE_CANONICAL_FILE_CONTENT_MAX_BYTES
        );
    if (buffer.isOk()) {
      if (buffer.value === null) {
        return new Err(
          new DfmCommentSignatureError(
            "file_too_large",
            `This file exceeds the ${WRITE_CANONICAL_FILE_CONTENT_MAX_BYTES / 1024} KB limit and cannot be updated.`
          )
        );
      }
      storedText = decodeBuffer(buffer.value);
    } else {
      // A file deleted between its lookup and its read is absent, not unreadable.
      const stat = await dustFs.stat(scopedPath);
      if (!stat.isOk() || stat.value !== null) {
        return new Err(unreadableFileError());
      }
      storedRevision = undefined;
    }
  }

  const key = getSigningKey();
  const publicKey = key ? createPublicKey(key) : null;
  const validated = validateCommentSignatures(
    {
      previous: storedText,
      next: decodeBuffer(content),
    },
    {
      workspaceId: auth.getNonNullableWorkspace().sId,
      filePath: resolvedPath.value,
      userId: auth.user()?.sId ?? null,
      verify: publicKey
        ? (payload, signature) =>
            verify(
              null,
              Buffer.from(payload, "utf8"),
              publicKey,
              Buffer.from(signature, "base64url")
            )
        : null,
    }
  );
  return validated.isErr()
    ? validated
    : new Ok({ revision: storedRevision, newMessages: validated.value });
}

const unreadableFileError = () =>
  new DfmCommentSignatureError(
    "unreadable_file",
    "The file could not be read to check its comments. Try again."
  );
