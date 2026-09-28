import type { FrameEditSession } from "@app/components/assistant/conversation/interactive_content/frame/useFrameEditSession";
import { MarkdownFilePreviewViewModeSwitch } from "@app/components/file_explorer/MarkdownFilePreview";
import { Button, Check } from "@dust-tt/sparkle";

interface FrameEditControlsProps {
  hideLabels: boolean;
  session: FrameEditSession;
}

export function FrameEditControls({
  hideLabels,
  session,
}: FrameEditControlsProps) {
  const { hasPendingEdits, isSaving, mode, save, setMode } = session;

  return (
    <>
      <MarkdownFilePreviewViewModeSwitch
        viewMode={mode}
        hideLabels={hideLabels}
        disabled={isSaving}
        onViewModeChange={(next) => {
          void setMode(next);
        }}
      />
      {mode === "edit" && (
        <Button
          // Keep an icon so the control stays visible when the label is hidden on narrow
          // headers (same pattern as Preview|Edit).
          label={hideLabels ? undefined : "Save"}
          icon={Check}
          size="xs"
          variant="ghost"
          isLoading={isSaving}
          disabled={!hasPendingEdits || isSaving}
          onClick={() => {
            void save();
          }}
          aria-label="Save"
          tooltip={
            isSaving
              ? "Publishing your changes..."
              : hasPendingEdits
                ? "Save text edits"
                : "No unsaved edits"
          }
        />
      )}
    </>
  );
}
