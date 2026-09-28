import * as agentIndex from "@app/lib/agent_search";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { indexAgentSearchActivity } from "@app/temporal/es_indexation/activities";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { Ok } from "@app/types/shared/result";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("agent search indexing activity", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(agentIndex, "indexAgentDocument").mockResolvedValue(
      new Ok(undefined)
    );
  });

  it("indexes a visible agent with its editors and counts", async () => {
    const {
      authenticator: auth,
      workspace,
      user,
    } = await createResourceTest({ role: "admin" });
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Indexed agent",
    });

    await indexAgentSearchActivity({
      workspaceId: workspace.sId,
      agentId: agent.sId,
    });

    expect(agentIndex.indexAgentDocument).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        workspace_id: workspace.sId,
        agent_id: agent.sId,
        name: "Indexed agent",
        scope: "visible",
        status: "active",
        editor_ids: [user.sId],
        favorite_count: 0,
        feedback_positive_count: 0,
        feedback_negative_count: 0,
        active_users_count: 0,
      })
    );
  });

  it("indexes a hidden agent the internal admin cannot read", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Hidden agent",
      scope: "hidden",
    });

    await indexAgentSearchActivity({
      workspaceId: workspace.sId,
      agentId: agent.sId,
    });

    expect(agentIndex.indexAgentDocument).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        agent_id: agent.sId,
        name: "Hidden agent",
        scope: "hidden",
      })
    );
  });

  it("counts an agent's favorites across its versions", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const resource = await AgentResource.fetchById(auth, agent.sId);
    assert(resource !== null);
    expect((await resource.setUserFavorite(auth, true)).isOk()).toBe(true);

    await indexAgentSearchActivity({
      workspaceId: workspace.sId,
      agentId: agent.sId,
    });

    expect(agentIndex.indexAgentDocument).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ favorite_count: 1 })
    );
  });

  it("indexes archived agents", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    expect(
      await (await AgentResource.fetchById(auth, agent.sId))!.archive(auth)
    ).toEqual(new Ok(true));

    await indexAgentSearchActivity({
      workspaceId: workspace.sId,
      agentId: agent.sId,
    });

    expect(agentIndex.indexAgentDocument).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ agent_id: agent.sId, status: "archived" })
    );
  });

  it("does not index global agents", async () => {
    const { workspace } = await createResourceTest({ role: "admin" });

    await indexAgentSearchActivity({
      workspaceId: workspace.sId,
      agentId: GLOBAL_AGENTS_SID.HELPER,
    });

    expect(agentIndex.indexAgentDocument).not.toHaveBeenCalled();
  });

  it("is a no-op for an agent that no longer resolves", async () => {
    const { workspace } = await createResourceTest({ role: "admin" });

    await indexAgentSearchActivity({
      workspaceId: workspace.sId,
      agentId: "agent-that-does-not-exist",
    });

    expect(agentIndex.indexAgentDocument).not.toHaveBeenCalled();
  });
});
