import * as wakeUpClient from "@app/temporal/triggers/wakeup_client";
import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import { cancelConversationWakeUpPlugin } from "@app/lib/api/poke/plugins/conversations/cancel_wakeup";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { WakeUpFactory } from "@app/tests/utils/WakeUpFactory";
import { Ok } from "@app/types/shared/result";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { beforeEach, describe, expect, it, vi } from "vitest";

async function setup() {
  const { authenticator: auth } = await createResourceTest({ role: "admin" });
  const agent = await AgentConfigurationFactory.createTestAgent(auth);
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agent.sId,
    messagesCreatedAt: [new Date()],
  });

  return { auth, agent, conversation };
}

describe("cancelConversationWakeUpPlugin", () => {
  beforeEach(() => {
    vi.spyOn(wakeUpClient, "cancelWakeUpTemporalWorkflow").mockResolvedValue(
      new Ok(undefined)
    );
  });

  it("registers the plugin", () => {
    expect(pluginManager.getPluginById("cancel-conversation-wakeup")).toBe(
      cancelConversationWakeUpPlugin
    );
  });

  it("cancels the active conversation wake-up", async () => {
    const { auth, agent, conversation } = await setup();
    const wakeUp = await WakeUpFactory.cron(auth, conversation, agent);

    await expect(
      cancelConversationWakeUpPlugin.isApplicableTo(auth, conversation)
    ).resolves.toBe(true);

    const result = await cancelConversationWakeUpPlugin.execute(
      auth,
      conversation,
      {}
    );

    expect(result.isOk()).toBe(true);
    expect(wakeUp.status).toBe("cancelled");
  });

  it("is not applicable without an active wake-up", async () => {
    const { auth, conversation } = await setup();

    await expect(
      cancelConversationWakeUpPlugin.isApplicableTo(auth, conversation)
    ).resolves.toBe(false);
  });
});
