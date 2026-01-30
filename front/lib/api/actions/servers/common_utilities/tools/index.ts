// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { DustAPI } from "@dust-tt/client";
import { compile } from "mathjs";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  GET_MENTION_MARKDOWN_TOOL_NAME,
  SEARCH_AVAILABLE_USERS_TOOL_NAME,
} from "@app/lib/api/actions/servers/common_utilities/metadata";
import { COMMON_UTILITIES_TOOLS_METADATA } from "@app/lib/api/actions/servers/common_utilities/metadata";
import config from "@app/lib/api/config";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import { serializeMention } from "@app/lib/mentions/format";
import logger from "@app/logger/logger";
import { Err, getHeaderFromUserEmail, normalizeError, Ok } from "@app/types";

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

  [SEARCH_AVAILABLE_USERS_TOOL_NAME]: async ({ searchTerm }, extra) => {
    const auth = extra.auth;
    if (!auth) {
      return new Err(new MCPError("Authentication required"));
    }

    const user = auth.user();
    const prodCredentials = await prodAPICredentialsForOwner(
      auth.getNonNullableWorkspace()
    );
    const api = new DustAPI(
      config.getDustAPIConfig(),
      {
        ...prodCredentials,
        extraHeaders: {
          // We use a system API key to override the user here (not groups and role) so that the
          // sub-agent can access the same spaces as the user but also as the sub-agent may rely
          // on personal actions that have to be operated in the name of the user initiating the
          // interaction.
          ...getHeaderFromUserEmail(user?.email),
        },
      },
      logger
    );

    const r = await api.getMentionsSuggestions({
      query: searchTerm,
      select: ["users"],
      conversationId: extra.agentLoopContext?.runContext?.conversation?.sId,
    });

    if (r.isErr()) {
      return new Err(
        new MCPError(`Error getting mentions suggestions: ${r.error.message}`, {
          cause: r.error,
        })
      );
    }

    const suggestions = r.value;

    return new Ok([
      {
        type: "text",
        text: JSON.stringify(suggestions),
      },
    ]);
  },

  [GET_MENTION_MARKDOWN_TOOL_NAME]: async ({ mention }, _extra) => {
    return new Ok([
      {
        type: "text",
        text: serializeMention({
          id: mention.id,
          label: mention.label,
          type: "user",
        }),
      },
    ]);
  },
};

export const TOOLS = buildTools(COMMON_UTILITIES_TOOLS_METADATA, handlers);
