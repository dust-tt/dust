import type { CrawlingFrequency, ModelId, Result } from "@dust-tt/types";
import type { WebCrawlerConfigurationType } from "@dust-tt/types";
import { CrawlingFrequencies, Err, Ok } from "@dust-tt/types";
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
import { sequelizeConnection } from "@connectors/resources/storage";
import type { ReadonlyAttributesType } from "@connectors/resources/storage/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface WebCrawlerConfigurationResource
  extends ReadonlyAttributesType<WebCrawlerConfigurationModel> {}
export class WebCrawlerConfigurationResource extends BaseResource<WebCrawlerConfigurationModel> {
  static model: ModelStatic<WebCrawlerConfigurationModel> =
    WebCrawlerConfigurationModel;

  constructor(
    model: ModelStatic<WebCrawlerConfigurationModel>,
    blob: Attributes<WebCrawlerConfigurationModel>
  ) {
    super(WebCrawlerConfigurationModel, blob);
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

    return new this(this.model, blob.get());
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
          key: key,
          value: value,
          webcrawlerConfigurationId: config.id,
        };
      }),
      {
        transaction: transaction,
      }
    );

    return new this(this.model, config.get());
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

    const connectors = await ConnectorResource.fetchByIds(allConnectorIds);
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
    await sequelizeConnection.transaction(async (transaction) => {
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

    return new Ok(undefined);
  }

  async getCustomHeaders(): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    const headers = await WebCrawlerConfigurationHeader.findAll({
      where: {
        webcrawlerConfigurationId: this.id,
      },
    });

    headers.forEach((header) => {
      result[header.key] = header.value;
    });

    return result;
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
}
