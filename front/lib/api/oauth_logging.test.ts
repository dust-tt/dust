import { createConnectionAndGetSetupUrl } from "@app/lib/api/oauth";
import logger from "@app/logger/logger";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OAuth setup validation logging", () => {
  it("logs only configuration keys when initial validation fails", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const logError = vi.spyOn(logger, "error");
    const createConnection = vi.spyOn(OAuthAPI.prototype, "createConnection");

    const res = await createConnectionAndGetSetupUrl(
      authenticator,
      "servicenow",
      "platform_actions",
      { client_secret: "test-client-secret" }
    );

    expect(res.isErr()).toBe(true);
    expect(createConnection).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledExactlyOnceWith(
      {
        provider: "servicenow",
        useCase: "platform_actions",
        extraConfigKeys: ["client_secret"],
      },
      "OAuth: Invalid extraConfig before getting related credential"
    );
  });

  it("logs only configuration keys when validation after credential retrieval fails", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "admin",
    });
    const server = await RemoteMCPServerFactory.create(workspace);
    const logError = vi.spyOn(logger, "error");
    const createConnection = vi.spyOn(OAuthAPI.prototype, "createConnection");

    // A first connect accepts the lookup key, then rejects the missing authorization endpoint.
    const res = await createConnectionAndGetSetupUrl(
      authenticator,
      "mcp",
      "platform_actions",
      {
        mcp_server_id: server.sId,
        client_id: "test-client-id",
        client_secret: "test-client-secret",
        token_endpoint: "https://oauth.example.com/token",
      }
    );

    expect(res.isErr()).toBe(true);
    expect(createConnection).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledExactlyOnceWith(
      {
        provider: "mcp",
        useCase: "platform_actions",
        extraConfigKeys: [
          "client_id",
          "token_endpoint",
          "code_challenge",
          "code_verifier",
          "use_static_ip_proxy",
        ],
      },
      "OAuth: Invalid extraConfig after getting related credential"
    );
  });
});
