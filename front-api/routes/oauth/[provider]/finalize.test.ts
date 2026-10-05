import {
  hashOAuthFinalizeNonce,
  OAUTH_FINALIZE_NONCE_METADATA_KEY,
  oauthFinalizeNonceCookieName,
} from "@app/lib/api/oauth/finalize_binding";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { OAuthConnectionType } from "@app/types/oauth/lib";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConnectionMetadata: vi.fn(),
  finalizeConnection: vi.fn(),
}));

vi.mock("@app/types/oauth/oauth_api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/types/oauth/oauth_api")>();
  return {
    ...actual,
    OAuthAPI: vi.fn().mockImplementation(function OAuthAPIMock() {
      return {
        getConnectionMetadata: mocks.getConnectionMetadata,
        finalizeConnection: mocks.finalizeConnection,
      };
    }),
  };
});

vi.mock("@app/lib/api/audit/workos_audit", () => ({
  buildAuditLogTarget: vi.fn(() => ({})),
  emitAuditLogEvent: vi.fn(),
}));

function pendingConnection({
  userId,
  workspaceId,
  finalizeNonce,
}: {
  userId: string;
  workspaceId: string;
  finalizeNonce: string;
}): OAuthConnectionType {
  return {
    connection_id: "con_finalize-secret",
    created: Date.now(),
    provider: "github",
    status: "pending",
    metadata: {
      user_id: userId,
      workspace_id: workspaceId,
      use_case: "connection",
      [OAUTH_FINALIZE_NONCE_METADATA_KEY]:
        hashOAuthFinalizeNonce(finalizeNonce),
    },
    redirect_uri: "https://dust.tt/oauth/github/finalize",
  };
}

describe("GET /api/oauth/:provider/finalize", () => {
  beforeEach(() => {
    mocks.getConnectionMetadata.mockReset();
    mocks.finalizeConnection.mockReset();
  });

  it("returns 403 and does not exchange the code for a cross-user callback", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const finalizeNonce = "route-finalize-nonce-value-ok!!";
    // Connection owned by a different Dust user than the authenticated session.
    const connection = pendingConnection({
      userId: "user_other_owner",
      workspaceId: workspace.sId,
      finalizeNonce,
    });
    mocks.getConnectionMetadata.mockResolvedValue(new Ok({ connection }));

    const cookieName = oauthFinalizeNonceCookieName(connection.connection_id);
    const response = await honoApp.request(
      `/api/oauth/github/finalize?code=stolen-code&state=${connection.connection_id}`,
      {
        headers: {
          Cookie: `${cookieName}=${finalizeNonce}`,
        },
      }
    );

    expect(user.sId).not.toBe("user_other_owner");
    expect(response.status).toBe(403);
    expect(mocks.finalizeConnection).not.toHaveBeenCalled();
  });

  it("returns 403 when the finalize nonce cookie is missing (replay/state mismatch)", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });
    const finalizeNonce = "route-finalize-nonce-value-ok!!";
    const connection = pendingConnection({
      userId: user.sId,
      workspaceId: workspace.sId,
      finalizeNonce,
    });
    mocks.getConnectionMetadata.mockResolvedValue(new Ok({ connection }));

    const response = await honoApp.request(
      `/api/oauth/github/finalize?code=auth-code&state=${connection.connection_id}`
    );

    expect(response.status).toBe(403);
    expect(mocks.finalizeConnection).not.toHaveBeenCalled();
  });

  it("finalizes and clears the nonce cookie when ownership and nonce match", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });
    const finalizeNonce = "route-finalize-nonce-value-ok!!";
    const connection = pendingConnection({
      userId: user.sId,
      workspaceId: workspace.sId,
      finalizeNonce,
    });
    const finalized = { ...connection, status: "finalized" as const };
    mocks.getConnectionMetadata.mockResolvedValue(new Ok({ connection }));
    mocks.finalizeConnection.mockResolvedValue(
      new Ok({ connection: finalized })
    );

    const cookieName = oauthFinalizeNonceCookieName(connection.connection_id);
    const response = await honoApp.request(
      `/api/oauth/github/finalize?code=auth-code&state=${connection.connection_id}`,
      {
        headers: {
          Cookie: `${cookieName}=${finalizeNonce}`,
        },
      }
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      connection: OAuthConnectionType;
    };
    expect(body.connection.metadata).not.toHaveProperty(
      OAUTH_FINALIZE_NONCE_METADATA_KEY
    );
    expect(mocks.finalizeConnection).toHaveBeenCalledOnce();
    const setCookies = response.headers.getSetCookie();
    expect(
      setCookies.some(
        (c) => c.startsWith(`${cookieName}=`) && c.includes("Max-Age=0")
      )
    ).toBe(true);
  });
});
