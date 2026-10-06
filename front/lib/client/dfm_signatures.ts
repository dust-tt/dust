import type { DfmMessage } from "@app/lib/markdown/dfm";
import { messageSignaturePayload } from "@app/lib/markdown/dfm";

/** Checks DFM comment signatures in the browser, with the server's public key. */

const ED25519 = { name: "Ed25519" };

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Checks the message at `index` of thread `commentId`, whose messages are `messages`. */
export type DfmMessageVerifier = (
  commentId: string,
  messages: DfmMessage[],
  index: number
) => Promise<boolean>;

/**
 * @cc [owner:tdraier,label:security] dfm-signature-browser-check
 * A message MUST verify only when it carries a signature that the configured Ed25519 key
 * accepts over `messageSignaturePayload` for this workspace, file and comment, at its position in
 * its thread after the message that precedes it. A missing, malformed
 * or rejected signature, or a key the browser cannot import, MUST read as unverified, never as
 * an error that hides the message.
 */
export async function createDfmMessageVerifier({
  publicKey,
  workspaceId,
  filePath,
}: {
  publicKey: string;
  workspaceId: string;
  filePath: string;
}): Promise<DfmMessageVerifier> {
  let key: CryptoKey | null = null;
  try {
    key = await crypto.subtle.importKey(
      "spki",
      fromBase64Url(publicKey),
      ED25519,
      false,
      ["verify"]
    );
  } catch {
    key = null;
  }

  return async (commentId, messages, index) => {
    const message = messages[index];
    if (!key || message?.signature === undefined) {
      return false;
    }
    try {
      return await crypto.subtle.verify(
        ED25519,
        key,
        fromBase64Url(message.signature),
        new TextEncoder().encode(
          messageSignaturePayload({
            workspaceId,
            filePath,
            commentId,
            position: index,
            previous: messages[index - 1] ?? null,
            message,
          })
        )
      );
    } catch {
      return false;
    }
  };
}
