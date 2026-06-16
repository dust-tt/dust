import { getGithubOrganizations } from "@app/lib/api/triggers/built-in-webhooks/github/orgs";
import { getGithubRepositories } from "@app/lib/api/triggers/built-in-webhooks/github/repos";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { MembershipRoleType } from "@app/types/memberships";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/triggers/built-in-webhooks/github/repos", () => ({
  getGithubRepositories: vi.fn(),
}));

vi.mock("@app/lib/api/triggers/built-in-webhooks/github/orgs", () => ({
  getGithubOrganizations: vi.fn(),
}));

const mockGetConnectionMetadata = vi.fn();
const mockGetAccessToken = vi.fn();

vi.mock("@app/types/oauth/oauth_api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/types/oauth/oauth_api")>();
  return {
    ...actual,
    OAuthAPI: vi.fn().mockImplementation(function () {
      return {
        getConnectionMetadata: mockGetConnectionMetadata,
        getAccessToken: mockGetAccessToken,
      };
    }),
  };
});

async function setupTest(role: MembershipRoleType = "admin") {
  const { workspace, auth } = await createPrivateApiMockRequest({ role });
  return { workspace, auth };
}

function getServiceData(
  wId: string,
  params: { connectionId?: string; provider?: string }
) {
  const search = new URLSearchParams();
  if (params.connectionId !== undefined) {
    search.set("connectionId", params.connectionId);
  }
  if (params.provider !== undefined) {
    search.set("provider", params.provider);
  }
  const qs = search.toString();
  const url =
    `/api/w/${wId}/webhook_sources/service-data` +
    (qs.length > 0 ? `?${qs}` : "");
  return honoApp.request(url);
}

