import type {
  IntercomCheckConversationResponseType,
  IntercomCheckMissingConversationsResponseType,
  IntercomCheckTeamsResponseType,
  IntercomCommandType,
  IntercomFetchConversationResponseType,
  IntercomForceResyncArticlesResponseType,
} from "@dust-tt/types";
import { Op } from "sequelize";

import { getIntercomAccessToken } from "@connectors/connectors/intercom/lib/intercom_access_token";
import {
  fetchIntercomConversation,
  fetchIntercomConversationsForDay,
  fetchIntercomTeams,
} from "@connectors/connectors/intercom/lib/intercom_api";
import {
  IntercomArticle,
  IntercomConversation,
  IntercomTeam,
} from "@connectors/lib/models/intercom";
import { default as topLogger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

export const intercom = async ({
  command,
  args,
}: IntercomCommandType): Promise<
  | IntercomCheckConversationResponseType
  | IntercomFetchConversationResponseType
  | IntercomCheckTeamsResponseType
  | IntercomCheckMissingConversationsResponseType
  | IntercomForceResyncArticlesResponseType
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
      const updated = await IntercomArticle.update(
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

      const conversationOnDB = await IntercomConversation.findOne({
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
      const convosOnDB = await IntercomConversation.findAll({
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
      const teamsOnDb = await IntercomTeam.findAll({
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
  }
};
