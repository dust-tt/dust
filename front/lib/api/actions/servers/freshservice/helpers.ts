/**
 * Pick specific fields from an object.
 */
export function pickFields(
  obj: unknown,
  fields: ReadonlyArray<string>
): Record<string, unknown> {
  const source = obj as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      result[field] = source[field];
    }
  }
  return result;
}
