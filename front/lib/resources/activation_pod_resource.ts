import type { Authenticator } from "@app/lib/auth";
import { ActivationPodModel } from "@app/lib/models/activation/activation_pod";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeSId } from "@app/lib/resources/string_ids";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Attributes, ModelStatic, Transaction } from "sequelize";
import { col, fn } from "sequelize";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ActivationPodResource
  extends ReadonlyAttributesType<ActivationPodModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ActivationPodResource extends BaseResource<ActivationPodModel> {
  static model: ModelStaticWorkspaceAware<ActivationPodModel> =
    ActivationPodModel;

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
      isCompactUIView,
    }: {
      pod: SpaceResource;
      user: UserResource;
      isCompactUIView?: boolean;
    }
  ): Promise<ActivationPodResource> {
    const model = await this.model.create({
      workspaceId: auth.getNonNullableWorkspace().id,
      spaceId: pod.id,
      userId: user.id,
      isCompactUIView: isCompactUIView ?? false,
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

  // Fetches the calling user's activation Pod. A user can technically have more
  // than one over time; we return the most recent, treated as "their" learning
  // space for surfaces like the Get Started page.
  static async fetchByUser(
    auth: Authenticator
  ): Promise<ActivationPodResource | null> {
    const user = auth.getNonNullableUser();
    const activationPod = await this.model.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        userId: user.id,
      },
      order: [["createdAt", "DESC"]],
    });

    return activationPod ? new this(this.model, activationPod.get()) : null;
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

  // Cross-tenant scan for the nightly activation-schedule reconcile job: the
  // distinct workspaces that currently have at least one Activation Pod
  // (row existence is the "live" signal; provisioning deletes the row when a
  // pod is torn down), i.e. the workspaces that should have a running
  // schedule.
  static async listWorkspaceModelIdsWithActivationPods(): Promise<ModelId[]> {
    const rows = await this.model.findAll({
      attributes: [[fn("DISTINCT", col("workspaceId")), "workspaceId"]],
      raw: true,
      // WORKSPACE_ISOLATION_BYPASS: nightly reconcile scan across all workspaces
      // to find which ones have a live activation pod (see
      // front/temporal/activation_scheduler/client.ts).
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });

    return rows.map((row) => row.workspaceId);
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
