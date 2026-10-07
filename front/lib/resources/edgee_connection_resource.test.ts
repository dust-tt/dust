import { ProviderCredentialModel } from "@app/lib/models/provider_credential";
import { EdgeeConnectionResource } from "@app/lib/resources/edgee_connection_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { InMemoryOAuthAPI } from "@app/tests/utils/mocks/in_memory_oauth_api";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCheckEdgeeOrganizationAccess = vi.hoisted(() => vi.fn());

vi.mock("@app/lib/api/edgee/console_client", () => ({
  checkEdgeeOrganizationAccess: mockCheckEdgeeOrganizationAccess,
}));

vi.mock("@app/types/oauth/oauth_api", async (importOriginal) => {
  const actual = await importOriginal<object>();
  const { InMemoryOAuthAPI } =
    await import("@app/tests/utils/mocks/in_memory_oauth_api");
  return { ...actual, OAuthAPI: InMemoryOAuthAPI };
});

describe("EdgeeConnectionResource", () => {
  beforeEach(() => {
    InMemoryOAuthAPI.reset();
    mockCheckEdgeeOrganizationAccess.mockReset();
    mockCheckEdgeeOrganizationAccess.mockResolvedValue(new Ok(undefined));
  });

  it("stores the admin token and organization once Edgee accepts them", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
      plan: "edgee",
    });

    const res = await EdgeeConnectionResource.upsert(authenticator, {
      adminToken: "pat-1",
      organizationId: "org_1",
    });

    assert(res.isOk(), "the connection should be saved");
    const connection = await EdgeeConnectionResource.fetch(authenticator);
    assert(connection, "the connection should be fetchable");
    expect(connection.organizationId).toBe("org_1");
    expect(connection.adminToken).toBe("pat-1");
    const row = await ProviderCredentialModel.findOne({
      where: { workspaceId: workspace.id, providerId: "edgee" },
    });
    expect(row).not.toBeNull();
  });

  it("stores nothing when Edgee refuses the admin token", async () => {
    mockCheckEdgeeOrganizationAccess.mockResolvedValue(
      new Err(new Error("status 403"))
    );
    const { authenticator } = await createResourceTest({
      role: "admin",
      plan: "edgee",
    });

    const res = await EdgeeConnectionResource.upsert(authenticator, {
      adminToken: "pat-1",
      organizationId: "org_1",
    });

    expect(res.isErr()).toBe(true);
    expect(await EdgeeConnectionResource.fetch(authenticator)).toBeNull();
    expect(InMemoryOAuthAPI.credentials.size).toBe(0);
  });

  it("replaces the stored token on update and deletes the previous secret", async () => {
    const { authenticator } = await createResourceTest({
      role: "admin",
      plan: "edgee",
    });
    await EdgeeConnectionResource.upsert(authenticator, {
      adminToken: "pat-1",
      organizationId: "org_1",
    });

    await EdgeeConnectionResource.upsert(authenticator, {
      adminToken: "pat-2",
      organizationId: "org_2",
    });

    const connection = await EdgeeConnectionResource.fetch(authenticator);
    expect(connection?.adminToken).toBe("pat-2");
    expect(connection?.organizationId).toBe("org_2");
    expect(InMemoryOAuthAPI.credentials.size).toBe(1);
  });

  it("refuses a non-admin", async () => {
    const { authenticator } = await createResourceTest({
      role: "user",
      plan: "edgee",
    });

    const res = await EdgeeConnectionResource.upsert(authenticator, {
      adminToken: "pat-1",
      organizationId: "org_1",
    });

    expect(res.isErr()).toBe(true);
  });

  it("refuses a workspace whose plan is not routed through Edgee", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    const res = await EdgeeConnectionResource.upsert(authenticator, {
      adminToken: "pat-1",
      organizationId: "org_1",
    });

    expect(res.isErr()).toBe(true);
    expect(await EdgeeConnectionResource.fetch(authenticator)).toBeNull();
  });

  it("never exposes the admin token when serialized", async () => {
    const { authenticator } = await createResourceTest({
      role: "admin",
      plan: "edgee",
    });
    await EdgeeConnectionResource.upsert(authenticator, {
      adminToken: "pat-secret-token",
      organizationId: "org_1",
    });

    const connection = await EdgeeConnectionResource.fetch(authenticator);

    expect(JSON.stringify(connection?.toJSON())).not.toContain(
      "pat-secret-token"
    );
  });
});
