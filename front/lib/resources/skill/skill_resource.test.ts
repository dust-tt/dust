import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { SkillDataSourceConfigurationModel } from "@app/lib/models/skill";
import { GroupSkillModel } from "@app/lib/models/skill/group_skill";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { SkillAttachedKnowledge } from "@app/lib/resources/skill/skill_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";

describe("SkillResource", () => {
  let testContext: Awaited<ReturnType<typeof createResourceTest>>;
  const createdConfigurations: SkillDataSourceConfigurationModel[] = [];

  beforeEach(async () => {
    testContext = await createResourceTest({ role: "admin" });
  });

  afterEach(async () => {
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
});
