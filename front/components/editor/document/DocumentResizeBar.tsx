import {
  Button,
  HoveringBar,
  ReverseLeft,
  Slider,
  Trash01,
} from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import type React from "react";

/** Keeps the editor's selection while a control is pressed. */
const keepSelection = (event: React.MouseEvent) => event.preventDefault();

interface DocumentResizeBarProps {
  min: number;
  max: number;
  step?: number;
  size: number;
  sliderLabel: string;
  onPreview: (size: number) => void;
  onEndPreview: () => void;
  onCommit: (size: number) => void;
  reset?: { label: string; onReset: () => void };
  removeLabel: string;
  onRemove: () => void;
}

/**
 * @cc [owner:tdraier,label:product] document-resize-bar
 * A size slider, an optional reset action and a remove action, shared by the hover menus of a
 * document's embeds. Its actions MUST NOT take the editor's selection when pressed. The slider MUST
 * report every value while dragged through `onPreview`, the released value once through `onCommit`,
 * and the end of every drag through `onEndPreview`, changed or not.
 */
export const DocumentResizeBar = ({
  min,
  max,
  step,
  size,
  sliderLabel,
  onPreview,
  onEndPreview,
  onCommit,
  reset,
  removeLabel,
  onRemove,
}: DocumentResizeBarProps) => {
  const { t } = useLingui();

  return (
    <HoveringBar size="xs">
      <div className="w-28 px-2">
        <Slider
          min={min}
          max={max}
          step={step}
          value={[size]}
          onValueChange={([nextSize]) => onPreview(nextSize)}
          onValueCommit={([nextSize]) => onCommit(nextSize)}
          onPointerUp={onEndPreview}
          onPointerCancel={onEndPreview}
          ariaLabel={sliderLabel}
          showValueTooltip
          formatValue={(value) => t`${value} px`}
        />
      </div>
      {reset && (
        <Button
          size="xs"
          variant="ghost-secondary"
          icon={ReverseLeft}
          tooltip={reset.label}
          aria-label={reset.label}
          onMouseDown={keepSelection}
          onClick={reset.onReset}
        />
      )}
      <HoveringBar.Separator />
      <Button
        size="xs"
        variant="ghost-secondary"
        icon={Trash01}
        tooltip={removeLabel}
        aria-label={removeLabel}
        onMouseDown={keepSelection}
        onClick={onRemove}
      />
    </HoveringBar>
  );
};
