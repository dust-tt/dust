import { Err, Ok, type Result } from "@app/types/shared/result";
import { isNumber, isString } from "@app/types/shared/utils/general";
import { normalizeError } from "@extension/shared/lib/utils";
import type { Program } from "acorn";
import { type Expression, parse, type SpreadElement, type Super } from "acorn";

// The values a method argument can be: plain JSON-like data, nothing executable.
export type ExcelArg =
  | string
  | number
  | boolean
  | ExcelArg[]
  | { [key: string]: ExcelArg };

// One step of the expression after `workbook`: a property access or a method call.
// `workbook.worksheets.getItem('Sheet1')` gives the property `worksheets`, then the call
// `getItem('Sheet1')`.
export type Step =
  | { kind: "property"; name: string }
  | { kind: "call"; name: string; args: ExcelArg[] };

const LITERAL_ONLY =
  "only strings, numbers, booleans, and arrays and objects of them are allowed.";

/**
 * Turns the syntax tree of an expression into steps. Returns an error that explains why the
 * expression is not allowed.
 *
 * The tree is inside out: the last part of the text is the outer node, and `workbook` is the
 * deepest node. The function calls itself on the inner node, then adds the step of the current
 * node at the end.
 *
 * Example: `workbook.worksheets.getItem('Sheet1')` gives these steps:
 *   1. `{ kind: "property", name: "worksheets" }`
 *   2. `{ kind: "call", name: "getItem", args: ["Sheet1"] }`
 *
 * The acorn node types that this function uses:
 *   - `Identifier`: a name, for example `workbook`. `name` is the text of the name.
 *   - `MemberExpression`: a property access, for example `workbook.worksheets`.
 *     `object` is the part before the dot (`workbook`), and `property` is the part after it
 *     (`worksheets`). `computed` is true when the property is in brackets, for example
 *     `workbook['worksheets']`.
 *   - `CallExpression`: a function call, for example `worksheets.getItem('Sheet1')`.
 *     `callee` is the part that is called (`worksheets.getItem`), and `arguments` is the list of
 *     arguments (`'Sheet1'`).
 *   - `ChainExpression`: an expression that contains `?.`.
 *   - `AssignmentExpression`: an assignment, for example `range.values = 1`.
 */
function toSteps(node: Expression | Super): Result<Step[], string> {
  switch (node.type) {
    // The start of the path. The workbook is the start, so there are no steps yet.
    case "Identifier":
      return node.name === "workbook"
        ? new Ok([])
        : new Err('the expression must start with "workbook".');

    // A property, for example `workbook.worksheets`.
    case "MemberExpression": {
      if (node.computed || node.property.type !== "Identifier") {
        return new Err('brackets are not allowed, use "object.name".');
      }
      // Get the steps of the part before the dot (`object`).
      const steps = toSteps(node.object);
      if (steps.isErr()) {
        return steps;
      }
      return new Ok([
        ...steps.value,
        { kind: "property", name: node.property.name },
      ]);
    }

    // A method call, for example `workbook.worksheets.getItem('Sheet1')`.
    case "CallExpression": {
      // `callee` is the part before the parentheses. In `worksheets.getItem('Sheet1')`, it is
      // `worksheets.getItem`. It must be an object, a dot and a method name. The object gives
      // the steps before the call, and the allowlist can check the method name.
      // These examples are not allowed:
      //   - `getItem('Sheet1')`: there is no object.
      //   - `worksheets['getItem']('Sheet1')`: the method name is in brackets.
      //   - `a.b()()`: the second call has no method name. It calls the value that `a.b()` gives.
      const { callee } = node;
      if (
        callee.type !== "MemberExpression" ||
        callee.computed ||
        callee.property.type !== "Identifier"
      ) {
        return new Err(
          'only method calls on an object, as in "object.name(args)", are allowed.'
        );
      }
      const name = callee.property.name;
      const steps = toSteps(callee.object);
      if (steps.isErr()) {
        return steps;
      }
      // Each argument must be a literal.
      const args: ExcelArg[] = [];
      for (const [index, argument] of node.arguments.entries()) {
        const arg = toArg(argument);
        if (arg.isErr()) {
          return new Err(`argument ${index + 1} of "${name}": ${arg.error}`);
        }
        args.push(arg.value);
      }
      return new Ok([...steps.value, { kind: "call", name, args }]);
    }

    case "ChainExpression":
      return new Err('"?." is not allowed.');

    case "AssignmentExpression":
      return new Err("assignments are not allowed, only reads.");

    // All other syntax, for example `a + b` or `(a, b)`.
    default:
      return new Err('only "workbook.name.name(args)" is allowed.');
  }
}

