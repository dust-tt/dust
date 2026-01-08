import { Authenticator } from "@app/lib/auth";
import { TriggerModel } from "@app/lib/models/agent/triggers/triggers";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";

const OPERATIONS = ["stop", "refresh"] as const;
type Operation = (typeof OPERATIONS)[number];

function isOperation(value: string): value is Operation {
  return OPERATIONS.includes(value as Operation);
}

/**
 * Maintenance script for schedule triggers.
 *
 * Operations:
 * - stop: Disable all enabled schedule triggers (optionally scoped to a workspace)
 * - refresh: Disable then re-enable all enabled schedule triggers (optionally scoped to a workspace)
 */
makeScript(
  {
    operation: {
      alias: "op",
      describe: "Operation to perform: stop, or refresh",
      type: "string",
      demandOption: true,
    },
    wid: {
      type: "number",
      description:
        "If provided, will only process triggers from this workspace ID.",
      required: false,
    },
  },
  async ({ operation, wid, execute }, logger) => {
    if (!isOperation(operation)) {
      logger.error(
        { operation, validOperations: OPERATIONS },
        "Invalid operation"
      );
      return;
    }

    if (wid) {
      logger.info(
        { operation, workspaceId: wid },
        "Starting schedule maintenance for workspace"
      );
    } else {
      logger.info(
        { operation },
        "Starting schedule maintenance for all workspaces"
      );
    }

    // List all triggers, optionally filtered by workspace.
    const triggers = await TriggerModel.findAll({
      where: wid ? { workspaceId: wid } : {},
    });
    const activeTriggers = triggers.filter((t) => t.enabled);

    if (activeTriggers.length === 0) {
      logger.info("No active triggers found.");
      return;
    }

    logger.info(
      { totalTriggers: triggers.length, activeTriggers: activeTriggers.length },
      "Found triggers"
    );

    // Group by workspace to minimize the number of workspace fetches.
    const triggersByWorkspace = activeTriggers.reduce(
      (acc, trigger) => {
        if (!acc[trigger.workspaceId]) {
          acc[trigger.workspaceId] = [];
        }
        acc[trigger.workspaceId].push(trigger);
        return acc;
      },
      {} as Record<number, TriggerModel[]>
    );

    for (const workspaceId of Object.keys(triggersByWorkspace)) {
      const workspace = await WorkspaceModel.findByPk(workspaceId);
      if (!workspace) {
        logger.error({ workspaceId }, "Workspace not found");
        continue;
      }

      await concurrentExecutor(
        triggersByWorkspace[workspace.id],
        async (trigger) => {
          const triggerResource = new TriggerResource(
            TriggerModel,
            trigger.get()
          );
          const user = await UserResource.fetchByModelId(
            triggerResource.editor
          );

          if (!user) {
            logger.error(
              {
                triggerId: triggerResource.sId,
                triggerName: triggerResource.name,
              },
              "Trigger editor user not found"
            );
            return;
          }

          const editorAuth = await Authenticator.fromUserIdAndWorkspaceId(
            user.sId,
            workspace.sId
          );

          if (execute) {
            switch (operation) {
              case "stop":
                await triggerResource.disable(editorAuth);
                logger.info(
                  {
                    triggerId: triggerResource.sId,
                    triggerName: triggerResource.name,
                  },
                  "Trigger disabled"
                );
                break;

              case "refresh":
                // Disable then re-enable to refresh the temporal workflow.
                await triggerResource.disable(editorAuth);
                await triggerResource.enable(editorAuth);
                logger.info(
                  {
                    triggerId: triggerResource.sId,
                    triggerName: triggerResource.name,
                  },
                  "Trigger refreshed"
                );
                break;
            }
          } else {
            const action = operation === "stop" ? "disable" : "refresh";
            logger.info(
              {
                triggerId: triggerResource.sId,
                triggerName: triggerResource.name,
              },
              `Would ${action} trigger (dry run)`
            );
          }
        },
        { concurrency: 10 }
      );
    }

    logger.info({ operation, wid }, "Trigger maintenance completed");
  }
);
