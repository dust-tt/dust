import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import { sleepConversationSandboxPlugin } from "@app/lib/api/poke/plugins/conversations/sleep_sandbox";
import { ConversationSandboxAdapter } from "@app/lib/resources/conversation_sandbox_adapter";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SandboxFactory } from "@app/tests/utils/SandboxFactory";
import { Ok } from "@app/types/shared/result";
import { describe, expect, it, vi } from "vitest";

async function setup() {
  const { authenticator: auth } = await createResourceTest({ role: "admin" });
  const agent = await AgentConfigurationFactory.createTestAgent(auth);
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agent.sId,
    messagesCreatedAt: [],
  });

  return { auth, conversation };
}

describe("sleepConversationSandboxPlugin", () => {
  it("is registered", () => {
    expect(pluginManager.getPluginById("sleep-conversation-sandbox")).toBe(
      sleepConversationSandboxPlugin
    );
  });

  it("is applicable only to an unmarked running sandbox", async () => {
    const { auth, conversation } = await setup();

    await expect(
      sleepConversationSandboxPlugin.isApplicableTo(auth, conversation)
    ).resolves.toBe(false);

    const sandbox = await SandboxFactory.create(auth, conversation);

    await expect(
      sleepConversationSandboxPlugin.isApplicableTo(auth, conversation)
    ).resolves.toBe(true);

    await sandbox.requestKill();

    await expect(
      sleepConversationSandboxPlugin.isApplicableTo(auth, conversation)
    ).resolves.toBe(false);
  });

  it("sleeps a running sandbox through the adapter", async () => {
    const { auth, conversation } = await setup();
    const sandbox = await SandboxFactory.create(auth, conversation);
    const sleepSpy = vi
      .spyOn(ConversationSandboxAdapter, "dangerouslySleepSandboxIfRunning")
      .mockImplementation(async () => {
        await sandbox.updateStatus("sleeping");
        return new Ok(undefined);
      });

    const result = await sleepConversationSandboxPlugin.execute(
      auth,
      conversation,
      {}
    );

    expect(sleepSpy).toHaveBeenCalledOnce();
    expect(result.isOk() && result.value).toEqual({
      display: "text",
      value: "Sandbox is now sleeping.",
    });
    sleepSpy.mockRestore();
  });

  it("refuses to sleep a sandbox that is not running", async () => {
    const { auth, conversation } = await setup();
    await SandboxFactory.create(auth, conversation, { status: "sleeping" });
    const sleepSpy = vi.spyOn(
      ConversationSandboxAdapter,
      "dangerouslySleepSandboxIfRunning"
    );

    const result = await sleepConversationSandboxPlugin.execute(
      auth,
      conversation,
      {}
    );

    expect(result.isErr()).toBe(true);
    expect(sleepSpy).not.toHaveBeenCalled();
    sleepSpy.mockRestore();
  });
});
