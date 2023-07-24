import * as t from "io-ts";

import { getTrackableDataSources } from "@app/documents_post_process_hooks/hooks/document_tracker/lib";
import { callAction } from "@app/lib/actions/helpers";
import {
  cloneBaseConfig,
  DustProdActionRegistry,
} from "@app/lib/actions/registry";

// Part of the new doc tracker pipeline, performs the retrieval (semantic search) step
// it takes {input_text: string} as input
// and returns an array of DocTrackerRetrievalActionValue as output
export async function callDocTrackerRetrievalAction(
  workspaceId: string,
  inputText: string,
  targetDocumentTokens = 2000
): Promise<t.TypeOf<typeof DocTrackerRetrievalActionValueSchema>> {
  const action = DustProdActionRegistry["doc-tracker-retrieval"];
  const config = cloneBaseConfig(action.config);

  config.SEMANTIC_SEARCH.data_sources = await getTrackableDataSources(
    workspaceId
  );
  config.SEMANTIC_SEARCH.target_document_tokens = targetDocumentTokens;

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
    text: t.union([t.string, t.null, t.undefined]),
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
