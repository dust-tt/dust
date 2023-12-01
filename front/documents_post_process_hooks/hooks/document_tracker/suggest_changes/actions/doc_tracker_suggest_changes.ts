import * as t from "io-ts";

import { callAction } from "@app/lib/actions/helpers";
import { cloneBaseConfig, DustProdActionRegistry } from "@dust-tt/types";

// Part of the new doc tracker pipeline, suggest changes  based on a "source_document" (new incoming doc)
// and a "target_document" (the tracked doc)
// it takes {source_document, target_document} a
// it returns {match: false} or {match: true, suggested_changes: string}
export async function callDocTrackerSuggestChangesAction(
  workspaceId: string,
  sourceDocument: string,
  targetDocument: string
): Promise<t.TypeOf<typeof DocTrackerSuggestChangesActionValueSchema>> {
  const action = DustProdActionRegistry["doc-tracker-suggest-changes"];
  const config = cloneBaseConfig(action.config);

  const res = await callAction({
    workspaceId,
    input: { source_document: sourceDocument, target_document: targetDocument },
    action,
    config,
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
