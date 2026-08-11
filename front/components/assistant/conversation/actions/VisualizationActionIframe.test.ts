import { getFrameRuntimeAccess } from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
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
        user,
      },
    });
  });
});
