import type { WorkspaceType } from "@dust-tt/types";
import { cloneBaseConfig, DustProdActionRegistry } from "@dust-tt/types";
import * as t from "io-ts";

import { callAction } from "@app/lib/actions/helpers";
import { getTrackableDataSources } from "@app/lib/documents_post_process_hooks/hooks/document_tracker/lib";

// Part of the new doc tracker pipeline, performs the retrieval (semantic search) step
// it takes {input_text: string} as input
// and returns an array of DocTrackerRetrievalActionValue as output
export async function callDocTrackerRetrievalAction(
  owner: WorkspaceType,
  inputText: string,
  targetDocumentTokens = 2000
): Promise<t.TypeOf<typeof DocTrackerRetrievalActionValueSchema>> {
  const action = DustProdActionRegistry["doc-tracker-retrieval"];
  const config = cloneBaseConfig(action.config);

  config.SEMANTIC_SEARCH.data_sources = await getTrackableDataSources(owner);
  config.SEMANTIC_SEARCH.target_document_tokens = targetDocumentTokens;

  const res = await callAction({
    action,
    config,
    input: { input_text: inputText },
    owner,
    responseValueSchema: DocTrackerRetrievalActionValueSchema,
    user: null,
  });

  if (res.isErr()) {
    throw res.error;
  }

  return res.value;
}

// Must map CoreAPIDocument
const DocTrackerRetrievalActionValueSchema = t.array(
  t.type({
    data_source_id: t.string,
    created: t.Integer,
    document_id: t.string,
    timestamp: t.Integer,
    tags: t.array(t.string),
    parents: t.array(t.string),
    source_url: t.union([t.string, t.null]),
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
