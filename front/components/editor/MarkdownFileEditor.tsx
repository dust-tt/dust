import {
  MarkdownEditor,
  type MarkdownEditorProps,
} from "@app/components/editor/MarkdownEditor";
import {
  getFilePathContentApiPath,
  useFileContentByUrl,
  useWriteFileContentByPath,
} from "@app/lib/swr/files";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, ContentMessage, Spinner } from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface MarkdownFileEditorProps
  extends Omit<MarkdownEditorProps, "value" | "onChange"> {
  owner: LightWorkspaceType;
  /**
   * Canonical scoped file path, e.g. `pod-{podId}/AGENTS.md`.
   */
  filePath?: string | null;
  disabled?: boolean;
  /** When true, show an empty editor if the file does not exist (404). */
  emptyWhenNotFound?: boolean;
  /** Content-Type sent on save. Defaults to `text/markdown`. */
  saveContentType?: string;
  onChange?: (content: string) => void;
  onContentLoaded?: (content: string) => void;
  onSaved?: (content: string) => void;
}

export function MarkdownFileEditor({
  owner,
  filePath = null,
  disabled = false,
  emptyWhenNotFound = false,
  saveContentType = "text/markdown",
  onChange,
  onContentLoaded,
  onSaved,
  readOnly,
  ...markdownEditorProps
}: MarkdownFileEditorProps) {
  const resolvedUrl = useMemo(
    () => (filePath ? getFilePathContentApiPath(owner, filePath) : null),
    [filePath, owner]
  );

  const { fileContent, isNotFound, isFileContentLoading, fileContentError } =
    useFileContentByUrl({
      url: resolvedUrl,
      disabled: disabled || !resolvedUrl,
    });

  const writeFileContent = useWriteFileContentByPath({ owner });

  const [draft, setDraft] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const hasInitializedFromServerRef = useRef(false);
  const sourceKeyRef = useRef(resolvedUrl);

  const canPersist = !!filePath && !readOnly && !disabled;
  const isDirty = draft !== savedContent;

  useEffect(() => {
    if (sourceKeyRef.current === resolvedUrl) {
      return;
    }
    sourceKeyRef.current = resolvedUrl;
    hasInitializedFromServerRef.current = false;
    setDraft("");
    setSavedContent("");
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
    setSavedContent(content);
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

  const handleCancel = useCallback(() => {
    setDraft(savedContent);
  }, [savedContent]);

  const handleSave = useCallback(async () => {
    if (!filePath || isSaving || !isDirty) {
      return;
    }

    setIsSaving(true);
    const result = await writeFileContent({
      canonicalPath: filePath,
      content: draft,
      contentType: saveContentType,
      showSuccessNotification: true,
    });
    setIsSaving(false);

    if (result.isOk()) {
      setSavedContent(draft);
      onSaved?.(draft);
    }
  }, [
    draft,
    filePath,
    isDirty,
    isSaving,
    onSaved,
    saveContentType,
    writeFileContent,
  ]);

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
    <div className="flex w-full min-w-0 flex-col gap-2">
      <MarkdownEditor
        {...markdownEditorProps}
        value={draft}
        onChange={handleChange}
        readOnly={readOnly}
      />
      {canPersist && isDirty && (
        <div className="flex gap-2">
          <Button
            label="Save"
            variant="highlight"
            isLoading={isSaving}
            onClick={() => void handleSave()}
          />
          <Button
            label="Cancel"
            variant="outline"
            disabled={isSaving}
            onClick={handleCancel}
          />
        </div>
      )}
    </div>
  );
}
