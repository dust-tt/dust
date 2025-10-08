"use client";

import {
  CommandResultMap, isDevelopment,
  VisualizationRPCCommand,
  VisualizationRPCRequestMap,
} from "@viz/app/types";
import type {
  SupportedMessage,
  SupportedEventType,
} from "@viz/app/types/messages";

import { validateMessage } from "@viz/app/types/messages";
import { Spinner } from "@viz/app/components/Components";
import { ErrorBoundary } from "@viz/app/components/ErrorBoundary";
import { toBlob, toSvg } from "html-to-image";
import * as papaparseAll from "papaparse";
import * as reactAll from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useResizeDetector } from "react-resize-detector";
import { importCode, Runner } from "react-runner";
import * as rechartsAll from "recharts";
import * as utilsAll from "@viz/lib/utils";
import * as shadcnAll from "@viz/components/ui";
import * as lucideAll from "lucide-react";
import * as dustSlideshowV1 from "@viz/components/dust/slideshow/v1";

// Regular expressions to capture the value inside a className attribute.
// We check both double and single quotes separately to handle mixed usage.
const classNameDoubleQuoteRegex = /className\s*=\s*"([^"]*)"/g;
const classNameSingleQuoteRegex = /className\s*=\s*'([^']*)'/g;

// Regular expression to capture Tailwind arbitrary values:
// Matches a word boundary, then one or more lowercase letters or hyphens,
// followed by a dash, an opening bracket, one or more non-']' characters, and a closing bracket.
const arbitraryRegex = /\b[a-z-]+-\[[^\]]+\]/g;

/**
 * Validates that the generated code doesn't contain Tailwind arbitrary values.
 *
 * Arbitrary values like h-[600px], w-[800px], bg-[#ff0000] cause visualization failures
 * because they're not included in our pre-built CSS. This validation fails fast with
 * a clear error message that gets exposed to the user, allowing them to retry which
 * provides the error details to the model for correction.
 */
function validateTailwindCode(code: string): void {
  const matches: string[] = [];

  // Check double-quoted className attributes
  let classMatch: RegExpExecArray | null = null;
  while ((classMatch = classNameDoubleQuoteRegex.exec(code)) !== null) {
    const classContent = classMatch[1];
    if (classContent) {
      // Find all matching arbitrary values within the class attribute's value.
      const arbitraryMatches = classContent.match(arbitraryRegex) || [];
      matches.push(...arbitraryMatches);
    }
  }

  // Check single-quoted className attributes
  while ((classMatch = classNameSingleQuoteRegex.exec(code)) !== null) {
    const classContent = classMatch[1];
    if (classContent) {
      // Find all matching arbitrary values within the class attribute's value.
      const arbitraryMatches = classContent.match(arbitraryRegex) || [];
      matches.push(...arbitraryMatches);
    }
  }

  // If we found any, remove duplicates and throw an error with up to three examples.
  if (matches.length > 0) {
    const uniqueMatches = Array.from(new Set(matches));
    const examples = uniqueMatches.slice(0, 3).join(", ");
    throw new Error(
      `Forbidden Tailwind arbitrary values detected: ${examples}. ` +
        `Arbitrary values like h-[600px], w-[800px], bg-[#ff0000] are not allowed. ` +
        `Use predefined classes like h-96, w-full, bg-red-500 instead, or use the style prop for specific values.`
    );
  }
}

export function useVisualizationAPI(
  sendCrossDocumentMessage: ReturnType<typeof makeSendCrossDocumentMessage>,
  { allowedOrigins }: { allowedOrigins: string[] }
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

      return new File([blob], "fileId", { type: blob.type });
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

  const addEventListener = useCallback(
    (
      eventType: SupportedEventType,
      handler: (data: SupportedMessage) => void
    ): (() => void) => {
      const messageHandler = (event: MessageEvent) => {
        if (!allowedOrigins.includes(event.origin)) {
          console.log(
            `Ignored message from unauthorized origin: ${
              event.origin
            }, expected one of: ${allowedOrigins.join(", ")}`
          );
          return;
        }

        // Validate message structure using zod.
        const validatedMessage = validateMessage(event.data);
        if (!validatedMessage) {
          if (isDevelopment()) {
            console.log("Invalid message format received:", event.data);
          }
          return;
        }

        // Check if this is the event type we're listening for
        if (validatedMessage.type === eventType) {
          handler(validatedMessage);
        }
      };

      window.addEventListener("message", messageHandler);

      // Return cleanup function
      return () => window.removeEventListener("message", messageHandler);
    },
    [allowedOrigins]
  );

  return {
    addEventListener,
    displayCode,
    downloadFile,
    error,
    fetchCode,
    fetchFile,
    sendHeightToParent,
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
  allowedOrigins,
  isFullHeight = false,
}: {
  identifier: string;
  allowedOrigins: string[];
  isFullHeight?: boolean;
}) {
  const sendCrossDocumentMessage = useMemo(
    () =>
      makeSendCrossDocumentMessage({
        identifier,
        allowedOrigins,
      }),
    [identifier, allowedOrigins]
  );
  const api = useVisualizationAPI(sendCrossDocumentMessage, {
    allowedOrigins,
  });

  return (
    <ErrorBoundary
      onErrored={(e) => {
        sendCrossDocumentMessage("setErrorMessage", {
          errorMessage: e instanceof Error ? e.message : `${e}`,
          fileId: identifier,
          isContentCreation: isFullHeight,
        });
      }}
    >
      <VisualizationWrapper
        api={api}
        identifier={identifier}
        isFullHeight={isFullHeight}
      />
    </ErrorBoundary>
  );
}

