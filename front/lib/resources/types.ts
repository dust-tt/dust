import type {
  FindOptions,
  Includeable,
  Model,
  ModelStatic,
  NonAttribute,
  WhereOptions,
} from "sequelize";

import type {
  BaseModel,
  SoftDeletableModel,
} from "@app/lib/resources/storage/wrappers/base";

export type NonAttributeKeys<M> = {
  [K in keyof M]: M[K] extends NonAttribute<infer T>
    ? T extends Array<BaseModel<any>>
      ? K
      : T extends BaseModel<any>
        ? K
        : never
    : never;
}[keyof M] &
  string;

export type InferIncludeType<M> = {
  [K in NonAttributeKeys<M>]: M[K] extends NonAttribute<infer T>
    ? T extends Array<infer U>
      ? U extends BaseModel<any>
        ? U
        : never
      : T extends BaseModel<any>
        ? T
        : never
    : never;
};

export type TypedIncludeable<M> = {
  [K in NonAttributeKeys<M>]: {
    model: ModelStatic<InferIncludeType<M>[K]>;
    as: K;
    required?: boolean;
    where?: WhereOptions<InferIncludeType<M>[K]>;
    include?: Includeable[];
  };
}[NonAttributeKeys<M>];

export type ResourceFindOptions<M extends Model> = {
  attributes?: FindOptions<M>["attributes"];
  includes?: TypedIncludeable<M>[];
  limit?: number;
  order?: FindOptions<M>["order"];
  where?: WhereOptions<M>;
} & (M extends SoftDeletableModel
  ? { includeDeleted?: boolean }
  : { includeDeleted?: never });
