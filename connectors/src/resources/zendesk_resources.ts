import type { Result } from "@dust-tt/types";
import { Ok } from "@dust-tt/types";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import {
  ZendeskArticle,
  ZendeskBrand,
  ZendeskCategory,
  ZendeskConfiguration,
  ZendeskTicket,
} from "@connectors/lib/models/zendesk";
import { BaseResource } from "@connectors/resources/base_resource";
import type { ReadonlyAttributesType } from "@connectors/resources/storage/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ZendeskConfigurationResource
  extends ReadonlyAttributesType<ZendeskConfiguration> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ZendeskConfigurationResource extends BaseResource<ZendeskConfiguration> {
  static model: ModelStatic<ZendeskConfiguration> = ZendeskConfiguration;

  constructor(
    model: ModelStatic<ZendeskConfiguration>,
    blob: Attributes<ZendeskConfiguration>
  ) {
    super(ZendeskConfiguration, blob);
  }

  async postFetchHook(): Promise<void> {
    return;
  }

  async delete(transaction?: Transaction): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: {
        connectorId: this.connectorId,
      },
      transaction,
    });
    return new Ok(undefined);
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,

      subdomain: this.subdomain,
      conversationsSlidingWindow: this.conversationsSlidingWindow,

      connectorId: this.connectorId,
    };
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ZendeskBrandResource
  extends ReadonlyAttributesType<ZendeskBrand> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ZendeskBrandResource extends BaseResource<ZendeskBrand> {
  static model: ModelStatic<ZendeskBrand> = ZendeskBrand;

  constructor(
    model: ModelStatic<ZendeskBrand>,
    blob: Attributes<ZendeskBrand>
  ) {
    super(ZendeskBrand, blob);
  }

  async postFetchHook(): Promise<void> {
    return;
  }

  async delete(transaction?: Transaction): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: {
        connectorId: this.connectorId,
      },
      transaction,
    });
    return new Ok(undefined);
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,

      name: this.name,
      url: this.url,
      hasHelpCenter: this.hasHelpCenter,
      subdomain: this.subdomain,
      brandId: this.brandId,
      permission: this.permission,

      connectorId: this.connectorId,
    };
  }

  static async makeNew({
    blob,
    transaction,
  }: {
    blob: CreationAttributes<ZendeskBrand>;
    transaction?: Transaction;
  }): Promise<ZendeskBrandResource> {
    let brand;
    if (transaction) {
      brand = await ZendeskBrand.create({ ...blob }, { transaction });
    } else {
      brand = await ZendeskBrand.create({ ...blob });
    }
    return new this(this.model, brand.get());
  }

  async revokePermissions(): Promise<void> {
    await this.revokeHelpCenterPermissions();
    await this.revokeTicketsPermissions();
  }

  async revokeHelpCenterPermissions(): Promise<void> {
    if (this?.permission === "read") {
      await this.update({ permission: "none" });
    }
    await ZendeskCategory.update(
      { permission: "none" },
      { where: { brandId: this.brandId } }
    );
    await ZendeskArticle.update(
      { permission: "none" },
      { where: { brandId: this.brandId } }
    );
  }

  async revokeTicketsPermissions(): Promise<void> {
    if (this?.permission === "read") {
      await this.update({ permission: "none" });
    }
    await ZendeskTicket.update(
      { permission: "none" },
      { where: { brandId: this.brandId } }
    );
  }

  static async fetchByBrandId({
    connectorId,
    brandId,
  }: {
    connectorId: number;
    brandId: number;
  }): Promise<ZendeskBrandResource | null> {
    const blob = await ZendeskBrand.findOne({
      where: { connectorId, brandId },
    });
    return blob && new this(this.model, blob.get());
  }

  static async fetchAllReadOnly({
    connectorId,
  }: {
    connectorId: number;
  }): Promise<ZendeskBrandResource[]> {
    return ZendeskBrand.findAll({
      where: { connectorId, permission: "read" },
    }).then((brands) => brands.map((brand) => new this(this.model, brand)));
  }

  static async fetchReadOnlyTickets({
    connectorId,
    brandId,
  }: {
    connectorId: number;
    brandId: number;
  }): Promise<ZendeskTicket[]> {
    return ZendeskTicket.findAll({
      where: { connectorId, brandId, permission: "read" },
    });
  }

  static async fetchReadOnlyCategories({
    connectorId,
    brandId,
  }: {
    connectorId: number;
    brandId: number;
  }): Promise<ZendeskCategoryResource[]> {
    return ZendeskCategory.findAll({
      where: { connectorId, brandId, permission: "read" },
    }).then((categories) =>
      categories.map(
        (category) => new ZendeskCategoryResource(ZendeskCategory, category)
      )
    );
  }

  static async fetchBrandsWithHelpCenter({
    connectorId,
  }: {
    connectorId: number;
  }): Promise<ZendeskBrandResource[]> {
    return ZendeskBrand.findAll({
      where: {
        connectorId: connectorId,
        permission: "read",
        hasHelpCenter: true,
      },
    }).then((brands) => brands.map((brand) => new this(this.model, brand)));
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ZendeskCategoryResource
  extends ReadonlyAttributesType<ZendeskCategory> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ZendeskCategoryResource extends BaseResource<ZendeskCategory> {
  static model: ModelStatic<ZendeskCategory> = ZendeskCategory;

  constructor(
    model: ModelStatic<ZendeskCategory>,
    blob: Attributes<ZendeskCategory>
  ) {
    super(ZendeskCategory, blob);
  }

  static async makeNew({
    blob,
    transaction,
  }: {
    blob: CreationAttributes<ZendeskCategory>;
    transaction?: Transaction;
  }): Promise<ZendeskCategoryResource> {
    let category;
    if (transaction) {
      category = await ZendeskCategory.create({ ...blob }, { transaction });
    } else {
      category = await ZendeskCategory.create({ ...blob });
    }
    return new this(this.model, category.get());
  }

  async postFetchHook(): Promise<void> {
    return;
  }

  async delete(transaction?: Transaction): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: {
        connectorId: this.connectorId,
      },
      transaction,
    });
    return new Ok(undefined);
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,

      name: this.name,
      url: this.url,
      categoryId: this.categoryId,
      brandId: this.brandId,
      permission: this.permission,

      connectorId: this.connectorId,
    };
  }

  static async fetchByCategoryId({
    connectorId,
    categoryId,
  }: {
    connectorId: number;
    categoryId: number;
  }): Promise<ZendeskCategoryResource | null> {
    const blob = await ZendeskCategory.findOne({
      where: { connectorId, categoryId },
    });
    return blob && new this(this.model, blob.get());
  }

  static async fetchAllReadOnly({
    connectorId,
  }: {
    connectorId: number;
  }): Promise<ZendeskCategoryResource[]> {
    return ZendeskCategory.findAll({
      where: { connectorId, permission: "read" },
    }).then((categories) =>
      categories.map((category) => new this(this.model, category))
    );
  }

  static async fetchReadOnlyArticles({
    connectorId,
    categoryId,
  }: {
    connectorId: number;
    categoryId: number;
  }): Promise<ZendeskArticle[]> {
    return ZendeskArticle.findAll({
      where: { connectorId, categoryId, permission: "read" },
    });
  }

  async revokePermissions(): Promise<void> {
    if (this?.permission === "read") {
      await this.update({ permission: "none" });
    }
  }
}
