import { createConversation } from "@app/lib/api/assistant/conversation";
import { WakeUpModel } from "@app/lib/resources/storage/models/wakeup";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { WakeUpResource } from "@app/lib/resources/wakeup_resource";
import {
  expireWakeUpActivity,
  runTriggeredAgentsActivity,
  runWakeUpActivity,
} from "@app/temporal/triggers/activities";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockIsProgrammaticApiBlocked, mockPostUserMessage } = vi.hoisted(
  () => ({
    mockIsProgrammaticApiBlocked: vi.fn(),
    mockPostUserMessage: vi.fn(),
  })
);

vi.mock("@app/lib/api/credits/access_control", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@app/lib/api/credits/access_control")
  >()),
  isProgrammaticApiBlocked: mockIsProgrammaticApiBlocked,
}));

vi.mock("@app/lib/api/assistant/conversation", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@app/lib/api/assistant/conversation")
  >()),
  postUserMessage: mockPostUserMessage,
}));

vi.mock("@app/lib/temporal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/temporal")>()),
  getTemporalClientForAgentNamespace: vi.fn().mockResolvedValue({
    schedule: {
      getHandle: vi.fn().mockReturnValue({
        describe: vi.fn().mockResolvedValue({ info: { recentActions: [] } }),
        update: vi.fn(),
        delete: vi.fn(),
      }),
    },
  }),
}));

const MISSING_WAKE_UP_MODEL_ID = 9_000_000_000;
const MISSING_TRIGGER_MODEL_ID = 9_000_000_000;

// An enabled schedule trigger charged to the workspace pool, on a credit-priced
// workspace, so the programmatic monthly cap gate applies.
async function createProgrammaticScheduleTrigger() {
  const { authenticator, user, workspace } = await createResourceTest({
    role: "admin",
    plan: "creditPriced",
  });
  const agent = await AgentConfigurationFactory.createTestAgent(authenticator, {
    name: "Schedule Agent",
  });
  const trigger = await TriggerFactory.schedule(authenticator, {
    agentConfigurationId: agent.sId,
    status: "enabled",
    configuration: { cron: "0 9 * * *", timezone: "UTC" },
    executionMode: "workspace_pool",
  });

  return { user, workspace, trigger };
}

describe("runTriggeredAgentsActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsProgrammaticApiBlocked.mockResolvedValue(false);
    mockPostUserMessage.mockResolvedValue(new Ok(undefined));
  });

  it("skips missing triggers without failing the activity", async () => {
    const { user, workspace } = await createResourceTest({ role: "user" });
    const triggerId = TriggerResource.modelIdToSId({
      id: MISSING_TRIGGER_MODEL_ID,
      workspaceId: workspace.id,
    });

    await expect(
      runTriggeredAgentsActivity({
        userId: user.sId,
        workspaceId: workspace.sId,
        triggerId,
      })
    ).resolves.toBeUndefined();
  });

  it("skips missing users without failing the activity", async () => {
    const { workspace } = await createResourceTest({ role: "user" });
    const triggerId = TriggerResource.modelIdToSId({
      id: MISSING_TRIGGER_MODEL_ID,
      workspaceId: workspace.id,
    });

    await expect(
      runTriggeredAgentsActivity({
        userId: "usr_missing",
        workspaceId: workspace.sId,
        triggerId,
      })
    ).resolves.toBeUndefined();
  });

  it("stops workspace_pool runs without retrying when the programmatic monthly cap is reached", async () => {
    mockIsProgrammaticApiBlocked.mockResolvedValue(true);
    const { user, workspace, trigger } =
      await createProgrammaticScheduleTrigger();

    await expect(
      runTriggeredAgentsActivity({
        userId: user.sId,
        workspaceId: workspace.sId,
        triggerId: trigger.sId,
      })
    ).resolves.toBeUndefined();
    expect(mockPostUserMessage).not.toHaveBeenCalled();
  });

  it("posts the triggered message when the programmatic monthly cap is not reached", async () => {
    const { user, workspace, trigger } =
      await createProgrammaticScheduleTrigger();

    await expect(
      runTriggeredAgentsActivity({
        userId: user.sId,
        workspaceId: workspace.sId,
        triggerId: trigger.sId,
      })
    ).resolves.toBeUndefined();
    expect(mockPostUserMessage).toHaveBeenCalledTimes(1);
  });
});

describe("wake-up activities", () => {
  it("skips terminal wake-ups without failing the activity", async () => {
    const { authenticator, user, workspace } = await createResourceTest({
      role: "user",
    });
    const conversation = await createConversation(authenticator, {
      title: null,
      visibility: "unlisted",
      spaceId: null,
    });

    const wakeUp = await WakeUpModel.create({
      workspaceId: workspace.id,
      conversationId: conversation.id,
      userId: user.id,
      agentConfigurationId: "test-agent",
      scheduleType: "one_shot",
      fireAt: new Date(),
      cronExpression: null,
      cronTimezone: null,
      reason: "Already cancelled wake-up",
      status: "cancelled",
      fireCount: 0,
    });
    const wakeUpId = WakeUpResource.modelIdToSId({
      id: wakeUp.id,
      workspaceId: workspace.id,
    });

    await expect(
      runWakeUpActivity({ workspaceId: workspace.sId, wakeUpId })
    ).resolves.toBeUndefined();
  });

  it("skips missing wake-ups without failing the activity", async () => {
    const { workspace } = await createResourceTest({ role: "user" });
    const wakeUpId = WakeUpResource.modelIdToSId({
      id: MISSING_WAKE_UP_MODEL_ID,
      workspaceId: workspace.id,
    });

    await expect(
      runWakeUpActivity({ workspaceId: workspace.sId, wakeUpId })
    ).resolves.toBeUndefined();
    await expect(
      expireWakeUpActivity({ workspaceId: workspace.sId, wakeUpId })
    ).resolves.toBeUndefined();
  });
});
