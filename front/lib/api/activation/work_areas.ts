import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import type { ActivationWorkAreaStatus } from "@app/lib/models/activation/activation_work_area";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { ActivationWorkAreaResource } from "@app/lib/resources/activation_work_area_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export interface ActivationWorkAreaForUserType {
  sId: string;
  title: string;
  description: string;
  status: ActivationWorkAreaStatus;
  createdAt: number;
}

export interface GetActivationWorkAreasResponseBody {
  workAreas: ActivationWorkAreaForUserType[];
}

export interface UpdateActivationWorkAreaResponseBody {
  success: true;
}

export async function listActivationWorkAreasForUser(
  auth: Authenticator,
  {
    status,
    podId,
  }: {
    status?: ActivationWorkAreaStatus;
    podId?: string;
  } = {}
): Promise<ActivationWorkAreaForUserType[]> {
  let activationPodModelId;
  if (podId !== undefined) {
    const space = await SpaceResource.fetchById(auth, podId);
    if (!space) {
      return [];
    }

    const activationPod = await ActivationPodResource.fetchByUser(auth);
    if (!activationPod || activationPod.spaceId !== space.id) {
      return [];
    }
    activationPodModelId = activationPod.id;
  }

  const rows = await ActivationWorkAreaResource.listByUserAndStatus(auth, {
    status,
    activationPodModelId,
  });

  return rows.map((r) => r.toJSON());
}

export async function updateActivationWorkAreaForUser(
  auth: Authenticator,
  {
    workAreaId,
    status,
    title,
    description,
  }: {
    workAreaId: string;
    status?: ActivationWorkAreaStatus;
    title?: string;
    description?: string;
  }
): Promise<Result<undefined, DustError<"activation_work_area_not_found">>> {
  const row = await ActivationWorkAreaResource.fetchById(auth, workAreaId);

  // fetchById only scopes to the workspace, so also enforce ownership: a work
  // area may only be updated by the user it belongs to. Return "not_found"
  // rather than a distinct error so we don't leak the existence of another
  // user's work area.
  if (!row || row.userId !== auth.getNonNullableUser().id) {
    return new Err(
      new DustError("activation_work_area_not_found", "Work area not found.")
    );
  }

  await row.updateFields({ status, title, description });

  return new Ok(undefined);
}
