import apiConfig from "@app/lib/api/config";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCredentials = vi.fn();

vi.mock(import("@app/types/oauth/oauth_api"), async (orig) => {
  const mod = await orig();
  return {
    ...mod,
    OAuthAPI: vi.fn().mockImplementation(function () {
      return {
        getCredentials: mockGetCredentials,
      };
    }),
  };
});

function getLegacy(wId: string, query: Record<string, string> = {}) {
  const qs = new URLSearchParams(query).toString();
  return honoApp.request(
    `/api/w/${wId}/credentials/slack_is_legacy${qs ? `?${qs}` : ""}`
  );
}

function credentialFor(
  workspaceId: string,
  overrides: {
    provider?: string;
    content?: unknown;
  } = {}
) {
  return {
    credential: {
      credential_id: "cred_slack_1",
      provider: overrides.provider ?? "slack",
      content: overrides.content ?? { client_id: "legacy-client-id" },
      metadata: {
        workspace_id: workspaceId,
        user_id: "user-1",
      },
    },
  };
}

describe("GET /api/w/:wId/credentials/slack_is_legacy", () => {
  beforeEach(() => {
    mockGetCredentials.mockReset();
    vi.spyOn(apiConfig, "getOAuthSlackClientId").mockReturnValue(
      "legacy-client-id"
    );
  });

  it("returns 403 when caller is not an admin", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });

    const response = await getLegacy(workspace.sId, {
      credentialId: "cred_slack_1",
    });

    expect(response.status).toBe(403);
    const data = (await response.json()) as { error: { type: string } };
    expect(data.error.type).toBe("workspace_auth_error");
    expect(mockGetCredentials).not.toHaveBeenCalled();
  });

  it("returns 400 when credentialId is missing", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const response = await getLegacy(workspace.sId);

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: { type: string } };
    expect(data.error.type).toBe("invalid_request_error");
  });

  it("returns 404 when the credential is not found", async () => {
    mockGetCredentials.mockResolvedValue(
      new Err({ code: "not_found", message: "missing" })
    );
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const response = await getLegacy(workspace.sId, {
      credentialId: "cred_missing",
    });

    expect(response.status).toBe(404);
    const data = (await response.json()) as { error: { type: string } };
    expect(data.error.type).toBe("connector_credentials_not_found");
  });

  it("returns 400 when credential belongs to another workspace", async () => {
    mockGetCredentials.mockResolvedValue(
      new Ok(credentialFor("some-other-workspace-id"))
    );
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const response = await getLegacy(workspace.sId, {
      credentialId: "cred_slack_1",
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as {
      error: { type: string; message: string };
    };
    expect(data.error.type).toBe("invalid_request_error");
    expect(data.error.message).toMatch(/does not belong to your workspace/);
  });

  it("returns 400 when credential is not a slack credential", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });
    mockGetCredentials.mockResolvedValue(
      new Ok(credentialFor(workspace.sId, { provider: "notion" }))
    );

    const response = await getLegacy(workspace.sId, {
      credentialId: "cred_slack_1",
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as {
      error: { type: string; message: string };
    };
    expect(data.error.type).toBe("invalid_request_error");
    expect(data.error.message).toMatch(/not a Slack credential/);
  });

  it("returns isLegacySlackApp=true when client_id matches the configured legacy id", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });
    mockGetCredentials.mockResolvedValue(
      new Ok(
        credentialFor(workspace.sId, {
          content: { client_id: "legacy-client-id" },
        })
      )
    );

    const response = await getLegacy(workspace.sId, {
      credentialId: "cred_slack_1",
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { isLegacySlackApp: boolean };
    expect(data.isLegacySlackApp).toBe(true);
  });

  it("returns isLegacySlackApp=false when client_id does not match", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });
    mockGetCredentials.mockResolvedValue(
      new Ok(
        credentialFor(workspace.sId, {
          content: { client_id: "new-client-id" },
        })
      )
    );

    const response = await getLegacy(workspace.sId, {
      credentialId: "cred_slack_1",
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { isLegacySlackApp: boolean };
    expect(data.isLegacySlackApp).toBe(false);
  });

  it("returns isLegacySlackApp=false when credential content has no client_id", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });
    mockGetCredentials.mockResolvedValue(
      new Ok(
        credentialFor(workspace.sId, {
          content: { other: "field" },
        })
      )
    );

    const response = await getLegacy(workspace.sId, {
      credentialId: "cred_slack_1",
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { isLegacySlackApp: boolean };
    expect(data.isLegacySlackApp).toBe(false);
  });
});

describe("Method support /api/w/:wId/credentials/slack_is_legacy", () => {
  it("returns 404 for unsupported methods", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    for (const method of ["POST", "DELETE", "PUT", "PATCH"] as const) {
      const response = await honoApp.request(
        `/api/w/${workspace.sId}/credentials/slack_is_legacy?credentialId=cred_1`,
        { method }
      );
      expect(response.status).toBe(404);
    }
  });
});
