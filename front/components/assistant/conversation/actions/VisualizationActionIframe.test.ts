import type {
  Visualization,
  VisualizationActionIframeProps,
} from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import {
  getFrameRuntimeAccess,
  getSandboxFunctionInvocationAccessError,
  VisualizationActionIframe,
} from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import type {
  ScopedWorkspaceUserIdentity,
  VisualizationRPCRequest,
} from "@app/types/assistant/visualization";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clientFetch: vi.fn(),
  logInfo: vi.fn(),
}));

vi.mock("@app/logger/datadogLogger", () => ({
  default: { info: mocks.logInfo },
}));

vi.mock("@app/hooks/conversations", () => ({
  useVisualizationRetry: () => ({
    canRetry: false,
    handleVisualizationRetry: vi.fn(),
  }),
}));

vi.mock("@app/hooks/useNotification", () => ({
  useSendNotification: () => vi.fn(),
}));

vi.mock("@app/lib/egress/client", () => ({
  clientFetch: mocks.clientFetch,
}));

vi.mock("@app/hooks/useNavigationLock", () => ({
  useNavigationLock: vi.fn(),
}));

const user = {
  sId: "usr_123",
  firstName: "Ada",
  lastName: "Lovelace",
  fullName: "Ada Lovelace",
  image: null,
};

const scopedUserIdentity: ScopedWorkspaceUserIdentity = {
  workspaceId: "w_current",
  user,
};

const privateVisualization: Visualization = {
  code: "export default function Frame() {}",
  complete: true,
  identifier: "viz-fil_frame",
};

