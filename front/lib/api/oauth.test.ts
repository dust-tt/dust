import { createHmac } from "node:crypto";
import config from "@app/lib/api/config";
import {
  createConnectionAndGetSetupUrl,
  finalizeConnection,
} from "@app/lib/api/oauth";
import {
  hashOAuthFinalizeNonce,
  OAUTH_FINALIZE_NONCE_METADATA_KEY,
} from "@app/lib/api/oauth/finalize_binding";
import { GithubOAuthProvider } from "@app/lib/api/oauth/providers/github";
import { Authenticator } from "@app/lib/auth";
import { GroupPermissions } from "@app/lib/resources/group_permission_registry";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerConnectionFactory } from "@app/tests/utils/MCPServerConnectionFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { OAuthConnectionType } from "@app/types/oauth/lib";
import { Err, Ok } from "@app/types/shared/result";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConnectionMetadata: vi.fn(),
  getCredentials: vi.fn(),
  finalizeConnection: vi.fn(),
  createConnection: vi.fn(),
}));

vi.mock("@app/types/oauth/oauth_api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/types/oauth/oauth_api")>();
  return {
    ...actual,
    OAuthAPI: vi.fn().mockImplementation(function OAuthAPIMock() {
      return {
        getConnectionMetadata: mocks.getConnectionMetadata,
        getCredentials: mocks.getCredentials,
        finalizeConnection: mocks.finalizeConnection,
        createConnection: mocks.createConnection,
      };
    }),
  };
});

