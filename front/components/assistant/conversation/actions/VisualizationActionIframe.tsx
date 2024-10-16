import { Button, Spinner } from "@dust-tt/sparkle";
import type {
  CommandResultMap,
  LightWorkspaceType,
  VisualizationRPCCommand,
  VisualizationRPCRequest,
} from "@dust-tt/types";
import { assertNever, isVisualizationRPCRequest } from "@dust-tt/types";
import type { SetStateAction } from "react";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AgentMessageContext } from "@app/components/assistant/conversation/context";
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
  setErrorMessage,
  vizIframeRef,
  workspaceId,
}: {
  visualization: Visualization;
  setContentHeight: (v: SetStateAction<number>) => void;
  setErrorMessage: (v: SetStateAction<string | null>) => void;
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

        case "setErrorMessage":
          setErrorMessage(data.params.errorMessage);
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
    setErrorMessage,
    visualization.identifier,
    vizIframeRef,
  ]);
}

export function VisualizationActionIframe({
  owner,
  visualization,
  conversationId,
  agentConfigurationId,
}: {
  owner: LightWorkspaceType;
  visualization: Visualization;
  conversationId: string;
  agentConfigurationId: string;
}) {
  const [contentHeight, setContentHeight] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryClicked, setRetryClicked] = useState(false);

  const vizIframeRef = useRef<HTMLIFrameElement | null>(null);

  const isErrored = !!errorMessage || retryClicked;

  useVisualizationDataHandler({
    visualization,
    workspaceId: owner.sId,
    setContentHeight,
    setErrorMessage,
    vizIframeRef,
  });

  const { code, complete: codeFullyGenerated } = visualization;

  const iframeLoaded = contentHeight > 0;
  const showSpinner = useMemo(
    () => codeFullyGenerated && !iframeLoaded && !isErrored,
    [codeFullyGenerated, iframeLoaded, isErrored]
  );

  const handleVisualizationRetry = async () => {
    if (retryClicked) {
      return;
    }
    setRetryClicked(true);
    try {
      const response = await fetch(
        `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: `The visualization code failed with this error:\n\`\`\`\n${errorMessage}\n\`\`\`\nPlease fix the code.`,
            mentions: [
              {
                configurationId: agentConfigurationId,
              },
            ],
            context: {
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              profilePictureUrl: null,
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to send retry message");
      }
    } catch (error) {
      console.error("Error sending retry message:", error);
      // Optionally, show an error message to the user
    }
  };

  const agentMessageContext = useContext(AgentMessageContext);
  const canRetry = agentMessageContext?.isLastMessage ?? false;

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
          errorMessage ? "h-full" : ""
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
                    height: `${contentHeight}px`,
                    minHeight: "96",
                  }}
                  className={classNames("max-h-[600px] w-full")}
                >
                  <iframe
                    ref={vizIframeRef}
                    className={classNames(
                      "h-full w-full",
                      !errorMessage ? "min-h-96" : ""
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
                    <div className="pt-2 text-xs text-element-600">
                      {errorMessage}
                    </div>
                  </div>

                  {canRetry && !retryClicked && (
                    <Button
                      variant="secondary"
                      size="sm"
                      label="Retry Visualization"
                      onClick={handleVisualizationRetry}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
