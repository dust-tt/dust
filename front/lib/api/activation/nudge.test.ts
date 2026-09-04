import {
  getActivationNudgeFrequencyCapDays,
  getActivationNudgeMaxUnansweredCount,
  isEligibleForNudge,
  postActivationNudge,
} from "@app/lib/api/activation/nudge";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
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
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { isUserMessageType } from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockIsUserBlocked, mockIsNonCreditPricedUserSpendLimitReached } =
  vi.hoisted(() => ({
    mockIsUserBlocked: vi.fn(),
    mockIsNonCreditPricedUserSpendLimitReached: vi.fn(),
  }));

vi.mock("@app/lib/api/credits/access_control", () => ({
  isUserBlocked: mockIsUserBlocked,
}));

vi.mock("@app/lib/api/users/spend_limit", () => ({
  isNonCreditPricedUserSpendLimitReached:
    mockIsNonCreditPricedUserSpendLimitReached,
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

// A nudge is a conversation Dust opened in the pod: its opening message
// carries the nudge origin and has no author. `replyAt` adds a message from the
// pod's user afterwards.
async function createNudge(
  auth: Authenticator,
  {
    workspace,
    pod,
    nudgedAt,
    replyAt,
  }: {
    workspace: LightWorkspaceType;
    pod: SpaceResource;
    nudgedAt: Date;
    replyAt?: Date;
  }
) {
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    spaceId: pod.id,
    messagesCreatedAt: [],
    conversationCreatedAt: nudgedAt,
  });

  await ConversationFactory.createUserMessage({
    auth,
    workspace,
    conversation,
    content: "Run the Dust Learning workflow.",
    origin: "system_activation",
    authorless: true,
    createdAt: nudgedAt,
  });

  if (replyAt) {
    await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: "Sure, let's do it.",
      rank: 2,
      createdAt: replyAt,
    });
  }
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
    mockIsNonCreditPricedUserSpendLimitReached.mockReset();
    mockIsNonCreditPricedUserSpendLimitReached.mockResolvedValue(false);
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
    const { authenticator, workspace, globalSpace } = await createResourceTest({
      role: "admin",
    });
    const activationPod = await createActivationPod(authenticator, globalSpace);
    await createNudge(authenticator, {
      workspace,
      pod: globalSpace,
      nudgedAt: new Date(),
    });

    expect(
      await isEligibleForNudge(authenticator, {
        pod: globalSpace,
        activationPod,
        user: null,
      })
    ).toBe(false);
  });

  it("is eligible on a legacy plan even when isUserBlocked would report no_seat", async () => {
    mockIsUserBlocked.mockResolvedValue("no_seat");
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
    expect(mockIsUserBlocked).not.toHaveBeenCalled();
  });

  it("is not eligible on a legacy plan when the spend cap is reached", async () => {
    mockIsNonCreditPricedUserSpendLimitReached.mockResolvedValue(true);
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
    expect(mockIsNonCreditPricedUserSpendLimitReached).toHaveBeenCalled();
  });

  it("is not eligible when a credit-priced user is blocked, even if never nudged", async () => {
    mockIsUserBlocked.mockResolvedValue("credits_exhausted");
    const workspace = await WorkspaceFactory.creditPriced();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "admin" });
    const authenticator = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const { globalSpace } = await SpaceFactory.defaults(
      await Authenticator.internalAdminForWorkspace(workspace.sId)
    );
    const activationPod = await createActivationPod(authenticator, globalSpace);

    expect(
      await isEligibleForNudge(authenticator, {
        pod: globalSpace,
        activationPod,
        user,
      })
    ).toBe(false);
    expect(mockIsUserBlocked).toHaveBeenCalled();
  });

  it("still blocks a credit-priced user when overrideChecks is set", async () => {
    mockIsUserBlocked.mockResolvedValue("credits_exhausted");
    const workspace = await WorkspaceFactory.creditPriced();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "admin" });
    const authenticator = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const { globalSpace } = await SpaceFactory.defaults(
      await Authenticator.internalAdminForWorkspace(workspace.sId)
    );
    const activationPod = await createActivationPod(authenticator, globalSpace);

    expect(
      await isEligibleForNudge(authenticator, {
        pod: globalSpace,
        activationPod,
        user,
        overrideChecks: true,
      })
    ).toBe(false);
  });

  it("is not eligible on a BYOK workspace, even if never nudged", async () => {
    const { authenticator, user, globalSpace } = await createResourceTest({
      role: "admin",
      isByok: true,
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

  it("is eligible on a BYOK workspace when overrideChecks is set", async () => {
    const { authenticator, user, globalSpace } = await createResourceTest({
      role: "admin",
      isByok: true,
    });
    const activationPod = await createActivationPod(authenticator, globalSpace);

    expect(
      await isEligibleForNudge(authenticator, {
        pod: globalSpace,
        activationPod,
        user,
        overrideChecks: true,
      })
    ).toBe(true);
  });

  it("skips the frequency cap when overrideChecks is set", async () => {
    const { authenticator, workspace, globalSpace } = await createResourceTest({
      role: "admin",
    });
    const activationPod = await createActivationPod(authenticator, globalSpace);
    await createNudge(authenticator, {
      workspace,
      pod: globalSpace,
      nudgedAt: new Date(),
    });

    expect(
      await isEligibleForNudge(authenticator, {
        pod: globalSpace,
        activationPod,
        user: null,
        overrideChecks: true,
      })
    ).toBe(true);
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
      workspace,
      pod: globalSpace,
      nudgedAt: new Date(Date.now() - 10 * DAY_MS),
    });
    await createNudge(refreshedAuth, {
      workspace,
      pod: globalSpace,
      nudgedAt: new Date(Date.now() - 5 * DAY_MS),
    });

    expect(
      await isEligibleForNudge(refreshedAuth, {
        pod: globalSpace,
        activationPod,
        user: null,
      })
    ).toBe(false);
  });

  it("stops after two unanswered nudges by default", async () => {
    const { authenticator, workspace, globalSpace } = await createResourceTest({
      role: "admin",
    });
    const activationPod = await createActivationPod(authenticator, globalSpace);

    await createNudge(authenticator, {
      workspace,
      pod: globalSpace,
      nudgedAt: new Date(Date.now() - 10 * DAY_MS),
    });
    await createNudge(authenticator, {
      workspace,
      pod: globalSpace,
      nudgedAt: new Date(Date.now() - 5 * DAY_MS),
    });

    expect(
      await isEligibleForNudge(authenticator, {
        pod: globalSpace,
        activationPod,
        user: null,
      })
    ).toBe(false);
  });

  it("is still eligible after a single unanswered nudge outside the cap window", async () => {
    const { authenticator, workspace, globalSpace } = await createResourceTest({
      role: "admin",
    });
    const activationPod = await createActivationPod(authenticator, globalSpace);

    await createNudge(authenticator, {
      workspace,
      pod: globalSpace,
      nudgedAt: new Date(Date.now() - 5 * DAY_MS),
    });

    expect(
      await isEligibleForNudge(authenticator, {
        pod: globalSpace,
        activationPod,
        user: null,
      })
    ).toBe(true);
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
      workspace,
      pod: globalSpace,
      nudgedAt: new Date(Date.now() - 10 * DAY_MS),
    });
    // The user said something in the pod after the most recent nudge.
    await createNudge(refreshedAuth, {
      workspace,
      pod: globalSpace,
      nudgedAt: new Date(Date.now() - 5 * DAY_MS),
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

  it("is not eligible when the target user no longer has an active membership", async () => {
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

  it("still blocks a revoked membership when overrideChecks is set", async () => {
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
        overrideChecks: true,
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
        workAreas: null,
        activationPlaybook: null,
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
    });

    expect(result.isErr()).toBe(true);
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