describe("GET /api/w/[wId]/webhook_sources/service-data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should successfully fetch GitHub service data", async () => {
    const { workspace, auth } = await setupTest();

    const mockConnectionId = "conn_123456";
    const mockAccessToken = "gho_mockToken123";

    const mockRepositories = [
      { fullName: "owner/repo1" },
      { fullName: "owner/repo2" },
    ];
    const mockOrganizations = [{ name: "org1" }, { name: "org2" }];

    vi.mocked(getGithubRepositories).mockResolvedValue(mockRepositories);
    vi.mocked(getGithubOrganizations).mockResolvedValue(mockOrganizations);

    mockGetConnectionMetadata.mockResolvedValue(
      new Ok({
        connection: {
          id: mockConnectionId,
          provider: "github",
          metadata: { workspace_id: workspace.sId },
        },
      })
    );

    mockGetAccessToken.mockResolvedValue(
      new Ok({
        access_token: mockAccessToken,
        connection: {
          id: mockConnectionId,
          provider: "github",
          metadata: {
            workspace_id: workspace.sId,
            user_id: auth.user()?.sId,
          },
        },
      })
    );

    const response = await getServiceData(workspace.sId, {
      connectionId: mockConnectionId,
      provider: "github",
    });

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData.serviceData).toHaveProperty("repositories");
    expect(responseData.serviceData).toHaveProperty("organizations");
    expect(responseData.serviceData.repositories).toEqual(mockRepositories);
    expect(responseData.serviceData.organizations).toEqual(mockOrganizations);
  });

  it("should return 400 when connectionId is missing", async () => {
    const { workspace } = await setupTest();

    const response = await getServiceData(workspace.sId, {
      provider: "github",
    });

    expect(response.status).toBe(400);
    const responseData = await response.json();
    expect(responseData.error.type).toBe("invalid_request_error");
    expect(responseData.error.message).toContain("connectionId");
  });

  it("should return 400 when provider is missing", async () => {
    const { workspace } = await setupTest();

    const response = await getServiceData(workspace.sId, {
      connectionId: "conn_123456",
    });

    expect(response.status).toBe(400);
    const responseData = await response.json();
    expect(responseData.error.type).toBe("invalid_request_error");
    expect(responseData.error.message).toContain("provider");
  });

  it("should return 400 when provider is invalid", async () => {
    const { workspace } = await setupTest();

    const response = await getServiceData(workspace.sId, {
      connectionId: "conn_123456",
      provider: "invalid_provider",
    });

    expect(response.status).toBe(400);
    const responseData = await response.json();
    expect(responseData.error.type).toBe("invalid_request_error");
    expect(responseData.error.message).toContain("Invalid provider");
  });

  it("should return 400 when provider is custom", async () => {
    const { workspace } = await setupTest();

    const response = await getServiceData(workspace.sId, {
      connectionId: "conn_123456",
      provider: "custom",
    });

    expect(response.status).toBe(400);
    const responseData = await response.json();
    expect(responseData.error.type).toBe("invalid_request_error");
    expect(responseData.error.message).toContain("Invalid provider");
  });

  it("should return 403 when connection does not belong to workspace", async () => {
    const { workspace, auth } = await setupTest();

    mockGetAccessToken.mockResolvedValue(
      new Ok({
        access_token: "gho_mockToken123",
        connection: {
          id: "con_123456",
          provider: "github",
          metadata: {
            workspace_id: "different_workspace_id_not_matching",
            user_id: auth.user()?.sId,
          },
        },
      })
    );

    const response = await getServiceData(workspace.sId, {
      connectionId: "con_123456",
      provider: "github",
    });

    expect(response.status).toBe(403);
    const responseData = await response.json();
    expect(responseData.error.type).toBe("workspace_auth_error");
    expect(responseData.error.message).toBe(
      "Connection does not belong to this user/workspace"
    );
  });

  it("should return 403 when connection does not belong to user", async () => {
    const { workspace } = await setupTest();

    mockGetAccessToken.mockResolvedValue(
      new Ok({
        access_token: "gho_mockToken123",
        connection: {
          id: "con_123456",
          provider: "github",
          metadata: {
            workspace_id: workspace.sId,
            user_id: "different_user_id_not_matching",
          },
        },
      })
    );

    const response = await getServiceData(workspace.sId, {
      connectionId: "con_123456",
      provider: "github",
    });

    expect(response.status).toBe(403);
    const responseData = await response.json();
    expect(responseData.error.type).toBe("workspace_auth_error");
    expect(responseData.error.message).toBe(
      "Connection does not belong to this user/workspace"
    );
  });

  it("should return 403 when connection provider does not match provider", async () => {
    const { workspace } = await setupTest();

    mockGetConnectionMetadata.mockResolvedValue(
      new Ok({
        connection: {
          id: "conn_123456",
          provider: "gitlab",
          metadata: { workspace_id: workspace.sId },
        },
      })
    );

    const response = await getServiceData(workspace.sId, {
      connectionId: "conn_123456",
      provider: "github",
    });

    expect(response.status).toBe(403);
    const responseData = await response.json();
    expect(responseData.error.type).toBe("workspace_auth_error");
    expect(responseData.error.message).toBe(
      "Connection is not made for this provider"
    );
  });

  it("should return 500 when failed to get access token", async () => {
    const { workspace } = await setupTest();

    mockGetConnectionMetadata.mockResolvedValue(
      new Ok({
        connection: {
          id: "conn_123456",
          provider: "github",
          metadata: { workspace_id: workspace.sId },
        },
      })
    );

    mockGetAccessToken.mockResolvedValue(new Err(new Error("Token error")));

    const response = await getServiceData(workspace.sId, {
      connectionId: "conn_123456",
      provider: "github",
    });

    expect(response.status).toBe(500);
    const responseData = await response.json();
    expect(responseData.error.type).toBe("internal_server_error");
    expect(responseData.error.message).toBe("Failed to get access token");
  });

  it("should return 403 for non-admin role", async () => {
    const { workspace } = await setupTest("user");

    const response = await getServiceData(workspace.sId, {
      connectionId: "conn_123456",
      provider: "github",
    });

    expect(response.status).toBe(403);
    const responseData = await response.json();
    expect(responseData.error.type).toBe("workspace_auth_error");
  });

  it("should handle empty repositories and organizations", async () => {
    const { workspace } = await setupTest();

    const mockConnectionId = "conn_123456";
    const mockAccessToken = "gho_mockToken123";

    vi.mocked(getGithubRepositories).mockResolvedValue([]);
    vi.mocked(getGithubOrganizations).mockResolvedValue([]);

    mockGetConnectionMetadata.mockResolvedValue(
      new Ok({
        connection: {
          id: mockConnectionId,
          provider: "github",
          metadata: { workspace_id: workspace.sId },
        },
      })
    );

    mockGetAccessToken.mockResolvedValue(
      new Ok({ access_token: mockAccessToken })
    );

    const response = await getServiceData(workspace.sId, {
      connectionId: mockConnectionId,
      provider: "github",
    });

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData.serviceData.repositories).toEqual([]);
    expect(responseData.serviceData.organizations).toEqual([]);
  });
});
