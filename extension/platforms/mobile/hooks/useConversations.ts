import { useCallback, useEffect, useState } from "react";

import { dustApi } from "@/lib/services/api";
import type { ConversationWithoutContent } from "@/lib/types/conversations";

interface UseConversationsState {
  conversations: ConversationWithoutContent[];
  isLoading: boolean;
  error: string | null;
  errorType: string | null;
}

interface UseConversationsResult extends UseConversationsState {
  refresh: () => Promise<void>;
}

export function useConversations(
  dustDomain: string | undefined,
  workspaceId: string | null | undefined
): UseConversationsResult {
  const [state, setState] = useState<UseConversationsState>({
    conversations: [],
    isLoading: false,
    error: null,
    errorType: null,
  });

  const fetchConversations = useCallback(async () => {
    if (!dustDomain || !workspaceId) {
      setState({
        conversations: [],
        isLoading: false,
        error: null,
        errorType: null,
      });
      return;
    }

    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
      errorType: null,
    }));

    const result = await dustApi.getConversations(dustDomain, workspaceId);

    if (result.isOk()) {
      setState({
        conversations: result.value,
        isLoading: false,
        error: null,
        errorType: null,
      });
    } else {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: result.error.message,
        errorType: result.error.type,
      }));
    }
  }, [dustDomain, workspaceId]);

  useEffect(() => {
    void fetchConversations();
  }, [fetchConversations]);

  return {
    ...state,
    refresh: fetchConversations,
  };
}
