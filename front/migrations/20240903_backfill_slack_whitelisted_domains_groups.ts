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
  const slackConfigurations: {
    whitelistedDomains: string[];
    workspaceid: string;
    configurationId: number;
  }[] = await connectorDB.query(
    `SELECT sc.id as "configurationId", sc."whitelistedDomains" as "whitelistedDomains", c."workspaceId" as workspaceId FROM slack_configurations sc INNER JOIN connectors c ON sc."connectorId" = c.id WHERE c.type = 'slack' and sc."whitelistedDomains" IS NOT NULL`,
    {
      type: QueryTypes.SELECT,
    }
  );

  for (const sc of slackConfigurations) {
    const auth = await Authenticator.internalAdminForWorkspace(sc.workspaceid);
    const groupRes = await GroupResource.fetchWorkspaceGlobalGroup(auth);
    if (groupRes.isErr()) {
      throw new Error(
        `Failed to fetch global group for workspace ${sc.workspaceid}`
      );
    }
    const workspace = await Workspace.findOne({
      where: { sId: sc.workspaceid },
    });
    if (!workspace) {
      throw new Error(`Workspace not found for workspaceId ${sc.workspaceid}`);
    }

    const groupId = makeSId("group", {
      id: groupRes.value.id,
      workspaceId: workspace.id,
    });

    const newDomains: string[] = [];

    for (const domain of sc.whitelistedDomains) {
      if (domain.split(":").length > 1) {
        // domain already updated
        continue;
      }
      newDomains.push(`${domain}:${groupId}`);
    }

    logger.info(
      {
        workspaceId: sc.workspaceid,
        groupId: groupId,
        newDomains: newDomains,
      },
      "Updating slack_configuration.whitelistedDOmain"
    );
    if (execute) {
      await connectorDB.query(
        `UPDATE slack_configurations SET "whitelistedDomains" = ARRAY[:newDomains] WHERE id = :configurationId`,
        {
          replacements: {
            newDomains: newDomains,
            configurationId: sc.configurationId,
          },
        }
      );
    }
  }
});