vi.mock("@app/lib/api/audit/workos_audit", () => ({
  buildAuditLogTarget: vi.fn(() => ({})),
  emitAuditLogEvent: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

function pendingConnection({
  connectionId = "con_test-secret",
  userId,
  workspaceId,
  finalizeNonce = "test-finalize-nonce-value-32chars!!",
  extraMetadata = {},
}: {
  connectionId?: string;
  userId: string;
  workspaceId: string;
  finalizeNonce?: string;
  extraMetadata?: Record<string, string>;
}): { connection: OAuthConnectionType; finalizeNonce: string } {
  return {
    finalizeNonce,
    connection: {
      connection_id: connectionId,
      created: Date.now(),
      provider: "github",
      status: "pending",
      metadata: {
        user_id: userId,
        workspace_id: workspaceId,
        use_case: "connection",
        [OAUTH_FINALIZE_NONCE_METADATA_KEY]:
          hashOAuthFinalizeNonce(finalizeNonce),
        ...extraMetadata,
      },
      redirect_uri: "https://dust.tt/oauth/github/finalize",
    },
  };
}

describe("finalizeConnection", () => {
  beforeEach(() => {
    mocks.getConnectionMetadata.mockReset();
    mocks.finalizeConnection.mockReset();
  });

  it("returns an error instead of throwing when auth has no workspace", async () => {
    const user = await UserFactory.basic();
    const auth = new Authenticator({
      user,
      role: "none",
      permissions: GroupPermissions.empty(),
      workspace: null,
      subscription: null,
      authMethod: "session",
    });

    const res = await finalizeConnection(auth, "github", {});

    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error.code).toBe("connection_finalization_failed");
    }
    expect(mocks.finalizeConnection).not.toHaveBeenCalled();
  });

  it("rejects cross-user finalization before exchanging the code", async () => {
    const {
      authenticator: ownerAuth,
      workspace,
      user: owner,
    } = await createResourceTest({ role: "admin" });
    const attacker = await UserFactory.basic();
    await MembershipFactory.associate(workspace, attacker, { role: "user" });
    const attackerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      attacker.sId,
      workspace.sId
    );

    const { connection, finalizeNonce } = pendingConnection({
      userId: owner.sId,
      workspaceId: workspace.sId,
    });
    mocks.getConnectionMetadata.mockResolvedValue(new Ok({ connection }));

    const res = await finalizeConnection(
      attackerAuth,
      "github",
      { code: "victim-code", state: connection.connection_id },
      {
        sessionWorkspaceId: workspace.sId,
        finalizeNonce,
      }
    );

    expect(ownerAuth.user()?.sId).toBe(owner.sId);
    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error.code).toBe("connection_ownership_mismatch");
    }
    expect(mocks.finalizeConnection).not.toHaveBeenCalled();
  });

  it("rejects cross-workspace finalization before exchanging the code", async () => {
    const { user, workspace: ownerWorkspace } = await createResourceTest({
      role: "admin",
    });
    const otherWorkspace = await WorkspaceFactory.basic();
    await MembershipFactory.associate(otherWorkspace, user, { role: "admin" });
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      otherWorkspace.sId
    );

    const { connection, finalizeNonce } = pendingConnection({
      userId: user.sId,
      workspaceId: ownerWorkspace.sId,
    });
    mocks.getConnectionMetadata.mockResolvedValue(new Ok({ connection }));

    const res = await finalizeConnection(
      otherAuth,
      "github",
      { code: "auth-code", state: connection.connection_id },
      {
        sessionWorkspaceId: otherWorkspace.sId,
        finalizeNonce,
      }
    );

    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error.code).toBe("connection_ownership_mismatch");
    }
    expect(mocks.finalizeConnection).not.toHaveBeenCalled();
  });

  it("rejects finalize-nonce mismatch and missing cookie (replay/state mismatch)", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "admin",
    });

    const { connection } = pendingConnection({
      userId: user.sId,
      workspaceId: workspace.sId,
    });
    mocks.getConnectionMetadata.mockResolvedValue(new Ok({ connection }));

    const missingNonce = await finalizeConnection(
      authenticator,
      "github",
      { code: "auth-code", state: connection.connection_id },
      { sessionWorkspaceId: workspace.sId }
    );
    expect(missingNonce.isErr()).toBe(true);
    if (missingNonce.isErr()) {
      expect(missingNonce.error.code).toBe("connection_ownership_mismatch");
    }

    const wrongNonce = await finalizeConnection(
      authenticator,
      "github",
      { code: "auth-code", state: connection.connection_id },
      {
        sessionWorkspaceId: workspace.sId,
        finalizeNonce: "different-nonce-value-xxxxxxxxxxxx",
      }
    );
    expect(wrongNonce.isErr()).toBe(true);
    if (wrongNonce.isErr()) {
      expect(wrongNonce.error.code).toBe("connection_ownership_mismatch");
    }

    expect(mocks.finalizeConnection).not.toHaveBeenCalled();
  });

  it("allows finalize when ownership and nonce match, including cross-region null workspace", async () => {
    const { user, workspace } = await createResourceTest({ role: "admin" });
    const finalizeNonce = "matching-finalize-nonce-value-ok!";

    const { connection } = pendingConnection({
      userId: user.sId,
      workspaceId: workspace.sId,
      finalizeNonce,
    });
    const finalized = { ...connection, status: "finalized" as const };

    mocks.getConnectionMetadata.mockResolvedValue(new Ok({ connection }));
    mocks.finalizeConnection.mockResolvedValue(
      new Ok({ connection: finalized })
    );

    // Cross-region: session user is known, local workspace row is missing.
    const auth = new Authenticator({
      user,
      role: "none",
      permissions: GroupPermissions.empty(),
      workspace: null,
      subscription: null,
      authMethod: "session",
    });

    const res = await finalizeConnection(
      auth,
      "github",
      { code: "auth-code", state: connection.connection_id },
      {
        sessionWorkspaceId: workspace.sId,
        finalizeNonce,
      }
    );

    expect(res.isOk()).toBe(true);
    if (res.isOk()) {
      expect(res.value.metadata).not.toHaveProperty(
        OAUTH_FINALIZE_NONCE_METADATA_KEY
      );
    }
    expect(mocks.finalizeConnection).toHaveBeenCalledOnce();
  });

  it("fails closed when auth is null even if a nonce is presented", async () => {
    const { connection, finalizeNonce } = pendingConnection({
      userId: "user_owner",
      workspaceId: "ws_owner",
    });
    mocks.getConnectionMetadata.mockResolvedValue(new Ok({ connection }));

    const res = await finalizeConnection(
      null,
      "github",
      { code: "auth-code", state: connection.connection_id },
      {
        sessionWorkspaceId: "ws_owner",
        finalizeNonce,
      }
    );

    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error.code).toBe("connection_ownership_mismatch");
    }
    expect(mocks.finalizeConnection).not.toHaveBeenCalled();
  });
});

