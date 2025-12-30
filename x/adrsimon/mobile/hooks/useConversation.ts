import { useCallback, useEffect, useState } from "react";

import { dustApi } from "@/lib/services/api";
import type { ConversationWithContent } from "@/lib/types/conversations";

interface UseConversationState {
  conversation: ConversationWithContent | null;
  isLoading: boolean;
  error: string | null;
  errorType: string | null;
}

interface UseConversationResult extends UseConversationState {
  refresh: () => Promise<void>;
}

export function useConversation(
  dustDomain: string | undefined,
  workspaceId: string | null | undefined,
  conversationId: string | undefined
): UseConversationResult {
  const [state, setState] = useState<UseConversationState>({
    conversation: null,
    isLoading: false,
    error: null,
    errorType: null,
  });

  const fetchConversation = useCallback(async () => {
    if (!dustDomain || !workspaceId || !conversationId) {
      setState({
        conversation: null,
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

    const result = await dustApi.getConversation(
      dustDomain,
      workspaceId,
      conversationId
    );

    if (result.isOk) {
      setState({
        conversation: result.value,
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
  }, [dustDomain, workspaceId, conversationId]);

  useEffect(() => {
    void fetchConversation();
  }, [fetchConversation]);

  return {
    ...state,
    refresh: fetchConversation,
  };
}
