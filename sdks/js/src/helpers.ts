import { z } from "zod";

export type StringLiteral<T> = T extends string
  ? string extends T
    ? never
    : T
  : never;

// Custom schema to get a string literal type and yet allow any string when parsing
export const FlexibleEnumSchema = <T extends string>() =>
  z.custom<StringLiteral<T>>((val) => {
    return typeof val === "string";
  });
