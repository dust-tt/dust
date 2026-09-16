import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { launchIndexSkillSearchWorkflow } from "@app/temporal/es_indexation/client";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { Err } from "@app/types/shared/result";
import { describe, expect, it, vi } from "vitest";

describe("resource-owned skill search indexation", () => {
  it("does not enqueue workflows for an empty batch", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });

    await SkillResource.launchSearchIndexation(auth, []);

    expect(launchIndexSkillSearchWorkflow).not.toHaveBeenCalled();
  });

  it("propagates workflow launch failures", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const skill = await SkillFactory.create(auth);
    const error = new Error("Temporal unavailable");
    vi.mocked(launchIndexSkillSearchWorkflow).mockResolvedValueOnce(
      new Err(error)
    );

    await expect(
      SkillResource.launchSearchIndexation(auth, [skill.sId])
    ).rejects.toBe(error);
  });

  it("deduplicates the provided skill IDs", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const skill = await SkillFactory.create(auth);
    vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
    await SkillResource.launchSearchIndexation(auth, [skill.sId, skill.sId]);
    expect(launchIndexSkillSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      skillId: skill.sId,
    });
  });
});
