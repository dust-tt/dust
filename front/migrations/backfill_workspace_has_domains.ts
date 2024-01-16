import { Op } from "sequelize";

import { Workspace } from "@app/lib/models";
import { WorkspaceHasDomain } from "@app/lib/models/workspace";
import { makeScript } from "@app/migrations/helpers";

makeScript({}, async ({ execute }) => {
  const workspaces = await Workspace.findAll({
    attributes: ["id", "allowedDomain"],
    where: {
      allowedDomain: {
        [Op.not]: null,
        [Op.ne]: "",
      },
    },
  });

  let updatedWorkspacesCount = 0;
  for (const workspace of workspaces) {
    if (!workspace.allowedDomain) {
      continue;
    }

    try {
      if (execute) {
        await WorkspaceHasDomain.create({
          domain: workspace.allowedDomain,
          domainAutoJoinEnabled: true,
        });
      }

      updatedWorkspacesCount++;
    } catch (err) {
      console.log(
        `Failed to create workspace_has_domains entry for workspace id: ${workspace.id}`
      );
      // `WorkspaceHasDomain` table has a unique constraint on the domain column.
      // Suppress any creation errors to prevent disruption of the login process.
    }
  }

  console.log(`Updated allowedDomain on ${updatedWorkspacesCount} workspaces.`);
});
