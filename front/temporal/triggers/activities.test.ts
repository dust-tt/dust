import { createConversation } from "@app/lib/api/assistant/conversation";
import { WakeUpModel } from "@app/lib/resources/storage/models/wakeup";
import { WakeUpResource } from "@app/lib/resources/wakeup_resource";
import {
  expireWakeUpActivity,
  runWakeUpActivity,
} from "@app/temporal/triggers/activities";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

const MISSING_WAKE_UP_MODEL_ID = 9_000_000_000;

describe("wake-up activities", () => {
  it("skips terminal wake-ups without failing the activity", async () => {
    const { authenticator, user, workspace } = await createResourceTest({
      role: "builder",
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
    const { workspace } = await createResourceTest({ role: "builder" });
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
