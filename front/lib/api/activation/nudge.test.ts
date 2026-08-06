import {
  EMPTY_ACTIVATION_NUDGE_CONTEXT,
  getActivationNudgeFrequencyCapDays,
  getActivationNudgeMaxUnansweredCount,
  isEligibleForNudge,
  postActivationNudge,
} from "@app/lib/api/activation/nudge";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { Authenticator } from "@app/lib/auth";
import { ActivationNudgeResource } from "@app/lib/resources/activation_nudge_resource";
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
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { isUserMessageType } from "@app/types/assistant/conversation";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockIsUserBlocked } = vi.hoisted(() => ({
  mockIsUserBlocked: vi.fn(),
}));

vi.mock("@app/lib/metronome/user_block", () => ({
  isUserBlocked: mockIsUserBlocked,
}));

vi.mock("@app/temporal/agent_loop/client", () => ({
  launchAgentLoopWorkflow: vi.fn(),
  launchCompactionWorkflow: vi.fn(),
}));

vi.mock("@app/lib/api/assistant/streaming/events", () => ({
  publishAgentMessagesEvents: vi.fn(),
  publishConversationEvent: vi.fn(),
  publishMessageEventsOnMessagePostOrEdit: vi.fn(),
}));

const DAY_MS = 24 * 60 * 60 * 1000;

// The ActivationPod row is what makes a space a Pod the scheduler will nudge.
async function createActivationPod(
  auth: Authenticator,
  pod: SpaceResource
): Promise<ActivationPodResource> {
  return ActivationPodResource.makeNew(auth, {
    pod,
    user: auth.getNonNullableUser(),
  });
}

// A nudge, plus optionally a message the pod's user sent afterwards.
async function createNudge(
  auth: Authenticator,
  {
    activationPod,
    pod,
    createdAt,
    replyAt,
  }: {
    activationPod: ActivationPodResource;
    pod: SpaceResource;
    createdAt: Date;
    replyAt?: Date;
  }
) {
  await ConversationFactory.create(auth, {
    agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    spaceId: pod.id,
    messagesCreatedAt: replyAt ? [replyAt] : [],
    conversationCreatedAt: createdAt,
  });

  return ActivationNudgeFactory.create(auth, {
    activationPod,
    pod,
    createdAt,
  });
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
  beforeEach(() => {
    mockIsUserBlocked.mockReset();
    mockIsUserBlocked.mockResolvedValue(null);
  });

  it("is eligible when the pod has never been nudged", async () => {
    const { authenticator, globalSpace } = await createResourceTest({
      role: "admin",
    });
    const activationPod = await createActivationPod(authenticator, globalSpace);

    expect(
      await isEligibleForNudge(authenticator, {
        pod: globalSpace,
        activationPod,
        user: null,
      })
    ).toBe(true);
  });

  it("is not eligible right after a nudge, within the cap window", async () => {
    const { authenticator, globalSpace } = await createResourceTest({
      role: "admin",
    });
    const activationPod = await createActivationPod(authenticator, globalSpace);
    await ActivationNudgeFactory.create(authenticator, {
      activationPod,
      pod: globalSpace,
    });

    expect(
      await isEligibleForNudge(authenticator, {
        pod: globalSpace,
        activationPod,
        user: null,
      })
    ).toBe(false);
  });

  it("is not eligible when the user turned nudges off", async () => {
    const { authenticator, globalSpace } = await createResourceTest({
      role: "admin",
    });
    const activationPod = await createActivationPod(authenticator, globalSpace);
    await activationPod.disableNudges();

    expect(
      await isEligibleForNudge(authenticator, {
        pod: globalSpace,
        activationPod,
        user: null,
      })
    ).toBe(false);
  });

  it("is not eligible when the pod's user is blocked, even if never nudged", async () => {
    mockIsUserBlocked.mockResolvedValue("credits_exhausted");
    const { authenticator, user, globalSpace } = await createResourceTest({
      role: "admin",
    });
    const activationPod = await createActivationPod(authenticator, globalSpace);

    expect(
      await isEligibleForNudge(authenticator, {
        pod: globalSpace,
        activationPod,
        user,
      })
    ).toBe(false);
  });

  it("is eligible when a user is provided but not blocked", async () => {
    mockIsUserBlocked.mockResolvedValue(null);
    const { authenticator, user, globalSpace } = await createResourceTest({
      role: "admin",
    });
    const activationPod = await createActivationPod(authenticator, globalSpace);

    expect(
      await isEligibleForNudge(authenticator, {
        pod: globalSpace,
        activationPod,
        user,
      })
    ).toBe(true);
  });

  it("does not check the credit gate when no user is provided", async () => {
    const { authenticator, globalSpace } = await createResourceTest({
      role: "admin",
    });
    const activationPod = await createActivationPod(authenticator, globalSpace);

    await isEligibleForNudge(authenticator, {
      pod: globalSpace,
      activationPod,
      user: null,
    });

    expect(mockIsUserBlocked).not.toHaveBeenCalled();
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
    const activationPod = await createActivationPod(refreshedAuth, globalSpace);

    // Two nudges, both outside the frequency cap window, with no reply.
    await createNudge(refreshedAuth, {
      activationPod,
      pod: globalSpace,
      createdAt: new Date(Date.now() - 10 * DAY_MS),
    });
    await createNudge(refreshedAuth, {
      activationPod,
      pod: globalSpace,
      createdAt: new Date(Date.now() - 5 * DAY_MS),
    });

    expect(
      await isEligibleForNudge(refreshedAuth, {
        pod: globalSpace,
        activationPod,
        user: null,
      })
    ).toBe(false);
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
    const activationPod = await createActivationPod(refreshedAuth, globalSpace);

    await createNudge(refreshedAuth, {
      activationPod,
      pod: globalSpace,
      createdAt: new Date(Date.now() - 10 * DAY_MS),
    });
    // The user said something in the pod after the most recent nudge.
    await createNudge(refreshedAuth, {
      activationPod,
      pod: globalSpace,
      createdAt: new Date(Date.now() - 5 * DAY_MS),
      replyAt: new Date(Date.now() - 4 * DAY_MS),
    });

    expect(
      await isEligibleForNudge(refreshedAuth, {
        pod: globalSpace,
        activationPod,
        user: null,
      })
    ).toBe(true);
  });

  it("is not eligible when the pod is archived (dead)", async () => {
    const { authenticator, globalSpace } = await createResourceTest({
      role: "admin",
    });
    const activationPod = await createActivationPod(authenticator, globalSpace);

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

    expect(
      await isEligibleForNudge(authenticator, {
        pod: archivedPod,
        activationPod,
        user: null,
      })
    ).toBe(false);
  });

  it("is not eligible when the target user left the workspace (dead)", async () => {
    const { workspace, user, globalSpace } = await createResourceTest({
      role: "user",
    });
    const authenticator = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const activationPod = await createActivationPod(authenticator, globalSpace);

    await MembershipResource.revokeMembership({ user, workspace });

    expect(
      await isEligibleForNudge(authenticator, {
        pod: globalSpace,
        activationPod,
        user: null,
      })
    ).toBe(false);
  });
});

