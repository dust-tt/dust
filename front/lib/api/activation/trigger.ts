import type { Authenticator } from "@app/lib/auth";
import { ActivationNudgeResource } from "@app/lib/resources/activation_nudge_resource";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  resolveTriggerSpaceId,
  TriggerResource,
} from "@app/lib/resources/trigger_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { processWebhookRequest } from "@app/lib/triggers/webhook";
import logger from "@app/logger/logger";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { UserMessageContext } from "@app/types/assistant/conversation";
import { ACTIVATION_NUDGE_ORIGIN } from "@app/types/assistant/conversation";
import type { TriggerType } from "@app/types/assistant/triggers";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { removeNulls } from "@app/types/shared/utils/general";
import { randomUUID } from "crypto";

// A single workspace-level webhook source is shared by all Activation Pods.
export const ACTIVATION_WEBHOOK_SOURCE_NAME = "Activation";
const ACTIVATION_POD_ID_FIELD = "podId";
const ACTIVATION_USER_ID_FIELD = "userId";
const ACTIVATION_TRIGGER_CUSTOM_PROMPT = "Run the Dust Training workflow.";

// A resource type that the activation nudge should drive the user toward
export type ActivationNudgePushedResourceType = "skill" | "agent";

// The context for what the activation nudge should drive the user toward
export type ActivationNudgeContext = {
  sessionGoal: string | null;
  pushedResourceType: ActivationNudgePushedResourceType | null;
  pushedResourceName: string | null;
};

// Filtering on both podId and userId ensures a given event only fires the target user.
// Note, these filter values are visible to the user in the trigger's configuration.
function activationTriggerFilter(podSId: string, userId: string): string {
  return `(and (eq "${ACTIVATION_POD_ID_FIELD}" "${podSId}") (eq "${ACTIVATION_USER_ID_FIELD}" "${userId}"))`;
}

// The webhook event body. podId/userId drive the trigger filter; the nudge
// context rides along and reaches the activation conversation as the webhook
// payload content fragment (the trigger sets `includePayload: true`), so we
// never mutate the shared trigger's prompt per-nudge.
function activationEventBody(
  podSId: string,
  userId: string,
  context?: ActivationNudgeContext
): Record<string, unknown> {
  return {
    [ACTIVATION_POD_ID_FIELD]: podSId,
    [ACTIVATION_USER_ID_FIELD]: userId,
    sessionGoal: context?.sessionGoal ?? null,
    pushedResourceType: context?.pushedResourceType ?? null,
    pushedResourceName: context?.pushedResourceName ?? null,
  };
}

// Fetches the shared Activation webhook source, creating it if it does not yet
// exist for the workspace. Runs under an admin authenticator because creating a
// webhook source requires system space administration.
async function getOrCreateActivationWebhookSource(
  adminAuth: Authenticator
): Promise<WebhookSourceResource> {
  const existing = await WebhookSourceResource.fetchByName(
    adminAuth,
    ACTIVATION_WEBHOOK_SOURCE_NAME
  );
  if (existing) {
    return existing;
  }

  return WebhookSourceResource.makeNew(
    adminAuth,
    {
      workspaceId: adminAuth.getNonNullableWorkspace().id,
      name: ACTIVATION_WEBHOOK_SOURCE_NAME,
      urlSecret: randomUUID().replace(/-/g, ""),
      secret: null,
      signatureHeader: null,
      signatureAlgorithm: null,
      provider: null,
      subscribedEvents: [],
    },
    {
      description: "Fires nudges to users in Activation Pods",
    }
  );
}

