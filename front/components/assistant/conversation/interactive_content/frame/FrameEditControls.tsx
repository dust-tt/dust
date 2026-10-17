import type { FrameEditSession } from "@app/components/assistant/conversation/interactive_content/frame/useFrameEditSession";
import { MarkdownFilePreviewViewModeSwitch } from "@app/components/file_explorer/MarkdownFilePreview";
import { Button, Check } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

interface FrameEditControlsProps {
  hideLabels: boolean;
  session: FrameEditSession;
  disabled?: boolean;
}

export function FrameEditControls({
  hideLabels,
  session,
  disabled,
}: FrameEditControlsProps) {
  const { t } = useLingui();
  const { hasPendingEdits, isSaving, mode, save, setMode } = session;

  return (
    <>
      <MarkdownFilePreviewViewModeSwitch
        viewMode={mode}
        hideLabels={hideLabels}
        disabled={isSaving || disabled}
        onViewModeChange={(next) => {
          void setMode(next);
        }}
      />

      <Button
        // Keep an icon so the control stays visible when the label is hidden on narrow
        // headers (same pattern as Preview|Edit).
        label={hideLabels ? undefined : t`Apply`}
        icon={Check}
        size="xs"
        variant="ghost"
        isLoading={isSaving}
        disabled={!hasPendingEdits || isSaving || disabled}
        onClick={() => {
          void save();
        }}
        aria-label={t`Apply`}
        tooltip={
          isSaving
            ? t`Publishing your changes...`
            : hasPendingEdits
              ? t`Save text edits`
              : t`No unsaved edits`
        }
      />
    </>
  );
}
