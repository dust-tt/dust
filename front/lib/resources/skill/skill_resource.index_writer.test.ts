import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import * as skillIndex from "@app/lib/skill_search";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { Ok } from "@app/types/shared/result";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("SkillResource search index writer", () => {
  afterEach(() => vi.restoreAllMocks());

  it("upserts active and archived skills but deletes suggested and missing documents", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const index = vi
      .spyOn(skillIndex, "indexSkillDocument")
      .mockResolvedValue(new Ok(undefined));
    const remove = vi
      .spyOn(skillIndex, "deleteSkillDocument")
      .mockResolvedValue(new Ok(undefined));
    const skill = await SkillFactory.create(auth);

    await SkillResource.indexSearchDocument(auth, skill.sId);
    expect(index).toHaveBeenLastCalledWith(
      expect.objectContaining({ skill_id: skill.sId, status: "active" })
    );
    await skill.archive(auth);
    await SkillResource.indexSearchDocument(auth, skill.sId);
    expect(index).toHaveBeenLastCalledWith(
      expect.objectContaining({ skill_id: skill.sId, status: "archived" })
    );
    await skill.restore(auth);
    await SkillResource.indexSearchDocument(auth, skill.sId);
    expect(index).toHaveBeenLastCalledWith(
      expect.objectContaining({ skill_id: skill.sId, status: "active" })
    );
    expect(remove).not.toHaveBeenCalled();

    expect((await skill.delete(auth)).isOk()).toBe(true);
    await SkillResource.indexSearchDocument(auth, skill.sId);
    expect(remove).toHaveBeenLastCalledWith({
      workspaceId: workspace.sId,
      skillId: skill.sId,
    });
    const suggestion = await SkillFactory.create(auth, { status: "suggested" });
    await SkillResource.indexSearchDocument(auth, suggestion.sId);
    expect(remove).toHaveBeenLastCalledWith({
      workspaceId: workspace.sId,
      skillId: suggestion.sId,
    });
    expect(index).toHaveBeenCalledTimes(3);
  });
});
