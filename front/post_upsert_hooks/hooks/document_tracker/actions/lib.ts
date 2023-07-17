import { isRight } from "fp-ts/lib/Either";
import * as t from "io-ts";

import { Action, cloneBaseConfig } from "@app/lib/actions/registry";
import { Authenticator, prodAPICredentialsForOwner } from "@app/lib/auth";
import {
  DustAPI,
  DustAPIErrorResponse,
  DustAppConfigType,
} from "@app/lib/dust_api";
import { Result } from "@app/lib/result";
import {
  ActionResponseBaseSchema,
  isActionResponseBase,
} from "@app/post_upsert_hooks/hooks/document_tracker/actions/types";

interface CallActionParams<V extends t.Mixed> {
  workspaceId: string;
  input: unknown;
  action: Action;
  config: DustAppConfigType;
  // needs to be an io-ts schema of the value returned by the action
  // Dust API response is {results: [[{value: V}]]}
  responseValueSchema: V;
}

export async function callAction<V extends t.Mixed>({
  workspaceId,
  input,
  action,
  config,
  responseValueSchema,
}: CallActionParams<V>): Promise<t.TypeOf<typeof responseValueSchema>> {
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
    return response.value.results[0][0].value;
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
