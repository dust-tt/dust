import type { Authenticator } from "@app/lib/auth";
import type { ActivationWorkAreaStatus } from "@app/lib/models/activation/activation_work_area";
import { ActivationWorkAreaModel } from "@app/lib/models/activation/activation_work_area";
import type { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { BaseResource } from "@app/lib/resources/base_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type {
  Attributes,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";

type NewUserActivationWorkArea = { title: string; description: string };

type NewUserActivationWorkAreaAssignment = {
  owner: UserResource;
  activationPodModelId: ModelId;
  workAreas: NewUserActivationWorkArea[];
};

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
    const user = auth.getNonNullableUser();

    const row = await this.model.create({
      workspaceId: workspace.id,
      userId: user.id,
      status: "suggested",
      title: blob.title,
      description: blob.description,
      podId: blob.podId,
    });

    return new this(this.model, row.get());
  }

  static async makeNewForUsers(
    auth: Authenticator,
    { assignments }: { assignments: NewUserActivationWorkAreaAssignment[] }
  ): Promise<Result<ActivationWorkAreaResource[], Error>> {
    if (!auth.isAdmin()) {
      return new Err(
        new Error(
          "Only workspace admins can create work areas for another user."
        )
      );
    }

    const workspace = auth.getNonNullableWorkspace();
    const owners = assignments.map((a) => a.owner);
    const uniqueOwnerIds = new Set(owners.map((o) => o.id));
    if (uniqueOwnerIds.size !== owners.length) {
      return new Err(
        new Error("Each user may appear in only one work-area assignment.")
      );
    }

    const { memberships } = await MembershipResource.getActiveMemberships({
      workspace,
      users: owners,
    });
    const activeUserIds = new Set(memberships.map((m) => m.userId));
    const inactiveOwners = owners.filter((o) => !activeUserIds.has(o.id));
    if (inactiveOwners.length > 0) {
      return new Err(
        new Error(
          "Users are not active members of this workspace: " +
            `${inactiveOwners.map((o) => o.sId).join(", ")}.`
        )
      );
    }

    const rows = await this.model.bulkCreate(
      assignments.flatMap(({ owner, activationPodModelId, workAreas }) =>
        workAreas.map((workArea) => ({
          workspaceId: workspace.id,
          userId: owner.id,
          status: "suggested" as const,
          title: workArea.title,
          description: workArea.description,
          podId: activationPodModelId,
        }))
      )
    );

    return new Ok(rows.map((row) => new this(this.model, row.get())));
  }

  static async listByUsersAndStatus(
    auth: Authenticator,
    {
      users,
      status,
    }: { users: UserResource[]; status?: ActivationWorkAreaStatus }
  ): Promise<ActivationWorkAreaResource[]> {
    if (users.length === 0) {
      return [];
    }

    const rows = await this.model.findAll({
      where: {
        userId: users.map((u) => u.id),
        workspaceId: auth.getNonNullableWorkspace().id,
        ...(status !== undefined ? { status } : {}),
      },
      order: [
        ["userId", "ASC"],
        ["createdAt", "ASC"],
      ],
    });

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

  static async listByUserAndStatus(
    auth: Authenticator,
    {
      status,
      activationPodModelId,
      user: targetUser,
    }: {
      status?: ActivationWorkAreaStatus;
      activationPodModelId?: ModelId;
      user?: UserResource;
    }
  ): Promise<ActivationWorkAreaResource[]> {
    const user = targetUser ?? auth.getNonNullableUser();

    const where: WhereOptions<ActivationWorkAreaModel> = {
      userId: user.id,
      workspaceId: auth.getNonNullableWorkspace().id,
      ...(status !== undefined ? { status } : {}),
      ...(activationPodModelId !== undefined
        ? { podId: activationPodModelId }
        : {}),
    };

    const rows = await this.model.findAll({
      where,
      order: [["createdAt", "ASC"]],
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
    status?: ActivationWorkAreaStatus;
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
      status: this.status,
      createdAt: this.createdAt.getTime(),
    };
  }
}
