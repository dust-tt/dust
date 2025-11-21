import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { z } from "zod";

import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { ProgrammaticUsageConfigurationModel } from "@app/lib/resources/storage/models/programmatic_usage_configurations";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ModelId, Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

// Validation schema for programmatic usage configuration
const ProgrammaticUsageConfigurationSchema = z.object({
  freeCreditCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
  defaultDiscountPercent: z.number().int().min(0).max(100).optional(),
  paygCapCents: z.number().int().positive().nullable().optional(),
});

// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ProgrammaticUsageConfigurationResource
  extends ReadonlyAttributesType<ProgrammaticUsageConfigurationModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ProgrammaticUsageConfigurationResource extends BaseResource<ProgrammaticUsageConfigurationModel> {
  static model: ModelStatic<ProgrammaticUsageConfigurationModel> =
    ProgrammaticUsageConfigurationModel;

  constructor(
    _model: ModelStatic<ProgrammaticUsageConfigurationModel>,
    blob: Attributes<ProgrammaticUsageConfigurationModel>
  ) {
    super(ProgrammaticUsageConfigurationModel, blob);
  }

  /**
   * Computed sId getter for public API exposure.
   * Combines ModelId and workspaceId to create a unique string identifier.
   */
  get sId(): string {
    return ProgrammaticUsageConfigurationResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  /**
   * Converts ModelId and workspaceId to a string identifier (sId).
   * Used for public-facing APIs to avoid exposing internal ModelIds.
   */
  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("programmatic_usage_configuration", {
      id,
      workspaceId,
    });
  }

  /**
   * Validates configuration values using Zod schema
   * @private
   */
  private static validateConfiguration(blob: {
    freeCreditCents?: number | null;
    defaultDiscountPercent?: number;
    paygCapCents?: number | null;
  }): Result<undefined, Error> {
    const result = ProgrammaticUsageConfigurationSchema.safeParse(blob);

    if (!result.success) {
      const errorMessages = result.error.errors
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return new Err(new Error(`Invalid configuration: ${errorMessages}`));
    }

    return new Ok(undefined);
  }

  /**
   * Create a new programmatic usage configuration for a workspace.
   * Note: Only one configuration per workspace is allowed (enforced by unique index).
   */
  static async makeNew(
    auth: Authenticator,
    blob: CreationAttributes<ProgrammaticUsageConfigurationModel>,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<ProgrammaticUsageConfigurationResource, Error>> {
    try {
      // Validate configuration values
      const validation = this.validateConfiguration(blob);
      if (validation.isErr()) {
        return validation as Err<Error>;
      }

      const configuration = await this.model.create(
        {
          ...blob,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        { transaction }
      );

      return new Ok(new this(this.model, configuration.get()));
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  /**
   * Fetch configuration by workspace ID.
   * Since there's a 1:1 relationship, this returns at most one configuration.
   */
  static async fetchByWorkspaceId(
    auth: Authenticator
  ): Promise<ProgrammaticUsageConfigurationResource | null> {
    const rows = await this.model.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      limit: 1,
    });

    return rows[0] ? new this(this.model, rows[0].get()) : null;
  }

  /**
   * Fetch configuration by sId (string identifier).
   * Scoped to the authenticated workspace for security.
   * Never exposes ModelId in public APIs.
   */
  static async fetchById(
    auth: Authenticator,
    sId: string
  ): Promise<ProgrammaticUsageConfigurationResource | null> {
    const modelId = getResourceIdFromSId(sId);
    if (!modelId) {
      return null;
    }

    const rows = await this.model.findAll({
      where: {
        id: modelId,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });

    return rows[0] ? new this(this.model, rows[0].get()) : null;
  }

  /**
   * Update the configuration with validated values.
   * Uses Result pattern for error handling instead of throwing.
   * All validations are performed before hitting the database.
   * Includes workspace scoping for security (prevents IDOR).
   */
  async updateConfiguration(
    auth: Authenticator,
    blob: Partial<{
      freeCreditCents: number | null;
      defaultDiscountPercent: number;
      paygCapCents: number | null;
    }>,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    const validation =
      ProgrammaticUsageConfigurationResource.validateConfiguration(blob);
    if (validation.isErr()) {
      return validation;
    }

    try {
      const [_affectedCount, affectedRows] = await this.model.update(blob, {
        where: {
          id: this.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        transaction,
        returning: true,
      });

      if (affectedRows[0]) {
        Object.assign(this, affectedRows[0].get());
        return new Ok(undefined);
      } else {
        return new Err(
          new Error("Configuration not found or not authorized to update")
        );
      }
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  /**
   * Delete the configuration.
   */
  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    try {
      await this.model.destroy({
        where: {
          id: this.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        transaction,
      });

      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  /**
   * Serialization for API responses.
   * Exposes both id (ModelId) and sId (string) for compatibility.
   */
  toJSON() {
    return {
      sId: this.sId,
      createdAt: this.createdAt.getTime(),
      freeCreditCents: this.freeCreditCents,
      defaultDiscountPercent: this.defaultDiscountPercent,
      paygCapCents: this.paygCapCents,
    };
  }

  /**
   * Safe serialization for logging (includes workspace context).
   */
  toLogJSON() {
    return {
      sId: this.sId,
      workspaceId: this.workspaceId,
      freeCreditCents: this.freeCreditCents,
      defaultDiscountPercent: this.defaultDiscountPercent,
      paygCapCents: this.paygCapCents,
    };
  }
}
