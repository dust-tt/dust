import { BracesIcon, PlayIcon, Tab } from "@dust-tt/sparkle";
import type {
  CommandResultMap,
  VisualizationActionType,
  VisualizationRPCCommand,
  VisualizationRPCRequest,
  WorkspaceType,
} from "@dust-tt/types";
import {
  assertNever,
  isVisualizationRPCRequest,
  visualizationExtractCode,
} from "@dust-tt/types";
import type { SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { RenderMessageMarkdown } from "@app/components/assistant/RenderMessageMarkdown";

const sendResponseToIframe = <T extends VisualizationRPCCommand>(
  request: { command: T } & VisualizationRPCRequest,
  response: CommandResultMap[T],
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
  {
    workspaceId,
    onRetry,
    setContentHeight,
  }: {
    workspaceId: string;
    onRetry: () => void;
    setContentHeight: (v: SetStateAction<number>) => void;
  }
) {
  const extractedCode = useMemo(
    () => visualizationExtractCode(action.generation ?? ""),
    [action.generation]
  );

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

      return new Blob([resBuffer], {
        type: response.headers.get("Content-Type") || undefined,
      });
    },
    [workspaceId]
  );

  useEffect(() => {
    const listener = async (event: MessageEvent) => {
      const { data } = event;

      // TODO(2024-07-24 flav) Check origin.
      if (
        !isVisualizationRPCRequest(data) ||
        !event.source ||
        data.actionId !== action.id
      ) {
        return;
      }

      switch (data.command) {
        case "getFile":
          const fileBlob = await getFile(data.params.fileId);

          sendResponseToIframe(data, { fileBlob }, event.source);
          break;

        case "getCodeToExecute":
          if (extractedCode) {
            sendResponseToIframe(data, { code: extractedCode }, event.source);
          }

          break;

        case "retry":
          onRetry();
          break;

        case "setContentHeight":
          setContentHeight(data.params.height);
          break;

        default:
          assertNever(data);
      }
    };

    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [
    action.generation,
    action.id,
    extractedCode,
    getFile,
    onRetry,
    setContentHeight,
  ]);

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
  const [contentHeight, setContentHeight] = useState(0);

  const workspaceId = owner.sId;

  useVisualizationDataHandler(action, {
    workspaceId,
    onRetry,
    setContentHeight,
  });

  useEffect(() => {
    if (activeTab === "code" && action.generation && !tabManuallyChanged) {
      setActiveTab("runtime");
      setTabManuallyChanged(true);
    }
  }, [action.generation, activeTab, tabManuallyChanged]);

  let extractedCode: string | null = null;

  extractedCode = visualizationExtractCode(
    action.generation ?? streamedCode ?? ""
  );

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
        <div
          style={{ height: `${contentHeight}px` }}
          className="max-h-[40vh] w-full"
        >
          <iframe
            className="h-full w-full"
            src={`${process.env.NEXT_PUBLIC_VIZ_URL}/content?aId=${action.id}`}
            sandbox="allow-scripts"
          />
        </div>
      )}
    </>
  );
}
