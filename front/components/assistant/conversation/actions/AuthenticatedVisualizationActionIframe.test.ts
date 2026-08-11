import { getAuthenticatedFrameUserIdentity } from "@app/components/assistant/conversation/actions/AuthenticatedVisualizationActionIframe";
import { describe, expect, it } from "vitest";

const authContext = {
  workspace: { role: "user" as const, sId: "w_current" },
  user: {
    sId: "usr_123",
    firstName: "Ada",
    lastName: "Lovelace",
    fullName: "Ada Lovelace",
    image: null,
  },
};

describe("getAuthenticatedFrameUserIdentity", () => {
  it("scopes the authenticated user to the Frame workspace", () => {
    expect(getAuthenticatedFrameUserIdentity(authContext, "w_current")).toEqual(
      {
        workspaceId: "w_current",
        isPodEditor: false,
        user: authContext.user,
      }
    );
  });

  it("forwards the pod editorship flag when the host knows it", () => {
    expect(
      getAuthenticatedFrameUserIdentity(authContext, "w_current", true)
    ).toEqual({
      workspaceId: "w_current",
      isPodEditor: true,
      user: authContext.user,
    });
  });

  it("returns no identity for an auth context from another workspace", () => {
    expect(
      getAuthenticatedFrameUserIdentity(authContext, "w_other")
    ).toBeUndefined();
  });

  it("returns no identity for a non-member auth context", () => {
    expect(
      getAuthenticatedFrameUserIdentity(
        {
          ...authContext,
          workspace: { ...authContext.workspace, role: "none" },
        },
        "w_current"
      )
    ).toBeUndefined();
  });
});
