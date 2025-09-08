import { Spinner } from "@dust-tt/sparkle";
import { useCallback, useEffect, useState } from "react";

import { VisualizationActionIframe } from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import { CenteredState } from "@app/components/assistant/conversation/content_creation/CenteredState";
import { PublicContentCreationHeader } from "@app/components/assistant/conversation/content_creation/PublicContentCreationHeader";
import { formatFilenameForDisplay } from "@app/lib/files";
import { usePublicFile } from "@app/lib/swr/files";

interface PublicClientExecutableRendererProps {
  fileId: string;
  fileName?: string;
  shareToken: string;
}

export function PublicClientExecutableRenderer({
  fileId,
  fileName,
  shareToken,
}: PublicClientExecutableRendererProps) {
  const { fileContent, isFileLoading, isFileError } = usePublicFile({
    shareToken,
    includeContent: true,
  });

  const [isFullScreen, setIsFullScreen] = useState(false);

  const enterFullScreen = useCallback(async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else if ((document.documentElement as any).webkitRequestFullscreen) {
        // Safari
        await (document.documentElement as any).webkitRequestFullscreen();
      } else if ((document.documentElement as any).msRequestFullscreen) {
        // IE/Edge
        await (document.documentElement as any).msRequestFullscreen();
      }
    } catch (error) {
      console.error("Error entering fullscreen:", error);
    }
  }, []);

  const exitFullScreen = useCallback(async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        // Safari
        await (document as any).webkitExitFullscreen();
      } else if ((document as any).msExitFullscreen) {
        // IE/Edge
        await (document as any).msExitFullscreen();
      }
    } catch (error) {
      console.error("Error exiting fullscreen:", error);
    }
  }, []);

  const handleFullScreenToggle = useCallback(() => {
    if (isFullScreen) {
      void exitFullScreen();
    } else {
      void enterFullScreen();
    }
  }, [isFullScreen, enterFullScreen, exitFullScreen]);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullScreenChange = () => {
      const isCurrentlyFullScreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullScreen(isCurrentlyFullScreen);
    };

    // Add event listeners for different browsers
    document.addEventListener("fullscreenchange", handleFullScreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullScreenChange);
    document.addEventListener("msfullscreenchange", handleFullScreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullScreenChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        handleFullScreenChange
      );
      document.removeEventListener(
        "msfullscreenchange",
        handleFullScreenChange
      );
    };
  }, []);

  // Global keyboard event listener for ESC and Cmd/Ctrl+F
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // ESC key to exit full screen mode
      if (event.key === "Escape" && isFullScreen) {
        void exitFullScreen();
        return;
      }

      // Cmd+F (Mac) or Ctrl+F (Windows/Linux) to toggle fullscreen
      if (event.key === "f") {
        event.preventDefault(); // Prevent browser's default find functionality
        handleFullScreenToggle();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullScreen, exitFullScreen, handleFullScreenToggle]);

  if (isFileLoading) {
    return (
      <CenteredState>
        <Spinner size="sm" />
        <span>Loading Content Creation...</span>
      </CenteredState>
    );
  }

  if (isFileError) {
    return (
      <CenteredState>
        <p className="text-warning-500">Error loading file: {isFileError}</p>
      </CenteredState>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PublicContentCreationHeader
        title={formatFilenameForDisplay(fileName ?? "Content Creation")}
        isFullScreen={isFullScreen}
        onFullScreenToggle={handleFullScreenToggle}
      />

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full">
          <VisualizationActionIframe
            agentConfigurationId={null}
            conversationId={null}
            workspace={null}
            visualization={{
              code: fileContent ?? "",
              complete: true,
              identifier: `viz-${fileId}`,
            }}
            key={`viz-${fileId}`}
            isInDrawer={true}
          />
        </div>
      </div>
    </div>
  );
}
