import { beforeEach, describe, expect, it, vi } from "vitest";

// Prevent the Temporal child-tool workflow from actually starting.
vi.mock(import("@app/temporal/agent_loop/client"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    launchSandboxChildToolWorkflow: vi.fn().mockResolvedValue(undefined),
  };
});

// The blocked path publishes the approval event to Redis; keep it out of tests.
vi.mock(
  import("@app/temporal/agent_loop/activities/common"),
  async (importOriginal) => {
    const mod = await importOriginal();
    return {
      ...mod,
      updateResourceAndPublishEvent: vi.fn().mockResolvedValue(undefined),
    };
  }
);

import { TOOL_NAME_SEPARATOR } from "@app/lib/actions/constants";
import type { LightMCPToolConfigurationType } from "@app/lib/actions/mcp";
import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { createSandboxChildAction } from "@app/lib/api/sandbox/create_child_action";
import { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { RemoteMCPServerToolMetadataResource } from "@app/lib/resources/remote_mcp_server_tool_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { launchSandboxChildToolWorkflow } from "@app/temporal/agent_loop/client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPServerConfigurationFactory } from "@app/tests/utils/AgentMCPServerConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type {
  AgentMessageType,
  ConversationType,
} from "@app/types/assistant/conversation";
import { slugify } from "@app/types/shared/utils/string_utils";
import type { WorkspaceType } from "@app/types/user";

const TOOL_NAME = "tool";

