import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { SandboxStatus } from "@app/lib/resources/storage/models/sandbox";
import { SandboxModel } from "@app/lib/resources/storage/models/sandbox";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SandboxResource extends ReadonlyAttributesType<SandboxModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SandboxResource extends BaseResource<SandboxModel> {
  static model: ModelStaticWorkspaceAware<SandboxModel> = SandboxModel;

  constructor(
    _model: ModelStatic<SandboxModel>,
    blob: Attributes<SandboxModel>
  ) {
    super(SandboxModel, blob);
  }

  get sId(): string {
    return SandboxResource.modelIdToSId({
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
    return makeSId("sandbox", { id, workspaceId });
  }

  static async makeNew(
    auth: Authenticator,
    blob: {
      conversationId: number;
      providerId: string;
      status: SandboxStatus;
    },
    { transaction }: { transaction?: Transaction } = {}
  ) {
    const sandbox = await this.model.create(
      {
        ...blob,
        workspaceId: auth.getNonNullableWorkspace().id,
        lastActivityAt: new Date(),
      },
      { transaction }
    );

    return new this(this.model, sandbox.get());
  }

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<SandboxModel>
  ) {
    const { where, ...rest } = options ?? {};
    const rows = await this.model.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      ...rest,
    });

    return rows.map((r) => new this(this.model, r.get()));
  }

  static async fetchByConversationId(
    auth: Authenticator,
    conversationId: number
  ): Promise<SandboxResource | null> {
    const [row] = await this.baseFetch(auth, {
      where: { conversationId },
    });

    return row ?? null;
  }

  async updateStatus(
    status: SandboxStatus,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<[affectedCount: number]> {
    return this.update({ status }, transaction);
  }

  async updateLastActivityAt({
    transaction,
  }: {
    transaction?: Transaction;
  } = {}): Promise<[affectedCount: number]> {
    return this.update({ lastActivityAt: new Date() }, transaction);
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<number, Error>> {
    const deletedCount = await SandboxModel.destroy({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });

    return new Ok(deletedCount);
  }

  toLogJSON() {
    return {
      id: this.sId,
      workspaceId: this.workspaceId,
      conversationId: this.conversationId,
      providerId: this.providerId,
      status: this.status,
      lastActivityAt: this.lastActivityAt.toISOString(),
    };
  }
}
