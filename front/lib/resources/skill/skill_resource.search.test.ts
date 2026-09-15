import { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import skillSearchMapping from "@app/lib/skill_search/indices/skills_1.mappings.json";
import { launchIndexSkillSearchWorkflow } from "@app/temporal/es_indexation/client";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
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

  it("requires the caller in indexed editor IDs for editors-only candidates", async () => {
    const { authenticator: auth } = testContext;
    const skill = await SkillFactory.create(auth, { availability: "editors" });
    const [document] = await SkillFactory.createSearchDocuments(auth, [skill]);
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
    "workspace_users",
    "editors",
  ] as const)("allows stale editor lists for %s skills while checking current access", async (availability) => {
    const { authenticator: auth, workspace, user } = testContext;
    const formerEditor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, formerEditor, {
      role: "user",
    });
    const skill = await SkillFactory.create(auth, { availability });
    expect((await skill.addEditors(auth, [formerEditor])).isOk()).toBe(true);
    const [document] = await SkillFactory.createSearchDocuments(auth, [skill]);
    assert(document);

    expect((await skill.removeEditors(auth, [formerEditor])).isOk()).toBe(true);
    const editors = await skill.listEditors(auth);
    expect(editors?.map((editor) => editor.sId)).toEqual([user.sId]);
    expect(document.editor_ids).toContain(formerEditor.sId);

    const visible = await SkillResource.authorizeSearchDocuments(auth, [
      { document, score: 1 },
    ]);
    expect(visible.has(skill.sId)).toBe(true);

    const formerEditorAuth = await Authenticator.fromUserIdAndWorkspaceId(
      formerEditor.sId,
      workspace.sId
    );
    const formerEditorResults = await SkillResource.authorizeSearchDocuments(
      formerEditorAuth,
      [{ document, score: 1 }]
    );
    expect(formerEditorResults.has(skill.sId)).toBe(availability !== "editors");
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
    const [document] = await SkillFactory.createSearchDocuments(auth, [skill]);
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

  it("serializes tools and favorites without indexing instructions", async () => {
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
    const current = await SkillResource.fetchById(auth, skill.sId);
    assert(current);
    const [document] = await SkillFactory.createSearchDocuments(auth, [
      current,
    ]);
    assert(document);
    expect(Object.keys(document).sort()).toEqual(
      Object.keys(skillSearchMapping.properties).sort()
    );
    expect(document).toMatchObject({
      description: skill.userFacingDescription,
      last_edited_by_user_id: auth.getNonNullableUser().sId,
      editor_ids: [auth.getNonNullableUser().sId],
      mcp_server_view_ids: [tool.sId],
      favorite_count: 1,
      active_users_count: 0,
      requested_space_ids: [globalSpace.sId],
      created_at: skill.createdAt.toISOString(),
    });
    expect(
      current.toSearchDocument(workspace, {
        lastEditedByUserId: document.last_edited_by_user_id,
        editorIds: document.editor_ids,
        activeUsersCount: null,
      })
    ).toEqual({ ...document, active_users_count: null });
    expect(document).not.toHaveProperty("instructions");
    expect(document).not.toHaveProperty("metadata");
    expect(document).not.toHaveProperty("is_default");
    expect(skillSearchMapping.properties.created_at).toEqual({ type: "date" });
    expect(document).not.toHaveProperty("non_pod_space_ids");
    expect(document).not.toHaveProperty("non_pod_space_count");
    expect(document).not.toHaveProperty("pod_space_id");

    const unfavorited = await skill.setFavorite(auth, false);
    expect(unfavorited.isOk()).toBe(true);
    const updatedSkill = await SkillResource.fetchById(auth, skill.sId);
    assert(updatedSkill);
    const [updated] = await SkillFactory.createSearchDocuments(auth, [
      updatedSkill,
    ]);
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
    const [document] = await SkillFactory.createSearchDocuments(
      testContext.authenticator,
      [skill]
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

    const visible = await SkillResource.authorizeSearchDocuments(
      testContext.authenticator,
      [document, ...staleDocuments].map((document) => ({ document, score: 1 }))
    );
    expect([...visible.values()]).toEqual([
      skill.toSearchJSON(testContext.authenticator, 1),
    ]);

    await skill.archive(testContext.authenticator);
    const archived = await SkillResource.authorizeSearchDocuments(
      testContext.authenticator,
      [{ document, score: 1 }]
    );
    expect(archived.size).toBe(0);
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
