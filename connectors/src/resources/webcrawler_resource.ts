import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { Action } from "@mendable/firecrawl-js";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { literal, Op } from "sequelize";

import {
  WebCrawlerConfigurationHeader,
  WebCrawlerConfigurationModel,
  WebCrawlerFolder,
  WebCrawlerPage,
} from "@connectors/lib/models/webcrawler";
import { BaseResource } from "@connectors/resources/base_resource";
import type {} from "@connectors/resources/connector/strategy";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ReadonlyAttributesType } from "@connectors/resources/storage/types";
import type { CrawlingFrequency } from "@connectors/types";
import type { WebCrawlerConfigurationType } from "@connectors/types";
import type { ModelId } from "@connectors/types";
import {
  CrawlingFrequencies,
  WEBCRAWLER_MAX_DEPTH,
  WEBCRAWLER_MAX_PAGES,
  WebCrawlerHeaderRedactedValue,
} from "@connectors/types";
import { withTransaction } from "@connectors/types/shared/utils/sql_utils";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface WebCrawlerConfigurationResource
  extends ReadonlyAttributesType<WebCrawlerConfigurationModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class WebCrawlerConfigurationResource extends BaseResource<WebCrawlerConfigurationModel> {
  static model: ModelStatic<WebCrawlerConfigurationModel> =
    WebCrawlerConfigurationModel;

  private headers: WebCrawlerConfigurationType["headers"] = {};

  constructor(
    model: ModelStatic<WebCrawlerConfigurationModel>,
    blob: Attributes<WebCrawlerConfigurationModel>
  ) {
    super(WebCrawlerConfigurationModel, blob);
  }

  async postFetchHook() {
    (
      await WebCrawlerConfigurationHeader.findAll({
        where: {
          webcrawlerConfigurationId: this.id,
        },
      })
    ).forEach((header) => {
      this.headers[header.key] = header.value;
    });
  }

  static async fetchByConnectorId(connectorId: ModelId) {
    const blob = await this.model.findOne({
      where: {
        connectorId: connectorId,
      },
    });
    if (!blob) {
      return null;
    }

    const c = new this(this.model, blob.get());
    await c.postFetchHook();
    return c;
  }

  static async fetchByConnectorIds(
    connectorIds: ModelId[]
  ): Promise<Record<ModelId, WebCrawlerConfigurationResource>> {
    const blobs = await this.model.findAll({
      where: {
        connectorId: connectorIds,
      },
    });

    const resources = blobs.reduce(
      (acc, blob) => {
        acc[blob.connectorId] = new this(this.model, blob.get());
        return acc;
      },
      {} as Record<ModelId, WebCrawlerConfigurationResource>
    );

    const configurationHeaders = await WebCrawlerConfigurationHeader.findAll({
      where: {
        webcrawlerConfigurationId: blobs.map((b) => b.id),
      },
    });

    const configIdToConnectorId = blobs.reduce(
      (acc, blob) => {
        acc[blob.id] = blob.connectorId;
        return acc;
      },
      {} as Record<ModelId, ModelId>
    );

    configurationHeaders.forEach((header) => {
      const connectorId =
        configIdToConnectorId[header.webcrawlerConfigurationId];
      if (connectorId) {
        const r = resources[connectorId];
        if (r) {
          r.headers[header.key] = header.value;
        }
      }
    });
    return resources;
  }

  static async makeNew(
    blob: CreationAttributes<WebCrawlerConfigurationModel> & {
      headers: WebCrawlerConfigurationType["headers"];
    },
    transaction: Transaction
  ) {
    const config = await WebCrawlerConfigurationModel.create(
      {
        ...blob,
      },
      { transaction }
    );

    await WebCrawlerConfigurationHeader.bulkCreate(
      Object.entries(blob.headers).map(([key, value]) => {
        return {
          connectorId: blob.connectorId,
          key: key,
          value: value,
          webcrawlerConfigurationId: config.id,
        };
      }),
      {
        transaction: transaction,
      }
    );

    const c = new this(this.model, config.get());
    c.headers = blob.headers;
    return c;
  }

  static async getConnectorIdsForWebsitesToCrawl() {
    const frequencyToSQLQuery: Record<CrawlingFrequency, string> = {
      never: "never",
      daily: "1 day",
      weekly: "1 week",
      monthly: "1 month",
    };
    const allConnectorIds: ModelId[] = [];

    for (const frequency of CrawlingFrequencies) {
      if (frequency === "never") {
        continue;
      }
      const sql = frequencyToSQLQuery[frequency];
      const websites = await this.model.findAll({
        attributes: ["connectorId"],
        where: {
          lastCrawledAt: {
            [Op.lt]: literal(`NOW() - INTERVAL '${sql}'`),
          },
          crawlFrequency: frequency,
        },
      });
      allConnectorIds.push(...websites.map((w) => w.connectorId));
    }

    const connectors = await ConnectorResource.fetchByIds(
      "webcrawler",
      allConnectorIds
    );
    const unPausedConnectorIds = connectors
      .filter((c) => !c.isPaused())
      .map((c) => c.id);

    return unPausedConnectorIds;
  }

  async markedAsCrawled() {
    await this.model.update(
      {
        lastCrawledAt: new Date(),
      },
      {
        where: {
          id: this.id,
        },
      }
    );
  }

  async setCustomHeaders(
    headers: Record<string, string>
  ): Promise<Result<undefined, Error>> {
    //regexp to validate http header name
    const headerNameRegexp = /^[\w-]+$/;
    for (const [key] of Object.entries(headers)) {
      if (!headerNameRegexp.test(key)) {
        return new Err(new Error(`Invalid header name ${key}`));
      }
    }
    await withTransaction(async (transaction) => {
      const headersList = Object.entries(headers);
      // delete all headers before inserting new ones
      await WebCrawlerConfigurationHeader.destroy({
        where: {
          webcrawlerConfigurationId: this.id,
        },
        transaction,
      });
      // now insert new headers
      await WebCrawlerConfigurationHeader.bulkCreate(
        headersList.map(([key, value]) => {
          return {
            connectorId: this.connectorId,
            key: key,
            value: value,
            webcrawlerConfigurationId: this.id,
          };
        }),
        {
          transaction: transaction,
        }
      );
    });

    this.headers = headers;

    return new Ok(undefined);
  }

  getCustomHeaders(): Record<string, string> {
    return this.headers;
  }

  /**
   * Get the depth, or default to WEBCRAWLER_MAX_DEPTH
   */
  getDepth(): number {
    return this.depth ?? WEBCRAWLER_MAX_DEPTH;
  }

  /**
   * Get the maxPageToCrawl, or default to WEBCRAWLER_MAX_PAGES
   */
  getMaxPagesToCrawl(): number {
    return this.maxPageToCrawl ?? WEBCRAWLER_MAX_PAGES;
  }

  async updateCrawlFrequency(crawlFrequency: CrawlingFrequency) {
    return this.update({ crawlFrequency });
  }

  async updateCrawlId(crawlId: string | null) {
    return this.update({ crawlId });
  }

  async updateActions(actions: Action[] | null) {
    return this.update({ actions });
  }

  async setSitemap(sitemapOnly: boolean) {
    return this.update({ sitemapOnly });
  }

  async delete(transaction?: Transaction): Promise<Result<undefined, Error>> {
    await WebCrawlerPage.destroy({
      where: {
        connectorId: this.connectorId,
      },
      transaction,
    });
    await WebCrawlerFolder.destroy({
      where: {
        connectorId: this.connectorId,
      },
      transaction,
    });
    await WebCrawlerConfigurationHeader.destroy({
      where: {
        webcrawlerConfigurationId: this.id,
      },
      transaction,
    });
    await this.model.destroy({
      where: {
        id: this.id,
      },
      transaction,
    });

    return new Ok(undefined);
  }

  toJSON(): WebCrawlerConfigurationType {
    const redactedHeaders: Record<string, string> = {};
    for (const key in this.headers) {
      // redacting headers values when rendering them because we don't want to expose sensitive information.
      redactedHeaders[key] = WebCrawlerHeaderRedactedValue;
    }
    return {
      url: this.url,
      maxPageToCrawl: this.maxPageToCrawl,
      crawlMode: this.crawlMode,
      depth: this.depth,
      crawlFrequency: this.crawlFrequency,
      headers: redactedHeaders,
    };
  }
}
