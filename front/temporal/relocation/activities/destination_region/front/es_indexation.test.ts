import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { indexSkillDocument } from "@app/lib/skill_search";
import { recreateSkillSearchIndex } from "@app/temporal/relocation/activities/destination_region/front/es_indexation";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/skill_search", () => ({
  indexSkillDocument: vi.fn(),
}));

describe("recreateSkillSearchIndex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(indexSkillDocument).mockResolvedValue(new Ok(undefined));
  });

  it("rebuilds restricted active and archived skills, excluding suggestions", async () => {
    const { authenticator, user, workspace, globalSpace } =
      await createResourceTest({
        role: "admin",
      });
    const regularSpace = await SpaceFactory.regular(workspace);
    const pod = await SpaceFactory.project(workspace, user.id);
    const activeSkill = await SkillFactory.create(authenticator, {
      requestedSpaceIds: [regularSpace.id, pod.id],
    });
    const archivedSkill = await SkillFactory.create(authenticator, {
      status: "archived",
      requestedSpaceIds: [regularSpace.id],
    });
    await SkillFactory.create(authenticator, { status: "suggested" });

    await recreateSkillSearchIndex({ workspaceId: workspace.sId });

    expect(indexSkillDocument).toHaveBeenCalledTimes(2);
    expect(indexSkillDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        skill_id: activeSkill.sId,
        status: "active",
        workspace_id: workspace.sId,
        requested_space_ids: [regularSpace.sId, pod.sId, globalSpace.sId],
        editor_ids: [user.sId],
      })
    );
    expect(indexSkillDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        skill_id: archivedSkill.sId,
        status: "archived",
        workspace_id: workspace.sId,
        requested_space_ids: [regularSpace.sId, globalSpace.sId],
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
