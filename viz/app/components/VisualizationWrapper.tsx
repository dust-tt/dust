"use client";

import { Spinner } from "@viz/app/components/Components";
import { ErrorBoundary } from "@viz/app/components/ErrorBoundary";
import { VizContext } from "@viz/app/components/VizContext";
import { extractFileRefs } from "@viz/app/lib/parseFileRefs";
import { transformEditableText } from "@viz/app/lib/transformEditableText";
import type {
  VisualizationAPI,
  VisualizationConfig,
  VisualizationDataAPI,
  VisualizationUIAPI,
} from "@viz/app/lib/visualization-api";
import {
  type CommandResultMap,
  isDevelopment,
  type VisualizationRPCCommand,
  type VisualizationRPCRequestMap,
} from "@viz/app/types";
import {
  type SupportedEventType,
  type SupportedMessage,
  validateMessage,
} from "@viz/app/types/messages";
import * as dustSlideshowV1 from "@viz/components/dust/slideshow/v1";
import * as dustSlideshowV2 from "@viz/components/dust/slideshow/v2";
import * as shadcnAll from "@viz/components/ui";
import * as utilsAll from "@viz/lib/utils";
import { toBlob, toSvg } from "html-to-image";
import * as lucideAll from "lucide-react";
import * as papaparseAll from "papaparse";
import * as reactAll from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useResizeDetector } from "react-resize-detector";
import { importCode, Runner } from "react-runner";
import * as rechartsAll from "recharts";

const FRAME_MIME_TYPES = new Set([
  "application/vnd.dust.frame",
  "application/vnd.dust.frame.slideshow",
]);

/**
 * Recursively resolves a file ref to its import value.
 * - Frame files (code): compiled via importCode so they can be used as React modules.
 * - Data files: wrapped as { default: File } for direct use.
 * A promise cache prevents redundant fetches and handles diamond dependencies.
 * /!\ Circular imports will deadlock. Callers should not create cycles.
 */
async function resolveFileRef(
  key: string,
  dataAPI: VisualizationDataAPI,
  baseImports: Record<string, unknown>,
  cache: Map<string, Promise<unknown>>
): Promise<unknown> {
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const file = await dataAPI.fetchFile(key);
    if (!file) {
      return { default: null };
    }

    if (FRAME_MIME_TYPES.has(file.type)) {
      const text = await file.text();
      const refs = extractFileRefs(text);
      const nestedEntries = await Promise.all(
        refs.map(async (ref) => {
          const nestedKey = ref.type === "fileId" ? ref.fileId : ref.scopedPath;
          return [
            nestedKey,
            await resolveFileRef(nestedKey, dataAPI, baseImports, cache),
          ] as const;
        })
      );
      const nestedScope = Object.fromEntries(nestedEntries);
      return importCode(text, { import: { ...baseImports, ...nestedScope } });
    }

    return { default: file };
  })();

  cache.set(key, promise);
  return promise;
}

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
): VisualizationUIAPI {
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

  const editText = useCallback(
    async (editId: string, oldText: string, newText: string) => {
      return await sendCrossDocumentMessage("editText", {
        editId,
        oldText,
        newText,
      });
    },
    [sendCrossDocumentMessage]
  );

  const addEventListener = useCallback(
    (
      eventType: SupportedEventType,
      handler: (data: SupportedMessage) => void
    ): (() => void) => {
      const messageHandler = (event: MessageEvent) => {
        if (!isOriginAllowed(event.origin, allowedOrigins)) {
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
            // Log to help debug the addition of new event types.
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
    editText,
    sendHeightToParent,
  };
}

function useFile(fileId: string, dataAPI: VisualizationDataAPI) {
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const fetchedFile = await dataAPI.fetchFile(fileId);
        setFile(fetchedFile);
      } catch (_err) {
        setFile(null);
      }
    };

    if (fileId) {
      fetch();
    }
  }, [dataAPI, fileId]);

  return file;
}

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
  config,
}: {
  config: VisualizationConfig;
}) {
  const { identifier, allowedOrigins, isFullHeight = false, dataAPI } = config;
  const sendCrossDocumentMessage = useMemo(
    () =>
      makeSendCrossDocumentMessage({
        identifier,
        allowedOrigins,
      }),
    [identifier, allowedOrigins]
  );

  const uiAPI = useVisualizationAPI(sendCrossDocumentMessage, {
    allowedOrigins,
  });

  const api: VisualizationAPI = useMemo(
    () => ({ data: dataAPI, ui: uiAPI }),
    [dataAPI, uiAPI]
  );

  return (
    <ErrorBoundary
      onErrored={(e) => {
        sendCrossDocumentMessage("setErrorMessage", {
          errorMessage: e instanceof Error ? e.message : `${e}`,
          fileId: identifier,
          isInteractiveContent: isFullHeight,
        });
      }}
    >
      <VisualizationWrapper config={config} api={api} />
    </ErrorBoundary>
  );
}

interface HoverState {
  top: number;
  left: number;
}

