import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { SkillDataSourceConfigurationModel } from "@app/lib/models/skill";
import { GroupSkillModel } from "@app/lib/models/skill/group_skill";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/code_defined/global_registry";
import type { SkillAttachedKnowledge } from "@app/lib/resources/skill/skill_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { serializeSkillTag } from "@app/lib/skills/format";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
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
      await GroupSpaceFactory.associate(space1, testContext.globalGroup);
      await GroupSpaceFactory.associate(space2, testContext.globalGroup);

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
      await GroupSpaceFactory.associate(sharedSpace, testContext.globalGroup);
      await GroupSpaceFactory.associate(
        skill1OnlySpace,
        testContext.globalGroup
      );

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
        referencedSkillIds: [childSkill.sId],
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
        requestedSpaceIds: parentSkill.requestedSpaceIds,
        referencedSkillIds: [childSkill.sId],
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
        referencedSkillIds: [childSkill.sId],
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
        requestedSpaceIds: [restrictedSpace.id],
        referencedSkillIds: [childSkill.sId],
      });

      const updatedParentSkill = await SkillResource.fetchById(
        testContext.authenticator,
        parentSkill.sId
      );

      expect(updatedParentSkill?.instructions).toContain(
        SkillFactory.serializeSkillReferenceTag(childSkill)
      );
    });

    it("preserves nested skill references when referencedSkillIds is omitted", async () => {
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
        requestedSpaceIds: updatedParentSkill!.requestedSpaceIds,
        referencedSkillIds: [],
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

    it("updates parent skill references when child requested spaces change", async () => {
      const restrictedSpace = await SpaceFactory.regular(testContext.workspace);
      const childSkill = await SkillFactory.create(testContext.authenticator, {
        name: "Child Skill",
      });
      const parentSkill = await SkillFactory.create(testContext.authenticator, {
        name: "Parent Skill",
        instructions: `Use ${SkillFactory.serializeSkillReferenceTag(childSkill)}.`,
        referencedSkillIds: [childSkill.sId],
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
        requestedSpaceIds: [restrictedSpace.id],
        referencedSkillIds: [],
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
        requestedSpaceIds: [],
        referencedSkillIds: [],
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
        requestedSpaceIds: childSkill.requestedSpaceIds,
        referencedSkillIds: [],
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
        requestedSpaceIds: childSkill.requestedSpaceIds,
        referencedSkillIds: [],
        status: "active",
      });

      const availableParentSkill = await SkillResource.fetchById(
        testContext.authenticator,
        parentSkill.sId
      );
      expect(availableParentSkill?.instructions).toContain(skillReferenceTag);
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
        referencedSkillIds: [missingSkillId],
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
        referencedSkillIds: [archivedChildSkill.sId],
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
        referencedSkillIds: ["frames"],
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
        instructions: parentSkill.instructions,
        instructionsHtml: parentSkill.instructionsHtml,
        icon: parentSkill.icon,
        mcpServerViews: [],
        attachedKnowledge: [],
        requestedSpaceIds: parentSkill.requestedSpaceIds,
        referencedSkillIds: [missingSkillId],
      });

      await expect(
        parentSkill.fetchChildSkills(testContext.authenticator)
      ).resolves.toHaveLength(0);
    });
  });

  describe("archive and restore", () => {
    it("suspends editor group memberships when archiving and restores them when restoring", async () => {
      const skill = await SkillFactory.create(testContext.authenticator, {
        name: "Skill To Archive",
      });
      expect(skill.editorGroup).not.toBeNull();
      const editorGroup = skill.editorGroup!;

      const membershipsBeforeArchive = await GroupMembershipModel.findAll({
        where: {
          groupId: editorGroup.id,
          workspaceId: testContext.workspace.id,
        },
      });
      expect(membershipsBeforeArchive.length).toBeGreaterThan(0);
      expect(membershipsBeforeArchive.every((m) => m.status === "active")).toBe(
        true
      );

      const { affectedCount: archiveCount } = await skill.archive(
        testContext.authenticator
      );
      expect(archiveCount).toBe(1);

      const membershipsAfterArchive = await GroupMembershipModel.findAll({
        where: {
          groupId: editorGroup.id,
          workspaceId: testContext.workspace.id,
        },
      });
      expect(
        membershipsAfterArchive.every((m) => m.status === "suspended")
      ).toBe(true);

      const { affectedCount: restoreCount } = await skill.restore(
        testContext.authenticator
      );
      expect(restoreCount).toBe(1);

      const membershipsAfterRestore = await GroupMembershipModel.findAll({
        where: {
          groupId: editorGroup.id,
          workspaceId: testContext.workspace.id,
        },
      });
      expect(membershipsAfterRestore.every((m) => m.status === "active")).toBe(
        true
      );
    });

    it("removes the skill's space requirements from agents when archiving and adds them back when restoring", async () => {
      const restrictedSpace = await SpaceFactory.regular(testContext.workspace);
      await GroupSpaceFactory.associate(
        restrictedSpace,
        testContext.globalGroup
      );

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
      await GroupSpaceFactory.associate(sharedSpace, testContext.globalGroup);

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
        referencedSkillIds: [childSkill.sId],
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
        requestedSpaceIds: archivedParentSkill!.requestedSpaceIds,
        referencedSkillIds: [childSkill.sId],
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
    it("should delete the skill and its associated editor group", async () => {
      const skillResource = await SkillFactory.create(
        testContext.authenticator,
        { name: "Skill To Delete" }
      );

      // Verify the skill and its editor group exist.
      const groupSkillBefore = await GroupSkillModel.findOne({
        where: {
          skillConfigurationId: skillResource.id,
          workspaceId: testContext.workspace.id,
        },
      });
      expect(groupSkillBefore).not.toBeNull();

      const editorGroupId = groupSkillBefore!.groupId;
      const [editorGroupBefore] = await GroupResource.fetchByModelIds(
        testContext.authenticator,
        [editorGroupId]
      );
      expect(editorGroupBefore).not.toBeNull();
      expect(editorGroupBefore!.kind).toBe("skill_editors");

      // Delete the skill.
      const result = await skillResource.delete(testContext.authenticator);
      expect(result.isOk()).toBe(true);

      // Verify the skill is deleted.
      const skillAfter = await SkillResource.fetchByModelIdWithAuth(
        testContext.authenticator,
        skillResource.id
      );
      expect(skillAfter).toBeNull();

      // Verify the GroupSkillModel entry is deleted.
      const groupSkillAfter = await GroupSkillModel.findOne({
        where: {
          skillConfigurationId: skillResource.id,
          workspaceId: testContext.workspace.id,
        },
      });
      expect(groupSkillAfter).toBeNull();

      // Verify the editor group is deleted.
      const editorGroupsAfter = await GroupResource.fetchByModelIds(
        testContext.authenticator,
        [editorGroupId]
      );
      expect(editorGroupsAfter).toHaveLength(0);
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
      await GroupSpaceFactory.associate(space, testContext.globalGroup);

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
      await GroupSpaceFactory.associate(space, testContext.globalGroup);

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
      await GroupSpaceFactory.associate(space, testContext.globalGroup);

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
      await GroupSpaceFactory.associate(space, testContext.globalGroup);

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

    it("should delete all skills and their associated editor groups", async () => {
      // Create multiple skills.
      const skill1 = await SkillFactory.create(testContext.authenticator, {
        name: "Skill 1 For Bulk Delete",
      });
      const skill2 = await SkillFactory.create(testContext.authenticator, {
        name: "Skill 2 For Bulk Delete",
      });

      // Get the editor group IDs before deletion.
      const groupSkills = await GroupSkillModel.findAll({
        where: { workspaceId: testContext.workspace.id },
      });
      const editorGroupIds = groupSkills.map((gs) => gs.groupId);
      expect(editorGroupIds.length).toBeGreaterThanOrEqual(2);

      // Verify editor groups exist.
      const editorGroupsBefore = await GroupResource.fetchByModelIds(
        testContext.authenticator,
        editorGroupIds
      );
      expect(editorGroupsBefore.length).toBe(editorGroupIds.length);
      expect(editorGroupsBefore.every((g) => g.kind === "skill_editors")).toBe(
        true
      );

      // Delete all skills for the workspace.
      await SkillResource.deleteAllForWorkspace(testContext.authenticator);

      // Verify skills are deleted.
      const skill1After = await SkillResource.fetchByModelIdWithAuth(
        testContext.authenticator,
        skill1.id
      );
      const skill2After = await SkillResource.fetchByModelIdWithAuth(
        testContext.authenticator,
        skill2.id
      );
      expect(skill1After).toBeNull();
      expect(skill2After).toBeNull();

      // Verify GroupSkillModel entries are deleted.
      const groupSkillsAfter = await GroupSkillModel.findAll({
        where: { workspaceId: testContext.workspace.id },
      });
      expect(groupSkillsAfter).toHaveLength(0);

      // Verify editor groups are deleted.
      const editorGroupsAfter = await GroupResource.fetchByModelIds(
        testContext.authenticator,
        editorGroupIds
      );
      expect(editorGroupsAfter).toHaveLength(0);
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

  describe("batchListEditors", () => {
    it("returns editors for skills with editor groups", async () => {
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
});
