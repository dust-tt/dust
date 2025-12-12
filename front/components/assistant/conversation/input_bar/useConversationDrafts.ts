import debounce from "lodash/debounce";
import { useCallback, useRef } from "react";

import logger from "@app/logger/logger";

interface ConversationDraft {
  text: string;
  timestamp: number;
}

type KeyId = string;

const getKeyId = (
  workspaceId: string,
  userId: string,
  conversationId: string
) => `${userId}::${workspaceId}::${conversationId}` satisfies KeyId;

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
  conversationId,
}: {
  workspaceId: string;
  userId: string | null;
  conversationId: string | null;
}) {
  const internalConversationId = conversationId ?? "new";
  const internalUserId = userId ?? "anonymous";

  // Get all drafts from localStorage.
  const getDraftsFromStorage = useCallback((): DraftStorage => {
    try {
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
  }, []);

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

  // Debounced save function.
  const debouncedSave = useRef(
    debounce(
      ({
        workspaceId,
        userId,
        conversationId,
        text,
        timestamp,
      }: {
        workspaceId: string;
        userId: string;
        conversationId: string;
        text: string;
        timestamp: number;
      }) => {
        const drafts = getDraftsFromStorage();
        drafts[getKeyId(workspaceId, userId, conversationId)] = {
          text,
          timestamp,
        };
        saveDraftsToStorage(drafts);
      },
      500
    )
  ).current;

  // Save draft for current conversation (debounced).
  const saveDraft = useCallback(
    (text: string) => {
      debouncedSave({
        workspaceId,
        userId: internalUserId,
        conversationId: internalConversationId,
        text,
        timestamp: Date.now(),
      });
    },
    [debouncedSave, workspaceId, internalUserId, internalConversationId]
  );

  // Get draft for current conversation.
  const getDraft = useCallback((): ConversationDraft | null => {
    const drafts = getDraftsFromStorage();
    return (
      drafts[getKeyId(workspaceId, internalUserId, internalConversationId)] ??
      null
    );
  }, [
    getDraftsFromStorage,
    workspaceId,
    internalUserId,
    internalConversationId,
  ]);

  // Clear draft for the current conversation.
  const clearDraft = useCallback(() => {
    const drafts = getDraftsFromStorage();
    delete drafts[
      getKeyId(workspaceId, internalUserId, internalConversationId)
    ];
    saveDraftsToStorage(drafts);

    // Also, cancel any pending debounced save.
    debouncedSave.cancel();
  }, [
    getDraftsFromStorage,
    workspaceId,
    internalUserId,
    internalConversationId,
    saveDraftsToStorage,
    debouncedSave,
  ]);

  const clearAllDraftsFromUser = useCallback(() => {
    const drafts = getDraftsFromStorage();
    Object.keys(drafts).forEach((key) => {
      if (key.startsWith(`${internalUserId}::`)) {
        delete drafts[key];
      }
    });
    saveDraftsToStorage(drafts);
  }, [getDraftsFromStorage, internalUserId, saveDraftsToStorage]);

  return { saveDraft, getDraft, clearDraft, clearAllDraftsFromUser };
}
