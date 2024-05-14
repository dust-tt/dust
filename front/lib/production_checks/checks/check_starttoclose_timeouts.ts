import { temporal } from "@temporalio/proto/protos/root";

import type { CheckFunction } from "@app/lib/production_checks/types";
import { getTemporalConnectorsNamespaceConnection } from "@app/lib/temporal";

const { EventType, TimeoutType } = temporal.api.enums.v1;

export const checkStartToCloseTimeoutsInActivities: CheckFunction = async (
  _checkName,
  logger,
  reportSuccess,
  reportFailure,
  heartbeat
) => {
  // get all running workflows
  const client = await getTemporalConnectorsNamespaceConnection();
  const workflowInfos = client.workflow
    .list({
      pageSize: 10,
      query: `ExecutionStatus = 'Running'`,
    })
    .intoHistories();
  logger.info(
    "Checking for startToClose timeout failures in running workflows' activities"
  );
  for await (const handle of workflowInfos) {
    const history = handle.history as temporal.api.history.v1.History;
    if (!handle.history || !history.events) {
      continue;
    }
    const activityTimeoutFailures = history.events.filter(
      (event) =>
        event.eventType === EventType.EVENT_TYPE_ACTIVITY_TASK_FAILED &&
        event.activityTaskFailedEventAttributes?.failure?.timeoutFailureInfo
          ?.timeoutType === TimeoutType.TIMEOUT_TYPE_START_TO_CLOSE
    );
    heartbeat();

    if (activityTimeoutFailures.length > 0) {
      reportFailure(
        {
          activityTimeoutFailures,
          workflowId: handle.workflowId,
          description:
            "StartToClose timeout failures are not logged in datadog and the activity is not terminated by temporal, but temporal retries by starting a new activity with same id. Multiple activity clones running at the same time can cause various issues, such as OOMs (activities pile up)",
        },
        "Found at least an activity with startToClose timeout failure in running workflow. Fix by modifying activity code so the activity enforces the timeout itself."
      );
    } else {
      reportSuccess({});
    }
  }
  logger.info("Finished checking for startToClose timeout failures");
};
