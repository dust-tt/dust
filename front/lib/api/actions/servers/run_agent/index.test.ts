import { InMemoryWithAuthTransport } from "@app/lib/actions/mcp_internal_actions/in_memory_with_auth_transport";
import createAgentDelegationServer from "@app/lib/api/actions/servers/agent_delegation";
import createRunAgentServer from "@app/lib/api/actions/servers/run_agent";
import {
  archiveAgentConfiguration,
  getAgentConfiguration,
} from "@app/lib/api/assistant/configuration/agent";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import {
  makeExtra,
  setupPlainConversation,
} from "@app/tests/utils/conversation_test_factories";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import assert from "assert";
import { describe, expect, it } from "vitest";

describe("unavailable child agents", () => {
  it.each([
    "generic",
    "configured",
  ] as const)("identifies an archived agent by its latest name through the %s tool", async (toolKind) => {
    const { auth, conversation } = await setupPlainConversation();
    const workspace = auth.getNonNullableWorkspace();
    const childAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "OldName",
    });
    await AgentConfigurationFactory.updateTestAgent(auth, childAgent.sId, {
      name: "ArchivedHelper",
    });
    await archiveAgentConfiguration(auth, childAgent.sId);

    const { runContext } = makeExtra(auth, conversation);
    const { action, agentMessage } =
      await AgentMCPActionFactory.createWithAgentMessage(auth, {
        workspace,
        conversation: runContext.conversation,
      });
    const parentAgent = await getAgentConfiguration(auth, {
      agentId: agentMessage.configuration.sId,
      variant: "full",
    });
    assert(parentAgent);
    const toolContext = {
      runContext: {
        ...runContext,
        agentConfiguration: parentAgent,
        agentMessage,
        toolConfiguration: {
          ...action.toolConfiguration,
          childAgentId: childAgent.sId,
        },
      },
    };
    const server =
      toolKind === "generic"
        ? await createAgentDelegationServer(auth, toolContext)
        : await createRunAgentServer(auth, toolContext);
    const client = new Client({ name: "run-agent-test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryWithAuthTransport.createLinkedPair();

    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe(
        toolKind === "generic" ? "run_agent" : "run_ArchivedHelper"
      );

      const result = await client.callTool({
        name: tools[0].name,
        arguments: {
          description: "Ask the child agent",
          query: "Help with this task",
          ...(toolKind === "generic"
            ? { agentId: childAgent.sId }
            : {
                childAgent: {
                  uri: `agent://dust/w/${workspace.sId}/agents/${childAgent.sId}`,
                  mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.AGENT,
                },
              }),
        },
      });
      expect(result).toMatchObject({
        isError: true,
        content: [
          {
            type: "text",
            text: expect.stringContaining(
              "Agent @ArchivedHelper is archived and cannot be run."
            ),
          },
        ],
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("does not resolve child-agent metadata from another workspace", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const { authenticator: otherAuth } = await createResourceTest({
      role: "admin",
    });

    const metadata = await AgentResource.fetchLatestMetadataById(
      otherAuth,
      agent.sId
    );
    expect(metadata).toBeNull();
  });
});
