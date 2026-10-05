import type { SessionWithUser } from "@app/lib/iam/provider";
import { sessionSatisfiesSSOEnforcement } from "@app/lib/iam/session";
import type { WorkspaceType } from "@app/types/user";
import { describe, expect, it } from "vitest";

function makeSession(
  overrides: Pick<SessionWithUser, "isSSO" | "authenticationMethod">
): SessionWithUser {
  return {
    type: "workos",
    sessionId: "session-id",
    user: {
      email: "user@example.com",
      email_verified: true,
      name: "user",
      nickname: "user",
      workOSUserId: "user_123",
    },
    ...overrides,
  };
}

function makeWorkspace(
  ssoEnforced: boolean
): Pick<WorkspaceType, "ssoEnforced"> {
  return { ssoEnforced };
}

describe("sessionSatisfiesSSOEnforcement", () => {
  const passwordSession = makeSession({
    isSSO: false,
    authenticationMethod: "Password",
  });

  it("accepts any session when SSO is not enforced", () => {
    expect(
      sessionSatisfiesSSOEnforcement(makeWorkspace(false), passwordSession)
    ).toBe(true);
  });

  it("rejects a non-SSO cookie session when SSO is enforced", () => {
    expect(
      sessionSatisfiesSSOEnforcement(makeWorkspace(true), passwordSession)
    ).toBe(false);
  });

  it("accepts an SSO cookie session when SSO is enforced", () => {
    expect(
      sessionSatisfiesSSOEnforcement(
        makeWorkspace(true),
        makeSession({ isSSO: true, authenticationMethod: "SSO" })
      )
    ).toBe(true);
  });

  it("exempts OAuth bearer sessions when SSO is enforced", () => {
    expect(
      sessionSatisfiesSSOEnforcement(
        makeWorkspace(true),
        makeSession({ isSSO: false, authenticationMethod: "bearer" })
      )
    ).toBe(true);
  });
});
