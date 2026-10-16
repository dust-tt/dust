import { useClientType } from "@app/lib/context/clientType";
import {
  Button,
  cn,
  LinkExternal01,
  Maximize01,
  Minimize01,
  RefreshCw01,
  ReverseLeft,
  Tooltip,
} from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

export interface PreviewActionButtonsProps {
  isFullScreen: boolean;
  enterFullScreen: () => void;
  exitFullScreen: () => void;
  shareUrl?: string;
  reloadFile?: () => void;
  /** Conversation-only: agent that last edited the Frame. */
  lastEditedByAgentConfigurationId?: string;
  hasPreviousVersion?: boolean;
  onRevert?: () => void;
  /**
   * `fixed` anchors to the viewport (conversation panel / sheet).
   * `absolute` anchors to the nearest relative Frame container (Pod hover).
   */
  position?: "fixed" | "absolute";
}

/**
 * Floating Frame chrome (fullscreen / open in new tab / reload / optional revert).
 * Surface-specific header actions stay in {@link FrameToolbar}.
 */
export function PreviewActionButtons({
  isFullScreen,
  enterFullScreen,
  exitFullScreen,
  shareUrl,
  reloadFile,
  lastEditedByAgentConfigurationId,
  hasPreviousVersion = false,
  onRevert,
  position = "fixed",
}: PreviewActionButtonsProps) {
  const { t } = useLingui();
  const clientType = useClientType();

  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-lg bg-background p-1 shadow-md",
        // Absolute sits inside a padded Frame shell — use a tighter inset so it
        // does not stack with the outer padding the way fixed viewport inset does.
        position === "absolute"
          ? "absolute bottom-2 right-2"
          : "fixed bottom-5 right-5"
      )}
    >
      {clientType !== "extension" && (
        <Tooltip
          label={
            isFullScreen ? t`Exit full screen mode` : t`Go to full screen mode`
          }
          side="left"
          tooltipTriggerAsChild
          trigger={
            <Button
              aria-label={
                isFullScreen
                  ? t`Exit full screen mode`
                  : t`Go to full screen mode`
              }
              icon={isFullScreen ? Minimize01 : Maximize01}
              variant="ghost"
              size="xs"
              onClick={isFullScreen ? exitFullScreen : enterFullScreen}
            />
          }
        />
      )}
      {clientType !== "extension" && (
        <Tooltip
          label={t`Open in a new tab`}
          side="left"
          tooltipTriggerAsChild
          trigger={
            <Button
              aria-label={t`Open in a new tab`}
              icon={LinkExternal01}
              variant="ghost"
              size="xs"
              disabled={!shareUrl}
              onClick={() =>
                window.open(shareUrl, "_blank", "noopener,noreferrer")
              }
            />
          }
        />
      )}
      {lastEditedByAgentConfigurationId && onRevert && (
        <Tooltip
          label={
            hasPreviousVersion
              ? t`Revert the last change`
              : t`No previous version`
          }
          side="left"
          tooltipTriggerAsChild
          trigger={
            <Button
              aria-label={t`Revert the last change`}
              variant="ghost"
              disabled={!hasPreviousVersion}
              size="xs"
              icon={ReverseLeft}
              onClick={onRevert}
            />
          }
        />
      )}
      {reloadFile && (
        <Tooltip
          label={t`Reload the file`}
          side="left"
          tooltipTriggerAsChild
          trigger={
            <Button
              aria-label={t`Reload the file`}
              icon={RefreshCw01}
              variant="ghost"
              size="xs"
              onClick={reloadFile}
            />
          }
        />
      )}
    </div>
  );
}
