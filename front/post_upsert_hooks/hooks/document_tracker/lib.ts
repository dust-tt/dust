import {
  cloneBaseConfig,
  DustProdActionRegistry,
} from "@app/lib/actions/registry";
import { Authenticator, prodAPICredentialsForOwner } from "@app/lib/auth";
import { DustAPI } from "@app/lib/dust_api";
import { TRACKABLE_CONNECTOR_TYPES } from "@app/post_upsert_hooks/hooks/document_tracker/consts";

const DOC_TRACKER_ACTION_NAME = "doc-tracker";

type DocTrackerActionSuccessResult = {
  value: DocTrackerActionResultMatchValue | DocTrackerActionResultNoMatchValue;
  error: null;
  meta: unknown;
};

type DocTrackerActionErrorResult = {
  value: null;
  error: unknown;
  meta: unknown;
};

export type DocTrackerActionResult =
  | DocTrackerActionSuccessResult
  | DocTrackerActionErrorResult;

export function isDocTrackerActionSuccessResult(
  result: DocTrackerActionResult
): result is DocTrackerActionSuccessResult {
  return result.value !== null;
}

type DocTrackerActionResultMatchValue = {
  match: true;
  matched_doc_url: string;
  matched_doc_id: string;
  matched_data_source_id: string;
  suggested_changes: string;
};

type DocTrackerActionResultNoMatchValue = {
  match: false;
};

export async function callDocTrackerAction(
  workspaceId: string,
  incomingDoc: string
): Promise<
  DocTrackerActionResultMatchValue | DocTrackerActionResultNoMatchValue
> {
  const action = DustProdActionRegistry[DOC_TRACKER_ACTION_NAME];

  if (!action) {
    throw new Error(
      `Could not find action with name '${DOC_TRACKER_ACTION_NAME}'`
    );
  }

  const config = cloneBaseConfig(action.config);
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

  // add data sources to config
  const dsRes = await prodAPI.getDataSources(prodAPI.workspaceId());
  if (dsRes.isErr()) {
    throw dsRes.error;
  }
  const dataSources = dsRes.value;

  // TODO: maybe just check in TrackedDocuments for DS that have tracked documents ?
  const trackableDataSources = dataSources.filter(
    (ds) =>
      ds.connectorProvider &&
      TRACKABLE_CONNECTOR_TYPES.includes(ds.connectorProvider)
  );

  config.SEMANTIC_SEARCH.data_sources = trackableDataSources.map((ds) => ({
    workspace_id: prodAPI.workspaceId(),
    data_source_id: ds.name,
  }));

  const response = await prodAPI.runApp(app, config, [
    { incoming_document: incomingDoc },
  ]);
  if (response.isErr()) {
    throw response.error;
  }

  if (response.value.status.run !== "succeeded" || !response.value.results) {
    throw new Error(
      `Doc Tracker action run failed: ${JSON.stringify(response.value)}`
    );
  }

  const results = response.value.results as [DocTrackerActionResult][];
  if (!results || results.length !== 1 || results[0].length !== 1) {
    throw new Error(
      `Unexpected doc-tracker action results shape: ${JSON.stringify(results)}`
    );
  }
  const result = results[0][0];

  if (!isDocTrackerActionSuccessResult(result)) {
    throw new Error(
      `Expected doc-tracker action result to be success, got error: ${result.error}`
    );
  }

  return result.value;
}
