import { SandboxFunctionPersonalAuthCard } from "@app/components/actions/blocked/SandboxFunctionPersonalAuthCard";
import { SandboxFunctionToolApprovalCard } from "@app/components/actions/blocked/SandboxFunctionToolApprovalCard";
import { useVisualizationRetry } from "@app/hooks/conversations";
import { useEventSource } from "@app/hooks/useEventSource";
import { useSendNotification } from "@app/hooks/useNotification";
import type {
  SandboxFunctionMCPApproveExecutionEvent,
  SandboxFunctionToolPersonalAuthRequiredEvent,
} from "@app/lib/actions/mcp_internal_actions/events";
import { clientFetch } from "@app/lib/egress/client";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import datadogLogger from "@app/logger/datadogLogger";
import type { FrameFunctionReferenceScope } from "@app/types/api/frame_function_reference";
import { resolveFrameFunctionReference } from "@app/types/api/frame_function_reference";
import type { GetFramePermissionsResponseBody } from "@app/types/api/frame_permissions";
import { podFunctionScopeFromFramePath } from "@app/types/api/pod_function_reference";
import type {
  PostSandboxFunctionInvocationRequestBody,
  PostSandboxFunctionInvocationResponseBody,
  SandboxFunctionCallError,
  SandboxFunctionInvocationEvent,
  SandboxFunctionInvocationOutcome,
} from "@app/types/api/sandbox_functions";
import { frameShareTokenHeader } from "@app/types/api/sandbox_functions";
import type {
  CallFunctionRequest,
  CommandResultMap,
  EditTextFn,
  ScopedWorkspaceUserIdentity,
  UserIdentityState,
  VisualizationRPCCommand,
  VisualizationRPCRequest,
} from "@app/types/assistant/visualization";
import { isVisualizationRPCRequest } from "@app/types/assistant/visualization";
import { isAPIError } from "@app/types/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import {
  assertNever,
  assertNeverAndIgnore,
} from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType, UserType } from "@app/types/user";
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

export function getFrameRuntimeAccess(
  workspaceId: string,
  canInvokeFunctions: boolean,
  scopedUserIdentity?: ScopedWorkspaceUserIdentity
): {
  canInvokeFunctions: boolean;
  userIdentity: UserIdentityState;
} {
  const userIdentity: UserIdentityState =
    scopedUserIdentity?.workspaceId === workspaceId
      ? {
          isAuthenticated: true,
          isWorkspaceMember: true,
          isFrameAuthor: false,
          isPodEditor: scopedUserIdentity.isPodEditor ?? false,
          isPodMember: scopedUserIdentity.isPodMember ?? false,
          user: scopedUserIdentity.user,
        }
      : {
          isAuthenticated: false,
          isWorkspaceMember: false,
          isFrameAuthor: false,
          isPodEditor: false,
          isPodMember: false,
          user: null,
        };

  return {
    canInvokeFunctions: canInvokeFunctions && userIdentity.isWorkspaceMember,
    userIdentity,
  };
}

export function getSandboxFunctionInvocationAccessError(
  scope: FrameFunctionReferenceScope,
  canInvokeFunctions: boolean,
  isWorkspaceMember: boolean
): SandboxFunctionCallError | null {
  if (canInvokeFunctions) {
    return null;
  }
  return scope.kind === "v2" && !isWorkspaceMember
    ? {
        code: "user_authentication_required",
        message:
          "This Frame function requires a logged-in user from its workspace.",
      }
    : {
        code: "not_supported",
        message: "Function calls are not available in this Frame.",
      };
}

async function resolveFrameUserIdentity({
  frameId,
  userIdentity,
  workspaceId,
}: {
  frameId: string | undefined;
  userIdentity: UserIdentityState;
  workspaceId: string;
}): Promise<UserIdentityState> {
  if (!frameId || !userIdentity.isAuthenticated) {
    return userIdentity;
  }

  try {
    const response = await clientFetch(
      `/api/w/${workspaceId}/frames/${encodeURIComponent(frameId)}/permissions`
    );
    if (!response.ok) {
      return userIdentity;
    }

    const permissions: GetFramePermissionsResponseBody = await response.json();
    return {
      ...userIdentity,
      isFrameAuthor: permissions.isFrameAuthor === true,
    };
  } catch {
    return userIdentity;
  }
}

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

