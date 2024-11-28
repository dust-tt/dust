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
import { Download, SquareTerminal } from "lucide-react";
import { toBlob } from "html-to-image";

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

  const downloadFile = useCallback(
    async (blob: Blob, filename?: string) => {
      await sendCrossDocumentMessage("downloadFileRequest", { blob, filename });
    },
    [sendCrossDocumentMessage]
  );

  const displayCode = useCallback(async () => {
    await sendCrossDocumentMessage("displayCode", null);
  }, [sendCrossDocumentMessage]);

  return {
    error,
    fetchCode,
    fetchFile,
    sendHeightToParent,
    downloadFile,
    displayCode,
  };
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

function useDownloadFileCallback(
  downloadFile: (blob: Blob, filename?: string) => Promise<void>
) {
  return useCallback(
    async ({
      content,
      filename,
    }: {
      content: string | Blob;
      filename?: string;
    }) => {
      const blob = typeof content === "string" ? new Blob([content]) : content;
      await downloadFile(blob, filename);
    },
    [downloadFile]
  );
}

interface RunnerParams {
  code: string;
  scope: Record<string, unknown>;
}

export function VisualizationWrapperWithErrorBoundary({
  identifier,
  allowedVisualizationOrigin,
}: {
  identifier: string;
  allowedVisualizationOrigin: string | undefined;
}) {
  const sendCrossDocumentMessage = useMemo(
    () =>
      makeSendCrossDocumentMessage({
        identifier,
        allowedVisualizationOrigin,
      }),
    [identifier, allowedVisualizationOrigin]
  );
  const api = useVisualizationAPI(sendCrossDocumentMessage);

  return (
    <ErrorBoundary
      onErrored={(e) => {
        sendCrossDocumentMessage("setErrorMessage", {
          errorMessage: e instanceof Error ? e.message : `${e}`,
        });
      }}
    >
      <VisualizationWrapper api={api} identifier={identifier} />
    </ErrorBoundary>
  );
}

// This component renders the generated code.
// It gets the generated code via message passing to the host window.
export function VisualizationWrapper({
  api,
  identifier,
}: {
  api: ReturnType<typeof useVisualizationAPI>;
  identifier: string;
}) {
  const [runnerParams, setRunnerParams] = useState<RunnerParams | null>(null);

  const [errored, setErrorMessage] = useState<Error | null>(null);

  const {
    fetchCode,
    fetchFile,
    error,
    sendHeightToParent,
    downloadFile,
    displayCode,
  } = api;

  const memoizedDownloadFile = useDownloadFileCallback(downloadFile);

  useEffect(() => {
    const loadCode = async () => {
      try {
        const fetchedCode = await fetchCode();
        if (!fetchedCode) {
          setErrorMessage(new Error("No visualization code found"));
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
                      triggerUserFileDownload: memoizedDownloadFile,
                    },
                  },
                }),
              },
            },
          });
        }
      } catch (error) {
        setErrorMessage(
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

  const handleScreenshotDownload = useCallback(async () => {
    if (ref.current) {
      try {
        const blob = await toBlob(ref.current, {
          // Skip embedding fonts in the Blob since we cannot access cssRules from the iframe.
          skipFonts: true,
        });
        if (blob) {
          await downloadFile(blob, `visualization-${identifier}.png`);
        }
      } catch (err) {
        console.error("Failed to convert to Blob", err);
      }
    }
  }, [ref, downloadFile]);

  const handleDisplayCode = useCallback(async () => {
    await displayCode();
  }, [displayCode]);

  useEffect(() => {
    if (error) {
      setErrorMessage(error);
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
    <div className="relative group/viz">
      <div className="flex flex-row gap-2 absolute top-2 right-2 bg-white rounded transition opacity-0 group-hover/viz:opacity-100 z-50">
        <button
          onClick={handleScreenshotDownload}
          className="hover:bg-slate-200 rounded p-2 border border-slate-200"
        >
          <Download size={20} />
        </button>
        <button
          className="hover:bg-slate-200 rounded p-2 border border-slate-200"
          onClick={handleDisplayCode}
        >
          <SquareTerminal size={20} />
        </button>
      </div>
      <div ref={ref}>
        <Runner
          code={runnerParams.code}
          scope={runnerParams.scope}
          onRendered={(error) => {
            if (error) {
              setErrorMessage(error);
            }
          }}
        />
      </div>
    </div>
  );
}

export function makeSendCrossDocumentMessage({
  identifier,
  allowedVisualizationOrigin,
}: {
  identifier: string;
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
          identifier,
          params,
        },
        "*"
      );
    });
  };
}
