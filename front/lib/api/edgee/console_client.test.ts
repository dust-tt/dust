import {
  checkEdgeeOrganizationAccess,
  createEdgeeGatewayApiKey,
  deleteEdgeeGatewayApiKey,
} from "@app/lib/api/edgee/console_client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTrustedFetch = vi.hoisted(() => vi.fn());

vi.mock("@app/lib/egress/server", () => ({
  trustedFetch: mockTrustedFetch,
}));

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Edgee console client", () => {
  beforeEach(() => {
    mockTrustedFetch.mockReset();
  });

  it("accepts an admin token that can list the organization's gateway keys", async () => {
    mockTrustedFetch.mockResolvedValue(jsonResponse(200, { data: [] }));

    const res = await checkEdgeeOrganizationAccess({
      adminToken: "pat",
      organizationId: "org_1",
    });

    expect(res.isOk()).toBe(true);
    const [url, init] = mockTrustedFetch.mock.calls[0];
    expect(url).toBe("https://api.edgee.app/v1/organizations/org_1/api_keys");
    expect(init.headers.Authorization).toBe("Bearer pat");
  });

  it("rejects an admin token that cannot reach the organization", async () => {
    mockTrustedFetch.mockResolvedValue(jsonResponse(403, {}));

    const res = await checkEdgeeOrganizationAccess({
      adminToken: "pat",
      organizationId: "org_1",
    });

    expect(res.isErr()).toBe(true);
  });

  it("creates a gateway key in the organization and returns its id and secret", async () => {
    mockTrustedFetch.mockResolvedValue(
      jsonResponse(200, { id: "key_1", key: "sk-edgee-1", active: true })
    );

    const res = await createEdgeeGatewayApiKey({
      adminToken: "pat",
      organizationId: "org_1",
      name: "dust:w1:u1",
      email: "user@example.com",
    });

    expect(res.isOk() && res.value).toEqual({
      apiKeyId: "key_1",
      apiKey: "sk-edgee-1",
    });
    const [url, init] = mockTrustedFetch.mock.calls[0];
    expect(url).toBe("https://api.edgee.app/v1/organizations/org_1/api_keys");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      name: "dust:w1:u1",
      type: "api",
      email: "user@example.com",
    });
  });

  it("returns an error, without the response body, when Edgee rejects the call", async () => {
    mockTrustedFetch.mockResolvedValue(
      jsonResponse(401, { error: "invalid token sk-leaked" })
    );

    const res = await createEdgeeGatewayApiKey({
      adminToken: "pat",
      organizationId: "org_1",
      name: "dust:w1:u1",
      email: null,
    });

    expect(res.isErr()).toBe(true);
    expect(res.isErr() && res.error.message).toContain("401");
    expect(res.isErr() && res.error.message).not.toContain("sk-leaked");
  });

  it("deletes a gateway key by id", async () => {
    mockTrustedFetch.mockResolvedValue(new Response(null, { status: 204 }));

    const res = await deleteEdgeeGatewayApiKey({
      adminToken: "pat",
      organizationId: "org_1",
      apiKeyId: "key_1",
    });

    expect(res.isOk()).toBe(true);
    const [url, init] = mockTrustedFetch.mock.calls[0];
    expect(url).toBe(
      "https://api.edgee.app/v1/organizations/org_1/api_keys/key_1"
    );
    expect(init.method).toBe("DELETE");
  });
});
