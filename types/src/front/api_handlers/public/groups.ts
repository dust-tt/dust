import * as t from "io-ts";

export const PatchGroupRequestBodySchema = t.type({
  memberIds: t.union([t.array(t.string), t.undefined]),
});

export type PatchGroupRequestBodyType = t.TypeOf<
  typeof PatchGroupRequestBodySchema
>;
