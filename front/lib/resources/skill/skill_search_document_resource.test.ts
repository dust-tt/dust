import { SkillSearchDocumentResource } from "@app/lib/resources/skill/skill_search_document_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
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
    const additionalEditor = await UserFactory.basic();
    await MembershipFactory.associate(testContext.workspace, additionalEditor, {
      role: "user",
    });
    const addEditorResult = await firstSkill.addEditors(
      testContext.authenticator,
      [additionalEditor]
    );
    expect(addEditorResult.isOk()).toBe(true);
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
      editor_user_ids: [testContext.user.id, additionalEditor.id].sort(
        (a, b) => a - b
      ),
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
});
