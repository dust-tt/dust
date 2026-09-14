import type { Authenticator } from "@app/lib/auth";
import type { ResourceWithId } from "@app/lib/resources/base_resource";
import { BaseResource } from "@app/lib/resources/base_resource";
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
import type { Result } from "@app/types/shared/result";
import type {
  Attributes,
  ForeignKey,
  NonAttribute,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Model } from "sequelize";

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

  private static spaceModel: ModelStaticSoftDeletable<SpaceModel> = SpaceModel;

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
      dangerouslyBypassWorkspaceIsolationSecurity,
      includeDeleted,
      includes,
      limit,
      order,
      where,
    }: ResourceFindOptions<M> = {},
    transaction?: Transaction
  ): Promise<T[]> {
    const blobs = await this.model.findAll({
      attributes,
      dangerouslyBypassWorkspaceIsolationSecurity,
      include: includes,
      includeDeleted,
      limit,
      order,
      transaction,
      where: where as WhereOptions<M>,
    });

    if (blobs.length === 0) {
      return [];
    }

    // Scope on the fetched blobs' workspaces rather than the authenticated one: some lookups
    // are intentionally cross-workspace (e.g. unsafeFetchByDustAPIProjectId) and a blob always
    // lives in the same workspace as its space.
    const blobWorkspaceIds = [...new Set(blobs.map((b) => b.workspaceId))];

    const spaces = await ResourceWithSpace.spaceModel.findAll({
      where: {
        id: blobs.map((b) => b.vaultId),
        workspaceId: blobWorkspaceIds,
      },
      includeDeleted,
      transaction,
      // WORKSPACE_ISOLATION_BYPASS: The where clause is scoped to the blobs' workspaces, which
      // may span multiple workspaces when the blob query ran with the bypass (e.g.
      // unsafeFetchByDustAPIProjectId); the static check only accepts a single workspaceId.
      // Permissions are enforced by canFetch below.
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });

    // Resolve each blob's space through an index: `spaces` can hold thousands of rows and every
    // Sequelize attribute read allocates, so the per-blob lookup has to stay O(1).
    const spacesById = new Map(spaces.map((space) => [space.id, space]));

    return (
      blobs
        .map((b) => {
          const space = spacesById.get(b.vaultId);
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

  getAccessControlLists(auth: Authenticator) {
    return this.space.getAccessControlLists(auth);
  }

  canAdministrate(auth: Authenticator) {
    return auth.can("admin", this);
  }

  canReadOrAdministrate(auth: Authenticator) {
    return auth.can("read", this) || auth.can("admin", this);
  }

  canRead(auth: Authenticator) {
    return auth.can("read", this);
  }

  canWrite(auth: Authenticator) {
    return auth.can("write", this);
  }

  // This method determines if the authenticated user can fetch data, based on workspace ownership.
  // Changes to this logic can impact data security, so they must be reviewed and tested carefully
  // to prevent unauthorized access.
  private canFetch(auth: Authenticator) {
    return (
      // Superusers can fetch any resource.
      auth.isDustSuperUser() ||
      // Others, can only fetch resources from their workspace spaces.
      this.workspaceId === auth.getNonNullableWorkspace().id
    );
  }
}
