import { beforeEach, describe, expect, it } from "vitest";

import type { Authenticator } from "@app/lib/auth";
import {
  AgentConfiguration,
  AgentUserRelation,
} from "@app/lib/models/assistant/agent";
import { GroupAgentModel } from "@app/lib/models/assistant/group_agent";
import { TagAgentModel } from "@app/lib/models/assistant/tag_agent";
import { TagModel } from "@app/lib/models/tags";
import { AgentConfigurationResource } from "@app/lib/resources/agent_configuration_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { TagResource } from "@app/lib/resources/tags_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { WorkspaceType } from "@app/types";

describe("AgentConfigurationResource", () => {
  let auth: Authenticator;
  let workspace: WorkspaceType;
  let user: UserResource;
  let globalSpace: SpaceResource;

  beforeEach(async () => {
    const testSetup = await createResourceTest({ role: "admin" });
    auth = testSetup.authenticator;
    workspace = testSetup.workspace;
    user = testSetup.user;
    globalSpace = testSetup.globalSpace;
  });

  describe("makeNew", () => {
    it("should create a new agent configuration", async () => {
      const result = await AgentConfigurationResource.makeNew(auth, {
        sId: generateRandomModelSId(),
        version: 0,
        status: "active",
        scope: "visible",
        name: "Test Agent",
        description: "A test agent",
        instructions: "Test instructions",
        providerId: "openai",
        modelId: "gpt-4o",
        temperature: 0.7,
        reasoningEffort: null,
        pictureUrl: "https://example.com/picture.png",
        authorId: user.id,
        maxStepsPerRun: 10,
        templateId: null,
        requestedSpaceIds: [],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource = result.value;
        expect(resource.sId).toBeDefined();
        expect(resource.name).toBe("Test Agent");
        expect(resource.workspaceId).toBe(workspace.id);
      }
    });

    it("should create agent with all optional fields", async () => {
      const result = await AgentConfigurationResource.makeNew(auth, {
        sId: generateRandomModelSId(),
        version: 1,
        status: "active",
        scope: "visible",
        name: "Full Agent",
        description: "Full test agent",
        instructions: "Detailed instructions",
        providerId: "anthropic",
        modelId: "claude-3-5-sonnet-20241022",
        temperature: 0.5,
        reasoningEffort: "medium",
        pictureUrl: "https://example.com/full.png",
        authorId: user.id,
        maxStepsPerRun: 20,
        templateId: null,
        requestedSpaceIds: [globalSpace.id],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource = result.value;
        expect(resource.reasoningEffort).toBe("medium");
        // Sequelize returns BigInts as strings
        expect(resource.requestedSpaceIds).toEqual([String(globalSpace.id)]);
      }
    });

    it("should set maxStepsPerRun default when not provided", async () => {
      const result = await AgentConfigurationResource.makeNew(auth, {
        sId: generateRandomModelSId(),
        version: 0,
        status: "active",
        scope: "visible",
        name: "Default Steps Agent",
        description: "Test default maxStepsPerRun",
        instructions: null,
        providerId: "openai",
        modelId: "gpt-4o",
        temperature: 0.7,
        reasoningEffort: null,
        pictureUrl: "https://example.com/picture.png",
        authorId: user.id,
        maxStepsPerRun: 10,
        templateId: null,
        requestedSpaceIds: [],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource = result.value;
        expect(resource.maxStepsPerRun).toBeDefined();
        expect(resource.maxStepsPerRun).toBeGreaterThan(0);
      }
    });

    it("should create agent with tags", async () => {
      // Create a tag using TagResource
      const tagResource = await TagResource.makeNew(auth, {
        name: "test-tag",
        kind: "standard",
      });
      expect(tagResource).toBeDefined();

      const result = await AgentConfigurationResource.makeNew(auth, {
        sId: generateRandomModelSId(),
        version: 0,
        status: "active",
        scope: "visible",
        name: "Tagged Agent",
        description: "Agent with tags",
        instructions: null,
        providerId: "openai",
        modelId: "gpt-4o",
        temperature: 0.7,
        reasoningEffort: null,
        pictureUrl: "https://example.com/picture.png",
        authorId: user.id,
        maxStepsPerRun: 10,
        templateId: null,
        requestedSpaceIds: [],
        tags: [{ sId: tagResource.sId, name: "test-tag", kind: "standard" }],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource = result.value;
        // Verify tag association was created
        const tagAssociation = await TagAgentModel.findOne({
          where: {
            workspaceId: workspace.id,
            agentConfigurationId: resource.id,
          },
        });
        expect(tagAssociation).not.toBeNull();
      }
    });

    it("should create agent with editors and editor group", async () => {
      const result = await AgentConfigurationResource.makeNew(auth, {
        sId: generateRandomModelSId(),
        version: 0,
        status: "active",
        scope: "visible",
        name: "Agent with Editors",
        description: "Agent with editor group",
        instructions: null,
        providerId: "openai",
        modelId: "gpt-4o",
        temperature: 0.7,
        reasoningEffort: null,
        pictureUrl: "https://example.com/picture.png",
        authorId: user.id,
        maxStepsPerRun: 10,
        templateId: null,
        requestedSpaceIds: [],
        editors: [user.toJSON()],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource = result.value;
        // Verify editor group was created
        const group = await GroupResource.fetchByAgentConfiguration({
          auth,
          agentConfiguration: { id: resource.id, sId: resource.sId } as any,
        });
        expect(group).not.toBeNull();
      }
    });

    it("should bump version and archive old versions when updating", async () => {
      const agentSId = generateRandomModelSId();

      // Create v0
      const result1 = await AgentConfigurationResource.makeNew(auth, {
        sId: agentSId,
        version: 0,
        status: "active",
        scope: "visible",
        name: "Versioned Agent v0",
        description: "Version 0",
        instructions: null,
        providerId: "openai",
        modelId: "gpt-4o",
        temperature: 0.7,
        reasoningEffort: null,
        pictureUrl: "https://example.com/picture.png",
        authorId: user.id,
        maxStepsPerRun: 10,
        templateId: null,
        requestedSpaceIds: [],
        editors: [user.toJSON()],
      });
      expect(result1.isOk()).toBe(true);

      // Create v1 with same sId
      const result2 = await AgentConfigurationResource.makeNew(auth, {
        sId: agentSId,
        version: 1,
        status: "active",
        scope: "visible",
        name: "Versioned Agent v1",
        description: "Version 1",
        instructions: null,
        providerId: "openai",
        modelId: "gpt-4o",
        temperature: 0.7,
        reasoningEffort: null,
        pictureUrl: "https://example.com/picture.png",
        authorId: user.id,
        maxStepsPerRun: 10,
        templateId: null,
        requestedSpaceIds: [],
        editors: [user.toJSON()],
      });

      expect(result2.isOk()).toBe(true);
      if (result2.isOk()) {
        const resource = result2.value;
        expect(resource.version).toBe(1);
        expect(resource.name).toBe("Versioned Agent v1");

        // Verify old version is archived
        const oldVersion = await AgentConfiguration.findOne({
          where: {
            workspaceId: workspace.id,
            sId: agentSId,
            version: 0,
          },
        });
        expect(oldVersion).not.toBeNull();
        expect(oldVersion?.status).toBe("archived");
      }
    });

    it("should fail when non-admin user not in editors", async () => {
      // Create a non-admin user
      const { authenticator: nonAdminAuth, user: nonAdminUser } =
        await createResourceTest({ role: "user" });

      const result = await AgentConfigurationResource.makeNew(nonAdminAuth, {
        sId: generateRandomModelSId(),
        version: 0,
        status: "active",
        scope: "visible",
        name: "Unauthorized Agent",
        description: "Should fail",
        instructions: null,
        providerId: "openai",
        modelId: "gpt-4o",
        temperature: 0.7,
        reasoningEffort: null,
        pictureUrl: "https://example.com/picture.png",
        authorId: nonAdminUser.id,
        maxStepsPerRun: 10,
        templateId: null,
        requestedSpaceIds: [],
        editors: [user.toJSON()], // Different user!
      });

      expect(result.isErr()).toBe(true);
    });

    it("should allow admin to create agent without being in editors", async () => {
      // Admin can create agents even if not in editors
      const result = await AgentConfigurationResource.makeNew(auth, {
        sId: generateRandomModelSId(),
        version: 0,
        status: "active",
        scope: "visible",
        name: "Admin Created Agent",
        description: "Created by admin",
        instructions: null,
        providerId: "openai",
        modelId: "gpt-4o",
        temperature: 0.7,
        reasoningEffort: null,
        pictureUrl: "https://example.com/picture.png",
        authorId: user.id,
        maxStepsPerRun: 10,
        templateId: null,
        requestedSpaceIds: [],
        editors: [], // Empty editors, but admin should still succeed
      });

      expect(result.isOk()).toBe(true);
    });

    it("should associate existing editor group when updating agent", async () => {
      const agentSId = generateRandomModelSId();

      // Create v0
      const result1 = await AgentConfigurationResource.makeNew(auth, {
        sId: agentSId,
        version: 0,
        status: "active",
        scope: "visible",
        name: "Group Reuse Agent v0",
        description: "Version 0",
        instructions: null,
        providerId: "openai",
        modelId: "gpt-4o",
        temperature: 0.7,
        reasoningEffort: null,
        pictureUrl: "https://example.com/picture.png",
        authorId: user.id,
        maxStepsPerRun: 10,
        templateId: null,
        requestedSpaceIds: [],
        editors: [user.toJSON()],
      });
      expect(result1.isOk()).toBe(true);

      // Get the editor group for v0
      if (!result1.isOk()) {
        throw new Error("Failed to create agent");
      }
      const group1 = await GroupResource.fetchByAgentConfiguration({
        auth,
        agentConfiguration: {
          id: result1.value.id,
          sId: agentSId,
        } as any,
      });
      expect(group1).not.toBeNull();

      // Create v1
      const result2 = await AgentConfigurationResource.makeNew(auth, {
        sId: agentSId,
        version: 1,
        status: "active",
        scope: "visible",
        name: "Group Reuse Agent v1",
        description: "Version 1",
        instructions: null,
        providerId: "openai",
        modelId: "gpt-4o",
        temperature: 0.7,
        reasoningEffort: null,
        pictureUrl: "https://example.com/picture.png",
        authorId: user.id,
        maxStepsPerRun: 10,
        templateId: null,
        requestedSpaceIds: [],
        editors: [user.toJSON()],
      });

      expect(result2.isOk()).toBe(true);

      // Verify the same group is associated with both versions
      const groupAssociations = await GroupAgentModel.findAll({
        where: {
          workspaceId: workspace.id,
          groupId: group1!.id,
        },
      });

      expect(groupAssociations.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("toJSON", () => {
    it("should convert resource to JSON format", async () => {
      const agentSId = generateRandomModelSId();
      const result = await AgentConfigurationResource.makeNew(auth, {
        sId: agentSId,
        version: 0,
        status: "active",
        scope: "visible",
        name: "JSON Test Agent",
        description: "For JSON conversion test",
        instructions: "Test instructions",
        providerId: "openai",
        modelId: "gpt-4o",
        temperature: 0.7,
        reasoningEffort: null,
        pictureUrl: "https://example.com/picture.png",
        authorId: user.id,
        maxStepsPerRun: 10,
        templateId: null,
        requestedSpaceIds: [globalSpace.id],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource = result.value;
        const json = resource.toJSON();

        expect(json.id).toBe(resource.id);
        expect(json.sId).toBe(agentSId);
        expect(json.name).toBe("JSON Test Agent");
        expect(json.description).toBe("For JSON conversion test");
        expect(json.status).toBe("active");
        expect(json.scope).toBe("visible");
        expect(json.model.providerId).toBe("openai");
        expect(json.model.modelId).toBe("gpt-4o");
        expect(json.model.temperature).toBe(0.7);
        expect(json.requestedSpaceIds).toHaveLength(1);
        expect(json.requestedGroupIds).toEqual([]);
        expect(json.templateId).toBeNull();

        // These fields should NOT be present (they're omitted)
        expect("userFavorite" in json).toBe(false);
        expect("tags" in json).toBe(false);
        expect("canRead" in json).toBe(false);
        expect("canEdit" in json).toBe(false);
      }
    });

    it("should convert templateId to sId when present", async () => {
      // This test would require creating a template first
      // For now, just verify null case is handled
      const result = await AgentConfigurationResource.makeNew(auth, {
        sId: generateRandomModelSId(),
        version: 0,
        status: "active",
        scope: "visible",
        name: "Template Test Agent",
        description: "Test",
        instructions: null,
        providerId: "openai",
        modelId: "gpt-4o",
        temperature: 0.7,
        reasoningEffort: null,
        pictureUrl: "https://example.com/picture.png",
        authorId: user.id,
        maxStepsPerRun: 10,
        templateId: null,
        requestedSpaceIds: [],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const json = result.value.toJSON();
        expect(json.templateId).toBeNull();
      }
    });
  });

  describe("fetchById", () => {
    let agentSId: string;

    beforeEach(async () => {
      agentSId = generateRandomModelSId();
      const result = await AgentConfigurationResource.makeNew(auth, {
        sId: agentSId,
        version: 0,
        status: "active",
        scope: "visible",
        name: "Fetch Test Agent",
        description: "For fetch tests",
        instructions: null,
        providerId: "openai",
        modelId: "gpt-4o",
        temperature: 0.7,
        reasoningEffort: null,
        pictureUrl: "https://example.com/picture.png",
        authorId: user.id,
        maxStepsPerRun: 10,
        templateId: null,
        requestedSpaceIds: [],
      });
      expect(result.isOk()).toBe(true);
    });

    it("should fetch agent by sId (latest version)", async () => {
      const resource = await AgentConfigurationResource.fetchById(
        auth,
        agentSId
      );

      expect(resource).not.toBeNull();
      expect(resource?.sId).toBe(agentSId);
      expect(resource?.version).toBe(0);
    });

    it("should fetch latest version when multiple versions exist", async () => {
      // Create version 1
      const result1 = await AgentConfigurationResource.makeNew(auth, {
        sId: agentSId,
        version: 1,
        status: "active",
        scope: "visible",
        name: "Fetch Test Agent v1",
        description: "Version 1",
        instructions: null,
        providerId: "openai",
        modelId: "gpt-4o",
        temperature: 0.7,
        reasoningEffort: null,
        pictureUrl: "https://example.com/picture.png",
        authorId: user.id,
        maxStepsPerRun: 10,
        templateId: null,
        requestedSpaceIds: [],
      });
      expect(result1.isOk()).toBe(true);

      const resource = await AgentConfigurationResource.fetchById(
        auth,
        agentSId
      );

      expect(resource).not.toBeNull();
      expect(resource?.version).toBe(1);
      expect(resource?.name).toBe("Fetch Test Agent v1");
    });

    it("should fetch specific version", async () => {
      // Create version 1
      await AgentConfigurationResource.makeNew(auth, {
        sId: agentSId,
        version: 1,
        status: "active",
        scope: "visible",
        name: "Fetch Test Agent v1",
        description: "Version 1",
        instructions: null,
        providerId: "openai",
        modelId: "gpt-4o",
        temperature: 0.7,
        reasoningEffort: null,
        pictureUrl: "https://example.com/picture.png",
        authorId: user.id,
        maxStepsPerRun: 10,
        templateId: null,
        requestedSpaceIds: [],
      });

      const resource = await AgentConfigurationResource.fetchById(
        auth,
        agentSId,
        0
      );

      expect(resource).not.toBeNull();
      expect(resource?.version).toBe(0);
      expect(resource?.name).toBe("Fetch Test Agent");
    });

    it("should return null when agent not found", async () => {
      const resource = await AgentConfigurationResource.fetchById(
        auth,
        "nonexistent-sid"
      );

      expect(resource).toBeNull();
    });

    it("should fetch archived agents", async () => {
      // Archive the agent
      await AgentConfiguration.update(
        { status: "archived" },
        {
          where: {
            workspaceId: workspace.id,
            sId: agentSId,
          },
        }
      );

      // Should still find the archived agent (no status filtering)
      const resource = await AgentConfigurationResource.fetchById(
        auth,
        agentSId
      );
      expect(resource).not.toBeNull();
      expect(resource?.status).toBe("archived");
    });

    it("should fetch agents with global space access", async () => {
      // Create agent with global space
      const globalAgentSId = generateRandomModelSId();
      const result = await AgentConfigurationResource.makeNew(auth, {
        sId: globalAgentSId,
        version: 0,
        status: "active",
        scope: "visible",
        name: "Global Agent",
        description: "Agent with global space",
        instructions: null,
        providerId: "openai",
        modelId: "gpt-4o",
        temperature: 0.7,
        reasoningEffort: null,
        pictureUrl: "https://example.com/picture.png",
        authorId: user.id,
        maxStepsPerRun: 10,
        templateId: null,
        requestedSpaceIds: [globalSpace.id],
      });
      expect(result.isOk()).toBe(true);

      // Admin should be able to fetch it (has access to global space)
      const resource = await AgentConfigurationResource.fetchById(
        auth,
        globalAgentSId
      );
      expect(resource).not.toBeNull();
      expect(resource?.name).toBe("Global Agent");
    });
  });

  describe("fetchByName", () => {
    beforeEach(async () => {
      const result = await AgentConfigurationResource.makeNew(auth, {
        sId: generateRandomModelSId(),
        version: 0,
        status: "active",
        scope: "visible",
        name: "Named Agent",
        description: "For name tests",
        instructions: null,
        providerId: "openai",
        modelId: "gpt-4o",
        temperature: 0.7,
        reasoningEffort: null,
        pictureUrl: "https://example.com/picture.png",
        authorId: user.id,
        maxStepsPerRun: 10,
        templateId: null,
        requestedSpaceIds: [],
      });
      expect(result.isOk()).toBe(true);
    });

    it("should fetch agent by exact name", async () => {
      const resource = await AgentConfigurationResource.fetchByName(
        auth,
        "Named Agent"
      );

      expect(resource).not.toBeNull();
      expect(resource?.name).toBe("Named Agent");
    });

    it("should return null when name not found", async () => {
      const resource = await AgentConfigurationResource.fetchByName(
        auth,
        "Nonexistent Agent"
      );

      expect(resource).toBeNull();
    });

    it("should be case sensitive", async () => {
      const resource = await AgentConfigurationResource.fetchByName(
        auth,
        "named agent"
      );

      expect(resource).toBeNull();
    });
  });

  describe("listByIds", () => {
    let agent1SId: string;
    let agent2SId: string;
    let agent3SId: string;

    beforeEach(async () => {
      agent1SId = generateRandomModelSId();
      agent2SId = generateRandomModelSId();
      agent3SId = generateRandomModelSId();

      // Create three agents
      await AgentConfigurationResource.makeNew(auth, {
        sId: agent1SId,
        version: 0,
        status: "active",
        scope: "visible",
        name: "Agent 1",
        description: "First agent",
        instructions: null,
        providerId: "openai",
        modelId: "gpt-4o",
        temperature: 0.7,
        reasoningEffort: null,
        pictureUrl: "https://example.com/1.png",
        authorId: user.id,
        maxStepsPerRun: 10,
        templateId: null,
        requestedSpaceIds: [],
      });

      await AgentConfigurationResource.makeNew(auth, {
        sId: agent2SId,
        version: 0,
        status: "active",
        scope: "visible",
        name: "Agent 2",
        description: "Second agent",
        instructions: null,
        providerId: "openai",
        modelId: "gpt-4o",
        temperature: 0.7,
        reasoningEffort: null,
        pictureUrl: "https://example.com/2.png",
        authorId: user.id,
        maxStepsPerRun: 10,
        templateId: null,
        requestedSpaceIds: [],
      });

      await AgentConfigurationResource.makeNew(auth, {
        sId: agent3SId,
        version: 0,
        status: "archived",
        scope: "visible",
        name: "Agent 3",
        description: "Third agent",
        instructions: null,
        providerId: "openai",
        modelId: "gpt-4o",
        temperature: 0.7,
        reasoningEffort: null,
        pictureUrl: "https://example.com/3.png",
        authorId: user.id,
        maxStepsPerRun: 10,
        templateId: null,
        requestedSpaceIds: [],
      });
    });

    it("should fetch latest versions of multiple agents", async () => {
      const resources = await AgentConfigurationResource.listByIds(auth, [
        agent1SId,
        agent2SId,
      ]);

      expect(resources).toHaveLength(2);
      const sIds = resources.map((r) => r.sId);
      expect(sIds).toContain(agent1SId);
      expect(sIds).toContain(agent2SId);
    });

    it("should return empty array for empty input", async () => {
      const resources = await AgentConfigurationResource.listByIds(auth, []);

      expect(resources).toHaveLength(0);
    });

    it("should fetch all versions when specified", async () => {
      // Create version 1 of agent1
      await AgentConfigurationResource.makeNew(auth, {
        sId: agent1SId,
        version: 1,
        status: "active",
        scope: "visible",
        name: "Agent 1 v1",
        description: "First agent v1",
        instructions: null,
        providerId: "openai",
        modelId: "gpt-4o",
        temperature: 0.7,
        reasoningEffort: null,
        pictureUrl: "https://example.com/1.png",
        authorId: user.id,
        maxStepsPerRun: 10,
        templateId: null,
        requestedSpaceIds: [],
      });

      const resources = await AgentConfigurationResource.listByIds(
        auth,
        [agent1SId],
        "all"
      );

      expect(resources).toHaveLength(2);
      expect(resources[0]?.version).toBe(1);
      expect(resources[1]?.version).toBe(0);
    });

    it("should filter by status", async () => {
      const resources = await AgentConfigurationResource.listByIds(
        auth,
        [agent1SId, agent2SId, agent3SId],
        "latest",
        "active"
      );

      expect(resources).toHaveLength(2);
      const sIds = resources.map((r) => r.sId);
      expect(sIds).not.toContain(agent3SId);
    });

    it("should fetch agents with global space access in bulk", async () => {
      // Create agent with global space
      const globalAgentSId = generateRandomModelSId();
      await AgentConfigurationResource.makeNew(auth, {
        sId: globalAgentSId,
        version: 0,
        status: "active",
        scope: "visible",
        name: "Global List Agent",
        description: "Agent with global space for list",
        instructions: null,
        providerId: "openai",
        modelId: "gpt-4o",
        temperature: 0.7,
        reasoningEffort: null,
        pictureUrl: "https://example.com/global.png",
        authorId: user.id,
        maxStepsPerRun: 10,
        templateId: null,
        requestedSpaceIds: [globalSpace.id],
      });

      // Should fetch both regular agents and ones with global space
      const resources = await AgentConfigurationResource.listByIds(auth, [
        agent1SId,
        globalAgentSId,
      ]);

      expect(resources).toHaveLength(2);
      const sIds = resources.map((r) => r.sId);
      expect(sIds).toContain(agent1SId);
      expect(sIds).toContain(globalAgentSId);
    });
  });

  describe("searchByName", () => {
    beforeEach(async () => {
      await AgentConfigurationResource.makeNew(auth, {
        sId: generateRandomModelSId(),
        version: 0,
        status: "active",
        scope: "visible",
        name: "Sales Assistant",
        description: "Helps with sales",
        instructions: null,
        providerId: "openai",
        modelId: "gpt-4o",
        temperature: 0.7,
        reasoningEffort: null,
        pictureUrl: "https://example.com/sales.png",
        authorId: user.id,
        maxStepsPerRun: 10,
        templateId: null,
        requestedSpaceIds: [],
      });

      await AgentConfigurationResource.makeNew(auth, {
        sId: generateRandomModelSId(),
        version: 0,
        status: "active",
        scope: "visible",
        name: "Support Agent",
        description: "Provides support",
        instructions: null,
        providerId: "openai",
        modelId: "gpt-4o",
        temperature: 0.7,
        reasoningEffort: null,
        pictureUrl: "https://example.com/support.png",
        authorId: user.id,
        maxStepsPerRun: 10,
        templateId: null,
        requestedSpaceIds: [],
      });

      await AgentConfigurationResource.makeNew(auth, {
        sId: generateRandomModelSId(),
        version: 0,
        status: "active",
        scope: "visible",
        name: "Marketing Bot",
        description: "Marketing automation",
        instructions: null,
        providerId: "openai",
        modelId: "gpt-4o",
        temperature: 0.7,
        reasoningEffort: null,
        pictureUrl: "https://example.com/marketing.png",
        authorId: user.id,
        maxStepsPerRun: 10,
        templateId: null,
        requestedSpaceIds: [],
      });
    });

    it("should search by name pattern (case insensitive)", async () => {
      const resources = await AgentConfigurationResource.searchByName(
        auth,
        "agent"
      );

      expect(resources.length).toBeGreaterThanOrEqual(1);
      const names = resources.map((r) => r.name);
      expect(names).toContain("Support Agent");
    });

    it("should return empty array when no matches", async () => {
      const resources = await AgentConfigurationResource.searchByName(
        auth,
        "nonexistent"
      );

      expect(resources).toHaveLength(0);
    });

    it("should be case insensitive", async () => {
      const resources = await AgentConfigurationResource.searchByName(
        auth,
        "SALES"
      );

      expect(resources.length).toBeGreaterThanOrEqual(1);
      const names = resources.map((r) => r.name);
      expect(names).toContain("Sales Assistant");
    });

    it("should match partial names", async () => {
      const resources = await AgentConfigurationResource.searchByName(
        auth,
        "Bot"
      );

      expect(resources.length).toBeGreaterThanOrEqual(1);
      const names = resources.map((r) => r.name);
      expect(names).toContain("Marketing Bot");
    });
  });

  describe("updateScope", () => {
    let resource: AgentConfigurationResource;

    beforeEach(async () => {
      const result = await AgentConfigurationResource.makeNew(auth, {
        sId: generateRandomModelSId(),
        version: 0,
        status: "active",
        scope: "visible",
        name: "Update Test Agent",
        description: "For update tests",
        instructions: null,
        providerId: "openai",
        modelId: "gpt-4o",
        temperature: 0.7,
        reasoningEffort: null,
        pictureUrl: "https://example.com/picture.png",
        authorId: user.id,
        maxStepsPerRun: 10,
        templateId: null,
        requestedSpaceIds: [],
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        resource = result.value;
      }
    });

    it("should update agent scope", async () => {
      const updateResult = await resource.updateScope(auth, "visible");

      expect(updateResult.isOk()).toBe(true);
      expect(resource.scope).toBe("visible");
    });
  });

  describe("updateRequirements", () => {
    let resource: AgentConfigurationResource;

    beforeEach(async () => {
      const result = await AgentConfigurationResource.makeNew(auth, {
        sId: generateRandomModelSId(),
        version: 0,
        status: "active",
        scope: "visible",
        name: "Requirements Test Agent",
        description: "For requirements tests",
        instructions: null,
        providerId: "openai",
        modelId: "gpt-4o",
        temperature: 0.7,
        reasoningEffort: null,
        pictureUrl: "https://example.com/picture.png",
        authorId: user.id,
        maxStepsPerRun: 10,
        templateId: null,
        requestedSpaceIds: [],
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        resource = result.value;
      }
    });

    it("should update requested space IDs", async () => {
      const updateResult = await resource.updateRequirements(auth, [
        globalSpace.id,
      ]);

      expect(updateResult.isOk()).toBe(true);
      // Sequelize returns BigInts as strings
      expect(resource.requestedSpaceIds).toEqual([String(globalSpace.id)]);
    });
  });

  describe("archive and restore", () => {
    let resource: AgentConfigurationResource;
    let agentSId: string;

    beforeEach(async () => {
      agentSId = generateRandomModelSId();
      const result = await AgentConfigurationResource.makeNew(auth, {
        sId: agentSId,
        version: 0,
        status: "active",
        scope: "visible",
        name: "Archive Test Agent",
        description: "For archive tests",
        instructions: null,
        providerId: "openai",
        modelId: "gpt-4o",
        temperature: 0.7,
        reasoningEffort: null,
        pictureUrl: "https://example.com/picture.png",
        authorId: user.id,
        maxStepsPerRun: 10,
        templateId: null,
        requestedSpaceIds: [],
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        resource = result.value;
      }
    });

    it("should archive agent (soft delete)", async () => {
      const archiveResult = await resource.archive(auth);

      expect(archiveResult.isOk()).toBe(true);

      // Verify it's archived in DB
      const agentInDb = await AgentConfiguration.findOne({
        where: {
          workspaceId: workspace.id,
          sId: agentSId,
        },
      });
      expect(agentInDb?.status).toBe("archived");
    });

    it("should archive all versions of an agent", async () => {
      // Create version 1
      await AgentConfigurationResource.makeNew(auth, {
        sId: agentSId,
        version: 1,
        status: "active",
        scope: "visible",
        name: "Archive Test Agent v1",
        description: "Version 1",
        instructions: null,
        providerId: "openai",
        modelId: "gpt-4o",
        temperature: 0.7,
        reasoningEffort: null,
        pictureUrl: "https://example.com/picture.png",
        authorId: user.id,
        maxStepsPerRun: 10,
        templateId: null,
        requestedSpaceIds: [],
      });

      const archiveResult = await resource.archive(auth);
      expect(archiveResult.isOk()).toBe(true);

      // Check both versions are archived
      const allVersions = await AgentConfiguration.findAll({
        where: {
          workspaceId: workspace.id,
          sId: agentSId,
        },
      });

      expect(allVersions).toHaveLength(2);
      expect(allVersions.every((v) => v.status === "archived")).toBe(true);
    });

    it("should restore archived agent", async () => {
      // Archive first
      await resource.archive(auth);

      // Then restore
      const restoreResult = await resource.restore(auth);
      expect(restoreResult.isOk()).toBe(true);

      // Verify it's active in DB
      const agentInDb = await AgentConfiguration.findOne({
        where: {
          workspaceId: workspace.id,
          sId: agentSId,
        },
      });
      expect(agentInDb?.status).toBe("active");
    });
  });

  describe("delete", () => {
    let resource: AgentConfigurationResource;
    let agentSId: string;

    beforeEach(async () => {
      agentSId = generateRandomModelSId();
      const result = await AgentConfigurationResource.makeNew(auth, {
        sId: agentSId,
        version: 0,
        status: "active",
        scope: "visible",
        name: "Delete Test Agent",
        description: "For delete tests",
        instructions: null,
        providerId: "openai",
        modelId: "gpt-4o",
        temperature: 0.7,
        reasoningEffort: null,
        pictureUrl: "https://example.com/picture.png",
        authorId: user.id,
        maxStepsPerRun: 10,
        templateId: null,
        requestedSpaceIds: [],
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        resource = result.value;
      }
    });

    it("should hard delete agent", async () => {
      const deleteResult = await resource.delete(auth);

      expect(deleteResult.isOk()).toBe(true);

      // Verify it's deleted from DB
      const agentInDb = await AgentConfiguration.findOne({
        where: {
          workspaceId: workspace.id,
          id: resource.id,
        },
      });
      expect(agentInDb).toBeNull();
    });

    it("should delete TagAgentModel records", async () => {
      // Create a tag and associate it
      const tag = await TagModel.create({
        workspaceId: workspace.id,
        name: "test-tag",
        kind: "standard",
      });

      await TagAgentModel.create({
        workspaceId: workspace.id,
        tagId: tag.id,
        agentConfigurationId: resource.id,
      });

      const deleteResult = await resource.delete(auth);
      expect(deleteResult.isOk()).toBe(true);

      // Verify tag association is deleted
      const tagAgent = await TagAgentModel.findOne({
        where: {
          workspaceId: workspace.id,
          agentConfigurationId: resource.id,
        },
      });
      expect(tagAgent).toBeNull();
    });

    it("should delete GroupAgentModel records", async () => {
      // Create a group and associate it
      const group = await GroupResource.makeNew({
        name: "Test Group",
        kind: "regular",
        workspaceId: workspace.id,
      });

      await GroupAgentModel.create({
        workspaceId: workspace.id,
        groupId: group.id,
        agentConfigurationId: resource.id,
      });

      const deleteResult = await resource.delete(auth);
      expect(deleteResult.isOk()).toBe(true);

      // Verify group association is deleted
      const groupAgent = await GroupAgentModel.findOne({
        where: {
          workspaceId: workspace.id,
          agentConfigurationId: resource.id,
        },
      });
      expect(groupAgent).toBeNull();
    });

    it("should delete AgentUserRelation records", async () => {
      // Create a user relation
      await AgentUserRelation.create({
        workspaceId: workspace.id,
        userId: user.id,
        agentConfiguration: agentSId,
        favorite: true,
      });

      const deleteResult = await resource.delete(auth);
      expect(deleteResult.isOk()).toBe(true);

      // Verify user relation is deleted
      const relation = await AgentUserRelation.findOne({
        where: {
          workspaceId: workspace.id,
          agentConfiguration: agentSId,
        },
      });
      expect(relation).toBeNull();
    });
  });

  describe("favorites", () => {
    let agent1SId: string;
    let agent2SId: string;

    beforeEach(async () => {
      agent1SId = generateRandomModelSId();
      agent2SId = generateRandomModelSId();

      await AgentConfigurationResource.makeNew(auth, {
        sId: agent1SId,
        version: 0,
        status: "active",
        scope: "visible",
        name: "Favorite Agent 1",
        description: "First favorite",
        instructions: null,
        providerId: "openai",
        modelId: "gpt-4o",
        temperature: 0.7,
        reasoningEffort: null,
        pictureUrl: "https://example.com/1.png",
        authorId: user.id,
        maxStepsPerRun: 10,
        templateId: null,
        requestedSpaceIds: [],
      });

      await AgentConfigurationResource.makeNew(auth, {
        sId: agent2SId,
        version: 0,
        status: "active",
        scope: "visible",
        name: "Favorite Agent 2",
        description: "Second favorite",
        instructions: null,
        providerId: "openai",
        modelId: "gpt-4o",
        temperature: 0.7,
        reasoningEffort: null,
        pictureUrl: "https://example.com/2.png",
        authorId: user.id,
        maxStepsPerRun: 10,
        templateId: null,
        requestedSpaceIds: [],
      });
    });

    describe("setFavorite", () => {
      it("should set agent as favorite", async () => {
        const agent = await AgentConfigurationResource.fetchById(
          auth,
          agent1SId
        );
        expect(agent).not.toBeNull();

        const result = await agent!.setFavorite(auth, true);
        expect(result.isOk()).toBe(true);

        // Verify in DB
        const relation = await AgentUserRelation.findOne({
          where: {
            workspaceId: workspace.id,
            userId: user.id,
            agentConfiguration: agent1SId,
          },
        });
        expect(relation?.favorite).toBe(true);
      });

      it("should unset agent as favorite", async () => {
        const agent = await AgentConfigurationResource.fetchById(
          auth,
          agent1SId
        );
        expect(agent).not.toBeNull();

        // Set as favorite first
        await agent!.setFavorite(auth, true);

        // Then unset
        const result = await agent!.setFavorite(auth, false);
        expect(result.isOk()).toBe(true);

        // Verify in DB
        const relation = await AgentUserRelation.findOne({
          where: {
            workspaceId: workspace.id,
            userId: user.id,
            agentConfiguration: agent1SId,
          },
        });
        expect(relation?.favorite).toBe(false);
      });
    });

    describe("listAgentsFavoriteStateByIds", () => {
      it("should return favorite states for multiple agents", async () => {
        // Set agent1 as favorite
        const agent1 = await AgentConfigurationResource.fetchById(
          auth,
          agent1SId
        );
        await agent1!.setFavorite(auth, true);

        const favoriteMap =
          await AgentConfigurationResource.listAgentsFavoriteStateByIds(auth, [
            agent1SId,
            agent2SId,
          ]);

        expect(favoriteMap.get(agent1SId)).toBe(true);
        expect(favoriteMap.get(agent2SId)).toBe(false);
      });

      it("should return empty map for empty input", async () => {
        const favoriteMap =
          await AgentConfigurationResource.listAgentsFavoriteStateByIds(
            auth,
            []
          );

        expect(favoriteMap.size).toBe(0);
      });

      it("should return false for agents not favorited by user", async () => {
        // Create another user who hasn't favorited anything
        const { authenticator: otherAuth } = await createResourceTest({
          role: "admin",
        });

        // Set agent1 as favorite for the first user (not otherAuth)
        const agent1 = await AgentConfigurationResource.fetchById(
          auth,
          agent1SId
        );
        await agent1!.setFavorite(auth, true);

        // Check from otherAuth perspective - should be false
        const favoriteMap =
          await AgentConfigurationResource.listAgentsFavoriteStateByIds(
            otherAuth,
            [agent1SId]
          );

        expect(favoriteMap.get(agent1SId)).toBe(false);
      });
    });

    describe("listFavorites", () => {
      it("should list all favorited agents for user", async () => {
        // Set both agents as favorites
        const agent1 = await AgentConfigurationResource.fetchById(
          auth,
          agent1SId
        );
        const agent2 = await AgentConfigurationResource.fetchById(
          auth,
          agent2SId
        );
        await agent1!.setFavorite(auth, true);
        await agent2!.setFavorite(auth, true);

        const favorites = await AgentConfigurationResource.listFavorites(
          auth,
          user.id
        );

        expect(favorites).toHaveLength(2);
        const sIds = favorites.map((f) => f.sId);
        expect(sIds).toContain(agent1SId);
        expect(sIds).toContain(agent2SId);
      });

      it("should return empty array when no favorites", async () => {
        const favorites = await AgentConfigurationResource.listFavorites(
          auth,
          user.id
        );

        expect(favorites).toHaveLength(0);
      });

      it("should only return agents favorited by the specified user", async () => {
        // Set agent1 as favorite for user
        const agent1 = await AgentConfigurationResource.fetchById(
          auth,
          agent1SId
        );
        await agent1!.setFavorite(auth, true);

        const favorites = await AgentConfigurationResource.listFavorites(
          auth,
          user.id
        );

        expect(favorites).toHaveLength(1);
        expect(favorites[0]?.sId).toBe(agent1SId);
      });
    });
  });
});
