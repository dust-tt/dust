import type { APIError, Result } from "@dust-tt/types";
import { Ok } from "@dust-tt/types";
import * as t from "io-ts";
import _ from "lodash";

import { callAction } from "@app/lib/actions/helpers";
import type { Authenticator } from "@app/lib/auth";
import { cloneBaseConfig, getDustProdAction } from "@app/lib/registry";
import type { TrackerMaintainedScopeType } from "@app/lib/resources/tracker_resource";

export async function callDocTrackerRetrievalAction(
  auth: Authenticator,
  {
    inputText,
    targetDocumentTokens,
    topK,
    maintainedScope,
    parentsInMap,
  }: {
    inputText: string;
    targetDocumentTokens: number;
    topK: number;
    maintainedScope: TrackerMaintainedScopeType;
    parentsInMap: Record<string, string[] | null>;
  }
): Promise<
  Result<
    {
      result: t.TypeOf<typeof DocTrackerRetrievalActionValueSchema>;
      runId: string | null;
    },
    APIError
  >
> {
  const ownerWorkspace = auth.getNonNullableWorkspace();

  if (!maintainedScope.length) {
    return new Ok({
      result: [],
      runId: null,
    });
  }

  if (
    _.uniqBy(maintainedScope, "dataSourceId").length !== maintainedScope.length
  ) {
    throw new Error("Duplicate data source ids in maintained scope");
  }

  const action = getDustProdAction("doc-tracker-retrieval");
  const config = cloneBaseConfig(action.config);

  config.SEMANTIC_SEARCH.data_sources = maintainedScope.map((view) => ({
    workspace_id: ownerWorkspace.sId,
    data_source_id: view.dataSourceViewId,
  }));

  if (Object.keys(parentsInMap).length > 0) {
    config.SEMANTIC_SEARCH.filter.parents = {
      in_map: parentsInMap,
    };
  }

  config.SEMANTIC_SEARCH.target_document_tokens = targetDocumentTokens;
  config.SEMANTIC_SEARCH.top_k = topK;

  const res = await callAction(auth, {
    action,
    config,
    input: { input_text: inputText },
    responseValueSchema: DocTrackerRetrievalActionValueSchema,
  });

  return res;
}

// Must map CoreAPIDocument
const DocTrackerRetrievalActionValueSchema = t.array(
  t.type({
    data_source_id: t.string,
    created: t.Integer,
    document_id: t.string,
    timestamp: t.Integer,
    title: t.union([t.string, t.null]),
    tags: t.array(t.string),
    parents: t.array(t.string),
    source_url: t.union([t.string, t.null]),
    hash: t.string,
    text_size: t.Integer,
    text: t.union([t.string, t.null, t.undefined]),
    chunk_count: t.Integer,
    chunks: t.array(
      t.intersection([
        t.type({
          text: t.string,
          hash: t.string,
          offset: t.Integer,
          score: t.number,
        }),
        t.partial({
          expanded_offsets: t.array(t.Integer),
        }),
      ])
    ),
    token_count: t.Integer,
  })
);
