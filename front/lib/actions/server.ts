// Okay to use public API types because it's internal MCP servers.
// eslint-disable-next-line dust/enforce-client-types-in-public-api
import type { DustAppConfigType, DustAppType } from "@dust-tt/client";
// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { DustAPI } from "@dust-tt/client";

import apiConfig from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import type { DustRegistryActionName } from "@app/lib/registry";
import { getDustProdAction } from "@app/lib/registry";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";
import { Err, getHeaderFromGroupIds, getHeaderFromRole, Ok } from "@app/types";

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

  const action = getDustProdAction(actionName);

  const loggerArgs = {
    workspace: {
      sId: owner.sId,
      name: owner.name,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    `workspace_plan_code:${auth.plan()?.code || null}`,
  ];

  statsDClient.increment("use_actions.count", 1, tags);
  const now = new Date();

  const requestedGroupIds = auth.groups().map((g) => g.sId);

  const prodCredentials = await prodAPICredentialsForOwner(owner);
  const api = new DustAPI(
    apiConfig.getDustAPIConfig(),
    {
      ...prodCredentials,
      extraHeaders: {
        ...getHeaderFromGroupIds(requestedGroupIds),
        ...getHeaderFromRole(auth.role()), // Keep the user's role for api.runApp call only
      },
    },
    logger
  );

  const res = await api.runApp(action.app, config, inputs);
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
