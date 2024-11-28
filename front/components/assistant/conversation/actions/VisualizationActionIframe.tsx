import {
  Button,
  CodeBlock,
  Markdown,
  MarkdownContentContext,
  Modal,
  Page,
  Spinner,
} from "@dust-tt/sparkle";
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

import { useVisualizationRetry } from "@app/lib/swr/conversations";
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

const getExtensionFromBlob = (blob: Blob): string => {
  const mimeToExt: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "text/csv": "csv",
  };

  return mimeToExt[blob.type] || "txt"; // Default to 'txt' if mime type is unknown.
};

// Custom hook to encapsulate the logic for handling visualization messages.
function useVisualizationDataHandler({
  visualization,
  setContentHeight,
  setErrorMessage,
  setCodeDrawerOpened,
  vizIframeRef,
  workspaceId,
}: {
  visualization: Visualization;
  setContentHeight: (v: SetStateAction<number>) => void;
  setErrorMessage: (v: SetStateAction<string | null>) => void;
  setCodeDrawerOpened: (v: SetStateAction<boolean>) => void;
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

  const downloadFileFromBlob = useCallback(
    (blob: Blob, filename?: string) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;

      if (filename) {
        link.download = filename;
      } else {
        const ext = getExtensionFromBlob(blob);
        link.download = `visualization-${visualization.identifier}.${ext}`;
      }

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

        case "downloadFileRequest":
          downloadFileFromBlob(data.params.blob, data.params.filename);
          break;

        case "displayCode":
          setCodeDrawerOpened(true);
          break;

        default:
          assertNever(data);
      }
    };

    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [
    code,
    downloadFileFromBlob,
    getFileBlob,
    setContentHeight,
    setErrorMessage,
    setCodeDrawerOpened,
    visualization.identifier,
    vizIframeRef,
  ]);
}

export function CodeDrawer({
  isOpened,
  onClose,
  code,
}: {
  isOpened: boolean;
  onClose: () => void;
  code: string;
}) {
  return (
    <Modal
      isOpen={isOpened}
      onClose={onClose}
      title="Code for this visualization"
      variant="side-md"
      hasChanged={false}
    >
      <Page variant="modal">
        <CodeBlock className="language-jsx">{code}</CodeBlock>
      </Page>
    </Modal>
  );
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
  const [isCodeDrawerOpen, setCodeDrawerOpened] = useState(false);
  const vizIframeRef = useRef<HTMLIFrameElement | null>(null);

  const isErrored = !!errorMessage || retryClicked;

  useVisualizationDataHandler({
    visualization,
    workspaceId: owner.sId,
    setContentHeight,
    setErrorMessage,
    setCodeDrawerOpened,
    vizIframeRef,
  });

  const { code, complete: codeFullyGenerated } = visualization;

  const iframeLoaded = contentHeight > 0;
  const showSpinner = useMemo(
    () => codeFullyGenerated && !iframeLoaded && !isErrored,
    [codeFullyGenerated, iframeLoaded, isErrored]
  );

  const handleVisualizationRetry = useVisualizationRetry({
    workspaceId: owner.sId,
    conversationId,
    agentConfigurationId,
  });

  const handleRetryClick = useCallback(async () => {
    if (retryClicked || !errorMessage) {
      return;
    }
    setRetryClicked(true);
    const success = await handleVisualizationRetry(errorMessage);
    if (!success) {
      setRetryClicked(false);
    }
  }, [errorMessage, handleVisualizationRetry, retryClicked]);

  const canRetry = useContext(MarkdownContentContext)?.isLastMessage ?? false;

  return (
    <div className="relative flex h-full w-full items-center">
      {showSpinner && (
        <div className="absolute inset-x-0 flex justify-center">
          <Spinner size="xl" />
        </div>
      )}
      {code && (
        <CodeDrawer
          isOpened={isCodeDrawerOpen}
          onClose={() => setCodeDrawerOpened(false)}
          code={code}
        />
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
              <Markdown
                content={"```javascript\n" + (code ?? "") + "\n```"}
                isStreaming={!codeFullyGenerated}
                isLastMessage={true}
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
                  className={classNames("h-screen w-full")}
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
                      variant="outline"
                      size="sm"
                      label="Retry Visualization"
                      onClick={handleRetryClick}
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
