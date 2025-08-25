import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { INTERNAL_MCP_SERVERS } from "@app/lib/actions/mcp_internal_actions/constants";

// Type that extracts server names where authorization is not null.
type ServersWithAuthorization = {
  [K in InternalMCPServerNameType]: (typeof INTERNAL_MCP_SERVERS)[K]["serverInfo"]["authorization"] extends null
    ? never
    : K;
}[InternalMCPServerNameType];

export function makePersonalAuthenticationError(
  serverName: ServersWithAuthorization
) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          __dust_auth_required: {
            provider:
              INTERNAL_MCP_SERVERS[serverName].serverInfo.authorization
                .provider,
          },
        }),
      },
    ],
  };
}
