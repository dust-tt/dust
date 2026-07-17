import type { Authenticator } from "@app/lib/auth";
import { ActivationNudgeModel } from "@app/lib/models/activation/activation_nudge";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { makeSId } from "@app/lib/resources/string_ids";
import type { TriggerResource } from "@app/lib/resources/trigger_resource";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ActivationNudgeResource
  extends ReadonlyAttributesType<ActivationNudgeModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ActivationNudgeResource extends BaseResource<ActivationNudgeModel> {
  static model: ModelStatic<ActivationNudgeModel> = ActivationNudgeModel;

  constructor(
    _: ModelStatic<ActivationNudgeModel>,
    blob: Attributes<ActivationNudgeModel>
  ) {
    super(ActivationNudgeModel, blob);
  }

  get sId(): string {
    return ActivationNudgeResource.modelIdToSId({
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
    return makeSId("activation_nudge", { id, workspaceId });
  }

  // Records that the pod's activation trigger fired.
  static async makeNew(
    auth: Authenticator,
    { pod, trigger }: { pod: SpaceResource; trigger: TriggerResource }
  ): Promise<ActivationNudgeResource> {
    const [nudge] = await this.bulkCreate(auth, [{ pod, trigger }]);
    return nudge;
  }

  // Records that a batch of pods' activation triggers fired, in a single
  // insert (avoids one query per pod when the scheduler processes many pods).
  static async bulkCreate(
    auth: Authenticator,
    nudges: { pod: SpaceResource; trigger: TriggerResource }[]
  ): Promise<ActivationNudgeResource[]> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const created = await this.model.bulkCreate(
      nudges.map(({ pod, trigger }) => ({
        workspaceId,
        spaceId: pod.id,
        triggerId: trigger.id,
        userId: trigger.editor,
      })),
      { returning: true }
    );

    return created.map((nudge) => new this(this.model, nudge.get()));
  }

  // Fetches the most recent nudge recorded for a pod, if any.
  static async fetchLatestForSpace(
    auth: Authenticator,
    { pod }: { pod: SpaceResource }
  ): Promise<ActivationNudgeResource | null> {
    const nudge = await this.model.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        spaceId: pod.id,
      },
      order: [["createdAt", "DESC"]],
    });

    return nudge ? new this(this.model, nudge.get()) : null;
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
      return new Err(normalizeError(err));
    }
  }
}
