import * as t from "io-ts";

import { callAction } from "@app/lib/actions/helpers";
import {
  cloneBaseConfig,
  DustProdActionRegistry,
} from "@app/lib/actions/registry";
import { getTrackableDataSources } from "@app/post_upsert_hooks/hooks/document_tracker/lib";

// Part of the new doc tracker pipeline, performs the retrieval (semantic search) step
// it takes {input_text: string} as input
// and returns an array of DocTrackerRetrievalActionValue as output
export async function callDocTrackerRetrievalAction(
  workspaceId: string,
  inputText: string
): Promise<t.TypeOf<typeof DocTrackerRetrievalActionValueSchema>> {
  const action = DustProdActionRegistry["doc-tracker-retrieval"];
  const config = cloneBaseConfig(action.config);

  config.SEMANTIC_SEARCH.data_sources = await getTrackableDataSources(
    workspaceId
  );

  const res = await callAction({
    workspaceId,
    input: { input_text: inputText },
    action,
    config,
    responseValueSchema: DocTrackerRetrievalActionValueSchema,
  });

  if (res.isErr()) {
    throw res.error;
  }

  return res.value;
}

const DocTrackerRetrievalActionValueSchema = t.array(
  t.type({
    data_source_id: t.string,
    created: t.Integer,
    document_id: t.string,
    timestamp: t.Integer,
    tags: t.array(t.string),
    source_url: t.string,
    hash: t.string,
    text_size: t.Integer,
    chunk_count: t.Integer,
    chunks: t.array(
      t.type({
        text: t.string,
        hash: t.string,
        offset: t.Integer,
        score: t.number,
      })
    ),
    token_count: t.Integer,
  })
);
