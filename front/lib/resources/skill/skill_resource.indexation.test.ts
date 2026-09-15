import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { launchIndexSkillSearchWorkflow } from "@app/temporal/es_indexation/client";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { describe, expect, it, vi } from "vitest";

describe("resource-owned skill search indexation", () => {
  it("deduplicates IDs and never indexes a code-defined skill", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const skill = await SkillFactory.create(auth);
    vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
    await SkillResource.launchSearchIndexation(auth, [
      skill.sId,
      skill.sId,
      "go-deep",
    ]);
    expect(launchIndexSkillSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: workspace.sId,
      skillId: skill.sId,
    });
  });
});
