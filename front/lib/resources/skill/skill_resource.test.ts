import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { SkillDataSourceConfigurationModel } from "@app/lib/models/skill";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { SkillAttachedKnowledge } from "@app/lib/resources/skill/skill_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
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
          nodeType: "document",
        },
        {
          dataSourceView: dataSourceView2,
          nodeId: "node2",
          nodeType: "folder",
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
          nodeType: "document",
        },
        {
          dataSourceView: dataSourceView1,
          nodeId: "node2",
          nodeType: "folder",
        },
        {
          dataSourceView: dataSourceView2,
          nodeId: "node3",
          nodeType: "document",
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
          nodeType: "document",
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
          nodeType: "document",
        },
        {
          dataSourceView: dataSourceView1,
          nodeId: "node3", // Change node2 to node3.
          nodeType: "folder",
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
          nodeType: "folder",
        },
        {
          dataSourceView: dataSourceView1,
          nodeId: "node1",
          nodeType: "document",
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
          nodeType: "document",
        },
        {
          dataSourceView: dataSourceView1,
          nodeId: "node1_new", // Add new node to existing DSV.
          nodeType: "folder",
        },
        {
          dataSourceView: dataSourceView3, // New DSV.
          nodeId: "node3",
          nodeType: "document",
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
          nodeType: "document",
        },
        {
          dataSourceView: dataSourceView1,
          nodeId: "node1", // Duplicate.
          nodeType: "folder",
        },
        {
          dataSourceView: dataSourceView1,
          nodeId: "node2",
          nodeType: "document",
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
          nodeType: "document",
        },
        {
          dataSourceView: dataSourceView1,
          nodeId: "node2",
          nodeType: "document",
        },
        {
          dataSourceView: dataSourceView1,
          nodeId: "node3", // Adding new node
          nodeType: "document",
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
      expect(toUpsert[0].dataSourceViewId).toBe(dataSourceView1.dataSource.id);
      expect(toUpsert[0].skillConfigurationId).toBe(skillResource.id);
    });
  });

  describe("updateSkill", () => {
    it("should propagate skill requestedSpaceIds to agents using the skill", async () => {
      // Create a restricted space.
      const restrictedSpace = await SpaceFactory.regular(testContext.workspace);

      // Create a skill without space restrictions.
      const skillResource = await SkillFactory.create(
        testContext.authenticator,
        { name: "Test Skill For Update" }
      );

      // Create an agent and link the skill to it.
      const agent = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        { name: "Test Agent With Skill" }
      );
      await SkillFactory.linkToAgent(testContext.authenticator, {
        skillId: skillResource.id,
        agentConfigurationId: agent.id,
      });

      // Verify agent has no requestedSpaceIds initially.
      const agentBefore = await AgentConfigurationModel.findByPk(agent.id);
      expect(agentBefore?.requestedSpaceIds).toEqual([]);

      // Update the skill with new requestedSpaceIds.
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

      // Verify agent now has the skill's requestedSpaceIds.
      const agentAfter = await AgentConfigurationModel.findByPk(agent.id);
      expect(agentAfter?.requestedSpaceIds.map((id) => Number(id))).toContain(
        restrictedSpace.id
      );
    });

    it("should not duplicate requestedSpaceIds if already present on agent", async () => {
      // Create a restricted space.
      const restrictedSpace = await SpaceFactory.regular(testContext.workspace);

      // Create a skill with the space restriction.
      const skillResource = await SkillFactory.create(
        testContext.authenticator,
        {
          name: "Test Skill With Space",
          requestedSpaceIds: [restrictedSpace.id],
        }
      );

      // Create an agent that already has the space in its requestedSpaceIds.
      const agent = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        { name: "Test Agent With Space" }
      );

      // Manually set the agent's requestedSpaceIds.
      await AgentConfigurationModel.update(
        { requestedSpaceIds: [restrictedSpace.id] },
        { where: { id: agent.id } }
      );

      await SkillFactory.linkToAgent(testContext.authenticator, {
        skillId: skillResource.id,
        agentConfigurationId: agent.id,
      });

      // Update the skill (no change to requestedSpaceIds).
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

      // Verify agent still has only one instance of the space ID.
      const agentAfter = await AgentConfigurationModel.findByPk(agent.id);
      const spaceIds = agentAfter?.requestedSpaceIds.map((id) => Number(id));
      expect(spaceIds?.filter((id) => id === restrictedSpace.id)).toHaveLength(
        1
      );
    });
  });
});
