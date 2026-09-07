import { apiConfig } from "@connectors/lib/api/config";
import {
  SlackBotWhitelistModel,
  SlackChannelModel,
  SlackChatBotMessageModel,
  SlackConfigurationModel,
  SlackMessagesModel,
} from "@connectors/lib/models/slack";
import logger from "@connectors/logger/logger";
import { BaseResource } from "@connectors/resources/base_resource";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import type { ReadonlyAttributesType } from "@connectors/resources/storage/types";
import type {
  ModelId,
  SlackAutoReadPattern,
  SlackbotWhitelistType,
  SlackConfigurationType,
} from "@connectors/types";
import {
  buildCacheWithRedisKey,
  cacheWithRedisResult,
  normalizeError,
} from "@connectors/types";
import { redisClient } from "@connectors/types/shared/redis_client";
import type { ConnectorProvider, Result } from "@dust-tt/client";
import { DustAPI, Err, Ok } from "@dust-tt/client";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

const AUTO_GROUP_IDS_CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchAutoGroupIdsForSpaces(
  whitelistModelId: ModelId,
  {
    workspaceId,
    workspaceAPIKey,
    spaceIds,
  }: { workspaceId: string; workspaceAPIKey: string; spaceIds: string[] }
): Promise<Result<string[], Error>> {
  const dustAPI = new DustAPI(
    { url: apiConfig.getDustFrontAPIUrl() },
    { workspaceId, apiKey: workspaceAPIKey },
    logger
  );

  const groupIdsRes = await dustAPI.getAutoGroupIdsForSpaces({ spaceIds });
  if (groupIdsRes.isErr()) {
    return new Err(new Error(groupIdsRes.error.message));
  }

  return groupIdsRes;
}

const autoGroupIdsCacheKey = (whitelistModelId: ModelId) =>
  `${whitelistModelId}`;

const getAutoGroupIdsForSpaces = cacheWithRedisResult(
  fetchAutoGroupIdsForSpaces,
  autoGroupIdsCacheKey,
  { ttlMs: AUTO_GROUP_IDS_CACHE_TTL_MS }
);

async function invalidateAutoGroupIdsForSpaces(
  whitelistModelId: ModelId
): Promise<void> {
  const redis = await redisClient({ origin: "cache_with_redis" });

  await redis.del(
    buildCacheWithRedisKey(
      fetchAutoGroupIdsForSpaces.name,
      autoGroupIdsCacheKey(whitelistModelId)
    )
  );
}

