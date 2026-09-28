import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Err } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  staticIPAgent: { kind: "static-ip" },
  untrustedAgent: { kind: "untrusted" },
  undiciFetch: vi.fn(),
  discoverAuthorizationServerMetadata: vi.fn(),
  discoverOAuthProtectedResourceMetadata: vi.fn(),
  registerClient: vi.fn(),
}));

// Skip the DNS lookup performed by the SSRF guard.
vi.mock("@app/lib/api/url_safety", () => ({
  validateExternalUrl: vi.fn(async () => null),
}));

// Force the endpoint past the direct (unauthenticated) connection attempt into OAuth discovery.
vi.mock("@app/lib/actions/mcp_metadata", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/actions/mcp_metadata")>();

  return {
    ...actual,
    connectToMCPServer: vi.fn(
      async () => new Err(new Error("Unauthorized (401)"))
    ),
  };
});

vi.mock("@app/lib/egress/server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/egress/server")>();

  return {
    ...actual,
    getStaticIPProxyAgent: () => mocks.staticIPAgent,
    getUntrustedEgressAgent: () => mocks.untrustedAgent,
  };
});

vi.mock("undici", async (importOriginal) => {
  const actual = await importOriginal<typeof import("undici")>();

  return {
    ...actual,
    fetch: mocks.undiciFetch,
  };
});

vi.mock("@app/lib/api/workos/organization_primitives", async () => {
  const actual = await vi.importActual(
    "@app/lib/api/workos/organization_primitives"
  );
  return {
    ...actual,
    listWorkOSOrganizationsWithDomain: vi.fn().mockResolvedValue([]),
  };
});

vi.mock("@modelcontextprotocol/sdk/client/auth.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@modelcontextprotocol/sdk/client/auth.js")
    >();

  return {
    ...actual,
    discoverAuthorizationServerMetadata:
      mocks.discoverAuthorizationServerMetadata,
    discoverOAuthProtectedResourceMetadata:
      mocks.discoverOAuthProtectedResourceMetadata,
    registerClient: mocks.registerClient,
  };
});

async function verifyDomain(workspace: WorkspaceType, domain: string) {
  const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
  const res = await workspaceResource?.upsertWorkspaceDomain({ domain });
  if (!res?.isOk()) {
    throw new Error(`Failed to verify domain ${domain} for test setup`);
  }
}

function uniqueDomain(): string {
  return `${generateRandomModelSId().replaceAll("_", "-").toLowerCase()}.example.com`;
}

function postDiscover(wId: string, body: unknown) {
  return honoApp.request(`/api/w/${wId}/mcp/discover_oauth_metadata`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/w/:wId/mcp/discover_oauth_metadata", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // MCPOAuthProvider refuses to build client metadata from a non-HTTPS base URL.
    vi.stubEnv(
      "NEXT_PUBLIC_DUST_STATIC_WEBSITE_URL",
      "https://dust.example.com"
    );

    mocks.undiciFetch.mockImplementation(
      async () => new Response("{}", { status: 200 })
    );
    // Exercise the fetch function handed to the SDK so we observe the dispatcher it uses.
    mocks.discoverOAuthProtectedResourceMetadata.mockImplementation(
      async (serverUrl: string, _opts: unknown, fetchFn: typeof fetch) => {
        await fetchFn(serverUrl);
        return {
          authorization_servers: [new URL("/", serverUrl).toString()],
          resource: serverUrl,
        };
      }
    );
    mocks.discoverAuthorizationServerMetadata.mockResolvedValue({
      authorization_endpoint: "https://auth.example.com/authorize",
      registration_endpoint: "https://auth.example.com/register",
      token_endpoint: "https://auth.example.com/token",
    });
    mocks.registerClient.mockResolvedValue({
      client_id: "registered-client",
    });
  });

  it("routes discovery through the static IP proxy for a domain verified by the caller's workspace", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });
    const domain = uniqueDomain();
    await verifyDomain(workspace, domain);
    const url = `https://mcp.${domain}/mcp`;

    const response = await postDiscover(workspace.sId, { url });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { oauthRequired: boolean };
    expect(body.oauthRequired).toBe(true);
    expect(mocks.undiciFetch).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ dispatcher: mocks.staticIPAgent })
    );
  });

  it("routes discovery through the untrusted egress proxy for a domain verified only by another workspace", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });
    const otherWorkspace = await WorkspaceFactory.basic();
    const domain = uniqueDomain();
    await verifyDomain(otherWorkspace, domain);
    const url = `https://mcp.${domain}/mcp`;

    const response = await postDiscover(workspace.sId, { url });

    expect(response.status).toBe(200);
    expect(mocks.undiciFetch).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ dispatcher: mocks.untrustedAgent })
    );
    expect(mocks.undiciFetch).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ dispatcher: mocks.staticIPAgent })
    );
  });
});
