// @vitest-environment jsdom

import {
  makeSendCrossDocumentMessage,
  USER_IDENTITY_RPC_TIMEOUT_MS,
} from "@viz/app/components/VisualizationWrapper";
import { afterEach, describe, expect, it, vi } from "vitest";

const ALLOWED_ORIGIN = "https://app.dust.tt";

afterEach(() => {
  vi.useRealTimers();
});

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
  it("returns the workspace-scoped identity from the parent", async () => {
    vi.spyOn(window, "postMessage").mockImplementation((message) => {
      if (!hasMessageUniqueId(message)) {
        throw new Error("RPC request has no message id.");
      }
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: ALLOWED_ORIGIN,
          data: {
            messageUniqueId: message.messageUniqueId,
            result: {
              isAuthenticated: true,
              isWorkspaceMember: true,
              user: {
                sId: "usr_123",
                firstName: "Ada",
                lastName: "Lovelace",
                fullName: "Ada Lovelace",
                image: null,
              },
            },
          },
        })
      );
    });
    const sendMessage = makeSendCrossDocumentMessage({
      identifier: "frame",
      allowedOrigins: [ALLOWED_ORIGIN],
    });

    await expect(sendMessage("getUserIdentity", null)).resolves.toMatchObject({
      isAuthenticated: true,
      isWorkspaceMember: true,
      user: { sId: "usr_123" },
    });
  });

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

  it("fails closed when an older Frame host does not answer identity requests", async () => {
    vi.useFakeTimers();
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");
    vi.spyOn(window, "postMessage").mockImplementation(() => undefined);
    const sendMessage = makeSendCrossDocumentMessage({
      identifier: "frame",
      allowedOrigins: [ALLOWED_ORIGIN],
    });

    const expectation = expect(
      sendMessage("getUserIdentity", null)
    ).rejects.toThrow("Frame host did not provide user identity.");
    await vi.advanceTimersByTimeAsync(USER_IDENTITY_RPC_TIMEOUT_MS);

    await expectation;
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "message",
      expect.any(Function)
    );
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