// This component renders the generated code.
// It gets the generated code via message passing to the host window.
export function VisualizationWrapper({
  api,
  identifier,
  isFullHeight = false,
}: {
  api: ReturnType<typeof useVisualizationAPI>;
  identifier: string;
  isFullHeight?: boolean;
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
    addEventListener,
  } = api;

  const memoizedDownloadFile = useDownloadFileCallback(downloadFile);

  useEffect(() => {
    const loadCode = async () => {
      try {
        const fetchedCode = await fetchCode();
        if (!fetchedCode) {
          setErrorMessage(new Error("No visualization code found"));
        } else {
          // Validate Tailwind code before processing to catch arbitrary values early. Error gets
          // exposed to user for retry, providing feedback to the model
          validateTailwindCode(fetchedCode);

          setRunnerParams({
            code: "() => {import Comp from '@dust/generated-code'; return (<Comp />);}",
            scope: {
              import: {
                react: reactAll,
                recharts: rechartsAll,
                shadcn: shadcnAll,
                utils: utilsAll,
                "lucide-react": lucideAll,
                "@dust/slideshow/v1": dustSlideshowV1,
                "@dust/generated-code": importCode(fetchedCode, {
                  import: {
                    papaparse: papaparseAll,
                    react: reactAll,
                    recharts: rechartsAll,
                    shadcn: shadcnAll,
                    utils: utilsAll,
                    "lucide-react": lucideAll,
                    "@dust/slideshow/v1": dustSlideshowV1,
                    "@dust/react-hooks": {
                      triggerUserFileDownload: memoizedDownloadFile,
                      useFile: (fileId: string) => useFile(fileId, fetchFile),
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
  }, [fetchCode, fetchFile, memoizedDownloadFile]);

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
        window.parent.postMessage(
          {
            type: "EXPORT_ERROR",
            identifier,
            errorMessage:
              "Failed to export as PNG. This can happen when the content references external images.",
          },
          "*"
        );
      }
    }
  }, [ref, downloadFile, identifier]);

  const handleSVGDownload = useCallback(async () => {
    if (ref.current) {
      try {
        const dataUrl = await toSvg(ref.current, {
          // Skip embedding fonts in the Blob since we cannot access cssRules from the iframe.
          skipFonts: true,
        });
        const svgText = decodeURIComponent(dataUrl.split(",")[1]);
        const blob = new Blob([svgText], { type: "image/svg+xml" });
        await downloadFile(blob, `visualization-${identifier}.svg`);
      } catch (err) {
        console.error("Failed to convert to Blob", err);
        window.parent.postMessage(
          {
            type: "EXPORT_ERROR",
            identifier,
            errorMessage:
              "Failed to export as SVG. This can happen when the content references external images.",
          },
          "*"
        );
      }
    }
  }, [ref, downloadFile, identifier]);

  const handleDisplayCode = useCallback(async () => {
    await displayCode();
  }, [displayCode]);

  useEffect(() => {
    if (error) {
      setErrorMessage(error);
    }
  }, [error]);

  // Add message listeners for export requests.
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    cleanups.push(
      addEventListener("EXPORT_PNG", async () => {
        await handleScreenshotDownload();
      })
    );

    cleanups.push(
      addEventListener("EXPORT_SVG", async () => {
        await handleSVGDownload();
      })
    );

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [addEventListener, handleScreenshotDownload, handleSVGDownload]);

  if (errored) {
    // Throw the error to the ErrorBoundary.
    throw errored;
  }

  if (!runnerParams) {
    return <Spinner />;
  }

  return (
    <div
      className={`relative font-sans group/viz ${
        isFullHeight ? "h-screen" : ""
      }`}
    >
      {!isFullHeight && (
        <div className="flex flex-row gap-2 absolute top-2 right-2 rounded transition opacity-0 group-hover/viz:opacity-100 z-50">
          <button
            onClick={handleScreenshotDownload}
            title="Download screenshot"
            className="h-7 px-2.5 rounded-lg label-xs inline-flex items-center justify-center border border-border text-primary bg-white"
          >
            Png
          </button>
          <button
            onClick={handleSVGDownload}
            title="Download SVG"
            className="h-7 px-2.5 rounded-lg label-xs inline-flex items-center justify-center border border-border text-primary bg-white"
          >
            Svg
          </button>
          <button
            title="Show code"
            onClick={handleDisplayCode}
            className="h-7 px-2.5 rounded-lg label-xs inline-flex items-center justify-center border border-border text-primary bg-white"
          >
            Code
          </button>
        </div>
      )}
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
  allowedOrigins,
}: {
  identifier: string;
  allowedOrigins: string[];
}) {
  return <T extends VisualizationRPCCommand>(
    command: T,
    params: VisualizationRPCRequestMap[T]
  ) => {
    return new Promise<CommandResultMap[T]>((resolve, reject) => {
      const messageUniqueId = Math.random().toString();
      const listener = (event: MessageEvent) => {
        if (!allowedOrigins.includes(event.origin)) {
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
