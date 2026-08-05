import { afterEach, describe, expect, test } from "bun:test";
import {
  currentUser,
  POD_USER_IDENTITY_ENV,
  POD_WORKSPACE_ID_ENV,
  PodUserIdentityError,
} from "@dust/pod";

const identity = {
  workspaceId: "w_current",
  user: {
    sId: "usr_123",
    firstName: "Ada",
    lastName: "Lovelace",
    fullName: "Ada Lovelace",
    image: null,
  },
};

afterEach(() => {
  delete process.env[POD_USER_IDENTITY_ENV];
  delete process.env[POD_WORKSPACE_ID_ENV];
});

describe("currentUser", () => {
  test("returns the user scoped to the current workspace", () => {
    process.env[POD_WORKSPACE_ID_ENV] = "w_current";
    process.env[POD_USER_IDENTITY_ENV] = JSON.stringify(identity);

    expect(currentUser()).toEqual(identity.user);
  });

  test("returns null for a userless invocation", () => {
    process.env[POD_WORKSPACE_ID_ENV] = "w_current";
    process.env[POD_USER_IDENTITY_ENV] = "";

    expect(currentUser()).toBeNull();
  });

  test("rejects identity from another workspace", () => {
    process.env[POD_WORKSPACE_ID_ENV] = "w_other";
    process.env[POD_USER_IDENTITY_ENV] = JSON.stringify(identity);

    expect(() => currentUser()).toThrow(PodUserIdentityError);
    expect(() => currentUser()).toThrow(/does not match/);
  });

  test("rejects malformed identity", () => {
    process.env[POD_WORKSPACE_ID_ENV] = "w_current";
    process.env[POD_USER_IDENTITY_ENV] = JSON.stringify({
      workspaceId: "w_current",
      user: { sId: "usr_123" },
    });

    expect(() => currentUser()).toThrow(PodUserIdentityError);
  });
});