describe("createConnectionAndGetSetupUrl", () => {
  beforeEach(() => {
    mocks.createConnection.mockReset();
    vi.restoreAllMocks();
  });

  it("stamps finalize_nonce_hash and keeps identity over extraConfig overrides", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "admin",
    });

    // Bypass provider extraConfig shape checks so we can assert identity wins
    // over a malicious client-supplied user_id / workspace_id / finalize_nonce_hash.
    vi.spyOn(
      GithubOAuthProvider.prototype,
      "isExtraConfigValid"
    ).mockReturnValue(true);
    vi.spyOn(GithubOAuthProvider.prototype, "setupUri").mockReturnValue(
      "https://github.com/apps/dust/installations/new?state=con_created-secret"
    );

    mocks.createConnection.mockImplementation(
      ({ metadata }: { metadata: Record<string, unknown> }) =>
        new Ok({
          connection: {
            connection_id: "con_created-secret",
            created: Date.now(),
            provider: "github",
            status: "pending",
            metadata,
            redirect_uri: "https://dust.tt/oauth/github/finalize",
          },
        })
    );

    const res = await createConnectionAndGetSetupUrl(
      authenticator,
      "github",
      "connection",
      {
        user_id: "user_attacker",
        workspace_id: "ws_attacker",
        finalize_nonce_hash: "attacker-nonce",
      }
    );

    expect(res.isOk()).toBe(true);
    if (!res.isOk()) {
      return;
    }

    expect(res.value.connectionId).toBe("con_created-secret");
    expect(res.value.finalizeNonce).toBeTruthy();
    expect(res.value.setupUrl).toContain("con_created-secret");

    const createdMetadata = mocks.createConnection.mock.calls[0][0].metadata;
    expect(createdMetadata.user_id).toBe(user.sId);
    expect(createdMetadata.workspace_id).toBe(workspace.sId);
    expect(createdMetadata[OAUTH_FINALIZE_NONCE_METADATA_KEY]).toBe(
      hashOAuthFinalizeNonce(res.value.finalizeNonce)
    );
    expect(createdMetadata[OAUTH_FINALIZE_NONCE_METADATA_KEY]).not.toBe(
      res.value.finalizeNonce
    );
    expect(createdMetadata[OAUTH_FINALIZE_NONCE_METADATA_KEY]).not.toBe(
      "attacker-nonce"
    );
  });
});

function shopifyConnection(): OAuthConnectionType {
  return {
    connection_id: "con_shopify",
    created: 0,
    provider: "shopify",
    status: "pending",
    related_credential_id: "cred_shopify",
    redirect_uri: "https://dust.tt/oauth/shopify/finalize",
    metadata: {
      client_id: "shopify-client",
      shopify_store_domain: "my-store.myshopify.com",
    },
  };
}

function shopifyCallback(clientSecret = "shopify-secret") {
  const query = {
    code: "authorization-code",
    shop: "my-store.myshopify.com",
    state: "con_shopify",
    timestamp: "1787654321",
  };
  const message = Object.entries(query)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return {
    ...query,
    hmac: createHmac("sha256", clientSecret).update(message).digest("hex"),
  };
}

