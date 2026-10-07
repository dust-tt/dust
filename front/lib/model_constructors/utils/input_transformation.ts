import { z } from "zod";

// Edits the provider applied to our input before the model read it, e.g. a
// thinking block dropped or flagged by the preserved-thinking prefix check.
// Attached to the `response_id` event metadata.
// https://platform.claude.com/docs/en/build-with-claude/preserved-thinking
export const InputTransformationSchema = z.object({
  type: z.string(),
  path: z.string(),
  reason: z.string(),
});

export type InputTransformation = z.infer<typeof InputTransformationSchema>;

const InputTransformationsSchema = z.array(InputTransformationSchema);

// Narrow an unknown value (e.g. read back from the metadata content bag) to a
// list of InputTransformation.
export function isInputTransformations(
  value: unknown
): value is InputTransformation[] {
  return InputTransformationsSchema.safeParse(value).success;
}