const sendErrorToIframe = (
  request: CallFunctionRequest,
  error: SandboxFunctionCallError,
  target: MessageEventSource,
  {
    conversationId,
    workspaceId,
  }: { conversationId: string | null; workspaceId: string }
) => {
  // Once handed over, the error belongs to Frame code and only comes back if the Frame reports it
  // itself, so log here to keep a trace of every failed call.
  datadogLogger.info("Sandbox function call failed", {
    code: error.code,
    conversationId,
    errorMessage: error.message,
    fileId: request.identifier,
    functionIdOrSlug: request.params.functionIdOrSlug,
    statusCode: error.status,
    workspaceId,
  });

  target.postMessage(
    {
      command: "answer",
      messageUniqueId: request.messageUniqueId,
      identifier: request.identifier,
      error,
    },
    { targetOrigin: "*" }
  );
};

const resultFromInvocationOutcome = (
  outcome: SandboxFunctionInvocationOutcome
): Result<unknown, SandboxFunctionCallError> => {
  switch (outcome.status) {
    case "succeeded":
      return new Ok(outcome.result);
    case "errored":
      return new Err(outcome.error);
    default:
      assertNeverAndIgnore(outcome);
      return new Err({
        code: "transport_error",
        message: "Unsupported function invocation outcome.",
      });
  }
};

const getExtensionFromBlob = (blob: Blob): string => {
  const mimeToExt: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "text/csv": "csv",
  };

  return mimeToExt[blob.type] || "txt"; // Default to 'txt' if mime type is unknown.
};

// Workspace-scoped viewer of the frame. Needed by the blocked-action cards, which are also
// rendered on shared frames, outside of any AuthProvider. Null for anonymous viewers, who cannot
// invoke functions and therefore never get a blocked action.
export interface FrameViewer {
  owner: LightWorkspaceType;
  user: UserType;
  /**
   * Share token the viewer loaded the frame with, presented on invocation requests: the server
   * grants invocation of the frame's app's functions to workspace members who may view the frame
   * (invite-only frames also require an email grant). Authorization happens server-side on every
   * request.
   */
  frameShareToken?: string;
}

interface SandboxFunctionInvocationProps {
  workspaceId: string;
  functionId: string;
  invocationId: string;
  frameShareToken?: string;
  onBlocked: (eventId: string, event: SandboxFunctionBlockingEvent) => void;
  onSettle: (
    invocationId: string,
    result: Result<unknown, SandboxFunctionCallError>
  ) => void;
}

type SandboxFunctionBlockingEvent =
  | SandboxFunctionMCPApproveExecutionEvent
  | SandboxFunctionToolPersonalAuthRequiredEvent;

type QueuedBlockingEvent = {
  // SSE event id, unique per delivery. Removal targets this exact version: resolving an action can
  // produce a follow-up blocking event for the same actionId (e.g. approval then personal auth)
  // before the resolve response returns, and that newer entry must survive the removal.
  eventId: string;
  event: SandboxFunctionBlockingEvent;
};

// Consumes one invocation's event stream: reports the tool executions it blocks on and settles the
// pending iframe call. Renders nothing — the blocked-action card is owned by the parent, which sees
// every in-flight invocation.
function SandboxFunctionInvocation({
  workspaceId,
  functionId,
  invocationId,
  frameShareToken,
  onBlocked,
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
            onSettle(invocationId, new Ok(eventPayload.data.result));
            break;
          case "sandbox_function_invocation_error":
            onSettle(invocationId, new Err(eventPayload.data.error));
            break;
          case "tool_approve_execution":
          case "tool_personal_auth_required":
            onBlocked(eventPayload.eventId, eventPayload.data);
            break;
          default:
            assertNeverAndIgnore(eventPayload.data);
        }
      } catch (error) {
        onSettle(
          invocationId,
          new Err({
            code: "transport_error",
            message:
              "Failed to parse function invocation event: " +
              normalizeError(error).message,
          })
        );
      }
    },
    [invocationId, onSettle, onBlocked]
  );

  const onTerminalError = useCallback(() => {
    onSettle(
      invocationId,
      new Err({
        code: "transport_error",
        message: "Failed to listen to function invocation events.",
      })
    );
  }, [invocationId, onSettle]);

  useEventSource(
    buildEventSourceURL,
    onEventCallback,
    `sandbox-function-invocation-${invocationId}`,
    { onTerminalError, headers: frameShareTokenHeader(frameShareToken) }
  );

  return null;
}

interface SandboxFunctionBlockedActionProps {
  // The blocked actions the card resolves together, most often just one. A Frame can have several
  // invocations in flight, and a single personal connection unblocks all of the ones waiting on it.
  blockedActions: QueuedBlockingEvent[];
  viewer: FrameViewer;
  onResolved: () => void;
}

