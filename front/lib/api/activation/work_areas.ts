import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import type { ActivationWorkAreaStatus } from "@app/lib/models/activation/activation_work_area";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { ActivationWorkAreaResource } from "@app/lib/resources/activation_work_area_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
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

export interface CreateActivationWorkAreaItem {
  title: string;
  description: string;
}

export interface CreateActivationWorkAreasResponseBody {
  workAreas: ActivationWorkAreaForUserType[];
}

export interface UpdateActivationWorkAreaResponseBody {
  success: true;
}

export async function listActivationWorkAreasForUser(
  auth: Authenticator,
  { status }: { status?: ActivationWorkAreaStatus } = {}
): Promise<ActivationWorkAreaForUserType[]> {
  const rows = await ActivationWorkAreaResource.listByUserAndStatus(auth, {
    status,
  });

  return rows.map((r) => r.toJSON());
}

export async function createActivationWorkAreasForUser(
  auth: Authenticator,
  items: CreateActivationWorkAreaItem[]
): Promise<
  Result<ActivationWorkAreaForUserType[], DustError<"activation_pod_not_found">>
> {
  const pod = await ActivationPodResource.fetchByUser(auth);
  if (!pod) {
    return new Err(
      new DustError(
        "activation_pod_not_found",
        "No activation pod found for this user."
      )
    );
  }

  const created = await concurrentExecutor(
    items,
    (item) =>
      ActivationWorkAreaResource.makeNew(auth, {
        title: item.title,
        description: item.description,
        podId: pod.id,
      }),
    { concurrency: 8 }
  );

  return new Ok(created.map((r) => r.toJSON()));
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
