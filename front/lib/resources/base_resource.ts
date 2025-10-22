import type {
  Attributes,
  Model,
  ModelStatic,
  Transaction,
  WhereAttributeHashValue,
} from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import type { ModelId, Result } from "@app/types";

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

export type ResourceLogValue = string | number | null;
export type ResourceLogJSON = Record<string, ResourceLogValue>;

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
    if (affectedRows[0]) {
      Object.assign(this, affectedRows[0].get());
    }

    return [affectedCount];
  }

  abstract delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined | number, Error>>;

  /**
   * Remove 'Resource' suffix and convert to snake_case
   * i.e: UserResource -> user
   * KillSwitchResource -> kill_switch
   * MCPServerViewResource -> mcp_server_view
   */
  className(): string {
    return this.constructor.name
      .replace(/Resource$/, "") // Remove 'Resource' suffix
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2") // handle UPPERCASE followed by Titlecase
      .replace(/([a-z])([A-Z])/g, "$1_$2") // handle normal camelCase
      .toLowerCase();
  }

  /**
   * Method called if the resource is added to the log context using `req.addResourceToLog`.
   * The className() of the Resource will be used as kind of a namespace to avoid key overlap in the `logContext`.
   */
  toLogJSON(): ResourceLogJSON {
    throw new Error("`toContextLog` not implemented");
  }
}
