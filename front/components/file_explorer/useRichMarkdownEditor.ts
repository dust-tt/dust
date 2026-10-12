import { useEffect, useState } from "react";

/** The rich Document editor takes over the file; the host hides its own edit controls. */
export interface MarkdownRichEditor {
  /** Changes when the editor must reopen on new content; use it as the component key. */
  mountKey: string;
  /** Scoped path of the file the editor edits. */
  path: string;
  /** The live session server the document is edited in. */
  liveUrl: string;
  initialContent: string;
}

interface UseRichMarkdownEditorParams {
  /** The rich editor is wanted for this file: the flag is on and the file is editable. */
  enabled: boolean;
  /** The live session server, when one is reachable; without one, the rich editor does not open. */
  liveUrl: string | undefined;
  entryPath: string | undefined;
  isActive: boolean;
  /** The file text as fetched, or null while it loads. */
  rawContent: string | null;
  /** The fetched text was cut; the plain editor keeps such a file. */
  isTruncated: boolean;
}

export interface RichMarkdownEditorState {
  richEditor: MarkdownRichEditor | null;
}

/** What the editor opened on. Latched: later fetches do not rewrite it. */
interface Opened {
  content: string;
  /** The live session server at that moment: the editor never moves under the user. */
  liveUrl: string;
}

/**
 * Which content the rich editor is open on. It opens on the file as fetched, in the live session
 * reachable then, and never reopens on later fetches: the session holds the document.
 */
/**
 * @cc [owner:PopDaph,label:product] live-mode-latched
 * The rich editor MUST open only with a live session server, and an open editor MUST keep the one
 * it opened with until the file is reopened: `liveUrl` changing or disappearing MUST NOT move it.
 */
export function useRichMarkdownEditor({
  enabled,
  liveUrl,
  entryPath,
  isActive,
  rawContent,
  isTruncated,
}: UseRichMarkdownEditorParams): RichMarkdownEditorState {
  const [opened, setOpened] = useState<Opened | null>(null);
  const [resetKey, setResetKey] = useState({ isActive, path: entryPath });

  if (isActive !== resetKey.isActive || entryPath !== resetKey.path) {
    setResetKey({ isActive, path: entryPath });
    setOpened(null);
  }

  const opens = enabled && (opened !== null || !isTruncated);
  const source = rawContent ?? undefined;

  useEffect(() => {
    if (opens && opened === null && source !== undefined && liveUrl) {
      setOpened({ content: source, liveUrl });
    }
  }, [opens, opened, source, liveUrl]);

  return {
    richEditor:
      opens && opened && entryPath !== undefined
        ? {
            mountKey: entryPath,
            path: entryPath,
            liveUrl: opened.liveUrl,
            initialContent: opened.content,
          }
        : null,
  };
}
