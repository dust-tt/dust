import type { ContentNode, Result } from "@dust-tt/types";
import { Ok } from "@dust-tt/types";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { Op } from "sequelize";

import {
  getArticleInternalId,
  getBrandInternalId,
  getCategoryInternalId,
  getHelpCenterInternalId,
  getTicketInternalId,
  getTicketsInternalId,
} from "@connectors/connectors/zendesk/lib/id_conversions";
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

  static async makeNew({
    blob,
    transaction,
  }: {
    blob: CreationAttributes<ZendeskConfiguration>;
    transaction?: Transaction;
  }): Promise<ZendeskConfigurationResource> {
    const configuration = await ZendeskConfiguration.create(
      { ...blob },
      transaction && { transaction }
    );
    return new this(this.model, configuration.get());
  }

  static async fetchByConnectorId(
    connectorId: number
  ): Promise<ZendeskConfigurationResource | null> {
    const configuration = await ZendeskConfiguration.findOne({
      where: { connectorId },
    });
    return configuration && new this(this.model, configuration.get());
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

  /**
   * Deletes the brand data, keeping all children data (tickets, categories, articles).
   */
  async delete(transaction?: Transaction): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: { connectorId: this.connectorId, brandId: this.brandId },
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
      helpCenterPermission: this.helpCenterPermission,
      ticketsPermission: this.ticketsPermission,
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
    const brand = await ZendeskBrand.create(
      { ...blob },
      transaction && { transaction }
    );
    return new this(this.model, brand.get());
  }

  async revokeAllPermissions(): Promise<void> {
    await this.revokeHelpCenterPermissions();
    await this.revokeTicketsPermissions();
  }

  async revokeHelpCenterPermissions(): Promise<void> {
    if (this.helpCenterPermission === "read") {
      await this.update({ helpCenterPermission: "none" });
    }
  }

  async revokeTicketsPermissions(): Promise<void> {
    if (this.ticketsPermission === "read") {
      await this.update({ ticketsPermission: "none" });
    }
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

  static async fetchByBrandIds({
    connectorId,
    brandIds,
  }: {
    connectorId: number;
    brandIds: number[];
  }): Promise<ZendeskBrandResource[]> {
    const brands = await ZendeskBrand.findAll({
      where: { connectorId, brandId: { [Op.in]: brandIds } },
    });
    return brands.map((brand) => new this(this.model, brand.get()));
  }

  static async fetchAllReadOnly({
    connectorId,
  }: {
    connectorId: number;
  }): Promise<ZendeskBrandResource[]> {
    const brands = await ZendeskBrand.findAll({
      where: {
        connectorId,
        helpCenterPermission: "read",
        ticketsPermission: "read",
      },
    });
    return brands.map((brand) => new this(this.model, brand.get()));
  }

  static async fetchAllBrandIds({
    connectorId,
  }: {
    connectorId: number;
  }): Promise<number[]> {
    const brands = await ZendeskBrand.findAll({
      where: { connectorId },
      attributes: ["brandId"],
    });
    return brands.map((brand) => brand.brandId);
  }

  static async fetchAllWithHelpCenter({
    connectorId,
  }: {
    connectorId: number;
  }): Promise<ZendeskBrandResource[]> {
    const brands = await ZendeskBrand.findAll({
      where: {
        connectorId,
        helpCenterPermission: "read",
        hasHelpCenter: true,
      },
    });
    return brands.map((brand) => new this(this.model, brand.get()));
  }

  toContentNode({ connectorId }: { connectorId: number }): ContentNode {
    return {
      provider: "zendesk",
      internalId: getBrandInternalId(connectorId, this.brandId),
      parentInternalId: null,
      type: "folder",
      title: this.name,
      sourceUrl: this.url,
      expandable: true,
      permission:
        this.helpCenterPermission === "read" &&
        this.ticketsPermission === "read"
          ? "read"
          : "none",
      dustDocumentId: null,
      lastUpdatedAt: this.updatedAt.getTime(),
    };
  }

  getHelpCenterContentNode({
    connectorId,
  }: {
    connectorId: number;
  }): ContentNode {
    return {
      provider: "zendesk",
      internalId: getHelpCenterInternalId(connectorId, this.brandId),
      parentInternalId: getBrandInternalId(connectorId, this.brandId),
      type: "folder",
      title: "Help Center",
      sourceUrl: null,
      expandable: true,
      permission: this.helpCenterPermission,
      dustDocumentId: null,
      lastUpdatedAt: null,
    };
  }

  getTicketsContentNode({ connectorId }: { connectorId: number }): ContentNode {
    return {
      provider: "zendesk",
      internalId: getTicketsInternalId(connectorId, this.brandId),
      parentInternalId: getBrandInternalId(connectorId, this.brandId),
      type: "folder",
      title: "Tickets",
      sourceUrl: null,
      expandable: false,
      permission: this.ticketsPermission,
      dustDocumentId: null,
      lastUpdatedAt: null,
    };
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
    const category = await ZendeskCategory.create(
      { ...blob },
      transaction && { transaction }
    );
    return new this(this.model, category.get());
  }

  async postFetchHook(): Promise<void> {
    return;
  }

  async delete(transaction?: Transaction): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: { connectorId: this.connectorId, categoryId: this.categoryId },
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
    const category = await ZendeskCategory.findOne({
      where: { connectorId, categoryId },
    });
    return category && new this(this.model, category.get());
  }

  static async fetchByCategoryIds({
    connectorId,
    categoryIds,
  }: {
    connectorId: number;
    categoryIds: number[];
  }): Promise<ZendeskCategoryResource[]> {
    const categories = await ZendeskCategory.findAll({
      where: { connectorId, categoryId: { [Op.in]: categoryIds } },
    });
    return categories.map(
      (category) => category && new this(this.model, category.get())
    );
  }

  static async fetchByBrandId({
    connectorId,
    brandId,
  }: {
    connectorId: number;
    brandId: number;
  }): Promise<ZendeskCategoryResource[]> {
    const categories = await ZendeskCategory.findAll({
      where: { connectorId, brandId },
    });
    return categories.map(
      (category) =>
        category && new ZendeskCategoryResource(ZendeskCategory, category)
    );
  }

  static async fetchByBrandIdReadOnly({
    connectorId,
    brandId,
  }: {
    connectorId: number;
    brandId: number;
  }): Promise<ZendeskCategoryResource[]> {
    const categories = await ZendeskCategory.findAll({
      where: { connectorId, brandId, permission: "read" },
    });
    return categories.map(
      (category) =>
        category && new ZendeskCategoryResource(ZendeskCategory, category)
    );
  }

  static async fetchAllReadOnly({
    connectorId,
  }: {
    connectorId: number;
  }): Promise<ZendeskCategoryResource[]> {
    const categories = await ZendeskCategory.findAll({
      where: { connectorId, permission: "read" },
    });
    return categories.map((category) => new this(this.model, category.get()));
  }

  static async deleteByBrandId({
    connectorId,
    brandId,
  }: {
    connectorId: number;
    brandId: number;
  }): Promise<void> {
    await ZendeskCategory.destroy({ where: { connectorId, brandId } });
  }

  static async revokePermissionsForBrand({
    connectorId,
    brandId,
  }: {
    connectorId: number;
    brandId: number;
  }) {
    await ZendeskCategory.update(
      { permission: "none" },
      { where: { connectorId, brandId } }
    );
  }

  async revokePermissions(): Promise<void> {
    if (this.permission === "read") {
      await this.update({ permission: "none" });
    }
  }

  toContentNode({ connectorId }: { connectorId: number }): ContentNode {
    return {
      provider: "zendesk",
      internalId: getCategoryInternalId(connectorId, this.categoryId),
      parentInternalId: getHelpCenterInternalId(connectorId, this.brandId),
      type: "folder",
      title: this.name,
      sourceUrl: this.url,
      expandable: false,
      permission: this.permission,
      dustDocumentId: null,
      lastUpdatedAt: this.updatedAt.getTime(),
    };
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ZendeskTicketResource
  extends ReadonlyAttributesType<ZendeskTicket> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ZendeskTicketResource extends BaseResource<ZendeskTicket> {
  static model: ModelStatic<ZendeskTicket> = ZendeskTicket;

  constructor(
    model: ModelStatic<ZendeskTicket>,
    blob: Attributes<ZendeskTicket>
  ) {
    super(ZendeskTicket, blob);
  }

  static async makeNew({
    blob,
    transaction,
  }: {
    blob: CreationAttributes<ZendeskTicket>;
    transaction?: Transaction;
  }): Promise<ZendeskTicketResource> {
    const article = await ZendeskTicket.create(
      { ...blob },
      transaction && { transaction }
    );
    return new this(this.model, article.get());
  }

  async postFetchHook(): Promise<void> {
    return;
  }

  async delete(transaction?: Transaction): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: { connectorId: this.connectorId, ticketId: this.ticketId },
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
      ticketId: this.ticketId,
      brandId: this.brandId,
      permission: this.permission,

      connectorId: this.connectorId,
    };
  }

  toContentNode({ connectorId }: { connectorId: number }): ContentNode {
    return {
      provider: "zendesk",
      internalId: getTicketInternalId(connectorId, this.ticketId),
      parentInternalId: getBrandInternalId(connectorId, this.brandId),
      type: "file",
      title: this.name,
      sourceUrl: this.url,
      expandable: false,
      permission: this.permission,
      dustDocumentId: null,
      lastUpdatedAt: this.updatedAt.getTime(),
    };
  }

  static async fetchByTicketId({
    connectorId,
    ticketId,
  }: {
    connectorId: number;
    ticketId: number;
  }): Promise<ZendeskTicketResource | null> {
    const ticket = await ZendeskTicket.findOne({
      where: { connectorId, ticketId },
    });
    return ticket && new this(this.model, ticket.get());
  }

  static async fetchByBrandIdReadOnly({
    connectorId,
    brandId,
  }: {
    connectorId: number;
    brandId: number;
  }): Promise<ZendeskTicketResource[]> {
    const tickets = await ZendeskTicket.findAll({
      where: { connectorId, brandId, permission: "read" },
    });
    return tickets.map(
      (ticket) => new ZendeskTicketResource(ZendeskTicket, ticket)
    );
  }

  static async fetchByBrandId({
    connectorId,
    brandId,
  }: {
    connectorId: number;
    brandId: number;
  }): Promise<ZendeskTicketResource[]> {
    const tickets = await ZendeskTicket.findAll({
      where: { connectorId, brandId },
    });
    return tickets.map(
      (ticket) => new ZendeskTicketResource(ZendeskTicket, ticket)
    );
  }

  static async deleteByBrandId({
    connectorId,
    brandId,
  }: {
    connectorId: number;
    brandId: number;
  }): Promise<void> {
    await ZendeskTicket.destroy({ where: { connectorId, brandId } });
  }

  static async revokePermissionsForBrand({
    connectorId,
    brandId,
  }: {
    connectorId: number;
    brandId: number;
  }): Promise<void> {
    await ZendeskTicket.update(
      { permission: "none" },
      { where: { connectorId, brandId } }
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ZendeskArticleResource
  extends ReadonlyAttributesType<ZendeskArticle> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ZendeskArticleResource extends BaseResource<ZendeskArticle> {
  static model: ModelStatic<ZendeskArticle> = ZendeskArticle;

  constructor(
    model: ModelStatic<ZendeskArticle>,
    blob: Attributes<ZendeskArticle>
  ) {
    super(ZendeskArticle, blob);
  }

  static async makeNew({
    blob,
    transaction,
  }: {
    blob: CreationAttributes<ZendeskArticle>;
    transaction?: Transaction;
  }): Promise<ZendeskArticleResource> {
    const article = await ZendeskArticle.create(
      { ...blob },
      transaction && { transaction }
    );
    return new this(this.model, article.get());
  }

  async postFetchHook(): Promise<void> {
    return;
  }

  async delete(transaction?: Transaction): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: { connectorId: this.connectorId, articleId: this.articleId },
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
      articleId: this.articleId,
      categoryId: this.categoryId,
      brandId: this.brandId,
      permission: this.permission,

      connectorId: this.connectorId,
    };
  }

  toContentNode({ connectorId }: { connectorId: number }): ContentNode {
    return {
      provider: "zendesk",
      internalId: getArticleInternalId(connectorId, this.articleId),
      parentInternalId: getCategoryInternalId(connectorId, this.categoryId),
      type: "file",
      title: this.name,
      sourceUrl: this.url,
      expandable: false,
      permission: this.permission,
      dustDocumentId: null,
      lastUpdatedAt: this.updatedAt.getTime(),
    };
  }

  static async fetchByArticleId({
    connectorId,
    articleId,
  }: {
    connectorId: number;
    articleId: number;
  }): Promise<ZendeskArticleResource | null> {
    const article = await ZendeskArticle.findOne({
      where: { connectorId, articleId },
    });
    return article && new this(this.model, article.get());
  }

  static async fetchByCategoryId({
    connectorId,
    categoryId,
  }: {
    connectorId: number;
    categoryId: number;
  }): Promise<ZendeskArticleResource[]> {
    const articles = await ZendeskArticle.findAll({
      where: { connectorId, categoryId },
    });
    return articles.map(
      (article) => new ZendeskArticleResource(ZendeskArticle, article)
    );
  }

  static async fetchByCategoryIdReadOnly({
    connectorId,
    categoryId,
  }: {
    connectorId: number;
    categoryId: number;
  }): Promise<ZendeskArticleResource[]> {
    const articles = await ZendeskArticle.findAll({
      where: { connectorId, categoryId, permission: "read" },
    });
    return articles.map(
      (article) => new ZendeskArticleResource(ZendeskArticle, article)
    );
  }

  static async fetchByBrandId({
    connectorId,
    brandId,
  }: {
    connectorId: number;
    brandId: number;
  }): Promise<ZendeskArticleResource[]> {
    const articles = await ZendeskArticle.findAll({
      where: { connectorId, brandId },
    });
    return articles.map(
      (article) => new ZendeskArticleResource(ZendeskArticle, article)
    );
  }

  static async deleteByCategoryId({
    connectorId,
    categoryId,
  }: {
    connectorId: number;
    categoryId: number;
  }) {
    await ZendeskArticle.destroy({ where: { connectorId, categoryId } });
  }

  static async deleteByBrandId({
    connectorId,
    brandId,
  }: {
    connectorId: number;
    brandId: number;
  }) {
    await ZendeskArticle.destroy({ where: { connectorId, brandId } });
  }

  static async revokePermissionsForBrand({
    connectorId,
    brandId,
  }: {
    connectorId: number;
    brandId: number;
  }) {
    await ZendeskArticle.update(
      { permission: "none" },
      { where: { connectorId, brandId } }
    );
  }
}
