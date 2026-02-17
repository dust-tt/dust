import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { COMMON_UTILITIES_TOOLS_METADATA } from "@app/lib/api/actions/servers/common_utilities/metadata";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { compile } from "mathjs";

const RANDOM_INTEGER_DEFAULT_MAX = 1_000_000;

const handlers: ToolHandlers<typeof COMMON_UTILITIES_TOOLS_METADATA> = {
  generate_random_number: async ({ max }, _extra) => {
    const upperBound = max ?? RANDOM_INTEGER_DEFAULT_MAX;
    const value = Math.floor(Math.random() * upperBound) + 1;

    return new Ok([
      {
        type: "text",
        text: `Random number (1-${upperBound}): ${value}`,
      },
    ]);
  },

  generate_random_float: async (_params, _extra) => {
    const value = Math.random();

    return new Ok([
      {
        type: "text",
        text: `Random float: ${value}`,
      },
    ]);
  },

  wait: async ({ duration_ms }, _extra) => {
    await new Promise((resolve) => setTimeout(resolve, duration_ms));

    return new Ok([
      {
        type: "text",
        text: `Waited for ${duration_ms} milliseconds.`,
      },
    ]);
  },

  get_current_time: async ({ include_formats }, _extra) => {
    const now = new Date();
    const formats = new Set(
      include_formats ?? ["iso", "utc", "timestamp", "locale"]
    );

    const parts: string[] = [];
    if (formats.has("iso")) {
      parts.push(`ISO: ${now.toISOString()}`);
    }
    if (formats.has("utc")) {
      parts.push(`UTC: ${now.toUTCString()}`);
    }
    if (formats.has("timestamp")) {
      parts.push(`UNIX (ms): ${now.getTime()}`);
    }
    if (formats.has("locale")) {
      const dayOfWeek = now.toLocaleDateString("en-US", {
        weekday: "long",
      });
      parts.push(`Locale: ${now.toLocaleString()} (${dayOfWeek})`);
    }

    return new Ok([
      {
        type: "text",
        text: parts.join("\n"),
      },
    ]);
  },

  math_operation: async ({ expression }, _extra) => {
    const evalFunction = compile(expression);
    try {
      const result = evalFunction.evaluate();
      return new Ok([
        {
          type: "text",
          text: result.toString(),
        },
      ]);
    } catch (e) {
      const cause = normalizeError(e);
      return new Err(
        new MCPError(`Error evaluating math expression: ${cause.message}`, {
          cause,
        })
      );
    }
  },
};

export const TOOLS = buildTools(COMMON_UTILITIES_TOOLS_METADATA, handlers);
