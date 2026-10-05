import { indexAgentDocument } from "@app/lib/agent_search";
import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { indexSkillDocument } from "@app/lib/skill_search";
import {
  recreateAgentSearchIndex,
  recreateSkillSearchIndex,
} from "@app/temporal/relocation/activities/destination_region/front/es_indexation";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/agent_search", () => ({
  indexAgentDocument: vi.fn(),
}));

vi.mock("@app/lib/skill_search", () => ({
  indexSkillDocument: vi.fn(),
}));

describe("recreateSkillSearchIndex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(indexSkillDocument).mockResolvedValue(new Ok(undefined));
  });

  it("rebuilds restricted active and archived skills, excluding suggestions", async () => {
    const { authenticator, user, workspace } = await createResourceTest({
      role: "admin",
    });
    const regularSpace = await SpaceFactory.regular(workspace);
    const pod = await SpaceFactory.project(workspace, user.id);
    const archivedSkill = await SkillFactory.create(authenticator, {
      status: "archived",
      requestedSpaceIds: [regularSpace.id],
    });
    const activeSkill = await SkillFactory.create(authenticator, {
      instructions: `Use ${SkillFactory.serializeSkillReferenceTag(archivedSkill)}.`,
      requestedSpaceIds: [regularSpace.id, pod.id],
    });
    await SkillFactory.create(authenticator, { status: "suggested" });

    await recreateSkillSearchIndex({ workspaceId: workspace.sId });

    expect(indexSkillDocument).toHaveBeenCalledTimes(2);
    expect(indexSkillDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        skill_id: activeSkill.sId,
        status: "active",
        workspace_id: workspace.sId,
        requested_space_ids: [regularSpace.sId, pod.sId],
        editor_ids: [user.sId],
        child_skill_ids: [archivedSkill.sId],
      })
    );
    expect(indexSkillDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        skill_id: archivedSkill.sId,
        status: "archived",
        workspace_id: workspace.sId,
        requested_space_ids: [regularSpace.sId],
        child_skill_ids: [],
      })
    );
  });

  it("throws after an indexing failure so Temporal retries", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    await SkillFactory.create(authenticator);
    vi.mocked(indexSkillDocument).mockResolvedValue(
      new Err(new ElasticsearchError("query_error", "write failed"))
    );

    await expect(
      recreateSkillSearchIndex({ workspaceId: workspace.sId })
    ).rejects.toThrow(
      `Failed to index 1 skills for workspace ${workspace.sId}`
    );
  });
});

describe("recreateAgentSearchIndex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(indexAgentDocument).mockResolvedValue(new Ok(undefined));
  });

  it("rebuilds active and archived agents, including hidden ones", async () => {
    const {
      authenticator: auth,
      user,
      workspace,
    } = await createResourceTest({ role: "admin" });
    const visibleAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Visible agent",
    });
    const restrictedSkill = await SkillFactory.create(auth, {
      requestedSpaceIds: [(await SpaceFactory.regular(workspace)).id],
    });
    await SkillFactory.linkToAgent(auth, {
      skillId: restrictedSkill.id,
      agentConfigurationId: visibleAgent.id,
    });
    expect(
      (
        await (await AgentResource.fetchById(
          auth,
          visibleAgent.sId
        ))!.setUserFavorite(auth, true)
      ).isOk()
    ).toBe(true);
    const hiddenAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Hidden agent",
      scope: "hidden",
    });
    const archivedAgent = await AgentConfigurationFactory.createTestAgent(
      auth,
      {
        name: "Archived agent",
      }
    );
    expect(
      await (await AgentResource.fetchById(auth, archivedAgent.sId))!.archive(
        auth
      )
    ).toEqual(new Ok(true));

    await recreateAgentSearchIndex({ workspaceId: workspace.sId });

    expect(indexAgentDocument).toHaveBeenCalledTimes(3);
    expect(indexAgentDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_id: visibleAgent.sId,
        workspace_id: workspace.sId,
        name: "Visible agent",
        scope: "visible",
        status: "active",
        editor_ids: [user.sId],
        skill_ids: [restrictedSkill.sId],
        favorite_count: 1,
        active_users_count: 0,
      })
    );
    expect(indexAgentDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_id: hiddenAgent.sId,
        name: "Hidden agent",
        scope: "hidden",
        status: "active",
        skill_ids: [],
        favorite_count: 0,
      })
    );
    expect(indexAgentDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_id: archivedAgent.sId,
        name: "Archived agent",
        status: "archived",
      })
    );
  });

  it("throws after an indexing failure so Temporal retries", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    await AgentConfigurationFactory.createTestAgent(auth);
    vi.mocked(indexAgentDocument).mockResolvedValue(
      new Err(new ElasticsearchError("query_error", "write failed"))
    );

    await expect(
      recreateAgentSearchIndex({ workspaceId: workspace.sId })
    ).rejects.toThrow(
      `Failed to index 1 agents for workspace ${workspace.sId}`
    );
  });
});
