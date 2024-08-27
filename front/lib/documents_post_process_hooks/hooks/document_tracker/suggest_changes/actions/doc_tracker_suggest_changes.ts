import type { WorkspaceType } from "@dust-tt/types";
import {
  cloneBaseConfig,
  DustProdActionRegistry,
  getLargeWhitelistedModel,
} from "@dust-tt/types";
import * as t from "io-ts";

import { callAction } from "@app/lib/actions/helpers";

// Part of the new doc tracker pipeline, suggest changes  based on a "source_document" (new incoming doc)
// and a "target_document" (the tracked doc)
// it takes {source_document, target_document} a
// it returns {match: false} or {match: true, suggested_changes: string}
export async function callDocTrackerSuggestChangesAction(
  owner: WorkspaceType,
  sourceDocument: string,
  targetDocument: string
): Promise<t.TypeOf<typeof DocTrackerSuggestChangesActionValueSchema>> {
  const action = DustProdActionRegistry["doc-tracker-suggest-changes"];

  const model = getLargeWhitelistedModel(owner);
  if (!model) {
    throw new Error("Could not find a whitelisted model for the workspace.");
  }

  const config = cloneBaseConfig(action.config);
  config.SUGGEST_CHANGES.provider_id = model.providerId;
  config.SUGGEST_CHANGES.model_id = model.modelId;

  const res = await callAction({
    action,
    config,
    input: { source_document: sourceDocument, target_document: targetDocument },
    owner,
    responseValueSchema: DocTrackerSuggestChangesActionValueSchema,
  });

  if (res.isErr()) {
    throw res.error;
  }

  return res.value;
}

const DocTrackerSuggestChangesActionValueSchema = t.union([
  t.type({
    match: t.literal(false),
    reason: t.string,
  }),
  t.type({
    match: t.literal(true),
    suggested_changes: t.string,
    reason: t.string,
  }),
]);
