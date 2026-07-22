import type { Authenticator } from "@app/lib/auth";
import { ActivationNudgeModel } from "@app/lib/models/activation/activation_nudge";
import type { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { makeSId } from "@app/lib/resources/string_ids";
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
    { activationPod }: { activationPod: ActivationPodResource }
  ): Promise<ActivationNudgeResource> {
    const [nudge] = await this.bulkCreate(auth, [{ activationPod }]);
    return nudge;
  }

  // Records that a batch of pods' activation triggers fired, in a single
  // insert (avoids one query per pod when the scheduler processes many pods).
  static async bulkCreate(
    auth: Authenticator,
    nudges: { activationPod: ActivationPodResource }[]
  ): Promise<ActivationNudgeResource[]> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const created = await this.model.bulkCreate(
      nudges.map(({ activationPod }) => ({
        workspaceId,
        activationPodId: activationPod.id,
      })),
      { returning: true }
    );

    return created.map((nudge) => new this(this.model, nudge.get()));
  }

  // Fetches the most recent nudge recorded for a pod, if any.
  static async fetchLatestForActivationPod(
    auth: Authenticator,
    { activationPod }: { activationPod: ActivationPodResource }
  ): Promise<ActivationNudgeResource | null> {
    const [latest] = await this.listRecentForActivationPod(auth, {
      activationPod,
      limit: 1,
    });
    return latest ?? null;
  }

  // Fetches the `limit` most recent nudges recorded for a pod, newest first.
  static async listRecentForActivationPod(
    auth: Authenticator,
    {
      activationPod,
      limit,
    }: { activationPod: ActivationPodResource; limit: number }
  ): Promise<ActivationNudgeResource[]> {
    const nudges = await this.model.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        activationPodId: activationPod.id,
      },
      order: [["createdAt", "DESC"]],
      limit,
    });

    return nudges.map((nudge) => new this(this.model, nudge.get()));
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
