import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
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
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { randomUUID } from "crypto";

// A single workspace-level webhook source is shared by all Activation Pods.
const ACTIVATION_WEBHOOK_SOURCE_NAME = "Activation";
const ACTIVATION_POD_ID_FIELD = "podId";
const ACTIVATION_TRIGGER_CUSTOM_PROMPT = `Run the activation workflow.
`;
function activationTriggerFilter(podSId: string): string {
  return `(eq "${ACTIVATION_POD_ID_FIELD}" "${podSId}")`;
}

function activationEventBody(podSId: string): Record<string, unknown> {
  return { [ACTIVATION_POD_ID_FIELD]: podSId };
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
      includePayload: false,
      filter: activationTriggerFilter(pod.sId),
    },
    naturalLanguageDescription: null,
    customPrompt: ACTIVATION_TRIGGER_CUSTOM_PROMPT,
    editor: creator.id,
    webhookSourceViewId: podView.id,
    executionPerDayLimitOverride: 5,
    executionMode: "fair_use",
    // TODO(activation): "user" is not strictly accurate since the trigger is
    // provisioned on the user's behalf rather than by them. This is temporary:
    // once the consent path lands (see above) the trigger is genuinely
    // user-owned, making "user" correct.
    origin: "user",
    spaceId: spaceIdRes.value,
  });

  if (triggerRes.isErr()) {
    return new Err(triggerRes.error);
  }

  return new Ok({ triggerId: triggerRes.value.sId });
}

// Fires the activation trigger for a single pod by emitting an internal webhook event.
export async function emitActivationEvent(
  auth: Authenticator,
  pod: SpaceResource
): Promise<Result<void, Error>> {
  const source = await WebhookSourceResource.fetchByName(
    auth,
    ACTIVATION_WEBHOOK_SOURCE_NAME
  );
  if (!source) {
    return new Err(new Error("Activation webhook source not found."));
  }

  const body = activationEventBody(pod.sId);

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
        workspaceId: auth.getNonNullableWorkspace().sId,
        error: result.error.message,
      },
      "Failed to emit activation webhook event"
    );
    return result;
  }

  return new Ok(undefined);
}
