import { BracesIcon, IconToggleButton, Spinner } from "@dust-tt/sparkle";
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
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RenderMessageMarkdown } from "@app/components/assistant/RenderMessageMarkdown";
import { classNames } from "@app/lib/utils";

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
    onRetry,
    setContentHeight,
    vizIframeRef,
    workspaceId,
    streamedCode,
  }: {
    onRetry: () => void;
    setContentHeight: (v: SetStateAction<number>) => void;
    vizIframeRef: React.MutableRefObject<HTMLIFrameElement | null>;
    workspaceId: string;
    streamedCode: string | null;
  }
) {
  const code = action.generation ?? streamedCode ?? "";

  const { extractedCode } = useMemo(
    () => visualizationExtractCode(code),
    [code]
  );

  const getFileBlob = useCallback(
    async (fileId: string) => {
      const response = await fetch(
        `/api/w/${workspaceId}/files/${fileId}?action=view`
      );
      if (!response.ok) {
        return null;
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

      const isOriginatingFromViz =
        event.source && event.source === vizIframeRef.current?.contentWindow;

      if (
        !isVisualizationRPCRequest(data) ||
        !isOriginatingFromViz ||
        data.actionId !== action.id
      ) {
        return;
      }

      switch (data.command) {
        case "getFile":
          const fileBlob = await getFileBlob(data.params.fileId);

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
    getFileBlob,
    onRetry,
    setContentHeight,
    vizIframeRef,
  ]);
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
  const [contentHeight, setContentHeight] = useState(0);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [showSpinner, setShowSpinner] = useState(true);
  const [activeIndex, setActiveIndex] = useState(1);

  const vizIframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLDivElement>(null);

  const workspaceId = owner.sId;

  useVisualizationDataHandler(action, {
    workspaceId,
    onRetry,
    setContentHeight,
    vizIframeRef,
    streamedCode,
  });

  const { extractedCode, isComplete: codeFullyGenerated } =
    visualizationExtractCode(action.generation ?? streamedCode ?? "");

  useEffect(() => {
    if (!codeFullyGenerated) {
      // Display spinner over the code block while waiting for code generation.
      setShowSpinner(!extractedCode);
      setActiveIndex(0);
    } else if (iframeLoaded) {
      // Display iframe if code is generated and iframe has loaded.
      setShowSpinner(false);
      setActiveIndex(1);
    } else {
      // Show spinner while iframe is loading.
      setShowSpinner(true);
      setActiveIndex(1);
    }
  }, [codeFullyGenerated, extractedCode, iframeLoaded]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    if (activeIndex === 0) {
      // Set height of the container to the height of the code block if the code is fully generated
      // Otherwise, set the height to 100% to allow the code to grow as it gets generated.
      containerRef.current.style.height = codeFullyGenerated
        ? `${codeRef.current?.scrollHeight}px`
        : "100%";
    } else if (activeIndex === 1) {
      containerRef.current.style.height = `${contentHeight}px`;
    }
  }, [activeIndex, contentHeight, codeFullyGenerated]);

  return (
    <div className="relative flex flex-col">
      <Tabs
        tabs={["Code", "Visualisation"]}
        disabled={!codeFullyGenerated}
        activeIndex={activeIndex}
        onTabClick={setActiveIndex}
      />
      {showSpinner && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white bg-opacity-75">
          <Spinner />
        </div>
      )}
      <div
        className="transition-height relative min-h-96 w-full overflow-hidden duration-500 ease-in-out"
        ref={containerRef}
      >
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{
            transform: `translateX(-${activeIndex * 100}%)`,
          }}
        >
          <div className="flex h-full w-full shrink-0" ref={codeRef}>
            <RenderMessageMarkdown
              content={"```javascript\n" + (extractedCode ?? "") + "\n```"}
              isStreaming={!codeFullyGenerated && isStreaming}
            />
          </div>
          <div className="relative flex h-full w-full shrink-0 items-center justify-center">
            {codeFullyGenerated && (
              <div
                style={{ height: `${contentHeight}px` }}
                className={classNames("max-h-[60vh] w-full")}
              >
                <iframe
                  ref={vizIframeRef}
                  // Set a min height so iframe can display error.
                  className="h-full min-h-96 w-full"
                  src={`${process.env.NEXT_PUBLIC_VIZ_URL}/content?aId=${action.id}`}
                  sandbox="allow-scripts"
                  onLoad={() => setIframeLoaded(true)}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const Tabs = ({
  activeIndex,
  disabled,
  onTabClick,
  tabs,
}: {
  activeIndex: number;
  disabled: boolean;
  onTabClick: (tabIndex: number) => void;
  tabs: string[];
}) => {
  return (
    <div className="flex pb-2">
      <div className="rounded-lg bg-gray-100 p-2">
        {tabs.map((tab, index) => (
          <button
            key={tab}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-gray-800 focus:outline-none ${activeIndex === index ? "bg-white shadow" : ""} disabled:cursor-not-allowed disabled:opacity-50`}
            onClick={() => onTabClick(index)}
            disabled={disabled}
          >
            {tab}
          </button>
        ))}
      </div>
    </div>
  );
};
