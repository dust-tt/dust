import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";
import { fromError } from "zod-validation-error";

/**
 * What every Dust directive shares: the fences and tokens of the file layout, the shape of a
 * directive line, and the `{key=value ...}` attribute tokenizer and validator. Each directive's
 * own pattern, schema and builder live in the module that parses it: anchors.ts for the body
 * markers, annotations.ts for the block. See README.md for the format.
 */

export const FRONT_MATTER_FENCE = "---";
export const ANNOTATIONS_OPEN = ":::annotations";
/** The opener line, capturing anything after the name; it must be empty. */
export const ANNOTATIONS_OPEN_PATTERN = /^:::annotations(?![\w-])(.*)$/;
export const ANNOTATIONS_CLOSE = ":::";
export const DIRECTIVE_PREFIX = "::";
/** A `::name{...}` line, capturing the name and the attributes, trailing whitespace allowed. */
export const LEAF_DIRECTIVE_PATTERN = /^::([a-z]+)\{([^}]*)\}\s*$/;
/** One `key=value` or `key="value"` attribute, with its leading whitespace. */
const ATTRIBUTE_SOURCE = String.raw`\s*([A-Za-z][\w-]*)=(?:"([^"]*)"|([^\s"}]+))`;
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Ids of anchors and threads: letters, digits, `_` and `-`. */
export function isValidId(value: string): boolean {
  return ID_PATTERN.test(value);
}

export function requiredString(message: string) {
  return z.string({ required_error: message, invalid_type_error: message });
}

/** Splits `{key=value key="quoted value"}` contents into a record, rejecting duplicates. */
function tokenizeAttributes(
  raw: string
): Result<Record<string, string>, string> {
  const pattern = new RegExp(ATTRIBUTE_SOURCE, "y");
  const attributes: Record<string, string> = {};
  const trimmed = raw.trim();
  let position = 0;

  while (position < trimmed.length) {
    pattern.lastIndex = position;
    const match = pattern.exec(trimmed);
    if (!match) {
      return new Err(`Malformed attributes {${raw}}.`);
    }
    const [, key, quoted, bare] = match;
    if (Object.hasOwn(attributes, key)) {
      return new Err(`Duplicate attribute "${key}".`);
    }
    attributes[key] = quoted ?? bare;
    position = pattern.lastIndex;
  }

  return new Ok(attributes);
}

/** Validates an attribute record against `schema`, with the first issue as the message. */
export function validateAttributes<T extends z.ZodTypeAny>(
  attributes: Record<string, string>,
  schema: T
): Result<z.infer<T>, string> {
  const parsed = schema.safeParse(attributes);
  if (parsed.success) {
    return new Ok(parsed.data);
  }
  const [issue] = parsed.error.issues;
  if (issue.code === z.ZodIssueCode.unrecognized_keys) {
    return new Err(`Unknown attribute "${issue.keys[0]}".`);
  }
  return new Err(
    fromError(parsed.error, { prefix: null, includePath: false }).message
  );
}

/** Tokenizes the contents of a directive's braces and validates them against `schema`. */
export function parseAttributes<T extends z.ZodTypeAny>(
  raw: string,
  schema: T
): Result<z.infer<T>, string> {
  const tokens = tokenizeAttributes(raw);
  if (tokens.isErr()) {
    return tokens;
  }
  return validateAttributes(tokens.value, schema);
}
