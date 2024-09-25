import type {
  FindOptions,
  Model,
  ModelStatic,
  NonAttribute,
  WhereOptions,
} from "sequelize";

export type NonAttributeKeys<M> = {
  [K in keyof M]: M[K] extends NonAttribute<Model<any, any>> ? K : never;
}[keyof M] &
  string;

export type InferIncludeType<M> = {
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
  paranoid?: boolean;
  where?: WhereOptions<M>;
}
