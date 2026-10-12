import { buildServerSideMCPServerConfiguration } from "@app/lib/actions/configuration/helpers";
import { tryListMCPTools } from "@app/lib/actions/mcp_actions";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { describe, expect, it } from "vitest";

// Lists the tools an agent sees when answering `content`, with a single
// personal-actions MCP server configured.
async function listedServerNames({
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

  // google_calendar is OAuth-backed, so an admin can scope it to personal
  // credentials.
  const internalServer = await InternalMCPServerInMemoryResource.makeNew(
    authenticator,
    { name: "google_calendar", useCase: "personal_actions" }
  );
  const view = await MCPServerViewFactory.create(
    workspace,
    internalServer.id,
    globalSpace
  );
  const updateRes = await view.updateOAuthUseCase(
    authenticator,
    "personal_actions"
  );
  if (updateRes.isErr()) {
    throw new Error("Expected the OAuth use case update to succeed.");
  }

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

  return serverToolsAndInstructions.map(({ serverName }) => serverName);
}

describe("tryListMCPTools personal-actions servers", () => {
  it("lists a personal-actions server when a person wrote the message", async () => {
    expect(await listedServerNames({ authorless: false })).toContain(
      "google_calendar"
    );
  });

  it("leaves it out for a message nobody wrote", async () => {
    expect(await listedServerNames({ authorless: true })).not.toContain(
      "google_calendar"
    );
  });
});