const renderFileRPCHost = (
  visualization: Visualization,
  options: Partial<
    Pick<
      VisualizationActionIframeProps,
      "fitContent" | "isInDrawer" | "framePackageRoot"
    >
  > = {}
) => {
  const { container } = render(
    createElement(VisualizationActionIframe, {
      agentConfigurationId: null,
      canInvokeFunctions: true,
      conversationId: "current",
      frameId: "fil_frame",
      framePath: "conversation-current/chart/index.tsx",
      framePackageRoot: "conversation-current/chart",
      scopedUserIdentity,
      spaceId: "current",
      viewer: null,
      visualization,
      vizUrl: "https://viz.dust.tt",
      workspaceId: "w_current",
      ...options,
    })
  );
  const iframe = container.querySelector("iframe");
  if (!iframe?.contentWindow) {
    throw new Error("Expected the visualization iframe to be mounted.");
  }
  const iframeWindow = iframe.contentWindow;
  const postMessage = vi
    .spyOn(iframeWindow, "postMessage")
    .mockImplementation(() => {});

  return { container, iframe, iframeWindow, postMessage };
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const sendDocumentRequest = (
  iframeWindow: Window,
  request: Pick<VisualizationRPCRequest, "command" | "params">
) => {
  window.dispatchEvent(
    new MessageEvent("message", {
      source: iframeWindow,
      data: {
        ...request,
        identifier: "viz-fil_frame",
        messageUniqueId: request.command,
      },
    })
  );
};

describe("Frame document files", () => {
  it("keeps dotted package directories in the document path", async () => {
    mocks.clientFetch.mockResolvedValueOnce(Response.json({ revision: "124" }));
    const { iframeWindow, postMessage } = renderFileRPCHost(
      privateVisualization,
      { framePackageRoot: "conversation-current/report.v2" }
    );
    sendDocumentRequest(iframeWindow, {
      command: "saveDocument",
      params: { src: "./intro.dustdoc", source: "{}", revision: "123" },
    });
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    expect(mocks.clientFetch).toHaveBeenCalledWith(
      "/api/w/w_current/files/path/conversation-current/report.v2/intro.dustdoc?document=1",
      expect.objectContaining({ method: "PUT" })
    );
  });

  it("refuses document access without a known package root", async () => {
    const { iframeWindow, postMessage } = renderFileRPCHost(
      privateVisualization,
      { framePackageRoot: null }
    );
    sendDocumentRequest(iframeWindow, {
      command: "getDocument",
      params: { src: "./intro.dustdoc" },
    });
    sendDocumentRequest(iframeWindow, {
      command: "saveDocument",
      params: { src: "./intro.dustdoc", source: "{}", revision: "1" },
    });
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));
    for (const [response] of postMessage.mock.calls) {
      expect(response.result.ok).toBe(false);
    }
    expect(mocks.clientFetch).not.toHaveBeenCalled();
  });

  it("loads a package document and saves through the revision-checked Files API", async () => {
    const document = {
      format: "dust-document",
      formatVersion: 1,
      schemaVersion: 1,
      content: { type: "doc", content: [] },
    };
    mocks.clientFetch.mockResolvedValueOnce(
      Response.json({ document, revision: "123", canEdit: true })
    );
    const { iframeWindow, postMessage } =
      renderFileRPCHost(privateVisualization);
    sendDocumentRequest(iframeWindow, {
      command: "getDocument",
      params: { src: "./intro.dustdoc" },
    });
    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          result: {
            ok: true,
            value: {
              source: JSON.stringify(document),
              revision: "123",
              canEdit: true,
            },
          },
        }),
        { targetOrigin: "*" }
      )
    );
    expect(mocks.clientFetch).toHaveBeenCalledWith(
      "/api/w/w_current/files/path/conversation-current/chart/intro.dustdoc?document=1"
    );

    mocks.clientFetch.mockResolvedValueOnce(Response.json({ revision: "124" }));
    sendDocumentRequest(iframeWindow, {
      command: "saveDocument",
      params: {
        src: "./intro.dustdoc",
        source: JSON.stringify(document),
        revision: "123",
      },
    });
    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          result: { ok: true, value: { revision: "124" } },
        }),
        { targetOrigin: "*" }
      )
    );
    expect(mocks.clientFetch).toHaveBeenLastCalledWith(
      "/api/w/w_current/files/path/conversation-current/chart/intro.dustdoc?document=1",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/vnd.dust.document+json",
          "If-Match": '"123"',
        },
        body: JSON.stringify(document),
      }
    );
  });

  it.each([
    null,
    "shared-token",
  ])("rejects document reads and writes in a shared Frame (%s)", async (accessToken) => {
    const { iframeWindow, postMessage } = renderFileRPCHost({
      complete: true,
      identifier: "viz-fil_frame",
      accessToken,
    });
    sendDocumentRequest(iframeWindow, {
      command: "getDocument",
      params: { src: "./intro.dustdoc" },
    });
    sendDocumentRequest(iframeWindow, {
      command: "saveDocument",
      params: { src: "./intro.dustdoc", source: "{}", revision: "1" },
    });
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));
    for (const [response] of postMessage.mock.calls) {
      expect(response.result.ok).toBe(false);
    }
    expect(mocks.clientFetch).not.toHaveBeenCalled();
  });

  it.each([
    "../outside.dustdoc",
    "./../outside.dustdoc",
    "conversation-other/private.dustdoc",
    "./index.tsx",
    "./manifest.json",
  ])("refuses document writes outside the allowed sidecars: %s", async (src) => {
    const { iframeWindow, postMessage } =
      renderFileRPCHost(privateVisualization);
    sendDocumentRequest(iframeWindow, {
      command: "saveDocument",
      params: { src, source: "{}", revision: "1" },
    });
    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          result: { ok: false, error: expect.any(String) },
        }),
        { targetOrigin: "*" }
      )
    );
    expect(mocks.clientFetch).not.toHaveBeenCalled();
  });
});

describe("Frame content sizing", () => {
  it("fits small content and follows later growth and shrinkage", () => {
    const { container, iframe, iframeWindow } = renderFileRPCHost(
      privateVisualization,
      { fitContent: true }
    );

    for (const height of [80, 340, 64]) {
      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            source: iframeWindow,
            data: {
              command: "setContentHeight",
              identifier: privateVisualization.identifier,
              messageUniqueId: `height-${height}`,
              params: { height },
            },
          })
        );
      });
      expect(iframe.parentElement?.style.height).toBe(`${height}px`);
      expect(iframe.parentElement?.style.minHeight).toBe("");
      expect(container.querySelector(".h-panel, .min-h-96")).toBeNull();
    }
  });

  it.each([
    { sizing: {}, minHeight: "96px", panel: true },
    {
      sizing: { fitContent: true, isInDrawer: true },
      minHeight: "200px",
      panel: false,
    },
  ])("preserves existing panel or drawer sizing for $sizing", ({
    sizing,
    minHeight,
    panel,
  }) => {
    const { container, iframe } = renderFileRPCHost(
      privateVisualization,
      sizing
    );
    expect(iframe.parentElement?.style.minHeight).toBe(minHeight);
    expect(container.querySelector(".h-panel") !== null).toBe(panel);
    expect(new URL(iframe.src).searchParams.get("fullHeight")).toBe(
      panel ? null : "true"
    );
  });
});

