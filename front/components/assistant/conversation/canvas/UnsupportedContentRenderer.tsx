import { ContentMessage, ExclamationCircleIcon } from "@dust-tt/sparkle";
import React from "react";

import { CanvasHeader } from "@app/components/assistant/conversation/canvas/CanvasHeader";
import { CenteredState } from "@app/components/assistant/conversation/canvas/CenteredState";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";

interface UnsupportedContentRendererProps {
  contentType: string;
  fileId: string;
  fileName?: string;
}

export function UnsupportedContentRenderer({
  contentType,
  fileId,
  fileName,
}: UnsupportedContentRendererProps) {
  const { closePanel } = useConversationSidePanelContext();

  return (
    <div className="flex h-full flex-col">
      <CanvasHeader
        onClose={closePanel}
        subtitle={fileId}
        title={fileName || "Unsupported Content"}
      />

      <div className="flex-1 overflow-hidden">
        <CenteredState>
          <ContentMessage
            icon={ExclamationCircleIcon}
            size="md"
            title="Unsupported Content Type"
            variant="warning"
          >
            <div className="space-y-2">
              <p>
                This content type is not yet supported in the canvas drawer.
              </p>
              <div className="text-xs opacity-75">
                <p>
                  <strong>Content Type:</strong> {contentType}
                </p>
                {fileName && (
                  <p>
                    <strong>File:</strong> {fileName}
                  </p>
                )}
              </div>
            </div>
          </ContentMessage>
        </CenteredState>
      </div>
    </div>
  );
}
