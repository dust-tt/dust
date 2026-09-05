import {
  FILE_OFFLOAD_SNIPPET_LENGTH,
  FILE_OFFLOAD_TEXT_SIZE_BYTES,
  TOOL_OUTPUT_OFFLOAD_META_KEY,
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
import type {
  BrowseResultResourceType,
  DataSourceNodeContentType,
  ToolGeneratedFileType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { ToolContext } from "@app/lib/actions/types";
import { Authenticator } from "@app/lib/auth";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import logger from "@app/logger/logger";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { getTestStreamEndpoint } from "@app/tests/utils/models";
import { SandboxFunctionMCPActionFactory } from "@app/tests/utils/SandboxFunctionMCPActionFactory";
import { createPersistedSandboxFunctionInvocationTokenTestContext } from "@app/tests/utils/SandboxTokenFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { frameV2ContentType } from "@app/types/files";
import { TOOL_OUTPUTS_FOLDER_NAME } from "@app/types/mount_path";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { assert, describe, expect, it, vi } from "vitest";

// Cushion over FILE_OFFLOAD_SNIPPET_LENGTH for the "... (truncated)" marker and the
// "[Full content archived at {scopedPath}]" pointer line appended to offload snippets.
const SNIPPET_SUFFIX_CUSHION_LENGTH = 256;

// Repeats `chunk` until the result exceeds FILE_OFFLOAD_TEXT_SIZE_BYTES (ASCII only:
// 1 character = 1 byte) — and therefore also FILE_OFFLOAD_SNIPPET_LENGTH characters — so the
// block qualifies for size-based offloading and its snippet gets the truncation marker.
function makeTextAboveOffloadThreshold(chunk: string): string {
  return chunk.repeat(
    Math.ceil((FILE_OFFLOAD_TEXT_SIZE_BYTES + 1) / chunk.length)
  );
}

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

  const toolContext: ToolContext = {
    runContext: {
      contextType: "agent_loop",
      agentConfiguration,
      modelInfo: {
        endpoint: getTestStreamEndpoint(agentModel.modelId),
        ...agentModel,
      },
      agentMessage,
      action,
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
  it("preserves the display title of an existing generated file", async () => {
    const { auth, toolContext } = await setupTest();
    assert(toolContext.runContext.contextType === "agent_loop");
    const frame = await FileFactory.create(auth, null, {
      contentType: frameV2ContentType,
      fileName: "manifest.json",
      fileSize: 100,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: toolContext.runContext.conversation.sId,
        frameName: "Hello Frame",
      },
    });

    const generatedFrame: ToolGeneratedFileType = {
      contentType: frameV2ContentType,
      fileId: frame.sId,
      mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
      snippet: null,
      text: "Opened Frame.",
      title: "Hello Frame",
      uri: "https://dust.tt/frame",
    };

    const { generatedFiles } = await processToolResults(auth, {
      localLogger: logger.child({ test: true }),
      toolContext,
      toolCallResultContent: [
        {
          type: "resource",
          resource: generatedFrame,
        },
      ],
    });

    expect(generatedFiles).toHaveLength(1);
    expect(generatedFiles[0]?.title).toBe("Hello Frame");
  });

  it("should store snippet in DB when text exceeds FILE_OFFLOAD_TEXT_SIZE_BYTES", async () => {
    const { auth, toolContext } = await setupTest();

    // Generate text that exceeds FILE_OFFLOAD_TEXT_SIZE_BYTES (20KB).
    const largeText = "x".repeat(FILE_OFFLOAD_TEXT_SIZE_BYTES + 1);

    const { outputItems, generatedFiles } = await processToolResults(auth, {
      localLogger: logger.child({ test: true }),
      toolContext,
      toolCallResultContent: [{ type: "text", text: largeText }],
    });

    expect(outputItems).toHaveLength(1);
    const stored = outputItems[0].content;

    // The large text block should be converted to a resource with a truncated snippet
    // pointing at the offloaded file.
    expect(stored.type).toBe("resource");
    if (stored.type === "resource" && "text" in stored.resource) {
      expect(stored.resource.text.length).toBeLessThanOrEqual(
        FILE_OFFLOAD_SNIPPET_LENGTH + SNIPPET_SUFFIX_CUSHION_LENGTH
      );
      expect(stored.resource.text).toContain("... (truncated)");
      expect(stored.resource.text).toContain(
        `[Full content archived at ${stored.resource.uri}]`
      );
      expect(stored.resource.uri).toMatch(
        new RegExp(`${TOOL_OUTPUTS_FOLDER_NAME}/`)
      );

      // The machine-readable counterpart of the archive sentence rides the block's _meta.
      expect(stored._meta?.[TOOL_OUTPUT_OFFLOAD_META_KEY]).toEqual({
        fullContentPath: stored.resource.uri,
        totalBytes: Buffer.byteLength(largeText, "utf8"),
        contentType: "text/plain",
      });
    }

    // Offloaded to DustFileSystem, so generatedFiles is empty.
    expect(generatedFiles).toHaveLength(0);
  });

  it("should store snippet for large resource text", async () => {
    const { auth, toolContext } = await setupTest();

    // Generate resource text that exceeds FILE_OFFLOAD_TEXT_SIZE_BYTES (20KB).
    const largeResourceText = "y".repeat(FILE_OFFLOAD_TEXT_SIZE_BYTES + 1);

    const { outputItems, generatedFiles } = await processToolResults(auth, {
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
        FILE_OFFLOAD_SNIPPET_LENGTH + SNIPPET_SUFFIX_CUSHION_LENGTH
      );
      expect(stored.resource.text).toContain("... (truncated)");
      expect(stored.resource.text).toMatch(
        new RegExp(
          `\\[Full content archived at .*${TOOL_OUTPUTS_FOLDER_NAME}/.*\\]`
        )
      );
    }

    // Offloaded to DustFileSystem, so generatedFiles is empty.
    expect(generatedFiles).toHaveLength(0);
  });

  it("should keep small text content as-is", async () => {
    const { auth, toolContext } = await setupTest();

    const smallText = "hello world";

    const { outputItems } = await processToolResults(auth, {
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
    const { auth, toolContext } = await setupTest({
      mcpServerName: "sandbox",
    });

    const largeText = "x".repeat(FILE_OFFLOAD_TEXT_SIZE_BYTES + 1);

    const { outputItems } = await processToolResults(auth, {
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
    const { auth, toolContext } = await setupTest();

    const smallText = "small resource text";

    const { outputItems } = await processToolResults(auth, {
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

  it("should store an unsupported blob resource as a file instead of inlining it", async () => {
    const { auth, toolContext } = await setupTest();

    fileStorageMock.reset();

    const blobBytes = Buffer.from("PK fake zip payload");
    const base64Blob = blobBytes.toString("base64");

    const { outputItems, generatedFiles } = await processToolResults(auth, {
      localLogger: logger.child({ test: true }),
      toolContext,
      toolCallResultContent: [
        {
          type: "resource",
          resource: {
            uri: "file://archive.zip",
            blob: base64Blob,
            mimeType: "application/zip",
          },
        },
      ],
    });

    expect(outputItems).toHaveLength(1);
    const stored = outputItems[0].content;

    // The blob is turned into a file-path reference; the base64 is NOT inlined into the output.
    expect(stored.type).toBe("resource");
    if (stored.type === "resource") {
      expect(stored.resource.mimeType).toBe(
        INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE_PATH
      );
      expect("blob" in stored.resource).toBe(false);
    }

    // The raw bytes were written to file storage.
    const fileWrite = fileStorageMock.saveFileCalls.find(
      (call) => Buffer.isBuffer(call.content) && call.content.equals(blobBytes)
    );
    expect(fileWrite).toBeDefined();

    // The generated file reference preserves the original (unsupported) content type.
    expect(generatedFiles).toHaveLength(1);
    expect(generatedFiles[0].contentType).toBe("application/zip");
  });

  it(`should persist DATA_SOURCE_NODE_CONTENT block to ${TOOL_OUTPUTS_FOLDER_NAME}/`, async () => {
    const { auth, toolContext } = await setupTest();

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

  it("should offload small BROWSE_RESULT block keeping its full text in the snippet", async () => {
    const { auth, toolContext } = await setupTest();

    fileStorageMock.reset();

    const pageText = "A short web page.";
    const browseResult: BrowseResultResourceType = {
      mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.BROWSE_RESULT,
      requestedUrl: "https://example.com/short",
      uri: "https://example.com/short",
      text: pageText,
      title: "Short Page",
      responseCode: "200",
    };

    const { outputItems } = await processToolResults(auth, {
      localLogger: logger.child({ test: true }),
      toolContext,
      toolCallResultContent: [{ type: "resource", resource: browseResult }],
    });

    const toolOutputWrite = fileStorageMock.saveFileCalls.find((call) =>
      call.filePath.includes(`${TOOL_OUTPUTS_FOLDER_NAME}/`)
    );
    expect(toolOutputWrite).toBeDefined();
    expect(toolOutputWrite?.content).toEqual(Buffer.from(pageText));

    expect(outputItems).toHaveLength(1);
    const stored = outputItems[0].content;
    expect(stored.type).toBe("resource");
    if (stored.type === "resource" && "text" in stored.resource) {
      expect(stored.resource.text).toContain(pageText);
      // Nothing was dropped, so no truncation marker — only the archive pointer.
      expect(stored.resource.text).not.toContain("... (truncated)");
      expect(stored.resource.text).toMatch(
        new RegExp(
          `\\[Full content archived at .*${TOOL_OUTPUTS_FOLDER_NAME}/\\d+_short_page\\.md\\]`
        )
      );
    }
  });

  it(`should offload large BROWSE_RESULT block to ${TOOL_OUTPUTS_FOLDER_NAME}/ with a snippet pointing at the archived file`, async () => {
    const { auth, toolContext } = await setupTest();

    fileStorageMock.reset();

    const pageText = makeTextAboveOffloadThreshold(
      "Interesting web page content. "
    );
    const browseResult: BrowseResultResourceType = {
      mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.BROWSE_RESULT,
      requestedUrl: "https://example.com/long",
      uri: "https://example.com/long",
      text: pageText,
      title: "Long Page",
      responseCode: "200",
    };

    const { outputItems } = await processToolResults(auth, {
      localLogger: logger.child({ test: true }),
      toolContext,
      toolCallResultContent: [{ type: "resource", resource: browseResult }],
    });

    const toolOutputWrite = fileStorageMock.saveFileCalls.find((call) =>
      call.filePath.includes(`${TOOL_OUTPUTS_FOLDER_NAME}/`)
    );
    expect(toolOutputWrite).toBeDefined();
    expect(toolOutputWrite?.filePath).toMatch(
      new RegExp(`${TOOL_OUTPUTS_FOLDER_NAME}/\\d+_long_page\\.md$`)
    );
    expect(toolOutputWrite?.content).toEqual(Buffer.from(pageText));

    expect(outputItems).toHaveLength(1);
    const stored = outputItems[0].content;
    expect(stored.type).toBe("resource");
    if (stored.type === "resource" && "text" in stored.resource) {
      expect(stored.resource.text.length).toBeLessThanOrEqual(
        FILE_OFFLOAD_SNIPPET_LENGTH + SNIPPET_SUFFIX_CUSHION_LENGTH
      );
      expect(stored.resource.text).toContain("... (truncated)");
      // The snippet must point at the archived file so the model can read the full page.
      expect(stored.resource.text).toMatch(
        new RegExp(
          `\\[Full content archived at .*${TOOL_OUTPUTS_FOLDER_NAME}/\\d+_long_page\\.md\\]`
        )
      );
      // The browse resource keeps the browsed url as its uri.
      if ("uri" in stored.resource) {
        expect(stored.resource.uri).toBe("https://example.com/long");
      }
    }
  });

  it(`should persist large plain text block to ${TOOL_OUTPUTS_FOLDER_NAME}/ as .txt`, async () => {
    const { auth, toolContext } = await setupTest();

    fileStorageMock.reset();

    const largeText = "hello world ".repeat(FILE_OFFLOAD_TEXT_SIZE_BYTES);

    await processToolResults(auth, {
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
    const { auth, toolContext } = await setupTest();

    fileStorageMock.reset();

    const largeJson = JSON.stringify({
      data: "x".repeat(FILE_OFFLOAD_TEXT_SIZE_BYTES),
    });

    await processToolResults(auth, {
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

  async function setupSandboxFunctionTest() {
    const {
      auth,
      workspace,
      invocation,
      globalSpace,
      podSpace,
      sandboxFunction,
    } = await createPersistedSandboxFunctionInvocationTokenTestContext();
    const server = await InternalMCPServerInMemoryResource.makeNew(auth, {
      name: "common_utilities",
      useCase: null,
    });
    const view = await MCPServerViewFactory.create(
      workspace,
      server.id,
      globalSpace
    );
    const action = await SandboxFunctionMCPActionFactory.create(auth, {
      invocation,
      mcpServerView: view,
    });

    fileStorageMock.reset();

    const toolContext: ToolContext = {
      runContext: {
        contextType: "sandbox_function",
        action,
        invocation,
        toolConfiguration: action.toolConfiguration,
      },
    };

    return {
      auth,
      workspace,
      action,
      podSpace,
      sandboxFunction,
      toolContext,
    };
  }

  it(`should offload registered resource blocks to ${TOOL_OUTPUTS_FOLDER_NAME}/{slug}/ in a sandbox function run context`, async () => {
    const { auth, workspace, podSpace, sandboxFunction, toolContext } =
      await setupSandboxFunctionTest();

    const dataSourceNodeResult: DataSourceNodeContentType = {
      mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_NODE_CONTENT,
      uri: "notion://page/def456",
      text: "# Function Notion Page\n\nSome content here.",
      metadata: {
        nodeId: "def456",
        title: "Function Notion Page",
        path: "/workspace/Function Notion Page",
        parentTitle: null,
        lastUpdatedAt: "2026-01-01T00:00:00Z",
        sourceUrl: null,
        mimeType: "application/vnd.notion.page",
        hasChildren: false,
        connectorProvider: null,
      },
    };

    await processToolResults(auth, {
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
    // Pod tool outputs are scoped by function slug so functions of the same pod cannot mix
    // their outputs.
    expect(toolOutputWrite?.filePath).toMatch(
      new RegExp(
        `w/${workspace.sId}/pods/${podSpace.sId}/files/${TOOL_OUTPUTS_FOLDER_NAME}/${sandboxFunction.slug}/\\d+_function_notion_page\\.md$`
      )
    );
  });

  it("should write the full content array to a single GCS object in a sandbox function run context", async () => {
    const { auth, workspace, action, toolContext } =
      await setupSandboxFunctionTest();

    const toolCallResultContent: CallToolResult["content"] = [
      { type: "text", text: "first block" },
      { type: "text", text: "second block" },
    ];

    const { outputItems, generatedFiles } = await processToolResults(auth, {
      localLogger: logger.child({ test: true }),
      toolContext,
      toolCallResultContent,
    });

    // Sandbox actions persist the whole content array as a single GCS object, but
    // createOutputItems still returns the generic per-content items.
    expect(outputItems).toHaveLength(2);
    expect(generatedFiles).toHaveLength(0);

    // The full content array lands in one GCS object, recorded on the action row.
    const outputWrite = fileStorageMock.saveFileCalls.find((call) =>
      call.filePath.endsWith(`mcp_output_items/${action.sId}/output.json`)
    );
    expect(outputWrite).toBeDefined();
    expect(JSON.parse(outputWrite?.content.toString() ?? "")).toEqual(
      toolCallResultContent
    );

    const refetched =
      await SandboxFunctionMCPActionResource.fetchByModelIdWithAuth(
        auth,
        action.id
      );
    expect(refetched?.outputGcsPath).toBe(
      `w/${workspace.sId}/mcp_output_items/${action.sId}/output.json`
    );
  });

  it("should use the same snippet shape and descriptor in a sandbox function run context", async () => {
    const { auth, toolContext } = await setupSandboxFunctionTest();

    // JSON content: there is a single snippet path, so the snippet is a plain head cut here
    // too. Code consumers read the full content back through the _meta descriptor.
    const largeJson = JSON.stringify({
      data: "x".repeat(FILE_OFFLOAD_TEXT_SIZE_BYTES),
    });

    const { outputItems } = await processToolResults(auth, {
      localLogger: logger.child({ test: true }),
      toolContext,
      toolCallResultContent: [{ type: "text", text: largeJson }],
    });

    expect(outputItems).toHaveLength(1);
    const stored = outputItems[0].content;
    expect(stored.type).toBe("resource");
    assert(stored.type === "resource" && "text" in stored.resource);

    expect(stored.resource.text).toBe(
      `${largeJson.substring(0, FILE_OFFLOAD_SNIPPET_LENGTH)}... (truncated)\n` +
        `[Full content archived at ${stored.resource.uri}]`
    );

    expect(stored._meta?.[TOOL_OUTPUT_OFFLOAD_META_KEY]).toEqual({
      fullContentPath: stored.resource.uri,
      totalBytes: Buffer.byteLength(largeJson, "utf8"),
      contentType: "application/json",
    });

    // The descriptor survives output-item persistence: it is part of the single GCS object
    // recorded on the sandbox action, which is what the function invocation reads.
    const outputWrite = fileStorageMock.saveFileCalls.find((call) =>
      call.filePath.endsWith("/output.json")
    );
    expect(outputWrite).toBeDefined();
    const persisted = JSON.parse(outputWrite?.content.toString() ?? "");
    expect(persisted[0]._meta?.[TOOL_OUTPUT_OFFLOAD_META_KEY]).toEqual({
      fullContentPath: stored.resource.uri,
      totalBytes: Buffer.byteLength(largeJson, "utf8"),
      contentType: "application/json",
    });
  });

  it("should attach the offload descriptor to offloaded resource text blocks", async () => {
    const { auth, toolContext } = await setupTest();

    const largeResourceText = "y".repeat(FILE_OFFLOAD_TEXT_SIZE_BYTES + 1);

    const { outputItems } = await processToolResults(auth, {
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
    assert(stored.type === "resource" && "text" in stored.resource);

    const descriptor = stored._meta?.[TOOL_OUTPUT_OFFLOAD_META_KEY];
    expect(descriptor).toMatchObject({
      totalBytes: Buffer.byteLength(largeResourceText, "utf8"),
      contentType: "text/plain",
    });
    expect(stored.resource.text).toContain("[Full content archived at ");
  });

  it("should persist a versioned envelope when the tool result carries structuredContent in a sandbox function run context", async () => {
    const { auth, action, toolContext } = await setupSandboxFunctionTest();

    const toolCallResultContent: CallToolResult["content"] = [
      { type: "text", text: "human-readable result" },
    ];
    const structuredContent = { items: [{ id: 1 }], nextCursor: "abc" };

    const { outputItems } = await processToolResults(auth, {
      localLogger: logger.child({ test: true }),
      toolContext,
      toolCallResultContent,
      toolCallResultStructuredContent: structuredContent,
    });

    expect(outputItems).toHaveLength(1);

    const outputWrite = fileStorageMock.saveFileCalls.find((call) =>
      call.filePath.endsWith(`mcp_output_items/${action.sId}/output.json`)
    );
    expect(outputWrite).toBeDefined();
    expect(JSON.parse(outputWrite?.content.toString() ?? "")).toEqual({
      version: 2,
      content: toolCallResultContent,
      structuredContent,
    });
  });

  it("should throw and leave the action without an output path when the sandbox output write fails", async () => {
    const { auth, action, toolContext } = await setupSandboxFunctionTest();

    fileStorageMock.setFileSaveFails((filePath) =>
      filePath.endsWith(`mcp_output_items/${action.sId}/output.json`)
    );

    await expect(
      processToolResults(auth, {
        localLogger: logger.child({ test: true }),
        toolContext,
        toolCallResultContent: [{ type: "text", text: "some output" }],
      })
    ).rejects.toThrow();

    // No acceptable degraded state: the row must not point at an object that was never written.
    const refetched =
      await SandboxFunctionMCPActionResource.fetchByModelIdWithAuth(
        auth,
        action.id
      );
    expect(refetched?.outputGcsPath).toBeNull();
  });
});
