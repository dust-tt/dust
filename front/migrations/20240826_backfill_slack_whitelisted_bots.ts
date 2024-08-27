import { EnvironmentConfig } from "@dust-tt/types";
import { QueryTypes, Sequelize } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { Workspace } from "@app/lib/models/workspace";
import { GroupResource } from "@app/lib/resources/group_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import { makeScript } from "@app/scripts/helpers";

makeScript({}, async ({ execute }, logger) => {
  const connectorDB = new Sequelize(
    EnvironmentConfig.getEnvVariable("CONNECTORS_DATABASE_URI")
  );
  const bots: { id: number; workspaceid: string }[] = await connectorDB.query(
    `SELECT sbw.id as id, c."workspaceId" as workspaceId FROM slack_bot_whitelist sbw INNER JOIN connectors c ON sbw."connectorId" = c.id WHERE c.type = 'slack'`,
    {
      type: QueryTypes.SELECT,
    }
  );

  for (const bot of bots) {
    const auth = await Authenticator.internalAdminForWorkspace(bot.workspaceid);
    const groupRes = await GroupResource.fetchWorkspaceGlobalGroup(auth);
    if (groupRes.isErr()) {
      throw new Error(
        `Failed to fetch global group for workspace ${bot.workspaceid}`
      );
    }
    const workspace = await Workspace.findOne({
      where: { sId: bot.workspaceid },
    });
    if (!workspace) {
      throw new Error(`Workspace not found for workspaceId ${bot.workspaceid}`);
    }

    const groupId = makeSId("group", {
      id: groupRes.value.id,
      workspaceId: workspace.id,
    });

    logger.info(
      {
        botId: bot.id,
        workspaceId: bot.workspaceid,
        groupId: groupId,
      },
      "Updating slack_bot_whitelist with groupId"
    );

    if (execute) {
      await connectorDB.query(
        `UPDATE slack_bot_whitelist SET "groupIds" = array_appen("groupIds", :groupId) WHERE id = :id`,
        {
          replacements: {
            groupId: groupId,
            id: bot.id,
          },
        }
      );
    }
  }
});