describe("postActivationNudge", () => {
  it("opens a conversation in the pod, authored by the agent rather than the user", async () => {
    const { workspace, user } = await createResourceTest({ role: "user" });
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId,
      { dangerouslyRequestAllGroups: true }
    );
    const pod = await SpaceFactory.project(workspace, user.id);
    const activationPod = await ActivationPodResource.makeNew(adminAuth, {
      pod,
      user,
    });

    const result = await postActivationNudge(adminAuth, {
      pod,
      activationPod,
      context: {
        sessionGoal: "Automate the weekly report",
        pushedResourceType: "skill",
        pushedResourceName: "Notion",
      },
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }

    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const conversationRes = await getConversation(
      userAuth,
      result.value.conversationId
    );
    if (conversationRes.isErr()) {
      throw conversationRes.error;
    }
    const conversation = conversationRes.value;

    expect(conversation.spaceId).toBe(pod.sId);

    const [firstVersions] = conversation.content;
    const [nudgeMessage] = firstVersions;
    if (!isUserMessageType(nudgeMessage)) {
      throw new Error("Expected the nudge to open with a user message.");
    }

    // No author: the nudge is Dust reaching out, not the user talking to
    // themselves.
    expect(nudgeMessage.user).toBeNull();
    expect(nudgeMessage.context.origin).toBe("system_activation");
    expect(nudgeMessage.context.email).toBeNull();
    expect(nudgeMessage.content).toContain("Automate the weekly report");
    expect(nudgeMessage.content).toContain("Featured skill: Notion");
  });

  it("records the nudge against the pod and links its conversation", async () => {
    const { workspace, user } = await createResourceTest({ role: "user" });
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId,
      { dangerouslyRequestAllGroups: true }
    );
    const pod = await SpaceFactory.project(workspace, user.id);
    const activationPod = await ActivationPodResource.makeNew(adminAuth, {
      pod,
      user,
    });

    const result = await postActivationNudge(adminAuth, {
      pod,
      activationPod,
      context: EMPTY_ACTIVATION_NUDGE_CONTEXT,
    });
    if (result.isErr()) {
      throw result.error;
    }

    const nudge = await ActivationNudgeResource.fetchLatestForActivationPod(
      adminAuth,
      { activationPod }
    );
    expect(nudge?.activationPodId).toBe(activationPod.id);
    expect(nudge?.userId).toBe(user.id);
  });

  it("does not post to a pod the user is no longer a member of", async () => {
    const { workspace, user } = await createResourceTest({ role: "user" });
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId,
      { dangerouslyRequestAllGroups: true }
    );
    // No creator id: the user belongs to none of the pod's groups.
    const pod = await SpaceFactory.project(workspace);
    const activationPod = await ActivationPodResource.makeNew(adminAuth, {
      pod,
      user,
    });

    const result = await postActivationNudge(adminAuth, {
      pod,
      activationPod,
      context: EMPTY_ACTIVATION_NUDGE_CONTEXT,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected the nudge to be refused.");
    }
    expect(result.error.retryable).toBe(false);
    expect(
      await ActivationNudgeResource.fetchLatestForActivationPod(adminAuth, {
        activationPod,
      })
    ).toBeNull();
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
