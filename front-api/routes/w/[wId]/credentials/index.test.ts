import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPostCredentials = vi.fn();
const mockGetCredentials = vi.fn();

vi.mock(import("@app/types/oauth/oauth_api"), async (orig) => {
  const mod = await orig();
  return {
    ...mod,
    OAuthAPI: vi.fn().mockImplementation(function () {
      return {
        postCredentials: mockPostCredentials,
        getCredentials: mockGetCredentials,
      };
    }),
  };
});

const BIGQUERY_CREDENTIALS = {
  type: "service_account",
  project_id: "test-project",
  private_key_id: "test-key-id",
  private_key: "test-private-key",
  client_email: "test@test-project.iam.gserviceaccount.com",
  client_id: "test-client-id",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url:
    "https://www.googleapis.com/robot/v1/metadata/x509/test",
  universe_domain: "googleapis.com",
  location: "us",
};

const NOTION_CREDENTIALS = {
  integration_token: "secret_notion_token",
};

function postCredentials(wId: string, body: unknown) {
  return honoApp.request(`/api/w/${wId}/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/w/:wId/credentials", () => {
  beforeEach(() => {
    mockPostCredentials.mockReset();
  });

  it("returns 403 when caller is not an admin", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });

    const response = await postCredentials(workspace.sId, {
      provider: "notion",
      credentials: NOTION_CREDENTIALS,
    });

    expect(response.status).toBe(403);
    const data = (await response.json()) as { error: { type: string } };
    expect(data.error.type).toBe("workspace_auth_error");
    expect(mockPostCredentials).not.toHaveBeenCalled();
  });

  it("returns 400 when the body shape is invalid", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const response = await postCredentials(workspace.sId, {
      provider: "notion",
      credentials: { not: "a-token" },
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: { type: string } };
    expect(data.error.type).toBe("invalid_request_error");
    expect(mockPostCredentials).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown provider", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const response = await postCredentials(workspace.sId, {
      provider: "unknown",
      credentials: NOTION_CREDENTIALS,
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: { type: string } };
    expect(data.error.type).toBe("invalid_request_error");
  });

  it("creates notion credentials and returns 201 with the credential id", async () => {
    mockPostCredentials.mockResolvedValue(
      new Ok({ credential: { credential_id: "cred_notion_123" } })
    );

    const { workspace, user } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const response = await postCredentials(workspace.sId, {
      provider: "notion",
      credentials: NOTION_CREDENTIALS,
    });

    expect(response.status).toBe(201);
    const data = (await response.json()) as { credentials: { id: string } };
    expect(data.credentials.id).toBe("cred_notion_123");

    expect(mockPostCredentials).toHaveBeenCalledTimes(1);
    expect(mockPostCredentials).toHaveBeenCalledWith({
      provider: "notion",
      workspaceId: workspace.sId,
      userId: user.sId,
      credentials: NOTION_CREDENTIALS,
    });
  });

  it("creates bigquery credentials and returns 201", async () => {
    mockPostCredentials.mockResolvedValue(
      new Ok({ credential: { credential_id: "cred_bq_456" } })
    );

    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const response = await postCredentials(workspace.sId, {
      provider: "bigquery",
      credentials: BIGQUERY_CREDENTIALS,
    });

    expect(response.status).toBe(201);
    const data = (await response.json()) as { credentials: { id: string } };
    expect(data.credentials.id).toBe("cred_bq_456");
  });

  it("returns 500 with connector_credentials_error when OAuth API fails", async () => {
    mockPostCredentials.mockResolvedValue(
      new Err({ code: "internal_error", message: "upstream timeout" })
    );

    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const response = await postCredentials(workspace.sId, {
      provider: "notion",
      credentials: NOTION_CREDENTIALS,
    });

    expect(response.status).toBe(500);
    const data = (await response.json()) as {
      error: { type: string; message: string };
    };
    expect(data.error.type).toBe("connector_credentials_error");
    expect(data.error.message).toMatch(/upstream timeout/);
  });
});

describe("Method support /api/w/:wId/credentials", () => {
  it("returns 404 for unsupported methods", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    for (const method of ["GET", "DELETE", "PUT", "PATCH"] as const) {
      const response = await honoApp.request(
        `/api/w/${workspace.sId}/credentials`,
        { method }
      );
      expect(response.status).toBe(404);
    }
  });
});
