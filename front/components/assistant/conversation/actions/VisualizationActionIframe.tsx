import { useVisualizationRetry } from "@app/hooks/conversations";
import { useEventSource } from "@app/hooks/useEventSource";
import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import datadogLogger from "@app/logger/datadogLogger";
import type {
  PostSandboxFunctionInvocationRequestBody,
  PostSandboxFunctionInvocationResponseBody,
  SandboxFunctionInvocationEvent,
  SandboxFunctionInvocationType,
} from "@app/types/api/sandbox_functions";
import type {
  CommandResultMap,
  EditTextFn,
  VisualizationRPCCommand,
  VisualizationRPCRequest,
} from "@app/types/assistant/visualization";
import { isVisualizationRPCRequest } from "@app/types/assistant/visualization";
import { Err, Ok, type Result } from "@app/types/shared/result";
import {
  assertNever,
  assertNeverAndIgnore,
} from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import {
  AlertCircle,
  Button,
  CodeBlock,
  ContentMessage,
  cn,
  Markdown,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Spinner,
} from "@dust-tt/sparkle";
import type React from "react";
import type { SetStateAction } from "react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

interface BaseVisualization {
  complete: boolean;
  identifier: string;
}

type PublicVisualization = BaseVisualization & {
  accessToken: string | null;
  code?: undefined;
};

type ProtectedVisualization = BaseVisualization & {
  accessToken?: undefined;
  code: string;
};

export type Visualization = PublicVisualization | ProtectedVisualization;

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

interface SandboxFunctionInvocationProps {
  workspaceId: string;
  functionId: string;
  invocationId: string;
  onSettle: (
    invocationId: string,
    response: CommandResultMap["callFunction"]
  ) => void;
}

// Consumes one invocation's event stream, settles the pending iframe call, and will render
// approval or authentication UI when needed.
function SandboxFunctionInvocation({
  workspaceId,
  functionId,
  invocationId,
  onSettle,
}: SandboxFunctionInvocationProps) {
  const buildEventSourceURL = useCallback(
    (lastEvent: string | null) => {
      const esURL = `/api/sse/w/${workspaceId}/sandbox-functions/${functionId}/invocations/${invocationId}/events`;
      let lastEventId = "";
      if (lastEvent) {
        const eventPayload: { eventId: string } = JSON.parse(lastEvent);
        lastEventId = eventPayload.eventId;
      }
      return esURL + "?lastEventId=" + lastEventId;
    },
    [workspaceId, functionId, invocationId]
  );

  const onEventCallback = useCallback(
    (eventStr: string) => {
      try {
        const eventPayload: {
          eventId: string;
          data: SandboxFunctionInvocationEvent;
        } = JSON.parse(eventStr);

        switch (eventPayload.data.type) {
          case "sandbox_function_invocation_created":
            // NO-OP
            break;
          case "sandbox_function_invocation_result":
            onSettle(invocationId, { result: eventPayload.data.result });
            break;
          case "sandbox_function_invocation_error":
            onSettle(invocationId, {
              result: null,
              error: eventPayload.data.message,
            });
            break;
          case "tool_approve_execution":
            // TODO(SANDBOX_FUNCTIONS): surface a tool approval flow to the user and post the
            // validation back; not emitted by the tool execution activity yet.
            break;
          case "tool_personal_auth_required":
            // TODO(SANDBOX_FUNCTIONS): surface a personal authentication flow to the user and
            // post the resolution back; not emitted by the tool execution activity yet.
            break;
          default:
            assertNeverAndIgnore(eventPayload.data);
        }
      } catch (error) {
        onSettle(invocationId, {
          result: null,
          error:
            "Failed to parse function invocation event: " +
            normalizeError(error).message,
        });
      }
    },
    [invocationId, onSettle]
  );

  const onTerminalError = useCallback(() => {
    onSettle(invocationId, {
      result: null,
      error: "Failed to listen to function invocation events.",
    });
  }, [invocationId, onSettle]);

  useEventSource(
    buildEventSourceURL,
    onEventCallback,
    `sandbox-function-invocation-${invocationId}`,
    { onTerminalError }
  );

  return null;
}

