import { beforeEach, describe, expect, it, vi } from "vitest";

import { getGithubOrganizations } from "@app/lib/api/webhooks/github/orgs";
import { getGithubRepositories } from "@app/lib/api/webhooks/github/repos";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { Err, Ok } from "@app/types";

import handler from "./service-data";

// Mock config
vi.mock("@app/lib/api/config", () => ({
  default: {
    getOAuthAPIConfig: vi.fn(() => ({
      url: "https://oauth-api.example.com",
      apiKey: "test-api-key",
    })),
  },
}));

// Mock the GitHub service functions
vi.mock("@app/lib/api/webhooks/github/repos", () => ({
  getGithubRepositories: vi.fn(),
}));

vi.mock("@app/lib/api/webhooks/github/orgs", () => ({
  getGithubOrganizations: vi.fn(),
}));

// Create mock OAuthAPI methods that we can control
const mockGetConnectionMetadata = vi.fn();
const mockGetAccessToken = vi.fn();

// Mock the OAuthAPI class
vi.mock("@app/types", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    OAuthAPI: vi.fn().mockImplementation(() => ({
      getConnectionMetadata: mockGetConnectionMetadata,
      getAccessToken: mockGetAccessToken,
    })),
  };
});

async function setupTest() {
  const { req, res, workspace, authenticator } =
    await createPrivateApiMockRequest({
      role: "admin",
      method: "GET",
    });

  // Create system space
  await SpaceFactory.defaults(authenticator);

  req.query.wId = workspace.sId;

  return { req, res, workspace, authenticator };
}

