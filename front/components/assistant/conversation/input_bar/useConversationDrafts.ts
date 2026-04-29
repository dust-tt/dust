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

  useEffect(() => {
    debouncedSaveRef.current?.cancel();

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

  const clearDraft = useCallback(() => {
    if (!shouldUseDraft || !userId) {
      return;
    }

    const drafts = getDraftsFromStorage();

    delete drafts[getKeyId(workspaceId, userId, draftKey)];

    debouncedSaveRef.current?.cancel();
    saveDraftsToStorage(drafts);
  }, [
    getDraftsFromStorage,
    workspaceId,
    userId,
    draftKey,
    shouldUseDraft,
    saveDraftsToStorage,
  ]);

  const saveDraft = useCallback(
    (text: string, agentMention?: RichAgentMention | null) => {
      if (!shouldUseDraft || !userId) {
        return;
      }

      if (text.trim().length === 0) {
        clearDraft();
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
    [workspaceId, userId, shouldUseDraft, draftKey, clearDraft]
  );

  const getDraft = useCallback((): ConversationDraft | null => {
    const drafts = getDraftsFromStorage();

    if (!userId) {
      return null;
    }

    return drafts[getKeyId(workspaceId, userId, draftKey)] ?? null;
  }, [getDraftsFromStorage, workspaceId, userId, draftKey]);

  const clearAllDraftsFromUser = useCallback(() => {
    if (!shouldUseDraft || !userId) {
      return;
    }

    const drafts = getDraftsFromStorage();
    Object.keys(drafts).forEach((key) => {
      if (key.startsWith(`${userId}::`)) {
        delete drafts[key];
      }
    });
    saveDraftsToStorage(drafts);
  }, [getDraftsFromStorage, userId, shouldUseDraft, saveDraftsToStorage]);

  return { saveDraft, getDraft, clearDraft, clearAllDraftsFromUser };
}
