import { GroupSkillModel } from "@app/lib/models/skill/group_skill";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SkillSearchDocumentResource } from "@app/lib/resources/skill/skill_search_document_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { beforeEach, describe, expect, it } from "vitest";

describe("SkillSearchDocumentResource", () => {
  let testContext: Awaited<ReturnType<typeof createResourceTest>>;

  beforeEach(async () => {
    testContext = await createResourceTest({ role: "admin" });
  });

  it("batch-hydrates active documents in input order", async () => {
    const regularSpace = await SpaceFactory.regular(testContext.workspace);
    const pod = await SpaceFactory.project(
      testContext.workspace,
      testContext.user.id
    );
    const firstSkill = await SkillFactory.create(testContext.authenticator, {
      name: "First skill",
      requestedSpaceIds: [regularSpace.id, pod.id],
    });
    const secondSkill = await SkillFactory.create(testContext.authenticator, {
      name: "Second skill",
    });
    const archivedSkill = await SkillFactory.create(testContext.authenticator, {
      name: "Archived skill",
      status: "archived",
    });

    const documents = await withTransaction((transaction) =>
      SkillSearchDocumentResource.fetchSearchDocuments(
        testContext.authenticator,
        [secondSkill.sId, "invalid", firstSkill.sId, archivedSkill.sId],
        { transaction }
      )
    );

    expect(documents.map((document) => document.skill_id)).toEqual([
      secondSkill.sId,
      firstSkill.sId,
    ]);
    expect(documents[1]).toMatchObject({
      workspace_id: testContext.workspace.sId,
      status: "active",
      editor_group_id: firstSkill.editorGroup?.sId,
      requested_space_ids: [regularSpace.sId, pod.sId],
      non_pod_space_ids: [regularSpace.sId],
      non_pod_space_count: 1,
      pod_space_id: pod.sId,
    });
  });

  it("rejects a skill ID encoded for another workspace", async () => {
    const skill = await SkillFactory.create(testContext.authenticator);
    const otherWorkspace = await WorkspaceFactory.basic();
    const crossWorkspaceSkillId = makeSId("skill", {
      id: skill.id,
      workspaceId: otherWorkspace.id,
    });

    await expect(
      SkillSearchDocumentResource.fetchSearchDocument(
        testContext.authenticator,
        crossWorkspaceSkillId
      )
    ).resolves.toBeNull();
  });

  it("fails closed when permission-bearing fields are stale", async () => {
    const regularSpace = await SpaceFactory.regular(testContext.workspace);
    const skill = await SkillFactory.create(testContext.authenticator, {
      requestedSpaceIds: [regularSpace.id],
    });
    const document = await SkillSearchDocumentResource.fetchSearchDocument(
      testContext.authenticator,
      skill.sId
    );
    expect(document).not.toBeNull();
    if (!document) {
      return;
    }

    const staleDocuments = [
      { ...document, availability: "workspace_users" as const },
      { ...document, requested_space_ids: [] },
      { ...document, non_pod_space_ids: [], non_pod_space_count: 0 },
      { ...document, pod_space_id: regularSpace.sId },
      { ...document, editor_group_id: "group-invalid" },
      { ...document, workspace_id: "workspace-invalid" },
    ];

    await expect(
      SkillSearchDocumentResource.filterSearchDocumentsByCurrentState(
        testContext.authenticator,
        [document, ...staleDocuments]
      )
    ).resolves.toEqual([document]);

    await skill.archive(testContext.authenticator);
    await expect(
      SkillSearchDocumentResource.filterSearchDocumentsByCurrentState(
        testContext.authenticator,
        [document]
      )
    ).resolves.toEqual([]);
  });

  it("fails closed when the linked editor group has the wrong kind", async () => {
    const skill = await SkillFactory.create(testContext.authenticator);
    const regularGroup = await GroupResource.makeNew({
      kind: "regular_manual",
      name: "Not a skill editors group",
      workspaceId: testContext.workspace.id,
    });

    // Deliberately corrupt an invariant that the normal Resource APIs preserve.
    await withTransaction(async (transaction) => {
      await GroupSkillModel.destroy({
        where: {
          skillConfigurationId: skill.id,
          workspaceId: testContext.workspace.id,
        },
        transaction,
      });
      await GroupSkillModel.create(
        {
          groupId: regularGroup.id,
          skillConfigurationId: skill.id,
          workspaceId: testContext.workspace.id,
        },
        { transaction }
      );
    });

    await expect(
      SkillSearchDocumentResource.fetchSearchDocument(
        testContext.authenticator,
        skill.sId
      )
    ).resolves.toBeNull();
  });

  it("pages active skills by model ID", async () => {
    const firstActiveSkill = await SkillFactory.create(
      testContext.authenticator,
      { name: "First active skill" }
    );
    await SkillFactory.create(testContext.authenticator, {
      name: "Archived skill",
      status: "archived",
    });
    const secondActiveSkill = await SkillFactory.create(
      testContext.authenticator,
      { name: "Second active skill" }
    );

    const firstPage =
      await SkillSearchDocumentResource.listActiveSearchIndexSkillIds(
        testContext.authenticator,
        { afterSkillModelId: null, limit: 1 }
      );
    expect(firstPage).toEqual([
      {
        skillId: firstActiveSkill.sId,
        skillModelId: firstActiveSkill.id,
      },
    ]);

    const secondPage =
      await SkillSearchDocumentResource.listActiveSearchIndexSkillIds(
        testContext.authenticator,
        { afterSkillModelId: firstPage[0].skillModelId, limit: 10 }
      );
    expect(secondPage).toEqual([
      {
        skillId: secondActiveSkill.sId,
        skillModelId: secondActiveSkill.id,
      },
    ]);
  });
});
