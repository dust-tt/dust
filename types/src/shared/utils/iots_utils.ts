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
