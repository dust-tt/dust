import { Button, CodeBlock, Spinner } from "@dust-tt/sparkle";
import React from "react";

import { useFileContent } from "@app/lib/swr/files";
import type { LightWorkspaceType } from "@app/types";

interface ClientExecutableRendererProps {
  fileId: string;
  owner: LightWorkspaceType;
}

export function ClientExecutableRenderer({
  fileId,
  owner,
}: ClientExecutableRendererProps) {
  const { fileContent, isFileContentLoading, error } = useFileContent({
    fileId,
    owner,
  });

  const [showCode, setShowCode] = React.useState(false);

  if (isFileContentLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner size="sm" />
        <span className="ml-2">Loading executable code...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-red-600">
        <p>Error loading file: {error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header Controls */}
      <div className="border-structure-200 flex items-center gap-2 border-b px-4 py-2">
        <Button
          size="xs"
          variant={showCode ? "primary" : "outline"}
          onClick={() => setShowCode(!showCode)}
        >
          {showCode ? "Hide Code" : "Show Code"}
        </Button>
        <span className="text-element-700 text-xs">
          Interactive React Component
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {showCode ? (
          <div className="h-full overflow-auto p-4">
            <CodeBlock
              wrapLongLines
              className="language-tsx bg-structure-100 text-element-900 rounded border p-4 text-sm"
            >
              {fileContent}
            </CodeBlock>
          </div>
        ) : (
          <div className="h-full p-4">
            <div className="bg-structure-50 flex h-full items-center justify-center rounded border-2 border-dashed">
              <div className="text-element-700 text-center">
                <p className="text-sm">Interactive Component Execution</p>
                <p className="mt-1 text-xs">Component will render here</p>
                <p className="mt-2 text-xs">File ID: {fileId}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
