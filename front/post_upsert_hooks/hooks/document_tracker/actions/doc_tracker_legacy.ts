import * as t from "io-ts";

import {
  cloneBaseConfig,
  DustProdActionRegistry,
} from "@app/lib/actions/registry";
import { callAction } from "@app/post_upsert_hooks/hooks/document_tracker/actions/lib";
import { getTrackableDataSources } from "@app/post_upsert_hooks/hooks/document_tracker/lib";

// this is the current Doc Tracker pipeline, implemented as a single dust action
// we are going to move away from this pipeline, new code should not use it
// it takes {incoming_document: string} as input
// and returns either:
// - {match: false}
// - {match: true, matched_doc_url: string, matched_doc_id: string, matched_data_source_id: string, suggested_changes: string}
export async function callLegacyDocTrackerAction(
  workspaceId: string,
  incomingDoc: string
): Promise<t.TypeOf<typeof DocTrackerLegacyActionValuesSchema>> {
  const action = DustProdActionRegistry["doc-tracker"];
  const config = cloneBaseConfig(action.config);

  config.SEMANTIC_SEARCH.data_sources = await getTrackableDataSources(
    workspaceId
  );

  return callAction({
    workspaceId,
    input: { incoming_document: incomingDoc },
    action,
    config,
    responseValueSchema: DocTrackerLegacyActionValuesSchema,
  });
}

const DocTrackerLegacyActionValuesSchema = t.union([
  t.type({
    match: t.literal(true),
    matched_doc_url: t.string,
    matched_doc_id: t.string,
    matched_data_source_id: t.string,
    suggested_changes: t.string,
  }),
  t.type({
    match: t.literal(false),
  }),
]);
