import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { z } from "zod";
import { fromError } from "zod-validation-error";

/**
 * Creates a zod enum schema from an array of string values.
 * Equivalent to ioTsEnum().
 */
export function zodEnum<EnumType extends string>(
  enumValues: readonly EnumType[],
  enumName?: string
): z.ZodEnum<[EnumType, ...EnumType[]]> {
  return z.enum(enumValues as [EnumType, ...EnumType[]], {
    errorMap: () => ({
      message: `${enumName || "Value"} must be one of: ${enumValues.join(", ")}`,
    }),
  });
}

/**
 * Parses a payload using a zod schema and returns a Result.
 * Equivalent to ioTsParsePayload().
 * Uses zod-validation-error for better error formatting, consistent with @front.
 */
export function zodParsePayload<T>(
  payload: unknown,
  schema: z.ZodSchema<T>
): Result<T, string> {
  const result = schema.safeParse(payload);
  if (!result.success) {
    // Use zod-validation-error for better error formatting, consistent with @front
    const formattedError = fromError(result.error).toString();
    return new Err(formattedError);
  }

  return new Ok(result.data);
}
