import {
  Action,
  cloneBaseConfig,
  DustProdActionRegistry,
} from "@app/lib/actions/registry";
import { Authenticator, prodAPICredentialsForOwner } from "@app/lib/auth";
import {
  DustAPI,
  DustAPIErrorResponse,
  DustAppConfigType,
} from "@app/lib/dust_api";
import { Result } from "@app/lib/result";
import {
  ActionResponseBase,
  DocTrackerLegacyActionMatchValue,
  DocTrackerLegacyActionNoMatchValue,
  DocTrackerLegacyActionSuccessResponse,
  DocTrackerRetrievalActionSuccessResponse,
  DocTrackerRetrievalActionValue,
  isActionResponseBase,
  isDocTrackerLegacyActionSuccessResponse,
  isDocTrackerRetrievalActionSuccessResponse,
} from "@app/post_upsert_hooks/hooks/document_tracker/actions/types";
import { TRACKABLE_CONNECTOR_TYPES } from "@app/post_upsert_hooks/hooks/document_tracker/consts";

export async function callLegacyDocTrackerAction(
  workspaceId: string,
  incomingDoc: string
): Promise<
  DocTrackerLegacyActionMatchValue | DocTrackerLegacyActionNoMatchValue
> {
  const action = DustProdActionRegistry["doc-tracker"];
  const config = cloneBaseConfig(action.config);

  config.SEMANTIC_SEARCH.data_sources = await getTrackableDataSources(
    workspaceId
  );

  return callAction<DocTrackerLegacyActionSuccessResponse>({
    workspaceId,
    input: { incoming_document: incomingDoc },
    action,
    config,
    responseChecker: isDocTrackerLegacyActionSuccessResponse,
  });
}

export async function callDocTrackerRetrievalAction(
  workspaceId: string,
  inputText: string
): Promise<DocTrackerRetrievalActionValue[]> {
  const action = DustProdActionRegistry["doc-tracker-retrieval"];
  const config = cloneBaseConfig(action.config);

  config.SEMANTIC_SEARCH.data_sources = await getTrackableDataSources(
    workspaceId
  );

  return callAction<DocTrackerRetrievalActionSuccessResponse>({
    workspaceId,
    input: { input_text: inputText },
    action,
    config,
    responseChecker: isDocTrackerRetrievalActionSuccessResponse,
  });
}

type ActionSuccessResponseBase = ActionResponseBase & {
  results: { value: unknown }[][];
};

interface CallActionParams<R extends ActionSuccessResponseBase> {
  workspaceId: string;
  input: unknown;
  action: Action;
  config: DustAppConfigType;
  responseChecker: (response: unknown) => response is R;
}

async function callAction<R extends ActionSuccessResponseBase>({
  workspaceId,
  input,
  action,
  config,
  responseChecker,
}: CallActionParams<R>): Promise<R["results"][0][0]["value"]> {
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

  if (responseChecker(response.value)) {
    return response.value.results[0][0].value;
  }

  if (isActionResponseBase(response.value)) {
    throw new Error(
      `Doc Tracker action failed response: ${JSON.stringify(
        response.value.status
      )}`
    );
  }

  throw new Error(
    `Unexpected Doc Tracker action response: ${JSON.stringify(response.value)}`
  );
}

async function getTrackableDataSources(workspaceId: string): Promise<
  {
    workspace_id: string;
    data_source_id: string;
  }[]
> {
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

  // Fetch data sources
  const dsRes = await prodAPI.getDataSources(prodAPI.workspaceId());
  if (dsRes.isErr()) {
    throw dsRes.error;
  }
  const dataSources = dsRes.value;

  // Filter data sources to only include trackable ones
  const trackableDataSources = dataSources.filter(
    (ds) =>
      ds.connectorProvider &&
      TRACKABLE_CONNECTOR_TYPES.includes(ds.connectorProvider)
  );

  return trackableDataSources.map((ds) => ({
    workspace_id: prodAPI.workspaceId(),
    data_source_id: ds.name,
  }));
}
