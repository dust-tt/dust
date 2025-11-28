import {
  isDyadicOperation,
  isMonadicOperation,
  isOperator,
  isVariadicOperation,
} from "@app/lib/matcher/types";
import { assertNever } from "@app/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

import type { LogicalOp, MatcherExpression, Operation } from "./types";

type ParserState = {
  expression: string;
  index: number;
};

function checkBalancedParentheses(expression: string): Result<void, Error> {
  let openParentheses = 0;
  for (let i = 0; i < expression.length; i++) {
    if (expression[i] === "(") {
      openParentheses++;
    } else if (expression[i] === ")") {
      openParentheses--;
    }
  }
  if (openParentheses !== 0) {
    return new Err(new Error("Unbalanced parentheses"));
  }
  return new Ok(undefined);
}

function skipWhitespace(state: ParserState): void {
  while (
    state.index < state.expression.length &&
    /\s/.test(state.expression[state.index])
  ) {
    state.index++;
  }
}

function parseString(state: ParserState): Result<string, Error> {
  if (state.expression[state.index] !== '"') {
    return new Err(new Error(`Expected '"' at position ${state.index}`));
  }
  state.index++; // Skip opening quote.
  let str = "";
  while (
    state.index < state.expression.length &&
    state.expression[state.index] !== '"'
  ) {
    if (state.expression[state.index] === "\\") {
      state.index++;
      if (state.index >= state.expression.length) {
        return new Err(new Error("Unexpected end of string"));
      }
    }
    str += state.expression[state.index];
    state.index++;
  }
  if (state.expression[state.index] !== '"') {
    return new Err(
      new Error(`Expected closing '"' at position ${state.index}`)
    );
  }
  state.index++; // Skip closing quote.
  return new Ok(str);
}

function parseAtom(
  state: ParserState
): Result<string | number | boolean | null, Error> {
  skipWhitespace(state);
  if (state.expression[state.index] === '"') {
    return parseString(state);
  }
  // Parse symbol, number, or boolean.
  let atom = "";
  while (
    state.index < state.expression.length &&
    !/[\s()]/.test(state.expression[state.index])
  ) {
    atom += state.expression[state.index];
    state.index++;
  }
  // Try to parse as boolean.
  if (atom === "true") {
    return new Ok(true);
  }
  if (atom === "false") {
    return new Ok(false);
  }
  // Try to parse as null.
  if (atom === "null") {
    return new Ok(null);
  }
  // Try to parse as number.
  const num = Number(atom);
  if (!isNaN(num) && atom !== "") {
    return new Ok(num);
  }
  return new Ok(atom);
}

function parseList(state: ParserState): Result<unknown[], Error> {
  const result: unknown[] = [];
  skipWhitespace(state);
  while (state.expression[state.index] !== ")") {
    if (state.expression[state.index] === "(") {
      state.index++; // Skip opening paren.
      const listResult = parseList(state);
      if (listResult.isErr()) {
        return listResult;
      }
      result.push(listResult.value);
    } else {
      const atomResult = parseAtom(state);
      if (atomResult.isErr()) {
        return atomResult;
      }
      result.push(atomResult.value);
    }
    skipWhitespace(state);
  }
  state.index++; // Skip closing paren.
  return new Ok(result);
}

function handleVariadicOperation(
  op: "and" | "or",
  list: unknown[]
): Result<MatcherExpression, Error> {
  const expressions: MatcherExpression[] = [];
  for (const item of list.slice(1)) {
    if (!Array.isArray(item)) {
      return new Err(new Error(`Expected list for ${op} operand`));
    }
    const exprResult = convertToTypedExpression(item);
    if (exprResult.isErr()) {
      return exprResult;
    }
    expressions.push(exprResult.value);
  }
  return new Ok({
    op: op as LogicalOp,
    expressions,
  });
}

function handleMonadicOperation(
  op: "exists" | "not",
  list: unknown[]
): Result<MatcherExpression, Error> {
  if (list.length !== 2) {
    return new Err(new Error(`${op} requires exactly one expression`));
  }
  const expr = list[1];

  switch (op) {
    case "not":
      if (!Array.isArray(expr)) {
        return new Err(new Error("Expected list for not operand"));
      }
      const notExprResult = convertToTypedExpression(expr);
      if (notExprResult.isErr()) {
        return notExprResult;
      }
      return new Ok({
        op: "not" as LogicalOp,
        expressions: [notExprResult.value],
      });
    case "exists":
      if (typeof expr !== "string") {
        return new Err(new Error("Field must be a string for exists"));
      }
      return new Ok({
        op: "exists" as Operation,
        field: expr,
      });
    default:
      assertNever(op);
  }
}

function handleDyadicOperation(
  op: Operation | LogicalOp,
  list: unknown[]
): Result<MatcherExpression, Error> {
  if (list.length !== 3) {
    return new Err(new Error(`${op} requires field and value(s)`));
  }
  const field = list[1];
  const valueOrValues = list[2];

  if (typeof field !== "string") {
    return new Err(new Error(`Field must be a string for ${op}`));
  }

  // For array operators (has-all, has-any), expect an array of values.
  if (op === "has-all" || op === "has-any") {
    if (!Array.isArray(valueOrValues)) {
      return new Err(new Error(`${op} requires a list of values`));
    }
    return new Ok({
      op: op as Operation,
      field,
      values: valueOrValues,
    });
  }

  // For single-value operators, accept either value or single-element array.
  return new Ok({
    op: op as Operation,
    field,
    value: valueOrValues,
  });
}

function convertToTypedExpression(
  list: unknown[]
): Result<MatcherExpression, Error> {
  if (list.length === 0) {
    return new Err(new Error("Empty expression"));
  }

  const op = list[0];

  if (!isOperator(op)) {
    return new Err(new Error(`Unknown operator: ${op}`));
  }

  if (isVariadicOperation(op)) {
    return handleVariadicOperation(op, list);
  }

  if (isMonadicOperation(op)) {
    return handleMonadicOperation(op, list);
  }

  if (isDyadicOperation(op)) {
    return handleDyadicOperation(op, list);
  }

  return new Err(new Error(`Unknown operator: ${op}`));
}

/**
 * Parses a Lisp-inspired matcher expression string into a structured format.
 *
 * @param expression - The Lisp-inspired expression string, e.g.:
 *   '(or (and (eq "pr.author" "adrien@dust.tt") (has "pr.labels" "bug")))'
 * @returns Result containing parsed matcher expression or Error if the expression is invalid
 */
export function parseMatcherExpression(
  expression: string
): Result<MatcherExpression, Error> {
  const balanceCheck = checkBalancedParentheses(expression);
  if (balanceCheck.isErr()) {
    return balanceCheck;
  }

  const state: ParserState = { expression, index: 0 };

  skipWhitespace(state);
  if (state.expression[state.index] !== "(") {
    return new Err(new Error("Expression must start with '('"));
  }
  state.index++; // Skip opening paren.

  const listResult = parseList(state);
  if (listResult.isErr()) {
    return listResult;
  }

  return convertToTypedExpression(listResult.value);
}
