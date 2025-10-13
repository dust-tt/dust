import get from "lodash/get";

import { eq } from "./operators/equality";
import { exists } from "./operators/existence";
import { gt, gte, lt, lte } from "./operators/numeric";
import { startsWith } from "./operators/string";
import { has, hasAll, hasAny } from "./operators/array";
import type { MatcherExpression } from "./types";
import { isLogicalExpression, isOperationExpression } from "./types";

/**
 * Gets a field value from a payload, supporting wildcard array paths.
 *
 * Examples:
 * - "user.email" -> get(payload, "user.email")
 * - "tags.*.name" -> maps over tags array and extracts name from each
 *
 * @param payload - The payload object
 * @param fieldPath - The field path, potentially with wildcards
 * @returns The field value or array of values if wildcard used
 */
function getFieldValue(
  payload: Record<string, unknown>,
  fieldPath: string
): unknown {
  // Check if path contains wildcard for array access.
  if (fieldPath.includes(".*")) {
    const parts = fieldPath.split(".*");
    if (parts.length !== 2) {
      // Support one wildcard level.
      return undefined;
    }

    const [arrayPath, subField] = parts;
    const arrayValue = get(payload, arrayPath);

    if (!Array.isArray(arrayValue)) {
      return undefined;
    }

    // Map over array and extract subField from each element.
    // Remove leading dot from subField if present.
    const cleanSubField = subField.startsWith(".")
      ? subField.slice(1)
      : subField;
    return arrayValue
      .map((item) => get(item, cleanSubField))
      .filter((v) => v !== undefined);
  }

  // Standard path access.
  return get(payload, fieldPath);
}

/**
 * Recursively matches a payload against a matcher expression.
 *
 * @param payload - The JSON payload to match against
 * @param matcher - The matcher expression (typed structure)
 * @returns true if the payload matches the expression, false otherwise
 */
export function matchPayload(
  payload: Record<string, unknown>,
  matcher: MatcherExpression
): boolean {
  // Handle logical operators (and, or, not).
  if (isLogicalExpression(matcher)) {
    if (matcher.op === "and") {
      return matcher.expressions.every((expr) => matchPayload(payload, expr));
    } else if (matcher.op === "or") {
      return matcher.expressions.some((expr) => matchPayload(payload, expr));
    } else if (matcher.op === "not") {
      // NOT negates the single expression.
      if (matcher.expressions.length !== 1) {
        return false;
      }
      return !matchPayload(payload, matcher.expressions[0]);
    }
  }

  // Handle comparison operators.
  if (isOperationExpression(matcher)) {
    const fieldValue = getFieldValue(payload, matcher.field);

    switch (matcher.op) {
      case "eq":
        return eq(fieldValue, matcher.value);

      case "starts-with":
        return startsWith(fieldValue, matcher.value);

      case "has":
        return has(fieldValue, matcher.value);

      case "has-all":
        if (!matcher.values) {
          return false;
        }
        return hasAll(fieldValue, matcher.values);

      case "has-any":
        if (!matcher.values) {
          return false;
        }
        return hasAny(fieldValue, matcher.values);

      case "gt":
        return gt(fieldValue, matcher.value);

      case "gte":
        return gte(fieldValue, matcher.value);

      case "lt":
        return lt(fieldValue, matcher.value);

      case "lte":
        return lte(fieldValue, matcher.value);

      case "exists":
        return exists(fieldValue);
    }
  }

  return false;
}