describe("getFrameRuntimeAccess", () => {
  it("enables access with an identity scoped to the Frame workspace", () => {
    expect(
      getFrameRuntimeAccess("w_current", true, scopedUserIdentity)
    ).toEqual({
      canInvokeFunctions: true,
      userIdentity: {
        isAuthenticated: true,
        isWorkspaceMember: true,
        isFrameAuthor: false,
        isPodEditor: false,
        isPodMember: false,
        user,
      },
    });
  });

  it("forwards pod editorship from the scoped identity", () => {
    expect(
      getFrameRuntimeAccess("w_current", true, {
        ...scopedUserIdentity,
        isPodEditor: true,
      })
    ).toEqual({
      canInvokeFunctions: true,
      userIdentity: {
        isAuthenticated: true,
        isWorkspaceMember: true,
        isFrameAuthor: false,
        isPodEditor: true,
        isPodMember: false,
        user,
      },
    });
  });

  it("forwards pod membership from the scoped identity", () => {
    expect(
      getFrameRuntimeAccess("w_current", true, {
        ...scopedUserIdentity,
        isPodMember: true,
      })
    ).toEqual({
      canInvokeFunctions: true,
      userIdentity: {
        isAuthenticated: true,
        isWorkspaceMember: true,
        isFrameAuthor: false,
        isPodEditor: false,
        isPodMember: true,
        user,
      },
    });
  });

  it("fails closed for an identity from another workspace", () => {
    expect(
      getFrameRuntimeAccess("w_other", true, {
        ...scopedUserIdentity,
        isPodEditor: true,
      })
    ).toEqual({
      canInvokeFunctions: false,
      userIdentity: {
        isAuthenticated: false,
        isWorkspaceMember: false,
        isFrameAuthor: false,
        isPodEditor: false,
        isPodMember: false,
        user: null,
      },
    });
  });

  it("keeps function calls disabled when the caller capability is false", () => {
    expect(
      getFrameRuntimeAccess("w_current", false, scopedUserIdentity)
    ).toEqual({
      canInvokeFunctions: false,
      userIdentity: {
        isAuthenticated: true,
        isWorkspaceMember: true,
        isFrameAuthor: false,
        isPodEditor: false,
        isPodMember: false,
        user,
      },
    });
  });
});

describe("getSandboxFunctionInvocationAccessError", () => {
  it("returns a typed workspace-membership error to a Frames v2 guest", () => {
    expect(
      getSandboxFunctionInvocationAccessError(
        { kind: "v2", frameId: "fil_frame" },
        false,
        false
      )
    ).toEqual({
      code: "user_authentication_required",
      message:
        "This Frame function requires a logged-in user from its workspace.",
    });
  });

  it("keeps the generic unsupported error for disabled legacy calls", () => {
    expect(
      getSandboxFunctionInvocationAccessError({ kind: "legacy" }, false, false)
    ).toEqual({
      code: "not_supported",
      message: "Function calls are not available in this Frame.",
    });
  });
});

