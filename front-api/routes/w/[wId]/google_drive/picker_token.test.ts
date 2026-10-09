import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { Authenticator } from "@app/lib/auth";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerConnectionFactory } from "@app/tests/utils/MCPServerConnectionFactory";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type {
  MCPOAuthUseCase,
  OAuthConnectionType,
} from "@app/types/oauth/lib";
import { Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ACCESS_TOKEN = "ya29.picker-test-token";

const mocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  googleDriveClientId: "123456789012.apps.googleusercontent.com",
  googleDrivePickerApiKey: "picker-test-key",
}));

vi.mock("@app/lib/api/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/api/config")>();
  return {
    ...actual,
    default: {
      ...actual.default,
      getOAuthGoogleDriveClientId: () => mocks.googleDriveClientId,
      getGoogleDrivePickerApiKey: () => mocks.googleDrivePickerApiKey,
    },
  };
});

vi.mock("@app/lib/api/oauth_access_token", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/oauth_access_token")>();
  return {
    ...actual,
    getOAuthConnectionAccessToken: mocks.getAccessToken,
  };
});

import { honoApp } from "@front-api/app";

beforeEach(() => {
  mocks.getAccessToken.mockReset();
  mocks.getAccessToken.mockResolvedValue(
    new Ok({
      access_token: ACCESS_TOKEN,
      access_token_expiry: null,
      scrubbed_raw_json: {},
      connection: {
        connection_id: "con_test",
        created: Date.now(),
        metadata: {},
        provider: "google_drive",
        status: "finalized",
      } satisfies OAuthConnectionType,
    })
  );
});

async function setupMember() {
  const admin = await createPrivateApiMockRequest({ role: "admin" });
  const member = await createPrivateApiMockRequest({
    role: "user",
    workspace: admin.workspace,
  });
  return {
    adminAuth: admin.auth,
    memberAuth: member.auth,
    workspace: admin.workspace,
    globalSpace: admin.globalSpace,
  };
}

async function createInternalServer(
  auth: Authenticator,
  workspace: LightWorkspaceType,
  space: SpaceResource,
  name: InternalMCPServerNameType,
  useCase: MCPOAuthUseCase
) {
  const server = await InternalMCPServerInMemoryResource.makeNew(auth, {
    name,
    useCase,
  });
  await MCPServerViewFactory.create(workspace, server.id, space);
  return server;
}

function postPickerToken(workspace: { sId: string }, mcpServerId: string) {
  return honoApp.request(`/api/w/${workspace.sId}/google_drive/picker_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mcpServerId }),
  });
}

describe("POST /api/w/:wId/google_drive/picker_token", () => {
  it("returns the workspace token for a Google Drive server the member can access", async () => {
    const { adminAuth, workspace, globalSpace } = await setupMember();
    const server = await createInternalServer(
      adminAuth,
      workspace,
      globalSpace,
      "google_drive",
      "platform_actions"
    );
    const connection = await MCPServerConnectionFactory.internal(
      adminAuth,
      server.id,
      "workspace"
    );

    const response = await postPickerToken(workspace, server.id);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.accessToken).toBe(ACCESS_TOKEN);
    expect(body.clientId).toBe(mocks.googleDriveClientId);
    expect(body.developerKey).toBe(mocks.googleDrivePickerApiKey);
    expect(body.appId).toBe(mocks.googleDriveClientId.match(/^(\d+)/)?.[1]);
    expect(mocks.getAccessToken).toHaveBeenCalledTimes(1);
    expect(mocks.getAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: connection.connectionId })
    );
  });

  it("rejects another MCP server with 400 and does not exchange its OAuth connection", async () => {
    const { adminAuth, workspace, globalSpace } = await setupMember();
    const server = await createInternalServer(
      adminAuth,
      workspace,
      globalSpace,
      "gmail",
      "platform_actions"
    );
    await MCPServerConnectionFactory.internal(
      adminAuth,
      server.id,
      "workspace"
    );

    const response = await postPickerToken(workspace, server.id);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.type).toBe("invalid_request_error");
    expect(body).not.toHaveProperty("accessToken");
    expect(mocks.getAccessToken).not.toHaveBeenCalled();
  });

  it("does not return a Google Drive workspace token for a space the member cannot access", async () => {
    const { adminAuth, workspace } = await setupMember();
    const restrictedSpace = await SpaceFactory.regular(workspace);
    const server = await createInternalServer(
      adminAuth,
      workspace,
      restrictedSpace,
      "google_drive",
      "platform_actions"
    );
    await MCPServerConnectionFactory.internal(
      adminAuth,
      server.id,
      "workspace"
    );

    const response = await postPickerToken(workspace, server.id);

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).not.toHaveProperty("accessToken");
    expect(mocks.getAccessToken).not.toHaveBeenCalled();
  });

  it("uses the caller's personal connection when only an inaccessible view is platform_actions", async () => {
    const { adminAuth, memberAuth, workspace, globalSpace } =
      await setupMember();
    const server = await createInternalServer(
      adminAuth,
      workspace,
      globalSpace,
      "google_drive",
      "personal_actions"
    );
    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        adminAuth,
        server.id,
        { mode: "metadata" }
      );
    expect(systemView).not.toBeNull();
    const updated = await systemView!.updateOAuthUseCase(
      adminAuth,
      "platform_actions"
    );
    expect(updated.isOk()).toBe(true);

    const workspaceConnection = await MCPServerConnectionFactory.internal(
      adminAuth,
      server.id,
      "workspace"
    );
    const personalConnection = await MCPServerConnectionFactory.internal(
      memberAuth,
      server.id,
      "personal"
    );

    const response = await postPickerToken(workspace, server.id);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.accessToken).toBe(ACCESS_TOKEN);
    expect(mocks.getAccessToken).toHaveBeenCalledTimes(1);
    expect(mocks.getAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: personalConnection.connectionId })
    );
    expect(mocks.getAccessToken).not.toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: workspaceConnection.connectionId,
      })
    );
  });
});
