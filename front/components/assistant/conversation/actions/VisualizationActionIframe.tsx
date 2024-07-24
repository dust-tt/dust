import { BracesIcon, PlayIcon, Tab } from "@dust-tt/sparkle";
import type {
  VisualizationActionType,
  VisualizationRPCRequest,
  WorkspaceType,
} from "@dust-tt/types";
import {
  isGetCodeToExecuteRequest,
  isGetFileRequest,
  isRetryRequest,
  isVisualizationRPCRequest,
  visualizationExtractCodeNonStreaming,
  visualizationExtractCodeStreaming,
} from "@dust-tt/types";
import { useCallback, useEffect, useState } from "react";

import { RenderMessageMarkdown } from "@app/components/assistant/RenderMessageMarkdown";

const sendIframeResponse = (
  request: VisualizationRPCRequest,
  response: unknown,
  target: MessageEventSource
) => {
  target.postMessage(
    {
      command: "answer",
      messageUniqueId: request.messageUniqueId,
      actionId: request.actionId,
      result: response,
    },
    // TODO(2024-07-24 flav) Restrict origin.
    { targetOrigin: "*" }
  );
};

// Custom hook to encapsulate the logic for handling visualization messages.
function useVisualizationDataHandler(
  action: VisualizationActionType,
  workspaceId: string,
  onRetry: () => void
) {
  const getFile = useCallback(
    async (fileId: string) => {
      const response = await fetch(
        `/api/w/${workspaceId}/files/${fileId}?action=view`
      );
      if (!response.ok) {
        // TODO(2024-07-24 flav) Propagate the error to the iframe.
        throw new Error(`Failed to fetch file ${fileId}`);
      }

      const resBuffer = await response.arrayBuffer();
      return new File([resBuffer], fileId, {
        type: response.headers.get("Content-Type") || undefined,
      });
    },
    [workspaceId]
  );

  useEffect(() => {
    const listener = async (event: MessageEvent) => {
      const { data } = event;

      console.log(data);
      // TODO(2024-07-24 flav) Check origin.
      if (!isVisualizationRPCRequest(data) || !event.source) {
        return;
      }

      if (isGetFileRequest(data)) {
        const file = await getFile(data.params.fileId);

        sendIframeResponse(data, { file }, event.source);
      } else if (isGetCodeToExecuteRequest(data)) {
        const code = action.generation;

        sendIframeResponse(data, { code }, event.source);
      } else if (isRetryRequest(data)) {
        // TODO(2024-07-24 flav) Pass the error message to the host window.
        onRetry();
      }

      // TODO: Types above are not accurate, as it can pass the first check but won't enter any if block.
    };

    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [action.generation, action.id, onRetry, getFile]);

  return { getFile };
}

export function VisualizationActionIframe({
  owner,
  action,
  isStreaming,
  streamedCode,
  onRetry,
}: {
  conversationId: string;
  owner: WorkspaceType;
  action: VisualizationActionType;
  streamedCode: string | null;
  isStreaming: boolean;
  onRetry: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"code" | "runtime">("code");
  const [tabManuallyChanged, setTabManuallyChanged] = useState(false);

  const workspaceId = owner.sId;

  useVisualizationDataHandler(action, workspaceId, onRetry);

  useEffect(() => {
    if (activeTab === "code" && action.generation && !tabManuallyChanged) {
      setActiveTab("runtime");
      setTabManuallyChanged(true);
    }
  }, [action.generation, activeTab, tabManuallyChanged]);

  let extractedCode: string | null = null;

  if (action.generation) {
    extractedCode = visualizationExtractCodeNonStreaming(action.generation);
  } else {
    extractedCode = visualizationExtractCodeStreaming(streamedCode || "");
  }

  return (
    <>
      <Tab
        tabs={[
          {
            label: "Code",
            id: "code",
            current: activeTab === "code",
            icon: BracesIcon,
            sizing: "expand",
          },
          {
            label: "Run",
            id: "runtime",
            current: activeTab === "runtime",
            icon: PlayIcon,
            sizing: "expand",
            hasSeparator: true,
          },
        ]}
        setCurrentTab={(tabId, event) => {
          event.preventDefault();
          setActiveTab(tabId as "code" | "runtime");
        }}
      />
      {activeTab === "code" && extractedCode && extractedCode.length > 0 && (
        <RenderMessageMarkdown
          content={"```javascript\n" + extractedCode + "\n```"}
          isStreaming={isStreaming}
        />
      )}
      {activeTab === "runtime" && (
        <iframe
          style={{ width: "100%", height: "600px" }}
          src={`${process.env.NEXT_PUBLIC_VIZ_URL}?aId=${action.id}`}
          sandbox="allow-scripts "
        />
      )}
    </>
  );
}
