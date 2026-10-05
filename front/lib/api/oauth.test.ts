import { createHmac } from "node:crypto";
import config from "@app/lib/api/config";
import {
  createConnectionAndGetSetupUrl,
  finalizeConnection,
} from "@app/lib/api/oauth";
import { Authenticator } from "@app/lib/auth";
import { GroupPermissions } from "@app/lib/resources/group_permission_registry";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerConnectionFactory } from "@app/tests/utils/MCPServerConnectionFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { OAuthConnectionType } from "@app/types/oauth/lib";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import { Err, Ok } from "@app/types/shared/result";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
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
  it("stores app secrets only in the related credential on first connect", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "admin",
    });
    const server = await RemoteMCPServerFactory.create(workspace);
    const createConnection = vi
      .spyOn(OAuthAPI.prototype, "createConnection")
      .mockResolvedValue(new Ok({ connection: shopifyConnection() }));

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
      expect(new URL(res.value).searchParams.get("client_id")).toBe(
        "shopify-client"
      );
      expect(new URL(res.value).origin).toBe("https://my-store.myshopify.com");
      expect(res.value).not.toContain("shopify-secret");
    }
    expect(createConnection).toHaveBeenCalledExactlyOnceWith({
      provider: "shopify",
      redirectUri: `${config.getAppUrl()}/oauth/shopify/finalize`,
      metadata: {
        workspace_id: workspace.sId,
        user_id: authenticator.getNonNullableUser().sId,
        use_case: "platform_actions",
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
    vi.spyOn(OAuthAPI.prototype, "getConnectionMetadata").mockResolvedValue(
      new Ok({ connection })
    );
    const createConnection = vi
      .spyOn(OAuthAPI.prototype, "createConnection")
      .mockResolvedValue(new Ok({ connection: shopifyConnection() }));

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
      const url = new URL(res.value);
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
      vi.spyOn(OAuthAPI.prototype, "getConnectionMetadata").mockResolvedValue(
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
      const createConnection = vi.spyOn(OAuthAPI.prototype, "createConnection");

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
  function mockOAuthAPI(connection = shopifyConnection()) {
    vi.spyOn(OAuthAPI.prototype, "getConnectionMetadata").mockResolvedValue(
      new Ok({ connection })
    );
    const getCredentials = vi
      .spyOn(OAuthAPI.prototype, "getCredentials")
      .mockResolvedValue(
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
    const finalize = vi
      .spyOn(OAuthAPI.prototype, "finalizeConnection")
      .mockResolvedValue(
        new Ok({ connection: { ...connection, status: "finalized" } })
      );
    return { getCredentials, finalize };
  }

  it("verifies the callback with the connection's secret before exchanging the code", async () => {
    const { getCredentials, finalize } = mockOAuthAPI();

    const res = await finalizeConnection(null, "shopify", shopifyCallback());

    expect(res.isOk()).toBe(true);
    expect(getCredentials).toHaveBeenCalledExactlyOnceWith({
      credentialsId: "cred_shopify",
    });
    expect(finalize).toHaveBeenCalledExactlyOnceWith({
      provider: "shopify",
      connection: shopifyConnection(),
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
    const { getCredentials, finalize } = mockOAuthAPI(connection);
    if (failure === "credential lookup failure") {
      getCredentials.mockResolvedValue(
        new Err({ code: "credential_not_found", message: "Not found" })
      );
    }

    const res = await finalizeConnection(
      null,
      "shopify",
      shopifyCallback(
        failure === "wrong secret" ? "other-secret" : "shopify-secret"
      )
    );

    expect(res.isErr()).toBe(true);
    expect(finalize).not.toHaveBeenCalled();
  });
});

describe("finalizeConnection", () => {
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
  });
});
