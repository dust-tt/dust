import _ from "lodash";
import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { Subscription } from "@app/lib/resources/storage/models/plans";
import { Workspace } from "@app/lib/models/workspace";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { launchImmediateWorkspaceScrubWorkflow } from "@app/temporal/scrub_workspace/client";

const scrubWorkspaces = async (execute: boolean) => {
  const endedSubs = await Subscription.findAll({
    where: {
      // end date at least 14 days ago
      endDate: {
        [Op.lt]: new Date(new Date().getTime() - 14 * 24 * 60 * 60 * 1000),
      },
    },
  });

  const workspaces = await Workspace.findAll({
    where: {
      id: endedSubs.map((s) => s.workspaceId),
    },
  });

  const allSubsByWorkspaceId = _.groupBy(
    await Subscription.findAll({
      where: {
        workspaceId: workspaces.map((w) => w.id),
      },
    }),
    (s) => s.workspaceId.toString()
  );

  const chunks = _.chunk(workspaces, 16);
  let scrubbed = 0;

  for (const c of chunks) {
    await Promise.all(
      c.map(async (w) => {
        const subs = allSubsByWorkspaceId[w.id.toString()] ?? [];

        if (
          subs.some(
            (s) =>
              !s.endDate ||
              s.endDate >
                new Date(new Date().getTime() - 14 * 24 * 60 * 60 * 1000)
          )
        ) {
          return;
        }

        const auth = await Authenticator.internalAdminForWorkspace(w.sId);
        if (auth.isUpgraded()) {
          return;
        }

        logger.info({ workspaceId: w.sId }, "Scrubbing workspace");
        scrubbed++;
        if (execute) {
          await launchImmediateWorkspaceScrubWorkflow({ workspaceId: w.sId });
        }
      })
    );
  }

  logger.info({ scrubbed }, "Scrubbed workspaces");
};

makeScript({}, async ({ execute }) => {
  await scrubWorkspaces(execute);
});
