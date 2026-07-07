import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { PodEgressPolicyModel } from "@app/lib/resources/storage/models/pod_egress_policy";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { Attributes, Transaction } from "sequelize";

// Admin record of truth for a pod's egress allowlist. The GCS file
// `pods/{spaceSId}.json` read by the egress proxy is a render of this row —
// see lib/api/sandbox/pod_egress_policy.ts for the render/invalidation flow.
// No sId: this is internal pod config, never addressed by id over the API
// (the route is keyed by the pod space's sId).

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface PodEgressPolicyResource
  extends ReadonlyAttributesType<PodEgressPolicyModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class PodEgressPolicyResource extends BaseResource<PodEgressPolicyModel> {
  static model: typeof PodEgressPolicyModel = PodEgressPolicyModel;

  constructor(
    model: typeof PodEgressPolicyModel,
    blob: Attributes<PodEgressPolicyModel>
  ) {
    super(PodEgressPolicyModel, blob);
  }

  static fromModel(model: PodEgressPolicyModel): PodEgressPolicyResource {
    return new PodEgressPolicyResource(PodEgressPolicyModel, model.get());
  }

  static async fetchBySpace(
    auth: Authenticator,
    space: SpaceResource
  ): Promise<PodEgressPolicyResource | null> {
    if (!space.isProject()) {
      return null;
    }

    const model = await PodEgressPolicyModel.findOne({
      where: {
        spaceId: space.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });

    return model ? PodEgressPolicyResource.fromModel(model) : null;
  }

  static async makeNew(
    auth: Authenticator,
    space: SpaceResource,
    { allowedDomains }: { allowedDomains: string[] },
    transaction?: Transaction
  ): Promise<PodEgressPolicyResource> {
    const model = await PodEgressPolicyModel.create(
      {
        workspaceId: auth.getNonNullableWorkspace().id,
        spaceId: space.id,
        allowedDomains,
      },
      { transaction }
    );

    return PodEgressPolicyResource.fromModel(model);
  }

  async updateAllowedDomains(
    allowedDomains: string[],
    transaction?: Transaction
  ): Promise<void> {
    await this.update({ allowedDomains }, transaction);
  }

  static async deleteBySpace(
    auth: Authenticator,
    space: SpaceResource,
    transaction?: Transaction
  ): Promise<void> {
    await PodEgressPolicyModel.destroy({
      where: {
        spaceId: space.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    await PodEgressPolicyModel.destroy({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });
    return new Ok(undefined);
  }
}