// Overlays the Frame while a tool is blocked on user input. Keyed by the delivery eventId of the
// first entry so consecutive events of the same type never reuse local card state.
function SandboxFunctionBlockedAction({
  blockedActions,
  viewer,
  onResolved,
}: SandboxFunctionBlockedActionProps) {
  const [{ eventId, event }] = blockedActions;

  let blockedActionCard: React.ReactNode;
  switch (event.type) {
    case "tool_approve_execution":
      blockedActionCard = (
        <SandboxFunctionToolApprovalCard
          key={eventId}
          event={event}
          viewer={viewer}
          onResolved={onResolved}
        />
      );
      break;
    case "tool_personal_auth_required":
      blockedActionCard = (
        <SandboxFunctionPersonalAuthCard
          key={eventId}
          events={blockedActions
            .map((a) => a.event)
            .filter(
              (e): e is SandboxFunctionToolPersonalAuthRequiredEvent =>
                e.type === "tool_personal_auth_required"
            )}
          viewer={viewer}
          onResolved={onResolved}
        />
      );
      break;
    default:
      assertNeverAndIgnore(event);
      blockedActionCard = null;
  }

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-auto bg-muted-foreground/75 p-4">
      <div className="flex w-full max-w-xl justify-center">
        {blockedActionCard}
      </div>
    </div>
  );
}

// The blocked actions the next card presents: the oldest one, plus everything waiting on the same
// personal connection, which one trip through the authentication flow resolves at once. Approvals
// are per tool call, so they are never grouped.
function nextBlockedActionGroup(
  blockedActions: QueuedBlockingEvent[]
): QueuedBlockingEvent[] | null {
  const [blockedAction] = blockedActions;
  if (!blockedAction) {
    return null;
  }
  if (blockedAction.event.type !== "tool_personal_auth_required") {
    return [blockedAction];
  }
  const { mcpServerId } = blockedAction.event.authError;
  return blockedActions.filter(
    (a) =>
      a.event.type === "tool_personal_auth_required" &&
      a.event.authError.mcpServerId === mcpServerId
  );
}

// Custom hook to encapsulate the logic for handling visualization messages.
function useVisualizationDataHandler({
  conversationId,
  createSandboxFunctionInvocation,
  getFileBlob,
  onEditText,
  functionReferenceScope,
  setCodeDrawerOpened,
  setContentHeight,
  setErrorMessage,
  visualization,
  vizIframeRef,
  resolveUserIdentity,
  waitForSandboxFunctionInvocationResult,
  workspaceId,
}: {
  conversationId: string | null;
  createSandboxFunctionInvocation: (
    functionIdOrSlug: string,
    input?: unknown
  ) => Promise<
    Result<PostSandboxFunctionInvocationResponseBody, SandboxFunctionCallError>
  >;
  getFileBlob: (fileId: string) => Promise<Blob | null>;
  functionReferenceScope: FrameFunctionReferenceScope;
  onEditText?: EditTextFn;
  setCodeDrawerOpened: (v: SetStateAction<boolean>) => void;
  setContentHeight: (v: SetStateAction<number>) => void;
  setErrorMessage: (v: SetStateAction<string | null>) => void;
  visualization: Visualization;
  vizIframeRef: React.MutableRefObject<HTMLIFrameElement | null>;
  resolveUserIdentity: () => Promise<UserIdentityState>;
  waitForSandboxFunctionInvocationResult: (params: {
    functionId: string;
    invocationId: string;
  }) => Promise<Result<unknown, SandboxFunctionCallError>>;
  workspaceId: string;
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
          // Qualify bare function names in the trusted host. Frames v2 bind to stable identity;
          // legacy Frames keep their existing Pod app-folder resolution.
          const referenceRes = resolveFrameFunctionReference(
            data.params.functionIdOrSlug,
            functionReferenceScope
          );
          if (referenceRes.isErr()) {
            sendErrorToIframe(
              data,
              {
                code: "not_supported",
                message: referenceRes.error.message,
              },
              event.source,
              { conversationId, workspaceId }
            );
            break;
          }

          const invocationRes = await createSandboxFunctionInvocation(
            referenceRes.value,
            data.params.input
          );

          if (invocationRes.isErr()) {
            sendErrorToIframe(data, invocationRes.error, event.source, {
              conversationId,
              workspaceId,
            });
            break;
          }

          const { invocation, outcome } = invocationRes.value;
          // An invocation that settled before the response was sent needs no stream: the outcome
          // is the whole result. Anything still running, including one blocked on user input,
          // comes back with no outcome and settles over its event stream.
          const result = outcome
            ? resultFromInvocationOutcome(outcome)
            : await waitForSandboxFunctionInvocationResult({
                functionId: invocation.functionId,
                invocationId: invocation.sId,
              });

          if (result.isErr()) {
            sendErrorToIframe(data, result.error, event.source, {
              conversationId,
              workspaceId,
            });
          } else {
            sendResponseToIframe(data, result.value, event.source);
          }
          break;
        }

        case "getUserIdentity":
          sendResponseToIframe(data, await resolveUserIdentity(), event.source);
          break;

        case "ping":
          // Liveness probe: the iframe uses the answer to tell a live host from a hostless
          // (top-level) context where postMessage RPC would hang forever.
          sendResponseToIframe(data, { ok: true }, event.source);
          break;

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
    conversationId,
    createSandboxFunctionInvocation,
    downloadFileFromBlob,
    getFileBlob,
    onEditText,
    functionReferenceScope,
    setContentHeight,
    setErrorMessage,
    setCodeDrawerOpened,
    visualization.identifier,
    vizIframeRef,
    resolveUserIdentity,
    sendNotification,
    waitForSandboxFunctionInvocationResult,
    workspaceId,
  ]);
}

