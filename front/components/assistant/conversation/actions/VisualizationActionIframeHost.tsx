import { BracesIcon, PlayIcon, Tab } from "@dust-tt/sparkle";
import type { VisualizationActionType, WorkspaceType } from "@dust-tt/types";
import {
  assertNever,
  visualizationExtractCodeNonStreaming,
  visualizationExtractCodeStreaming,
} from "@dust-tt/types";
import { useEffect, useState } from "react";

import type { CrossWindowRequest } from "@app/components/assistant/conversation/actions/VisualizationIframe";
import { RenderMessageMarkdown } from "@app/components/assistant/RenderMessageMarkdown";

const answerToIframe = (
  data: CrossWindowRequest,
  answer: unknown,
  iframe: MessageEventSource
) => {
  iframe.postMessage({
    command: "answer",
    messageUniqueId: data.messageUniqueId,
    actionId: data.actionId,
    result: answer,
  });
};

export default function VisualizationActionIframeHost({
  owner,
  action,
  conversationId,
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
      const data = event.data as CrossWindowRequest;
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
          src={`/w/${owner.sId}/assistant/${conversationId}/visualization/${action.id}/iframe`}
        />
      )}
    </>
  );
}
