import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlerResult } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { normalizeError } from "@extension/shared/lib/utils";

/**
 * Placeholder: will be implemented later. The expression will be parsed and checked against an
 * allowlist of the read-only properties and methods of the Office.js Excel API, so it can only
 * read the workbook: never change it, and never escape the API. Until then, every expression
 * is accepted.
 */
function checkReadOnly(expression: string): Result<undefined, string> {
  if (!expression.trim().startsWith("workbook")) {
    return new Err("The expression must start with `workbook`.");
  }
  return new Ok(undefined);
}

/**
 * Placeholder: will be implemented later.
 */
function evaluateExpression(
  workbook: Excel.Workbook,
  expression: string
): Excel.Workbook {
  return new Function("workbook", `"use strict"; return ${expression};`)(
    workbook
  );
}

type WorkbookRead = { expression: string; load?: string[] | null };

export async function readWorkbookTool({
  reads,
}: {
  reads: WorkbookRead[];
}): Promise<ToolHandlerResult> {
  for (const [index, { expression }] of reads.entries()) {
    const check = checkReadOnly(expression);
    if (check.isErr()) {
      return new Err(new MCPError(`Read ${index}: ${check.error}`));
    }
  }

  try {
    const text = await Excel.run(async (context) => {
      const objects = reads.map(({ expression, load }) => {
        const object = evaluateExpression(context.workbook, expression);
        if (load) {
          object.load(load);
        }
        return object;
      });
      await context.sync();
      return JSON.stringify(
        objects.map((object) =>
          // Methods such as `getCount()` give a `ClientResult`: its value is read after the
          // sync, there is nothing to load.
          object instanceof OfficeExtension.ClientResult
            ? object.value
            : object.toJSON()
        )
      );
    });
    return new Ok([{ type: "text", text }]);
  } catch (error) {
    // Office.js rejects with an OfficeExtension.Error, e.g. `ItemNotFound` for an unknown sheet.
    return new Err(
      new MCPError(
        `Failed to read the workbook: ${normalizeError(error).message}`
      )
    );
  }
}
