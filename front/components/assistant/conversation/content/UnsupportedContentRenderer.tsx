import { ExclamationCircleIcon } from "@dust-tt/sparkle";
import React from "react";

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
        title={fileName || "Unsupported Content"}
        subtitle={fileId}
        onClose={closeContent}
      />

      <div className="flex-1 overflow-hidden">
        <div className="flex h-full items-center justify-center p-8">
          <div className="bg-structure-50 text-element-700 max-w-md rounded border p-6 text-center">
            <div className="mb-4">
              <ExclamationCircleIcon className="text-element-500 mx-auto h-12 w-12" />
            </div>
            <h3 className="text-element-900 mb-2 text-lg font-medium">
              Unsupported Content Type
            </h3>
            <p className="text-element-600 mb-4 text-sm">
              This content type is not yet supported in the interactive content
              viewer.
            </p>
            <div className="text-element-700 bg-structure-100 rounded p-3 text-xs">
              <p>
                <strong>Content Type:</strong> {contentType}
              </p>
              {fileName && (
                <p className="mt-1">
                  <strong>File:</strong> {fileName}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
