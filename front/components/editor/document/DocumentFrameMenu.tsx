import { Button, HoveringBar, Slider, Trash01 } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import type React from "react";

const MIN_FRAME_HEIGHT_PX = 200;
const MAX_FRAME_HEIGHT_PX = 1600;
const FRAME_HEIGHT_STEP_PX = 10;

const keepSelection = (event: React.MouseEvent) => event.preventDefault();

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
      <HoveringBar size="xs">
        <div className="w-28 px-2">
          <Slider
            min={MIN_FRAME_HEIGHT_PX}
            max={MAX_FRAME_HEIGHT_PX}
            step={FRAME_HEIGHT_STEP_PX}
            value={[
              Math.min(
                MAX_FRAME_HEIGHT_PX,
                Math.max(MIN_FRAME_HEIGHT_PX, height)
              ),
            ]}
            onValueChange={([nextHeight]) => onPreviewHeight(nextHeight)}
            onValueCommit={([nextHeight]) => onCommitHeight(nextHeight)}
            onPointerUp={onEndPreview}
            onPointerCancel={onEndPreview}
            ariaLabel={t`Frame height`}
            showValueTooltip
            formatValue={(value) => t`${value} px`}
          />
        </div>
        <HoveringBar.Separator />
        <Button
          size="xs"
          variant="ghost-secondary"
          icon={Trash01}
          tooltip={t`Remove Frame`}
          aria-label={t`Remove Frame`}
          onMouseDown={keepSelection}
          onClick={onRemove}
        />
      </HoveringBar>
    </div>
  );
};
