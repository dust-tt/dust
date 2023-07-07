import diff from "fast-diff";

import {
  cloneBaseConfig,
  DustProdActionRegistry,
} from "@app/lib/actions/registry";
import { Authenticator, prodAPICredentialsForOwner } from "@app/lib/auth";
import { CoreAPI } from "@app/lib/core_api";
import { DustAPI } from "@app/lib/dust_api";
import { DataSource, Workspace } from "@app/lib/models";
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

export async function getTextForRetrieval({
  dataSourceName,
  workspaceId,
  documentId,
  documentHash,
}: {
  dataSourceName: string;
  workspaceId: string;
  documentId: string;
  documentHash: string;
}): Promise<string | null> {
  const dataSource = await getDatasource(dataSourceName, workspaceId);
  let diffFromHash: string | null = null;
  const offset = 0;
  const limit = 20;
  let indexOfHash = -1;
  let allVersions: { hash: string; created: number }[] = [];
  for (;;) {
    const res = await CoreAPI.getDataSourceDocumentVersions(
      dataSource.dustAPIProjectId,
      dataSource.name,
      documentId,
      limit,
      offset
    );
    if (res.isErr()) {
      throw res.error;
    }
    const { versions } = res.value;
    if (versions.length === 0) {
      break;
    }
    allVersions = allVersions.concat(versions);
    indexOfHash =
      indexOfHash === -1
        ? allVersions.findIndex((v) => v.hash === documentHash)
        : indexOfHash;
    if (indexOfHash !== -1) {
      // we want to get the version before the hash (i.e the array element right after the hash)
      if (allVersions.length > indexOfHash + 1) {
        diffFromHash = allVersions[indexOfHash + 1].hash;
        break;
      }
    }
  }

  let documentTextDiffStart: string | null = null;

  if (diffFromHash) {
    const res = await CoreAPI.getDataSourceDocument(
      dataSource.dustAPIProjectId,
      dataSource.name,
      documentId,
      diffFromHash
    );
    if (res.isErr()) {
      throw res.error;
    }
    const { document } = res.value;
    documentTextDiffStart = document.text || "";
  } else {
    documentTextDiffStart = "";
  }

  const documentCurrentVersion = await CoreAPI.getDataSourceDocument(
    dataSource.dustAPIProjectId,
    dataSource.name,
    documentId
  );
  if (documentCurrentVersion.isErr()) {
    throw documentCurrentVersion.error;
  }

  const documentTextDiffEnd =
    documentCurrentVersion.value.document.text || null;

  if (!documentTextDiffEnd) {
    return null;
  }
  if (documentTextDiffStart === documentTextDiffEnd) {
    return null;
  }

  const diffs = diff(documentTextDiffStart, documentTextDiffEnd);
  const positiveDiffs = diffs.filter((d) => d[0] === 1).map((d) => d[1]);

  // TODO: if too short, skip
  // TODO: maybe add context like doc title, where it comes from etc...
  // TODO: maybe also include rolling suggestion ?
  return positiveDiffs.join("");
}

export async function getDatasource(
  dataSourceName: string,
  workspaceId: string
): Promise<DataSource> {
  const workspace = await Workspace.findOne({
    where: {
      sId: workspaceId,
    },
  });
  if (!workspace) {
    throw new Error(`Could not find workspace with sId ${workspaceId}`);
  }
  const dataSource = await DataSource.findOne({
    where: {
      name: dataSourceName,
      workspaceId: workspace.id,
    },
  });
  if (!dataSource) {
    throw new Error(
      `Could not find data source with name ${dataSourceName} and workspaceId ${workspaceId}`
    );
  }
  return dataSource;
}
