import type { ContentNode, Result } from "@dust-tt/types";
import { Ok } from "@dust-tt/types";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { col, fn, Op } from "sequelize";

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
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ReadonlyAttributesType } from "@connectors/resources/storage/types"; // Attributes are marked as read-only to reflect the stateless nature of our Resource.

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

  static async deleteByConnectorId(
    connectorId: number,
    transaction: Transaction
  ): Promise<void> {
    await this.model.destroy({ where: { connectorId }, transaction });
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
      retentionPeriodDays: this.retentionPeriodDays,

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

  async grantHelpCenterPermissions(): Promise<void> {
    if (this.helpCenterPermission === "none") {
      await this.update({ helpCenterPermission: "read" });
    }
  }

  async grantTicketsPermissions(): Promise<void> {
    if (this.ticketsPermission === "none") {
      await this.update({ ticketsPermission: "read" });
    }
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

  static async fetchByConnector(
    connector: ConnectorResource
  ): Promise<ZendeskBrandResource[]> {
    const brands = await ZendeskBrand.findAll({
      where: { connectorId: connector.id },
    });
    return brands.map((brand) => new this(this.model, brand.get()));
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

  static async fetchAllReadOnly(
    connectorId: number
  ): Promise<ZendeskBrandResource[]> {
    const brands = await ZendeskBrand.findAll({
      where: {
        connectorId,
        [Op.or]: [
          { helpCenterPermission: "read" },
          { ticketsPermission: "read" },
        ],
      },
    });
    return brands.map((brand) => new this(this.model, brand.get()));
  }

  static async fetchAllBrandIds(connectorId: number): Promise<number[]> {
    const brands = await ZendeskBrand.findAll({
      where: { connectorId },
      attributes: ["brandId"],
    });
    return brands.map((brand) => brand.get().brandId);
  }

  static async fetchHelpCenterReadAllowedBrandIds(
    connectorId: number
  ): Promise<number[]> {
    const brands = await ZendeskBrand.findAll({
      where: { connectorId, helpCenterPermission: "read" },
      attributes: ["brandId"],
    });
    return brands.map((brand) => brand.get().brandId);
  }

  static async fetchHelpCenterReadForbiddenBrandIds(
    connectorId: number
  ): Promise<number[]> {
    const brands = await ZendeskBrand.findAll({
      where: { connectorId, helpCenterPermission: "none" },
      attributes: ["brandId"],
    });
    return brands.map((brand) => brand.get().brandId);
  }

  static async fetchTicketsAllowedBrandIds(
    connectorId: number
  ): Promise<number[]> {
    const brands = await ZendeskBrand.findAll({
      where: { connectorId, ticketsPermission: "read" },
      attributes: ["brandId"],
    });
    return brands.map((brand) => brand.get().brandId);
  }

  static async fetchTicketsReadForbiddenBrandIds(
    connectorId: number
  ): Promise<number[]> {
    const brands = await ZendeskBrand.findAll({
      where: { connectorId, ticketsPermission: "none" },
      attributes: ["brandId"],
    });
    return brands.map((brand) => brand.get().brandId);
  }

  static async deleteByConnectorId(
    connectorId: number,
    transaction?: Transaction
  ) {
    await ZendeskBrand.destroy({ where: { connectorId }, transaction });
  }

  toContentNode(connectorId: number): ContentNode {
    const { brandId } = this;
    return {
      internalId: getBrandInternalId({ connectorId, brandId }),
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
      lastUpdatedAt: this.updatedAt.getTime(),
    };
  }

  getHelpCenterContentNode(
    connectorId: number,
    { richTitle = false }: { richTitle?: boolean } = {}
  ): ContentNode & { parentInternalId: string } {
    const { brandId } = this;
    return {
      internalId: getHelpCenterInternalId({ connectorId, brandId }),
      parentInternalId: getBrandInternalId({ connectorId, brandId }),
      type: "folder",
      title: richTitle ? `${this.name} - Help Center` : "Help Center",
      sourceUrl: null,
      expandable: true,
      permission: this.helpCenterPermission,
      lastUpdatedAt: null,
    };
  }

  getTicketsContentNode(
    connectorId: number,
    {
      expandable = false,
      richTitle = false,
    }: { expandable?: boolean; richTitle?: boolean } = {}
  ): ContentNode & { parentInternalId: string } {
    const { brandId } = this;
    return {
      internalId: getTicketsInternalId({ connectorId, brandId }),
      parentInternalId: getBrandInternalId({ connectorId, brandId }),
      type: "folder",
      title: richTitle ? `${this.name} - Tickets` : "Tickets",
      sourceUrl: null,
      expandable: expandable,
      permission: this.ticketsPermission,
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
      where: { connectorId: this.connectorId, id: this.id },
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

  static async fetchByConnector(
    connector: ConnectorResource
  ): Promise<ZendeskCategoryResource[]> {
    const categories = await ZendeskCategory.findAll({
      where: { connectorId: connector.id },
    });
    return categories.map((category) => new this(this.model, category.get()));
  }

  static async fetchByCategoryId({
    connectorId,
    brandId,
    categoryId,
  }: {
    connectorId: number;
    brandId: number;
    categoryId: number;
  }): Promise<ZendeskCategoryResource | null> {
    const category = await ZendeskCategory.findOne({
      where: { connectorId, brandId, categoryId },
    });
    return category && new this(this.model, category.get());
  }

  static async fetchByCategoryIds({
    connectorId,
    brandId,
    categoryIds,
  }: {
    connectorId: number;
    brandId: number;
    categoryIds: number[];
  }): Promise<ZendeskCategoryResource[]> {
    const categories = await ZendeskCategory.findAll({
      where: { connectorId, brandId, categoryId: { [Op.in]: categoryIds } },
    });
    return categories.map((category) => new this(this.model, category.get()));
  }

  static async fetchReadOnlyCategoryIdsByBrandId({
    connectorId,
    brandId,
  }: {
    connectorId: number;
    brandId: number;
  }): Promise<number[]> {
    const categories = await ZendeskCategory.findAll({
      where: { connectorId, brandId, permission: "read" },
      attributes: ["categoryId"],
    });
    return categories.map((category) => category.get().categoryId);
  }

  static async fetchBrandIdsOfReadOnlyCategories(
    connectorId: number
  ): Promise<number[]> {
    const categories = await ZendeskCategory.findAll({
      where: { connectorId, permission: "read" },
      attributes: [[fn("DISTINCT", col("brandId")), "brandId"]],
    });
    return categories.map((category) => category.get().brandId);
  }

  static async fetchCategoriesNotSelectedInBrand({
    connectorId,
    brandId,
    batchSize = null,
  }: {
    connectorId: number;
    brandId: number;
    batchSize?: number | null;
  }): Promise<number[]> {
    const categories = await ZendeskCategory.findAll({
      attributes: ["categoryId"],
      where: { connectorId, brandId, permission: "read" },
      ...(batchSize && { limit: batchSize }),
    });
    return categories.map((category) => category.get().categoryId);
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
    return categories.map((category) => new this(this.model, category.get()));
  }

  static async fetchSelectedCategoriesInBrand({
    connectorId,
    brandId,
  }: {
    connectorId: number;
    brandId: number;
  }): Promise<ZendeskCategoryResource[]> {
    const categories = await ZendeskCategory.findAll({
      where: { connectorId, brandId, permission: "read" },
    });
    return categories.map((category) => new this(this.model, category.get()));
  }

  static async fetchUnselectedCategoriesInBrand({
    connectorId,
    brandId,
  }: {
    connectorId: number;
    brandId: number;
  }): Promise<ZendeskCategoryResource[]> {
    const categories = await ZendeskCategory.findAll({
      where: { connectorId, brandId, permission: "none" },
    });
    return categories.map((category) => new this(this.model, category.get()));
  }

  static async fetchAllReadOnly(
    connectorId: number
  ): Promise<ZendeskCategoryResource[]> {
    const categories = await ZendeskCategory.findAll({
      where: { connectorId, permission: "read" },
    });
    return categories.map((category) => new this(this.model, category.get()));
  }

  static async deleteByCategoryId({
    connectorId,
    brandId,
    categoryId,
  }: {
    connectorId: number;
    brandId: number;
    categoryId: number;
  }): Promise<void> {
    await ZendeskCategory.destroy({
      where: { connectorId, brandId, categoryId },
    });
  }

  static async deleteByCategoryIds({
    connectorId,
    brandId,
    categoryIds,
  }: {
    connectorId: number;
    brandId: number;
    categoryIds: number[];
  }): Promise<number> {
    return ZendeskCategory.destroy({
      where: { connectorId, brandId, categoryId: { [Op.in]: categoryIds } },
    });
  }

  static async deleteByConnectorId(
    connectorId: number,
    transaction: Transaction
  ) {
    await ZendeskCategory.destroy({ where: { connectorId }, transaction });
  }

  async grantPermissions(): Promise<void> {
    if (this.permission === "none") {
      await this.update({ permission: "read" });
    }
  }

  async revokePermissions(): Promise<void> {
    if (this.permission === "read") {
      await this.update({ permission: "none" });
    }
  }

  toContentNode(
    connectorId: number,
    { expandable = false }: { expandable?: boolean } = {}
  ): ContentNode {
    const { brandId, categoryId, permission } = this;
    return {
      internalId: getCategoryInternalId({ connectorId, brandId, categoryId }),
      parentInternalId: getHelpCenterInternalId({ connectorId, brandId }),
      type: "folder",
      title: this.name,
      sourceUrl: this.url,
      expandable: expandable,
      permission,
      lastUpdatedAt: this.updatedAt.getTime(),
    };
  }

  getParentInternalIds(connectorId: number): [string, string] {
    /// Categories have two parents: the Help Center and the Brand.
    const { brandId, categoryId } = this;
    return [
      getCategoryInternalId({ connectorId, brandId, categoryId }),
      getHelpCenterInternalId({ connectorId, brandId }),
    ];
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
      where: { connectorId: this.connectorId, id: this.id },
      transaction,
    });
    return new Ok(undefined);
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,

      subject: this.subject,
      url: this.url,

      ticketId: this.ticketId,
      brandId: this.brandId,
      permission: this.permission,

      connectorId: this.connectorId,
    };
  }

  toContentNode(connectorId: number): ContentNode {
    const { brandId, ticketId } = this;
    return {
      internalId: getTicketInternalId({ connectorId, brandId, ticketId }),
      parentInternalId: getTicketsInternalId({ connectorId, brandId }),
      type: "file",
      title: this.subject,
      sourceUrl: this.url,
      expandable: false,
      permission: this.permission,
      lastUpdatedAt: this.updatedAt.getTime(),
      preventSelection: true,
    };
  }

  getParentInternalIds(connectorId: number): [string, string] {
    const { brandId, ticketId } = this;
    /// Tickets have one parent beside themselves: the Tickets.
    return [
      getTicketInternalId({ connectorId, brandId, ticketId }),
      getTicketsInternalId({ connectorId, brandId }),
    ];
  }

  static async fetchOutdatedTicketIds({
    connectorId,
    expirationDate,
    batchSize,
  }: {
    connectorId: number;
    expirationDate: Date;
    batchSize: number;
  }): Promise<{ brandId: number; ticketId: number }[]> {
    const tickets = await ZendeskTicket.findAll({
      attributes: ["brandId", "ticketId"],
      where: { connectorId, ticketUpdatedAt: { [Op.lt]: expirationDate } },
      limit: batchSize,
    });
    return tickets.map((ticket) => {
      const { ticketId, brandId } = ticket.get();
      return { ticketId, brandId };
    });
  }

  static async fetchByTicketId({
    connectorId,
    brandId,
    ticketId,
  }: {
    connectorId: number;
    brandId: number;
    ticketId: number;
  }): Promise<ZendeskTicketResource | null> {
    const ticket = await ZendeskTicket.findOne({
      where: { connectorId, brandId, ticketId },
    });
    return ticket && new this(this.model, ticket.get());
  }

  static async fetchByTicketIds({
    connectorId,
    brandId,
    ticketIds,
  }: {
    connectorId: number;
    brandId: number;
    ticketIds: number[];
  }): Promise<ZendeskTicketResource[]> {
    const tickets = await ZendeskTicket.findAll({
      where: { connectorId, brandId, ticketId: { [Op.in]: ticketIds } },
    });
    return tickets.map((ticket) => new this(this.model, ticket.get()));
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
    return tickets.map((ticket) => new this(this.model, ticket.get()));
  }

  static async fetchTicketIdsByBrandId({
    connectorId,
    brandId,
    batchSize = null,
  }: {
    connectorId: number;
    brandId: number;
    batchSize?: number | null;
  }): Promise<number[]> {
    const tickets = await ZendeskTicket.findAll({
      where: { connectorId, brandId },
      attributes: ["ticketId"],
      ...(batchSize && { limit: batchSize }),
    });
    return tickets.map((ticket) => ticket.get().ticketId);
  }

  static async deleteByTicketId({
    connectorId,
    brandId,
    ticketId,
  }: {
    connectorId: number;
    brandId: number;
    ticketId: number;
  }): Promise<void> {
    await ZendeskTicket.destroy({ where: { connectorId, brandId, ticketId } });
  }

  static async deleteByTicketIds({
    connectorId,
    brandId,
    ticketIds,
  }: {
    connectorId: number;
    brandId: number;
    ticketIds: number[];
  }): Promise<void> {
    await ZendeskTicket.destroy({
      where: { connectorId, brandId, ticketId: { [Op.in]: ticketIds } },
    });
  }

  static async deleteByConnectorId(
    connectorId: number,
    transaction: Transaction
  ) {
    await ZendeskTicket.destroy({ where: { connectorId }, transaction });
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
      where: { connectorId: this.connectorId, id: this.id },
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

  toContentNode(connectorId: number): ContentNode {
    const { brandId, categoryId, articleId } = this;
    return {
      internalId: getArticleInternalId({ connectorId, brandId, articleId }),
      parentInternalId: getCategoryInternalId({
        connectorId,
        brandId,
        categoryId,
      }),
      type: "file",
      title: this.name,
      sourceUrl: this.url,
      expandable: false,
      permission: this.permission,
      lastUpdatedAt: this.updatedAt.getTime(),
      preventSelection: true,
    };
  }

  getParentInternalIds(
    connectorId: number,
    includeHelpCenter: boolean = true
  ): [string, string, string] | [string, string] {
    const { brandId, categoryId, articleId } = this;
    const parents: [string, string] = [
      getArticleInternalId({ connectorId, brandId, articleId }),
      getCategoryInternalId({ connectorId, brandId, categoryId }),
    ];

    return includeHelpCenter
      ? [...parents, getHelpCenterInternalId({ connectorId, brandId })]
      : parents;
  }

  /**
   * Fetches a batch of article IDs.
   */
  static async fetchBatchByBrandId({
    connectorId,
    brandId,
    batchSize,
    cursor,
  }: {
    connectorId: number;
    brandId: number;
    batchSize: number;
    cursor: number | null;
  }): Promise<{ articleIds: number[]; cursor: number | null }> {
    const articles = await ZendeskArticle.findAll({
      attributes: ["id", "articleId"],
      where: {
        connectorId,
        brandId,
        ...(cursor && { id: { [Op.gt]: cursor } }),
      },
      order: [["id", "ASC"]],
      limit: batchSize,
    });
    return {
      articleIds: articles.map((article) => article.get().articleId),
      cursor: articles[batchSize - 1]?.get().id || null, // returning the last ID if it's a complete batch
    };
  }

  static async fetchByArticleId({
    connectorId,
    brandId,
    articleId,
  }: {
    connectorId: number;
    brandId: number;
    articleId: number;
  }): Promise<ZendeskArticleResource | null> {
    const article = await ZendeskArticle.findOne({
      where: { connectorId, brandId, articleId },
    });
    return article && new this(this.model, article.get());
  }

  static async fetchByArticleIds({
    connectorId,
    brandId,
    articleIds,
  }: {
    connectorId: number;
    brandId: number;
    articleIds: number[];
  }): Promise<ZendeskArticleResource[]> {
    const articles = await ZendeskArticle.findAll({
      where: { connectorId, brandId, articleId: { [Op.in]: articleIds } },
    });
    return articles.map((article) => new this(this.model, article.get()));
  }

  static async fetchByCategoryId({
    connectorId,
    brandId,
    categoryId,
  }: {
    connectorId: number;
    brandId: number;
    categoryId: number;
  }): Promise<ZendeskArticleResource[]> {
    const articles = await ZendeskArticle.findAll({
      where: { connectorId, brandId, categoryId },
    });
    return articles.map((article) => new this(this.model, article.get()));
  }

  static async deleteByArticleId({
    connectorId,
    brandId,
    articleId,
  }: {
    connectorId: number;
    brandId: number;
    articleId: number;
  }) {
    await ZendeskArticle.destroy({
      where: { connectorId, brandId, articleId },
    });
  }

  static async deleteByArticleIds({
    connectorId,
    brandId,
    articleIds,
  }: {
    connectorId: number;
    brandId: number;
    articleIds: number[];
  }) {
    await ZendeskArticle.destroy({
      where: { connectorId, brandId, articleId: { [Op.in]: articleIds } },
    });
  }

  static async deleteByCategoryId({
    connectorId,
    brandId,
    categoryId,
  }: {
    connectorId: number;
    brandId: number;
    categoryId: number;
  }) {
    await ZendeskArticle.destroy({
      where: { connectorId, brandId, categoryId },
    });
  }

  static async deleteByConnectorId(
    connectorId: number,
    transaction: Transaction
  ) {
    await ZendeskArticle.destroy({ where: { connectorId }, transaction });
  }
}
