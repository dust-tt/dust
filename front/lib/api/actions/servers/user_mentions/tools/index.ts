// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { DustAPI } from "@dust-tt/client";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  GET_MENTION_MARKDOWN_TOOL_NAME,
  SEARCH_AVAILABLE_USERS_TOOL_NAME,
  USER_MENTIONS_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/user_mentions/metadata";
import config from "@app/lib/api/config";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import { serializeMention } from "@app/lib/mentions/format";
import logger from "@app/logger/logger";
import { Err, Ok } from "@app/types/shared/result";
import { getHeaderFromUserEmail } from "@app/types/user";

const handlers: ToolHandlers<typeof USER_MENTIONS_TOOLS_METADATA> = {
  [SEARCH_AVAILABLE_USERS_TOOL_NAME]: async (
    { searchTerm },
    { auth, agentLoopContext }
  ) => {
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
      conversationId: agentLoopContext?.runContext?.conversation?.sId,
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

export const TOOLS = buildTools(USER_MENTIONS_TOOLS_METADATA, handlers);
