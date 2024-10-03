import type { Result } from "@dust-tt/types";
import type {
  Attributes,
  ForeignKey,
  Includeable,
  NonAttribute,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Model } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import type { Workspace } from "@app/lib/models/workspace";
import type { ResourceWithId } from "@app/lib/resources/base_resource";
import { BaseResource } from "@app/lib/resources/base_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import type { VaultModel } from "@app/lib/resources/storage/models/vaults";
import type {
  ModelStaticSoftDeletable,
  SoftDeletableModel,
} from "@app/lib/resources/storage/wrappers";
import type {
  InferIncludeType,
  ResourceFindOptions,
} from "@app/lib/resources/types";
import { VaultResource } from "@app/lib/resources/vault_resource";

// Interface to enforce workspaceId and vaultId.
interface ModelWithVault extends ResourceWithId {
  workspaceId: ForeignKey<Workspace["id"]>;
  vaultId: ForeignKey<VaultModel["id"]>;
  vault: NonAttribute<VaultModel>;
}

export abstract class ResourceWithVault<
  M extends SoftDeletableModel & ModelWithVault,
> extends BaseResource<M> {
  readonly workspaceId: ModelWithVault["workspaceId"];

  protected constructor(
    model: ModelStaticSoftDeletable<M>,
    blob: Attributes<M>,
    public readonly vault: VaultResource
  ) {
    super(model, blob);

    this.workspaceId = blob.workspaceId;
  }

  protected static async baseFetchWithAuthorization<
    T extends ResourceWithVault<M>,
    M extends SoftDeletableModel & ModelWithVault,
    IncludeType extends Partial<InferIncludeType<M>>,
  >(
    this: {
      new (
        model: ModelStaticSoftDeletable<M>,
        blob: Attributes<M>,
        vault: VaultResource,
        includes?: IncludeType
      ): T;
    } & { model: ModelStaticSoftDeletable<M> },
    auth: Authenticator,
    {
      includes,
      limit,
      order,
      where,
      includeDeleted,
    }: ResourceFindOptions<M> = {}
  ): Promise<T[]> {
    const includeClauses: Includeable[] = [
      {
        model: VaultResource.model,
        as: "vault",
        include: [{ model: GroupResource.model }],
      },
      ...(includes || []),
    ];

    const blobs = await this.model.findAll({
      where: where as WhereOptions<M>,
      include: includeClauses,
      limit,
      order,
      includeDeleted,
    });

    return (
      blobs
        .map((b) => {
          const vault = new VaultResource(
            VaultResource.model,
            b.vault.get(),
            b.vault.groups.map(
              (group) => new GroupResource(GroupModel, group.get())
            )
          );

          const includedResults = (includes || []).reduce<IncludeType>(
            (acc, current) => {
              if (
                typeof current === "object" &&
                "as" in current &&
                typeof current.as === "string"
              ) {
                const key = current.as as keyof IncludeType;
                // Only handle other includes if they are not vault.
                if (key !== "vault") {
                  const includedModel = b[key as keyof typeof b];
                  if (includedModel instanceof Model) {
                    acc[key] = includedModel.get();
                  }
                }
              }
              return acc;
            },
            {} as IncludeType
          );

          return new this(this.model, b.get(), vault, includedResults);
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

  acl() {
    return this.vault.acl();
  }

  canList(auth: Authenticator) {
    return this.vault.canList(auth);
  }

  canRead(auth: Authenticator) {
    return this.vault.canRead(auth);
  }

  canWrite(auth: Authenticator) {
    return this.vault.canWrite(auth);
  }

  // This method determines if the authenticated user can fetch data, based on workspace ownership
  // or public vault access. Changes to this logic can impact data security, so they must be
  // reviewed and tested carefully to prevent unauthorized access.
  private canFetch(auth: Authenticator) {
    return (
      // Superusers can fetch any resource.
      auth.isDustSuperUser() ||
      // Others, can only fetch resources from their workspace or public vaults.
      this.workspaceId === auth.getNonNullableWorkspace().id ||
      this.vault.isPublic()
    );
  }
}
