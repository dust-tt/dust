import { createRangeCodec } from "@app/types/shared/utils/iots_utils";
import * as t from "io-ts";

const LimitCodec = createRangeCodec(0, 100);

export const GetSkillHistoryQuerySchema = t.type({
  limit: t.union([LimitCodec, t.undefined]),
});
