import { ExportContentDropdown } from "@app/components/assistant/conversation/interactive_content/ExportContentDropdown";
import { FrameBetaChip } from "@app/components/assistant/conversation/interactive_content/frame/FrameBetaChip";
import { FrameEditControls } from "@app/components/assistant/conversation/interactive_content/frame/FrameEditControls";
import { ShareFramePopover } from "@app/components/assistant/conversation/interactive_content/frame/ShareFramePopover";
import type { FrameEditSession } from "@app/components/assistant/conversation/interactive_content/frame/useFrameEditSession";
import { PinPodBannerButton } from "@app/components/pod/files/PinPodBannerButton";
import { PodFileTabButton } from "@app/components/pod/files/PodFileTabButton";
import type { PodFileTab } from "@app/types/pod_file_tab";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  cn,
  Eye,
  Maximize01,
  Minimize01,
  Terminal,
} from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import type { ReactNode, RefObject } from "react";

export interface FrameToolbarPodActions {
  spaceId: string;
  pinnedFramePath: string | null;
  isEditor: boolean;
  framePath: string | null;
  fileName?: string;
  fileTabs: PodFileTab[];
  tabsOrder?: string[];
  hidden?: boolean;
}

interface FrameToolbarProps {
  owner: LightWorkspaceType;
  fileId: string;
  iframeRef: RefObject<HTMLIFrameElement>;
  fileContent: string | null;
  fileName?: string;
  contentType?: string;
  contentHash?: string;
  /**
   * `spread` puts code/beta on the left and actions on the right (conversation
   * panel). `end` packs everything in one trailing cluster (sheet / overlays).
   */
  layout?: "spread" | "end";
  /** When set, shows the code / render toggle. */
  showCode?: boolean;
  onToggleCode?: () => void;
  hasFrameFunctions?: boolean;
  /** When set with canEditV2, shows Preview|Edit|Save controls. */
  editSession?: FrameEditSession;
  canEditV2?: boolean;
  hideEditLabels?: boolean;
  /** Pin / open-as-tab actions when the Frame lives in a Pod. */
  podActions?: FrameToolbarPodActions | null;
  fullscreen?: {
    isFullscreen: boolean;
    onToggle: () => void;
  };
  /** Conversation-only actions (e.g. save-to-pod) rendered after the shared cluster. */
  trailing?: ReactNode;
}

/**
 * Shared Frame action cluster used by conversation and Pod Frame surfaces.
 * Surface-specific chrome (panel close, sheet close, save-to-pod, revert) stays outside.
 */
export function FrameToolbar({
  owner,
  fileId,
  iframeRef,
  fileContent,
  fileName,
  contentType,
  contentHash,
  layout = "spread",
  showCode,
  onToggleCode,
  hasFrameFunctions = false,
  editSession,
  canEditV2 = false,
  hideEditLabels = false,
  podActions = null,
  fullscreen,
  trailing,
}: FrameToolbarProps) {
  const { t } = useLingui();

  const leading = (
    <div className="flex items-center gap-2">
      {onToggleCode !== undefined && (
        <Button
          icon={showCode ? Eye : Terminal}
          onClick={onToggleCode}
          tooltip={showCode ? t`Switch to rendering` : t`Switch to code`}
          variant="ghost"
        />
      )}
      {hasFrameFunctions && <FrameBetaChip />}
    </div>
  );

  const actions = (
    <div className="flex min-w-0 items-center gap-1">
      {canEditV2 && editSession && (
        <FrameEditControls session={editSession} hideLabels={hideEditLabels} />
      )}
      <ExportContentDropdown
        iframeRef={iframeRef}
        owner={owner}
        fileId={fileId}
        fileContent={fileContent}
        fileName={fileName}
        contentType={contentType}
      />
      <ShareFramePopover
        key={contentHash ?? fileId}
        fileId={fileId}
        owner={owner}
        contentHash={contentHash}
      />
      {podActions && (
        <>
          <PinPodBannerButton
            owner={owner}
            spaceId={podActions.spaceId}
            pinnedFramePath={podActions.pinnedFramePath}
            isEditor={podActions.isEditor}
            framePath={podActions.framePath}
            fileName={podActions.fileName}
            hidden={podActions.hidden}
          />
          <PodFileTabButton
            owner={owner}
            spaceId={podActions.spaceId}
            fileTabs={podActions.fileTabs}
            tabsOrder={podActions.tabsOrder}
            isEditor={podActions.isEditor}
            filePath={podActions.framePath}
            fileName={podActions.fileName}
            hidden={podActions.hidden}
          />
        </>
      )}
      {fullscreen && (
        <Button
          icon={fullscreen.isFullscreen ? Minimize01 : Maximize01}
          variant="ghost"
          size="sm"
          tooltip={
            fullscreen.isFullscreen
              ? t`Exit full screen`
              : t`Open in full screen`
          }
          onClick={fullscreen.onToggle}
        />
      )}
      {trailing}
    </div>
  );

  if (layout === "end") {
    return (
      <div className="flex min-w-0 items-center gap-1">
        {leading}
        {actions}
      </div>
    );
  }

  return (
    <div className={cn("flex w-full items-center justify-between")}>
      {leading}
      {actions}
    </div>
  );
}
