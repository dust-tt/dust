import logger from "@app/logger/logger";
import type { RichAgentMention } from "@app/types/assistant/mentions";
import debounce from "lodash/debounce";
import { useCallback, useEffect, useRef } from "react";

interface ConversationDraft {
  text: string;
  timestamp: number;
  agentMention?: RichAgentMention | null;
}

type KeyId = string;

const getKeyId = (workspaceId: string, userId: string, draftKey: string) =>
  `${userId}::${workspaceId}::${draftKey}` satisfies KeyId;

interface DraftStorage {
  [keyId: KeyId]: ConversationDraft;
}

const STORAGE_KEY = "conversation-drafts";
const DRAFT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Hook to manage per-conversation input drafts in localStorage.
 * Provides auto-save, retrieval, and cleanup functionality.
 */
export function useConversationDrafts({
  workspaceId,
  userId,
  draftKey,
  shouldUseDraft = true,
}: {
  workspaceId: string;
  userId: string | null;
  draftKey: string;
  shouldUseDraft?: boolean;
}) {
  // Get all drafts from localStorage.
  const getDraftsFromStorage = useCallback((): DraftStorage => {
    try {
      if (!shouldUseDraft) {
        return {};
      }

      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        return {};
      }

      const parsed = JSON.parse(stored) as DraftStorage;

      // Clean up expired drafts (older than DRAFT_EXPIRY_DAYS).
      const now = Date.now();
      const cleaned: DraftStorage = {};

      Object.entries(parsed).forEach(([id, draft]) => {
        if (now - draft.timestamp < DRAFT_EXPIRY_MS) {
          cleaned[id] = draft;
        }
      });

      return cleaned;
    } catch (error) {
      logger.error(
        "Failed to read conversation drafts from localStorage, cleaning localStorage:",
        error
      );
      delete localStorage[STORAGE_KEY];
      return {};
    }
  }, [shouldUseDraft]);

  // Save drafts to localStorage.
  const saveDraftsToStorage = useCallback((drafts: DraftStorage) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
    } catch (error) {
      logger.error(
        "Failed to save conversation drafts to localStorage:",
        error
      );
    }
  }, []);

  // Create a ref to hold the debounced save function
  const debouncedSaveRef =
    useRef<
      ReturnType<
        typeof debounce<
          (params: {
            workspaceId: string;
            userId: string;
            draftKey: string;
            text: string;
            timestamp: number;
            agentMention?: RichAgentMention | null;
          }) => void
        >
      >
    >();

  // Update the debounced function when dependencies change
  useEffect(() => {
    // Cancel any pending debounced calls from the old function
    debouncedSaveRef.current?.cancel();

    // Create new debounced function with current closures
    debouncedSaveRef.current = debounce(
      ({
        workspaceId,
        userId,
        draftKey,
        text,
        timestamp,
        agentMention,
      }: {
        workspaceId: string;
        userId: string;
        draftKey: string;
        text: string;
        timestamp: number;
        agentMention?: RichAgentMention | null;
      }) => {
        if (!userId) {
          return;
        }

        const drafts = getDraftsFromStorage();
        drafts[getKeyId(workspaceId, userId, draftKey)] = {
          text,
          timestamp,
          agentMention,
        };
        saveDraftsToStorage(drafts);
      },
      500
    );
  }, [getDraftsFromStorage, saveDraftsToStorage]);

  // Save draft for current conversation (debounced).
  const saveDraft = useCallback(
    (text: string, agentMention?: RichAgentMention | null) => {
      if (!shouldUseDraft || !userId) {
        return;
      }

      debouncedSaveRef.current?.({
        workspaceId,
        userId,
        draftKey,
        text,
        timestamp: Date.now(),
        agentMention,
      });
    },
    [workspaceId, userId, shouldUseDraft, draftKey]
  );

  // Get draft for current conversation.
  const getDraft = useCallback((): ConversationDraft | null => {
    const drafts = getDraftsFromStorage();

    if (!userId) {
      return null;
    }

    return drafts[getKeyId(workspaceId, userId, draftKey)] ?? null;
  }, [getDraftsFromStorage, workspaceId, userId, draftKey]);

  // Clear draft for the current conversation.
  const clearDraft = useCallback(() => {
    if (!userId) {
      return;
    }

    const drafts = getDraftsFromStorage();

    delete drafts[getKeyId(workspaceId, userId, draftKey)];

    // Also, cancel any pending debounced save.
    debouncedSaveRef.current?.cancel();

    saveDraftsToStorage(drafts);
  }, [
    getDraftsFromStorage,
    workspaceId,
    userId,
    draftKey,
    saveDraftsToStorage,
  ]);

  const clearAllDraftsFromUser = useCallback(() => {
    const drafts = getDraftsFromStorage();
    Object.keys(drafts).forEach((key) => {
      if (key.startsWith(`${userId}::`)) {
        delete drafts[key];
      }
    });
    saveDraftsToStorage(drafts);
  }, [getDraftsFromStorage, userId, saveDraftsToStorage]);

  return { saveDraft, getDraft, clearDraft, clearAllDraftsFromUser };
}
