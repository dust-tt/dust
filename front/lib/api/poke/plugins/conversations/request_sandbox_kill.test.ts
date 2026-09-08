import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import { requestConversationSandboxKillPlugin } from "@app/lib/api/poke/plugins/conversations/request_sandbox_kill";
import { wakeConversationSandboxPlugin } from "@app/lib/api/poke/plugins/conversations/wake_sandbox";
import { ConversationSandboxAdapter } from "@app/lib/resources/conversation_sandbox_adapter";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SandboxFactory } from "@app/tests/utils/SandboxFactory";
import { describe, expect, it } from "vitest";

async function setup() {
  const { authenticator: auth } = await createResourceTest({ role: "admin" });
  const agent = await AgentConfigurationFactory.createTestAgent(auth);
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agent.sId,
    messagesCreatedAt: [],
  });

  return { auth, conversation };
}

describe("requestConversationSandboxKillPlugin", () => {
  it("registers both conversation sandbox plugins", () => {
    expect(
      pluginManager.getPluginById("request-conversation-sandbox-kill")
    ).toBe(requestConversationSandboxKillPlugin);
    expect(pluginManager.getPluginById("wake-conversation-sandbox")).toBe(
      wakeConversationSandboxPlugin
    );
  });

  it("requests a kill for the conversation sandbox", async () => {
    const { auth, conversation } = await setup();
    await SandboxFactory.create(auth, conversation);

    const result = await requestConversationSandboxKillPlugin.execute(
      auth,
      conversation,
      {}
    );

    expect(result.isOk()).toBe(true);
    const sandbox = await ConversationSandboxAdapter.fetchSandbox(
      auth,
      conversation
    );
    expect(sandbox?.killRequestedAt).toEqual(expect.any(Date));
  });

  it("is not applicable without a live sandbox", async () => {
    const { auth, conversation } = await setup();

    await expect(
      requestConversationSandboxKillPlugin.isApplicableTo(auth, conversation)
    ).resolves.toBe(false);

    await SandboxFactory.create(auth, conversation, { status: "deleted" });

    await expect(
      requestConversationSandboxKillPlugin.isApplicableTo(auth, conversation)
    ).resolves.toBe(false);
  });

  it("is not applicable when a kill is already requested", async () => {
    const { auth, conversation } = await setup();
    await SandboxFactory.create(auth, conversation, {
      killRequestedAt: new Date(),
    });

    await expect(
      requestConversationSandboxKillPlugin.isApplicableTo(auth, conversation)
    ).resolves.toBe(false);
  });
});
