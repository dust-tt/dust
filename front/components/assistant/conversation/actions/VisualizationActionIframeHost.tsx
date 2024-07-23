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
import { useEffect, useState } from "react";

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

export default function VisualizationActionIframeHost({
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

  useEffect(() => {
    function listener(event: MessageEvent) {
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
  }, [action.generation, action.id, onRetry]);

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
          src={`http://localhost:3003/?wId=${owner.sId}&aId=${action.id}`}
          sandbox="allow-scripts "
        />
      )}
    </>
  );
}
