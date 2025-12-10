import assert from "assert";
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
import { UserModel } from "@app/lib/resources/storage/models/user";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { generateRandomModelSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { PokeCreditType } from "@app/pages/api/poke/workspaces/[wId]/credits";
import type { Result } from "@app/types";
import { Err, formatUserFullName, Ok, removeNulls } from "@app/types";
import type { CreditDisplayData } from "@app/types/credits";
import {
  CREDIT_EXPIRATION_DAYS,
  CREDIT_TYPES,
  isCreditType,
} from "@app/types/credits";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CreditResource extends ReadonlyAttributesType<CreditModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CreditResource extends BaseResource<CreditModel> {
  static model: ModelStatic<CreditModel> = CreditModel;

  readonly boughtByUser?: Attributes<UserModel>;

  constructor(
    _model: ModelStatic<CreditModel>,
    blob: Attributes<CreditModel>,
    { boughtByUser }: { boughtByUser?: Attributes<UserModel> } = {}
  ) {
    super(CreditModel, blob);

    this.boughtByUser = boughtByUser;
  }

  get sId(): string {
    return makeSId("credit", { id: this.id, workspaceId: this.workspaceId });
  }

  // Create a new credit line for a workspace.
  // Note: initialAmountMicroUsd is immutable after creation.
  // The credit is not consumable until start() is called (startDate is set).
  static async makeNew(
    auth: Authenticator,
    blob: Omit<CreationAttributes<CreditModel>, "boughtByUserId"> & {
      boughtByUserId?: number | null;
    },
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

  static async listAll(
    auth: Authenticator,
    {
      includeBuyer = false,
    }: {
      includeBuyer?: boolean;
    } = {}
  ) {
    return this.baseFetch(auth, {
      includes: includeBuyer
        ? [
            {
              model: UserModel,
              as: "boughtByUser",
              required: false,
            },
          ]
        : [],
    });
  }

  static async listActive(
    auth: Authenticator,
    minExpirationDate: Date = new Date()
  ) {
    const now = new Date();
    return this.baseFetch(auth, {
      where: {
        // Credit must have remaining balance (consumed < initial)
        [Op.and]: [
          Sequelize.where(Sequelize.col("consumedAmountMicroUsd"), {
            [Op.lt]: Sequelize.col("initialAmountMicroUsd"),
          }),
        ],

        // Credit must be started (startDate not null and <= now)
        startDate: { [Op.ne]: null, [Op.lte]: now },
        // Credit must not be expired
        [Op.or]: [
          { expirationDate: null },
          { expirationDate: { [Op.gt]: minExpirationDate } },
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
   * Returns the total amount of committed credits purchased in the given period.
   * Used to enforce per-billing-cycle purchase limits.
   */
  static async sumCommittedCreditsPurchasedInPeriod(
    auth: Authenticator,
    periodStart: Date,
    periodEnd: Date
  ): Promise<number> {
    const result = await this.model.findOne({
      attributes: [
        [
          Sequelize.fn(
            "COALESCE",
            Sequelize.fn("SUM", Sequelize.col("initialAmountMicroUsd")),
            0
          ),
          "total",
        ],
      ],
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        type: "committed",
        createdAt: {
          [Op.gte]: periodStart,
          [Op.lt]: periodEnd,
        },
      },
      raw: true,
    });
    return parseInt((result as unknown as { total: string })?.total ?? "0", 10);
  }

  /**
   * Consume a given amount of credits, allowing for over-consumption.
   * This is because users consume credits after Dust has spent the tokens,
   * so it's not possible to preemptively block consumption.
   *
   * Over-consumption should however stay minimal
   */
  async consume(
    { amountInMicroUsd }: { amountInMicroUsd: number },
    { transaction }: { transaction?: Transaction } = {}
  ) {
    if (amountInMicroUsd <= 0) {
      return new Err(new Error("Amount to consume must be strictly positive."));
    }
    const now = new Date();

    // Note: Sequelize's increment() returns [affectedRows[], affectedCount] but
    // affectedCount is unreliable for PostgreSQL. We check affectedRows.length instead.
    const [affectedRows] = await this.model.increment(
      "consumedAmountMicroUsd",
      {
        by: amountInMicroUsd,
        where: {
          id: this.id,
          workspaceId: this.workspaceId,
          // Already-depleted credit should not be consumed.
          consumedAmountMicroUsd: {
            [Op.lt]: Sequelize.col("initialAmountMicroUsd"),
          },
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
    if (!affectedRows || affectedRows.length < 1) {
      return new Err(
        new Error(
          "Credit already consumed, not yet started, or already expired."
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

  private async updateCreditAlertIdempotencyKey(
    auth: Authenticator
  ): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();
    const idempotencyKey = generateRandomModelSId("cra");
    const previousMetadata = workspace.metadata ?? {};
    const newMetadata = {
      ...previousMetadata,
      creditAlertIdempotencyKey: idempotencyKey,
    };
    await WorkspaceResource.updateMetadata(workspace.id, newMetadata);
  }

  async start(
    auth: Authenticator,
    {
      startDate,
      expirationDate,
      transaction,
    }: {
      startDate?: Date;
      expirationDate?: Date;
      transaction?: Transaction;
    } = {}
  ): Promise<Result<void, Error>> {
    const effectiveStartDate = startDate ?? new Date();
    const effectiveExpirationDate =
      expirationDate ??
      new Date(Date.now() + CREDIT_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);

    const [, affectedRows] = await CreditModel.update(
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

    await this.updateCreditAlertIdempotencyKey(auth);
    return new Ok(undefined);
  }

  async freeze(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    const [, affectedRows] = await CreditModel.update(
      {
        initialAmountMicroUsd: Sequelize.col("consumedAmountMicroUsd"),
      },
      {
        where: {
          id: this.id,
          workspaceId: this.workspaceId,
        },
        transaction,
        returning: true,
      }
    );

    if (!affectedRows || affectedRows.length === 0) {
      return new Err(new Error("Credit not found or already frozen"));
    }

    await this.updateCreditAlertIdempotencyKey(auth);
    return new Ok(undefined);
  }

  async updateInitialAmountMicroUsd(
    auth: Authenticator,
    initialAmountMicroUsd: number,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<[affectedCount: number]> {
    return this.update(
      {
        initialAmountMicroUsd,
      },
      transaction
    );
  }

  private makeBoughtBy(
    editedByUser: Attributes<UserModel> | undefined,
    editedAt: Date | undefined
  ) {
    if (!editedByUser || !editedAt) {
      return null;
    }

    return {
      editedAt: editedAt.getTime(),
      fullName: formatUserFullName(editedByUser),
      imageUrl: editedByUser.imageUrl,
      email: editedByUser.email,
      userId: editedByUser.sId,
    };
  }

  toJSON(): CreditDisplayData {
    return {
      sId: this.sId,
      type: this.type,
      initialAmountMicroUsd: this.initialAmountMicroUsd,
      remainingAmountMicroUsd:
        this.initialAmountMicroUsd - this.consumedAmountMicroUsd,
      consumedAmountMicroUsd: this.consumedAmountMicroUsd,
      startDate: this.startDate ? this.startDate.getTime() : null,
      expirationDate: this.expirationDate
        ? this.expirationDate.getTime()
        : null,
      boughtByUser: this.makeBoughtBy(this.boughtByUser, this.updatedAt),
    };
  }

  toLogJSON() {
    return {
      id: this.id,
      workspaceId: this.workspaceId,
      type: this.type,
      initialAmountMicroUsd: this.initialAmountMicroUsd,
      consumedAmountMicroUsd: this.consumedAmountMicroUsd,
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
      initialAmountMicroUsd: this.initialAmountMicroUsd,
      consumedAmountMicroUsd: this.consumedAmountMicroUsd,
      remainingAmountMicroUsd:
        this.initialAmountMicroUsd - this.consumedAmountMicroUsd,
      startDate: this.startDate ? this.startDate.toISOString() : null,
      expirationDate: this.expirationDate
        ? this.expirationDate.toISOString()
        : null,
      discount: this.discount,
      invoiceOrLineItemId: this.invoiceOrLineItemId,
    };
  }

  static async deleteAllForWorkspace(auth: Authenticator) {
    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<number | undefined, Error>> {
    assert(
      this.startDate === null || this.type === "free",
      "Cannot delete a credit that has been started. Use freeze() instead."
    );

    const deletedCount = await CreditModel.destroy({
      where: { id: this.id, workspaceId: auth.getNonNullableWorkspace().id },
      transaction,
    });
    return new Ok(deletedCount);
  }
}
