import { getOrCreateEdgeeGatewayKey } from "@app/lib/api/edgee/gateway_keys";
import { Authenticator } from "@app/lib/auth";
import { EdgeeConnectionResource } from "@app/lib/resources/edgee_connection_resource";
import { GatewayApiKeyModel } from "@app/lib/resources/storage/models/gateway_api_key";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { InMemoryOAuthAPI } from "@app/tests/utils/mocks/in_memory_oauth_api";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCheckEdgeeOrganizationAccess = vi.hoisted(() => vi.fn());
const mockCreateEdgeeGatewayApiKey = vi.hoisted(() => vi.fn());
const mockDeleteEdgeeGatewayApiKey = vi.hoisted(() => vi.fn());

vi.mock("@app/lib/api/edgee/console_client", () => ({
  checkEdgeeOrganizationAccess: mockCheckEdgeeOrganizationAccess,
  createEdgeeGatewayApiKey: mockCreateEdgeeGatewayApiKey,
  deleteEdgeeGatewayApiKey: mockDeleteEdgeeGatewayApiKey,
}));

vi.mock("@app/types/oauth/oauth_api", async (importOriginal) => {
  const actual = await importOriginal<object>();
  const { InMemoryOAuthAPI } =
    await import("@app/tests/utils/mocks/in_memory_oauth_api");
  return { ...actual, OAuthAPI: InMemoryOAuthAPI };
});

let mintedKeys = 0;

async function edgeeWorkspaceWithConnection() {
  const resourceTest = await createResourceTest({
    role: "admin",
    plan: "edgee",
  });
  const res = await EdgeeConnectionResource.upsert(
    resourceTest.authenticator,
    { adminToken: "pat", organizationId: "org_1" }
  );
  assert(res.isOk(), "the Edgee connection should be saved");
  return resourceTest;
}

describe("getOrCreateEdgeeGatewayKey", () => {
  beforeEach(() => {
    InMemoryOAuthAPI.reset();
    mockCheckEdgeeOrganizationAccess.mockResolvedValue(new Ok(undefined));
    mintedKeys = 0;
    mockCreateEdgeeGatewayApiKey.mockReset();
    mockCreateEdgeeGatewayApiKey.mockImplementation(async () => {
      mintedKeys += 1;
      return new Ok({
        apiKeyId: `key_${mintedKeys}`,
        apiKey: `sk-edgee-${mintedKeys}`,
      });
    });
    mockDeleteEdgeeGatewayApiKey.mockReset();
    mockDeleteEdgeeGatewayApiKey.mockResolvedValue(new Ok(undefined));
  });

  it("mints a key on the user's first call, then reuses it", async () => {
    const { authenticator, user } = await edgeeWorkspaceWithConnection();

    const first = await getOrCreateEdgeeGatewayKey(authenticator);
    const second = await getOrCreateEdgeeGatewayKey(authenticator);

    expect(first.isOk() && first.value).toBe("sk-edgee-1");
    expect(second.isOk() && second.value).toBe("sk-edgee-1");
    expect(mockCreateEdgeeGatewayApiKey).toHaveBeenCalledTimes(1);
    expect(mockCreateEdgeeGatewayApiKey).toHaveBeenCalledWith(
      expect.objectContaining({
        adminToken: "pat",
        organizationId: "org_1",
        email: user.email,
      })
    );
  });

  it("gives each user of the workspace their own key", async () => {
    const { authenticator, workspace } = await edgeeWorkspaceWithConnection();
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, { role: "user" });
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      workspace.sId
    );

    const mine = await getOrCreateEdgeeGatewayKey(authenticator);
    const theirs = await getOrCreateEdgeeGatewayKey(otherAuth);

    expect(mine.isOk() && mine.value).toBe("sk-edgee-1");
    expect(theirs.isOk() && theirs.value).toBe("sk-edgee-2");
  });

  it("uses a single workspace key for calls made without a user", async () => {
    const { workspace } = await edgeeWorkspaceWithConnection();
    const internalAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    const first = await getOrCreateEdgeeGatewayKey(internalAuth);
    const second = await getOrCreateEdgeeGatewayKey(internalAuth);

    expect(first.isOk() && first.value).toBe("sk-edgee-1");
    expect(second.isOk() && second.value).toBe("sk-edgee-1");
    const rows = await GatewayApiKeyModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(rows.map((r) => r.userId)).toEqual([null]);
  });

  it("refuses public API keys", async () => {
    const { workspace, globalGroup } = await edgeeWorkspaceWithConnection();
    const key = await KeyFactory.regular(globalGroup);
    const keyAuth = await Authenticator.fromKey(key, workspace.sId);

    const res = await getOrCreateEdgeeGatewayKey(keyAuth);

    expect(res.isErr()).toBe(true);
    expect(mockCreateEdgeeGatewayApiKey).not.toHaveBeenCalled();
  });

  it("fails without minting when the workspace has no Edgee connection", async () => {
    const { authenticator } = await createResourceTest({
      role: "admin",
      plan: "edgee",
    });

    const res = await getOrCreateEdgeeGatewayKey(authenticator);

    expect(res.isErr()).toBe(true);
    expect(mockCreateEdgeeGatewayApiKey).not.toHaveBeenCalled();
  });

  it("stores nothing when Edgee refuses to mint the key", async () => {
    mockCreateEdgeeGatewayApiKey.mockResolvedValue(
      new Err(new Error("status 500"))
    );
    const { authenticator, workspace } = await edgeeWorkspaceWithConnection();

    const res = await getOrCreateEdgeeGatewayKey(authenticator);

    expect(res.isErr()).toBe(true);
    expect(
      await GatewayApiKeyModel.count({ where: { workspaceId: workspace.id } })
    ).toBe(0);
  });

  it("keeps one key and revokes the other when two first calls race", async () => {
    const { authenticator, workspace } = await edgeeWorkspaceWithConnection();

    const [a, b] = await concurrentExecutor(
      [authenticator, authenticator],
      getOrCreateEdgeeGatewayKey,
      { concurrency: 2 }
    );

    assert(a?.isOk() && b?.isOk(), "both racing calls should get a key");
    expect(a.value).toBe(b.value);
    expect(
      await GatewayApiKeyModel.count({ where: { workspaceId: workspace.id } })
    ).toBe(1);
    expect(mockDeleteEdgeeGatewayApiKey).toHaveBeenCalledTimes(
      mintedKeys - 1
    );
  });
});