describe("Shopify OAuth setup", () => {
  beforeEach(() => {
    mocks.createConnection.mockReset();
    mocks.getConnectionMetadata.mockReset();
  });

  it("stores app secrets only in the related credential on first connect", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "admin",
    });
    const server = await RemoteMCPServerFactory.create(workspace);
    const createConnection = mocks.createConnection.mockResolvedValue(
      new Ok({ connection: shopifyConnection() })
    );

    const res = await createConnectionAndGetSetupUrl(
      authenticator,
      "shopify",
      "platform_actions",
      {
        mcp_server_id: server.sId,
        shopify_store_domain: " MY-STORE.MYSHOPIFY.COM ",
        client_id: "shopify-client",
        client_secret: "shopify-secret",
      }
    );

    expect(res.isOk()).toBe(true);
    if (res.isOk()) {
      expect(new URL(res.value.setupUrl).searchParams.get("client_id")).toBe(
        "shopify-client"
      );
      expect(new URL(res.value.setupUrl).origin).toBe(
        "https://my-store.myshopify.com"
      );
      expect(res.value.setupUrl).not.toContain("shopify-secret");
    }
    expect(createConnection).toHaveBeenCalledExactlyOnceWith({
      provider: "shopify",
      redirectUri: `${config.getAppUrl()}/oauth/shopify/finalize`,
      metadata: {
        workspace_id: workspace.sId,
        user_id: authenticator.getNonNullableUser().sId,
        use_case: "platform_actions",
        [OAUTH_FINALIZE_NONCE_METADATA_KEY]: expect.any(String),
        client_id: "shopify-client",
        shopify_store_domain: "my-store.myshopify.com",
      },
      relatedCredential: {
        content: {
          client_id: "shopify-client",
          client_secret: "shopify-secret",
        },
        metadata: {
          workspace_id: workspace.sId,
          user_id: authenticator.getNonNullableUser().sId,
        },
      },
    });
  });

  it("reuses the saved app, store and callback when reconnecting", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "admin",
    });
    const server = await RemoteMCPServerFactory.create(workspace);
    const workspaceConnection = await MCPServerConnectionFactory.remote(
      authenticator,
      server,
      "workspace"
    );
    const connection = {
      ...shopifyConnection(),
      connection_id: workspaceConnection.connectionId ?? "",
    };
    mocks.getConnectionMetadata.mockResolvedValue(new Ok({ connection }));
    const createConnection = mocks.createConnection.mockResolvedValue(
      new Ok({ connection: shopifyConnection() })
    );

    const res = await createConnectionAndGetSetupUrl(
      authenticator,
      "shopify",
      "platform_actions",
      {
        mcp_server_id: server.sId,
        client_id: "other-client",
        client_secret: "other-secret",
        shopify_store_domain: "other-store.myshopify.com",
        redirect_uri: "https://untrusted.example.com/callback",
      }
    );

    expect(res.isOk()).toBe(true);
    if (res.isOk()) {
      const url = new URL(res.value.setupUrl);
      expect(url.origin).toBe("https://my-store.myshopify.com");
      expect(url.searchParams.get("client_id")).toBe("shopify-client");
      expect(url.searchParams.get("redirect_uri")).toBe(
        connection.redirect_uri
      );
    }
    expect(createConnection).toHaveBeenCalledExactlyOnceWith({
      provider: "shopify",
      redirectUri: connection.redirect_uri,
      metadata: {
        workspace_id: workspace.sId,
        user_id: authenticator.getNonNullableUser().sId,
        use_case: "platform_actions",
        [OAUTH_FINALIZE_NONCE_METADATA_KEY]: expect.any(String),
        client_id: "shopify-client",
        shopify_store_domain: "my-store.myshopify.com",
      },
      relatedCredential: {
        content: { from_connection_id: connection.connection_id },
        metadata: {
          workspace_id: workspace.sId,
          user_id: authenticator.getNonNullableUser().sId,
        },
      },
    });
  });

  it.each(["credential lookup failure", "legacy shared app"])(
    "does not fall back to caller credentials for %s when reconnecting",
    async (failure) => {
      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });
      const server = await RemoteMCPServerFactory.create(workspace);
      await MCPServerConnectionFactory.remote(
        authenticator,
        server,
        "workspace"
      );
      mocks.getConnectionMetadata.mockResolvedValue(
        failure === "credential lookup failure"
          ? new Err({
              code: "internal_server_error",
              message: "OAuth unavailable",
            })
          : new Ok({
              connection: {
                ...shopifyConnection(),
                related_credential_id: null,
              },
            })
      );
      const createConnection = mocks.createConnection;

      const res = await createConnectionAndGetSetupUrl(
        authenticator,
        "shopify",
        "platform_actions",
        {
          mcp_server_id: server.sId,
          client_id: "other-client",
          client_secret: "other-secret",
          shopify_store_domain: "other-store.myshopify.com",
        }
      );

      expect(res.isErr()).toBe(true);
      expect(createConnection).not.toHaveBeenCalled();
    }
  );
});

