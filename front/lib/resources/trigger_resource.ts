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
import {
  createOrUpdateAgentScheduleWorkflow,
  deleteAgentScheduleWorkflow,
} from "@app/temporal/agent_schedule/client";
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
    bloc: Attributes<TriggerModel>
  ) {
    super(TriggerModel, bloc);
  }

  static async makeNew(
    auth: Authenticator,
    blob: CreationAttributes<TriggerModel>,
    { transaction }: { transaction?: Transaction } = {}
  ) {
    const trigger = await TriggerModel.create(blob, {
      transaction,
    });

    const resource = new this(TriggerModel, trigger.get());
    await resource.postRegistration(auth);
    return resource;
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
    agentConfigurationId: string
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
    await trigger.postRegistration(auth);
    return new Ok(trigger);
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction | undefined } = {}
  ): Promise<Result<undefined, Error>> {
    const owner = auth.getNonNullableWorkspace();

    await this.preDeletion(auth);

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

  async postRegistration(auth: Authenticator) {
    switch (this.kind) {
      case "schedule":
        await createOrUpdateAgentScheduleWorkflow({
          authType: auth.toJSON(),
          trigger: this.toJSON(),
        });
        break;
      default:
        assertNever(this.kind);
    }
  }

  async preDeletion(auth: Authenticator) {
    switch (this.kind) {
      case "schedule":
        await deleteAgentScheduleWorkflow({
          authType: auth.toJSON(),
          agentConfigurationId: this.agentConfigurationId,
          triggerId: this.sId,
        });
        break;
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
