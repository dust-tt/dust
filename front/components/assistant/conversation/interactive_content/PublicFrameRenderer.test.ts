import { getPublicFrameUserIdentity } from "@app/components/assistant/conversation/interactive_content/PublicFrameRenderer";
import { describe, expect, it } from "vitest";

const user = {
  sId: "usr_123",
  firstName: "Ada",
  lastName: "Lovelace",
  fullName: "Ada Lovelace",
  image: null,
  workspaces: [{ sId: "w_current" }],
};

describe("getPublicFrameUserIdentity", () => {
  it("scopes a server-confirmed member to the Frame workspace", () => {
    expect(getPublicFrameUserIdentity(user, true, "w_current")).toEqual({
      workspaceId: "w_current",
      user: {
        sId: "usr_123",
        firstName: "Ada",
        lastName: "Lovelace",
        fullName: "Ada Lovelace",
        image: null,
      },
    });
  });

  it("rejects a user who belongs only to another workspace", () => {
    expect(getPublicFrameUserIdentity(user, true, "w_other")).toBeUndefined();
  });

  it("rejects a viewer not confirmed as a workspace member", () => {
    expect(
      getPublicFrameUserIdentity(user, false, "w_current")
    ).toBeUndefined();
  });
});
