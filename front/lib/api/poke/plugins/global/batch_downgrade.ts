import { Err, Ok } from "@dust-tt/types";
import { Op } from "sequelize";

import { createPlugin } from "@app/lib/api/poke/types";
import { Workspace } from "@app/lib/models/workspace";
import { internalSubscribeWorkspaceToFreeNoPlan } from "@app/lib/plans/subscription";
import { launchScheduleWorkspaceScrubWorkflow } from "@app/temporal/scrub_workspace/client";

export const batchDowngradePlugin = createPlugin({
  manifest: {
    id: "batch-downgrade",
    name: "Batch Downgrade Workspaces",
    warning:
      "Downgrading workspaces will block access, make sure all workspaces from your list should really be downgraded.",
    description: "NO_PLAN for fraudsters",
    resourceTypes: ["global"],
    args: {
      sIds: {
        type: "string",
        label: "Workspace sIds",
        description:
          "Comma-separated list of sIds of the workspaces to downgrade",
      },
    },
  },
  execute: async (_1, _2, args) => {
    const { sIds } = args;

    const sIdsArray = sIds
      .split(",")
      .map((sId) => sId.trim())
      .filter((sId) => sId.length > 0);

    const workspaces = await Workspace.findAll({
      where: {
        sId: {
          [Op.in]: sIdsArray,
        },
      },
    });

    const missingWorkspaces = sIdsArray.filter(
      (sId) => !workspaces.some((w) => w.sId === sId)
    );

    if (missingWorkspaces.length > 0) {
      return new Err(
        new Error(`Workspaces not found: ${missingWorkspaces.join(", ")}`)
      );
    }

    for (const workspace of workspaces) {
      await internalSubscribeWorkspaceToFreeNoPlan({
        workspaceId: workspace.sId,
      });

      // On downgrade, start a worklflow to pause all connectors + scrub the data after a specified retention period.
      await launchScheduleWorkspaceScrubWorkflow({
        workspaceId: workspace.sId,
      });
    }

    return new Ok({
      display: "text",
      value: `Workspaces downgraded.`,
    });
  },
});
