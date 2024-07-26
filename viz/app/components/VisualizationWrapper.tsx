"use client";

import type {
  CommandResultMap,
  VisualizationRPCCommand,
  VisualizationRPCRequestMap,
} from "@dust-tt/types";
import { Spinner } from "@viz/app/components/Components";
import * as papaparseAll from "papaparse";
import * as reactAll from "react";
import React, { useCallback, useMemo } from "react";
import { useEffect, useState } from "react";
import { importCode, Runner } from "react-runner";
import * as rechartsAll from "recharts";
import { useResizeDetector } from "react-resize-detector";
import { ErrorBoundary } from "@viz/app/components/ErrorBoundary";

export function useVisualizationAPI(
  sendCrossDocumentMessage: ReturnType<typeof makeSendCrossDocumentMessage>
) {
  const [error, setError] = useState<Error | null>(null);

  const fetchCode = useCallback(async (): Promise<string | null> => {
    try {
      const result = await sendCrossDocumentMessage("getCodeToExecute", null);

      const { code } = result;
      if (!code) {
        setError(new Error("No code found in response from app."));
        return null;
      }

      return code;
    } catch (error) {
      console.error(error);
      setError(
        error instanceof Error
          ? error
          : new Error("Failed to fetch visualization code from app.")
      );

      return null;
    }
  }, [sendCrossDocumentMessage]);

  const fetchFile = useCallback(
    async (fileId: string): Promise<File | null> => {
      const res = await sendCrossDocumentMessage("getFile", { fileId });

      const { fileBlob: blob } = res;

      if (!blob) {
        setError(new Error("Failed to fetch file."));
        return null;
      }

      const file = new File([blob], "fileId", { type: blob.type });

      return file;
    },
    [sendCrossDocumentMessage]
  );

  // This retry function sends a command to the host window requesting a retry of a previous
  // operation, typically if the generated code fails.
  const retry = useCallback(
    async (errorMessage: string): Promise<void> => {
      await sendCrossDocumentMessage("retry", { errorMessage });
    },
    [sendCrossDocumentMessage]
  );

  const sendHeightToParent = useCallback(
    async ({ height }: { height: number | null }) => {
      if (height === null) {
        return;
      }

      await sendCrossDocumentMessage("setContentHeight", {
        height,
      });
    },
    [sendCrossDocumentMessage]
  );

  return { fetchCode, fetchFile, error, retry, sendHeightToParent };
}

const useFile = (
  fileId: string,
  fetchFile: (fileId: string) => Promise<File | null>
) => {
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const fetchedFile = await fetchFile(fileId);
        setFile(fetchedFile);
      } catch (err) {
        setFile(null);
      }
    };

    if (fileId) {
      fetch();
    }
  }, [fileId, fetchFile]);

  return file;
};

interface RunnerParams {
  code: string;
  scope: Record<string, unknown>;
}

export function VisualizationWrapperWithErrorBoundary({
  actionId,
  allowedVisualizationOrigin,
}: {
  actionId: number;
  allowedVisualizationOrigin: string | undefined;
}) {
  const sendCrossDocumentMessage = useMemo(
    () =>
      makeSendCrossDocumentMessage({
        actionId,
        allowedVisualizationOrigin,
      }),
    [actionId, allowedVisualizationOrigin]
  );
  const api = useVisualizationAPI(sendCrossDocumentMessage);

  return (
    <ErrorBoundary
      errorMessage="We encountered an error while running the code generated above. You can try again by clicking the button below."
      onRetryClick={(errorMessage: string) => {
        sendCrossDocumentMessage("retry", { errorMessage });
      }}
    >
      <VisualizationWrapper api={api} />
    </ErrorBoundary>
  );
}

// This component renders the generated code.
// It gets the generated code via message passing to the host window.
export function VisualizationWrapper({
  api,
}: {
  api: ReturnType<typeof useVisualizationAPI>;
}) {
  const [runnerParams, setRunnerParams] = useState<RunnerParams | null>(null);

  const [errored, setErrored] = useState<Error | null>(null);

  const { fetchCode, fetchFile, error, sendHeightToParent } = api;

  useEffect(() => {
    const loadCode = async () => {
      try {
        console.log("Fetching visualization code");
        const fetchedCode = await fetchCode();
        if (!fetchedCode) {
          setErrored(new Error("No visualization code found"));
        } else {
          setRunnerParams({
            code: "() => {import Comp from '@dust/generated-code'; return (<Comp />);}",
            scope: {
              import: {
                recharts: rechartsAll,
                react: reactAll,
                "@dust/generated-code": importCode(fetchedCode, {
                  import: {
                    recharts: rechartsAll,
                    react: reactAll,
                    papaparse: papaparseAll,
                    "@dust/react-hooks": {
                      useFile: (fileId: string) => useFile(fileId, fetchFile),
                    },
                  },
                }),
              },
            },
          });
        }
      } catch (error) {
        setErrored(
          error instanceof Error
            ? error
            : new Error("Failed to fetch visualization code")
        );
      }
    };

    loadCode();
  }, [fetchCode, fetchFile]);

  const { ref } = useResizeDetector({
    handleHeight: true,
    refreshMode: "debounce",
    refreshRate: 500,
    onResize: sendHeightToParent,
  });

  useEffect(() => {
    if (error) {
      setErrored(error);
    }
  }, [error]);

  if (errored) {
    // Throw the error to the ErrorBoundary.
    throw errored;
  }

  if (!runnerParams) {
    return <Spinner />;
  }

  return (
    <div ref={ref}>
      <Runner
        code={runnerParams.code}
        scope={runnerParams.scope}
        onRendered={(error) => {
          if (error) {
            setErrored(error);
          }
        }}
      />
    </div>
  );
}

export function makeSendCrossDocumentMessage({
  actionId,
  allowedVisualizationOrigin,
}: {
  actionId: number;
  allowedVisualizationOrigin: string | undefined;
}) {
  return <T extends VisualizationRPCCommand>(
    command: T,
    params: VisualizationRPCRequestMap[T]
  ) => {
    return new Promise<CommandResultMap[T]>((resolve, reject) => {
      const messageUniqueId = Math.random().toString();
      const listener = (event: MessageEvent) => {
        if (event.origin !== allowedVisualizationOrigin) {
          console.log(
            `Ignored message from unauthorized origin: ${event.origin}`
          );

          // Simply ignore messages from unauthorized origins.
          return;
        }

        if (event.data.messageUniqueId === messageUniqueId) {
          if (event.data.error) {
            reject(event.data.error);
          } else {
            resolve(event.data.result);
          }
          window.removeEventListener("message", listener);
        }
      };
      window.addEventListener("message", listener);
      window.top?.postMessage(
        {
          command,
          messageUniqueId,
          actionId,
          params,
        },
        "*"
      );
    });
  };
}
