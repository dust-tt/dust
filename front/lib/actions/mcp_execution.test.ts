import {
  FILE_OFFLOAD_SNIPPET_LENGTH,
  FILE_OFFLOAD_TEXT_SIZE_BYTES,
} from "@app/lib/actions/action_output_limits";
import type {
  InternalServerSideMCPToolConfigurationType,
  LightServerSideMCPToolConfigurationType,
  ServerSideMCPToolConfigurationType,
} from "@app/lib/actions/mcp";
import {
  getAugmentedInputs,
  processToolResults,
} from "@app/lib/actions/mcp_execution";
import type { DataSourceNodeContentType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { ToolContextType } from "@app/lib/actions/types";
import { TOOL_OUTPUTS_FOLDER_NAME } from "@app/lib/api/files/mount_path";
import { Authenticator } from "@app/lib/auth";
import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import logger from "@app/logger/logger";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { assert, describe, expect, it, vi } from "vitest";

// Mock file storage to avoid cloud storage interactions.
vi.mock("@app/lib/api/files/processing", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/files/processing")>();
  return {
    ...actual,
    processAndStoreFile: vi.fn().mockResolvedValue(undefined),
  };
});

async function setupTest({
  mcpServerName = "test_server",
}: {
  mcpServerName?: string;
} = {}) {
  const user = await UserFactory.basic();
  const workspace = await WorkspaceFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "admin" });
  const { globalGroup, systemGroup } = await GroupFactory.defaults(workspace);
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  await SpaceResource.makeDefaultsForWorkspace(auth, {
    globalGroup,
    systemGroup,
  });

  const agentConfig = await AgentConfigurationFactory.createTestAgent(auth);
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agentConfig.sId,
    messagesCreatedAt: [],
  });

  const toolConfiguration: LightServerSideMCPToolConfigurationType = {
    id: -1,
    sId: generateRandomModelSId(),
    type: "mcp_configuration",
    name: "test_tool",
    originalName: "test_tool",
    mcpServerName,
    dataSources: null,
    tables: null,
    childAgentId: null,
    timeFrame: null,
    jsonSchema: null,
    additionalConfiguration: {},
    mcpServerViewId: generateRandomModelSId(),
    dustAppConfiguration: null,
    internalMCPServerId: null,
    secretName: null,
    dustProject: null,
    availability: "auto",
    permission: "never_ask",
    toolServerId: generateRandomModelSId(),
    retryPolicy: "no_retry",
  };

  const { action, agentMessage } = await ConversationFactory.createAgentMessage(
    auth,
    {
      workspace,
      conversation,
      agentConfig,
      mcpAction: { toolConfiguration },
    }
  );
  assert(action, "MCP action should be created");

  // The agent message above is created with rank 0, use rank 1 for the user message.
  const { userMessage } = await ConversationFactory.createUserMessage({
    auth,
    workspace,
    conversation,
    content: "Test message",
    rank: 1,
  });

  const { model: agentModel, ...agentConfiguration } = agentConfig;
  const modelConfig = getSupportedModelConfig(agentModel);
  assert(modelConfig, "Supported model config should exist");

  const toolContext: ToolContextType = {
    runContext: {
      contextType: "agent_loop",
      agentConfiguration,
      model: {
        ...agentModel,
        ...modelConfig,
      },
      agentMessage,
      currentAction: action.toJSON(),
      conversation,
      stepContext: action.stepContext,
      toolConfiguration,
      userMessage,
    },
  };

  return { auth, conversation, action, toolContext };
}

async function setupAuth() {
  const user = await UserFactory.basic();
  const workspace = await WorkspaceFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "admin" });
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );

  return { auth };
}

function createServerSideToolConfiguration(
  overrides: Partial<ServerSideMCPToolConfigurationType> = {}
): ServerSideMCPToolConfigurationType {
  return {
    id: -1,
    sId: generateRandomModelSId(),
    type: "mcp_configuration",
    name: "remote_tool",
    description: null,
    dataSources: null,
    tables: null,
    childAgentId: null,
    timeFrame: null,
    jsonSchema: null,
    additionalConfiguration: {},
    mcpServerViewId: generateRandomModelSId(),
    dustAppConfiguration: null,
    internalMCPServerId: null,
    secretName: null,
    dustProject: null,
    availability: "manual",
    permission: "never_ask",
    toolServerId: generateRandomModelSId(),
    retryPolicy: "no_retry",
    originalName: "remote_tool",
    mcpServerName: "remote_server",
    inputSchema: {
      type: "object",
      properties: {},
    },
    ...overrides,
  };
}

