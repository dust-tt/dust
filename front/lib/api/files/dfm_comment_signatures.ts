import type { KeyObject } from "node:crypto";
import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import config from "@app/lib/api/config";
import type { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { readCanonicalFileContent } from "@app/lib/api/files/file_system_ops";
import { decodeBuffer } from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import type { DfmComment, DfmMessage } from "@app/lib/markdown/dfm";
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
 * Server-side authorship for DFM comments. Saving a Markdown file through the file API keeps
 * the messages the file already had, signs the new ones its user wrote, and refuses new ones
 * attributed to anyone else. Messages written around this path, from a sandbox or an agent
 * tool, stay unsigned and read as unverified.
 */

export type DfmCommentSignatureErrorCode =
  | "foreign_message"
  | "unwritable_comments";

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

const messageKey = (commentId: string, message: DfmMessage) =>
  JSON.stringify([
    commentId,
    message.author.kind,
    message.author.id,
    message.author.name,
    message.createdAt,
    message.body,
  ]);

interface SignatureContext {
  workspaceId: string;
  user: { sId: string; fullName: string } | null;
  now: string;
  /** Signs a payload, or null when no signing key is configured. */
  sign: ((payload: string) => string) | null;
}

/**
 * @cc [owner:tdraier,label:security] dfm-comment-authorship-on-save
 * A message whose author, name, timestamp and body match one in the stored file MUST be written
 * with the stored file's signature, or none, whatever signature the request carries. Any other
 * message is new: it MUST be refused unless its author is `user:<sId>` of the saving user, and
 * when accepted MUST be written with the user's name, the server's timestamp and a fresh
 * signature over `messageSignaturePayload`. Thread status, anchors and the body text MUST NOT
 * be changed. A source the codec cannot read MUST be written unchanged, since it carries no
 * comment anyone can see.
 */
export function applyCommentSignatures(
  { previous, next }: { previous: string | null; next: string },
  context: SignatureContext
): Result<{ content: string; rewritten: boolean }, DfmCommentSignatureError> {
  const parsed = parseDfm(next);
  if (parsed.isErr() || parsed.value.comments.length === 0) {
    return new Ok({ content: next, rewritten: false });
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

  let changed = false;
  const comments: DfmComment[] = [];
  for (const comment of parsed.value.comments) {
    const messages: DfmMessage[] = [];
    for (const message of comment.messages) {
      const key = messageKey(comment.id, message);
      if (stored.has(key)) {
        const { signature: requested, ...unsigned } = message;
        const signature = stored.get(key);
        changed ||= requested !== signature;
        messages.push(
          signature === undefined ? unsigned : { ...unsigned, signature }
        );
        continue;
      }

      const { user } = context;
      if (
        user === null ||
        message.author.kind !== "user" ||
        message.author.id !== user.sId
      ) {
        return new Err(
          new DfmCommentSignatureError(
            "foreign_message",
            "This file has a new comment that is not yours. Reload the file before saving."
          )
        );
      }

      changed = true;
      const accepted: DfmMessage = {
        author: { kind: "user", id: user.sId, name: user.fullName },
        createdAt: context.now,
        body: message.body,
      };
      const signature = context.sign?.(
        messageSignaturePayload({
          workspaceId: context.workspaceId,
          commentId: comment.id,
          message: accepted,
        })
      );
      messages.push(
        signature === undefined ? accepted : { ...accepted, signature }
      );
    }
    comments.push({ ...comment, messages });
  }

  if (!changed) {
    return new Ok({ content: next, rewritten: false });
  }
  const serialized = serializeDfm({ ...parsed.value, comments });
  if (serialized.isErr()) {
    return new Err(
      new DfmCommentSignatureError(
        "unwritable_comments",
        "Your comment cannot be saved with your name. Ask an admin to check your profile name."
      )
    );
  }
  return new Ok({ content: serialized.value, rewritten: true });
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
 * @cc [owner:tdraier,label:security] dfm-comment-signing-scope
 * Signing MUST run on every write of a `.md` file through the file API in a workspace with
 * `co_edition`, against the file as stored right before the write, and MUST NOT run anywhere
 * else until the codec bounds its input before parsing.
 */
export async function signMarkdownCommentsForWrite(
  auth: Authenticator,
  dustFs: DustFileSystem,
  scopedPath: string,
  content: Uint8Array
): Promise<
  Result<{ content: Uint8Array; rewritten: boolean }, DfmCommentSignatureError>
> {
  if (
    !scopedPath.toLowerCase().endsWith(".md") ||
    !(await hasFeatureFlag(auth, "co_edition"))
  ) {
    return new Ok({ content, rewritten: false });
  }

  const key = getSigningKey();
  const workspaceId = auth.getNonNullableWorkspace().sId;
  if (!key) {
    logger.warn(
      { workspaceId },
      "DFM comment signing key is not configured; new comments are saved unsigned."
    );
  }
  const user = auth.user();
  const result = applyCommentSignatures(
    {
      previous: await readStoredText(dustFs, scopedPath),
      next: decodeBuffer(content),
    },
    {
      workspaceId,
      user: user ? { sId: user.sId, fullName: user.fullName() } : null,
      now: new Date().toISOString(),
      sign: key
        ? (payload) =>
            sign(null, Buffer.from(payload, "utf8"), key).toString("base64url")
        : null,
    }
  );
  if (result.isErr()) {
    return result;
  }
  return new Ok({
    content: result.value.rewritten
      ? Buffer.from(result.value.content, "utf8")
      : content,
    rewritten: result.value.rewritten,
  });
}
