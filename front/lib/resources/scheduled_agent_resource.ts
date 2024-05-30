import type { LightWorkspaceType, ModelId, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import { Workspace } from "@app/lib/models/workspace";
import { BaseResource } from "@app/lib/resources/base_resource";
import { ScheduledAgentModel } from "@app/lib/resources/storage/models/scheduled_agents";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { generateModelSId } from "@app/lib/utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface ScheduledAgentResource
  extends ReadonlyAttributesType<ScheduledAgentModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ScheduledAgentResource extends BaseResource<ScheduledAgentModel> {
  static model: ModelStatic<ScheduledAgentModel> = ScheduledAgentModel;

  constructor(
    model: ModelStatic<ScheduledAgentModel>,
    blob: Attributes<ScheduledAgentModel>
  ) {
    super(ScheduledAgentModel, blob);
  }

  static async makeNew(
    blob: Omit<CreationAttributes<ScheduledAgentModel>, "sId">,
    transaction?: Transaction
  ) {
    const sId = generateModelSId();
    const scheduledAgent = await ScheduledAgentModel.create(
      {
        sId,
        ...blob,
      },
      {
        transaction,
      }
    );

    return new this(ScheduledAgentModel, scheduledAgent.get());
  }

  async overwrite(
    blob: Omit<
      CreationAttributes<ScheduledAgentModel>,
      "sId" | "userId" | "workspaceId"
    >
  ) {
    const updatedBlob = await this.model.update(blob, {
      where: {
        id: this.id,
      },
      returning: true,
    });

    return new ScheduledAgentResource(
      ScheduledAgentResource.model,
      updatedBlob[1][0].get()
    );
  }

  static async fetchMany(ids: Array<ModelId>) {
    const blobs = await ScheduledAgentResource.model.findAll({
      where: {
        id: ids,
      },
    });

    return blobs.map(
      // Use `.get` to extract model attributes, omitting Sequelize instance metadata.
      (b: ScheduledAgentModel) =>
        new ScheduledAgentResource(ScheduledAgentResource.model, b.get())
    );
  }

  static async getBySid(sId: string): Promise<ScheduledAgentResource | null> {
    const blob = await ScheduledAgentResource.model.findOne({
      where: {
        sId,
      },
    });

    if (!blob) {
      return null;
    }

    return new ScheduledAgentResource(ScheduledAgentResource.model, blob.get());
  }

  static async listForWorkspace({
    workspace,
  }: {
    workspace: LightWorkspaceType;
  }): Promise<ScheduledAgentResource[]> {
    const blobs = await ScheduledAgentResource.model.findAll({
      where: {
        workspaceId: workspace.id,
      },
    });

    return blobs.map(
      (b: ScheduledAgentModel) =>
        new ScheduledAgentResource(ScheduledAgentResource.model, b.get())
    );
  }

  async getWorkspace(): Promise<LightWorkspaceType | null> {
    const workspace = await Workspace.findOne({
      where: {
        id: this.workspaceId,
      },
    });
    if (!workspace) {
      return null;
    }
    return renderLightWorkspaceType({ workspace });
  }

  toJSON() {
    return {
      sId: this.sId,
      name: this.name,
      userModelId: this.userId as ModelId,
      workspaceModelId: this.workspaceId as ModelId,
      agentConfigurationId: this.agentConfigurationId,
      prompt: this.prompt,
      timeOfDay: this.timeOfDay,
      timeZone: this.timeZone,
      scheduleType: this.scheduleType,
      weeklyDaysOfWeek: this.weeklyDaysOfWeek,
      monthlyFirstLast: this.monthlyFirstLast,
      monthlyDayOfWeek: this.monthlyDayOfWeek,
      emails: this.emails,
      slackChannelId: this.slackChannelId,
    };
  }

  /**
   * @deprecated use the destroy method.
   */
  delete(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    transaction?: Transaction
  ): Promise<Result<undefined, Error>> {
    throw new Error("Method not implemented.");
  }

  async destroy(transaction?: Transaction): Promise<Result<undefined, Error>> {
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
