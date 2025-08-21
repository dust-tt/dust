import type { Result } from "@dust-tt/client";
import { assertNever, Err, Ok } from "@dust-tt/client";
import type {
  Attributes,
  CreationAttributes,
  InferAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { TriggerModel } from "@app/lib/models/assistant/triggers";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import {
  createOrUpdateAgentScheduleWorkflow,
  deleteAgentScheduleWorkflow,
} from "@app/temporal/agent_schedule/client";
import type { WorkspaceType } from "@app/types";
import { normalizeError } from "@app/types";
import type { TriggerType } from "@app/types/assistant/triggers";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface TriggerResource extends ReadonlyAttributesType<TriggerModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class TriggerResource extends BaseResource<TriggerModel> {
  static model: ModelStatic<TriggerModel> = TriggerModel;

  constructor(
    model: ModelStatic<TriggerModel>,
    blob: Attributes<TriggerModel>
  ) {
    super(TriggerModel, blob);
  }

  static async makeNew(
    auth: Authenticator,
    blob: CreationAttributes<TriggerModel>,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<TriggerResource, Error>> {
    const trigger = await TriggerModel.create(blob, {
      transaction,
    });

    const resource = new this(TriggerModel, trigger.get());
    const r = await resource.postRegistration(auth);
    if (r.isErr()) {
      return r;
    }

    return new Ok(resource);
  }

  private static async baseFetch(
    auth: Authenticator,
    options: ResourceFindOptions<TriggerModel> = {}
  ) {
    const workspace = auth.getNonNullableWorkspace();

    const res = await this.model.findAll({
      where: {
        ...options.where,
        workspaceId: workspace.id,
      },
      limit: options.limit,
    });

    return res.map((c) => new this(this.model, c.get()));
  }

  static async fetchByIds(auth: Authenticator, sIds: string[]) {
    return this.baseFetch(auth, {
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        sId: sIds,
      },
    });
  }

  static async fetchById(
    auth: Authenticator,
    sId: string
  ): Promise<TriggerResource | null> {
    const res = await this.fetchByIds(auth, [sId]);
    return res.length > 0 ? res[0] : null;
  }

  static listByAgentConfigurationId(
    auth: Authenticator,
    agentConfigurationId: number
  ) {
    return this.baseFetch(auth, {
      where: {
        agentConfigurationId,
      },
    });
  }

  static async update(
    auth: Authenticator,
    sId: string,
    blob: Partial<InferAttributes<TriggerModel, { omit: "workspaceId" }>>,
    transaction?: Transaction
  ) {
    const trigger = await this.fetchById(auth, sId);
    if (!trigger) {
      return new Err(new Error(`Trigger with sId ${sId} not found`));
    }

    await trigger.update(blob, transaction);
    const r = await trigger.postRegistration(auth);
    if (r.isErr()) {
      return r;
    }

    return new Ok(trigger);
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction | undefined } = {}
  ): Promise<Result<undefined, Error>> {
    const owner = auth.getNonNullableWorkspace();

    const r = await this.preDeletion(auth);
    if (r.isErr()) {
      return r;
    }

    try {
      await TriggerModel.destroy({
        where: {
          sId: this.sId,
          workspaceId: owner.id,
        },
        transaction,
      });
      return new Ok(undefined);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  static async deleteAllForWorkspace(
    workspace: WorkspaceType
  ): Promise<Result<undefined, Error>> {
    const triggers = await TriggerModel.findAll({
      where: {
        workspaceId: workspace.id,
      },
    });

    if (triggers.length === 0) {
      return new Ok(undefined);
    }

    const r = await concurrentExecutor(
      triggers,
      async (trigger) => {
        const r = await deleteAgentScheduleWorkflow({
          workspaceId: workspace.sId,
          agentConfigurationId: trigger.agentConfigurationId,
          triggerId: trigger.sId,
        });
        if (r.isErr()) {
          return r;
        }

        try {
          await trigger.destroy();
          return new Ok(undefined);
        } catch (error) {
          return new Err(normalizeError(error));
        }
      },
      {
        concurrency: 10,
      }
    );

    if (r.find((res) => res.isErr())) {
      return new Err(
        new Error(
          `Failed to delete ${r.filter((res) => res.isErr()).length} some triggers`
        )
      );
    }
    return new Ok(undefined);
  }

  async postRegistration(auth: Authenticator) {
    switch (this.kind) {
      case "schedule":
        return createOrUpdateAgentScheduleWorkflow({
          authType: auth.toJSON(),
          trigger: this.toJSON(),
        });
      default:
        assertNever(this.kind);
    }
  }

  async preDeletion(auth: Authenticator) {
    switch (this.kind) {
      case "schedule":
        return deleteAgentScheduleWorkflow({
          workspaceId: auth.getNonNullableWorkspace().sId,
          agentConfigurationId: this.agentConfigurationId,
          triggerId: this.sId,
        });
      default:
        assertNever(this.kind);
    }
  }

  toJSON(): TriggerType {
    return {
      id: this.id,
      sId: this.sId,
      name: this.name,
      description: this.description,
      agentConfigurationId: this.agentConfigurationId,
      editor: this.editor,
      customPrompt: this.customPrompt,
      kind: this.kind,
      config: this.configuration,
    };
  }
}
