import type { Authenticator } from "@app/lib/auth";
import { TriggerRunModel } from "@app/lib/models/agent/triggers/trigger_run";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type {
  TriggerRunStatus,
  TriggerRunType,
} from "@app/types/assistant/triggers";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface TriggerRunResource
  extends ReadonlyAttributesType<TriggerRunModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class TriggerRunResource extends BaseResource<TriggerRunModel> {
  static model: ModelStatic<TriggerRunModel> = TriggerRunModel;

  constructor(
    model: ModelStatic<TriggerRunModel>,
    blob: Attributes<TriggerRunModel>
  ) {
    super(TriggerRunModel, blob);
  }

  static async makeNew(
    auth: Authenticator,
    blob: Omit<CreationAttributes<TriggerRunModel>, "workspaceId">,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<TriggerRunResource, Error>> {
    try {
      const triggerRun = await TriggerRunModel.create(
        {
          ...blob,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        { transaction }
      );

      return new Ok(new this(TriggerRunModel, triggerRun.get()));
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  get sId(): string {
    return TriggerRunResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  private static async baseFetch(
    auth: Authenticator,
    options: ResourceFindOptions<TriggerRunModel> = {}
  ) {
    const workspace = auth.getNonNullableWorkspace();

    const res = await this.model.findAll({
      where: {
        ...options.where,
        workspaceId: workspace.id,
      },
      limit: options.limit,
      order: [["startedAt", "DESC"]],
    });

    return res.map((c) => new this(this.model, c.get()));
  }

  static async listByTriggerId(
    auth: Authenticator,
    triggerId: ModelId,
    { limit, offset }: { limit?: number; offset?: number } = {}
  ): Promise<{ runs: TriggerRunResource[]; totalCount: number }> {
    const workspace = auth.getNonNullableWorkspace();

    const { rows, count } = await this.model.findAndCountAll({
      where: {
        workspaceId: workspace.id,
        triggerId,
      },
      limit,
      offset,
      order: [["startedAt", "DESC"]],
    });

    return {
      runs: rows.map((r) => new this(this.model, r.get())),
      totalCount: count,
    };
  }

  async complete(
    auth: Authenticator,
    {
      status,
      errorMessage,
      conversationId,
    }: {
      status: Exclude<TriggerRunStatus, "running">;
      errorMessage?: string;
      conversationId?: ModelId;
    }
  ): Promise<Result<void, Error>> {
    try {
      await this.update({
        status,
        completedAt: new Date(),
        ...(errorMessage !== undefined ? { errorMessage } : {}),
        ...(conversationId !== undefined ? { conversationId } : {}),
      });
      return new Ok(undefined);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction | undefined } = {}
  ): Promise<Result<undefined, Error>> {
    try {
      await TriggerRunModel.destroy({
        where: {
          id: this.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        transaction,
      });
      return new Ok(undefined);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("trigger_run", {
      id,
      workspaceId,
    });
  }

  toJSON(): TriggerRunType {
    return {
      sId: this.sId,
      triggerId: this.triggerId.toString(),
      conversationSId: null, // Will be enriched by the API layer
      userId: this.userId,
      status: this.status,
      errorMessage: this.errorMessage,
      startedAt: this.startedAt.getTime(),
      completedAt: this.completedAt?.getTime() ?? null,
    };
  }
}
