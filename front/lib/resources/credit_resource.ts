import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { CreditModel } from "@app/lib/resources/storage/models/credits";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok, removeNulls } from "@app/types";
import {
  CREDIT_EXPIRATION_DAYS,
  CREDIT_TYPES,
  isCreditType,
} from "@app/types/credits";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CreditResource extends ReadonlyAttributesType<CreditModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CreditResource extends BaseResource<CreditModel> {
  static model: ModelStatic<CreditModel> = CreditModel;

  constructor(_model: ModelStatic<CreditModel>, blob: Attributes<CreditModel>) {
    super(CreditModel, blob);
  }

  // Create a new credit line for a workspace.
  // Note: initialAmount is immutable after creation.
  // The credit is not consumable until start() is called (startDate is set).
  static async makeNew(
    auth: Authenticator,
    blob: CreationAttributes<CreditModel>,
    { transaction }: { transaction?: Transaction } = {}
  ) {
    // Validate type field using type guard
    if (!blob.type || !isCreditType(blob.type)) {
      throw new Error(
        `Invalid credit type: ${blob.type}. Must be one of: ${CREDIT_TYPES.join(", ")}`
      );
    }

    const credit = await this.model.create(
      {
        ...blob,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      { transaction }
    );

    return new this(this.model, credit.get());
  }

  /**
   * Start a credit by setting startDate and expirationDate.
   * This makes the credit active and consumable.
   * Idempotent: only updates if startDate is null, returns success if already started.
   *
   * @param startDate - When the credit becomes active (default: now)
   * @param expirationDate - When the credit expires (default: now + CREDIT_EXPIRATION_DAYS)
   * @param transaction - Optional database transaction
   * @returns Result with undefined on success or an error
   */
  async start(
    startDate?: Date,
    expirationDate?: Date,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    try {
      const effectiveStartDate = startDate ?? new Date();
      const effectiveExpirationDate =
        expirationDate ??
        new Date(Date.now() + CREDIT_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);

      // Update only if startDate is null (ensures idempotency)
      await this.model.update(
        {
          startDate: effectiveStartDate,
          expirationDate: effectiveExpirationDate,
        },
        {
          where: {
            id: this.id,
            workspaceId: this.workspaceId,
            startDate: null,
          },
          transaction,
        }
      );

      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<CreditModel>
  ) {
    const { where, ...rest } = options ?? {};
    const rows = await this.model.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      ...rest,
    });
    return rows.map((r) => new this(this.model, r.get()));
  }

  static async listAll(auth: Authenticator) {
    return this.baseFetch(auth);
  }

  static async listActive(auth: Authenticator, fromDate: Date = new Date()) {
    const now = new Date();
    return this.baseFetch(auth, {
      where: {
        remainingAmount: { [Op.gt]: 0 },
        // Credit must be started (startDate not null and <= now)
        startDate: { [Op.ne]: null, [Op.lte]: now },
        // Credit must not be expired
        [Op.or]: [
          { expirationDate: null },
          { expirationDate: { [Op.gt]: fromDate } },
        ],
      },
    });
  }

  static async fetchByIds(auth: Authenticator, ids: string[]) {
    return this.baseFetch(auth, {
      where: {
        id: removeNulls(
          ids.map((v) => (typeof v === "string" ? parseInt(v, 10) : v))
        ),
      },
    });
  }

  static async fetchById(auth: Authenticator, id: string) {
    const [row] = await this.fetchByIds(auth, [id]);
    return row ?? null;
  }

  async consume(
    amountInCents: number,
    { transaction }: { transaction?: Transaction } = {}
  ) {
    if (amountInCents <= 0) {
      return new Err(new Error("Amount to consume must be strictly positive."));
    }
    try {
      const now = new Date();
      const [, affectedCount] = await this.model.decrement("remainingAmount", {
        by: amountInCents,
        where: {
          id: this.id,
          workspaceId: this.workspaceId,
          remainingAmount: { [Op.gte]: amountInCents },
          // Credit must be started (startDate not null and <= now)
          startDate: { [Op.ne]: null, [Op.lte]: now },
          // Credit must not be expired
          [Op.or]: [
            { expirationDate: null },
            { expirationDate: { [Op.gt]: now } },
          ],
        },
        transaction,
      });
      if (!affectedCount || affectedCount < 1) {
        return new Err(
          new Error(
            "Insufficient credit on this line, or credit not yet started/already expired."
          )
        );
      }
      return new Ok(undefined);
    } catch (e) {
      return new Err(normalizeError(e));
    }
  }

  async delete(
    _auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined | number, Error>> {
    try {
      await this.model.destroy({
        where: { id: this.id, workspaceId: this.workspaceId },
        transaction,
      });
      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  toLogJSON() {
    return {
      id: this.id,
      workspaceId: this.workspaceId,
      type: this.type,
      remainingAmount: this.remainingAmount,
      startDate: this.startDate ? this.startDate.toISOString() : null,
      expirationDate: this.expirationDate
        ? this.expirationDate.toISOString()
        : null,
      invoiceOrLineItemId: this.invoiceOrLineItemId,
    };
  }
}
