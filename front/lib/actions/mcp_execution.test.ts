import {
  MAX_RESOURCE_CONTENT_SIZE,
  MAX_TEXT_CONTENT_SIZE_BYTES,
  MAXED_OUTPUT_FILE_SNIPPET_LENGTH,
} from "@app/lib/actions/action_output_limits";
import type { LightServerSideMCPToolConfigurationType } from "@app/lib/actions/mcp";
import { processToolResults } from "@app/lib/actions/mcp_execution";
import { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
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
  it("should store snippet in DB when text exceeds MAX_TEXT_CONTENT_SIZE_BYTES", async () => {
    const { auth, conversation, action, toolConfiguration } = await setupTest();

    // Generate text that exceeds MAX_TEXT_CONTENT_SIZE_BYTES (20KB).
    const largeText = "x".repeat(MAX_TEXT_CONTENT_SIZE_BYTES + 1);

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
        MAXED_OUTPUT_FILE_SNIPPET_LENGTH + 50
      );
      expect(stored.resource.text).toContain("... (truncated)");
    }
  });

  it("should store snippet for large resource text", async () => {
    const { auth, conversation, action, toolConfiguration } = await setupTest();

    // Generate resource text that exceeds MAX_RESOURCE_CONTENT_SIZE (20MB).
    const largeResourceText = "y".repeat(MAX_RESOURCE_CONTENT_SIZE + 1);

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
        MAXED_OUTPUT_FILE_SNIPPET_LENGTH + 50
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
});
