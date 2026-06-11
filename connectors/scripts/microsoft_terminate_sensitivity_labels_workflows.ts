/**
 * Terminates microsoft-sensitivityLabelsReconciliation-* workflows for connectors
 * where allowedSensitivityLabels is null or empty (i.e. should not be running).
 *
 * Usage:
 *   npx ts-node scripts/microsoft_terminate_sensitivity_labels_workflows.ts [--execute]
 */

import {
  microsoftSensitivityLabelsReconciliationWorkflowId,
} from "@connectors/connectors/microsoft/temporal/workflows";
import { terminateWorkflow } from "@connectors/lib/temporal";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { MicrosoftConfigurationResource } from "@connectors/resources/microsoft_resource";

import { makeScript } from "./helpers";

makeScript({}, async ({ execute }, logger) => {
  const connectors = await ConnectorResource.listByType("microsoft", {});
  logger.info({ count: connectors.length }, "Fetched Microsoft connectors");

  const configs = await MicrosoftConfigurationResource.fetchByConnectorIds(
    connectors.map((c) => c.id)
  );

  const toTerminate = connectors.filter((connector) => {
    const config = configs[connector.id];
    return (
      !config ||
      !config.allowedSensitivityLabels ||
      config.allowedSensitivityLabels.length === 0
    );
  });

  logger.info(
    { count: toTerminate.length },
    "Connectors with no allowed sensitivity labels (workflow should not be running)"
  );

  for (const connector of toTerminate) {
    const workflowId = microsoftSensitivityLabelsReconciliationWorkflowId(
      connector.id
    );
    if (execute) {
      await terminateWorkflow(workflowId);
      logger.info({ connectorId: connector.id, workflowId }, "Terminated workflow");
    } else {
      logger.info(
        { connectorId: connector.id, workflowId },
        "DRY RUN: Would terminate workflow"
      );
    }
  }
});