const configurableStringPropertySchema: JSONSchema = {
  type: "object",
  properties: {
    value: { type: "string" },
    mimeType: {
      type: "string",
      const: INTERNAL_MIME_TYPES.TOOL_INPUT.STRING,
    },
  },
  required: ["value", "mimeType"],
};

describe("getAugmentedInputs", () => {
  it("returns raw inputs unchanged for remote MCP tools", async () => {
    const { auth } = await setupAuth();
    const rawInputs = { query: "test" };
    const actionConfiguration = createServerSideToolConfiguration({
      additionalConfiguration: {
        _attributes: "bogus",
      },
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          _attributes: configurableStringPropertySchema,
        },
      },
    });

    const result = getAugmentedInputs(auth, {
      actionConfiguration,
      rawInputs,
    });

    expect(result).toEqual(rawInputs);
    expect(result).not.toHaveProperty("_attributes");
  });

  it("augments inputs for internal MCP tools", async () => {
    const { auth } = await setupAuth();
    const rawInputs = { query: "test" };
    const actionConfiguration = {
      ...createServerSideToolConfiguration({
        additionalConfiguration: {
          stringParam: "config-value",
        },
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            stringParam: configurableStringPropertySchema,
          },
        },
      }),
      internalMCPServerId: generateRandomModelSId(),
      name: "search",
    } as InternalServerSideMCPToolConfigurationType;

    const result = getAugmentedInputs(auth, {
      actionConfiguration,
      rawInputs,
    });

    expect(result).toEqual({
      query: "test",
      stringParam: {
        value: "config-value",
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.STRING,
      },
    });
  });
});

