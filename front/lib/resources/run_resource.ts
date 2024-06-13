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

import { App } from "@app/lib/models/apps";
import { BaseResource } from "@app/lib/resources/base_resource";
import {
  RunModel,
  RunUsageModel,
} from "@app/lib/resources/storage/models/runs";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";

type RunResourceWithApp = RunResource & { app: App };

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

  async recordRunUsage(usages: RunUsageType[]) {
    await RunUsageModel.bulkCreate(
      usages.map((usage) => ({
        runId: this.id,
        ...usage,
      }))
    );
  }

  static async listByWorkspace<T extends boolean>(
    workspace: LightWorkspaceType,
    { includeApp }: { includeApp: T }
  ): Promise<T extends true ? RunResourceWithApp[] : RunResource[]> {
    const include = includeApp
      ? [
          {
            model: App,
            as: "app",
            required: true,
          },
        ]
      : [];

    const runs = await this.model.findAll({
      where: {
        workspaceId: workspace.id,
      },
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
    { appId, runType }: { appId: ModelId; runType?: string | string[] },
    { limit, offset }: { limit?: number; offset?: number } = {}
  ): Promise<RunResource[]> {
    const where: WhereOptions<RunModel> = {
      appId,
      workspaceId: workspace.id,
    };

    if (runType) {
      where.runType = runType;
    }

    const runs = await this.model.findAll({
      where,
      limit,
      offset,
      order: [["createdAt", "DESC"]],
    });

    return runs.map((r) => new this(this.model, r.get()));
  }

  static async countAllByWorkspace(
    workspace: LightWorkspaceType,
    { appId, runType }: { appId: ModelId; runType?: string | string[] }
  ) {
    const where: WhereOptions<RunModel> = {
      appId,
      workspaceId: workspace.id,
    };

    if (runType) {
      where.runType = runType;
    }

    return this.model.count({
      where,
    });
  }

  static async deleteAllByAppId(appId: ModelId, transaction?: Transaction) {
    return this.model.destroy({
      where: {
        appId,
      },
      transaction,
    });
  }

  async delete(transaction?: Transaction): Promise<Result<undefined, Error>> {
    try {
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
}

export interface RunUsageType {
  providerId: ModelProviderIdType;
  modelId: ModelIdType;
  promptTokens: number;
  completionTokens: number;
}
