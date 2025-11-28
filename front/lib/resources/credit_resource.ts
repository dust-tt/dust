import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { Op, Sequelize } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { CreditModel } from "@app/lib/resources/storage/models/credits";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { PokeCreditType } from "@app/pages/api/poke/workspaces/[wId]/credits";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok, removeNulls } from "@app/types";
import type { CreditDisplayData } from "@app/types/credits";
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

  get sId(): string {
    return makeSId("credit", { id: this.id, workspaceId: this.workspaceId });
  }

  // Create a new credit line for a workspace.
  // Note: initialAmountCents is immutable after creation.
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

  async start(
    startDate?: Date,
    expirationDate?: Date,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    const effectiveStartDate = startDate ?? new Date();
    const effectiveExpirationDate =
      expirationDate ??
      new Date(Date.now() + CREDIT_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);

    const [, affectedRows] = await this.model.update(
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
        returning: true,
      }
    );

    if (affectedRows.length === 0) {
      return new Err(new Error("Credit already started"));
    }

    return new Ok(undefined);
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
        // Credit must have remaining balance (consumed < initial)
        [Op.and]: [
          Sequelize.where(Sequelize.col("consumedAmountCents"), {
            [Op.lt]: Sequelize.col("initialAmountCents"),
          }),
        ],

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

  static async fetchByInvoiceOrLineItemId(
    auth: Authenticator,
    invoiceOrLineItemId: string
  ) {
    const [row] = await this.baseFetch(auth, {
      where: {
        invoiceOrLineItemId,
      },
    });
    return row ?? null;
  }

  static async fetchByTypeAndDates(
    auth: Authenticator,
    type: (typeof CREDIT_TYPES)[number],
    startDate: Date,
    expirationDate: Date
  ) {
    const [row] = await this.baseFetch(auth, {
      where: {
        type,
        startDate,
        expirationDate,
      },
    });
    return row ?? null;
  }

  /**
   * Consume a given amount of credits, allowing for over-consumption.
   * This is because users consume credits after Dust has spent the tokens,
   * so it's not possible to preemptively block consumption.
   *
   * Over-consumption should however stay minimal
   */
  async consume(
    amountInCents: number,
    { transaction }: { transaction?: Transaction } = {}
  ) {
    if (amountInCents <= 0) {
      return new Err(new Error("Amount to consume must be strictly positive."));
    }
    if (this.consumedAmountCents > this.initialAmountCents) {
      return new Err(new Error("Credit has already been consumed."));
    }
    const now = new Date();
    const [, affectedCount] = await this.model.increment(
      "consumedAmountCents",
      {
        by: amountInCents,
        where: {
          id: this.id,
          workspaceId: this.workspaceId,
          // Credit must be started (startDate not null and <= now)
          startDate: { [Op.ne]: null, [Op.lte]: now },
          // Credit must not be expired
          [Op.or]: [
            { expirationDate: null },
            { expirationDate: { [Op.gt]: now } },
          ],
        },
        transaction,
      }
    );
    if (!affectedCount || affectedCount < 1) {
      return new Err(
        new Error(
          "Insufficient credit on this line, or credit not yet started/already expired."
        )
      );
    }
    return new Ok(undefined);
  }

  async markAsPaid(
    invoiceOrLineItemId: string,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    await this.model.update(
      { invoiceOrLineItemId },
      {
        where: { id: this.id, workspaceId: this.workspaceId },
        transaction,
      }
    );
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

  toJSON(): CreditDisplayData {
    return {
      sId: this.sId,
      type: this.type,
      initialAmount: this.initialAmountCents,
      remainingAmount: this.initialAmountCents - this.consumedAmountCents,
      consumedAmount: this.consumedAmountCents,
      startDate: this.startDate ? this.startDate.getTime() : null,
      expirationDate: this.expirationDate
        ? this.expirationDate.getTime()
        : null,
    };
  }

  toLogJSON() {
    return {
      id: this.id,
      workspaceId: this.workspaceId,
      type: this.type,
      initialAmountCents: this.initialAmountCents,
      consumedAmountCents: this.consumedAmountCents,
      startDate: this.startDate ? this.startDate.toISOString() : null,
      expirationDate: this.expirationDate
        ? this.expirationDate.toISOString()
        : null,
      invoiceOrLineItemId: this.invoiceOrLineItemId,
    };
  }

  toPokeJSON(): PokeCreditType {
    return {
      id: this.id,
      createdAt: this.createdAt.toISOString(),
      type: this.type,
      initialAmountCents: this.initialAmountCents,
      consumedAmountCents: this.consumedAmountCents,
      remainingAmountCents: this.initialAmountCents - this.consumedAmountCents,
      startDate: this.startDate ? this.startDate.toISOString() : null,
      expirationDate: this.expirationDate
        ? this.expirationDate.toISOString()
        : null,
      discount: this.discount,
      invoiceOrLineItemId: this.invoiceOrLineItemId,
    };
  }
}