describe("Shopify OAuth finalization", () => {
  beforeEach(() => {
    mocks.getConnectionMetadata.mockReset();
    mocks.getCredentials.mockReset();
    mocks.finalizeConnection.mockReset();
  });

  async function mockOAuthAPI(connection = shopifyConnection()) {
    const { authenticator, user, workspace } = await createResourceTest({
      role: "admin",
    });
    const finalizeNonce = "shopify-finalize-nonce-value-32chars";
    connection.metadata = {
      ...connection.metadata,
      user_id: user.sId,
      workspace_id: workspace.sId,
      [OAUTH_FINALIZE_NONCE_METADATA_KEY]:
        hashOAuthFinalizeNonce(finalizeNonce),
    };
    mocks.getConnectionMetadata.mockResolvedValue(new Ok({ connection }));
    const getCredentials = mocks.getCredentials.mockResolvedValue(
      new Ok({
        credential: {
          credential_id: "cred_shopify",
          created: Date.now(),
          provider: "shopify",
          metadata: { workspace_id: "workspace", user_id: "user" },
          content: {
            client_id: "shopify-client",
            client_secret: "shopify-secret",
          },
        },
      })
    );
    const finalize = mocks.finalizeConnection.mockResolvedValue(
      new Ok({ connection: { ...connection, status: "finalized" } })
    );
    return {
      getCredentials,
      finalize,
      authenticator,
      connection,
      finalizeNonce,
    };
  }

  it("verifies the callback with the connection's secret before exchanging the code", async () => {
    const {
      getCredentials,
      finalize,
      authenticator,
      connection,
      finalizeNonce,
    } = await mockOAuthAPI();

    const res = await finalizeConnection(
      authenticator,
      "shopify",
      shopifyCallback(),
      { finalizeNonce }
    );

    expect(res.isOk()).toBe(true);
    expect(getCredentials).toHaveBeenCalledExactlyOnceWith({
      credentialsId: "cred_shopify",
    });
    expect(finalize).toHaveBeenCalledExactlyOnceWith({
      provider: "shopify",
      connection,
      code: "authorization-code",
    });
  });

  it.each([
    "wrong secret",
    "wrong store",
    "missing credential",
    "credential lookup failure",
  ])("rejects %s before exchanging the authorization code", async (failure) => {
    const connection = shopifyConnection();
    if (failure === "wrong store") {
      connection.metadata.shopify_store_domain = "other-store.myshopify.com";
    }
    if (failure === "missing credential") {
      connection.related_credential_id = null;
    }
    const { getCredentials, finalize, authenticator, finalizeNonce } =
      await mockOAuthAPI(connection);
    if (failure === "credential lookup failure") {
      getCredentials.mockResolvedValue(
        new Err({ code: "credential_not_found", message: "Not found" })
      );
    }

    const res = await finalizeConnection(
      authenticator,
      "shopify",
      shopifyCallback(
        failure === "wrong secret" ? "other-secret" : "shopify-secret"
      ),
      { finalizeNonce }
    );

    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error.code).toBe("connection_finalization_failed");
    }
    expect(finalize).not.toHaveBeenCalled();
  });
});
