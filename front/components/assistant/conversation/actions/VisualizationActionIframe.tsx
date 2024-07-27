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
  const vizIframeRef = useRef(null);

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

  const iframeRendered = contentHeight !== 0;

  // const mode = (() => {
  //   // User clicked on code toggle => show code
  //   // Code generation has not started => show spinner
  //   // Code generation has not yet completed => show streaming code
  //   // Code generation has completed but iframe is not rendered yet => show spinner
  //   // Code is fully generated and iframe is rendered => show iframe
  //   // if (codeToggled) {
  //   //   return "code";
  //   // }
  //   if (!codeFullyGenerated) {
  //     return "spinner";
  //     // return extractedCode ? "code" : "spinner";
  //   }
  //   return iframeRendered ? "iframe" : "spinner";
  // })();

  const [showSpinner, setShowSpinner] = useState(true);
  const [activeIndex, setActiveIndex] = useState(1);

  useEffect(() => {
    console.log(">> codeFullyGenerated", codeFullyGenerated);
    console.log(">> extractedCode", extractedCode);
    if (!codeFullyGenerated) {
      if (!extractedCode) {
        setShowSpinner(true);
      } else {
        setShowSpinner(false);
      }
      setActiveIndex(0);
    } else if (iframeRendered) {
      setShowSpinner(false);
      setActiveIndex(1);
    } else {
      setShowSpinner(true);
      setActiveIndex(1);
    }
  }, [codeFullyGenerated, extractedCode, iframeRendered]);

  // useEffect(() => {
  //   if (!codeFullyGenerated || !iframeRendered) {
  //     setShowSpinner(true);
  //   } else {
  //     setShowSpinner(false);
  //   }
  // }, [codeFullyGenerated, iframeRendered]);

  // useEffect(() => {
  //   if (mode === "iframe" || mode === "spinner") {
  //     setActiveIndex(1);
  //   } else if (mode === "code") {
  //     setActiveIndex(0);
  //   }
  // }, [mode]);

  const [containerHeight, setContainerHeight] = useState("h-full");

  useEffect(() => {
    if (activeIndex === 0) {
      setContainerHeight("100%");
    } else if (activeIndex === 1) {
      setContainerHeight(`${contentHeight}px`);
    }
  }, [activeIndex, contentHeight]);

  // TODO: iframeRendered does not work if the iframe fails.
  return (
    <div className="relative flex flex-col">
      {/* // TODO: Disable the click. */}
      {/* {iframeRendered && ( */}
      <div className="flex pb-2">
        <div className="rounded-lg bg-gray-100 p-2">
          {["Code", "Visualisation"].map((tab, index) => (
            <button
              key={tab}
              className={`rounded-lg px-4 py-2 text-sm font-medium text-gray-800 focus:outline-none ${activeIndex === index ? "bg-white shadow" : ""}`}
              onClick={() => setActiveIndex(index)}
              disabled={!codeFullyGenerated}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>
      {/* )} */}
      {showSpinner && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white bg-opacity-75">
          <Spinner />
        </div>
      )}
      <div
        className="transition-height relative min-h-96 w-full overflow-hidden duration-500 ease-in-out"
        style={{ height: containerHeight }}
      >
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{
            transform: `translateX(-${activeIndex * 100}%)`,
          }}
        >
          <div className="flex h-full w-full shrink-0">
            <RenderMessageMarkdown
              content={"```javascript\n" + (extractedCode ?? "") + "\n```"}
              isStreaming={!codeFullyGenerated && isStreaming}
            />
          </div>
          <div className="relative flex h-full min-h-96 w-full shrink-0 items-center justify-center">
            {codeFullyGenerated && (
              // We render the iframe as soon as we have the code.
              // Until it is actually rendered, we're showing a spinner so
              // we use opacity-0 to hide the iframe.
              // We also disable pointer event to allow interacting with the rest.
              <div
                style={{ height: `${contentHeight}px` }}
                className={classNames("max-h-[60vh] w-full")}
              >
                <iframe
                  ref={vizIframeRef}
                  className="h-full w-full"
                  src={`${process.env.NEXT_PUBLIC_VIZ_URL}/content?aId=${action.id}`}
                  sandbox="allow-scripts"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // return (
  //   <div className="relative">
  //     {mode === "iframe" && (
  //       // If we displaying the iframe, we need to offset the agent message
  //       // content to make space for the iframe.
  //       <div
  //         style={{
  //           height: `${contentHeight}px`,
  //         }}
  //       />
  //     )}
  //     <div>
  //       {mode === "code" && (
  //         <RenderMessageMarkdown
  //           content={"```javascript\n" + (extractedCode ?? "") + "\n```"}
  //           isStreaming={!codeFullyGenerated && isStreaming}
  //         />
  //       )}
  //       {mode === "spinner" && <Spinner />}
  //       {codeFullyGenerated && (
  //         // We render the iframe as soon as we have the code.
  //         // Until it is actually rendered, we're showing a spinner so
  //         // we use opacity-0 to hide the iframe.
  //         // We also disable pointer event to allow interacting with the rest.
  //         <div
  //           style={{ height: `${contentHeight}px` }}
  //           className={classNames(
  //             "absolute left-0 top-0 max-h-[60vh] w-full",
  //             mode !== "iframe"
  //               ? "pointer-events-none opacity-0"
  //               : "pointer-events-auto opacity-100"
  //           )}
  //         >
  //           <iframe
  //             ref={vizIframeRef}
  //             className="h-full w-full"
  //             src={`${process.env.NEXT_PUBLIC_VIZ_URL}/content?aId=${action.id}`}
  //             sandbox="allow-scripts"
  //           />
  //         </div>
  //       )}
  //     </div>

  //     {iframeRendered && (
  //       // Only start showing the toggle once the iframe is rendered.
  //       <div className="absolute left-4 top-4">
  //         <IconToggleButton
  //           icon={BracesIcon}
  //           selected={!showIframe}
  //           onClick={() =>
  //             setShowIframe((prev) => (prev === null ? false : !prev))
  //           }
  //         />
  //       </div>
  //     )}
  //   </div>
  // );
}
