import type {
  Attributes,
  ForeignKey,
  Includeable,
  ModelStatic,
  NonAttribute,
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
  M extends Model & ModelWithVault,
> extends BaseResource<M> {
  protected constructor(
    model: ModelStatic<M>,
    blob: Attributes<M>,
    public readonly vault: VaultResource
  ) {
    super(model, blob);
  }

  protected static async baseFetchWithAuthorization<
    T extends ResourceWithVault<M>,
    M extends Model & ModelWithVault,
    IncludeType extends Partial<InferIncludeType<M>>,
  >(
    this: {
      new (
        model: ModelStatic<M>,
        blob: Attributes<M>,
        vault: VaultResource,
        includes?: IncludeType
      ): T;
    } & { model: ModelStatic<M> },
    auth: Authenticator,
    { includes, limit, order, where }: ResourceFindOptions<M> = {}
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
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      } as WhereOptions<M>,
      include: includeClauses,
      limit,
      order,
    });

    return blobs.map((b) => {
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
    });
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
}
