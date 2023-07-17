import { isRight } from "fp-ts/lib/Either";
import * as t from "io-ts";

// Common to all actions
export const ActionResponseBaseSchema = t.type({
  run_id: t.string,
  created: t.Integer,
  run_type: t.string,
  config: t.UnknownRecord,
  status: t.type({
    run: t.string,
    blocks: t.array(
      t.type({
        block_type: t.string,
        name: t.string,
        status: t.string,
        success_count: t.Integer,
        error_count: t.Integer,
      })
    ),
  }),
  traces: t.UnknownArray,
  specification_hash: t.string,
});
export type ActionResponseBase = t.TypeOf<typeof ActionResponseBaseSchema>;
export function isActionResponseBase(
  response: unknown
): response is ActionResponseBase {
  return isRight(ActionResponseBaseSchema.decode(response));
}

// Specific to the legacy doc tracker action
export const DocTrackerLegacyActionMatchValueSchema = t.type({
  match: t.literal(true),
  matched_doc_url: t.string,
  matched_doc_id: t.string,
  matched_data_source_id: t.string,
  suggested_changes: t.string,
});
export type DocTrackerLegacyActionMatchValue = t.TypeOf<
  typeof DocTrackerLegacyActionMatchValueSchema
>;
export function isDocTrackerLegacyActionMatchValue(
  value: unknown
): value is DocTrackerLegacyActionMatchValue {
  return isRight(DocTrackerLegacyActionMatchValueSchema.decode(value));
}

export const DocTrackerLegacyActionNoMatchValueSchema = t.type({
  match: t.literal(false),
});
export type DocTrackerLegacyActionNoMatchValue = t.TypeOf<
  typeof DocTrackerLegacyActionNoMatchValueSchema
>;
export function isDocTrackerLegacyActionNoMatchValue(
  value: unknown
): value is DocTrackerLegacyActionNoMatchValue {
  return isRight(DocTrackerLegacyActionNoMatchValueSchema.decode(value));
}

export const DocTrackerLegacyActionSuccessResponseSchema = t.intersection([
  ActionResponseBaseSchema,
  t.type({
    results: t.array(
      t.array(
        t.type({
          value: t.union([
            DocTrackerLegacyActionMatchValueSchema,
            DocTrackerLegacyActionNoMatchValueSchema,
          ]),
        })
      )
    ),
  }),
]);
export type DocTrackerLegacyActionSuccessResponse = t.TypeOf<
  typeof DocTrackerLegacyActionSuccessResponseSchema
>;
export function isDocTrackerLegacyActionSuccessResponse(
  response: unknown
): response is DocTrackerLegacyActionSuccessResponse {
  return isRight(DocTrackerLegacyActionSuccessResponseSchema.decode(response));
}

// Specific to the doc tracker retrieval action
export const DocTrackerRetrievalActionValueSchema = t.type({
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
});
export type DocTrackerRetrievalActionValue = t.TypeOf<
  typeof DocTrackerRetrievalActionValueSchema
>;
export function isDocTrackerRetrievalActionValue(
  value: unknown
): value is DocTrackerRetrievalActionValue {
  return isRight(DocTrackerRetrievalActionValueSchema.decode(value));
}

export const DocTrackerRetrievalActionSuccessResponseSchema = t.intersection([
  ActionResponseBaseSchema,
  t.type({
    results: t.array(
      t.array(
        t.type({
          value: t.array(DocTrackerRetrievalActionValueSchema),
        })
      )
    ),
  }),
]);
export type DocTrackerRetrievalActionSuccessResponse = t.TypeOf<
  typeof DocTrackerRetrievalActionSuccessResponseSchema
>;
export function isDocTrackerRetrievalActionSuccessResponse(
  response: unknown
): response is DocTrackerRetrievalActionSuccessResponse {
  return isRight(
    DocTrackerRetrievalActionSuccessResponseSchema.decode(response)
  );
}
