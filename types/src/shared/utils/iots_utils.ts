import * as t from "io-ts";
import { v4 as uuidv4 } from "uuid";

export function ioTsEnum<EnumType>(
  enumValues: readonly string[],
  enumName?: string
) {
  const isEnumValue = (input: unknown): input is EnumType =>
    enumValues.includes(input as string);

  return new t.Type<EnumType>(
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
