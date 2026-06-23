import {
  MarkdownEditor,
  type MarkdownEditorProps,
} from "@app/components/editor/MarkdownEditor";
import {
  getFilePathContentApiPath,
  useFileContentByUrl,
} from "@app/lib/swr/files";
import type { LightWorkspaceType } from "@app/types/user";
import { ContentMessage, Spinner } from "@dust-tt/sparkle";
import { useEffect, useMemo, useRef, useState } from "react";

export interface MarkdownFileEditorProps
  extends Omit<MarkdownEditorProps, "value" | "onChange"> {
  owner: LightWorkspaceType;
  /**
   * Canonical scoped file path, e.g. `pod-{podId}/AGENTS.md`.
   * Ignored when `fileUrl` is provided.
   */
  filePath?: string | null;
  /**
   * Full relative API URL for fetching file content.
   * Takes precedence over `filePath` when set.
   */
  fileUrl?: string | null;
  disabled?: boolean;
  /** When true, show an empty editor if the file does not exist (404). */
  emptyWhenNotFound?: boolean;
  onChange?: (content: string) => void;
  onContentLoaded?: (content: string) => void;
}

export function MarkdownFileEditor({
  owner,
  filePath = null,
  fileUrl = null,
  disabled = false,
  emptyWhenNotFound = false,
  onChange,
  onContentLoaded,
  readOnly,
  ...markdownEditorProps
}: MarkdownFileEditorProps) {
  const resolvedUrl = useMemo(() => {
    if (fileUrl) {
      return fileUrl;
    }
    if (filePath) {
      return getFilePathContentApiPath(owner, filePath);
    }
    return null;
  }, [filePath, fileUrl, owner]);

  const { fileContent, isNotFound, isFileContentLoading, fileContentError } =
    useFileContentByUrl({
      url: resolvedUrl,
      disabled: disabled || !resolvedUrl,
    });

  const [draft, setDraft] = useState("");
  const hasInitializedFromServerRef = useRef(false);
  const sourceKeyRef = useRef(resolvedUrl);

  useEffect(() => {
    if (sourceKeyRef.current === resolvedUrl) {
      return;
    }
    sourceKeyRef.current = resolvedUrl;
    hasInitializedFromServerRef.current = false;
    setDraft("");
  }, [resolvedUrl]);

  useEffect(() => {
    if (isFileContentLoading) {
      return;
    }
    if (hasInitializedFromServerRef.current) {
      return;
    }
    if (fileContentError) {
      return;
    }
    if (isNotFound && !emptyWhenNotFound) {
      return;
    }

    const content = isNotFound ? "" : (fileContent ?? "");
    setDraft(content);
    hasInitializedFromServerRef.current = true;
    onContentLoaded?.(content);
  }, [
    emptyWhenNotFound,
    fileContent,
    fileContentError,
    isFileContentLoading,
    isNotFound,
    onContentLoaded,
  ]);

  const handleChange = (content: string) => {
    setDraft(content);
    onChange?.(content);
  };

  if (!resolvedUrl || disabled) {
    return null;
  }

  if (isFileContentLoading) {
    return (
      <div className="flex h-60 items-center justify-center rounded-xl border border-border dark:border-border-night">
        <Spinner />
      </div>
    );
  }

  if (isNotFound && !emptyWhenNotFound) {
    return (
      <ContentMessage
        title="File not found"
        variant="warning"
        className="w-full"
      >
        The file could not be found at this path.
      </ContentMessage>
    );
  }

  if (fileContentError) {
    return (
      <ContentMessage
        title="Failed to load file"
        variant="warning"
        className="w-full"
      >
        {fileContentError.message}
      </ContentMessage>
    );
  }

  return (
    <MarkdownEditor
      {...markdownEditorProps}
      value={draft}
      onChange={handleChange}
      readOnly={readOnly}
    />
  );
}
