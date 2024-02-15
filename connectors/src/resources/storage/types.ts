import type { Attributes, Model } from "sequelize";

export type AttributesType<T extends Model> = Attributes<T>;
export type ReadonlyAttributesType<T extends Model> = {
  // Omit `id` since we define it in `BaseResource`.
  readonly [K in keyof Omit<AttributesType<T>, "id">]: AttributesType<T>[K];
};
