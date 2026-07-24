import {
  getActivationNudgeFrequencyCapDays,
  getActivationNudgeMaxUnansweredCount,
  isEligibleForNudge,
} from "@app/lib/api/activation/nudge";
import { ACTIVATION_WEBHOOK_SOURCE_NAME } from "@app/lib/api/activation/trigger";
import { Authenticator } from "@app/lib/auth";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import {
  DEFAULT_ACTIVATION_NUDGE_FREQUENCY_CAP_DAYS,
  DEFAULT_ACTIVATION_NUDGE_MAX_UNANSWERED_COUNT,
} from "@app/temporal/activation_scheduler/config";
import { ActivationNudgeFactory } from "@app/tests/utils/ActivationNudgeFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import { WebhookSourceFactory } from "@app/tests/utils/WebhookSourceFactory";
import { WebhookSourceViewFactory } from "@app/tests/utils/WebhookSourceViewFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { TriggerStatus } from "@app/types/assistant/triggers";
import { describe, expect, it } from "vitest";

const DAY_MS = 24 * 60 * 60 * 1000;

// Wires a trigger the same way `createActivationTrigger` does in production
// (on the pod's own view of the shared Activation webhook source), plus the
// ActivationPod row `join_activation_pod.ts` creates alongside it. This is
// required for `isEligibleForNudge`, which resolves the pod's trigger via
// `ActivationPodResource` rather than the source/view/trigger join.
async function createPodActivationTrigger(
  auth: Authenticator,
  pod: SpaceResource,
  options: { status?: TriggerStatus } = {}
) {
  const workspace = auth.getNonNullableWorkspace();
  const source = await new WebhookSourceFactory(workspace).create({
    name: ACTIVATION_WEBHOOK_SOURCE_NAME,
  });
  const podView = await new WebhookSourceViewFactory(workspace).create(pod, {
    webhookSourceId: source.sId,
  });

  const trigger = await TriggerFactory.webhook(auth, {
    agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    status: options.status ?? "enabled",
    spaceId: pod.id,
    webhookSourceViewId: podView.id,
  });

  await ActivationPodResource.makeNew(auth, {
    pod,
    user: auth.getNonNullableUser(),
    trigger,
  });

  return trigger;
}

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
    await createPodActivationTrigger(authenticator, globalSpace);

    expect(await isEligibleForNudge(authenticator, globalSpace)).toBe(true);
  });

  it("is not eligible right after a nudge, within the cap window", async () => {
    const { authenticator, globalSpace } = await createResourceTest({
      role: "admin",
    });
    const trigger = await createPodActivationTrigger(
      authenticator,
      globalSpace
    );
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
    const trigger = await createPodActivationTrigger(
      refreshedAuth,
      globalSpace
    );

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
    const trigger = await createPodActivationTrigger(
      refreshedAuth,
      globalSpace
    );

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

  it("is not eligible when the trigger was disabled by the user (opted out)", async () => {
    const { authenticator, globalSpace } = await createResourceTest({
      role: "admin",
    });
    await createPodActivationTrigger(authenticator, globalSpace, {
      status: "disabled",
    });

    expect(await isEligibleForNudge(authenticator, globalSpace)).toBe(false);
  });

  it("is not eligible when the pod has no activation trigger", async () => {
    const { authenticator, globalSpace } = await createResourceTest({
      role: "admin",
    });

    expect(await isEligibleForNudge(authenticator, globalSpace)).toBe(false);
  });

  it("is not eligible when the pod is archived (dead)", async () => {
    const { authenticator, globalSpace } = await createResourceTest({
      role: "admin",
    });
    await createPodActivationTrigger(authenticator, globalSpace);

    // biome-ignore lint/plugin/noRawSql: only way to backdate a paranoid model's deletedAt in tests.
    await frontSequelize.query(
      `UPDATE vaults SET "deletedAt" = :deletedAt WHERE id = :id AND "workspaceId" = :workspaceId`,
      {
        replacements: {
          deletedAt: new Date().toISOString(),
          id: globalSpace.id,
          workspaceId: authenticator.getNonNullableWorkspace().id,
        },
      }
    );
    const archivedPod = await SpaceResource.fetchById(
      authenticator,
      globalSpace.sId,
      { includeDeleted: true }
    );
    if (!archivedPod) {
      throw new Error("Expected the archived pod to still be fetchable.");
    }

    expect(await isEligibleForNudge(authenticator, archivedPod)).toBe(false);
  });

  it("is not eligible when the target user left the workspace (dead)", async () => {
    const { workspace, user, globalSpace } = await createResourceTest({
      role: "user",
    });
    const authenticator = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    await createPodActivationTrigger(authenticator, globalSpace);

    await MembershipResource.revokeMembership({ user, workspace });

    expect(await isEligibleForNudge(authenticator, globalSpace)).toBe(false);
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
