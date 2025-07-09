import * as t from "io-ts";

import { callAction } from "@app/lib/actions/helpers";
import type { Authenticator } from "@app/lib/auth";
import { cloneBaseConfig, getDustProdAction } from "@app/lib/registry";
import type { APIError, Result } from "@app/types";

export async function callDocTrackerScoreDocsAction(
  auth: Authenticator,
  {
    watchedDocDiff,
    maintainedDocuments,
    prompt,
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
    prompt: string | null;
    providerId: string;
    modelId: string;
  }
): Promise<
  Result<
    { result: DocTrackerScoreDocsActionResult; runId: string | null },
    APIError
  >
> {
  const action = getDustProdAction("doc-tracker-score-docs");

  const config = cloneBaseConfig(action.config);
  config.MODEL.provider_id = providerId;
  config.MODEL.model_id = modelId;

  const res = await callAction(auth, {
    action,
    config,
    input: {
      watched_diff: watchedDocDiff,
      maintained_documents: maintainedDocuments,
      prompt,
    },
    responseValueSchema: DocTrackerScoreDocsActionResultSchema,
  });

  return res;
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
