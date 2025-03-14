import * as t from "io-ts";

import { callAction } from "@app/lib/actions/helpers";
import type { Authenticator } from "@app/lib/auth";
import { cloneBaseConfig, getDustProdAction } from "@app/lib/registry";
import type { APIError, Result } from "@app/types";

// Part of the new doc tracker pipeline, suggest changes  based on a "source_document" (new incoming doc)
// and a "target_document" (the tracked doc)
// it takes {source_document, target_document} a
// it returns {match: false} or {match: true, suggested_changes: string}
export async function callDocTrackerSuggestChangesAction(
  auth: Authenticator,
  {
    watchedDocDiff,
    maintainedDocContent,
    prompt,
    providerId,
    modelId,
  }: {
    watchedDocDiff: string;
    maintainedDocContent: string;
    prompt: string | null;
    providerId: string;
    modelId: string;
  }
): Promise<
  Result<
    { result: DocTrackerSuggestChangesActionResult; runId: string | null },
    APIError
  >
> {
  const action = getDustProdAction("doc-tracker-suggest-changes");

  const config = cloneBaseConfig(action.config);
  config.SUGGEST_CHANGES.provider_id = providerId;
  config.SUGGEST_CHANGES.model_id = modelId;

  const res = await callAction(auth, {
    action,
    config,
    input: {
      modified_document_diff: watchedDocDiff,
      tracked_document: maintainedDocContent,
      prompt,
    },
    responseValueSchema: DocTrackerSuggestChangesActionResultSchema,
  });

  return res;
}

const DocTrackerSuggestChangesActionResultSchema = t.partial({
  thinking: t.union([t.string, t.null, t.undefined]),
  confidence_score: t.union([t.number, t.null, t.undefined]),
  suggestion: t.union([t.string, t.null, t.undefined]),
});

type DocTrackerSuggestChangesActionResult = t.TypeOf<
  typeof DocTrackerSuggestChangesActionResultSchema
>;
