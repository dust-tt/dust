import apiConfig from "@app/lib/api/config";
import { getDataSources } from "@app/lib/api/data_sources";
import type { Authenticator } from "@app/lib/auth";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import logger from "@app/logger/logger";
import { terminateScheduleWorkspaceScrubWorkflow } from "@app/temporal/scrub_workspace/client";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { removeNulls } from "@app/types/shared/utils/general";

/**
 * Restores a workspace to full functionality after subscription activation/reactivation.
 * This function is called when:
 * - A new subscription is created (Stripe checkout or manual upgrade)
 * - A subscription is reactivated after cancellation
 *
 * It performs the following actions:
 * - Terminates the scheduled workspace scrub workflow (if any)
 * - Unpauses all connectors (including webcrawler connectors)
 * - Re-enables all triggers that point to non-archived agents
 */
export async function restoreWorkspaceAfterSubscription(auth: Authenticator) {
  const owner = auth.getNonNullableWorkspace();

  const scrubCancelRes = await terminateScheduleWorkspaceScrubWorkflow({
    workspaceId: owner.sId,
    stopReason: "Workspace subscription activated/reactivated",
  });
  if (scrubCancelRes.isErr()) {
    logger.error(
      { stripeError: true, error: scrubCancelRes.error },
      "Error terminating scrub workspace workflow."
    );
  }

  const dataSources = await getDataSources(auth);
  const connectorIds = removeNulls(dataSources.map((ds) => ds.connectorId));

  const connectorsAPI = new ConnectorsAPI(
    apiConfig.getConnectorsAPIConfig(),
    logger
  );

  for (const connectorId of connectorIds) {
    const r = await connectorsAPI.unpauseConnector(connectorId);
    if (r.isErr() && r.error.message !== "Connector is not stopped") {
      logger.error(
        {
          connectorId,
          stripeError: true,
          error: r.error,
          workspaceId: owner.sId,
        },
        "Error unpausing connector after subscription reactivation."
      );
    }
  }

  // Re-enable all triggers that were disabled due to downgrade and point to non-archived agents.
  const enableTriggersRes = await TriggerResource.enableAllForWorkspace(
    auth,
    "downgraded"
  );
  if (enableTriggersRes.isErr()) {
    logger.error(
      {
        stripeError: true,
        error: enableTriggersRes.error,
        workspaceId: owner.sId,
      },
      "Error re-enabling workspace triggers on subscription reactivation"
    );
    // Don't throw an error here, we want the function to continue even if trigger re-enabling fails.
  }
}
