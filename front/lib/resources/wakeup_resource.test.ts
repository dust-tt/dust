import { Authenticator } from "@app/lib/auth";
import { WakeUpResource } from "@app/lib/resources/wakeup_resource";
import * as wakeUpClient from "@app/temporal/triggers/wakeup_client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
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

describe("WakeUpResource.listByUserWithTotalCount", () => {
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

    const { wakeUps, totalCount } =
      await WakeUpResource.listByUserWithTotalCount(
        authenticator,
        authenticator.getNonNullableUser(),
        { limit: 10, offset: 0 }
      );

    expect(totalCount).toBe(2);
    expect(wakeUps.map((w) => w.sId)).toEqual([newer.sId, older.sId]);
  });

  it("filters on status and counts only the matching wake-ups", async () => {
    const { agentConfiguration, authenticator, conversation } = await setup();

    const scheduled = await WakeUpFactory.cron(
      authenticator,
      conversation,
      agentConfiguration
    );
    const cancelled = await WakeUpFactory.cron(
      authenticator,
      conversation,
      agentConfiguration
    );
    await cancelled.markCancelled(authenticator);

    const { wakeUps, totalCount } =
      await WakeUpResource.listByUserWithTotalCount(
        authenticator,
        authenticator.getNonNullableUser(),
        { limit: 10, offset: 0, status: "scheduled" }
      );

    expect(totalCount).toBe(1);
    expect(wakeUps.map((w) => w.sId)).toEqual([scheduled.sId]);
  });

  it("pages with limit/offset while totalCount stays the full count", async () => {
    const { agentConfiguration, authenticator, conversation } = await setup();

    await WakeUpFactory.cron(authenticator, conversation, agentConfiguration);
    const newer = await WakeUpFactory.cron(
      authenticator,
      conversation,
      agentConfiguration
    );

    const firstPage = await WakeUpResource.listByUserWithTotalCount(
      authenticator,
      authenticator.getNonNullableUser(),
      { limit: 1, offset: 0 }
    );
    const secondPage = await WakeUpResource.listByUserWithTotalCount(
      authenticator,
      authenticator.getNonNullableUser(),
      { limit: 1, offset: 1 }
    );

    expect(firstPage.totalCount).toBe(2);
    expect(secondPage.totalCount).toBe(2);
    expect(firstPage.wakeUps.map((w) => w.sId)).toEqual([newer.sId]);
    expect(secondPage.wakeUps).toHaveLength(1);
    expect(secondPage.wakeUps[0].sId).not.toBe(newer.sId);
  });

  it("does not return the wake-ups of another member of the workspace", async () => {
    const { agentConfiguration, authenticator, conversation, workspace } =
      await setup();

    const mine = await WakeUpFactory.cron(
      authenticator,
      conversation,
      agentConfiguration
    );

    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, { role: "user" });
    const otherAuthenticator = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      workspace.sId
    );
    const otherConversation = await ConversationFactory.create(
      otherAuthenticator,
      {
        agentConfigurationId: agentConfiguration.sId,
        messagesCreatedAt: [new Date()],
      }
    );
    await WakeUpFactory.cron(
      otherAuthenticator,
      otherConversation,
      agentConfiguration
    );

    const { wakeUps, totalCount } =
      await WakeUpResource.listByUserWithTotalCount(
        authenticator,
        authenticator.getNonNullableUser(),
        { limit: 10, offset: 0 }
      );

    expect(totalCount).toBe(1);
    expect(wakeUps.map((w) => w.sId)).toEqual([mine.sId]);
  });
});
