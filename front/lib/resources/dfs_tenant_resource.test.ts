import { DfsTenantModel } from "@app/lib/models/dfs_tenant";
import { DfsTenantResource } from "@app/lib/resources/dfs_tenant_resource";
import { FakeOAuthCredentials } from "@app/tests/utils/dfs/FakeOAuthCredentials";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { beforeEach, describe, expect, it, vi } from "vitest";

const oauth = vi.hoisted(() => ({ fake: null as FakeOAuthCredentials | null }));

vi.mock("@app/types/oauth/oauth_api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/types/oauth/oauth_api")>();
  return {
    ...actual,
    OAuthAPI: vi.fn().mockImplementation(function () {
      return oauth.fake;
    }),
  };
});

beforeEach(() => {
  oauth.fake = new FakeOAuthCredentials();
});

function fakeOAuth(): FakeOAuthCredentials {
  if (!oauth.fake) {
    throw new Error("The fake oauth service is set up in beforeEach.");
  }
  return oauth.fake;
}

const ROOT_ID = "0190c3a0b1c27d4e8f0a1b2c3d4e5f60";
const TENANT_KEY = "t".repeat(64);

describe("DfsTenantResource", () => {
  it("stores the tenant key in oauth and the root id in front", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "admin",
    });

    const created = await DfsTenantResource.makeNew(authenticator, {
      tenantKey: TENANT_KEY,
      rootId: ROOT_ID,
    });

    expect(created.isOk()).toBe(true);
    const row = await DfsTenantModel.findOne({
      where: { workspaceId: workspace.id },
    });
    expect(row?.rootId).toBe(ROOT_ID);
    expect(JSON.stringify(row?.get())).not.toContain(TENANT_KEY);
    expect([...fakeOAuth().credentials.values()]).toEqual([
      {
        provider: "dfs",
        workspaceId: workspace.sId,
        userId: user.sId,
        content: { tenant_key: TENANT_KEY },
      },
    ]);

    const tenant = await DfsTenantResource.fetchByWorkspace(authenticator);
    const key = await tenant?.getTenantKey(authenticator);
    expect(key?.isOk() && key.value).toBe(TENANT_KEY);
  });

  it("is scoped to the authenticated workspace", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const { authenticator: otherAuth } = await createResourceTest({
      role: "admin",
    });
    await DfsTenantResource.makeNew(authenticator, {
      tenantKey: TENANT_KEY,
      rootId: ROOT_ID,
    });

    expect(await DfsTenantResource.fetchByWorkspace(otherAuth)).toBeNull();
    const tenant = await DfsTenantResource.fetchByWorkspace(authenticator);
    await expect(tenant?.getTenantKey(otherAuth)).rejects.toThrow();
  });

  it("stores nothing when oauth fails", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    fakeOAuth().postError = { code: "internal_server_error", message: "down" };

    const created = await DfsTenantResource.makeNew(authenticator, {
      tenantKey: TENANT_KEY,
      rootId: ROOT_ID,
    });

    expect(created.isErr()).toBe(true);
    expect(await DfsTenantResource.fetchByWorkspace(authenticator)).toBeNull();
  });

  it("allows a single tenant per workspace, without leaking a credential", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    await DfsTenantResource.makeNew(authenticator, {
      tenantKey: TENANT_KEY,
      rootId: ROOT_ID,
    });

    await expect(
      DfsTenantResource.makeNew(authenticator, {
        tenantKey: TENANT_KEY,
        rootId: ROOT_ID,
      })
    ).rejects.toThrow();
    expect(fakeOAuth().credentials.size).toBe(1);
  });

  it("deletes the tenant of a workspace and its credential", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    await DfsTenantResource.makeNew(authenticator, {
      tenantKey: TENANT_KEY,
      rootId: ROOT_ID,
    });

    await DfsTenantResource.deleteAllForWorkspace(authenticator);

    expect(await DfsTenantResource.fetchByWorkspace(authenticator)).toBeNull();
    expect(fakeOAuth().credentials.size).toBe(0);
  });
});
