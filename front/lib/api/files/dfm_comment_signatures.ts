import type { KeyObject } from "node:crypto";
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import config from "@app/lib/api/config";
import type { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
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
  | "unwritable_message"
  | "foreign_message"
  | "unsigned_message"
  | "altered_message";

export class DfmCommentSignatureError extends Error {
  constructor(
    readonly code: DfmCommentSignatureErrorCode,
    message: string
  ) {
    super(message);
  }
}

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
 * in, outside a workspace with `co_edition`, or when the codec cannot write it. Without a
 * signing key it MUST be returned unsigned.
 */
export async function signDfmCommentMessage(
  auth: Authenticator,
  { commentId, body }: { commentId: string; body: string }
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
        messageSignaturePayload({ workspaceId, commentId, message }),
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
  userId: string | null;
  /** Checks a signature over a payload, or null when no signing key is configured. */
  verify: ((payload: string, signature: string) => boolean) | null;
}

/**
 * @cc [owner:tdraier,label:security] dfm-comment-authorship-on-save
 * A save MUST be refused when a message matching one in the stored file by author, name,
 * timestamp and body carries a different signature, or when any other message is not
 * attributed to `user:<sId>` of the saving user or, with a signing key, lacks a valid signature
 * over `messageSignaturePayload`. Deleting messages or threads, changing statuses and anchors,
 * and a source the codec cannot read MUST be accepted. Validation MUST NOT change the content.
 */
export function validateCommentSignatures(
  { previous, next }: { previous: string | null; next: string },
  context: ValidationContext
): Result<void, DfmCommentSignatureError> {
  const parsed = parseDfm(next);
  if (parsed.isErr() || parsed.value.comments.length === 0) {
    return new Ok(undefined);
  }

  const stored = new Map<string, string | undefined>();
  const previousDocument = previous === null ? null : parseDfm(previous);
  if (previousDocument?.isOk()) {
    for (const comment of previousDocument.value.comments) {
      for (const message of comment.messages) {
        stored.set(messageKey(comment.id, message), message.signature);
      }
    }
  }

  for (const comment of parsed.value.comments) {
    for (const message of comment.messages) {
      const key = messageKey(comment.id, message);
      if (stored.has(key)) {
        if (stored.get(key) !== message.signature) {
          return new Err(
            new DfmCommentSignatureError(
              "altered_message",
              "A comment's signature was changed. Reload the file before saving."
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
        (message.signature === undefined ||
          !context.verify(
            messageSignaturePayload({
              workspaceId: context.workspaceId,
              commentId: comment.id,
              message,
            }),
            message.signature
          ))
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
 * Validation MUST run on every write of a `.md` file through the file API in a workspace with
 * `co_edition`, against the file as stored right before the write, and MUST NOT run anywhere
 * else until the codec bounds its input before parsing.
 */
export async function validateMarkdownCommentsForWrite(
  auth: Authenticator,
  dustFs: DustFileSystem,
  scopedPath: string,
  content: Uint8Array
): Promise<Result<void, DfmCommentSignatureError>> {
  if (
    !scopedPath.toLowerCase().endsWith(".md") ||
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
