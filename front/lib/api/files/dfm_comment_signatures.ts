import type { KeyObject } from "node:crypto";
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import config from "@app/lib/api/config";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { readCanonicalFileContent } from "@app/lib/api/files/file_system_ops";
import { decodeBuffer } from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import type { DfmMessage } from "@app/lib/markdown/dfm";
import {
  messageSignaturePayload,
  parseDfm,
  serializeDfm,
} from "@app/lib/markdown/dfm";
import { streamToBuffer } from "@app/lib/utils/streams";
import logger from "@app/logger/logger";
import { contentTypeFromFileName, stripMimeParameters } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Server-side authorship for DFM comments. The server writes and signs each message a user
 * posts, and a Markdown save through the file API is refused when it brings a new message the
 * server did not sign for the saving user. Messages written around this path, from a sandbox or
 * an agent tool, stay unsigned and read as unverified.
 */

export type DfmCommentSignatureErrorCode =
  | "not_available"
  | "unavailable_file"
  | "unwritable_message"
  | "foreign_message"
  | "unsigned_message"
  | "altered_message"
  | "moved_message";

export class DfmCommentSignatureError extends Error {
  constructor(
    readonly code: DfmCommentSignatureErrorCode,
    message: string
  ) {
    super(message);
  }
}

type SignedMessageFields = Pick<DfmMessage, "author" | "createdAt" | "body">;

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
 * user can write, or when the codec cannot write it. Without a signing key it MUST be returned
 * unsigned.
 */
export async function signDfmCommentMessage(
  auth: Authenticator,
  {
    filePath,
    commentId,
    previous,
    body,
  }: {
    filePath: string;
    commentId: string;
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

  const message: DfmMessage = {
    author: { kind: "user", id: user.sId, name: user.fullName() },
    createdAt: new Date().toISOString(),
    body,
  };
  const writable = serializeDfm({
    frontMatter: null,
    body: "",
    comments: [{ id: commentId, status: "open", messages: [message] }],
  });
  if (writable.isErr()) {
    return new Err(
      new DfmCommentSignatureError(
        "unwritable_message",
        "This comment cannot be saved as written."
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
          previous,
          message,
        }),
        "utf8"
      ),
      key
    ).toString("base64url"),
  });
}

const messageKey = (commentId: string, message: DfmMessage) =>
  JSON.stringify([
    commentId,
    message.author.kind,
    message.author.id,
    message.author.name,
    message.createdAt,
    message.body,
  ]);

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
 * Validation MUST NOT change the content.
 */
export function validateCommentSignatures(
  { previous, next }: { previous: string | null; next: string },
  context: ValidationContext
): Result<void, DfmCommentSignatureError> {
  const parsed = parseDfm(next);
  if (parsed.isErr() || parsed.value.comments.length === 0) {
    return new Ok(undefined);
  }

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
    }
  }

  return new Ok(undefined);
}

async function readStoredText(
  dustFs: DustFileSystem,
  scopedPath: string
): Promise<string | null> {
  const read = await readCanonicalFileContent(dustFs, scopedPath);
  if (read.isErr() || read.value === null) {
    return null;
  }
  const buffer = await streamToBuffer(read.value.stream);
  return buffer.isOk() ? decodeBuffer(buffer.value) : null;
}

/**
 * @cc [owner:tdraier,label:security] dfm-comment-validation-scope
 * Validation MUST run on every content write through the file API's PUT of a file whose name or
 * request content type is `text/markdown`, in a workspace with `co_edition`, against the file as
 * stored right before the write, and MUST NOT run anywhere else until the codec bounds its input
 * before parsing. Other writes, such as archive extraction, sandbox and agent writes, are not
 * validated: what they bring can only read as unverified, since signatures bind the file and the
 * thread order.
 */
export async function validateMarkdownCommentsForWrite(
  auth: Authenticator,
  dustFs: DustFileSystem,
  scopedPath: string,
  content: Uint8Array,
  requestContentType: string | undefined
): Promise<Result<void, DfmCommentSignatureError>> {
  const resolvedPath = DustFileSystem.resolveScopedPath(scopedPath);
  if (
    resolvedPath.isErr() ||
    (contentTypeFromFileName(resolvedPath.value) !== "text/markdown" &&
      (requestContentType === undefined ||
        stripMimeParameters(requestContentType) !== "text/markdown")) ||
    !(await hasFeatureFlag(auth, "co_edition"))
  ) {
    return new Ok(undefined);
  }

  const key = getSigningKey();
  const publicKey = key ? createPublicKey(key) : null;
  return validateCommentSignatures(
    {
      previous: await readStoredText(dustFs, scopedPath),
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
}
