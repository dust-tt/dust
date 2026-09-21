import {
  archiveAgentConfiguration,
  restoreAgentConfiguration,
} from "@app/lib/api/assistant/configuration/agent";
import { updateAgentRequirements } from "@app/lib/api/assistant/configuration/agent_requirements";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import logger from "@app/logger/logger";
import { launchIndexAgentSearchWorkflow } from "@app/temporal/es_indexation/client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { Err } from "@app/types/shared/result";
import assert from "assert";
import { describe, expect, it, vi } from "vitest";

describe("resource-owned agent search indexation", () => {
  it("indexes creation, updates, scope changes, favorites and lifecycle changes", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Indexed agent",
    });
    const target = { workspaceId: workspace.sId, agentId: agent.sId };
    expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledExactlyOnceWith(
      target
    );

    const resource = await AgentResource.fetchById(auth, agent.sId);
    assert(resource !== null && resource.isFull());

    // Changing an agent's scope needs the workspace-wide `publish` capability.
    await GroupPermissionResource.setForEverybody(auth, {
      grantType: "publish",
      resourceType: "agent",
    });
    await auth.refresh();

    const mutations = [
      async () => {
        const params = await resource.buildResaveParams(auth);
        const result = await resource.updateConfiguration(auth, {
          ...params,
          description: "Updated description",
        });
        expect(result.isOk()).toBe(true);
      },
      async () => {
        const result = await AgentResource.bulkUpdate(auth, [agent.sId], {
          scope: "hidden",
        });
        expect(result.updatedAgentIds).toEqual([agent.sId]);
      },
      async () => {
        expect((await resource.setUserFavorite(auth, true)).isOk()).toBe(true);
      },
      async () => {
        expect(await archiveAgentConfiguration(auth, agent.sId)).toBe(true);
      },
      async () => {
        expect((await restoreAgentConfiguration(auth, agent.sId)).isOk()).toBe(
          true
        );
      },
    ];
    for (const mutate of mutations) {
      vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
      await mutate();
      expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledExactlyOnceWith(
        target
      );
    }

    const current = await AgentResource.fetchById(auth, agent.sId);
    expect(current).toMatchObject({
      description: "Updated description",
      scope: "hidden",
      status: "active",
    });
  });

  it("indexes the agent after its editors changed", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const editor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, editor, { role: "user" });
    const target = { workspaceId: workspace.sId, agentId: agent.sId };

    const resource = await AgentResource.fetchById(auth, agent.sId);
    assert(resource !== null);
    const baseEditors = ((await resource.listEditors(auth)) ?? []).map((u) =>
      u.toJSON()
    );

    // Editor changes go through the in-place path of `updateConfiguration`, which enqueues one
    // indexation per change: first add the editor, then remove them again.
    const editorSets = [[...baseEditors, editor.toJSON()], baseEditors];
    for (const editors of editorSets) {
      vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
      const result = await resource.updateConfiguration(auth, { editors });
      expect(result.isOk()).toBe(true);
      expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledExactlyOnceWith(
        target
      );
    }
  });

  it("indexes the agent after its requested spaces changed", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const resource = await AgentResource.fetchById(auth, agent.sId);
    assert(resource !== null);
    const space = await SpaceFactory.regular(workspace);
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();

    const result = await updateAgentRequirements(
      auth,
      {
        agentModelId: resource.agentConfigurationModelId,
        newSpaceIds: [space.id],
      },
      {}
    );

    expect(result.isOk()).toBe(true);
    expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      agentId: agent.sId,
    });
  });

  it("indexes every agent a bulk model update saved", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const [first, second] = [
      await AgentConfigurationFactory.createTestAgent(auth, { name: "First" }),
      await AgentConfigurationFactory.createTestAgent(auth, { name: "Second" }),
    ];
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();

    const result = await AgentResource.bulkUpdate(
      auth,
      [first.sId, second.sId],
      {
        model: {
          providerId: "openai",
          modelId: "gpt-5",
          reasoningEffort: "medium",
        },
      }
    );

    expect(result.updatedAgentIds).toEqual([first.sId, second.sId]);
    expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledTimes(2);
    for (const agentId of [first.sId, second.sId]) {
      expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledWith({
        workspaceId: workspace.sId,
        agentId,
      });
    }
  });

  it("does not index a draft agent", async () => {
    const { authenticator: auth, user } = await createResourceTest({
      role: "admin",
    });
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();

    const result = await AgentResource.makeNew(auth, {
      name: "Draft agent",
      description: "Draft agent description",
      instructions: "Draft instructions",
      instructionsHtml: null,
      pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
      status: "draft",
      scope: "hidden",
      model: {
        providerId: "openai",
        modelId: "gpt-5-mini",
        temperature: 0.7,
      },
      templateId: null,
      requestedSpaceIds: [],
      tags: [],
      editors: [user.toJSON()],
      authorId: user.id,
    });

    expect(result.isOk()).toBe(true);
    expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();
  });

  it("does not enqueue workflows for an empty batch", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();

    await AgentResource.launchSearchIndexation(auth, []);

    expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();
  });

  it("deduplicates the provided agent IDs", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();

    await AgentResource.launchSearchIndexation(auth, [agent.sId, agent.sId]);

    expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      agentId: agent.sId,
    });
  });

  it("logs workflow launch failures without throwing", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const error = new Error("Temporal unavailable");
    const errorLog = vi.spyOn(logger, "error").mockImplementation(() => {});
    vi.mocked(launchIndexAgentSearchWorkflow).mockResolvedValueOnce(
      new Err(error)
    );

    await expect(
      AgentResource.launchSearchIndexation(auth, [agent.sId])
    ).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalledExactlyOnceWith(
      { error, workspaceId: workspace.sId, agentIds: [agent.sId] },
      "Failed to launch agent search indexation"
    );
    errorLog.mockRestore();
  });
});