// Tailwind class sets for editable span states.
// Defined at module level so Tailwind's content scanner includes them in the build.
const HOVER_CLS = [
  "outline-dashed",
  "outline-1",
  "outline-blue-400/50",
  "outline-offset-2",
  "bg-blue-500/10",
];
const ACTIVE_CLS = [
  "outline",
  "outline-1",
  "outline-blue-500/70",
  "outline-offset-2",
  "bg-blue-500/5",
];
const SAVED_CLS = [
  "outline",
  "outline-1",
  "outline-green-500/70",
  "outline-offset-2",
];
const FAILED_CLS = [
  "outline",
  "outline-1",
  "outline-red-500/70",
  "outline-offset-2",
];

// This component renders the generated code.
// It gets the generated code via message passing to the host window.
export function VisualizationWrapper({
  config,
  api,
}: {
  config: VisualizationConfig;
  api: VisualizationAPI;
}) {
  const {
    identifier,
    isEditable = false,
    isFullHeight = false,
    isPdfMode = false,
  } = config;
  const [runnerParams, setRunnerParams] = useState<RunnerParams | null>(null);
  const [vizReady, setVizReady] = useState(false);

  const [errored, setErrorMessage] = useState<Error | null>(null);

  const [hoverState, setHoverState] = useState<HoverState | null>(null);
  const hoveredSpanRef = useRef<HTMLElement | null>(null);
  const isSavingRef = useRef(false);

  const {
    sendHeightToParent,
    downloadFile,
    displayCode,
    editText,
    addEventListener,
  } = api.ui;

  const memoizedDownloadFile = useDownloadFileCallback(downloadFile);

  const { ref } = useResizeDetector({
    handleHeight: true,
    refreshMode: "debounce",
    refreshRate: 500,
    onResize: sendHeightToParent,
  });

  const handleScreenshotDownload = useCallback(
    async (name: string = `visualization-${identifier}.png`) => {
      if (ref.current) {
        try {
          const blob = await toBlob(ref.current, {
            // Skip embedding fonts in the Blob since we cannot access cssRules from the iframe.
            skipFonts: true,
          });
          if (blob) {
            await downloadFile(blob, name);
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
    },
    [ref, downloadFile, identifier]
  );

  useEffect(() => {
    const loadCode = async () => {
      try {
        const fetchedCode = await api.data.fetchCode();
        if (!fetchedCode) {
          setErrorMessage(
            new Error("No code provided to visualization component")
          );
          return;
        }
        // Validate Tailwind code before processing to catch arbitrary values early. Error gets
        // exposed to user for retry, providing feedback to the model.
        validateTailwindCode(fetchedCode);

        // Wrap JSXText nodes with editable spans when inline editing is enabled.
        const codeToUse = isEditable
          ? transformEditableText(fetchedCode)
          : fetchedCode;

        const baseImports: Record<string, unknown> = {
          papaparse: papaparseAll,
          react: reactAll,
          recharts: rechartsAll,
          shadcn: shadcnAll,
          // Legacy support for utils from previous versions.
          utils: utilsAll,
          // New location for utils.
          "@viz/lib/utils": utilsAll,
          "lucide-react": lucideAll,
          "@dust/slideshow/v1": dustSlideshowV1,
          "@dust/slideshow/v2": dustSlideshowV2,
          "@dust/react-hooks": {
            captureScreenshot: handleScreenshotDownload,
            triggerUserFileDownload: memoizedDownloadFile,
            useFile: (fileId: string) => useFile(fileId, api.data),
          },
        };

        const refs = extractFileRefs(codeToUse);
        const cache = new Map<string, Promise<unknown>>();
        const fileEntries = await Promise.all(
          refs.map(async (ref) => {
            const key = ref.type === "fileId" ? ref.fileId : ref.scopedPath;
            return [
              key,
              await resolveFileRef(key, api.data, baseImports, cache),
            ] as const;
          })
        );
        const fileImportScope = Object.fromEntries(fileEntries);

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
              "@dust/slideshow/v2": dustSlideshowV2,
              "@dust/generated-code": importCode(codeToUse, {
                import: {
                  ...fileImportScope,
                  ...baseImports,
                },
              }),
            },
          },
        });
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error
            : new Error("Failed to fetch visualization code")
        );
      }
    };

    loadCode();
  }, [memoizedDownloadFile, handleScreenshotDownload, api.data, isEditable]);

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

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isEditable) {
        return;
      }
      const target = (e.target as Element).closest<HTMLElement>(
        "[data-editable]"
      );

      if (hoveredSpanRef.current && hoveredSpanRef.current !== target) {
        hoveredSpanRef.current.classList.remove(...HOVER_CLS);
      }

      if (target && target.contentEditable !== "true") {
        if (hoveredSpanRef.current !== target) {
          target.classList.add(...HOVER_CLS);
          hoveredSpanRef.current = target;
        }
        const rect = target.getBoundingClientRect();
        setHoverState({ top: rect.top - 32, left: rect.left + rect.width / 2 });
      } else {
        hoveredSpanRef.current = null;
        setHoverState(null);
      }
    },
    [isEditable]
  );

  const handleMouseLeave = useCallback(() => {
    if (hoveredSpanRef.current) {
      hoveredSpanRef.current.classList.remove(...HOVER_CLS);
      hoveredSpanRef.current = null;
    }
    setHoverState(null);
  }, []);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isEditable) {
        return;
      }
      const target = (e.target as Element).closest<HTMLElement>(
        "[data-editable]"
      );
      if (!target || target.contentEditable === "true") {
        return;
      }
      target.classList.remove(...HOVER_CLS);
      hoveredSpanRef.current = null;
      setHoverState(null);
      target.classList.add(...ACTIVE_CLS);
      target.dataset.originalText = target.textContent ?? "";
      target.contentEditable = "true";
      target.focus();
    },
    [isEditable]
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent) => {
      const target = (e.target as Element).closest<HTMLElement>(
        "[data-editable]"
      );
      if (!target || target.contentEditable !== "true") {
        return;
      }

      const originalText = target.dataset.originalText ?? "";
      const newText = target.textContent ?? "";

      target.contentEditable = "inherit";
      target.classList.remove(...ACTIVE_CLS);
      delete target.dataset.originalText;

      if (newText === originalText || isSavingRef.current) {
        return;
      }

      const flash = (cls: string[]) => {
        target.classList.add(...cls);
        setTimeout(() => target.classList.remove(...cls), 800);
      };

      const editId = target.dataset.editId ?? "";
      isSavingRef.current = true;
      void editText(editId, originalText, newText)
        .then((result) => {
          if (result.success) {
            flash(SAVED_CLS);
          } else {
            target.textContent = originalText;
            flash(FAILED_CLS);
          }
        })
        .finally(() => {
          isSavingRef.current = false;
        });
    },
    [editText]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isEditable) {
        return;
      }
      const target = (e.target as Element).closest<HTMLElement>(
        "[data-editable]"
      );
      if (!target || target.contentEditable !== "true") {
        return;
      }

      // Prevent all key events from reaching frame components (e.g. slideshow
      // arrow-key navigation) while a span is being edited.
      e.stopPropagation();

      if (e.key === "Enter") {
        e.preventDefault();
        target.blur();
      } else if (e.key === "Escape") {
        target.textContent = target.dataset.originalText ?? "";
        target.blur();
      }
    },
    [isEditable]
  );

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

  // In PDF mode: no height constraint, content flows naturally for full capture.
  const heightClass = isPdfMode ? "" : isFullHeight ? "h-screen" : "";

  const shouldShowControls = !isFullHeight && !isPdfMode;

  return (
    <div
      className={`relative font-sans group/viz ${heightClass}`}
      data-viz-ready={vizReady}
      onDoubleClick={isEditable ? handleDoubleClick : undefined}
      onMouseMove={isEditable ? handleMouseMove : undefined}
      onMouseLeave={isEditable ? handleMouseLeave : undefined}
      onBlur={isEditable ? handleBlur : undefined}
      onKeyDown={isEditable ? handleKeyDown : undefined}
    >
      {shouldShowControls && (
        <div className="flex flex-row gap-2 absolute top-2 right-2 rounded transition opacity-0 group-hover/viz:opacity-100 z-50">
          <button
            onClick={() => handleScreenshotDownload()}
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
        <VizContext.Provider value={{ isPdfMode }}>
          <Runner
            code={runnerParams.code}
            scope={runnerParams.scope}
            onRendered={(error) => {
              if (error) {
                setErrorMessage(error);
              } else {
                // Set data-viz-ready attribute once fully rendered to enable screen capture.
                // In PDF mode, delay to let Recharts animations complete (react-smooth is JS-based).
                const delayMs = isPdfMode ? 5000 : 0;
                setTimeout(() => setVizReady(true), delayMs);
              }
            }}
          />
        </VizContext.Provider>
      </div>

      {isEditable && hoverState && (
        <div
          style={{ top: hoverState.top, left: hoverState.left }}
          className="pointer-events-none fixed z-50 -translate-x-1/2 rounded bg-black/70 px-2 py-1 font-sans text-xs font-normal text-white"
        >
          Double-click to edit
        </div>
      )}
    </div>
  );
}

/**
 * Check if an origin matches any of the allowed origins.
 * Supports wildcard patterns like "*.preview.dust.tt" which match any subdomain.
 */
function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  return allowedOrigins.some((allowed) => {
    if (allowed.startsWith("https://*.")) {
      const suffix = allowed.slice("https://*".length); // e.g. ".preview.dust.tt"
      return origin.startsWith("https://") && origin.endsWith(suffix);
    }
    // Firefox Internal UUID is not stable, so we allow all moz-extension:// origins.
    if (allowed === "moz-extension://*") {
      return origin.startsWith("moz-extension://");
    }
    return origin === allowed;
  });
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
        if (!isOriginAllowed(event.origin, allowedOrigins)) {
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
      window.parent?.postMessage(
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
