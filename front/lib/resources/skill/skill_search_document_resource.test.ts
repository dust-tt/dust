import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSearchDocumentResource } from "@app/lib/resources/skill/skill_search_document_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import assert from "assert";
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
      tools: [],
      active_users: 0,
      favorite_count: 0,
      is_default: false,
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

  it("accepts legacy individual-editor documents but rejects stale indexed group grants", async () => {
    const { authenticator: auth } = testContext;
    const skill = await SkillFactory.create(auth, { availability: "editors" });
    const document = await SkillSearchDocumentResource.fetchSearchDocument(
      auth,
      skill.sId
    );
    assert(document);
    expect(document.editor_group_ids).toHaveLength(1);
    const { editor_group_ids: _groups, ...legacyDocument } = document;
    const legacy = await SkillSearchDocumentResource.authorizeSearchDocuments(
      auth,
      [legacyDocument]
    );
    expect(legacy.has(skill.sId)).toBe(true);
    const stale = await SkillSearchDocumentResource.authorizeSearchDocuments(
      auth,
      [{ ...document, editor_group_ids: [] }]
    );
    expect(stale.size).toBe(0);
  });

  it.each([
    true,
    false,
  ])("hydrates the canonical stripped listing when readable=%s", async (readable) => {
    const { authenticator: auth, workspace, globalSpace } = testContext;
    const space = readable
      ? globalSpace
      : await SpaceFactory.regular(workspace);
    const skill = await SkillFactory.create(auth, {
      requestedSpaceIds: [space.id],
      manuallyRequestedSpaceIds: [space.id],
      instructions: "Private instructions",
      instructionsHtml: "<p>Private instructions</p>",
    });
    const [canonical] = await SkillResource.fetchByIds(auth, [skill.sId], {
      permissionFiltering: "redact_unreadable",
      withInstructions: false,
      withTools: false,
      withFileAttachments: false,
    });
    const document = await SkillSearchDocumentResource.fetchSearchDocument(
      auth,
      skill.sId
    );
    assert(canonical && document);
    expect(canonical.canRead(auth)).toBe(readable);

    const hydrated = SkillResource.fromSearchDocument(auth, document, {
      canRead: canonical.canRead(auth),
    });
    expect(hydrated.toJSON(auth)).toEqual(canonical.toJSON(auth));
    const listing = hydrated.toSearchJSON(auth, 1);
    expect(listing).toEqual(canonical.toSearchJSON(auth, 1));
    expect(listing).toMatchObject({
      canRead: readable,
    });
    expect(listing).not.toHaveProperty("instructions");
    expect(listing).not.toHaveProperty("instructionsHtml");
    expect(listing).not.toHaveProperty("tools");
    expect(listing).not.toHaveProperty("fileAttachments");
    expect(JSON.stringify(document)).not.toContain("Private instructions");
  });

  it("projects tools, favorites, and default availability without indexing instructions", async () => {
    const { authenticator: auth, workspace, globalSpace } = testContext;
    const server = await RemoteMCPServerFactory.create(workspace);
    const tool = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      globalSpace
    );
    const skill = await SkillFactory.create(auth, {
      availability: "users_and_agents",
      instructions: "Private instructions must never reach the search index",
      requestedSpaceIds: [globalSpace.id],
      mcpServerViews: [tool],
    });
    const favorited = await skill.setFavorite(auth, true);
    expect(favorited.isOk()).toBe(true);
    const alreadyFavorite = await skill.setFavorite(auth, true);
    expect(alreadyFavorite.isOk()).toBe(true);
    const document = await SkillSearchDocumentResource.fetchSearchDocument(
      auth,
      skill.sId
    );
    expect(document).toMatchObject({
      description: skill.userFacingDescription,
      tools: [tool.sId],
      favorite_count: 1,
      active_users: 0,
      is_default: true,
      requested_space_ids: [globalSpace.sId],
    });
    expect(document).not.toHaveProperty("instructions");
    expect(document).not.toHaveProperty("non_pod_space_ids");
    expect(document).not.toHaveProperty("non_pod_space_count");
    expect(document).not.toHaveProperty("pod_space_id");

    const unfavorited = await skill.setFavorite(auth, false);
    expect(unfavorited.isOk()).toBe(true);
    const updated = await SkillSearchDocumentResource.fetchSearchDocument(
      auth,
      skill.sId
    );
    expect(updated?.favorite_count).toBe(0);
  });
  it("fails closed when permission-bearing fields are stale", async () => {
    const regularSpace = await SpaceFactory.regular(testContext.workspace);
    await SpaceFactory.attachGroup(regularSpace, testContext.globalGroup);
    await testContext.authenticator.refresh();
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
      { ...document, editor_user_ids: [999_999_999] },
      {
        ...document,
        editor_user_ids: 999_999_999 as unknown as number[],
      },
      {
        ...document,
        requested_space_ids: regularSpace.sId as unknown as string[],
      },
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
