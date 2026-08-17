import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { PodAppShareModel } from "@app/lib/resources/storage/models/pod_app_share";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticSoftDeletable } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { PodAppShareSummary } from "@app/types/api/pod_apps";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import assert from "assert";
import type { Attributes, Transaction } from "sequelize";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface PodAppShareResource
  extends ReadonlyAttributesType<PodAppShareModel> {}

/**
 * The record that a pod app is shared to the workspace as an agent toolset. Rows are readable by
 * any workspace user (the binding itself is not sensitive); everything security-relevant is gated
 * where functions get resolved (SandboxFunctionResource) and where shares get mutated (makeNew and
 * revoke assert pod editorship).
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class PodAppShareResource extends BaseResource<PodAppShareModel> {
  static model: ModelStaticSoftDeletable<PodAppShareModel> = PodAppShareModel;
  declare readonly model: ModelStaticSoftDeletable<PodAppShareModel>;

  readonly space: SpaceResource;

  constructor(
    model: ModelStaticSoftDeletable<PodAppShareModel>,
    blob: Attributes<PodAppShareModel>,
    space: SpaceResource
  ) {
    super(PodAppShareModel, blob);
    this.space = space;
  }

  static async makeNew(
    auth: Authenticator,
    {
      space,
      appPrefix,
      internalMCPServerId,
      toolsetName,
      description,
    }: {
      space: SpaceResource;
      appPrefix: string;
      internalMCPServerId: string;
      toolsetName: string;
      description: string;
    }
  ): Promise<PodAppShareResource> {
    assert(space.isProject(), "Pod app shares can only belong to pods.");
    assert(
      space.canAdministrate(auth),
      "Only pod editors can share a pod app."
    );
    assert(
      space.workspaceId === auth.getNonNullableWorkspace().id,
      "The pod must belong to the authenticated workspace."
    );

    const share = await this.model.create({
      workspaceId: auth.getNonNullableWorkspace().id,
      spaceId: space.id,
      appPrefix,
      internalMCPServerId,
      sharedByUserId: auth.user()?.id ?? null,
      toolsetName,
      description,
    });

    return new this(this.model, share.get(), space);
  }

  private static async baseFetch(
    auth: Authenticator,
    {
      includeDeletedSpace,
      ...options
    }: ResourceFindOptions<PodAppShareModel> & {
      // Pods are soft-deleted before being scrubbed; without this, shares of a pod being
      // deleted resolve to no space and are silently dropped here.
      includeDeletedSpace?: boolean;
    } = {}
  ): Promise<PodAppShareResource[]> {
    const { where, ...rest } = options;
    const shares = await this.model.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      ...rest,
    });

    const spaces = await SpaceResource.fetchByModelIds(
      auth,
      Array.from(new Set(shares.map((share) => share.get().spaceId))),
      { includeDeleted: includeDeletedSpace }
    );
    const spacesById = new Map(
      spaces
        .filter((space) => space.isProject())
        .map((space) => [space.id, space])
    );

    return shares.flatMap((share) => {
      const blob = share.get();
      const space = spacesById.get(blob.spaceId);
      if (!space) {
        return [];
      }
      return [new this(this.model, blob, space)];
    });
  }

  static async fetchByPodAndAppPrefix(
    auth: Authenticator,
    space: SpaceResource,
    appPrefix: string
  ): Promise<PodAppShareResource | null> {
    if (!space.isProject()) {
      return null;
    }
    const [share] = await this.baseFetch(auth, {
      where: { spaceId: space.id, appPrefix },
    });
    return share ?? null;
  }

  static async fetchByInternalMCPServerId(
    auth: Authenticator,
    internalMCPServerId: string
  ): Promise<PodAppShareResource | null> {
    const [share] = await this.baseFetch(auth, {
      where: { internalMCPServerId },
    });
    return share ?? null;
  }

  static async listBySpace(
    auth: Authenticator,
    space: SpaceResource
  ): Promise<PodAppShareResource[]> {
    if (!space.isProject()) {
      return [];
    }
    return this.baseFetch(auth, { where: { spaceId: space.id } });
  }

  /**
   * Scrub-time cleanup: hard-deletes every share row of the pod (revoked ones included — the
   * spaceId FK is ON DELETE RESTRICT, so soft-deleted rows would block the space scrub) and
   * returns what was active so the caller can clean up the bound server views.
   */
  static async deleteAllForSpace(
    auth: Authenticator,
    space: SpaceResource
  ): Promise<PodAppShareResource[]> {
    const shares = await this.baseFetch(auth, {
      where: { spaceId: space.id },
      includeDeletedSpace: true,
    });

    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        spaceId: space.id,
      },
      hardDelete: true,
    });

    return shares;
  }

  async updateShareDetails({
    toolsetName,
    description,
  }: {
    toolsetName?: string;
    description?: string;
  }): Promise<void> {
    await this.update({
      ...(toolsetName !== undefined ? { toolsetName } : {}),
      ...(description !== undefined ? { description } : {}),
    });
  }

  async revoke(auth: Authenticator): Promise<void> {
    assert(
      this.space.canAdministrate(auth),
      "Only pod editors can unshare a pod app."
    );
    await this.delete(auth, {});
  }

  toJSON(): PodAppShareSummary {
    return {
      appPrefix: this.appPrefix,
      toolsetName: this.toolsetName,
      description: this.description,
    };
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: { id: this.id, workspaceId: auth.getNonNullableWorkspace().id },
      transaction,
      hardDelete: false,
    });
    return new Ok(undefined);
  }
}
