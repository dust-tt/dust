import type { DustAPI } from "@dust-tt/client";
import { useMemo } from "react";

import { createConversationFetcher } from "@app/shared/lib/fetchers";
import type { ConversationKey } from "@app/shared/lib/hook-types";

/**
 * Core logic for useConversation hook.
 * Returns the SWR key and fetcher function for a single conversation.
 * The actual SWR call must be made in platform-specific code to avoid
 * React context mismatches between different SWR package instances.
 */
export function useConversationCore(
  dustAPI: DustAPI | null,
  conversationId: string | null
) {
  const swrKey: ConversationKey =
    dustAPI && conversationId
      ? ["getConversation", dustAPI.workspaceId(), { conversationId }]
      : null;

  const fetcher = useMemo(() => createConversationFetcher(dustAPI), [dustAPI]);

  return { swrKey, fetcher };
}
