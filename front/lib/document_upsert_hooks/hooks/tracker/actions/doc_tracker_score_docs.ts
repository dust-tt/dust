import * as t from "io-ts";

import { callAction } from "@app/lib/actions/helpers";
import type { Authenticator } from "@app/lib/auth";
import { cloneBaseConfig, DustProdActionRegistry } from "@app/lib/registry";

export async function callDocTrackerScoreDocsAction(
  auth: Authenticator,
  {
    watchedDocDiff,
    maintainedDocuments,
    providerId,
    modelId,
  }: {
    watchedDocDiff: string;
    maintainedDocuments: Array<{
      content: string;
      title: string | null;
      sourceUrl: string | null;
      dataSourceId: string;
      documentId: string;
    }>;
    providerId: string;
    modelId: string;
  }
): Promise<DocTrackerScoreDocsActionResult> {
  const action = DustProdActionRegistry["doc-tracker-score-docs"];

  const config = cloneBaseConfig(action.config);
  config.SUGGEST_CHANGES.provider_id = providerId;
  config.SUGGEST_CHANGES.model_id = modelId;

  const res = await callAction(auth, {
    action,
    config,
    input: {
      watched_diff: watchedDocDiff,
      maintained_documents: maintainedDocuments,
    },
    responseValueSchema: DocTrackerScoreDocsActionResultSchema,
  });

  if (res.isErr()) {
    throw res.error;
  }

  return res.value;
}

const DocTrackerScoreDocsActionResultSchema = t.array(
  t.type({
    documentId: t.string,
    dataSourceId: t.string,
    score: t.number,
    title: t.union([t.string, t.null, t.undefined]),
    sourceUrl: t.union([t.string, t.null, t.undefined]),
  })
);

type DocTrackerScoreDocsActionResult = t.TypeOf<
  typeof DocTrackerScoreDocsActionResultSchema
>;
