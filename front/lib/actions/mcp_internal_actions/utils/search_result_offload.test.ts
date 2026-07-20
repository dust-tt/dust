import {
  FILE_OFFLOAD_SNIPPET_LENGTH,
  FILE_OFFLOAD_TEXT_SIZE_BYTES,
} from "@app/lib/actions/action_output_limits";
import type { LightServerSideMCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { SearchResultResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { offloadLargeSearchResultChunks } from "@app/lib/actions/mcp_internal_actions/utils/search_result_offload";
import type { ToolRunContext } from "@app/lib/actions/types";
import { TOOL_OUTPUTS_FOLDER_NAME } from "@app/lib/api/files/mount_path";
import { Authenticator } from "@app/lib/auth";
import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { assert, describe, expect, it } from "vitest";

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
    name: "semantic_search",
    originalName: "semantic_search",
    mcpServerName: "search",
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

  const runContext: ToolRunContext = {
    contextType: "agent_loop",
    agentConfiguration,
    model: {
      ...agentModel,
      ...modelConfig,
    },
    agentMessage,
    action,
    conversation,
    stepContext: action.stepContext,
    toolConfiguration,
    userMessage,
  };

  return { auth, conversation, runContext };
}

function makeSearchResult(chunks: string[]): SearchResultResourceType {
  return {
    mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_SEARCH_RESULT,
    uri: "https://example.com/doc",
    text: "My Document",
    id: "doc-1",
    tags: ["title:My Document"],
    ref: "aa",
    source: { provider: "notion" },
    chunks,
  };
}

describe("offloadLargeSearchResultChunks", () => {
  it("keeps results under the threshold unchanged", async () => {
    const { auth, runContext } = await setupTest();

    fileStorageMock.reset();

    const result = makeSearchResult(["a small chunk", "another small chunk"]);
    const offloaded = await offloadLargeSearchResultChunks(auth, runContext, [
      result,
    ]);

    expect(offloaded).toEqual([result]);
    expect(
      fileStorageMock.saveFileCalls.filter((call) =>
        call.filePath.includes(`${TOOL_OUTPUTS_FOLDER_NAME}/`)
      )
    ).toHaveLength(0);
  });

  it("archives oversized chunks and replaces them with a snippet pointing at the file", async () => {
    const { auth, conversation, runContext } = await setupTest();

    fileStorageMock.reset();

    const bigChunk = "x".repeat(FILE_OFFLOAD_TEXT_SIZE_BYTES + 1);
    const result = makeSearchResult([bigChunk, "trailing chunk"]);
    const smallResult = makeSearchResult(["a small chunk"]);

    const offloaded = await offloadLargeSearchResultChunks(auth, runContext, [
      result,
      smallResult,
    ]);

    expect(offloaded).toHaveLength(2);

    // The oversized result is slimmed to a single snippet chunk with an archive pointer, while
    // its citation metadata is preserved.
    const [slimmed, untouched] = offloaded;
    expect(slimmed.chunks).toHaveLength(1);
    expect(slimmed.chunks[0]).toContain("... (truncated)");
    expect(slimmed.chunks[0]).toContain(
      `[Full content archived at conversation-${conversation.sId}/${TOOL_OUTPUTS_FOLDER_NAME}/`
    );
    expect(slimmed.chunks[0].length).toBeLessThan(
      FILE_OFFLOAD_SNIPPET_LENGTH + 256
    );
    expect(slimmed.ref).toBe(result.ref);
    expect(slimmed.uri).toBe(result.uri);

    // The small result is untouched.
    expect(untouched).toEqual(smallResult);

    // The full joined chunks were written to the .tool_outputs folder.
    const write = fileStorageMock.saveFileCalls.find((call) =>
      call.filePath.includes(`${TOOL_OUTPUTS_FOLDER_NAME}/`)
    );
    expect(write).toBeDefined();
    expect(write?.filePath).toMatch(
      new RegExp(`${TOOL_OUTPUTS_FOLDER_NAME}/\\d+_my_document\\.txt$`)
    );
    expect(write?.content.toString()).toContain("trailing chunk");
  });
});
