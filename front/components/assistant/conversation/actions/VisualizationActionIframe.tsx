import {
  Button,
  cn,
  CodeBlock,
  ContentMessage,
  ExclamationCircleIcon,
  Markdown,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Spinner,
} from "@dust-tt/sparkle";
import type { SetStateAction } from "react";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import { useVisualizationRetry } from "@app/lib/swr/conversations";
import datadogLogger from "@app/logger/datadogLogger";
import type {
  CommandResultMap,
  VisualizationRPCCommand,
  VisualizationRPCRequest,
} from "@app/types";
import { assertNever, isVisualizationRPCRequest } from "@app/types";

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
  workspaceId: string | null;
}) {
  const sendNotification = useSendNotification();
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
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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

      // Handle EXPORT_ERROR messages
      if (
        data.type === "EXPORT_ERROR" &&
        isOriginatingFromViz &&
        data.identifier === visualization.identifier
      ) {
        sendNotification({
          title: "Export Failed",
          type: "error",
          description:
            data.errorMessage ||
            "An error occurred while exporting the content.",
        });
        return;
      }

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
          datadogLogger.info("Visualization error", {
            errorMessage: data.params.errorMessage,
            fileId: data.params.fileId,
            isContentCreation: data.params.isContentCreation,
          });
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
    sendNotification,
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
    <Sheet
      open={isOpened}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>Code for this visualization</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <CodeBlock className="language-jsx">{code}</CodeBlock>
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}

interface VisualizationActionIframeProps {
  agentConfigurationId: string | null;
  conversationId: string | null;
  isInDrawer?: boolean;
  visualization: Visualization;
  workspaceId: string;
  isPublic?: boolean;
}

export const VisualizationActionIframe = forwardRef<
  HTMLIFrameElement,
  VisualizationActionIframeProps
>(function VisualizationActionIframe(
  props: VisualizationActionIframeProps,
  ref
) {
  const [contentHeight, setContentHeight] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryClicked, setRetryClicked] = useState(false);
  const [isCodeDrawerOpen, setCodeDrawerOpened] = useState(false);
  const vizIframeRef = useRef<HTMLIFrameElement | null>(null);

  // Combine internal ref with forwarded ref.
  const combinedRef = useCallback(
    (node: HTMLIFrameElement | null) => {
      vizIframeRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref]
  );

  const isErrored = !!errorMessage || retryClicked;

  const {
    agentConfigurationId,
    conversationId,
    isInDrawer = false,
    visualization,
    workspaceId,
    isPublic = false,
  } = props;

  useVisualizationDataHandler({
    visualization,
    workspaceId,
    setContentHeight,
    setErrorMessage,
    setCodeDrawerOpened,
    vizIframeRef,
  });

  const { code, complete: codeFullyGenerated } = visualization;

  const iframeLoaded = contentHeight > 0;
  const showSpinner = useMemo(
    () => (codeFullyGenerated && !iframeLoaded && !isErrored) || retryClicked,
    [codeFullyGenerated, iframeLoaded, isErrored, retryClicked]
  );

  const { handleVisualizationRetry, canRetry } = useVisualizationRetry({
    workspaceId,
    conversationId,
    agentConfigurationId,
    isPublic,
  });

  const handleRetryClick = useCallback(async () => {
    if (retryClicked || !errorMessage) {
      return;
    }

    setRetryClicked(true);
    setErrorMessage(null);

    const success = await handleVisualizationRetry(errorMessage);
    if (!success) {
      setRetryClicked(false);
    }
  }, [errorMessage, handleVisualizationRetry, retryClicked]);

  return (
    <div className={cn("relative flex flex-col", isInDrawer && "h-full")}>
      {showSpinner && (
        <div className="absolute inset-0 flex items-center justify-center bg-white">
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
        className={cn(
          "relative w-full overflow-hidden",
          codeFullyGenerated && !isErrored && "min-h-96",
          errorMessage && "h-full",
          isInDrawer && "h-full"
        )}
      >
        <div className={cn("flex", isInDrawer && "h-full")}>
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
                  style={
                    isInDrawer
                      ? { minHeight: "200px" }
                      : {
                          height: `${contentHeight}px`,
                          minHeight: "96px",
                        }
                  }
                  className={cn(
                    "w-full",
                    isInDrawer ? "h-full" : "max-h-[600px]"
                  )}
                >
                  <iframe
                    ref={combinedRef}
                    className={cn("h-full w-full", !errorMessage && "min-h-96")}
                    src={`${process.env.NEXT_PUBLIC_VIZ_URL}/content?identifier=${visualization.identifier}${isInDrawer ? "&fullHeight=true" : ""}`}
                    sandbox="allow-scripts allow-popups"
                  />
                </div>
              )}

              {isErrored && !retryClicked && !isPublic && (
                <div className="flex h-full w-full items-center justify-center p-6">
                  <ContentMessage
                    title="Visualization Error"
                    variant="warning"
                    icon={ExclamationCircleIcon}
                    className="max-w-md text-center"
                  >
                    <div className="mb-4 text-sm">
                      An error occurred while rendering the visualization.
                    </div>

                    {errorMessage && (
                      <div className="mb-4 rounded-md bg-warning-50 p-3 text-xs text-warning-900 dark:bg-warning-50-night dark:text-warning-900-night">
                        {errorMessage}
                      </div>
                    )}

                    {canRetry && (
                      <div className="flex justify-center">
                        <Button
                          variant="outline"
                          size="sm"
                          label="Ask agent to fix"
                          onClick={handleRetryClick}
                          disabled={retryClicked}
                        />
                      </div>
                    )}
                  </ContentMessage>
                </div>
              )}

              {isErrored && isPublic && (
                <div className="flex h-full w-full items-center justify-center p-6">
                  <div className="flex flex-col gap-3 text-center">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <ExclamationCircleIcon className="h-8 w-8" />
                        <p className="heading-xl leading-7 text-foreground dark:text-foreground-night">
                          Visualization Error
                        </p>
                      </div>
                      <p className="copy-sm leading-tight text-muted-foreground dark:text-muted-foreground-night">
                        This visualization encountered an error and cannot be
                        displayed.
                        <br /> Please contact the creator of this visualization
                        for assistance.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
