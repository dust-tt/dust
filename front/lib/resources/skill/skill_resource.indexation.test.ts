import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { launchIndexSkillSearchWorkflow } from "@app/temporal/es_indexation/client";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import assert from "assert";
import { describe, expect, it, vi } from "vitest";

describe("resource-owned skill search indexation", () => {
  it("refreshes an older archived skill renamed to avoid a name collision", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const archived = await SkillFactory.create(auth, {
      name: "Shared name",
      status: "archived",
    });
    const active = await SkillFactory.create(auth, { name: "Shared name" });
    vi.mocked(launchIndexSkillSearchWorkflow).mockClear();

    await active.archive(auth);

    expect(
      new Set(
        vi
          .mocked(launchIndexSkillSearchWorkflow)
          .mock.calls.map(([target]) => target.skillId)
      )
    ).toEqual(new Set([active.sId, archived.sId]));
    const documents = await SkillResource.fetchSearchDocuments(auth, [
      active.sId,
      archived.sId,
    ]);
    expect(documents[0]).toMatchObject({
      name: "Shared name",
      status: "archived",
    });
    expect(documents[1]).toMatchObject({
      name: expect.stringContaining("Shared name (archived on "),
      status: "archived",
    });
  });

  it("refreshes every changed parent after reference rewrites", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const { childSkill, parentSkill } =
      await SkillFactory.createWithNestedSkill(auth, {
        childOverrides: { name: "Indexed child" },
        parentOverrides: { name: "First indexed parent" },
      });
    const secondParent = await SkillFactory.create(auth, {
      name: "Second indexed parent",
      instructions: `Use ${SkillFactory.serializeSkillReferenceTag(childSkill)}.`,
    });
    const parentIds = [parentSkill.sId, secondParent.sId];
    const currentChild = await SkillResource.fetchById(auth, childSkill.sId);
    assert(currentChild);
    for (const mutate of [
      () => currentChild.archive(auth),
      () => currentChild.restore(auth),
      () => currentChild.delete(auth),
    ]) {
      vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
      await mutate();
      expect(
        new Set(
          vi
            .mocked(launchIndexSkillSearchWorkflow)
            .mock.calls.map(([target]) => target.skillId)
        )
      ).toEqual(new Set([childSkill.sId, ...parentIds]));
      const parents = await SkillResource.fetchByIds(auth, parentIds);
      const documents = await SkillResource.fetchSearchDocuments(
        auth,
        parentIds
      );
      expect(
        new Map(
          documents.map((document) => [document.skill_id, document.updated_at])
        )
      ).toEqual(
        new Map(
          parents.map((parent) => [parent.sId, parent.updatedAt.toISOString()])
        )
      );
    }
  });

  it("indexes creation, updates, favorites and lifecycle changes without caller hooks", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const skill = await SkillFactory.create(auth, {
      availability: "workspace_users",
    });
    const target = { workspaceId: workspace.sId, skillId: skill.sId };
    expect(launchIndexSkillSearchWorkflow).toHaveBeenCalledExactlyOnceWith(
      target
    );

    const mutations = [
      () => SkillResource.updateAvailabilities(auth, [skill], "editors"),
      () => skill.updateReinforcement(auth, "on"),
      () => skill.updateSelfImprovementLock(auth, true),
      () => skill.updateSelfImprovementCostsCap(auth, 100),
      () => skill.updateSelfImprovementCostsCapAwuCredits(auth, 10),
      () => skill.recordReinforcementAnalysisCompletion(auth),
      () => skill.setFavorite(auth, true),
      () => skill.archive(auth),
      () => skill.restore(auth),
    ];
    for (const mutate of mutations) {
      vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
      await mutate();
      expect(launchIndexSkillSearchWorkflow).toHaveBeenCalledExactlyOnceWith(
        target
      );
    }
    const document = await SkillResource.fetchSearchDocument(auth, skill.sId);
    expect(document).toMatchObject({
      availability: "editors",
      favorite_count: 1,
      created_at: expect.any(String),
    });
    expect(document).not.toHaveProperty("metadata");
    vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
    expect((await skill.delete(auth)).isOk()).toBe(true);
    expect(launchIndexSkillSearchWorkflow).toHaveBeenCalledExactlyOnceWith(
      target
    );
    expect(await SkillResource.fetchSearchDocument(auth, skill.sId)).toBeNull();
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
