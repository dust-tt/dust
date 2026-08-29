import {
  getFrameRuntimeAccess,
  getSandboxFunctionInvocationEventsUrl,
  getSandboxFunctionInvocationUrl,
} from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import type { ScopedWorkspaceUserIdentity } from "@app/types/assistant/visualization";
import { describe, expect, it } from "vitest";

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

describe("getFrameRuntimeAccess", () => {
  it("enables access with an identity scoped to the Frame workspace", () => {
    expect(
      getFrameRuntimeAccess("w_current", true, scopedUserIdentity)
    ).toEqual({
      canInvokeFunctions: true,
      userIdentity: {
        isAuthenticated: true,
        isWorkspaceMember: true,
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
        isPodEditor: false,
        isPodMember: false,
        user,
      },
    });
  });
});

describe("Frame function invocation routes", () => {
  it("uses stable Frame identity and a bare function name for Frames v2", () => {
    const reference = {
      kind: "v2" as const,
      frameId: "fil_123",
      functionName: "list-comments",
    };

    expect(getSandboxFunctionInvocationUrl("w_123", reference)).toBe(
      "/api/w/w_123/frames/fil_123/functions/list-comments/invocations"
    );
    expect(
      getSandboxFunctionInvocationEventsUrl({
        workspaceId: "w_123",
        reference,
        functionId: "sfn_old_publication",
        invocationId: "sfi_123",
      })
    ).toBe("/api/sse/w/w_123/frames/fil_123/invocations/sfi_123/events");
  });

  it("keeps legacy Frames and Pod Functions on their existing routes", () => {
    const reference = {
      kind: "legacy" as const,
      functionIdOrSlug: "vlt_123/comments__list-comments",
    };

    expect(getSandboxFunctionInvocationUrl("w_123", reference)).toBe(
      "/api/w/w_123/sandbox-functions/vlt_123%2Fcomments__list-comments/invocations"
    );
    expect(
      getSandboxFunctionInvocationEventsUrl({
        workspaceId: "w_123",
        reference,
        functionId: "sfn_123",
        invocationId: "sfi_123",
      })
    ).toBe(
      "/api/sse/w/w_123/sandbox-functions/sfn_123/invocations/sfi_123/events"
    );
  });
});
