import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/utils/rate_limiter", () => ({
  rateLimiter: vi.fn(),
}));

import { rateLimiter } from "@app/lib/utils/rate_limiter";

async function setup() {
  return createPrivateApiMockRequest({ method: "POST", role: "user" });
}

function postRegister(wId: string, body: unknown) {
  return honoApp.request(`/api/w/${wId}/mcp/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/w/:wId/mcp/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rateLimiter).mockResolvedValue(100);
  });

  it("returns a unique serverId and expiresAt on success", async () => {
    const { workspace } = await setup();

    const response = await postRegister(workspace.sId, {
      serverName: "my sidekick",
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      serverId: string;
      expiresAt: string;
    };
    expect(body.serverId).toMatch(
      /^mcp-client-side:my_sidekick\.[0-9a-f]{16}$/
    );
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("allocates distinct serverIds for concurrent registrations of the same name", async () => {
    const { workspace } = await setup();

    const [first, second] = await Promise.all([
      postRegister(workspace.sId, { serverName: "my sidekick" }),
      postRegister(workspace.sId, { serverName: "my sidekick" }),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstBody = (await first.json()) as { serverId: string };
    const secondBody = (await second.json()) as { serverId: string };
    expect(firstBody.serverId).not.toBe(secondBody.serverId);
  });

  it("returns 429 when rate limit is exhausted", async () => {
    const { workspace } = await setup();
    vi.mocked(rateLimiter).mockResolvedValue(0);

    const response = await postRegister(workspace.sId, {
      serverName: "my sidekick",
    });

    expect(response.status).toBe(429);
    const body = (await response.json()) as { error: { type: string } };
    expect(body.error.type).toBe("rate_limit_error");
  });

  it("returns 400 when serverName is too short", async () => {
    const { workspace } = await setup();

    const response = await postRegister(workspace.sId, { serverName: "abc" });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { type: string } };
    expect(body.error.type).toBe("invalid_request_error");
  });

  it("returns 400 when serverName is too long", async () => {
    const { workspace } = await setup();

    const response = await postRegister(workspace.sId, {
      serverName: "a".repeat(31),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { type: string } };
    expect(body.error.type).toBe("invalid_request_error");
  });

  it("returns 400 when serverName is missing", async () => {
    const { workspace } = await setup();

    const response = await postRegister(workspace.sId, {});

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { type: string } };
    expect(body.error.type).toBe("invalid_request_error");
  });
});
