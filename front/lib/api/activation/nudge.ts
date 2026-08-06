import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import {
  createConversation,
  isPermanentPostMessageError,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import {
  buildAuditLogTarget,
  emitAuditLogEventDirect,
} from "@app/lib/api/audit/workos_audit";
import { Authenticator } from "@app/lib/auth";
import { serializeMention } from "@app/lib/mentions/format";
import { isUserBlocked } from "@app/lib/metronome/user_block";
import { ActivationNudgeResource } from "@app/lib/resources/activation_nudge_resource";
import type { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import {
  DEFAULT_ACTIVATION_NUDGE_FREQUENCY_CAP_DAYS,
  DEFAULT_ACTIVATION_NUDGE_MAX_UNANSWERED_COUNT,
} from "@app/temporal/activation_scheduler/config";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { ACTIVATION_NUDGE_ORIGIN } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import isNumber from "lodash/isNumber";

const ACTIVATION_NUDGE_PROMPT = "Run the Dust Training workflow.";

// A resource type that the activation nudge should drive the user toward
export type ActivationNudgePushedResourceType = "skill" | "agent";

// The context for what the activation nudge should drive the user toward
export type ActivationNudgeContext = {
  sessionGoal: string | null;
  pushedResourceType: ActivationNudgePushedResourceType | null;
  pushedResourceName: string | null;
};

export const EMPTY_ACTIVATION_NUDGE_CONTEXT: ActivationNudgeContext = {
  sessionGoal: null,
  pushedResourceType: null,
  pushedResourceName: null,
};

// `retryable` tells the Temporal caller whether trying again can succeed:
// a missing seat or an inaccessible agent will not fix itself, a failed write
// might.
export class ActivationNudgeError extends Error {
  constructor(
    readonly retryable: boolean,
    message: string
  ) {
    super(message);
  }
}

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

// Counts how many of the pod's most recent nudges, starting from the latest
// and going backwards, got no message from the nudged user in the pod. The
// count stops at the first answered nudge, so a reply resets the streak.
async function countUnansweredNudgeStreak(
  auth: Authenticator,
  pod: SpaceResource,
  activationPod: ActivationPodResource,
  { limit }: { limit: number }
): Promise<number> {
  const nudges = await ActivationNudgeResource.listRecentForActivationPod(
    auth,
    {
      activationPod,
      limit,
    }
  );
  if (nudges.length === 0) {
    return 0;
  }

  const oldestNudge = nudges[nudges.length - 1];
  const replyTimestamps =
    await ConversationResource.listUserMessageTimestampsInSpace(auth, {
      spaceModelId: pod.id,
      userId: activationPod.userId,
      since: oldestNudge.createdAt,
    });

  let streak = 0;
  for (let i = 0; i < nudges.length; i++) {
    const windowStart = nudges[i].createdAt;
    const windowEnd = i === 0 ? new Date() : nudges[i - 1].createdAt;

    const wasAnswered = replyTimestamps.some(
      (timestamp) => timestamp >= windowStart && timestamp < windowEnd
    );
    if (wasAnswered) {
      break;
    }
    streak++;
  }

  return streak;
}

// A pod is "dead" once it can no longer receive nudges for reasons unrelated
// to nudge history: it was archived, or its target user was removed from or
// left the workspace.
async function isPodDead(
  auth: Authenticator,
  pod: SpaceResource,
  activationPod: ActivationPodResource
): Promise<boolean> {
  if (pod.deletedAt !== null) {
    return true;
  }

  const [targetUser] = await UserResource.fetchByModelIds([
    activationPod.userId,
  ]);
  if (!targetUser) {
    return true;
  }

  const activeMembership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user: targetUser,
      workspace: auth.getNonNullableWorkspace(),
    });

  return activeMembership === null;
}