export async function getOrCreateActivationWebhookSourceView(
  adminAuth: Authenticator,
  pod: SpaceResource
): Promise<Result<WebhookSourcesViewResource, Error>> {
  try {
    const source = await getOrCreateActivationWebhookSource(adminAuth);

    const systemView =
      await WebhookSourcesViewResource.getWebhookSourceViewForSystemSpace(
        adminAuth,
        source.sId
      );
    if (!systemView) {
      return new Err(
        new Error("Activation webhook source system view not found.")
      );
    }

    // Scope the lookup to the pod's own space (idempotent on retries, and avoids
    // loading views for other pods — some of which may reference soft-deleted
    // spaces that would fail to resolve).
    const existingPodViews = await WebhookSourcesViewResource.listBySpace(
      adminAuth,
      pod
    );
    const existingPodView = existingPodViews.find(
      (v) => v.webhookSourceId === systemView.webhookSourceId
    );
    if (existingPodView) {
      return new Ok(existingPodView);
    }

    const podView = await WebhookSourcesViewResource.create(adminAuth, {
      systemView,
      space: pod,
    });

    return new Ok(podView);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

// Creates the pod's user-owned activation trigger. Runs under the creator's
// authenticator so the trigger is owned by the user.
//
// TODO(activation): creating the trigger on the user's behalf is temporary for
// testing. We will replace this with a consent path where the user explicitly
// opts in before we provision a trigger owned by them.
export async function createActivationTrigger(
  podMemberAuth: Authenticator,
  {
    pod,
    creator,
    podView,
  }: {
    pod: SpaceResource;
    creator: UserResource;
    podView: WebhookSourcesViewResource;
  }
): Promise<Result<{ triggerId: string }, Error>> {
  const spaceIdRes = await resolveTriggerSpaceId(podMemberAuth, pod.sId);
  if (spaceIdRes.isErr()) {
    return new Err(new Error(spaceIdRes.error));
  }

  const triggerRes = await TriggerResource.makeNew(podMemberAuth, {
    workspaceId: podMemberAuth.getNonNullableWorkspace().id,
    agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    name: "Activation - " + pod.name,
    kind: "webhook",
    status: "enabled",
    configuration: {
      // The per-nudge context (session goal, featured skill/agent) rides in the
      // event body and reaches the conversation as a payload content fragment.
      includePayload: true,
      filter: activationTriggerFilter(pod.sId, creator.sId),
    },
    naturalLanguageDescription: null,
    customPrompt: ACTIVATION_TRIGGER_CUSTOM_PROMPT,
    editor: creator.id,
    webhookSourceViewId: podView.id,
    executionPerDayLimitOverride: 10,
    executionMode: "fair_use",
    // Dust provisions this trigger on the user's behalf; they did not create it.
    origin: "system",
    spaceId: spaceIdRes.value,
  });

  if (triggerRes.isErr()) {
    return new Err(triggerRes.error);
  }

  return new Ok({ triggerId: triggerRes.value.sId });
}

// Maps each user who owns an Activation Pod to that pod and trigger. Used to
// decide, per target user, whether to provision a fresh pod or nudge an
// existing one.
export async function listActivationPodsByUser(
  adminAuth: Authenticator
): Promise<
  Map<number, { pod: SpaceResource; trigger: TriggerResource | null }>
> {
  const byUser = new Map<
    number,
    { pod: SpaceResource; trigger: TriggerResource | null }
  >();

  const activationPods =
    await ActivationPodResource.listForWorkspace(adminAuth);
  if (activationPods.length === 0) {
    return byUser;
  }

  const spaces = await SpaceResource.fetchByModelIds(
    adminAuth,
    activationPods.map((activationPod) => activationPod.spaceId)
  );
  const spaceByModelId = new Map(spaces.map((space) => [space.id, space]));

  const triggerModelIds = removeNulls(
    activationPods.map((activationPod) => activationPod.triggerId)
  );
  const triggers = await TriggerResource.fetchByModelIds(
    adminAuth,
    triggerModelIds
  );
  const triggerByModelId = new Map(
    triggers.map((trigger) => [trigger.id, trigger])
  );

  for (const activationPod of activationPods) {
    const pod = spaceByModelId.get(activationPod.spaceId);
    if (!pod) {
      continue;
    }
    const trigger =
      activationPod.triggerId !== null
        ? (triggerByModelId.get(activationPod.triggerId) ?? null)
        : null;
    byUser.set(activationPod.userId, { pod, trigger });
  }

  return byUser;
}

/**
 * The nudge that opens an Activation Pod conversation is posted by Dust on the
 * user's behalf, so it must not look like they wrote it: the agent's identity in
 * the context, and no author on the message row (the caller derives
 * `doNotAssociateUser` from the origin this sets). Returns the context unchanged
 * for every other trigger.
 *
 * `email` has to stay null: `postUserMessage` resolves an author from the
 * context email when the message has none, which would hand the nudge back to
 * the user.
 */
export async function applyActivationNudgeAuthorship(
  auth: Authenticator,
  {
    trigger,
    agentConfiguration,
    context,
  }: {
    trigger: TriggerType;
    agentConfiguration: AgentConfigurationType;
    context: UserMessageContext;
  }
): Promise<UserMessageContext> {
  // A nudge trigger is a webhook trigger scoped to its pod, so anything else
  // cannot be one and needs no lookup.
  if (trigger.kind !== "webhook" || !trigger.spaceId) {
    return context;
  }

  // `ActivationPod.triggerId` is written only by provisioning, which makes it
  // the server-owned fact identifying a firing as a nudge.
  const activationPod = await ActivationPodResource.fetchByTriggerModelId(
    auth,
    trigger.id
  );
  if (!activationPod) {
    return context;
  }

  return {
    ...context,
    username: agentConfiguration.name,
    fullName: agentConfiguration.name,
    email: null,
    profilePictureUrl: agentConfiguration.pictureUrl,
    origin: ACTIVATION_NUDGE_ORIGIN,
  };
}

// Fires the activation trigger for a single pod by emitting an internal webhook
// event. Returns the sId of the pod's activation trigger, if the event matched
// it (a pod has at most one activation trigger, via `activationTriggerFilter`).
export async function emitActivationEvent(
  auth: Authenticator,
  pod: SpaceResource,
  userId: string,
  context?: ActivationNudgeContext
): Promise<Result<{ triggerId: string | null }, Error>> {
  const source = await WebhookSourceResource.fetchByName(
    auth,
    ACTIVATION_WEBHOOK_SOURCE_NAME
  );
  if (!source) {
    return new Err(new Error("Activation webhook source not found."));
  }

  const body = activationEventBody(pod.sId, userId, context);

  const webhookRequest = await WebhookRequestResource.makeNew({
    workspaceId: auth.getNonNullableWorkspace().id,
    webhookSourceId: source.id,
    status: "received",
  });

  const result = await processWebhookRequest(auth, {
    webhookSource: source,
    webhookRequest,
    headers: {},
    body,
    rawBody: JSON.stringify(body),
  });

  if (result.isErr()) {
    logger.error(
      {
        spaceId: pod.sId,
        userId,
        workspaceId: auth.getNonNullableWorkspace().sId,
        error: result.error.message,
      },
      "Failed to emit activation webhook event"
    );
    return result;
  }

  return new Ok({ triggerId: result.value.triggerIds[0] ?? null });
}

export async function fireActivationNudge(
  adminAuth: Authenticator,
  {
    pod,
    trigger,
    targetUserId,
    context,
  }: {
    pod: SpaceResource;
    trigger: TriggerResource;
    targetUserId: string;
    context: ActivationNudgeContext;
  }
): Promise<Result<{ triggerId: string }, Error>> {
  const emitResult = await emitActivationEvent(
    adminAuth,
    pod,
    targetUserId,
    context
  );
  if (emitResult.isErr()) {
    return emitResult;
  }

  // The event was accepted but matched no trigger, so no conversation was
  // created. Callers report a nudge as sent, so this has to surface as a
  // failure rather than an empty success. The webhook request records which
  // check rejected it (payload filter, disabled trigger, per-day limit).
  const { triggerId } = emitResult.value;
  if (!triggerId) {
    return new Err(
      new Error(
        "The activation event fired no trigger, so no conversation was " +
          "created. See the Activation webhook source's requests for the reason."
      )
    );
  }

  // Record the nudge so it counts toward the scheduler's cooldown (same as the
  // auto-nudge path). A failure here must not fail the nudge itself (the event
  // already fired), so it is logged and swallowed. The session goal / pushed
  // resource are injected into the conversation, not persisted.
  try {
    await ActivationNudgeResource.makeNew(adminAuth, {
      pod,
      trigger,
    });
  } catch (err) {
    logger.error(
      {
        spaceId: pod.sId,
        userId: targetUserId,
        workspaceId: adminAuth.getNonNullableWorkspace().sId,
        error: normalizeError(err).message,
      },
      "Failed to record activation nudge"
    );
  }

  return new Ok({ triggerId });
}
