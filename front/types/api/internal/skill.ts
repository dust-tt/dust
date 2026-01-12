import * as t from "io-ts";

import { createRangeCodec } from "@app/types/shared/utils/iots_utils";

const LimitCodec = createRangeCodec(0, 100);

export const GetSkillHistoryQuerySchema = t.type({
  limit: t.union([LimitCodec, t.undefined]),
});
