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
  Spinner,
} from "@dust-tt/sparkle";
import React from "react";

import { VisualizationActionIframe } from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import { CanvasHeader } from "@app/components/assistant/conversation/canvas/CanvasHeader";
import { CenteredState } from "@app/components/assistant/conversation/canvas/CenteredState";
import { ShareCanvasFilePopover } from "@app/components/assistant/conversation/canvas/ShareCanvasFilePopover";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
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
  const { closePanel } = useConversationSidePanelContext();
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  const { fileContent, isFileContentLoading, error } = useFileContent({
    fileId,
    owner,
  });

  const isUsingConversationFiles = React.useMemo(
    () => (fileContent ? isFileUsingConversationFiles(fileContent) : false),
    [fileContent]
  );

  const [showCode, setShowCode] = React.useState(false);

  if (isFileContentLoading) {
    return (
      <CenteredState>
        <Spinner size="sm" />
        <span>Loading canvas...</span>
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
      <CanvasHeader
        title={fileName || "Client Executable"}
        subtitle={fileId}
        onClose={closePanel}
      >
        <Button
          icon={showCode ? EyeIcon : CommandLineIcon}
          onClick={() => setShowCode(!showCode)}
          size="xs"
          tooltip={showCode ? "Switch to Rendering" : "Switch to Code"}
          variant="ghost"
        />
        <ExportContentDropdown iframeRef={iframeRef} />
        <ShareCanvasFilePopover
          fileId={fileId}
          owner={owner}
          disabled={isUsingConversationFiles}
          tooltip={
            isUsingConversationFiles
              ? "This canvas file uses conversation files. It cannot be shared publicly."
              : "Share public link"
          }
        />
      </CanvasHeader>

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