describe("createSandboxChildAction", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let agentConfig: AgentConfigurationType;
  let conversation: ConversationType;
  let agentMessage: AgentMessageType;
  let view: MCPServerViewResource;
  let serverSId: string;
  let parentActionId: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    const setup = await createResourceTest({ role: "admin" });
    workspace = setup.workspace;
    auth = setup.authenticator;

    const server = await RemoteMCPServerFactory.create(workspace, {
      tools: [
        {
          name: TOOL_NAME,
          description: "Tool description",
          inputSchema: undefined,
        },
      ],
    });
    serverSId = server.sId;
    view = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      setup.globalSpace
    );

    agentConfig = await AgentConfigurationFactory.createTestAgent(auth);
    await AgentMCPServerConfigurationFactory.create(auth, setup.globalSpace, {
      agent: agentConfig,
      mcpServerView: view,
    });

    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date()],
    });
    const conversationResult = await getConversation(auth, conversation.sId);
    if (conversationResult.isErr()) {
      throw conversationResult.error;
    }
    const foundAgentMessage = conversationResult.value.content
      .flat()
      .find((m): m is AgentMessageType => m.type === "agent_message");
    if (!foundAgentMessage) {
      throw new Error("Expected an agent message in the test conversation.");
    }
    agentMessage = foundAgentMessage;

    // Parent sandbox bash action whose step content carries the sandbox tool
    // function-call name, as in production.
    const stepContent = await AgentStepContentResource.createNewVersion({
      workspaceId: workspace.id,
      agentMessageId: agentMessage.agentMessageId,
      step: 0,
      index: 0,
      type: "function_call",
      value: {
        type: "function_call",
        value: {
          id: generateRandomModelSId(),
          name: "sandbox__bash",
          arguments: "{}",
        },
      },
    });
    const parentToolConfiguration: LightMCPToolConfigurationType = {
      id: 1,
      sId: generateRandomModelSId(),
      type: "mcp_configuration",
      name: "sandbox__bash",
      dataSources: null,
      tables: null,
      childAgentId: null,
      timeFrame: null,
      jsonSchema: null,
      additionalConfiguration: {},
      mcpServerViewId: "sandbox-server-view",
      dustAppConfiguration: null,
      secretName: null,
      dustProject: null,
      internalMCPServerId: null,
      availability: "manual",
      permission: "never_ask",
      toolServerId: "sandbox-server",
      retryPolicy: "no_retry",
      originalName: "bash",
      mcpServerName: "sandbox",
    };
    const parentAction = await AgentMCPActionResource.makeNew(
      auth,
      { conversation: conversationResult.value, stepContent },
      {
        agentMessageId: agentMessage.agentMessageId,
        augmentedInputs: {},
        citationsAllocated: 0,
        mcpServerConfigurationId: generateRandomModelSId(),
        status: "running",
        stepContentId: stepContent.id,
        stepContext: {
          citationsCount: 0,
          citationsOffset: 0,
          resumeState: null,
          retrievalTopK: 10,
          websearchResultCount: 5,
        },
        toolConfiguration: parentToolConfiguration,
      }
    );
    parentActionId = parentAction.sId;
  });

  async function callChildTool(
    rawInputs: Record<string, unknown> = { objectName: "Contact" },
    { serverViewId = view.sId }: { serverViewId?: string } = {}
  ) {
    return createSandboxChildAction(auth, {
      parentActionId,
      agentId: agentConfig.sId,
      conversationId: conversation.sId,
      agentMessageId: agentMessage.sId,
      serverViewId,
      toolName: TOOL_NAME,
      rawInputs,
    });
  }

  async function setToolPermission(
    permission: "medium" | "never_ask",
    { enabled = true }: { enabled?: boolean } = {}
  ) {
    await RemoteMCPServerToolMetadataResource.updateOrCreateSettings(auth, {
      serverSId,
      toolName: TOOL_NAME,
      permission,
      enabled,
    });
  }

  // Resolves the function-call name the model sees on direct calls for this
  // tool, going through the same agent configuration the child path uses.
  async function getDirectCallToolName(): Promise<string> {
    const fullConfig = await getAgentConfiguration(auth, {
      agentId: agentConfig.sId,
      variant: "full",
    });
    const serverConfig = fullConfig?.actions
      .filter(isServerSideMCPServerConfiguration)
      .find((a) => a.mcpServerViewId === view.sId);
    if (!serverConfig) {
      throw new Error("Expected the MCP server to be attached to the agent.");
    }
    return getPrefixedToolName(serverConfig.name, TOOL_NAME);
  }

  it("blocks medium-stake tools when the user has no matching approval", async () => {
    await setToolPermission("medium");

    const result = await callChildTool();

    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value.pauseSandbox).toBeDefined();

    const child = await AgentMCPActionResource.fetchById(
      auth,
      result.value.actionId
    );
    expect(child?.status).toBe("blocked_validation_required");
    expect(child?.toolConfiguration.permission).toBe("medium");
    expect(vi.mocked(launchSandboxChildToolWorkflow)).not.toHaveBeenCalled();
  });

  it("auto-approves medium-stake tools when an approval recorded on a direct call exists", async () => {
    await setToolPermission("medium");

    // Approvals are keyed on the prefixed function-call name; this is what a
    // prior "always approve" on a direct (non-sandbox) call records.
    const directCallToolName = await getDirectCallToolName();
    await auth.getNonNullableUser().createToolApproval(auth, {
      mcpServerId: serverSId,
      toolName: directCallToolName,
      agentId: agentConfig.sId,
      argsAndValues: {},
    });

    const result = await callChildTool();

    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value.pauseSandbox).toBeUndefined();

    const child = await AgentMCPActionResource.fetchById(
      auth,
      result.value.actionId
    );
    expect(child?.status).toBe("ready_allowed_implicitly");
    // The child configuration must carry the same function-call name as direct
    // calls so approval checks and recordings share one key.
    expect(child?.toolConfiguration.name).toBe(directCallToolName);
    expect(child?.toolConfiguration.originalName).toBe(TOOL_NAME);
    expect(vi.mocked(launchSandboxChildToolWorkflow)).toHaveBeenCalledTimes(1);
  });

  it("runs never_ask tools without requesting approval", async () => {
    await setToolPermission("never_ask");

    const result = await callChildTool();

    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value.pauseSandbox).toBeUndefined();

    const child = await AgentMCPActionResource.fetchById(
      auth,
      result.value.actionId
    );
    expect(child?.status).toBe("ready_allowed_implicitly");
    expect(vi.mocked(launchSandboxChildToolWorkflow)).toHaveBeenCalledTimes(1);
  });

  it("keys approvals on the space-disambiguated name when same-named servers are attached", async () => {
    await setToolPermission("medium");

    // Attach a second view of the same server from another space. The direct
    // path space-prefixes both colliding config names before prefixing tools,
    // so approval keys carry the space name.
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const otherSpace = await SpaceFactory.regular(workspace);
    const refreshedOtherSpace = await SpaceResource.fetchById(
      adminAuth,
      otherSpace.sId
    );
    if (!refreshedOtherSpace) {
      throw new Error("Expected the other space to exist.");
    }
    await refreshedOtherSpace.addMembers(adminAuth, {
      userIds: [auth.getNonNullableUser().sId],
    });
    const otherView = await MCPServerViewFactory.create(
      workspace,
      serverSId,
      refreshedOtherSpace
    );
    await AgentMCPServerConfigurationFactory.create(auth, refreshedOtherSpace, {
      agent: agentConfig,
      mcpServerView: otherView,
    });
    // Refresh auth so the new space membership is visible to the child path.
    auth = await Authenticator.fromUserIdAndWorkspaceId(
      auth.getNonNullableUser().sId,
      workspace.sId
    );

    const fullConfig = await getAgentConfiguration(auth, {
      agentId: agentConfig.sId,
      variant: "full",
    });
    const rawConfigName = fullConfig?.actions
      .filter(isServerSideMCPServerConfiguration)
      .find((a) => a.mcpServerViewId === otherView.sId)?.name;
    if (!rawConfigName) {
      throw new Error("Expected the second MCP server view on the agent.");
    }
    const disambiguatedKey = getPrefixedToolName(
      `${slugify(refreshedOtherSpace.name)}${TOOL_NAME_SEPARATOR}${rawConfigName}`,
      TOOL_NAME
    );

    await auth.getNonNullableUser().createToolApproval(auth, {
      mcpServerId: serverSId,
      toolName: disambiguatedKey,
      agentId: agentConfig.sId,
      argsAndValues: {},
    });

    const result = await callChildTool(undefined, {
      serverViewId: otherView.sId,
    });
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value.pauseSandbox).toBeUndefined();

    const child = await AgentMCPActionResource.fetchById(
      auth,
      result.value.actionId
    );
    expect(child?.status).toBe("ready_allowed_implicitly");
    expect(child?.toolConfiguration.name).toBe(disambiguatedKey);
  });

  it("rejects tools disabled by an admin", async () => {
    await setToolPermission("never_ask", { enabled: false });

    const result = await callChildTool();

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected the disabled tool call to fail.");
    }
    expect(result.error.message).toBe(
      "Tool is not available to this agent or conversation."
    );
    expect(vi.mocked(launchSandboxChildToolWorkflow)).not.toHaveBeenCalled();
  });

  it("defaults to high stake and blocks when the tool has no configured permission", async () => {
    const result = await callChildTool();

    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value.pauseSandbox).toBeDefined();

    const child = await AgentMCPActionResource.fetchById(
      auth,
      result.value.actionId
    );
    expect(child?.status).toBe("blocked_validation_required");
    expect(child?.toolConfiguration.permission).toBe("high");
  });
});
