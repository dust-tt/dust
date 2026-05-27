import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { OAuthConnectionType, OAuthProvider } from "@app/types/oauth/lib";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

function createMockConnection({
  provider,
  workspaceId,
  userId,
}: {
  provider: OAuthProvider;
  workspaceId: string;
  userId: string;
}): OAuthConnectionType {
  return {
    connection_id: "con_123456",
    created: Date.now(),
    provider,
    status: "finalized",
    metadata: {
      workspace_id: workspaceId,
      user_id: userId,
    },
  };
}

function createMockAccessTokenResponse({
  provider,
  workspaceId,
  userId,
}: {
  provider: OAuthProvider;
  workspaceId: string;
  userId: string;
}) {
  return {
    access_token: "test-access-token",
    access_token_expiry: null,
    scrubbed_raw_json: {},
    connection: createMockConnection({ provider, workspaceId, userId }),
  };
}

function createMockMetadataResponse({
  provider,
  workspaceId,
  userId,
}: {
  provider: OAuthProvider;
  workspaceId: string;
  userId: string;
}) {
  return {
    connection: createMockConnection({ provider, workspaceId, userId }),
  };
}

// Mock config
vi.mock("@app/lib/api/config", () => ({
  default: {
    getOAuthAPIConfig: vi.fn(() => ({
      url: "https://oauth-api.example.com",
      apiKey: "test-api-key",
    })),
    getWorkOSClientId: vi.fn(() => "test-workos-client-id"),
  },
}));

// Mock rate limiter
vi.mock("@app/lib/utils/rate_limiter", () => ({
  rateLimiter: vi.fn(),
}));

import { rateLimiter } from "@app/lib/utils/rate_limiter";

// Create mock OAuthAPI methods
const mockGetConnectionMetadata = vi.fn();
const mockGetAccessToken = vi.fn();

