import type { PostRenderConversationForDataSourceResponseType } from "@dust-tt/client";
import tracer from "dd-trace";

import { getDustAPI } from "@connectors/lib/api/dust_api";
import logger from "@connectors/logger/logger";
import type { DataSourceConfig } from "@connectors/types";
import { withRetries } from "@connectors/types";

export type RenderConversationForDataSourceParams = {
  dataSourceConfig: DataSourceConfig;
  conversationId: string;
  excludeActions?: boolean;
  excludeImages?: boolean;
};

/**
 * Renders a conversation for data source syncing by calling the Front API.
 * This function calls the system-only endpoint that renders conversations
 * in a format suitable for indexing in data sources.
 */
export const renderConversationForDataSource = withRetries(
  logger,
  _renderConversationForDataSource,
  {
    retries: 3,
    delayBetweenRetriesMs: 1000,
  }
);

async function _renderConversationForDataSource({
  dataSourceConfig,
  conversationId,
  excludeActions,
  excludeImages,
}: RenderConversationForDataSourceParams): Promise<PostRenderConversationForDataSourceResponseType> {
  return tracer.trace(
    `connectors`,
    {
      resource: `renderConversationForDataSource`,
    },
    async (span) => {
      span?.setTag("conversationId", conversationId);
      span?.setTag("workspaceId", dataSourceConfig.workspaceId);

      const dustAPI = getDustAPI(dataSourceConfig);

      const result = await dustAPI.renderConversationForDataSource({
        conversationId,
        excludeActions,
        excludeImages,
      });

      if (result.isErr()) {
        logger.error(
          {
            workspaceId: dataSourceConfig.workspaceId,
            conversationId,
            error: result.error.message,
            errorType: result.error.type,
          },
          "[renderConversationForDataSource] Failed to render conversation"
        );

        if (result.error.type === "conversation_not_found") {
          throw new Error(
            `Conversation ${conversationId} not found in workspace ${dataSourceConfig.workspaceId}`
          );
        }
        if (result.error.type === "invalid_oauth_token_error") {
          throw new Error(
            `Access denied: Only system API keys can render conversations for data source syncing`
          );
        }

        throw new Error(
          `Failed to render conversation: ${result.error.message}`
        );
      }

      const response = result.value;

      logger.info(
        {
          workspaceId: dataSourceConfig.workspaceId,
          conversationId,
          tokensUsed: response.tokensUsed,
          messageCount: response.messages.length,
        },
        "[renderConversationForDataSource] Successfully rendered conversation"
      );

      return response;
    }
  );
}
