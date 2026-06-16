import type { ConnectorProvider, DataSourceType } from "@app/types/data_source";

export type GetSlackChannelsLinkedWithAgentResponseBody = {
  provider: Extract<ConnectorProvider, "slack" | "slack_bot">;
  slackChannels: {
    slackChannelId: string;
    slackChannelName: string;
    agentConfigurationId: string;
    autoRespondWithoutMention: boolean;
  }[];
  slackDataSource?: DataSourceType;
};
