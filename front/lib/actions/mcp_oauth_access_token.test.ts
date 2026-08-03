import {
  getMCPConnectionAccessToken,
  resetMCPStaticIpProxyFreshnessCache,
} from "@app/lib/actions/mcp_oauth_access_token";
import { WorkspaceHasDomainModel } from "@app/lib/resources/storage/models/workspace_has_domain";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { OAuthConnectionType } from "@app/types/oauth/lib";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  getAccessToken: vi.fn(),
  getConnectionMetadata: vi.fn(),
  updateConnectionMetadata: vi.fn(),
}));

vi.mock("@app/lib/api/oauth_access_token", () => ({
  getOAuthConnectionAccessToken: mocks.getAccessToken,
}));

vi.mock("@app/types/oauth/oauth_api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/types/oauth/oauth_api")>();

  return {
    ...actual,
    OAuthAPI: vi.fn().mockImplementation(function OAuthAPIMock() {
      return {
        getConnectionMetadata: mocks.getConnectionMetadata,
        updateConnectionMetadata: mocks.updateConnectionMetadata,
      };
    }),
  };
});

function makeConnection(metadata: Record<string, string>): OAuthConnectionType {
  return {
    connection_id: "con_mcp",
    created: Date.now(),
    metadata,
    provider: "mcp",
    status: "finalized",
  };
}

function uniqueDomain(): string {
  return `${generateRandomModelSId().replaceAll("_", "-").toLowerCase()}.example.com`;
}

describe("getMCPConnectionAccessToken", () => {
  beforeEach(() => {
    resetMCPStaticIpProxyFreshnessCache();
    mocks.events.length = 0;
    mocks.getAccessToken.mockReset();
    mocks.getConnectionMetadata.mockReset();
    mocks.updateConnectionMetadata.mockReset();
  });

  it("syncs static IP metadata before fetching the token and TTL-gates repeated checks", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });

    const domain = uniqueDomain();
    await WorkspaceHasDomainModel.create({
      domain,
      workspaceId: workspace.id,
    });

    const connection = makeConnection({
      token_endpoint: `https://oauth.${domain}/token`,
      use_static_ip_proxy: "false",
    });

    mocks.getConnectionMetadata.mockImplementation(async () => {
      mocks.events.push("metadata");
      return new Ok({ connection });
    });
    mocks.updateConnectionMetadata.mockImplementation(async () => {
      mocks.events.push("update");
      return new Ok({ connection });
    });
    mocks.getAccessToken.mockImplementation(async () => {
      mocks.events.push("token");
      return new Ok({
        connection,
        access_token: "token",
        access_token_expiry: null,
        scrubbed_raw_json: {},
      });
    });

    const first = await getMCPConnectionAccessToken(authenticator, {
      connectionId: "con_mcp",
    });
    const second = await getMCPConnectionAccessToken(authenticator, {
      connectionId: "con_mcp",
    });

    expect(first.isOk()).toBe(true);
    expect(second.isOk()).toBe(true);
    expect(mocks.updateConnectionMetadata).toHaveBeenCalledWith({
      connectionId: "con_mcp",
      useStaticIpProxy: true,
    });
    expect(mocks.getConnectionMetadata).toHaveBeenCalledTimes(1);
    expect(mocks.getAccessToken).toHaveBeenCalledTimes(2);
    expect(mocks.events).toEqual(["metadata", "update", "token", "token"]);
  });
});
