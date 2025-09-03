import {
  ArrowDownOnSquareIcon,
  Button,
  CodeBlock,
  CommandLineIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EyeIcon,
  FullscreenExitIcon,
  FullscreenIcon,
  Spinner,
} from "@dust-tt/sparkle";
import React, { useRef, useState } from "react";

import { VisualizationActionIframe } from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import { CenteredState } from "@app/components/assistant/conversation/content_creation/CenteredState";
import { ContentCreationHeader } from "@app/components/assistant/conversation/content_creation/ContentCreationHeader";
import { ShareContentCreationFilePopover } from "@app/components/assistant/conversation/content_creation/ShareContentCreationFilePopover";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { useDesktopNavigation } from "@app/components/navigation/DesktopNavigationContext";
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          icon={ArrowDownOnSquareIcon}
          isSelect
          size="xs"
          tooltip="Export content"
          variant="ghost"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => exportVisualization("png")}>
          Export as PNG
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportVisualization("svg")}>
          Export as SVG
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ClientExecutableRendererProps {
  conversation: ConversationWithoutContentType;
  fileId: string;
  fileName?: string;
  owner: LightWorkspaceType;
}

export function ClientExecutableRenderer({
  conversation,
  fileId,
  fileName,
  owner,
}: ClientExecutableRendererProps) {
  const { isNavigationBarOpen, setIsNavigationBarOpen } =
    useDesktopNavigation();
  const isNavBarPrevOpenRef = useRef(isNavigationBarOpen);
  const prevPanelSizeRef = useRef(40);

  const { closePanel, panelRef } = useConversationSidePanelContext();
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  const panel = panelRef?.current;

  // We need to track this with state to re-render.
  const [isFullScreen, setIsFullScreen] = useState(
    panel ? panel.getSize() === 100 : false
  );

  const { fileContent, isFileContentLoading, error } = useFileContent({
    fileId,
    owner,
  });

  const isUsingConversationFiles = React.useMemo(
    () => (fileContent ? isFileUsingConversationFiles(fileContent) : false),
    [fileContent]
  );

  const [showCode, setShowCode] = React.useState(false);

  function exitFullScreen() {
    // If the nav bar was open before we go to full screen mode, restore it but
    // otherwise keep it close.
    if (isNavBarPrevOpenRef.current) {
      setIsNavigationBarOpen(true);
    }
    setIsFullScreen(false);
    panel?.resize(prevPanelSizeRef.current);
  }

  function goToFullScreen() {
    if (panel) {
      isNavBarPrevOpenRef.current = isNavigationBarOpen;
      prevPanelSizeRef.current = panel.getSize();

      panel.resize(100);
      setIsFullScreen(true);
      setIsNavigationBarOpen(false);
    }
  }

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
        onClose={isFullScreen ? exitFullScreen : closePanel}
      >
        {!isFullScreen && (
          <Button
            icon={isFullScreen ? FullscreenExitIcon : FullscreenIcon}
            variant="ghost"
            onClick={goToFullScreen}
            tooltip={isFullScreen ? "expand" : "shrink"}
          />
        )}

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
