import {
  checkConnectionOwnership,
  checkCredentialOwnership,
} from "@app/lib/api/oauth";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  getCredentials: vi.fn(),
}));

vi.mock("@app/types/oauth/oauth_api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/types/oauth/oauth_api")>();
  return {
    ...actual,
    OAuthAPI: vi.fn().mockImplementation(function OAuthAPIMock() {
      return {
        getAccessToken: mocks.getAccessToken,
        getCredentials: mocks.getCredentials,
      };
    }),
  };
});

function mockAuth({
  workspaceId = "ws_abc",
  userSId = "user_abc",
}: {
  workspaceId?: string;
  userSId?: string;
} = {}): Authenticator {
  return {
    workspace: () =>
      ({ sId: workspaceId }) as ReturnType<Authenticator["workspace"]>,
    user: () => ({ sId: userSId }) as ReturnType<Authenticator["user"]>,
  } as unknown as Authenticator;
}

describe("checkConnectionOwnership", () => {
  beforeEach(() => {
    mocks.getAccessToken.mockReset();
  });

  it("passes through non-con_ IDs without calling OAuthAPI", async () => {
    const result = await checkConnectionOwnership(mockAuth(), "other_id");
    expect(result.isOk()).toBe(true);
    expect(mocks.getAccessToken).not.toHaveBeenCalled();
  });

  it("passes through empty string without calling OAuthAPI", async () => {
    const result = await checkConnectionOwnership(mockAuth(), "");
    expect(result.isOk()).toBe(true);
    expect(mocks.getAccessToken).not.toHaveBeenCalled();
  });

  it("returns Ok when workspace and user match", async () => {
    const auth = mockAuth({ workspaceId: "ws_abc", userSId: "user_abc" });
    mocks.getAccessToken.mockResolvedValue(
      new Ok({
        connection: {
          metadata: { workspace_id: "ws_abc", user_id: "user_abc" },
        },
      })
    );

    const result = await checkConnectionOwnership(auth, "con_abc123");
    expect(result.isOk()).toBe(true);
  });

  it("returns Err when workspace does not match", async () => {
    const auth = mockAuth({ workspaceId: "ws_abc", userSId: "user_abc" });
    mocks.getAccessToken.mockResolvedValue(
      new Ok({
        connection: {
          metadata: { workspace_id: "ws_other", user_id: "user_abc" },
        },
      })
    );

    const result = await checkConnectionOwnership(auth, "con_abc123");
    expect(result.isErr()).toBe(true);
  });

  it("returns Err when user does not match", async () => {
    const auth = mockAuth({ workspaceId: "ws_abc", userSId: "user_abc" });
    mocks.getAccessToken.mockResolvedValue(
      new Ok({
        connection: {
          metadata: { workspace_id: "ws_abc", user_id: "user_other" },
        },
      })
    );

    const result = await checkConnectionOwnership(auth, "con_abc123");
    expect(result.isErr()).toBe(true);
  });

  it("returns Err when OAuthAPI call fails", async () => {
    mocks.getAccessToken.mockResolvedValue(new Err(new Error("API error")));

    const result = await checkConnectionOwnership(mockAuth(), "con_abc123");
    expect(result.isErr()).toBe(true);
  });
});

describe("checkCredentialOwnership", () => {
  beforeEach(() => {
    mocks.getCredentials.mockReset();
  });

  it("passes through non-cred_ IDs without calling OAuthAPI", async () => {
    const result = await checkCredentialOwnership(mockAuth(), "other_id");
    expect(result.isOk()).toBe(true);
    expect(mocks.getCredentials).not.toHaveBeenCalled();
  });

  it("passes through empty string without calling OAuthAPI", async () => {
    const result = await checkCredentialOwnership(mockAuth(), "");
    expect(result.isOk()).toBe(true);
    expect(mocks.getCredentials).not.toHaveBeenCalled();
  });

  it("returns Ok when workspace matches", async () => {
    const auth = mockAuth({ workspaceId: "ws_abc" });
    mocks.getCredentials.mockResolvedValue(
      new Ok({ credential: { metadata: { workspace_id: "ws_abc" } } })
    );

    const result = await checkCredentialOwnership(auth, "cred_abc123");
    expect(result.isOk()).toBe(true);
  });

  it("returns Err when workspace does not match", async () => {
    const auth = mockAuth({ workspaceId: "ws_abc" });
    mocks.getCredentials.mockResolvedValue(
      new Ok({ credential: { metadata: { workspace_id: "ws_other" } } })
    );

    const result = await checkCredentialOwnership(auth, "cred_abc123");
    expect(result.isErr()).toBe(true);
  });

  it("returns Err when OAuthAPI call fails", async () => {
    mocks.getCredentials.mockResolvedValue(new Err(new Error("API error")));

    const result = await checkCredentialOwnership(mockAuth(), "cred_abc123");
    expect(result.isErr()).toBe(true);
  });
});
