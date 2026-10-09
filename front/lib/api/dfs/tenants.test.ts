// @vitest-environment node
import { createDfsTenant } from "@app/lib/api/dfs/tenants";
import { DfsClient } from "@app/lib/dfs/client";
import { DfsTenantResource } from "@app/lib/resources/dfs_tenant_resource";
import { DfsWireFactory } from "@app/tests/utils/dfs/DfsWireFactory";
import type { FakeDfsAnswer } from "@app/tests/utils/dfs/FakeDfsTransport";
import { FakeDfsTransport } from "@app/tests/utils/dfs/FakeDfsTransport";
import { FakeOAuthCredentials } from "@app/tests/utils/dfs/FakeOAuthCredentials";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { DfsError } from "@app/types/dfs";
import { Err, Ok } from "@app/types/shared/result";
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

const ROOT_ID = "0190c3a0b1c27d4e8f0a1b2c3d4e5f60";
const SERVER_KEY = "s".repeat(64);
const TENANT_KEY = "t".repeat(64);

function serverClient(answer: FakeDfsAnswer) {
  const transport = new FakeDfsTransport({ CreateTenant: answer });
  return { transport, client: new DfsClient(transport, SERVER_KEY) };
}

function tenantAnswer(tenantId: string): FakeDfsAnswer {
  return new Ok({
    tenantId,
    rootId: DfsWireFactory.objectId(ROOT_ID),
    tenantKey: TENANT_KEY,
  });
}

describe("createDfsTenant", () => {
  it("creates the workspace tenant and stores its key", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const { transport, client } = serverClient(tenantAnswer(workspace.sId));

    const res = await createDfsTenant(authenticator, {
      serverClient: client,
      rootGrants: [{ type: "deny", mode: 0o2 }],
    });

    expect(res.isOk()).toBe(true);
    expect(transport.calls).toEqual([
      {
        method: "CreateTenant",
        request: {
          tenantId: workspace.sId,
          rootGrants: [{ deny: { mode: 2 } }],
        },
        key: SERVER_KEY,
      },
    ]);
    const tenant = await DfsTenantResource.fetchByWorkspace(authenticator);
    expect(tenant?.rootId).toBe(ROOT_ID);
    const key = await tenant?.getTenantKey(authenticator);
    expect(key?.isOk() && key.value).toBe(TENANT_KEY);
  });

  it("refuses a workspace that already has a tenant without calling dfs", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    await DfsTenantResource.makeNew(authenticator, {
      tenantKey: TENANT_KEY,
      rootId: ROOT_ID,
    });
    const { transport, client } = serverClient(tenantAnswer(workspace.sId));

    const res = await createDfsTenant(authenticator, { serverClient: client });

    expect(res.isErr() && res.error).toMatchObject({ code: "already_exists" });
    expect(transport.calls).toHaveLength(0);
  });

  it("reports a dfs tenant whose key was never stored", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const { client } = serverClient(new Err(new DfsError("already_exists")));

    const res = await createDfsTenant(authenticator, { serverClient: client });

    expect(res.isErr() && res.error).toMatchObject({ code: "already_exists" });
    expect(await DfsTenantResource.fetchByWorkspace(authenticator)).toBeNull();
  });

  it("propagates dfs failures without storing anything", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const { client } = serverClient(new Err(new DfsError("unavailable")));

    const res = await createDfsTenant(authenticator, { serverClient: client });

    expect(res.isErr() && res.error).toMatchObject({ code: "unavailable" });
    expect(await DfsTenantResource.fetchByWorkspace(authenticator)).toBeNull();
  });
});
