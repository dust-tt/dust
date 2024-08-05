import type { DustRegistryActionName } from "@dust-tt/types";
import type { DustAppConfigType, DustAppType } from "@dust-tt/types";
import { DustProdActionRegistry } from "@dust-tt/types";
import { DustAPI } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";

import apiConfig from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/withlogging";

// Record an event and a log for the action error.
const logActionError = (
  loggerArgs: {
    workspace: { sId: string; name: string; plan_code: string | null };
    action: string;
    app: DustAppType;
  },
  tags: string[],
  errorType: string,
  errorArgs: Record<string, any>
) => {
  statsDClient.increment("use_actions_error.count", 1, [
    `error_type:${errorType}`,
    ...tags,
  ]);

  logger.error(
    {
      error_type: errorType,
      ...errorArgs,
      ...loggerArgs,
    },
    "Action run error"
  );
};

/**
 * This function is intended to be used server side to run an action. Logs and monitors the
 * execution and actions as well as any error happening while running the action.
 * @param auth Authenticator
 * @param actionName string Action name as per DustProdActionRegistry
 * @param config DustAppConfigType
 * @param inputs Array<any> the action inputs
 * @returns an eventStream and a dustRunId promise
 */
export async function runActionStreamed(
  auth: Authenticator,
  actionName: DustRegistryActionName,
  config: DustAppConfigType,
  inputs: Array<unknown>,
  tracingRecords: Record<string, string>
) {
  const owner = auth.workspace();
  if (!owner) {
    return new Err({
      type: "workspace_not_found",
      message: "The workspace you're trying to access was not found.",
    });
  }

  const action = DustProdActionRegistry[actionName];

  const loggerArgs = {
    workspace: {
      sId: owner.sId,
      name: owner.name,
      plan_code: auth.plan()?.code || null,
    },
    action: actionName,
    app: action.app,
    model: config.MODEL,
  };

  logger.info(loggerArgs, "Action run creation");

  const tags = [
    `action:${actionName}`,
    `workspace:${owner.sId}`,
    `workspace_name:${owner.name}`,
    `workspace_plan_code:${auth.plan()?.code || null}`,
  ];

  statsDClient.increment("use_actions.count", 1, tags);
  const now = new Date();

  const prodCredentials = await prodAPICredentialsForOwner(owner);
  const api = new DustAPI(
    apiConfig.getDustAPIConfig(),
    prodCredentials,
    logger
  );

  const res = await api.runAppStreamed(auth.user(), action.app, config, inputs);
  if (res.isErr()) {
    logActionError(loggerArgs, tags, "run_error", { error: res.error });
    return new Err(res.error);
  }

  // Don't await the dustRunid promise before you are done iterating on the eventStream,
  // it will block the event stream, which is in charge of resolving that promise.
  const { eventStream, dustRunId } = res.value;
  dustRunId
    .then((runId) => {
      logger.info(
        {
          loggerArgs,
          runId,
          tracingRecords,
          userId: auth.user()?.sId,
        },
        "Got runId for runActionStreamed"
      );
    })
    .catch((err) => {
      logger.error(
        {
          error: err,
          loggerArgs,
          tracingRecords,
        },
        "Failed to get runId for runActionStreamed"
      );
    });

  const streamEvents = async function* () {
    for await (const event of eventStream) {
      if (event.type === "error") {
        logActionError(loggerArgs, tags, "run_error", { error: event.content });
      }
      if (event.type === "block_execution") {
        const e = event.content.execution[0][0];
        if (e.error) {
          logActionError(loggerArgs, tags, "block_execution_error", {
            error: e.error,
          });
        }
      }
      yield event;
    }

    // By now we have finished streaming the action so we can log the run duration.
    const elapsed = new Date().getTime() - now.getTime();
    statsDClient.distribution(
      "run_action.duration.distribution",
      elapsed,
      tags
    );
  };

  return new Ok({ eventStream: streamEvents(), dustRunId });
}

/**
 * This function is intended to be used server-side to run an action without streaming.
 * @param auth Authenticator
 * @param actionName string Action name as per DustProdActionRegistry
 * @param config DustAppConfigType
 * @param inputs Array<any> the action inputs
 * @returns RunType
 */
export async function runAction(
  auth: Authenticator,
  actionName: DustRegistryActionName,
  config: DustAppConfigType,
  inputs: Array<unknown>
) {
  const owner = auth.workspace();
  if (!owner) {
    return new Err({
      type: "workspace_not_found",
      message: "The workspace you're trying to access was not found.",
    });
  }

  const action = DustProdActionRegistry[actionName];

  const loggerArgs = {
    workspace: {
      sId: owner.sId,
      name: owner.name,
      plan_code: auth.plan()?.code || null,
    },
    action: actionName,
    app: action.app,
  };

  logger.info(loggerArgs, "Action run creation");

  const tags = [
    `action:${actionName}`,
    `workspace:${owner.sId}`,
    `workspace_name:${owner.name}`,
    `workspace_plan_code:${auth.plan()?.code || null}`,
  ];

  statsDClient.increment("use_actions.count", 1, tags);
  const now = new Date();

  const prodCredentials = await prodAPICredentialsForOwner(owner);
  const api = new DustAPI(
    apiConfig.getDustAPIConfig(),
    prodCredentials,
    logger
  );

  const res = await api.runApp(auth.user(), action.app, config, inputs);
  if (res.isErr()) {
    logActionError(loggerArgs, tags, "run_error", { error: res.error });
    return new Err(res.error);
  }

  const run = res.value;

  run.traces.forEach((trace) => {
    trace[1].forEach((b) => {
      b.forEach((t) => {
        if (t.error) {
          logActionError(loggerArgs, tags, "block_execution_error", {
            error: t.error,
          });
        }
      });
    });
  });

  const elapsed = new Date().getTime() - now.getTime();
  statsDClient.distribution("run_action.duration.distribution", elapsed, tags);

  return new Ok(res.value);
}
