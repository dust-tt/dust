import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import skillSearchMapping from "@app/lib/skill_search/indices/skills_1.mappings.json";
import { launchIndexSkillSearchWorkflow } from "@app/temporal/es_indexation/client";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import {
  SkillListItemSchema,
  SkillSchema,
  SkillWithoutInstructionsAndToolsSchema,
} from "@app/types/assistant/skill_configuration";
import assert from "assert";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

describe("SkillResource", () => {
  let testContext: Awaited<ReturnType<typeof createResourceTest>>;

  beforeEach(async () => {
    testContext = await createResourceTest({ role: "admin" });
  });

  it("serializes a listing without pretending it is a complete skill", async () => {
    const { authenticator: auth } = testContext;
    const skill = await SkillFactory.create(auth, {
      instructions: "Private instructions",
      agentFacingDescription: "Only needed for execution",
    });
    const listing = skill.toListJSON(auth);

    expect(SkillListItemSchema.strict().parse(listing)).toEqual(listing);
    expect(SkillSchema.safeParse(listing).success).toBe(false);
    expect(
      SkillWithoutInstructionsAndToolsSchema.safeParse(listing).success
    ).toBe(false);
    expectTypeOf(listing).not.toMatchTypeOf<SkillType>();
    expect(skill.toSearchJSON(auth, 42)).toEqual({ ...listing, score: 42 });
    expect(listing).not.toHaveProperty("score");
    expect(listing).toMatchObject({ status: "active", canRead: true });
  });

  it("batch-hydrates active and archived documents in input order, excluding suggestions", async () => {
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
    const suggestedSkill = await SkillFactory.create(
      testContext.authenticator,
      {
        name: "Suggested skill",
        status: "suggested",
      }
    );

    const documents = await SkillResource.fetchSearchDocuments(
      testContext.authenticator,
      [
        secondSkill.sId,
        "invalid",
        firstSkill.sId,
        archivedSkill.sId,
        suggestedSkill.sId,
      ]
    );

    expect(documents.map((document) => document.skill_id)).toEqual([
      secondSkill.sId,
      firstSkill.sId,
      archivedSkill.sId,
    ]);
    expect(documents[2].status).toBe("archived");
    expect(documents[1]).toMatchObject({
      workspace_id: testContext.workspace.sId,
      status: "active",
      editor_ids: [testContext.user.sId, additionalEditor.sId].sort(),
      requested_space_ids: [regularSpace.sId, pod.sId],
      mcp_server_view_ids: [],
      active_users_count: 0,
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
      SkillResource.fetchSearchDocument(
        testContext.authenticator,
        crossWorkspaceSkillId
      )
    ).resolves.toBeNull();
  });

  it("rejects missing or stale indexed editors", async () => {
    const { authenticator: auth } = testContext;
    const skill = await SkillFactory.create(auth, { availability: "editors" });
    const document = await SkillResource.fetchSearchDocument(auth, skill.sId);
    assert(document);
    expect(document.editor_ids).toHaveLength(1);
    const { editor_ids: _editors, ...malformedDocument } = document;
    const malformed = await SkillResource.authorizeSearchDocuments(
      auth,
      // @ts-expect-error Elasticsearch can return a document missing a required field.
      [{ document: malformedDocument, score: 1 }]
    );
    expect(malformed.size).toBe(0);
    const stale = await SkillResource.authorizeSearchDocuments(auth, [
      { document: { ...document, editor_ids: [] }, score: 1 },
    ]);
    expect(stale.size).toBe(0);
  });

  it.each([
    { kind: "regular", readable: true },
    { kind: "regular", readable: false },
    { kind: "project", readable: true },
    { kind: "project", readable: false },
  ])("enforces manually requested $kind spaces when readable=$readable", async ({
    kind,
    readable,
  }) => {
    const { authenticator: auth, workspace, globalGroup } = testContext;
    const space =
      kind === "project"
        ? await SpaceFactory.project(workspace)
        : await SpaceFactory.regular(workspace);
    if (readable) {
      await SpaceFactory.attachGroup(space, globalGroup);
    }
    await auth.refresh();
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
    const document = await SkillResource.fetchSearchDocument(auth, skill.sId);
    assert(canonical && document);
    expect(canonical.canRead(auth)).toBe(readable);

    expect(document.requested_space_ids).toEqual([space.sId]);
    expect(document).not.toHaveProperty("manuallyRequestedSpaceIds");
    expect(document).not.toHaveProperty("metadata");
    const strict = await SkillResource.authorizeSearchDocuments(auth, [
      { document, score: 42 },
    ]);
    expect([...strict.values()]).toEqual(
      readable ? [canonical.toSearchJSON(auth, 42)] : []
    );
    const redacted = await SkillResource.authorizeSearchDocuments(
      auth,
      [{ document, score: 1 }],
      "redact_unreadable"
    );
    const listing = redacted.get(skill.sId);
    assert(listing);
    const { score: _score, ...listItem } = listing;
    expect(SkillListItemSchema.strict().parse(listItem)).toEqual(
      canonical.toListJSON(auth)
    );
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
    vi.mocked(launchIndexSkillSearchWorkflow).mockClear();
    const favorited = await skill.setFavorite(auth, true);
    expect(favorited.isOk()).toBe(true);
    const alreadyFavorite = await skill.setFavorite(auth, true);
    expect(alreadyFavorite.isOk()).toBe(true);
    expect(launchIndexSkillSearchWorkflow).toHaveBeenCalledOnce();
    expect(launchIndexSkillSearchWorkflow).toHaveBeenCalledWith({
      workspaceId: workspace.sId,
      skillId: skill.sId,
    });
    const document = await SkillResource.fetchSearchDocument(auth, skill.sId);
    assert(document);
    expect(Object.keys(document).sort()).toEqual(
      Object.keys(skillSearchMapping.properties).sort()
    );
    expect(document).toMatchObject({
      description: skill.userFacingDescription,
      last_edited_by_user_id: skill.editedBy,
      editor_ids: [auth.getNonNullableUser().sId],
      mcp_server_view_ids: [tool.sId],
      favorite_count: 1,
      active_users_count: 0,
      is_default: true,
      requested_space_ids: [globalSpace.sId],
      created_at: skill.createdAt.toISOString(),
    });
    expect(document).not.toHaveProperty("instructions");
    expect(document).not.toHaveProperty("metadata");
    expect(skillSearchMapping.properties.created_at).toEqual({ type: "date" });
    expect(document).not.toHaveProperty("non_pod_space_ids");
    expect(document).not.toHaveProperty("non_pod_space_count");
    expect(document).not.toHaveProperty("pod_space_id");

    const unfavorited = await skill.setFavorite(auth, false);
    expect(unfavorited.isOk()).toBe(true);
    const updated = await SkillResource.fetchSearchDocument(auth, skill.sId);
    expect(updated?.favorite_count).toBe(0);
    expect(launchIndexSkillSearchWorkflow).toHaveBeenCalledTimes(2);
  });
  it("fails closed when permission-bearing fields are stale", async () => {
    const regularSpace = await SpaceFactory.regular(testContext.workspace);
    await SpaceFactory.attachGroup(regularSpace, testContext.globalGroup);
    await testContext.authenticator.refresh();
    const skill = await SkillFactory.create(testContext.authenticator, {
      requestedSpaceIds: [regularSpace.id],
    });
    const document = await SkillResource.fetchSearchDocument(
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
      { ...document, editor_ids: ["another-user"] },
      {
        ...document,
        editor_ids: "another-user" as unknown as string[],
      },
      {
        ...document,
        requested_space_ids: regularSpace.sId as unknown as string[],
      },
      { ...document, workspace_id: "workspace-invalid" },
    ];

    await expect(
      SkillResource.filterSearchDocumentsByCurrentState(
        testContext.authenticator,
        [document, ...staleDocuments]
      )
    ).resolves.toEqual([document]);

    await skill.archive(testContext.authenticator);
    await expect(
      SkillResource.filterSearchDocumentsByCurrentState(
        testContext.authenticator,
        [document]
      )
    ).resolves.toEqual([]);
  });

  it("lists backfill candidates through listByWorkspace, excluding code-defined and suggested skills", async () => {
    const firstActiveSkill = await SkillFactory.create(
      testContext.authenticator,
      { name: "First active skill" }
    );
    const archivedSkill = await SkillFactory.create(testContext.authenticator, {
      name: "Archived skill",
      status: "archived",
    });
    await SkillFactory.create(testContext.authenticator, {
      name: "Suggested skill",
      status: "suggested",
    });
    const secondActiveSkill = await SkillFactory.create(
      testContext.authenticator,
      { name: "Second active skill" }
    );

    const skills = await SkillResource.listByWorkspace(
      testContext.authenticator,
      {
        status: ["active", "archived"],
        onlyCustom: true,
        permissionFiltering: "dangerously_skip",
        withInstructions: false,
        withTools: false,
        withFileAttachments: false,
      }
    );
    expect(skills.map((skill) => skill.sId).sort()).toEqual(
      [firstActiveSkill.sId, archivedSkill.sId, secondActiveSkill.sId].sort()
    );
  });
});