function CodeDrawer({
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

export interface VisualizationActionIframeProps {
  agentConfigurationId: string | null;
  canInvokeFunctions: boolean;
  conversationId: string | null;
  /**
   * Canonical scoped path of the Frame being rendered (`pod-{podId}/MyApp/MyApp.tsx`), when the host
   * knows it. Only Pod hosts do, and it is what lets a Frame in an app folder call its functions by
   * bare name; without it, relative references are refused.
   */
  framePath?: string | null;
  /** Stable identity of a Frames v2 resource. Omit for legacy Frames and raw visualizations. */
  frameId?: string;
  isEditable?: boolean;
  isInDrawer?: boolean;
  onEditText?: EditTextFn;
  scopedUserIdentity?: ScopedWorkspaceUserIdentity;
  spaceId?: string;
  viewer: FrameViewer | null;
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

  // Only Pod hosts pass a frame path, so only Frames in an app folder get a scope; everything else
  // resolves to null and must use fully qualified references.
  const podFunctionScope = useMemo(
    () => podFunctionScopeFromFramePath(props.framePath),
    [props.framePath]
  );
  const functionReferenceScope = useMemo<FrameFunctionReferenceScope>(
    () =>
      props.frameId
        ? { kind: "v2", frameId: props.frameId }
        : { kind: "legacy", podFunctionScope },
    [podFunctionScope, props.frameId]
  );

  // In-flight sandbox function invocations. Each entry mounts a
  // SandboxFunctionInvocation; the resolver of the pending `callFunction` promise is kept
  // in a ref so settling stays a pure state update.
  const [activeInvocations, setActiveInvocations] = useState<
    { functionId: string; invocationId: string }[]
  >([]);
  const invocationResolversRef = useRef<Map<
    string,
    (result: Result<unknown, SandboxFunctionCallError>) => void
  > | null>(null);
  if (invocationResolversRef.current === null) {
    invocationResolversRef.current = new Map();
  }
  const invocationResolvers = invocationResolversRef.current;

  // Tool executions blocked on user input, across every in-flight invocation.
  const [blockedActions, setBlockedActions] = useState<QueuedBlockingEvent[]>(
    []
  );

  const enqueueBlockedAction = useCallback(
    (eventId: string, event: SandboxFunctionBlockingEvent) => {
      setBlockedActions((prev) => {
        // The stream can re-deliver or supersede an event after a reconnect or a resolution:
        // replace by actionId, keeping the newest delivery.
        const existingIndex = prev.findIndex(
          (a) => a.event.actionId === event.actionId
        );
        const entry = { eventId, event };
        return existingIndex === -1
          ? [...prev, entry]
          : prev.map((a, index) => (index === existingIndex ? entry : a));
      });
    },
    []
  );

  const removeBlockedActions = useCallback(
    (resolved: QueuedBlockingEvent[]) => {
      const resolvedEventIds = new Set(resolved.map((a) => a.eventId));
      setBlockedActions((prev) =>
        prev.filter((a) => !resolvedEventIds.has(a.eventId))
      );
    },
    []
  );

  const waitForSandboxFunctionInvocationResult = useCallback(
    ({
      functionId,
      invocationId,
    }: {
      functionId: string;
      invocationId: string;
    }) =>
      new Promise<Result<unknown, SandboxFunctionCallError>>((resolve) => {
        invocationResolvers.set(invocationId, resolve);
        setActiveInvocations((prev) => [...prev, { functionId, invocationId }]);
      }),
    [invocationResolvers]
  );

  const settleSandboxFunctionInvocation = useCallback(
    (
      invocationId: string,
      result: Result<unknown, SandboxFunctionCallError>
    ) => {
      const resolve = invocationResolvers.get(invocationId);
      invocationResolvers.delete(invocationId);
      setActiveInvocations((prev) =>
        prev.filter((invocation) => invocation.invocationId !== invocationId)
      );
      // A settled invocation can no longer be unblocked: drop any card it was still waiting on.
      setBlockedActions((prev) =>
        prev.filter((a) => a.event.invocationId !== invocationId)
      );
      resolve?.(result);
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
    canInvokeFunctions,
    conversationId,
    isEditable = false,
    isInDrawer = false,
    onEditText,
    scopedUserIdentity,
    spaceId,
    viewer,
    visualization,
    workspaceId,
  } = props;

  const blockedActionGroup = useMemo(
    () => nextBlockedActionGroup(blockedActions),
    [blockedActions]
  );

  const runtimeAccess = useMemo(() => {
    return getFrameRuntimeAccess(
      workspaceId,
      canInvokeFunctions,
      scopedUserIdentity
    );
  }, [canInvokeFunctions, scopedUserIdentity, workspaceId]);

  const resolveUserIdentity = useCallback(
    () =>
      resolveFrameUserIdentity({
        frameId: props.frameId,
        userIdentity: runtimeAccess.userIdentity,
        workspaceId,
      }),
    [props.frameId, runtimeAccess.userIdentity, workspaceId]
  );

  const isPublic = visualization.accessToken !== undefined;

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
    ): Promise<
      Result<
        PostSandboxFunctionInvocationResponseBody,
        SandboxFunctionCallError
      >
    > => {
      try {
        const accessError = getSandboxFunctionInvocationAccessError(
          functionReferenceScope,
          runtimeAccess.canInvokeFunctions,
          runtimeAccess.userIdentity.isWorkspaceMember
        );
        if (accessError) {
          return new Err(accessError);
        }

        const body: PostSandboxFunctionInvocationRequestBody = {
          input,
          context: {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        };

        const encodedFunctionIdOrSlug = encodeURIComponent(functionIdOrSlug);
        const response = await clientFetch(
          `/api/w/${workspaceId}/sandbox-functions/${encodedFunctionIdOrSlug}/invocations`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...frameShareTokenHeader(props.viewer?.frameShareToken),
            },
            body: JSON.stringify(body),
          }
        );

        if (!response.ok) {
          const error = await getErrorFromResponse(response);
          return new Err({
            // Forward the API error type verbatim. Re-deriving a code here would collapse every
            // failure but one into `invocation_failed` and drop the only classification the
            // endpoint produced.
            code: isAPIError(error) ? error.type : "invocation_failed",
            message: error.message,
            status: response.status,
          });
        }

        const result: PostSandboxFunctionInvocationResponseBody =
          await response.json();

        return new Ok(result);
      } catch (error) {
        return new Err({
          code: "transport_error",
          message: normalizeError(error).message,
        });
      }
    },
    [
      functionReferenceScope,
      runtimeAccess.canInvokeFunctions,
      runtimeAccess.userIdentity.isWorkspaceMember,
      workspaceId,
      props.viewer?.frameShareToken,
    ]
  );

  useVisualizationDataHandler({
    conversationId,
    createSandboxFunctionInvocation,
    getFileBlob,
    onEditText,
    functionReferenceScope,
    setCodeDrawerOpened,
    setContentHeight,
    setErrorMessage,
    visualization,
    vizIframeRef,
    resolveUserIdentity,
    waitForSandboxFunctionInvocationResult,
    workspaceId,
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
          frameShareToken={props.viewer?.frameShareToken}
          onBlocked={enqueueBlockedAction}
          onSettle={settleSandboxFunctionInvocation}
        />
      ))}
      {/* Anonymous viewers cannot invoke functions, so they never reach a blocked action. */}
      {viewer && blockedActionGroup && (
        <SandboxFunctionBlockedAction
          blockedActions={blockedActionGroup}
          viewer={viewer}
          onResolved={() => removeBlockedActions(blockedActionGroup)}
        />
      )}
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
          <Spinner size="lg" />
        </div>
      )}
    </div>
  );
});
