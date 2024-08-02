import type {
  Attributes,
  FindOptions,
  ForeignKey,
  Includeable,
  ModelStatic,
  NonAttribute,
  WhereOptions,
} from "sequelize";
import { Model } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import type { Workspace } from "@app/lib/models/workspace";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { VaultModel } from "@app/lib/resources/storage/models/vaults";
import { VaultResource } from "@app/lib/resources/vault_resource";

// Interface to enforce workspaceId and vaultId.
interface ModelWithVault {
  workspaceId: ForeignKey<Workspace["id"]>;
  vaultId: ForeignKey<VaultModel["id"]>;
  vault: NonAttribute<VaultModel>;
}

export type NonAttributeKeys<M> = {
  [K in keyof M]: M[K] extends NonAttribute<Model<any, any>> ? K : never;
}[keyof M] &
  string;

type InferIncludeType<M> = {
  [K in NonAttributeKeys<M>]: M[K] extends NonAttribute<infer T>
    ? T extends Model<any, any>
      ? T
      : never
    : never;
};

export type TypedIncludeable<M> = {
  [K in NonAttributeKeys<M>]: {
    model: ModelStatic<InferIncludeType<M>[K]>;
    as: K;
  };
}[NonAttributeKeys<M>];

export interface ResourceFindOptions<M extends Model> {
  includes?: TypedIncludeable<M>[];
  limit?: number;
  order?: FindOptions<M>["order"];
  where?: WhereOptions<M>;
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
      const vault = new VaultResource(VaultResource.model, b.vault.get());

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

  acl() {
    return this.vault.acl();
  }
}
