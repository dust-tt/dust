// @vitest-environment jsdom

import { makeSendCrossDocumentMessage } from "@viz/app/components/VisualizationWrapper";
import { describe, expect, it, vi } from "vitest";

const ALLOWED_ORIGIN = "https://app.dust.tt";

function hasMessageUniqueId(
  value: unknown
): value is { messageUniqueId: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "messageUniqueId" in value &&
    typeof value.messageUniqueId === "string"
  );
}

describe("makeSendCrossDocumentMessage", () => {
  it("returns a direct callFunction result from the parent", async () => {
    vi.spyOn(window, "postMessage").mockImplementation((message) => {
      if (!hasMessageUniqueId(message)) {
        throw new Error("RPC request has no message id.");
      }
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: ALLOWED_ORIGIN,
          data: {
            messageUniqueId: message.messageUniqueId,
            result: { greeting: "Hello" },
          },
        })
      );
    });
    const sendMessage = makeSendCrossDocumentMessage({
      identifier: "frame",
      allowedOrigins: [ALLOWED_ORIGIN],
    });

    await expect(
      sendMessage("callFunction", {
        functionIdOrSlug: "greet",
        input: { name: "Dust" },
      })
    ).resolves.toEqual({ greeting: "Hello" });
  });

  it("rejects with the structured error sent by the parent", async () => {
    vi.spyOn(window, "postMessage").mockImplementation((message) => {
      if (!hasMessageUniqueId(message)) {
        throw new Error("RPC request has no message id.");
      }
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: ALLOWED_ORIGIN,
          data: {
            messageUniqueId: message.messageUniqueId,
            error: {
              code: "http_error",
              message: "Function returned HTTP 503.",
              status: 503,
            },
          },
        })
      );
    });
    const sendMessage = makeSendCrossDocumentMessage({
      identifier: "frame",
      allowedOrigins: [ALLOWED_ORIGIN],
    });

    await expect(
      sendMessage("callFunction", {
        functionIdOrSlug: "greet",
      })
    ).rejects.toEqual({
      code: "http_error",
      message: "Function returned HTTP 503.",
      status: 503,
    });
  });
});
