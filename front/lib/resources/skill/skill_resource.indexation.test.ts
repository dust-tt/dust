import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import * as skillIndex from "@app/lib/skill_search";
import logger from "@app/logger/logger";
import { indexSkillSearchActivity } from "@app/temporal/es_indexation/activities";
import {
  launchDeleteSkillSearchWorkflow,
  launchIndexSkillSearchWorkflow,
} from "@app/temporal/es_indexation/client";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";
import { describe, expect, it, vi } from "vitest";

describe("resource-owned skill search indexation", () => {
  it("refreshes indexed editor IDs after add, upsert and remove", async () => {
    const {
      authenticator: auth,
      workspace,
      user,
    } = await createResourceTest({
      role: "admin",
    });
    const skill = await SkillFactory.create(auth);
    const editor = await UserFactory.basic();
    const secondEditor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, editor, { role: "user" });
    await MembershipFactory.associate(workspace, secondEditor, {
      role: "user",
    });
    const indexDocument = vi
      .spyOn(skillIndex, "indexSkillDocument")
      .mockResolvedValue(new Ok(undefined));
    const target = { workspaceId: workspace.sId, skillId: skill.sId };
    const mutations = [
      {
        update: () => skill.addEditors(auth, [editor]),
        editorIds: [user.sId, editor.sId],
      },
      {
        update: () => skill.upsertEditors(auth, [editor, secondEditor]),
        editorIds: [user.sId, editor.sId, secondEditor.sId],
      },
      {
        update: () => skill.removeEditors(auth, [editor, secondEditor]),
        editorIds: [user.sId],
      },
    ];
    for (const { update, editorIds } of mutations) {
      vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
      indexDocument.mockClear();
      expect((await update()).isOk()).toBe(true);
      expect(launchIndexSkillSearchWorkflow).toHaveBeenCalledExactlyOnceWith(
        target
      );
      await indexSkillSearchActivity(target);
      expect(indexDocument).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          workspace_id: workspace.sId,
          skill_id: skill.sId,
          editor_ids: [...editorIds].sort(),
        })
      );
    }
  });

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
    const skills = await SkillResource.fetchByIds(auth, [
      active.sId,
      archived.sId,
    ]);
    expect(skills.find((skill) => skill.sId === active.sId)).toMatchObject({
      name: "Shared name",
      status: "archived",
    });
    expect(skills.find((skill) => skill.sId === archived.sId)).toMatchObject({
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
    for (const { mutate, indexedSkillIds } of [
      {
        mutate: () => currentChild.archive(auth),
        indexedSkillIds: [childSkill.sId, ...parentIds],
      },
      {
        mutate: () => currentChild.restore(auth),
        indexedSkillIds: [childSkill.sId, ...parentIds],
      },
      {
        mutate: () => currentChild.delete(auth),
        indexedSkillIds: parentIds,
      },
    ]) {
      vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
      await mutate();
      expect(
        new Set(
          vi
            .mocked(launchIndexSkillSearchWorkflow)
            .mock.calls.map(([target]) => target.skillId)
        )
      ).toEqual(new Set(indexedSkillIds));
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
    const current = await SkillResource.fetchById(auth, skill.sId);
    expect(current).toMatchObject({
      availability: "editors",
      favoriteCount: 1,
    });
    vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
    vi.mocked(launchDeleteSkillSearchWorkflow).mockClear();
    expect((await skill.delete(auth)).isOk()).toBe(true);
    expect(launchIndexSkillSearchWorkflow).not.toHaveBeenCalled();
    expect(launchDeleteSkillSearchWorkflow).toHaveBeenCalledExactlyOnceWith(
      target
    );
    expect(await SkillResource.fetchById(auth, skill.sId)).toBeNull();
  });

  it("reports a failed deletion workflow launch after the DB deletion", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const skill = await SkillFactory.create(auth);
    const error = new Error("Temporal unavailable");
    vi.mocked(launchDeleteSkillSearchWorkflow).mockResolvedValueOnce(
      new Err(error)
    );

    const result = await skill.delete(auth);

    expect(result).toEqual(new Err(error));
    expect(await SkillResource.fetchById(auth, skill.sId)).toBeNull();
  });

  it("persists reinforcement settings and analysis completion without reindexing", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const skill = await SkillFactory.create(auth);
    vi.mocked(launchIndexSkillSearchWorkflow).mockClear();

    await skill.updateReinforcement("on");
    await skill.updateSelfImprovementLock(true);
    await skill.updateSelfImprovementCostsCap(100);
    await skill.updateSelfImprovementCostsCapAwuCredits(10);
    await skill.recordReinforcementAnalysisCompletion();

    const current = await SkillResource.fetchById(auth, skill.sId);
    expect(current).toMatchObject({
      reinforcement: "on",
      selfImprovementLock: true,
      selfImprovementCostsCapMicroUsd: 100,
      selfImprovementCostsCapAwuCredits: 10,
      lastReinforcementAnalysisAt: expect.any(Date),
    });
    expect(launchIndexSkillSearchWorkflow).not.toHaveBeenCalled();
  });

  it("does not enqueue workflows for an empty batch", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });

    await SkillResource.launchSearchIndexation(auth, []);

    expect(launchIndexSkillSearchWorkflow).not.toHaveBeenCalled();
  });

  it("logs workflow launch failures without throwing", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const skill = await SkillFactory.create(auth);
    const error = new Error("Temporal unavailable");
    const errorLog = vi.spyOn(logger, "error").mockImplementation(() => {});
    vi.mocked(launchIndexSkillSearchWorkflow).mockResolvedValueOnce(
      new Err(error)
    );

    await expect(
      SkillResource.launchSearchIndexation(auth, [skill.sId])
    ).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalledExactlyOnceWith(
      { error, workspaceId: workspace.sId, skillIds: [skill.sId] },
      "Failed to launch skill search indexation"
    );
    errorLog.mockRestore();
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
