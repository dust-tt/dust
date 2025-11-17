import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { v4 as uuidv4 } from "uuid";

import type { Result } from "../../shared/result";
import { Err, Ok } from "../../shared/result";

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

export interface BrandedRange {
  readonly Range: unique symbol;
}

// Defines a function to generate a branded codec for validating numbers within a specific range.
export function createRangeCodec(min: number, max: number) {
  return t.brand(
    t.number,
    (n): n is t.Branded<number, BrandedRange> => n >= min && n <= max,
    "Range"
  );
}

interface SlugifiedStringBrand {
  readonly SlugifiedString: unique symbol;
}

export const SlugifiedString = t.brand(
  t.string,
  (s): s is t.Branded<string, SlugifiedStringBrand> => /^[a-z0-9_]+$/.test(s),
  "SlugifiedString"
);

export function ioTsParsePayload<T>(
  payload: unknown,
  codec: t.Type<T>
): Result<T, string[]> {
  const bodyValidation = codec.decode(payload);
  if (isLeft(bodyValidation)) {
    const pathError = reporter.formatValidationErrors(bodyValidation.left);
    return new Err(pathError);
  }

  return new Ok(bodyValidation.right);
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
