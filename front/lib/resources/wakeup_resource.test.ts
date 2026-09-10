import { WakeUpResource } from "@app/lib/resources/wakeup_resource";
import * as wakeUpClient from "@app/temporal/triggers/wakeup_client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { WakeUpFactory } from "@app/tests/utils/WakeUpFactory";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

async function setup() {
  const { authenticator, workspace } = await createResourceTest({
    role: "user",
  });

  const agentConfiguration =
    await AgentConfigurationFactory.createTestAgent(authenticator);
  const conversation = await ConversationFactory.create(authenticator, {
    agentConfigurationId: agentConfiguration.sId,
    messagesCreatedAt: [new Date()],
  });

  return { agentConfiguration, authenticator, conversation, workspace };
}

describe("WakeUpResource.listByUser", () => {
  beforeEach(() => {
    vi.spyOn(
      wakeUpClient,
      "launchOrScheduleWakeUpTemporalWorkflow"
    ).mockResolvedValue(new Ok(undefined));
    vi.spyOn(wakeUpClient, "cancelWakeUpTemporalWorkflow").mockResolvedValue(
      new Ok(undefined)
    );
  });

  it("returns the user's wake-ups, newest first", async () => {
    const { agentConfiguration, authenticator, conversation } = await setup();

    const older = await WakeUpFactory.cron(
      authenticator,
      conversation,
      agentConfiguration,
      { reason: "older" }
    );
    const newer = await WakeUpFactory.cron(
      authenticator,
      conversation,
      agentConfiguration,
      { reason: "newer" }
    );

    const wakeUps = await WakeUpResource.listByUser(
      authenticator,
      authenticator.getNonNullableUser()
    );

    expect(wakeUps.map((w) => w.sId)).toEqual([newer.sId, older.sId]);
  });
});
