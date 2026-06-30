import { useEventSource } from "@app/hooks/useEventSource";
import type { SandboxFunctionInvocationEvent } from "@app/types/api/sandbox_functions";
import { useCallback } from "react";

export type SandboxFunctionInvocationEventCallback = (
  event: SandboxFunctionInvocationEvent
) => void;

export function useSandboxFunctionInvocationEvents({
  workspaceId,
  functionId,
  invocationId,
  onEvent,
  isReadyToConsumeStream,
}: {
  workspaceId: string;
  functionId: string;
  invocationId: string;
  onEvent: SandboxFunctionInvocationEventCallback;
  isReadyToConsumeStream: boolean;
}) {
  const buildEventSourceURL = useCallback(
    (lastEvent: string | null) => {
      const esURL = `/api/sse/w/${workspaceId}/sandbox-functions/${functionId}/invocations/${invocationId}/events`;
      let lastEventId = "";
      if (lastEvent) {
        const eventPayload: {
          eventId: string;
        } = JSON.parse(lastEvent);
        lastEventId = eventPayload.eventId;
      }

      return esURL + "?lastEventId=" + lastEventId;
    },
    [functionId, invocationId, workspaceId]
  );

  const handleEvent = useCallback(
    (eventStr: string) => {
      const eventPayload: {
        data: SandboxFunctionInvocationEvent;
      } = JSON.parse(eventStr);
      onEvent(eventPayload.data);
    },
    [onEvent]
  );

  return useEventSource(
    buildEventSourceURL,
    handleEvent,
    `sandbox-function-invocation-${invocationId}`,
    {
      isReadyToConsumeStream,
    }
  );
}
