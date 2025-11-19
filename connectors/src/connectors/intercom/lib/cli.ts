import { Op } from "sequelize";

import { getIntercomAccessToken } from "@connectors/connectors/intercom/lib/intercom_access_token";
import {
  fetchIntercomArticles,
  fetchIntercomConversation,
  fetchIntercomConversations,
  fetchIntercomConversationsForDay,
  fetchIntercomTeams,
} from "@connectors/connectors/intercom/lib/intercom_api";
import type { IntercomConversationType } from "@connectors/connectors/intercom/lib/types";
import {
  IntercomArticleModel,
  IntercomConversationModel,
  IntercomTeamModel,
  IntercomWorkspaceModel,
} from "@connectors/lib/models/intercom";
import { default as topLogger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type {
  AdminSuccessResponseType,
  IntercomCheckConversationResponseType,
  IntercomCheckMissingConversationsResponseType,
  IntercomCheckTeamsResponseType,
  IntercomCommandType,
  IntercomFetchArticlesResponseType,
  IntercomFetchConversationResponseType,
  IntercomForceResyncArticlesResponseType,
  IntercomSearchConversationsResponseType,
} from "@connectors/types";

type IntercomResponse =
  | IntercomCheckConversationResponseType
  | IntercomFetchConversationResponseType
  | IntercomCheckTeamsResponseType
  | IntercomCheckMissingConversationsResponseType
  | IntercomForceResyncArticlesResponseType
  | IntercomFetchArticlesResponseType
  | IntercomSearchConversationsResponseType;

export const intercom = async ({
  command,
  args,
}: IntercomCommandType): Promise<
  IntercomResponse | AdminSuccessResponseType
> => {
  const logger = topLogger.child({ majorCommand: "intercom", command, args });

  const connectorId = args.connectorId ? args.connectorId.toString() : null;
  const connector = connectorId
    ? await ConnectorResource.fetchById(connectorId)
    : null;
  if (connector && connector.type !== "intercom") {
    throw new Error(`Connector ${args.connectorId} is not of type intercom`);
  }

  switch (command) {
    case "force-resync-articles": {
      const force = args.force === "true";
      if (!force) {
        throw new Error("[Admin] Need to pass --force=true to force resync");
      }
      logger.info("[Admin] Forcing resync of articles");
      const updated = await IntercomArticleModel.update(
        { lastUpsertedTs: null },
        { where: {} } // Targets all records
      );
      return {
        affectedCount: updated[0],
      };
    }

    case "check-conversation": {
      if (!connector) {
        throw new Error(`Connector ${connectorId} not found`);
      }
      if (!args.conversationId) {
        throw new Error("Missing --conversationId argument");
      }
      const conversationId = args.conversationId.toString();

      logger.info("[Admin] Checking conversation");

      const accessToken = await getIntercomAccessToken(connector.connectionId);
      const conversationOnIntercom = await fetchIntercomConversation({
        accessToken,
        conversationId,
      });
      const teamIdOnIntercom =
        typeof conversationOnIntercom?.team_assignee_id === "number"
          ? conversationOnIntercom.team_assignee_id.toString()
          : undefined;

      const conversationOnDB = await IntercomConversationModel.findOne({
        where: {
          conversationId,
          connectorId: connector.id,
        },
      });

      return {
        isConversationOnIntercom: conversationOnIntercom !== null,
        isConversationOnDB: conversationOnDB !== null,
        conversationTeamIdOnIntercom: teamIdOnIntercom,
        conversationTeamIdOnDB: conversationOnDB?.teamId,
      };
    }

    case "fetch-conversation": {
      if (!connector) {
        throw new Error(`Connector ${connectorId} not found`);
      }
      if (!args.conversationId) {
        throw new Error("Missing --conversationId argument");
      }
      const conversationId = args.conversationId.toString();

      logger.info("[Admin] Checking conversation");

      const accessToken = await getIntercomAccessToken(connector.connectionId);
      const conversationOnIntercom = await fetchIntercomConversation({
        accessToken,
        conversationId,
      });

      return {
        conversation: conversationOnIntercom,
      };
    }

    case "fetch-articles": {
      if (!connector) {
        throw new Error(`Connector ${connectorId} not found`);
      }

      const helpCenterId = args.helpCenterId?.toString();

      if (!helpCenterId) {
        throw new Error("Missing --helpCenterId argument");
      }

      const accessToken = await getIntercomAccessToken(connector.connectionId);
      const articles = await fetchIntercomArticles({
        accessToken,
        helpCenterId,
        page: 1,
        pageSize: 1000,
      });

      return {
        articles: articles.data.articles,
      };
    }

    case "check-missing-conversations": {
      if (!connector) {
        throw new Error(`Connector ${connectorId} not found`);
      }
      if (!args.day) {
        throw new Error("Missing --day argument");
      }
      if (!args.day.match(/^\d{4}-\d{2}-\d{2}$/)) {
        throw new Error("Invalid --day argument format");
      }

      const startOfDay = new Date(args.day);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(args.day);
      endOfDay.setHours(23, 59, 59, 999);

      logger.info("[Admin] Checking conversations for day");

      // Fetch all conversations for the day from Intercom
      const convosOnIntercom = [];
      let cursor = null;
      let convosOnIntercomRes;
      const accessToken = await getIntercomAccessToken(connector.connectionId);
      do {
        convosOnIntercomRes = await fetchIntercomConversationsForDay({
          accessToken,
          minCreatedAt: startOfDay.getTime() / 1000,
          maxCreatedAt: endOfDay.getTime() / 1000,
          cursor,
          pageSize: 50,
        });
        convosOnIntercom.push(...convosOnIntercomRes.conversations);
        cursor = convosOnIntercomRes.pages.next
          ? convosOnIntercomRes.pages.next.starting_after
          : null;
      } while (cursor);

      // Fetch all conversations for the day from DB
      const convosOnDB = await IntercomConversationModel.findAll({
        where: {
          connectorId: connector.id,
          conversationCreatedAt: {
            [Op.gte]: startOfDay,
            [Op.lte]: endOfDay,
          },
        },
      });

      // Get missing conversations in DB
      const missingConversations = convosOnIntercom.filter(
        (convo) =>
          !convosOnDB.some((c) => c.conversationId === convo.id.toString())
      );

      return {
        missingConversations: missingConversations.map((convo) => ({
          conversationId: convo.id,
          teamId: convo.team_assignee_id,
          open: convo.open,
          createdAt: convo.created_at,
        })),
      };
    }

    case "check-teams": {
      if (!connector) {
        throw new Error(`Connector ${connectorId} not found`);
      }
      logger.info("[Admin] Checking teams");
      const accessToken = await getIntercomAccessToken(connector.connectionId);
      const teamsOnIntercom = await fetchIntercomTeams({ accessToken });
      const teamsOnDb = await IntercomTeamModel.findAll({
        where: {
          connectorId: connector.id,
        },
      });

      return {
        teams: teamsOnIntercom.map((team) => ({
          teamId: team.id,
          name: team.name,
          isTeamOnDB: teamsOnDb.some((t) => t.teamId === team.id),
        })),
      };
    }

    case "search-conversations": {
      if (!connector) {
        throw new Error(`Connector ${connectorId} not found`);
      }

      const accessToken = await getIntercomAccessToken(connector.connectionId);

      const workspace = await IntercomWorkspaceModel.findOne({
        where: {
          connectorId: connector.id,
        },
      });

      if (!workspace) {
        throw new Error(`No workspace found for connector ${connector.id}`);
      }

      const MAX_CONVERSATIONS_COUNT = 100;
      const conversations: IntercomConversationType[] = [];
      let cursor: string | null = null;
      let hasMore = true;
      let totalCount = 0;

      while (hasMore && totalCount < MAX_CONVERSATIONS_COUNT) {
        const response = await fetchIntercomConversations({
          accessToken,
          slidingWindow: workspace.conversationsSlidingWindow,
          cursor,
          pageSize: 50,
          closedAfter: args.closedAfter,
          state: args.state,
        });

        conversations.push(...response.conversations);
        totalCount += response.conversations.length;

        if (response.pages.next) {
          cursor = response.pages.next.starting_after;
        } else {
          hasMore = false;
        }
      }

      return {
        conversations: conversations.map((conv) => ({
          id: conv.id.toString(),
          open: conv.open,
          state: conv.state,
          created_at: conv.created_at,
          last_closed_at: conv.statistics?.last_close_at || null,
        })),
        totalCount,
      };
    }

    case "set-conversations-sliding-window": {
      if (!connector) {
        throw new Error(`Connector ${connectorId} not found`);
      }
      if (!args.conversationsSlidingWindow) {
        throw new Error("Missing --conversationsSlidingWindow argument");
      }
      const { conversationsSlidingWindow } = args;
      if (isNaN(conversationsSlidingWindow) || conversationsSlidingWindow < 0) {
        throw new Error(
          `Invalid --conversationsSlidingWindow argument: ${conversationsSlidingWindow}`
        );
      }
      logger.info(
        {
          connectorId,
          conversationsSlidingWindow,
        },
        "[Admin] Setting conversations sliding window."
      );
      const workspace = await IntercomWorkspaceModel.findOne({
        where: {
          connectorId: connector.id,
        },
      });
      if (!workspace) {
        throw new Error(`No workspace found for connector ${connector.id}`);
      }
      await workspace.update({
        conversationsSlidingWindow,
      });
      return { success: true };
    }
  }
};
