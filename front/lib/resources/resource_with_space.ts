import type {
  Attributes,
  ForeignKey,
  NonAttribute,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Model } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import type { ResourceWithId } from "@app/lib/resources/base_resource";
import { BaseResource } from "@app/lib/resources/base_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import type { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import type {
  ModelStaticSoftDeletable,
  SoftDeletableWorkspaceAwareModel,
} from "@app/lib/resources/storage/wrappers/workspace_models";
import type {
  InferIncludeType,
  ResourceFindOptions,
} from "@app/lib/resources/types";
import type { Result } from "@app/types";

// Interface to enforce workspaceId and vaultId.
interface ModelWithSpace extends ResourceWithId {
  workspaceId: ForeignKey<WorkspaceModel["id"]>;
  vaultId: ForeignKey<SpaceModel["id"]>;
  space: NonAttribute<SpaceModel>;
}

export abstract class ResourceWithSpace<
  M extends SoftDeletableWorkspaceAwareModel & ModelWithSpace,
> extends BaseResource<M> {
  readonly workspaceId: ModelWithSpace["workspaceId"];

  protected constructor(
    model: ModelStaticSoftDeletable<M>,
    blob: Attributes<M>,
    public readonly space: SpaceResource
  ) {
    super(model, blob);

    this.workspaceId = blob.workspaceId;
  }

  protected static async baseFetchWithAuthorization<
    T extends ResourceWithSpace<M>,
    M extends SoftDeletableWorkspaceAwareModel & ModelWithSpace,
    IncludeType extends Partial<InferIncludeType<M>>,
  >(
    this: {
      new (
        model: ModelStaticSoftDeletable<M>,
        blob: Attributes<M>,
        space: SpaceResource,
        includes?: IncludeType
      ): T;
    } & { model: ModelStaticSoftDeletable<M> },
    auth: Authenticator,
    {
      attributes,
      includes,
      limit,
      order,
      where,
      includeDeleted,
    }: ResourceFindOptions<M> = {},
    transaction?: Transaction
  ): Promise<T[]> {
    const blobs = await this.model.findAll({
      attributes,
      where: where as WhereOptions<M>,
      include: includes,
      limit,
      order,
      includeDeleted,
      transaction,
    });

    if (blobs.length === 0) {
      return [];
    }

    // We use the model directly here; it's a very rare case where we don't check the workspace, which in this case
    // is due to the fact that we may need to fetch data from public workspaces as well as the current workspace.
    const spaces = await SpaceModel.findAll({
      where: {
        id: blobs.map((b) => b.vaultId),
      },
      include: [
        {
          model: GroupResource.model,
        },
      ],
      includeDeleted,
    });

    return (
      blobs
        .map((b) => {
          const space = spaces.find((space) => space.id === b.vaultId);
          if (!space) {
            throw new Error("Unreachable: space not found.");
          }

          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          const includedResults = (includes || []).reduce<IncludeType>(
            (acc, current) => {
              if (
                typeof current === "object" &&
                "as" in current &&
                typeof current.as === "string"
              ) {
                const key = current.as as keyof IncludeType;
                // Only handle other includes if they are not space.
                if (key !== "space") {
                  const includedModel = b[key as keyof typeof b];
                  if (includedModel instanceof Model) {
                    acc[key] = includedModel.get();
                  } else if (Array.isArray(includedModel)) {
                    acc[key] = includedModel.map((m) =>
                      m.get()
                    ) as IncludeType[keyof IncludeType];
                  }
                }
              }
              return acc;
            },
            {} as IncludeType
          );

          return new this(
            this.model,
            b.get(),
            SpaceResource.fromModel(space),
            includedResults
          );
        })
        // Filter out resources that the user cannot fetch.
        .filter((cls) => cls.canFetch(auth))
    );
  }

  // Delete.

  protected abstract hardDelete(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<Result<number, Error>>;

  protected abstract softDelete(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<Result<number, Error>>;

  async delete(
    auth: Authenticator,
    options: { hardDelete: boolean; transaction?: Transaction }
  ): Promise<Result<undefined | number, Error>> {
    const { hardDelete, transaction } = options;

    if (hardDelete) {
      return this.hardDelete(auth, transaction);
    }

    return this.softDelete(auth, transaction);
  }

  // Permissions.

  requestedPermissions() {
    return this.space.requestedPermissions();
  }

  canAdministrate(auth: Authenticator) {
    return this.space.canAdministrate(auth);
  }

  canReadOrAdministrate(auth: Authenticator) {
    return this.space.canReadOrAdministrate(auth);
  }

  canRead(auth: Authenticator) {
    return this.space.canRead(auth);
  }

  canWrite(auth: Authenticator) {
    return this.space.canWrite(auth);
  }

  // This method determines if the authenticated user can fetch data, based on workspace ownership
  // or public space access. Changes to this logic can impact data security, so they must be
  // reviewed and tested carefully to prevent unauthorized access.
  private canFetch(auth: Authenticator) {
    return (
      // Superusers can fetch any resource.
      auth.isDustSuperUser() ||
      // Others, can only fetch resources from their workspace or public spaces.
      this.workspaceId === auth.getNonNullableWorkspace().id ||
      this.space.isPublic()
    );
  }
}
