import type { Authenticator } from "@app/lib/auth";
import { ActivationPodModel } from "@app/lib/models/activation/activation_pod";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { makeSId } from "@app/lib/resources/string_ids";
import type { TriggerResource } from "@app/lib/resources/trigger_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ActivationPodResource
  extends ReadonlyAttributesType<ActivationPodModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ActivationPodResource extends BaseResource<ActivationPodModel> {
  static model: ModelStatic<ActivationPodModel> = ActivationPodModel;

  constructor(
    _: ModelStatic<ActivationPodModel>,
    blob: Attributes<ActivationPodModel>
  ) {
    super(ActivationPodModel, blob);
  }

  get sId(): string {
    return ActivationPodResource.modelIdToSId({
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
    return makeSId("activation_pod", { id, workspaceId });
  }

  // Creates the canonical record for a newly provisioned Activation Pod.
  static async makeNew(
    auth: Authenticator,
    {
      pod,
      user,
      trigger,
    }: {
      pod: SpaceResource;
      user: UserResource;
      trigger?: TriggerResource | null;
    }
  ): Promise<ActivationPodResource> {
    const model = await this.model.create({
      workspaceId: auth.getNonNullableWorkspace().id,
      spaceId: pod.id,
      userId: user.id,
      triggerId: trigger?.id ?? null,
    });

    return new this(this.model, model.get());
  }

  // Fetches the ActivationPod for a given Pod, if one exists.
  static async fetchBySpace(
    auth: Authenticator,
    pod: SpaceResource
  ): Promise<ActivationPodResource | null> {
    const [activationPod] = await this.fetchBySpaceModelIds(auth, [pod.id]);
    return activationPod ?? null;
  }

  // Batch variant of fetchBySpace, avoiding one query per pod (e.g. when the
  // scheduler processes many pods at once).
  static async fetchBySpaceModelIds(
    auth: Authenticator,
    spaceModelIds: ModelId[]
  ): Promise<ActivationPodResource[]> {
    if (spaceModelIds.length === 0) {
      return [];
    }

    const activationPods = await this.model.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        spaceId: spaceModelIds,
      },
    });

    return activationPods.map((pod) => new this(this.model, pod.get()));
  }

  // Lists every ActivationPod in the calling workspace.
  static async listForWorkspace(
    auth: Authenticator
  ): Promise<ActivationPodResource[]> {
    const activationPods = await this.model.findAll({
      where: { workspaceId: auth.getNonNullableWorkspace().id },
    });

    return activationPods.map((pod) => new this(this.model, pod.get()));
  }

  // Sets the Pod's activation trigger once it has been provisioned.
  async setTrigger(trigger: TriggerResource): Promise<void> {
    await this.update({ triggerId: trigger.id });
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
