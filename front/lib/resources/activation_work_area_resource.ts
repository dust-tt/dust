import type { Authenticator } from "@app/lib/auth";
import type {
  ActivationWorkAreaStatus,
  PublicActivationWorkAreaStatus,
} from "@app/lib/models/activation/activation_work_area";
import { ActivationWorkAreaModel } from "@app/lib/models/activation/activation_work_area";
import type { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { Attributes, ModelStatic, Transaction } from "sequelize";
import { Op } from "sequelize";

// Maps a stored status (which may hold legacy values) to the public status
// exposed to callers. Legacy `candidate`/`confirmed` rows read as `suggested`.
function publicActivationWorkAreaStatus(
  status: ActivationWorkAreaStatus
): PublicActivationWorkAreaStatus {
  switch (status) {
    case "dismissed":
      return "dismissed";
    case "suggested":
    case "candidate":
    case "confirmed":
      return "suggested";
    default:
      assertNever(status);
  }
}

// Expands a public status into the set of stored values that match it, so
// filtering by `suggested` also returns legacy `candidate`/`confirmed` rows.
function matchingActivationWorkAreaStatuses(
  status: PublicActivationWorkAreaStatus
): ActivationWorkAreaStatus[] {
  switch (status) {
    case "dismissed":
      return ["dismissed"];
    case "suggested":
      return ["suggested", "candidate", "confirmed"];
    default:
      assertNever(status);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ActivationWorkAreaResource
  extends ReadonlyAttributesType<ActivationWorkAreaModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ActivationWorkAreaResource extends BaseResource<ActivationWorkAreaModel> {
  static model: ModelStaticWorkspaceAware<ActivationWorkAreaModel> =
    ActivationWorkAreaModel;

  constructor(
    _: ModelStatic<ActivationWorkAreaModel>,
    blob: Attributes<ActivationWorkAreaModel>
  ) {
    super(ActivationWorkAreaModel, blob);
  }

  get sId(): string {
    return ActivationWorkAreaResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("activation_work_area", { id, workspaceId });
  }

  static async makeNew(
    auth: Authenticator,
    blob: { title: string; description: string; podId: ModelId }
  ): Promise<ActivationWorkAreaResource> {
    const workspace = auth.getNonNullableWorkspace();

    const row = await this.model.create({
      workspaceId: workspace.id,
      status: "suggested",
      title: blob.title,
      description: blob.description,
      podId: blob.podId,
    });

    return new this(this.model, row.get());
  }

  static async makeNewMany(
    auth: Authenticator,
    items: {
      activationPod: ActivationPodResource;
      title: string;
      description: string;
    }[]
  ): Promise<ActivationWorkAreaResource[]> {
    if (items.length === 0) {
      return [];
    }

    const workspace = auth.getNonNullableWorkspace();
    const rows = await this.model.bulkCreate(
      items.map(({ activationPod, title, description }) => ({
        workspaceId: workspace.id,
        status: "suggested" as const,
        title,
        description,
        podId: activationPod.id,
      }))
    );

    return rows.map((row) => new this(this.model, row.get()));
  }

  static async fetchById(
    auth: Authenticator,
    sId: string
  ): Promise<ActivationWorkAreaResource | null> {
    const resourceId = getResourceIdFromSId(sId);
    if (!resourceId) {
      return null;
    }

    const row = await this.model.findOne({
      where: {
        id: resourceId,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });

    if (!row) {
      return null;
    }

    return new this(this.model, row.get());
  }

  static async listByActivationPods(
    auth: Authenticator,
    {
      activationPods,
      status,
    }: {
      activationPods: ActivationPodResource[];
      status?: PublicActivationWorkAreaStatus;
    }
  ): Promise<ActivationWorkAreaResource[]> {
    if (activationPods.length === 0) {
      return [];
    }

    const rows = await this.model.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        podId: activationPods.map((p) => p.id),
        ...(status !== undefined
          ? { status: { [Op.in]: matchingActivationWorkAreaStatuses(status) } }
          : {}),
      },
      order: [
        ["podId", "ASC"],
        ["createdAt", "ASC"],
      ],
    });

    return rows.map((row) => new this(this.model, row.get()));
  }

  static async deleteAllForActivationPod(
    auth: Authenticator,
    activationPod: ActivationPodResource
  ): Promise<void> {
    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        podId: activationPod.id,
      },
    });
  }

  static async deleteAllForWorkspace(auth: Authenticator): Promise<undefined> {
    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
  }

  async updateFields(fields: {
    status?: PublicActivationWorkAreaStatus;
    title?: string;
    description?: string;
  }): Promise<Result<undefined, Error>> {
    const patch: Partial<Attributes<ActivationWorkAreaModel>> = {};
    if (fields.status !== undefined) {
      patch.status = fields.status;
    }
    if (fields.title !== undefined) {
      patch.title = fields.title;
    }
    if (fields.description !== undefined) {
      patch.description = fields.description;
    }

    if (Object.keys(patch).length === 0) {
      return new Ok(undefined);
    }

    await this.update(patch);

    return new Ok(undefined);
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    try {
      await this.model.destroy({
        where: {
          id: this.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        transaction,
      });
      return new Ok(undefined);
    } catch (err) {
      return new Err(err instanceof Error ? err : new Error(String(err)));
    }
  }

  toJSON() {
    return {
      sId: this.sId,
      title: this.title,
      description: this.description,
      status: publicActivationWorkAreaStatus(this.status),
      createdAt: this.createdAt.getTime(),
    };
  }
}
