import { afterEach, describe, expect, test } from "bun:test";
import {
  currentUser,
  POD_USER_IDENTITY_ENV,
  POD_WORKSPACE_ID_ENV,
  PodUserIdentityError,
  runWithInvocationEnv,
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

    expect(currentUser()).toEqual({
      ...identity.user,
      isPodEditor: false,
      isPodMember: false,
    });
  });

  test("reads the pod editor bit from the envelope", () => {
    process.env[POD_WORKSPACE_ID_ENV] = "w_current";
    process.env[POD_USER_IDENTITY_ENV] = JSON.stringify({
      ...identity,
      isPodEditor: true,
    });

    expect(currentUser()).toEqual({
      ...identity.user,
      isPodEditor: true,
      isPodMember: false,
    });
  });

  test("defaults the pod editor bit to false when the envelope omits it", () => {
    process.env[POD_WORKSPACE_ID_ENV] = "w_current";
    process.env[POD_USER_IDENTITY_ENV] = JSON.stringify(identity);

    expect(currentUser()?.isPodEditor).toBe(false);
  });

  test("reads the pod member bit from the envelope", () => {
    process.env[POD_WORKSPACE_ID_ENV] = "w_current";
    process.env[POD_USER_IDENTITY_ENV] = JSON.stringify({
      ...identity,
      isPodMember: true,
    });

    expect(currentUser()).toEqual({
      ...identity.user,
      isPodEditor: false,
      isPodMember: true,
    });
  });

  test("defaults the pod member bit to false when the envelope omits it", () => {
    process.env[POD_WORKSPACE_ID_ENV] = "w_current";
    process.env[POD_USER_IDENTITY_ENV] = JSON.stringify(identity);

    expect(currentUser()?.isPodMember).toBe(false);
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

describe("currentUser inside an invocation context", () => {
  const contextEnv = (identityValue: string | undefined) => ({
    [POD_WORKSPACE_ID_ENV]: "w_current",
    ...(identityValue === undefined
      ? {}
      : { [POD_USER_IDENTITY_ENV]: identityValue }),
  });

  test("reads the identity from the context env", () => {
    const user = runWithInvocationEnv(
      contextEnv(JSON.stringify(identity)),
      () => currentUser()
    );
    expect(user).toEqual({
      ...identity.user,
      isPodEditor: false,
      isPodMember: false,
    });
  });

  test("a userless context returns null even when process.env has an identity", () => {
    process.env[POD_WORKSPACE_ID_ENV] = "w_current";
    process.env[POD_USER_IDENTITY_ENV] = JSON.stringify(identity);

    expect(
      runWithInvocationEnv(contextEnv(""), () => currentUser())
    ).toBeNull();
    expect(
      runWithInvocationEnv(contextEnv(undefined), () => currentUser())
    ).toBeNull();
  });

  test("concurrent invocations resolve their own callers", async () => {
    const otherIdentity = {
      workspaceId: "w_current",
      user: { ...identity.user, sId: "usr_456", firstName: "Grace" },
    };
    const call = async (raw: string, delayMs: number) =>
      runWithInvocationEnv(contextEnv(raw), async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return currentUser();
      });
    const [a, b] = await Promise.all([
      call(JSON.stringify(identity), 30),
      call(JSON.stringify(otherIdentity), 5),
    ]);
    expect(a?.sId).toBe("usr_123");
    expect(b?.sId).toBe("usr_456");
  });
});
