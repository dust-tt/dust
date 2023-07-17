import { isRight } from "fp-ts/lib/Either";
import * as t from "io-ts";

import { Action, cloneBaseConfig } from "@app/lib/actions/registry";
import {
  ActionResponseBaseSchema,
  isActionResponseBase,
} from "@app/lib/actions/types";
import { Authenticator, prodAPICredentialsForOwner } from "@app/lib/auth";
import {
  DustAPI,
  DustAPIErrorResponse,
  DustAppConfigType,
} from "@app/lib/dust_api";
import { Ok, Result } from "@app/lib/result";

interface CallActionParams<V extends t.Mixed> {
  workspaceId: string;
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
 * @param workspaceId string the workspace id (sId)
 * @param input { [key: string]: unknown } the action input (a single input)
 * @param config DustAppConfigType the action config
 * @param responseValueSchema V extends t.Mixed the io-ts schema of the action response value
 */
export async function callAction<V extends t.Mixed>({
  workspaceId,
  input,
  action,
  config,
  responseValueSchema,
}: CallActionParams<V>): Promise<
  Result<t.TypeOf<typeof responseValueSchema>, DustAPIErrorResponse>
> {
  const app = cloneBaseConfig(action.app);

  const owner = (
    await Authenticator.internalBuilderForWorkspace(workspaceId)
  ).workspace();
  if (!owner) {
    throw new Error(
      `Could not get internal builder for workspace ${workspaceId}`
    );
  }
  const prodCredentials = await prodAPICredentialsForOwner(owner);

  const prodAPI = new DustAPI(prodCredentials);

  const response = (await prodAPI.runApp(app, config, [input])) as Result<
    unknown,
    DustAPIErrorResponse
  >;

  if (response.isErr()) {
    throw response.error;
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

  if (responseChecker(response.value)) {
    // the response is a valid success response for the action
    // return the "value" field of the first result
    return new Ok(response.value.results[0][0].value);
  }

  if (isActionResponseBase(response.value)) {
    // the response is of the right shape, but it's not a success response
    throw new Error(
      `Doc Tracker action failed response: ${JSON.stringify(
        response.value.status
      )}`
    );
  }

  // the response is not of a known shape, so we can't assume anything about it
  throw new Error(
    `Unexpected Doc Tracker action response: ${JSON.stringify(response.value)}`
  );
}
