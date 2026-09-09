import { Authenticator } from "@app/lib/auth";
import { AgentRequirementsResource } from "@app/lib/resources/agent/agent_requirements_resource";
import { AgentSearchDocumentResource } from "@app/lib/resources/agent/agent_search_document_resource";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { launchIndexAgentSearchWorkflow } from "@app/temporal/es_indexation/client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { TagFactory } from "@app/tests/utils/TagFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { beforeEach, describe, expect, it, vi } from "vitest";

const AGENT_MODEL_ID = 42;

describe("AgentResource", () => {
  let testContext: Awaited<ReturnType<typeof createResourceTest>>;

  beforeEach(async () => {
    testContext = await createResourceTest({ role: "user" });
  });

  it("repairs orphaned space requirements in one workspace without changing other fields", async () => {
    const { authenticator: auth, globalSpace } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      requestedSpaceIds: [globalSpace.id],
    });
    const other = await createResourceTest({ role: "admin" });
    const foreignSpace = await SpaceFactory.regular(other.workspace);
    const foreignAgent = await AgentConfigurationFactory.createTestAgent(
      other.authenticator
    );
    const foreignBefore = await AgentSearchDocumentResource.fetchSearchDocument(
      other.authenticator,
      foreignAgent.sId
    );
    await AgentRequirementsResource.update(auth, {
      agentModelId: agent.id,
      newSpaceIds: [globalSpace.id, foreignSpace.id],
    });
    const before = await AgentResource.getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "full",
      dangerouslySkipPermissionFiltering: true,
    });
    expect(before).not.toBeNull();
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
    expect(
      await AgentResource.repairOrphanedSpaceRequirements(auth, {
        dryRun: true,
      })
    ).toEqual({
      configurationCount: 1,
      agentIds: [agent.sId],
    });
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(auth, agent.sId)
    ).toBeNull();
    expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();

    expect(await AgentResource.repairOrphanedSpaceRequirements(auth)).toEqual({
      configurationCount: 1,
      agentIds: [agent.sId],
    });
    expect(
      await AgentResource.getAgentConfiguration(auth, {
        agentId: agent.sId,
        variant: "full",
        dangerouslySkipPermissionFiltering: true,
      })
    ).toEqual({
      ...before,
      requestedSpaceIds: [globalSpace.sId],
      canRead: true,
    });
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(auth, agent.sId)
    ).toMatchObject({
      requested_space_ids: [globalSpace.sId],
    });
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(
        other.authenticator,
        foreignAgent.sId
      )
    ).toEqual(foreignBefore);
    expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: auth.getNonNullableWorkspace().sId,
      agentId: agent.sId,
    });
    expect(await AgentResource.repairOrphanedSpaceRequirements(auth)).toEqual({
      configurationCount: 0,
      agentIds: [],
    });
  });

  it("builds a custom agent resource from a rendered configuration", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator
    );

    const resource = await AgentResource.fetchByAgentConfiguration(
      testContext.authenticator,
      agent
    );

    expect(resource.id).not.toBeNull();
    expect(resource.sId).toBe(agent.sId);
    expect(resource.workspaceId).toBe(testContext.workspace.id);
  });

  it("applies author, admin, and editor permissions to custom agents", async () => {
    const resource = AgentResource.fromAgentConfigurationModel({
      agentId: AGENT_MODEL_ID,
      authorId: testContext.user.id,
      sId: "custom-agent",
      scope: "hidden",
      workspaceId: testContext.workspace.id,
    });

    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(testContext.workspace, otherUser, {
      role: "user",
    });
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      testContext.workspace.sId
    );

    const admin = await UserFactory.basic();
    await MembershipFactory.associate(testContext.workspace, admin, {
      role: "admin",
    });
    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      admin.sId,
      testContext.workspace.sId
    );

    expect(resource.id).toBe(AGENT_MODEL_ID);
    expect([
      testContext.authenticator.hasPermission("read", resource),
      testContext.authenticator.hasPermission("write", resource),
      testContext.authenticator.hasPermission("admin", resource),
    ]).toEqual([true, true, true]);
    expect([
      otherAuth.hasPermission("read", resource),
      otherAuth.hasPermission("write", resource),
      otherAuth.hasPermission("admin", resource),
    ]).toEqual([false, false, false]);
    expect([
      adminAuth.hasPermission("read", resource),
      adminAuth.hasPermission("write", resource),
      adminAuth.hasPermission("admin", resource),
    ]).toEqual([true, false, true]);

    const grantResult = await GroupPermissionResource.grantToUser(
      testContext.authenticator,
      {
        user: otherUser.toJSON(),
        grantType: "editor",
        resourceType: "agent",
        resourceId: AGENT_MODEL_ID,
      }
    );
    expect(grantResult.isOk()).toBe(true);
    await otherAuth.refresh();

    expect([
      otherAuth.hasPermission("read", resource),
      otherAuth.hasPermission("write", resource),
      otherAuth.hasPermission("admin", resource),
    ]).toEqual([true, true, true]);
  });

  it("lets workspace members read visible agents without editing them", async () => {
    const resource = AgentResource.fromAgentConfigurationModel({
      agentId: AGENT_MODEL_ID,
      authorId: testContext.user.id,
      sId: "custom-agent",
      scope: "visible",
      workspaceId: testContext.workspace.id,
    });

    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(testContext.workspace, otherUser, {
      role: "user",
    });
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      testContext.workspace.sId
    );

    expect(otherAuth.hasPermission("read", resource)).toBe(true);
    expect(otherAuth.hasPermission("write", resource)).toBe(false);
    expect(otherAuth.hasPermission("admin", resource)).toBe(false);
  });

  it("keeps code-defined global agents read-only and audience-scoped", async () => {
    const helper = AgentResource.fromGlobalAgent({
      agentId: GLOBAL_AGENTS_SID.HELPER,
      workspaceModelId: testContext.workspace.id,
    });
    const analyst = AgentResource.fromGlobalAgent({
      agentId: GLOBAL_AGENTS_SID.ANALYST,
      workspaceModelId: testContext.workspace.id,
    });

    const manager = await UserFactory.basic();
    await MembershipFactory.associate(testContext.workspace, manager, {
      role: "manager",
    });
    const managerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      manager.sId,
      testContext.workspace.sId
    );

    expect(testContext.authenticator.hasPermission("read", helper)).toBe(true);
    expect(testContext.authenticator.hasPermission("write", helper)).toBe(
      false
    );
    expect(testContext.authenticator.hasPermission("admin", helper)).toBe(
      false
    );
    expect(testContext.authenticator.hasPermission("read", analyst)).toBe(
      false
    );
    expect(managerAuth.hasPermission("read", analyst)).toBe(true);
    expect(managerAuth.hasPermission("write", analyst)).toBe(false);
    expect(managerAuth.hasPermission("admin", analyst)).toBe(false);
  });

  it("commits a complete version and rolls back a late invalid tool write", async () => {
    const {
      authenticator: auth,
      workspace,
      user,
      globalSpace,
    } = await createResourceTest({ role: "admin" });
    const server = await RemoteMCPServerFactory.create(workspace);
    const view = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      globalSpace
    );
    const skill = await SkillFactory.create(auth);
    const firstTag = await TagFactory.create(workspace, { name: "First tag" });
    const secondTag = await TagFactory.create(workspace, {
      name: "Second tag",
    });
    const fields: Parameters<typeof AgentResource.createAgentConfiguration>[1] =
      {
        name: "Atomic agent",
        description: "Complete agent version",
        instructions: "Private instructions",
        instructionsHtml: null,
        pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
        status: "active",
        scope: "visible",
        model: {
          providerId: "openai",
          modelId: "gpt-5-mini",
          temperature: 0.7,
        },
        templateId: null,
        requestedSpaceIds: [globalSpace.id],
        tags: [firstTag.toJSON(), secondTag.toJSON()],
        editors: [user.toJSON()],
        authorId: user.id,
        skills: [skill],
        actions: [
          {
            type: "mcp_server_configuration",
            name: "test_tool",
            description: "Test tool",
            mcpServerViewId: view.sId,
            dataSources: null,
            tables: null,
            childAgentId: null,
            timeFrame: null,
            jsonSchema: null,
            additionalConfiguration: {},
            dustAppConfiguration: null,
            secretName: null,
            dustProject: null,
          },
        ],
      };
    const created = await AgentResource.createAgentConfiguration(auth, fields);
    expect(created.isOk()).toBe(true);
    if (created.isErr()) {
      throw created.error;
    }
    const identity = await AgentResource.fetchByAgentConfiguration(
      auth,
      created.value
    );
    expect(created.value.actions).toHaveLength(1);
    expect(
      (await SkillResource.listByAgentConfiguration(auth, created.value)).map(
        (s) => s.sId
      )
    ).toEqual([skill.sId]);

    const invalidUpdate = await AgentResource.createAgentConfiguration(auth, {
      ...fields,
      agentConfigurationId: created.value.sId,
      name: "Should roll back",
      actions: fields.actions?.map((action) => ({
        ...action,
        jsonSchema: { type: "string", minLength: -1 },
      })),
    });
    expect(invalidUpdate.isErr()).toBe(true);
    expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledOnce();
    const current = await AgentResource.getAgentConfiguration(auth, {
      agentId: created.value.sId,
      variant: "full",
    });
    expect(current?.id).toBe(created.value.id);
    expect(current?.name).toBe(fields.name);
    expect(current?.status).toBe("active");
    expect(current?.actions).toHaveLength(1);
    expect(current?.tags).toEqual([firstTag.toJSON(), secondTag.toJSON()]);

    const upgraded = await AgentResource.createAgentConfiguration(auth, {
      ...fields,
      agentConfigurationId: created.value.sId,
      name: "Updated atomic agent",
    });
    expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledTimes(2);
    expect(upgraded.isOk()).toBe(true);
    if (upgraded.isErr()) {
      throw upgraded.error;
    }
    expect(upgraded.value.version).toBe(created.value.version + 1);
    expect(
      (await AgentResource.fetchByAgentConfiguration(auth, upgraded.value)).id
    ).toBe(identity.id);
    expect(upgraded.value.actions).toHaveLength(1);
    const latest = await AgentResource.getAgentConfiguration(auth, {
      agentId: upgraded.value.sId,
      variant: "full",
    });
    expect(latest?.tags).toEqual([firstTag.toJSON(), secondTag.toJSON()]);
    expect(
      (await SkillResource.listByAgentConfiguration(auth, upgraded.value)).map(
        (s) => s.sId
      )
    ).toEqual([skill.sId]);
  });

  it("defers indexation to the outer commit and never indexes code-defined agents", async () => {
    const { authenticator: auth } = testContext;
    await frontSequelize.transaction(async (outer) => {
      await frontSequelize.transaction(
        { transaction: outer },
        async (inner) => {
          await AgentResource.launchSearchIndexation(
            auth,
            ["custom-agent", "custom-agent", GLOBAL_AGENTS_SID.HELPER],
            { transaction: inner }
          );
        }
      );
      expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();
    });
    expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: testContext.workspace.sId,
      agentId: "custom-agent",
    });
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
    const rolledBack = await frontSequelize.transaction();
    await AgentResource.launchSearchIndexation(auth, ["custom-agent"], {
      transaction: rolledBack,
    });
    await rolledBack.rollback();
    expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();
  });

  it("restores earlier outer-transaction writes when agent creation is rolled back", async () => {
    const { authenticator: auth, workspace, user } = testContext;
    const skill = await SkillFactory.create(auth);
    const internalAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    let agentId = "";
    const rollback = new Error("Rollback outer agent creation");
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();

    await expect(
      withTransaction(
        async (transaction) => {
          await skill.archive(auth, { transaction });
          const result = await AgentResource.createAgentConfiguration(
            internalAuth,
            {
              name: "Rolled-back agent",
              description: "Transaction regression",
              instructions: "Private instructions",
              instructionsHtml: null,
              pictureUrl:
                "https://dust.tt/static/systemavatar/test_avatar_1.png",
              status: "active",
              scope: "visible",
              model: {
                providerId: "openai",
                modelId: "gpt-5-mini",
                temperature: 0.7,
              },
              templateId: null,
              requestedSpaceIds: [],
              tags: [],
              editors: [user.toJSON()],
              authorId: user.id,
            },
            transaction
          );
          expect(result.isOk()).toBe(true);
          if (result.isErr()) {
            throw result.error;
          }
          agentId = result.value.sId;
          expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();
          throw rollback;
        },
        undefined,
        { useSavepoint: true }
      )
    ).rejects.toBe(rollback);

    expect((await SkillResource.fetchById(auth, skill.sId))?.status).toBe(
      "active"
    );
    expect(
      await AgentSearchDocumentResource.fetchSearchDocument(
        internalAuth,
        agentId
      )
    ).toBeNull();
    const identities =
      await AgentSearchDocumentResource.listSearchIndexAgentIds(internalAuth, {
        afterAgentModelId: null,
        limit: 100,
      });
    expect(identities.map((identity) => identity.agentId)).not.toContain(
      agentId
    );
    expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();
  });

  it("does not enqueue rolled-back or cross-workspace requirement changes", async () => {
    const { authenticator: auth, globalSpace } = testContext;
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    vi.mocked(launchIndexAgentSearchWorkflow).mockClear();
    // This savepoint sees the fixture created inside the test's isolation transaction.
    const rolledBack = new Error("Rollback requirements");
    const { withTransaction } = await import("@app/lib/utils/sql_utils");
    await expect(
      withTransaction(
        async (transaction) => {
          await AgentRequirementsResource.update(
            auth,
            { agentModelId: agent.id, newSpaceIds: [globalSpace.id] },
            { transaction }
          );
          expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();
          throw rolledBack;
        },
        undefined,
        { useSavepoint: true }
      )
    ).rejects.toBe(rolledBack);
    expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();
    const other = await createResourceTest({ role: "admin" });
    const result = await AgentRequirementsResource.update(other.authenticator, {
      agentModelId: agent.id,
      newSpaceIds: [],
    });
    expect(result.isOk() && result.value).toBe(false);
    expect(launchIndexAgentSearchWorkflow).not.toHaveBeenCalled();
    await AgentRequirementsResource.update(auth, {
      agentModelId: agent.id,
      newSpaceIds: [globalSpace.id],
    });
    expect(launchIndexAgentSearchWorkflow).toHaveBeenCalledExactlyOnceWith({
      workspaceId: testContext.workspace.sId,
      agentId: agent.sId,
    });
  });
});