export type WhitelistedBotType = {
  botName: string;
  spaceIds: string[];
  createdAt: number;
};

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SlackConfigurationResource
  extends ReadonlyAttributesType<SlackConfigurationModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SlackConfigurationResource extends BaseResource<SlackConfigurationModel> {
  static model: ModelStatic<SlackConfigurationModel> = SlackConfigurationModel;

  constructor(
    model: ModelStatic<SlackConfigurationModel>,
    blob: Attributes<SlackConfigurationModel>
  ) {
    super(SlackConfigurationModel, blob);
  }

  async postFetchHook(): Promise<void> {
    return;
  }

  static async makeNew({
    slackTeamId,
    connectorId,
    autoReadChannelPatterns,
    whitelistedDomains,
    restrictedSpaceAgentsEnabled,
    feedbackVisibleToAuthorOnly,
    privateIntegrationCredentialId,
    botEnabled,
    transaction,
  }: {
    slackTeamId: string;
    connectorId: ModelId;
    autoReadChannelPatterns?: SlackAutoReadPattern[];
    whitelistedDomains?: string[];
    restrictedSpaceAgentsEnabled?: boolean;
    feedbackVisibleToAuthorOnly?: boolean;
    privateIntegrationCredentialId?: string | null;
    botEnabled: boolean;
    transaction: Transaction;
  }) {
    const otherSlackConfigurationWithBotEnabled =
      await SlackConfigurationModel.findOne({
        where: {
          slackTeamId,
          botEnabled: true,
        },
        transaction,
      });

    const model = await SlackConfigurationModel.create(
      {
        autoReadChannelPatterns: autoReadChannelPatterns ?? [],
        // We want at most 1 Slack bot enabled per team id.
        botEnabled: otherSlackConfigurationWithBotEnabled ? false : botEnabled,
        connectorId,
        slackTeamId,
        restrictedSpaceAgentsEnabled: restrictedSpaceAgentsEnabled ?? true,
        whitelistedDomains,
        feedbackVisibleToAuthorOnly: feedbackVisibleToAuthorOnly ?? true,
        privateIntegrationCredentialId,
      },
      { transaction }
    );

    return new SlackConfigurationResource(
      SlackConfigurationResource.model,
      model.get()
    );
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

  static async fetchByConnectorIds(
    connectorIds: ModelId[]
  ): Promise<Record<ModelId, SlackConfigurationResource>> {
    const blobs = await this.model.findAll({
      where: {
        connectorId: connectorIds,
      },
    });

    return blobs.reduce(
      (acc, blob) => {
        acc[blob.connectorId] = new this(this.model, blob.get());
        return acc;
      },
      {} as Record<ModelId, SlackConfigurationResource>
    );
  }

  static async findChannelWithAutoRespond(
    connectorId: ModelId,
    slackChannelId: string
  ): Promise<SlackChannelModel | null> {
    return SlackChannelModel.findOne({
      where: {
        connectorId,
        slackChannelId,
        autoRespondWithoutMention: true,
      },
    });
  }

  static async fetchByActiveBot(slackTeamId: string) {
    const blob = await this.model.findOne({
      where: {
        slackTeamId,
        botEnabled: true,
      },
    });
    if (!blob) {
      return null;
    }

    return new this(this.model, blob.get());
  }

  async isBotWhitelistedToSummon(botName: string | string[]): Promise<boolean> {
    return !!(await SlackBotWhitelistModel.findOne({
      where: {
        connectorId: this.connectorId,
        botName: botName,
        whitelistType: "summon_agent",
      },
    }));
  }

  async isBotWhitelistedToIndexMessages(
    botName: string | string[]
  ): Promise<boolean> {
    const isWhitelisted = await SlackBotWhitelistModel.findOne({
      where: {
        connectorId: this.connectorId,
        botName: botName,
        whitelistType: "index_messages",
      },
    });

    return !!isWhitelisted;
  }

  async whitelistBot(
    botName: string,
    { spaceIds }: { spaceIds: string[] | null },
    whitelistType: SlackbotWhitelistType
  ): Promise<Result<undefined, Error>> {
    const existingBot = await SlackBotWhitelistModel.findOne({
      where: {
        connectorId: this.connectorId,
        slackConfigurationId: this.id,
        botName,
      },
    });

    if (existingBot) {
      await existingBot.update({
        spaceIds,
        whitelistType,
      });
      await invalidateAutoGroupIdsForSpaces(existingBot.id);
    } else {
      await SlackBotWhitelistModel.create({
        connectorId: this.connectorId,
        slackConfigurationId: this.id,
        botName,
        spaceIds,
        whitelistType,
      });
    }

    return new Ok(undefined);
  }

  async listWhitelistedBots(
    whitelistType: SlackbotWhitelistType
  ): Promise<WhitelistedBotType[]> {
    const bots = await SlackBotWhitelistModel.findAll({
      where: {
        connectorId: this.connectorId,
        slackConfigurationId: this.id,
        whitelistType,
      },
      order: [["botName", "ASC"]],
    });

    return bots.map((bot) => ({
      botName: bot.botName,
      spaceIds: bot.spaceIds ?? [],
      createdAt: bot.createdAt.getTime(),
    }));
  }

  async removeWhitelistedBot(
    botName: string,
    whitelistType: SlackbotWhitelistType
  ): Promise<number> {
    return SlackBotWhitelistModel.destroy({
      where: {
        connectorId: this.connectorId,
        slackConfigurationId: this.id,
        botName,
        whitelistType,
      },
    });
  }

  // A whitelisted workflow reaches the spaces it was allowed on. Front owns which group stands for
  // a space, so ask it at run time instead of keeping group ids here.
  async getBotWhitelistedGroupIds(
    botName: string,
    {
      workspaceId,
      workspaceAPIKey,
    }: { workspaceId: string; workspaceAPIKey: string }
  ): Promise<Result<string[], Error>> {
    const bot = await SlackBotWhitelistModel.findOne({
      where: {
        connectorId: this.connectorId,
        slackConfigurationId: this.id,
        botName,
      },
    });

    if (!bot) {
      return new Err(new Error(`Workflow "${botName}" is not whitelisted.`));
    }

    if (!bot.spaceIds?.length) {
      return new Err(
        new Error(`Workflow "${botName}" is allowed on no space.`)
      );
    }

    return getAutoGroupIdsForSpaces(bot.id, {
      workspaceId,
      workspaceAPIKey,
      spaceIds: bot.spaceIds,
    });
  }

  static async listAll() {
    const blobs = await SlackConfigurationResource.model.findAll({});

    return blobs.map(
      (b) => new SlackConfigurationResource(this.model, b.get())
    );
  }

  static async listForTeamId(
    slackTeamId: string,
    provider?: Extract<ConnectorProvider, "slack" | "slack_bot">
  ): Promise<SlackConfigurationResource[]> {
    const blobs = await this.model.findAll({
      where: {
        slackTeamId,
      },
      include: provider
        ? [
            {
              model: ConnectorModel,
              as: "connector",
              attributes: [],
              required: true,
              where: {
                type: provider,
              },
            },
          ]
        : undefined,
    });

    return blobs.map(
      (b) => new SlackConfigurationResource(this.model, b.get())
    );
  }

  async enableBot(): Promise<Result<undefined, Error>> {
    const otherSlackConfigurationWithBotEnabled =
      await SlackConfigurationModel.findOne({
        where: {
          slackTeamId: this.slackTeamId,
          botEnabled: true,
        },
      });
    if (
      otherSlackConfigurationWithBotEnabled &&
      otherSlackConfigurationWithBotEnabled.id !== this.id
    ) {
      logger.error(
        {
          slackTeamId: this.slackTeamId,
        },
        "Another Dust workspace has already enabled the slack bot for your Slack workspace."
      );
      return new Err(
        new Error(
          "Another Dust workspace has already enabled the slack bot for your Slack workspace."
        )
      );
    }
    await this.model.update(
      { botEnabled: true },
      {
        where: {
          id: this.id,
        },
      }
    );

    return new Ok(undefined);
  }

  async disableBot(): Promise<Result<undefined, Error>> {
    await this.model.update(
      { botEnabled: false },
      {
        where: {
          id: this.id,
        },
      }
    );

    return new Ok(undefined);
  }

  async setWhitelistedDomains(domain: string[]) {
    await this.model.update(
      { whitelistedDomains: domain },
      {
        where: {
          id: this.id,
        },
      }
    );

    return new Ok(undefined);
  }

  async setAutoReadChannelPatterns(patterns: SlackAutoReadPattern[]) {
    await this.model.update(
      { autoReadChannelPatterns: patterns },
      {
        where: {
          id: this.id,
        },
      }
    );
    return new Ok(undefined);
  }

  async delete(transaction: Transaction): Promise<Result<undefined, Error>> {
    try {
      await SlackChannelModel.destroy({
        where: {
          connectorId: this.connectorId,
        },
        transaction,
      });

      await SlackMessagesModel.destroy({
        where: {
          connectorId: this.connectorId,
        },
        transaction,
      });

      await SlackChatBotMessageModel.destroy({
        where: {
          connectorId: this.connectorId,
        },
        transaction,
      });

      await SlackBotWhitelistModel.destroy({
        where: {
          connectorId: this.connectorId,
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
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  toJSON(): SlackConfigurationType {
    return {
      autoReadChannelPatterns: this.autoReadChannelPatterns,
      botEnabled: this.botEnabled,
      whitelistedDomains: this.whitelistedDomains?.map((d) => d),
      restrictedSpaceAgentsEnabled: this.restrictedSpaceAgentsEnabled,
      feedbackVisibleToAuthorOnly: this.feedbackVisibleToAuthorOnly,
    };
  }
}