// Mock the OAuthAPI class
vi.mock("@app/types/oauth/oauth_api", async (importOriginal) => {
  const actual = (await importOriginal()) as object;
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

// Mock Google Drive client
const mockFilesList = vi.fn();
vi.mock("@app/lib/providers/google_drive/utils", () => ({
  getGoogleDriveClient: vi.fn(() => ({
    files: {
      list: mockFilesList,
    },
  })),
}));

async function setupTest() {
  const { workspace, auth } = await createPrivateApiMockRequest({
    role: "user",
    method: "POST",
  });

  // Default rate limiter to allow requests
  vi.mocked(rateLimiter).mockResolvedValue(60);

  return { workspace, auth };
}

function postSearchForAuthorization(wId: string, body: unknown) {
  return honoApp.request(
    `/api/w/${wId}/google_drive/search_for_authorization`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("POST /api/w/[wId]/google_drive/search_for_authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 404 for non-POST methods", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      role: "user",
      method: "GET",
    });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/google_drive/search_for_authorization`,
      { method: "GET" }
    );

    // Hono returns 404 for unregistered methods (no route matched).
    expect(response.status).toBe(404);
  });

  it("should return 400 for missing connectionId", async () => {
    const { workspace } = await setupTest();

    const response = await postSearchForAuthorization(workspace.sId, {
      fileName: "test document",
    });

    expect(response.status).toBe(400);
    const responseData = (await response.json()) as {
      error: { type: string };
    };
    expect(responseData.error).toBeDefined();
    expect(responseData.error.type).toBe("invalid_request_error");
  });

  it("should return 400 for missing fileName", async () => {
    const { workspace } = await setupTest();

    const response = await postSearchForAuthorization(workspace.sId, {
      connectionId: "con_123456",
    });

    expect(response.status).toBe(400);
    const responseData = (await response.json()) as {
      error: { type: string };
    };
    expect(responseData.error).toBeDefined();
    expect(responseData.error.type).toBe("invalid_request_error");
  });

  it("should return 403 for invalid connection ownership", async () => {
    const { workspace, auth } = await setupTest();

    mockGetAccessToken.mockResolvedValue(
      new Ok(
        createMockAccessTokenResponse({
          provider: "google_drive",
          workspaceId: "different_workspace_id",
          userId: auth.user()?.sId ?? "",
        })
      )
    );

    const response = await postSearchForAuthorization(workspace.sId, {
      connectionId: "con_123456",
      fileName: "test",
    });

    expect(response.status).toBe(403);
    const responseData = (await response.json()) as {
      error: { type: string; message: string };
    };
    expect(responseData.error).toBeDefined();
    expect(responseData.error.type).toBe("workspace_auth_error");
    expect(responseData.error.message).toBe(
      "Connection does not belong to this user/workspace"
    );
  });

  it("should return 403 for wrong provider", async () => {
    const { workspace, auth } = await setupTest();

    const userId = auth.user()?.sId ?? "";

    mockGetAccessToken.mockResolvedValue(
      new Ok(
        createMockAccessTokenResponse({
          provider: "slack",
          workspaceId: workspace.sId,
          userId,
        })
      )
    );

    mockGetConnectionMetadata.mockResolvedValue(
      new Ok(
        createMockMetadataResponse({
          provider: "slack",
          workspaceId: workspace.sId,
          userId,
        })
      )
    );

    const response = await postSearchForAuthorization(workspace.sId, {
      connectionId: "con_123456",
      fileName: "test",
    });

    expect(response.status).toBe(403);
    const responseData = (await response.json()) as {
      error: { type: string; message: string };
    };
    expect(responseData.error).toBeDefined();
    expect(responseData.error.type).toBe("workspace_auth_error");
    expect(responseData.error.message).toBe(
      "Connection is not a Google Drive connection"
    );
  });

  it("should return 429 when rate limited", async () => {
    const { workspace, auth } = await setupTest();

    vi.mocked(rateLimiter).mockResolvedValue(0);

    const userId = auth.user()?.sId ?? "";

    mockGetAccessToken.mockResolvedValue(
      new Ok(
        createMockAccessTokenResponse({
          provider: "google_drive",
          workspaceId: workspace.sId,
          userId,
        })
      )
    );

    mockGetConnectionMetadata.mockResolvedValue(
      new Ok(
        createMockMetadataResponse({
          provider: "google_drive",
          workspaceId: workspace.sId,
          userId,
        })
      )
    );

    const response = await postSearchForAuthorization(workspace.sId, {
      connectionId: "con_123456",
      fileName: "test",
    });

    expect(response.status).toBe(429);
    const responseData = (await response.json()) as {
      error: { type: string };
    };
    expect(responseData.error).toBeDefined();
    expect(responseData.error.type).toBe("rate_limit_error");
  });

  it("should return empty array when no matches", async () => {
    const { workspace, auth } = await setupTest();

    const userId = auth.user()?.sId ?? "";

    mockGetAccessToken.mockResolvedValue(
      new Ok(
        createMockAccessTokenResponse({
          provider: "google_drive",
          workspaceId: workspace.sId,
          userId,
        })
      )
    );

    mockGetConnectionMetadata.mockResolvedValue(
      new Ok(
        createMockMetadataResponse({
          provider: "google_drive",
          workspaceId: workspace.sId,
          userId,
        })
      )
    );

    mockFilesList.mockResolvedValue({
      data: {
        files: [],
      },
    });

    const response = await postSearchForAuthorization(workspace.sId, {
      connectionId: "con_123456",
      fileName: "nonexistent",
    });

    expect(response.status).toBe(200);
    const responseData = (await response.json()) as { files: unknown[] };
    expect(responseData.files).toEqual([]);
  });

  it("should return formatted results on success", async () => {
    const { workspace, auth } = await setupTest();

    const userId = auth.user()?.sId ?? "";

    mockGetAccessToken.mockResolvedValue(
      new Ok(
        createMockAccessTokenResponse({
          provider: "google_drive",
          workspaceId: workspace.sId,
          userId,
        })
      )
    );

    mockGetConnectionMetadata.mockResolvedValue(
      new Ok(
        createMockMetadataResponse({
          provider: "google_drive",
          workspaceId: workspace.sId,
          userId,
        })
      )
    );

    mockFilesList.mockResolvedValue({
      data: {
        files: [
          {
            id: "file1",
            name: "Test Document",
            mimeType: "application/vnd.google-apps.document",
            webViewLink: "https://docs.google.com/document/d/file1/edit",
          },
          {
            id: "file2",
            name: "Test Spreadsheet",
            mimeType: "application/vnd.google-apps.spreadsheet",
            webViewLink: "https://docs.google.com/spreadsheets/d/file2/edit",
          },
        ],
      },
    });

    const response = await postSearchForAuthorization(workspace.sId, {
      connectionId: "con_123456",
      fileName: "Test",
    });

    expect(response.status).toBe(200);
    const responseData = (await response.json()) as {
      files: {
        fileId: string;
        fileName: string;
        mimeType: string;
        webViewLink: string;
      }[];
    };
    expect(responseData.files).toHaveLength(2);
    expect(responseData.files[0]).toEqual({
      fileId: "file1",
      fileName: "Test Document",
      mimeType: "application/vnd.google-apps.document",
      webViewLink: "https://docs.google.com/document/d/file1/edit",
    });
    expect(responseData.files[1]).toEqual({
      fileId: "file2",
      fileName: "Test Spreadsheet",
      mimeType: "application/vnd.google-apps.spreadsheet",
      webViewLink: "https://docs.google.com/spreadsheets/d/file2/edit",
    });
  });

  it("should return 500 when failed to get access token", async () => {
    const { workspace, auth } = await setupTest();

    const userId = auth.user()?.sId ?? "";

    mockGetAccessToken
      .mockResolvedValueOnce(
        new Ok(
          createMockAccessTokenResponse({
            provider: "google_drive",
            workspaceId: workspace.sId,
            userId,
          })
        )
      )
      .mockResolvedValueOnce(new Err(new Error("Token error")));

    mockGetConnectionMetadata.mockResolvedValue(
      new Ok(
        createMockMetadataResponse({
          provider: "google_drive",
          workspaceId: workspace.sId,
          userId,
        })
      )
    );

    const response = await postSearchForAuthorization(workspace.sId, {
      connectionId: "con_123456",
      fileName: "test",
    });

    expect(response.status).toBe(500);
    const responseData = (await response.json()) as {
      error: { type: string; message: string };
    };
    expect(responseData.error).toBeDefined();
    expect(responseData.error.type).toBe("internal_server_error");
    expect(responseData.error.message).toBe("Failed to get access token");
  });

  it("should return 500 when Google Drive API fails", async () => {
    const { workspace, auth } = await setupTest();

    const userId = auth.user()?.sId ?? "";

    mockGetAccessToken.mockResolvedValue(
      new Ok(
        createMockAccessTokenResponse({
          provider: "google_drive",
          workspaceId: workspace.sId,
          userId,
        })
      )
    );

    mockGetConnectionMetadata.mockResolvedValue(
      new Ok(
        createMockMetadataResponse({
          provider: "google_drive",
          workspaceId: workspace.sId,
          userId,
        })
      )
    );

    mockFilesList.mockRejectedValue(new Error("Google Drive API error"));

    const response = await postSearchForAuthorization(workspace.sId, {
      connectionId: "con_123456",
      fileName: "test",
    });

    expect(response.status).toBe(500);
    const responseData = (await response.json()) as {
      error: { type: string; message: string };
    };
    expect(responseData.error).toBeDefined();
    expect(responseData.error.type).toBe("internal_server_error");
    expect(responseData.error.message).toBe(
      "Failed to search Google Drive files"
    );
  });
});
