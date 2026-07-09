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

// A single workspace-level webhook source is shared by all Activation Pods.
export const ACTIVATION_WEBHOOK_SOURCE_NAME = "Activation";

const ACTIVATION_POD_ID_FIELD = "podId";

export const ACTIVATION_CUSTOM_PROMPT =
  "Welcome me to my new Pod and recommend the next best action to get more value from Dust." +
  " Also, pin a frame to the Pod that recommends skills, features, use cases, etc for me to explore" +
  " and ensure that it is small enough so all the content is visible without scrolling.";

function activationTriggerFilter(podSId: string): string {
  return `(eq "${ACTIVATION_POD_ID_FIELD}" "${podSId}")`;
}

function activationEventBody(podSId: string): Record<string, unknown> {
  return { [ACTIVATION_POD_ID_FIELD]: podSId };
}

export async function ensureActivationPodView(
  adminAuth: Authenticator,
  pod: SpaceResource
): Promise<Result<WebhookSourcesViewResource, Error>> {
  try {
    const source = await WebhookSourceResource.fetchByName(
      adminAuth,
      ACTIVATION_WEBHOOK_SOURCE_NAME
    );
    if (!source) {
      return new Err(
        new Error(
          `Webhook source "${ACTIVATION_WEBHOOK_SOURCE_NAME}" is not provisioned ` +
            "for this workspace. Create it via the webhook sources admin UI (or " +
            "the triggers seed in local dev) before provisioning Activation Pods."
        )
      );
    }

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

    const existingViews = await WebhookSourcesViewResource.listByWebhookSource(
      adminAuth,
      systemView.webhookSourceId
    );
    const existingPodView = existingViews.find((v) => v.space.sId === pod.sId);
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
    name: "Activation kickoff",
    kind: "webhook",
    status: "enabled",
    configuration: {
      includePayload: false,
      filter: activationTriggerFilter(pod.sId),
    },
    naturalLanguageDescription: null,
    customPrompt: ACTIVATION_CUSTOM_PROMPT,
    editor: creator.id,
    webhookSourceViewId: podView.id,
    executionPerDayLimitOverride: 1,
    executionMode: "fair_use",
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
