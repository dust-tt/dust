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

export type DfmMessageVerifier = (
  commentId: string,
  previous: DfmMessage | null,
  message: DfmMessage
) => Promise<boolean>;

/**
 * @cc [owner:tdraier,label:security] dfm-signature-browser-check
 * A message MUST verify only when it carries a signature that the configured Ed25519 key
 * accepts over `messageSignaturePayload` for this workspace, file and comment, after the
 * message that precedes it in its thread. A missing, malformed
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

  return async (commentId, previous, message) => {
    if (!key || message.signature === undefined) {
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
            previous,
            message,
          })
        )
      );
    } catch {
      return false;
    }
  };
}
