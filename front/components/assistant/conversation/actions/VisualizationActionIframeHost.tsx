import { BracesIcon, PlayIcon, Tab } from "@dust-tt/sparkle";
import type {
  VisualizationActionType,
  VisualizationRPCRequest,
  WorkspaceType,
} from "@dust-tt/types";
import {
  assertNever,
  visualizationExtractCodeNonStreaming,
  visualizationExtractCodeStreaming,
} from "@dust-tt/types";
import { useCallback, useEffect, useState } from "react";

import { RenderMessageMarkdown } from "@app/components/assistant/RenderMessageMarkdown";

const answerToIframe = (
  data: VisualizationRPCRequest,
  answer: unknown,
  iframe: MessageEventSource
) => {
  iframe.postMessage(
    {
      command: "answer",
      messageUniqueId: data.messageUniqueId,
      actionId: data.actionId,
      result: answer,
    },
    { targetOrigin: "*" }
  );
};

// Custom hook to encapsulate the logic for handling visualization messages
function useVisualizationAPI(
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
      const data = event.data as VisualizationRPCRequest;
      if (!data || data.actionId !== action.id) {
        return;
      }

      // TODO: typeguards.
      switch (data.command) {
        case "getCodeToExecute":
          if (event.source) {
            const code = action.generation;
            answerToIframe(data, { code }, event.source);
          }
          break;

        case "getFile":
          if (data.params?.fileId) {
            const file = await getFile(data.params.fileId);
            if (event.source) {
              answerToIframe(data, { file }, event.source);
            }
          }
          break;

        case "retry":
          onRetry();
          break;

        default:
          console.error(`Unhandled command: ${data.command}`);
      }
    };

    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [action.generation, action.id, onRetry, getFile]);

  return { getFile };
}

export default function VisualizationActionIframeHost({
  owner,
  action,
  isStreaming,
  streamedCode,
  workspaceId,
  onRetry,
}: {
  conversationId: string;
  owner: WorkspaceType;
  action: VisualizationActionType;
  streamedCode: string | null;
  isStreaming: boolean;
  workspaceId: string;
  onRetry: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"code" | "runtime">("code");
  const [tabManuallyChanged, setTabManuallyChanged] = useState(false);

  useVisualizationAPI(action, workspaceId, onRetry);

  // const useFileWorkspaceWrapped = (fileId: string) =>
  //   useFile(workspaceId, fileId);

  // TODO: Remove useCallback here.
  const getFile = useCallback(
    async (fileId: string) => {
      const response = await fetch(
        `/api/w/${workspaceId}/files/${fileId}?action=view`
      );

      console.log(">> response.status:", response.status);

      if (!response.ok) {
        throw new Error(`Failed to fetch file ${fileId}`);
      }

      const resBuffer = await response.arrayBuffer();

      // TODO: Try/catch block.

      return new File([resBuffer], fileId, {
        type: response.headers.get("Content-Type") || undefined,
      });
    },
    [workspaceId]
  );

  useEffect(() => {
    async function listener(event: MessageEvent) {
      console.log(">>> event:", event);
      const data = event.data as VisualizationRPCRequest;
      if (!data || !data.actionId || data.actionId !== action.id) {
        return;
      }

      switch (data.command) {
        case "getCodeToExecute": {
          if (event.source) {
            answerToIframe(data, { code: action.generation }, event.source);
          }
          break;
        }

        case "getFile": {
          console.log("getFile", data);
          const fileId = data.params?.fileId;
          if (fileId) {
            const file = await getFile(fileId);

            if (event.source) {
              answerToIframe(data, { file }, event.source);
            }
          }
          break;
        }

        case "retry": {
          onRetry();
          break;
        }
        default:
          assertNever(data.command);
      }
    }
    window.addEventListener("message", listener);
    return () => {
      window.removeEventListener("message", listener);
    };
  }, [action.generation, action.id, onRetry, getFile]);

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
          // localhost URL needs to be dynamic for dev/prod
          src={`http://localhost:3003/content?wId=${owner.sId}&aId=${action.id}`}
          sandbox="allow-scripts "
        />
      )}
    </>
  );
}
