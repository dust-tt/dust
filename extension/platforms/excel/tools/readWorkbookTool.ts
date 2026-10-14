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

// An Office.js proxy object that can be loaded: every Office.js object (Range, Worksheet,
// collections...) extends `ClientObject`, and in Excel they all have `load` and `toJSON` —
// the base type just does not declare them, each subclass does.
type LoadableClientObject = OfficeExtension.ClientObject & {
  load: (properties: string[]) => void;
  toJSON: () => unknown;
};

// What an expression points to: an Office.js object that can be loaded (a Range, a Worksheet, a
// collection...), or a `ClientResult` from a method that gives a value directly (such as
// `getCount()`).
type ReadTarget = LoadableClientObject | OfficeExtension.ClientResult<unknown>;

function isLoadableClientObject(value: unknown): value is LoadableClientObject {
  return (
    value instanceof OfficeExtension.ClientObject &&
    "load" in value &&
    typeof value.load === "function" &&
    "toJSON" in value &&
    typeof value.toJSON === "function"
  );
}

function isReadTarget(value: unknown): value is ReadTarget {
  return (
    isLoadableClientObject(value) ||
    value instanceof OfficeExtension.ClientResult
  );
}

/**
 * TODO(office_addin): check each step and each `load` property against an allowlist of the
 * read-only properties and methods of the Office.js Excel API. Until then, every step is accepted.
 */
function checkSteps(steps: Step[], load: string[]): Result<undefined, string> {
  return new Ok(undefined);
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
 * Gets the Office.js object that the steps point to. It starts at the workbook and does one step
 * at a time.
 *
 * Example. `parseExpression` turns `workbook.worksheets.getItem('Sheet1')` into these steps:
 *   1. `{ kind: "property", name: "worksheets" }`
 *   2. `{ kind: "call", name: "getItem", args: ["Sheet1"] }`
 * This function then does:
 *   - At the start, `current` is the workbook.
 *   - Step 1 gets the property `worksheets` of the workbook. `current` is the worksheet collection.
 *   - Step 2 calls `getItem("Sheet1")` on the collection. `current` is the worksheet `Sheet1`.
 *
 * Why the tool does not run the text of the expression:
 * For an allowed expression, the result is the same. But to run the text, the JavaScript engine
 * must parse it again, and the check was done on the parse of `parseExpression`. If the two
 * parses do not agree on an input, code that the check did not see can run. Here, the tool runs
 * only the steps, which are the data that the check accepted. Thus, no other code can run.
 *
 * Nothing goes to Excel here. An Office.js call only adds a command to a queue, and
 * `context.sync()` sends the queue later.
 *
 * `Reflect.get` and `Reflect.apply` can give any value, so `current` is `unknown` in the loop. The
 * loop checks that each step starts from an Office.js object, and that the last value is an
 * Office.js object or a `ClientResult`.
 */
function resolveTarget(
  workbook: Excel.Workbook,
  steps: Step[]
): Result<ReadTarget, string> {
  let current: unknown = workbook;
  for (const step of steps) {
    // `Reflect.get` needs an object. After the allowlist check, this check does not fail.
    if (!(current instanceof OfficeExtension.ClientObject)) {
      return new Err(
        `cannot get "${step.name}" on a value that is not an Office.js object.`
      );
    }
    // Gets the member by its name: the property to return (`worksheets`), or the method to call
    // (`getItem`). `Reflect.get(workbook, "worksheets")` is `workbook.worksheets`.
    const member: unknown = Reflect.get(current, step.name);
    switch (step.kind) {
      case "property":
        current = member;
        break;
      case "call":
        if (typeof member !== "function") {
          return new Err(`"${step.name}" is not a method.`);
        }
        // `Reflect.apply(getItem, worksheets, ["Sheet1"])` is `worksheets.getItem("Sheet1")`.
        // The second argument is the object that the method runs on.
        current = Reflect.apply(member, current, step.args);
        break;
      default:
        assertNever(step);
    }
  }
  if (!isReadTarget(current)) {
    return new Err("the expression does not give an Office.js object.");
  }
  return new Ok(current);
}

/**
 * Queues the load of the properties. The values cannot be read now: Office.js objects are empty
 * proxies until `context.sync()` fills them. Use `readValue` after the sync.
 *
 * Example: for a Range with `load: ["values"]`, it queues `range.load(["values"])` and returns
 * the range.
 */
function queueLoad(
  value: ReadTarget,
  load: string[]
): Result<ReadTarget, string> {
  // Methods such as `getCount()` give a `ClientResult`: there is nothing to load.
  if (value instanceof OfficeExtension.ClientResult) {
    return new Ok(value);
  }
  // `load([])` could load all the properties of the object, which can be very large.
  if (load.length === 0) {
    return new Err("give the properties to load for this object.");
  }
  value.load(load);
  return new Ok(value);
}

/**
 * Phase 2, inside Excel.run: resolves the target of every read and queues its loads. Still one batch, nothing
 * sent. Returns one queued read per read, to give to `readValue` after `context.sync()`.
 */
function queueReads(
  workbook: Excel.Workbook,
  checked: CheckedRead[]
): Result<ReadTarget[], string> {
  const queued: ReadTarget[] = [];
  for (const [index, { steps, load }] of checked.entries()) {
    const target = resolveTarget(workbook, steps);
    if (target.isErr()) {
      return new Err(`Read ${index}: ${target.error}`);
    }
    const read = queueLoad(target.value, load);
    if (read.isErr()) {
      return new Err(`Read ${index}: ${read.error}`);
    }
    queued.push(read.value);
  }
  return new Ok(queued);
}

/**
 * After `context.sync()`, gets the value of a read. Example: `{ values: [[...]] }` for a Range
 * with `load: ["values"]`.
 */
function readValue(read: ReadTarget): unknown {
  return read instanceof OfficeExtension.ClientResult
    ? read.value
    : read.toJSON();
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
      const queued = queueReads(context.workbook, checked.value);
      if (queued.isErr()) {
        return new Err(queued.error);
      }
      // Phase 3: one round trip to Excel fills everything, then `readValue` gets the values.
      await context.sync();
      return new Ok(JSON.stringify(queued.value.map(readValue)));
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
