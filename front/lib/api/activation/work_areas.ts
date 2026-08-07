import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import type { ActivationWorkAreaStatus } from "@app/lib/models/activation/activation_work_area";
import { ActivationWorkAreaResource } from "@app/lib/resources/activation_work_area_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { ModelId } from "@app/types/shared/model_id";
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
  items: CreateActivationWorkAreaItem[],
  podId: ModelId
): Promise<ActivationWorkAreaForUserType[]> {
  const created = await concurrentExecutor(
    items,
    (item) =>
      ActivationWorkAreaResource.makeNew(auth, {
        title: item.title,
        description: item.description,
        podId,
      }),
    { concurrency: 8 }
  );

  return created.map((r) => r.toJSON());
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
): Promise<
  Result<
    undefined,
    DustError<"activation_work_area_not_found" | "unauthorized">
  >
> {
  const row = await ActivationWorkAreaResource.fetchById(auth, workAreaId);

  if (!row) {
    return new Err(
      new DustError("activation_work_area_not_found", "Work area not found.")
    );
  }

  if (row.userId !== auth.getNonNullableUser().id) {
    return new Err(
      new DustError(
        "unauthorized",
        "Cannot update a work area owned by another user."
      )
    );
  }

  await row.updateFields({ status, title, description });

  return new Ok(undefined);
}
