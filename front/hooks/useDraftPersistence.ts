import type { JSONContent } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";

const DRAFT_STORAGE_PREFIX = "dust_draft_";
const DRAFT_EXPIRY_DAYS = 7;
const STORAGE_DEBOUNCE_MS = 500;

interface DraftData {
  content: JSONContent;
  timestamp: number;
}

interface UseDraftPersistenceOptions {
  conversationId: string | null;
  enabled?: boolean;
}

export function useDraftPersistence({
  conversationId,
  enabled = true,
}: UseDraftPersistenceOptions) {
  const timeoutRef = useRef<NodeJS.Timeout>();
  const [hasDraft, setHasDraft] = useState(false);
  const [_draftLoaded, setDraftLoaded] = useState(false);

  const getStorageKey = useCallback(() => {
    const key = conversationId ?? "new";
    return `${DRAFT_STORAGE_PREFIX}${key}`;
  }, [conversationId]);

  const cleanupOldDrafts = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const now = Date.now();
    const expiryTime = DRAFT_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    const keysToRemove: string[] = [];

    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key || !key.startsWith(DRAFT_STORAGE_PREFIX)) {
        continue;
      }

      try {
        const item = sessionStorage.getItem(key);
        if (!item) {
          continue;
        }

        // Remove expired drafts
        const draft: DraftData = JSON.parse(item);
        if (now - draft.timestamp > expiryTime) {
          keysToRemove.push(key);
        }
      } catch (e) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => sessionStorage.removeItem(key));
  }, []);

  const saveDraft = useCallback(
    (content: JSONContent) => {
      if (!enabled) {
        return;
      }

      const storageKey = getStorageKey();
      if (!storageKey) {
        return;
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Debounce save
      timeoutRef.current = setTimeout(() => {
        try {
          const draft: DraftData = {
            content,
            timestamp: Date.now(),
          };

          sessionStorage.setItem(storageKey, JSON.stringify(draft));
          setHasDraft(true);
        } catch (e) {
          // Session storage quota exceeded handling: clean up and try again.
          if (e instanceof DOMException && e.code === 22) {
            cleanupOldDrafts();
            try {
              const draft: DraftData = {
                content,
                timestamp: Date.now(),
              };
              sessionStorage.setItem(storageKey, JSON.stringify(draft));
              setHasDraft(true);
            } catch {
              // Still failed, give up
            }
          }
        }
      }, STORAGE_DEBOUNCE_MS);
    },
    [enabled, getStorageKey, cleanupOldDrafts]
  );

  // Load draft from session storage
  const loadDraft = useCallback((): JSONContent | null => {
    if (!enabled) {
      return null;
    }

    const storageKey = getStorageKey();
    if (!storageKey) {
      return null;
    }

    try {
      const item = sessionStorage.getItem(storageKey);
      if (!item) {
        return null;
      }

      const draft: DraftData = JSON.parse(item);
      const now = Date.now();
      const expiryTime = DRAFT_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

      if (now - draft.timestamp > expiryTime) {
        sessionStorage.removeItem(storageKey);
        return null;
      }

      setHasDraft(true);
      setDraftLoaded(true);
      return draft.content;
    } catch (e) {
      return null;
    }
  }, [enabled, getStorageKey]);

  const clearDraft = useCallback(() => {
    const storageKey = getStorageKey();
    if (!storageKey) {
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    try {
      sessionStorage.removeItem(storageKey);
      setHasDraft(false);
    } catch (e) {
      console.error("Failed to clear draft:", e);
    }
  }, [getStorageKey]);

  useEffect(() => {
    cleanupOldDrafts();
  }, [cleanupOldDrafts]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    saveDraft,
    loadDraft,
    clearDraft,
    hasDraft,
  };
}
