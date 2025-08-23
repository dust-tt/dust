import assert from "assert";

import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";

export function makePersonalAuthenticationError({
  serverInfo,
}: {
  serverInfo: InternalMCPServerDefinitionType;
}) {
  assert(
    serverInfo.authorization?.provider,
    "MCP server does not require a personal authentication."
  );

  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          __dust_auth_required: {
            provider: serverInfo.authorization.provider,
          },
        }),
      },
    ],
  };
}
