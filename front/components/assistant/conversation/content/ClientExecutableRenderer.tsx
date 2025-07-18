import {
  Button,
  CodeBlock,
  CommandLineIcon,
  SparklesIcon,
  Spinner,
} from "@dust-tt/sparkle";
import React from "react";

import { VisualizationActionIframe } from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import { CenteredState } from "@app/components/assistant/conversation/content/CenteredState";
import { useFileContent } from "@app/lib/swr/files";
import type { ConversationType, LightWorkspaceType } from "@app/types";

import { useInteractiveContentContext } from "./InteractiveContentContext";
import { InteractiveContentHeader } from "./InteractiveContentHeader";

interface ClientExecutableRendererProps {
  conversation: ConversationType;
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
  const { closeContent } = useInteractiveContentContext();
  const { fileContent, isFileContentLoading, error } = useFileContent({
    fileId,
    owner,
  });
  const [showCode, setShowCode] = React.useState(false);

  if (isFileContentLoading) {
    return (
      <CenteredState>
        <Spinner size="sm" />
        <span>Loading interactive content...</span>
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
      <InteractiveContentHeader
        title={fileName || "Client Executable"}
        subtitle={fileId}
        onClose={closeContent}
      >
        <Button
          size="xs"
          variant="outline"
          icon={showCode ? SparklesIcon : CommandLineIcon}
          onClick={() => setShowCode(!showCode)}
          tooltip={showCode ? "Switch to Rendering" : "Switch to Code"}
        />
      </InteractiveContentHeader>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {showCode ? (
          <div className="h-full overflow-auto p-4">
            <CodeBlock wrapLongLines className="language-tsx">
              {fileContent}
            </CodeBlock>
          </div>
        ) : (
          <div className="h-full">
            <VisualizationActionIframe
              // TODO(INTERACTIVE_CONTENT 2025-07-18): Add agent configuration ID.
              agentConfigurationId={null}
              owner={owner}
              visualization={{
                code: fileContent ?? "",
                complete: true,
                identifier: `viz-${fileId}`,
              }}
              key={`viz-${fileId}`}
              conversationId={conversation.sId}
              isInDrawer={true}
            />
          </div>
        )}
      </div>
    </div>
  );
}
