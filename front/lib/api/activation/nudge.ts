import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import {
  createConversation,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import { isUserBlocked } from "@app/lib/api/credits/access_control";
import { isNonCreditPricedUserSpendLimitReached } from "@app/lib/api/users/spend_limit";
import { Authenticator } from "@app/lib/auth";
import { serializeMention } from "@app/lib/mentions/format";
import type { ActivationPodKind } from "@app/lib/models/activation/activation_pod";
import type { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { activationSkill } from "@app/lib/resources/skill/code_defined/global/activation";
import { jobSkill } from "@app/lib/resources/skill/code_defined/global/job";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { serializeSkillTag } from "@app/lib/skills/format";
import {
  DEFAULT_ACTIVATION_NUDGE_FREQUENCY_CAP_DAYS,
  DEFAULT_ACTIVATION_NUDGE_MAX_UNANSWERED_COUNT,
} from "@app/temporal/activation_scheduler/config";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { ACTIVATION_NUDGE_ORIGIN } from "@app/types/assistant/conversation";
import { isCreditPricedPlan } from "@app/types/plan";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";
import isNumber from "lodash/isNumber";

function nudgeSkillForKind(kind: ActivationPodKind) {
  switch (kind) {
    case "learning":
      return activationSkill;
    case "goal":
      return jobSkill;
    default:
      assertNever(kind);
  }
}

function nudgePromptForKind(kind: ActivationPodKind): string {
  const skill = nudgeSkillForKind(kind);
  return serializeSkillTag({
    id: skill.sId,
    name: skill.name,
    icon: skill.icon,
  });
}

// A resource type that the activation nudge should drive the user toward
export type ActivationNudgePushedResourceType = "skill" | "agent";

// The context for what the activation nudge should drive the user toward
export type ActivationNudgeContext = {
  sessionGoal: string | null;
  pushedResourceType: ActivationNudgePushedResourceType | null;
  pushedResourceName: string | null;
  workAreas: string | null;
  activationPlaybook: string | null;
};

export function getActivationNudgeFrequencyCapDays(
  auth: Authenticator
): number {
  const workspace = auth.getNonNullableWorkspace();
  const customFrequencyCapDays =
    workspace.metadata?.activationNudgeFrequencyCapDays;

  if (isNumber(customFrequencyCapDays)) {
    return customFrequencyCapDays;
  }
  return DEFAULT_ACTIVATION_NUDGE_FREQUENCY_CAP_DAYS;
}

export function getActivationNudgeMaxUnansweredCount(
  auth: Authenticator
): number {
  const workspace = auth.getNonNullableWorkspace();
  const customMaxUnansweredCount =
    workspace.metadata?.activationNudgeMaxUnansweredCount;

  if (isNumber(customMaxUnansweredCount)) {
    return customMaxUnansweredCount;
  }
  return DEFAULT_ACTIVATION_NUDGE_MAX_UNANSWERED_COUNT;
}

function isPodDead(pod: SpaceResource): boolean {
  return pod.deletedAt !== null;
}

// The pod owner is still an active, non-revoked member of this workspace
// (membership has started and has not been ended).
async function hasActivePodOwnerMembership(
  auth: Authenticator,
  activationPod: ActivationPodResource
): Promise<boolean> {
  const [targetUser] = await UserResource.fetchByModelIds([
    activationPod.userId,
  ]);
  if (!targetUser) {
    return false;
  }

  const activeMembership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user: targetUser,
      workspace: auth.getNonNullableWorkspace(),
    });

  return activeMembership !== null;
}

function isCreditPricedWorkspace(auth: Authenticator): boolean {
  const workspace = auth.getNonNullableWorkspace();
  const plan = auth.plan();
  return Boolean(
    workspace.metronomeCustomerId && plan && isCreditPricedPlan(plan)
  );
}

