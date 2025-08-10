import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";

export function makePersonalAuthenticationError({
  serverInfo,
}: {
  serverInfo: InternalMCPServerDefinitionType & {
    authorization: AuthorizationInfo;
  };
}) {
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
