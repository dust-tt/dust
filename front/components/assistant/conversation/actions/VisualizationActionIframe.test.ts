import {
  getFrameRuntimeAccess,
  getSandboxFunctionInvocationAccessError,
  VisualizationActionIframe,
} from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import type { ScopedWorkspaceUserIdentity } from "@app/types/assistant/visualization";
import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clientFetch: vi.fn(),
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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
      getSandboxFunctionInvocationAccessError(
        { kind: "legacy", podFunctionScope: null },
        false,
        false
      )
    ).toEqual({
      code: "not_supported",
      message: "Function calls are not available in this Frame.",
    });
  });
});

describe("VisualizationActionIframe", () => {
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
