import { agentSearchIndex } from "@app/lib/agent_search";
import { archiveAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import {
  deleteWorkspaceSkillDocuments,
  indexSkillDocument,
} from "@app/lib/skill_search";
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

vi.mock("@app/lib/skill_search", () => ({
  deleteWorkspaceSkillDocuments: vi.fn(),
  indexSkillDocument: vi.fn(),
}));

describe("recreateSkillSearchIndex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(deleteWorkspaceSkillDocuments).mockResolvedValue(
      new Ok(undefined)
    );
    vi.mocked(indexSkillDocument).mockResolvedValue(new Ok(undefined));
  });

  it("clears and rebuilds active skill documents", async () => {
    const { authenticator, user, workspace } = await createResourceTest({
      role: "admin",
    });
    const regularSpace = await SpaceFactory.regular(workspace);
    const pod = await SpaceFactory.project(workspace, user.id);
    const activeSkill = await SkillFactory.create(authenticator, {
      requestedSpaceIds: [regularSpace.id, pod.id],
    });
    await SkillFactory.create(authenticator, { status: "archived" });

    await recreateSkillSearchIndex({ workspaceId: workspace.sId });

    expect(deleteWorkspaceSkillDocuments).toHaveBeenCalledOnce();
    expect(deleteWorkspaceSkillDocuments).toHaveBeenCalledWith({
      workspaceId: workspace.sId,
    });
    expect(indexSkillDocument).toHaveBeenCalledOnce();
    expect(indexSkillDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        skill_id: activeSkill.sId,
        requested_space_ids: [regularSpace.sId, pod.sId],
      })
    );
    expect(
      vi.mocked(deleteWorkspaceSkillDocuments).mock.invocationCallOrder[0]
    ).toBeLessThan(vi.mocked(indexSkillDocument).mock.invocationCallOrder[0]);
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
    vi.restoreAllMocks();
  });

  it("clears the workspace and rebuilds only latest active agent identities", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const active = await AgentConfigurationFactory.createTestAgent(auth);
    await AgentConfigurationFactory.updateTestAgent(auth, active.sId, {
      name: "Latest",
    });
    const archived = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Archived",
    });
    await archiveAgentConfiguration(auth, archived.sId);
    const other = await createResourceTest({ role: "admin" });
    await AgentConfigurationFactory.createTestAgent(other.authenticator);
    const deletion = vi
      .spyOn(agentSearchIndex, "deleteWorkspace")
      .mockResolvedValue(new Ok(undefined));
    const upsert = vi
      .spyOn(agentSearchIndex, "upsert")
      .mockResolvedValue(new Ok(undefined));
    await recreateAgentSearchIndex({ workspaceId: workspace.sId });
    expect(deletion).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
    });
    expect(upsert).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        workspace_id: workspace.sId,
        agent_id: active.sId,
        name: "Latest",
        metadata: expect.objectContaining({ version: 1 }),
      })
    );
    expect(deletion.mock.invocationCallOrder[0]).toBeLessThan(
      upsert.mock.invocationCallOrder[0]
    );
  });

  it("fails if workspace cleanup fails instead of rebuilding over stale documents", async () => {
    const { workspace } = await createResourceTest({ role: "admin" });
    const error = new ElasticsearchError("query_error", "Delete failed");
    vi.spyOn(agentSearchIndex, "deleteWorkspace").mockResolvedValue(
      new Err(error)
    );
    const upsert = vi.spyOn(agentSearchIndex, "upsert");
    await expect(
      recreateAgentSearchIndex({ workspaceId: workspace.sId })
    ).rejects.toBe(error);
    expect(upsert).not.toHaveBeenCalled();
  });
});
