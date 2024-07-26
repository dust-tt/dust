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
  const [showIframe, setShowIframe] = useState<boolean | null>(null);
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
  const codeToggled = showIframe === false;

  const mode = (() => {
    // User clicked on code toggle => show code
    // Code generation has not started => show spinner
    // Code generation has not yet completed => show streaming code
    // Code generation has completed but iframe is not rendered yet => show spinner
    // Code is fully generated and iframe is rendered => show iframe
    if (codeToggled) {
      return "code";
    }
    if (!codeFullyGenerated) {
      return extractedCode ? "code" : "spinner";
    }
    return iframeRendered ? "iframe" : "spinner";
  })();

  return (
    <div className="relative">
      {mode === "iframe" && (
        // If we displaying the iframe, we need to offset the agent message
        // content to make space for the iframe.
        <div
          style={{
            height: `${contentHeight}px`,
          }}
        />
      )}
      <div>
        {mode === "code" && (
          <RenderMessageMarkdown
            content={"```javascript\n" + (extractedCode ?? "") + "\n```"}
            isStreaming={!codeFullyGenerated && isStreaming}
          />
        )}
        {mode === "spinner" && <Spinner />}
        {codeFullyGenerated && (
          // We render the iframe as soon as we have the code.
          // Until it is actually rendered, we're showing a spinner so
          // we use opacity-0 to hide the iframe.
          // We also disable pointer event to allow interacting with the rest.
          <div
            style={{ height: `${contentHeight}px` }}
            className={classNames(
              "absolute left-0 top-0 max-h-[60vh] w-full",
              mode !== "iframe"
                ? "pointer-events-none opacity-0"
                : "pointer-events-auto opacity-100"
            )}
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

      {iframeRendered && (
        // Only start showing the toggle once the iframe is rendered.
        <div className="absolute left-4 top-4">
          <IconToggleButton
            icon={BracesIcon}
            selected={!showIframe}
            onClick={() =>
              setShowIframe((prev) => (prev === null ? false : !prev))
            }
          />
        </div>
      )}
    </div>
  );
}
