import {
  Button,
  CommandLineIcon,
  PlayStrokeIcon,
  Spinner,
  Tab,
} from "@dust-tt/sparkle";
import type {
  CommandResultMap,
  VisualizationRPCCommand,
  VisualizationRPCRequest,
  WorkspaceType,
} from "@dust-tt/types";
import { assertNever, isVisualizationRPCRequest } from "@dust-tt/types";
import type { SetStateAction } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { RenderMessageMarkdown } from "@app/components/assistant/RenderMessageMarkdown";
import { classNames } from "@app/lib/utils";

type Visualization = {
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

        default:
          assertNever(data);
      }
    };

    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [
    visualization.identifier,
    code,
    getFileBlob,
    setContentHeight,
    setIsErrored,
    vizIframeRef,
  ]);
}

export function VisualizationActionIframe({
  owner,
  visualization,
}: {
  owner: WorkspaceType;
  visualization: Visualization;
}) {
  const [contentHeight, setContentHeight] = useState<number>(0);
  const [isErrored, setIsErrored] = useState(false);
  const [activeIndex, setActiveIndex] = useState(1);

  const vizIframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const workspaceId = owner.sId;

  useVisualizationDataHandler({
    visualization,
    workspaceId,
    setContentHeight,
    setIsErrored,
    vizIframeRef,
  });

  const { code, complete: codeFullyGenerated } = visualization;

  const iframeLoaded = contentHeight > 0;
  const showSpinner =
    ((!codeFullyGenerated && !code) || (codeFullyGenerated && !iframeLoaded)) &&
    !isErrored;

  useEffect(() => {
    if (!codeFullyGenerated) {
      setActiveIndex(0);
    } else {
      setActiveIndex(1);
    }
  }, [codeFullyGenerated, code]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    if (activeIndex === 0) {
      // Set height of the container to the height of the code block if the code is fully generated
      // Otherwise, set the height to 100% to allow the code to grow as it gets generated.
      containerRef.current.style.height = codeFullyGenerated
        ? `${codeRef.current?.scrollHeight}px`
        : "100%";
    } else if (activeIndex === 1) {
      if (isErrored && errorRef.current) {
        containerRef.current.style.height = `${errorRef.current.scrollHeight}px`;
      } else if (!isErrored) {
        containerRef.current.style.height = `${contentHeight}px`;
      }
    }
  }, [activeIndex, contentHeight, codeFullyGenerated, isErrored]);

  return (
    <div className="relative flex flex-col">
      <ViewCodeSwitcher
        disabled={!codeFullyGenerated}
        activeIndex={activeIndex}
        onTabClick={setActiveIndex}
      />
      {showSpinner && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white bg-opacity-75">
          <Spinner />
        </div>
      )}
      <div
        className={classNames(
          "transition-height relative w-full overflow-hidden duration-500 ease-in-out",
          codeFullyGenerated && !isErrored ? "min-h-96" : "",
          isErrored ? "h-full" : "",
          activeIndex === 1 ? "max-h-[60vh]" : ""
        )}
        ref={containerRef}
      >
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{
            transform: `translateX(-${activeIndex * 100}%)`,
          }}
        >
          <div className="flex h-full w-full shrink-0" ref={codeRef}>
            <RenderMessageMarkdown
              owner={owner}
              content={"```javascript\n" + (code ?? "") + "\n```"}
              isStreaming={!codeFullyGenerated}
            />
          </div>
          <div className="relative flex h-full w-full shrink-0 items-center justify-center">
            {codeFullyGenerated && !isErrored && (
              <div
                style={{
                  height: !isErrored ? `${contentHeight}px` : "100%",
                  minHeight: !isErrored ? "96" : undefined,
                }}
                className={classNames("max-h-[60vh] w-full")}
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
              <div
                className="flex h-full w-full flex-col items-center gap-4 py-8"
                ref={errorRef}
              >
                <div className="text-sm text-element-800">
                  An error occured while rendering the visualization.
                </div>
                <div className="text-sm text-element-800">
                  The assistant message can be retried.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const ViewCodeSwitcher = ({
  activeIndex,
  disabled,
  onTabClick,
}: {
  activeIndex: number;
  disabled: boolean;
  onTabClick: (tabIndex: number) => void;
}) => {
  return (
    <div className="flex justify-end pb-2">
      <Tab
        tabs={[
          {
            label: "Code",
            id: "code",
            disabled,
            current: activeIndex === 0,
            icon: CommandLineIcon,
            sizing: "expand",
          },
          {
            label: "View",
            id: "view",
            disabled,
            current: activeIndex === 1,
            icon: PlayStrokeIcon,
            sizing: "expand",
          },
        ]}
        setCurrentTab={(tabId, event) => {
          event.preventDefault();
          onTabClick(tabId === "code" ? 0 : 1);
        }}
      />
    </div>
  );
};
