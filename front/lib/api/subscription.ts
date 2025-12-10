import apiConfig from "@app/lib/api/config";
import { getDataSources } from "@app/lib/api/data_sources";
import type { Authenticator } from "@app/lib/auth";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import logger from "@app/logger/logger";
import { terminateScheduleWorkspaceScrubWorkflow } from "@app/temporal/scrub_workspace/client";
import { ConnectorsAPI, removeNulls } from "@app/types";

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
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Missing workspace on auth.");
  }
  const scrubCancelRes = await terminateScheduleWorkspaceScrubWorkflow({
    workspaceId: owner.sId,
  });
  if (scrubCancelRes.isErr()) {
    logger.error(
      { stripeError: true, error: scrubCancelRes.error },
      "Error terminating scrub workspace workflow."
    );
  }
  const dataSources = await getDataSources(auth);
  const connectorIds = removeNulls(dataSources.map((ds) => ds.connectorId));
  const connectorsApi = new ConnectorsAPI(
    apiConfig.getConnectorsAPIConfig(),
    logger
  );
  for (const connectorId of connectorIds) {
    const r = await connectorsApi.unpauseConnector(connectorId);
    if (r.isErr()) {
      logger.error(
        { connectorId, stripeError: true, error: r.error },
        "Error unpausing connector after subscription reactivation."
      );
    }
  }

  // Re-enable all triggers that point to non-archived agents
  const enableTriggersRes = await TriggerResource.enableAllForWorkspace(auth);
  if (enableTriggersRes.isErr()) {
    logger.error(
      { stripeError: true, error: enableTriggersRes.error },
      "Error re-enabling workspace triggers on subscription reactivation"
    );
    // Don't throw error here - we want the function to continue even if trigger re-enabling fails
  }
}