// Custom hook to encapsulate the logic for handling visualization messages.
function useVisualizationDataHandler({
  createSandboxFunctionInvocation,
  getFileBlob,
  onEditText,
  setCodeDrawerOpened,
  setContentHeight,
  setErrorMessage,
  visualization,
  vizIframeRef,
  waitForSandboxFunctionInvocationResult,
}: {
  createSandboxFunctionInvocation: (
    functionIdOrSlug: string,
    input?: unknown
  ) => Promise<Result<SandboxFunctionInvocationType, Error>>;
  getFileBlob: (fileId: string) => Promise<Blob | null>;
  onEditText?: EditTextFn;
  setCodeDrawerOpened: (v: SetStateAction<boolean>) => void;
  setContentHeight: (v: SetStateAction<number>) => void;
  setErrorMessage: (v: SetStateAction<string | null>) => void;
  visualization: Visualization;
  vizIframeRef: React.MutableRefObject<HTMLIFrameElement | null>;
  waitForSandboxFunctionInvocationResult: (params: {
    functionId: string;
    invocationId: string;
  }) => Promise<CommandResultMap["callFunction"]>;
}) {
  const sendNotification = useSendNotification();
  const { code } = visualization;

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
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
        case "callFunction": {
          const invocationRes = await createSandboxFunctionInvocation(
            data.params.functionIdOrSlug,
            data.params.input
          );

          if (invocationRes.isErr()) {
            sendResponseToIframe(
              data,
              {
                result: null,
                error:
                  "Failed to call function: " + invocationRes.error.message,
              },
              event.source
            );
            break;
          }

          const result = await waitForSandboxFunctionInvocationResult({
            functionId: invocationRes.value.functionId,
            invocationId: invocationRes.value.sId,
          });

          sendResponseToIframe(data, result, event.source);
          break;
        }

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
            isInteractiveContent: data.params.isInteractiveContent,
          });
          setErrorMessage(data.params.errorMessage);
          break;

        case "downloadFileRequest":
          downloadFileFromBlob(data.params.blob, data.params.filename);
          break;

        case "displayCode":
          setCodeDrawerOpened(true);
          break;

        case "editText": {
          if (onEditText) {
            const editResult = await onEditText({
              newText: data.params.newText,
              oldText: data.params.oldText,
              targetFileId: data.params.targetFileId,
              source: data.params.source,
            });

            sendResponseToIframe(data, editResult, event.source);
          } else {
            sendResponseToIframe(
              data,
              { success: false, error: "Editing is not supported here" },
              event.source
            );
          }

          break;
        }

        default:
          assertNever(data);
      }
    };

    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [
    code,
    createSandboxFunctionInvocation,
    downloadFileFromBlob,
    getFileBlob,
    onEditText,
    setContentHeight,
    setErrorMessage,
    setCodeDrawerOpened,
    visualization.identifier,
    vizIframeRef,
    sendNotification,
    waitForSandboxFunctionInvocationResult,
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
  frameFileId?: string;
  isEditable?: boolean;
  isInDrawer?: boolean;
  isPublic?: boolean;
  onEditText?: EditTextFn;
  spaceId?: string;
  visualization: Visualization;
  vizUrl: string;
  workspaceId: string;
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

  // In-flight sandbox function invocations. Each entry mounts a
  // SandboxFunctionInvocation; the resolver of the pending `callFunction` promise is kept
  // in a ref so settling stays a pure state update.
  const [activeInvocations, setActiveInvocations] = useState<
    { functionId: string; invocationId: string }[]
  >([]);
  const invocationResolversRef = useRef<Map<
    string,
    (response: CommandResultMap["callFunction"]) => void
  > | null>(null);
  if (invocationResolversRef.current === null) {
    invocationResolversRef.current = new Map();
  }
  const invocationResolvers = invocationResolversRef.current;

  const waitForSandboxFunctionInvocationResult = useCallback(
    ({
      functionId,
      invocationId,
    }: {
      functionId: string;
      invocationId: string;
    }) =>
      new Promise<CommandResultMap["callFunction"]>((resolve) => {
        invocationResolvers.set(invocationId, resolve);
        setActiveInvocations((prev) => [...prev, { functionId, invocationId }]);
      }),
    [invocationResolvers]
  );

  const settleSandboxFunctionInvocation = useCallback(
    (invocationId: string, response: CommandResultMap["callFunction"]) => {
      const resolve = invocationResolvers.get(invocationId);
      invocationResolvers.delete(invocationId);
      setActiveInvocations((prev) =>
        prev.filter((invocation) => invocation.invocationId !== invocationId)
      );
      resolve?.(response);
    },
    [invocationResolvers]
  );

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
    frameFileId,
    isEditable = false,
    isInDrawer = false,
    isPublic = false,
    onEditText,
    spaceId,
    visualization,
    workspaceId,
  } = props;

  const getFileBlob = useCallback(
    async (fileId: string) => {
      let url: string;

      if (fileId.startsWith("conversation-") || fileId.startsWith("pod-")) {
        // Canonical scoped paths — the global endpoint resolves auth from the prefix.
        const encodedPath = fileId.split("/").map(encodeURIComponent).join("/");
        url = `/api/w/${workspaceId}/files/path/${encodedPath}`;
      } else if (fileId.startsWith("conversation/")) {
        // Legacy path: normalize to canonical using context conversationId.
        if (!conversationId) {
          return null;
        }
        const rel = fileId.slice("conversation/".length);
        url = `/api/w/${workspaceId}/files/path/conversation-${conversationId}/${rel}`;
      } else if (fileId.startsWith("pod/") || fileId.startsWith("project/")) {
        // Legacy paths: normalize to canonical using context spaceId.
        if (!spaceId) {
          return null;
        }
        const rel = fileId.startsWith("pod/")
          ? fileId.slice("pod/".length)
          : fileId.slice("project/".length);
        url = `/api/w/${workspaceId}/files/path/pod-${spaceId}/${rel}`;
      } else {
        url = `/api/w/${workspaceId}/files/${fileId}?action=view`;
      }

      const response = await clientFetch(url);
      if (!response.ok) {
        return null;
      }

      const resBuffer = await response.arrayBuffer();

      return new Blob([resBuffer], {
        type: response.headers.get("Content-Type") ?? undefined,
      });
    },
    [workspaceId, conversationId, spaceId]
  );

  const createSandboxFunctionInvocation = useCallback(
    async (
      functionIdOrSlug: string,
      input?: unknown
    ): Promise<Result<SandboxFunctionInvocationType, Error>> => {
      try {
        if (isPublic) {
          throw new Error(
            "Sandbox functions are not supported in shared frames."
          );
        }

        const body: PostSandboxFunctionInvocationRequestBody = {
          input,
          context: frameFileId ? { frameFileId } : undefined,
        };

        const encodedFunctionIdOrSlug = encodeURIComponent(functionIdOrSlug);
        const response = await clientFetch(
          `/api/w/${workspaceId}/sandbox-functions/${encodedFunctionIdOrSlug}/invocations`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          }
        );

        if (!response.ok) {
          const error = await getErrorFromResponse(response);
          throw new Error(error.message);
        }

        const result: PostSandboxFunctionInvocationResponseBody =
          await response.json();

        return new Ok(result.invocation);
      } catch (error) {
        return new Err(normalizeError(error));
      }
    },
    [frameFileId, isPublic, workspaceId]
  );

  useVisualizationDataHandler({
    createSandboxFunctionInvocation,
    getFileBlob,
    onEditText,
    setCodeDrawerOpened,
    setContentHeight,
    setErrorMessage,
    visualization,
    vizIframeRef,
    waitForSandboxFunctionInvocationResult,
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

  const vizUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("identifier", visualization.identifier);

    if (visualization.accessToken) {
      params.set("accessToken", visualization.accessToken);
    }

    if (isInDrawer) {
      params.set("fullHeight", "true");
    }

    if (isEditable) {
      params.set("editable", "true");
    }

    return `${props.vizUrl.replace(/\/$/, "")}/content?${params.toString()}`;
  }, [visualization, isInDrawer, isEditable, props.vizUrl]);

  return (
    <div className={cn("relative flex flex-col", isInDrawer && "h-full")}>
      {code && (
        <CodeDrawer
          isOpened={isCodeDrawerOpen}
          onClose={() => setCodeDrawerOpened(false)}
          code={code}
        />
      )}
      {activeInvocations.map((invocation) => (
        <SandboxFunctionInvocation
          key={invocation.invocationId}
          workspaceId={workspaceId}
          functionId={invocation.functionId}
          invocationId={invocation.invocationId}
          onSettle={settleSandboxFunctionInvocation}
        />
      ))}
      <div
        className={cn(
          "relative w-full overflow-hidden",
          codeFullyGenerated && !isErrored && !isInDrawer && "min-h-96",
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
            <div
              className={cn(
                "relative flex w-full shrink-0 items-center justify-center",
                isInDrawer ? "h-full" : "h-panel"
              )}
            >
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
                    className={cn(
                      "h-full w-full",
                      !errorMessage && !isInDrawer && "min-h-96"
                    )}
                    src={vizUrl}
                    sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
                  />
                </div>
              )}

              {isErrored && !retryClicked && !isPublic && (
                <div
                  className={cn(
                    "flex w-full items-center justify-center p-6",
                    isInDrawer ? "h-full" : "h-panel"
                  )}
                >
                  <ContentMessage
                    title="Visualization failed"
                    variant="warning"
                    icon={AlertCircle}
                    className="max-w-md"
                  >
                    <div className="mb-4 text-sm">
                      The visualization failed due to an error in the generated
                      code.
                    </div>

                    {errorMessage && (
                      <div className="mb-4 rounded-md bg-warning-50 p-3 text-xs text-warning-900">
                        {errorMessage}
                      </div>
                    )}

                    {canRetry && (
                      <Button
                        variant="outline"
                        label="Ask agent to fix"
                        onClick={handleRetryClick}
                        disabled={retryClicked}
                      />
                    )}
                  </ContentMessage>
                </div>
              )}

              {isErrored && isPublic && (
                <div className="flex h-full w-full items-center justify-center p-6">
                  <div className="flex flex-col gap-3 text-center">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <AlertCircle className="h-8 w-8" />
                        <p className="heading-xl leading-7 text-foreground">
                          Visualization Error
                        </p>
                      </div>
                      <p className="copy-sm leading-tight text-muted-foreground">
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
      {showSpinner && (
        <div className="absolute inset-0 flex items-center justify-center bg-panel-background">
          <Spinner size="xl" variant="color" />
        </div>
      )}
    </div>
  );
});