/**
 * Returns the value of a literal argument, or an error that explains why the argument is not
 * allowed.
 *
 * It covers the arguments of the Excel API: `'Sheet1'`, `'A1:C10'`, `0`, `true`, and the
 * objects of calls such as `getCellProperties({ format: { fill: { color: true } } })`.
 *
 * The acorn node types that this function uses:
 *   - `Literal`: a fixed value written in the text, for example `'Sheet1'`, `1` or `true`.
 *     `value` is that value.
 *   - `UnaryExpression`: an operator before a value, for example `-1`. `operator` is the
 *     operator (`-`), and `argument` is the value after it (`1`).
 *   - `ArrayExpression`: an array, for example `['A1', 'B2']`. `elements` is the list of items.
 *   - `ObjectExpression`: an object, for example `{ completeMatch: true }`. `properties` is the
 *     list of its `key: value` pairs. Each pair is a `Property`, with a `key` and a `value`.
 */
function toArg(node: Expression | SpreadElement): Result<ExcelArg, string> {
  switch (node.type) {
    // `'Sheet1'`, `1`, `true`. A regex literal or `null` is not allowed.
    case "Literal":
      return isString(node.value) ||
        isNumber(node.value) ||
        typeof node.value === "boolean"
        ? new Ok(node.value)
        : new Err(LITERAL_ONLY);

    // `-1`, as in `getOffsetRange(-1, 0)`. The minus sign is a separate node before the number.
    case "UnaryExpression":
      return node.operator === "-" &&
        node.argument.type === "Literal" &&
        isNumber(node.argument.value)
        ? new Ok(-node.argument.value)
        : new Err(LITERAL_ONLY);

    // `['A1', 'B2']`. Each item must be a literal.
    case "ArrayExpression": {
      const items: ExcelArg[] = [];
      for (const element of node.elements) {
        // Acorn gives null for a hole in an array, as in `[1, , 2]`.
        if (element === null) {
          return new Err("an empty item in an array is not allowed.");
        }
        const item = toArg(element);
        if (item.isErr()) {
          return item;
        }
        items.push(item.value);
      }
      return new Ok(items);
    }

    // `{ key: value }` or `{ "key": value }`. Each value must be a literal.
    case "ObjectExpression": {
      const object: { [key: string]: ExcelArg } = {};
      for (const property of node.properties) {
        // A spread (`{ ...a }`), a getter or setter (`{ get a() {} }`), a method (`{ a() {} }`)
        // or a key in brackets (`{ [a]: 1 }`) is not allowed.
        if (
          property.type !== "Property" ||
          property.kind !== "init" ||
          property.method ||
          property.computed
        ) {
          return new Err('only "key: value" is allowed in objects.');
        }
        // The key can be a name (`{ a: 1 }`) or a string (`{ "a": 1 }`).
        const key =
          property.key.type === "Identifier"
            ? property.key.name
            : property.key.type === "Literal"
              ? property.key.value
              : null;
        if (!isString(key)) {
          return new Err("an object key must be a name or a string.");
        }
        // `__proto__` would set the prototype of the object, not add a key.
        if (key === "__proto__") {
          return new Err('the object key "__proto__" is not allowed.');
        }
        const value = toArg(property.value);
        if (value.isErr()) {
          return value;
        }
        object[key] = value.value;
      }
      return new Ok(object);
    }

    // All other syntax, for example a name (`sheetName`) or `'A' + '1'`.
    default:
      return new Err(LITERAL_ONLY);
  }
}

export function parseExpression(expression: string): Result<Step[], string> {
  let program: Program;
  try {
    program = parse(expression, { ecmaVersion: "latest" });
  } catch (error) {
    // acorn throws a SyntaxError with the position in its message.
    return new Err(normalizeError(error).message);
  }

  // The program must be exactly one statement, and that statement a bare expression:
  // not `let x = 1`, not `a; b`.
  const [statement, ...rest] = program.body;
  if (statement?.type !== "ExpressionStatement" || rest.length > 0) {
    return new Err("the input must be one expression.");
  }
  return toSteps(statement.expression);
}
