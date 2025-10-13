import { assertNever } from "@app/types";
import {
  isDyadicOperation,
  isLogicalExpression,
  isOperationExpression,
  isOperator,
  isMonadicOperation,
  isVariadicOperation,
  type LogicalOp,
  type MatcherExpression,
  type Operation,
} from "./types";

/**
 * Parses a Lisp-inspired matcher expression string into a structured format.
 *
 * @param expression - The Lisp-inspired expression string, e.g.:
 *   '(or (and (eq "pr.author" "adrien@dust.tt") (has "pr.labels" "bug")))'
 * @returns Parsed matcher expression as typed structure
 * @throws Error if the expression is invalid
 */
export function parseMatcherExpression(expression: string): MatcherExpression {
  let index = 0;

  function skipWhitespace() {
    while (index < expression.length && /\s/.test(expression[index])) {
      index++;
    }
  }

  function parseString(): string {
    if (expression[index] !== '"') {
      throw new Error(`Expected '"' at position ${index}`);
    }
    index++; // Skip opening quote.
    let str = "";
    while (index < expression.length && expression[index] !== '"') {
      if (expression[index] === "\\") {
        index++;
        if (index >= expression.length) {
          throw new Error("Unexpected end of string");
        }
      }
      str += expression[index];
      index++;
    }
    if (expression[index] !== '"') {
      throw new Error(`Expected closing '"' at position ${index}`);
    }
    index++; // Skip closing quote.
    return str;
  }

  function parseAtom(): string | number | boolean | null {
    skipWhitespace();
    if (expression[index] === '"') {
      return parseString();
    }
    // Parse symbol, number, or boolean.
    let atom = "";
    while (index < expression.length && !/[\s()]/.test(expression[index])) {
      atom += expression[index];
      index++;
    }
    // Try to parse as boolean.
    if (atom === "true") {
      return true;
    }
    if (atom === "false") {
      return false;
    }
    // Try to parse as null.
    if (atom === "null") {
      return null;
    }
    // Try to parse as number.
    const num = Number(atom);
    if (!isNaN(num) && atom !== "") {
      return num;
    }
    return atom;
  }

  function parseList(): unknown[] {
    const result: unknown[] = [];
    skipWhitespace();
    while (expression[index] !== ")") {
      if (expression[index] === "(") {
        index++; // Skip opening paren.
        const list = parseList();
        result.push(list);
      } else {
        result.push(parseAtom());
      }
      skipWhitespace();
    }
    index++; // Skip closing paren.
    return result;
  }

  function convertToTypedExpression(list: unknown[]): MatcherExpression {
    if (list.length === 0) {
      throw new Error("Empty expression");
    }

    const op = list[0];

    if (!isOperator(op)) {
      throw new Error(`Unknown operator: ${op}`);
    }

    // Handle logical operators (and, or, not).
    if (isVariadicOperation(op)) {
      const expressions = list.slice(1).map((item) => {
        if (!Array.isArray(item)) {
          throw new Error(`Expected list for ${op} operand`);
        }
        return convertToTypedExpression(item);
      });
      return {
        op: op as LogicalOp,
        expressions,
      };
    }

    if (isMonadicOperation(op)) {
      if (list.length !== 2) {
        throw new Error(`${op} requires exactly one expression`);
      }
      const expr = list[1];
      switch (op) {
        case "not":
          if (!Array.isArray(expr)) {
            throw new Error("Expected list for not operand");
          }
          return {
            op: "not" as LogicalOp,
            expressions: [convertToTypedExpression(expr)],
          };
        case "exists":
          if (typeof expr !== "string") {
            throw new Error("Field must be a string for exists");
          }
          return {
            op: "exists" as Operation,
            field: expr,
          };
        default:
          assertNever(op);
      }
    }

    if (isDyadicOperation(op)) {
      // Binary operators: (op field value) or (op field (values...))
      if (list.length !== 3) {
        throw new Error(`${op} requires field and value(s)`);
      }
      const field = list[1];
      const valueOrValues = list[2];

      if (typeof field !== "string") {
        throw new Error(`Field must be a string for ${op}`);
      }

      // For array operators (has-all, has-any), expect an array of values.
      if (op === "has-all" || op === "has-any") {
        if (!Array.isArray(valueOrValues)) {
          throw new Error(`${op} requires a list of values`);
        }
        return {
          op: op as Operation,
          field,
          values: valueOrValues,
        };
      }

      // For single-value operators, accept either value or single-element array.
      return {
        op: op as Operation,
        field,
        value: valueOrValues,
      };
    }

    throw new Error(`Unknown operator: ${op}`);
  }

  skipWhitespace();
  if (expression[index] !== "(") {
    throw new Error("Expression must start with '('");
  }
  index++; // Skip opening paren.
  const list = parseList();

  return convertToTypedExpression(list);
}
