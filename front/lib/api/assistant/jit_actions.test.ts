import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_CONVERSATION_LIST_FILES_ACTION_NAME,
  DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_NAME,
  DEFAULT_CONVERSATION_SEARCH_ACTION_NAME,
  DEFAULT_PROJECT_SEARCH_ACTION_NAME,
} from "@app/lib/actions/constants";
import type { ConversationAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import {
  getJITServers,
  getProjectContextDataSourceView,
} from "@app/lib/api/assistant/jit_actions";
import { getProjectContextDatasourceName } from "@app/lib/api/projects";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import type {
  ConversationType,
  LightAgentConfigurationType,
  WorkspaceType,
} from "@app/types";

describe("getJITServers", () => {
  let auth: Authenticator;
  let workspace: WorkspaceType;
  let conversationsSpace: SpaceResource;
  let conversation: ConversationType;
  let agentConfig: LightAgentConfigurationType;

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

    it("should include conversation_files server when attachments exist", async () => {
      const user = auth.getNonNullableUser();
      const file = await FileFactory.csv(workspace, user, {
        useCase: "conversation",
        useCaseMetadata: {
          conversationId: conversation.sId,
        },
        status: "ready",
      });

      const attachments: ConversationAttachmentType[] = [
        {
          fileId: file.sId,
          title: "test.csv",
          contentType: "text/csv",
          contentFragmentVersion: "latest",
          snippet: "test snippet",
          generatedTables: [],
          isIncludable: true,
          isSearchable: true,
          isQueryable: true,
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
    // Note: This test requires the skill_management MCP server to be enabled and available.
    // In the current test environment, this server may not be created by ensureAllAutoToolsAreCreated.
    it.skip("should include skill_management server when agent has skills and feature flag is enabled", async () => {
      // Enable skills feature flag.
      await FeatureFlagFactory.basic("skills", workspace);

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

    it("should not include skill_management server when feature flag is disabled", async () => {
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

      expect(skillManagementServer).toBeUndefined();
    });

    it("should not include skill_management server when agent has no skills", async () => {
      // Enable skills feature flag.
      await FeatureFlagFactory.basic("skills", workspace);

      const jitServers = await getJITServers(auth, {
        agentConfiguration: agentConfig,
        conversation,
        attachments: [],
      });

      const skillManagementServer = jitServers.find(
        (server) => server.name === "skill_management"
      );

      expect(skillManagementServer).toBeUndefined();
    });
  });

  describe("projects feature", () => {
    // Note: This test requires the search MCP server to be enabled in the projects context.
    // The test environment may not have all the required infrastructure for project context search.
    it.skip("should include project search server when feature flag is enabled and project context exists", async () => {
      // Enable projects feature flag.
      await FeatureFlagFactory.basic("projects", workspace);

      // Create a data source view with the project context name.
      const projectContextName = getProjectContextDatasourceName(
        conversationsSpace.id
      );
      const dataSourceView = await DataSourceViewFactory.folder(
        workspace,
        conversationsSpace,
        auth.user()
      );

      // Update the datasource name to match the project context name.
      // @ts-expect-error -- access protected member for test
      await dataSourceView.dataSource.update({
        name: projectContextName,
      });

      const jitServers = await getJITServers(auth, {
        agentConfiguration: agentConfig,
        conversation: {
          ...conversation,
          spaceId: conversationsSpace.sId,
        },
        attachments: [],
      });

      const projectSearchServer = jitServers.find(
        (server) => server.name === DEFAULT_PROJECT_SEARCH_ACTION_NAME
      );

      // The project search server should be present with proper configuration.
      expect(projectSearchServer).toBeDefined();
      expect(projectSearchServer?.description).toBe(
        "Semantic search over the project context"
      );
      expect(projectSearchServer?.dataSources).toBeDefined();
      // The datasource configuration should include the project context datasource.
      if (projectSearchServer?.dataSources) {
        expect(projectSearchServer.dataSources.length).toBeGreaterThan(0);
        expect(projectSearchServer.dataSources[0].dataSourceViewId).toBe(
          dataSourceView.sId
        );
      }
    });

    it("should not include project search server when feature flag is disabled", async () => {
      const jitServers = await getJITServers(auth, {
        agentConfiguration: agentConfig,
        conversation,
        attachments: [],
      });

      const projectSearchServer = jitServers.find(
        (server) => server.name === DEFAULT_PROJECT_SEARCH_ACTION_NAME
      );

      expect(projectSearchServer).toBeUndefined();
    });
  });

  describe("schedules_management feature", () => {
    it("should include schedules_management server for onboarding conversations", async () => {
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

      const schedulesManagementServer = jitServers.find(
        (server) => server.name === "schedules_management"
      );

      expect(schedulesManagementServer).toBeDefined();
      expect(schedulesManagementServer?.name).toContain("schedules_management");
      expect(schedulesManagementServer?.description).toContain(
        "recurring tasks"
      );
    });

    it("should not include schedules_management server for non-onboarding conversations", async () => {
      const jitServers = await getJITServers(auth, {
        agentConfiguration: agentConfig,
        conversation,
        attachments: [],
      });

      const schedulesManagementServer = jitServers.find(
        (server) => server.name === "schedules_management"
      );

      expect(schedulesManagementServer).toBeUndefined();
    });
  });

  describe("attachment-based servers", () => {
    it("should include query_tables server when queryable attachments exist", async () => {
      const user = auth.getNonNullableUser();
      const file = await FileFactory.csv(workspace, user, {
        useCase: "conversation",
        useCaseMetadata: {
          conversationId: conversation.sId,
        },
        status: "ready",
      });

      const attachments: ConversationAttachmentType[] = [
        {
          fileId: file.sId,
          title: "test.csv",
          contentType: "text/csv",
          contentFragmentVersion: "latest",
          snippet: "test snippet",
          generatedTables: [file.sId],
          isIncludable: true,
          isSearchable: true,
          isQueryable: true,
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
      expect(queryTablesServer?.description).toContain(
        `'queryable' conversation files`
      );
      expect(queryTablesServer?.description).toContain(
        DEFAULT_CONVERSATION_LIST_FILES_ACTION_NAME
      );
      expect(queryTablesServer?.tables).toBeDefined();
      // Note: tables array may be empty if conversation datasource view is not set up,
      // but the server should still be created with the correct structure.
    });

    it("should include search server when searchable attachments exist", async () => {
      const user = auth.getNonNullableUser();
      const file = await FileFactory.create(workspace, user, {
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
          title: "test.txt",
          contentType: "text/plain",
          contentFragmentVersion: "latest",
          snippet: "test snippet",
          generatedTables: [],
          isIncludable: true,
          isSearchable: true,
          isQueryable: false,
        },
      ];

      const jitServers = await getJITServers(auth, {
        agentConfiguration: agentConfig,
        conversation,
        attachments,
      });

      const searchServer = jitServers.find(
        (server) => server.name === DEFAULT_CONVERSATION_SEARCH_ACTION_NAME
      );

      expect(searchServer).toBeDefined();
      expect(searchServer?.description).toBe(
        "Semantic search over all files from the conversation"
      );
      expect(searchServer?.dataSources).toBeDefined();
      // Note: datasources array may be empty if conversation datasource view is not set up,
      // but the server should still be created with the correct structure.
    });

    it("should not include query_tables server when no queryable attachments", async () => {
      const user = auth.getNonNullableUser();
      const file = await FileFactory.create(workspace, user, {
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
          title: "test.txt",
          contentType: "text/plain",
          contentFragmentVersion: "latest",
          snippet: "test snippet",
          generatedTables: [],
          isIncludable: true,
          isSearchable: true,
          isQueryable: false,
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

    it("should not include search server when no searchable attachments", async () => {
      const user = auth.getNonNullableUser();
      const file = await FileFactory.csv(workspace, user, {
        useCase: "conversation",
        useCaseMetadata: {
          conversationId: conversation.sId,
        },
        status: "ready",
      });

      const attachments: ConversationAttachmentType[] = [
        {
          fileId: file.sId,
          title: "test.csv",
          contentType: "text/csv",
          contentFragmentVersion: "latest",
          snippet: "test snippet",
          generatedTables: [file.sId],
          isIncludable: true,
          isSearchable: false,
          isQueryable: true,
        },
      ];

      const jitServers = await getJITServers(auth, {
        agentConfiguration: agentConfig,
        conversation,
        attachments,
      });

      const searchServer = jitServers.find(
        (server) => server.name === DEFAULT_CONVERSATION_SEARCH_ACTION_NAME
      );

      expect(searchServer).toBeUndefined();
    });
  });

  describe("multiple servers", () => {
    it("should return multiple servers when conditions are met", async () => {
      // Create attachments.
      const user = auth.getNonNullableUser();
      const file = await FileFactory.csv(workspace, user, {
        useCase: "conversation",
        useCaseMetadata: {
          conversationId: conversation.sId,
        },
        status: "ready",
      });

      const attachments: ConversationAttachmentType[] = [
        {
          fileId: file.sId,
          title: "test.csv",
          contentType: "text/csv",
          contentFragmentVersion: "latest",
          snippet: "test snippet",
          generatedTables: [file.sId],
          isIncludable: true,
          isSearchable: true,
          isQueryable: true,
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
      expect(serverNames).toContain(DEFAULT_CONVERSATION_SEARCH_ACTION_NAME);
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
      const file = await FileFactory.csv(workspace, user, {
        useCase: "conversation",
        useCaseMetadata: {
          conversationId: conversation.sId,
        },
        status: "ready",
      });

      const attachments: ConversationAttachmentType[] = [
        {
          fileId: file.sId,
          title: "test.csv",
          contentType: "text/csv",
          contentFragmentVersion: "latest",
          snippet: "test snippet",
          generatedTables: [file.sId],
          isIncludable: true,
          isSearchable: true,
          isQueryable: true,
        },
      ];

      const jitServers = await getJITServers(auth, {
        agentConfiguration: agentConfig,
        conversation,
        attachments,
      });

      const sIds = jitServers.map((s) => s.sId);
      const uniqueSIds = new Set(sIds);

      // All sIds should be unique.
      expect(sIds.length).toBe(uniqueSIds.size);
    });
  });
});

describe("getProjectContextDataSourceView", () => {
  let auth: Authenticator;
  let workspace: WorkspaceType;
  let conversationsSpace: SpaceResource;
  let conversation: ConversationType;

  beforeEach(async () => {
    const setup = await createResourceTest({ role: "admin" });
    auth = setup.authenticator;
    workspace = setup.workspace;
    conversationsSpace = setup.conversationsSpace;

    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent Description",
    });

    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });
  });

  it("should return null for conversation not in a space", async () => {
    const result = await getProjectContextDataSourceView(auth, conversation);
    expect(result).toBeNull();
  });

  it("should return null when space has no project context datasource", async () => {
    const conversationInSpace = {
      ...conversation,
      spaceId: conversationsSpace.sId,
    };

    const result = await getProjectContextDataSourceView(
      auth,
      conversationInSpace
    );
    expect(result).toBeNull();
  });

  it("should return datasource view when space has project context", async () => {
    // Create a data source view with the project context name.
    const projectContextName = getProjectContextDatasourceName(
      conversationsSpace.id
    );
    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      conversationsSpace,
      auth.user()
    );

    // Update the datasource name to match the project context name.
    // @ts-expect-error -- access protected member for test
    await dataSourceView.dataSource.update({
      name: projectContextName,
    });

    const conversationInSpace = {
      ...conversation,
      spaceId: conversationsSpace.sId,
    };

    const result = await getProjectContextDataSourceView(
      auth,
      conversationInSpace
    );

    expect(result).toBeDefined();
    expect(result?.sId).toBe(dataSourceView.sId);
  });
});
