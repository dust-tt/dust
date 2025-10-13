import assert from "assert";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op, Sequelize } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { AppModel } from "@app/lib/resources/storage/models/apps";
import {
  RunModel,
  RunUsageModel,
} from "@app/lib/resources/storage/models/runs";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { getRunExecutionsDeletionCutoffDate } from "@app/temporal/hard_delete/utils";
import type {
  LightWorkspaceType,
  ModelId,
  ModelIdType,
  ModelProviderIdType,
  Result,
} from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

type RunResourceWithApp = RunResource & { app: AppModel };

export type FetchRunOptions<T extends boolean> = {
  includeApp?: T;
  since?: Date;
  order?: [string, "ASC" | "DESC"][];
  limit?: number;
  offset?: number;
};

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

  private static getOptions<T extends boolean>(
    options?: FetchRunOptions<T>
  ): ResourceFindOptions<RunModel> {
    const result: ResourceFindOptions<RunModel> = {};

    if (options?.includeApp) {
      result.includes = [
        {
          model: AppModel,
          as: "app",
          required: true,
        },
      ];
    }

    if (options?.limit) {
      result.limit = options?.limit;
    }

    if (options?.offset) {
      result.offset = options.offset;
    }

    if (options?.since) {
      result.where = {
        createdAt: {
          [Op.gt]: options.since,
        },
      };
    }

    if (options?.order) {
      result.order = options.order;
    }

    return result;
  }

  static async listByWorkspace<T extends boolean>(
    workspace: LightWorkspaceType,
    options: FetchRunOptions<T>
  ): Promise<T extends true ? RunResourceWithApp[] : RunResource[]> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Disabled error for unused includeDeleted
    const { where, includes, includeDeleted, ...opts } =
      this.getOptions(options);

    const runs = await this.model.findAll({
      where: {
        ...where,
        workspaceId: workspace.id,
      },
      include: includes,
      ...opts,
    });

    return runs.map((r) =>
      options.includeApp
        ? (new this(this.model, r.get()) as RunResourceWithApp)
        : (new this(this.model, r.get()) as RunResource)
    ) as T extends true ? RunResourceWithApp[] : RunResource[];
  }

  static async countByWorkspace(
    workspace: LightWorkspaceType,
    options?: Pick<FetchRunOptions<boolean>, "since">
  ) {
    const { where } = this.getOptions(options);

    return this.model.count({
      where: {
        ...where,
        workspaceId: workspace.id,
      },
    });
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

  static async listByDustRunIds(
    auth: Authenticator,
    { dustRunIds }: { dustRunIds: string[] }
  ) {
    const runs = await this.model.findAll({
      where: {
        dustRunId: { [Op.in]: dustRunIds },
        workspaceId: auth.getNonNullableWorkspace().id,
      },
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
    assert(typeof appId === "number");
    await RunUsageModel.destroy({
      where: {
        runId: {
          [Op.in]: Sequelize.literal(
            // Sequelize prevents other safer constructs due to typing with the destroy method.
            // `appId` cannot be user provided + assert above.
            `(SELECT id FROM runs WHERE "appId" = '${appId}')`
          ),
        },
      },
      transaction,
    });

    return this.model.destroy({
      where: {
        appId,
      },
      transaction,
    });
  }

  static async deleteAllForWorkspace(auth: Authenticator) {
    const workspace = auth.getNonNullableWorkspace();

    assert(typeof workspace.id === "number");
    await RunUsageModel.destroy({
      where: {
        runId: {
          [Op.in]: Sequelize.literal(
            // Sequelize prevents other safer constructs due to typing with the destroy method.
            // `workspace.id` cannot cannot be user provided + assert above.
            `(SELECT id FROM runs WHERE "workspaceId" = '${workspace.id}')`
          ),
        },
      },
    });

    return this.model.destroy({
      where: { workspaceId: workspace.id },
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
      return new Err(normalizeError(err));
    }
  }

  /**
   * Run usage.
   */

  async recordRunUsage(usages: RunUsageType[]) {
    await RunUsageModel.bulkCreate(
      usages.map((usage) => ({
        runId: this.id,
        workspaceId: this.workspaceId,
        ...usage,
      }))
    );
  }

  async listRunUsages(auth: Authenticator): Promise<RunUsageType[]> {
    const usages = await RunUsageModel.findAll({
      where: {
        runId: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });

    return usages.map((usage) => ({
      completionTokens: usage.completionTokens,
      modelId: usage.modelId as ModelIdType,
      promptTokens: usage.promptTokens,
      providerId: usage.providerId as ModelProviderIdType,
      cachedTokens: usage.cachedTokens,
    }));
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
  completionTokens: number;
  modelId: ModelIdType;
  promptTokens: number;
  providerId: ModelProviderIdType;
  cachedTokens: number | null;
}
