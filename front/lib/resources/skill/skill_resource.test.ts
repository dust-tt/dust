import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import {
  SkillConfigurationModel,
  SkillDataSourceConfigurationModel,
} from "@app/lib/models/skill";
import { SkillUserFavoriteModel } from "@app/lib/models/skill/skill_user_favorite";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/code_defined/global_registry";
import type { SkillAttachedKnowledge } from "@app/lib/resources/skill/skill_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import type { UserResource } from "@app/lib/resources/user_resource";
import { serializeSkillTag } from "@app/lib/skills/format";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { getTestStreamEndpoint } from "@app/tests/utils/models";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WHOLE_TYPE_RESOURCE_ID } from "@app/types/group_permissions";
import type { MembershipRoleType } from "@app/types/memberships";
import type { ModelId } from "@app/types/shared/model_id";
import assert from "assert";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("SkillResource", () => {
  let testContext: Awaited<ReturnType<typeof createResourceTest>>;
  const createdConfigurations: SkillDataSourceConfigurationModel[] = [];

  beforeEach(async () => {
    testContext = await createResourceTest({ role: "admin" });
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    // Clean up created configurations
    for (const config of createdConfigurations) {
      await config.destroy();
    }
    createdConfigurations.length = 0;
  });

  describe("permissions", () => {
    it("allows any API key to write and administrate skills, regardless of role", async () => {
      const skill = await SkillFactory.create(testContext.authenticator);
      // Keys have no editor-group assignment mechanism, so even the least-privileged key
      // role ("user") must be allowed here — there is no role distinction left to gate on.
      const key = await KeyFactory.readOnly(testContext.globalGroup);

      const auth = await Authenticator.fromKey(key, testContext.workspace.sId);

      expect(skill.canWrite(auth)).toBe(true);
      expect(skill.canAdministrate(auth)).toBe(true);
    });
  });

  describe("read grants", () => {
    it("reads a skill through the global group's workspace-wide reader grant", async () => {
      const skill = await SkillFactory.create(testContext.authenticator, {
        name: "Skill With A Read Grant",
      });

      const grants = await GroupPermissionResource.listForResource(
        testContext.authenticator,
        { resourceType: "skill", resourceId: skill.id }
      );

      expect(
        grants.some(
          (grant) =>
            grant.groupId === testContext.globalGroup.id &&
            grant.grantType === "reader" &&
            grant.resourceId === WHOLE_TYPE_RESOURCE_ID
        )
      ).toBe(true);

      const auth = await Authenticator.fromUserIdAndWorkspaceId(
        testContext.user.sId,
        testContext.workspace.sId
      );
      expect(skill.canRead(auth)).toBe(true);
    });

    it("lets any workspace member read a skill they did not create", async () => {
      const skill = await SkillFactory.create(testContext.authenticator, {
        name: "Skill Read By Anyone",
      });

      const otherUser = await UserFactory.basic();
      await MembershipFactory.associate(testContext.workspace, otherUser, {
        role: "user",
      });
      const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
        otherUser.sId,
        testContext.workspace.sId
      );

      // Not an editor, so no `editor` grant: read comes from the role grants until they are
      // dropped, and from the global group's workspace-wide `reader` grant after that.
      expect(skill.canRead(otherAuth)).toBe(true);
      expect(skill.canWrite(otherAuth)).toBe(false);

      const fetched = await SkillResource.fetchById(otherAuth, skill.sId);
      expect(fetched?.sId).toBe(skill.sId);
    });
  });

  describe("editor grants", () => {
    // The per-user grants on a skill, straight from the table.
    async function fetchSkillGrants(skillModelId: ModelId) {
      const group = await GroupPermissionResource.findRegularAutoGroupForGrant(
        testContext.authenticator,
        {
          grantType: "editor",
          resourceType: "skill",
          resourceId: skillModelId,
        }
      );

      return group
        ? group.getActiveMembers(testContext.authenticator)
        : ([] as UserResource[]);
    }

    it("grants the creator on creation", async () => {
      const skill = await SkillFactory.create(testContext.authenticator, {
        name: "Skill With Grants",
      });

      const editors = await fetchSkillGrants(skill.id);
      expect(editors.map((editor) => editor.sId)).toContain(
        testContext.user.sId
      );
    });

    it("clears the grants when the skill is deleted", async () => {
      const skill = await SkillFactory.create(testContext.authenticator, {
        name: "Skill To Delete With Grants",
      });
      expect(await fetchSkillGrants(skill.id)).toHaveLength(1);

      const result = await skill.delete(testContext.authenticator);
      expect(result.isOk()).toBe(true);

      expect(await fetchSkillGrants(skill.id)).toHaveLength(0);
    });

    it("is idempotent: granting the same editor twice keeps one member", async () => {
      const skill = await SkillFactory.create(testContext.authenticator, {
        name: "Skill Granted Twice",
      });

      const editor = await UserFactory.basic();
      await MembershipFactory.associate(testContext.workspace, editor, {
        role: "user",
      });

      expect(
        (await skill.addEditors(testContext.authenticator, [editor])).isOk()
      ).toBe(true);
      expect(
        (await skill.addEditors(testContext.authenticator, [editor])).isOk()
      ).toBe(true);

      const editors = await fetchSkillGrants(skill.id);
      expect(
        editors.filter((member) => member.sId === editor.sId)
      ).toHaveLength(1);
    });
  });

  describe("listByWorkspace", () => {
    it("omits custom skill instructions when they are not requested", async () => {
      await SkillFactory.create(testContext.authenticator, {
        instructions: "Large instructions",
        instructionsHtml: "<p>Large instructions</p>",
      });

      const [skill] = await SkillResource.listByWorkspace(
        testContext.authenticator,
        {
          onlyCustom: true,
          withInstructions: false,
          withTools: false,
          withFileAttachments: false,
        }
      );

      expect(skill.instructions).toBe("");
      expect(skill.instructionsHtml).toBeNull();
    });
  });

  describe("favorites", () => {
    it("stores one row per user and updates custom skill favorite counts", async () => {
      const skillA = await SkillFactory.create(testContext.authenticator, {
        name: "Favorite Skill A",
      });
      const skillB = await SkillFactory.create(testContext.authenticator, {
        name: "Favorite Skill B",
      });

      await skillA.setFavorite(testContext.authenticator, false);
      expect(
        await skillA.isFavoriteForCurrentUser(testContext.authenticator)
      ).toBe(false);
      expect(
        await SkillUserFavoriteModel.count({
          where: {
            workspaceId: testContext.workspace.id,
            userId: testContext.user.id,
          },
        })
      ).toBe(0);

      await skillA.setFavorite(testContext.authenticator, true);
      await skillA.setFavorite(testContext.authenticator, true);
      await skillB.setFavorite(testContext.authenticator, true);
      expect(
        await skillA.isFavoriteForCurrentUser(testContext.authenticator)
      ).toBe(true);
      expect(
        await skillB.isFavoriteForCurrentUser(testContext.authenticator)
      ).toBe(true);

      const favoriteRows = await SkillUserFavoriteModel.findAll({
        where: {
          workspaceId: testContext.workspace.id,
          userId: testContext.user.id,
        },
      });
      expect(favoriteRows).toHaveLength(1);
      expect(favoriteRows[0].skillIds).toEqual([skillA.sId, skillB.sId]);

      await skillA.setFavorite(testContext.authenticator, false);
      await skillA.setFavorite(testContext.authenticator, false);

      await favoriteRows[0].reload();
      expect(favoriteRows[0].skillIds).toEqual([skillB.sId]);
      expect(
        await skillA.isFavoriteForCurrentUser(testContext.authenticator)
      ).toBe(false);

      const [skillAModel, skillBModel] = await SkillConfigurationModel.findAll({
        where: {
          id: [skillA.id, skillB.id],
          workspaceId: testContext.workspace.id,
        },
        order: [["id", "ASC"]],
      });
      expect(skillAModel.favoriteCount).toBe(0);
      expect(skillBModel.favoriteCount).toBe(1);
    });
  });

  // Helper function to create real SkillDataSourceConfigurationModel instances
  async function createDataSourceConfiguration({
    dataSourceView,
    parentsIn,
    skillId,
  }: {
    dataSourceView: DataSourceViewResource;
    parentsIn: string[];
    skillId: number;
  }): Promise<SkillDataSourceConfigurationModel> {
    const config = await SkillDataSourceConfigurationModel.create({
      dataSourceId: dataSourceView.dataSource.id,
      dataSourceViewId: dataSourceView.id,
      parentsIn,
      skillConfigurationId: skillId,
      workspaceId: testContext.workspace.id,
    });

    createdConfigurations.push(config);
    return config;
  }

  describe("computeDataSourceConfigurationChanges", () => {
    let dataSourceView1: DataSourceViewResource;
    let dataSourceView2: DataSourceViewResource;
    let dataSourceView3: DataSourceViewResource;

    beforeEach(async () => {
      // Create test data source views.
      dataSourceView1 = await DataSourceViewFactory.folder(
        testContext.workspace,
        testContext.globalSpace,
        testContext.user
      );
      dataSourceView2 = await DataSourceViewFactory.folder(
        testContext.workspace,
        testContext.globalSpace,
        testContext.user
      );
      dataSourceView3 = await DataSourceViewFactory.folder(
        testContext.workspace,
        testContext.globalSpace,
        testContext.user
      );
    });

    it("should handle new configurations correctly", () => {
      const attachedKnowledge: SkillAttachedKnowledge[] = [
        {
          dataSourceView: dataSourceView1,
          nodeId: "node1",
        },
        {
          dataSourceView: dataSourceView2,
          nodeId: "node2",
        },
      ];

      // Call the static method directly for unit testing.
      const { toDelete, toUpsert } =
        SkillResource.computeDataSourceConfigurationChanges(
          testContext.workspace,
          {
            attachedKnowledge,
            existingConfigurations: [], // No existing configurations.
            skillConfigurationId: 123, // Mock skill ID.
          }
        );

      expect(toDelete).toHaveLength(0);
      expect(toUpsert).toHaveLength(2);

      // Check first configuration.
      expect(toUpsert[0]).toEqual({
        dataSourceId: dataSourceView1.dataSource.id,
        dataSourceViewId: dataSourceView1.id,
        parentsIn: ["node1"],
        skillConfigurationId: 123,
        workspaceId: testContext.workspace.id,
      });

      // Check second configuration.
      expect(toUpsert[1]).toEqual({
        dataSourceId: dataSourceView2.dataSource.id,
        dataSourceViewId: dataSourceView2.id,
        parentsIn: ["node2"],
        skillConfigurationId: 123,
        workspaceId: testContext.workspace.id,
      });
    });

    it("should group multiple nodes for the same data source view", () => {
      const attachedKnowledge: SkillAttachedKnowledge[] = [
        {
          dataSourceView: dataSourceView1,
          nodeId: "node1",
        },
        {
          dataSourceView: dataSourceView1,
          nodeId: "node2",
        },
        {
          dataSourceView: dataSourceView2,
          nodeId: "node3",
        },
      ];

      const { toDelete, toUpsert } =
        SkillResource.computeDataSourceConfigurationChanges(
          testContext.workspace,
          {
            attachedKnowledge,
            existingConfigurations: [],
            skillConfigurationId: 123,
          }
        );

      expect(toDelete).toHaveLength(0);
      expect(toUpsert).toHaveLength(2);

      // Find the configuration for dataSourceView1.
      const config1 = toUpsert.find(
        (config) => config.dataSourceViewId === dataSourceView1.id
      );
      expect(config1?.parentsIn).toEqual(["node1", "node2"]);

      // Find the configuration for dataSourceView2.
      const config2 = toUpsert.find(
        (config) => config.dataSourceViewId === dataSourceView2.id
      );
      expect(config2?.parentsIn).toEqual(["node3"]);
    });

    it("should detect configurations that need deletion", async () => {
      const skillResource = await SkillFactory.create(
        testContext.authenticator,
        {}
      );

      // Create real database configurations.
      const existingConfigurations = [
        await createDataSourceConfiguration({
          dataSourceView: dataSourceView1,
          parentsIn: ["node1"],
          skillId: skillResource.id,
        }),
        await createDataSourceConfiguration({
          dataSourceView: dataSourceView2,
          parentsIn: ["node2"],
          skillId: skillResource.id,
        }),
      ];

      // Keep the same configuration for dataSourceView1, remove dataSourceView2.
      const attachedKnowledge: SkillAttachedKnowledge[] = [
        {
          dataSourceView: dataSourceView1,
          nodeId: "node1",
        },
      ];

      const { toDelete, toUpsert } =
        SkillResource.computeDataSourceConfigurationChanges(
          testContext.workspace,
          {
            attachedKnowledge,
            existingConfigurations,
            skillConfigurationId: 123,
          }
        );

      expect(toDelete).toHaveLength(1);
      expect(toDelete[0].dataSourceViewId).toBe(dataSourceView2.id);
      // The remaining config is unchanged, so it should not be in toUpsert.
      expect(toUpsert).toHaveLength(0);
    });

    it("should detect when parentsIn has changed", async () => {
      const skillResource = await SkillFactory.create(
        testContext.authenticator,
        {}
      );

      const existingConfigurations = [
        await createDataSourceConfiguration({
          dataSourceView: dataSourceView1,
          parentsIn: ["node1", "node2"], // Old nodes.
          skillId: skillResource.id,
        }),
      ];

      // Change the nodes for dataSourceView1.
      const attachedKnowledge: SkillAttachedKnowledge[] = [
        {
          dataSourceView: dataSourceView1,
          nodeId: "node1", // Keep this one.
        },
        {
          dataSourceView: dataSourceView1,
          nodeId: "node3", // Change node2 to node3.
        },
      ];

      const { toDelete, toUpsert } =
        SkillResource.computeDataSourceConfigurationChanges(
          testContext.workspace,
          {
            attachedKnowledge,
            existingConfigurations,
            skillConfigurationId: 123,
          }
        );

      // Should delete the old configuration and upsert the new one.
      expect(toDelete).toHaveLength(1);
      expect(toDelete[0].dataSourceViewId).toBe(dataSourceView1.id);
      expect(toUpsert).toHaveLength(1);
      expect(toUpsert[0].parentsIn).toEqual(["node1", "node3"]);
    });

    it("should not include unchanged configurations in toUpsert", async () => {
      const skillResource = await SkillFactory.create(
        testContext.authenticator,
        {}
      );

      const existingConfigurations = [
        await createDataSourceConfiguration({
          dataSourceView: dataSourceView1,
          parentsIn: ["node1", "node2"], // Same nodes.
          skillId: skillResource.id,
        }),
      ];

      // Same configuration as existing.
      const attachedKnowledge: SkillAttachedKnowledge[] = [
        {
          dataSourceView: dataSourceView1,
          nodeId: "node2", // Order doesn't matter.
        },
        {
          dataSourceView: dataSourceView1,
          nodeId: "node1",
        },
      ];

      const { toDelete, toUpsert } =
        SkillResource.computeDataSourceConfigurationChanges(
          testContext.workspace,
          {
            attachedKnowledge,
            existingConfigurations,
            skillConfigurationId: 123,
          }
        );

      expect(toDelete).toHaveLength(0);
      expect(toUpsert).toHaveLength(0); // No changes detected.
    });

    it("should handle mixed scenarios: add, update, delete", async () => {
      const skillResource = await SkillFactory.create(
        testContext.authenticator,
        {}
      );

      const existingConfigurations = [
        await createDataSourceConfiguration({
          dataSourceView: dataSourceView1,
          parentsIn: ["node1"], // Will be updated.
          skillId: skillResource.id,
        }),
        await createDataSourceConfiguration({
          dataSourceView: dataSourceView2,
          parentsIn: ["node2"], // Will be deleted.
          skillId: skillResource.id,
        }),
      ];

      const attachedKnowledge: SkillAttachedKnowledge[] = [
        {
          dataSourceView: dataSourceView1,
          nodeId: "node1",
        },
        {
          dataSourceView: dataSourceView1,
          nodeId: "node1_new", // Add new node to existing DSV.
        },
        {
          dataSourceView: dataSourceView3, // New DSV.
          nodeId: "node3",
        },
        // dataSourceView2 is removed.
      ];

      const { toDelete, toUpsert } =
        SkillResource.computeDataSourceConfigurationChanges(
          testContext.workspace,
          {
            attachedKnowledge,
            existingConfigurations,
            skillConfigurationId: 123,
          }
        );

      // Should delete dataSourceView1 and dataSourceView2.
      expect(toDelete).toHaveLength(2);
      expect(toDelete[0].dataSourceViewId).toBe(dataSourceView1.id);
      expect(toDelete[1].dataSourceViewId).toBe(dataSourceView2.id);

      // Should upsert dataSourceView1 (updated) and dataSourceView3 (new).
      expect(toUpsert).toHaveLength(2);

      const updatedConfig = toUpsert.find(
        (config) => config.dataSourceViewId === dataSourceView1.id
      );
      expect(updatedConfig?.parentsIn).toEqual(["node1", "node1_new"]);

      const newConfig = toUpsert.find(
        (config) => config.dataSourceViewId === dataSourceView3.id
      );
      expect(newConfig?.parentsIn).toEqual(["node3"]);
    });

    it("should prevent duplicate nodeIds in the same configuration", () => {
      const attachedKnowledge: SkillAttachedKnowledge[] = [
        {
          dataSourceView: dataSourceView1,
          nodeId: "node1",
        },
        {
          dataSourceView: dataSourceView1,
          nodeId: "node1", // Duplicate.
        },
        {
          dataSourceView: dataSourceView1,
          nodeId: "node2",
        },
      ];

      const { toDelete, toUpsert } =
        SkillResource.computeDataSourceConfigurationChanges(
          testContext.workspace,
          {
            attachedKnowledge,
            existingConfigurations: [],
            skillConfigurationId: 123,
          }
        );

      expect(toDelete).toHaveLength(0);
      expect(toUpsert).toHaveLength(1);
      expect(toUpsert[0].parentsIn).toEqual(["node1", "node2"]); // No duplicates.
    });

    it("should create unique configurations and handle updates properly", async () => {
      const skillResource = await SkillFactory.create(
        testContext.authenticator,
        {}
      );

      // Initial creation - add two nodes to same data source view
      const initialConfigurations = [
        await createDataSourceConfiguration({
          dataSourceView: dataSourceView1,
          parentsIn: ["node1", "node2"],
          skillId: skillResource.id,
        }),
      ];

      // Update - add another node to the same data source view
      const attachedKnowledge: SkillAttachedKnowledge[] = [
        {
          dataSourceView: dataSourceView1,
          nodeId: "node1",
        },
        {
          dataSourceView: dataSourceView1,
          nodeId: "node2",
        },
        {
          dataSourceView: dataSourceView1,
          nodeId: "node3", // Adding new node
        },
      ];

      const { toDelete, toUpsert } =
        SkillResource.computeDataSourceConfigurationChanges(
          testContext.workspace,
          {
            attachedKnowledge,
            existingConfigurations: initialConfigurations,
            skillConfigurationId: skillResource.id,
          }
        );

      // Should delete the old configuration
      expect(toDelete).toHaveLength(1);
      expect(toDelete[0].dataSourceViewId).toBe(dataSourceView1.id);

      // Should create one new configuration with all three nodes
      expect(toUpsert).toHaveLength(1);
      expect(toUpsert[0].parentsIn).toEqual(["node1", "node2", "node3"]);

      // Verify only one configuration per skill+dataSourceView combination
      expect(toUpsert[0].dataSourceViewId).toBe(dataSourceView1.id);
      expect(toUpsert[0].skillConfigurationId).toBe(skillResource.id);
    });
  });

  describe("updateSkill", () => {
    it("updates availability and derives the serialized isDefault from it", async () => {
      const skillResource = await SkillFactory.create(
        testContext.authenticator,
        { name: "Test Skill For Availability Sync" }
      );

      expect(skillResource.availability).toBe("editors");
      expect(skillResource.toJSON(testContext.authenticator).isDefault).toBe(
        false
      );

      await skillResource.updateSkill(testContext.authenticator, {
        name: skillResource.name,
        agentFacingDescription: skillResource.agentFacingDescription,
        userFacingDescription: skillResource.userFacingDescription,
        instructions: skillResource.instructions,
        icon: skillResource.icon,
        availability: "users_and_agents",
        mcpServerViews: [],
        attachedKnowledge: [],
        manuallyRequestedSpaceIds: [],
        requestedSpaceIds: [],
      });

      const updatedSkill = await SkillResource.fetchById(
        testContext.authenticator,
        skillResource.sId
      );
      expect(updatedSkill?.availability).toBe("users_and_agents");
      expect(updatedSkill?.toJSON(testContext.authenticator).isDefault).toBe(
        true
      );

      await skillResource.updateSkill(testContext.authenticator, {
        name: skillResource.name,
        agentFacingDescription: skillResource.agentFacingDescription,
        userFacingDescription: skillResource.userFacingDescription,
        instructions: skillResource.instructions,
        icon: skillResource.icon,
        availability: "workspace_users",
        mcpServerViews: [],
        attachedKnowledge: [],
        manuallyRequestedSpaceIds: [],
        requestedSpaceIds: [],
      });

      const revertedSkill = await SkillResource.fetchById(
        testContext.authenticator,
        skillResource.sId
      );
      expect(revertedSkill?.availability).toBe("workspace_users");
      expect(revertedSkill?.toJSON(testContext.authenticator).isDefault).toBe(
        false
      );
    });

    it("should add skill space requirements to agents using the skill", async () => {
      const restrictedSpace = await SpaceFactory.regular(testContext.workspace);

      const skillResource = await SkillFactory.create(
        testContext.authenticator,
        { name: "Test Skill For Update" }
      );

      const agent = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        { name: "Test Agent With Skill" }
      );
      await SkillFactory.linkToAgent(testContext.authenticator, {
        skillId: skillResource.id,
        agentConfigurationId: agent.id,
      });

      const agentBefore = await AgentConfigurationModel.findOne({
        where: { id: agent.id, workspaceId: testContext.workspace.id },
      });
      expect(agentBefore?.requestedSpaceIds).toEqual([]);

      await skillResource.updateSkill(testContext.authenticator, {
        name: skillResource.name,
        agentFacingDescription: skillResource.agentFacingDescription,
        userFacingDescription: skillResource.userFacingDescription,
        instructions: skillResource.instructions,
        icon: skillResource.icon,
        mcpServerViews: [],
        attachedKnowledge: [],
        manuallyRequestedSpaceIds: [],
        requestedSpaceIds: [restrictedSpace.id],
      });

      const agentAfter = await AgentConfigurationModel.findOne({
        where: { id: agent.id, workspaceId: testContext.workspace.id },
      });
      expect(agentAfter?.requestedSpaceIds.map((id) => Number(id))).toContain(
        restrictedSpace.id
      );
    });

    it("should not duplicate requestedSpaceIds if already present on agent", async () => {
      const restrictedSpace = await SpaceFactory.regular(testContext.workspace);

      const skillResource = await SkillFactory.create(
        testContext.authenticator,
        {
          name: "Test Skill With Space",
          requestedSpaceIds: [restrictedSpace.id],
        }
      );

      const agent = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        { name: "Test Agent With Space" }
      );

      await AgentConfigurationModel.update(
        { requestedSpaceIds: [restrictedSpace.id] },
        { where: { id: agent.id, workspaceId: testContext.workspace.id } }
      );

      await SkillFactory.linkToAgent(testContext.authenticator, {
        skillId: skillResource.id,
        agentConfigurationId: agent.id,
      });

      await skillResource.updateSkill(testContext.authenticator, {
        name: skillResource.name,
        agentFacingDescription: skillResource.agentFacingDescription,
        userFacingDescription: skillResource.userFacingDescription,
        instructions: "Updated instructions",
        icon: skillResource.icon,
        mcpServerViews: [],
        attachedKnowledge: [],
        manuallyRequestedSpaceIds: [],
        requestedSpaceIds: [restrictedSpace.id],
      });

      const agentAfter = await AgentConfigurationModel.findOne({
        where: { id: agent.id, workspaceId: testContext.workspace.id },
      });
      const spaceIds = agentAfter?.requestedSpaceIds.map((id) => Number(id));
      expect(spaceIds?.filter((id) => id === restrictedSpace.id)).toHaveLength(
        1
      );
    });

    it("should remove space from agent when skill no longer requires it", async () => {
      const space1 = await SpaceFactory.regular(testContext.workspace);
      const space2 = await SpaceFactory.regular(testContext.workspace);
      await SpaceFactory.attachGroup(space1, testContext.globalGroup);
      await SpaceFactory.attachGroup(space2, testContext.globalGroup);

      const skillResource = await SkillFactory.create(
        testContext.authenticator,
        {
          name: "Test Skill With Spaces",
          requestedSpaceIds: [space1.id, space2.id],
        }
      );

      const agent = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        { name: "Test Agent" }
      );

      await AgentConfigurationModel.update(
        { requestedSpaceIds: [space1.id, space2.id] },
        { where: { id: agent.id, workspaceId: testContext.workspace.id } }
      );

      await SkillFactory.linkToAgent(testContext.authenticator, {
        skillId: skillResource.id,
        agentConfigurationId: agent.id,
      });

      // Remove space2 from the skill.
      await skillResource.updateSkill(testContext.authenticator, {
        name: skillResource.name,
        agentFacingDescription: skillResource.agentFacingDescription,
        userFacingDescription: skillResource.userFacingDescription,
        instructions: skillResource.instructions,
        icon: skillResource.icon,
        mcpServerViews: [],
        attachedKnowledge: [],
        manuallyRequestedSpaceIds: [],
        requestedSpaceIds: [space1.id],
      });

      const agentAfter = await AgentConfigurationModel.findOne({
        where: { id: agent.id, workspaceId: testContext.workspace.id },
      });
      const spaceIds = agentAfter?.requestedSpaceIds.map((id) => Number(id));

      expect(spaceIds).toContain(space1.id);
      expect(spaceIds).not.toContain(space2.id);
    });

    it("should keep space on agent if another skill still requires it", async () => {
      const sharedSpace = await SpaceFactory.regular(testContext.workspace);
      const skill1OnlySpace = await SpaceFactory.regular(testContext.workspace);
      await SpaceFactory.attachGroup(sharedSpace, testContext.globalGroup);
      await SpaceFactory.attachGroup(skill1OnlySpace, testContext.globalGroup);

      const skill1 = await SkillFactory.create(testContext.authenticator, {
        name: "Skill 1",
        requestedSpaceIds: [sharedSpace.id, skill1OnlySpace.id],
      });

      const skill2 = await SkillFactory.create(testContext.authenticator, {
        name: "Skill 2",
        requestedSpaceIds: [sharedSpace.id],
      });

      const agent = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        { name: "Test Agent" }
      );

      await AgentConfigurationModel.update(
        { requestedSpaceIds: [sharedSpace.id, skill1OnlySpace.id] },
        { where: { id: agent.id, workspaceId: testContext.workspace.id } }
      );

      await SkillFactory.linkToAgent(testContext.authenticator, {
        skillId: skill1.id,
        agentConfigurationId: agent.id,
      });
      await SkillFactory.linkToAgent(testContext.authenticator, {
        skillId: skill2.id,
        agentConfigurationId: agent.id,
      });

      // Remove sharedSpace from skill1 (skill2 still requires it).
      await skill1.updateSkill(testContext.authenticator, {
        name: skill1.name,
        agentFacingDescription: skill1.agentFacingDescription,
        userFacingDescription: skill1.userFacingDescription,
        instructions: skill1.instructions,
        icon: skill1.icon,
        mcpServerViews: [],
        attachedKnowledge: [],
        manuallyRequestedSpaceIds: [],
        requestedSpaceIds: [skill1OnlySpace.id],
      });

      const agentAfter = await AgentConfigurationModel.findOne({
        where: { id: agent.id, workspaceId: testContext.workspace.id },
      });
      const spaceIds = agentAfter?.requestedSpaceIds.map((id) => Number(id));

      // sharedSpace kept because skill2 still requires it.
      expect(spaceIds).toContain(sharedSpace.id);
      expect(spaceIds).toContain(skill1OnlySpace.id);
    });

    it("normalizes unavailable nested skill references when creating a parent skill", async () => {
      const restrictedSpace = await SpaceFactory.regular(testContext.workspace);
      const addAdminToRestrictedSpaceRes = await restrictedSpace.addMembers(
        testContext.authenticator,
        { userIds: [testContext.authenticator.getNonNullableUser().sId] }
      );
      expect(addAdminToRestrictedSpaceRes.isOk()).toBe(true);
      await testContext.authenticator.refresh();

      const childSkill = await SkillFactory.create(testContext.authenticator, {
        name: "Restricted Child Skill",
        requestedSpaceIds: [restrictedSpace.id],
      });
      const skillReferenceTag =
        SkillFactory.serializeSkillReferenceTag(childSkill);
      const skillReferenceHtmlTag = serializeSkillTag(
        {
          icon: childSkill.icon,
          id: childSkill.sId,
          name: childSkill.name,
        },
        { html: true }
      );

      const parentSkill = await SkillFactory.create(testContext.authenticator, {
        name: "Parent Skill",
        instructions: `Use ${skillReferenceTag}.`,
        instructionsHtml: `<p>Use ${skillReferenceHtmlTag}.</p>`,
      });

      expect(parentSkill.instructions).toContain(
        `<unavailable_skill id="${childSkill.sId}" />`
      );
      expect(parentSkill.instructionsHtml).toContain(
        `<unavailable_skill id="${childSkill.sId}"></unavailable_skill>`
      );
      await expect(
        parentSkill.fetchChildSkills(testContext.authenticator)
      ).resolves.toEqual([
        expect.objectContaining({
          sId: childSkill.sId,
        }),
      ]);

      await parentSkill.updateSkill(testContext.authenticator, {
        name: parentSkill.name,
        agentFacingDescription: "Updated agent description",
        userFacingDescription: parentSkill.userFacingDescription,
        instructions: parentSkill.instructions,
        instructionsHtml: parentSkill.instructionsHtml,
        icon: parentSkill.icon,
        mcpServerViews: [],
        attachedKnowledge: [],
        manuallyRequestedSpaceIds: parentSkill.manuallyRequestedSpaceIds,
        requestedSpaceIds: parentSkill.requestedSpaceIds,
      });

      const updatedParentSkill = await SkillResource.fetchById(
        testContext.authenticator,
        parentSkill.sId
      );
      expect(updatedParentSkill?.instructions).toContain(
        `<unavailable_skill id="${childSkill.sId}" />`
      );
      expect(updatedParentSkill?.instructionsHtml).toContain(
        `<unavailable_skill id="${childSkill.sId}"></unavailable_skill>`
      );
      await expect(
        updatedParentSkill!.fetchChildSkills(testContext.authenticator)
      ).resolves.toEqual([
        expect.objectContaining({
          sId: childSkill.sId,
        }),
      ]);
    });

    it("normalizes nested skill references when parent requested spaces change", async () => {
      const restrictedSpace = await SpaceFactory.regular(testContext.workspace);
      const addAdminToRestrictedSpaceRes = await restrictedSpace.addMembers(
        testContext.authenticator,
        { userIds: [testContext.authenticator.getNonNullableUser().sId] }
      );
      expect(addAdminToRestrictedSpaceRes.isOk()).toBe(true);
      await testContext.authenticator.refresh();

      const childSkill = await SkillFactory.create(testContext.authenticator, {
        name: "Restricted Child Skill",
        requestedSpaceIds: [restrictedSpace.id],
      });
      const parentSkill = await SkillFactory.create(testContext.authenticator, {
        name: "Parent Skill",
        instructions: `Use ${SkillFactory.serializeSkillReferenceTag(childSkill)}.`,
      });

      expect(parentSkill.instructions).toContain(
        `<unavailable_skill id="${childSkill.sId}" />`
      );

      await parentSkill.updateSkill(testContext.authenticator, {
        name: parentSkill.name,
        agentFacingDescription: parentSkill.agentFacingDescription,
        userFacingDescription: parentSkill.userFacingDescription,
        instructions: parentSkill.instructions,
        instructionsHtml: parentSkill.instructionsHtml,
        icon: parentSkill.icon,
        mcpServerViews: [],
        attachedKnowledge: [],
        manuallyRequestedSpaceIds: [],
        requestedSpaceIds: [restrictedSpace.id],
      });

      const updatedParentSkill = await SkillResource.fetchById(
        testContext.authenticator,
        parentSkill.sId
      );

      expect(updatedParentSkill?.instructions).toContain(
        SkillFactory.serializeSkillReferenceTag(childSkill)
      );
    });

    it("recomputes nested skill references from instructions on update", async () => {
      const { childSkill, parentSkill, skillReferenceTag } =
        await SkillFactory.createWithNestedSkill(testContext.authenticator, {
          childOverrides: { name: "Omitted References Child Skill" },
          parentOverrides: { name: "Omitted References Parent Skill" },
        });

      await parentSkill.updateSkill(testContext.authenticator, {
        name: parentSkill.name,
        agentFacingDescription: "Updated agent description",
        userFacingDescription: parentSkill.userFacingDescription,
        instructions: `Use ${skillReferenceTag}.`,
        instructionsHtml: parentSkill.instructionsHtml,
        icon: parentSkill.icon,
        mcpServerViews: [],
        attachedKnowledge: [],
        manuallyRequestedSpaceIds: parentSkill.manuallyRequestedSpaceIds,
        requestedSpaceIds: parentSkill.requestedSpaceIds,
      });

      const updatedParentSkill = await SkillResource.fetchById(
        testContext.authenticator,
        parentSkill.sId
      );
      expect(updatedParentSkill).not.toBeNull();
      await expect(
        updatedParentSkill!.fetchChildSkills(testContext.authenticator)
      ).resolves.toEqual([
        expect.objectContaining({
          sId: childSkill.sId,
        }),
      ]);

      await updatedParentSkill!.updateSkill(testContext.authenticator, {
        name: updatedParentSkill!.name,
        agentFacingDescription: updatedParentSkill!.agentFacingDescription,
        userFacingDescription: updatedParentSkill!.userFacingDescription,
        instructions: "No nested skill references.",
        instructionsHtml: updatedParentSkill!.instructionsHtml,
        icon: updatedParentSkill!.icon,
        mcpServerViews: [],
        attachedKnowledge: [],
        manuallyRequestedSpaceIds:
          updatedParentSkill!.manuallyRequestedSpaceIds,
        requestedSpaceIds: updatedParentSkill!.requestedSpaceIds,
      });

      const clearedParentSkill = await SkillResource.fetchById(
        testContext.authenticator,
        parentSkill.sId
      );
      expect(clearedParentSkill).not.toBeNull();
      await expect(
        clearedParentSkill!.fetchChildSkills(testContext.authenticator)
      ).resolves.toHaveLength(0);
    });

    it("keeps nested skill self-references", async () => {
      const skill = await SkillFactory.create(testContext.authenticator, {
        name: "Self Referencing Skill",
      });

      await skill.updateSkill(testContext.authenticator, {
        name: skill.name,
        agentFacingDescription: skill.agentFacingDescription,
        userFacingDescription: skill.userFacingDescription,
        instructions: `Recurse with ${SkillFactory.serializeSkillReferenceTag(skill)}.`,
        instructionsHtml: skill.instructionsHtml,
        icon: skill.icon,
        mcpServerViews: [],
        attachedKnowledge: [],
        manuallyRequestedSpaceIds: skill.manuallyRequestedSpaceIds,
        requestedSpaceIds: skill.requestedSpaceIds,
      });

      await expect(
        skill.fetchChildSkills(testContext.authenticator)
      ).resolves.toEqual([expect.objectContaining({ sId: skill.sId })]);
    });

    it("updates parent skill references when child requested spaces change", async () => {
      const restrictedSpace = await SpaceFactory.regular(testContext.workspace);
      const childSkill = await SkillFactory.create(testContext.authenticator, {
        name: "Child Skill",
      });
      const parentSkill = await SkillFactory.create(testContext.authenticator, {
        name: "Parent Skill",
        instructions: `Use ${SkillFactory.serializeSkillReferenceTag(childSkill)}.`,
      });

      expect(parentSkill.instructions).toContain(
        SkillFactory.serializeSkillReferenceTag(childSkill)
      );

      await childSkill.updateSkill(testContext.authenticator, {
        name: childSkill.name,
        agentFacingDescription: childSkill.agentFacingDescription,
        userFacingDescription: childSkill.userFacingDescription,
        instructions: childSkill.instructions,
        instructionsHtml: childSkill.instructionsHtml,
        icon: childSkill.icon,
        mcpServerViews: [],
        attachedKnowledge: [],
        manuallyRequestedSpaceIds: [],
        requestedSpaceIds: [restrictedSpace.id],
      });

      const unavailableParentSkill = await SkillResource.fetchById(
        testContext.authenticator,
        parentSkill.sId
      );

      expect(unavailableParentSkill?.instructions).toContain(
        `<unavailable_skill id="${childSkill.sId}" />`
      );

      await childSkill.updateSkill(testContext.authenticator, {
        name: childSkill.name,
        agentFacingDescription: childSkill.agentFacingDescription,
        userFacingDescription: childSkill.userFacingDescription,
        instructions: childSkill.instructions,
        instructionsHtml: childSkill.instructionsHtml,
        icon: childSkill.icon,
        mcpServerViews: [],
        attachedKnowledge: [],
        manuallyRequestedSpaceIds: [],
        requestedSpaceIds: [],
      });

      const availableParentSkill = await SkillResource.fetchById(
        testContext.authenticator,
        parentSkill.sId
      );

      expect(availableParentSkill?.instructions).toContain(
        SkillFactory.serializeSkillReferenceTag(childSkill)
      );
    });

    it("updates parent skill references when child status changes", async () => {
      const { parentSkill, childSkill, skillReferenceTag } =
        await SkillFactory.createWithNestedSkill(testContext.authenticator, {
          childOverrides: {
            name: "Child Status Skill",
          },
          parentOverrides: {
            name: "Parent Status Skill",
          },
        });

      await childSkill.updateSkill(testContext.authenticator, {
        name: childSkill.name,
        agentFacingDescription: childSkill.agentFacingDescription,
        userFacingDescription: childSkill.userFacingDescription,
        instructions: childSkill.instructions,
        instructionsHtml: childSkill.instructionsHtml,
        icon: childSkill.icon,
        mcpServerViews: [],
        attachedKnowledge: [],
        manuallyRequestedSpaceIds: childSkill.manuallyRequestedSpaceIds,
        requestedSpaceIds: childSkill.requestedSpaceIds,
        status: "archived",
      });

      const unavailableParentSkill = await SkillResource.fetchById(
        testContext.authenticator,
        parentSkill.sId
      );
      expect(unavailableParentSkill?.instructions).toContain(
        `<unavailable_skill id="${childSkill.sId}" />`
      );

      await childSkill.updateSkill(testContext.authenticator, {
        name: childSkill.name,
        agentFacingDescription: childSkill.agentFacingDescription,
        userFacingDescription: childSkill.userFacingDescription,
        instructions: childSkill.instructions,
        instructionsHtml: childSkill.instructionsHtml,
        icon: childSkill.icon,
        mcpServerViews: [],
        attachedKnowledge: [],
        manuallyRequestedSpaceIds: childSkill.manuallyRequestedSpaceIds,
        requestedSpaceIds: childSkill.requestedSpaceIds,
        status: "active",
      });

      const availableParentSkill = await SkillResource.fetchById(
        testContext.authenticator,
        parentSkill.sId
      );
      expect(availableParentSkill?.instructions).toContain(skillReferenceTag);
    });

    it("updates parent skill references when child icon changes", async () => {
      const { parentSkill, childSkill, skillReferenceTag } =
        await SkillFactory.createWithNestedSkill(testContext.authenticator, {
          childOverrides: {
            name: "Child Icon Skill",
          },
          parentOverrides: {
            name: "Parent Icon Skill",
          },
        });

      const newIcon = "ActionRocketIcon";
      expect(childSkill.icon).not.toBe(newIcon);

      await childSkill.updateSkill(testContext.authenticator, {
        name: childSkill.name,
        agentFacingDescription: childSkill.agentFacingDescription,
        userFacingDescription: childSkill.userFacingDescription,
        instructions: childSkill.instructions,
        instructionsHtml: childSkill.instructionsHtml,
        icon: newIcon,
        mcpServerViews: [],
        attachedKnowledge: [],
        manuallyRequestedSpaceIds: childSkill.manuallyRequestedSpaceIds,
        requestedSpaceIds: childSkill.requestedSpaceIds,
      });

      const updatedParentSkill = await SkillResource.fetchById(
        testContext.authenticator,
        parentSkill.sId
      );
      expect(updatedParentSkill?.instructions).not.toContain(skillReferenceTag);
      expect(updatedParentSkill?.instructions).toContain(
        SkillFactory.serializeSkillReferenceTag({
          sId: childSkill.sId,
          icon: newIcon,
          name: childSkill.name,
        })
      );
    });

    it("normalizes missing nested skill references as unavailable", async () => {
      const MISSING_SKILL_MODEL_ID = 999_999;
      const missingSkillId = SkillResource.modelIdToSId({
        id: MISSING_SKILL_MODEL_ID,
        workspaceId: testContext.workspace.id,
      });
      const missingSkillReferenceTag = serializeSkillTag({
        id: missingSkillId,
        icon: null,
        name: "Deleted Skill",
      });

      const parentSkill = await SkillFactory.create(testContext.authenticator, {
        name: "Parent With Missing Skill Reference",
        instructions: `Use ${missingSkillReferenceTag}.`,
      });

      expect(parentSkill.instructions).toContain(
        `<unavailable_skill id="${missingSkillId}" />`
      );
      await expect(
        parentSkill.fetchChildSkills(testContext.authenticator)
      ).resolves.toHaveLength(0);
    });

    it("normalizes archived nested skill references as unavailable", async () => {
      const archivedChildSkill = await SkillFactory.create(
        testContext.authenticator,
        {
          name: "Archived Child Skill",
          status: "archived",
        }
      );
      const skillReferenceTag =
        SkillFactory.serializeSkillReferenceTag(archivedChildSkill);

      const parentSkill = await SkillFactory.create(testContext.authenticator, {
        name: "Parent With Archived Skill Reference",
        instructions: `Use ${skillReferenceTag}.`,
      });

      expect(parentSkill.instructions).toContain(
        `<unavailable_skill id="${archivedChildSkill.sId}" />`
      );
      await expect(
        parentSkill.fetchChildSkills(testContext.authenticator)
      ).resolves.toHaveLength(0);
    });

    it("syncs global skill references", async () => {
      const globalSkillReferenceTag =
        GlobalSkillsRegistry.serializeSkillTag("frames");
      const parentSkill = await SkillFactory.create(testContext.authenticator, {
        name: "Parent With Global Skill Reference",
        instructions: `Use ${globalSkillReferenceTag}.`,
      });

      const childSkills = await parentSkill.fetchChildSkills(
        testContext.authenticator
      );

      expect(childSkills).toEqual([
        expect.objectContaining({
          sId: "frames",
          name: "Create Frames",
        }),
      ]);

      const framesSkill = await SkillResource.fetchById(
        testContext.authenticator,
        "frames"
      );
      if (framesSkill === null) {
        throw new Error("Expected frames global skill to exist.");
      }

      const usedBySkillsByChild = await SkillResource.batchFetchUsedBySkills(
        testContext.authenticator,
        [framesSkill]
      );

      expect(usedBySkillsByChild.get("frames")).toEqual([
        {
          sId: parentSkill.sId,
          name: parentSkill.name,
          icon: parentSkill.icon,
        },
      ]);
    });

    it("drops missing same-workspace nested skill references", async () => {
      const parentSkill = await SkillFactory.create(testContext.authenticator, {
        name: "Parent With Missing Skill Reference",
      });
      const missingSkillId = SkillResource.modelIdToSId({
        id: parentSkill.id + 1_000_000,
        workspaceId: testContext.workspace.id,
      });

      await parentSkill.updateSkill(testContext.authenticator, {
        name: parentSkill.name,
        agentFacingDescription: parentSkill.agentFacingDescription,
        userFacingDescription: parentSkill.userFacingDescription,
        instructions: `Use ${serializeSkillTag({
          id: missingSkillId,
          icon: null,
          name: "Deleted Skill",
        })}.`,
        instructionsHtml: parentSkill.instructionsHtml,
        icon: parentSkill.icon,
        mcpServerViews: [],
        attachedKnowledge: [],
        manuallyRequestedSpaceIds: parentSkill.manuallyRequestedSpaceIds,
        requestedSpaceIds: parentSkill.requestedSpaceIds,
      });

      await expect(
        parentSkill.fetchChildSkills(testContext.authenticator)
      ).resolves.toHaveLength(0);
    });
  });

  describe("updateAvailabilities", () => {
    it("updates the availability in bulk for a caller with the publish permission", async () => {
      // Admins hold every workspace-level capability, including publish on skills.
      const firstSkill = await SkillFactory.create(testContext.authenticator, {
        name: "First Publishable Skill",
        availability: "workspace_users",
      });
      const secondSkill = await SkillFactory.create(testContext.authenticator, {
        name: "Second Publishable Skill",
        availability: "workspace_users",
      });

      await SkillResource.updateAvailabilities(
        testContext.authenticator,
        [firstSkill, secondSkill],
        "editors"
      );

      for (const skill of [firstSkill, secondSkill]) {
        const updatedSkill = await SkillResource.fetchById(
          testContext.authenticator,
          skill.sId
        );
        expect(updatedSkill?.availability).toBe("editors");
        // The availability change counts as an edit by the acting user.
        expect(updatedSkill?.editedBy).toBe(testContext.user.id);
        // A version of the previous state was snapshotted.
        const versions =
          (await updatedSkill?.listVersions(testContext.authenticator)) ?? [];
        expect(versions.length).toBe(1);
        expect(versions[0]?.availability).toBe("workspace_users");
      }
    });

    it("rejects a caller without the publish permission, even an editor", async () => {
      const builder = await UserFactory.basic();
      await MembershipFactory.associate(testContext.workspace, builder, {
        role: "user",
      });
      const builderAuth = await Authenticator.fromUserIdAndWorkspaceId(
        builder.sId,
        testContext.workspace.sId
      );

      // The builder creates the skill, so they are an editor — editing rights are
      // not sufficient to change availability.
      const skillResource = await SkillFactory.create(builderAuth, {
        name: "Non Publishable Skill",
      });

      await expect(
        SkillResource.updateAvailabilities(
          builderAuth,
          [skillResource],
          "users_and_agents"
        )
      ).rejects.toThrow("User is not authorized to update skill availability");
    });

    it("requires the publish permission to change availability through updateSkill", async () => {
      const manager = await UserFactory.basic();
      await MembershipFactory.associate(testContext.workspace, manager, {
        role: "manager",
      });
      const builderAuth = await Authenticator.fromUserIdAndWorkspaceId(
        manager.sId,
        testContext.workspace.sId
      );

      const skillResource = await SkillFactory.create(builderAuth, {
        name: "Governed Skill",
      });

      await expect(
        skillResource.updateSkill(builderAuth, {
          name: skillResource.name,
          agentFacingDescription: skillResource.agentFacingDescription,
          userFacingDescription: skillResource.userFacingDescription,
          instructions: skillResource.instructions,
          icon: skillResource.icon,
          availability: "users_and_agents",
          mcpServerViews: [],
          attachedKnowledge: [],
          manuallyRequestedSpaceIds: [],
          requestedSpaceIds: [],
        })
      ).rejects.toThrow(
        "User is not authorized to update this skill's availability"
      );
    });
  });

  describe("archive and restore", () => {
    it("keeps the editor grants active when archiving, so editors are still listed", async () => {
      const skill = await SkillFactory.create(testContext.authenticator, {
        name: "Skill To Archive",
      });

      // Editors live in the regular_auto group holding the skill's `editor` grant.
      const grantGroup =
        await GroupPermissionResource.findRegularAutoGroupForGrant(
          testContext.authenticator,
          { grantType: "editor", resourceType: "skill", resourceId: skill.id }
        );
      expect(grantGroup).not.toBeNull();

      const memberships = async () =>
        GroupMembershipModel.findAll({
          where: {
            groupId: grantGroup!.id,
            workspaceId: testContext.workspace.id,
          },
        });

      const before = await memberships();
      expect(before.length).toBeGreaterThan(0);
      expect(before.every((m) => m.status === "active")).toBe(true);

      const { affectedCount: archiveCount } = await skill.archive(
        testContext.authenticator
      );
      expect(archiveCount).toBe(1);

      // Archiving leaves the memberships alone: an archived skill keeps its editors, both on the
      // in-memory resource and on a freshly fetched one.
      expect((await memberships()).every((m) => m.status === "active")).toBe(
        true
      );
      expect(
        (await skill.listEditors(testContext.authenticator))?.map((e) => e.id)
      ).toEqual([testContext.user.id]);

      const archivedSkill = await SkillResource.fetchById(
        testContext.authenticator,
        skill.sId
      );
      assert(archivedSkill);
      expect(
        (await archivedSkill.listEditors(testContext.authenticator))?.map(
          (e) => e.id
        )
      ).toEqual([testContext.user.id]);

      const editorsMap = await SkillResource.batchListEditors(
        testContext.authenticator,
        [archivedSkill]
      );
      expect(editorsMap.get(skill.sId)?.map((e) => e.id)).toEqual([
        testContext.user.id,
      ]);

      const { affectedCount: restoreCount } = await archivedSkill.restore(
        testContext.authenticator
      );
      expect(restoreCount).toBe(1);
      expect((await memberships()).every((m) => m.status === "active")).toBe(
        true
      );
      expect(
        (await archivedSkill.listEditors(testContext.authenticator))?.map(
          (e) => e.id
        )
      ).toEqual([testContext.user.id]);
    });

    it("archives multiple skills sharing the same name without a unique constraint violation", async () => {
      // The (workspaceId, name, status) unique constraint means only one
      // archived skill can keep a given name. Archiving a same-named skill
      // renames the previously archived one with a timestamped suffix; a third
      // archive on the same day must not collide with the earlier rename
      // target. We fake the clock so each archive lands on a distinct time of
      // the same day. The faked day sits after the real one: the test workspace
      // memberships start "now", and creating a skill grants the creator their
      // editor grant, which requires an active membership — a faked day in the
      // past would make those memberships look not yet started.
      const fakeDay = new Date(Date.now() + 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        const archiveSameNameSkillAt = async (isoTime: string) => {
          vi.setSystemTime(new Date(isoTime));
          const skill = await SkillFactory.create(testContext.authenticator, {
            name: "Duplicate Name Skill",
          });
          return skill.archive(testContext.authenticator);
        };

        await archiveSameNameSkillAt(`${fakeDay}T12:00:00Z`);
        await archiveSameNameSkillAt(`${fakeDay}T12:01:00Z`);
        const { affectedCount } = await archiveSameNameSkillAt(
          `${fakeDay}T12:02:00Z`
        );
        expect(affectedCount).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("removes the skill's space requirements from agents when archiving and adds them back when restoring", async () => {
      const restrictedSpace = await SpaceFactory.regular(testContext.workspace);
      await SpaceFactory.attachGroup(restrictedSpace, testContext.globalGroup);

      const skill = await SkillFactory.create(testContext.authenticator, {
        name: "Skill With Space To Archive",
        requestedSpaceIds: [restrictedSpace.id],
      });

      const agent = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        {
          name: "Agent With Skill Space",
          requestedSpaceIds: [restrictedSpace.id],
        }
      );

      await SkillFactory.linkToAgent(testContext.authenticator, {
        skillId: skill.id,
        agentConfigurationId: agent.id,
      });

      // Archiving the skill should drop its space from the agent's requirements.
      await skill.archive(testContext.authenticator);

      const agentAfterArchive = await getAgentConfiguration(
        testContext.authenticator,
        { agentId: agent.sId, variant: "light" }
      );
      expect(agentAfterArchive?.requestedSpaceIds).not.toContain(
        restrictedSpace.sId
      );

      // Restoring the skill should add its space back to the agent's requirements.
      await skill.restore(testContext.authenticator);

      const agentAfterRestore = await getAgentConfiguration(
        testContext.authenticator,
        { agentId: agent.sId, variant: "light" }
      );
      expect(agentAfterRestore?.requestedSpaceIds).toContain(
        restrictedSpace.sId
      );
    });

    it("keeps a space on the agent when archiving a skill if another active skill still requires it", async () => {
      const sharedSpace = await SpaceFactory.regular(testContext.workspace);
      await SpaceFactory.attachGroup(sharedSpace, testContext.globalGroup);

      const skill1 = await SkillFactory.create(testContext.authenticator, {
        name: "Skill 1 Sharing Space",
        requestedSpaceIds: [sharedSpace.id],
      });
      const skill2 = await SkillFactory.create(testContext.authenticator, {
        name: "Skill 2 Sharing Space",
        requestedSpaceIds: [sharedSpace.id],
      });

      const agent = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        {
          name: "Agent With Two Skills",
          requestedSpaceIds: [sharedSpace.id],
        }
      );

      await SkillFactory.linkToAgent(testContext.authenticator, {
        skillId: skill1.id,
        agentConfigurationId: agent.id,
      });
      await SkillFactory.linkToAgent(testContext.authenticator, {
        skillId: skill2.id,
        agentConfigurationId: agent.id,
      });

      // Archiving skill1 must not remove sharedSpace because skill2 still requires it.
      await skill1.archive(testContext.authenticator);

      const agentAfter = await getAgentConfiguration(
        testContext.authenticator,
        {
          agentId: agent.sId,
          variant: "light",
        }
      );
      expect(agentAfter?.requestedSpaceIds).toContain(sharedSpace.sId);
    });

    it("marks parent skill references unavailable while a child skill is archived", async () => {
      const childSkill = await SkillFactory.create(testContext.authenticator, {
        name: "Archived Child Skill",
      });
      const skillReferenceTag =
        SkillFactory.serializeSkillReferenceTag(childSkill);
      const skillReferenceHtmlTag = serializeSkillTag(
        {
          icon: childSkill.icon,
          id: childSkill.sId,
          name: childSkill.name,
        },
        { html: true }
      );
      const parentSkill = await SkillFactory.create(testContext.authenticator, {
        name: "Parent Skill",
        instructions: `Use ${skillReferenceTag}.`,
        instructionsHtml: `<p>Use ${skillReferenceHtmlTag}.</p>`,
      });

      const { affectedCount: archiveCount } = await childSkill.archive(
        testContext.authenticator
      );
      expect(archiveCount).toBe(1);

      const archivedParentSkill = await SkillResource.fetchById(
        testContext.authenticator,
        parentSkill.sId
      );
      expect(archivedParentSkill?.instructions).toContain(
        `<unavailable_skill id="${childSkill.sId}" />`
      );
      expect(archivedParentSkill?.instructionsHtml).toContain(
        `<unavailable_skill id="${childSkill.sId}"></unavailable_skill>`
      );
      await expect(
        archivedParentSkill!.fetchChildSkills(testContext.authenticator)
      ).resolves.toHaveLength(0);

      await archivedParentSkill!.updateSkill(testContext.authenticator, {
        name: archivedParentSkill!.name,
        agentFacingDescription: archivedParentSkill!.agentFacingDescription,
        userFacingDescription: archivedParentSkill!.userFacingDescription,
        instructions: archivedParentSkill!.instructions,
        instructionsHtml: archivedParentSkill!.instructionsHtml,
        icon: archivedParentSkill!.icon,
        mcpServerViews: [],
        attachedKnowledge: [],
        manuallyRequestedSpaceIds:
          archivedParentSkill!.manuallyRequestedSpaceIds,
        requestedSpaceIds: archivedParentSkill!.requestedSpaceIds,
      });

      const updatedArchivedParentSkill = await SkillResource.fetchById(
        testContext.authenticator,
        parentSkill.sId
      );
      expect(updatedArchivedParentSkill?.instructions).toContain(
        `<unavailable_skill id="${childSkill.sId}" />`
      );

      const { affectedCount: restoreCount } = await childSkill.restore(
        testContext.authenticator
      );
      expect(restoreCount).toBe(1);

      const restoredParentSkill = await SkillResource.fetchById(
        testContext.authenticator,
        parentSkill.sId
      );
      expect(restoredParentSkill?.instructions).toContain(skillReferenceTag);
      await expect(
        restoredParentSkill!.fetchChildSkills(testContext.authenticator)
      ).resolves.toEqual([
        expect.objectContaining({
          sId: childSkill.sId,
        }),
      ]);
    });
  });

  describe("delete", () => {
    it("should delete the skill and its editor grant group", async () => {
      const skillResource = await SkillFactory.create(
        testContext.authenticator,
        { name: "Skill To Delete" }
      );

      const grantGroup =
        await GroupPermissionResource.findRegularAutoGroupForGrant(
          testContext.authenticator,
          {
            grantType: "editor",
            resourceType: "skill",
            resourceId: skillResource.id,
          }
        );
      expect(grantGroup).not.toBeNull();

      const result = await skillResource.delete(testContext.authenticator);
      expect(result.isOk()).toBe(true);

      const skillAfter = await SkillResource.fetchByModelIdWithAuth(
        testContext.authenticator,
        skillResource.id
      );
      expect(skillAfter).toBeNull();

      // The grant group existed only to hold this skill's grant, so it goes too.
      const groupsAfter = await GroupResource.dangerouslyFetchByModelIds(
        testContext.authenticator,
        [grantGroup!.id]
      );
      expect(groupsAfter).toHaveLength(0);
    });

    it("should delete agent-skill links when deleting a skill", async () => {
      const skillResource = await SkillFactory.create(
        testContext.authenticator,
        { name: "Skill With Agent Link" }
      );

      // Link the skill to an agent.
      const agent = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        { name: "Test Agent With Skill" }
      );
      await SkillFactory.linkToAgent(testContext.authenticator, {
        skillId: skillResource.id,
        agentConfigurationId: agent.id,
      });

      // Verify agent-skill link exists before deletion using Resource.
      const skillsForAgentBefore = await SkillResource.listByAgentConfiguration(
        testContext.authenticator,
        agent
      );
      expect(skillsForAgentBefore.some((s) => s.id === skillResource.id)).toBe(
        true
      );

      // Delete the skill.
      const result = await skillResource.delete(testContext.authenticator);
      expect(result.isOk()).toBe(true);

      // Verify agent-skill link is deleted.
      const skillsForAgentAfter = await SkillResource.listByAgentConfiguration(
        testContext.authenticator,
        agent
      );
      expect(skillsForAgentAfter.some((s) => s.id === skillResource.id)).toBe(
        false
      );
    });

    it("marks parent skill references unavailable before deleting a child skill", async () => {
      const { parentSkill, childSkill } =
        await SkillFactory.createWithNestedSkill(testContext.authenticator, {
          childOverrides: {
            name: "Deleted Child Skill",
          },
          parentOverrides: {
            name: "Parent Skill",
          },
        });

      const result = await childSkill.delete(testContext.authenticator);
      expect(result.isOk()).toBe(true);

      const parentSkillAfterDelete = await SkillResource.fetchById(
        testContext.authenticator,
        parentSkill.sId
      );
      expect(parentSkillAfterDelete?.instructions).toContain(
        `<unavailable_skill id="${childSkill.sId}" />`
      );
      await expect(
        parentSkillAfterDelete!.fetchChildSkills(testContext.authenticator)
      ).resolves.toHaveLength(0);
    });
  });

  describe("listByMCPServerViewIds", () => {
    it("should return skills that use any of the given MCP server view IDs", async () => {
      const space = await SpaceFactory.regular(testContext.workspace);
      await SpaceFactory.attachGroup(space, testContext.globalGroup);

      const server = await RemoteMCPServerFactory.create(testContext.workspace);
      const serverView = await MCPServerViewFactory.create(
        testContext.workspace,
        server.sId,
        space
      );

      // Create a skill with the MCP server view
      const skill1 = await SkillFactory.create(testContext.authenticator, {
        name: "Skill With MCP",
        requestedSpaceIds: [space.id],
        mcpServerViews: [serverView],
      });

      // Create a skill without MCP server views
      await SkillFactory.create(testContext.authenticator, {
        name: "Skill Without MCP",
        requestedSpaceIds: [],
      });

      // Test that skills with the MCP server view are returned
      const skillsWithMCP = await SkillResource.listByMCPServerViewIds(
        testContext.authenticator,
        [serverView.id]
      );
      expect(skillsWithMCP).toHaveLength(1);
      expect(skillsWithMCP[0].id).toBe(skill1.id);

      // Test with empty array returns empty
      const emptyResult = await SkillResource.listByMCPServerViewIds(
        testContext.authenticator,
        []
      );
      expect(emptyResult).toHaveLength(0);

      // Test with non-existent IDs returns empty
      const nonExistentResult = await SkillResource.listByMCPServerViewIds(
        testContext.authenticator,
        [999999]
      );
      expect(nonExistentResult).toHaveLength(0);
    });
  });

  describe("listByDataSourceViewIds", () => {
    it("should return skills that use any of the given data source view IDs", async () => {
      const space = await SpaceFactory.regular(testContext.workspace);
      await SpaceFactory.attachGroup(space, testContext.globalGroup);

      const dsv1 = await DataSourceViewFactory.folder(
        testContext.workspace,
        space,
        testContext.user
      );
      const dsv2 = await DataSourceViewFactory.folder(
        testContext.workspace,
        space,
        testContext.user
      );
      const skill1 = await SkillFactory.create(testContext.authenticator, {
        name: "Skill With DSV1",
        requestedSpaceIds: [space.id],
      });

      await createDataSourceConfiguration({
        dataSourceView: dsv1,
        parentsIn: ["node1"],
        skillId: skill1.id,
      });

      // Create another skill without data source configuration
      await SkillFactory.create(testContext.authenticator, {
        name: "Skill Without DSV",
        requestedSpaceIds: [],
      });

      // Test that skills with dsv1 are returned
      const skillsWithDsv1 = await SkillResource.listByDataSourceViewIds(
        testContext.authenticator,
        [dsv1.id]
      );
      expect(skillsWithDsv1).toHaveLength(1);
      expect(skillsWithDsv1[0].id).toBe(skill1.id);

      // Test with non-existent ID returns empty
      const emptyResult = await SkillResource.listByDataSourceViewIds(
        testContext.authenticator,
        [dsv2.id]
      );
      expect(emptyResult).toHaveLength(0);

      // Test with empty array returns empty
      const emptyArrayResult = await SkillResource.listByDataSourceViewIds(
        testContext.authenticator,
        []
      );
      expect(emptyArrayResult).toHaveLength(0);
    });
  });

  describe("listByDataSourceIds", () => {
    it("should return skills that use any of the given data source IDs", async () => {
      const space = await SpaceFactory.regular(testContext.workspace);
      await SpaceFactory.attachGroup(space, testContext.globalGroup);

      const dsv1 = await DataSourceViewFactory.folder(
        testContext.workspace,
        space,
        testContext.user
      );
      const dsv2 = await DataSourceViewFactory.folder(
        testContext.workspace,
        space,
        testContext.user
      );
      const skill1 = await SkillFactory.create(testContext.authenticator, {
        name: "Skill With DS1",
        requestedSpaceIds: [space.id],
      });

      await createDataSourceConfiguration({
        dataSourceView: dsv1,
        parentsIn: ["node1"],
        skillId: skill1.id,
      });

      // Create another skill without data source configuration
      await SkillFactory.create(testContext.authenticator, {
        name: "Skill Without DS",
        requestedSpaceIds: [],
      });

      // Test that skills with ds1 are returned
      const skillsWithDs1 = await SkillResource.listByDataSourceIds(
        testContext.authenticator,
        [dsv1.dataSource.id]
      );
      expect(skillsWithDs1).toHaveLength(1);
      expect(skillsWithDs1[0].id).toBe(skill1.id);

      // Test with an unused data source returns empty
      const emptyResult = await SkillResource.listByDataSourceIds(
        testContext.authenticator,
        [dsv2.dataSource.id]
      );
      expect(emptyResult).toHaveLength(0);

      // Test with empty array returns empty
      const emptyArrayResult = await SkillResource.listByDataSourceIds(
        testContext.authenticator,
        []
      );
      expect(emptyArrayResult).toHaveLength(0);
    });

    it("should return skills configured through any view of the given data source", async () => {
      const ownerSpace = await SpaceFactory.regular(testContext.workspace);
      await SpaceFactory.attachGroup(ownerSpace, testContext.globalGroup);
      const otherSpace = await SpaceFactory.regular(testContext.workspace);
      await SpaceFactory.attachGroup(otherSpace, testContext.globalGroup);

      const defaultView = await DataSourceViewFactory.folder(
        testContext.workspace,
        ownerSpace,
        testContext.user
      );
      const sharedViewResult =
        await DataSourceViewResource.createViewInSpaceFromDataSource(
          testContext.authenticator,
          otherSpace,
          defaultView.dataSource,
          ["node1"]
        );
      assert(sharedViewResult.isOk(), "shared view should be created");

      const skill = await SkillFactory.create(testContext.authenticator, {
        name: "Skill With Shared View",
        requestedSpaceIds: [otherSpace.id],
      });

      await createDataSourceConfiguration({
        dataSourceView: sharedViewResult.value,
        parentsIn: ["node1"],
        skillId: skill.id,
      });

      // The skill is not attached to the default view of the data source...
      const skillsForDefaultView = await SkillResource.listByDataSourceViewIds(
        testContext.authenticator,
        [defaultView.id]
      );
      expect(skillsForDefaultView).toHaveLength(0);

      // ...but it is still found when listing by the underlying data source.
      const skillsForDataSource = await SkillResource.listByDataSourceIds(
        testContext.authenticator,
        [defaultView.dataSource.id]
      );
      expect(skillsForDataSource).toHaveLength(1);
      expect(skillsForDataSource[0].id).toBe(skill.id);
    });
  });

  describe("batchFetchChildSkills", () => {
    it("should not hydrate MCP server views for returned child skills", async () => {
      const server = await RemoteMCPServerFactory.create(testContext.workspace);
      const serverView = await MCPServerViewFactory.create(
        testContext.workspace,
        server.sId,
        testContext.globalSpace
      );
      const parentSkill = await SkillFactory.create(testContext.authenticator, {
        name: "Parent Skill",
      });
      const childSkill = await SkillFactory.create(testContext.authenticator, {
        name: "Child Skill",
        mcpServerViews: [serverView],
      });
      await SkillFactory.linkSkillToSkill(testContext.authenticator, {
        parentSkillId: parentSkill.id,
        childSkillId: childSkill.id,
      });

      const fetchByModelIdsSpy = vi.spyOn(
        MCPServerViewResource,
        "fetchByModelIds"
      );

      const childSkillsByParent = await SkillResource.batchFetchChildSkills(
        testContext.authenticator,
        [parentSkill]
      );

      expect(childSkillsByParent.get(parentSkill.sId)).toEqual([
        expect.objectContaining({
          sId: childSkill.sId,
          name: "Child Skill",
        }),
      ]);
      expect(fetchByModelIdsSpy).not.toHaveBeenCalled();
    });
  });

  describe("fetchByModelIds", () => {
    it("returns active skills only unless a status is given", async () => {
      const activeSkill = await SkillFactory.create(testContext.authenticator, {
        name: "Active Skill",
      });
      const archivedSkill = await SkillFactory.create(
        testContext.authenticator,
        { name: "Archived Skill", status: "archived" }
      );
      const modelIds = [activeSkill.id, archivedSkill.id];

      const defaultFetch = await SkillResource.fetchByModelIds(
        testContext.authenticator,
        modelIds
      );
      expect(defaultFetch.map((skill) => skill.id)).toEqual([activeSkill.id]);

      const withArchived = await SkillResource.fetchByModelIds(
        testContext.authenticator,
        modelIds,
        { status: ["active", "archived"] }
      );
      expect(withArchived.map((skill) => skill.id).sort()).toEqual(
        [...modelIds].sort()
      );
    });
  });

  describe("permission filtering modes", () => {
    // A skill owned by another member and built on a restricted space the test admin is not a
    // member of.
    async function createRestrictedSkill() {
      const owner = await UserFactory.basic();
      await MembershipFactory.associate(testContext.workspace, owner, {
        role: "user",
      });
      const ownerAuth = await Authenticator.fromUserIdAndWorkspaceId(
        owner.sId,
        testContext.workspace.sId
      );
      const restrictedSpace = await SpaceFactory.regular(testContext.workspace);
      await restrictedSpace.addMembers(testContext.authenticator, {
        userIds: [owner.sId],
      });
      const skill = await SkillFactory.create(ownerAuth, {
        name: "Restricted Space Skill",
        instructions: "Secret guidelines",
        requestedSpaceIds: [restrictedSpace.id],
      });
      return { skill, ownerAuth };
    }

    it("returns a readable skill as is", async () => {
      const skill = await SkillFactory.create(testContext.authenticator, {
        name: "Readable Skill",
        instructions: "Public guidelines",
      });

      const fetched = await SkillResource.fetchById(
        testContext.authenticator,
        skill.sId,
        { permissionFiltering: "redact_unreadable" }
      );

      expect(fetched).not.toBeNull();
      expect(fetched!.canRead(testContext.authenticator)).toBe(true);
      expect(fetched!.toJSON(testContext.authenticator).instructions).toBe(
        "Public guidelines"
      );
    });

    it("returns a redacted skill to an admin who cannot read it", async () => {
      const { skill } = await createRestrictedSkill();
      expect(
        await SkillResource.fetchById(testContext.authenticator, skill.sId)
      ).toBeNull();

      const fetched = await SkillResource.fetchById(
        testContext.authenticator,
        skill.sId,
        { permissionFiltering: "redact_unreadable" }
      );

      expect(fetched).not.toBeNull();
      expect(fetched!.canRead(testContext.authenticator)).toBe(false);
      // Administration is a role matter, unrelated to reading the spaces.
      expect(fetched!.canAdministrate(testContext.authenticator)).toBe(true);
      const json = fetched!.toJSON(testContext.authenticator);
      expect(json.name).toBe("Restricted Space Skill");
      expect(json.canRead).toBe(false);
      expect(json.instructions).toBeNull();
      expect(json.instructionsHtml).toBeNull();
      expect(json.tools).toEqual([]);
      expect(json.fileAttachments).toEqual([]);
    });

    it("refuses the option to a non-admin, who gets null without it", async () => {
      const { skill } = await createRestrictedSkill();
      const builder = await UserFactory.basic();
      await MembershipFactory.associate(testContext.workspace, builder, {
        role: "builder",
      });
      const builderAuth = await Authenticator.fromUserIdAndWorkspaceId(
        builder.sId,
        testContext.workspace.sId
      );

      await expect(
        SkillResource.fetchById(builderAuth, skill.sId, {
          permissionFiltering: "redact_unreadable",
        })
      ).rejects.toThrow("Only admins");
      await expect(
        SkillResource.listByWorkspace(builderAuth, {
          permissionFiltering: "redact_unreadable",
        })
      ).rejects.toThrow("Only admins");
      expect(await SkillResource.fetchById(builderAuth, skill.sId)).toBeNull();
    });

    it("returns null for an unknown skill", async () => {
      expect(
        await SkillResource.fetchById(
          testContext.authenticator,
          "skl_does_not_exist",
          { permissionFiltering: "redact_unreadable" }
        )
      ).toBeNull();
    });

    it("listByWorkspace with redact_unreadable only redacts the skills the caller cannot read", async () => {
      const { skill: restrictedSkill } = await createRestrictedSkill();
      const readableSkill = await SkillFactory.create(
        testContext.authenticator,
        { name: "Readable Skill" }
      );

      const skills = await SkillResource.listByWorkspace(
        testContext.authenticator,
        { onlyCustom: true, permissionFiltering: "redact_unreadable" }
      );

      const bySId = new Map(skills.map((s) => [s.sId, s]));
      expect(
        bySId.get(restrictedSkill.sId)!.canRead(testContext.authenticator)
      ).toBe(false);
      expect(
        bySId.get(readableSkill.sId)!.canRead(testContext.authenticator)
      ).toBe(true);
    });
  });

  describe("fetchByIds", () => {
    it("skips heavy hydration when it is not requested", async () => {
      const server = await RemoteMCPServerFactory.create(testContext.workspace);
      const serverView = await MCPServerViewFactory.create(
        testContext.workspace,
        server.sId,
        testContext.globalSpace
      );
      const skill = await SkillFactory.create(testContext.authenticator, {
        name: "Lightweight Skill",
        instructions: "Large instructions",
        userFacingDescription: "Description needed for the label",
        mcpServerViews: [serverView],
      });
      const fetchByModelIdsSpy = vi.spyOn(
        MCPServerViewResource,
        "fetchByModelIds"
      );

      const [fetchedSkill] = await SkillResource.fetchByIds(
        testContext.authenticator,
        [skill.sId],
        {
          withInstructions: false,
          withTools: false,
          withFileAttachments: false,
        }
      );

      expect(fetchedSkill).toMatchObject({
        name: "Lightweight Skill",
        userFacingDescription: "Description needed for the label",
        instructions: "",
      });
      expect(fetchedSkill.mcpServerViews).toEqual([]);
      expect(fetchByModelIdsSpy).not.toHaveBeenCalled();
    });

    it("filters code-defined skills disabled for the current agent loop", async () => {
      const agent = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        { name: "Agent With Slack Mention Users Reference" }
      );
      const conversation = await ConversationFactory.create(
        testContext.authenticator,
        { agentConfigurationId: agent.sId, messagesCreatedAt: [] }
      );
      const { userMessage } = await ConversationFactory.createUserMessage({
        auth: testContext.authenticator,
        workspace: testContext.workspace,
        conversation,
        content: "Tell someone about this.",
        origin: "slack",
        rank: -1,
      });
      const { agentMessage } = await ConversationFactory.createAgentMessage(
        testContext.authenticator,
        {
          workspace: testContext.workspace,
          conversation,
          agentConfig: agent,
        }
      );

      const { model: agentModel, ...agentConfiguration } = agent;
      const endpoint = getTestStreamEndpoint(agentModel.modelId);

      const skills = await SkillResource.fetchByIds(
        testContext.authenticator,
        ["mention_users"],
        {
          agentLoopData: {
            agentConfiguration,
            modelInfo: {
              endpoint,
              ...agentModel,
            },
            agentMessage,
            conversation,
            userMessage,
          },
          effectiveSpaceIds: agentConfiguration.requestedSpaceIds,
          onlyActive: true,
        }
      );

      expect(skills).toEqual([]);
    });
  });

  describe("listForAgentLoop — pod default skills", () => {
    it("exposes a pod's default skills as equipped", async () => {
      const { authenticator, workspace, user } = testContext;

      const space = await SpaceFactory.project(workspace, user.id);
      const defaultSkill = await SkillFactory.create(authenticator, {
        name: "Pod Default Skill",
      });
      const metadata = await ProjectMetadataResource.makeNew(
        authenticator,
        space,
        { description: "d" }
      );
      await metadata.setDefaultSkills([defaultSkill]);

      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Pod Agent" }
      );

      const conversation = await ConversationFactory.create(authenticator, {
        agentConfigurationId: agent.sId,
        messagesCreatedAt: [],
        spaceId: space.id,
      });

      const { enabledSkills, equippedSkills } =
        await SkillResource.listForAgentLoop(authenticator, {
          agentConfiguration: agent,
          conversation,
        });

      expect(equippedSkills.map((s) => s.sId)).toContain(defaultSkill.sId);
      expect(enabledSkills.map((s) => s.sId)).not.toContain(defaultSkill.sId);
    });

    it("does not expose pod defaults in a non-pod conversation", async () => {
      const { authenticator, workspace } = testContext;

      const space = await SpaceFactory.project(workspace);
      const defaultSkill = await SkillFactory.create(authenticator, {
        name: "Pod Default Skill",
      });
      const metadata = await ProjectMetadataResource.makeNew(
        authenticator,
        space,
        { description: "d" }
      );
      await metadata.setDefaultSkills([defaultSkill]);

      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Non-pod Agent" }
      );
      // No spaceId => isPodConversation() is false => not exposed.
      const conversation = await ConversationFactory.create(authenticator, {
        agentConfigurationId: agent.sId,
        messagesCreatedAt: [],
      });

      const { enabledSkills, equippedSkills } =
        await SkillResource.listForAgentLoop(authenticator, {
          agentConfiguration: agent,
          conversation,
        });

      expect(equippedSkills.map((s) => s.sId)).not.toContain(defaultSkill.sId);
      expect(enabledSkills.map((s) => s.sId)).not.toContain(defaultSkill.sId);
    });

    it("keeps an enabled pod default in both enabled and equipped skills", async () => {
      const { authenticator, workspace, user } = testContext;

      const space = await SpaceFactory.project(workspace, user.id);
      const defaultSkill = await SkillFactory.create(authenticator, {
        name: "Pod Default Skill",
      });
      const metadata = await ProjectMetadataResource.makeNew(
        authenticator,
        space,
        { description: "d" }
      );
      await metadata.setDefaultSkills([defaultSkill]);

      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Pod Agent" }
      );
      const conversation = await ConversationFactory.create(authenticator, {
        agentConfigurationId: agent.sId,
        messagesCreatedAt: [],
        spaceId: space.id,
      });

      await defaultSkill.enableForAgent(authenticator, {
        agentConfiguration: agent,
        conversation,
      });

      const { enabledSkills, equippedSkills } =
        await SkillResource.listForAgentLoop(authenticator, {
          agentConfiguration: agent,
          conversation,
        });

      expect(enabledSkills.map((s) => s.sId)).toContain(defaultSkill.sId);
      expect(equippedSkills.map((s) => s.sId)).toContain(defaultSkill.sId);
    });

    it("does not duplicate a pod default that is also an agent skill", async () => {
      const { authenticator, workspace, user } = testContext;

      const space = await SpaceFactory.project(workspace, user.id);
      const skill = await SkillFactory.create(authenticator, {
        name: "Shared Skill",
      });
      const metadata = await ProjectMetadataResource.makeNew(
        authenticator,
        space,
        { description: "d" }
      );
      await metadata.setDefaultSkills([skill]);

      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Pod Agent" }
      );
      await skill.addToAgent(authenticator, agent);

      const conversation = await ConversationFactory.create(authenticator, {
        agentConfigurationId: agent.sId,
        messagesCreatedAt: [],
        spaceId: space.id,
      });

      const { equippedSkills } = await SkillResource.listForAgentLoop(
        authenticator,
        { agentConfiguration: agent, conversation }
      );

      expect(equippedSkills.filter((s) => s.sId === skill.sId)).toHaveLength(1);
    });

    it("sorts equipped skills across sources", async () => {
      const { authenticator, workspace, user } = testContext;

      const space = await SpaceFactory.project(workspace, user.id);
      const podDefaultSkill = await SkillFactory.create(authenticator, {
        name: "A Pod Default Skill",
      });
      const metadata = await ProjectMetadataResource.makeNew(
        authenticator,
        space,
        { description: "d" }
      );
      await metadata.setDefaultSkills([podDefaultSkill]);

      const agentSkill = await SkillFactory.create(authenticator, {
        name: "Z Agent Skill",
      });
      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Pod Agent" }
      );
      await agentSkill.addToAgent(authenticator, agent);

      const conversation = await ConversationFactory.create(authenticator, {
        agentConfigurationId: agent.sId,
        messagesCreatedAt: [],
        spaceId: space.id,
      });

      const { equippedSkills } = await SkillResource.listForAgentLoop(
        authenticator,
        { agentConfiguration: agent, conversation }
      );

      expect(
        equippedSkills
          .map((s) => s.name)
          .filter((name) =>
            ["A Pod Default Skill", "Z Agent Skill"].includes(name)
          )
      ).toEqual(["A Pod Default Skill", "Z Agent Skill"]);
    });
  });

  describe("batchFetchUsedBySkills", () => {
    it("should not hydrate MCP server views for returned parent skills", async () => {
      const server = await RemoteMCPServerFactory.create(testContext.workspace);
      const serverView = await MCPServerViewFactory.create(
        testContext.workspace,
        server.sId,
        testContext.globalSpace
      );
      const parentSkill = await SkillFactory.create(testContext.authenticator, {
        name: "Parent Skill",
        mcpServerViews: [serverView],
      });
      const childSkill = await SkillFactory.create(testContext.authenticator, {
        name: "Child Skill",
      });
      await SkillFactory.linkSkillToSkill(testContext.authenticator, {
        parentSkillId: parentSkill.id,
        childSkillId: childSkill.id,
      });

      const fetchByModelIdsSpy = vi.spyOn(
        MCPServerViewResource,
        "fetchByModelIds"
      );

      const usedBySkillsByChild = await SkillResource.batchFetchUsedBySkills(
        testContext.authenticator,
        [childSkill]
      );

      expect(usedBySkillsByChild.get(childSkill.sId)).toEqual([
        {
          sId: parentSkill.sId,
          name: "Parent Skill",
          icon: parentSkill.icon,
        },
      ]);
      expect(fetchByModelIdsSpy).not.toHaveBeenCalled();
    });
  });

  describe("getAttachedKnowledge", () => {
    it("should return attached knowledge from data source configurations", async () => {
      const space = await SpaceFactory.regular(testContext.workspace);
      await SpaceFactory.attachGroup(space, testContext.globalGroup);

      const dsv = await DataSourceViewFactory.folder(
        testContext.workspace,
        space,
        testContext.user
      );

      const skill = await SkillFactory.create(testContext.authenticator, {
        name: "Skill With Knowledge",
        requestedSpaceIds: [space.id],
      });

      // Add data source configuration
      await createDataSourceConfiguration({
        dataSourceView: dsv,
        parentsIn: ["node1", "node2"],
        skillId: skill.id,
      });

      // Re-fetch the skill to get the updated data source configurations
      const freshSkill = await SkillResource.fetchByModelIdWithAuth(
        testContext.authenticator,
        skill.id
      );
      expect(freshSkill).not.toBeNull();

      const attachedKnowledge = await freshSkill!.getAttachedKnowledge(
        testContext.authenticator
      );

      expect(attachedKnowledge).toHaveLength(2);
      expect(attachedKnowledge[0].nodeId).toBe("node1");
      expect(attachedKnowledge[1].nodeId).toBe("node2");
      expect(attachedKnowledge[0].dataSourceView.id).toBe(dsv.id);
    });
  });

  describe("computeRequestedSpaceIds", () => {
    it("should compute space IDs from attached knowledge", async () => {
      const space = await SpaceFactory.regular(testContext.workspace);
      await SpaceFactory.attachGroup(space, testContext.globalGroup);

      const dsv = await DataSourceViewFactory.folder(
        testContext.workspace,
        space,
        testContext.user
      );

      const attachedKnowledge: SkillAttachedKnowledge[] = [
        { dataSourceView: dsv, nodeId: "node1" },
      ];

      const requestedSpaceIds = await SkillResource.computeRequestedSpaceIds(
        testContext.authenticator,
        {
          mcpServerViews: [],
          attachedKnowledge,
        }
      );

      expect(requestedSpaceIds).toContain(space.id);
    });
  });

  describe("deleteAllForWorkspace", () => {
    it("should only delete skills from the authenticated workspace", async () => {
      // Create a skill in workspace1.
      const skill1 = await SkillFactory.create(testContext.authenticator, {
        name: "Skill In Workspace 1",
      });

      // Create a second workspace with its own skill.
      const testContext2 = await createResourceTest({ role: "admin" });
      const skill2 = await SkillFactory.create(testContext2.authenticator, {
        name: "Skill In Workspace 2",
      });

      // Verify both skills exist.
      const fetched1 = await SkillResource.fetchByModelIdWithAuth(
        testContext.authenticator,
        skill1.id
      );
      const fetched2 = await SkillResource.fetchByModelIdWithAuth(
        testContext2.authenticator,
        skill2.id
      );
      expect(fetched1).not.toBeNull();
      expect(fetched2).not.toBeNull();

      // Delete all skills for workspace1.
      await SkillResource.deleteAllForWorkspace(testContext.authenticator);

      // Verify workspace1 skill is deleted.
      const deletedSkill1 = await SkillResource.fetchByModelIdWithAuth(
        testContext.authenticator,
        skill1.id
      );
      expect(deletedSkill1).toBeNull();

      // Verify workspace2 skill still exists.
      const stillExistsSkill2 = await SkillResource.fetchByModelIdWithAuth(
        testContext2.authenticator,
        skill2.id
      );
      expect(stillExistsSkill2).not.toBeNull();
      expect(stillExistsSkill2?.id).toBe(skill2.id);
    });

    it("should delete all skills and their editor grant groups", async () => {
      const skill1 = await SkillFactory.create(testContext.authenticator, {
        name: "Skill 1 For Bulk Delete",
      });
      const skill2 = await SkillFactory.create(testContext.authenticator, {
        name: "Skill 2 For Bulk Delete",
      });

      const grantGroups =
        await GroupPermissionResource.findRegularAutoGroupsForGrants(
          testContext.authenticator,
          {
            grants: [skill1, skill2].map((skill) => ({
              grantType: "editor" as const,
              resourceType: "skill" as const,
              resourceId: skill.id,
            })),
          }
        );
      expect(grantGroups.size).toBe(2);

      await SkillResource.deleteAllForWorkspace(testContext.authenticator);

      for (const skill of [skill1, skill2]) {
        expect(
          await SkillResource.fetchByModelIdWithAuth(
            testContext.authenticator,
            skill.id
          )
        ).toBeNull();
      }

      // No grant rows left, so no grant group is resolvable any more.
      const grantGroupsAfter =
        await GroupPermissionResource.findRegularAutoGroupsForGrants(
          testContext.authenticator,
          {
            grants: [skill1, skill2].map((skill) => ({
              grantType: "editor" as const,
              resourceType: "skill" as const,
              resourceId: skill.id,
            })),
          }
        );
      expect(grantGroupsAfter.size).toBe(0);
    });
  });

  describe("listAgentMessageSkillsByCustomSkills", () => {
    it("returns an empty array when no skills are provided", async () => {
      const results = await SkillResource.listAgentMessageSkillsByCustomSkills(
        testContext.authenticator,
        []
      );
      expect(results).toEqual([]);
    });

    it("returns matching records and filters by skill ids and workspace", async () => {
      const skillA = await SkillFactory.create(testContext.authenticator, {
        name: "Skill A",
      });
      const skillB = await SkillFactory.create(testContext.authenticator, {
        name: "Skill B (not queried)",
      });

      const agent = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        { name: "Agent For Skill Test" }
      );

      await SkillFactory.linkToAgent(testContext.authenticator, {
        skillId: skillA.id,
        agentConfigurationId: agent.id,
      });
      await SkillFactory.linkToAgent(testContext.authenticator, {
        skillId: skillB.id,
        agentConfigurationId: agent.id,
      });

      const conv1 = await ConversationFactory.create(
        testContext.authenticator,
        { agentConfigurationId: agent.sId, messagesCreatedAt: [] }
      );
      const { agentMessage: msg1 } =
        await ConversationFactory.createAgentMessage(
          testContext.authenticator,
          {
            workspace: testContext.workspace,
            conversation: conv1,
            agentConfig: agent,
          }
        );

      const conv2 = await ConversationFactory.create(
        testContext.authenticator,
        { agentConfigurationId: agent.sId, messagesCreatedAt: [] }
      );
      const { agentMessage: msg2 } =
        await ConversationFactory.createAgentMessage(
          testContext.authenticator,
          {
            workspace: testContext.workspace,
            conversation: conv2,
            agentConfig: agent,
          }
        );

      // Enable skillA on conv1 and skillB on conv2
      await skillA.enableForAgent(testContext.authenticator, {
        agentConfiguration: agent,
        conversation: conv1,
      });
      await skillB.enableForAgent(testContext.authenticator, {
        agentConfiguration: agent,
        conversation: conv2,
      });

      await SkillResource.snapshotConversationSkillsForMessage(
        testContext.authenticator,
        {
          agentConfigurationId: agent.sId,
          agentMessageId: msg1.agentMessageId,
          conversationId: conv1.id,
        }
      );
      await SkillResource.snapshotConversationSkillsForMessage(
        testContext.authenticator,
        {
          agentConfigurationId: agent.sId,
          agentMessageId: msg2.agentMessageId,
          conversationId: conv2.id,
        }
      );

      const results = await SkillResource.listAgentMessageSkillsByCustomSkills(
        testContext.authenticator,
        [skillA]
      );

      expect(results).toHaveLength(1);
      expect(results[0].skill.id).toEqual(skillA.id);
      expect(results[0].conversationModelId).toEqual(conv1.id);
      expect(results[0].agentConfigurationId).toEqual(agent.sId);
    });
  });

  describe("batchFetchUsage", () => {
    it("returns empty usage for skills with no agents", async () => {
      const skill = await SkillFactory.create(testContext.authenticator, {
        name: "Unused Skill",
      });

      const usageMap = await SkillResource.batchFetchUsage(
        testContext.authenticator,
        [skill]
      );

      expect(usageMap.get(skill.sId)).toEqual({ count: 0, agents: [] });
    });

    it("returns correct usage for skills linked to agents", async () => {
      const skillA = await SkillFactory.create(testContext.authenticator, {
        name: "Skill A",
      });
      const skillB = await SkillFactory.create(testContext.authenticator, {
        name: "Skill B",
      });

      const agent1 = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        { name: "Agent 1" }
      );
      const agent2 = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        { name: "Agent 2" }
      );

      // Link both skills to agent1, only skillA to agent2.
      await SkillFactory.linkToAgent(testContext.authenticator, {
        skillId: skillA.id,
        agentConfigurationId: agent1.id,
      });
      await SkillFactory.linkToAgent(testContext.authenticator, {
        skillId: skillB.id,
        agentConfigurationId: agent1.id,
      });
      await SkillFactory.linkToAgent(testContext.authenticator, {
        skillId: skillA.id,
        agentConfigurationId: agent2.id,
      });

      const usageMap = await SkillResource.batchFetchUsage(
        testContext.authenticator,
        [skillA, skillB]
      );

      const usageA = usageMap.get(skillA.sId)!;
      expect(usageA.count).toBe(2);
      expect(usageA.agents.map((a) => a.name).sort()).toEqual([
        "Agent 1",
        "Agent 2",
      ]);

      const usageB = usageMap.get(skillB.sId)!;
      expect(usageB.count).toBe(1);
      expect(usageB.agents[0].name).toBe("Agent 1");
    });

    it("returns empty map for empty input", async () => {
      const usageMap = await SkillResource.batchFetchUsage(
        testContext.authenticator,
        []
      );
      expect(usageMap.size).toBe(0);
    });
  });

  describe("batchFetchMessageCounts", () => {
    it("returns an empty map for empty input", async () => {
      const messageCountMap = await SkillResource.batchFetchMessageCounts(
        testContext.authenticator,
        []
      );

      expect(messageCountMap.size).toBe(0);
    });

    it("counts distinct messages for custom and global skills", async () => {
      const customSkill = await SkillFactory.create(testContext.authenticator, {
        name: "Custom Skill With Messages",
      });
      const globalSkill = await SkillResource.fetchById(
        testContext.authenticator,
        "frames"
      );
      if (!globalSkill) {
        throw new Error("Expected frames global skill to exist.");
      }

      const agent = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        { name: "Agent With Skill Messages" }
      );
      const conversation = await ConversationFactory.create(
        testContext.authenticator,
        { agentConfigurationId: agent.sId, messagesCreatedAt: [] }
      );

      await customSkill.enableForAgent(testContext.authenticator, {
        agentConfiguration: agent,
        conversation,
      });
      await globalSkill.enableForAgent(testContext.authenticator, {
        agentConfiguration: agent,
        conversation,
      });

      const firstMessage = await ConversationFactory.createAgentMessageWithRank(
        {
          workspace: testContext.workspace,
          conversationId: conversation.id,
          rank: 0,
          agentConfigurationId: agent.sId,
        }
      );
      const secondMessage =
        await ConversationFactory.createAgentMessageWithRank({
          workspace: testContext.workspace,
          conversationId: conversation.id,
          rank: 1,
          agentConfigurationId: agent.sId,
        });
      if (!firstMessage.agentMessageId || !secondMessage.agentMessageId) {
        throw new Error("Expected agent messages to exist.");
      }

      await SkillResource.snapshotConversationSkillsForMessage(
        testContext.authenticator,
        {
          agentConfigurationId: agent.sId,
          agentMessageId: firstMessage.agentMessageId,
          conversationId: conversation.id,
        }
      );
      // Simulate a finalization retry after the first snapshot insert succeeds.
      await SkillResource.snapshotConversationSkillsForMessage(
        testContext.authenticator,
        {
          agentConfigurationId: agent.sId,
          agentMessageId: firstMessage.agentMessageId,
          conversationId: conversation.id,
        }
      );
      await SkillResource.snapshotConversationSkillsForMessage(
        testContext.authenticator,
        {
          agentConfigurationId: agent.sId,
          agentMessageId: secondMessage.agentMessageId,
          conversationId: conversation.id,
        }
      );

      const messageCountMap = await SkillResource.batchFetchMessageCounts(
        testContext.authenticator,
        [customSkill, globalSkill]
      );

      expect(messageCountMap.size).toBe(2);
      expect(messageCountMap.get(customSkill.sId)).toBe(2);
      expect(messageCountMap.get(globalSkill.sId)).toBe(2);
    });
  });

  describe("batchListEditors", () => {
    it("returns editors for skills with an editor grant", async () => {
      const skill = await SkillFactory.create(testContext.authenticator, {
        name: "Skill With Editor",
      });

      const editorsMap = await SkillResource.batchListEditors(
        testContext.authenticator,
        [skill]
      );

      const editors = editorsMap.get(skill.sId);
      expect(editors).not.toBeNull();
      // The creating user is added as editor by default.
      expect(editors!.length).toBeGreaterThanOrEqual(1);
      expect(editors!.some((e) => e.id === testContext.user.id)).toBe(true);
    });

    it("returns editors for multiple skills in batch", async () => {
      const skillA = await SkillFactory.create(testContext.authenticator, {
        name: "Skill A Editors",
      });
      const skillB = await SkillFactory.create(testContext.authenticator, {
        name: "Skill B Editors",
      });

      const editorsMap = await SkillResource.batchListEditors(
        testContext.authenticator,
        [skillA, skillB]
      );

      expect(editorsMap.get(skillA.sId)).not.toBeNull();
      expect(editorsMap.get(skillB.sId)).not.toBeNull();
    });

    it("returns editors for a mix of active and archived skills", async () => {
      const activeSkill = await SkillFactory.create(testContext.authenticator, {
        name: "Active Skill Editors",
      });
      const skillToArchive = await SkillFactory.create(
        testContext.authenticator,
        { name: "Archived Skill Editors" }
      );
      await skillToArchive.archive(testContext.authenticator);

      const editorsMap = await SkillResource.batchListEditors(
        testContext.authenticator,
        [activeSkill, skillToArchive]
      );

      // Archiving keeps the editor memberships, so the archived skill still lists its editors.
      expect(editorsMap.get(activeSkill.sId)?.map((e) => e.id)).toEqual([
        testContext.user.id,
      ]);
      expect(editorsMap.get(skillToArchive.sId)?.map((e) => e.id)).toEqual([
        testContext.user.id,
      ]);
    });

    it("returns empty map for empty input", async () => {
      const editorsMap = await SkillResource.batchListEditors(
        testContext.authenticator,
        []
      );
      expect(editorsMap.size).toBe(0);
    });
  });

  describe("batchFetchEditedByUsers", () => {
    it("returns edited-by users for skills", async () => {
      const skill = await SkillFactory.create(testContext.authenticator, {
        name: "Edited Skill",
      });

      const editedByMap = await SkillResource.batchFetchEditedByUsers(
        testContext.authenticator,
        [skill]
      );

      const editedByUser = editedByMap.get(skill.sId);
      expect(editedByUser).not.toBeNull();
      expect(editedByUser!.id).toBe(testContext.user.id);
    });

    it("returns null for skills with no editedBy", async () => {
      const skill = await SkillFactory.create(testContext.authenticator, {
        name: "Suggested Skill",
        status: "suggested",
      });

      const editedByMap = await SkillResource.batchFetchEditedByUsers(
        testContext.authenticator,
        [skill]
      );

      expect(editedByMap.get(skill.sId)).toBeNull();
    });

    it("returns correct users for multiple skills", async () => {
      const skillA = await SkillFactory.create(testContext.authenticator, {
        name: "Skill A EditedBy",
      });
      const skillB = await SkillFactory.create(testContext.authenticator, {
        name: "Skill B EditedBy",
      });

      const editedByMap = await SkillResource.batchFetchEditedByUsers(
        testContext.authenticator,
        [skillA, skillB]
      );

      // Both skills edited by the same user (testContext.user).
      expect(editedByMap.get(skillA.sId)?.id).toBe(testContext.user.id);
      expect(editedByMap.get(skillB.sId)?.id).toBe(testContext.user.id);
    });

    it("returns empty map for empty input", async () => {
      const editedByMap = await SkillResource.batchFetchEditedByUsers(
        testContext.authenticator,
        []
      );
      expect(editedByMap.size).toBe(0);
    });
  });

  describe("editors from group_permissions", () => {
    // A skill's editor group grants [read, write, admin] through its group_permissions row; a
    // "user" role grants only read, so write and admin flow purely through the grant.
    //
    // Returns a `buildEditorAuth` thunk rather than a ready authenticator: an Authenticator
    // snapshots its grants at construction, so callers must build it AFTER any grant mutation.
    async function setupSkillWithEditor(name: string): Promise<{
      skill: SkillResource;
      editor: UserResource;
      buildEditorAuth: () => Promise<Authenticator>;
    }> {
      const skill = await SkillFactory.create(testContext.authenticator, {
        name,
      });

      const editor = await UserFactory.basic();
      await MembershipFactory.associate(testContext.workspace, editor, {
        role: "user",
      });
      const upsert = await skill.upsertEditors(testContext.authenticator, [
        editor,
      ]);
      expect(upsert.isOk()).toBe(true);

      return {
        skill,
        editor,
        buildEditorAuth: () =>
          Authenticator.fromUserIdAndWorkspaceId(
            editor.sId,
            testContext.workspace.sId
          ),
      };
    }

    it("grants write and admin to an editor through the table", async () => {
      const { skill, buildEditorAuth } =
        await setupSkillWithEditor("Governed Skill");
      const editorAuth = await buildEditorAuth();

      expect(skill.canWrite(editorAuth)).toBe(true);
      expect(skill.canAdministrate(editorAuth)).toBe(true);
    });

    it("denies an editor whose grant was revoked", async () => {
      const { skill, buildEditorAuth } =
        await setupSkillWithEditor("Ungranted Skill");
      await GroupPermissionResource.deleteAllForResource(
        testContext.authenticator,
        { resourceType: "skill", resourceId: skill.id }
      );

      const editorAuth = await buildEditorAuth();

      expect(await skill.listEditors(editorAuth)).toEqual([]);
      expect(skill.canWrite(editorAuth)).toBe(false);
      expect(skill.canAdministrate(editorAuth)).toBe(false);
    });

    it("adds and removes editors through their grants", async () => {
      const { skill, editor } = await setupSkillWithEditor("Grant Write Skill");

      // upsertEditors granted the editor, and makeNew granted the creator.
      const editorsBefore = await skill.listEditors(testContext.authenticator);
      expect(editorsBefore?.map((e) => e.sId)).toContain(editor.sId);
      expect(editorsBefore?.map((e) => e.sId)).toContain(testContext.user.sId);

      const removeResult = await skill.removeEditors(
        testContext.authenticator,
        [editor]
      );
      expect(removeResult.isOk()).toBe(true);

      const editorsAfter = await skill.listEditors(testContext.authenticator);
      expect(editorsAfter?.map((e) => e.sId)).not.toContain(editor.sId);
      expect(editorsAfter?.map((e) => e.sId)).toContain(testContext.user.sId);
    });

    it("keeps a non-editor out, and lets a workspace admin administrate but not write", async () => {
      const { skill } = await setupSkillWithEditor("Role Rules Skill");

      const authFor = async (role: MembershipRoleType) => {
        const user = await UserFactory.basic();
        await MembershipFactory.associate(testContext.workspace, user, {
          role,
        });
        return Authenticator.fromUserIdAndWorkspaceId(
          user.sId,
          testContext.workspace.sId
        );
      };

      const otherAuth = await authFor("user");
      expect(skill.canWrite(otherAuth)).toBe(false);
      expect(skill.canAdministrate(otherAuth)).toBe(false);

      // An admin who is not an editor: the role rules grant admin (manage the editor list) but
      // never write — editing the skill itself stays with its editors.
      const adminAuth = await authFor("admin");
      expect(skill.canAdministrate(adminAuth)).toBe(true);
      expect(skill.canWrite(adminAuth)).toBe(false);
    });
  });
});
