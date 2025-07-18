import { ContentMessage, ExclamationCircleIcon } from "@dust-tt/sparkle";
import React from "react";

import { CenteredState } from "@app/components/assistant/conversation/content/CenteredState";
import { useInteractiveContentContext } from "@app/components/assistant/conversation/content/InteractiveContentContext";
import { InteractiveContentHeader } from "@app/components/assistant/conversation/content/InteractiveContentHeader";

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
  const { closeContent } = useInteractiveContentContext();

  return (
    <div className="flex h-full flex-col">
      <InteractiveContentHeader
        onClose={closeContent}
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
                This content type is not yet supported in the interactive
                content viewer.
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
