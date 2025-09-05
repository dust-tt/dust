import {
  ArrowDownOnSquareIcon,
  Button,
  CodeBlock,
  CommandLineIcon,
  EyeIcon,
  FullscreenExitIcon,
  FullscreenIcon,
  Spinner,
} from "@dust-tt/sparkle";
import React, { useCallback, useEffect, useRef } from "react";

import { VisualizationActionIframe } from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import { DEFAULT_RIGHT_PANEL_SIZE } from "@app/components/assistant/conversation/constant";
import { CenteredState } from "@app/components/assistant/conversation/content_creation/CenteredState";
import { ContentCreationHeader } from "@app/components/assistant/conversation/content_creation/ContentCreationHeader";
import { ShareContentCreationFilePopover } from "@app/components/assistant/conversation/content_creation/ShareContentCreationFilePopover";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { useDesktopNavigation } from "@app/components/navigation/DesktopNavigationContext";
import { useHashParam } from "@app/hooks/useHashParams";
import { isFileUsingConversationFiles } from "@app/lib/files";
import { useFileContent } from "@app/lib/swr/files";
import type {
  ConversationWithoutContentType,
  LightWorkspaceType,
} from "@app/types";

interface ExportContentDropdownProps {
  iframeRef: React.RefObject<HTMLIFrameElement>;
}

function ExportContentDropdown({ iframeRef }: ExportContentDropdownProps) {
  const exportVisualization = React.useCallback(
    (format: "png" | "svg") => {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          { type: `EXPORT_${format.toUpperCase()}` },
          "*"
        );
      } else {
        console.log("No iframe content window found");
      }
    },
    [iframeRef]
  );

  return (
    <Button
      icon={ArrowDownOnSquareIcon}
      size="xs"
      tooltip="Export as PNG"
      variant="ghost"
      onClick={() => exportVisualization("png")}
    />
  );
}

interface ClientExecutableRendererProps {
  conversation: ConversationWithoutContentType;
  fileId: string;
  fileName?: string;
  owner: LightWorkspaceType;
}

const FULL_SCREEN_HASH_PARAM = "fullScreen";

export function ClientExecutableRenderer({
  conversation,
  fileId,
  fileName,
  owner,
}: ClientExecutableRendererProps) {
  const { isNavigationBarOpen, setIsNavigationBarOpen } =
    useDesktopNavigation();
  const isNavBarPrevOpenRef = useRef(isNavigationBarOpen);
  const prevPanelSizeRef = useRef(DEFAULT_RIGHT_PANEL_SIZE);

  const { closePanel, panelRef } = useConversationSidePanelContext();
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  const panel = panelRef?.current;

  const [fullScreenHash, setFullScreenHash] = useHashParam(
    FULL_SCREEN_HASH_PARAM
  );
  const isFullScreen = fullScreenHash === "true";

  const { fileContent, isFileContentLoading, error } = useFileContent({
    fileId,
    owner,
  });

  const isUsingConversationFiles = React.useMemo(
    () => (fileContent ? isFileUsingConversationFiles(fileContent) : false),
    [fileContent]
  );

  const [showCode, setShowCode] = React.useState(false);

  const restoreLayout = useCallback(() => {
    if (panel) {
      setIsNavigationBarOpen(isNavBarPrevOpenRef.current ?? true);
      panel.resize(prevPanelSizeRef.current ?? DEFAULT_RIGHT_PANEL_SIZE);
    }
  }, [panel, setIsNavigationBarOpen]);

  const exitFullScreen = useCallback(() => {
    setFullScreenHash(undefined);
  }, [setFullScreenHash]);

  const goToFullScreen = () => {
    isNavBarPrevOpenRef.current = isNavigationBarOpen;

    if (panel) {
      prevPanelSizeRef.current = panel.getSize();
    }

    setFullScreenHash("true");
  };

  const onClosePanel = () => {
    if (panel && isFullScreen) {
      setFullScreenHash(undefined);
      restoreLayout();
    }

    closePanel();
  };

  useEffect(() => {
    if (!panel) {
      return;
    }

    if (isFullScreen) {
      panel.resize(100);
      setIsNavigationBarOpen(false);
    } else {
      // Only exit fullscreen if we're currently at 100% & nav bar is closed (= full screen mode)
      if (panel.getSize() === 100 && !isNavigationBarOpen) {
        restoreLayout();
      }
    }
  }, [
    panel,
    isFullScreen,
    isNavigationBarOpen,
    setIsNavigationBarOpen,
    restoreLayout,
  ]);

  // ESC key event listener to exit full screen mode
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isFullScreen) {
        exitFullScreen();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullScreen, exitFullScreen]);

  if (isFileContentLoading) {
    return (
      <CenteredState>
        <Spinner size="sm" />
        <span>Loading Content Creation...</span>
      </CenteredState>
    );
  }

  if (error) {
    return (
      <CenteredState>
        <p className="text-warning-500">Error loading file: {error}</p>
      </CenteredState>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ContentCreationHeader
        title={fileName || "Client Executable"}
        subtitle={fileId}
        onClose={onClosePanel}
      >
        <Button
          icon={isFullScreen ? FullscreenExitIcon : FullscreenIcon}
          variant="ghost"
          size="xs"
          onClick={isFullScreen ? exitFullScreen : goToFullScreen}
          tooltip={`${isFullScreen ? "Exit" : "Go to"} full screen mode`}
        />

        <Button
          icon={showCode ? EyeIcon : CommandLineIcon}
          onClick={() => setShowCode(!showCode)}
          size="xs"
          tooltip={showCode ? "Switch to Rendering" : "Switch to Code"}
          variant="ghost"
        />
        <ExportContentDropdown iframeRef={iframeRef} />
        <ShareContentCreationFilePopover
          fileId={fileId}
          owner={owner}
          isUsingConversationFiles={isUsingConversationFiles}
        />
      </ContentCreationHeader>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {showCode ? (
          <div className="h-full overflow-auto px-4">
            <CodeBlock wrapLongLines className="language-tsx">
              {fileContent}
            </CodeBlock>
          </div>
        ) : (
          <div className="h-full">
            <VisualizationActionIframe
              agentConfigurationId={null}
              workspace={owner}
              visualization={{
                code: fileContent ?? "",
                complete: true,
                identifier: `viz-${fileId}`,
              }}
              key={`viz-${fileId}`}
              conversationId={conversation.sId}
              isInDrawer={true}
              ref={iframeRef}
            />
          </div>
        )}
      </div>
    </div>
  );
}
