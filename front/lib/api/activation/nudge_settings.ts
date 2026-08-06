import type { Authenticator } from "@app/lib/auth";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { z } from "zod";

// `null` when the space is not an Activation Pod of the calling user, i.e.
// when there are no nudges to turn on or off.
export type ActivationNudgeSettings = {
  nudgesEnabled: boolean;
} | null;

export type GetActivationNudgeSettingsResponseBody = {
  activationNudgeSettings: ActivationNudgeSettings;
};

export type PatchActivationNudgeSettingsResponseBody =
  GetActivationNudgeSettingsResponseBody;

export const PatchActivationNudgeSettingsBodySchema = z.object({
  nudgesEnabled: z.boolean(),
});

// Nudges are addressed to one person, so only that person decides whether they
// keep coming.
async function fetchOwnActivationPod(
  auth: Authenticator,
  pod: SpaceResource
): Promise<ActivationPodResource | null> {
  const activationPod = await ActivationPodResource.fetchBySpace(auth, pod);
  if (!activationPod) {
    return null;
  }

  const user = auth.user();
  if (!user || activationPod.userId !== user.id) {
    return null;
  }

  return activationPod;
}

export async function getActivationNudgeSettings(
  auth: Authenticator,
  pod: SpaceResource
): Promise<ActivationNudgeSettings> {
  const activationPod = await fetchOwnActivationPod(auth, pod);
  if (!activationPod) {
    return null;
  }

  return { nudgesEnabled: activationPod.nudgesDisabledAt === null };
}

export async function setActivationNudgesEnabled(
  auth: Authenticator,
  pod: SpaceResource,
  { nudgesEnabled }: { nudgesEnabled: boolean }
): Promise<ActivationNudgeSettings> {
  const activationPod = await fetchOwnActivationPod(auth, pod);
  if (!activationPod) {
    return null;
  }

  if (nudgesEnabled) {
    await activationPod.enableNudges();
  } else {
    await activationPod.disableNudges();
  }

  return { nudgesEnabled };
}
