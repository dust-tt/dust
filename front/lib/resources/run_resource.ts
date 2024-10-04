import type {
  LightWorkspaceType,
  ModelId,
  ModelIdType,
  ModelProviderIdType,
  Result,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { AppModel } from "@app/lib/resources/storage/models/apps";
import {
  RunModel,
  RunUsageModel,
} from "@app/lib/resources/storage/models/runs";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getRunExecutionsDeletionCutoffDate } from "@app/temporal/hard_delete/utils";

type RunResourceWithApp = RunResource & { app: AppModel };

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface RunResource extends ReadonlyAttributesType<RunModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class RunResource extends BaseResource<RunModel> {
  static model: ModelStatic<RunModel> = RunModel;

  constructor(model: ModelStatic<RunModel>, blob: Attributes<RunModel>) {
    super(RunModel, blob);
  }

  static async makeNew(blob: CreationAttributes<RunModel>) {
    const run = await RunResource.model.create(blob);

    return new this(RunResource.model, run.get());
  }

  static async listByWorkspace<T extends boolean>(
    workspace: LightWorkspaceType,
    { includeApp }: { includeApp: T }
  ): Promise<T extends true ? RunResourceWithApp[] : RunResource[]> {
    const include = includeApp
      ? [
          {
            model: AppModel,
            as: "app",
            required: true,
          },
        ]
      : [];

    const runs = await this.model.findAll({
      where: addCreatedAtClause({
        workspaceId: workspace.id,
      }),
      include,
    });

    return runs.map((r) =>
      includeApp
        ? (new this(this.model, r.get()) as RunResourceWithApp)
        : (new this(this.model, r.get()) as RunResource)
    ) as T extends true ? RunResourceWithApp[] : RunResource[];
  }

  static async listByAppAndRunType(
    workspace: LightWorkspaceType,
    { appId, runType }: { appId: ModelId; runType: string | string[] },
    { limit, offset }: { limit?: number; offset?: number } = {}
  ): Promise<RunResource[]> {
    const where: WhereOptions<RunModel> = {
      appId,
      runType,
      workspaceId: workspace.id,
    };

    const runs = await this.model.findAll({
      where: addCreatedAtClause(where),
      limit,
      offset,
      order: [["createdAt", "DESC"]],
    });

    return runs.map((r) => new this(this.model, r.get()));
  }

  static async countByAppAndRunType(
    workspace: LightWorkspaceType,
    { appId, runType }: { appId: ModelId; runType: string | string[] }
  ) {
    const where: WhereOptions<RunModel> = {
      appId,
      runType,
      workspaceId: workspace.id,
    };

    return this.model.count({
      where: addCreatedAtClause(where),
    });
  }

  static async deleteAllByAppId(appId: ModelId, transaction?: Transaction) {
    // TODO: First, delete the run_usage before deleting the run.

    return this.model.destroy({
      where: {
        appId,
      },
      transaction,
    });
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    try {
      // Delete the run usage entry.
      await RunUsageModel.destroy({
        where: {
          runId: this.id,
        },
        transaction,
      });

      // Then, delete the run.
      await this.model.destroy({
        where: {
          id: this.id,
        },
        transaction,
      });

      return new Ok(undefined);
    } catch (err) {
      return new Err(err as Error);
    }
  }

  /**
   * Run usage.
   */
  async recordRunUsage(usages: RunUsageType[]) {
    await RunUsageModel.bulkCreate(
      usages.map((usage) => ({
        runId: this.id,
        ...usage,
      }))
    );
  }
}

// Runs are not deleted from front but may no longer exist in core.
// Apply the cutoff date at runtime.
function addCreatedAtClause(where: WhereOptions<RunModel>) {
  return {
    ...where,
    createdAt: { [Op.gt]: getRunExecutionsDeletionCutoffDate() },
  };
}

export interface RunUsageType {
  providerId: ModelProviderIdType;
  modelId: ModelIdType;
  promptTokens: number;
  completionTokens: number;
}
