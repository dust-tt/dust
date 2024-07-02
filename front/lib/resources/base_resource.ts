import type { ModelId, Result } from "@dust-tt/types";
import type { Attributes, Model, ModelStatic, Transaction } from "sequelize";

import type { Authenticator } from "@app/lib/auth";

interface BaseResourceConstructor<T extends BaseResource<M>, M extends Model> {
  new (model: ModelStatic<M>, blob: Attributes<M>): T;
}

/**
 * BaseResource serves as a foundational class for resource management.
 * It encapsulates common CRUD operations for Sequelize models, ensuring a uniform interface
 * across different resources. Each instance represents a specific database row, identified by `id`.
 * - `fetchByModelId`: Static method to retrieve an instance based on its ID, ensuring type safety and
 *   the correct model instantiation.
 * - `delete`: Instance method to delete the current resource from the database.
 * - `update`: Instance method to update the current resource with new values.
 *
 * For now, this class is designed to be extended by specific resource classes, each tied to a Sequelize model.
 */
export abstract class BaseResource<M extends Model> {
  readonly id: number;

  constructor(
    readonly model: ModelStatic<M>,
    blob: Attributes<M>
  ) {
    Object.assign(this, blob);

    this.id = blob.id;
  }

  static async fetchByModelId<T extends BaseResource<M>, M extends Model>(
    this: BaseResourceConstructor<T, M> & {
      model: ModelStatic<M>;
    },
    id: ModelId | string,
    transaction?: Transaction
  ): Promise<T | null> {
    const parsedId = typeof id === "string" ? parseInt(id, 10) : id;
    const blob = await this.model.findByPk(parsedId, { transaction });
    if (!blob) {
      return null;
    }

    // Use `.get` to extract model attributes, omitting Sequelize instance metadata.
    return new this(this.model, blob.get());
  }

  abstract delete(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<Result<undefined, Error>>;
}
