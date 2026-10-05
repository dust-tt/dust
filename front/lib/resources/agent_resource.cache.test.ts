import { beforeEach, describe, expect, it, vi } from "vitest";

// The real cache, except that after-commit invalidations run right away: each test runs inside a
// transaction that is rolled back, so commit hooks never fire.
vi.mock("@app/lib/utils/cache", async () => {
  const actual = await vi.importActual<typeof import("@app/lib/utils/cache")>(
    "@app/lib/utils/cache"
  );
  return {
    ...actual,
    invalidateCacheAfterCommit: async (
      _transaction: unknown,
      invalidateFn: () => Promise<void>
    ) => {
      await invalidateFn();
    },
  };
});

import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import assert from "assert";

describe("AgentResource cache", () => {
  let testContext: Awaited<ReturnType<typeof createResourceTest>>;

  beforeEach(async () => {
    testContext = await createResourceTest({ role: "user" });
  });

  it("serves the cached agent until its entry is invalidated", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator,
      { description: "before" }
    );
    await AgentResource.fetchById(testContext.authenticator, agent.sId);

    // Bypass every write path that invalidates the cache.
    await AgentConfigurationModel.update(
      { description: "after" },
      { where: { id: agent.id, workspaceId: testContext.workspace.id } }
    );

    const cached = await AgentResource.fetchById(
      testContext.authenticator,
      agent.sId
    );
    expect(cached?.description).toBe("before");

    await AgentResource.invalidateCache(testContext.workspace.id, agent.sId);
    const fresh = await AgentResource.fetchById(
      testContext.authenticator,
      agent.sId
    );
    expect(fresh?.description).toBe("after");
  });

  it("reads the instructions from the database, never from the cached entry", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator,
      { instructions: "before" }
    );
    await AgentResource.fetchById(testContext.authenticator, agent.sId);

    await AgentConfigurationModel.update(
      { instructions: "after" },
      { where: { id: agent.id, workspaceId: testContext.workspace.id } }
    );

    const cached = await AgentResource.fetchById(
      testContext.authenticator,
      agent.sId
    );
    assert(cached?.canViewContent);
    expect((await cached.fetchInstructions()).instructions).toBe("after");
  });

  it("drops the cached entry when the agent is archived", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator
    );
    const active = await AgentResource.fetchById(
      testContext.authenticator,
      agent.sId
    );
    assert(active);

    await active.archive(testContext.authenticator);

    const archived = await AgentResource.fetchById(
      testContext.authenticator,
      agent.sId
    );
    expect(archived?.status).toBe("archived");
  });

  it("drops the cached entry when a new version is saved", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator,
      { name: "Cached agent", description: "v0" }
    );
    await AgentResource.fetchById(testContext.authenticator, agent.sId);

    await AgentConfigurationFactory.updateTestAgent(
      testContext.authenticator,
      agent.sId,
      { name: "Cached agent", description: "v1" }
    );

    const updated = await AgentResource.fetchById(
      testContext.authenticator,
      agent.sId
    );
    expect(updated?.version).toBe(agent.version + 1);
    expect(updated?.description).toBe("v1");
  });
});
