import { getFrameUserIdentity } from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
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

describe("getFrameUserIdentity", () => {
  it("returns an identity scoped to the Frame workspace", () => {
    expect(getFrameUserIdentity("w_current", scopedUserIdentity)).toEqual({
      isAuthenticated: true,
      isWorkspaceMember: true,
      user,
    });
  });

  it("does not return identity for another workspace", () => {
    expect(getFrameUserIdentity("w_other", scopedUserIdentity)).toEqual({
      isAuthenticated: false,
      isWorkspaceMember: false,
      user: null,
    });
  });

  it("keeps a missing identity unauthenticated", () => {
    expect(getFrameUserIdentity("w_current")).toEqual({
      isAuthenticated: false,
      isWorkspaceMember: false,
      user: null,
    });
  });
});