// Gates re-nudging a pod on five conditions:
// - Opted out: did the user turn nudges off?
// - Dead: is the pod archived, or has its target user left the workspace?
// - Credit gate: is the pod's user blocked (workspace credit pool exhausted
//   or their per-user cap reached)?
// - Frequency cap: was the pod nudged within the workspace's configured cap
//   window?
// - Unanswered cap: have the pod's most recent nudges gone unanswered (no
//   user message since they were posted), up to the workspace's configured max?
export async function isEligibleForNudge(
  auth: Authenticator,
  {
    pod,
    activationPod,
    user,
  }: {
    pod: SpaceResource;
    activationPod: ActivationPodResource;
    user: UserResource | null;
  }
): Promise<boolean> {
  if (activationPod.nudgesDisabledAt !== null) {
    return false;
  }

  if (await isPodDead(auth, pod, activationPod)) {
    return false;
  }

  if (user) {
    const workspace = renderLightWorkspaceType({
      workspace: auth.getNonNullableWorkspace(),
    });
    if (await isUserBlocked(workspace, user)) {
      return false;
    }
  }

  const latestNudge = await ActivationNudgeResource.fetchLatestForActivationPod(
    auth,
    {
      activationPod,
    }
  );
  if (!latestNudge) {
    return true;
  }

  const frequencyCapDays = getActivationNudgeFrequencyCapDays(auth);
  const frequencyCapMs = frequencyCapDays * 24 * 60 * 60 * 1000;
  const msSinceLastNudge = Date.now() - latestNudge.createdAt.getTime();
  if (msSinceLastNudge < frequencyCapMs) {
    return false;
  }

  const maxUnansweredCount = getActivationNudgeMaxUnansweredCount(auth);
  const unansweredStreak = await countUnansweredNudgeStreak(
    auth,
    pod,
    activationPod,
    { limit: maxUnansweredCount }
  );

  return unansweredStreak < maxUnansweredCount;
}

// The opening message of a nudge conversation. The per-nudge context rides in
// the message itself: the agent is told (in the Activation skill) to read it
// and never surface it.
function buildActivationNudgeContent(
  agentConfiguration: AgentConfigurationType,
  context: ActivationNudgeContext
): string {
  const contextLines = removeNulls([
    context.sessionGoal ? `Session goal: ${context.sessionGoal}` : null,
    context.pushedResourceType && context.pushedResourceName
      ? `Featured ${context.pushedResourceType}: ${context.pushedResourceName}`
      : null,
  ]);

  const content =
    serializeMention(agentConfiguration) + `\n\n${ACTIVATION_NUDGE_PROMPT}`;
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
 * Callers are expected to have gated on `isEligibleForNudge`, except for the
 * poke plugin, which nudges on demand.
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
    context: ActivationNudgeContext;
  }
): Promise<Result<{ conversationId: string }, ActivationNudgeError>> {
  const workspace = auth.getNonNullableWorkspace();

  const [targetUser] = await UserResource.fetchByModelIds([
    activationPod.userId,
  ]);
  if (!targetUser) {
    return new Err(
      new ActivationNudgeError(false, "The Pod's user no longer exists.")
    );
  }

  const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
    targetUser.sId,
    workspace.sId
  );
  if (!userAuth.isUser()) {
    return new Err(
      new ActivationNudgeError(
        false,
        "The Pod's user is no longer a member of the workspace."
      )
    );
  }

  if (!pod.isMember(userAuth)) {
    return new Err(
      new ActivationNudgeError(
        false,
        "The Pod's user is no longer a member of the Pod."
      )
    );
  }

  const agentConfiguration = await getAgentConfiguration(userAuth, {
    agentId: GLOBAL_AGENTS_SID.DUST,
    variant: "extra_light",
  });
  if (!agentConfiguration) {
    return new Err(
      new ActivationNudgeError(
        false,
        "The Dust agent is not available to the Pod's user."
      )
    );
  }

  const conversation = await createConversation(userAuth, {
    title: null,
    visibility: "unlisted",
    spaceId: pod.id,
  });

  const messageRes = await postUserMessage(userAuth, {
    conversationResource: conversation,
    content: buildActivationNudgeContent(agentConfiguration, context),
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

    const deleteRes = await conversation.delete(userAuth);
    if (deleteRes.isErr()) {
      logger.error(
        {
          conversationId: conversation.sId,
          error: deleteRes.error,
          workspaceId: workspace.sId,
        },
        "[Activation] Failed to clean up the conversation of a nudge that did not post."
      );
    }

    return new Err(
      new ActivationNudgeError(
        !isPermanentPostMessageError(type),
        `Failed to post the nudge: [${type}] ${message}`
      )
    );
  }

  // Recorded once the nudge is out, so the frequency cap and the unanswered
  // streak only count nudges the user actually got.
  await ActivationNudgeResource.makeNew(auth, { activationPod, pod });

  void emitAuditLogEventDirect({
    workspace,
    action: "activation.nudge_posted",
    actor: { type: "system", id: "activation", name: "Dust Training" },
    targets: [
      buildAuditLogTarget("workspace", workspace),
      {
        type: "user",
        id: targetUser.sId,
        name: targetUser.fullName(),
      },
      buildAuditLogTarget("space", pod),
    ],
    context: { location: "internal" },
    metadata: {
      agent_id: agentConfiguration.sId,
      conversation_id: conversation.sId,
    },
  });

  return new Ok({ conversationId: conversation.sId });
}