describe("GET /api/w/[wId]/webhook_sources/service-data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should successfully fetch GitHub service data", async () => {
    const { req, res, workspace, authenticator } = await setupTest();

    const mockConnectionId = "conn_123456";
    const mockAccessToken = "gho_mockToken123";

    // Mock the GitHub data
    const mockRepositories = [
      { id: 1, full_name: "owner/repo1" },
      { id: 2, full_name: "owner/repo2" },
    ];

    const mockOrganizations = [
      { id: 100, login: "org1" },
      { id: 200, login: "org2" },
    ];

    vi.mocked(getGithubRepositories).mockResolvedValue(mockRepositories);
    vi.mocked(getGithubOrganizations).mockResolvedValue(mockOrganizations);

    // Setup OAuth API mocks
    mockGetConnectionMetadata.mockResolvedValue(
      new Ok({
        connection: {
          id: mockConnectionId,
          provider: "github",
          metadata: {
            workspace_id: workspace.sId,
          },
        },
      } as any)
    );

    mockGetAccessToken.mockResolvedValue(
      new Ok({
        access_token: mockAccessToken,
        connection: {
          id: mockConnectionId,
          provider: "github",
          metadata: {
            workspace_id: workspace.sId,
            user_id: authenticator.user()?.sId,
          },
        },
      } as any)
    );

    req.query.connectionId = mockConnectionId;
    req.query.kind = "github";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();

    expect(responseData).toHaveProperty("serviceData");
    expect(responseData.serviceData).toHaveProperty("repositories");
    expect(responseData.serviceData).toHaveProperty("organizations");
    expect(responseData.serviceData.repositories).toEqual(mockRepositories);
    expect(responseData.serviceData.organizations).toEqual(mockOrganizations);
  });

  it("should return 400 when connectionId is missing", async () => {
    const { req, res } = await setupTest();

    req.query.kind = "github";
    // No connectionId set

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const responseData = res._getJSONData();
    expect(responseData.error).toBeDefined();
    expect(responseData.error.type).toBe("invalid_request_error");
    expect(responseData.error.message).toBe("connectionId is required");
  });

  it("should return 400 when kind is missing", async () => {
    const { req, res } = await setupTest();

    req.query.connectionId = "conn_123456";
    // No kind set

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const responseData = res._getJSONData();
    expect(responseData.error).toBeDefined();
    expect(responseData.error.type).toBe("invalid_request_error");
    expect(responseData.error.message).toBe("kind is required");
  });

  it("should return 400 when kind is invalid", async () => {
    const { req, res } = await setupTest();

    req.query.connectionId = "conn_123456";
    req.query.kind = "invalid_kind";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const responseData = res._getJSONData();
    expect(responseData.error).toBeDefined();
    expect(responseData.error.type).toBe("invalid_request_error");
    expect(responseData.error.message).toContain("Invalid kind");
  });

  it("should return 400 when kind is custom", async () => {
    const { req, res } = await setupTest();

    req.query.connectionId = "conn_123456";
    req.query.kind = "custom";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const responseData = res._getJSONData();
    expect(responseData.error).toBeDefined();
    expect(responseData.error.type).toBe("invalid_request_error");
    expect(responseData.error.message).toContain("Invalid kind");
  });

  it("should return 403 when connection does not belong to workspace", async () => {
    const { req, res, authenticator } = await setupTest();

    // Mock getAccessToken to return a connection with different workspace_id
    // This will make checkConnectionOwnership fail
    mockGetAccessToken.mockResolvedValue(
      new Ok({
        access_token: "gho_mockToken123",
        connection: {
          id: "con_123456",
          provider: "github",
          metadata: {
            workspace_id: "different_workspace_id_not_matching",
            user_id: authenticator.user()?.sId,
          },
        },
      } as any)
    );

    req.query.connectionId = "con_123456";
    req.query.kind = "github";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    const responseData = res._getJSONData();
    expect(responseData.error).toBeDefined();
    expect(responseData.error.type).toBe("workspace_auth_error");
    expect(responseData.error.message).toBe(
      "Connection does not belong to this user/workspace"
    );
  });

  it("should return 403 when connection does not belong to user", async () => {
    const { req, res, workspace } = await setupTest();

    // Mock getAccessToken to return a connection with different user_id
    // This will make checkConnectionOwnership fail
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
      } as any)
    );

    req.query.connectionId = "con_123456";
    req.query.kind = "github";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    const responseData = res._getJSONData();
    expect(responseData.error).toBeDefined();
    expect(responseData.error.type).toBe("workspace_auth_error");
    expect(responseData.error.message).toBe(
      "Connection does not belong to this user/workspace"
    );
  });

  it("should return 403 when connection provider does not match kind", async () => {
    const { req, res, workspace } = await setupTest();

    mockGetConnectionMetadata.mockResolvedValue(
      new Ok({
        connection: {
          id: "conn_123456",
          provider: "gitlab", // Different provider
          metadata: {
            workspace_id: workspace.sId,
          },
        },
      } as any)
    );

    req.query.connectionId = "conn_123456";
    req.query.kind = "github";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    const responseData = res._getJSONData();
    expect(responseData.error).toBeDefined();
    expect(responseData.error.type).toBe("workspace_auth_error");
    expect(responseData.error.message).toBe(
      "Connection is not made for this provider"
    );
  });

  it("should return 500 when failed to get access token", async () => {
    const { req, res, workspace } = await setupTest();

    mockGetConnectionMetadata.mockResolvedValue(
      new Ok({
        connection: {
          id: "conn_123456",
          provider: "github",
          metadata: {
            workspace_id: workspace.sId,
          },
        },
      } as any)
    );

    mockGetAccessToken.mockResolvedValue(new Err(new Error("Token error")));

    req.query.connectionId = "conn_123456";
    req.query.kind = "github";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);
    const responseData = res._getJSONData();
    expect(responseData.error).toBeDefined();
    expect(responseData.error.type).toBe("internal_server_error");
    expect(responseData.error.message).toBe("Failed to get access token");
  });

  it("should return 405 for non-GET methods", async () => {
    const { req, res, workspace, authenticator } =
      await createPrivateApiMockRequest({
        role: "admin",
        method: "POST",
      });

    await SpaceFactory.defaults(authenticator);
    req.query.wId = workspace.sId;
    req.query.connectionId = "conn_123456";
    req.query.kind = "github";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    const responseData = res._getJSONData();
    expect(responseData.error).toBeDefined();
    expect(responseData.error.type).toBe("method_not_supported_error");
    expect(responseData.error.message).toBe(
      "The method passed is not supported, GET is expected."
    );
  });

  it("should handle empty repositories and organizations", async () => {
    const { req, res, workspace } = await setupTest();

    const mockConnectionId = "conn_123456";
    const mockAccessToken = "gho_mockToken123";

    // Mock empty data
    vi.mocked(getGithubRepositories).mockResolvedValue([]);
    vi.mocked(getGithubOrganizations).mockResolvedValue([]);

    mockGetConnectionMetadata.mockResolvedValue(
      new Ok({
        connection: {
          id: mockConnectionId,
          provider: "github",
          metadata: {
            workspace_id: workspace.sId,
          },
        },
      } as any)
    );

    mockGetAccessToken.mockResolvedValue(
      new Ok({
        access_token: mockAccessToken,
      } as any)
    );

    req.query.connectionId = mockConnectionId;
    req.query.kind = "github";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();

    expect(responseData).toHaveProperty("serviceData");
    expect(responseData.serviceData.repositories).toEqual([]);
    expect(responseData.serviceData.organizations).toEqual([]);
  });
});
