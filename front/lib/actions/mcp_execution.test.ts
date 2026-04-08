import {
  FILE_OFFLOAD_RESOURCE_SIZE_BYTES,
  FILE_OFFLOAD_SNIPPET_LENGTH,
  FILE_OFFLOAD_TEXT_SIZE_BYTES,
} from "@app/lib/actions/action_output_limits";
import type { LightServerSideMCPToolConfigurationType } from "@app/lib/actions/mcp";
import { processToolResults } from "@app/lib/actions/mcp_execution";
import type { DataSourceNodeContentType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import logger from "@app/logger/logger";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
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

async function setupTest() {
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
    mcpServerName: "test_server",
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

  const { action } = await ConversationFactory.createAgentMessage(auth, {
    workspace,
    conversation,
    agentConfig,
    mcpAction: { toolConfiguration },
  });
  assert(action, "MCP action should be created");

  return { auth, conversation, action, toolConfiguration };
}

describe("processToolResults", () => {
  it("should store snippet in DB when text exceeds FILE_OFFLOAD_TEXT_SIZE_BYTES", async () => {
    const { auth, conversation, action, toolConfiguration } = await setupTest();

    // Generate text that exceeds FILE_OFFLOAD_TEXT_SIZE_BYTES (20KB).
    const largeText = "x".repeat(FILE_OFFLOAD_TEXT_SIZE_BYTES + 1);

    const { outputItems } = await processToolResults(auth, {
      action,
      conversation,
      localLogger: logger.child({ test: true }),
      toolCallResultContent: [{ type: "text", text: largeText }],
      toolConfiguration,
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
  });

  it("should store snippet for large resource text", async () => {
    const { auth, conversation, action, toolConfiguration } = await setupTest();

    // Generate resource text that exceeds FILE_OFFLOAD_RESOURCE_SIZE_BYTES (20MB).
    const largeResourceText = "y".repeat(FILE_OFFLOAD_RESOURCE_SIZE_BYTES + 1);

    const { outputItems } = await processToolResults(auth, {
      action,
      conversation,
      localLogger: logger.child({ test: true }),
      toolCallResultContent: [
        {
          type: "resource",
          resource: { uri: "file://test.txt", text: largeResourceText },
        },
      ],
      toolConfiguration,
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
  });

  it("should keep small text content as-is", async () => {
    const { auth, conversation, action, toolConfiguration } = await setupTest();

    const smallText = "hello world";

    const { outputItems } = await processToolResults(auth, {
      action,
      conversation,
      localLogger: logger.child({ test: true }),
      toolCallResultContent: [{ type: "text", text: smallText }],
      toolConfiguration,
    });

    expect(outputItems).toHaveLength(1);
    const stored = outputItems[0].content;

    expect(stored.type).toBe("text");
    if (stored.type === "text") {
      expect(stored.text).toBe(smallText);
    }
  });

  it("should keep small resource text as-is", async () => {
    const { auth, conversation, action, toolConfiguration } = await setupTest();

    const smallText = "small resource text";

    const { outputItems } = await processToolResults(auth, {
      action,
      conversation,
      localLogger: logger.child({ test: true }),
      toolCallResultContent: [
        {
          type: "resource",
          resource: { uri: "file://small.txt", text: smallText },
        },
      ],
      toolConfiguration,
    });

    expect(outputItems).toHaveLength(1);
    const stored = outputItems[0].content;

    expect(stored.type).toBe("resource");
    if (stored.type === "resource" && "text" in stored.resource) {
      expect(stored.resource.text).toBe(smallText);
    }
  });

  it("should persist DATA_SOURCE_NODE_CONTENT block to tool_outputs/", async () => {
    const { auth, conversation, action, toolConfiguration } = await setupTest();
    await FeatureFlagFactory.basic(auth, "sandbox_tools");

    vi.mocked(getPrivateUploadBucket).mockClear();

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
      conversation,
      localLogger: logger.child({ test: true }),
      toolCallResultContent: [
        {
          type: "resource",
          resource: dataSourceNodeResult,
        },
      ],
      toolConfiguration,
    });

    const uploadCalls = vi
      .mocked(getPrivateUploadBucket)
      .mock.results.flatMap((r) =>
        r.type === "return"
          ? vi.mocked(r.value.uploadRawContentToBucket).mock.calls
          : []
      );

    const toolOutputWrite = uploadCalls.find((call) =>
      call[0].filePath.includes("tool_outputs/")
    );
    expect(toolOutputWrite).toBeDefined();
    expect(toolOutputWrite?.[0].filePath).toMatch(
      /tool_outputs\/\d+_my_notion_page\.md$/
    );
    expect(toolOutputWrite?.[0].content).toBe(
      "# My Notion Page\n\nSome content here."
    );
  });

  it("should persist large plain text block to tool_outputs/ as .txt", async () => {
    const { auth, conversation, action, toolConfiguration } = await setupTest();
    await FeatureFlagFactory.basic(auth, "sandbox_tools");

    vi.mocked(getPrivateUploadBucket).mockClear();

    const largeText = "hello world ".repeat(FILE_OFFLOAD_TEXT_SIZE_BYTES);

    await processToolResults(auth, {
      action,
      conversation,
      localLogger: logger.child({ test: true }),
      toolCallResultContent: [{ type: "text", text: largeText }],
      toolConfiguration,
    });

    const uploadCalls = vi
      .mocked(getPrivateUploadBucket)
      .mock.results.flatMap((r) =>
        r.type === "return"
          ? vi.mocked(r.value.uploadRawContentToBucket).mock.calls
          : []
      );

    const toolOutputWrite = uploadCalls.find((call) =>
      call[0].filePath.includes("tool_outputs/")
    );
    expect(toolOutputWrite).toBeDefined();
    expect(toolOutputWrite?.[0].filePath).toMatch(
      /tool_outputs\/\d+_test_server\.txt$/
    );
  });

  it("should persist large JSON text block to tool_outputs/ as .json", async () => {
    const { auth, conversation, action, toolConfiguration } = await setupTest();
    await FeatureFlagFactory.basic(auth, "sandbox_tools");

    vi.mocked(getPrivateUploadBucket).mockClear();

    const largeJson = JSON.stringify({
      data: "x".repeat(FILE_OFFLOAD_TEXT_SIZE_BYTES),
    });

    await processToolResults(auth, {
      action,
      conversation,
      localLogger: logger.child({ test: true }),
      toolCallResultContent: [{ type: "text", text: largeJson }],
      toolConfiguration,
    });

    const uploadCalls = vi
      .mocked(getPrivateUploadBucket)
      .mock.results.flatMap((r) =>
        r.type === "return"
          ? vi.mocked(r.value.uploadRawContentToBucket).mock.calls
          : []
      );

    const toolOutputWrite = uploadCalls.find((call) =>
      call[0].filePath.includes("tool_outputs/")
    );
    expect(toolOutputWrite).toBeDefined();
    expect(toolOutputWrite?.[0].filePath).toMatch(
      /tool_outputs\/\d+_test_server\.json$/
    );
  });
});
