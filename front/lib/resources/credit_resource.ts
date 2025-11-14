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
      order: [["createdAt", "DESC"]],
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
      // Atomic decrement guarded by remainingAmount >= amountInCents to prevent double spending.
      const [, affectedCount] = await this.model.decrement("remainingAmount", {
        by: amountInCents,
        where: {
          id: this.id,
          workspaceId: this.workspaceId,
          remainingAmount: { [Op.gte]: amountInCents },
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
      await this.model.destroy({ where: { id: this.id, workspaceId: this.workspaceId }, transaction });
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
