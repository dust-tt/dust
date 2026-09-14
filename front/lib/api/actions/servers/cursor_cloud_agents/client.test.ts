import {
  CursorCloudAgentsClient,
  getCursorCloudAgentsClient,
} from "@app/lib/api/actions/servers/cursor_cloud_agents/client";
import { untrustedFetch } from "@app/lib/egress/server";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { Response } from "undici";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/egress/server", () => ({
  untrustedFetch: vi.fn(),
}));

const agent = {
  id: "bc-00000000-0000-0000-0000-000000000001",
  name: "Update README",
  status: "ACTIVE",
  env: { type: "cloud" },
  url: "https://cursor.com/agents/bc-00000000-0000-0000-0000-000000000001",
  createdAt: "2026-09-11T00:00:00.000Z",
  updatedAt: "2026-09-11T00:00:01.000Z",
};

const run = {
  id: "run-00000000-0000-0000-0000-000000000001",
  agentId: agent.id,
  status: "CREATING",
  createdAt: "2026-09-11T00:00:00.000Z",
  updatedAt: "2026-09-11T00:00:01.000Z",
};

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {}
) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

describe("CursorCloudAgentsClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("authenticates and creates a v1 agent with the requested repository", async () => {
    vi.mocked(untrustedFetch).mockResolvedValue(
      jsonResponse({ agent, run }, { status: 201 })
    );
    const client = new CursorCloudAgentsClient("cursor-api-key");

    const result = await client.createAgent({
      prompt: { text: "Update the README" },
      repos: [{ url: "https://github.com/dust-tt/dust", startingRef: "main" }],
      autoCreatePR: true,
    });

    expect(result.isOk()).toBe(true);
    expect(untrustedFetch).toHaveBeenCalledWith(
      "https://api.cursor.com/v1/agents",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer cursor-api-key",
        }),
        body: JSON.stringify({
          prompt: { text: "Update the README" },
          repos: [
            {
              url: "https://github.com/dust-tt/dust",
              startingRef: "main",
            },
          ],
          autoCreatePR: true,
        }),
      })
    );
  });

  it("encodes identifiers and pagination parameters", async () => {
    vi.mocked(untrustedFetch).mockResolvedValue(
      jsonResponse({ items: [run], nextCursor: "next-run" })
    );
    const client = new CursorCloudAgentsClient("cursor-api-key");

    const result = await client.listRuns("agent/id", {
      limit: 10,
      cursor: "previous cursor",
    });

    expect(result.isOk()).toBe(true);
    expect(untrustedFetch).toHaveBeenCalledWith(
      "https://api.cursor.com/v1/agents/agent%2Fid/runs?limit=10&cursor=previous+cursor",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("returns an actionable rate-limit error without exposing the API key", async () => {
    vi.mocked(untrustedFetch).mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "rate_limit_exceeded",
            message: "Too many requests.",
          },
        },
        { status: 429, headers: { "Retry-After": "60" } }
      )
    );
    const client = new CursorCloudAgentsClient("super-secret-cursor-key");

    const result = await client.listRepositories();

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected an error.");
    }
    expect(result.error.message).toContain("Retry after 60 seconds");
    expect(result.error.message).not.toContain("super-secret-cursor-key");
  });

  it("redacts the API key from transport errors that echo the request header", async () => {
    // `fetch` rejects a header value containing a newline and quotes the offending value back,
    // which puts the key itself in the thrown error's message.
    vi.mocked(untrustedFetch).mockRejectedValue(
      new Error(
        'Invalid header value: "Bearer super-secret-cursor-key\nX-Injected: 1"'
      )
    );
    const client = new CursorCloudAgentsClient(
      "super-secret-cursor-key\nX-Injected: 1"
    );

    const result = await client.listModels();

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected an error.");
    }
    expect(result.error.message).not.toContain("super-secret-cursor-key");
    expect(result.error.message).toContain("[redacted]");
  });

  it("redacts the API key echoed back in an upstream error body", async () => {
    vi.mocked(untrustedFetch).mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "invalid_api_key",
            message: "The key super-secret-cursor-key is not valid.",
          },
        },
        { status: 401 }
      )
    );
    const client = new CursorCloudAgentsClient("super-secret-cursor-key");

    const result = await client.listModels();

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected an error.");
    }
    expect(result.error.message).toContain("invalid_api_key");
    expect(result.error.message).not.toContain("super-secret-cursor-key");
  });

  it("reports a non-JSON upstream error body without crashing", async () => {
    vi.mocked(untrustedFetch).mockResolvedValue(
      new Response("<html>502 Bad Gateway</html>", {
        status: 502,
        headers: { "Content-Type": "text/html" },
      })
    );
    const client = new CursorCloudAgentsClient("cursor-api-key");

    const result = await client.listModels();

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected an error.");
    }
    expect(result.error.message).toContain("502");
    expect(result.error.message).toContain("Bad Gateway");
  });

  it("reports an object-valued upstream error message without rendering [object Object]", async () => {
    vi.mocked(untrustedFetch).mockResolvedValue(
      jsonResponse(
        { error: { message: { nested: "unexpected shape" } } },
        { status: 400 }
      )
    );
    const client = new CursorCloudAgentsClient("cursor-api-key");

    const result = await client.listModels();

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected an error.");
    }
    expect(result.error.message).not.toContain("[object Object]");
  });

  it("accepts agent and run statuses missing from Cursor's published enums", async () => {
    vi.mocked(untrustedFetch).mockResolvedValue(
      jsonResponse({
        items: [
          { ...agent, status: "IDLE" },
          { ...agent, id: "bc-2", status: "SOME_FUTURE_STATUS" },
        ],
      })
    );
    const client = new CursorCloudAgentsClient("cursor-api-key");

    const result = await client.listAgents({});

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value.items.map((item) => item.status)).toEqual([
      "IDLE",
      "SOME_FUTURE_STATUS",
    ]);
  });

  it("rejects invalid Cursor responses", async () => {
    vi.mocked(untrustedFetch).mockResolvedValue(jsonResponse({ agents: [] }));
    const client = new CursorCloudAgentsClient("cursor-api-key");

    const result = await client.listAgents({});

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected an error.");
    }
    expect(result.error.message).toBe(
      "Cursor returned an invalid API response."
    );
  });
});

describe("getCursorCloudAgentsClient", () => {
  it("requires a configured API key", () => {
    expect(getCursorCloudAgentsClient(undefined).isErr()).toBe(true);
  });

  it("accepts the bearer token configured on the MCP server", () => {
    const authInfo: AuthInfo = {
      token: "cursor-api-key",
      clientId: "",
      scopes: [],
    };

    expect(getCursorCloudAgentsClient(authInfo).isOk()).toBe(true);
  });
});
