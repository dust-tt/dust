import type { ActionResponseBase } from "@dust-tt/types";
import { isRight } from "fp-ts/lib/Either";
import * as t from "io-ts";

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

export function isActionResponseBase(
  response: unknown
): response is ActionResponseBase {
  return isRight(ActionResponseBaseSchema.decode(response));
}
