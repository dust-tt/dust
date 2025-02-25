import type { ModelId } from "@dust-tt/types";
import { proxyActivities, setHandler } from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/salesforce/temporal/activities";
import { resyncSignal } from "@connectors/connectors/salesforce/temporal/signals";

const { syncSalesforceConnectionActivity, syncTableRichTextDataActivity } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "10 minute",
  });

const { getTablesWithRichTextFieldsActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "30 minute",
});

export async function salesforceSyncWorkflow({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  const currentSyncMs = new Date().getTime();
  let signaled = false;

  setHandler(resyncSignal, () => {
    signaled = true;
  });

  do {
    signaled = false;
    await syncSalesforceConnectionActivity(connectorId);
    const tablesWithRichTextFields =
      await getTablesWithRichTextFieldsActivity(connectorId);

    for (const [tableName, textAreaFields] of Object.entries(
      tablesWithRichTextFields
    )) {
      await syncTableRichTextDataActivity({
        connectorId,
        tableName,
        textAreaFields,
        currentSyncMs,
      });
    }
  } while (signaled);
}
