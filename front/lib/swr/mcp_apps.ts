import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { MCPAppSessionResponseType } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/mcp_apps/[sessionId]";
import type { LightWorkspaceType } from "@app/types";

export function useMCPAppSession({
  owner,
  conversationId,
  sessionId,
}: {
  owner: LightWorkspaceType;
  conversationId: string;
  sessionId: string | null;
}) {
  const sessionFetcher: Fetcher<MCPAppSessionResponseType> = fetcher;

  const swrKey =
    sessionId && conversationId
      ? `/api/w/${owner.sId}/assistant/conversations/${conversationId}/mcp_apps/${sessionId}`
      : null;

  const { data, error, isLoading } = useSWRWithDefaults(swrKey, sessionFetcher, {
    disabled: !sessionId,
    revalidateOnFocus: false,
  });

  return {
    session: data,
    isMCPAppSessionLoading: isLoading,
    mcpAppSessionError: error,
  };
}
