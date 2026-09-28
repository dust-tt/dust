import { ConfirmContext } from "@app/components/Confirm";
import { useSendNotification } from "@app/hooks/useNotification";
import { useBatchEditFrameText } from "@app/lib/swr/frames";
import type { EditTextFn } from "@app/types/assistant/visualization";
import type { LightWorkspaceType } from "@app/types/user";
import type { RefObject } from "react";
import { useCallback, useContext, useRef, useState } from "react";

type FrameTextEdit = Parameters<EditTextFn>[0];

export type FrameEditMode = "preview" | "edit";

const FLUSH_TIMEOUT_MS = 2000;

/**
 * Append a staged edit. A re-edit of the span just edited (same source, and its old text is the
 * previous new text) collapses into the previous entry, and dropping back to the original text
 * removes it. Anything else is appended: the server applies edits in order, so sibling text nodes
 * sharing one `data-source` element each keep their own entry.
 */
export function appendStagedEdit(
  edits: FrameTextEdit[],
  edit: FrameTextEdit
): FrameTextEdit[] {
  const last = edits.at(-1);
  if (!last || last.source !== edit.source || last.newText !== edit.oldText) {
    return [...edits, edit];
  }

  const rest = edits.slice(0, -1);
  return last.oldText === edit.newText
    ? rest
    : [...rest, { ...last, newText: edit.newText }];
}

// Ask the viz to commit any span still being edited. Resolves false if it does not answer.
export function flushEditables(
  iframe: HTMLIFrameElement | null
): Promise<boolean> {
  const contentWindow = iframe?.contentWindow;
  if (!contentWindow) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const done = (flushed: boolean) => {
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      resolve(flushed);
    };
    const timeout = window.setTimeout(() => done(false), FLUSH_TIMEOUT_MS);
    function onMessage(event: MessageEvent) {
      if (
        event.source === contentWindow &&
        event.data?.type === "FLUSH_EDITABLES_DONE"
      ) {
        done(true);
      }
    }

    window.addEventListener("message", onMessage);
    contentWindow.postMessage({ type: "FLUSH_EDITABLES" }, "*");
  });
}

/**
 * Frames v2 inline text editing: Preview|Edit mode, edits staged in the viz until Save, then one
 * batch publish. Mount once per Frame (the caller keys by fileId), so no reset logic is needed.
 */
export function useFrameEditSession({
  conversationId,
  fileId,
  iframeRef,
  mutateFileContent,
  owner,
}: {
  conversationId?: string;
  fileId: string;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  mutateFileContent: () => Promise<unknown>;
  owner: LightWorkspaceType;
}) {
  const confirm = useContext(ConfirmContext);
  const sendNotification = useSendNotification();
  const batchEditFrameText = useBatchEditFrameText({
    owner,
    fileId,
    conversationId,
  });

  const [mode, setModeState] = useState<FrameEditMode>("preview");
  const [isSaving, setIsSaving] = useState(false);
  // Bumped after Save/discard/reload so the viz iframe remounts on published content (#10579).
  const [contentRevision, setContentRevision] = useState(0);
  const [pendingEdits, setPendingEdits] = useState<FrameTextEdit[]>([]);
  // Read by Save right after the flush, before React re-renders with the flushed edits.
  const pendingEditsRef = useRef<FrameTextEdit[]>([]);

  const replacePendingEdits = useCallback((next: FrameTextEdit[]) => {
    pendingEditsRef.current = next;
    setPendingEdits(next);
  }, []);

  const remount = useCallback(() => {
    setContentRevision((revision) => revision + 1);
  }, []);

  const stageEdit = useCallback<EditTextFn>(
    async (params) => {
      // Context-string (legacy) edits are too brittle to replay later; only stage by location.
      if (!params.source) {
        return {
          success: false,
          error:
            "This text can't be batch-edited; reload the Frame and try again.",
        };
      }

      replacePendingEdits(appendStagedEdit(pendingEditsRef.current, params));
      return { success: true };
    },
    [replacePendingEdits]
  );

  const save = useCallback(async () => {
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    try {
      if (!(await flushEditables(iframeRef.current))) {
        sendNotification({
          type: "error",
          title: "Couldn't save edits",
          description:
            "The Frame didn't respond. Your edits are still staged, try saving again.",
        });
        return;
      }

      const edits = pendingEditsRef.current;
      if (edits.length === 0) {
        return;
      }

      const result = await batchEditFrameText(edits);
      if (!result.success) {
        // useBatchEditFrameText already notified; keep the edits staged for a retry.
        return;
      }

      replacePendingEdits([]);
      try {
        await mutateFileContent();
      } catch {
        // Mutation succeeded server-side; remount anyway so the next load picks up content.
      }
      setModeState("preview");
      remount();
    } finally {
      setIsSaving(false);
    }
  }, [
    batchEditFrameText,
    iframeRef,
    isSaving,
    mutateFileContent,
    remount,
    replacePendingEdits,
    sendNotification,
  ]);

  const setMode = useCallback(
    async (next: FrameEditMode) => {
      if (next === "preview" && pendingEditsRef.current.length > 0) {
        const discard = await confirm({
          title: "Discard unsaved edits?",
          message:
            "You have unsaved text edits. Leaving Edit will discard them.",
          validateLabel: "Discard",
          validateVariant: "warning",
          cancelLabel: "Cancel",
        });
        if (!discard) {
          return;
        }
        replacePendingEdits([]);
        // Remount so optimistic DOM text is wiped and Preview shows the published content.
        remount();
      }

      setModeState(next);
    },
    [confirm, remount, replacePendingEdits]
  );

  return {
    contentRevision,
    hasPendingEdits: pendingEdits.length > 0,
    isSaving,
    mode,
    remount,
    save,
    setMode,
    stageEdit,
  };
}

export type FrameEditSession = ReturnType<typeof useFrameEditSession>;
