import { DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_NAME } from "@app/lib/actions/constants";
import {
  CONVERSATION_FILES_SERVER_NAME,
  CONVERSATION_LIST_FILES_ACTION_NAME,
} from "@app/lib/api/actions/servers/conversation_files/metadata";
import { makeFileAttachment } from "@app/lib/api/assistant/conversation/attachments";
import { getJITServers } from "@app/lib/api/assistant/jit_actions";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { getTestStreamEndpoint } from "@app/tests/utils/models";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { ConversationAttachmentType } from "@app/types/api/assistant/conversation/attachments";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

function expectSkillBuckets(
  buckets: {
    enabledSkills: SkillResource[];
    systemSkills: SkillResource[];
    equippedSkills: SkillResource[];
  },
  skillId: string,
  expected: {
    enabled: boolean;
    system: boolean;
    equipped: boolean;
  }
) {
  expect(buckets.enabledSkills.some((s) => s.sId === skillId)).toBe(
    expected.enabled
  );
  expect(buckets.systemSkills.some((s) => s.sId === skillId)).toBe(
    expected.system
  );
  expect(buckets.equippedSkills.some((s) => s.sId === skillId)).toBe(
    expected.equipped
  );
}

describe("getJITServers", () => {
  let auth: Authenticator;
  let workspace: WorkspaceType;
  let conversationsSpace: SpaceResource;
  let conversation: ConversationType;
  let agentConfig: AgentConfigurationType;

  beforeEach(async () => {
    const setup = await createResourceTest({ role: "admin" });
    auth = setup.authenticator;
    workspace = setup.workspace;
    conversationsSpace = setup.conversationsSpace;

    // Ensure all auto MCP server views are created (requires admin auth).
    await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);

    agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent Description",
    });

    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });
  });

  describe("basic MCP servers", () => {
    it("should return common_utilities MCP server when no attachments", async () => {
      const jitServers = await getJITServers(auth, {
        agentConfiguration: agentConfig,
        conversation,
        attachments: [],
      });

      const commonUtilitiesServer = jitServers.find(
        (server) => server.name === "common_utilities"
      );

      expect(commonUtilitiesServer).toBeDefined();
      expect(commonUtilitiesServer?.type).toBe("mcp_server_configuration");
      expect(commonUtilitiesServer?.mcpServerViewId).toBeDefined();
    });

    it("should always return the ask_user_question MCP server", async () => {
      const jitServers = await getJITServers(auth, {
        agentConfiguration: agentConfig,
        conversation,
        attachments: [],
      });

      const askUserQuestionServer = jitServers.find(
        (server) => server.name === "ask_user_question"
      );

      expect(askUserQuestionServer).toBeDefined();
      expect(askUserQuestionServer?.type).toBe("mcp_server_configuration");
      expect(askUserQuestionServer?.mcpServerViewId).toBeDefined();
    });

    it("should include conversation_files server when attachments exist", async () => {
      const user = auth.getNonNullableUser();
      const file = await FileFactory.csv(auth, user, {
        useCase: "conversation",
        useCaseMetadata: {
          conversationId: conversation.sId,
        },
        status: "ready",
      });

      const attachments: ConversationAttachmentType[] = [
        {
          fileId: file.sId,
          path: null,
          source: "user",
          title: "test.csv",
          contentType: "text/csv",
          contentFragmentVersion: "latest",
          snippet: "test snippet",
          generatedTables: [],
          isIncludable: true,
          isSearchable: true,
          isQueryable: true,
          isInProjectContext: false,
          hidden: false,
          creator: null,
        },
      ];

      const jitServers = await getJITServers(auth, {
        agentConfiguration: agentConfig,
        conversation,
        attachments,
      });

      const conversationFilesServer = jitServers.find(
        (server) => server.name === "conversation_files"
      );

      expect(conversationFilesServer).toBeDefined();
      expect(conversationFilesServer?.name).toBe("conversation_files");
      expect(conversationFilesServer?.description).toBe(
        "Access and include files from the conversation"
      );
    });
  });

  describe("skills feature", () => {
    it("should include skill_management server when agent has skills", async () => {
      await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);

      // Create a skill and link it to the agent.
      const skill = await SkillFactory.create(auth, {
        name: "Test Skill",
      });
      await SkillFactory.linkToAgent(auth, {
        skillId: skill.id,
        agentConfigurationId: agentConfig.id,
      });

      const jitServers = await getJITServers(auth, {
        agentConfiguration: agentConfig,
        conversation,
        attachments: [],
      });

      const skillManagementServer = jitServers.find(
        (server) => server.name === "skill_management"
      );

      expect(skillManagementServer).toBeDefined();
      expect(skillManagementServer?.name).toBe("skill_management");
      expect(skillManagementServer?.description).toBe(
        "Enable skills for the conversation."
      );
    });

    describe("when no auto-equipped skills", () => {
      beforeEach(async () => {
        await FeatureFlagFactory.basic(auth, "disable_computer_feature");
      });

      it("should include skill_management server when agent has no skills", async () => {
        await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);

        const jitServers = await getJITServers(auth, {
          agentConfiguration: agentConfig,
          conversation: { ...conversation, spaceId: conversationsSpace.sId },
          attachments: [],
        });

        const skillManagementServer = jitServers.find(
          (server) => server.name === "skill_management"
        );

        expect(skillManagementServer).toBeDefined();
      });

      it("does not equip favorite skills without discover_skills", async () => {
        const skill = await SkillFactory.create(auth, {
          name: "Favorite Skill Without Discovery",
        });
        const favoriteResult = await skill.setFavorite(auth, true);
        expect(favoriteResult.isOk()).toBe(true);

        const { equippedSkills, favoriteSkills } =
          await SkillResource.listForAgentLoop(auth, {
            agentConfiguration: agentConfig,
            conversation: {
              ...conversation,
              spaceId: conversationsSpace.sId,
            },
          });
        expect(equippedSkills.map((s) => s.sId)).not.toContain(skill.sId);
        expect(favoriteSkills.map((s) => s.sId)).not.toContain(skill.sId);
      });

      it("equips favorite skills when discovery is enabled", async () => {
        await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);
        await SkillFactory.linkGlobalSkillToAgent(auth, {
          globalSkillId: "discover_skills",
          agentConfigurationId: agentConfig.id,
        });

        const skill = await SkillFactory.create(auth, {
          name: "Favorite Skill",
        });
        const favoriteResult = await skill.setFavorite(auth, true);
        expect(favoriteResult.isOk()).toBe(true);

        const { equippedSkills, favoriteSkills } =
          await SkillResource.listForAgentLoop(auth, {
            agentConfiguration: agentConfig,
            conversation: {
              ...conversation,
              spaceId: conversationsSpace.sId,
            },
          });
        expect(equippedSkills.map((s) => s.sId)).not.toContain(skill.sId);
        expect(favoriteSkills.map((s) => s.sId)).toContain(skill.sId);

        const jitServers = await getJITServers(auth, {
          agentConfiguration: agentConfig,
          conversation: { ...conversation, spaceId: conversationsSpace.sId },
          attachments: [],
        });

        expect(
          jitServers.some((server) => server.name === "skill_management")
        ).toBe(true);
      });

      it("keeps discoverable favorites in the shared equipped skills", async () => {
        await SkillFactory.linkGlobalSkillToAgent(auth, {
          globalSkillId: "discover_skills",
          agentConfigurationId: agentConfig.id,
        });

        const [skill] = await SkillResource.fetchByIds(auth, ["mention_users"]);
        if (!skill) {
          throw new Error("Expected Mention Users skill to be available");
        }
        const favoriteResult = await skill.setFavorite(auth, true);
        expect(favoriteResult.isOk()).toBe(true);

        const { userMessage } = await ConversationFactory.createUserMessage({
          auth,
          workspace,
          conversation,
          content: "Mention someone.",
          rank: -1,
        });
        const { agentMessage } = await ConversationFactory.createAgentMessage(
          auth,
          {
            workspace,
            conversation,
            agentConfig,
          }
        );
        const { model: agentModel, ...agentConfiguration } = agentConfig;

        const { equippedSkills, favoriteSkills } =
          await SkillResource.listForAgentLoop(auth, {
            agentConfiguration,
            modelInfo: {
              endpoint: getTestStreamEndpoint(agentModel.modelId),
              ...agentModel,
            },
            agentMessage,
            conversation: {
              ...conversation,
              spaceId: conversationsSpace.sId,
            },
            userMessage,
          });

        expect(equippedSkills.map((s) => s.sId)).toContain(skill.sId);
        expect(favoriteSkills.map((s) => s.sId)).not.toContain(skill.sId);
      });
    });

    it("keeps configured custom skills equipped after enabling them, but not system skills", async () => {
      await SkillFactory.linkGlobalSkillToAgent(auth, {
        globalSkillId: "discover_tools",
        agentConfigurationId: agentConfig.id,
      });

      const customSkill = await SkillFactory.create(auth, {
        name: "Test Skill",
      });
      await SkillFactory.linkToAgent(auth, {
        skillId: customSkill.id,
        agentConfigurationId: agentConfig.id,
      });
      await customSkill.enableForAgent(auth, {
        agentConfiguration: agentConfig,
        conversation,
      });

      const buckets = await SkillResource.listForAgentLoop(auth, {
        agentConfiguration: agentConfig,
        conversation,
      });

      expectSkillBuckets(buckets, "discover_tools", {
        enabled: false,
        system: true,
        equipped: false,
      });
      expectSkillBuckets(buckets, customSkill.sId, {
        enabled: true,
        system: false,
        equipped: true,
      });
    });

    it("keeps agent-enabled system skills only in system skills", async () => {
      await SkillFactory.linkGlobalSkillToAgent(auth, {
        globalSkillId: "discover_tools",
        agentConfigurationId: agentConfig.id,
      });
      const [discoverToolsSkill] = await SkillResource.fetchByIds(
        auth,
        ["discover_tools"],
        { onlyActive: true }
      );
      if (!discoverToolsSkill) {
        throw new Error("Expected discover_tools skill to be available");
      }
      await discoverToolsSkill.enableForAgent(auth, {
        agentConfiguration: agentConfig,
        conversation,
      });

      const buckets = await SkillResource.listForAgentLoop(auth, {
        agentConfiguration: agentConfig,
        conversation,
      });

      expectSkillBuckets(buckets, "discover_tools", {
        enabled: false,
        system: true,
        equipped: false,
      });
      expect(
        buckets.systemSkills.filter((s) => s.sId === "discover_tools")
      ).toHaveLength(1);
    });

    it("keeps conversation-enabled custom skills enabled only", async () => {
      const skill = await SkillFactory.create(auth, {
        name: "Conversation Enabled Skill",
      });
      const res = await skill.upsertToConversation(auth, {
        conversationId: conversation.id,
        enabled: true,
      });
      expect(res.isOk()).toBe(true);

      const buckets = await SkillResource.listForAgentLoop(auth, {
        agentConfiguration: agentConfig,
        conversation,
      });

      expectSkillBuckets(buckets, skill.sId, {
        enabled: true,
        system: false,
        equipped: false,
      });
    });

    it("keeps conversation-enabled agent skills enabled and equipped", async () => {
      const skill = await SkillFactory.create(auth, {
        name: "Conversation Enabled Agent Skill",
      });
      await skill.addToAgent(auth, agentConfig);
      const res = await skill.upsertToConversation(auth, {
        conversationId: conversation.id,
        enabled: true,
      });
      expect(res.isOk()).toBe(true);

      const buckets = await SkillResource.listForAgentLoop(auth, {
        agentConfiguration: agentConfig,
        conversation,
      });

      expectSkillBuckets(buckets, skill.sId, {
        enabled: true,
        system: false,
        equipped: true,
      });
    });

    it("keeps conversation-enabled system skills system only", async () => {
      await SkillFactory.linkGlobalSkillToAgent(auth, {
        globalSkillId: "discover_tools",
        agentConfigurationId: agentConfig.id,
      });
      const [discoverToolsSkill] = await SkillResource.fetchByIds(
        auth,
        ["discover_tools"],
        { onlyActive: true }
      );
      if (!discoverToolsSkill) {
        throw new Error("Expected discover_tools skill to be available");
      }
      const res = await discoverToolsSkill.upsertToConversation(auth, {
        conversationId: conversation.id,
        enabled: true,
      });
      expect(res.isOk()).toBe(true);

      const buckets = await SkillResource.listForAgentLoop(auth, {
        agentConfiguration: agentConfig,
        conversation,
      });

      expectSkillBuckets(buckets, "discover_tools", {
        enabled: false,
        system: true,
        equipped: false,
      });
    });

    it("filters discoverable skills disabled for the current agent loop", async () => {
      await SkillFactory.linkGlobalSkillToAgent(auth, {
        globalSkillId: "discover_skills",
        agentConfigurationId: agentConfig.id,
      });

      const { userMessage } = await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: "Tell someone about this.",
        origin: "slack",
        rank: -1,
      });
      const { agentMessage } = await ConversationFactory.createAgentMessage(
        auth,
        {
          workspace,
          conversation,
          agentConfig,
        }
      );

      const { model: agentModel, ...agentConfiguration } = agentConfig;
      const endpoint = getTestStreamEndpoint(agentModel.modelId);

      const { equippedSkills } = await SkillResource.listForAgentLoop(auth, {
        agentConfiguration,
        modelInfo: {
          endpoint,
          ...agentModel,
        },
        agentMessage,
        conversation,
        userMessage,
      });

      expect(equippedSkills.some((s) => s.sId === "mention_users")).toBe(false);
    });
  });

  describe("projects feature", () => {
    it("should not include legacy project_context_and_conversations JIT server (search is on pod_manager)", async () => {
      await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);

      await DataSourceViewFactory.fromConnector(
        workspace,
        conversationsSpace,
        "dust_project",
        auth.user()
      );

      const conversationWithSpace = {
        ...conversation,
        spaceId: conversationsSpace.sId,
      };

      const jitServers = await getJITServers(auth, {
        agentConfiguration: agentConfig,
        conversation: conversationWithSpace,
        attachments: [],
      });

      expect(
        jitServers.find((s) => s.name === "project_context_and_conversations")
      ).toBeUndefined();
    });

    it("auto-enables projects as a system skill when conversation is in a project", async () => {
      await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);

      const conversationInProject = {
        ...conversation,
        spaceId: conversationsSpace.sId,
      };

      const buckets = await SkillResource.listForAgentLoop(auth, {
        agentConfiguration: agentConfig,
        conversation: conversationInProject,
      });

      expectSkillBuckets(buckets, "projects", {
        enabled: false,
        system: true,
        equipped: false,
      });

      const projectsSkill = buckets.systemSkills.find(
        (s) => s.sId === "projects"
      );
      expect(projectsSkill).toBeDefined();
      const viewNames = projectsSkill?.mcpServerConfigurations.map((c) => {
        const json = c.view.toJSON();
        return json.name ?? json.server.name;
      });
      expect(viewNames).toContain("pod_manager");
    });

    it("auto-equips but does not auto-enable projects outside a project", async () => {
      const buckets = await SkillResource.listForAgentLoop(auth, {
        agentConfiguration: agentConfig,
        conversation,
      });

      expectSkillBuckets(buckets, "projects", {
        enabled: false,
        system: false,
        equipped: true,
      });
    });

    it("does not duplicate auto-equipped projects already configured on the agent", async () => {
      await SkillFactory.linkGlobalSkillToAgent(auth, {
        globalSkillId: "projects",
        agentConfigurationId: agentConfig.id,
      });

      const buckets = await SkillResource.listForAgentLoop(auth, {
        agentConfiguration: agentConfig,
        conversation,
      });

      expectSkillBuckets(buckets, "projects", {
        enabled: false,
        system: false,
        equipped: true,
      });
      expect(
        buckets.equippedSkills.filter((s) => s.sId === "projects")
      ).toHaveLength(1);
    });

    it("keeps auto-equipped projects available after it is enabled", async () => {
      const [projectSkill] = await SkillResource.fetchByIds(
        auth,
        ["projects"],
        { onlyActive: true }
      );
      expect(projectSkill).toBeDefined();
      await projectSkill?.enableForAgent(auth, {
        agentConfiguration: agentConfig,
        conversation,
      });

      const buckets = await SkillResource.listForAgentLoop(auth, {
        agentConfiguration: agentConfig,
        conversation,
      });

      expectSkillBuckets(buckets, "projects", {
        enabled: true,
        system: false,
        equipped: true,
      });
    });

    it("keeps auto-enabled projects out of enabled and equipped after it is enabled", async () => {
      const conversationInProject = {
        ...conversation,
        spaceId: conversationsSpace.sId,
      };
      const [projectSkill] = await SkillResource.fetchByIds(
        auth,
        ["projects"],
        { onlyActive: true }
      );
      expect(projectSkill).toBeDefined();
      await projectSkill?.enableForAgent(auth, {
        agentConfiguration: agentConfig,
        conversation: conversationInProject,
      });

      const buckets = await SkillResource.listForAgentLoop(auth, {
        agentConfiguration: agentConfig,
        conversation: conversationInProject,
      });

      expectSkillBuckets(buckets, "projects", {
        enabled: false,
        system: true,
        equipped: false,
      });
    });

    it("keeps auto-enabled projects out of discoverable equipped skills in a project", async () => {
      await SkillFactory.linkGlobalSkillToAgent(auth, {
        globalSkillId: "discover_skills",
        agentConfigurationId: agentConfig.id,
      });

      const buckets = await SkillResource.listForAgentLoop(auth, {
        agentConfiguration: agentConfig,
        conversation: {
          ...conversation,
          spaceId: conversationsSpace.sId,
        },
      });

      expectSkillBuckets(buckets, "projects", {
        enabled: false,
        system: true,
        equipped: false,
      });
      expect(
        buckets.equippedSkills.filter((s) => s.sId === "projects")
      ).toHaveLength(0);
    });

    it("keeps mixed system, enabled, and equipped sources in the right buckets", async () => {
      const projectSpace = await SpaceFactory.project(
        workspace,
        auth.getNonNullableUser().id
      );
      await auth.refresh();
      const projectConversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [],
        spaceId: projectSpace.id,
      });

      const podDefaultSkill = await SkillFactory.create(auth, {
        name: "A Pod Default Skill",
      });
      const enabledPodDefaultSkill = await SkillFactory.create(auth, {
        name: "B Enabled Pod Default Skill",
      });
      const enabledOnlySkill = await SkillFactory.create(auth, {
        name: "C Enabled Only Skill",
      });
      const agentSkill = await SkillFactory.create(auth, {
        name: "D Agent Skill",
      });

      const metadata = await ProjectMetadataResource.makeNew(
        auth,
        projectSpace,
        { description: "d" }
      );
      await metadata.setDefaultSkills([
        podDefaultSkill,
        enabledPodDefaultSkill,
      ]);
      await SkillFactory.linkGlobalSkillToAgent(auth, {
        globalSkillId: "discover_tools",
        agentConfigurationId: agentConfig.id,
      });
      await agentSkill.addToAgent(auth, agentConfig);
      await enabledOnlySkill.enableForAgent(auth, {
        agentConfiguration: agentConfig,
        conversation: projectConversation,
      });
      await enabledPodDefaultSkill.enableForAgent(auth, {
        agentConfiguration: agentConfig,
        conversation: projectConversation,
      });

      const buckets = await SkillResource.listForAgentLoop(auth, {
        agentConfiguration: agentConfig,
        conversation: projectConversation,
      });

      expectSkillBuckets(buckets, "projects", {
        enabled: false,
        system: true,
        equipped: false,
      });
      expectSkillBuckets(buckets, "discover_tools", {
        enabled: false,
        system: true,
        equipped: false,
      });
      expectSkillBuckets(buckets, "sandbox", {
        enabled: false,
        system: false,
        equipped: true,
      });
      expectSkillBuckets(buckets, enabledOnlySkill.sId, {
        enabled: true,
        system: false,
        equipped: false,
      });
      expectSkillBuckets(buckets, enabledPodDefaultSkill.sId, {
        enabled: true,
        system: false,
        equipped: true,
      });
      expectSkillBuckets(buckets, podDefaultSkill.sId, {
        enabled: false,
        system: false,
        equipped: true,
      });
      expectSkillBuckets(buckets, agentSkill.sId, {
        enabled: false,
        system: false,
        equipped: true,
      });

      expect(
        buckets.enabledSkills
          .map((s) => s.name)
          .filter((name) =>
            ["B Enabled Pod Default Skill", "C Enabled Only Skill"].includes(
              name
            )
          )
      ).toEqual(["B Enabled Pod Default Skill", "C Enabled Only Skill"]);
      expect(
        buckets.equippedSkills
          .map((s) => s.name)
          .filter((name) =>
            [
              "A Pod Default Skill",
              "B Enabled Pod Default Skill",
              "D Agent Skill",
            ].includes(name)
          )
      ).toEqual([
        "A Pod Default Skill",
        "B Enabled Pod Default Skill",
        "D Agent Skill",
      ]);
    });

    it("includes skill_management so agents can enable the projects skill", async () => {
      await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);

      const jitServers = await getJITServers(auth, {
        agentConfiguration: agentConfig,
        conversation,
        attachments: [],
      });

      expect(
        jitServers.some((server) => server.name === "skill_management")
      ).toBe(true);
    });
  });

  describe("sandbox (Computer) availability", () => {
    it("auto-equips the sandbox skill for any agent when Computer is enabled", async () => {
      await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);

      // The test agent does not list the sandbox skill in its configuration.
      const { enabledSkills, systemSkills, equippedSkills } =
        await SkillResource.listForAgentLoop(auth, {
          agentConfiguration: agentConfig,
          conversation,
        });

      expect(systemSkills.some((s) => s.sId === "sandbox")).toBe(false);
      expect(enabledSkills.some((s) => s.sId === "sandbox")).toBe(false);
      const computerSkill = equippedSkills.find((s) => s.sId === "sandbox");
      expect(computerSkill).toBeDefined();
      expect(computerSkill?.instructions).toBe("");
    });

    it("does not equip or enable the sandbox skill when Computer is disabled", async () => {
      await FeatureFlagFactory.basic(auth, "disable_computer_feature");

      const { enabledSkills, systemSkills, equippedSkills } =
        await SkillResource.listForAgentLoop(auth, {
          agentConfiguration: agentConfig,
          conversation,
        });

      expect(systemSkills.some((s) => s.sId === "sandbox")).toBe(false);
      expect(enabledSkills.some((s) => s.sId === "sandbox")).toBe(false);
      expect(equippedSkills.some((s) => s.sId === "sandbox")).toBe(false);
    });

    it("keeps the sandbox skill available for nested sub-agent conversations", async () => {
      await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);

      // run_agent sub-agents run in a child conversation (depth > 0); they get
      // their own Computer too.
      const { systemSkills, equippedSkills } =
        await SkillResource.listForAgentLoop(auth, {
          agentConfiguration: agentConfig,
          conversation: { ...conversation, depth: 1 },
        });

      expect(systemSkills.some((s) => s.sId === "sandbox")).toBe(false);
      expect(equippedSkills.some((s) => s.sId === "sandbox")).toBe(true);
    });

    it("includes skill_management so agents can enable the sandbox skill", async () => {
      await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);

      const jitServers = await getJITServers(auth, {
        agentConfiguration: agentConfig,
        conversation,
        attachments: [],
      });

      expect(
        jitServers.some((server) => server.name === "skill_management")
      ).toBe(true);
    });
  });

  describe("triggers_management feature", () => {
    it("should include triggers_management server for onboarding conversations", async () => {
      const user = auth.getNonNullableUser();

      // Mark this conversation as the onboarding conversation.
      await user.setMetadata(
        "onboarding:conversation",
        conversation.sId,
        workspace.id
      );

      const jitServers = await getJITServers(auth, {
        agentConfiguration: agentConfig,
        conversation,
        attachments: [],
      });

      const triggersManagementServer = jitServers.find(
        (server) => server.name === "triggers_management"
      );

      expect(triggersManagementServer).toBeDefined();
      expect(triggersManagementServer?.name).toContain("triggers_management");
      expect(triggersManagementServer?.description).toContain("recurring");
    });

    it("should not include triggers_management server for non-onboarding conversations", async () => {
      const jitServers = await getJITServers(auth, {
        agentConfiguration: agentConfig,
        conversation,
        attachments: [],
      });

      const triggersManagementServer = jitServers.find(
        (server) => server.name === "triggers_management"
      );

      expect(triggersManagementServer).toBeUndefined();
    });
  });

  describe("attachment-based servers", () => {
    it("should include query_tables server when queryable file attachments exist and Computer is disabled", async () => {
      await FeatureFlagFactory.basic(auth, "disable_computer_feature");

      const user = auth.getNonNullableUser();
      const file = await FileFactory.csv(auth, user, {
        useCase: "conversation",
        useCaseMetadata: {
          conversationId: conversation.sId,
        },
        status: "ready",
      });

      // Built through the constructor so the flags cannot describe a state the product can't reach.
      const attachments: ConversationAttachmentType[] = [
        makeFileAttachment({
          fileId: file.sId,
          source: "user",
          title: "test.csv",
          contentType: "text/csv",
          snippet: "test snippet",
          isInProjectContext: false,
          hideFromUser: false,
          capabilities: { isNewFileExplorer: false, hasSandboxTools: false },
        }),
      ];
      expect(attachments[0].isQueryable).toBe(true);

      const jitServers = await getJITServers(auth, {
        agentConfiguration: agentConfig,
        conversation,
        attachments,
      });

      const queryTablesServer = jitServers.find(
        (server) =>
          server.name === DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_NAME
      );

      expect(queryTablesServer).toBeDefined();
      expect(queryTablesServer?.description).toContain(
        `'queryable' conversation files`
      );
      expect(queryTablesServer?.description).toContain(
        CONVERSATION_LIST_FILES_ACTION_NAME
      );
      expect(queryTablesServer?.tables).toBeDefined();
      // Note: tables array may be empty if conversation datasource view is not set up,
      // but the server should still be created with the correct structure.
    });

    it("should not include query_tables server for tabular file attachments when Computer is available", async () => {
      const user = auth.getNonNullableUser();
      const file = await FileFactory.csv(auth, user, {
        useCase: "conversation",
        useCaseMetadata: {
          conversationId: conversation.sId,
        },
        status: "ready",
      });

      // With Computer available the sandbox analyzes tabular files, so the attachment comes out
      // non-queryable and query_tables has nothing to register for.
      const attachments: ConversationAttachmentType[] = [
        makeFileAttachment({
          fileId: file.sId,
          source: "user",
          title: "test.csv",
          contentType: "text/csv",
          snippet: "test snippet",
          isInProjectContext: false,
          hideFromUser: false,
          capabilities: { isNewFileExplorer: false, hasSandboxTools: true },
        }),
      ];
      expect(attachments[0].isQueryable).toBe(false);

      const jitServers = await getJITServers(auth, {
        agentConfiguration: agentConfig,
        conversation,
        attachments,
      });

      const queryTablesServer = jitServers.find(
        (server) =>
          server.name === DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_NAME
      );

      expect(queryTablesServer).toBeUndefined();
      expect(
        jitServers.some(
          (server) => server.name === CONVERSATION_FILES_SERVER_NAME
        )
      ).toBe(true);
    });

    it("should include query_tables server for queryable content nodes even when Computer is available", async () => {
      const attachments: ConversationAttachmentType[] = [
        {
          contentFragmentId: "cf_queryable_node",
          nodeId: "table_node_1",
          nodeDataSourceViewId: "dsv_test",
          nodeType: "table",
          sourceUrl: null,
          title: "Sales sheet",
          contentType: "text/csv",
          contentFragmentVersion: "latest",
          snippet: null,
          generatedTables: ["table_node_1"],
          isIncludable: true,
          isSearchable: false,
          isQueryable: true,
          isInProjectContext: false,
          hidden: false,
          creator: null,
        },
      ];

      const jitServers = await getJITServers(auth, {
        agentConfiguration: agentConfig,
        conversation,
        attachments,
      });

      const queryTablesServer = jitServers.find(
        (server) =>
          server.name === DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_NAME
      );

      expect(queryTablesServer).toBeDefined();
      expect(queryTablesServer?.tables).toEqual([
        {
          workspaceId: workspace.sId,
          dataSourceViewId: "dsv_test",
          tableId: "table_node_1",
        },
      ]);
    });

    it("should include search server when searchable attachments exist", async () => {
      const user = auth.getNonNullableUser();
      const file = await FileFactory.create(auth, user, {
        contentType: "text/plain",
        fileName: "test.txt",
        fileSize: 100,
        status: "ready",
        useCase: "conversation",
        useCaseMetadata: {
          conversationId: conversation.sId,
        },
        snippet: "test snippet",
      });

      const attachments: ConversationAttachmentType[] = [
        {
          fileId: file.sId,
          path: null,
          source: "user",
          title: "test.txt",
          contentType: "text/plain",
          contentFragmentVersion: "latest",
          snippet: "test snippet",
          generatedTables: [],
          isIncludable: true,
          isSearchable: true,
          isQueryable: false,
          isInProjectContext: false,
          hidden: false,
          creator: null,
        },
      ];

      const jitServers = await getJITServers(auth, {
        agentConfiguration: agentConfig,
        conversation,
        attachments,
      });

      const searchServer = jitServers.find(
        (server) => server.name === CONVERSATION_FILES_SERVER_NAME
      );

      expect(searchServer).toBeDefined();
      expect(searchServer?.description).toBe(
        "Access and include files from the conversation"
      );
      expect(searchServer?.dataSources).toBeDefined();
      // Note: datasources array may be empty if conversation datasource view is not set up,
      // but the server should still be created with the correct structure.
    });

    it("should not include query_tables server when no queryable attachments", async () => {
      const user = auth.getNonNullableUser();
      const file = await FileFactory.create(auth, user, {
        contentType: "text/plain",
        fileName: "test.txt",
        fileSize: 100,
        status: "ready",
        useCase: "conversation",
        useCaseMetadata: {
          conversationId: conversation.sId,
        },
        snippet: "test snippet",
      });

      const attachments: ConversationAttachmentType[] = [
        {
          fileId: file.sId,
          path: null,
          source: "user",
          title: "test.txt",
          contentType: "text/plain",
          contentFragmentVersion: "latest",
          snippet: "test snippet",
          generatedTables: [],
          isIncludable: true,
          isSearchable: true,
          isQueryable: false,
          isInProjectContext: false,
          hidden: false,
          creator: null,
        },
      ];

      const jitServers = await getJITServers(auth, {
        agentConfiguration: agentConfig,
        conversation,
        attachments,
      });

      const queryTablesServer = jitServers.find(
        (server) =>
          server.name === DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_NAME
      );

      expect(queryTablesServer).toBeUndefined();
    });

    it("should include conversation_files server when attachments exist but are not searchable", async () => {
      const user = auth.getNonNullableUser();
      const file = await FileFactory.csv(auth, user, {
        useCase: "conversation",
        useCaseMetadata: {
          conversationId: conversation.sId,
        },
        status: "ready",
      });

      const attachments: ConversationAttachmentType[] = [
        {
          fileId: file.sId,
          path: null,
          source: "user",
          title: "test.csv",
          contentType: "text/csv",
          contentFragmentVersion: "latest",
          snippet: "test snippet",
          generatedTables: [file.sId],
          isIncludable: true,
          isSearchable: false,
          isQueryable: true,
          isInProjectContext: false,
          hidden: false,
          creator: null,
        },
      ];

      const jitServers = await getJITServers(auth, {
        agentConfiguration: agentConfig,
        conversation,
        attachments,
      });

      const conversationFilesServer = jitServers.find(
        (server) => server.name === CONVERSATION_FILES_SERVER_NAME
      );

      // conversation_files server is included whenever there are attachments.
      expect(conversationFilesServer).toBeDefined();
      expect(conversationFilesServer?.description).toBe(
        "Access and include files from the conversation"
      );
    });

    it("should not include search server when attachments are not searchable (search server is distinct from conversation_files)", async () => {
      const user = auth.getNonNullableUser();
      const file = await FileFactory.csv(auth, user, {
        useCase: "conversation",
        useCaseMetadata: {
          conversationId: conversation.sId,
        },
        status: "ready",
      });

      const attachments: ConversationAttachmentType[] = [
        {
          fileId: file.sId,
          path: null,
          source: "user",
          title: "test.csv",
          contentType: "text/csv",
          contentFragmentVersion: "latest",
          snippet: "test snippet",
          generatedTables: [file.sId],
          isIncludable: true,
          isSearchable: false,
          isQueryable: true,
          isInProjectContext: false,
          hidden: false,
          creator: null,
        },
      ];

      const jitServers = await getJITServers(auth, {
        agentConfiguration: agentConfig,
        conversation,
        attachments,
      });

      // Files server (list/include): present whenever there are attachments.
      const filesServer = jitServers.find(
        (server) =>
          server.name === CONVERSATION_FILES_SERVER_NAME &&
          server.description ===
            "Access and include files from the conversation"
      );
      expect(filesServer).toBeDefined();

      // Search server (semantic search over conversation files): only when searchable attachments exist.
      const searchServer = jitServers.find((server) =>
        server.description?.startsWith("Semantic search over all files")
      );
      expect(searchServer).toBeUndefined();
    });
  });

  describe("multiple servers", () => {
    it("should return multiple servers when conditions are met", async () => {
      await FeatureFlagFactory.basic(auth, "disable_computer_feature");

      // Create attachments.
      const user = auth.getNonNullableUser();
      const file = await FileFactory.csv(auth, user, {
        useCase: "conversation",
        useCaseMetadata: {
          conversationId: conversation.sId,
        },
        status: "ready",
      });

      const attachments: ConversationAttachmentType[] = [
        {
          fileId: file.sId,
          path: null,
          source: "user",
          title: "test.csv",
          contentType: "text/csv",
          contentFragmentVersion: "latest",
          snippet: "test snippet",
          generatedTables: [file.sId],
          isIncludable: true,
          isSearchable: true,
          isQueryable: true,
          isInProjectContext: false,
          hidden: false,
          creator: null,
        },
      ];

      const jitServers = await getJITServers(auth, {
        agentConfiguration: agentConfig,
        conversation,
        attachments,
      });

      // Check that multiple servers are present.
      expect(jitServers.length).toBeGreaterThan(1);

      const serverNames = jitServers.map((s) => s.name);
      expect(serverNames).toContain("common_utilities");
      expect(serverNames).toContain("conversation_files");
      expect(serverNames).toContain(
        DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_NAME
      );
      expect(serverNames).toContain(CONVERSATION_FILES_SERVER_NAME);
    });
  });

  describe("server structure", () => {
    it("should return servers with correct structure", async () => {
      const jitServers = await getJITServers(auth, {
        agentConfiguration: agentConfig,
        conversation,
        attachments: [],
      });

      expect(jitServers.length).toBeGreaterThan(0);

      for (const server of jitServers) {
        // All servers should have these properties.
        expect(server.type).toBe("mcp_server_configuration");
        expect(server.sId).toBeDefined();
        expect(server.name).toBeDefined();
        expect(server.description).toBeDefined();
        expect(server.mcpServerViewId).toBeDefined();

        // Check that sId is a string.
        expect(typeof server.sId).toBe("string");
        expect(server.sId.length).toBeGreaterThan(0);

        // Check that id is -1 (as per the implementation).
        expect(server.id).toBe(-1);

        // Check that null fields are properly set.
        expect(server.childAgentId).toBeNull();
        expect(server.timeFrame).toBeNull();
        expect(server.jsonSchema).toBeNull();
        expect(server.secretName).toBeNull();
        expect(server.dustAppConfiguration).toBeNull();
      }
    });

    it("should generate unique sIds for each server", async () => {
      const user = auth.getNonNullableUser();
      const file = await FileFactory.csv(auth, user, {
        useCase: "conversation",
        useCaseMetadata: {
          conversationId: conversation.sId,
        },
        status: "ready",
      });

      const attachments: ConversationAttachmentType[] = [
        {
          fileId: file.sId,
          path: null,
          source: "user",
          title: "test.csv",
          contentType: "text/csv",
          contentFragmentVersion: "latest",
          snippet: "test snippet",
          generatedTables: [file.sId],
          isIncludable: true,
          isSearchable: true,
          isQueryable: true,
          isInProjectContext: false,
          hidden: false,
          creator: null,
        },
      ];

      const jitServers = await getJITServers(auth, {
        agentConfiguration: agentConfig,
        conversation,
        attachments,
      });

      const sIds = jitServers.map((s) => s.sId);
      const uniqueIds = new Set(sIds);

      // All sIds should be unique.
      expect(sIds.length).toBe(uniqueIds.size);
    });
  });
});
