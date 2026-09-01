import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import {
  TakeawaySourcesModel,
  TakeawaysModel,
  TakeawaysVersionModel,
} from "@app/lib/resources/storage/models/takeaways";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeSId } from "@app/lib/resources/string_ids";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type {
  Attributes,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";

/**
 * Retained only for scrubbing leftover takeaways rows after automated task
 * generation was removed. Do not add new generation/write paths here.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface TakeawaysResource
  extends ReadonlyAttributesType<TakeawaysModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class TakeawaysResource extends BaseResource<TakeawaysModel> {
  static model: ModelStaticWorkspaceAware<TakeawaysModel> = TakeawaysModel;

  constructor(
    model: ModelStatic<TakeawaysModel>,
    blob: Attributes<TakeawaysModel>
  ) {
    super(TakeawaysModel, blob);
  }

  get sId(): string {
    return TakeawaysResource.modelIdToSId({
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
    return makeSId("takeaways", { id, workspaceId });
  }

  static async deleteAllForSpace(
    auth: Authenticator,
    { spaceModelId }: { spaceModelId: ModelId }
  ): Promise<void> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const takeawayIds = (
      await TakeawaysModel.findAll({
        attributes: ["id"],
        where: { workspaceId, spaceId: spaceModelId },
        raw: true,
      })
    ).map((r) => r.id);

    if (takeawayIds.length > 0) {
      await TakeawaySourcesModel.destroy({
        where: { workspaceId, takeawaysId: { [Op.in]: takeawayIds } },
      });

      const versionWhere: WhereOptions<TakeawaysVersionModel> = {
        workspaceId,
        takeawaysId: { [Op.in]: takeawayIds },
      };
      await TakeawaysVersionModel.destroy({ where: versionWhere });
    }

    await TakeawaysModel.destroy({
      where: { workspaceId, spaceId: spaceModelId },
    });
  }

  static async deleteAllForWorkspace(auth: Authenticator): Promise<void> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    await TakeawaySourcesModel.destroy({ where: { workspaceId } });
    await TakeawaysVersionModel.destroy({ where: { workspaceId } });
    await TakeawaysModel.destroy({ where: { workspaceId } });
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    await TakeawaySourcesModel.destroy({
      where: { workspaceId, takeawaysId: this.id },
      transaction,
    });

    const versionWhere: WhereOptions<TakeawaysVersionModel> = {
      workspaceId,
      takeawaysId: this.id,
    };
    await TakeawaysVersionModel.destroy({ where: versionWhere, transaction });

    await this.model.destroy({
      where: { id: this.id, workspaceId },
      transaction,
    });

    return new Ok(undefined);
  }
}
