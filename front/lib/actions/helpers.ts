import type { Action, DustAPIResponse, WorkspaceType } from "@dust-tt/types";
import type { DustAppConfigType } from "@dust-tt/types";
import { cloneBaseConfig } from "@dust-tt/types";
import { DustAPI } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { isLeft, isRight } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

import {
  ActionResponseBaseSchema,
  isActionResponseBase,
} from "@app/lib/actions/types";
import apiConfig from "@app/lib/api/config";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import logger from "@app/logger/logger";

interface CallActionParams<V extends t.Mixed> {
  owner: WorkspaceType;
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
 * @param owner WorksapceType the workspace
 * @param input { [key: string]: unknown } the action input (a single input)
 * @param config DustAppConfigType the action config
 * @param responseValueSchema V extends t.Mixed the io-ts schema of the action response value
 */
export async function callAction<V extends t.Mixed>({
  owner,
  input,
  action,
  config,
  responseValueSchema,
}: CallActionParams<V>): Promise<
  DustAPIResponse<t.TypeOf<typeof responseValueSchema>>
> {
  const app = cloneBaseConfig(action.app);

  const prodCredentials = await prodAPICredentialsForOwner(owner);

  const prodAPI = new DustAPI(
    apiConfig.getDustAPIConfig(),
    prodCredentials,
    logger
  );

  // @TODO(GROUPS_INFRA) The doc tracker apps are running without any group privileges for now.
  const r = await prodAPI.runApp([], app, config, [input]);

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
    return new Ok(r.value.results[0][0].value);
  }

  const decodedReponse = responseSchema.decode(r.value);
  if (isLeft(decodedReponse)) {
    const pathError = reporter.formatValidationErrors(decodedReponse.left);
    return new Err({
      type: "action_failed",
      message: `Action failed response: ${pathError}`,
    });
  }

  if (isActionResponseBase(r.value)) {
    // the response is of the right shape, but it's not a success response
    return new Err({
      type: "action_failed",
      message: `Action failed response: ${JSON.stringify(r.value.status)}`,
    });
  }

  // the response is not of a known shape, so we can't assume anything about it
  return new Err({
    type: "unexpected_action_response",
    message: "Unexpected action response.",
  });
}
