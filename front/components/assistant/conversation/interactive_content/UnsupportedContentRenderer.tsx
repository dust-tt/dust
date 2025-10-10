import { ContentMessage, ExclamationCircleIcon } from "@dust-tt/sparkle";
import React from "react";

import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { CenteredState } from "@app/components/assistant/conversation/interactive_content/CenteredState";
import { InteractiveContentHeader } from "@app/components/assistant/conversation/interactive_content/InteractiveContentHeader";

interface UnsupportedContentRendererProps {
  contentType: string;
  fileName?: string;
}

export function UnsupportedContentRenderer({
  contentType,
  fileName,
}: UnsupportedContentRendererProps) {
  const { closePanel } = useConversationSidePanelContext();

  return (
    <div className="flex h-full flex-col">
      <InteractiveContentHeader onClose={closePanel} />

      <div className="flex-1 overflow-hidden">
        <CenteredState>
          <ContentMessage
            icon={ExclamationCircleIcon}
            size="md"
            title="Unsupported Content Type"
            variant="warning"
          >
            <div className="space-y-2">
              <p>This content type is not yet supported in the Frame drawer.</p>
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
