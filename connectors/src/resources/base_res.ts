import type { Model, ModelStatic } from "sequelize";

import type { WithoutSequelizeAttributes } from "@connectors/resources/storage/types";

// BaseResource is an abstract foundation for resource classes, focusing
// on stateless behavior. It retains only the ID, enabling operations like
// delete and update. Updates require a full attribute set, ensuring
// explicit data management.
export class BaseResource<T extends Model> {
  constructor(blob: WithoutSequelizeAttributes<T>) {
    Object.assign(this, blob);
  }

  static async fetchById<T extends BaseResource<M>, M extends Model>(
    this: {
      new (blob: WithoutSequelizeAttributes<M>): T;
      model: ModelStatic<M>;
    },
    id: number | string
  ): Promise<T | null> {
    const parsedId = typeof id === "string" ? parseInt(id, 10) : id;
    // Use `raw: true` to avoid the nested level with `dataValues`.
    const blob = await this.model.findByPk(parsedId, { raw: true });
    if (!blob) {
      return null;
    }

    return new this(blob);
  }

  async delete(): Promise<number> {
    throw new Error("Not implemented!");
  }
}
