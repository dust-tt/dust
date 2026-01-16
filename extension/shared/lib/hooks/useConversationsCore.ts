import type { DustAPI } from "@dust-tt/client";
import { useMemo } from "react";

import { createConversationsFetcher } from "@app/shared/lib/fetchers";
import type { ConversationsKey } from "@app/shared/lib/hook-types";

/**
 * Core logic for useConversations hook.
 * Returns the SWR key and fetcher function for conversations list.
 * The actual SWR call must be made in platform-specific code to avoid
 * React context mismatches between different SWR package instances.
 */
export function useConversationsCore(dustAPI: DustAPI | null) {
  const swrKey: ConversationsKey = dustAPI
    ? ["getConversations", dustAPI.workspaceId()]
    : null;

  const fetcher = useMemo(
    () => createConversationsFetcher(dustAPI),
    [dustAPI]
  );

  return { swrKey, fetcher };
}