// Whether this pod can be nudged right now.
// Always applied: archived pod; owner is not an active, non-revoked member;
// credit/seat (or the legacy spend cap). Skipped when overrideChecks is set
// (poke one-off): BYOK, frequency cap, unanswered-nudge limit.
export async function isEligibleForNudge(
  auth: Authenticator,
  {
    pod,
    activationPod,
    user,
    overrideChecks = false,
  }: {
    pod: SpaceResource;
    activationPod: ActivationPodResource;
    user: UserResource | null;
    overrideChecks?: boolean;
  }
): Promise<boolean> {
  if (isPodDead(pod)) {
    return false;
  }

  if (!(await hasActivePodOwnerMembership(auth, activationPod))) {
    return false;
  }

  if (user) {
    if (isCreditPricedWorkspace(auth)) {
      if (await isUserBlocked(auth, user)) {
        return false;
      }
    } else {
      // Legacy plans: `seatType === "none"` is the backfill/default, not a
      // block, so skip isUserBlocked. The matching conversation-posting gate
      // is the non-CP spend cap.
      if (await isNonCreditPricedUserSpendLimitReached(auth, { user })) {
        return false;
      }
    }
  }

  if (overrideChecks) {
    return true;
  }

  if (auth.plan()?.isByok) {
    return false;
  }

  const maxUnansweredCount = getActivationNudgeMaxUnansweredCount(auth);

  // The pod's own nudge conversations are the nudge history: Dust opened them,
  // so their opening message carries the nudge origin.
  const nudgedAts = await ConversationResource.listNudgeConversationTimestamps(
    auth,
    { spaceModelId: pod.id, limit: maxUnansweredCount }
  );
  if (nudgedAts.length === 0) {
    return true;
  }

  const frequencyCapDays = getActivationNudgeFrequencyCapDays(auth);
  const frequencyCapMs = frequencyCapDays * 24 * 60 * 60 * 1000;
  if (Date.now() - nudgedAts[0].getTime() < frequencyCapMs) {
    return false;
  }

  // Unanswered nudges are the ones the user never came back to: those sent
  // after their last message in the pod.
  const lastMessageAt = await ConversationResource.latestUserMessageAtInSpace(
    auth,
    { spaceModelId: pod.id, userId: activationPod.userId }
  );
  const unanswered = nudgedAts.filter(
    (nudgedAt) => lastMessageAt === null || nudgedAt > lastMessageAt
  );

  return unanswered.length < maxUnansweredCount;
}

// The opening message of a nudge conversation. The per-nudge context rides in
// the message itself: the agent is told (in the Activation skill) to read it
// and never surface it.
function buildActivationNudgeContent(
  agentConfiguration: AgentConfigurationType,
  {
    kind,
    context,
  }: {
    kind: ActivationPodKind;
    context: ActivationNudgeContext | undefined;
  }
): string {
  const contextLines = removeNulls([
    context?.sessionGoal ? `Session goal: ${context.sessionGoal}` : null,
    context?.pushedResourceType && context.pushedResourceName
      ? `Featured ${context.pushedResourceType}: ${context.pushedResourceName}`
      : null,
    context?.workAreas ? `Work areas: ${context.workAreas}` : null,
    context?.activationPlaybook
      ? `Activation playbook: ${context.activationPlaybook}`
      : null,
  ]);

  const content =
    serializeMention(agentConfiguration) + `\n\n${nudgePromptForKind(kind)}`;
  if (contextLines.length === 0) {
    return content;
  }

  return (
    content +
    `\n\n<dust_activation>\n${contextLines.join("\n")}\n</dust_activation>`
  );
}

/**
 * Posts a nudge to a Pod: Dust opening a conversation in the pod, on behalf of
 * the pod's user, so they have somewhere to start.
 *
 * The message is authored by the system, not by them: the agent's identity in
 * the context, and no author on the message row. `email` has to stay null,
 * since `postUserMessage` resolves an author from the context email when the
 * message has none, which would hand the nudge back to the user. The run still
 * executes under the target user's authenticator, so the agent sees exactly
 * what they can see, and they stay a participant of the conversation.
 *
 * Callers are expected to have gated on `isEligibleForNudge`.
 */
export async function postActivationNudge(
  auth: Authenticator,
  {
    pod,
    activationPod,
    context,
  }: {
    pod: SpaceResource;
    activationPod: ActivationPodResource;
    context?: ActivationNudgeContext;
  }
): Promise<Result<{ conversationId: string }, Error>> {
  const workspace = auth.getNonNullableWorkspace();

  const [targetUser] = await UserResource.fetchByModelIds([
    activationPod.userId,
  ]);
  if (!targetUser) {
    return new Err(new Error("The Pod's user no longer exists."));
  }

  const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
    targetUser.sId,
    workspace.sId
  );

  // Checked here because `createConversation` throws on a space the user
  // cannot see, rather than returning an error.
  if (!pod.isMember(userAuth)) {
    return new Err(new Error("The Pod's user is not a member of the Pod."));
  }

  const agentConfiguration = await getAgentConfiguration(userAuth, {
    agentId: GLOBAL_AGENTS_SID.DUST,
    variant: "extra_light",
  });
  if (!agentConfiguration) {
    return new Err(
      new Error("The Dust agent is not available to the Pod's user.")
    );
  }

  const conversation = await createConversation(userAuth, {
    title: null,
    visibility: "unlisted",
    spaceId: pod.id,
  });

  const messageRes = await postUserMessage(userAuth, {
    conversationResource: conversation,
    content: buildActivationNudgeContent(agentConfiguration, {
      kind: activationPod.kind,
      context,
    }),
    mentions: [{ configurationId: agentConfiguration.sId }],
    context: {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
      username: agentConfiguration.name,
      fullName: agentConfiguration.name,
      email: null,
      profilePictureUrl: agentConfiguration.pictureUrl,
      origin: ACTIVATION_NUDGE_ORIGIN,
    },
    skipToolsValidation: false,
    doNotAssociateUser: true,
  });

  if (messageRes.isErr()) {
    const { type, message } = messageRes.error.api_error;
    return new Err(new Error(`Failed to post the nudge: [${type}] ${message}`));
  }

  return new Ok({ conversationId: conversation.sId });
}
