import { BracesIcon, IconToggleButton } from "@dust-tt/sparkle";
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
import { useCallback, useEffect, useMemo, useState } from "react";

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
    workspaceId,
    onRetry,
    setContentHeight,
  }: {
    workspaceId: string;
    onRetry: () => void;
    setContentHeight: (v: SetStateAction<number>) => void;
  }
) {
  const extractedCode = useMemo(
    () => visualizationExtractCode(action.generation ?? ""),
    [action.generation]
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

      // TODO(2024-07-24 flav) Check origin.
      if (
        !isVisualizationRPCRequest(data) ||
        !event.source ||
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

  const workspaceId = owner.sId;

  useVisualizationDataHandler(action, {
    workspaceId,
    onRetry,
    setContentHeight,
  });

  useEffect(() => {
    if (showIframe === null && action.generation) {
      setShowIframe(true);
    }
  }, [action.generation, showIframe]);

  let extractedCode: string | null = null;

  extractedCode = visualizationExtractCode(
    action.generation ?? streamedCode ?? ""
  );

  return (
    <div className="relative">
      {showIframe && (
        <div
          style={{
            height: `${contentHeight}px`,
          }}
        />
      )}
      <div>
        {!(showIframe && contentHeight > 0) && extractedCode && (
          <RenderMessageMarkdown
            content={"```javascript\n" + extractedCode + "\n```"}
            isStreaming={isStreaming}
          />
        )}

        {!!action.generation && (
          <div
            style={{ height: `${contentHeight}px` }}
            className={classNames(
              "absolute left-0 top-0 max-h-[60vh] w-full",
              !showIframe && contentHeight > 0 ? "opacity-0" : "opacity-100"
            )}
          >
            <iframe
              className="h-full w-full"
              src={`${process.env.NEXT_PUBLIC_VIZ_URL}/content?aId=${action.id}`}
              sandbox="allow-scripts"
            />
          </div>
        )}
      </div>

      {action.generation && contentHeight > 0 && (
        <div className="absolute left-4 top-4">
          <IconToggleButton
            icon={BracesIcon}
            selected={!showIframe}
            onClick={() => setShowIframe((prev) => !prev)}
          />
        </div>
      )}
    </div>
  );
}
