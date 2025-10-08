// We are using the public API types here because it's internal MCP servers.
// eslint-disable-next-line dust/enforce-client-types-in-public-api
import type { DustAppConfigType } from "@dust-tt/client";
// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { DustAPI } from "@dust-tt/client";
import { isLeft, isRight } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

import apiConfig from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import type { Action } from "@app/lib/registry";
import { cloneBaseConfig } from "@app/lib/registry";
import logger from "@app/logger/logger";
import type { APIError, Result } from "@app/types";
import { Err, getHeaderFromGroupIds, getHeaderFromRole, Ok } from "@app/types";

const ActionResponseBaseSchema = t.type({
  run_id: t.string,
  created: t.Integer,
  run_type: t.string,
  config: t.UnknownRecord,
  status: t.type({
    run: t.string,
    blocks: t.array(
      t.type({
        block_type: t.string,
        name: t.string,
        status: t.string,
        success_count: t.Integer,
        error_count: t.Integer,
      })
    ),
  }),
  traces: t.UnknownArray,
  specification_hash: t.string,
});

type ActionResponseBase = t.TypeOf<typeof ActionResponseBaseSchema>;

function isActionResponseBase(
  response: unknown
): response is ActionResponseBase {
  return isRight(ActionResponseBaseSchema.decode(response));
}

interface CallActionParams<V extends t.Mixed> {
  input: { [key: string]: unknown };
  action: Action;
  config: DustAppConfigType;
  // needs to be an io-ts schema of the value returned by the action
  // Dust API response is {results: [[{value: V}]]}
  responseValueSchema: V;
}

/**
 * This function is **not** intended to be used by the client directly.
 *
 * It is used server-side to call an action on the production API, when streaming is not required.
 * It has the advantage of providing an interface that validates the response of the action using io-ts.
 *
 * note: this assumes a single input
 * note: this assumes the output is in `results`, i.e the output of the last block
 *
 * @param input { [key: string]: unknown } the action input (a single input)
 * @param config DustAppConfigType the action config
 * @param responseValueSchema V extends t.Mixed the io-ts schema of the action response value
 */
export async function callAction<V extends t.Mixed>(
  auth: Authenticator,
  { input, action, config, responseValueSchema }: CallActionParams<V>
): Promise<
  Result<
    {
      result: t.TypeOf<typeof responseValueSchema>;
      runId: string | null;
    },
    APIError
  >
> {
  const app = cloneBaseConfig(action.app);

  const prodCredentials = await prodAPICredentialsForOwner(
    auth.getNonNullableWorkspace()
  );
  const requestedGroupIds = auth.groups().map((g) => g.sId);

  const prodAPI = new DustAPI(
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

  const r = await prodAPI.runApp(app, config, [input]);

  if (r.isErr()) {
    return r;
  }

  // create a schema validator using the provided schema + the base response schema
  const responseSchema = t.intersection([
    ActionResponseBaseSchema,
    t.type({
      results: t.array(t.array(t.type({ value: responseValueSchema }))),
    }),
  ]);
  type responseType = t.TypeOf<typeof responseSchema>;
  const responseChecker = (response: unknown): response is responseType =>
    isRight(responseSchema.decode(response));

  if (responseChecker(r.value)) {
    // the response is a valid success response for the action
    // return the "value" field of the first result
    return new Ok({
      result: r.value.results[0][0].value,
      runId: r.value.run_id,
    });
  }

  const decodedReponse = responseSchema.decode(r.value);
  if (isLeft(decodedReponse)) {
    const pathError = reporter.formatValidationErrors(decodedReponse.left);
    return new Err({
      type: "action_failed",
      message: `Action failed response: ${pathError}`,
      runId: r.value.run_id,
    });
  }

  if (isActionResponseBase(r.value)) {
    // the response is of the right shape, but it's not a success response
    return new Err({
      type: "action_failed",
      message: `Action failed response: ${JSON.stringify(r.value.status)}`,
      runId: r.value.run_id,
    });
  }

  // the response is not of a known shape, so we can't assume anything about it
  return new Err({
    type: "unexpected_action_response",
    message: "Unexpected action response.",
    runId: r.value.run_id,
  });
}

export function isErrorWithRunId<T extends object>(
  error: T
): error is T & { runId: string } {
  return "runId" in error && typeof error.runId === "string";
}