describe("processToolResults", () => {
  it("should store snippet in DB when text exceeds FILE_OFFLOAD_TEXT_SIZE_BYTES", async () => {
    const { auth, conversation, action, toolContext } = await setupTest();

    // Generate text that exceeds FILE_OFFLOAD_TEXT_SIZE_BYTES (20KB).
    const largeText = "x".repeat(FILE_OFFLOAD_TEXT_SIZE_BYTES + 1);

    const { outputItems, generatedFiles } = await processToolResults(auth, {
      action,
      localLogger: logger.child({ test: true }),
      toolContext,
      toolCallResultContent: [{ type: "text", text: largeText }],
    });

    expect(outputItems).toHaveLength(1);
    const stored = outputItems[0].content;

    // The large text block should be converted to a resource with a truncated snippet.
    expect(stored.type).toBe("resource");
    if (stored.type === "resource" && "text" in stored.resource) {
      expect(stored.resource.text.length).toBeLessThanOrEqual(
        FILE_OFFLOAD_SNIPPET_LENGTH + 50
      );
      expect(stored.resource.text).toContain("... (truncated)");
    }

    // Offloaded to DustFileSystem, so generatedFiles is empty.
    expect(generatedFiles).toHaveLength(0);
  });

  it("should store snippet for large resource text", async () => {
    const { auth, conversation, action, toolContext } = await setupTest();

    // Generate resource text that exceeds FILE_OFFLOAD_TEXT_SIZE_BYTES (20KB).
    const largeResourceText = "y".repeat(FILE_OFFLOAD_TEXT_SIZE_BYTES + 1);

    const { outputItems, generatedFiles } = await processToolResults(auth, {
      action,
      localLogger: logger.child({ test: true }),
      toolContext,
      toolCallResultContent: [
        {
          type: "resource",
          resource: { uri: "file://test.txt", text: largeResourceText },
        },
      ],
    });

    expect(outputItems).toHaveLength(1);
    const stored = outputItems[0].content;

    expect(stored.type).toBe("resource");
    if (stored.type === "resource" && "text" in stored.resource) {
      expect(stored.resource.text.length).toBeLessThanOrEqual(
        FILE_OFFLOAD_SNIPPET_LENGTH + 50
      );
      expect(stored.resource.text).toContain("... (truncated)");
    }

    // Offloaded to DustFileSystem, so generatedFiles is empty.
    expect(generatedFiles).toHaveLength(0);
  });

  it("should keep small text content as-is", async () => {
    const { auth, conversation, action, toolContext } = await setupTest();

    const smallText = "hello world";

    const { outputItems } = await processToolResults(auth, {
      action,
      localLogger: logger.child({ test: true }),
      toolContext,
      toolCallResultContent: [{ type: "text", text: smallText }],
    });

    expect(outputItems).toHaveLength(1);
    const stored = outputItems[0].content;

    expect(stored.type).toBe("text");
    if (stored.type === "text") {
      expect(stored.text).toBe(smallText);
    }
  });

  it("should keep large sandbox text content as-is", async () => {
    const { auth, conversation, action, toolContext } = await setupTest({
      mcpServerName: "sandbox",
    });

    const largeText = "x".repeat(FILE_OFFLOAD_TEXT_SIZE_BYTES + 1);

    const { outputItems } = await processToolResults(auth, {
      action,
      localLogger: logger.child({ test: true }),
      toolContext,
      toolCallResultContent: [{ type: "text", text: largeText }],
    });

    expect(outputItems).toHaveLength(1);
    const stored = outputItems[0].content;

    expect(stored.type).toBe("text");
    if (stored.type === "text") {
      expect(stored.text).toBe(largeText);
    }
  });

  it("should keep small resource text as-is", async () => {
    const { auth, conversation, action, toolContext } = await setupTest();

    const smallText = "small resource text";

    const { outputItems } = await processToolResults(auth, {
      action,
      localLogger: logger.child({ test: true }),
      toolContext,
      toolCallResultContent: [
        {
          type: "resource",
          resource: { uri: "file://small.txt", text: smallText },
        },
      ],
    });

    expect(outputItems).toHaveLength(1);
    const stored = outputItems[0].content;

    expect(stored.type).toBe("resource");
    if (stored.type === "resource" && "text" in stored.resource) {
      expect(stored.resource.text).toBe(smallText);
    }
  });

  it(`should persist DATA_SOURCE_NODE_CONTENT block to ${TOOL_OUTPUTS_FOLDER_NAME}/`, async () => {
    const { auth, conversation, action, toolContext } = await setupTest();

    fileStorageMock.reset();

    const dataSourceNodeResult: DataSourceNodeContentType = {
      mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_NODE_CONTENT,
      uri: "notion://page/abc123",
      text: "# My Notion Page\n\nSome content here.",
      metadata: {
        nodeId: "abc123",
        title: "My Notion Page",
        path: "/workspace/My Notion Page",
        parentTitle: null,
        lastUpdatedAt: "2026-01-01T00:00:00Z",
        sourceUrl: null,
        mimeType: "application/vnd.notion.page",
        hasChildren: false,
        connectorProvider: null,
      },
    };

    await processToolResults(auth, {
      action,
      localLogger: logger.child({ test: true }),
      toolContext,
      toolCallResultContent: [
        {
          type: "resource",
          resource: dataSourceNodeResult,
        },
      ],
    });

    const toolOutputWrite = fileStorageMock.saveFileCalls.find((call) =>
      call.filePath.includes(`${TOOL_OUTPUTS_FOLDER_NAME}/`)
    );
    expect(toolOutputWrite).toBeDefined();
    expect(toolOutputWrite?.filePath).toMatch(
      new RegExp(`${TOOL_OUTPUTS_FOLDER_NAME}/\\d+_my_notion_page\\.md$`)
    );
    expect(toolOutputWrite?.content).toEqual(
      Buffer.from("# My Notion Page\n\nSome content here.")
    );
  });

  it(`should persist large plain text block to ${TOOL_OUTPUTS_FOLDER_NAME}/ as .txt`, async () => {
    const { auth, conversation, action, toolContext } = await setupTest();

    fileStorageMock.reset();

    const largeText = "hello world ".repeat(FILE_OFFLOAD_TEXT_SIZE_BYTES);

    await processToolResults(auth, {
      action,
      localLogger: logger.child({ test: true }),
      toolContext,
      toolCallResultContent: [{ type: "text", text: largeText }],
    });

    const toolOutputWrite = fileStorageMock.saveFileCalls.find((call) =>
      call.filePath.includes(`${TOOL_OUTPUTS_FOLDER_NAME}/`)
    );

    expect(toolOutputWrite).toBeDefined();
    expect(toolOutputWrite?.filePath).toMatch(
      new RegExp(`${TOOL_OUTPUTS_FOLDER_NAME}/\\d+_test_tool\\.txt$`)
    );
  });

  it(`should persist large JSON text block to ${TOOL_OUTPUTS_FOLDER_NAME}/ as .json`, async () => {
    const { auth, conversation, action, toolContext } = await setupTest();

    fileStorageMock.reset();

    const largeJson = JSON.stringify({
      data: "x".repeat(FILE_OFFLOAD_TEXT_SIZE_BYTES),
    });

    await processToolResults(auth, {
      action,
      localLogger: logger.child({ test: true }),
      toolContext,
      toolCallResultContent: [{ type: "text", text: largeJson }],
    });

    const toolOutputWrite = fileStorageMock.saveFileCalls.find((call) =>
      call.filePath.includes(`${TOOL_OUTPUTS_FOLDER_NAME}/`)
    );
    expect(toolOutputWrite).toBeDefined();
    expect(toolOutputWrite?.filePath).toMatch(
      new RegExp(`${TOOL_OUTPUTS_FOLDER_NAME}/\\d+_test_tool\\.json$`)
    );
  });
});
