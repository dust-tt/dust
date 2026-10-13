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

// The one error message for everything outside the grammar.
const UNSUPPORTED =
  "only `workbook.name.name(args)` is allowed, with literal arguments: strings, numbers, booleans, arrays and objects.";

// Returns the items when none is null, else null: propagates one rejected item out of a list.
function allOrNull<T>(items: (T | null)[]): T[] | null {
  return items.every((item): item is T => item !== null) ? items : null;
}

/**
 * Turns an Office.js expression into its steps. Returns null for anything else.
 *
 * `workbook.worksheets.getItem('Sheet1').getRange('A1:C10')` gives the steps `worksheets`,
 * `getItem('Sheet1')` and `getRange('A1:C10')`.
 */
function toSteps(node: Expression | Super): Step[] | null {
  // The start of the expression: only the name `workbook` is accepted. `context.workbook`
  // and `Excel.run(...)` are rejected: the expression starts at the workbook itself.
  if (node.type === "Identifier") {
    return node.name === "workbook" ? [] : null;
  }
  // `object.name`, as in `workbook.worksheets` or `workbook.tables` — `computed` would be
  // `object[name]`, as in `workbook.worksheets['Sheet1']`, with an arbitrary expression as the
  // name, so it is rejected.
  if (
    node.type === "MemberExpression" &&
    !node.computed &&
    node.property.type === "Identifier"
  ) {
    // Recurse on what is left of the dot; null (a rejection) propagates up.
    const steps = toSteps(node.object);
    return steps && [...steps, { kind: "property", name: node.property.name }];
  }
  // `object.name(args)`, as in `workbook.getSelectedRange()` or
  // `workbook.worksheets.getItem('Sheet1')` — the callee must itself be a plain `object.name`.
  if (
    node.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.property.type === "Identifier"
  ) {
    const steps = toSteps(node.callee.object);
    // Every argument must be a literal; one bad argument rejects the whole expression.
    const args = allOrNull(node.arguments.map(toArg));
    return (
      steps &&
      args && [
        ...steps,
        { kind: "call", name: node.callee.property.name, args },
      ]
    );
  }
  // Anything else — operators, assignments, `a?.b`, template strings, bare calls — is rejected.
  // So `workbook.worksheets.getItem(sheetName)` (a name, not a literal),
  // `workbook.worksheets?.getItem('Sheet1')` and
  // `workbook.getSelectedRange().values = 1` (a write) all give null.
  return null;
}

/**
 * Returns the value of a literal argument. Returns null for anything else.
 *
 * It covers the arguments of the Excel API: `'Sheet1'`, `'A1:C10'`, `0`, `true`, and the
 * objects of calls such as `getCellProperties({ format: { fill: { color: true } } })`.
 */
function toArg(node: Expression | SpreadElement | null): ExcelArg | null {
  // Acorn gives null for a hole in an array, as in `[1, , 2]`.
  if (!node) {
    return null;
  }
  switch (node.type) {
    // `'Sheet1'`, `1`, `true`. For a regex literal or `null`, `node.value` is not one of the three
    // types, so it is rejected.
    case "Literal":
      return isString(node.value) ||
        isNumber(node.value) ||
        typeof node.value === "boolean"
        ? node.value
        : null;
    // `-1`, as in `getOffsetRange(-1, 0)`: a minus sign is its own AST node in front of the
    // number.
    case "UnaryExpression":
      return node.operator === "-" &&
        node.argument.type === "Literal" &&
        isNumber(node.argument.value)
        ? -node.argument.value
        : null;
    // `[a, b]`: every element must itself be a literal argument.
    case "ArrayExpression":
      return allOrNull(node.elements.map(toArg));
    // `{ key: value }` or `{ "key": value }`
    case "ObjectExpression": {
      const object: { [key: string]: ExcelArg } = {};
      for (const property of node.properties) {
        // Rejects spreads (`{...a}`) and getters/setters (`{get a() {}}`).
        if (property.type !== "Property" || property.kind !== "init") {
          return null;
        }
        // The key can be a name (`{a: 1}`) or a string (`{"a": 1}`), nothing else.
        const key =
          property.key.type === "Identifier"
            ? property.key.name
            : property.key.type === "Literal"
              ? property.key.value
              : null;
        const value = toArg(property.value);
        // `__proto__` would set the prototype of the object, not add a key.
        // `computed` is `{[a]: 1}`, `method` is `{a() {}}`: both are rejected.
        if (
          !isString(key) ||
          key === "__proto__" ||
          property.computed ||
          property.method ||
          value === null
        ) {
          return null;
        }
        object[key] = value;
      }
      return object;
    }
    default:
      return null;
  }
}

/**
 * @cc [owner:matteotrab,label:security] excel-expression-data-only
 * `parseExpression` MUST only turn the expression into steps made of names and literal arguments.
 * It MUST NOT evaluate the expression or any part of it. The expression MUST be a single
 * expression that starts with `workbook`, and contains only non-computed property accesses and
 * method calls whose arguments are literals: strings, numbers, booleans, or arrays and objects of
 * them.
 */
export function parseExpression(expression: string): Result<Step[], string> {
  let program: Program;
  try {
    program = parse(expression, { ecmaVersion: 2020 });
  } catch (error) {
    // acorn throws a SyntaxError with the position in its message.
    return new Err(normalizeError(error).message);
  }

  // The program must be exactly one statement, and that statement a bare expression:
  // not `let x = 1`, not `a; b`.
  const [statement, ...rest] = program.body;
  const steps =
    statement?.type === "ExpressionStatement" && rest.length === 0
      ? toSteps(statement.expression)
      : null;
  if (!steps) {
    return new Err(UNSUPPORTED);
  }
  return new Ok(steps);
}
