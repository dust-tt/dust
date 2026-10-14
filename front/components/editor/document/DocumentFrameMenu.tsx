import { DocumentResizeBar } from "@app/components/editor/document/DocumentResizeBar";
import { useLingui } from "@lingui/react/macro";

const MIN_FRAME_HEIGHT_PX = 200;
const MAX_FRAME_HEIGHT_PX = 1600;
const FRAME_HEIGHT_STEP_PX = 10;

interface DocumentFrameMenuProps {
  height: number;
  onPreviewHeight: (height: number) => void;
  onEndPreview: () => void;
  onCommitHeight: (height: number) => void;
  onRemove: () => void;
}

export const DocumentFrameMenu = ({
  height,
  onPreviewHeight,
  onEndPreview,
  onCommitHeight,
  onRemove,
}: DocumentFrameMenuProps) => {
  const { t } = useLingui();

  return (
    <div
      role="toolbar"
      aria-label={t({
        message: "Frame",
        context: "toolbar over a hovered Frame embedded in a document",
      })}
      className="absolute right-2 top-2 z-10 font-sans text-foreground antialiased print:hidden"
    >
      <DocumentResizeBar
        min={MIN_FRAME_HEIGHT_PX}
        max={MAX_FRAME_HEIGHT_PX}
        step={FRAME_HEIGHT_STEP_PX}
        size={Math.min(
          MAX_FRAME_HEIGHT_PX,
          Math.max(MIN_FRAME_HEIGHT_PX, height)
        )}
        sliderLabel={t`Frame height`}
        onPreview={onPreviewHeight}
        onEndPreview={onEndPreview}
        onCommit={onCommitHeight}
        removeLabel={t`Remove Frame`}
        onRemove={onRemove}
      />
    </div>
  );
};
