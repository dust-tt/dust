import {
  type FrameAccess,
  getConversationFrameUserIdentity,
} from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import { describe, expect, it } from "vitest";

const authContext = {
  workspace: { sId: "w_current" },
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
  frameAccess: FrameAccess = "conversation"
) {
  return getConversationFrameUserIdentity(
    authContext,
    frameAccess,
    workspaceId
  );
}

describe("getConversationFrameUserIdentity", () => {
  it("returns identity for the Frame workspace", () => {
    expect(getIdentity("w_current")).toEqual({
      isAuthenticated: true,
      user: authContext.user,
    });
  });

  it("does not return identity for another workspace", () => {
    expect(getIdentity("w_other")).toEqual({
      isAuthenticated: false,
      user: null,
    });
  });

  it("keeps public Frames unauthenticated", () => {
    expect(getIdentity("w_current", "public-member")).toEqual({
      isAuthenticated: false,
      user: null,
    });
  });
});
