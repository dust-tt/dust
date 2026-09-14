import { freshenStaleClientMetadata } from "@app/lib/api/oauth/providers/mcp";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import type { MCPOAuthConnectionMetadataType } from "@app/types/api/oauth/providers/mcp";
import { Err, Ok } from "@app/types/shared/result";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({
  getAppUrl: vi.fn(),
  getDevOAuthRedirectBaseUrl: vi.fn(),
  getOAuthAPIConfig: vi.fn(),
}));

vi.mock("@app/lib/api/config", () => ({ default: config }));
vi.mock("@app/lib/actions/mcp_oauth_provider", () => ({
  MCPOAuthProvider: class {},
}));
vi.mock("@app/lib/actions/mcp_internal_actions/remote_servers", () => ({
  getDefaultRemoteMCPServerByURL: () => undefined,
}));

const CIMD_URL = "https://app.dust.tt/.well-known/oauth-client.json";

function metadata(
  overrides: Partial<MCPOAuthConnectionMetadataType>
): MCPOAuthConnectionMetadataType {
  return {
    client_id: "dcr-client-123",
    token_endpoint: "https://mcp.example.com/token",
    authorization_endpoint: "https://mcp.example.com/authorize",
    ...overrides,
  };
}

describe("freshenStaleClientMetadata", () => {
  beforeEach(() => {
    config.getAppUrl.mockReturnValue("https://app.dust.tt");
    config.getDevOAuthRedirectBaseUrl.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps a CIMD client untouched without discovery", async () => {
    const discover = vi.spyOn(RemoteMCPServerResource, "discoverOAuthMetadata");
    const stored = metadata({ client_id: CIMD_URL });
    const result = await freshenStaleClientMetadata({
      provider: "mcp",
      metadata: stored,
      serverUrl: "https://mcp.example.com/mcp",
    });
    expect(result).toBe(stored);
    expect(discover).not.toHaveBeenCalled();
  });

  it("keeps a client whose registered redirect matches the current finalize URI", async () => {
    const discover = vi.spyOn(RemoteMCPServerResource, "discoverOAuthMetadata");
    const stored = metadata({
      redirect_uri: "https://app.dust.tt/oauth/mcp/finalize",
    });
    const result = await freshenStaleClientMetadata({
      provider: "mcp",
      metadata: stored,
      serverUrl: "https://mcp.example.com/mcp",
    });
    expect(result).toBe(stored);
    expect(discover).not.toHaveBeenCalled();
  });

  it("replaces a stale client through discovery", async () => {
    const fresh = metadata({
      client_id: "dcr-client-456",
      redirect_uri: "https://app.dust.tt/oauth/mcp/finalize",
    });
    vi.spyOn(
      RemoteMCPServerResource,
      "discoverOAuthMetadata"
    ).mockResolvedValue(new Ok(fresh));
    const result = await freshenStaleClientMetadata({
      provider: "mcp",
      metadata: metadata({}),
      serverUrl: "https://mcp.example.com/mcp",
    });
    expect(result).toBe(fresh);
  });

  it("keeps the stored client when discovery fails", async () => {
    vi.spyOn(
      RemoteMCPServerResource,
      "discoverOAuthMetadata"
    ).mockResolvedValue(
      new Err({ code: "internal_error", message: "boom" } as never)
    );
    const stored = metadata({});
    const result = await freshenStaleClientMetadata({
      provider: "mcp",
      metadata: stored,
      serverUrl: "https://mcp.example.com/mcp",
    });
    expect(result).toBe(stored);
  });

  it("keeps the stored client when the fresh registration is confidential", async () => {
    vi.spyOn(
      RemoteMCPServerResource,
      "discoverOAuthMetadata"
    ).mockResolvedValue(
      new Ok(metadata({ client_id: "new", client_secret: "s3cret" }))
    );
    const stored = metadata({});
    const result = await freshenStaleClientMetadata({
      provider: "mcp",
      metadata: stored,
      serverUrl: "https://mcp.example.com/mcp",
    });
    expect(result).toBe(stored);
  });

  it("keeps the stored client when no server URL is known", async () => {
    const discover = vi.spyOn(RemoteMCPServerResource, "discoverOAuthMetadata");
    const stored = metadata({});
    const result = await freshenStaleClientMetadata({
      provider: "mcp",
      metadata: stored,
      serverUrl: undefined,
    });
    expect(result).toBe(stored);
    expect(discover).not.toHaveBeenCalled();
  });
});
