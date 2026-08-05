import { buildServerSideMCPServerConfiguration } from "@app/lib/actions/configuration/helpers";
import { tryListMCPTools } from "@app/lib/actions/mcp_actions";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { describe, expect, it } from "vitest";

// Lists the tools an agent sees when answering `content`, from a server that mixes tools running
// without approval with tools that ask for one.
async function listedToolNames({
  authorless,
}: {
  authorless: boolean;
}): Promise<string[]> {
  const { authenticator, globalSpace, workspace } = await createResourceTest({
    role: "admin",
  });

  const agentConfiguration = await AgentConfigurationFactory.createTestAgent(
    authenticator,
    { name: "Test Agent", description: "Test Agent" }
  );

  // schedules_management lists `list_schedules` at `never_ask` and `create_schedule` behind an
  // approval.
  const internalServer = await InternalMCPServerInMemoryResource.makeNew(
    authenticator,
    { name: "schedules_management", useCase: null }
  );
  const view = await MCPServerViewFactory.create(
    workspace,
    internalServer.id,
    globalSpace
  );

  const conversation = await ConversationFactory.create(authenticator, {
    agentConfigurationId: agentConfiguration.sId,
    messagesCreatedAt: [],
  });
  const { agentMessage } = await ConversationFactory.createAgentMessage(
    authenticator,
    { workspace, conversation, agentConfig: agentConfiguration }
  );
  const { userMessage } = await ConversationFactory.createUserMessage({
    auth: authenticator,
    workspace,
    conversation,
    content: "Hello",
    // The agent message factory sits at rank 0.
    rank: 1,
    authorless,
  });

  const serverToolsAndInstructions = await tryListMCPTools(
    authenticator,
    {
      agentConfiguration,
      agentMessage,
      userMessage,
      clientSideActionConfigurations: [],
      conversation,
    },
    {
      jitServers: [
        buildServerSideMCPServerConfiguration({ mcpServerView: view }),
      ],
      skillServers: [],
      systemSkillServers: [],
    }
  );

  return serverToolsAndInstructions.flatMap(({ tools }) =>
    tools.map(({ originalName }) => originalName)
  );
}

describe("tryListMCPTools approval-requiring tools", () => {
  it("lists them when a person wrote the message", async () => {
    const toolNames = await listedToolNames({ authorless: false });

    expect(toolNames).toContain("list_schedules");
    expect(toolNames).toContain("create_schedule");
  });

  it("leaves them out for a message nobody wrote", async () => {
    const toolNames = await listedToolNames({ authorless: true });

    expect(toolNames).toContain("list_schedules");
    expect(toolNames).not.toContain("create_schedule");
  });
});
