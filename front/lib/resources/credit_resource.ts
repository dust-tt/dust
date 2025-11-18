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

// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CreditResource extends ReadonlyAttributesType<CreditModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CreditResource extends BaseResource<CreditModel> {
  static model: ModelStatic<CreditModel> = CreditModel;

  constructor(model: ModelStatic<CreditModel>, blob: Attributes<CreditModel>) {
    super(CreditModel, blob);
  }

  // Create a new credit line for a workspace.
  static async makeNew(
    auth: Authenticator,
    blob: CreationAttributes<CreditModel>,
    { transaction }: { transaction?: Transaction } = {}
  ) {
    const credit = await this.model.create(
      {
        ...blob,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      { transaction }
    );

    return new this(this.model, credit.get());
  }

  // Top-up a credit by updating amounts from 0/0 to the specified amount.
  // Sets expiration date to 1 year from now.
  // Only updates if current amounts are 0/0 (idempotency for webhook processing).
  static async topUp({
    auth,
    invoiceOrLineItemId,
    amountCents,
    transaction,
  }: {
    auth: Authenticator;
    invoiceOrLineItemId: string;
    amountCents: number;
    transaction?: Transaction;
  }): Promise<Result<CreditResource, Error>> {
    try {
      const workspaceId = auth.getNonNullableWorkspace().id;

      // Calculate expiration date: 1 year from now
      const expirationDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

      // Update only if current amounts are 0/0 (ensures idempotency)
      const [affectedCount] = await this.model.update(
        {
          initialAmount: amountCents,
          remainingAmount: amountCents,
          expirationDate,
        },
        {
          where: {
            workspaceId,
            invoiceOrLineItemId,
            initialAmount: 0,
            remainingAmount: 0,
          },
          transaction,
        }
      );

      if (!affectedCount || affectedCount < 1) {
        return new Err(
          new Error(
            "Credit not found or already topped up (initialAmount/remainingAmount not 0/0)"
          )
        );
      }

      // Fetch the updated credit
      const credit = await this.model.findOne({
        where: {
          workspaceId,
          invoiceOrLineItemId,
        },
        transaction,
      });

      if (!credit) {
        return new Err(new Error("Credit not found after top-up"));
      }

      return new Ok(new this(this.model, credit.get()));
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

  static async listActive(auth: Authenticator) {
    const now = new Date();
    return this.baseFetch(auth, {
      where: {
        remainingAmount: { [Op.gt]: 0 },
        [Op.or]: [
          { expirationDate: null },
          { expirationDate: { [Op.gt]: now } },
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
          [Op.or]: [
            { expirationDate: null },
            { expirationDate: { [Op.gt]: now } },
          ],
        },
        transaction,
      });
      if (!affectedCount || affectedCount < 1) {
        return new Err(new Error("Insufficient credit on this line."));
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
      remainingAmount: this.remainingAmount,
      expirationDate: this.expirationDate
        ? this.expirationDate.toISOString()
        : null,
    };
  }
}
