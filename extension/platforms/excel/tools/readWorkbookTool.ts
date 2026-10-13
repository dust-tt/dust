import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlerResult } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import {
  parseExpression,
  type Step,
} from "@extension/platforms/excel/tools/parseExpression";
import { normalizeError } from "@extension/shared/lib/utils";

type WorkbookRead = { expression: string; load?: string[] | null };

type CheckedRead = { steps: Step[]; load: string[] };

/**
 * Placeholder: will check each step and each `load` property against an allowlist of the
 * read-only properties and methods of the Office.js Excel API. Until then, every step is accepted.
 */
function checkSteps(steps: Step[], load: string[]): Result<undefined, string> {
  return new Ok(undefined);
}

/**
 * Follows the steps from the workbook. Nothing is sent to Excel: the calls are only queued.
 *
 * Example: `workbook.worksheets.getItem('Sheet1')` gives the two steps
 * `{ kind: "property", name: "worksheets" }` and
 * `{ kind: "call", name: "getItem", args: ["Sheet1"] }`. So `value` is in turn the workbook,
 * then `workbook.worksheets`, then `worksheets.getItem('Sheet1')`.
 */
function walkSteps(
  workbook: Excel.Workbook,
  steps: Step[]
): Result<unknown, string> {
  let value: unknown = workbook;
  for (const step of steps) {
    if (typeof value !== "object" || value === null) {
      return new Err(
        `cannot get "${step.name}" on a value that is not an object.`
      );
    }
    // The property to return, or the method to call: `worksheets`, or `getItem`.
    const member: unknown = Reflect.get(value, step.name);
    switch (step.kind) {
      case "property":
        value = member;
        break;
      case "call":
        if (typeof member !== "function") {
          return new Err(`"${step.name}" is not a method.`);
        }
        // `Reflect.apply(getItem, worksheets, ['Sheet1'])` is `worksheets.getItem('Sheet1')`.
        value = Reflect.apply(member, value, step.args);
        break;
      default:
        assertNever(step);
    }
  }
  return new Ok(value);
}

// An Office.js proxy object that can be loaded: every Office.js object (Range, Worksheet,
// collections...) extends `ClientObject`, and in Excel they all have `load` and `toJSON` —
// the base type just does not declare them, each subclass does.
type LoadableClientObject = OfficeExtension.ClientObject & {
  load: (properties: string[]) => void;
  toJSON: () => unknown;
};

function isLoadableClientObject(value: unknown): value is LoadableClientObject {
  return (
    value instanceof OfficeExtension.ClientObject &&
    "load" in value &&
    typeof value.load === "function" &&
    "toJSON" in value &&
    typeof value.toJSON === "function"
  );
}

/**
 * Queues the load of the properties, and returns a function to read the value after
 * `context.sync()`. The value cannot be read now: Office.js objects are empty proxies until
 * the sync fills them.
 *
 * Example: for a Range with `load: ["values"]`, it queues `range.load(["values"])` and returns
 * `() => range.toJSON()`, which after the sync gives `{ values: [[...]] }`.
 */
function queueLoad(
  value: unknown,
  load: string[]
): Result<() => unknown, string> {
  // Methods such as `getCount()` give a `ClientResult`: there is nothing to load, its `.value`
  // is just read after the sync.
  if (value instanceof OfficeExtension.ClientResult) {
    return new Ok(() => value.value);
  }
  // Anything else (e.g. the expression ended on a plain value) cannot be loaded.
  if (!isLoadableClientObject(value)) {
    return new Err("the expression does not give an Office.js object.");
  }
  value.load(load);
  return new Ok(() => value.toJSON());
}

/**
 * Phase 1, outside Excel.run: parses and checks every read. Nothing touches Excel yet.
 */
function checkReads(reads: WorkbookRead[]): Result<CheckedRead[], string> {
  const checked: CheckedRead[] = [];
  for (const [index, { expression, load }] of reads.entries()) {
    const steps = parseExpression(expression);
    if (steps.isErr()) {
      return new Err(`Read ${index}: invalid expression: ${steps.error}`);
    }
    const check = checkSteps(steps.value, load ?? []);
    if (check.isErr()) {
      return new Err(`Read ${index}: ${check.error}`);
    }
    checked.push({ steps: steps.value, load: load ?? [] });
  }
  return new Ok(checked);
}

/**
 * Phase 2, inside Excel.run: walks every read and queues its loads. Still one batch, nothing
 * sent. Returns one reader per read, to call after `context.sync()`.
 */
function queueReads(
  workbook: Excel.Workbook,
  checked: CheckedRead[]
): Result<(() => unknown)[], string> {
  const readers: (() => unknown)[] = [];
  for (const [index, { steps, load }] of checked.entries()) {
    const value = walkSteps(workbook, steps);
    if (value.isErr()) {
      return new Err(`Read ${index}: ${value.error}`);
    }
    const reader = queueLoad(value.value, load);
    if (reader.isErr()) {
      return new Err(`Read ${index}: ${reader.error}`);
    }
    readers.push(reader.value);
  }
  return new Ok(readers);
}

export async function readWorkbookTool({
  reads,
}: {
  reads: WorkbookRead[];
}): Promise<ToolHandlerResult> {
  const checked = checkReads(reads);
  if (checked.isErr()) {
    return new Err(new MCPError(checked.error));
  }

  try {
    const result = await Excel.run(async (context) => {
      const readers = queueReads(context.workbook, checked.value);
      if (readers.isErr()) {
        return new Err(readers.error);
      }
      // Phase 3: one round trip to Excel fills everything, then the readers give the values.
      await context.sync();
      return new Ok(JSON.stringify(readers.value.map((read) => read())));
    });
    if (result.isErr()) {
      return new Err(new MCPError(result.error));
    }
    return new Ok([{ type: "text", text: result.value }]);
  } catch (error) {
    // Office.js rejects with an OfficeExtension.Error, e.g. `ItemNotFound` for an unknown sheet.
    return new Err(
      new MCPError(
        `Failed to read the workbook: ${normalizeError(error).message}`
      )
    );
  }
}
