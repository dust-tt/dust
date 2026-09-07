import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import type { PublicActivationWorkAreaStatus } from "@app/lib/models/activation/activation_work_area";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { ActivationWorkAreaResource } from "@app/lib/resources/activation_work_area_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export interface ActivationWorkAreaForUserType {
  sId: string;
  title: string;
  description: string;
  status: PublicActivationWorkAreaStatus;
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
    status?: PublicActivationWorkAreaStatus;
    podId?: string;
  } = {}
): Promise<ActivationWorkAreaForUserType[]> {
  let activationPods: ActivationPodResource[];

  if (podId !== undefined) {
    const space = await SpaceResource.fetchById(auth, podId);
    if (!space || !auth.can("admin", space)) {
      return [];
    }

    const activationPod = await ActivationPodResource.fetchBySpace(auth, space);
    if (!activationPod) {
      return [];
    }
    activationPods = [activationPod];
  } else {
    activationPods = await ActivationPodResource.listByUser(auth);
  }

  const rows = await ActivationWorkAreaResource.listByActivationPods(auth, {
    activationPods,
    status,
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
    status?: PublicActivationWorkAreaStatus;
    title?: string;
    description?: string;
  }
): Promise<Result<undefined, DustError<"activation_work_area_not_found">>> {
  const row = await ActivationWorkAreaResource.fetchById(auth, workAreaId);

  // fetchById only scopes to the workspace. Authorize like other Pod edits:
  // the caller must be a pod editor or workspace admin. Return "not_found"
  // rather than a distinct error so we don't leak the existence of a work
  // area the caller cannot manage.
  const [activationPod] = row
    ? await ActivationPodResource.fetchByModelIds(auth, [row.podId])
    : [];
  const [space] = activationPod
    ? await SpaceResource.fetchByModelIds(auth, [activationPod.spaceId])
    : [];
  if (!row || !space || !auth.can("admin", space)) {
    return new Err(
      new DustError("activation_work_area_not_found", "Work area not found.")
    );
  }

  await row.updateFields({ status, title, description });

  return new Ok(undefined);
}
