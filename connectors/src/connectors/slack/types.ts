import * as t from "io-ts";

const SlackAutoReadPatternSchema = t.type({
  pattern: t.string,
  spaceId: t.string,
});
const SlackAutoReadPatternsSchema = t.array(SlackAutoReadPatternSchema);

export type SlackAutoReadPattern = t.TypeOf<typeof SlackAutoReadPatternSchema>;

export function isSlackAutoReadPatterns(
  v: unknown[]
): v is SlackAutoReadPattern[] {
  return SlackAutoReadPatternsSchema.is(v);
}
