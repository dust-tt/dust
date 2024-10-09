import { Spinner } from "@dust-tt/sparkle";
import type {
  CommandResultMap,
  LightWorkspaceType,
  VisualizationRPCCommand,
  VisualizationRPCRequest,
} from "@dust-tt/types";
import { assertNever, isVisualizationRPCRequest } from "@dust-tt/types";
import type { SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RenderMessageMarkdown } from "@app/components/assistant/RenderMessageMarkdown";
import { classNames } from "@app/lib/utils";

export type Visualization = {
  code: string;
  complete: boolean;
  identifier: string;
};

const sendResponseToIframe = <T extends VisualizationRPCCommand>(
  request: { command: T } & VisualizationRPCRequest,
  response: CommandResultMap[T],
  target: MessageEventSource
) => {
  target.postMessage(
    {
      command: "answer",
      messageUniqueId: request.messageUniqueId,
      identifier: request.identifier,
      result: response,
    },
    { targetOrigin: "*" }
  );
};

// Custom hook to encapsulate the logic for handling visualization messages.
function useVisualizationDataHandler({
  visualization,
  setContentHeight,
  setIsErrored,
  vizIframeRef,
  workspaceId,
}: {
  visualization: Visualization;
  setContentHeight: (v: SetStateAction<number>) => void;
  setIsErrored: (v: SetStateAction<boolean>) => void;
  vizIframeRef: React.MutableRefObject<HTMLIFrameElement | null>;
  workspaceId: string;
}) {
  const code = visualization.code;

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

  const downloadScreenshotFromBlob = useCallback(
    (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `visualization-${visualization.identifier}.png`;
      link.click();
      URL.revokeObjectURL(url);
    },
    [visualization.identifier]
  );

  useEffect(() => {
    const listener = async (event: MessageEvent) => {
      const { data } = event;

      const isOriginatingFromViz =
        event.source && event.source === vizIframeRef.current?.contentWindow;

      if (
        !isVisualizationRPCRequest(data) ||
        !isOriginatingFromViz ||
        data.identifier !== visualization.identifier
      ) {
        return;
      }

      switch (data.command) {
        case "getFile":
          const fileBlob = await getFileBlob(data.params.fileId);

          sendResponseToIframe(data, { fileBlob }, event.source);
          break;

        case "getCodeToExecute":
          if (code) {
            sendResponseToIframe(data, { code }, event.source);
          }

          break;

        case "setContentHeight":
          setContentHeight(data.params.height);
          break;

        case "setErrored":
          setIsErrored(true);
          break;

        case "sendScreenshotBlob":
          downloadScreenshotFromBlob(data.params.blob);
          break;

        default:
          assertNever(data);
      }
    };

    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [
    code,
    downloadScreenshotFromBlob,
    getFileBlob,
    setContentHeight,
    setIsErrored,
    visualization.identifier,
    vizIframeRef,
  ]);
}

export function VisualizationActionIframe({
  owner,
  visualization,
}: {
  owner: LightWorkspaceType;
  visualization: Visualization;
}) {
  const [contentHeight, setContentHeight] = useState<number>(0);
  const [isErrored, setIsErrored] = useState(false);

  const vizIframeRef = useRef<HTMLIFrameElement>(null);

  useVisualizationDataHandler({
    visualization,
    workspaceId: owner.sId,
    setContentHeight,
    setIsErrored,
    vizIframeRef,
  });

  const { code, complete: codeFullyGenerated } = visualization;

  const iframeLoaded = contentHeight > 0;
  const showSpinner = useMemo(
    () => codeFullyGenerated && !iframeLoaded && !isErrored,
    [codeFullyGenerated, iframeLoaded, isErrored]
  );

  return (
    <div className="relative flex flex-col">
      {showSpinner && (
        <div className="absolute inset-0 flex items-center justify-center bg-white">
          <Spinner size="xl" />
        </div>
      )}
      <div
        className={classNames(
          "relative w-full overflow-hidden",
          codeFullyGenerated && !isErrored ? "min-h-96" : "",
          isErrored ? "h-full" : ""
        )}
      >
        <div className="flex">
          {!codeFullyGenerated ? (
            <div className="flex h-full w-full shrink-0">
              <RenderMessageMarkdown
                content={"```javascript\n" + (code ?? "") + "\n```"}
                isStreaming={!codeFullyGenerated}
              />
            </div>
          ) : (
            <div className="relative flex h-full w-full shrink-0 items-center justify-center">
              {codeFullyGenerated && !isErrored && (
                <div
                  style={{
                    height: !isErrored ? `${contentHeight}px` : "100%",
                    minHeight: !isErrored ? "96" : undefined,
                  }}
                  className={classNames("max-h-[600px] w-full")}
                >
                  <iframe
                    ref={vizIframeRef}
                    className={classNames(
                      "h-full w-full",
                      !isErrored ? "min-h-96" : ""
                    )}
                    src={`${process.env.NEXT_PUBLIC_VIZ_URL}/content?identifier=${visualization.identifier}`}
                    sandbox="allow-scripts"
                  />
                </div>
              )}
              {isErrored && (
                <div className="flex h-full w-full flex-col items-center gap-4 py-8">
                  <div className="text-sm text-element-800">
                    An error occured while rendering the visualization.
                  </div>
                  <div className="text-sm text-element-800">
                    The assistant message can be retried.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
