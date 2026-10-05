import * as t from "io-ts";
import { v4 as uuidv4 } from "uuid";

export function ioTsEnum<EnumType>(
  enumValues: readonly string[],
  enumName?: string
) {
  const isEnumValue = (input: unknown): input is EnumType =>
    enumValues.includes(input as string);

  return new t.Type<EnumType>(
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    enumName || uuidv4(),
    isEnumValue,
    (input, context) =>
      isEnumValue(input) ? t.success(input) : t.failure(input, context),
    t.identity
  );
}

// Parses numbers as strings. Must not be used in union types with number.
export const NumberAsStringCodec = new t.Type<string, string, unknown>(
  "NumberAsString",
  (u): u is string => typeof u === "number",
  (u, c) => {
    if (typeof u === "number") {
      return t.success(u.toString());
    }
    return t.failure(u, c, "Value must be a number");
  },
  t.identity
);

export const NonEmptyStringCodec = new t.Type<string, string, unknown>(
  "NonEmptyString",
  (u): u is string => typeof u === "string" && u.length > 0,
  (u, c) =>
    typeof u === "string" && u.length > 0
      ? t.success(u)
      : t.failure(u, c, "Value must be a non-empty string"),
  t.identity
);

export function nonEmptyArrayCodec<C extends t.Mixed>(codec: C) {
  return t.refinement(
    t.array(codec),
    (arr) => arr.length > 0,
    `NonEmptyArray<${codec.name}>`
  );
}
