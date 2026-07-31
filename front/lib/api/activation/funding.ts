import type { Authenticator } from "@app/lib/auth";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";

// Origin of the system-authored opening message of an Activation Pod nudge.
// Server-only (not in `CLIENT_MESSAGE_ORIGINS`, rejected by
// `isUserMessageContextValid`), used as a label to keep nudges out of analytics
// and as the prefilter below.
export const ACTIVATION_NUDGE_ORIGIN: UserMessageOrigin = "system_activation";

// The facts the funding decision is made from. All of them are written by the
// server and none of them can be set through any endpoint.
export interface DustFundedRunFacts {
  origin: UserMessageOrigin | null;
  // Trigger the conversation was created by, if any.
  conversationTriggerModelId: ModelId | null;
  userMessage: {
    // Author of the message. Null for the nudge, which is posted with
    // `doNotAssociateUser`.
    userModelId: ModelId | null;
    rank: number;
    version: number;
  } | null;
  agentMessageVersion: number;
}

/**
 * Whether Dust funds this agent run: the nudge we send into an Activation Pod
 * opens the conversation on the user's behalf, so its first answer must not
 * consume their credits. Every reply after it bills normally.
 *
 * The decision is derived here, at usage time, from rows only the server
 * writes. It is deliberately NOT derived from `context.origin`:
 * - internal endpoints take the origin from the request body, so it is
 *   client-mintable within `CLIENT_MESSAGE_ORIGINS`;
 * - every "derive a new message from this one" path copies the whole context
 *   (edit, retry, branch merge), so an origin-based exemption is replayable.
 * Sidekick's `agent_sidekick` free origin was exploitable for exactly those two
 * reasons. `origin` is only a prefilter here: it keeps this lookup off normal
 * traffic and can exclude a run, never authorize one.
 *
 * The conjunction below is what authorizes:
 * - the conversation was created by an Activation Pod's nudge trigger
 *   (`ActivationPod.triggerId`, written only when a pod is provisioned);
 * - the triggering message has no author, which only server code can produce
 *   (`doNotAssociateUser`), and sits at rank 0 version 0, so it is the opening
 *   message and has not been edited;
 * - it is that message's first answer (agent message version 0), so retries
 *   bill.
 */
export async function isDustFundedActivationRun(
  auth: Authenticator,
  {
    origin,
    conversationTriggerModelId,
    userMessage,
    agentMessageVersion,
  }: DustFundedRunFacts
): Promise<boolean> {
  if (origin !== ACTIVATION_NUDGE_ORIGIN) {
    return false;
  }

  if (agentMessageVersion !== 0) {
    return false;
  }

  if (
    !userMessage ||
    userMessage.userModelId !== null ||
    userMessage.rank !== 0 ||
    userMessage.version !== 0
  ) {
    return false;
  }

  if (conversationTriggerModelId === null) {
    return false;
  }

  const activationPod = await ActivationPodResource.fetchByTriggerModelId(
    auth,
    conversationTriggerModelId
  );

  return activationPod !== null;
}
