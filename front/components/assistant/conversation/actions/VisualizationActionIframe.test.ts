import {
  type FrameAccess,
  getFrameUserIdentity,
} from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import type { ScopedWorkspaceUserIdentity } from "@app/types/assistant/visualization";
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

function getIdentity(
  workspaceId: string,
  frameAccess: FrameAccess = "conversation",
  publicUserIdentity?: ScopedWorkspaceUserIdentity
) {
  return getFrameUserIdentity(
    authContext,
    frameAccess,
    workspaceId,
    publicUserIdentity
  );
}

describe("getFrameUserIdentity", () => {
  it("returns identity for the Frame workspace", () => {
    expect(getIdentity("w_current")).toEqual({
      isAuthenticated: true,
      isWorkspaceMember: true,
      user: authContext.user,
    });
  });

  it("does not return identity for another workspace", () => {
    expect(getIdentity("w_other")).toEqual({
      isAuthenticated: false,
      isWorkspaceMember: false,
      user: null,
    });
  });

  it("returns an explicitly scoped public member identity", () => {
    expect(
      getIdentity("w_current", "public-member", {
        workspaceId: "w_current",
        user: authContext.user,
      })
    ).toEqual({
      isAuthenticated: true,
      isWorkspaceMember: true,
      user: authContext.user,
    });
  });

  it("rejects a public identity scoped to another workspace", () => {
    expect(
      getIdentity("w_current", "public-member", {
        workspaceId: "w_other",
        user: authContext.user,
      })
    ).toEqual({
      isAuthenticated: false,
      isWorkspaceMember: false,
      user: null,
    });
  });

  it("does not return identity for a non-member session", () => {
    expect(
      getFrameUserIdentity(
        {
          ...authContext,
          workspace: { ...authContext.workspace, role: "none" },
        },
        "conversation",
        "w_current"
      )
    ).toEqual({
      isAuthenticated: false,
      isWorkspaceMember: false,
      user: null,
    });
  });

  it("keeps anonymous public Frames unauthenticated", () => {
    expect(
      getIdentity("w_current", "public-anonymous", {
        workspaceId: "w_current",
        user: authContext.user,
      })
    ).toEqual({
      isAuthenticated: false,
      isWorkspaceMember: false,
      user: null,
    });
  });
});
