import {
  getActivationNudgeFrequencyCapDays,
  getActivationNudgeMaxUnansweredCount,
  isEligibleForNudge,
} from "@app/lib/api/activation/nudge";
import { Authenticator } from "@app/lib/auth";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import {
  DEFAULT_ACTIVATION_NUDGE_FREQUENCY_CAP_DAYS,
  DEFAULT_ACTIVATION_NUDGE_MAX_UNANSWERED_COUNT,
} from "@app/temporal/activation_scheduler/config";
import { ActivationNudgeFactory } from "@app/tests/utils/ActivationNudgeFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { describe, expect, it } from "vitest";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("getActivationNudgeFrequencyCapDays", () => {
  it("falls back to the default when the workspace has no override", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    expect(getActivationNudgeFrequencyCapDays(authenticator)).toBe(
      DEFAULT_ACTIVATION_NUDGE_FREQUENCY_CAP_DAYS
    );
  });

  it("uses the workspace-configured override when valid", async () => {
    const { workspace } = await createResourceTest({
      role: "admin",
    });
    await WorkspaceResource.updateMetadata(workspace.id, {
      activationNudgeFrequencyCapDays: 30,
    });
    const refreshedAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    expect(getActivationNudgeFrequencyCapDays(refreshedAuth)).toBe(30);
  });

  it("falls back to the default when the override is not a number", async () => {
    const { workspace } = await createResourceTest({
      role: "admin",
    });
    await WorkspaceResource.updateMetadata(workspace.id, {
      activationNudgeFrequencyCapDays: "not-a-number",
    });
    const refreshedAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    expect(getActivationNudgeFrequencyCapDays(refreshedAuth)).toBe(
      DEFAULT_ACTIVATION_NUDGE_FREQUENCY_CAP_DAYS
    );
  });
});

describe("isEligibleForNudge", () => {
  it("is eligible when the pod has never been nudged", async () => {
    const { authenticator, globalSpace } = await createResourceTest({
      role: "admin",
    });

    expect(await isEligibleForNudge(authenticator, globalSpace)).toBe(true);
  });

  it("is not eligible right after a nudge, within the cap window", async () => {
    const { authenticator, globalSpace } = await createResourceTest({
      role: "admin",
    });
    const trigger = await TriggerFactory.webhook(authenticator, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    });
    await ActivationNudgeFactory.create(authenticator, {
      pod: globalSpace,
      trigger,
    });

    expect(await isEligibleForNudge(authenticator, globalSpace)).toBe(false);
  });

  it("is not eligible once the max unanswered nudge count is reached, even outside the cap window", async () => {
    const { workspace, user, globalSpace } = await createResourceTest({
      role: "admin",
    });
    await WorkspaceResource.updateMetadata(workspace.id, {
      activationNudgeMaxUnansweredCount: 2,
    });
    const refreshedAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const trigger = await TriggerFactory.webhook(refreshedAuth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    });

    // Two nudges, both outside the frequency cap window, with no reply.
    await ActivationNudgeFactory.create(refreshedAuth, {
      pod: globalSpace,
      trigger,
      createdAt: new Date(Date.now() - 10 * DAY_MS),
    });
    await ActivationNudgeFactory.create(refreshedAuth, {
      pod: globalSpace,
      trigger,
      createdAt: new Date(Date.now() - 5 * DAY_MS),
    });

    expect(await isEligibleForNudge(refreshedAuth, globalSpace)).toBe(false);
  });

  it("is eligible again once the user replies after the most recent nudge", async () => {
    const { workspace, user, globalSpace } = await createResourceTest({
      role: "admin",
    });
    await WorkspaceResource.updateMetadata(workspace.id, {
      activationNudgeMaxUnansweredCount: 2,
    });
    const refreshedAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const trigger = await TriggerFactory.webhook(refreshedAuth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    });

    await ActivationNudgeFactory.create(refreshedAuth, {
      pod: globalSpace,
      trigger,
      createdAt: new Date(Date.now() - 10 * DAY_MS),
    });
    await ActivationNudgeFactory.create(refreshedAuth, {
      pod: globalSpace,
      trigger,
      createdAt: new Date(Date.now() - 5 * DAY_MS),
    });

    // The user replied in the conversation created by the trigger firing.
    const conversation = await ConversationFactory.create(refreshedAuth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      spaceId: globalSpace.id,
      messagesCreatedAt: [new Date(Date.now() - 4 * DAY_MS)],
    });
    await ConversationFactory.setTriggerIdForTest(
      conversation.id,
      workspace.id,
      trigger.id
    );

    expect(await isEligibleForNudge(refreshedAuth, globalSpace)).toBe(true);
  });
});

describe("getActivationNudgeMaxUnansweredCount", () => {
  it("falls back to the default when the workspace has no override", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    expect(getActivationNudgeMaxUnansweredCount(authenticator)).toBe(
      DEFAULT_ACTIVATION_NUDGE_MAX_UNANSWERED_COUNT
    );
  });

  it("uses the workspace-configured override when valid", async () => {
    const { workspace } = await createResourceTest({ role: "admin" });
    await WorkspaceResource.updateMetadata(workspace.id, {
      activationNudgeMaxUnansweredCount: 5,
    });
    const refreshedAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    expect(getActivationNudgeMaxUnansweredCount(refreshedAuth)).toBe(5);
  });

  it("falls back to the default when the override is not a number", async () => {
    const { workspace } = await createResourceTest({ role: "admin" });
    await WorkspaceResource.updateMetadata(workspace.id, {
      activationNudgeMaxUnansweredCount: "not-a-number",
    });
    const refreshedAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    expect(getActivationNudgeMaxUnansweredCount(refreshedAuth)).toBe(
      DEFAULT_ACTIVATION_NUDGE_MAX_UNANSWERED_COUNT
    );
  });
});
