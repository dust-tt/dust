import type { ModelId, Result } from "@dust-tt/types";
import type {
  Attributes,
  Model,
  ModelStatic,
  Transaction,
  WhereAttributeHashValue,
} from "sequelize";

import type { Authenticator } from "@app/lib/auth";

interface BaseResourceConstructor<
  T extends BaseResource<M>,
  M extends Model & ResourceWithId,
> {
  new (model: ModelStatic<M>, blob: Attributes<M>): T;
}

// Define an interface with at least an 'id' property
export interface ResourceWithId {
  id: ModelId;
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
export abstract class BaseResource<M extends Model & ResourceWithId> {
  readonly id: number;

  constructor(
    readonly model: ModelStatic<M>,
    blob: Attributes<M>
  ) {
    Object.assign(this, blob);

    this.id = blob.id;
  }

  static async fetchByModelId<
    T extends BaseResource<M>,
    M extends Model & ResourceWithId,
  >(
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

  protected async update(
    blob: Partial<Attributes<M>>,
    transaction?: Transaction
  ): Promise<[affectedCount: number]> {
    const [affectedCount, affectedRows] = await this.model.update(blob, {
      where: {
        // Type casting is required here because of a TypeScript type mismatch.
        // `this.id` is a number, but Sequelize's type definitions expect a more complex type.
        // Casting `this.id` to `WhereAttributeHashValue<Attributes<M>[keyof Attributes<M>]>`
        // resolves this mismatch, ensuring type compatibility for the `where` clause.
        id: this.id as WhereAttributeHashValue<
          Attributes<M>[keyof Attributes<M>]
        >,
      },
      transaction,
      returning: true,
    });

    // Update the current instance with the new values to avoid stale data.
    Object.assign(this, affectedRows[0].get());

    return [affectedCount];
  }

  abstract delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined | number, Error>>;
}
