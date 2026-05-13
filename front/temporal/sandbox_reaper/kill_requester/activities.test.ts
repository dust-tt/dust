import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SandboxFactory } from "@app/tests/utils/SandboxFactory";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { requestSandboxKillsActivity } from "@app/temporal/sandbox_reaper/kill_requester/activities";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@temporalio/activity", () => ({
  Context: {
    current: vi.fn(() => ({
      heartbeat: vi.fn(),
      info: { attempt: 1 },
      cancellationSignal: { aborted: false },
    })),
  },
}));

describe("requestSandboxKillsActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks matching rows and reports the count", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const agentConfig =
      await AgentConfigurationFactory.createTestAgent(authenticator);

    const [c1, c2] = await Promise.all([
      ConversationFactory.create(authenticator, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [new Date()],
      }),
      ConversationFactory.create(authenticator, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [new Date()],
      }),
    ]);

    await SandboxFactory.create(authenticator, c1, {
      baseImage: "dust-base",
      version: "1.0.0",
    });
    await SandboxFactory.create(authenticator, c2, {
      baseImage: "dust-base",
      version: "2.0.0",
    });

    const count = await requestSandboxKillsActivity({
      baseImage: "dust-base",
      version: "2.0.0",
    });

    expect(count).toBe(1);
    const marked = await SandboxResource.fetchByConversationId(
      authenticator,
      c1.sId
    );
    expect(marked?.killRequestedAt).not.toBeNull();
  });
});
