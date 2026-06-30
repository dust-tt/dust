import {
  INPUT_BAR_COMPACT_PILL_CLASSES,
  INPUT_BAR_COMPACT_PILL_INNER_CLASSES,
  INPUT_BAR_SURFACE_CLASSES,
} from "@app/components/assistant/conversation/input_bar/inputBarCompactStyles";
import {
  ArrowDown,
  ArrowUp,
  Button,
  cn,
  IconButton,
  Stop,
  Zap,
} from "@dust-tt/sparkle";

interface InputBarMessageNavigationProps {
  variant: "floating" | "compact";
  showStopButton: boolean;
  showMessageNavigation: boolean;
  stopButtonLabel: string;
  hasPendingMessages: boolean;
  pendingAction: "stop" | "interrupt" | null;
  onStopClick: () => void;
  canScrollUp: boolean;
  canScrollDown: boolean;
  onScrollUp: () => void;
  onScrollDown: () => void;
}

export function InputBarMessageNavigation({
  variant,
  showStopButton,
  showMessageNavigation,
  stopButtonLabel,
  hasPendingMessages,
  pendingAction,
  onStopClick,
  canScrollUp,
  canScrollDown,
  onScrollUp,
  onScrollDown,
}: InputBarMessageNavigationProps) {
  const stopButtonVariant = variant === "compact" ? "ghost-secondary" : "ghost";
  const isStopActionPending = pendingAction !== null;
  const stopIcon = hasPendingMessages ? Zap : Stop;
  const showNavigationArrows =
    showMessageNavigation && !(variant === "compact" && showStopButton);

  const renderNavigationArrowButton = (
    icon: typeof ArrowUp,
    onClick: () => void,
    disabled: boolean,
    ariaLabel: string
  ) => {
    if (variant === "compact") {
      return (
        <Button
          variant="ghost-secondary"
          icon={icon}
          size="mini"
          onClick={onClick}
          disabled={disabled}
          aria-label={ariaLabel}
        />
      );
    }

    return (
      <IconButton
        icon={icon}
        onClick={onClick}
        disabled={disabled}
        size="xs"
        tooltip={ariaLabel}
        aria-label={ariaLabel}
      />
    );
  };

  const stopButton =
    variant === "compact" && isStopActionPending ? (
      <Button
        variant={stopButtonVariant}
        label={stopButtonLabel}
        onClick={onStopClick}
        disabled
        size={variant === "compact" ? "mini" : "xs"}
      />
    ) : (
      <Button
        variant={stopButtonVariant}
        label={variant === "compact" ? undefined : stopButtonLabel}
        icon={stopIcon}
        aria-label={variant === "compact" ? stopButtonLabel : undefined}
        onClick={onStopClick}
        disabled={pendingAction !== null}
        size={variant === "compact" ? "mini" : "xs"}
      />
    );

  const controls = (
    <>
      {showStopButton && (
        <>
          {stopButton}
          {showNavigationArrows && variant !== "compact" && (
            <div className="h-4 w-px bg-border dark:bg-border-night" />
          )}
        </>
      )}
      {showNavigationArrows && (
        <>
          {renderNavigationArrowButton(
            ArrowUp,
            onScrollUp,
            !canScrollUp,
            "Previous user message"
          )}
          {renderNavigationArrowButton(
            ArrowDown,
            onScrollDown,
            !canScrollDown,
            "Next user message"
          )}
        </>
      )}
    </>
  );

  if (variant === "compact") {
    return (
      <div className={INPUT_BAR_COMPACT_PILL_CLASSES}>
        <div className={INPUT_BAR_COMPACT_PILL_INNER_CLASSES}>{controls}</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-xl p-1",
        INPUT_BAR_SURFACE_CLASSES
      )}
      style={{
        position: "absolute",
        top: "-2rem",
      }}
    >
      {controls}
    </div>
  );
}
