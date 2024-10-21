import * as t from "io-ts";

import { callAction } from "@app/lib/actions/helpers";
import type { Authenticator } from "@app/lib/auth";
import { getTrackableDataSourceViews } from "@app/lib/documents_post_process_hooks/hooks/document_tracker/lib";
import { cloneBaseConfig, DustProdActionRegistry } from "@app/lib/registry";

// Part of the new doc tracker pipeline, performs the retrieval (semantic search) step
// it takes {input_text: string} as input
// and returns an array of DocTrackerRetrievalActionValue as output
export async function callDocTrackerRetrievalAction(
  auth: Authenticator,
  inputText: string,
  targetDocumentTokens = 2000
): Promise<t.TypeOf<typeof DocTrackerRetrievalActionValueSchema>> {
  const action = DustProdActionRegistry["doc-tracker-retrieval"];
  const config = cloneBaseConfig(action.config);

  const trackableDataSourceViews = await getTrackableDataSourceViews(auth);

  if (!trackableDataSourceViews.length) {
    return [];
  }

  config.SEMANTIC_SEARCH.data_sources = trackableDataSourceViews.map(
    (view) => ({
      workspace_id: auth.getNonNullableWorkspace().sId,
      data_source_id: view.sId,
    })
  );
  config.SEMANTIC_SEARCH.target_document_tokens = targetDocumentTokens;

  const res = await callAction(auth, {
    action,
    config,
    input: { input_text: inputText },
    responseValueSchema: DocTrackerRetrievalActionValueSchema,
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
