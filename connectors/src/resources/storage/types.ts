import type { Attributes, Model } from "sequelize";

export type AttributesType<T extends Model> = Attributes<T>;
export type ReadonlyAttributesType<T extends Model> = {
  readonly [K in keyof AttributesType<T>]: AttributesType<T>[K];
};

// This is a temporary type that is a best effort at abstracting Sequelize models methods.
export type WithoutSequelizeAttributes<T extends Model> = Omit<
  T,
  | "_attributes"
  | "sequelize"
  | "dataValues"
  | "_creationAttributes"
  | "isNewRecord"
  | "_model"
  | "where"
  | "getDataValue"
  | "setDataValue"
  | "get"
  | "set"
  | "setAttributes"
  | "changed"
  | "previous"
  | "save"
  | "reload"
  | "validate"
  | "update"
  | "destroy"
  | "restore"
  | "increment"
  | "decrement"
  | "equals"
  | "equalsOneOf"
  | "toJSON"
  | "isSoftDeleted"
  | "addHook"
  | "removeHook"
  | "hasHook"
  | "hasHooks"
>;
