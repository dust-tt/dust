import get from "lodash/get";

// Type definitions for matcher expressions.
export type Operation = "in" | "contains";
export type LogicalOp = "and" | "or" | "not";

export type OperationExpression = {
  op: Operation;
  field: string;
  options: unknown[];
};

export type LogicalExpression = {
  op: LogicalOp;
  expressions: MatcherExpression[];
};

export type MatcherExpression = OperationExpression | LogicalExpression;

/**
 * Parses a Lisp-inspired matcher expression string into a structured format.
 *
 * @param expression - The Lisp-inspired expression string, e.g.:
 *   '(or (and (in "pr.author" ("adrien@dust.tt")) (contains "pr.reviewer.email" ("fabien@dust.tt"))))'
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

  function parseAtom(): string | number {
    skipWhitespace();
    if (expression[index] === '"') {
      return parseString();
    }
    // Parse symbol or number.
    let atom = "";
    while (index < expression.length && !/[\s()]/.test(expression[index])) {
      atom += expression[index];
      index++;
    }
    // Try to parse as number.
    const num = Number(atom);
    if (!isNaN(num)) {
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

    // Handle logical operators (and, or).
    if (op === "and" || op === "or") {
      const expressions = list.slice(1).map((item) => {
        if (!Array.isArray(item)) {
          throw new Error(`Expected list for ${op} operand`);
        }
        return convertToTypedExpression(item);
      });
      return {
        op,
        expressions,
      };
    }

    // Handle NOT as a logical operator that negates a single expression.
    if (op === "not") {
      if (list.length !== 2) {
        throw new Error("not requires exactly one expression");
      }
      const expr = list[1];
      if (!Array.isArray(expr)) {
        throw new Error("Expected list for not operand");
      }
      return {
        op: "not",
        expressions: [convertToTypedExpression(expr)],
      };
    }

    // Handle operation operators (in, contains).
    if (op === "in" || op === "contains") {
      if (list.length < 3) {
        throw new Error(`${op} requires field and options`);
      }
      const field = list[1];
      const options = list[2];

      if (typeof field !== "string") {
        throw new Error(`Field must be a string for ${op}`);
      }
      if (!Array.isArray(options)) {
        throw new Error(`Options must be a list for ${op}`);
      }

      return {
        op,
        field,
        options,
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

// Type guard functions.
export function isLogicalExpression(
  expr: MatcherExpression
): expr is LogicalExpression {
  return "expressions" in expr;
}

export function isOperationExpression(
  expr: MatcherExpression
): expr is OperationExpression {
  return "field" in expr && "options" in expr;
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

  // Handle comparison operators (in, contains).
  if (isOperationExpression(matcher)) {
    const fieldValue = get(payload, matcher.field);

    switch (matcher.op) {
      case "in":
        // Field should be one of the options in options array.
        return matcher.options.includes(fieldValue);

      case "contains":
        // Field should contain all of the options in options array.
        if (Array.isArray(fieldValue)) {
          return matcher.options.every((option) => fieldValue.includes(option));
        }
        // If field is a string, check if it contains the option string.
        if (typeof fieldValue === "string") {
          return matcher.options.every(
            (option) =>
              typeof option === "string" && fieldValue.includes(option)
          );
        }
        return false;
    }
  }

  return false;
}