describe("VisualizationActionIframe", () => {
  it.each([
    "shared-token",
    null,
    "",
  ])("rejects private file RPC reads for shared accessToken %s", async (accessToken) => {
    const { iframeWindow, postMessage } = renderFileRPCHost({
      complete: true,
      identifier: "viz-fil_frame",
      accessToken,
    });
    const fileReferences = [
      "fil_private",
      "conversation-other/private.json",
      "pod-other/private.json",
      "conversation/private.json",
      "pod/private.json",
      "./private.json",
    ];

    for (const fileId of fileReferences) {
      window.dispatchEvent(
        new MessageEvent("message", {
          source: iframeWindow,
          data: {
            command: "getFile",
            identifier: "viz-fil_frame",
            messageUniqueId: fileId,
            params: { fileId },
          },
        })
      );
    }

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledTimes(fileReferences.length);
    });
    for (const fileId of fileReferences) {
      expect(postMessage).toHaveBeenCalledWith(
        {
          command: "answer",
          identifier: "viz-fil_frame",
          messageUniqueId: fileId,
          result: { fileBlob: null },
        },
        { targetOrigin: "*" }
      );
    }
    expect(mocks.clientFetch).not.toHaveBeenCalled();
  });

  it.each([
    ["fil_data", "/api/w/w_current/files/fil_data?action=view"],
    [
      "conversation-current/data file.csv",
      "/api/w/w_current/files/path/conversation-current/data%20file.csv",
    ],
    [
      "./data.csv",
      "/api/w/w_current/files/path/conversation-current/chart/data.csv",
    ],
  ])("preserves private Frame reads for %s", async (fileId, expectedUrl) => {
    mocks.clientFetch.mockResolvedValue(
      new Response("name,value\nTotal,42", {
        headers: { "Content-Type": "text/csv" },
      })
    );
    const { iframeWindow, postMessage } =
      renderFileRPCHost(privateVisualization);

    window.dispatchEvent(
      new MessageEvent("message", {
        source: iframeWindow,
        data: {
          command: "getFile",
          identifier: "viz-fil_frame",
          messageUniqueId: "read-file",
          params: { fileId },
        },
      })
    );

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ result: { fileBlob: expect.any(Blob) } }),
        { targetOrigin: "*" }
      );
    });
    expect(mocks.clientFetch).toHaveBeenCalledExactlyOnceWith(expectedUrl);
  });

  it("rejects file requests from other windows and identifiers", () => {
    const { iframeWindow, postMessage } =
      renderFileRPCHost(privateVisualization);
    const data = {
      command: "getFile",
      identifier: "viz-fil_frame",
      messageUniqueId: "read-file",
      params: { fileId: "fil_private" },
    };

    window.dispatchEvent(new MessageEvent("message", { source: window, data }));
    window.dispatchEvent(
      new MessageEvent("message", {
        source: iframeWindow,
        data: { ...data, identifier: "another-frame" },
      })
    );

    expect(mocks.clientFetch).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("does not expose the retired document load and save RPCs", () => {
    const { iframeWindow, postMessage } =
      renderFileRPCHost(privateVisualization);

    for (const command of ["loadDocument", "saveDocument"]) {
      window.dispatchEvent(
        new MessageEvent("message", {
          source: iframeWindow,
          data: {
            command,
            identifier: "viz-fil_frame",
            messageUniqueId: command,
            params: {
              fileId: "fil_private_document",
              revision: "1",
              document: {
                format: "dust-document",
                formatVersion: 1,
                schemaVersion: 1,
                content: { type: "doc", content: [{ type: "paragraph" }] },
              },
            },
          },
        })
      );
    }

    expect(mocks.clientFetch).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("records missing styles only for the mounted Frame and accepts bounded messages", () => {
    const { container } = render(
      createElement(VisualizationActionIframe, {
        agentConfigurationId: null,
        canInvokeFunctions: true,
        conversationId: null,
        frameId: "fil_frame",
        scopedUserIdentity,
        viewer: null,
        visualization: {
          code: "export default function Frame() {}",
          complete: true,
          identifier: "viz-fil_frame",
        },
        vizUrl: "https://viz.dust.tt",
        workspaceId: "w_current",
      })
    );
    const iframe = container.querySelector("iframe");
    if (!iframe?.contentWindow) {
      throw new Error("Expected the visualization iframe to be mounted.");
    }
    const data = {
      type: "TAILWIND_MISSING_CLASSES",
      identifier: "viz-fil_frame",
      buildId: "test-build",
      classNames: ["bg-opacity-80"],
    };
    window.dispatchEvent(new MessageEvent("message", { source: window, data }));
    window.dispatchEvent(
      new MessageEvent("message", {
        source: iframe.contentWindow,
        data: { ...data, identifier: "another-frame" },
      })
    );
    window.dispatchEvent(
      new MessageEvent("message", {
        source: iframe.contentWindow,
        data: {
          ...data,
          classNames: Array.from({ length: 51 }, () => "bg-opacity-80"),
        },
      })
    );
    expect(mocks.logInfo).not.toHaveBeenCalled();

    window.dispatchEvent(
      new MessageEvent("message", { source: iframe.contentWindow, data })
    );
    expect(mocks.logInfo).toHaveBeenCalledExactlyOnceWith(
      "Frame uses unavailable Tailwind classes",
      {
        fileId: "viz-fil_frame",
        workspaceId: "w_current",
        conversationId: null,
        buildId: "test-build",
        classNames: ["bg-opacity-80"],
      }
    );
    expect(container.querySelector("iframe")).toBe(iframe);
  });

  it("resolves Frame author status only when the iframe requests identity", async () => {
    mocks.clientFetch.mockResolvedValue(
      new Response(JSON.stringify({ isFrameAuthor: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { container } = render(
      createElement(VisualizationActionIframe, {
        agentConfigurationId: null,
        canInvokeFunctions: true,
        conversationId: null,
        frameId: "fil_frame",
        scopedUserIdentity,
        viewer: null,
        visualization: {
          code: "export default function Frame() {}",
          complete: true,
          identifier: "viz-fil_frame",
        },
        vizUrl: "https://viz.dust.tt",
        workspaceId: "w_current",
      })
    );
    const iframe = container.querySelector("iframe");
    if (!iframe?.contentWindow) {
      throw new Error("Expected the visualization iframe to be mounted.");
    }
    expect(iframe.allowFullscreen).toBe(true);
    expect(iframe.getAttribute("sandbox")).toBe(
      "allow-scripts allow-popups allow-popups-to-escape-sandbox"
    );
    const postMessage = vi
      .spyOn(iframe.contentWindow, "postMessage")
      .mockImplementation(() => {});

    expect(mocks.clientFetch).not.toHaveBeenCalled();

    window.dispatchEvent(
      new MessageEvent("message", {
        source: iframe.contentWindow,
        data: {
          command: "getUserIdentity",
          identifier: "viz-fil_frame",
          messageUniqueId: "message-identity",
          params: null,
        },
      })
    );

    await waitFor(() => {
      expect(mocks.clientFetch).toHaveBeenCalledWith(
        "/api/w/w_current/frames/fil_frame/permissions"
      );
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          result: expect.objectContaining({ isFrameAuthor: true }),
        }),
        { targetOrigin: "*" }
      );
    });
  });

  it("fails Frame author status closed when permission lookup fails", async () => {
    mocks.clientFetch.mockResolvedValue(new Response(null, { status: 500 }));

    const { container } = render(
      createElement(VisualizationActionIframe, {
        agentConfigurationId: null,
        canInvokeFunctions: true,
        conversationId: null,
        frameId: "fil_frame",
        scopedUserIdentity,
        viewer: null,
        visualization: {
          code: "export default function Frame() {}",
          complete: true,
          identifier: "viz-fil_frame",
        },
        vizUrl: "https://viz.dust.tt",
        workspaceId: "w_current",
      })
    );
    const iframe = container.querySelector("iframe");
    if (!iframe?.contentWindow) {
      throw new Error("Expected the visualization iframe to be mounted.");
    }
    const postMessage = vi
      .spyOn(iframe.contentWindow, "postMessage")
      .mockImplementation(() => {});

    window.dispatchEvent(
      new MessageEvent("message", {
        source: iframe.contentWindow,
        data: {
          command: "getUserIdentity",
          identifier: "viz-fil_frame",
          messageUniqueId: "message-identity",
          params: null,
        },
      })
    );

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          result: expect.objectContaining({ isFrameAuthor: false }),
        }),
        { targetOrigin: "*" }
      );
    });
  });

  it("routes a Frames v2 call through the rendered Frame identity", async () => {
    mocks.clientFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          invocation: { functionId: "sfn_function", sId: "sfi_invocation" },
          outcome: { status: "succeeded", result: { ok: true } },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      )
    );

    const { container } = render(
      createElement(VisualizationActionIframe, {
        agentConfigurationId: null,
        canInvokeFunctions: true,
        conversationId: null,
        frameId: "fil_frame",
        scopedUserIdentity,
        viewer: null,
        visualization: {
          code: "export default function Frame() {}",
          complete: true,
          identifier: "viz-fil_frame",
        },
        vizUrl: "https://viz.dust.tt",
        workspaceId: "w_current",
      })
    );
    const iframe = container.querySelector("iframe");
    if (!iframe?.contentWindow) {
      throw new Error("Expected the visualization iframe to be mounted.");
    }
    vi.spyOn(iframe.contentWindow, "postMessage").mockImplementation(() => {});

    window.dispatchEvent(
      new MessageEvent("message", {
        source: iframe.contentWindow,
        data: {
          command: "callFunction",
          identifier: "viz-fil_frame",
          messageUniqueId: "message-1",
          params: { functionIdOrSlug: "list-comments" },
        },
      })
    );

    await waitFor(() => {
      expect(mocks.clientFetch).toHaveBeenCalledWith(
        "/api/w/w_current/sandbox-functions/fil_frame%2Flist-comments/invocations",
        expect.objectContaining({ method: "POST" })
      );
    });
  });
});
