// @vitest-environment jsdom

import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  FILE_RPC_TIMEOUT_MS,
  makeSendCrossDocumentMessage,
  USER_IDENTITY_RPC_TIMEOUT_MS,
  useFile,
  VisualizationWrapper,
} from "@viz/app/components/VisualizationWrapper";
import { RPCDataAPI } from "@viz/app/lib/data-apis/rpc-data-api";
import type { VisualizationAPI } from "@viz/app/lib/visualization-api";
import type { CommandResultMap } from "@viz/app/types";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("lottie-react", () => ({ default: () => null }));

const ALLOWED_ORIGIN = "https://app.dust.tt";

afterEach(() => {
  cleanup();
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

describe("file RPC timeout", () => {
  it("settles a write and removes its listener when the host does not answer", async () => {
    vi.useFakeTimers();
    vi.spyOn(window, "postMessage").mockImplementation(() => undefined);
    const removeListener = vi.spyOn(window, "removeEventListener");
    const sendMessage = makeSendCrossDocumentMessage({
      identifier: "frame",
      allowedOrigins: [ALLOWED_ORIGIN],
    });
    const expectation = expect(
      sendMessage("writeFile", {
        path: "./notes.json",
        content: "{}",
        revision: '\"123\"',
      })
    ).rejects.toThrow("Frame host did not respond to the file request.");
    await vi.advanceTimersByTimeAsync(FILE_RPC_TIMEOUT_MS);
    await expectation;
    expect(removeListener).toHaveBeenCalledWith(
      "message",
      expect.any(Function)
    );
  });
});

describe("useFile", () => {
  it.each([
    { change: "fileId", fails: false },
    { change: "fileId", fails: true },
    { change: "dataAPI", fails: false },
    { change: "dataAPI", fails: true },
  ])(
    "ignores a stale response after $change changes, failure: $fails",
    async ({ change, fails }) => {
      const pending = Promise.withResolvers<CommandResultMap["getFile"]>();
      const latestResponse = { fileBlob: new Blob(["latest"]) };
      const sendMessage = vi
        .fn()
        .mockReturnValueOnce(pending.promise)
        .mockResolvedValue(latestResponse);
      const api = new RPCDataAPI(sendMessage);
      const { result, rerender } = renderHook(
        ({ fileId, dataAPI }) => useFile(fileId, dataAPI),
        { initialProps: { fileId: "./first.txt", dataAPI: api } }
      );

      rerender({
        fileId: change === "fileId" ? "./second.txt" : "./first.txt",
        dataAPI:
          change === "dataAPI"
            ? new RPCDataAPI(vi.fn().mockResolvedValue(latestResponse))
            : api,
      });
      await waitFor(() => expect(result.current?.size).toBe("latest".length));
      const latestFile = result.current;

      await act(async () => {
        if (fails) {
          pending.reject(new Error("The old request failed."));
        } else {
          pending.resolve({ fileBlob: new Blob(["stale"]) });
        }
      });

      expect(result.current).toBe(latestFile);
    }
  );

  it.each([{}, { revision: '\"123\"', canWrite: true }])(
    "returns only a native File with host metadata %j",
    async (metadata) => {
      const sendMessage = vi.fn().mockResolvedValue({
        fileBlob: new Blob(["{}"], { type: "application/json" }),
        ...metadata,
      });
      const api = new RPCDataAPI(sendMessage);
      const { result } = renderHook(() => useFile("./notes.json", api));

      expect(result.current).toBeNull();
      await waitFor(() => expect(result.current).toBeInstanceOf(File));
      expect(result.current).toMatchObject({
        name: "./notes.json",
        type: "application/json",
        size: 2,
      });
      expect(result.current).not.toHaveProperty("revision");
      expect(result.current).not.toHaveProperty("canWrite");
      expect(sendMessage).toHaveBeenCalledExactlyOnceWith("getFile", {
        fileId: "./notes.json",
      });
    }
  );
});

describe("VisualizationWrapper", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const renderFrame = (props: Record<string, string>) => {
    const api: VisualizationAPI = {
      data: {
        callFunction: vi.fn(),
        getUserIdentity: vi.fn(),
        fetchFile: vi.fn(),
        writeFile: vi.fn(),
        fetchCode: vi.fn().mockResolvedValue({
          code: `export default function Frame({ region = "none", year = "none" }) {
  return <p>{region} {year}</p>;
}`,
          props,
        }),
      },
      ui: {
        addEventListener: vi.fn(() => () => {}),
        displayCode: vi.fn(),
        downloadFile: vi.fn(),
        editText: vi.fn(),
        sendHeightToParent: vi.fn(),
      },
    };
    render(
      createElement(VisualizationWrapper, {
        config: {
          identifier: "viz-1",
          allowedOrigins: [ALLOWED_ORIGIN],
          dataAPI: api.data,
        },
        api,
      })
    );
  };

  it("renders the Frame with the props sent with its code", async () => {
    renderFrame({ region: "EU", year: "2026" });

    expect(await screen.findByText("EU 2026")).toBeDefined();
  });

  it("renders the Frame without props when none are sent", async () => {
    renderFrame({});

    expect(await screen.findByText("none none")).toBeDefined();
  });
});
