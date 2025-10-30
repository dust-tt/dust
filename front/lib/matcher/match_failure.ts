import get from "lodash/get";

import type { MatcherExpression } from "./types";
import { isLogicalExpression, isOperationExpression } from "./types";
import { OperationDisplayNames } from "./types";

export interface MatchFailure {
  field?: string;
  operator: string;
  expected?: unknown;
  actual?: unknown;
  reason: string;
}

/**
 * Gets a field value from a payload, supporting wildcard array paths.
 * Mirrors the logic in matcher.ts
 */
function getFieldValue(
  payload: Record<string, unknown>,
  fieldPath: string
): unknown {
  if (fieldPath.includes(".*")) {
    const parts = fieldPath.split(".*");
    if (parts.length !== 2) {
      return undefined;
    }

    const [arrayPath, subField] = parts;
    const arrayValue = get(payload, arrayPath);

    if (!Array.isArray(arrayValue)) {
      return undefined;
    }

    const cleanSubField = subField.startsWith(".")
      ? subField.slice(1)
      : subField;
    return arrayValue
      .map((item) => get(item, cleanSubField))
      .filter((v) => v !== undefined);
  }

  return get(payload, fieldPath);
}

/**
 * Evaluates a matcher expression against a payload and returns detailed failure information
 * if the match fails.
 *
 * @param payload - The JSON payload to match against
 * @param matcher - The matcher expression
 * @param matchPayloadFn - The actual matcher function to determine if it passes
 * @returns Array of MatchFailure objects describing why the match failed, or empty array if it matched
 */
export function explainMatchFailure(
  payload: Record<string, unknown>,
  matcher: MatcherExpression,
  matchPayloadFn: (p: Record<string, unknown>, m: MatcherExpression) => boolean
): MatchFailure[] {
  // First check if it actually matches - if so, return empty array
  if (matchPayloadFn(payload, matcher)) {
    return [];
  }

  const failures: MatchFailure[] = [];

  // Handle logical operators (and, or, not)
  if (isLogicalExpression(matcher)) {
    if (matcher.op === "and") {
      // For AND, collect failures from all expressions that failed
      matcher.expressions.forEach((expr) => {
        const subFailures = explainMatchFailure(payload, expr, matchPayloadFn);
        failures.push(...subFailures);
      });
      return failures;
    } else if (matcher.op === "or") {
      // For OR, we need to show why ALL options failed
      matcher.expressions.forEach((expr, idx) => {
        const subFailures = explainMatchFailure(payload, expr, matchPayloadFn);
        if (subFailures.length > 0) {
          failures.push({
            operator: `or (option ${idx + 1})`,
            reason: `None of the OR conditions matched`,
          });
          failures.push(...subFailures);
        }
      });
      return failures;
    } else if (matcher.op === "not") {
      // For NOT, the inner expression matched when it shouldn't have
      if (matcher.expressions.length === 1) {
        return [
          {
            operator: "not",
            reason: "The condition that should NOT match actually matched",
          },
        ];
      }
    }
  }

  // Handle comparison operators
  if (isOperationExpression(matcher)) {
    const fieldValue = getFieldValue(payload, matcher.field);
    const displayName = OperationDisplayNames[matcher.op] || matcher.op;

    switch (matcher.op) {
      case "eq":
        failures.push({
          field: matcher.field,
          operator: displayName,
          expected: matcher.value,
          actual: fieldValue,
          reason: `Field '${matcher.field}' is ${JSON.stringify(fieldValue)} but expected ${JSON.stringify(matcher.value)}`,
        });
        break;

      case "starts-with":
        failures.push({
          field: matcher.field,
          operator: displayName,
          expected: matcher.value,
          actual: fieldValue,
          reason: `Field '${matcher.field}' (${JSON.stringify(fieldValue)}) does not start with ${JSON.stringify(matcher.value)}`,
        });
        break;

      case "has":
        failures.push({
          field: matcher.field,
          operator: displayName,
          expected: matcher.value,
          actual: fieldValue,
          reason: `Field '${matcher.field}' array does not contain ${JSON.stringify(matcher.value)}`,
        });
        break;

      case "has-all":
        failures.push({
          field: matcher.field,
          operator: displayName,
          expected: matcher.values,
          actual: fieldValue,
          reason: `Field '${matcher.field}' does not contain all of ${JSON.stringify(matcher.values)}`,
        });
        break;

      case "has-any":
        failures.push({
          field: matcher.field,
          operator: displayName,
          expected: matcher.values,
          actual: fieldValue,
          reason: `Field '${matcher.field}' does not contain any of ${JSON.stringify(matcher.values)}`,
        });
        break;

      case "gt":
        failures.push({
          field: matcher.field,
          operator: displayName,
          expected: matcher.value,
          actual: fieldValue,
          reason: `Field '${matcher.field}' (${JSON.stringify(fieldValue)}) is not greater than ${JSON.stringify(matcher.value)}`,
        });
        break;

      case "gte":
        failures.push({
          field: matcher.field,
          operator: displayName,
          expected: matcher.value,
          actual: fieldValue,
          reason: `Field '${matcher.field}' (${JSON.stringify(fieldValue)}) is not greater than or equal to ${JSON.stringify(matcher.value)}`,
        });
        break;

      case "lt":
        failures.push({
          field: matcher.field,
          operator: displayName,
          expected: matcher.value,
          actual: fieldValue,
          reason: `Field '${matcher.field}' (${JSON.stringify(fieldValue)}) is not less than ${JSON.stringify(matcher.value)}`,
        });
        break;

      case "lte":
        failures.push({
          field: matcher.field,
          operator: displayName,
          expected: matcher.value,
          actual: fieldValue,
          reason: `Field '${matcher.field}' (${JSON.stringify(fieldValue)}) is not less than or equal to ${JSON.stringify(matcher.value)}`,
        });
        break;

      case "exists":
        failures.push({
          field: matcher.field,
          operator: displayName,
          actual: fieldValue,
          reason: `Field '${matcher.field}' does not exist or is undefined`,
        });
        break;
    }
  }

  return failures;
}
